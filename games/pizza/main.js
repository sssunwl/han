import '../../shared/offline.js';
import { saveKey } from '../../shared/profile.js';
import {
  ME, readJSON, writeJSON, tone, noise, fanfare, fitCanvas, renderWho, lockGestures,
  snapshot, saveShot, renderGallery,
} from '../../shared/kit.js';

/* ============================================================
   畫 Pizza
   純創作、沒有對錯、沒有分數。做完會幫它取名字,存進自己的相簿。
   座標一律存成「以 pizza 中心為原點、半徑 = 1」,轉向或換螢幕大小都不會跑掉。
   ============================================================ */

const GALLERY_KEY = saveKey('pizza', 'gallery');
const STATS_KEY = saveKey('pizza', 'stats');
const BAKE_TIME = 3.2;

const TOPPINGS = {
  pepperoni: { name: '臘腸', gap: 0.32 },
  pepper: { name: '青椒', gap: 0.26 },
  mushroom: { name: '蘑菇', gap: 0.28 },
  pineapple: { name: '鳳梨', gap: 0.26 },
  shrimp: { name: '蝦子', gap: 0.32 },
  corn: { name: '玉米', gap: 0.15 },
};

const $ = id => document.getElementById(id);
const cv = $('cv');
let view, ctx;

lockGestures();
renderWho($('who'), '在做');
renderGallery(GALLERY_KEY, $('gallery'), $('galleryEmpty'));

// ---------- 狀態 ----------
let phase = 'idle';             // make | bake | done | idle
let items = [];                 // { k:'sauce'|'cheese'|topping, g, ... }
let group = 0;
let tool = 'sauce';
let stroke = null, lastPlace = null;
let bake = 0;                   // 0 生 → 1 烤好
let P = { x: 0, y: 0, R: 1 };   // pizza 在畫面上的位置
let last = 0;

function reset() {
  items = []; group = 0; bake = 0; stroke = null;
  phase = 'make';
  document.body.classList.remove('baking');
  $('status').textContent = '做一個你的 Pizza';
}

function layout(v) {
  // 盤子比餅皮大 1.13 倍,要整個塞得進畫面
  const R = Math.min(v.w, v.h) * 0.43;
  P = { x: v.w / 2, y: v.h / 2 + 4, R };
}

// ---------- 工具 ----------
document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => {
  tool = b.dataset.tool; stroke = null;
  document.querySelectorAll('.tool[data-tool]').forEach(x => x.classList.toggle('on', x === b));
  tone(620, 0.05, 'sine', 0.1);
  hint();
}));

const HINTS = {
  sauce: '用手指塗番茄醬', cheese: '在 Pizza 上滑來滑去撒起司',
};
function hint() {
  $('tip').textContent = phase === 'make' ? (HINTS[tool] || `點一下放${TOPPINGS[tool].name},滑動可以放一排`) : '';
}

$('undoBtn').addEventListener('click', () => {
  if (phase !== 'make' || !items.length) return;
  const g = items[items.length - 1].g;
  items = items.filter(it => it.g !== g);
  tone(300, 0.08, 'sine', 0.12, -100);
});

// ---------- 輸入 ----------
function toPizza(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left - P.x) / P.R, (e.clientY - r.top - P.y) / P.R];
}
const onPizza = (x, y, lim = 0.95) => Math.hypot(x, y) <= lim;

cv.addEventListener('pointerdown', e => {
  if (phase !== 'make') return;
  const [x, y] = toPizza(e);
  if (!onPizza(x, y, 1.05)) return;
  cv.setPointerCapture(e.pointerId);
  group++;
  if (tool === 'sauce') {
    stroke = { k: 'sauce', g: group, pts: [[x, y]] };
    items.push(stroke);
    noise(0.12, 0.04, 400);
  } else if (tool === 'cheese') {
    sprinkleCheese(x, y); lastCheesePt = [x, y];
  } else {
    place(x, y);
  }
});
cv.addEventListener('pointermove', e => {
  if (phase !== 'make' || !cv.hasPointerCapture(e.pointerId)) return;
  const [x, y] = toPizza(e);
  if (stroke) {
    const p = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(x - p[0], y - p[1]) > 0.02) stroke.pts.push([x, y]);
  } else if (tool === 'cheese') {
    // 手指滑很快時 pointermove 很稀疏,沿著路徑補撒,才不會只撒在頭尾
    const [lx, ly] = lastCheesePt, d = Math.hypot(x - lx, y - ly);
    for (let t = 0.07; t < d; t += 0.07) sprinkleCheese(lx + (x - lx) * t / d, ly + (y - ly) * t / d);
    if (d >= 0.07) lastCheesePt = [x, y];
  } else if (TOPPINGS[tool] && lastPlace) {
    const gap = TOPPINGS[tool].gap;
    while (Math.hypot(x - lastPlace[0], y - lastPlace[1]) > gap) {
      const [lx, ly] = lastPlace, d = Math.hypot(x - lx, y - ly);
      place(lx + (x - lx) * gap / d, ly + (y - ly) * gap / d, true);
    }
  }
});
const up = () => { stroke = null; lastPlace = null; };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);

let lastCheesePt = [0, 0], lastCheeseSound = 0;
function sprinkleCheese(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.16;
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    if (!onPizza(cx, cy, 0.86)) continue;
    items.push({ k: 'cheese', g: group, x: cx, y: cy, rot: Math.random() * Math.PI, len: 0.05 + Math.random() * 0.05 });
  }
  if (items.length > 4000) items.splice(items.findIndex(it => it.k === 'cheese'), 1);
  const now = performance.now();
  if (now - lastCheeseSound > 60) { lastCheeseSound = now; noise(0.04, 0.025, 2500); }
}

function place(x, y, quiet) {
  if (!onPizza(x, y, 0.85)) {                      // 放到餅皮外面就往裡面拉一點
    const d = Math.hypot(x, y) || 1;
    x = x / d * 0.85; y = y / d * 0.85;
  }
  items.push({ k: tool, g: group, x, y, rot: Math.random() * Math.PI * 2, s: 0.9 + Math.random() * 0.2 });
  lastPlace = [x, y];
  if (!quiet || Math.random() < 0.5) tone(380 + Math.random() * 200, 0.07, 'sine', 0.16, 120);
}

// ---------- 烤 ----------
$('bakeBtn').addEventListener('click', () => {
  if (phase !== 'make') return;
  if (!items.length) { $('tip').textContent = '先放一點東西上去吧!'; tone(220, 0.1, 'square', 0.06); return; }
  phase = 'bake'; bake = 0; stroke = null;
  document.body.classList.add('baking');
  $('status').textContent = '烤烤烤…';
  $('tip').textContent = '';
  noise(0.6, 0.05, 300);
});

function finishBake() {
  phase = 'done';
  $('status').textContent = '烤好了!';
  tone(1568, 0.5, 'sine', 0.2); setTimeout(() => tone(1568, 0.4, 'sine', 0.12), 180);   // 叮!
  draw(performance.now());
  const shot = snapshot(cv, { x: P.x - P.R * 1.05, y: P.y - P.R * 1.05, w: P.R * 2.1, h: P.R * 2.1 }, view.dpr);
  saveShot(GALLERY_KEY, shot);
  const stats = readJSON(STATS_KEY, { made: 0 });
  stats.made++; writeJSON(STATS_KEY, stats);
  setTimeout(() => {
    $('shot').src = shot;
    $('overTitle').textContent = `叮!「${pizzaName()}」烤好了`;
    $('overText').innerHTML = `${summary()}<br>${ME.name} 已經做了 ${stats.made} 個 Pizza`;
    $('overScreen').classList.add('on');
    fanfare();
  }, 900);
}

/** 依照放了什麼幫 Pizza 取名字 —— 小孩最愛看這個 */
function pizzaName() {
  const cnt = {};
  for (const it of items) if (TOPPINGS[it.k]) cnt[it.k] = (cnt[it.k] || 0) + 1;
  const kinds = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const cheese = items.filter(it => it.k === 'cheese').length;
  const sauce = items.some(it => it.k === 'sauce');
  if (!kinds.length) return cheese > 200 ? '起司瀑布 Pizza' : sauce ? '瑪格麗特 Pizza' : '神秘 Pizza';
  if (cnt.pineapple && (cnt.shrimp || cnt.pepperoni) && kinds.length <= 3) return '夏威夷 Pizza';
  if (cnt.shrimp && kinds.length <= 2) return '海鮮 Pizza';
  if (kinds.length >= 5) return '什麼都有 Pizza';
  if (kinds.length >= 3) return '總匯 Pizza';
  const top = TOPPINGS[kinds[0]].name;
  if (cnt[kinds[0]] >= 15) return `超級多${top} Pizza`;
  return `${top} Pizza`;
}
function summary() {
  const cnt = {};
  for (const it of items) if (TOPPINGS[it.k]) cnt[it.k] = (cnt[it.k] || 0) + 1;
  const parts = Object.keys(cnt).map(k => `${TOPPINGS[k].name} ${cnt[k]} 個`);
  return parts.length ? `放了 ${parts.join('、')}` : '簡單就是美味';
}

// ---------- 畫面 ----------
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;

function draw(now) {
  const { w, h } = view;
  ctx.clearRect(0, 0, w, h);

  // 烤的時候整個畫面變成烤箱的橘光
  if (phase === 'bake' || phase === 'done') {
    const glow = phase === 'bake' ? 0.25 + 0.08 * Math.sin(now / 90) : 0.12 * (1 - Math.min(1, (now - doneAt) / 800));
    const g = ctx.createRadialGradient(P.x, P.y, P.R * 0.5, P.x, P.y, Math.max(w, h));
    g.addColorStop(0, `rgba(255,140,40,${glow})`); g.addColorStop(1, `rgba(200,60,10,${glow * 1.4})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  ctx.save();
  ctx.translate(P.x, P.y);
  const R = P.R, b = bake;

  // 盤子
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  circle(0, R * 0.05, R * 1.08); ctx.fill();

  // 餅皮:邊緣會膨起來、烤上色
  const crust = mix([240, 214, 160], [214, 140, 60], b);
  const g = ctx.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.6, 0, 0, R);
  g.addColorStop(0, mix([246, 226, 182], [236, 190, 120], b));
  g.addColorStop(0.86, mix([243, 220, 172], [228, 170, 96], b));
  g.addColorStop(0.92, crust);
  g.addColorStop(1, mix([226, 196, 140], [176, 104, 40], b));
  ctx.fillStyle = g;
  circle(0, 0, R); ctx.fill();
  if (b > 0.5) {                                    // 烤出來的焦斑
    ctx.fillStyle = `rgba(120,60,20,${(b - 0.5) * 0.5})`;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39, d = R * 0.94;
      circle(Math.cos(a) * d, Math.sin(a) * d, R * (0.015 + (i % 3) * 0.008)); ctx.fill();
    }
  }

  ctx.save();
  circle(0, 0, R * 0.9); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // 番茄醬
  ctx.strokeStyle = mix([214, 58, 37], [180, 40, 22], b);
  ctx.lineWidth = R * 0.22;
  for (const it of items) if (it.k === 'sauce') { pathPts(it.pts, R); ctx.stroke(); }

  // 起司:生的是一條一條,烤了會融成一片
  const shreds = items.filter(it => it.k === 'cheese');
  if (b > 0.2 && shreds.length) {
    const melt = (b - 0.2) / 0.8;
    ctx.fillStyle = mix([250, 228, 140], [247, 196, 70], melt);
    for (const it of shreds) { circle(it.x * R, it.y * R, R * (0.02 + 0.05 * melt)); ctx.fill(); }
    if (melt > 0.6) {                               // 起司的焦點
      ctx.fillStyle = `rgba(190,110,30,${(melt - 0.6) * 0.8})`;
      for (let i = 0; i < shreds.length; i += 9) {
        const it = shreds[i]; circle(it.x * R + R * 0.02, it.y * R, R * 0.018); ctx.fill();
      }
    }
  }
  if (b < 0.7) {
    ctx.strokeStyle = `rgba(253,236,170,${1 - Math.max(0, b - 0.2) / 0.5})`;
    ctx.lineWidth = R * 0.022;
    for (const it of shreds) {
      const dx = Math.cos(it.rot) * it.len * R / 2, dy = Math.sin(it.rot) * it.len * R / 2;
      ctx.beginPath(); ctx.moveTo(it.x * R - dx, it.y * R - dy); ctx.lineTo(it.x * R + dx, it.y * R + dy); ctx.stroke();
    }
  }

  // 配料
  for (const it of items) if (TOPPINGS[it.k]) drawTopping(it, R, b);
  ctx.restore();

  // 烤好切成 8 片
  if (phase === 'done') {
    const t = Math.min(1, (now - doneAt) / 500);
    ctx.strokeStyle = 'rgba(120,70,30,.45)'; ctx.lineWidth = Math.max(2, R * 0.012);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * R * t, -Math.sin(a) * R * t); ctx.lineTo(Math.cos(a) * R * t, Math.sin(a) * R * t);
      ctx.stroke();
    }
  }

  // 熱氣
  if (phase === 'bake' && b > 0.4) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * R * 0.4, y0 = -R * 0.5 - ((now / 12 + i * 40) % 80);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx.lineTo(x + Math.sin(k + now / 200) * 6, y0 - k * 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTopping(it, R, b) {
  const x = it.x * R, y = it.y * R, s = R * it.s * 1.45;   // 配料大一點,小孩比較好看清楚
  const dark = 1 - b * 0.18;
  ctx.save(); ctx.translate(x, y); ctx.rotate(it.rot);
  switch (it.k) {
    case 'pepperoni': {
      ctx.fillStyle = shade([196, 44, 46], dark);
      circle(0, 0, s * 0.1); ctx.fill();
      ctx.fillStyle = shade([150, 28, 32], dark);
      for (let i = 0; i < 4; i++) { circle(Math.cos(i * 1.7) * s * 0.05, Math.sin(i * 1.7) * s * 0.05, s * 0.014); ctx.fill(); }
      if (b > 0.6) { ctx.strokeStyle = 'rgba(90,20,10,.4)'; ctx.lineWidth = s * 0.012; circle(0, 0, s * 0.1); ctx.stroke(); }
      break;
    }
    case 'pepper': {
      ctx.strokeStyle = shade([60, 160, 70], dark); ctx.lineWidth = s * 0.028; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.075, 0.3, Math.PI * 2 - 0.3); ctx.stroke();
      break;
    }
    case 'mushroom': {
      ctx.fillStyle = shade([226, 206, 176], dark);
      ctx.beginPath(); ctx.arc(0, -s * 0.01, s * 0.08, Math.PI, 0); ctx.lineTo(s * 0.03, -s * 0.01);
      ctx.lineTo(s * 0.03, s * 0.07); ctx.lineTo(-s * 0.03, s * 0.07); ctx.lineTo(-s * 0.03, -s * 0.01); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade([160, 130, 100], dark); ctx.lineWidth = s * 0.01;
      ctx.beginPath(); ctx.arc(0, -s * 0.01, s * 0.06, Math.PI + 0.3, -0.3); ctx.stroke();
      break;
    }
    case 'pineapple': {
      ctx.fillStyle = shade([250, 214, 70], dark);
      ctx.beginPath(); ctx.moveTo(-s * 0.07, s * 0.05); ctx.lineTo(0, -s * 0.07); ctx.lineTo(s * 0.07, s * 0.05);
      ctx.quadraticCurveTo(0, s * 0.09, -s * 0.07, s * 0.05); ctx.fill();
      ctx.fillStyle = shade([230, 180, 40], dark); circle(0, s * 0.02, s * 0.012); ctx.fill();
      break;
    }
    case 'shrimp': {
      ctx.strokeStyle = shade([246, 140, 110], dark); ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.06, 0.2, Math.PI * 1.4); ctx.stroke();
      ctx.strokeStyle = shade([255, 210, 190], dark); ctx.lineWidth = s * 0.008;
      for (let i = 0; i < 4; i++) {
        const a = 0.5 + i * 0.6;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.04, Math.sin(a) * s * 0.04); ctx.lineTo(Math.cos(a) * s * 0.085, Math.sin(a) * s * 0.085); ctx.stroke();
      }
      ctx.fillStyle = shade([220, 70, 50], dark);
      ctx.beginPath(); ctx.moveTo(Math.cos(0.2) * s * 0.06, Math.sin(0.2) * s * 0.06);
      ctx.lineTo(s * 0.1, s * 0.05); ctx.lineTo(s * 0.06, s * 0.08); ctx.fill();
      break;
    }
    case 'corn': {
      ctx.fillStyle = shade([255, 214, 60], dark);
      for (let i = 0; i < 3; i++) { circle(Math.cos(i * 2.1) * s * 0.025, Math.sin(i * 2.1) * s * 0.025, s * 0.022); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

function shade(c, k) { return `rgb(${c.map(v => Math.round(v * k)).join(',')})`; }
function pathPts(pts, R) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0] * R, p[1] * R) : ctx.moveTo(p[0] * R, p[1] * R));
  if (pts.length === 1) ctx.lineTo(pts[0][0] * R + 0.1, pts[0][1] * R);
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }

let doneAt = 0;
function step(dt) {
  if (phase === 'bake') {
    bake = Math.min(1, bake + dt / BAKE_TIME);
    if (Math.random() < dt * 4) noise(0.08, 0.02, 1800);    // 滋滋聲
    if (bake >= 1) { doneAt = performance.now(); finishBake(); }
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (phase !== 'idle') { step(dt); draw(now); }
  requestAnimationFrame(loop);
}

// ---------- 畫面切換 ----------
function show(id) {
  for (const s of ['startScreen', 'gameScreen', 'overScreen']) $(s).classList.toggle('on', s === id);
}
function start() {
  show('gameScreen');
  if (!view) { view = fitCanvas(cv, layout); ctx = view.ctx; } else layout(view);
  reset(); hint();
  tone(440, 0.08, 'triangle', 0.15);
}
function goHome() {
  phase = 'idle';
  renderGallery(GALLERY_KEY, $('gallery'), $('galleryEmpty'));
  show('startScreen');
}
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('backBtn').addEventListener('click', goHome);
$('homeBtn').addEventListener('click', goHome);

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉
if (import.meta.env.DEV) window.PZ = {
  items: () => items, P: () => P,
  advance(sec) { for (let t = 0; t < sec; t += 0.05) step(0.05); draw(performance.now()); },
};
requestAnimationFrame(loop);
