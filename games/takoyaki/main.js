import '../../shared/offline.js';
import { saveKey } from '../../shared/profile.js';
import {
  ME, readJSON, writeJSON, tone, noise, fanfare, fitCanvas, renderWho, lockGestures,
  snapshot, saveShot, renderGallery,
} from '../../shared/kit.js';

/* ============================================================
   章魚燒
   一根手指就能玩:同一個洞一直點,會依序「倒麵糊 → 放章魚 → 翻面 → 夾起來」。
   難的不是操作,是時機:9 個洞同時在烤,要顧好每一顆。
   失敗也不扣分到零 —— 生的、焦的都還是章魚燒,只是星星少一點。
   ============================================================ */

const GOAL = 8;                 // 一舟 8 顆
const COOK_TIME = 6;            // 一面從生到剛好金黃(cook=1)要幾秒
const READY = 0.55, BURNT = 1.25;          // 綠圈的範圍
const PERFECT_LO = 0.7, PERFECT_HI = 1.1;

const GALLERY_KEY = saveKey('takoyaki', 'gallery');
const STATS_KEY = saveKey('takoyaki', 'stats');

const $ = id => document.getElementById(id);
const cv = $('cv');
let view, ctx;

lockGestures();
renderWho($('who'), '在做');
renderGallery(GALLERY_KEY, $('gallery'), $('galleryEmpty'));

// ---------- 顏色:生 → 金黃 → 焦 ----------
const STOPS = [
  [0, [246, 226, 179]], [0.55, [236, 190, 110]], [0.85, [222, 150, 66]],
  [1.15, [190, 112, 40]], [1.5, [110, 62, 24]], [2.2, [52, 32, 18]],
];
function doneRGB(c) {
  if (c <= 0) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    if (c <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      const t = (c - a) / (b - a);
      return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const rgb = (a, k = 1) => `rgb(${a.map(v => Math.round(v * k)).join(',')})`;

function rate(c) {
  if (c < READY) return { s: 1, label: '生' };
  if (c > BURNT) return { s: 1, label: '焦' };
  if (c >= PERFECT_LO && c <= PERFECT_HI) return { s: 3, label: '金黃' };
  return { s: 2, label: '金黃' };
}

// ---------- 狀態 ----------
let phase = 'idle';            // cook | deco | idle
let cells = [];                // { state:'empty'|'s1'|'s2', tako, c1, c2, flip }
let boat = [];                 // { c1, c2, score, label, tako }
let flyers = [], smokes = [], pops = [];
let L = {};                    // 版面
let last = 0;

function newRound() {
  cells = Array.from({ length: 9 }, () => ({ state: 'empty', tako: false, c1: 0, c2: 0, flip: 0 }));
  boat = []; flyers = []; smokes = []; pops = []; deco = [];
  phase = 'cook';
  $('phaseTitle').textContent = '做章魚燒';
  $('tools').style.display = 'none';
  updateHud();
}

// ---------- 版面 ----------
function layout(v) {
  const { w, h } = v;
  const land = w > h * 1.05;
  if (land) {
    // 橫放:上面留 34px 給提示字,船改成直立的放右邊
    const pan = Math.min(h - 44, w * 0.56);
    const py = 34 + (h - 34 - pan) / 2;
    L.pan = { x: w * 0.04 + (w * 0.58 - pan) / 2, y: py, s: pan };
    const bh = Math.min(pan, (w * 0.3) / 0.55), bw = bh * 0.55;
    L.boat = { x: w * 0.62 + (w * 0.36 - bw) / 2, y: py + (pan - bh) / 2, w: bw, h: bh };
  } else {
    const pan = Math.min(w * 0.92, h * 0.62);
    const bw = Math.min(w * 0.8, pan * 0.95), bh = bw * 0.5, gap = 24;
    // 鍋子 + 船整組垂直置中,上面留位置給提示字
    const top = Math.max(36, (h - pan - gap - bh) / 2);
    L.pan = { x: (w - pan) / 2, y: top, s: pan };
    L.boat = { x: (w - bw) / 2, y: top + pan + gap, w: bw, h: bh };
  }
  const p = L.pan, gap = p.s / 3;
  L.r = gap * 0.36;
  L.holes = [];
  for (let i = 0; i < 9; i++) {
    L.holes.push({ x: p.x + gap * (i % 3 + 0.5), y: p.y + gap * (Math.floor(i / 3) + 0.5) });
  }
  // 裝飾階段:船放大置中
  // 裝飾階段:船放大置中。直式螢幕就把船也轉成直的(2 欄 × 4 列)
  let dw, dh;
  if (w >= h) { dw = Math.min(w * 0.9, (h - 50) / 0.55); dh = dw * 0.55; }
  else { dh = Math.min(h * 0.82, (w * 0.86) / 0.55); dw = dh * 0.55; }
  L.deco = { x: (w - dw) / 2, y: (h - dh) / 2 + 14, w: dw, h: dh };
}

function boatSlots(b) {
  const cols = b.w >= b.h ? 4 : 2, rows = GOAL / cols;
  const pad = Math.min(b.w, b.h) * 0.08, cw = (b.w - pad * 2) / cols, ch = (b.h - pad * 2) / rows;
  const r = Math.min(cw, ch) * 0.46, out = [];
  for (let i = 0; i < GOAL; i++) {
    out.push({ x: b.x + pad + cw * (i % cols + 0.5), y: b.y + pad + ch * (Math.floor(i / cols) + 0.5), r });
  }
  return out;
}

// ---------- 點擊 ----------
function activeCount() { return cells.filter(c => c.state !== 'empty').length; }

function tapCell(i) {
  const c = cells[i];
  const h = L.holes[i];
  if (c.state === 'empty') {
    if (boat.length + activeCount() >= GOAL) { say('夠了!先把烤好的夾起來'); tone(220, 0.1, 'square', 0.08); return; }
    Object.assign(c, { state: 's1', tako: false, c1: 0, c2: 0 });
    noise(0.35, 0.07, 900);
    pop(h, '倒麵糊', '#c98a3a');
  } else if (c.state === 's1' && !c.tako) {
    c.tako = true;
    tone(330, 0.09, 'sine', 0.2, 200);
    pop(h, '🐙', null);
  } else if (c.state === 's1') {
    c.state = 's2'; c.flip = 1;
    tone(520, 0.08, 'triangle', 0.18, 300);
    const r = rate(c.c1);
    pop(h, r.label === '金黃' ? '翻!' : r.label === '生' ? '還太生…' : '有點焦', r.label === '金黃' ? '#2fae5b' : '#c0573a');
  } else if (c.state === 's2') {
    if (boat.length >= GOAL) return;
    const r1 = rate(c.c1), r2 = rate(c.c2);
    let score = (r1.s + r2.s) / 2 - (c.tako ? 0 : 1);
    score = Math.max(1, score);
    const label = r1.label === '焦' || r2.label === '焦' ? '焦' : r1.label === '生' || r2.label === '生' ? '生' : '金黃';
    const item = { c1: c.c1, c2: c.c2, score, label, tako: c.tako };
    const slot = boatSlots(L.boat)[boat.length];
    boat.push(item);
    flyers.push({ from: { ...h }, to: slot, t: 0, item, idx: boat.length - 1 });
    c.state = 'empty';
    tone(score >= 2.5 ? 880 : 660, 0.12, 'triangle', 0.18);
    if (!c.tako) pop(h, '忘了放章魚!', '#c0573a');
    updateHud();
    if (boat.length >= GOAL) setTimeout(startDeco, 700);
  }
}

function say(text) { $('tip').textContent = text; sayUntil = performance.now() + 1800; }
let sayUntil = 0;
function pop(at, text, color) { pops.push({ x: at.x, y: at.y - L.r, text, color, t: 0 }); }

function updateHud() {
  $('count').textContent = `${boat.length} / ${GOAL}`;
}

function autoTip() {
  if (performance.now() < sayUntil) return;
  let t = '';
  if (phase === 'cook') {
    const st = cells.map(c => c.state);
    // 越急的事越先講:要焦了 > 可以動手了 > 還沒放章魚
    if (st.every(s => s === 'empty') && boat.length === 0) t = '點一個洞,倒麵糊';
    else if (cells.some(c => c.state !== 'empty' && c.tako && cur(c) > BURNT)) t = '快!有一顆要焦了';
    else if (cells.some(c => c.state !== 'empty' && c.tako && cur(c) >= READY)) t = '圈圈綠了 → 點它!';
    else if (cells.some(c => c.state === 's1' && !c.tako)) t = '再點一下,放章魚 🐙';
    else if (boat.length + activeCount() < GOAL) t = '還可以再倒幾個洞';
    else t = '等它烤…';
  } else if (phase === 'deco') {
    t = '用手指在章魚燒上畫畫';
  }
  $('tip').textContent = t;
}
const cur = c => c.state === 's1' ? c.c1 : c.c2;

// ---------- 裝飾 ----------
let deco = [];                 // 座標都存成船的相對位置(0~1),換方向也不會亂掉
let tool = 'sauce', stroke = null;

function startDeco() {
  phase = 'deco';
  $('phaseTitle').textContent = '淋醬汁';
  $('tools').style.display = '';
  fanfare();
}

document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => {
  tool = b.dataset.tool; stroke = null;
  document.querySelectorAll('.tool[data-tool]').forEach(x => x.classList.toggle('on', x === b));
  tone(600, 0.05, 'sine', 0.1);
}));

function toBoat(x, y) { const b = L.deco; return [(x - b.x) / b.w, (y - b.y) / b.h]; }

function decoDown(x, y) {
  const [u, v] = toBoat(x, y);
  if (tool === 'sauce' || tool === 'mayo') {
    stroke = { t: tool, pts: [[u, v]] };
    deco.push(stroke);
  } else sprinkle(u, v);
}
function decoMove(x, y) {
  const [u, v] = toBoat(x, y);
  if (stroke) {
    const p = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(u - p[0], v - p[1]) > 0.008) stroke.pts.push([u, v]);
  } else if (tool === 'nori' || tool === 'katsuo') sprinkle(u, v);
}
let lastSprinkle = 0;
function sprinkle(u, v) {
  const now = performance.now();
  if (now - lastSprinkle < 40) return;
  lastSprinkle = now;
  const n = tool === 'nori' ? 6 : 2;
  const spread = Math.min(L.deco.w, L.deco.h) * 0.22;
  for (let i = 0; i < n; i++) {
    deco.push({
      // 散開的範圍用像素算,直的船、橫的船撒起來才一樣圓
      t: tool, u: u + (Math.random() - 0.5) * spread / L.deco.w, v: v + (Math.random() - 0.5) * spread / L.deco.h,
      rot: Math.random() * Math.PI, s: 0.6 + Math.random() * 0.7, ph: Math.random() * 6,
    });
  }
  if (deco.length > 3000) deco.splice(0, deco.length - 3000);
  noise(0.05, 0.03, 3000);
}

$('doneBtn').addEventListener('click', finish);

function finish() {
  if (phase !== 'deco') return;
  phase = 'done';
  draw(performance.now());
  const shot = snapshot(cv, L.deco, view.dpr);
  saveShot(GALLERY_KEY, shot);

  const avg = boat.reduce((s, b) => s + b.score, 0) / boat.length;
  const stars = avg >= 2.6 ? 3 : avg >= 1.8 ? 2 : 1;
  const n = k => boat.filter(b => b.label === k).length;
  const stats = readJSON(STATS_KEY, { plates: 0, best: 0 });
  stats.plates++; stats.best = Math.max(stats.best, stars);
  writeJSON(STATS_KEY, stats);

  $('overTitle').textContent = ['', '做好了!', '好好吃!', '章魚燒大師!'][stars];
  $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('shot').src = shot;
  const parts = [`金黃 ${n('金黃')} 顆`];
  if (n('生')) parts.push(`生生的 ${n('生')} 顆`);
  if (n('焦')) parts.push(`焦焦的 ${n('焦')} 顆`);
  $('overText').innerHTML = parts.join('、') + `<br>${ME.name} 已經做了 ${stats.plates} 盤`;
  show('overScreen');
  fanfare();
}

// ---------- 輸入 ----------
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (phase === 'cook') {
    for (let i = 0; i < 9; i++) {
      const h = L.holes[i];
      if (Math.hypot(x - h.x, y - h.y) < L.r * 1.25) { tapCell(i); return; }
    }
  } else if (phase === 'deco') {
    cv.setPointerCapture(e.pointerId);
    decoDown(x, y);
  }
});
cv.addEventListener('pointermove', e => {
  if (phase !== 'deco' || !e.buttons && e.pointerType === 'mouse') return;
  if (e.pointerType !== 'mouse' && !cv.hasPointerCapture(e.pointerId)) return;
  const r = cv.getBoundingClientRect();
  decoMove(e.clientX - r.left, e.clientY - r.top);
});
const endStroke = () => { stroke = null; };
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);

// ---------- 畫面 ----------
function drawPan() {
  const p = L.pan;
  ctx.fillStyle = '#2b2522';
  roundRect(p.x, p.y, p.s, p.s, p.s * 0.08); ctx.fill();
  ctx.fillStyle = '#3a322e';
  roundRect(p.x + 6, p.y + 6, p.s - 12, p.s - 12, p.s * 0.07); ctx.fill();
}

function drawHole(h) {
  const g = ctx.createRadialGradient(h.x, h.y - L.r * 0.3, L.r * 0.2, h.x, h.y, L.r * 1.05);
  g.addColorStop(0, '#1a1513'); g.addColorStop(1, '#4b423d');
  ctx.fillStyle = g;
  circle(h.x, h.y, L.r * 1.05); ctx.fill();
}

function drawBall(x, y, r, c, tako, squash = 1) {
  const base = doneRGB(c);
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, squash);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, rgb(base, 1.18)); g.addColorStop(0.7, rgb(base)); g.addColorStop(1, rgb(base, 0.72));
  ctx.fillStyle = g;
  circle(0, 0, r); ctx.fill();
  // 表面的小顆粒(天かす)
  ctx.fillStyle = rgb(base, 0.85);
  for (let k = 0; k < 5; k++) {
    const a = k * 2.4 + x * 0.01, d = r * (0.25 + (k % 3) * 0.2);
    circle(Math.cos(a) * d, Math.sin(a) * d, r * 0.08); ctx.fill();
  }
  if (c > 1.6) {                                    // 焦掉的黑點
    ctx.fillStyle = 'rgba(20,10,5,.5)';
    circle(r * 0.2, -r * 0.1, r * 0.25); ctx.fill();
  }
  ctx.restore();
}

function drawBatter(h, c) {
  // 第一面:洞裡是一灘麵糊,邊邊先變色
  const edge = doneRGB(c), top = doneRGB(c * 0.35);
  const g = ctx.createRadialGradient(h.x, h.y, L.r * 0.2, h.x, h.y, L.r * 0.98);
  g.addColorStop(0, rgb(top)); g.addColorStop(0.75, rgb(top)); g.addColorStop(1, rgb(edge));
  ctx.fillStyle = g;
  circle(h.x, h.y, L.r * 0.98); ctx.fill();
  // 冒泡
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  const t = performance.now() / 400;
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + t * 0.3 + h.x;
    circle(h.x + Math.cos(a) * L.r * 0.45, h.y + Math.sin(a) * L.r * 0.45, L.r * (0.05 + 0.04 * Math.sin(t + k))); ctx.fill();
  }
}

function drawTako(x, y, r) {
  ctx.fillStyle = '#c2304c';
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
    ctx.rotate(a);
    roundRect(-r * 0.16, -r * 0.1, r * 0.32, r * 0.2, r * 0.08); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f2d0d6';
  circle(x + r * 0.12, y - r * 0.05, r * 0.05); ctx.fill();
}

function drawRing(h, c) {
  const p = Math.min(c / BURNT, 1);
  const col = c > BURNT ? '#e2483d' : c >= READY ? '#2fc46b' : '#ffffff';
  ctx.lineWidth = Math.max(3, L.r * 0.13);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(h.x, h.y, L.r * 1.18, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.beginPath(); ctx.arc(h.x, h.y, L.r * 1.18, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  if (c >= READY && c <= BURNT) {                   // 綠圈時閃一下,提醒可以動手
    const k = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    ctx.strokeStyle = `rgba(80,230,140,${0.35 * k})`;
    ctx.lineWidth = L.r * 0.3;
    ctx.beginPath(); ctx.arc(h.x, h.y, L.r * 1.18, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawBoat(b, scale = 1) {
  // 木頭船
  ctx.fillStyle = '#e8c48c';
  roundRect(b.x - 6 * scale, b.y - 6 * scale, b.w + 12 * scale, b.h + 12 * scale, b.h * 0.2); ctx.fill();
  ctx.fillStyle = '#f6dcae';
  roundRect(b.x, b.y, b.w, b.h, b.h * 0.16); ctx.fill();
  ctx.strokeStyle = 'rgba(160,110,50,.25)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    if (b.w >= b.h) { ctx.moveTo(b.x + 8, b.y + b.h * i / 6); ctx.lineTo(b.x + b.w - 8, b.y + b.h * i / 6); }
    else { ctx.moveTo(b.x + b.w * i / 6, b.y + 8); ctx.lineTo(b.x + b.w * i / 6, b.y + b.h - 8); }
    ctx.stroke();
  }
}

function drawBoatBalls(b) {
  const slots = boatSlots(b);
  boat.forEach((it, i) => {
    if (flyers.some(f => f.idx === i)) return;
    const s = slots[i];
    drawBall(s.x, s.y, s.r, (it.c1 + it.c2) / 2, it.tako);
  });
  if (phase === 'cook') {
    for (let i = boat.length; i < GOAL; i++) {
      const s = slots[i];
      ctx.strokeStyle = 'rgba(160,110,50,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      circle(s.x, s.y, s.r * 0.9); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

function drawDeco(now) {
  const b = L.deco, k = Math.min(b.w, b.h) * 1.8;
  ctx.save();
  // 醬汁只能畫在船上
  roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, b.h * 0.16); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of deco) {
    if (d.pts) {
      const pts = d.pts;
      if (d.t === 'sauce') {
        ctx.strokeStyle = '#5a2f17'; ctx.lineWidth = k * 0.04;
        path(pts, b); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,180,.25)'; ctx.lineWidth = k * 0.012;  // 醬汁的反光
        path(pts.map(p => [p[0] - 0.004, p[1] - 0.012]), b); ctx.stroke();
      } else {
        ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = k * 0.014;
        path(pts, b); ctx.stroke();
      }
    }
  }
  for (const d of deco) {
    if (d.pts) continue;
    const x = b.x + d.u * b.w, y = b.y + d.v * b.h;
    if (d.t === 'nori') {
      ctx.fillStyle = '#3e7d34';
      ctx.fillRect(x, y, k * 0.009 * d.s, k * 0.009 * d.s);
    } else {
      // 柴魚片會「跳舞」—— 熱氣讓它一直扭
      const wob = Math.sin(now / 260 + d.ph) * 0.35;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot + wob);
      ctx.fillStyle = '#e9b9a0';
      ctx.beginPath();
      const s = k * 0.03 * d.s;
      ctx.moveTo(-s, -s * 0.3); ctx.quadraticCurveTo(0, -s * 0.7, s, -s * 0.2);
      ctx.lineTo(s * 0.8, s * 0.35); ctx.quadraticCurveTo(0, s * 0.1, -s * 0.9, s * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(170,90,60,.35)'; ctx.fillRect(-s * 0.5, -s * 0.05, s, s * 0.08);
      ctx.restore();
    }
  }
  ctx.restore();
}
function path(pts, b) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = b.x + p[0] * b.w, y = b.y + p[1] * b.h;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  if (pts.length === 1) ctx.lineTo(b.x + pts[0][0] * b.w + 0.1, b.y + pts[0][1] * b.h);
}

function draw(now) {
  const { w, h } = view;
  ctx.clearRect(0, 0, w, h);
  if (phase === 'cook' || phase === 'idle') {
    drawPan();
    cells.forEach((c, i) => {
      const hl = L.holes[i];
      drawHole(hl);
      if (c.state === 's1') {
        drawBatter(hl, c.c1);
        if (c.tako) drawTako(hl.x, hl.y, L.r);
      } else if (c.state === 's2') {
        const sq = 1 - 0.8 * Math.sin(Math.PI * c.flip);  // 翻面時壓扁再彈回來
        drawBall(hl.x, hl.y, L.r * 0.96, c.c1, c.tako, Math.max(0.2, sq));
      }
      if (c.state !== 'empty') drawRing(hl, cur(c));
    });
    drawBoat(L.boat);
    drawBoatBalls(L.boat);
    for (const f of flyers) {
      const t = easeOut(Math.min(f.t, 1));
      const x = f.from.x + (f.to.x - f.from.x) * t;
      const y = f.from.y + (f.to.y - f.from.y) * t - Math.sin(Math.PI * t) * 60;
      const r = L.r + (f.to.r - L.r) * t;
      drawBall(x, y, r, (f.item.c1 + f.item.c2) / 2, f.item.tako);
    }
  } else {
    drawBoat(L.deco, 1.5);
    drawBoatBalls(L.deco);
    drawDeco(now);
  }
  for (const s of smokes) {
    ctx.fillStyle = `rgba(90,80,75,${0.35 * (1 - s.t)})`;
    circle(s.x, s.y - s.t * 50, L.r * (0.3 + s.t * 0.5)); ctx.fill();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pops) {
    ctx.globalAlpha = 1 - p.t;
    ctx.font = `bold ${Math.max(14, L.r * 0.45)}px "PingFang TC",sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeText(p.text, p.x, p.y - p.t * 30);
    ctx.fillStyle = p.color || '#3a2c22';
    ctx.fillText(p.text, p.x, p.y - p.t * 30);
    ctx.globalAlpha = 1;
  }
}

function step(dt) {
  if (phase === 'cook') {
    for (let i = 0; i < 9; i++) {
      const c = cells[i];
      if (c.state === 's1') c.c1 += dt / COOK_TIME;
      if (c.state === 's2') c.c2 += dt / COOK_TIME;
      if (c.flip > 0) c.flip = Math.max(0, c.flip - dt * 4);
      if (c.state !== 'empty' && cur(c) > BURNT + 0.2 && Math.random() < dt * 3) {
        const h = L.holes[i];
        smokes.push({ x: h.x + (Math.random() - 0.5) * L.r, y: h.y, t: 0 });
      }
    }
  }
  for (const f of flyers) f.t += dt * 2.2;
  flyers = flyers.filter(f => f.t < 1);
  for (const s of smokes) s.t += dt * 0.9;
  smokes = smokes.filter(s => s.t < 1);
  for (const p of pops) p.t += dt * 1.3;
  pops = pops.filter(p => p.t < 1);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (phase !== 'idle' && phase !== 'done') { step(dt); autoTip(); draw(now); }
  requestAnimationFrame(loop);
}

// ---------- 小工具 ----------
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const easeOut = t => 1 - (1 - t) * (1 - t);

// ---------- 畫面切換 ----------
function show(id) {
  for (const s of ['startScreen', 'gameScreen', 'overScreen']) $(s).classList.toggle('on', s === id || (id === 'overScreen' && s === 'gameScreen'));
}
function start() {
  show('gameScreen');
  if (!view) { view = fitCanvas(cv, layout); ctx = view.ctx; }
  else layout(view);
  newRound();
  tone(440, 0.08, 'triangle', 0.15);
}
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('backBtn').addEventListener('click', goHome);
$('homeBtn').addEventListener('click', goHome);
function goHome() {
  phase = 'idle';
  renderGallery(GALLERY_KEY, $('gallery'), $('galleryEmpty'));
  show('startScreen');
}

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉時間來測
if (import.meta.env.DEV) window.TK = {
  cells: () => cells, boat: () => boat, finish, startDeco, tapCell, decoDown, decoMove, L: () => L,
  advance(sec) { for (let t = 0; t < sec; t += 0.05) step(0.05); autoTip(); draw(performance.now()); },
};
requestAnimationFrame(loop);
