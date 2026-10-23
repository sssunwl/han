import '../../shared/offline.js';
import { saveKey } from '../../shared/profile.js';
import { ME, readJSON, writeJSON, tone, noise, fanfare, renderWho, lockGestures } from '../../shared/kit.js';
import {
  T, COLS, ROWS, DAY_SECONDS, SLOTS, DESK, ENTRANCE, buildWalkable,
  FAC, STAR_REP, REVIEW_REP, starsOf, TYPES, TYPE_KEYS, seasonOf, EVENTS, REVIEWS,
} from './data.js';

/* ============================================================
   溫泉旅館
   像素美術:LimeZu Modern Interiors(limezu.itch.io),只打包用到的那幾格(見 tools/onsen_atlas.py)

   一天的流程:
     早上  昨晚住的客人起床 → 櫃台結帳、留評價 → 離開
     白天  新客人陸續來 → 櫃台入住(沒房間就走掉)→ 進房 → 照喜好去泡湯 / 吃飯 / 逛店
     晚上  大家回房間睡覺 → 一天結束,跳出結算
   評價累積成「口碑」,口碑決定星級;星級解鎖新設施、帶來更多客人。
   ============================================================ */

const WW = COLS * T, WH = ROWS * T;          // 世界像素大小
const SAVE_KEY = saveKey('onsen', 'save');
const BASE = import.meta.env.BASE_URL;
const $ = id => document.getElementById(id);

lockGestures();
renderWho($('who'), '是老闆');

// ---------- 素材 ----------
let atlas = null, rects = null;
const atlasReady = Promise.all([
  fetch(BASE + 'onsen/atlas.json').then(r => r.json()).then(j => { rects = j; }),
  new Promise((ok, fail) => { const im = new Image(); im.onload = () => { atlas = im; ok(); }; im.onerror = fail; im.src = BASE + 'onsen/atlas.png'; }),
]);

// ---------- 狀態 ----------
let S = null;            // 存檔的部分:day, money, rep, lv{slotId:level}, sleepers[], stats
let guests = [], fx = [], parts = [];
let t = 0;               // 一天裡的進度 0~1
let speed = 1, paused = false, inSummary = false;
let today = null;        // 今天的帳:{ income, served, reviews[], turned }
let arrivals = [];       // 今天預定來的客人 [{t, type, size}]
let event = null;
let walk = buildWalkable();
let deskQueue = [];
let nextId = 1;
let selected = null;     // 目前打開面板的 slot

function freshSave() {
  return {
    day: 1, money: 600, rep: 0,
    lv: { room1: 1, bath: 1 },              // 開局送一間和室跟大浴場
    sleepers: [], stats: { guests: 0, earned: 0, best5: 0 },
  };
}
const lv = id => S.lv[id] || 0;
const stars = () => starsOf(S.rep);
const slotById = id => SLOTS.find(s => s.id === id);
/** 這一格蓋到第 L+1 級要幾星;別館第一級有自己的門檻 */
const needOf = (s, L) => (L === 0 && s.need) ? s.need : FAC[s.kind].need[L];
/** 別館比本館貴(土地、要另外蓋一棟) */
const costOf = (s, L) => Math.round(FAC[s.kind].cost[L] * (s.annex ? 2.5 : 1) / 10) * 10;

// ---------- 存檔 ----------
function save() {
  if (!S) return;
  S.sleepers = guests.filter(g => g.state === 'sleep').map(g => ({
    char: g.char, type: g.type, room: g.room, sat: g.sat, vip: g.vip, group: g.group,
  }));
  writeJSON(SAVE_KEY, S);
}
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ============================================================
//  尋路:在走廊格子上做 BFS
// ============================================================
function findPath(sx, sy, tx, ty) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !walk[ny][nx] || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      q.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const out = [];
  for (let k = key(tx, ty); k !== -1; k = prev.get(k)) out.push([(k % COLS + 0.5) * T, (Math.floor(k / COLS) + 0.8) * T]);
  return out.reverse();
}
/** 目前所在的(可走)格子;在設施裡面的話就用門口 */
function tileOf(g) {
  let tx = Math.floor(g.x / T), ty = Math.floor(g.y / T);
  tx = Math.max(0, Math.min(COLS - 1, tx)); ty = Math.max(0, Math.min(ROWS - 1, ty));
  if (walk[ty][tx]) return [tx, ty];
  if (g.at) return slotById(g.at).door;
  return [7, 13];
}

// ============================================================
//  設施:每個等級的擺設與「客人可以待的位置」
// ============================================================
/** 回傳 [{x,y,dir,soak,under}],座標是格(相對於 slot 左上) */
function spotsOf(slot) {
  const L = lv(slot.id);
  switch (slot.kind) {
    case 'room': return [{ x: 2.45, y: 2.7, dir: 3 }, { x: 1.7, y: 2.85, dir: 3 }];
    case 'bath': {
      const p = bathPool(L), n = FAC.bath.cap[L - 1];
      return poolSpots(p, n);
    }
    case 'onsen': {
      const p = onsenPool(L), n = FAC.onsen.cap[L - 1];
      return poolSpots(p, n);
    }
    case 'dining': {
      const out = [{ x: 1, y: 1.05, dir: 3, under: true }, { x: 1, y: 3.0, dir: 1 }];
      if (L >= 2) out.push({ x: 3, y: 1.05, dir: 3, under: true }, { x: 3, y: 3.0, dir: 1 });
      return out;
    }
    case 'shop': return [{ x: 2.5, y: 2.1, dir: 2 }, { x: 2.5, y: 2.95, dir: 2 }, { x: 1.2, y: 2.95, dir: 1 }].slice(0, FAC.shop.cap[L - 1]);
    case 'garden': return [{ x: 1.4, y: 2.8, dir: 0 }, { x: 3.2, y: 1.9, dir: 3 }, { x: 4.4, y: 2.8, dir: 2 }, { x: 2.2, y: 1.3, dir: 0 }, { x: 5.3, y: 1.6, dir: 2 }].slice(0, FAC.garden.cap[L - 1]);
  }
  return [];
}
const bathPool = L => [{ x: 0.25, y: 0.9, w: 2.4, h: 1.85 }, { x: 0.25, y: 0.9, w: 2.9, h: 1.85 }, { x: 0.2, y: 0.75, w: 3.0, h: 2.05 }][L - 1];
const onsenPool = L => [{ x: 0.7, y: 0.6, w: 3.6, h: 2.6 }, { x: 0.4, y: 0.4, w: 4.6, h: 3.0 }, { x: 0.3, y: 0.3, w: 5.4, h: 3.2 }][L - 1];
function poolSpots(p, n) {
  // 在池子裡排成一兩排,泡湯的人只露出上半身
  const rows = n > 4 ? 2 : 1, perRow = Math.ceil(n / rows), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow), c = i % perRow;
    const x = p.x + p.w * (c + 0.5) / perRow;
    const y = p.y + (rows === 1 ? p.h * 0.62 : p.h * (0.42 + r * 0.42));
    out.push({ x, y, dir: 3, soak: true });
  }
  return out;
}

/** 設施目前有沒有空位 */
function freeSpot(slot) {
  const spots = spotsOf(slot);
  slot.occ = slot.occ || [];
  for (let i = 0; i < spots.length; i++) if (!slot.occ[i]) return i;
  return -1;
}

// ============================================================
//  客人
// ============================================================
const SPEED = 46;                 // px / 秒(1 倍速)

function spawnGroup(type, size, opts = {}) {
  const group = nextId++;
  const used = new Set(guests.map(g => g.char));
  for (let i = 0; i < size; i++) {
    let char;
    do { char = 1 + Math.floor(Math.random() * 12); } while (used.has(char) && used.size < 12);
    used.add(char);
    const g = {
      id: nextId++, char, type, group, room: null, at: null, spot: -1,
      x: (ENTRANCE[0] + (i ? 0.6 : 0)) * T, y: ENTRANCE[1] * T + i * 10, dir: 1, moving: false,
      state: 'toDesk', path: [], timer: 0, sat: 40, plan: [], vip: !!opts.vip, bubble: null, frame: 0,
      waited: 0, spent: 0, favHit: null,
    };
    guests.push(g);
    goDesk(g);
  }
}

function goTo(g, tx, ty, then) {
  const [sx, sy] = tileOf(g);
  g.path = findPath(sx, sy, tx, ty);
  g.then = then;
  g.moving = true;
}

function goDesk(g) {
  if (!deskQueue.includes(g.id)) deskQueue.push(g.id);
  const i = deskQueue.indexOf(g.id);
  const qx = Math.min(12, Math.floor(DESK.spot[0] + i * 0.9));
  goTo(g, qx, 12, () => { g.state = g.checkingOut ? 'queueOut' : 'queue'; g.dir = 1; });
}

function bubble(g, text, sec = 2.2) { g.bubble = { text, until: sec }; }
function float(x, y, text, color = '#fff') { fx.push({ x, y, text, color, t: 0 }); }

/** 櫃台:一次處理一位 */
let deskTimer = 0;
function updateDesk(dt) {
  deskQueue = deskQueue.filter(id => guests.some(g => g.id === id && (g.state === 'queue' || g.state === 'toDesk' || g.state === 'queueOut' || g.state === 'toCheckout')));
  const first = guests.find(g => g.id === deskQueue[0]);
  if (!first || (first.state !== 'queue' && first.state !== 'queueOut')) { deskTimer = 0; return; }
  deskTimer += dt;
  if (deskTimer < 1.1) return;
  deskTimer = 0;
  deskQueue.shift();
  if (first.state === 'queue') checkIn(first); else checkOut(first);
  // 後面排隊的人往前走
  for (const id of deskQueue) { const g = guests.find(x => x.id === id); if (g && !g.moving) goDesk(g); }
}

function checkIn(g) {
  // 同一組的人如果已經有房間,就住同一間
  const mate = guests.find(o => o.group === g.group && o.room);
  let room = mate && mate.room;
  if (!room) {
    const busy = new Set(guests.filter(o => o.room).map(o => o.room));
    const free = SLOTS.filter(s => s.kind === 'room' && lv(s.id) && !busy.has(s.id));
    room = free.length ? free[Math.floor(Math.random() * free.length)].id : null;
  }
  if (!room) {
    g.sat = 20;
    bubble(g, '客滿了…', 2.5);
    today.turned++;
    S.rep = Math.max(0, S.rep - 2);
    toast('客滿了,有客人只好離開。多蓋幾間和室吧!');
    leave(g);
    return;
  }
  g.room = room;
  g.sat += FAC.room.comfort[lv(room) - 1];
  tone(880, 0.08, 'triangle', 0.14); setTimeout(() => tone(1175, 0.1, 'triangle', 0.12), 90);
  bubble(g, '入住!', 1.2);
  g.plan = makePlan(g);
  enterSlot(g, room, () => { g.state = 'rest'; g.timer = 3; });
}

function makePlan(g) {
  const likes = TYPES[g.type].likes;
  const have = ['bath', 'onsen', 'dining', 'shop', 'garden'].filter(id => lv(id));
  const fav = likes.filter(k => have.includes(k));
  const rest = have.filter(k => !fav.includes(k) && Math.random() < 0.55);
  let plan = [...shuffle(fav), ...shuffle(rest)];
  // 吃飯排在後面
  if (plan.includes('dining')) plan = [...plan.filter(k => k !== 'dining'), 'dining'];
  if (!have.includes('bath') && !have.includes('onsen')) g.sat -= 10;     // 溫泉旅館竟然沒有溫泉
  return plan.slice(0, 4);
}
function shuffle(a) { return a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]); }

/** 走到設施門口,有空位就進去 */
function enterSlot(g, id, then) {
  const slot = slotById(id);
  g.state = 'toFac';
  g.target = id;
  goTo(g, slot.door[0], slot.door[1], () => tryEnter(g, slot, then));
}
function tryEnter(g, slot, then) {
  let i = slot.kind === 'room' ? (guests.filter(o => o.at === slot.id).length) : freeSpot(slot);
  if (slot.kind === 'room') i = Math.min(i, 1);
  if (i < 0) {
    g.state = 'waitFac'; g.waitSlot = slot.id; g.then2 = then; g.waited = 0;
    bubble(g, '…', 1.5);
    return;
  }
  const sp = spotsOf(slot)[i];
  if (slot.kind !== 'room') { slot.occ[i] = g.id; }
  g.at = slot.id; g.spot = i;
  g.path = [[(slot.x + sp.x) * T, (slot.y + sp.y) * T]];
  g.moving = true;
  g.then = () => { g.dir = sp.dir; g.soak = !!sp.soak; g.under = !!sp.under; then(); };
}
function exitSlot(g) {
  const slot = g.at && slotById(g.at);
  if (slot && slot.occ && slot.occ[g.spot] === g.id) slot.occ[g.spot] = null;
  g.soak = false; g.under = false;
  if (slot) { g.x = (slot.door[0] + 0.5) * T; g.y = (slot.door[1] + 0.8) * T; }
  g.at = null; g.spot = -1;
}

function nextActivity(g) {
  if (t > 0.8 || !g.plan.length) { goSleep(g); return; }
  const id = g.plan.shift();
  if (!lv(id)) { nextActivity(g); return; }
  bubble(g, FAC[id].icon, 2);
  enterSlot(g, id, () => {
    g.state = 'using';
    g.timer = FAC[id].time * (0.85 + Math.random() * 0.3);
    g.using = id;
  });
}

function finishActivity(g) {
  const id = g.using, L = lv(id), f = FAC[id];
  let gain = f.sat[L - 1];
  if (TYPES[g.type].likes.includes(id)) { gain *= 1.5; g.favHit = id; }
  if (id === 'onsen') gain *= seasonOf(S.day).onsen;
  if (event && event.id === 'rain' && (id === 'onsen' || id === 'bath')) gain *= 1.3;
  g.sat += gain;
  if (f.fee) {
    let fee = f.fee[L - 1];
    if (id === 'shop') fee = Math.round(fee * (0.6 + Math.random() * 0.9) * (g.type === 'family' || g.type === 'tourist' ? 1.4 : 1));
    pay(g, fee);
  }
  float(g.x, g.y - 60, '♥', '#ff7a9a');
  g.using = null;
  exitSlot(g);
  nextActivity(g);
}

function goSleep(g) {
  if (!g.room) { leave(g); return; }
  enterSlot(g, g.room, () => { g.state = 'sleep'; });
}

function pay(g, amount) {
  if (amount <= 0) return;
  S.money += amount; today.income += amount; S.stats.earned += amount;
  g.spent += amount;
  float(g.x, g.y - 64, '+¥' + amount, '#ffd84a');
  tone(1320, 0.06, 'square', 0.05); setTimeout(() => tone(1760, 0.08, 'square', 0.05), 60);
  hud();
}

function checkOut(g) {
  const L = lv(g.room) || 1;
  // 庭園:每位住客都會沾到一點好心情
  if (lv('garden')) g.sat += FAC.garden.aura[lv('garden') - 1];
  if (event && event.id === 'festival') g.sat += 6;
  g.sat = Math.max(0, Math.min(100, g.sat));
  const st = g.sat < 35 ? 1 : g.sat < 50 ? 2 : g.sat < 65 ? 3 : g.sat < 80 ? 4 : 5;
  let price = FAC.room.price[L - 1];
  if (g.type === 'tourist' && st === 5) price += 30;        // 小費
  pay(g, price);
  let rep = REVIEW_REP[st - 1] * (g.vip ? 3 : 1);
  const before = stars();
  S.rep = Math.max(0, S.rep + rep);
  const favName = g.favHit ? FAC[g.favHit].name : '溫泉';
  const lines = REVIEWS[st];
  const text = lines[Math.floor(Math.random() * lines.length)].replace('{fav}', favName);
  today.reviews.push({ st, text, type: g.type, char: g.char, vip: g.vip });
  today.served++; S.stats.guests++;
  if (st === 5) S.stats.best5++;
  float(g.x, g.y - 80, '★'.repeat(st), st >= 4 ? '#ffd84a' : '#ddd');
  bubble(g, st >= 4 ? '😊' : st === 3 ? '🙂' : '😞', 2);
  if (stars() > before) starUp();
  g.room = null;
  leave(g);
}

function leave(g) {
  exitSlot(g);
  g.state = 'leaving';
  goTo(g, 7, 13, () => { g.path = [[ENTRANCE[0] * T, (ENTRANCE[1] + 0.8) * T]]; g.moving = true; g.then = () => { g.gone = true; }; });
}

function updateGuest(g, dt) {
  if (g.bubble) { g.bubble.until -= dt; if (g.bubble.until <= 0) g.bubble = null; }
  if (g.moving) {
    g.frame += dt * 9;
    let step = SPEED * dt;
    while (step > 0 && g.path.length) {
      const [px, py] = g.path[0];
      const dx = px - g.x, dy = py - g.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) > Math.abs(dy)) g.dir = dx > 0 ? 0 : 2; else if (d > 0.5) g.dir = dy > 0 ? 3 : 1;
      if (d <= step) { g.x = px; g.y = py; g.path.shift(); step -= d; }
      else { g.x += dx / d * step; g.y += dy / d * step; step = 0; }
    }
    if (!g.path.length) { g.moving = false; const fn = g.then; g.then = null; fn && fn(); }
    return;
  }
  g.frame += dt * 4;
  switch (g.state) {
    case 'rest':
      g.timer -= dt;
      if (g.timer <= 0) { exitSlot(g); nextActivity(g); }
      break;
    case 'using':
      g.timer -= dt;
      if (g.timer <= 0) finishActivity(g);
      break;
    case 'waitFac': {
      g.waited += dt;
      const slot = slotById(g.waitSlot);
      if (freeSpot(slot) >= 0) { g.state = 'toFac'; tryEnter(g, slot, g.then2); }
      else if (g.waited > 6) {
        g.sat -= 6; bubble(g, '等好久…', 1.8);
        nextActivity(g);
      }
      break;
    }
  }
}

// ============================================================
//  一天的流程
// ============================================================
function startDay() {
  today = { income: 0, served: 0, reviews: [], turned: 0 };
  t = 0;
  const season = seasonOf(S.day);
  event = null;
  if (S.day >= 3 && Math.random() < 0.25) {
    const total = EVENTS.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    event = EVENTS.find(e => (r -= e.weight) < 0);
  }
  let n = (2 + stars() * 1.4) * season.arrive;
  n += lv('onsen') * 0.6 + lv('garden') * 0.4;
  if (event && event.id === 'group') n += 3;
  if (event && event.id === 'rain') n *= 0.7;
  n = Math.max(1, Math.min(14, Math.round(n + (Math.random() * 2 - 1))));
  arrivals = [];
  let left = n;
  while (left > 0) {
    const type = TYPE_KEYS[Math.floor(Math.random() * TYPE_KEYS.length)];
    const [a, b] = TYPES[type].groups;
    const size = Math.min(left, a + Math.floor(Math.random() * (b - a + 1)));
    arrivals.push({ t: 0.1 + Math.random() * 0.45, type, size });
    left -= size;
  }
  if (event && event.id === 'press') arrivals.push({ t: 0.25, type: 'worker', size: 1, vip: true });
  arrivals.sort((a, b) => a.t - b.t);
  // 昨晚住下的客人:早上陸續結帳
  guests.filter(g => g.state === 'sleep').forEach((g, i) => { g.wakeAt = 0.01 + i * 0.012; });
  showDayBanner();
  hud();
}

function updateDay(dt) {
  t += dt / DAY_SECONDS;
  while (arrivals.length && arrivals[0].t <= t) {
    const a = arrivals.shift();
    spawnGroup(a.type, a.size, { vip: a.vip });
    if (a.vip) toast('📰 雜誌記者到了!好好招待他');
  }
  for (const g of guests) {
    if (g.state === 'sleep' && g.wakeAt != null && t >= g.wakeAt) {
      g.wakeAt = null;
      exitSlot(g);
      g.state = 'toCheckout'; g.checkingOut = true;
      goDesk(g);
    }
  }
  // 晚上:還在外面的人自己回房間;太晚就直接當作睡了
  if (t > 0.97) {
    for (const g of guests) {
      if (g.state === 'sleep' || g.state === 'leaving' || g.state === 'toCheckout' || g.state === 'queueOut') continue;
      if (!g.room) { g.gone = true; continue; }
      exitSlot(g); g.moving = false; g.path = [];
      const r = slotById(g.room); g.at = r.id; g.x = (r.x + 1.5) * T; g.y = (r.y + 2.5) * T;
      g.state = 'sleep';
    }
  }
  if (t >= 1) endDay();
}

function endDay() {
  inSummary = true;
  // 早上沒走完的(很少見)直接結帳
  for (const g of guests) if (g.state === 'toCheckout' || g.state === 'queueOut') { checkOut(g); g.gone = true; }
  guests = guests.filter(g => !g.gone);
  showSummary();
  save();
}

// ============================================================
//  畫面
// ============================================================
const cv = $('cv');
const ctx = cv.getContext('2d');
let vw = 0, vh = 0, dpr = 1;
const cam = { x: 0, y: 0, s: 1 };
let staticLayer = null;

function resize() {
  const r = cv.getBoundingClientRect();
  vw = r.width; vh = r.height;
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  const fit = Math.min(vw / WW, vh / WH);
  // 直式手機整張塞進去會太小:改成以高度為準,左右用手指拖
  cam.s = fit < 0.7 ? Math.min(vh / WH, 1.7) : fit;
  clampCam(true);
}
function clampCam(center) {
  const sw = vw / cam.s, sh = vh / cam.s;
  if (sw >= WW) cam.x = (WW - sw) / 2; else cam.x = Math.max(0, Math.min(WW - sw, center ? (WW - sw) * 0.25 : cam.x));
  if (sh >= WH) cam.y = (WH - sh) / 2; else cam.y = Math.max(0, Math.min(WH - sh, cam.y));
}
new ResizeObserver(() => { if (cv.offsetParent) resize(); }).observe(cv);

function spr(name, x, y, alpha) {
  const r = rects[name]; if (!r) return;
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
  if (alpha != null) ctx.globalAlpha = 1;
}
function tile(c, name, x, y, w, h) {
  // 用 64×64 的地板塊鋪滿一個矩形(座標是像素)
  const r = rects[name];
  for (let yy = y; yy < y + h; yy += 64) for (let xx = x; xx < x + w; xx += 64) {
    const cw = Math.min(64, x + w - xx), ch = Math.min(64, y + h - yy);
    c.drawImage(atlas, r[0], r[1], cw, ch, xx, yy, cw, ch);
  }
}

/** 不會動的部分(地面、地板、牆)先畫好一張,設施變動時才重畫 */
function renderStatic() {
  const c = document.createElement('canvas');
  c.width = WW; c.height = WH;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // 草地:三種綠色的像素點
  g.fillStyle = '#78b85a'; g.fillRect(0, 0, WW, WH);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = rnd() < 0.5 ? '#6aa94e' : '#8ccb68';
    g.fillRect(Math.floor(rnd() * WW / 4) * 4, Math.floor(rnd() * WH / 4) * 4, 4, 4);
  }
  // 戶外步道
  for (let y = 0; y < ROWS; y++) for (let x = 14; x < COLS; x++) if (walk[y][x]) tile(g, 'fl_stone', x * T, y * T, T, T);
  tile(g, 'fl_stone', 7 * T, 13 * T, T, T);
  // 別館的屋頂邊(建好才有)
  for (const s of SLOTS) if (s.annex && lv(s.id)) { g.fillStyle = '#7a5232'; g.fillRect(s.x * T - 4, s.y * T - 6, s.w * T + 8, 6); }
  // 室內:走廊與大廳
  const B = { x: T, y: T, w: 13 * T, h: 12 * T };
  tile(g, 'fl_wood2', B.x, 4 * T, B.w, 2 * T);
  tile(g, 'fl_wood2', 5 * T, 6 * T, T, 3 * T);
  tile(g, 'fl_wood2', 10 * T, 6 * T, T, 3 * T);
  tile(g, 'fl_wood', B.x, 9 * T, B.w, 4 * T);
  g.drawImage(atlas, ...rects.genkan, 6.5 * T, 12 * T, 64, 32);
  // 後牆(y0)
  g.fillStyle = '#e8d8b4'; g.fillRect(B.x, 0, B.w, T);
  g.fillStyle = '#7a5232';
  g.fillRect(B.x, 0, B.w, 5); g.fillRect(B.x, T - 6, B.w, 6);
  for (let x = 1; x <= 14; x += 3) g.fillRect(x * T - 3, 0, 6, T);
  // 設施地板
  for (const s of SLOTS) {
    const L = lv(s.id);
    const px = s.x * T, py = s.y * T, w = s.w * T, h = s.h * T;
    const fl = { room: 'tatami', bath: 'fl_bath', dining: 'fl_dining', shop: 'fl_wood', onsen: 'fl_stone', garden: null }[s.kind];
    if (L && fl) tile(g, fl, px, py, w, h);
    else if (!L && s.kind !== 'garden' && s.kind !== 'onsen') { g.fillStyle = '#cdbb98'; g.fillRect(px, py, w, h); }
    if (s.kind !== 'onsen' && s.kind !== 'garden' && !(s.annex && !L)) wallBox(g, s);
  }
  // 建築外牆(大門、東門留空)
  g.fillStyle = '#3b302c';
  g.fillRect(B.x - 4, B.y + B.h, 6 * T + 4, 5);                 // 下牆左段
  g.fillRect(8 * T, B.y + B.h, 6 * T + 4, 5);                    // 下牆右段
  g.fillRect(B.x - 4, 0, 5, B.y + B.h + 5);                      // 左牆
  g.fillRect(14 * T, 0, 5, 4 * T);                               // 右牆上段
  g.fillRect(14 * T, 5 * T, 5, 8 * T + 5);                       // 右牆下段
  staticLayer = c;
}
function wallBox(g, s) {
  const px = s.x * T, py = s.y * T, w = s.w * T, h = s.h * T;
  g.fillStyle = '#4a3c35';
  const [dx, dy] = s.door;
  const top = dy < s.y, bottom = dy >= s.y + s.h;
  // 上
  if (top) { g.fillRect(px, py - 2, (dx - s.x) * T, 4); g.fillRect((dx + 1) * T, py - 2, px + w - (dx + 1) * T, 4); }
  else g.fillRect(px, py - 2, w, 4);
  // 下
  if (bottom) { g.fillRect(px, py + h - 2, (dx - s.x) * T, 4); g.fillRect((dx + 1) * T, py + h - 2, px + w - (dx + 1) * T, 4); }
  else g.fillRect(px, py + h - 2, w, 4);
  g.fillRect(px - 2, py, 4, h); g.fillRect(px + w - 2, py, 4, h);
  // 門口的門檻
  g.fillStyle = '#a07a4e';
  g.fillRect(dx * T + 3, (top ? py : py + h) - 2, T - 6, 4);
}

// ---------- 各設施的擺設 ----------
function drawPool(p, ox, oy, kind, now) {
  const x = ox + p.x * T, y = oy + p.y * T, w = p.w * T, h = p.h * T;
  if (kind === 'bath') {
    ctx.fillStyle = '#9c6b3f'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);      // 木頭池邊
    ctx.fillStyle = '#c18d58'; ctx.fillRect(x - 5, y - 5, w + 10, 4);
  } else {
    // 岩石池邊:用岩壁素材當圖樣
    ctx.save();
    roundRect(x - 9, y - 9, w + 18, h + 18, 22); ctx.clip();
    const r = rects.rock;
    for (let yy = y - 9; yy < y + h + 9; yy += 64) for (let xx = x - 9; xx < x + w + 9; xx += 64) ctx.drawImage(atlas, r[0], r[1], 64, 64, xx, yy, 64, 64);
    ctx.restore();
  }
  ctx.save();
  if (kind === 'bath') ctx.beginPath(), ctx.rect(x, y, w, h);
  else roundRect(x, y, w, h, 16);
  ctx.clip();
  ctx.fillStyle = kind === 'bath' ? '#5fbfd6' : '#56b7b0';
  ctx.fillRect(x, y, w, h);
  // 水面的像素反光
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 14; i++) {
    const px = x + ((i * 53 + now / 40) % w), py = y + ((i * 37) % h);
    ctx.fillRect(Math.round(px / 2) * 2, Math.round(py / 2) * 2, 6, 2);
  }
  ctx.restore();
}

function drawSlot(s, now) {
  const L = lv(s.id), ox = s.x * T, oy = s.y * T;
  if (!L) {
    // 空地:虛線框 + 「建造」
    const pulse = 0.55 + 0.25 * Math.sin(now / 400);
    ctx.save();
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.strokeRect(ox + 4, oy + 4, s.w * T - 8, s.h * T - 8);
    ctx.restore();
    const need = needOf(s, 0), locked = stars() < need;
    label(ox + s.w * T / 2, oy + s.h * T / 2, locked ? `🔒 ${need}★` : `＋ ${s.annex ? '別館' : FAC[s.kind].name}`, locked ? 'rgba(60,40,30,.55)' : 'rgba(60,40,30,.85)');
    return;
  }
  switch (s.kind) {
    case 'room': {
      const blanket = ['futon_blue', 'futon_gold', 'futon_purple'][L - 1];
      spr('futon_top', ox, oy + T); spr(blanket, ox, oy + 2 * T);
      if (L >= 2) { spr('scroll1', ox + 2.1 * T, oy - 0.9 * T); spr('bonsai_s', ox + 2 * T, oy + 0.1 * T); }
      else spr('zabuton', ox + 2.1 * T, oy + 0.5 * T);
      if (L >= 3) { spr('heater', ox + 0.1 * T, oy); spr('vase', ox + T, oy - T); }
      break;
    }
    case 'bath': {
      drawPool(bathPool(L), ox, oy, 'bath', now);
      spr('shower', ox + 3.05 * T, oy - 0.2 * T);
      spr('bucket', ox + 3.1 * T, oy + 1.9 * T);
      if (L >= 2) { spr('bucket_blue', ox + 0.1 * T, oy); spr('duck', ox + 1.2 * T, oy + 1.2 * T); }
      if (L >= 3) spr('sink', ox + 1 * T, oy - 0.6 * T);
      break;
    }
    case 'onsen': {
      drawPool(onsenPool(L), ox, oy, 'onsen', now);
      spr('bush', ox + 5.2 * T, oy + 1.8 * T);
      if (L >= 2) { spr('bonsai_l', ox + 5.1 * T, oy - 0.4 * T); spr('garland', ox + 1 * T, oy - 1.2 * T); }
      if (L >= 3) { spr('flowers', ox - 0.1 * T, oy + 3 * T); spr('bush', ox + 4.4 * T, oy + 2.9 * T); }
      break;
    }
    case 'dining': {
      spr(L >= 3 ? 'dining_g' : 'dining', ox, oy);
      if (L >= 2) spr(L >= 3 ? 'dining_g' : 'dining', ox + 2 * T, oy);
      if (L >= 3) spr('bonsai_s', ox + 3.1 * T, oy + 1.6 * T);
      break;
    }
    case 'shop': {
      // 等級越高架上越豐富;右邊一欄留給客人站
      spr(L >= 2 ? 'crates_b' : 'crates_a', ox, oy);
      if (L >= 3) spr('flowers', ox + 1.6 * T, oy - 0.3 * T);
      break;
    }
    case 'garden': {
      spr('bush', ox + 0.1 * T, oy - 0.4 * T); spr('bush', ox + 5.1 * T, oy + 1.2 * T); spr('bench', ox + 2.3 * T, oy + 1.4 * T);
      if (L >= 2) { spr('bonsai_l', ox + 0.9 * T, oy - 0.6 * T); spr('flowers', ox + 3.9 * T, oy - 0.1 * T); }
      if (L >= 3) { spr('garland', ox + 1.6 * T, oy - 1.0 * T); spr('flowers', ox + 0.1 * T, oy + 1.5 * T); }
      break;
    }
  }
}
/** 世界座標裡的字:鏡頭縮小時字要放大,螢幕上才看得清楚 */
const fs = px => Math.round(px / Math.min(1, cam.s));
function label(x, y, text, bg) {
  const k = 1 / Math.min(1, cam.s);
  ctx.font = `bold ${fs(11)}px "PingFang TC",sans-serif`;
  const w = ctx.measureText(text).width + 12 * k, hh = 18 * k;
  ctx.fillStyle = bg; roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- 人物 ----------
function drawChar(char, x, y, dir, frame, moving, soak) {
  const r = rects['char' + char];
  const f = dir * 6 + (Math.floor(frame) % 6);
  const sx = r[0] + f * 32, sy = r[1] + (moving ? 64 : 0);
  const dx = Math.round(x - 16), dy = Math.round(y - 60);
  if (soak) {
    // 泡在水裡:只畫頭跟肩膀,再補一條水面
    ctx.drawImage(atlas, sx, sy, 32, 44, dx, dy + 8, 32, 44);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(dx + 6, dy + 50, 20, 2);
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(atlas, sx, sy, 32, 64, dx, dy, 32, 64);
}

function visible(g) {
  if (g.gone) return false;
  if (g.state === 'sleep') return false;
  return true;
}

// ---------- 主畫面 ----------
function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b3a2a'; ctx.fillRect(0, 0, vw, vh);
  ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, -cam.x * cam.s * dpr, -cam.y * cam.s * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticLayer, 0, 0);

  const vis = guests.filter(visible);
  for (const s of SLOTS) {
    for (const g of vis) if (g.at === s.id && g.under) drawChar(g.char, g.x, g.y, g.dir, g.frame, false, false);
    drawSlot(s, now);
  }
  // 櫃台:員工先畫,櫃台蓋住他的下半身
  drawChar(13, DESK.staff[0] * T, DESK.staff[1] * T, 3, now / 250, false, false);
  spr('counter', DESK.x * T, DESK.y * T);
  spr('bonsai_l', 12.1 * T, 9.6 * T); spr('bench', 9 * T, 11.2 * T);

  vis.filter(g => !g.under).sort((a, b) => a.y - b.y).forEach(g => drawChar(g.char, g.x, g.y, g.dir, g.frame, g.moving, g.soak));

  // 睡覺中的房間:Zzz
  for (const s of SLOTS) {
    if (s.kind !== 'room') continue;
    if (guests.some(g => g.room === s.id && g.state === 'sleep')) {
      const k = (now / 600) % 1;
      ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('z', s.x * T + 40 + k * 8, s.y * T + 30 - k * 14);
      ctx.fillText('Z', s.x * T + 48 + k * 8, s.y * T + 22 - k * 16);
    }
  }

  // 熱氣
  for (const p of parts) {
    if (p.kind === 'steam') { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - p.t)})`; ctx.fillRect(Math.round(p.x), Math.round(p.y - p.t * 26), 4 + Math.round(p.t * 4), 4 + Math.round(p.t * 4)); }
  }
  drawWeather(now);

  // 夜晚
  const dark = t < 0.05 ? (0.05 - t) * 6 : t > 0.72 ? Math.min(0.5, (t - 0.72) * 3.5) : 0;
  const tint = seasonOf(S.day).tint;
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(14 * T, 0, WW - 14 * T, WH); }
  if (dark > 0) {
    ctx.fillStyle = `rgba(20,24,70,${dark})`; ctx.fillRect(0, 0, WW, WH);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, a) => {
      const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(255,190,90,${a})`); gr.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(3.5 * T, 10.5 * T, 80, dark * 0.5);
    for (const s of SLOTS) if (lv(s.id) && s.kind !== 'garden') glow((s.x + s.w / 2) * T, (s.y + s.h / 2) * T, 70, dark * 0.35);
    if (lv('onsen') >= 2) glow(17 * T, 0.8 * T, 90, dark * 0.6);
    if (lv('garden') >= 3) glow(18 * T, 7.4 * T, 90, dark * 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 對話泡泡、飄字
  for (const g of vis) if (g.bubble) bubbleAt(g.x, g.y - (g.soak ? 50 : 66), g.bubble.text);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx) {
    ctx.globalAlpha = 1 - f.t;
    ctx.font = `bold ${fs(13)}px "PingFang TC",sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,25,10,.8)';
    ctx.strokeText(f.text, f.x, f.y - f.t * 24);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 24);
    ctx.globalAlpha = 1;
  }
  // 選到的設施
  if (selected) {
    const s = selected;
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3;
    ctx.strokeRect(s.x * T + 1, s.y * T + 1, s.w * T - 2, s.h * T - 2);
  }
}
function bubbleAt(x, y, text) {
  const k = 1 / Math.min(1, cam.s);
  ctx.font = `${fs(13)}px "PingFang TC",sans-serif`;
  const w = Math.max(24 * k, ctx.measureText(text).width + 12 * k), hh = 20 * k;
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  roundRect(x - w / 2, y - hh, w, hh, 8 * k); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4 * k, y); ctx.lineTo(x + 4 * k, y); ctx.lineTo(x, y + 5 * k); ctx.fill();
  ctx.fillStyle = '#3a2c22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - hh / 2);
}

// 季節天氣:只下在戶外
let weather = [];
function drawWeather() {
  const se = seasonOf(S.day);
  const kind = event && event.id === 'rain' ? 'rain' : se.name === '春' ? 'petal' : se.name === '秋' ? 'leaf' : se.name === '冬' ? 'snow' : null;
  if (!kind) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(14 * T + 4, 0, WW, WH); ctx.clip();
  for (const w of weather) {
    if (kind === 'rain') { ctx.fillStyle = 'rgba(200,220,255,.6)'; ctx.fillRect(w.x, w.y, 1, 8); }
    else if (kind === 'snow') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(w.x, w.y, 3, 3); }
    else if (kind === 'petal') { ctx.fillStyle = 'rgba(255,190,210,.9)'; ctx.fillRect(w.x, w.y, 4, 3); }
    else { ctx.fillStyle = 'rgba(220,120,40,.9)'; ctx.fillRect(w.x, w.y, 4, 4); }
  }
  ctx.restore();
}
function stepParticles(dt) {
  // 熱氣:有人泡的池子冒得比較多
  for (const id of ['bath', 'onsen']) {
    const L = lv(id); if (!L) continue;
    const s = slotById(id), p = id === 'bath' ? bathPool(L) : onsenPool(L);
    const rate = (id === 'onsen' ? 5 : 2.5) * (seasonOf(S.day).name === '冬' ? 2 : 1);
    if (Math.random() < dt * rate) parts.push({ kind: 'steam', x: (s.x + p.x + Math.random() * p.w) * T, y: (s.y + p.y + Math.random() * p.h) * T, t: 0 });
  }
  for (const p of parts) p.t += dt * 0.5;
  parts = parts.filter(p => p.t < 1);
  const rain = event && event.id === 'rain';
  if (weather.length < (rain ? 80 : 40)) weather.push({ x: 14 * T + Math.random() * (WW - 14 * T), y: -10, v: rain ? 260 : 18 + Math.random() * 20, s: Math.random() * 6 });
  for (const w of weather) { w.y += w.v * dt; w.x += Math.sin(w.y / 20 + w.s) * (rain ? 0 : 0.4); }
  weather = weather.filter(w => w.y < WH);
  for (const f of fx) f.t += dt * 0.8;
  fx = fx.filter(f => f.t < 1);
}

// ============================================================
//  介面
// ============================================================
function hud() {
  if (!S) return;
  $('money').textContent = '¥' + S.money.toLocaleString();
  const st = stars();
  $('rank').textContent = '★'.repeat(st) + '☆'.repeat(5 - st);
  const se = seasonOf(S.day);
  $('day').textContent = `第 ${S.day} 天 ${se.icon}${se.name}`;
  const next = STAR_REP[st];
  $('repFill').style.width = next ? `${Math.min(100, (S.rep - STAR_REP[st - 1]) / (next - STAR_REP[st - 1]) * 100)}%` : '100%';
}
function clockText() {
  const mins = Math.floor((7 * 60) + t * 17 * 60);      // 07:00 → 24:00
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${t > 0.72 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text; el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

function showDayBanner() {
  const se = seasonOf(S.day);
  toast(event ? event.text : `第 ${S.day} 天 · ${se.icon}${se.name}天`);
}

// ---------- 設施面板 ----------
function openPanel(s) {
  selected = s;
  const f = FAC[s.kind], L = lv(s.id), st = stars();
  const maxed = L >= 3;
  const need = maxed ? 0 : needOf(s, L);
  const cost = maxed ? 0 : costOf(s, L);
  const busy = (s.occ || []).filter(Boolean).length + (s.kind === 'room' && guests.some(g => g.room === s.id) ? 1 : 0);
  const stat = [];
  if (s.kind === 'room') stat.push(`房價 ¥${f.price[Math.max(0, L - 1)]}/人`, `舒適度 +${f.comfort[Math.max(0, L - 1)]}`);
  if (f.sat) stat.push(`滿意度 +${f.sat[Math.max(0, L - 1)]}`);
  if (f.cap) stat.push(`可容納 ${f.cap[Math.max(0, L - 1)]} 人`);
  if (f.fee) stat.push(`每人消費 ¥${f.fee[Math.max(0, L - 1)]}`);
  if (f.aura) stat.push(`全館滿意度 +${f.aura[Math.max(0, L - 1)]}`);
  $('pIcon').textContent = f.icon;
  $('pName').textContent = (s.annex ? '別館' : '') + f.name + (L ? ` · ${'●'.repeat(L)}${'○'.repeat(3 - L)}` : '(空地)');
  $('pDesc').textContent = f.desc;
  $('pStat').textContent = L ? stat.join(' · ') + (s.kind === 'room' ? (busy ? ' · 有客人' : ' · 空房') : '') : '';
  const btn = $('pBtn');
  if (maxed) { btn.textContent = '已經是最高級'; btn.disabled = true; }
  else if (st < need) { btn.textContent = `🔒 需要 ${need}★`; btn.disabled = true; }
  else {
    btn.textContent = `${L ? '升級' : '建造'} ¥${cost.toLocaleString()}`;
    btn.disabled = S.money < cost;
    if (S.money < cost) btn.textContent += '(錢不夠)';
  }
  btn.onclick = () => build(s);
  $('panel').classList.add('on');
}
function closePanel() { selected = null; $('panel').classList.remove('on'); }
$('pClose').addEventListener('click', closePanel);

function build(s) {
  const L = lv(s.id), cost = costOf(s, L);
  if (S.money < cost) return;
  S.money -= cost;
  S.lv[s.id] = L + 1;
  // 升級後容納人數可能變了,把超出的位置清掉
  s.occ = (s.occ || []).slice(0, spotsOf(s).length);
  renderStatic();
  noise(0.3, 0.06, 600);
  [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.16), i * 90));
  float((s.x + s.w / 2) * T, (s.y + s.h / 2) * T, L ? '升級!' : '完成!', '#ffd84a');
  hud(); openPanel(s); save();
}

// ---------- 客人資訊 ----------
function showGuest(g) {
  const face = g.sat >= 80 ? '😆' : g.sat >= 65 ? '😊' : g.sat >= 50 ? '🙂' : g.sat >= 35 ? '😐' : '😞';
  const likes = TYPES[g.type].likes.map(k => FAC[k].icon).join('');
  bubble(g, `${TYPES[g.type].name}${g.vip ? '📰' : ''} ${face} 愛${likes}`, 3);
}

// ---------- 星級上升 ----------
function starUp() {
  const st = stars();
  fanfare();
  const unlocked = Object.entries(FAC).filter(([, f]) => f.need.includes(st)).map(([, f]) => f.name);
  toast(`⭐ 升到 ${st} 星旅館!` + (unlocked.length ? ` 解鎖:${[...new Set(unlocked)].join('、')}` : ''));
  if (st === 5) setTimeout(() => toast('🎉 日本第一的溫泉旅館!你是最棒的老闆!'), 2800);
}

// ---------- 一天結算 ----------
function showSummary() {
  const r = today.reviews;
  const avg = r.length ? r.reduce((s, x) => s + x.st, 0) / r.length : 0;
  $('sTitle').textContent = `第 ${S.day} 天結束`;
  $('sIncome').textContent = '¥' + today.income.toLocaleString();
  $('sServed').textContent = today.served;
  $('sAvg').textContent = r.length ? '★'.repeat(Math.round(avg)) + ` ${avg.toFixed(1)}` : '—';
  $('sTurned').textContent = today.turned ? `有 ${today.turned} 位客人因為客滿離開` : '';
  const picks = shuffle(r).slice(0, 3);
  $('sReviews').innerHTML = picks.length ? picks.map(x => `
    <div class="review"><span class="rs">${'★'.repeat(x.st)}</span>
      <span class="rt">「${x.text}」</span><span class="rw">— ${TYPES[x.type].name}${x.vip ? '(雜誌記者)' : ''}</span></div>`).join('')
    : '<div class="review"><span class="rt">今天還沒有人退房。客人住一晚,明天早上才會留評價。</span></div>';
  const st = stars(), next = STAR_REP[st];
  $('sRep').textContent = next ? `口碑 ${S.rep} / ${next}(下一顆星)` : `口碑 ${S.rep} · 已經是最高的 5 星!`;
  $('summary').classList.add('on');
  fanfare();
}
$('sNext').addEventListener('click', () => {
  $('summary').classList.remove('on');
  inSummary = false;
  S.day++;
  startDay();
  save();
});

// ---------- 速度 ----------
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  const v = Number(b.dataset.speed);
  paused = v === 0; if (v) speed = v;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- 輸入:拖曳移動畫面、點一下選東西 ----------
let drag = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (drag.moved) { cam.x = drag.cx - dx / cam.s; cam.y = drag.cy - dy / cam.s; clampCam(false); }
});
cv.addEventListener('pointerup', e => {
  if (!drag) return;
  const wasTap = !drag.moved;
  drag = null;
  if (!wasTap || inSummary) return;
  const r = cv.getBoundingClientRect();
  const wx = (e.clientX - r.left) / cam.s + cam.x, wy = (e.clientY - r.top) / cam.s + cam.y;
  tapWorld(wx, wy);
});
cv.addEventListener('pointercancel', () => { drag = null; });

function tapWorld(wx, wy) {
  const g = guests.filter(visible).sort((a, b) => b.y - a.y).find(g => Math.abs(wx - g.x) < 13 && wy < g.y + 2 && wy > g.y - 46);
  if (g) { showGuest(g); tone(700, 0.05, 'sine', 0.1); return; }
  const s = SLOTS.find(s => wx >= s.x * T && wx < (s.x + s.w) * T && wy >= s.y * T && wy < (s.y + s.h) * T);
  if (s) { openPanel(s); tone(600, 0.05, 'sine', 0.1); }
  else closePanel();
}

// ============================================================
//  主迴圈
// ============================================================
let last = 0, running = false;
function loop(now) {
  const real = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (running) {
    if (!paused && !inSummary) {
      const dt = real * speed;
      updateDay(dt);
      updateDesk(dt);
      for (const g of guests) updateGuest(g, dt);
      guests = guests.filter(g => !g.gone);
      stepParticles(dt);
    } else stepParticles(0);
    $('clock').textContent = clockText();
    if (selected) refreshPanelSoon(now);
    draw(now);
  }
  requestAnimationFrame(loop);
}
let panelAt = 0;
function refreshPanelSoon(now) { if (now - panelAt > 500) { panelAt = now; openPanel(selected); } }

// ---------- 開始 ----------
function show(id) { for (const s of ['startScreen', 'gameScreen']) $(s).classList.toggle('on', s === id); }

async function start(fresh) {
  await atlasReady;
  S = fresh ? freshSave() : (readJSON(SAVE_KEY, null) || freshSave());
  S.lv = S.lv || {}; S.stats = S.stats || { guests: 0, earned: 0, best5: 0 };
  guests = []; fx = []; parts = []; deskQueue = [];
  for (const s of SLOTS) s.occ = [];
  // 昨晚睡下的客人接著住
  for (const z of S.sleepers || []) {
    const r = slotById(z.room); if (!r || !lv(r.id)) continue;
    guests.push({ id: nextId++, char: z.char, type: z.type, group: z.group, room: z.room, at: z.room, spot: 0,
      x: (r.x + 1.5) * T, y: (r.y + 2.5) * T, dir: 3, moving: false, state: 'sleep', path: [], timer: 0,
      sat: z.sat, plan: [], vip: z.vip, bubble: null, frame: 0, waited: 0, spent: 0, favHit: null });
  }
  show('gameScreen');
  resize();
  if (innerHeight > innerWidth) setTimeout(() => toast('📱 手機橫放可以看到整間旅館,直的可以用手指左右拖'), 2800);
  renderStatic();
  startDay();
  running = true;
}
$('startBtn').addEventListener('click', () => start(false));
$('newBtn').addEventListener('click', () => {
  if (readJSON(SAVE_KEY, null) && !confirm('確定要重新開一間旅館嗎?現在的進度會不見。')) return;
  start(true);
});
$('backBtn').addEventListener('click', () => { save(); running = false; closePanel(); refreshStart(); show('startScreen'); });

function refreshStart() {
  const s = readJSON(SAVE_KEY, null);
  if (s) {
    $('startBtn').textContent = `繼續經營(第 ${s.day} 天 · ${'★'.repeat(starsOf(s.rep))})`;
    $('newBtn').style.display = '';
  } else {
    $('startBtn').textContent = '開一間溫泉旅館!';
    $('newBtn').style.display = 'none';
  }
}
refreshStart();

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉
if (import.meta.env.DEV) window.ON = {
  get S() { return S; }, guests: () => guests, t: () => t, slots: SLOTS, openPanel, build, tapWorld,
  advance(sec, step = 0.05) {
    for (let s = 0; s < sec; s += step) {
      if (inSummary) break;
      const dt = step * speed;
      updateDay(dt); updateDesk(dt); for (const g of guests) updateGuest(g, dt); guests = guests.filter(g => !g.gone); stepParticles(dt);
    }
    $('clock').textContent = clockText(); draw(performance.now());
  },
  money(n) { S.money += n; hud(); }, rep(n) { S.rep += n; hud(); },
};
requestAnimationFrame(loop);
