import '../../shared/offline.js';
import { saveKey } from '../../shared/profile.js';
import { readJSON, writeJSON, tone, noise, fanfare, renderWho, lockGestures, escapeHTML } from '../../shared/kit.js';
import {
  T, COLS, ROWS, CHUNK, DAY_SECONDS, YEAR_DAYS, START_CHUNKS, ENTRANCE, SPAWN, DESK, QUEUE, isReserved, isDeskArea,
  landCost, landNeed, FAC, FAC_ORDER, DECOR, DECOR_ORDER, COMBOS, RESEARCH, STAFF_HIRE, STAFF_SALARY, staffMax,
  ADS, AD_DAYS, STAR_REP, REVIEW_REP, starsOf, rankOf, TYPES, TYPE_KEYS, seasonOf, EVENTS, REVIEWS,
} from './data.js';

/* ============================================================
   溫泉旅館 v2 —— 自由建造版
   像素美術:LimeZu Modern Interiors(limezu.itch.io),只打包用到的格子(tools/onsen_atlas.py)

   跟 v1 最大的不同:設施不再是固定格子,而是在自己的土地上「想蓋哪就蓋哪」;
   土地可以一塊一塊買;家具擺在走道上會讓附近設施變好,特定擺法會觸發「組合」。

   一天的流程:
     早上  昨晚的客人結帳、留評價、給 💡 靈感 → 房間變髒,員工去打掃
     白天  客人入住(沒有乾淨的空房就走掉)→ 照喜好去泡湯 / 吃飯 / 唱歌…
     晚上  回房睡覺 → 結算(收入、薪水、評語);每 28 天全國排行
   ============================================================ */

const WW = COLS * T, WH = ROWS * T;
const SAVE_KEY = saveKey('onsen', 'save2');
const BASE = import.meta.env.BASE_URL;
const $ = id => document.getElementById(id);

lockGestures();
renderWho($('who'), '是老闆');

// ---------- 素材 ----------
let atlas = null, R = null;
const atlasReady = Promise.all([
  fetch(BASE + 'onsen/atlas.json').then(r => r.json()).then(j => { R = j; }),
  new Promise((ok, fail) => { const im = new Image(); im.onload = () => { atlas = im; ok(); }; im.onerror = fail; im.src = BASE + 'onsen/atlas.png'; }),
]);

// ---------- 狀態 ----------
let S = null;                       // 會存檔的部分
let guests = [], staff = [], fx = [], parts = [], weather = [];
let t = 0, speed = 1, paused = false, inSummary = false, running = false;
let today = null, arrivals = [], event = null, deskQueue = [];
let nextGuestId = 1;
let occ = [], walk = [], dist = [];   // 格子:佔用、能不能走、離大門多遠
let mode = 'normal';                 // normal | place | land
let place = null;                    // 正在擺的東西 {kind:'fac'|'decor', type, w, h, x, y, reason}
let landPick = null;                 // 正在考慮買的那塊地
let selected = null;                 // 面板打開的 {fac} 或 {decor}

function freshSave() {
  return {
    v: 2, day: 1, money: 800, rep: 0, ideas: 0, nextId: 3,
    owned: [...START_CHUNKS],
    facs: [
      { id: 'f1', type: 'room', x: 8, y: 16, lv: 1 },
      { id: 'f2', type: 'bath', x: 19, y: 16, lv: 1 },
    ],
    decor: [{ id: 'd1', type: 'bonsai_s', x: 12, y: 21 }, { id: 'd2', type: 'bush', x: 17, y: 21 }],
    research: [], staff: 1, combos: [], ads: {}, sleepers: [], bestRank: null,
    stats: { guests: 0, earned: 0, best5: 0 },
  };
}
const stars = () => starsOf(S.rep);
const facById = id => S.facs.find(f => f.id === id);
const F = f => FAC[f.type];
const unlocked = id => (FAC[id] ? !FAC[id].research : !DECOR[id].research) || S.research.includes(id);
const isRoom = f => f.type === 'room' || f.type === 'bigroom';
const has = id => S.research.includes(id);           // 被動研究

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
//  格子:佔用、可走、尋路、門
// ============================================================
const chunkKey = (x, y) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
const isOwned = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && S.owned.includes(chunkKey(x, y));
const decorW = type => Math.max(1, Math.round((R[type] ? R[type][2] : 32) / T));

function buildGrid(extra) {
  const o = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  for (const f of S.facs) for (let y = f.y; y < f.y + F(f).h; y++) for (let x = f.x; x < f.x + F(f).w; x++) o[y][x] = { fac: f };
  for (const d of S.decor) for (let x = d.x; x < d.x + decorW(d.type); x++) o[d.y][x] = { decor: d };
  if (extra) for (let y = extra.y; y < extra.y + extra.h; y++) for (let x = extra.x; x < extra.x + extra.w; x++) o[y][x] = { ghost: true };
  const w = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) =>
    isOwned(x, y) && !o[y][x] && !isDeskArea(x, y)));
  return { o, w };
}
function bfs(w, [sx, sy]) {
  const d = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  if (!w[sy][sx]) return d;
  d[sy][sx] = 0;
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !w[ny][nx] || d[ny][nx] >= 0) continue;
      d[ny][nx] = d[y][x] + 1; q.push([nx, ny]);
    }
  }
  return d;
}
/** 門:設施四邊外面、走得到、離大門最近的那一格 */
function findDoor(r, d) {
  let best = null;
  const cand = [];
  for (let x = r.x; x < r.x + r.w; x++) { cand.push([x, r.y - 1, 'top']); cand.push([x, r.y + r.h, 'bottom']); }
  for (let y = r.y; y < r.y + r.h; y++) { cand.push([r.x - 1, y, 'left']); cand.push([r.x + r.w, y, 'right']); }
  for (const [x, y, side] of cand) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || d[y][x] < 0) continue;
    if (!best || d[y][x] < best.d) best = { x, y, side, d: d[y][x] };
  }
  return best;
}
const facRect = f => ({ x: f.x, y: f.y, w: F(f).w, h: F(f).h });

function rebuild() {
  const g = buildGrid();
  occ = g.o; walk = g.w;
  dist = bfs(walk, ENTRANCE);
  for (const f of S.facs) {
    const d = findDoor(facRect(f), dist);
    f.door = d ? [d.x, d.y] : null; f.side = d ? d.side : null;
  }
  computeBonuses();
  renderStatic();
}

/** 擺得下嗎?(不能壓到東西、不能擋住任何設施的門、不能擋住大門到櫃台) */
function canPlace(w, h, x, y) {
  if (x < 0 || y < 0 || x + w > COLS || y + h > ROWS) return '超出土地範圍';
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (!isOwned(xx, yy)) return '這裡還不是你的土地';
    if (occ[yy][xx] || isDeskArea(xx, yy)) return '這裡已經有東西了';
    if (isReserved(xx, yy)) return '這裡是櫃台排隊的地方';
  }
  const g = buildGrid({ x, y, w, h });
  const d = bfs(g.w, ENTRANCE);
  if (d[QUEUE.y][QUEUE.x] < 0) return '會擋住大門到櫃台的路';
  for (const f of S.facs) if (!findDoor(facRect(f), d)) return `會擋住${F(f).name}的門`;
  if (place && place.kind === 'fac' && !findDoor({ x, y, w, h }, d)) return '這裡沒有路可以進去';
  return null;
}

function findPath(from, to) {
  const [sx, sy] = from, [tx, ty] = to;
  const key = (x, y) => y * COLS + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || !walk[ny][nx] || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const out = [];
  for (let k = key(tx, ty); k !== -1; k = prev.get(k)) out.push([(k % COLS + 0.5) * T, (Math.floor(k / COLS) + 0.8) * T]);
  return out.reverse();
}
function tileOf(a) {
  let x = Math.floor(a.x / T), y = Math.floor(a.y / T);
  x = Math.max(0, Math.min(COLS - 1, x)); y = Math.max(0, Math.min(ROWS - 1, y));
  if (walk[y] && walk[y][x]) return [x, y];
  if (a.at) { const f = facById(a.at); if (f && f.door) return f.door; }
  return ENTRANCE;
}

// ============================================================
//  擺設加成與組合
// ============================================================
function decorNear(r, rad, pred = () => true) {
  return S.decor.filter(d => pred(d) && d.x + decorW(d.type) - 1 >= r.x - rad && d.x <= r.x + r.w - 1 + rad && d.y >= r.y - rad && d.y <= r.y + r.h - 1 + rad);
}
const near = (a, b, rad) => a.x - rad < b.x + b.w && b.x - rad < a.x + a.w && a.y - rad < b.y + b.h && b.y - rad < a.y + a.h;

function computeBonuses() {
  const found = new Set();
  for (const f of S.facs) {
    const r = facRect(f);
    f.aura = Math.min(10, Math.round(decorNear(r, 2).reduce((s, d) => s + DECOR[d.type].val, 0) / 2));
    f.combo = 0; f.comboNames = []; f.street = false;
    const plants1 = decorNear(r, 1, d => DECOR[d.type].plant).length;
    const plants2 = decorNear(r, 2, d => DECOR[d.type].plant).length;
    const add = (id, v) => { found.add(id); f.combo += v; f.comboNames.push(COMBOS.find(c => c.id === id).name); };
    if (isRoom(f) && plants1 >= 2) add('garden_room', 6);
    if (f.type === 'onsen' && plants2 >= 3) add('hidden', 10);
    if (f.type === 'shop' && S.facs.some(o => o.type === 'dining' && near(r, facRect(o), 1))) { found.add('street'); f.street = true; f.comboNames.push('溫泉街'); }
    if (f.type === 'lounge' && S.facs.some(o => (o.type === 'bath' || o.type === 'onsen') && near(r, facRect(o), 2))) add('yuagari', 8);
    if (f.type === 'footbath' && decorNear(r, 2, d => d.type === 'bench').length) add('plaza', 6);
  }
  if (S.decor.filter(d => d.type === 'garland').length >= 3) found.add('festival');
  if (decorNear({ x: DESK.x, y: DESK.y, w: DESK.w, h: DESK.h }, 3, d => d.type === 'fishbowl').length) found.add('aquarium');
  S.activeCombos = [...found];
  for (const id of found) if (!S.combos.includes(id)) {
    S.combos.push(id);
    const c = COMBOS.find(c => c.id === id);
    S.rep += 20;
    setTimeout(() => { toast(`🎉 發現組合「${c.name}」!${c.effect}(口碑 +20)`); fanfare(); }, 200);
  }
}
const comboOn = id => (S.activeCombos || []).includes(id);

// ============================================================
//  設施內部:擺設與客人的位置
// ============================================================
const POOLS = {
  bath: L => [{ x: 0.25, y: 0.9, w: 2.4, h: 1.85 }, { x: 0.25, y: 0.9, w: 2.9, h: 1.85 }, { x: 0.2, y: 0.75, w: 3.0, h: 2.05 }][L - 1],
  onsen: L => [{ x: 0.7, y: 0.6, w: 3.6, h: 2.6 }, { x: 0.4, y: 0.4, w: 4.6, h: 3.0 }, { x: 0.3, y: 0.3, w: 5.4, h: 3.2 }][L - 1],
  family: () => ({ x: 0.3, y: 0.7, w: 2.4, h: 1.9 }),
  footbath: () => ({ x: 0.25, y: 0.35, w: 1.5, h: 1.25 }),
};
function poolSpots(p, n) {
  const rows = n > 4 ? 2 : 1, per = Math.ceil(n / rows), out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / per), c = i % per;
    out.push({ x: p.x + p.w * (c + 0.5) / per, y: p.y + (rows === 1 ? p.h * 0.62 : p.h * (0.42 + r * 0.42)), dir: 3, soak: true });
  }
  return out;
}
function spotsOf(f) {
  const L = f.lv, cap = F(f).cap ? F(f).cap[L - 1] : 0;
  switch (f.type) {
    case 'room': return [{ x: 2.45, y: 2.7, dir: 3 }, { x: 1.7, y: 2.85, dir: 3 }];
    case 'bigroom': return [{ x: 0.7, y: 2.85, dir: 3 }, { x: 1.5, y: 2.85, dir: 3 }, { x: 2.5, y: 2.85, dir: 3 }, { x: 3.3, y: 2.85, dir: 3 }];
    case 'bath': case 'onsen': case 'family': case 'footbath': return poolSpots(POOLS[f.type](L), cap);
    case 'dining': {
      const out = [{ x: 1, y: 1.05, dir: 3, under: true }, { x: 1, y: 3.0, dir: 1 }];
      if (L >= 2) out.push({ x: 3, y: 1.05, dir: 3, under: true }, { x: 3, y: 3.0, dir: 1 });
      return out;
    }
    case 'shop': return [{ x: 2.5, y: 2.1, dir: 2 }, { x: 2.5, y: 2.95, dir: 2 }, { x: 1.2, y: 2.95, dir: 1 }].slice(0, cap);
    case 'lounge': return [{ x: 0.6, y: 2.25, dir: 3 }, { x: 1.5, y: 2.25, dir: 3 }, { x: 2.4, y: 2.25, dir: 3 }].slice(0, cap);
    case 'karaoke': return [{ x: 0.7, y: 2.85, dir: 1 }, { x: 1.5, y: 2.9, dir: 1 }, { x: 2.3, y: 2.85, dir: 1 }, { x: 1.5, y: 2.2, dir: 1 }].slice(0, cap);
  }
  return [];
}
const guestById = id => guests.find(g => g.id === id);
function freeSpot(f, g) {
  f.occ = f.occ || [];
  // 包場:有別組客人在就不能進
  if (F(f).private && f.occ.some(id => id && guestById(id) && guestById(id).group !== g.group)) return -1;
  const n = spotsOf(f).length;
  for (let i = 0; i < n; i++) if (!f.occ[i]) return i;
  return -1;
}

// ============================================================
//  客人
// ============================================================
const SPEED = 72;                 // 土地變大後走路要快一點,不然客人整天都在走(實測過)

function spawnGroup(type, size, opts = {}) {
  const group = nextGuestId++;
  const used = new Set(guests.map(g => g.char));
  for (let i = 0; i < size; i++) {
    let char;
    do { char = 1 + Math.floor(Math.random() * 12); } while (used.has(char) && used.size < 12);
    used.add(char);
    const g = {
      id: nextGuestId++, char, type, group, size, room: null, at: null, spot: -1,
      x: (SPAWN[0] + i * 0.5) * T, y: SPAWN[1] * T + i * 6, dir: 1, moving: false,
      state: 'toDesk', path: [], timer: 0, sat: 40, plan: [], vip: !!opts.vip, bubble: null, frame: 0,
      waited: 0, favHit: null,
    };
    guests.push(g);
    // 先走進大門再去排隊
    g.path = [[(ENTRANCE[0] + 0.5) * T, (ENTRANCE[1] + 0.8) * T]]; g.moving = true;
    g.then = () => goDesk(g);
  }
}
function goTo(a, tx, ty, then) {
  const p = findPath(tileOf(a), [tx, ty]);
  a.path = p || []; a.then = then; a.moving = true;
}
function goDesk(g) {
  if (!deskQueue.includes(g.id)) deskQueue.push(g.id);
  const i = Math.min(QUEUE.max - 1, deskQueue.indexOf(g.id));
  goTo(g, QUEUE.x + i, QUEUE.y, () => { g.state = g.checkingOut ? 'queueOut' : 'queue'; g.dir = 1; });
}
function bubble(a, text, sec = 2.2) { a.bubble = { text, until: sec }; }
function float(x, y, text, color = '#fff') { fx.push({ x, y, text, color, t: 0 }); }

let deskTimer = 0;
function updateDesk(dt) {
  deskQueue = deskQueue.filter(id => { const g = guestById(id); return g && ['queue', 'toDesk', 'queueOut', 'toCheckout'].includes(g.state); });
  const first = guestById(deskQueue[0]);
  if (!first || (first.state !== 'queue' && first.state !== 'queueOut')) { deskTimer = 0; return; }
  deskTimer += dt;
  if (deskTimer < (has('service') ? 0.6 : 1.0)) return;
  deskTimer = 0;
  deskQueue.shift();
  if (first.state === 'queue') checkIn(first); else checkOut(first);
  for (const id of deskQueue) { const g = guestById(id); if (g && !g.moving) goDesk(g); }
}

function checkIn(g) {
  const mate = guests.find(o => o.group === g.group && o.room);
  let room = mate && mate.room;
  let reason = '客滿了…';
  if (!room) {
    const busy = new Set(guests.filter(o => o.room).map(o => o.room));
    const rooms = S.facs.filter(f => isRoom(f) && f.door && !busy.has(f.id));
    const fit = rooms.filter(f => F(f).group >= g.size);
    const clean = fit.filter(f => !f.dirty);
    if (fit.length && !clean.length) reason = '房間還沒打掃…';
    else if (rooms.length && !fit.length) reason = '沒有大房間…';
    // 優先住剛好的房間(兩人就不要佔大和室)
    clean.sort((a, b) => F(a).group - F(b).group || b.lv - a.lv);
    room = clean.length ? clean[0].id : null;
  }
  if (!room) {
    g.sat = 20; bubble(g, reason, 2.5);
    today.turned++; S.rep = Math.max(0, S.rep - 2);
    toast(reason === '房間還沒打掃…' ? '🧹 房間來不及打掃,客人走了。多請幾位員工吧!' : reason === '沒有大房間…' ? '👨‍👩‍👧 家族客人需要大和室!' : '🈵 客滿了,有客人只好離開。買地多蓋幾間房吧!');
    leave(g); return;
  }
  g.room = room;
  const r = facById(room);
  g.sat += F(r).comfort[r.lv - 1] + (r.aura || 0) + (r.combo || 0);
  if (comboOn('aquarium')) g.sat += 4;
  if (has('service')) g.sat += 4;
  if (has('futon')) g.sat += 5;
  tone(880, 0.08, 'triangle', 0.14); setTimeout(() => tone(1175, 0.1, 'triangle', 0.12), 90);
  bubble(g, '入住!', 1.2);
  g.plan = makePlan(g);
  enterFac(g, room, () => { g.state = 'rest'; g.timer = 3; });
}

function makePlan(g) {
  const likes = TYPES[g.type].likes;
  const have = [...new Set(S.facs.filter(f => !isRoom(f) && f.door).map(f => f.type))];
  const fav = likes.filter(k => have.includes(k));
  const rest = have.filter(k => !fav.includes(k) && Math.random() < 0.5);
  let plan = [...shuffle(fav), ...shuffle(rest)];
  if (plan.includes('dining')) plan = [...plan.filter(k => k !== 'dining'), 'dining'];
  if (!have.includes('bath') && !have.includes('onsen')) g.sat -= 10;
  return plan.slice(0, has('night') ? 5 : 4);
}
function shuffle(a) { return a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]); }

/** 同類型有好幾間時,挑有空位的那間 */
function pickFac(type, g) {
  const list = S.facs.filter(f => f.type === type && f.door);
  if (!list.length) return null;
  const free = list.filter(f => freeSpot(f, g) >= 0);
  return (free.length ? free : list).sort((a, b) => b.lv - a.lv)[0];
}

function enterFac(g, id, then) {
  const f = facById(id);
  if (!f || !f.door) { nextActivity(g); return; }
  g.state = 'toFac'; g.target = id;
  goTo(g, f.door[0], f.door[1], () => tryEnter(g, f, then));
}
function tryEnter(g, f, then) {
  if (!facById(f.id)) { nextActivity(g); return; }       // 走到一半被拆掉了
  let i;
  if (isRoom(f)) i = Math.min(guests.filter(o => o.at === f.id).length, spotsOf(f).length - 1);
  else i = freeSpot(f, g);
  if (i < 0) { g.state = 'waitFac'; g.waitFac = f.id; g.then2 = then; g.waited = 0; bubble(g, '…', 1.5); return; }
  const sp = spotsOf(f)[i];
  if (!isRoom(f)) f.occ[i] = g.id;
  g.at = f.id; g.spot = i;
  g.path = [[(f.x + sp.x) * T, (f.y + sp.y) * T]]; g.moving = true;
  g.then = () => { g.dir = sp.dir; g.soak = !!sp.soak; g.under = !!sp.under; then(); };
}
function exitFac(a) {
  const f = a.at && facById(a.at);
  if (f && f.occ && f.occ[a.spot] === a.id) f.occ[a.spot] = null;
  a.soak = false; a.under = false;
  if (f && f.door) { a.x = (f.door[0] + 0.5) * T; a.y = (f.door[1] + 0.8) * T; }
  a.at = null; a.spot = -1;
}

function nextActivity(g) {
  if (t > (has('night') ? 0.88 : 0.8) || !g.plan.length) { goSleep(g); return; }
  const type = g.plan.shift();
  const f = pickFac(type, g);
  if (!f) { nextActivity(g); return; }
  bubble(g, FAC[type].icon, 2);
  enterFac(g, f.id, () => { g.state = 'using'; g.timer = FAC[type].time * (0.85 + Math.random() * 0.3); g.using = f.id; });
}
function finishActivity(g) {
  const f = facById(g.using);
  g.using = null;
  if (!f) { exitFac(g); nextActivity(g); return; }
  const d = F(f), L = f.lv;
  let gain = d.sat[L - 1] + (f.aura || 0) + (f.combo || 0);
  if (TYPES[g.type].likes.includes(f.type)) { gain *= 1.5; g.favHit = f.type; }
  if (f.type === 'onsen') gain *= seasonOf(S.day).onsen;
  if (event && event.id === 'rain' && d.pool) gain *= 1.3;
  if (has('water') && d.pool) gain += 5;
  if (has('cuisine') && f.type === 'dining') gain += 4;
  // 玩越多項,後面的開心程度遞減(不然每個人都 5 星,設施等級就沒差了)
  gain *= Math.pow(0.75, g.done || 0);
  g.done = (g.done || 0) + 1;
  g.sat += gain;
  if (d.fee) {
    let fee = d.fee[L - 1];
    if (f.type === 'shop') fee = Math.round(fee * (0.6 + Math.random() * 0.9) * (g.type === 'family' || g.type === 'tourist' ? 1.4 : 1) * (f.street ? 1.3 : 1) * (has('souvenir') ? 1.3 : 1));
    if (f.type === 'dining' && has('cuisine')) fee = Math.round(fee * 1.25);
    pay(g, fee);
  }
  float(g.x, g.y - 60, '♥', '#ff7a9a');
  exitFac(g);
  nextActivity(g);
}
function goSleep(g) {
  if (!g.room || !facById(g.room)) { leave(g); return; }
  enterFac(g, g.room, () => { g.state = 'sleep'; });
}
function pay(g, amount) {
  if (amount <= 0) return;
  S.money += amount; today.income += amount; S.stats.earned += amount;
  float(g.x, g.y - 64, '+¥' + amount, '#ffd84a');
  tone(1320, 0.06, 'square', 0.05); setTimeout(() => tone(1760, 0.08, 'square', 0.05), 60);
  hud();
}
function checkOut(g) {
  const r = facById(g.room);
  const L = r ? r.lv : 1;
  const d = r ? F(r) : FAC.room;
  if (event && event.id === 'festival') g.sat += 6;
  g.sat = Math.max(0, Math.min(100, g.sat));
  const st = g.sat < 35 ? 1 : g.sat < 50 ? 2 : g.sat < 65 ? 3 : g.sat < 80 ? 4 : 5;
  let price = d.price[L - 1];
  if (g.type === 'tourist' && st === 5) price += 30;
  pay(g, price);
  const before = stars();
  S.rep = Math.max(0, S.rep + REVIEW_REP[st - 1] * (g.vip ? 3 : 1));
  const idea = (st >= 4 ? 2 : 1) * (g.vip ? 3 : 1);
  S.ideas += idea; today.ideas += idea;
  const lines = REVIEWS[st];
  today.reviews.push({ st, text: lines[Math.floor(Math.random() * lines.length)].replace('{fav}', g.favHit ? FAC[g.favHit].name : '溫泉'), type: g.type, vip: g.vip });
  today.served++; S.stats.guests++;
  if (st === 5) S.stats.best5++;
  float(g.x, g.y - 80, '★'.repeat(st), st >= 4 ? '#ffd84a' : '#ddd');
  float(g.x + 20, g.y - 60, '💡+' + idea, '#bfe8ff');
  bubble(g, st >= 4 ? '😊' : st === 3 ? '🙂' : '😞', 2);
  // 同組最後一位退房,房間就變髒
  if (r && !guests.some(o => o !== g && o.room === r.id)) r.dirty = true;
  g.room = null;
  if (stars() > before) starUp();
  leave(g);
}
function leave(g) {
  exitFac(g);
  g.state = 'leaving';
  goTo(g, ENTRANCE[0], ENTRANCE[1], () => { g.path = [[SPAWN[0] * T, (SPAWN[1] + 0.5) * T]]; g.moving = true; g.then = () => { g.gone = true; }; });
}

function moveAgent(a, dt) {
  a.frame += dt * 9;
  let step = SPEED * dt;
  while (step > 0 && a.path.length) {
    const [px, py] = a.path[0];
    const dx = px - a.x, dy = py - a.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 0 : 2; else if (d > 0.5) a.dir = dy > 0 ? 3 : 1;
    if (d <= step) { a.x = px; a.y = py; a.path.shift(); step -= d; }
    else { a.x += dx / d * step; a.y += dy / d * step; step = 0; }
  }
  if (!a.path.length) { a.moving = false; const fn = a.then; a.then = null; fn && fn(); }
}
function updateGuest(g, dt) {
  if (g.bubble) { g.bubble.until -= dt; if (g.bubble.until <= 0) g.bubble = null; }
  if (g.moving) { moveAgent(g, dt); return; }
  g.frame += dt * 4;
  switch (g.state) {
    case 'rest': g.timer -= dt; if (g.timer <= 0) { exitFac(g); nextActivity(g); } break;
    case 'using': g.timer -= dt; if (g.timer <= 0) finishActivity(g); break;
    case 'waitFac': {
      g.waited += dt;
      const f = facById(g.waitFac);
      if (!f) { nextActivity(g); break; }
      if (freeSpot(f, g) >= 0) { g.state = 'toFac'; tryEnter(g, f, g.then2); }
      else if (g.waited > 6) { g.sat -= 6; bubble(g, '等好久…', 1.8); nextActivity(g); }
      break;
    }
  }
}

// ============================================================
//  員工:找髒房間 → 走過去 → 打掃 → 回大廳
// ============================================================
function syncStaff() {
  while (staff.length < S.staff) {
    const i = staff.length;
    staff.push({ id: 's' + i, char: 14 + (i % 3), x: (11 + i % 4) * T + 16, y: 21.8 * T, dir: 3, frame: 0, moving: false, path: [], state: 'idle', target: null, timer: 0, at: null });
  }
}
function updateStaff(a, dt) {
  if (a.bubble) { a.bubble.until -= dt; if (a.bubble.until <= 0) a.bubble = null; }
  if (a.moving) { moveAgent(a, dt); return; }
  a.frame += dt * 3;
  if (a.state === 'idle') {
    const claimed = new Set(staff.map(s => s.target).filter(Boolean));
    const dirty = S.facs.filter(f => f.dirty && f.door && !claimed.has(f.id) && !guests.some(g => g.room === f.id));
    if (!dirty.length) return;
    // 去最近的那間(本來挑清單第一間,常常要橫越整張地圖)
    const [sx, sy] = tileOf(a);
    const f = dirty.sort((p, q) => (Math.abs(p.door[0] - sx) + Math.abs(p.door[1] - sy)) - (Math.abs(q.door[0] - sx) + Math.abs(q.door[1] - sy)))[0];
    a.target = f.id; a.state = 'going';
    goTo(a, f.door[0], f.door[1], () => {
      const ff = facById(a.target);
      if (!ff) { a.state = 'idle'; a.target = null; return; }
      a.at = ff.id; a.x = (ff.x + F(ff).w / 2) * T; a.y = (ff.y + F(ff).h - 0.3) * T;
      a.state = 'cleaning'; a.timer = has('cleaning') ? 2 : 4; bubble(a, '🧹', a.timer);
    });
  } else if (a.state === 'cleaning') {
    a.timer -= dt;
    if (a.timer <= 0) {
      const f = facById(a.target);
      if (f) { f.dirty = false; float(a.x, a.y - 60, '✨', '#fff'); }
      exitFac(a); a.target = null; a.state = 'back';
      goTo(a, 11 + staff.indexOf(a) % 4, 21, () => { a.state = 'idle'; a.dir = 3; });
    }
  }
}

// ============================================================
//  一天的流程
// ============================================================
function startDay() {
  today = { income: 0, served: 0, reviews: [], turned: 0, ideas: 0, salary: 0 };
  t = 0;
  const season = seasonOf(S.day);
  event = null;
  if (S.day >= 3 && Math.random() < 0.25) {
    const total = EVENTS.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    event = EVENTS.find(e => (r -= e.weight) < 0);
  }
  let n = (2 + stars() * 1.7 + (S.owned.length - 2) * 0.8) * season.arrive;
  if (event && event.id === 'group') n += 3;
  if (event && event.id === 'rain') n *= 0.7;
  if (S.ads.tv) n += 3;
  if (comboOn('festival')) n += 1;
  n += Object.keys(S.ads).filter(k => k !== 'tv').length;
  n = Math.max(1, Math.min(30, Math.round(n + (Math.random() * 2 - 1))));
  // 宣傳中的客群出現機率 ×3
  const weights = TYPE_KEYS.map(k => S.ads[k] ? 3 : 1);
  const pickType = () => { let r = Math.random() * weights.reduce((a, b) => a + b, 0); return TYPE_KEYS.find((k, i) => (r -= weights[i]) < 0); };
  const hasBig = S.facs.some(f => f.type === 'bigroom');
  arrivals = [];
  let left = n;
  while (left > 0) {
    const type = pickType();
    let [a, b] = TYPES[type].size;
    if (!hasBig) b = Math.min(b, 2);            // 沒有大和室,家族只會兩人來
    const size = Math.min(left, a + Math.floor(Math.random() * (b - a + 1)));
    arrivals.push({ t: 0.1 + Math.random() * 0.45, type, size });
    left -= size;
  }
  if (event && event.id === 'press') arrivals.push({ t: 0.25, type: 'worker', size: 1, vip: true });
  arrivals.sort((x, y) => x.t - y.t);
  guests.filter(g => g.state === 'sleep').forEach((g, i) => { g.wakeAt = 0.01 + i * 0.01; });
  toast(event ? event.text : `第 ${S.day} 天 · ${season.icon}${season.name}天`);
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
      g.wakeAt = null; exitFac(g); g.state = 'toCheckout'; g.checkingOut = true; goDesk(g);
    }
  }
  if (t > 0.97) {
    for (const g of guests) {
      if (['sleep', 'leaving', 'toCheckout', 'queueOut'].includes(g.state)) continue;
      const r = g.room && facById(g.room);
      if (!r) { g.gone = true; continue; }
      exitFac(g); g.moving = false; g.path = [];
      g.at = r.id; g.x = (r.x + 1.5) * T; g.y = (r.y + 2.5) * T; g.state = 'sleep';
    }
  }
  if (t >= 1) endDay();
}
function endDay() {
  inSummary = true;
  for (const g of guests) if (g.state === 'toCheckout' || g.state === 'queueOut') { checkOut(g); g.gone = true; }
  guests = guests.filter(g => !g.gone);
  // 薪水(沒有破產:錢最少扣到 0)
  today.salary = Math.min(S.money, S.staff * STAFF_SALARY);
  S.money -= today.salary;
  for (const k of Object.keys(S.ads)) if (--S.ads[k] <= 0) delete S.ads[k];
  // 年底排行
  today.year = null;
  if (S.day % YEAR_DAYS === 0) {
    const rank = rankOf(S.rep);
    const reward = Math.max(0, 13 - rank) * 200;
    S.money += reward; S.ideas += 10;
    S.bestRank = Math.min(S.bestRank || 99, rank);
    today.year = { rank, reward };
  }
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
const minScale = () => Math.min(vw / WW, vh / WH);

function resize() {
  const r = cv.getBoundingClientRect();
  // 轉向或視窗變大小時,畫面中心保持在同一個地方
  const cx = vw ? cam.x + vw / cam.s / 2 : null, cy = vh ? cam.y + vh / cam.s / 2 : null;
  const portraitChanged = vw && (vw > vh) !== (r.width > r.height);
  vw = r.width; vh = r.height;
  dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  if (portraitChanged && S) { focusOwned(); return; }
  if (cx != null) { cam.x = cx - vw / cam.s / 2; cam.y = cy - vh / cam.s / 2; }
  clampCam();
}
function focusOwned() {
  // 鏡頭對準自己的土地
  const ks = S.owned.map(k => k.split(',').map(Number));
  const x0 = Math.min(...ks.map(k => k[0])) * CHUNK, x1 = (Math.max(...ks.map(k => k[0])) + 1) * CHUNK;
  const y0 = Math.min(...ks.map(k => k[1])) * CHUNK, y1 = (Math.max(...ks.map(k => k[1])) + 1) * CHUNK;
  const bw = (x1 - x0 + 1) * T, bh = (y1 - y0 + 1.5) * T;
  cam.s = Math.max(minScale(), Math.min(vw / bw, vh / bh, 1.6));
  if (vh > vw) cam.s = Math.max(minScale(), Math.min(1.05, vh / bh));   // 直式:放大到看得清楚,左右拖
  cam.x = (x0 + x1) / 2 * T - vw / cam.s / 2;
  cam.y = (y0 + y1) / 2 * T - vh / cam.s / 2 + T * 0.4;
  clampCam();
}
function clampCam() {
  cam.s = Math.max(minScale(), Math.min(2.4, cam.s));
  const sw = vw / cam.s, sh = vh / cam.s;
  cam.x = sw >= WW ? (WW - sw) / 2 : Math.max(0, Math.min(WW - sw, cam.x));
  cam.y = sh >= WH ? (WH - sh) / 2 : Math.max(0, Math.min(WH - sh, cam.y));
}
function zoomAt(k, sx, sy) {
  const wx = sx / cam.s + cam.x, wy = sy / cam.s + cam.y;
  cam.s *= k; clampCam();
  cam.x = wx - sx / cam.s; cam.y = wy - sy / cam.s; clampCam();
}
new ResizeObserver(() => { if (running) resize(); }).observe(cv);

function spr(name, x, y, c = ctx) {
  const r = R[name]; if (!r) return;
  c.drawImage(atlas, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
}
function tile(c, name, x, y, w, h) {
  const r = R[name];
  for (let yy = y; yy < y + h; yy += 64) for (let xx = x; xx < x + w; xx += 64) {
    const cw = Math.min(64, x + w - xx), ch = Math.min(64, y + h - yy);
    c.drawImage(atlas, r[0], r[1], cw, ch, xx, yy, cw, ch);
  }
}

const FLOOR = { room: 'tatami', bigroom: 'tatami', bath: 'fl_bath', family: 'fl_bath', onsen: 'fl_stone', footbath: 'fl_stone', dining: 'fl_dining', shop: 'fl_wood', lounge: 'fl_wood', karaoke: 'fl_dining' };
const OUTDOOR = { onsen: 1, footbath: 1 };

function renderStatic() {
  const c = document.createElement('canvas');
  c.width = WW; c.height = WH;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // 草地
  g.fillStyle = '#78b85a'; g.fillRect(0, 0, WW, WH);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3800; i++) { g.fillStyle = rnd() < 0.5 ? '#6aa94e' : '#8ccb68'; g.fillRect(Math.floor(rnd() * WW / 4) * 4, Math.floor(rnd() * WH / 4) * 4, 4, 4); }
  // 自己的土地:木頭走廊;櫃台一帶是大廳
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isOwned(x, y)) tile(g, 'fl_wood2', x * T, y * T, T, T);
  tile(g, 'fl_wood', 11 * T, 19 * T, 10 * T, 4 * T);
  tile(g, 'fl_stone', ENTRANCE[0] * T, ENTRANCE[1] * T, T, T);
  // 還沒買的地:暗一點
  g.fillStyle = 'rgba(20,40,10,.22)';
  for (let cy = 0; cy < ROWS / CHUNK; cy++) for (let cx = 0; cx < COLS / CHUNK; cx++) if (!S.owned.includes(`${cx},${cy}`)) g.fillRect(cx * CHUNK * T, cy * CHUNK * T, CHUNK * T, CHUNK * T);
  // 建築外牆:自己土地的邊界(大門留空)
  g.fillStyle = '#3b302c';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!isOwned(x, y)) continue;
    if (!isOwned(x, y - 1)) g.fillRect(x * T, y * T - 2, T, 5);
    if (!isOwned(x, y + 1) && !(x === ENTRANCE[0] && y === ENTRANCE[1])) g.fillRect(x * T, (y + 1) * T - 3, T, 5);
    if (!isOwned(x - 1, y)) g.fillRect(x * T - 2, y * T, 5, T);
    if (!isOwned(x + 1, y)) g.fillRect((x + 1) * T - 3, y * T, 5, T);
  }
  // 設施的地板與牆
  for (const f of S.facs) {
    tile(g, FLOOR[f.type], f.x * T, f.y * T, F(f).w * T, F(f).h * T);
    if (!OUTDOOR[f.type]) wallBox(g, f);
  }
  staticLayer = c;
}
function wallBox(g, f) {
  const px = f.x * T, py = f.y * T, w = F(f).w * T, h = F(f).h * T;
  const d = f.door, side = f.side;
  g.fillStyle = '#4a3c35';
  const hseg = (y, isDoor) => {
    if (!isDoor) { g.fillRect(px - 2, y - 2, w + 4, 4); return; }
    g.fillRect(px - 2, y - 2, d[0] * T - px + 2, 4); g.fillRect((d[0] + 1) * T, y - 2, px + w - (d[0] + 1) * T + 2, 4);
  };
  const vseg = (x, isDoor) => {
    if (!isDoor) { g.fillRect(x - 2, py, 4, h); return; }
    g.fillRect(x - 2, py, 4, d[1] * T - py); g.fillRect(x - 2, (d[1] + 1) * T, 4, py + h - (d[1] + 1) * T);
  };
  hseg(py, side === 'top'); hseg(py + h, side === 'bottom');
  vseg(px, side === 'left'); vseg(px + w, side === 'right');
  if (!d) return;
  g.fillStyle = '#a07a4e';
  if (side === 'top' || side === 'bottom') g.fillRect(d[0] * T + 3, (side === 'top' ? py : py + h) - 2, T - 6, 4);
  else g.fillRect((side === 'left' ? px : px + w) - 2, d[1] * T + 3, 4, T - 6);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawPool(p, ox, oy, style, now) {
  const x = ox + p.x * T, y = oy + p.y * T, w = p.w * T, h = p.h * T;
  if (style === 'bath') {
    ctx.fillStyle = '#9c6b3f'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    ctx.fillStyle = '#c18d58'; ctx.fillRect(x - 5, y - 5, w + 10, 4);
  } else {
    ctx.save(); roundRect(x - 9, y - 9, w + 18, h + 18, Math.min(22, h / 2)); ctx.clip();
    const r = R.rock;
    for (let yy = y - 9; yy < y + h + 9; yy += 64) for (let xx = x - 9; xx < x + w + 9; xx += 64) ctx.drawImage(atlas, r[0], r[1], 64, 64, xx, yy, 64, 64);
    ctx.restore();
  }
  ctx.save();
  if (style === 'bath') { ctx.beginPath(); ctx.rect(x, y, w, h); } else roundRect(x, y, w, h, Math.min(16, h / 2));
  ctx.clip();
  ctx.fillStyle = style === 'bath' ? '#5fbfd6' : '#56b7b0'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < Math.max(4, w * h / 600); i++) {
    const px = x + ((i * 53 + now / 40) % w), py = y + ((i * 37) % h);
    ctx.fillRect(Math.round(px / 2) * 2, Math.round(py / 2) * 2, 6, 2);
  }
  ctx.restore();
}

function drawFac(f, now) {
  const L = f.lv, ox = f.x * T, oy = f.y * T;
  switch (f.type) {
    case 'room': {
      spr('futon_top', ox, oy + T); spr(['futon_blue', 'futon_gold', 'futon_purple'][L - 1], ox, oy + 2 * T);
      if (L >= 2) spr('bonsai_s', ox + 2 * T, oy - 0.1 * T); else spr('zabuton', ox + 2.1 * T, oy + 0.5 * T);
      if (L >= 3) { spr('heater', ox + 0.1 * T, oy); spr('vase', ox + 1.1 * T, oy - 0.6 * T); }
      break;
    }
    case 'bigroom': {
      const b = ['futon_blue', 'futon_gold', 'futon_purple'][L - 1];
      spr('futon_top', ox, oy + T); spr(b, ox, oy + 2 * T); spr('futon_top', ox + 2 * T, oy + T); spr(b, ox + 2 * T, oy + 2 * T);
      spr('zabuton', ox + 3.1 * T, oy + 0.05 * T);
      if (L >= 2) { spr('heater', ox + 0.1 * T, oy); spr('vase', ox + 1.4 * T, oy - 0.6 * T); }
      if (L >= 3) spr('pot', ox + 2.3 * T, oy + 0.05 * T);
      break;
    }
    case 'bath': {
      drawPool(POOLS.bath(L), ox, oy, 'bath', now);
      spr('shower', ox + 3.05 * T, oy - 0.2 * T); spr('bucket', ox + 3.1 * T, oy + 1.9 * T);
      if (L >= 2) { spr('bucket_blue', ox + 0.1 * T, oy); spr('duck', ox + 1.2 * T, oy + 1.2 * T); }
      if (L >= 3) spr('sink', ox + 1 * T, oy - 0.6 * T);
      break;
    }
    case 'family': {
      drawPool(POOLS.family(L), ox, oy, 'bath', now);
      spr('bucket', ox + 2.2 * T, oy - 0.1 * T);
      if (L >= 2) spr('duck', ox + 1.1 * T, oy + 1.3 * T);
      if (L >= 3) spr('bonsai_s', ox + 0.05 * T, oy - 0.9 * T);
      break;
    }
    case 'onsen': {
      drawPool(POOLS.onsen(L), ox, oy, 'onsen', now);
      if (L >= 2) spr('garland', ox + 1 * T, oy - 1.2 * T);
      if (L >= 3) spr('bonsai_l', ox + 5.1 * T, oy - 0.4 * T);
      break;
    }
    case 'footbath': {
      drawPool(POOLS.footbath(L), ox, oy, 'onsen', now);
      if (L >= 2) spr('pot', ox + 1.1 * T, oy + 1.05 * T);
      break;
    }
    case 'dining': {
      spr(L >= 3 ? 'dining_g' : 'dining', ox, oy);
      if (L >= 2) spr(L >= 3 ? 'dining_g' : 'dining', ox + 2 * T, oy);
      break;
    }
    case 'shop': {
      spr(L >= 2 ? 'crates_b' : 'crates_a', ox, oy);
      if (L >= 3) spr('flowers', ox + 1.6 * T, oy - 0.3 * T);
      break;
    }
    case 'lounge': {
      spr(L >= 2 ? 'sofa' : 'sofa_w', ox, oy + 0.9 * T);
      spr('fishbowl', ox + 0.15 * T, oy + 0.05 * T);
      if (L >= 2) spr('pot', ox + 2.1 * T, oy + 0.05 * T);
      if (L >= 3) spr('plant', ox + 1.1 * T, oy - 0.9 * T);
      break;
    }
    case 'karaoke': {
      spr('speaker_s', ox + 0.1 * T, oy - 0.5 * T);
      spr('mic', ox + 1.2 * T, oy + 0.1 * T);
      if (L >= 2) { spr('speaker', ox + 2.05 * T, oy - 1.0 * T); spr('keyboard', ox + 0.6 * T, oy + 1.15 * T); }
      if (L >= 3) spr('guitar', ox + 0.05 * T, oy + 1.2 * T);
      break;
    }
  }
  if (f.dirty) {
    ctx.fillStyle = 'rgba(90,70,50,.18)'; ctx.fillRect(ox, oy, F(f).w * T, F(f).h * T);
    label((f.x + F(f).w / 2) * T, (f.y + 0.4) * T, '🧹 待打掃', 'rgba(110,70,40,.85)');
  }
}

/** 世界座標裡的字:鏡頭縮小時字要放大 */
const kz = () => 1 / Math.min(1, cam.s);
function label(x, y, text, bg) {
  const k = kz();
  ctx.font = `bold ${Math.round(11 * k)}px "PingFang TC",sans-serif`;
  const w = ctx.measureText(text).width + 12 * k, hh = 18 * k;
  ctx.fillStyle = bg; roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + k);
}
function bubbleAt(x, y, text) {
  const k = kz();
  ctx.font = `${Math.round(13 * k)}px "PingFang TC",sans-serif`;
  const w = Math.max(24 * k, ctx.measureText(text).width + 12 * k), hh = 20 * k;
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  roundRect(x - w / 2, y - hh, w, hh, 8 * k); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4 * k, y); ctx.lineTo(x + 4 * k, y); ctx.lineTo(x, y + 5 * k); ctx.fill();
  ctx.fillStyle = '#3a2c22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - hh / 2);
}

function drawChar(char, x, y, dir, frame, moving, soak) {
  const r = R['char' + char];
  const f = dir * 6 + (Math.floor(frame) % 6);
  const sx = r[0] + f * 32, sy = r[1] + (moving ? 64 : 0);
  const dx = Math.round(x - 16), dy = Math.round(y - 60);
  if (soak) {
    ctx.drawImage(atlas, sx, sy, 32, 44, dx, dy + 8, 32, 44);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(dx + 6, dy + 50, 20, 2);
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(atlas, sx, sy, 32, 64, dx, dy, 32, 64);
}
const visible = g => !g.gone && g.state !== 'sleep';

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2b3a2a'; ctx.fillRect(0, 0, vw, vh);
  ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, -cam.x * cam.s * dpr, -cam.y * cam.s * dpr);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticLayer, 0, 0);

  const vis = guests.filter(visible);
  for (const f of [...S.facs].sort((a, b) => a.y - b.y)) {
    for (const g of vis) if (g.at === f.id && g.under) drawChar(g.char, g.x, g.y, g.dir, g.frame, false, false);
    drawFac(f, now);
  }
  drawChar(13, DESK.staff[0] * T, DESK.staff[1] * T, 3, now / 250, false, false);
  spr('counter', DESK.x * T, DESK.y * T);

  // 擺設、客人、員工一起按照 y 排序,才有前後遮擋
  const items = [];
  for (const d of S.decor) { const r = R[d.type]; items.push({ y: (d.y + 1) * T, draw: () => spr(d.type, d.x * T, (d.y + 1) * T - r[3]) }); }
  for (const g of vis) if (!g.under) items.push({ y: g.y, draw: () => drawChar(g.char, g.x, g.y, g.dir, g.frame, g.moving, g.soak) });
  for (const a of staff) items.push({ y: a.y, draw: () => drawChar(a.char, a.x, a.y, a.dir, a.frame, a.moving, false) });
  items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

  for (const f of S.facs) {
    if (!isRoom(f) || !guests.some(g => g.room === f.id && g.state === 'sleep')) continue;
    const k = (now / 600) % 1;
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('z', f.x * T + 40 + k * 8, f.y * T + 30 - k * 14);
    ctx.fillText('Z', f.x * T + 48 + k * 8, f.y * T + 22 - k * 16);
  }
  for (const p of parts) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - p.t)})`; ctx.fillRect(Math.round(p.x), Math.round(p.y - p.t * 26), 4 + Math.round(p.t * 4), 4 + Math.round(p.t * 4)); }
  drawWeather();

  const tint = seasonOf(S.day).tint;
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, WW, WH); }
  const dark = t < 0.05 ? (0.05 - t) * 6 : t > 0.72 ? Math.min(0.5, (t - 0.72) * 3.5) : 0;
  if (dark > 0) {
    ctx.fillStyle = `rgba(20,24,70,${dark})`; ctx.fillRect(0, 0, WW, WH);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, a) => {
      const gr = ctx.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, `rgba(255,190,90,${a})`); gr.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow((DESK.x + 1.5) * T, (DESK.y + 1) * T, 90, dark * 0.5);
    for (const f of S.facs) glow((f.x + F(f).w / 2) * T, (f.y + F(f).h / 2) * T, 60 + F(f).w * 8, dark * 0.33);
    for (const d of S.decor) if (d.type === 'garland') glow((d.x + 1.5) * T, (d.y + 0.5) * T, 70, dark * 0.7);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (mode === 'land') drawLandOverlay();
  if (mode === 'place' && place) drawGhost(now);
  if (selected) {
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3 * kz();
    const r = selected.fac ? facRect(selected.fac) : { x: selected.decor.x, y: selected.decor.y, w: decorW(selected.decor.type), h: 1 };
    ctx.strokeRect(r.x * T + 1, r.y * T + 1, r.w * T - 2, r.h * T - 2);
  }
  for (const a of [...vis, ...staff]) if (a.bubble) bubbleAt(a.x, a.y - (a.soak ? 50 : 66), a.bubble.text);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx) {
    ctx.globalAlpha = 1 - f.t;
    ctx.font = `bold ${Math.round(13 * kz())}px "PingFang TC",sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,25,10,.8)';
    ctx.strokeText(f.text, f.x, f.y - f.t * 24); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 24);
    ctx.globalAlpha = 1;
  }
}

function drawGhost(now) {
  const p = place, x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
  ctx.globalAlpha = 0.75;
  if (p.kind === 'decor') { const r = R[p.type]; spr(p.type, x, y + T - r[3]); }
  else { tile(ctx, FLOOR[p.type], x, y, w, h); drawFac({ type: p.type, x: p.x, y: p.y, lv: 1 }, now); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.reason ? 'rgba(230,60,60,.35)' : 'rgba(80,220,120,.3)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = p.reason ? '#ff5050' : '#5dff9b'; ctx.lineWidth = 3 * kz();
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
function buyableChunks() {
  const out = [];
  for (let cy = 0; cy < ROWS / CHUNK; cy++) for (let cx = 0; cx < COLS / CHUNK; cx++) {
    const k = `${cx},${cy}`;
    if (S.owned.includes(k)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => S.owned.includes(`${cx + dx},${cy + dy}`))) out.push({ cx, cy, k });
  }
  return out;
}
function drawLandOverlay() {
  const n = S.owned.length, cost = landCost(n), need = landNeed(n);
  for (const c of buyableChunks()) {
    const x = c.cx * CHUNK * T, y = c.cy * CHUNK * T, s = CHUNK * T;
    const pick = landPick && landPick.k === c.k;
    ctx.fillStyle = pick ? 'rgba(255,216,74,.35)' : 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = pick ? '#ffd84a' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 3 * kz(); ctx.setLineDash([10, 8]);
    ctx.strokeRect(x + 4, y + 4, s - 8, s - 8); ctx.setLineDash([]);
    label(x + s / 2, y + s / 2, stars() < need ? `🔒 ${need}★` : `🗺 ¥${cost.toLocaleString()}`, 'rgba(40,30,20,.85)');
  }
}

function drawWeather() {
  const se = seasonOf(S.day);
  const kind = event && event.id === 'rain' ? 'rain' : se.name === '春' ? 'petal' : se.name === '秋' ? 'leaf' : se.name === '冬' ? 'snow' : null;
  if (!kind) return;
  // 只下在戶外:還沒買的地、露天的設施
  ctx.save(); ctx.beginPath();
  for (let cy = 0; cy < ROWS / CHUNK; cy++) for (let cx = 0; cx < COLS / CHUNK; cx++) if (!S.owned.includes(`${cx},${cy}`)) ctx.rect(cx * CHUNK * T, cy * CHUNK * T, CHUNK * T, CHUNK * T);
  for (const f of S.facs) if (OUTDOOR[f.type]) ctx.rect(f.x * T, f.y * T, F(f).w * T, F(f).h * T);
  ctx.clip();
  ctx.fillStyle = { rain: 'rgba(200,220,255,.6)', snow: 'rgba(255,255,255,.9)', petal: 'rgba(255,190,210,.9)', leaf: 'rgba(220,120,40,.9)' }[kind];
  for (const w of weather) ctx.fillRect(w.x, w.y, kind === 'rain' ? 1 : 3, kind === 'rain' ? 8 : 3);
  ctx.restore();
}
function stepParticles(dt) {
  for (const f of S.facs) {
    if (!F(f).pool) continue;
    const p = POOLS[f.type](f.lv);
    const rate = (f.type === 'onsen' ? 5 : 2) * (seasonOf(S.day).name === '冬' ? 2 : 1);
    if (Math.random() < dt * rate) parts.push({ x: (f.x + p.x + Math.random() * p.w) * T, y: (f.y + p.y + Math.random() * p.h) * T, t: 0 });
  }
  for (const p of parts) p.t += dt * 0.5;
  parts = parts.filter(p => p.t < 1);
  const rain = event && event.id === 'rain';
  if (weather.length < (rain ? 160 : 90)) weather.push({ x: Math.random() * WW, y: -10, v: rain ? 260 : 18 + Math.random() * 20, s: Math.random() * 6 });
  for (const w of weather) { w.y += w.v * dt; w.x += Math.sin(w.y / 20 + w.s) * (rain ? 0 : 0.4); }
  weather = weather.filter(w => w.y < WH);
  for (const f of fx) f.t += dt * 0.8;
  fx = fx.filter(f => f.t < 1);
}

// ============================================================
//  介面:HUD、提示、面板、選單
// ============================================================
function hud() {
  if (!S) return;
  $('money').textContent = '¥' + S.money.toLocaleString();
  $('ideas').textContent = '💡' + S.ideas;
  const st = stars();
  $('rank').textContent = '★'.repeat(st) + '☆'.repeat(5 - st);
  $('nation').textContent = `全國 #${rankOf(S.rep)}`;
  const se = seasonOf(S.day);
  $('day').textContent = `${Math.floor((S.day - 1) / YEAR_DAYS) + 1}年 第${(S.day - 1) % YEAR_DAYS + 1}天 ${se.icon}${se.name}`;
  const next = STAR_REP[st];
  $('repFill').style.width = next ? `${Math.min(100, (S.rep - STAR_REP[st - 1]) / (next - STAR_REP[st - 1]) * 100)}%` : '100%';
}
function clockText() {
  const mins = Math.floor(7 * 60 + t * 17 * 60);
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${t > 0.72 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
}
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3000);
}

// ---------- 選單(底部抽屜)----------
function openSheet(title, html) {
  closePanel();
  $('sheetTitle').textContent = title;
  $('sheetBody').innerHTML = html;
  $('sheet').classList.add('on');
}
function closeSheet() { $('sheet').classList.remove('on'); }
$('sheetClose').addEventListener('click', closeSheet);
$('sheetBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const [act, id] = b.dataset.act.split(':');
  ({ build: startPlaceFac, decor: startPlaceDecor, research: doResearch, hire: doHire, ad: doAd })[act](id);
});

function itemHTML({ act, icon, name, sub, cost, lockText, disabled }) {
  return `<button class="item" data-act="${act}" ${disabled ? 'disabled' : ''}>
    <span class="ic">${icon}</span><span class="tx"><b>${name}</b><small>${sub}</small></span>
    <span class="pr">${lockText || cost}</span></button>`;
}
function openBuild() {
  const st = stars();
  openSheet('🔨 建造設施', FAC_ORDER.map(id => {
    const d = FAC[id];
    const lock = !unlocked(id) ? '需要研究' : st < d.need[0] ? `🔒 ${d.need[0]}★` : '';
    return itemHTML({ act: 'build:' + id, icon: d.icon, name: `${d.name} <span class="sz">${d.w}×${d.h}</span>`, sub: d.desc, cost: '¥' + d.cost[0].toLocaleString(), lockText: lock, disabled: !!lock || S.money < d.cost[0] });
  }).join(''));
}
function openDecor() {
  openSheet('🌿 擺設(放走道上,附近 2 格的設施會變好)', DECOR_ORDER.map(id => {
    const d = DECOR[id];
    const lock = !unlocked(id) ? '需要研究' : '';
    const r = R[id];
    const pic = `<span class="pic" style="background-image:url(${BASE}onsen/atlas.png);background-position:-${r[0]}px -${r[1]}px;width:${r[2]}px;height:${r[3]}px"></span>`;
    return itemHTML({ act: 'decor:' + id, icon: pic, name: d.name, sub: `風雅 +${d.val}${d.plant ? ' · 植物' : ''}`, cost: '¥' + d.cost, lockText: lock, disabled: !!lock || S.money < d.cost });
  }).join(''));
}
function openResearch() {
  const st = stars();
  openSheet(`💡 研究(靈感 ${S.ideas})—— 客人退房時會給靈感`, RESEARCH.map(r => {
    const done = S.research.includes(r.id);
    const lock = done ? '✅ 已研究' : st < r.need ? `🔒 ${r.need}★` : '';
    const what = r.fac ? `新設施:${FAC[r.fac].desc}` : r.decor ? `新擺設:風雅 +${DECOR[r.decor].val}` : r.perk;
    return itemHTML({ act: 'research:' + r.id, icon: r.fac ? FAC[r.fac].icon : r.decor ? '🌿' : '📘', name: r.name, sub: what, cost: '💡' + r.cost, lockText: lock, disabled: !!lock || S.ideas < r.cost });
  }).join(''));
}
function openStaff() {
  const max = staffMax(stars()), cost = STAFF_HIRE(S.staff);
  const dirty = S.facs.filter(f => f.dirty).length;
  openSheet('👥 員工', `<p class="note">員工會打掃退房後的房間。房間沒打掃好,新客人就不能住。<br>
    現在 <b>${S.staff}</b> 位(最多 ${max} 位,星星越多可以請越多)· 每人每天薪水 ¥${STAFF_SALARY} · 待打掃 ${dirty} 間</p>` +
    itemHTML({ act: 'hire:x', icon: '🧹', name: '再請一位員工', sub: `每天薪水 ¥${STAFF_SALARY}`, cost: '¥' + cost, lockText: S.staff >= max ? `🔒 已滿 ${max} 位` : '', disabled: S.staff >= max || S.money < cost }));
}
function openAds() {
  const st = stars();
  const now = Object.keys(S.ads).length ? '進行中:' + Object.entries(S.ads).map(([k, v]) => `${ADS.find(a => a.id === k).name}(剩 ${v} 天)`).join('、') : '目前沒有宣傳';
  openSheet(`📣 宣傳(效果 ${AD_DAYS} 天)`, `<p class="note">${now}</p>` +
    ADS.map(a => itemHTML({ act: 'ad:' + a.id, icon: '📣', name: a.name, sub: a.text, cost: '¥' + adCost(a).toLocaleString(), lockText: S.ads[a.id] ? '進行中' : st < a.need ? `🔒 ${a.need}★` : '', disabled: !!S.ads[a.id] || st < a.need || S.money < adCost(a) })).join(''));
}
function openBook() {
  openSheet(`📖 圖鑑(組合 ${S.combos.length}/${COMBOS.length})`, COMBOS.map(c => {
    const got = S.combos.includes(c.id);
    return `<div class="item ${got ? '' : 'dim'}"><span class="ic">${got ? '🎉' : '❔'}</span><span class="tx"><b>${got ? c.name : '???'}</b><small>${got ? c.effect : '提示:' + c.hint}</small></span><span class="pr">${got && comboOn(c.id) ? '生效中' : ''}</span></div>`;
  }).join('') + `<p class="note">最佳全國排名:${S.bestRank ? '#' + S.bestRank : '還沒有(每年年底結算)'} · 總共招待 ${S.stats.guests} 位客人 · 5 星評價 ${S.stats.best5} 則</p>`);
}

function doResearch(id) {
  const r = RESEARCH.find(x => x.id === id);
  if (S.ideas < r.cost || S.research.includes(id)) return;
  S.ideas -= r.cost; S.research.push(id);
  fanfare(); toast(`💡 研究完成:${r.name}!`);
  hud(); openResearch(); save();
}
function doHire() {
  const cost = STAFF_HIRE(S.staff);
  if (S.money < cost || S.staff >= staffMax(stars())) return;
  S.money -= cost; S.staff++; syncStaff();
  tone(880, 0.1, 'triangle', 0.15); toast('🧹 新員工來上班了!');
  hud(); openStaff(); save();
}
const adCost = a => Math.round(a.cost * (has('pr') ? 0.6 : 1));
function doAd(id) {
  const a = ADS.find(x => x.id === id);
  if (S.money < adCost(a) || S.ads[id]) return;
  S.money -= adCost(a); S.ads[id] = AD_DAYS + (has('pr') ? 1 : 0);
  tone(660, 0.1, 'square', 0.08); toast(`📣 「${a.name}」宣傳開始,明天起 ${a.text}`);
  hud(); openAds(); save();
}

// ---------- 擺放模式 ----------
function centerTile() { return [Math.floor((cam.x + vw / cam.s / 2) / T), Math.floor((cam.y + vh / cam.s / 2) / T)]; }
function startPlaceFac(type) {
  closeSheet();
  const d = FAC[type], [cx, cy] = centerTile();
  place = { kind: 'fac', type, w: d.w, h: d.h, x: cx - Math.floor(d.w / 2), y: cy - Math.floor(d.h / 2), cost: d.cost[0], name: d.name };
  mode = 'place'; updatePlace();
}
function startPlaceDecor(type) {
  closeSheet();
  const [cx, cy] = centerTile();
  place = { kind: 'decor', type, w: decorW(type), h: 1, x: cx, y: cy, cost: DECOR[type].cost, name: DECOR[type].name };
  mode = 'place'; updatePlace();
}
function updatePlace() {
  place.reason = canPlace(place.w, place.h, place.x, place.y);
  if (!place.reason && S.money < place.cost) place.reason = '錢不夠';
  $('pbText').textContent = place.reason ? `${place.name}:${place.reason}` : `${place.name} ¥${place.cost.toLocaleString()} · 點畫面換位置`;
  $('pbOk').disabled = !!place.reason;
  $('pbOk').textContent = '✔ 蓋在這裡';
  $('placeBar').classList.add('on');
}
function confirmPlace() {
  if (mode === 'land') { buyLand(); return; }
  if (!place || place.reason) return;
  S.money -= place.cost;
  const id = (place.kind === 'fac' ? 'f' : 'd') + (S.nextId++);
  if (place.kind === 'fac') S.facs.push({ id, type: place.type, x: place.x, y: place.y, lv: 1 });
  else S.decor.push({ id, type: place.type, x: place.x, y: place.y });
  rebuild();
  noise(0.3, 0.06, 600); [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.16), i * 90));
  float((place.x + place.w / 2) * T, place.y * T, '完成!', '#ffd84a');
  hud(); save();
  if (place.kind === 'decor' && S.money >= place.cost) updatePlace();      // 擺設可以連續擺
  else endMode();
}
function endMode() { mode = 'normal'; place = null; landPick = null; $('placeBar').classList.remove('on'); }
$('pbOk').addEventListener('click', confirmPlace);
$('pbCancel').addEventListener('click', endMode);

// ---------- 買地 ----------
function openLand() {
  closeSheet(); closePanel();
  mode = 'land'; landPick = null;
  const n = S.owned.length;
  $('pbText').textContent = buyableChunks().length ? `點一塊相鄰的地(下一塊 ¥${landCost(n).toLocaleString()},需要 ${landNeed(n)}★)` : '已經買下所有土地了!';
  $('pbOk').disabled = true; $('pbOk').textContent = '🗺 買下';
  $('placeBar').classList.add('on');
  cam.s = Math.max(minScale(), Math.min(cam.s, 0.8)); clampCam();
}
function pickLand(wx, wy) {
  const cx = Math.floor(wx / T / CHUNK), cy = Math.floor(wy / T / CHUNK);
  const c = buyableChunks().find(c => c.cx === cx && c.cy === cy);
  if (!c) return;
  landPick = c;
  const n = S.owned.length, cost = landCost(n), need = landNeed(n);
  const why = stars() < need ? `需要 ${need}★` : S.money < cost ? '錢不夠' : '';
  $('pbText').textContent = why ? `這塊地 ¥${cost.toLocaleString()}:${why}` : `買下這塊地 ¥${cost.toLocaleString()}?`;
  $('pbOk').disabled = !!why;
}
function buyLand() {
  if (!landPick) return;
  const n = S.owned.length, cost = landCost(n);
  if (S.money < cost || stars() < landNeed(n)) return;
  S.money -= cost; S.owned.push(landPick.k);
  rebuild(); fanfare(); toast('🗺 土地擴大了!可以蓋更多設施');
  hud(); save(); endMode();
}

// ---------- 設施 / 擺設面板 ----------
function openPanel(sel) {
  closeSheet();
  selected = sel;
  if (sel.decor) {
    const d = DECOR[sel.decor.type];
    $('pIcon').textContent = '🌿'; $('pName').textContent = d.name;
    $('pDesc').textContent = `風雅 +${d.val}。讓附近 2 格內的設施客人更滿意。`;
    $('pStat').textContent = '';
    $('pBtn').style.display = 'none';
    $('pSell').textContent = `收起(退 ¥${Math.floor(d.cost / 2)})`;
  } else {
    const f = sel.fac, d = F(f), L = f.lv, st = stars();
    const stat = [];
    if (isRoom(f)) stat.push(`房價 ¥${d.price[L - 1]}/人`, `住 ${d.group} 人`, `舒適 +${d.comfort[L - 1]}`);
    if (d.sat) stat.push(`滿意 +${d.sat[L - 1]}`);
    if (d.cap) stat.push(`${d.cap[L - 1]} 人`);
    if (d.fee) stat.push(`消費 ¥${d.fee[L - 1]}`);
    if (f.aura) stat.push(`擺設 +${f.aura}`);
    if (f.comboNames && f.comboNames.length) stat.push('🎉' + f.comboNames.join('、'));
    if (isRoom(f)) stat.push(f.dirty ? '🧹 待打掃' : guests.some(g => g.room === f.id) ? '有客人' : '空房');
    if (!f.door) stat.push('⚠️ 沒有路進去');
    $('pIcon').textContent = d.icon;
    $('pName').textContent = `${d.name} · ${'●'.repeat(L)}${'○'.repeat(3 - L)}`;
    $('pDesc').textContent = d.desc;
    $('pStat').textContent = stat.join(' · ');
    const btn = $('pBtn'); btn.style.display = '';
    if (L >= 3) { btn.textContent = '已經是最高級'; btn.disabled = true; }
    else if (st < d.need[L]) { btn.textContent = `🔒 升級需要 ${d.need[L]}★`; btn.disabled = true; }
    else { btn.textContent = `升級 ¥${d.cost[L].toLocaleString()}`; btn.disabled = S.money < d.cost[L]; }
    const refund = Math.floor(d.cost.slice(0, L).reduce((a, b) => a + b, 0) / 2);
    $('pSell').textContent = `拆除(退 ¥${refund.toLocaleString()})`;
  }
  $('panel').classList.add('on');
}
function closePanel() { selected = null; $('panel').classList.remove('on'); }
$('pClose').addEventListener('click', closePanel);
$('pBtn').addEventListener('click', () => {
  const f = selected && selected.fac; if (!f) return;
  const d = F(f), L = f.lv;
  if (L >= 3 || S.money < d.cost[L] || stars() < d.need[L]) return;
  S.money -= d.cost[L]; f.lv++;
  f.occ = (f.occ || []).slice(0, spotsOf(f).length);
  rebuild();
  noise(0.3, 0.06, 600); [523, 784, 1047].forEach((fq, i) => setTimeout(() => tone(fq, 0.15, 'triangle', 0.16), i * 90));
  float((f.x + d.w / 2) * T, f.y * T, '升級!', '#ffd84a');
  hud(); openPanel({ fac: f }); save();
});
$('pSell').addEventListener('click', () => {
  if (!selected) return;
  if (selected.decor) {
    const d = selected.decor;
    S.decor = S.decor.filter(x => x !== d); S.money += Math.floor(DECOR[d.type].cost / 2);
  } else {
    const f = selected.fac;
    if (guests.some(g => g.room === f.id || g.at === f.id || g.target === f.id) || staff.some(a => a.target === f.id)) { toast('有人在用,等他們離開再拆'); return; }
    if (!confirm(`確定要拆掉${F(f).name}嗎?`)) return;
    S.facs = S.facs.filter(x => x !== f);
    S.money += Math.floor(F(f).cost.slice(0, f.lv).reduce((a, b) => a + b, 0) / 2);
  }
  closePanel(); rebuild(); hud(); save();
});

function showGuest(g) {
  const face = g.sat >= 80 ? '😆' : g.sat >= 65 ? '😊' : g.sat >= 50 ? '🙂' : g.sat >= 35 ? '😐' : '😞';
  bubble(g, `${TYPES[g.type].name}${g.vip ? '📰' : ''} ${face} 愛${TYPES[g.type].likes.map(k => FAC[k].icon).join('')}`, 3);
}
function starUp() {
  const st = stars();
  fanfare();
  toast(`⭐ 升到 ${st} 星旅館!可以買更多地、蓋新設施、請更多員工`);
  if (st === 5) setTimeout(() => toast('🎉 五星旅館!下一個目標:全國第一!'), 3200);
}

// ---------- 一天結算 ----------
function showSummary() {
  const r = today.reviews;
  const avg = r.length ? r.reduce((s, x) => s + x.st, 0) / r.length : 0;
  $('sTitle').textContent = `第 ${S.day} 天結束`;
  $('sIncome').textContent = '¥' + today.income.toLocaleString();
  $('sSalary').textContent = '-¥' + today.salary.toLocaleString();
  $('sServed').textContent = today.served;
  $('sAvg').textContent = r.length ? `${avg.toFixed(1)}★` : '—';
  $('sIdeas').textContent = '💡+' + today.ideas;
  $('sTurned').textContent = today.turned ? `有 ${today.turned} 組客人沒辦法入住` : '';
  $('sYear').innerHTML = today.year ? `<div class="year">🏆 年度全國溫泉旅館排行:<b>第 ${today.year.rank} 名</b>${today.year.reward ? `<br>獎金 ¥${today.year.reward.toLocaleString()} + 💡10` : ''}</div>` : '';
  $('sReviews').innerHTML = r.length ? shuffle(r).slice(0, 3).map(x => `
    <div class="review"><span class="rs">${'★'.repeat(x.st)}</span><span class="rt">「${escapeHTML(x.text)}」</span>
    <span class="rw">— ${TYPES[x.type].name}${x.vip ? '(雜誌記者)' : ''}</span></div>`).join('')
    : '<div class="review"><span class="rt">今天還沒有人退房。客人住一晚,明天早上才會留評價。</span></div>';
  const st = stars(), next = STAR_REP[st];
  $('sRep').textContent = (next ? `口碑 ${S.rep} / ${next}(下一顆星)` : `口碑 ${S.rep} · 五星!`) + ` · 全國 #${rankOf(S.rep)}`;
  $('summary').classList.add('on');
  fanfare();
}
$('sNext').addEventListener('click', () => {
  $('summary').classList.remove('on');
  inSummary = false; S.day++; startDay(); save();
});

// ---------- 速度、縮放、工具列 ----------
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  const v = Number(b.dataset.speed);
  paused = v === 0; if (v) speed = v;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
}));
$('zIn').addEventListener('click', () => zoomAt(1.25, vw / 2, vh / 2));
$('zOut').addEventListener('click', () => zoomAt(0.8, vw / 2, vh / 2));
const TOOLS = { tBuild: openBuild, tDecor: openDecor, tLand: openLand, tResearch: openResearch, tStaff: openStaff, tAds: openAds, tBook: openBook };
for (const [id, fn] of Object.entries(TOOLS)) $(id).addEventListener('click', () => { if (mode !== 'normal') endMode(); tone(600, 0.04, 'square', 0.05); fn(); });

// ---------- 輸入:拖曳移動、兩指縮放、點一下 ----------
const ptrs = new Map();
let drag = null, pinch = null;
const worldAt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / cam.s + cam.x, (e.clientY - r.top) / cam.s + cam.y]; };
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; drag = null;
  } else drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) {
    // 電腦滑鼠:擺放時跟著游標
    if (mode === 'place' && place && e.pointerType === 'mouse') { const [wx, wy] = worldAt(e); movePlace(wx, wy); }
    return;
  }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const r = cv.getBoundingClientRect();
    const k = pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / cam.s;
    zoomAt(k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (drag.moved) { cam.x = drag.cx - dx / cam.s; cam.y = drag.cy - dy / cam.s; clampCam(); }
});
const endPtr = e => {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const tap = !drag.moved; drag = null;
  if (tap && !inSummary && e.type === 'pointerup') { const [wx, wy] = worldAt(e); tapWorld(wx, wy); }
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

function movePlace(wx, wy) {
  const nx = Math.floor(wx / T - place.w / 2 + 0.5), ny = Math.floor(wy / T - place.h / 2 + 0.5);
  if (nx === place.x && ny === place.y) return;
  place.x = nx; place.y = ny; updatePlace();
}
function tapWorld(wx, wy) {
  if (mode === 'place') { movePlace(wx, wy); tone(500, 0.03, 'square', 0.04); return; }
  if (mode === 'land') { pickLand(wx, wy); return; }
  const all = [...guests.filter(visible), ...staff].sort((a, b) => b.y - a.y);
  const g = all.find(g => Math.abs(wx - g.x) < 13 && wy < g.y + 2 && wy > g.y - 46);
  if (g) { if (g.type) showGuest(g); else bubble(g, g.state === 'cleaning' ? '打掃中 🧹' : '待命中', 2); tone(700, 0.05, 'sine', 0.1); return; }
  const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
  const o = occ[ty] && occ[ty][tx];
  if (o && o.fac) { openPanel({ fac: o.fac }); tone(600, 0.05, 'sine', 0.1); return; }
  if (o && o.decor) { openPanel({ decor: o.decor }); tone(600, 0.05, 'sine', 0.1); return; }
  closePanel(); closeSheet();
}

// ============================================================
//  主迴圈
// ============================================================
let last = 0, panelAt = 0;
function step(dt) {
  updateDay(dt); updateDesk(dt);
  for (const g of guests) updateGuest(g, dt);
  guests = guests.filter(g => !g.gone);
  for (const a of staff) updateStaff(a, dt);
  stepParticles(dt);
}
function loop(now) {
  const real = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (running) {
    if (!paused && !inSummary) step(real * speed); else stepParticles(0);
    $('clock').textContent = clockText();
    if (selected && now - panelAt > 600) {
      panelAt = now;
      if (selected.fac && !facById(selected.fac.id)) closePanel(); else openPanel(selected);
    }
    draw(now);
  }
  requestAnimationFrame(loop);
}

// ---------- 開始 ----------
function show(id) { for (const s of ['startScreen', 'gameScreen']) $(s).classList.toggle('on', s === id); }
async function start(fresh) {
  await atlasReady;
  S = fresh ? freshSave() : (readJSON(SAVE_KEY, null) || freshSave());
  S.ads = S.ads || {}; S.research = S.research || []; S.combos = S.combos || [];
  guests = []; staff = []; fx = []; parts = []; deskQueue = [];
  for (const f of S.facs) f.occ = [];
  show('gameScreen');
  resize();
  rebuild();
  syncStaff();
  for (const z of S.sleepers || []) {
    const r = facById(z.room); if (!r) continue;
    guests.push({ id: nextGuestId++, char: z.char, type: z.type, group: z.group, size: 1, room: z.room, at: z.room, spot: 0,
      x: (r.x + 1.5) * T, y: (r.y + 2.5) * T, dir: 3, moving: false, state: 'sleep', path: [], timer: 0,
      sat: z.sat, plan: [], vip: z.vip, bubble: null, frame: 0, waited: 0, favHit: null });
  }
  focusOwned();
  startDay();
  running = true;
  if (innerHeight > innerWidth) setTimeout(() => toast('📱 手機橫放看得比較多;兩指可以縮放,一指拖曳移動'), 3200);
}
$('startBtn').addEventListener('click', () => start(false));
$('newBtn').addEventListener('click', () => {
  if (readJSON(SAVE_KEY, null) && !confirm('確定要重新開一間旅館嗎?現在的進度會不見。')) return;
  start(true);
});
$('backBtn').addEventListener('click', () => { save(); running = false; closePanel(); closeSheet(); endMode(); refreshStart(); show('startScreen'); });
function refreshStart() {
  const s = readJSON(SAVE_KEY, null);
  if (s) {
    $('startBtn').textContent = `繼續經營(第 ${s.day} 天 · ${'★'.repeat(starsOf(s.rep))})`;
    $('newBtn').style.display = '';
  } else {
    $('startBtn').textContent = '開一間溫泉旅館!';
    $('newBtn').style.display = 'none';
    // v1 的舊存檔格式不相容
    if (readJSON(saveKey('onsen', 'save'), null)) $('oldNote').style.display = '';
  }
}
refreshStart();

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉
if (import.meta.env.DEV) window.ON = {
  get S() { return S; }, guests: () => guests, staff: () => staff, t: () => t, rebuild, canPlace, tapWorld, openPanel, facById,
  advance(sec, st = 0.05) { for (let s = 0; s < sec && !inSummary; s += st) step(st * speed); $('clock').textContent = clockText(); draw(performance.now()); },
  place(kind, type, x, y) { if (kind === 'fac') startPlaceFac(type); else startPlaceDecor(type); place.x = x; place.y = y; updatePlace(); const r = place.reason; if (!r) confirmPlace(); else endMode(); return r; },
  buy(cx, cy) { mode = 'land'; landPick = { cx, cy, k: `${cx},${cy}` }; buyLand(); },
  money(n) { S.money += n; hud(); }, rep(n) { S.rep += n; hud(); }, ideas(n) { S.ideas += n; hud(); }, research: doResearch, hire: doHire, ad: doAd,
  upgrade(id) { selected = { fac: facById(id) }; $('pBtn').click(); closePanel(); },
  inSummary: () => inSummary, next: () => $('sNext').click(),
};
requestAnimationFrame(loop);
