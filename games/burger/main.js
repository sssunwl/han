import '../../shared/offline.js';
import { getProfiles } from '../../shared/profile.js';
import {
  ME, readJSON, recordBest, tone, noise, fanfare, fitCanvas, renderWho, lockGestures, snapshot, escapeHTML,
} from '../../shared/kit.js';

/* ============================================================
   疊漢堡
   食材在上面左右擺動,點一下掉下來。對得準就疊上去,偏太多就滑掉。
   掉 3 次自動蓋上麵包 —— 不管疊幾層,最後一定會得到一個漢堡,不會「什麼都沒有」。
   排行榜(burger:best)所有玩家共用,同一台裝置上大家一起比。
   ============================================================ */

const BEST_KEY = 'burger:best';
const HEARTS = 3;
const G = 2600;                  // 掉落重力 px/s²

// 食材:h / w 都是「漢堡寬度 W」的倍數
const KINDS = {
  bunBottom: { h: 0.2, w: 1.0 },
  patty: { h: 0.17, w: 0.96, name: '肉排' },
  cheese: { h: 0.05, w: 1.02, name: '起司' },
  lettuce: { h: 0.08, w: 1.08, name: '生菜' },
  tomato: { h: 0.08, w: 0.9, name: '番茄' },
  onion: { h: 0.06, w: 0.88, name: '洋蔥' },
  egg: { h: 0.09, w: 0.92, name: '荷包蛋' },
  bacon: { h: 0.06, w: 1.0, name: '培根' },
  bunTop: { h: 0.36, w: 1.0 },
};
const BAG = ['patty', 'patty', 'cheese', 'cheese', 'lettuce', 'lettuce', 'tomato', 'onion', 'egg', 'bacon'];

const $ = id => document.getElementById(id);
const cv = $('cv');
let view, ctx;

lockGestures();
renderWho($('who'), '在疊');
renderBoard($('board'));

// ---------- 狀態 ----------
let phase = 'idle';              // play | ending | done | idle
let W = 200, cx = 0, baseY = 0;
let stack = [], mover = null, faller = null, tumbles = [], pops = [];
let hearts = HEARTS, layers = 0, perfects = 0, combo = 0;
let camY = 0, camTarget = 0, scale = 1, scaleTarget = 1;
let lastKind = '', t = 0, last = 0;

function layout(v) {
  const oldCx = cx;
  W = Math.min(v.w * 0.52, 230, v.h * 0.4);
  cx = v.w / 2;
  baseY = v.h - 46;
  // 換方向時整座塔跟著水平移
  if (oldCx) for (const p of stack) p.x += cx - oldCx;
}

const topY = () => stack.reduce((s, p) => s + p.h, 0);
const top = () => stack[stack.length - 1];

function newGame() {
  stack = [piece('bunBottom', cx, 0)];
  mover = null; faller = null; tumbles = []; pops = [];
  hearts = HEARTS; layers = 0; perfects = 0; combo = 0;
  camY = camTarget = 0; scale = scaleTarget = 1;
  phase = 'play';
  $('capBtn').classList.remove('on');
  $('tip').style.display = '';
  hud();
  spawn();
}

function piece(kind, x, y) {
  const k = KINDS[kind];
  return { kind, x, y, w: k.w * W, h: k.h * W, bounce: 0 };
}

function spawn() {
  let kind;
  do { kind = BAG[Math.floor(Math.random() * BAG.length)]; } while (kind === lastKind);
  lastKind = kind;
  mover = { ...piece(kind, cx, 0), ph: Math.random() * Math.PI * 2 };
}

// 擺動速度:越疊越快一點,但有上限,小孩才跟得上
const speed = () => Math.min(1.5 + layers * 0.07, 3.4);
const dropHeight = () => view.h * 0.32 / scale;

// ---------- 輸入 ----------
function drop() {
  if (phase !== 'play' || !mover || faller) return;
  faller = { ...mover, y: topY() + dropHeight(), vy: 0 };
  mover = null;
  $('tip').style.display = 'none';
  tone(500, 0.06, 'sine', 0.12, -150);
}
cv.addEventListener('pointerdown', drop);
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); drop(); } });
$('capBtn').addEventListener('click', () => { if (phase === 'play') cap(); });

// ---------- 物理 ----------
function step(dt) {
  t += dt;
  if (mover) {
    mover.ph += speed() * dt;
    // 擺動幅度有上限:橫放的寬螢幕上不然會橫越整個畫面,根本對不準
    const A = Math.max(20, Math.min((view.w - mover.w) / 2 - 10, W * 1.3));
    mover.x = cx + Math.sin(mover.ph) * A;
  }
  if (faller) {
    faller.vy += G * dt;
    faller.y -= faller.vy * dt;
    const ty = topY();
    if (faller.y <= ty) land(faller, ty);
  }
  for (const p of stack) p.bounce = Math.max(0, p.bounce - dt * 3);
  for (const m of tumbles) {
    m.vy += G * 0.6 * dt; m.y -= m.vy * dt; m.x += m.vx * dt; m.rot += m.vr * dt;
  }
  tumbles = tumbles.filter(m => m.y > camY - 600);
  for (const p of pops) p.t += dt * 1.1;
  pops = pops.filter(p => p.t < 1);

  // 鏡頭:塔頂保持在畫面中間偏下
  const ty = topY();
  if (phase === 'play') camTarget = Math.max(0, ty - (baseY - view.h * 0.55));
  camY += (camTarget - camY) * Math.min(1, dt * 5);
  scale += (scaleTarget - scale) * Math.min(1, dt * 4);
}

function land(f, ty) {
  const tp = top();
  const dx = f.x - tp.x;
  // 容許偏移:約 1/3 個漢堡寬。太寬的話擺動範圍內永遠不會掉,就沒有挑戰了(實測過)
  const limit = Math.min(tp.w, f.w) * 0.4;
  faller = null;
  if (f.kind === 'bunTop' || Math.abs(dx) <= limit) {
    const perfect = f.kind !== 'bunTop' && Math.abs(dx) < W * 0.05;
    const p = piece(f.kind, perfect ? tp.x : f.x, ty);
    p.bounce = 1;
    stack.push(p);
    if (f.kind === 'bunTop') { noise(0.15, 0.06, 600); return; }
    layers++;
    if (perfect) {
      perfects++; combo++;
      tone(660 + Math.min(combo, 8) * 80, 0.15, 'triangle', 0.2);
      pop(p.x, ty + p.h, combo > 1 ? `完美 ×${combo}!` : '完美!', '#e8890c');
    } else {
      combo = 0;
      tone(320, 0.1, 'sine', 0.2, 80);
      noise(0.08, 0.04, 800);
    }
    if (layers >= 1) $('capBtn').classList.add('on');
    hud();
    setTimeout(() => { if (phase === 'play') spawn(); }, 220);
  } else {
    // 偏太多:滑下去
    combo = 0; hearts--;
    tumbles.push({ ...f, y: ty, vx: Math.sign(dx) * 160, vy: -200, rot: 0, vr: Math.sign(dx) * 5 });
    tone(260, 0.25, 'sawtooth', 0.08, -150);
    pop(f.x, ty + 40, '掉了!', '#e2483d');
    hud();
    if (hearts <= 0) setTimeout(cap, 650);
    else setTimeout(() => { if (phase === 'play') spawn(); }, 450);
  }
}

function pop(x, y, text, color) { pops.push({ x, y, text, color, t: 0 }); }

function hud() {
  $('layers').textContent = layers;
  $('hearts').textContent = '♥'.repeat(hearts) + '♡'.repeat(HEARTS - hearts);
}

// ---------- 結束:蓋麵包 → 拉遠看整個漢堡 ----------
function cap() {
  if (phase !== 'play') return;
  phase = 'ending';
  mover = null;
  $('capBtn').classList.remove('on');
  const tp = top();
  faller = { ...piece('bunTop', tp.x, 0), y: topY() + dropHeight(), vy: 0 };
  // 等麵包落下後拉遠
  const wait = () => {
    if (faller) return setTimeout(wait, 50);
    const total = topY();
    scaleTarget = Math.min(1, (view.h - 120) / (total + 40));
    camTarget = 0;
    setTimeout(finish, 1300);
  };
  wait();
}

function finish() {
  phase = 'done';
  draw();
  // 截整個漢堡
  const total = topY() * scale;
  const xs = stack.map(p => [toScreenX(p.x - p.w / 2), toScreenX(p.x + p.w / 2)]).flat();
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rect = { x: minX - 20, y: baseY - total - 20, w: maxX - minX + 40, h: total + 50 };
  const shot = snapshot(cv, rect, view.dpr);
  const isNew = recordBest(BEST_KEY, layers);

  $('overTitle').textContent = layers >= 20 ? '超級巨無霸!' : layers >= 10 ? '好高的漢堡!' : '漢堡完成!';
  $('shot').src = shot;
  const names = {};
  for (const p of stack) if (KINDS[p.kind].name) names[p.kind] = (names[p.kind] || 0) + 1;
  const list = Object.keys(names).map(k => `${KINDS[k].name}×${names[k]}`).join('、');
  $('overText').innerHTML = `疊了 <b>${layers}</b> 層` + (perfects ? `,完美 ${perfects} 次` : '') +
    (isNew && layers > 0 ? '<br>🎉 新紀錄!' : '') + (list ? `<br><span style="font-size:13px">${list}</span>` : '');
  renderBoard($('overBoard'));
  $('overScreen').classList.add('on');
  fanfare();
}

function renderBoard(el) {
  const best = readJSON(BEST_KEY, {});
  const people = getProfiles().filter(p => best[p.id] != null).sort((a, b) => best[b.id] - best[a.id]).slice(0, 6);
  el.innerHTML = people.length ? people.map((p, i) => `
    <div class="row ${p.id === ME.id ? 'me' : ''}">
      <span class="rank">${i + 1}</span><span class="face">${p.avatar}</span>
      <span class="nm">${escapeHTML(p.name)}</span><span class="sc">${best[p.id]} 層</span>
    </div>`).join('') : '<div class="empty">還沒有人疊過</div>';
}

// ---------- 畫面 ----------
const toScreenX = x => cx + (x - cx) * scale;
const toScreenY = y => baseY - (y - camY) * scale;

function draw() {
  const { w, h } = view;
  ctx.clearRect(0, 0, w, h);

  // 背景:越疊越高,天空越深
  const alt = Math.min(1, camY / 2500);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixc([200, 234, 255], [120, 150, 230], alt));
  g.addColorStop(1, mixc([236, 248, 255], [200, 210, 250], alt));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // 桌子 + 盤子
  const plateY = toScreenY(0);
  ctx.fillStyle = '#e9c897';
  ctx.fillRect(0, plateY + 8 * scale, w, h);
  ctx.fillStyle = '#fff';
  ellipse(cx, plateY + 6 * scale, W * 0.75 * scale, 14 * scale); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.06)';
  ellipse(cx, plateY + 9 * scale, W * 0.6 * scale, 8 * scale); ctx.fill();

  // 塔會微微晃,越高晃越多(純視覺)
  const sway = phase === 'play' ? Math.sin(t * 1.8) * Math.min(0.025, layers * 0.0012) : 0;
  ctx.save();
  ctx.translate(cx, plateY); ctx.rotate(sway); ctx.translate(-cx, -plateY);
  for (const p of stack) drawPiece(p);
  ctx.restore();

  if (faller) drawPiece(faller);
  if (mover) {
    // 落點預告線:幫小孩對準
    ctx.strokeStyle = 'rgba(60,80,120,.18)'; ctx.setLineDash([5, 6]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(toScreenX(mover.x), toScreenY(topY() + dropHeight())); ctx.lineTo(toScreenX(mover.x), toScreenY(topY())); ctx.stroke();
    ctx.setLineDash([]);
    drawPiece({ ...mover, y: topY() + dropHeight() });
  }
  for (const m of tumbles) {
    ctx.save();
    const sx = toScreenX(m.x), sy = toScreenY(m.y + m.h / 2);
    ctx.translate(sx, sy); ctx.rotate(m.rot); ctx.translate(-sx, -sy);
    drawPiece(m);
    ctx.restore();
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pops) {
    ctx.globalAlpha = 1 - p.t;
    ctx.font = 'bold 22px "PingFang TC",sans-serif';
    const x = toScreenX(p.x), y = toScreenY(p.y) - 20 - p.t * 40;
    ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(p.text, x, y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, x, y);
    ctx.globalAlpha = 1;
  }
}

function drawPiece(p) {
  const pw = p.w * scale, ph = p.h * scale;
  const x = toScreenX(p.x) - pw / 2;
  let y = toScreenY(p.y) - ph;               // 左上角
  let hh = ph;
  if (p.bounce) {                             // 剛落下時壓扁一下
    const sq = Math.sin(p.bounce * Math.PI) * 0.25 * p.bounce;
    hh = ph * (1 - sq); y += ph - hh;
  }
  const r = Math.min(hh * 0.45, pw * 0.1);
  switch (p.kind) {
    case 'bunBottom': {
      ctx.fillStyle = '#e39a45'; rr(x, y, pw, hh, r); ctx.fill();
      ctx.fillStyle = '#f6d39a'; rr(x + pw * 0.02, y, pw * 0.96, hh * 0.35, r * 0.6); ctx.fill();
      break;
    }
    case 'bunTop': {
      const gr = ctx.createLinearGradient(0, y, 0, y + hh);
      gr.addColorStop(0, '#f2b35c'); gr.addColorStop(1, '#d98a35');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x, y + hh);
      ctx.bezierCurveTo(x - pw * 0.02, y - hh * 0.2, x + pw * 1.02, y - hh * 0.2, x + pw, y + hh);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff6dc';
      for (let i = 0; i < 9; i++) {
        const sx = x + pw * (0.18 + (i % 5) * 0.16 + (i > 4 ? 0.08 : 0)), sy = y + hh * (i > 4 ? 0.55 : 0.3);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate((i % 3 - 1) * 0.5);
        ellipse(0, 0, Math.max(2, pw * 0.025), Math.max(1.2, pw * 0.012)); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ellipse(x + pw * 0.3, y + hh * 0.25, pw * 0.12, hh * 0.1); ctx.fill();
      break;
    }
    case 'patty': {
      ctx.fillStyle = '#6b3a1e'; rr(x, y, pw, hh, r); ctx.fill();
      ctx.fillStyle = '#4c2612';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + pw * (0.15 + i * 0.2), y + hh * 0.3, pw * 0.08, hh * 0.12);
      ctx.fillStyle = 'rgba(255,200,150,.15)'; rr(x + pw * 0.04, y + 1, pw * 0.92, hh * 0.25, r * 0.5); ctx.fill();
      break;
    }
    case 'cheese': {
      ctx.fillStyle = '#ffc42e';
      ctx.fillRect(x, y, pw, hh);
      ctx.beginPath();                        // 兩邊垂下來的起司角
      ctx.moveTo(x, y + hh); ctx.lineTo(x + pw * 0.06, y + hh * 3); ctx.lineTo(x + pw * 0.16, y + hh); ctx.closePath();
      ctx.moveTo(x + pw, y + hh); ctx.lineTo(x + pw * 0.92, y + hh * 3.2); ctx.lineTo(x + pw * 0.82, y + hh); ctx.closePath();
      ctx.moveTo(x + pw * 0.45, y + hh); ctx.lineTo(x + pw * 0.5, y + hh * 2.2); ctx.lineTo(x + pw * 0.56, y + hh); ctx.closePath();
      ctx.fill();
      break;
    }
    case 'lettuce': {
      ctx.fillStyle = '#5cbf4a';
      wavy(x, y, pw, hh, 7); ctx.fill();
      ctx.fillStyle = '#86d96f'; wavy(x + pw * 0.05, y, pw * 0.9, hh * 0.45, 6); ctx.fill();
      break;
    }
    case 'tomato': {
      ctx.fillStyle = '#e2412f';
      rr(x, y, pw * 0.49, hh, r); ctx.fill(); rr(x + pw * 0.51, y, pw * 0.49, hh, r); ctx.fill();
      ctx.fillStyle = '#ff8a72';
      for (let i = 0; i < 4; i++) ellipse(x + pw * (0.12 + i * 0.25), y + hh * 0.5, pw * 0.03, hh * 0.18), ctx.fill();
      break;
    }
    case 'onion': {
      ctx.fillStyle = '#f7ecf7'; rr(x, y, pw, hh, r); ctx.fill();
      ctx.strokeStyle = '#b07ac0'; ctx.lineWidth = Math.max(1.5, hh * 0.18);
      for (let i = 0; i < 3; i++) { rr(x + pw * (0.04 + i * 0.32), y + hh * 0.15, pw * 0.28, hh * 0.7, hh * 0.35); ctx.stroke(); }
      break;
    }
    case 'egg': {
      ctx.fillStyle = '#fffdf5';
      ctx.beginPath(); ctx.ellipse(x + pw / 2, y + hh / 2, pw / 2, hh / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb21e';
      ctx.beginPath(); ctx.ellipse(x + pw * 0.55, y + hh * 0.45, pw * 0.14, hh * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bacon': {
      ctx.fillStyle = '#c2554a'; wavy(x, y, pw, hh, 5, true); ctx.fill();
      ctx.fillStyle = '#f2b8a8'; wavy(x, y + hh * 0.38, pw, hh * 0.22, 5, true); ctx.fill();
      break;
    }
  }
}

function wavy(x, y, w, h, n, band) {
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.3);
  for (let i = 0; i <= n; i++) {
    const px = x + w * i / n;
    ctx.quadraticCurveTo(px - w / n / 2, y - h * 0.3, px, y + h * 0.3);
  }
  if (band) {
    for (let i = n; i >= 0; i--) {
      const px = x + w * i / n;
      ctx.quadraticCurveTo(px + w / n / 2, y + h * 1.3, px, y + h);
    }
  } else {
    for (let i = n; i >= 0; i--) {
      const px = x + w * i / n;
      ctx.quadraticCurveTo(px + w / n / 2, y + h * 1.4, px, y + h);
    }
  }
  ctx.closePath();
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
function mixc(a, b, k) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; }

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (phase === 'play' || phase === 'ending') { step(dt); draw(); }
  requestAnimationFrame(loop);
}

// ---------- 畫面切換 ----------
function show(id) {
  for (const s of ['startScreen', 'gameScreen', 'overScreen']) $(s).classList.toggle('on', s === id);
}
function start() {
  show('gameScreen');
  if (!view) { view = fitCanvas(cv, layout); ctx = view.ctx; } else layout(view);
  newGame();
  tone(440, 0.08, 'triangle', 0.15);
}
function goHome() {
  phase = 'idle';
  renderBoard($('board'));
  show('startScreen');
}
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('backBtn').addEventListener('click', goHome);
$('homeBtn').addEventListener('click', goHome);

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉
if (import.meta.env.DEV) window.BG = {
  drop, cap, state: () => ({ phase, layers, hearts, mover: mover && mover.x, top: top().x, faller: !!faller }),
  advance(sec) { for (let s = 0; s < sec; s += 1 / 60) step(1 / 60); draw(); },
  aim() { mover.ph = Math.asin(Math.max(-1, Math.min(1, (top().x - cx) / Math.max(20, Math.min((view.w - mover.w) / 2 - 10, W * 1.3))))); step(0); },
};
requestAnimationFrame(loop);
