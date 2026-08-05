import { currentProfile, getProfiles, saveKey } from '../../shared/profile.js';
import { TW, TH, BALL_R, buildShell, SLINGS, SLING_BACKS, FLIPPERS, PLUNGER, LANE, TABLES } from './tables.js';

/* ============================================================
   彈珠台
   2D 物理:球對線段、球對圓、旋轉擋板。用子步進(substep)避免高速穿牆。
   ============================================================ */

const ME = currentProfile();
const BEST_KEY = 'pinball:best';           // 所有玩家的最佳分數放同一份,才能互相比
const PROG_KEY = saveKey('pinball', 'progress');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- 存檔:最佳分數(跨玩家)與進度(單一玩家) ----------
function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
function allBest() { return readJSON(BEST_KEY, {}); }              // { tableId: { profileId: score } }
function myProgress() { return readJSON(PROG_KEY, { cleared: [] }); }

function recordScore(tableId, score) {
  const all = allBest();
  const t = all[tableId] || (all[tableId] = {});
  if (!(t[ME.id] > score)) t[ME.id] = score;
  localStorage.setItem(BEST_KEY, JSON.stringify(all));
}
function markCleared(tableId) {
  const p = myProgress();
  if (!p.cleared.includes(tableId)) p.cleared.push(tableId);
  localStorage.setItem(PROG_KEY, JSON.stringify(p));
}
/** 第一台永遠開著,之後每台要前一台過關才解鎖 */
function isUnlocked(i) {
  if (i === 0) return true;
  return myProgress().cleared.includes(TABLES[i - 1].id);
}

// ---------- 幾何工具 ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/** 球(圓)對線段:回傳穿透深度與法線 */
function segHit(px, py, r, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - s.x1) * dx + (py - s.y1) * dy) / L2, 0, 1);
  const cx = s.x1 + dx * t, cy = s.y1 + dy * t;
  let nx = px - cx, ny = py - cy;
  const d = Math.hypot(nx, ny);
  if (d >= r) return null;
  if (d < 1e-6) { nx = -dy; ny = dx; }          // 正好在線上,拿垂直方向當法線
  const len = Math.hypot(nx, ny) || 1;
  return { nx: nx / len, ny: ny / len, depth: r - d };
}

// ---------- 遊戲狀態 ----------
let table = TABLES[0];
let shell = buildShell();
let walls = [];
let ball = null;
let score = 0, balls = 3, multiplier = 1;
let running = false, launching = true, plungerPower = 0, plungerHold = false;
let targets = [], rollovers = [], bumpers = [], posts = [];
let effects = [];                                  // 得分彈出字
let gateActive = false;
let tilt = 0;
let stuckTime = 0;

const flip = {
  left: { ...FLIPPERS.left, angle: FLIPPERS.left.rest, target: FLIPPERS.left.rest, omega: 0, pressed: false },
  right: { ...FLIPPERS.right, angle: FLIPPERS.right.rest, target: FLIPPERS.right.rest, omega: 0, pressed: false },
};

function loadTable(t) {
  table = t;
  shell = buildShell();
  walls = [...shell, ...SLING_BACKS];
  bumpers = t.bumpers.map(b => ({ ...b, flash: 0 }));
  posts = (t.posts || []).map(b => ({ ...b, flash: 0 }));
  targets = t.targets.map(x => ({ ...x, down: false, flash: 0 }));
  rollovers = t.rollovers.map(x => ({ ...x, lit: false, flash: 0 }));
  score = 0; balls = 3; multiplier = 1; effects = [];
  saveUsed = false;
  newBall();
}

function newBall() {
  ball = { x: PLUNGER.x, y: PLUNGER.y, vx: 0, vy: 0 };
  launching = true; plungerPower = 0; gateActive = false;
  multiplier = 1; ballAge = 0; stuckTime = 0;
}

function addScore(n, x, y, label) {
  const gained = Math.round(n * multiplier);
  score += gained;
  if (x != null) effects.push({ x, y, text: label || ('+' + gained), life: 1 });
}

// ---------- 物理 ----------
const GRAVITY = 1250;
const SUBSTEPS = 6;

function physics(dt) {
  // 擋板轉動
  for (const f of [flip.left, flip.right]) {
    const target = f.pressed ? f.up : f.rest;
    const prev = f.angle;
    const speed = 1500;                                   // 度/秒
    if (f.angle < target) f.angle = Math.min(target, f.angle + speed * dt);
    else f.angle = Math.max(target, f.angle - speed * dt);
    f.omega = (f.angle - prev) / dt * Math.PI / 180;       // 弧度/秒
  }

  const h = dt / SUBSTEPS;
  // 子步進中間可能因為掉球而把 ball 設成 null,每一步都要重新確認
  for (let i = 0; i < SUBSTEPS && ball; i++) step(h);
}

function flipperSeg(f) {
  const a = f.angle * Math.PI / 180;
  return { x1: f.x, y1: f.y, x2: f.x + Math.cos(a) * f.len, y2: f.y + Math.sin(a) * f.len };
}

function step(h) {
  if (launching) {                       // 待發球:卡在發球道
    ball.y = PLUNGER.y;
    ball.x = PLUNGER.x;
    return;
  }
  ballAge += h;

  ball.vy += GRAVITY * h;
  ball.vx += tilt * 60 * h;
  ball.x += ball.vx * h;
  ball.y += ball.vy * h;

  const bounce = (n, rest, extra = 0) => {
    const vn = ball.vx * n.nx + ball.vy * n.ny;
    if (vn < 0) {
      ball.vx -= (1 + rest) * vn * n.nx;
      ball.vy -= (1 + rest) * vn * n.ny;
    }
    if (extra) { ball.vx += n.nx * extra; ball.vy += n.ny * extra; }
    ball.x += n.nx * n.depth;
    ball.y += n.ny * n.depth;
  };

  // 牆
  for (const s of walls) {
    const hit = segHit(ball.x, ball.y, BALL_R, s);
    if (hit) bounce(hit, 0.42);
  }
  // 發球道閘門:球確實翻過拱門(進到檯面上緣)之後才關,
  // 否則力道不夠、還沒轉彎就掉回來的球會直接卡死在閘門上
  /* 這裡本來有一道「發球道閘門」,結果球一旦從檯面繞回導軌就會坐在關起來的閘門上,
     永遠出不來。索性拿掉:球滾回發球道就讓玩家重新發射一次,
     這反而比較接近真的機台,也少掉一整類卡死的狀況。 */
  if (ball.x > LANE.inner && ball.y > 620 && Math.hypot(ball.vx, ball.vy) < 90) {
    launching = true; plungerPower = 0;
    ball.vx = ball.vy = 0;
  }

  // 三角彈射器
  for (const s of SLINGS) {
    const hit = segHit(ball.x, ball.y, BALL_R, s);
    if (hit) {
      bounce(hit, 0.5, 300);
      addScore(120, ball.x, ball.y);
    }
  }

  // 圓形柱(保險桿)
  const hitCircle = (c, kick, scoreVal) => {
    const dx = ball.x - c.x, dy = ball.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= c.r + BALL_R) return false;
    const nx = (dx || 0.001) / (d || 1), ny = dy / (d || 1);
    ball.x = c.x + nx * (c.r + BALL_R);
    ball.y = c.y + ny * (c.r + BALL_R);
    const sp = Math.max(Math.hypot(ball.vx, ball.vy) * 0.5, kick);
    ball.vx = nx * sp; ball.vy = ny * sp;
    c.flash = 1;
    addScore(scoreVal, c.x, c.y);
    return true;
  };
  for (const b of bumpers) hitCircle(b, 420, b.score);
  for (const p of posts) hitCircle(p, 240, p.score);

  // 打擊標靶(打到就倒下,全倒加倍率與獎分)
  for (const t of targets) {
    if (t.down) continue;
    const s = { x1: t.x - t.w / 2, y1: t.y, x2: t.x + t.w / 2, y2: t.y };
    const hit = segHit(ball.x, ball.y, BALL_R, s);
    if (hit) {
      bounce(hit, 0.35);
      t.down = true; t.flash = 1;
      addScore(t.score, t.x, t.y);
      if (targets.every(x => x.down)) {
        multiplier = Math.min(multiplier + 1, 8);
        addScore(5000, TW / 2, 420, '全倒！×' + multiplier);
        setTimeout(() => targets.forEach(x => { x.down = false; }), 900);
      }
    }
  }

  // 滾過式得分點(不擋球)
  for (const r of rollovers) {
    if (Math.hypot(ball.x - r.x, ball.y - r.y) < r.r + BALL_R) {
      if (!r.lit) { r.lit = true; r.flash = 1; addScore(r.score, r.x, r.y); }
    }
  }
  if (rollovers.length && rollovers.every(r => r.lit)) {
    rollovers.forEach(r => { r.lit = false; });
    multiplier = Math.min(multiplier + 1, 8);
    addScore(3000, TW / 2, 160, '全亮！×' + multiplier);
  }

  // 擋板
  for (const f of [flip.left, flip.right]) {
    const seg = flipperSeg(f);
    const hit = segHit(ball.x, ball.y, BALL_R, seg);
    if (!hit) continue;
    // 接觸點的線速度 = ω × r,這就是「打擊」的力道來源
    const rx = ball.x - f.x, ry = ball.y - f.y;
    const px = -f.omega * ry, py = f.omega * rx;
    const relVn = (ball.vx - px) * hit.nx + (ball.vy - py) * hit.ny;
    if (relVn < 0) {
      const rest = 0.5;
      ball.vx -= (1 + rest) * relVn * hit.nx;
      ball.vy -= (1 + rest) * relVn * hit.ny;
    }
    ball.x += hit.nx * hit.depth;
    ball.y += hit.ny * hit.depth;
  }

  // 阻尼與速度上限
  ball.vx *= 0.9995; ball.vy *= 0.9995;
  const sp = Math.hypot(ball.vx, ball.vy);
  if (sp > 2200) { ball.vx *= 2200 / sp; ball.vy *= 2200 / sp; }

  // 卡住自動解除:球在任何角落停太久就推一下,免得整局動不了
  if (sp < 26) {
    stuckTime += h;
    if (stuckTime > 1.6) {
      // 往檯面中央推,不要往下壓 —— 往下只會把球更用力塞回死角
      ball.vx += (ball.x > TW / 2 ? -1 : 1) * (120 + Math.random() * 80);
      ball.vy -= 90;
      stuckTime = 0;
    }
  } else stuckTime = 0;

  // 掉球
  if (ball.y > TH + 40) loseBall();
}

/* 開局護球:每顆球的前 9 秒掉下去會直接還你。
   小孩最常見的挫折是「一發球就掉了什麼都沒做到」,這一條解掉大半。 */
const SAVE_SECONDS = 9;
let ballAge = 0, saveUsed = false;

function loseBall() {
  if (!saveUsed && ballAge < SAVE_SECONDS) {
    saveUsed = true;
    effects.push({ x: TW / 2, y: 480, text: '球救回來了！', life: 1.6 });
    newBall();
    return;
  }
  balls--;
  if (balls <= 0) { ball = null; endGame(); }
  else newBall();
  updateHUD();
}

// ---------- 畫面 ----------
let scale = 1, offX = 0, offY = 0;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w < 1 || h < 1) return;
  const dpr = Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 2 : 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = Math.min(w / TW, h / TH);
  offX = (w - TW * scale) / 2;
  offY = (h - TH * scale) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);
document.addEventListener('fullscreenchange', () => setTimeout(resize, 100));

function draw() {
  const p = table.palette;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  // 檯面
  const g = ctx.createLinearGradient(0, 0, 0, TH);
  g.addColorStop(0, p.floor1); g.addColorStop(1, p.floor2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, TH);

  // 牆
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 4;
  ctx.shadowColor = p.glow; ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const s of walls) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 彈射器
  ctx.strokeStyle = '#ff6b9d'; ctx.lineWidth = 6;
  ctx.beginPath();
  for (const s of SLINGS) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
  ctx.stroke();

  // 滾過點
  for (const r of rollovers) {
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7);
    ctx.fillStyle = r.lit ? p.rollover : 'rgba(255,255,255,.18)';
    ctx.fill();
    ctx.strokeStyle = p.rollover; ctx.lineWidth = 2; ctx.stroke();
  }

  // 標靶
  for (const t of targets) {
    ctx.fillStyle = t.down ? 'rgba(255,255,255,.15)' : p.target;
    ctx.fillRect(t.x - t.w / 2, t.y - t.h / 2, t.w, t.h);
  }

  // 柱與保險桿
  const circle = (c, col, ring) => {
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7);
    ctx.fillStyle = c.flash > 0 ? '#fff' : col; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
    if (c.flash > 0) {
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r + 8 * c.flash, 0, 7);
      ctx.strokeStyle = `rgba(255,255,255,${c.flash * .8})`; ctx.stroke();
    }
  };
  for (const b of posts) circle(b, '#8f9bb3', p.bumperRing);
  for (const b of bumpers) circle(b, p.bumper, p.bumperRing);

  // 擋板
  for (const f of [flip.left, flip.right]) {
    const s = flipperSeg(f);
    ctx.lineCap = 'round';
    ctx.lineWidth = 15; ctx.strokeStyle = '#e8ecf5';
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.lineWidth = 8; ctx.strokeStyle = f.pressed ? '#ffd257' : '#b9c2d6';
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }

  // 發球道拉桿
  const pull = plungerPower * 34;
  ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 8; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(PLUNGER.x, 692); ctx.lineTo(PLUNGER.x, 692 - 24 + pull); ctx.stroke();

  // 球
  if (ball) {
    const grad = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, BALL_R);
    grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#8b93a5');
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, 7);
    ctx.fillStyle = grad; ctx.fill();
  }

  // 得分彈出
  ctx.textAlign = 'center';
  for (const e of effects) {
    ctx.globalAlpha = Math.max(0, e.life);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px system-ui,sans-serif';
    ctx.fillText(e.text, e.x, e.y - (1 - e.life) * 30);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- HUD ----------
const el = (id) => document.getElementById(id);
function updateHUD() {
  el('score').textContent = score.toLocaleString();
  el('balls').textContent = '●'.repeat(Math.max(0, balls));
  el('mult').textContent = '×' + multiplier;
  el('goalNow').textContent = score.toLocaleString();
  el('goalTarget').textContent = table.goal.toLocaleString();
  el('goalFill').style.width = Math.min(100, score / table.goal * 100) + '%';
}

// ---------- 主迴圈 ----------
let last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  if (running) {
    physics(dt);
    for (const b of [...bumpers, ...posts, ...targets, ...rollovers]) if (b.flash > 0) b.flash -= dt * 3;
    for (const e of effects) e.life -= dt * 1.4;
    effects = effects.filter(e => e.life > 0);
    tilt *= 0.9;
    updateHUD();
  }
  draw();
}

// ---------- 發球 ----------
function releasePlunger() {
  if (!launching) return;
  launching = false;
  // 從 y=664 升到導軌出口 y≈140 理論上需要 1145,留一點餘裕給撞牆損耗;
  // 蓄力越滿出口速度越快,球會衝得越遠
  /* 實測出來的可用區間很窄:1180 以下翻不過導軌,1350 以上球直接砸到左牆。
     所以蓄力對應的其實是「球會落在哪裡」——
     輕點落在右邊保險桿區(x≈243),蓄滿橫越到左半場(x≈60)。 */
  ball.vy = -(1225 + plungerPower * 130);
  ball.vx = -20;
  plungerPower = 0;
  plungerHold = false;
}

// ---------- 輸入 ----------
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ShiftLeft') flip.left.pressed = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ShiftRight') flip.right.pressed = true;
  if (e.code === 'Space') { e.preventDefault(); plungerHold = true; }
  if (e.code === 'ArrowDown') tilt = 0;
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ShiftLeft') flip.left.pressed = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ShiftRight') flip.right.pressed = false;
  if (e.code === 'Space') { e.preventDefault(); releasePlunger(); }
});

// 觸控:畫面左半 = 左擋板,右半 = 右擋板;待發球時按住蓄力放開發射
const zoneL = el('zoneL'), zoneR = el('zoneR');
const bind = (zone, side) => {
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { zone.setPointerCapture(e.pointerId); } catch (err) { }
    if (launching) { plungerHold = true; return; }
    flip[side].pressed = true;
  });
  const up = (e) => {
    e.preventDefault();
    if (plungerHold) releasePlunger();
    flip[side].pressed = false;
  };
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
};
bind(zoneL, 'left');
bind(zoneR, 'right');

// ---------- 畫面切換 ----------
function show(id) {
  ['selectScreen', 'gameScreen', 'overScreen'].forEach(s => el(s).classList.toggle('on', s === id));
}

function startTable(t) {
  loadTable(t);
  show('gameScreen');
  el('tableName').textContent = t.emoji + ' ' + t.name;
  running = true;
  resize();
  updateHUD();
}

function endGame() {
  running = false;
  recordScore(table.id, score);
  const passed = score >= table.goal;
  if (passed) markCleared(table.id);

  el('overTitle').textContent = passed ? '過關！' : '結束';
  el('overTitle').className = passed ? 'pass' : '';
  el('overScore').textContent = score.toLocaleString();
  el('overGoal').textContent = passed
    ? `達到 ${table.goal.toLocaleString()} 分，解鎖下一台`
    : `離過關還差 ${(table.goal - score).toLocaleString()} 分`;
  el('overBoard').innerHTML = boardHTML(table.id);
  const next = TABLES[TABLES.indexOf(table) + 1];
  el('nextBtn').style.display = passed && next ? '' : 'none';
  el('nextBtn').onclick = () => startTable(next);
  show('overScreen');
}

/** 同一台機的所有玩家最佳分數 */
function boardHTML(tableId) {
  const best = allBest()[tableId] || {};
  const rows = getProfiles()
    .map(p => ({ p, s: best[p.id] || 0 }))
    .sort((a, b) => b.s - a.s)
    .filter(r => r.s > 0);
  if (!rows.length) return '<div class="empty">還沒有人上榜</div>';
  return rows.map((r, i) => `
    <div class="row ${r.p.id === ME.id ? 'me' : ''}">
      <span class="rank">${i + 1}</span>
      <span class="face">${r.p.avatar}</span>
      <span class="nm">${r.p.name}</span>
      <span class="sc">${r.s.toLocaleString()}</span>
    </div>`).join('');
}

function drawSelect() {
  el('who').innerHTML = `<span class="face">${ME.avatar}</span>現在是 <b>${ME.name}</b> 在玩`;
  el('tableList').innerHTML = TABLES.map((t, i) => {
    const unlocked = isUnlocked(i);
    const best = (allBest()[t.id] || {})[ME.id] || 0;
    const cleared = myProgress().cleared.includes(t.id);
    return `
      <div class="tcard ${unlocked ? '' : 'locked'}" data-i="${i}">
        <div class="art" style="background:linear-gradient(150deg,${t.palette.floor1},${t.palette.line}55)">
          ${unlocked ? t.emoji : '🔒'}
        </div>
        <div class="body">
          <h3>${t.name} ${cleared ? '<span class="badge">已過關</span>' : ''}</h3>
          <p>${unlocked ? `過關分數 ${t.goal.toLocaleString()}` : `先通過「${TABLES[i - 1].name}」才會開`}</p>
          <p class="best">${best ? '你的最佳 ' + best.toLocaleString() : '還沒玩過'}</p>
        </div>
      </div>`;
  }).join('');
  el('tableList').querySelectorAll('.tcard').forEach(c => {
    c.onclick = () => {
      const i = +c.dataset.i;
      if (!isUnlocked(i)) return;
      startTable(TABLES[i]);
    };
  });
  el('boardTabs').innerHTML = TABLES.map((t, i) =>
    `<button data-id="${t.id}" class="${i === 0 ? 'on' : ''}">${t.emoji} ${t.name}</button>`).join('');
  el('boardTabs').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      el('boardTabs').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      el('board').innerHTML = boardHTML(b.dataset.id);
    };
  });
  el('board').innerHTML = boardHTML(TABLES[0].id);
}

el('backBtn').onclick = () => { running = false; drawSelect(); show('selectScreen'); };
el('retryBtn').onclick = () => startTable(table);
el('toSelectBtn').onclick = () => { drawSelect(); show('selectScreen'); };

// ---------- 全螢幕 ----------
const root = document.documentElement;
const fsRequest = root.requestFullscreen || root.webkitRequestFullscreen;
const fsExit = document.exitFullscreen || document.webkitExitFullscreen;
const inFS = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
if (fsRequest) document.body.classList.add('can-fullscreen');
el('fsBtn').onclick = () => {
  if (inFS()) { try { fsExit?.call(document); } catch (e) { } }
  else {
    try { const r = fsRequest?.call(root); r?.catch?.(() => { }); } catch (e) { }
    screen.orientation?.lock?.('portrait').catch(() => { });
  }
};
document.addEventListener('fullscreenchange', () => {
  el('fsBtn').textContent = inFS() ? '⤡' : '⛶';
});

// 擋掉會離開遊戲的手勢
['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
  document.addEventListener(t, (e) => e.preventDefault()));
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ---------- 啟動 ----------
loadTable(TABLES[0]);
drawSelect();
show('selectScreen');
resize();
loop();

// 蓄力
setInterval(() => {
  if (plungerHold && launching) plungerPower = Math.min(1, plungerPower + 0.06);
}, 30);

if (import.meta.env.DEV) window.PB = {
  get state() { return { score, balls, launching, multiplier, ball, running, table: table.id }; },
  TABLES, flip, startTable, releasePlunger, loadTable,
  set ball(b) { ball = b; },
  step, physics, endGame, allBest, isUnlocked,
  hold: (side, on) => { flip[side].pressed = on; },
};
