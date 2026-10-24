// 溫泉旅館自動玩家:用 headless Chrome 開 dev server 的溫泉頁,每天早上照固定策略經營,
// 一路快轉到結局(或天數上限),印出每個里程碑是第幾天。調平衡用。
//
// 用法(先 npm run dev):
//   node tools/onsen_autoplay.mjs [最多天數=200] [跑幾次=1]
// 需要 Google Chrome(macOS 預設路徑)。不會動到你自己瀏覽器的存檔(用獨立的暫存設定檔)。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_DAYS = Number(process.argv[2] || 200), RUNS = Number(process.argv[3] || 1);
const URL = process.env.ONSEN_URL || 'http://localhost:5180/han/games/onsen/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 在頁面裡跑的策略 ----------
const BOT = String.raw`
window.BOT = async () => {
  const D = await import(new URL('./data.js', location.href).href);
  const S = ON.S, st = D.starsOf(S.rep);
  const log = [];
  // 1. 研究:便宜的先
  for (const r of [...D.RESEARCH].sort((a, b) => a.cost - b.cost)) if (!S.research.includes(r.id) && st >= r.need && S.ideas >= r.cost) { ON.research(r.id); log.push('研究' + r.name); }
  // 2. 受訓
  for (const c of S.crew) if (c.lv < D.STAFF_MAX_LV && c.xp >= D.xpNeed(c.lv) && S.money > D.trainCost(c.lv) + 300) ON.train(c.id);
  // 3. 請人(職業輪流)
  const ROLES = ['clean', 'desk', 'cook', 'yumori', 'clean', 'cook', 'yumori', 'clean', 'desk'];
  while (S.crew.length < D.staffMax(st) && S.money > D.STAFF_HIRE(S.crew.length) + 400) { const before = S.crew.length; ON.hire(ROLES[S.crew.length % ROLES.length]); if (S.crew.length === before) break; }
  // 4. 蓋設施:照順序,房間跟著客人變多
  const ORDER = ['room', 'dining', 'egg', 'room', 'shop', 'room', 'arcade', 'lounge', 'onsen', 'room', 'footbath', 'tea', 'room', 'karaoke', 'bigroom', 'family', 'massage', 'room', 'koi', 'shrine', 'bigroom', 'room', 'room', 'bigroom', 'room'];
  const cnt = {}; for (const f of S.facs) cnt[f.type] = (cnt[f.type] || 0) + 1;
  const want = {}; let next = null;
  for (const t of ORDER) { want[t] = (want[t] || 0) + 1; if ((cnt[t] || 0) < want[t]) { next = t; break; } }
  const unl = t => !D.FAC[t].research || S.research.includes(t);
  if (next && unl(next) && st >= D.FAC[next].need[0] && S.money >= D.FAC[next].cost[0] + 200) {
    const d = D.FAC[next]; let done = false;
    for (let y = 0; y < D.ROWS && !done; y++) for (let x = 0; x < D.COLS && !done; x++) {
      if (!S.owned.includes(Math.floor(x / D.CHUNK) + ',' + Math.floor(y / D.CHUNK))) continue;
      if (ON.canPlace(d.w, d.h, x, y)) continue;
      if (!ON.place('fac', next, x, y)) { done = true; log.push('蓋' + d.name); }
    }
  }
  // 5. 升級:便宜的先,留一點周轉金
  const ups = S.facs.filter(f => f.lv < 3 && st >= D.FAC[f.type].need[f.lv]).sort((a, b) => D.FAC[a.type].cost[a.lv] - D.FAC[b.type].cost[b.lv]);
  for (const f of ups) if (S.money >= D.FAC[f.type].cost[f.lv] + 500) { ON.upgrade(f.id); log.push('升級' + D.FAC[f.type].name); }
  // 6. 買地
  const n = S.owned.length;
  if (n < (D.COLS / D.CHUNK) * (D.ROWS / D.CHUNK) && st >= D.landNeed(n) && S.money >= D.landCost(n) * 1.3) {
    for (const k of S.owned) { const [cx, cy] = k.split(',').map(Number); let ok = false;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const a = cx + dx, b = cy + dy; if (a < 0 || b < 0 || a >= D.COLS / D.CHUNK || b >= D.ROWS / D.CHUNK || S.owned.includes(a + ',' + b)) continue; ON.buy(a, b); ok = true; log.push('買地'); break; }
      if (ok) break; }
  }
  // 7. 擺植物(有閒錢就擺在設施旁邊的走道上)
  for (let i = 0; i < 3 && S.money > 2500 && S.decor.length < 60; i++) {
    const types = ['bonsai_s', 'plant', 'bush', 'bamboo'].filter(t => !D.DECOR[t].research || S.research.includes(t));
    const t = types[Math.floor(Math.random() * types.length)];
    const f = S.facs[Math.floor(Math.random() * S.facs.length)], w = D.FAC[f.type].w, h = D.FAC[f.type].h;
    const cand = [[f.x - 1, f.y], [f.x + w, f.y], [f.x, f.y - 1], [f.x + w - 1, f.y + h], [f.x - 1, f.y + h - 1]];
    for (const [x, y] of cand) if (!ON.place('decor', t, x, y)) break;
  }
  // 8. 宣傳:錢多又沒在宣傳
  if (S.money > 4000 && !Object.keys(S.ads).length) { const a = D.ADS.find(a => S.money > a.cost * 3); if (a) ON.ad(a.id); }
  return log;
};
`;

async function runOnce(run) {
  const prof = mkdtempSync(join(tmpdir(), 'onsen-bot-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r)); } } catch {}
    if (!ws) await sleep(200);
  }
  let id = 0; const pend = new Map(), errors = [];
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(2500);
  await ev(`window.confirm = () => true; localStorage.clear(); document.getElementById('startBtn').click(); 1`);
  await sleep(500);
  await ev(BOT);
  const marks = {}, mark = (k, d) => { if (!(k in marks)) marks[k] = d; };
  let last = null;
  for (let day = 1; day <= MAX_DAYS; day++) {
    await ev(`BOT()`);
    // 快轉到這一天結束(人生選擇隨便選)
    for (let i = 0; i < 400; i++) {
      const s = await ev(`ON.inChoice() ? (ON.pick(Math.random() < 0.5 ? 0 : 1), 'c') : ON.inSummary() ? 's' : (ON.advance(10), 'r')`);
      if (s === 's') break;
    }
    const info = await ev(`(() => { const S = ON.S; return { day: S.day, rep: S.rep, money: S.money, rank: 1 + S.inns.filter(i => i.rep > S.rep).length, facs: S.facs.length, lv3: S.facs.filter(f => f.lv === 3).length, land: S.owned.length, crew: S.crew.length, guests: S.stats.guests, combos: S.combos.length, ach: S.ach.length, ms: (S.milestones || []).join(','), ended: !!S.ended, size: JSON.stringify(S).length }; })()`);
    const st = info.rep >= 6000 ? 5 : info.rep >= 2400 ? 4 : info.rep >= 900 ? 3 : info.rep >= 250 ? 2 : 1;
    for (let s = 2; s <= st; s++) mark(s + '★', info.day);
    for (const r of [10, 3, 1]) if (info.rank <= r) mark('第' + r + '名內', info.day);
    for (const m of info.ms.split(',').filter(Boolean)) mark('里程碑:' + m, info.day);
    if (info.land === 12) mark('12 塊地', info.day);
    if (info.land === 28) mark('全部 28 塊地', info.day);
    last = info;
    if (day % 14 === 0) console.log(`  [${run}] 第${info.day}天 ${st}★ #${info.rank} 口碑${info.rep} ¥${info.money} 設施${info.facs}(Lv3×${info.lv3}) 地${info.land} 員工${info.crew} 客${info.guests} 組合${info.combos} 存檔${(info.size / 1024).toFixed(1)}KB`);
    // 結局:summary 按下一步會跳結局畫面
    const ending = await ev(`!!document.querySelector('#ending.on') || ON.endingPending?.()`).catch(() => false);
    await ev(`ON.next(); 1`);
    await sleep(30);
    if (await ev(`!!document.querySelector('#ending.on')`)) { mark('結局', info.day); break; }
    void ending;
  }
  ws.close(); chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true });
  return { marks, last, errors };
}

for (let r = 1; r <= RUNS; r++) {
  const { marks, last, errors } = await runOnce(r);
  console.log(`第 ${r} 次:`, Object.entries(marks).map(([k, d]) => `${k}=第${d}天`).join('  '));
  console.log(`  最後:第${last.day}天 口碑${last.rep} #${last.rank} 客人${last.guests} 存檔 ${(last.size / 1024).toFixed(1)}KB`);
  if (errors.length) console.log('  錯誤:', [...new Set(errors)].slice(0, 5).join('\n'));
}
