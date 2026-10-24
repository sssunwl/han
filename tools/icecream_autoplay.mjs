// 雪糕店自動玩家：獨立 Chrome 暫存設定檔，完全不碰使用者存檔。
// 先 npm run dev，再 node tools/icecream_autoplay.mjs [最多天數=150] [跑幾次=1]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const MAX_DAYS = Number(process.argv[2] || 150);
const RUNS = Number(process.argv[3] || 1);
const URL = process.env.ICECREAM_URL || 'http://localhost:5180/han/games/icecream/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ===== 每天早上的經營策略（在頁面中執行） =====
const BOT = String.raw`
window.BOT = async () => {
  const D = await import(new URL('./data.js', location.href).href);
  const S = ICE.S;
  const st = D.starsOf(S.rep);
  for (const r of [...D.RESEARCH].sort((a, b) => a.cost - b.cost)) {
    ICE.research(r.id);
  }
  for (const c of S.crew) {
    if (S.money > D.trainCost(c.lv) + 200) {
      ICE.train(c.id);
    }
  }
  const roles = ['server', 'cleaner', 'server', 'promoter', 'cleaner', 'server'];
  while (S.crew.length < D.staffMax(st) && S.money > D.hireCost(S.crew.length) + 150) {
    if (!ICE.hire(roles[S.crew.length % roles.length])) {
      break;
    }
  }
  if (S.money > 1000) {
    ICE.buy('lot');
  }
  if (S.windows < 1 + S.crew.filter(c => c.role === 'server').length && S.money > 400) {
    ICE.buy('window');
  }
  if (S.money > 900 && S.freezers * 4 < Math.min(12, S.learned.length + 1)) {
    ICE.buy('freezer');
  }
  const season = Math.floor((S.day - 1) / 7) % 4;
  const known = new Set(Object.values(S.revealed).flat());
  const all = Object.values(D.FLAVORS).filter(f => (S.learned.includes(f.id) || f.season === season) && (!('season' in f) ||
    f.season === season));
  all.sort((a, b) => (known.has(b.id) ? 3 : 0) + (b.season === season ? 2 : 0) - (known.has(a.id) ? 3 : 0) - (a.season === season ? 2 : 0));
  for (let i = 0; i < S.freezers * 4; i++) {
    ICE.setStock(i, all[i % all.length].id);
  }
  const add = (kind, type) => {
    for (let y = 7; y < 12; y++) {
      for (let x = 0; x < S.lots * 6; x++) {
        if (ICE.place(kind, type, x, y)) {
          return true;
        }
      }
    }
    return false;
  };
  const seats = S.seats.reduce((n, o) => n + D.SEATS[o.type].seats, 0);
  if (seats < Math.max(12, st * 3) && S.money > 450) {
    add('seat', st >= 2 ? 'table4' : 'table2');
  }
  if (S.money > 700) {
    for (let i = 0; i < 2; i++) {
      if (!add('decor', st >= 4 ? 'aquarium' : st >= 3 ? 'jukebox' : 'balloons')) {
        break;
      }
    }
  }
  return true;
};
// ===== 雪糕節選味策略 =====
window.BOT_CONTEST = async () => {
  const D = await import(new URL('./data.js', location.href).href);
  const S = ICE.S;
  const season = Math.floor((S.day - 1) / 7) % 4;
  const theme = D.THEMES[S.theme];
  const all = Object.values(D.FLAVORS).filter(f => (S.learned.includes(f.id) || f.season === season) && (!('season' in f) ||
    f.season === season));
  let ids;
  if (theme.tag === 'color') {
    const hue = c => {
      if (c === 'rainbow') {
        return 300;
      }
      const n = parseInt(c.slice(1), 16);
      const r = n >> 16;
      const g = n >> 8 & 255;
      const b = n & 255;
      const m = Math.max(r, g, b);
      const d = m - Math.min(r, g, b);
      return d ? (m === r ? (g - b) / d + (g < b ? 6 : 0) : m === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 : 0;
    };
    let best = -1;
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        for (let c = b + 1; c < all.length; c++) {
          const fs = [all[a], all[b], all[c]];
          const hs = fs.map(f => hue(f.color));
          const score = hs.filter((h, i) => hs.every((v, j) => i === j || Math.min(Math.abs(h - v), 360 - Math.abs(h - v)) >= 65)).length;
          if (score > best) {
            best = score;
            ids = fs.map(f => f.id);
          }
        }
      }
    }
  } else {
    ids = all.sort((a, b) => Number(b.tags.includes(theme.tag)) - Number(a.tags.includes(theme.tag))).slice(0, 3).map(f => f.id);
  }
  ICE.contestPick(ids);
  ICE.next();
  return true;
};
`;
// ===== Chrome 啟動、CDP 與模擬營業 =====
async function runOnce(run) {
  const prof = mkdtempSync(join(tmpdir(), 'icecream-bot-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  let ws;
  let chrome;
  const errors = [];
  try {
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1280,800',
      'about:blank'], {
      stdio: 'ignore'
    });
    let launchError;
    chrome.on('error', e => {
      launchError = e;
    });
    for (let i = 0; i < 60 && !ws; i++) {
      if (launchError) {
        throw launchError;
      }
      try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        const page = pages.find(p => p.type === 'page');
        if (page) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((r, no) => {
            ws.addEventListener('open', r, {
              once: true
            });
            ws.addEventListener('error', no, {
              once: true
            });
          });
        }
      } catch {}
      if (!ws) {
        await sleep(200);
      }
    }
    if (!ws) {
      throw new Error('Chrome 無法啟動，請檢查 CHROME 路徑或沙箱限制');
    }
    let seq = 0;
    const pending = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id) {
        pending.get(m.id)?.(m);
        pending.delete(m.id);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP 等待逾時：' + method));
      }, 20000);
      pending.set(id, m => {
        clearTimeout(timer);
        m.error ? reject(new Error(m.error.message)) : resolve(m);
      });
      ws.send(JSON.stringify({
        id,
        method,
        params
      }));
    });
    const ev = async expression => {
      const m = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (m.result.exceptionDetails) {
        throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
      }
      return m.result.result.value;
    };
    await send('Runtime.enable');
    await send('Page.navigate', {
      url: URL
    });
    for (let i = 0; i < 80; i++) {
      if (await ev('!!window.ICE')) {
        break;
      }
      await sleep(100);
    }
    if (!(await ev('!!window.ICE'))) {
      throw new Error('頁面沒有 ICE API，請確認 dev server。' + errors.join('\n'));
    }
    await ev(`
document.getElementById('startBtn').click();
document.querySelector('[data-location]').click();
document.getElementById('pause').click();
1;
`);
    await ev(BOT);
    // 分批快轉，每半秒服務一次，保留偶爾做錯的原本策略。
    const marks = {};
    let last;
    for (let day = 1; day <= MAX_DAYS; day++) {
      await ev('BOT()');
      // ICE_SHOT=路徑:第 12 天中午把畫面縮成 240×150 存成大廳機台截圖
      if (process.env.ICE_SHOT && day === 12) {
        await ev(`(() => { for (let i = 0; i < 90; i++) { if (ICE.inChoice()) ICE.pick(0); if (ICE.waiting()) ICE.serve(true); ICE.advance(.5); } return 1; })()`);
        // 用 CDP 截「店面那一塊」(canvas 有時候在 headless 讀不到像素)
        const r = await ev(`(() => { const b = document.getElementById('world').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
        const w = Math.min(r[2] * 0.62, r[3] * 240 / 150), h = w * 150 / 240;
        const shot = await send('Page.captureScreenshot', {
          format: 'png', clip: { x: r[0], y: r[1] + (r[3] - h) * 0.6, width: w, height: h, scale: 240 / w }
        });
        const url = 'data:image/png;base64,' + shot.result.data;
        writeFileSync(process.env.ICE_SHOT, Buffer.from(url.split(',')[1], 'base64'));
        console.log('  截圖存到', process.env.ICE_SHOT);
      }
      for (let chunk = 0; chunk < 16; chunk++) {
        const ended = await ev(`
(() => {
  for (let i = 0; i < 16; i++) {
    if (ICE.S.ended) {
      return 'end';
    }
    if (ICE.inChoice()) {
      if (!ICE.pick(Math.random() < .5 ? 0 : 1)) {
        ICE.pick(1);
      }
    }
    if (ICE.inSummary()) {
      return 'summary';
    }
    if (ICE.waiting()) {
      ICE.serve(Math.random() < .85);
    }
    ICE.advance(.5);
  }
  return 'run';
})();
`);
        if (ended !== 'run') {
          break;
        }
      }
      last = await ev(`
({
  day: ICE.S.day,
  rep: ICE.S.rep,
  money: ICE.S.money,
  ideas: ICE.S.ideas,
  lots: ICE.S.lots,
  seats: ICE.S.seats.length,
  crew: ICE.S.crew.length,
  served: ICE.S.stats.served,
  ms: ICE.S.milestones,
  ended: ICE.S.ended
});
`);
      for (const id of last.ms) {
        if (!marks[id]) {
          marks[id] = last.day;
          console.log('  里程碑', id, '第', last.day, '天');
        }
      }
      if (last.rep >= 13000 && !marks['5★']) {
        marks['5★'] = last.day;
      }
      if (last.ended) {
        marks['結局'] = last.day;
        break;
      }
      if (day % 7 === 0) {
        console.log('  [' + `${run}` + '] 第' + `${last.day}` + '天 ' + `${last.rep}` + '口碑 $' + `${last.money}` + ' 💡' + `${last.ideas}` +
          ' ' + `${last.lots}` + '店面 ' + `${last.crew}` + '員工 服務' + `${last.served}` + '人');
      }
      await ev('ICE.next();1');
      if (await ev('ICE.inContest()')) {
        await ev('BOT_CONTEST()');
      }
    }
    console.log(`第 ${run} 次：`, marks, '最後狀態', last);
    if (errors.length) {
      throw new Error([...new Set(errors)].join('\n'));
    }
    return {
      marks,
      last,
      errors
    };
  } finally {
    ws?.close();
    chrome?.kill();
    await sleep(300);
    rmSync(prof, {
      recursive: true,
      force: true
    });
  }
}
for (let i = 1; i <= RUNS; i++) {
  await runOnce(i);
}
