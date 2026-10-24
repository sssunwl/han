/* ============================================================
   AI 明星養成:畫面
   上:攝影棚(pixelkit 程式畫的場景 + Q 版小人,頭上冒對話泡泡)
   下:📋 機會 / ⭐ 明星 / 💬 訊息 / 🏢 公司 四個分頁 + ▶ 下一週
   遊戲規則全部在 engine.js,這裡只負責畫出來、把玩家的點擊交給引擎。
   ============================================================ */
import '../../shared/offline.js';
import { saveKey, currentProfile } from '../../shared/profile.js';
import { tone, fanfare, renderWho, lockGestures, escapeHTML, audioPrefs, saveAudioPrefs, fitCanvas } from '../../shared/kit.js';
import { TRACKS, playMusic, stopMusic, nowPlaying } from '../../shared/music.js';
import { Bmp, toCanvas } from '../../shared/pixelkit/core.js';
import { makeFrame, FW, FH } from '../../shared/pixelkit/character.js';
import { KIT as ST, makeAccessory, wall as stWall } from '../../shared/pixelkit/studio.js';
import * as E from './engine.js';
import * as D from './data.js';
import { loadBest, saveBoth, encodeSave, decodeSave } from './store.js';

const $ = id => document.getElementById(id);
const esc = escapeHTML;
const fmt = n => Math.round(n).toLocaleString('en-US');
const SAVE_KEY = saveKey('aistar', 'save1');
lockGestures();
renderWho($('who'), '在經營');

let S = null, running = false, tab = 'ops', feedSeen = 0, bubbleSeen = 0;

// ---------- 小音效 ----------
const sfx = {
  tap: () => tone(620, 0.04, 'square', 0.05),
  pick: () => { tone(660, 0.08, 'triangle', 0.14); setTimeout(() => tone(880, 0.1, 'triangle', 0.14), 70); },
  lose: () => tone(300, 0.18, 'sine', 0.08, -80),
  coin: () => { tone(1040, 0.06, 'square', 0.06); setTimeout(() => tone(1400, 0.08, 'square', 0.06), 60); },
  bad: () => tone(200, 0.15, 'sawtooth', 0.05),
};
function pickMusic() {
  if (!running || audioPrefs.music === 'off') { stopMusic(); return; }
  const want = TRACKS[audioPrefs.music] ? audioPrefs.music : 'matsuri';
  if (nowPlaying() !== want) playMusic(want);
}
function soundIcon() { $('soundBtn').textContent = !audioPrefs.sfx && audioPrefs.music === 'off' ? '🔇' : audioPrefs.music === 'off' ? '🔈' : '🔊'; }
$('soundBtn').addEventListener('click', () => {
  // 🔊 全開 → 🔈 只有音效 → 🔇 全關 → 🔊
  if (audioPrefs.music !== 'off') audioPrefs.music = 'off';
  else if (audioPrefs.sfx) audioPrefs.sfx = false;
  else { audioPrefs.sfx = true; audioPrefs.music = 'auto'; }
  saveAudioPrefs(); soundIcon(); pickMusic(); sfx.tap();
  toast({ '🔊': '音樂和音效都開', '🔈': '只開音效', '🔇': '全部靜音' }[$('soundBtn').textContent]);
});
soundIcon();

let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); }

// ---------- 頭像(小人 + 配件,轉成圖片快取) ----------
const ptCache = new Map();
function portrait(st, dir = 'down', col = 'idle0') {
  const k = [st.look.skin, st.look.hair, st.look.hairColor, st.look.cloth, st.acc, st.glow, dir, col].join('|');
  if (!ptCache.has(k)) {
    const b = new Bmp(FW, FH);
    b.blit(makeFrame(st.look, dir, col), 0, 0);
    if (dir !== 'up') b.blit(makeAccessory(st.acc, st.glow), 0, (col === 'walk1' || col === 'walk3') ? 1 : 0, dir === 'right');
    const c = toCanvas(b);
    ptCache.set(k, { canvas: c, url: dir === 'down' && col === 'idle0' ? c.toDataURL() : null });
  }
  return ptCache.get(k);
}
const ptImg = (st, cls = 'pt') => st ? `<img class="${cls}" style="--g:${st.glow}22" src="${portrait(st).url}" alt="">` : '';
const nameTag = st => `<b style="--c:${st.glow};color:${st.glow}">${esc(st.name)}</b>`;

// ============================================================
//  攝影棚場景
// ============================================================
const RW = 320, RH = 224;
const cam = { s: 1, ox: 0, oy: 0 };
let view = null;
const cv = $('cv');
view = fitCanvas(cv, () => { layout(); });
const ctx = view.ctx;
function layout() { if (!view) return; cam.s = Math.min(view.w / RW, view.h / RH); cam.ox = (view.w - RW * cam.s) / 2; cam.oy = (view.h - RH * cam.s) / 2; }

// 家具:x, y(左上)、lv 幾級出現、fg = 要跟人物一起排前後(桌子會擋住後面的腳)
const FURN = [
  { k: 'dance_mirror', x: 2, y: 2, lv: 1 },
  { k: 'schedule_board', x: 134, y: 12, lv: 1, max: 1 },
  { k: 'big_screen', x: 134, y: 8, lv: 2 },
  { k: 'neon_sign', x: 68, y: 14, lv: 2 },
  { k: 'green_screen', x: 226, y: 10, lv: 1 },
  { k: 'trophy_case', x: 290, y: 8, lv: 2 },
  { k: 'spotlight', x: 130, y: 0, lv: 3 }, { k: 'spotlight', x: 160, y: 0, lv: 3 }, { k: 'spotlight', x: 190, y: 0, lv: 3 },
  { k: 'stage', x: 118, y: 70, lv: 3 },
  { k: 'mic_stand', x: 70, y: 62, lv: 1, fg: true },
  { k: 'camera', x: 212, y: 98, lv: 1, fg: true },
  { k: 'sofa', x: 232, y: 172, lv: 1, flat: true },
  { k: 'podcast_desk', x: 6, y: 150, lv: 1, fg: true },
  { k: 'stream_desk', x: 102, y: 154, lv: 1, fg: true },
  { k: 'ring_light', x: 172, y: 142, lv: 2, fg: true },
  { k: 'plant_studio', x: 292, y: 132, lv: 1, fg: true },
  { k: 'robot', x: 196, y: 188, lv: 4, fg: true },
];
const SPOTS = {
  dance: [[22, 104], [44, 110], [14, 124], [36, 128]],
  sing: [[100, 108], [88, 118], [110, 124]],
  stage: [[150, 108], [168, 104], [186, 108], [138, 120]],
  act: [[252, 96], [272, 98], [262, 110]],
  talk: [[24, 168], [54, 168]],
  live: [[134, 172], [114, 174]],
  rest: [[252, 198], [276, 198], [300, 210], [232, 212], [210, 172]],
  sulk: [[306, 104], [300, 120]],
  idle: [[90, 150], [180, 128], [70, 196], [160, 206]],
};
const WALLS = ['#5b5f9e', '#4f6aa8', '#6a4f9e', '#3f3a7a'];
let bgCanvas = null, bgLv = 0;
const sprCache = {};
const spr = k => (sprCache[k] = sprCache[k] || toCanvas(ST[k].make()));
function buildBg() {
  const b = new Bmp(RW, RH);
  const fl = ST.floor_studio.make(), cp = ST.floor_carpet.make();
  for (let y = 64; y < RH; y += 32) for (let x = 0; x < RW; x += 32) b.blit(x >= 224 && y >= 160 ? cp : fl, x, y);
  const wc = WALLS[S.lv - 1];
  const plain = stWall({ color: wc }), win = stWall({ color: wc, kind: 'window' }), poster = stWall({ color: wc, kind: 'poster' });
  for (let x = 0; x < RW; x += 32) b.blit(x === 192 ? win : x === 64 && S.lv < 2 ? poster : plain, x, 0);
  bgCanvas = document.createElement('canvas'); bgCanvas.width = RW; bgCanvas.height = RH;
  const g = bgCanvas.getContext('2d');
  g.drawImage(toCanvas(b), 0, 0);
  for (const f of FURN) if (!f.fg && S.lv >= f.lv && !(f.max && S.lv > f.max)) g.drawImage(spr(f.k), f.x, f.y);
  bgLv = S.lv;
}

// 演員(明星在場景裡的位置)
const actors = new Map();
function stationOf(st) {
  if (st.job) {
    const op = E.opById(S, st.job), t = op ? op.type : 'short';
    if (['short', 'duo', 'holo'].includes(t)) return 'dance';
    if (['concert', 'contest', 'dome'].includes(t)) return S.lv >= 3 ? 'stage' : 'sing';
    if (t === 'live') return 'live';
    if (t === 'podcast') return 'talk';
    return 'act';
  }
  if (st.sulk) return 'sulk';
  const p = st.plan || 'rest';
  if (p === 'rest') return 'rest';
  if (p === 'live') return 'live';
  if (p.startsWith('train:')) return { sing: 'sing', dance: 'dance', act: 'act', talk: 'talk' }[p.slice(6)];
  return 'idle';
}
const ACT_ICON = st => {
  if (st.job) { const op = E.opById(S, st.job); return op ? D.MEDIA[op.type].icon : '🎬'; }
  if (st.sulk) return '💢';
  const p = st.plan || 'rest';
  return p === 'rest' ? '💤' : p === 'live' ? '🔴' : p.startsWith('train:') ? '💦' : '';
};
function placeActors(snap = false) {
  const used = {};
  const t = E.team(S);
  for (const id of [...actors.keys()]) if (!t.some(s => s.id === id)) actors.delete(id);
  for (const st of t) {
    const stn = stationOf(st), list = SPOTS[stn], i = used[stn] = (used[stn] || 0) + 1;
    const [sx, sy] = list[(i - 1) % list.length], extra = Math.floor((i - 1) / list.length);
    let a = actors.get(st.id);
    if (!a) { a = { x: 160 + (Math.random() - 0.5) * 60, y: 200, dir: 'down', t: Math.random() * 10, wob: 0 }; actors.set(st.id, a); snap = snap || !running; }
    a.tx = sx + extra * 10; a.ty = sy + extra * 6;
    if (snap) { a.x = a.tx; a.y = a.ty; }
  }
}
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (running && S) { step(dt, now); draw(now); updateBubbles(now); }
  requestAnimationFrame(frame);
}
function step(dt) {
  for (const [id, a] of actors) {
    a.t += dt;
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    if (d > 1) {
      const v = Math.min(d, 46 * dt);
      a.x += dx / d * v; a.y += dy / d * v; a.moving = true;
      a.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    } else {
      a.moving = false; a.dir = 'down';
      // 站著的時候偶爾晃一下(看起來在做事)
      if ((a.wob -= dt) < 0) { a.wob = 2 + Math.random() * 4; if (Math.random() < 0.4) { a.tx += (Math.random() - 0.5) * 8; a.ty += (Math.random() - 0.5) * 4; } }
    }
  }
}
function draw(now) {
  if (!bgCanvas || bgLv !== S.lv) buildBg();
  const d = view.dpr;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = '#0d0a22'; ctx.fillRect(0, 0, view.w, view.h);
  ctx.setTransform(d * cam.s, 0, 0, d * cam.s, d * cam.ox, d * cam.oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bgCanvas, 0, 0);
  // 舞台聚光(Lv3+ 有人在台上時)
  const items = [];
  for (const f of FURN) if (f.fg && S.lv >= f.lv) items.push({ y: f.y + ST[f.k].h - 6, draw: () => ctx.drawImage(spr(f.k), f.x, f.y) });
  for (const st of E.team(S)) {
    const a = actors.get(st.id); if (!a) continue;
    items.push({ y: a.y, draw: () => drawActor(st, a, now) });
  }
  if (S.mentor) items.push({ y: 196, draw: () => drawMentor(now) });
  items.sort((p, q) => p.y - q.y).forEach(i => i.draw());
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
function drawActor(st, a, now) {
  const col = a.moving ? ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(a.t * 7) % 4] : (Math.floor(a.t * 1.3) % 6 === 0 ? 'idle1' : 'idle0');
  const x = Math.round(a.x - FW / 2), y = Math.round(a.y - 30);
  // 腳底光圈(專屬顏色)
  ctx.globalAlpha = st.job ? 0.45 + 0.25 * Math.sin(now / 250) : 0.3;
  ctx.fillStyle = st.glow; ctx.beginPath(); ctx.ellipse(a.x, a.y, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  let jump = 0;
  if (!a.moving && st.job) jump = Math.abs(Math.sin(a.t * 5)) > 0.85 ? -1 : 0;     // 工作中:一跳一跳
  ctx.drawImage(portrait(st, a.dir, col).canvas, x, y + jump);
  const ic = ACT_ICON(st);
  if (ic && !a.moving) { ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(ic, a.x + 10, y + 6 + Math.sin(a.t * 3) * 1.5); }
}
let mentorPt = null;
function drawMentor(now) {
  const m = S.mentor;
  if (!mentorPt) { const b = new Bmp(FW, FH); b.blit(makeFrame(m.look), 0, 0); b.blit(makeAccessory(m.acc, m.glow), 0, 0); mentorPt = toCanvas(b); }
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.ellipse(186, 196, 9, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.drawImage(mentorPt, 174, 166);
  ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🧑‍🏫', 196, 172);
}
// 點場景裡的人 → 看他的資料
cv.addEventListener('pointerup', e => {
  if (!S) return;
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - cam.ox) / cam.s, y = (e.clientY - r.top - cam.oy) / cam.s;
  let best = null, bd = 1e9;
  for (const st of E.team(S)) { const a = actors.get(st.id); if (!a) continue; const d = Math.hypot(a.x - x, a.y - 14 - y); if (d < 20 && d < bd) { bd = d; best = st; } }
  if (best) { sfx.tap(); openStar(best.id); }
});

// ---------- 對話泡泡 ----------
const bubQ = new Map();          // 明星 id → 等著講的話
const bubOn = new Map();         // 明星 id → { el, until }
function pumpFeed() {
  for (const f of S.feed) {
    if (f.n <= bubbleSeen) continue;
    bubbleSeen = f.n;
    if (!f.id || !actors.has(f.id) || !['bid', 'win', 'lose', 'say', 'chat', 'wish', 'good', 'sad', 'sulk', 'yield', 'idea'].includes(f.kind)) continue;
    const q = bubQ.get(f.id) || []; q.push(f); while (q.length > 2) q.shift(); bubQ.set(f.id, q);
  }
}
function updateBubbles(now) {
  const box = $('bubbles');
  for (const [id, b] of bubOn) if (now > b.until || !actors.has(id)) { b.el.remove(); bubOn.delete(id); }
  if (bubOn.size < 3) for (const [id, q] of bubQ) {
    if (bubOn.size >= 3) break;
    if (bubOn.has(id) || !q.length) continue;
    const f = q.shift(), st = E.starById(S, id); if (!st) continue;
    const el = document.createElement('div'); el.className = 'bub'; el.style.setProperty('--c', st.glow);
    let text = f.text.replace(new RegExp('^' + st.name + '[::]'), '');
    if (text.length > 46) text = text.slice(0, 44) + '…';
    el.innerHTML = `<b>${esc(st.name)}</b> ${esc(text)}`;
    box.appendChild(el);
    bubOn.set(id, { el, until: now + 2600 + text.length * 70 });
  }
  for (const [id, b] of bubOn) {
    const a = actors.get(id); if (!a) continue;
    const half = b.el.offsetWidth / 2, W = $('bubbles').clientWidth;      // 靠邊的泡泡往內推,不要被擠扁
    b.el.style.left = Math.max(half + 4, Math.min(W - half - 4, cam.ox + a.x * cam.s)) + 'px';
    b.el.style.top = (cam.oy + (a.y - 33) * cam.s) + 'px';
  }
}

// ============================================================
//  介面
// ============================================================
function render() {
  if (!S) return;
  pumpFeed();
  placeActors();
  $('coName').innerHTML = `<b>${esc(S.company)}</b>第 ${S.week} 週 · Lv${S.lv} ${D.LEVELS[S.lv].name}${S.ng ? ` · 第 ${S.ng + 1} 季` : ''}`;
  $('money').textContent = (S.money < 0 ? '-$' : '$') + fmt(Math.abs(S.money));
  $('money').style.color = S.money < 0 ? '#ff8f8f' : '';
  $('fans').textContent = fmt(E.totalFans(S));
  $('rankNo').textContent = '第' + E.rankNow(S);
  const tr = S.trend, nx = S.nextTrend, tp = id => D.topicById(id);
  $('trend').innerHTML = `<span>📈 本週</span><span class="hot">🔥 ${D.MEDIA[tr.hot].icon}${D.MEDIA[tr.hot].name} ×1.5</span><span>${tp(tr.topic).icon}#${tp(tr.topic).name} ×1.2</span>`
    + (S.flags.cool ? `<span>📉 ${D.MEDIA[S.flags.cool.type].name}降溫</span>` : '')
    + `<span class="nx">下週 🔥${D.MEDIA[nx.hot].icon}${D.MEDIA[nx.hot].name}</span>`;
  renderGoal();
  const open = S.ops.filter(o => o.status === 'open' && o.slots.some(s => !s.who)).length;
  $('bOps').textContent = open || ''; $('bOps').style.display = open ? '' : 'none';
  const newFeed = S.feed.filter(f => f.n > feedSeen).length;
  $('bFeed').textContent = newFeed > 99 ? '99+' : newFeed; $('bFeed').style.display = newFeed && tab !== 'feed' ? '' : 'none';
  $('bCo').textContent = '!'; $('bCo').style.display = S.audition || (!E.canUpgrade(S)) ? '' : 'none';
  $('nextBtn').textContent = S.event ? '📣 先看事件' : '▶ 下一週';
  $('nextBtn').classList.toggle('wait', !!S.event);
  renderTab();
}
function renderGoal() {
  if (S.ended) { $('goal').innerHTML = `🏆 <b>已經登上星光巨蛋!</b> 可以繼續經營,或在「公司」開始第二季`; return; }
  const g = E.nextGoal(S); if (!g) { $('goal').textContent = ''; return; }
  const f = E.totalFans(S);
  const target = { debut: 1000, known: 10000, popular: 25000, dome: 100000 }[g.id];
  const pct = target ? Math.min(100, f / target * 100) : (S.domeTries ? 60 : 30);
  $('goal').innerHTML = `🎯 <b>${g.icon} ${g.name}</b><span>${g.desc}</span><span class="gbar"><i style="width:${pct}%"></i></span>`;
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab; sfx.tap();
  for (const x of $('tabs').children) x.classList.toggle('on', x === b);
  $('panel').scrollTop = 0;
  render();
});
function renderTab() {
  const p = $('panel'), y = p.scrollTop;
  p.innerHTML = tab === 'ops' ? opsHTML() : tab === 'stars' ? starsHTML() : tab === 'feed' ? feedHTML() : coHTML();
  p.scrollTop = y;
  if (tab === 'feed') { feedSeen = S.seq; $('bFeed').style.display = 'none'; }
}

const REASONS = { skill: '最拿手', dream: '夢想', rival: '不想輸給對手', topic: '喜歡這個話題', revenge: '上次沒選上', friend: '想跟朋友一起', wish: '心願', trend: '追流行', big: '想要大舞台', lead: '想當主角', generic: '想試試看' };
const gradeChip = g => `<span class="gr" style="background:${g.color}">${g.g}</span>`;
function opTags(op) {
  const t = [];
  if (op.type === 'dome') t.push('<span class="tag final">🏆 最終目標</span>');
  if (E.isHot(S, op)) t.push('<span class="tag hot">🔥 熱門 ×1.5</span>');
  if (E.isTopic(S, op)) t.push(`<span class="tag topic">#${D.topicById(op.topic).name} ×1.2</span>`);
  if (op.big && op.type !== 'dome') t.push('<span class="tag big">大場面</span>');
  if (op.self) t.push('<span class="tag self">自己提的企劃</span>');
  if (D.MEDIA[op.type].temp) t.push('<span class="tag hot">🌐 限時平台</span>');
  return t.join(' ');
}
function opMeta(op) {
  const m = D.MEDIA[op.type];
  const sk = op.sw ? op.slots.map((s, i) => `${s.role}看${Object.keys(op.sw[i]).filter(k => op.sw[i][k] >= 0.5).map(k => D.SKILLS[k].icon).join('')}`).join('、')
    : Object.keys(op.w).map(k => D.SKILLS[k].icon + D.SKILLS[k].name).join(' ');
  return `${m.name} · ${m.pf} · ${op.weeks} 週 · ${sk}`;
}
function opsHTML() {
  const open = S.ops.filter(o => o.status === 'open'), run = S.ops.filter(o => o.status === 'run');
  let h = '';
  if (S.event) h += `<div class="card2" style="background:#fff3c4"><b>📣 ${esc(S.event.title)}</b><div class="meta">要先決定怎麼處理,才能進到下一週。</div><button class="sbtn" data-ev="1">看事件</button></div>`;
  h += `<div class="sec">本週機會(沒人接的,下週會被別家公司接走)</div>`;
  if (!open.length) h += '<p class="muted">這週的機會都排好了!其他人可以去「⭐ 明星」排練習或休息。</p>';
  for (const op of open) h += opCard(op);
  if (run.length) {
    h += `<div class="sec" style="margin-top:14px">進行中</div>`;
    for (const op of run) {
      const ids = op.slots.map(s => s.who).filter(Boolean);
      h += `<div class="card2 run"><h3>${D.MEDIA[op.type].icon} ${esc(op.title)}</h3><div class="meta">還有 ${op.left} 週 · ${ids.map(id => esc(E.starById(S, id)?.name || '')).join('、')}</div>
        <div class="slots">${op.slots.map(s => `<span class="slot">${ptImg(E.starById(S, s.who))}${s.role}${s.who ? '' : ':—'}</span>`).join('')}</div></div>`;
    }
  }
  return h;
}
function opCard(op) {
  const m = D.MEDIA[op.type], empty = op.slots.findIndex(s => !s.who);
  const mult = E.trendMult(S, op);
  let h = `<div class="card2"><h3>${m.icon} ${esc(op.title)} ${opTags(op)}</h3>
    <div class="meta">${opMeta(op)}</div>
    <div class="rew"><span>💰 $${fmt(op.pay * mult)}</span><span>👥 +${fmt(op.fans * mult)}</span><span class="muted">(B 評價時)</span></div>`;
  if (op.slots.length > 1) h += `<div class="slots">${op.slots.map(s => `<span class="slot">${ptImg(E.starById(S, s.who))}${s.role}${s.who ? ':' + esc(E.starById(S, s.who).name) : ':—'}</span>`).join('')}</div>`;
  const bids = op.bids.filter(b => { const st = E.starById(S, b.id); return st && !st.gone; });
  if (bids.length) {
    h += `<div class="h4">想搶這個的人(${bids.length})</div>`;
    for (const b of bids) {
      const st = E.starById(S, b.id), free = E.isFree(st), mine = op.slots.some(s => s.who === st.id);
      const g = empty >= 0 && free ? E.estimate(S, st, op, empty) : null;
      h += `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)}:${esc(b.text)}<div class="why">理由:${REASONS[b.reason] || ''} · ${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')}</div></div>
        <div class="act">${mine ? '<span class="muted">✅ 選了</span>' : free && empty >= 0 ? `${gradeChip(g)}<button class="sbtn" data-assign="${op.id}" data-slot="${empty}" data-star="${st.id}">選${op.slots.length > 1 ? '為' + op.slots[empty].role : '他'}</button>` : '<span class="muted">有別的工作</span>'}</div></div>`;
    }
  } else h += `<div class="h4">還沒有人來搶 —— 可以直接指派</div>`;
  for (const y of op.yields) { const st = E.starById(S, y.id); if (st) h += `<div class="yield">💗 ${nameTag(st)}:${esc(y.text)}</div>`; }
  if (empty >= 0) h += `<div class="acts"><button class="sbtn ghost" data-pick="${op.id}" data-slot="${empty}">👉 指派${op.slots.length > 1 ? op.slots[empty].role : ''}給其他人…</button>${empty > 0 ? '<span class="muted">(不選也可以,下週會自己開工)</span>' : ''}</div>`;
  return h + '</div>';
}

function bar(v, c) { return `<div class="b"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div>`; }
const moodFace = v => v >= 75 ? '😄' : v >= 50 ? '🙂' : v >= 30 ? '😐' : '😣';
function starsHTML() {
  let h = `<div class="sec">旗下明星 ${E.team(S).length} / ${D.LEVELS[S.lv].max}</div>`;
  for (const st of E.team(S)) h += starCard(st);
  if (S.mentor) h += `<div class="card2"><b>🧑‍🏫 前輩 ${esc(S.mentor.name)}</b><div class="meta">上一季留下來的前輩,不搶工作,教大家練習(練習效果 +15%、演出 +3)。</div></div>`;
  return h;
}
function starCard(st, full = false) {
  const fr = E.friendsOf(S, st), rv = E.rivalsOf(S, st);
  const sk = D.SKILL_IDS.map(k => `<div class="${k === E.bestSkill(st) ? 'sp' : ''}">${D.SKILLS[k].icon}${st.skills[k].toFixed(1)}</div>`).join('');
  const job = st.job && E.opById(S, st.job);
  let plans = '';
  if (job) plans = `<div class="wish">${D.MEDIA[job.type].icon} 正在做《${esc(job.title.replace(/[《》]/g, ''))}》${job.status === 'run' ? `(還有 ${job.left} 週)` : '(這週開工)'}</div>`;
  else if (st.sulk) plans = `<div class="wish">💢 在鬧彆扭,這週不想做事。去「☕ 談心」安慰他吧。</div>`;
  else plans = `<div class="plans">${Object.entries(E.PLAN_NAMES).map(([k, v]) => `<button data-plan="${k}" data-star="${st.id}" class="${st.plan === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
  return `<div class="card2"><div class="star"><img class="pt big" data-open="${st.id}" style="--g:${st.glow}33" src="${portrait(st).url}" alt="">
    <div class="body"><div class="nm" style="color:${st.glow}">${st.emoji} ${esc(st.name)} <span class="tag">${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' · ')}</span></div>
    <div class="sk">${sk}</div>
    <div class="bars"><div>${moodFace(st.mood)} 心情${bar(st.mood, '#ff8fb1')}</div><div>⚡ 體力${bar(st.energy, st.energy < 25 ? '#ff6f6f' : '#7fdc8a')}</div><div>💗 歸屬${bar(st.loyalty, st.loyalty < 30 ? '#ff6f6f' : '#b98cff')}</div></div>
    <div class="wish">👥 粉絲 ${fmt(st.fans)}${st.wish ? ` · 💭 ${esc(E.wishText(S, st))}(剩 ${st.wish.left} 週)` : ''}${st.lost >= 2 ? ` · 連續 ${st.lost} 次沒選上` : ''}</div>
    ${fr.length || rv.length ? `<div class="rels">${fr.map(o => '🤝' + esc(o.name)).join(' ')} ${rv.map(o => '⚔️' + esc(o.name)).join(' ')}</div>` : ''}
    ${full ? `<div class="wish">❤️ 喜歡 #${D.topicById(st.topic).name} · 🌠 夢想:${D.MEDIA[st.dream].icon}${D.MEDIA[st.dream].name} · 口頭禪「${esc(st.catch)}」</div>
      <div class="wish">🎬 做過 ${st.stat.ops} 個作品${st.stat.best ? ',最好 ' + st.stat.best : ''} · 加入第 ${st.joined} 週</div>` : ''}
    ${plans}
    <div class="acts"><button class="sbtn ghost" data-talk="${st.id}" ${st.talkedThisWeek ? 'disabled' : ''}>☕ 談心 $${D.TALK_COST}</button><button class="sbtn ghost" data-outfit="${st.id}">👗 新造型 $${D.OUTFIT_COST}</button><button class="sbtn ghost" data-meet="${st.id}" ${st.job ? 'disabled' : ''}>🎪 見面會 $${D.MEET_COST}</button></div>
    </div></div></div>`;
}
function feedHTML() {
  const list = S.feed.slice(-90).reverse();
  let h = '<ul class="feed">', wk = null;
  for (const f of list) {
    if (f.w !== wk) { wk = f.w; h += `<li class="wk">— 第 ${wk} 週 —</li>`; }
    const st = f.id && E.starById(S, f.id);
    const text = st ? f.text.replace(new RegExp('^' + st.name + '[::]'), '') : f.text;
    h += `<li class="${f.kind}">${st ? ptImg(st) : ''}<div><span class="nm" style="color:${st ? st.glow : '#ffd25a'}">${st ? esc(st.name) + ':' : ''}</span><span class="tx">${esc(text)}</span></div></li>`;
  }
  return h + '</ul>';
}
function coHTML() {
  const lv = D.LEVELS[S.lv], nx = D.LEVELS[S.lv + 1], why = E.canUpgrade(S);
  let h = `<div class="card2"><div class="lvbox"><div><b>🏢 Lv${S.lv} ${lv.name}</b><div class="meta">明星 ${E.team(S).length}/${lv.max} 位 · 每週 ${lv.ops} 個機會 · 房租 $${fmt(lv.rent)}/週</div></div>
    ${nx ? `<button class="sbtn" data-up="1" ${why ? 'disabled' : ''}>升級 $${fmt(nx.cost)}</button>` : '<span class="tag">最高級</span>'}</div>
    ${nx ? `<div class="meta">下一級:${nx.name}(要粉絲 ${fmt(nx.fans)}、$${fmt(nx.cost)})→ ${nx.max} 位明星、每週 ${nx.ops} 個機會${S.lv + 1 === 3 ? '、解鎖虛擬演唱會和舞台' : S.lv + 1 === 2 ? '、解鎖廣告/遊戲代言/選秀' : ''}${why ? ' · <b>還差:' + why + '</b>' : ''}</div>` : ''}
    <div class="facs">${Object.entries(D.FACILITIES).map(([k, f]) => `<div><div class="ic">${f.icon}</div><b>${f.name} Lv${S.fac[k]}</b><div class="muted">${f.desc}</div>${S.fac[k] < 3 ? `<button class="sbtn ghost" data-fac="${k}" style="margin-top:4px">$${fmt(f.cost[S.fac[k]])}</button>` : '<div class="muted">最高級</div>'}</div>`).join('')}</div></div>`;
  // 試鏡
  h += `<div class="card2"><b>🎙 試鏡</b>`;
  if (S.audition) {
    h += `<div class="meta">簽約金 $${fmt(D.auditionCost(E.team(S).length))} · 名額 ${E.team(S).length}/${lv.max}</div>`;
    S.audition.forEach((c, i) => {
      h += `<div class="bid"><img class="pt" style="--g:${c.glow}22" src="${portrait(c).url}" alt=""><div class="say" style="--c:${c.glow}">${nameTag(c)}:${esc(c.intro || '')}
        <div class="why">${c.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')} · 專長 ${D.SKILLS[c.spec].icon}${D.SKILLS[c.spec].name} ${c.skills[c.spec].toFixed(1)}</div></div>
        <div class="act"><button class="sbtn" data-sign="${i}">簽約</button></div></div>`;
    });
    h += `<button class="sbtn ghost" data-skipaud="1" style="margin-top:6px">這次都不要</button>`;
  } else h += `<div class="meta">${E.team(S).length >= lv.max ? '名額滿了,升級公司才能找新人。' : S.auditionIn > 0 ? `${S.auditionIn} 週後可以再辦試鏡。` : '可以辦試鏡了!'}</div>${E.team(S).length < lv.max && S.auditionIn <= 0 ? '<button class="sbtn" data-aud="1">辦試鏡</button>' : ''}`;
  h += '</div>';
  // 排行
  h += `<div class="card2"><b>📊 公司排行(粉絲數)</b><ul class="rank">${E.ranking(S).map((r, i) => `<li class="${r.me ? 'me' : ''}">${i + 1}. ${r.icon} ${esc(r.name)}<span class="f">${fmt(r.fans)}</span></li>`).join('')}</ul><div class="meta">每 12 週公布「季度星光榜」,前幾名有獎金。</div></div>`;
  // 目標、獎盃
  h += `<div class="card2"><b>🎯 目標</b>${D.GOALS.map(g => `<div class="meta">${S.goals.includes(g.id) ? '✅' : '⬜'} ${g.icon} <b>${g.name}</b>:${g.desc}${S.goalWeek && S.goalWeek[g.id] ? `(第 ${S.goalWeek[g.id]} 週)` : ''}</div>`).join('')}
    ${S.trophies.length ? `<div class="trophies">${S.trophies.map(t => `<span title="${esc(t.name)}">${t.icon}</span>`).join('')}</div>` : ''}</div>`;
  if (S.ended) h += `<div class="card2"><b>🌱 第二季</b><div class="meta">${S.ending ? `這一季的結局:${S.ending.icon} ${S.ending.name}(第 ${S.ending.week} 週)` : ''}</div><button class="sbtn" data-ng="1">開始第二季</button></div>`;
  h += `<div class="card2"><b>💾 存檔</b><div class="meta">每 15 秒自動存一次。換裝置可以用存檔碼。</div><div class="acts"><button class="sbtn ghost" data-backup="1">📦 備份存檔碼</button></div></div>`;
  return h;
}

// 分頁裡的按鈕(事件委派)
$('panel').addEventListener('click', e => {
  const b = e.target.closest('[data-assign],[data-pick],[data-plan],[data-talk],[data-outfit],[data-meet],[data-up],[data-fac],[data-sign],[data-skipaud],[data-aud],[data-ng],[data-backup],[data-open],[data-ev]');
  if (!b || !S) return;
  const d = b.dataset;
  let err = null;
  if (d.assign) { err = doAssign(d.assign, +d.slot, d.star); }
  else if (d.pick) { openPicker(d.pick, +d.slot); return; }
  else if (d.plan) { err = E.setPlan(S, d.star, d.plan); if (!err) sfx.tap(); }
  else if (d.talk) { err = E.talk(S, d.talk); if (!err) sfx.pick(); }
  else if (d.outfit) { err = E.buyOutfit(S, d.outfit); if (!err) { sfx.coin(); ptCache.clear(); } }
  else if (d.meet) { err = E.meetFans(S, d.meet); if (!err) sfx.coin(); }
  else if (d.up) { err = E.upgradeCompany(S); if (!err) { fanfare(); toast(`🏢 升級成「${D.LEVELS[S.lv].name}」!`); } }
  else if (d.fac) { err = E.upgradeFac(S, d.fac); if (!err) sfx.coin(); }
  else if (d.sign) { err = E.sign(S, +d.sign); if (!err) { fanfare(); placeActors(); } }
  else if (d.skipaud) { E.skipAudition(S); sfx.tap(); }
  else if (d.aud) { err = E.auditionNow(S); if (!err) sfx.pick(); }
  else if (d.ng) { openNg(); return; }
  else if (d.backup) { openCode('backup'); return; }
  else if (d.open) { openStar(d.open); return; }
  else if (d.ev) { openEvent(); return; }
  if (err) { toast('⚠ ' + err); sfx.bad(); }
  saveSoon(); render();
});
function doAssign(opId, slot, starId) {
  const before = S.seq;
  const err = E.assign(S, opId, slot, starId);
  if (err) return err;
  sfx.pick();
  if (S.feed.some(f => f.n > before && f.kind === 'lose')) setTimeout(sfx.lose, 260);
  return null;
}

// ---------- 選人視窗 ----------
let pickCtx = null;
function openPicker(opId, slot) {
  const op = E.opById(S, opId); if (!op) return;
  pickCtx = { opId, slot };
  $('pickTitle').textContent = `${D.MEDIA[op.type].icon} ${op.title}${op.slots.length > 1 ? ' · ' + op.slots[slot].role : ''}`;
  $('pickHow').textContent = '沒來搶的人也可以指派,不過如果他沒興趣,心情會差一點。';
  const free = E.team(S).filter(E.isFree).map(st => ({ st, g: E.estimate(S, st, op, slot), bid: op.bids.some(b => b.id === st.id) }))
    .sort((a, b) => 'SABC'.indexOf(a.g.g) - 'SABC'.indexOf(b.g.g));
  $('pickList').innerHTML = free.length ? free.map(({ st, g, bid }) => `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)} ${bid ? '<span class="tag hot">想要</span>' : ''}
    <div class="why">${D.SKILL_IDS.map(k => D.SKILLS[k].icon + st.skills[k].toFixed(1)).join(' ')} · ⚡${Math.round(st.energy)} · ${moodFace(st.mood)}</div></div>
    <div class="act">${gradeChip(g)}<button class="sbtn" data-pk="${st.id}">選</button></div></div>`).join('') : '<p class="muted">大家這週都有工作了。</p>';
  $('pickBox').classList.add('on');
}
$('pickList').addEventListener('click', e => {
  const b = e.target.closest('[data-pk]'); if (!b || !pickCtx) return;
  const err = doAssign(pickCtx.opId, pickCtx.slot, b.dataset.pk);
  if (err) { toast('⚠ ' + err); sfx.bad(); }
  $('pickBox').classList.remove('on'); saveSoon(); render();
});
$('pickClose').addEventListener('click', () => $('pickBox').classList.remove('on'));

// ---------- 明星詳細 ----------
let starOpen = null;
function openStar(id) {
  const st = E.starById(S, id); if (!st) return;
  starOpen = id;
  const said = S.feed.filter(f => f.id === id).slice(-5).reverse();
  $('starBody').innerHTML = starCard(st, true) + `<div class="h4">最近說的話</div>${said.map(f => `<div class="muted" style="color:#5b4a8a">「${esc(f.text.replace(new RegExp('^' + st.name + '[::]'), ''))}」</div>`).join('') || '<div class="muted">……</div>'}`;
  $('starBox').classList.add('on');
}
$('starBody').addEventListener('click', e => {
  const b = e.target.closest('[data-plan],[data-talk],[data-outfit],[data-meet]'); if (!b) return;
  const d = b.dataset; let err = null;
  if (d.plan) err = E.setPlan(S, d.star, d.plan);
  else if (d.talk) err = E.talk(S, d.talk);
  else if (d.outfit) { err = E.buyOutfit(S, d.outfit); ptCache.clear(); }
  else if (d.meet) err = E.meetFans(S, d.meet);
  if (err) { toast('⚠ ' + err); sfx.bad(); } else sfx.pick();
  saveSoon(); render(); openStar(starOpen);
});
$('starClose').addEventListener('click', () => $('starBox').classList.remove('on'));

// ---------- 事件 ----------
function openEvent() {
  const ev = S.event; if (!ev) return;
  $('evTitle').textContent = '📣 ' + ev.title;
  const ids = ev.id === 'leave' ? [ev.star] : Array.isArray(ev.ctx) ? ev.ctx : ev.ctx ? [ev.ctx] : [];
  $('evWho').innerHTML = `<div style="text-align:center">${ids.map(id => E.starById(S, id)).filter(Boolean).map(st => ptImg(st, 'pt big')).join(' ')}</div>`;
  $('evText').textContent = ev.text;
  $('evChoices').innerHTML = ev.choices.map((c, i) => `<button class="choice" data-ch="${i}">${esc(c.label)}${c.cost && S.money < c.cost ? ' <small>(錢不夠)</small>' : ''}</button>`).join('');
  $('evMsg').textContent = '';
  $('evBox').classList.add('on');
}
$('evChoices').addEventListener('click', e => {
  const b = e.target.closest('[data-ch]'); if (!b) return;
  const id = S.event && S.event.id;
  const res = E.chooseEvent(S, +b.dataset.ch);
  if (S.event) { $('evMsg').textContent = '⚠ ' + (res || ''); sfx.bad(); return; }
  sfx.pick();
  $('evChoices').innerHTML = `<p class="txt" style="color:#4b3fa0">${esc(res || '')}</p><button class="btn wide" id="evOk">好</button>`;
  $('evOk').addEventListener('click', () => { $('evBox').classList.remove('on'); render(); });
  if (id === 'leave') ptCache.clear();
  save(); render();
});

// ---------- 下一週 ----------
$('nextBtn').addEventListener('click', () => {
  if (!S) return;
  if (S.event) { openEvent(); return; }
  const unassigned = S.ops.filter(o => o.status === 'open' && !o.slots[0].who && o.type !== 'dome').length;
  const idleBidders = E.team(S).filter(st => E.isFree(st) && S.ops.some(o => o.status === 'open' && o.bids.some(b => b.id === st.id)));
  if (unassigned && idleBidders.length && !confirm(`還有 ${unassigned} 個機會沒有人接(會被別家公司接走),確定要進到下一週嗎?`)) return;
  const R = E.endWeek(S);
  if (!R) return;
  save();
  showReport(R);
});
function showReport(R) {
  $('repTitle').textContent = `第 ${R.week} 週 結算`;
  const dm = R.money1 - R.money0, df = R.fans1 - R.fans0;
  $('repSum').innerHTML = `<span>💰 ${dm >= 0 ? '+' : '-'}$${fmt(Math.abs(dm))}</span><span>👥 ${df >= 0 ? '+' : ''}${fmt(df)}</span>`;
  $('repList').innerHTML = R.items.map(it => {
    const g = it.grade && D.GRADES.find(x => x.g === it.grade);
    return `<li class="${it.big ? 'big' : ''}">${g ? gradeChip(g) : ''}${esc(it.text)}</li>`;
  }).join('') || '<li>平靜的一週。</li>';
  $('repBox').classList.add('on');
  if (R.grades.includes('S') || R.items.some(i => i.goal)) fanfare(); else if (R.grades.length) sfx.coin();
}
$('repGo').addEventListener('click', () => {
  $('repBox').classList.remove('on'); sfx.tap();
  render();
  if (S.endingPending) showEnding();
  else if (S.event) openEvent();
});

// ---------- 結局 ----------
function showEnding() {
  const e = S.endingPending || S.ending; if (!e) return;
  $('endTitle').textContent = `${e.icon} ${e.name}`;
  $('endText').textContent = e.text;
  $('endLines').innerHTML = e.lines.map(l => { const st = E.starById(S, l.id); return st ? `<div class="eline">${ptImg(st)}${nameTag(st)}:${esc(l.text)}</div>` : ''; }).join('');
  $('endStats').textContent = `第 ${e.week} 週登上星光巨蛋 · 粉絲 ${fmt(e.fans)} · 排行第 ${e.rank} 名 · 做了 ${S.stats.ops} 個作品(S 評價 ${S.stats.S} 次)`;
  drawEndStage();
  $('endBox').classList.add('on');
  fanfare(); setTimeout(fanfare, 700);
}
function drawEndStage() {
  const c = $('endCv'), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#120e2c'; g.fillRect(0, 0, 320, 150);
  for (let i = 0; i < 40; i++) { g.fillStyle = ['#ffd25a', '#ff5ec4', '#6fe0ff'][i % 3]; g.fillRect((i * 73) % 320, (i * 37) % 60, 2, 2); }
  g.globalAlpha = 0.18; g.fillStyle = '#fff6c0';
  for (const x of [70, 160, 250]) { g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x + 50, 140); g.lineTo(x - 50, 140); g.fill(); }
  g.globalAlpha = 1;
  const stg = spr('stage');
  g.drawImage(stg, 0, 0, 96, 56, 16, 80, 288, 70);
  const t = E.team(S), w = Math.min(36, 260 / Math.max(1, t.length));
  t.forEach((st, i) => g.drawImage(portrait(st).canvas, 160 - (t.length * w) / 2 + i * w + (w - 24) / 2, 70 + (i % 2) * 4, 24 * 1.4, 32 * 1.4));
}
$('endGo').addEventListener('click', () => {
  if (S.endingPending) E.acceptEnding(S);
  $('endBox').classList.remove('on'); save(); render();
});
$('endNg').addEventListener('click', () => { if (S.endingPending) E.acceptEnding(S); $('endBox').classList.remove('on'); save(); openNg(); });
function openNg() {
  $('ngList').innerHTML = E.team(S).map(st => `<div class="bid">${ptImg(st)}<div class="say">${nameTag(st)} <span class="muted">${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')} · 粉絲 ${fmt(st.fans)}</span></div><div class="act"><button class="sbtn" data-mentor="${st.id}">留下當前輩</button></div></div>`).join('');
  $('ngBox').classList.add('on');
}
$('ngList').addEventListener('click', e => {
  const b = e.target.closest('[data-mentor]'); if (!b) return;
  if (!confirm('開始第二季後,現在這間公司就會結束(獎盃會留著)。確定嗎?')) return;
  boot(E.newSeason(S, b.dataset.mentor, newSeed()));
  $('ngBox').classList.remove('on'); save();
  toast('🌱 第二季開始!全新的明星陣容');
});
$('ngClose').addEventListener('click', () => $('ngBox').classList.remove('on'));
$('helpBtn').addEventListener('click', () => { sfx.tap(); $('helpBox').classList.add('on'); });
$('helpClose').addEventListener('click', () => $('helpBox').classList.remove('on'));

// ============================================================
//  存檔
// ============================================================
function save() {
  if (!S) return;
  S.savedAt = Date.now();
  const r = saveBoth(SAVE_KEY, S);
  badge(r.ls ? 'ok' : 'backup');
  if (!r.ls) r.idb.then(ok => { if (!ok) badge('fail'); });
}
let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 800); }
let badgeT = 0;
function badge(kind) {
  const el = $('saveDot');
  el.textContent = kind === 'fail' ? '⚠ 存檔失敗' : '💾 已存檔';
  el.classList.toggle('bad', kind === 'fail'); el.classList.add('on');
  clearTimeout(badgeT); badgeT = setTimeout(() => el.classList.remove('on'), kind === 'fail' ? 5000 : 1200);
}
addEventListener('visibilitychange', () => { if (document.hidden && running) save(); });
addEventListener('pagehide', () => { if (running) save(); });
setInterval(() => { if (running && S) save(); }, 15000);

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 1e9)) % 2147483647 || 1;
function show(id) { for (const s of ['startScreen', 'gameScreen']) $(s).classList.toggle('on', s === id); }
/** 把一份存檔放進遊戲(開始、讀存檔碼、第二季都走這裡) */
function boot(sv) {
  S = sv;
  actors.clear(); bubQ.clear(); for (const [, b] of bubOn) b.el.remove(); bubOn.clear();
  ptCache.clear(); mentorPt = null; bgCanvas = null;
  bubbleSeen = Math.max(0, S.seq - 6);           // 開場只冒最近幾句
  feedSeen = S.seq;
  show('gameScreen');
  running = true;
  layout(); placeActors(true); render(); pickMusic();
  if (S.endingPending) showEnding();
  else if (S.event) setTimeout(openEvent, 600);
}
async function start(fresh) {
  sfx.tap();
  const name = ($('coInput').value || '').trim().slice(0, 12) || '星光 AI 娛樂';
  const sv = fresh ? null : await loadBest(SAVE_KEY);
  if (sv) { boot(sv); return; }
  boot(E.newGame({ seed: newSeed(), company: name }));
  save();
  setTimeout(() => $('helpBox').classList.add('on'), 400);
}
$('startBtn').addEventListener('click', () => start(false));
$('newBtn').addEventListener('click', async () => {
  if ((await loadBest(SAVE_KEY)) && !confirm('確定要重新開一間公司嗎?現在的進度會不見。(想留著的話先按「📦 備份存檔碼」)')) return;
  start(true);
});
$('backBtn').addEventListener('click', () => { save(); running = false; stopMusic(); refreshStart(); show('startScreen'); });
async function refreshStart() {
  const s = await loadBest(SAVE_KEY);
  $('backupBtn').style.display = s ? '' : 'none';
  $('nameRow').style.display = s ? 'none' : '';
  $('trophyNote').textContent = s && s.trophies && s.trophies.length ? `🏆 獎盃牆:${s.trophies.map(x => x.icon).join('')}` : '';
  if (s) {
    const fans = (s.stars || []).filter(x => !x.gone).reduce((a, x) => a + x.fans, 0);
    $('startBtn').textContent = `繼續經營(${s.ng ? `第 ${s.ng + 1} 季 · ` : ''}第 ${s.week} 週 · 粉絲 ${fmt(fans)})`;
    $('newBtn').style.display = '';
  } else { $('startBtn').textContent = '開一間公司!'; $('newBtn').style.display = 'none'; }
}
refreshStart();

// ---------- 存檔碼 ----------
let codeMode = 'backup';
async function openCode(mode) {
  codeMode = mode; $('codeMsg').textContent = '';
  if (mode === 'backup') {
    if (S) save();
    const sv = S || await loadBest(SAVE_KEY); if (!sv) return;
    $('codeTitle').textContent = '📦 備份存檔碼';
    $('codeHow').innerHTML = '把下面這一整串複製起來(傳給自己、存在備忘錄)。<br>換手機、或 iPhone 主畫面 App 跟 Safari 之間,用「📥 輸入存檔碼」貼上就能接著玩。';
    $('codeText').value = await encodeSave(sv); $('codeText').readOnly = true;
    $('codeGo').textContent = '複製';
  } else {
    $('codeTitle').textContent = '📥 輸入存檔碼';
    $('codeHow').innerHTML = `把存檔碼整串貼在下面。<b>會蓋掉「${esc(currentProfile().name)}」現在的公司。</b>`;
    $('codeText').value = ''; $('codeText').readOnly = false;
    $('codeGo').textContent = '讀取這個存檔';
  }
  $('codeBox').classList.add('on');
}
$('backupBtn').addEventListener('click', () => openCode('backup'));
$('restoreBtn').addEventListener('click', () => openCode('restore'));
$('codeClose').addEventListener('click', () => $('codeBox').classList.remove('on'));
$('codeGo').addEventListener('click', async () => {
  const ta = $('codeText');
  if (codeMode === 'backup') {
    ta.focus(); ta.select();
    let ok = false;
    try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
    $('codeMsg').textContent = ok ? '✅ 複製好了!' : '請長按上面的文字 → 全選 → 拷貝';
    return;
  }
  try {
    const sv = await decodeSave(ta.value);
    const cur = await loadBest(SAVE_KEY);
    if (cur && !confirm(`要用存檔碼裡的公司(第 ${sv.week} 週)蓋掉現在的公司(第 ${cur.week} 週)嗎?`)) return;
    sv.savedAt = Date.now();
    const r = saveBoth(SAVE_KEY, sv);
    if (!r.ls && !(await r.idb)) throw new Error('這台裝置存不下,空間滿了');
    $('codeMsg').textContent = `✅ 讀到了!第 ${sv.week} 週的「${sv.company}」`;
    await refreshStart();
    setTimeout(() => $('codeBox').classList.remove('on'), 900);
  } catch (e) { $('codeMsg').textContent = '❌ ' + e.message; }
});

requestAnimationFrame(frame);

// 開發用:自動玩家、快轉
if (import.meta.env.DEV) window.AS = {
  get S() { return S; }, actors, cam, view, E, D, render, save, boot, showEnding, openEvent, refreshStart, loadBest: () => loadBest(SAVE_KEY),
  next() { $('nextBtn').click(); }, closeReport() { $('repGo').click(); },
  // 窗格在背景時 requestAnimationFrame 不跑:手動推進 sec 秒的畫格
  tick(sec = 1) { const t0 = performance.now(); for (let t = 0; t < sec; t += 0.05) { step(0.05); updateBubbles(t0 + t * 1000); } draw(t0 + sec * 1000); updateBubbles(t0 + sec * 1000); },
};
