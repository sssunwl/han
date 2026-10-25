/* 雪糕店：點單／製作／找錢／座位的即時經營遊戲。持久資料只有 S，客人只留在當天記憶體。 */
import * as Y from '../../shared/tycoon/index.js';
import * as D from './data.js';
import { toCanvas } from '../../shared/pixelkit/core.js';
import { KIT, wall } from '../../shared/pixelkit/furniture.js';
import { ICE_KIT, treat, tub } from '../../shared/pixelkit/icecream.js';
import { makeCharacter, randomLook, FW, FH } from '../../shared/pixelkit/character.js';
import { tone, noise, fanfare, renderWho, lockGestures, readJSON, writeJSON, audioPrefs, saveAudioPrefs,
  escapeHTML as esc } from '../../shared/kit.js';
import { playMusic, stopMusic } from '../../shared/music.js';
import { saveKey } from '../../shared/profile.js';
import '../../shared/offline.js';
const $ = id => document.getElementById(id);
const {
  T,
  COLS,
  ROWS,
  FLAVORS,
  SEATS,
  DECOR,
  TYPES,
  LOCATIONS,
  RESEARCH,
  TOPPINGS,
  ROLES,
  THEMES,
  MILESTONES
} = D;

// ===== 存檔與裝置設定 =====
const key = saveKey('icecream', 'save1');
const codec = Y.makeCodec({
  prefix: 'ICE1',
  name: '雪糕店',
  validate: o => o.v === 1 && Array.isArray(o.seats)
});
const settings = Object.assign({
  math: true
}, readJSON('icecream-settings', {}));
const toast = Y.makeToast($('toast'), 4300);
const badge = Y.saveBadge($('saveDot'), kind => toast(kind === 'fail' ? '⚠ 存不了檔，請回開始畫面備份存檔碼！' : '⚠ 空間快滿了，已改存備用位置，記得備份存檔碼。'));

// ===== 即時狀態 =====
let S = null;
let running = false;
let paused = false;
let speed = 1;
let guests = [];
let staff = [];
let arrivals = [];
let queue = new Y.Queue();
let windows = [];
let summary = false;
let choice = null;
let contest = false;
let pendingChange = null;
let contestSelected = [];
let contestDone = false;
let selected = null;
let tab = '';
let stockSlot = null;
let craft = {
  kind: null,
  scoops: [],
  topping: null
};
let craftGuest = null;
let dirtyUI = true;
let nextId = 1;
let floaters = [];
let last = 0;
let ngPending = null;
let locationOptions = [];
let locationReturn = null;
const clock = new Y.DayClock({
  seconds: D.DAY_SECONDS,
  openHour: 10,
  closeHour: 20
});
const cv = $('world');
const ctx = cv.getContext('2d');
const cam = new Y.Camera(cv, {
  worldW: 960,
  worldH: 448
});
const grid = new Y.Grid(COLS, ROWS);
let rnd = Math.random;
let dayStats = null;
let dayEvent = '';
let choiceSeen = false;
const star = () => D.starsOf(S?.rep || 0);
const loc = () => LOCATIONS.find(l => l.id === S.location);
const season = () => Math.floor((S.day - 1) / 7) % 4;
const totalSeats = () => S.seats.reduce((n, s) => n + SEATS[s.type].seats, 0);
const charm = () => S.decor.reduce((n, o) => n + DECOR[o.type].val, 0) + (S.floor === 'wood' ? 3 : S.floor === 'mint' ? 5 : 0) +
  (S.wall === 'mint' ? 0 : S.wall === 'pink' ? 3 : 5);
const has = id => S.research.includes(id);
const stocked = () => [...new Set(S.stock.flat().filter(Boolean))];
const available = () => Object.values(FLAVORS).filter(f => (S.learned.includes(f.id) || f.season === season()) && (!f.ng || S.ng > 0) &&
  (!('season' in f) || f.season === season()));
const modSum = k => S.mods.reduce((n, m) => n + (Number(m[k]) || 0), 0);
const modHas = k => S.mods.some(m => m[k]);
const rect = o => ({
  ...o,
  w: (SEATS[o.type] || DECOR[o.type]).w,
  h: (SEATS[o.type] || DECOR[o.type]).h
});

// ===== 開局資料 =====
// 同一局的喜好只抽一次並存入 S；換分店才重新抽，方便玩家逐步發現最愛。
function fresh(location, seed = Date.now() % 2147483647) {
  const r = Y.rng(seed);
  const l = LOCATIONS.find(l => l.id === location) || LOCATIONS[0];
  const pool = Object.values(FLAVORS).filter(f => !('season' in f) && !f.ng).map(f => f.id);
  const favs = {};
  for (const t of Object.keys(TYPES)) {
    const a = [...pool].sort(() => r() - .5);
    favs[t] = a.slice(0, 2);
  }
  return {
    v: 1,
    seed,
    location: l.id,
    day: 1,
    dayDone: false,
    money: 300,
    ideas: 0,
    rep: 0,
    lots: 2,
    freezers: 1,
    windows: 1,
    stock: [['vanilla', 'strawberry', 'chocolate', l.fourth]],
    learned: [...new Set(['vanilla', 'strawberry', 'chocolate', l.fourth])],
    toppings: [],
    research: [],
    crew: [],
    seats: [{
      id: 1,
      type: 'table2',
      x: 4,
      y: 8
    }],
    decor: [{
      id: 2,
      type: 'plant_round',
      x: 9,
      y: 10,
      flip: false
    }],
    floor: l.floor || 'check',
    wall: l.wall || 'mint',
    styles: ['floor:check', 'wall:mint', ...(l.floor ? ['floor:' + l.floor] : []), ...(l.wall ? ['wall:' + l.wall] : [])],
    price: 'standard',
    favs,
    revealed: {},
    wishLog: {},
    stats: {
      served: 0,
      earned: 0,
      five: 0,
      balls: 0
    },
    milestones: [],
    trophies: [],
    mods: [],
    perm: [],
    choiceLog: [],
    ng: 0,
    career: {
      days: 0,
      served: 0,
      earned: 0
    },
    contestWins: 0,
    streak: 0,
    bestReview: '',
    reports: [],
    theme: Math.floor(r() * THEMES.length),
    legend: false,
    ended: false,
    tutorial: {}
  };
}
function normalize(s) {
  const base = fresh(s.location, s.seed);
  for (const [k, v] of Object.entries(base)) {
    if (s[k] === undefined) {
      s[k] = v;
    }
  }
  s.seats.forEach(o => {
    delete o.dirty;
    delete o.occupied;
  });
  return s;
}

// ===== 存檔 =====
// 搬移時原物件暫時不在 S，存檔快照要加回去，避免離頁時家具消失。
async function save() {
  if (!S) {
    return;
  }
  const data = structuredClone(S);
  if (placer.original) {
    const {
      kind,
      ...o
    } = placer.original;
    data[kind === 'seat' ? 'seats' : 'decor'].push(structuredClone(o));
  }
  data.seats.forEach(o => {
    delete o.dirty;
    delete o.occupied;
  });
  data.savedAt = Date.now();
  S.savedAt = data.savedAt;
  const r = Y.saveBoth(key, data);
  const ok = await r.idb;
  badge(r.ls ? 'ok' : ok ? 'backup' : 'fail');
}
Y.autoSave({
  save,
  active: () => running
});

// ===== 開始與地點選擇 =====
function startLabel() {
  $('startBtn').textContent = S ? `繼續營業（第 ${S.day + (S.dayDone ? 1 : 0)} 天 · ${'★'.repeat(star())} · ${loc().name}）` : '開店！';
  $('trophies').innerHTML = S?.trophies?.length ? '<p>🏆 獎盃牆</p>' +
    S.trophies.map(t => `<small>${esc(t.name)} · 第 ${t.day} 天</small>`).join('') : '';
}
function chooseLocation(old = null, carryId = null) {
  // 開始與結局都是全螢幕圖層，先藏起來，讓選店面的卡片能顯示與接收點擊。
  locationReturn = { startHidden: $('start').hidden, endingHidden: $('ending').hidden };
  $('start').hidden = true;
  $('ending').hidden = true;
  ngPending = old ? {
    old,
    carryId
  } : null;
  const options = LOCATIONS.filter(l => l.id !== old?.location);
  locationOptions = [...options].sort(() => Math.random() - .5).slice(0, 3);
  $('locations').innerHTML = locationOptions.map((l,
    i) => `<button data-location="${i}"><b>${l.name}</b><small>${l.desc}</small><small>招牌：${FLAVORS[
    l.fourth].name}</small></button>`).join('');
  $('location').hidden = false;
}
function cancelLocation() {
  // 尚未選定地點就不改存檔；取消分店選址時回結局，取消開店時回開始畫面。
  $('location').hidden = true;
  $('start').hidden = locationReturn?.startHidden ?? false;
  $('ending').hidden = locationReturn?.endingHidden ?? true;
  ngPending = null;
  locationReturn = null;
}

function openLocation(id) {
  if (ngPending) {
    const {
      old,
      carryId
    } = ngPending;
    S = Y.newGamePlus(old, fresh(id), {
      carry: ['learned', 'toppings', 'research', 'trophies'],
      ng: 'ng'
    });
    S.money = 300 + 700 * Math.min(S.ng, 3);
    const c = old.crew.find(c => c.id === carryId);
    if (c) {
      S.crew = [{
        ...c,
        lv: Math.min(3, c.lv),
        xp: 0
      }];
    }
    S.learned = [...new Set([...S.learned, loc().fourth])];
  } else {
    S = fresh(id);
  }
  ngPending = null;
  $('location').hidden = true;
  $('ending').hidden = true;
  locationReturn = null;
  begin();
  toast(S.ng ? '🏪 分店開張！美食家、彩虹、金箔與霓虹招牌登場！' : '🍦 開張！點下面的口味，照單子疊雪糕。');
}
function begin() {
  running = true;
  paused = false;
  $('pause').textContent = '⏸';
  $('start').hidden = true;
  $('game').hidden = false;
  summary = false;
  $('summary').hidden = true;
  resize();
  if (S.dayDone) {
    S.day++;
    S.dayDone = false;
  }
  startDay();
  if (audioPrefs.music !== 'off') {
    playMusic('icecream');
  }
  save();
}

// ===== 格子與擺放 =====
function buildGrid(extra = null) {
  const all = [...S.seats, ...S.decor, ...(extra ? [extra] : [])].map(rect);
  grid.setWalk((x, y) => x < S.lots * 6 && y >= 6 && y <= 11 && !all.some(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h));
  return grid;
}
// 不只檢查佔格：每次試擺都從大門 BFS，確保櫃台和既有家具仍有入口。
function canPlace(p) {
  const d = (p.kind === 'seat' ? SEATS : DECOR)[p.type];
  if (!d) {
    return '找不到這件家具';
  }
  const w = d.w;
  const h = d.h;
  if (p.x < 0 || p.y < 7 || p.x + w > S.lots * 6 || p.y + h > 12) {
    return '請擺在已買下的座位區（第 7～11 列）';
  }
  if (p.x <= 2 && p.x + w > 2 && p.y <= 11 && p.y + h > 11) {
    return '要留大門給客人走喔';
  }
  for (const o of [...S.seats, ...S.decor].map(rect)) {
    if (p.x < o.x + o.w && p.x + w > o.x && p.y < o.y + o.h && p.y + h > o.y) {
      return '這裡已經有東西了';
    }
  }
  buildGrid(p);
  const dists = grid.bfs([2, 11]);
  let reason = null;
  for (let i = 0; i < S.windows; i++) {
    if (dists[6][windowX(i)] < 0) {
      reason = '會擋住通往櫃台的路';
    }
  }
  for (const o of [...S.seats, ...S.decor, p].map(rect)) {
    if (!grid.findDoor(o, dists)) {
      reason = '要留一條路走到每組桌椅和擺設';
    }
  }
  buildGrid();
  return reason;
}
const placer = new Y.Placer({
  canPlace,
  onChange: p => {
    $('placeBar').hidden = false;
    $('placeBar').innerHTML = [
      `<b>${esc(p.name)}</b>　${esc(p.reason || '點地面或拖曳調位置')}<div class="row"><button data-act="confirm" ${p.reason ? 'disabled' : ''}`,
      `>✔ 擺好</button><button data-act="cancel">取消</button></div>`
    ].join('');
  },
  takeOut: o => {
    S[o.kind === 'seat' ? 'seats' : 'decor'] = S[o.kind === 'seat' ? 'seats' : 'decor'].filter(v => v.id !== o.id);
    buildGrid();
  },
  putBack: o => {
    const {
      kind,
      ...obj
    } = o;
    S[kind === 'seat' ? 'seats' : 'decor'].push(obj);
    buildGrid();
  }
});
function startPlace(kind, type) {
  const d = (kind === 'seat' ? SEATS : DECOR)[type];
  if (!d || star() < d.need || d.ng && !S.ng || S.money < d.cost) {
    return false;
  }
  $('sheet').hidden = true;
  placer.start({
    kind,
    type,
    ...d,
    x: 3,
    y: 9
  });
  return true;
}
function startMove(o, kind) {
  if (o.occupied?.length) {
    return false;
  }
  $('sheet').hidden = true;
  placer.startMove({
    ...o,
    kind
  }, {
    ...o,
    ...(kind === 'seat' ? SEATS : DECOR)[o.type],
    kind,
    cost: 0,
    moving: true
  });
  return true;
}
function confirmPlace() {
  const p = placer.confirm();
  if (!p) {
    return false;
  }
  const d = (p.kind === 'seat' ? SEATS : DECOR)[p.type];
  if (!p.moving && S.money < d.cost) {
    toast('錢還不夠，先多賣幾球！');
    return false;
  }
  if (!p.moving) {
    S.money -= d.cost;
  }
  S[p.kind === 'seat' ? 'seats' : 'decor'].push({
    id: p.id || ++nextId,
    type: p.type,
    x: p.x,
    y: p.y,
    flip: !!p.flip
  });
  $('placeBar').hidden = true;
  buildGrid();
  noise(.08, .035);
  save();
  return true;
}
function place(kind, type, x, y) {
  kind = kind === 'seats' ? 'seat' : kind;
  const d = (kind === 'seat' ? SEATS : DECOR)[type];
  if (!d || !startPlace(kind, type)) {
    return false;
  }
  placer.moveTo(x, y);
  if (placer.p.reason) {
    placer.cancel();
    $('placeBar').hidden = true;
    return false;
  }
  return confirmPlace();
}

// ===== 員工與窗口配置 =====
const windowX = i => Math.floor(i / 2) * 6 + 1 + i % 2 * 3;
function assignStaff() {
  const servers = S.crew.filter(c => c.role === 'server');
  windows = Array.from({
    length: S.windows
  }, (_, i) => ({
    i,
    crew: i ? servers[i - 1] || null : null,
    guest: null
  }));
  staff = S.crew.map(c => ({
    id: c.id,
    c,
    x: c.role === 'promoter' ? 120 : 80,
    y: c.role === 'promoter' ? 420 : c.role === 'cleaner' ? 340 : 150,
    dir: 3,
    frame: 0,
    path: [],
    moving: false,
    state: 'idle',
    look: {
      ...randomLook(c.id * 179),
      cloth: ROLES[c.role].color
    }
  }));
}

// ===== 一天：開店與到店計畫 =====
// 客人是當天的暫態資料；讀檔重開本日只保留店面與統計，不還原走到一半的人。
function startDay() {
  clock.start();
  summary = false;
  choice = null;
  contest = false;
  choiceSeen = false;
  pendingChange = null;
  guests = [];
  floaters = [];
  craftGuest = null;
  craft = {
    kind: null,
    scoops: [],
    topping: null
  };
  nextId = Math.max(10, ...S.seats.map(o => o.id), ...S.decor.map(o => o.id), ...S.crew.map(o => o.id)) + 1;
  S.seats.forEach(o => {
    o.occupied = [];
    o.dirty = false;
  });
  rnd = Y.rng(S.seed + S.day * 7919);
  buildGrid();
  assignStaff();
  queue = new Y.Queue(Array.from({
    length: S.lots * 6
  }, (_, x) => [x, 6]).filter(([x]) => !windows.some(w => windowX(w.i) === x)).sort((a, b) => Math.abs(a[0] - 1) - Math.abs(b[0] - 1)));
  dayStats = {
    income: 0,
    tips: 0,
    salary: 0,
    rent: 0,
    served: 0,
    ratings: [],
    math: 0,
    mathTotal: 0,
    left: 0,
    challenge: false,
    reviews: [],
    balls: {},
    three: 0,
    seated: 0,
    cups: 0,
    five: 0
  };
  if ((S.day - 1) % 7 === 0) {
    if (S.day > 1) {
      S.theme = (S.theme + 1 + Math.floor(rnd() * (THEMES.length - 1))) % THEMES.length;
    }
    toast(`🏆 本季雪糕節主題：${THEMES[S.theme].name}，第 ${S.day + 6} 天比賽！`);
  }
  S.stock = S.stock.map(row => row.map(id => id && 'season' in FLAVORS[id] && FLAVORS[id].season !== season() ? null : id));
  if (!stocked().length) {
    S.stock[0][0] = 'vanilla';
  }
  dayEvent = season() === 1 && rnd() < .3 ? '熱浪' : rnd() < .18 ? '下雨' : '';
  S.challenge = makeChallenge();
  const flow = loc().flow + star() * 1.8 + charm() / 12 + totalSeats() * .3 + S.crew.filter(c => c.role === 'promoter').reduce((n,
    c) => n + c.lv * 1.5, 0) + (has('loyal') ? 2 : 0) + modSum('flow');
  let n = Math.max(1, Math.min(32, Math.round(flow * loc().season[season()] * (S.price === 'budget' ? 1.3 : S.price === 'premium' ? .8 :
    1) * (dayEvent === '熱浪' ? 1.4 : dayEvent === '下雨' || modHas('rain') ? .7 : 1))));
  const types = Object.entries(loc().types);
  if (S.ng) {
    types.push(['critic', 1]);
  }
  arrivals = Y.planArrivals(n, {
    rnd,
    pick: () => ({
      type: Y.weightedPick(types, rnd)
    })
  });
  if (S.location === 'school') {
    arrivals = arrivals.map(a => ({
      ...a,
      t: .55 + (a.t - .03) / .82 * .2
    }));
  }
  // 家庭成員陸續進門，總來客仍維持上限。
  for (let i = 0; i < arrivals.length; i++) {
    if (arrivals[i].type === 'family') {
      const count = 2 + Math.floor(rnd() * 3);
      for (let j = 1; j < count && i + j < arrivals.length; j++) {
        arrivals[i + j].type = 'family';
        arrivals[i + j].t = Math.min(.85, arrivals[i].t + j * .012);
      }
      i += count - 1;
    }
  }
  if (S.day >= 2) {
    const order = makeOrder('tourist', true);
    arrivals.push({
      t: .58,
      type: 'tourist',
      special: true,
      order
    });
    toast(`✨ 下午的特別訂單：${orderText(order)}，獎金加倍！`);
  }
  for (let i = 0; i < modSum('kids'); i++) {
    arrivals.push({
      t: .35 + i * .018,
      type: 'kid'
    });
  }
  for (let i = 0; i < modSum('party'); i++) {
    arrivals.push({
      t: .6 + i * .02,
      type: 'kid',
      party: true
    });
  }
  arrivals.sort((a, b) => a.t - b.t);
  dirtyUI = true;
  focusOwned();
}
function makeChallenge() {
  const ids = stocked();
  const k = Y.weightedPick([['flavor', 2], ['three', 1], ['seated', 1], ['five', 1], ['cups', 1]], rnd);
  return {
    kind: k,
    flavor: ids[Math.floor(rnd() * ids.length)],
    target: k === 'flavor' ? 5 : k === 'five' ? 3 : 4,
    reward: 100 + S.day * 5
  };
}
function challengeProgress() {
  const c = S.challenge;
  return c.kind === 'flavor' ? dayStats.balls[c.flavor] || 0 : dayStats[c.kind] || 0;
}
function challengeText() {
  const c = S.challenge;
  if (!c) {
    return '';
  }
  return {
    flavor: `賣出${FLAVORS[c.flavor]?.name}雪糕球`,
    three: '做三球雪糕',
    seated: '請客人坐下吃',
    five: '拿到五星',
    math: '找錢答對',
    cups: '做杯裝雪糕'
  }[c.kind] + ` ${challengeProgress()}/${c.target}`;
}
function checkChallenge() {
  if (!dayStats.challenge && challengeProgress() >= S.challenge.target) {
    dayStats.challenge = true;
    S.money += S.challenge.reward;
    S.ideas += 2;
    toast(`🎯 今日挑戰達成！+$${S.challenge.reward}、💡2`);
    fanfare();
  }
}

// ===== 客人：點單、排隊與服務 =====
// 訂單只抽冰櫃裡有的口味，避免出現玩家做不出來的單子。
function makeOrder(type, special = false, party = false) {
  const ty = TYPES[type];
  const ids = stocked();
  const n = special || party || type === 'critic' ? 3 : Y.weightedPick(ty.balls.map((w, i) => [i + 1, w]), rnd);
  const scoops = Array.from({
    length: n
  }, () => Y.weightedPick(ids.map(id => [id, (S.favs[type].includes(id) ? 3 : 1) * (FLAVORS[id].season === season() ? 2 :
    1) * (modHas('berry') && id === 'strawberry' ? 3 : 1)]), rnd));
  return {
    kind: rnd() < ty.cone ? 'cone' : 'cup',
    scoops,
    topping: S.toppings.length && (special || type === 'critic' || rnd() < .3) ? S.toppings[Math.floor(rnd() * S.toppings.length)] : null
  };
}
const orderText = o => o.scoops.map(id => FLAVORS[id].name).join('＋') + (o.kind === 'cup' ? ' 杯裝' : ' 甜筒') + (o.topping ? '＋' +
  TOPPINGS[o.topping] : '');
function spawn(a) {
  const type = a.type;
  const g = {
    id: ++nextId,
    char: nextId,
    type,
    order: a.order || makeOrder(type, a.special, a.party),
    special: !!a.special,
    party: !!a.party,
    x: 80,
    y: 433,
    dir: 1,
    frame: 0,
    path: [[80, 369]],
    moving: true,
    state: 'enter',
    patience: TYPES[type].patience * (has('cold') ? 1.25 : 1),
    waited: 0,
    look: randomLook(nextId * 7919 + 13)
  };
  g.then = () => {
    g.state = 'queue';
    queue.join(g.id);
    requeue();
  };
  guests.push(g);
  const missing = S.favs[type].filter(id => !stocked().includes(id));
  if (missing.length && rnd() < .25) {
    const id = missing[Math.floor(rnd() * missing.length)];
    S.wishLog[type] ??= [];
    if (!S.wishLog[type].includes(id)) {
      S.wishLog[type].push(id);
    }
    Y.bubble(g, `要是有${FLAVORS[id].name}就好了…`, 5);
  }
  dirtyUI = true;
}
function requeue() {
  for (const id of queue.ids) {
    const g = guests.find(g => g.id === id);
    if (!g || g.state !== 'queue') {
      continue;
    }
    const spot = queue.spotOf(id) || [2 + queue.indexOf(id) % 3, 10];
    if (!g.moving) {
      Y.goTo(grid, g, spot, () => {
        g.dir = 1;
      });
    }
  }
}
function dispatch() {
  for (const w of windows) {
    if (w.guest || w.i > 0 && !w.crew) {
      continue;
    }
    const id = queue.front();
    if (id == null) {
      break;
    }
    const g = guests.find(g => g.id === id);
    queue.remove(id);
    if (!g) {
      continue;
    }
    w.guest = g.id;
    g.window = w.i;
    g.state = 'toCounter';
    g.work = 0;
    Y.goTo(grid, g, [windowX(w.i), 6], () => {
      g.state = 'order';
      g.dir = 1;
      g.counterWait = 0;
      if (w.i === 0) {
        craft = {
          kind: null,
          scoops: [],
          topping: null
        };
        craftGuest = g.id;
        dirtyUI = true;
        focusCounter();
        if (!S.tutorial.order) {
          S.tutorial.order = true;
          toast('看他要什麼 → 點下面的口味！');
        }
      }
    });
  }
  requeue();
}
const playerGuest = () => {
  const id = windows[0]?.guest;
  return guests.find(g => g.id === id && g.state === 'order') || null;
};
function correctness(g, made) {
  const o = g.order;
  const diff = o.scoops.reduce((n, id, i) => n + (id !== made.scoops[i] ? 1 : 0), 0) + (made.topping !== o.topping ? 1 : 0);
  return made.scoops.length !== o.scoops.length ? {
    score: 10,
    factor: .2,
    perfect: false
  } : diff === 0 && made.kind === o.kind ? {
    score: 40,
    factor: 1,
    perfect: true
  } : {
    score: diff <= 1 ? 20 : 10,
    factor: diff <= 1 ? .5 : .2,
    perfect: false
  };
}
function price(o, g) {
  const raw = o.scoops.reduce((n, id) => n + FLAVORS[id].price, 5) + (o.topping ? 5 : 0) + (o.kind === 'cone' && has('baked') ? 3 : 0);
  return Math.max(5, Math.round(raw * (S.price === 'budget' ? .8 : S.price === 'premium' ? 1.25 : 1) / 5) * 5) * (g.special ?
    has('chef') ? 3 : 2 : g.party ? 1.5 : 1);
}
// 完全相同會自動交單；手動交出不相同的雪糕也照收錢，只影響心情與小費。
function submit(made = craft, auto = false, answer = true) {
  const g = playerGuest();
  if (!g || !made.scoops.length || pendingChange) {
    return false;
  }
  g.made = structuredClone(made);
  g.result = correctness(g, made);
  g.bill = Math.round(price(g.order, g) / 5) * 5;
  g.state = 'pay';
  dirtyUI = true;
  const cash = rnd() < .3 ? g.bill : [10, 20, 50, 100].find(n => n >= g.bill) || Math.ceil(g.bill / 100) * 100;
  g.cash = cash;
  // 流程要短:一般客人做好就自動收錢,只有 ✨ 特別客人才出一題找錢(設定可關)
  const quiz = settings.math && g.special && cash > g.bill;
  if (!auto && quiz) {
    pendingChange = g;
    $('change').hidden = false;
    $('changeQuestion').textContent = `收到 $${cash}，雪糕 $${g.bill}，要找多少？`;
    $('changeHint').textContent = S.tutorial.math ? '' : '💡 收到的錢 − 雪糕價錢，就是要找的錢。';
    S.tutorial.math = true;
    const correct = cash - g.bill;
    const opts = new Set([correct]);
    for (const d of [5, -5, 10, -10, 15]) {
      if (correct + d >= 0 && opts.size < 3) {
        opts.add(correct + d);
      }
    }
    $('changeOpts').innerHTML = [...opts].sort(() => rnd() - .5).map(v => `<button data-change="${v}">$${v}</button>`).join('');
    return true;
  }
  completePay(g, auto && quiz ? answer : null);
  return true;
}
function answerChange(n) {
  if (!pendingChange) {
    return;
  }
  const g = pendingChange;
  pendingChange = null;
  $('change').hidden = true;
  const right = n === g.cash - g.bill;
  toast(right ? '算得真準！' : '差一點點！答案是 $' + (g.cash - g.bill));
  completePay(g, right);
}
// 收款先完成，再安排座位；等待過久離店不會走到這裡，因此不扣口碑。
function completePay(g, mathRight) {
  const ratio = Math.max(0, 1 - g.waited / g.patience);
  const fav = g.made.scoops.some(id => S.favs[g.type].includes(id));
  let tip = Math.round(TYPES[g.type].tip * g.result.factor * (.5 + ratio) * (fav ? 1.5 : 1) * (S.location === 'station' ? 1.3 : 1));
  if (mathRight !== null) {
    dayStats.mathTotal++;
    if (mathRight) {
      dayStats.math++;
      tip += 2 + Math.floor(rnd() * 4);
    }
  }
  if (modHas('donate')) {
    tip = 0;
  }
  S.money += g.bill + tip;
  S.stats.earned += g.bill + tip;
  S.stats.served++;
  S.stats.balls += g.made.scoops.length;
  dayStats.income += g.bill;
  dayStats.tips += tip;
  dayStats.served++;
  dayStats.three += g.made.scoops.length === 3 ? 1 : 0;
  dayStats.cups += g.made.kind === 'cup' ? 1 : 0;
  for (const id of g.made.scoops) {
    dayStats.balls[id] = (dayStats.balls[id] || 0) + 1;
  }
  if (g.special) {
    S.ideas += 2;
    Y.bubble(g, '✨ 太棒了！特別訂單完成！', 3);
  } else {
    Y.bubble(g, g.result.perfect ? '謝謝！正是我想要的！' : '也不錯啦～', 3);
  }
  if (fav) {
    S.revealed[g.type] ??= [];
    for (const id of g.made.scoops.filter(id => S.favs[g.type].includes(id))) {
      if (!S.revealed[g.type].includes(id)) {
        S.revealed[g.type].push(id);
      }
    }
  }
  g.mood = g.result.score - (g.made.kind !== g.order.kind ? 10 : 0) + ratio * 20 + (fav ? 10 : 0) +
    (g.made.scoops.some(id => FLAVORS[id].season === season()) ? 5 : 0) + (S.price === 'premium' && charm() < 20 ? -10 : 0) +
    S.mods.reduce((n, m) => n + (m.berry && !g.made.scoops.includes('strawberry') ? 0 : m.mood || 0), 0);
  float(g.x, g.y - 30, `+$${g.bill + tip}`, '#ffd84a');
  tone(740, .08, 'triangle', .1);
  windows[g.window].guest = null;
  if (g.server) {
    g.server.xp++;
    g.server = null;
  }
  craftGuest = null;
  craft = {
    kind: null,
    scoops: [],
    topping: null
  };
  seatGuest(g);
  dirtyUI = true;
  checkChallenge();
  checkGoals();
}

// ===== 客人：入座、評價與離開 =====
function seatCharm(o) {
  return SEATS[o.type].comfort + S.decor.reduce((n, d) => n + (Math.hypot(d.x - (o.x + SEATS[o.type].w / 2), d.y - (o.y +
    SEATS[o.type].h / 2)) <= 2 ? DECOR[d.type].val : 0), 0);
}
function seatGuest(g) {
  const seat = S.seats.filter(o => !o.dirty && (o.occupied?.length || 0) < SEATS[o.type].seats).sort((a,
    b) => seatCharm(b) - seatCharm(a))[0];
  if (seat) {
    seat.occupied ??= [];
    seat.occupied.push(g.id);
    g.seat = seat.id;
    g.seatIndex = seat.occupied.length - 1;
    g.mood += 10 + seatCharm(seat) + (S.location === 'park' ? 5 : 0);
    dayStats.seated++;
    g.state = 'toSeat';
    const door = grid.findDoor(rect(seat), grid.bfs([2, 11]));
    if (door && Y.goTo(grid, g, [door.x, door.y], () => {
      g.state = 'eat';
      g.timer = 8 + rnd() * 4;
      const p = seatPosition(seat, g.seatIndex);
      g.x = p[0];
      g.y = p[1];
      g.dir = p[2];
    })) {
      return;
    }
    seat.occupied = seat.occupied.filter(id => id !== g.id);
    g.seat = null;
  } else if (has('bag')) {
    g.mood += 10;
  }
  review(g);
  leave(g);
}
function seatPosition(o, i) {
  if (o.type === 'stool') {
    return [(o.x + .5) * 32, (o.y + .65) * 32, 1];
  }
  if (o.type === 'table4') {
    return [[(o.x + 1.5) * 32, (o.y + .8) * 32, 3], [(o.x + .5) * 32, (o.y + 1.65) * 32, 0], [(o.x + 2.5) * 32, (o.y + 1.65) * 32, 2],
      [(o.x + 1.5) * 32, (o.y + 2.65) * 32, 1]][i % 4];
  }
  return [(o.x + (i % 2 ? 2.5 : .5)) * 32, (o.y + .65) * 32, i % 2 ? 2 : 0];
}
function review(g) {
  const rating = g.mood < 35 ? 1 : g.mood < 50 ? 2 : g.mood < 65 ? 3 : g.mood < 80 ? 4 : 5;
  S.rep = Math.max(0, S.rep + [-2, 2, 8, 16, 26][rating - 1] * (g.type === 'critic' ? 3 : 1));
  dayStats.ratings.push(rating);
  const lines = D.REVIEWS[rating - 1];
  const text = lines[Math.floor(rnd() * lines.length)];
  dayStats.reviews.push({
    rating,
    text
  });
  if (rating === 5) {
    S.stats.five++;
    dayStats.five++;
    S.ideas += g.type === 'critic' ? 3 : 1;
    S.bestReview = text;
  }
  float(g.x, g.y - 28, '★'.repeat(rating), '#ffd84a');
  checkChallenge();
  checkGoals();
}
function leave(g) {
  queue.remove(g.id);
  if (g.window !== undefined && windows[g.window]?.guest === g.id) {
    windows[g.window].guest = null;
  }
  if (g.seat) {
    const o = S.seats.find(o => o.id === g.seat);
    if (o) {
      o.occupied = (o.occupied || []).filter(id => id !== g.id);
      o.dirty = true;
    }
    const p = grid.findDoor(rect(o || {
      type: 'stool',
      x: 2,
      y: 10
    }), grid.bfs([2, 11]));
    if (p) {
      g.x = (p.x + .5) * 32;
      g.y = (p.y + .8) * 32;
    }
  }
  g.state = 'leaving';
  if (!Y.goTo(grid, g, [2, 11], () => {
    g.path = [[80, 445]];
    g.moving = true;
    g.then = () => {
      g.gone = true;
    };
  })) {
    g.path = [[80, 445]];
    g.moving = true;
    g.then = () => {
      g.gone = true;
    };
  }
  dirtyUI = true;
}
function clean(o, c = null) {
  if (!o.dirty) {
    return;
  }
  o.dirty = false;
  if (c) {
    c.xp++;
  }
  noise(.08, .025, 2400);
  float((o.x + .5) * 32, (o.y + .5) * 32, '✨', '#fff1c9');
}

// ===== 員工：自動服務與清潔 =====
// 店員僅在櫃台後橫向定位；清潔員才使用座位區 Grid 尋路。
function tickStaff(dt) {
  for (const a of staff) {
    Y.tickBubble(a, dt);
    if (a.c.role === 'promoter') {
      a.frame += dt * 2;
      continue;
    }
    if (a.c.role === 'server') {
      const w = windows.find(w => w.crew?.id === a.c.id);
      const helping = guests.find(g => g.server?.id === a.c.id);
      a.x = helping ? (windowX(helping.window) + .5) * 32 : w ? (windowX(w.i) + .5) * 32 : Math.max(16, Math.min(S.lots * 192 - 16, a.x));
      a.y = 150;
      a.frame += dt * 3;
      continue;
    }
    if (a.moving) {
      Y.moveAgent(a, dt, 45 + 5 * a.c.lv);
      continue;
    }
    if (a.state === 'clean') {
      a.timer -= dt;
      if (a.timer <= 0) {
        const o = S.seats.find(o => o.id === a.target);
        if (o) {
          clean(o, a.c);
        }
        a.state = 'idle';
      }
      continue;
    }
    const dirty = S.seats.filter(o => o.dirty && !staff.some(b => b !== a && b.target === o.id && b.state !== 'idle')).sort((x,
      y) => Math.hypot(x.x * 32 - a.x, x.y * 32 - a.y) - Math.hypot(y.x * 32 - a.x, y.y * 32 - a.y))[0];
    if (dirty) {
      const door = grid.findDoor(rect(dirty), grid.bfs([2, 11]));
      if (door) {
        a.target = dirty.id;
        a.state = 'walking';
        Y.goTo(grid, a, [door.x, door.y], () => {
          a.state = 'clean';
          a.timer = 2.5 / a.c.lv;
        });
      }
    }
  }
}

// ===== 一天：即時更新與人生選擇 =====
function update(dt) {
  if (!running || placer.active || summary || choice || contest || pendingChange || !$('settings').hidden || !$('ending').hidden ||
    !$('location').hidden) {
    return;
  }
  clock.tick(dt);
  while (arrivals.length && arrivals[0].t <= clock.t && clock.t < .9) {
    spawn(arrivals.shift());
  }
  dispatch();
  for (const g of guests) {
    Y.tickBubble(g, dt);
    if (!['eat', 'toSeat', 'leaving', 'pay'].includes(g.state)) {
      g.waited += dt;
      if (g.waited >= g.patience) {
        dayStats.left++;
        Y.bubble(g, '下次再來～', 2);
        leave(g);
        continue;
      }
    }
    if (g.moving) {
      Y.moveAgent(g, dt, 58);
      continue;
    }
    Y.runState(g, dt, {
      order: (g, dt) => {
        g.counterWait += dt;
        const w = windows[g.window];
        let server = w.crew;
        if (g.window === 0 && g.counterWait >= 8 && !g.playerTouched) {
          server = S.crew.find(c => c.role === 'server' && !guests.some(a => a.server?.id === c.id) &&
            !windows.some(w => w.crew?.id === c.id && w.guest));
          if (server && !g.server) {
            Y.bubble(g, '店員：我來！', 2);
            g.server = server;
          }
        }
        if (server) {
          g.server = server;
        }
        if (g.server) {
          g.work += dt;
          const seconds = 6 * (1 - .12 * (g.server.lv - 1)) * (has('quick') ? .8 : 1) * (S.perm.includes('machine') ? .8 : 1);
          if (g.work >= seconds) {
            if (g.window === 0) {
              submit(g.order, true, true);
            } else {
              g.made = structuredClone(g.order);
              g.result = correctness(g, g.made);
              g.bill = Math.round(price(g.order, g) / 5) * 5;
              completePay(g, null);
            }
          }
        }
      },
      eat: (g, dt) => {
        g.timer -= dt;
        if (g.timer <= 0) {
          review(g);
          leave(g);
        }
      }
    });
  }
  guests = guests.filter(g => !g.gone);
  tickStaff(dt);
  for (const f of floaters) {
    f.y -= dt * 12;
    f.life -= dt;
  }
  floaters = floaters.filter(f => f.life > 0);
  if (S.day >= 3 && !choiceSeen && clock.t >= .02) {
    choiceSeen = true;
    if (rnd() < .3) {
      const pool = D.CHOICES.filter(c => !S.choiceLog.some(l => l.id === c.id && S.day - l.day < 5));
      if (pool.length) {
        choice = pool[Math.floor(rnd() * pool.length)];
        showChoice();
      }
    }
  }
  if (clock.t >= 1) {
    endDay();
  }
}
function applyEffect(e) {
  if (e.money < 0 && S.money < -e.money) {
    return false;
  }
  S.money = Math.max(0, S.money + (e.money || 0));
  S.rep += e.rep || 0;
  if (e.mod) {
    S.mods.push({
      ...e.mod
    });
    const t = Math.min(.8, clock.t + .1);
    for (let i = 0; i < (e.mod.kids || 0); i++) {
      arrivals.push({
        t: Math.min(.85, t + i * .014),
        type: 'kid'
      });
    }
    for (let i = 0; i < (e.mod.party || 0); i++) {
      arrivals.push({
        t: Math.min(.85, Math.max(.6, t) + i * .014),
        type: 'kid',
        party: true
      });
    }
    if (e.mod.flow > 0) {
      for (let i = 0; i < e.mod.flow; i++) {
        arrivals.push({
          t: Math.min(.85, t + rnd() * .5),
          type: Y.weightedPick(Object.entries(loc().types), rnd)
        });
      }
    }
    if (e.mod.flow < 0) {
      arrivals.splice(0, Math.min(arrivals.length, -e.mod.flow));
    }
    if (e.mod.rain) {
      arrivals = arrivals.filter(() => rnd() < .7);
    }
    arrivals.sort((a, b) => a.t - b.t);
  }
  if (e.perm && !S.perm.includes(e.perm)) {
    S.perm.push(e.perm);
  }
  if (e.learn) {
    const r = RESEARCH.filter(r => r.kind === 'flavor' && !S.learned.includes(r.id) && (!r.ng || S.ng));
    if (r.length) {
      const f = r[Math.floor(rnd() * r.length)];
      S.learned.push(f.id);
      toast(`學會了${f.name}！`);
    }
  }
  if (e.rest) {
    clock.t = 1;
  }
  return true;
}
function showChoice() {
  $('choice').hidden = false;
  $('cTitle').textContent = choice.title;
  $('cText').textContent = choice.text;
  $('cOpts').innerHTML = choice.opts.map(([label, e], i) => `<button class="wide" data-pick="${i}" ${e.money < 0 && S.money < -e.money ?
    'disabled' : ''}>${label}</button>`).join('');
}
function pick(i) {
  if (!choice) {
    return false;
  }
  const opt = choice.opts[i];
  if (!opt || !applyEffect(opt[1])) {
    return false;
  }
  S.choiceLog.push({
    id: choice.id,
    day: S.day
  });
  choice = null;
  $('choice').hidden = true;
  save();
  return true;
}

// ===== 目標與打烊結算 =====
function checkGoals() {
  Y.checkMilestones(S, MILESTONES, {
    open: s => s.stats.served >= 20,
    popular: () => star() >= 3,
    collector: s => s.learned.length >= 10,
    large: () => totalSeats() >= 12
  }, 'milestones', m => {
    toast(`${m.name}！+$${m.reward.money}、💡${m.reward.ideas}`);
    fanfare();
  });
  if (S.legend) {
    for (const [id, name, done] of [['triple', '👑 三連冠', S.streak >= 3], ['all', '🌈 全口味', RESEARCH.filter(r => r.kind === 'flavor' &&
      (!r.ng || S.ng)).every(r => S.learned.includes(r.id))], ['dream', '🏬 夢幻店面', S.lots === 5 && charm() >= 80]]) {
      if (done) {
        Y.addTrophy(S, {
          id,
          name
        });
      }
    }
  }
  if (!S.ended && star() === 5 && S.contestWins > 0) {
    S.ended = true;
    S.milestones.push('final');
    Y.addTrophy(S, MILESTONES.at(-1));
    save();
    showEnding();
  }
}
// 先標 dayDone 並存檔，下次從開始畫面繼續時會進入下一天，避免重複領結算。
function endDay() {
  if (summary) {
    return;
  }
  summary = true;
  S.dayDone = true;
  pendingChange = null;
  $('change').hidden = true;
  dayStats.salary = S.crew.reduce((n, c) => n + 25 + 10 * (c.lv - 1), 0);
  dayStats.rent = loc().rent || 0;
  S.money = Math.max(0, S.money - dayStats.salary - dayStats.rent);
  S.mods = S.mods.map(m => ({
    ...m,
    days: m.days - 1
  })).filter(m => m.days > 0);
  const avg = dayStats.ratings.length ? dayStats.ratings.reduce((a, b) => a + b, 0) / dayStats.ratings.length : 0;
  S.reports.push({
    day: S.day,
    income: dayStats.income,
    tips: dayStats.tips,
    served: dayStats.served,
    avg,
    salary: dayStats.salary,
    rent: dayStats.rent
  });
  if (S.reports.length > 28) {
    S.reports.shift();
  }
  guests = [];
  queue.ids = [];
  windows.forEach(w => w.guest = null);
  S.seats.forEach(o => o.occupied = []);
  $('sTitle').textContent = `第 ${S.day} 天打烊了！`;
  $('sBody').innerHTML = [
    `<div class="nums">${[[`$${dayStats.income}`, '今日收入'], [`$${dayStats.tips}`, '小費'], [`−$${dayStats.salary + dayStats.rent}`, '薪水／租金'],
      [dayStats.served, '服務客人'], [avg.toFixed(1) + '★', '平均評價'], [`${dayStats.math}/${dayStats.mathTotal}`, '找錢答對']].map(([v,
      n]) => `<div><b>${v}</b>${n}</div>`).join('')}</div><p>${dayStats.left ? `有 ${dayStats.left} 位等不及，請店員幫忙吧！` :
      '客人都開心地來逛了！'}</p><p>🎯 ${esc(challengeText())}`,
    ` ${dayStats.challenge ? '✔ 達成！' : '明天再挑戰！'}</p>${dayStats.reviews.sort(() => rnd() - .5).slice(0,
      3).map(r => `<small>${'★'.repeat(r.rating)}「${r.text}」</small>`).join('')}<p>${goalText()}</p>${S.day % 7 === 6 ?
      '<p>🏆 明天是雪糕節，先研究符合主題的口味吧！</p>' : ''}`,
    `${S.day % 7 === 0 ? '<p>🏆 今天要參加雪糕節！</p>' : ''}`
  ].join('');
  $('next').textContent = S.day % 7 === 0 ? '參加雪糕節 →' : '下一天 →';
  $('summary').hidden = false;
  dirtyUI = true;
  save();
}
function next() {
  if (contest) {
    if (!contestDone) {
      return;
    }
    contest = false;
    $('contest').hidden = true;
    summary = false;
    S.day++;
    S.dayDone = false;
    startDay();
    save();
    return;
  }
  if (!summary) {
    return;
  }
  if (S.day % 7 === 0 && !S.contestDay?.includes(S.day)) {
    openContest();
    return;
  }
  summary = false;
  $('summary').hidden = true;
  S.day++;
  S.dayDone = false;
  startDay();
  save();
}

// ===== 雪糕節 =====
function colorHue(color) {
  if (color === 'rainbow') {
    return 300;
  }
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = (n >> 8 & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) {
    return 0;
  }
  return (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
}
// 繽紛主題檢查圓周上的色相距離；其餘主題按口味 tags 計分。
function themeMatches(ids) {
  const theme = THEMES[S.theme];
  if (theme.tag !== 'color') {
    return ids.filter(id => FLAVORS[id].tags.includes(theme.tag)).length;
  }
  const hues = ids.map(id => colorHue(FLAVORS[id].color));
  return hues.filter((h, i) => hues.every((v, j) => j === i || Math.min(Math.abs(h - v), 360 - Math.abs(h - v)) >= 65)).length;
}
function openContest() {
  contest = true;
  contestDone = false;
  contestSelected = [];
  $('summary').hidden = true;
  $('contest').hidden = false;
  $('contestTheme').textContent = THEMES[S.theme].name;
  $('contestResult').innerHTML = '';
  $('contestGo').textContent = '開始比賽';
  renderContest();
}
function renderContest() {
  $('contestFlavors').innerHTML = available().map(f => [
    `<button class="${contestSelected.includes(f.id) ? 'on' : ''}" data-contest="${f.id}"><span style="color:${f.color === 'rainbow' ?
      '#b98cff' : f.color}`,
    `">●</span> ${f.name}${f.season === season() ? ' ' + D.SEASON_ICONS[season()] : ''}</button>`
  ].join('')).join('');
  $('contestGo').disabled = !contestDone && contestSelected.length !== 3;
}
function contestPick(ids) {
  if (!contest || contestDone) {
    return false;
  }
  const valid = available().map(f => f.id);
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !valid.includes(id))) {
    return false;
  }
  contestSelected = [...ids];
  const score = themeMatches(ids) * 18 + star() * 8 + Math.min(20, charm() / 3) + Math.min(15, S.learned.length) + rnd() * 10;
  const mult = S.legend ? 1.5 : 1 + .25 * S.ng;
  const rivals = ['雪花屋', '甜甜圈圈', '北極熊冰室'].map((name, i) => ({
    name,
    score: Math.min(130, ([40, 34, 28][i] + Math.ceil(S.day / 7) * 4.5) * mult)
  }));
  const rank = 1 + rivals.filter(r => r.score > score).length;
  const prize = [600, 300, 150, 0][rank - 1];
  const ideas = [6, 3, 0, 0][rank - 1];
  S.money += prize;
  S.ideas += ideas;
  if (rank === 1) {
    S.contestWins++;
    S.streak++;
    Y.addTrophy(S, {
      id: 'contest' + S.day,
      name: `🏆 第 ${Math.ceil(S.day / 7)} 屆雪糕節冠軍`
    });
  } else {
    S.streak = 0;
  }
  S.contestDay ??= [];
  S.contestDay.push(S.day);
  S.lastContest = {
    rank,
    score,
    day: S.day
  };
  contestDone = true;
  $('contestResult').innerHTML = [
    `<h2>第 ${rank} 名！${score.toFixed(0)} 分</h2><p>獎金 $${prize}`,
    `、💡${ideas}</p>${[...rivals, {
    name: '你的雪糕店',
    score
  }].sort((a, b) => b.score - a.score).map((r, i) => `<small>${i + 1}. ${r.name}　${r.score.toFixed(0)} 分</small>`).join('')}`
  ].join('');
  $('contestGo').textContent = '明天繼續 →';
  renderContest();
  checkGoals();
  save();
  fanfare();
  return true;
}

// ===== 結局 =====
function showEnding() {
  if (!S) {
    return;
  }
  $('ending').hidden = false;
  $('eNums').innerHTML = `<div class="nums">${[[S.day, '經營天數'], [S.stats.served, '服務客人'], [S.stats.five, '五星評價'], ['$' + S.stats.earned,
    '總收入'], [S.learned.length, '學會口味'], [S.ng + 1, '第幾間店']].map(([v, n]) => `<div><b>${v}</b>${n}</div>`).join('')}</div>`;
  $('eReview').textContent = '「' + (S.bestReview || '每一球都是幸福！') + '」';
  fanfare();
}

// ===== 研究、雇用與擴店 =====
function research(id) {
  const r = RESEARCH.find(r => r.id === id);
  if (!r || star() < r.need || r.ng && !S.ng || S.ideas < r.cost || (r.kind === 'flavor' ? S.learned.includes(id) : r.kind === 'topping' ?
    S.toppings.includes(id) : has(id))) {
    return false;
  }
  S.ideas -= r.cost;
  S.research.push(id);
  if (r.kind === 'flavor') {
    S.learned.push(id);
  }
  if (r.kind === 'topping') {
    S.toppings.push(id);
  }
  toast('💡 ' + r.name + '，研究完成！');
  checkGoals();
  dirtyUI = true;
  save();
  return true;
}
function hire(role) {
  if (!ROLES[role] || S.crew.length >= D.staffMax(star()) || S.money < D.hireCost(S.crew.length)) {
    return false;
  }
  S.money -= D.hireCost(S.crew.length);
  const c = {
    id: ++nextId,
    role,
    lv: 1,
    xp: 0,
    name: ROLES[role].name + ' ' + (S.crew.length + 1)
  };
  S.crew.push(c);
  const a = {
    id: c.id,
    c,
    x: 80,
    y: role === 'promoter' ? 420 : role === 'cleaner' ? 340 : 150,
    dir: 3,
    frame: 0,
    path: [],
    state: 'idle',
    look: {
      ...randomLook(c.id * 179),
      cloth: ROLES[role].color
    }
  };
  staff.push(a);
  if (role === 'promoter' && clock.t < .8) {
    arrivals.push({
      t: Math.min(.85, clock.t + .08),
      type: Y.weightedPick(Object.entries(loc().types), rnd)
    });
    arrivals.sort((a, b) => a.t - b.t);
  }
  if (role === 'server') {
    const w = windows.find(w => w.i > 0 && !w.crew);
    if (w) {
      w.crew = c;
    }
  }
  dirtyUI = true;
  save();
  return true;
}
function train(id) {
  const c = S.crew.find(c => c.id === id);
  if (!c || c.lv >= 5 || c.xp < D.xpNeed(c.lv) || S.money < D.trainCost(c.lv)) {
    return false;
  }
  S.money -= D.trainCost(c.lv);
  c.xp -= D.xpNeed(c.lv);
  c.lv++;
  toast(c.name + ' 升到 Lv' + c.lv + '！');
  save();
  return true;
}
function buy(kind, value) {
  let cost = 0;
  if (kind === 'lot') {
    if (S.lots >= 5 || star() < S.lots) {
      return false;
    }
    cost = [800, 1600, 3000][S.lots - 2];
  } else if (kind === 'freezer') {
    if (S.freezers >= S.lots * 2) {
      return false;
    }
    cost = Math.round(300 * Math.pow(1.6, S.freezers - 1) / 50) * 50;
  } else if (kind === 'window') {
    if (S.windows >= S.lots * 2 || S.crew.filter(c => c.role === 'server').length < S.windows) {
      return false;
    }
    cost = [250, 500, 900][S.windows - 1] || Math.round(900 * Math.pow(1.6, S.windows - 3));
  } else if (kind === 'price') {
    if (!['budget', 'standard', 'premium'].includes(value)) {
      return false;
    }
    S.price = value;
    save();
    return true;
  } else {
    return false;
  }
  if (S.money < cost) {
    return false;
  }
  S.money -= cost;
  if (kind === 'lot') {
    S.lots++;
    buildGrid();
    focusOwned();
  }
  if (kind === 'freezer') {
    S.freezers++;
    S.stock.push([null, null, null, null]);
  }
  if (kind === 'window') {
    S.windows++;
    const used = windows.map(w => w.crew?.id);
    windows.push({
      i: S.windows - 1,
      guest: null,
      crew: S.crew.find(c => c.role === 'server' && !used.includes(c.id))
    });
  }
  dirtyUI = true;
  save();
  return true;
}
function setStock(slot, flavor) {
  const [a, b] = Array.isArray(slot) ? slot : [Math.floor(slot / 4), slot % 4];
  if (!S.stock[a] || b < 0 || b > 3 || flavor && !available().some(f => f.id === flavor)) {
    return false;
  }
  if (!flavor && stocked().length === 1 && S.stock.flat().filter(Boolean).length === 1) {
    toast('至少留一桶口味給客人點喔！');
    return false;
  }
  S.stock[a][b] = flavor || null;
  dirtyUI = true;
  save();
  return true;
}
function goalText() {
  const m = Y.nextGoal(S, MILESTONES);
  if (!m) {
    return S.legend ? '👑 傳說目標：三連冠、全口味、夢幻店面' : '🏆 已成為全城最好吃的雪糕店！';
  }
  const progress = {
    open: `${S.stats.served}/20 位`,
    popular: `${star()}/3★`,
    collector: `${S.learned.length}/10 種`,
    large: `${totalSeats()}/12 席`,
    final: `${star()}/5★ · 雪糕節冠軍 ${S.contestWins}/1`
  };
  return `${m.name}：${m.desc}（${progress[m.id]}）`;
}
// 操作面板：資料有變才重畫，避免觸控時按鈕被每幀替換。

// ===== 介面：工具抽屜與物件操作 =====
function item(act, name, sub, cost, disabled = false, icon = '🍦') {
  return Y.itemHTML({
    act,
    name,
    sub,
    cost,
    disabled,
    icon
  });
}
function openTab(which) {
  if (placer.active) {
    placer.cancel();
    $('placeBar').hidden = true;
  }
  tab = which;
  stockSlot = null;
  renderSheet();
}
function renderSheet() {
  if (!S) {
    return;
  }
  let title = '';
  let html = '';
  const st = star();
  if (tab === 'seats' || tab === 'decor') {
    const list = tab === 'seats' ? SEATS : DECOR;
    title = tab === 'seats' ? '🪑 座位' : '🌷 裝潢';
    html = Object.entries(list).map(([id, d]) => item(`place:${tab === 'seats' ? 'seat' : 'decor'}:${id}`, d.name,
      `${d.w}×${d.h}　${d.seats ? d.seats + ' 個座位' : '魅力 +' + d.val}${d.comfort ? ' 舒適 +' + d.comfort : ''}`, d.ng && !S.ng ? '二周目解鎖' :
      st < d.need ? d.need + '★ 解鎖' : '$' + d.cost, d.ng && !S.ng || st < d.need || S.money < d.cost, d.seats ? '🪑' : '🌷')).join('');
    if (tab === 'decor') {
      html += '<h3>全店風格（買過可以免費換）</h3>';
      for (const [kind, types] of [['floor', [['check', '棋盤', 0, 0], ['wood', '木地板', 200, 3], ['mint', '薄荷磚', 300, 5]]], ['wall',
        [['mint', '薄荷直條', 0, 0], ['pink', '粉紅壁紙', 200, 3], ['window', '窗景', 350, 5], ['shelf', '貨架', 350, 5]]]]) {
        for (const [id, name, cost, val] of types) {
          const owned = S.styles.includes(kind + ':' + id);
          html += item(`style:${kind}:${id}:${cost}`, name, `魅力 +${val}${S[kind] === id ? ' · 使用中' : ''}`, owned ? '已擁有' : '$' + cost,
            !owned && S.money < cost, '🎨');
        }
      }
    }
  }
  if (tab === 'stock') {
    title = '🧊 冰櫃口味';
    if (stockSlot === null) {
      html = '<p>點一格，選這桶要放的口味。留意客人最愛與季節限定！</p><div class="stock">' + S.stock.flatMap((row, a) => row.map((id, b) => [
        `<button data-act="slot:${a * 4 + b}">${id ? `<span style="color:${FLAVORS[id].color === 'rainbow' ? '#b98cff' :
          FLAVORS[id].color}">●</span> ${FLAVORS[id].name}` : '＋ 空格'}<small>冰櫃 ${a + 1}`,
        ` · ${b + 1}</small></button>`
      ].join(''))).join('') + '</div>';
    } else {
      html = '<p>這一格要放什麼？</p>' + available().map(f => item(`stock:${f.id}`, f.name, `${f.price} 元／球${f.season === season() ? ' · ' +
        D.SEASON_ICONS[season()] + ' 季節限定' : ''}`, '選這個', false, '●')).join('') + item('stock:', '清空這格', '', '', false, '🗑');
    }
  }
  if (tab === 'research') {
    title = '💡 研究新口味與技巧';
    html = RESEARCH.filter(r => !(r.kind === 'flavor' ? S.learned.includes(r.id) : r.kind === 'topping' ? S.toppings.includes(r.id) :
      has(r.id))).map(r => item('research:' + r.id, r.name, r.kind === 'passive' ? {
      quick: '店員做單快 20%',
      cold: '客人耐心 +25%',
      loyal: '每天客人 +2',
      bag: '外帶也有好心情',
      baked: '甜筒多賣 $3',
      chef: '特別訂單付三倍'
    }[r.id] : r.kind === 'flavor' ? '學會後在冰櫃分頁放入口味' : '約 30% 單會加配料，+$5', r.ng && !S.ng ? '二周目' : st < r.need ? r.need + '★ 解鎖' : '💡' +
      r.cost, r.ng && !S.ng || st < r.need || S.ideas < r.cost, '💡')).join('') || '<p>全部研究完成了！</p>';
  }
  if (tab === 'crew') {
    title = `👥 員工 ${S.crew.length}/${D.staffMax(st)}`;
    html = S.crew.map(c => item('train:' + c.id, `${ROLES[c.role].icon} ${c.name} Lv${c.lv}`, `經驗 ${c.xp}/${D.xpNeed(c.lv)} · 薪水 $${25 +
      10 * (c.lv - 1)}/天`, c.lv === 5 ? '最高等級' : '受訓 $' + D.trainCost(c.lv), c.lv === 5 || c.xp < D.xpNeed(c.lv) ||
      S.money < D.trainCost(c.lv), '👤')).join('') + '<h3>雇用新夥伴</h3>' + Object.entries(ROLES).map(([id, r]) => item('hire:' + id, r.name, {
      server: '自動做單，閒下來會幫店長',
      cleaner: '自動尋路清理髒桌子',
      promoter: '每天客人 +1.5 × 等級'
    }[id], '$' + D.hireCost(S.crew.length), S.money < D.hireCost(S.crew.length) || S.crew.length >= D.staffMax(st), r.icon)).join('');
  }
  if (tab === 'expand') {
    title = '🏗 擴大雪糕店';
    const lc = [800, 1600, 3000][S.lots - 2];
    html = item('buy:lot', '買下隔壁店面', `${S.lots}/5 個店面，下一間需要 ${S.lots}★`, lc ? '$' + lc : '已買齊', S.lots >= 5 || st < S.lots ||
      S.money < lc, '🏬') + item('buy:freezer', '加一台冰櫃', `${S.freezers}/${S.lots * 2} 台，每台 4 桶`, '$' + Math.round(300 * Math.pow(1.6,
      S.freezers - 1) / 50) * 50, S.freezers >= S.lots * 2, '🧊') + item('buy:window', '加收銀窗口', `${S.windows}/${S.lots * 2} 個，需有店員照顧新窗口`,
      '$' + ([250, 500, 900][S.windows - 1] || Math.round(900 * Math.pow(1.6, S.windows - 3))), S.windows >= S.lots * 2 ||
      S.crew.filter(c => c.role === 'server').length < S.windows, '💰') + '<h3>價位（隨時能換）</h3>' + [['budget', '平價', '價錢 ×0.8，客人 +30%'],
      ['standard', '標準', '正常價錢與客流'], ['premium', '高級', '價錢 ×1.25，客人 −20%；裝潢低於 20 心情 −10']].map(([id, n, t]) => item('price:' + id, n, t,
      S.price === id ? '✔ 使用中' : '切換', false, '🏷')).join('');
  }
  if (tab === 'stats') {
    title = '📊 經營手帳';
    html = [
      `<div class="report"><p>${goalText()}</p><p>🏆 本季主題：${THEMES[S.theme].name}`,
      `<br>第 ${Math.ceil(S.day / 7) * 7} 天雪糕節 · 歷年冠軍 ${S.contestWins} 次${S.lastContest ?
        `<br>上次第 ${S.lastContest.rank} 名，${S.lastContest.score.toFixed(0)} 分` : ''}`,
      `</p><p>魅力 ${charm()} · 座位 ${totalSeats()} · 學會 ${S.learned.length}`,
      ` 種口味<br>總服務 ${S.stats.served} 人 · 總收入 $${S.stats.earned}<br>生涯：${S.career.served + S.stats.served}`,
      ` 位客人 · 第 ${S.ng + 1} 間店</p><h3>客人圖鑑</h3>${Object.entries(TYPES).filter(([id]) => id !== 'critic' || S.ng).map(([id, t]) => [
      `<p>${t.name} · 耐心 ${t.patience} 秒<br>最愛：${S.favs[id].map(f => (S.revealed[id] || []).includes(f) ? FLAVORS[f].name :
        '❓').join('、')}<br><small>曾許願：${(S.wishLog[id] || []).map(f => FLAVORS[f].name).join('、') || '還沒聽到願望'}`,
      `</small></p>`
    ].join('')).join('')}<h3>最近報表</h3>${S.reports.slice(-7).reverse().map(r => `<small>第 ${r.day} 天：收入 $${r.income +
      r.tips} · 薪租 $${r.salary + r.rent} · ${r.served} 人 · ${r.avg.toFixed(1)}★</small>`).join('')}`,
      `<h3>🏆 獎盃牆</h3>${S.trophies.map(t => `<p>${esc(t.name)} · 第 ${t.day} 天</p>`).join('') || '<p>第一座獎盃在等你！</p>'}${S.legend ?
        '<p>👑 傳說目標：三連冠 ' + S.streak + '/3、研究全口味、5 店面＋魅力 80</p>' : ''}</div>`
    ].join('');
  }
  $('sheet').innerHTML = `<h2>${title}<button data-act="close">✕</button></h2>${html}`;
  $('sheet').hidden = false;
}
function selectObject(o, kind) {
  selected = {
    o,
    kind
  };
  tab = 'object';
  const d = (kind === 'seat' ? SEATS : DECOR)[o.type];
  $('sheet').hidden = false;
  $('sheet').innerHTML = [
    `<h2>${d.name}<button data-act="close">✕</button></h2><p>${kind === 'seat' ?
      `座位 ${d.seats} · 舒適 ${d.comfort} · 附近魅力 ${seatCharm(o)}` : '魅力 +' + d.val}`,
    `</p><div class="row"><button data-act="move" ${o.occupied?.length ? 'disabled' : ''}>✋ 搬移</button>${kind === 'decor' ?
      '<button data-act="flip">⇋ 轉向</button>' : ''}`,
    `<button data-act="sell" ${o.occupied?.length ? 'disabled' : ''}>收起退 $${Math.floor(d.cost / 2)}</button></div>`
  ].join('');
}
function style(kind, id, cost) {
  const k = kind + ':' + id;
  if (!S.styles.includes(k)) {
    if (S.money < cost) {
      return false;
    }
    S.money -= cost;
    S.styles.push(k);
  }
  S[kind] = id;
  save();
  return true;
}
function act(action) {
  const [cmd, a, b, c] = action.split(':');
  if (cmd === 'close') {
    $('sheet').hidden = true;
    return;
  }
  if (cmd === 'place') {
    startPlace(a, b);
    return;
  }
  if (cmd === 'confirm') {
    confirmPlace();
    return;
  }
  if (cmd === 'cancel') {
    placer.cancel();
    $('placeBar').hidden = true;
    return;
  }
  if (cmd === 'slot') {
    stockSlot = +a;
    renderSheet();
    return;
  }
  if (cmd === 'stock') {
    setStock(stockSlot, a);
    stockSlot = null;
  }
  if (cmd === 'research') {
    research(a);
  }
  if (cmd === 'hire') {
    hire(a);
  }
  if (cmd === 'train') {
    train(+a);
  }
  if (cmd === 'buy') {
    if (!buy(a)) {
      toast('還沒達到條件，先繼續經營吧！');
    }
  }
  if (cmd === 'price') {
    buy('price', a);
  }
  if (cmd === 'style') {
    style(a, b, +c);
  }
  if (cmd === 'move' && selected) {
    startMove(selected.o, selected.kind);
    return;
  }
  if (cmd === 'flip' && selected) {
    selected.o.flip = !selected.o.flip;
    save();
    return;
  }
  if (cmd === 'sell' && selected) {
    const {
      o,
      kind
    } = selected;
    if (o.occupied?.length) {
      return;
    }
    S.money += Math.floor((kind === 'seat' ? SEATS : DECOR)[o.type].cost / 2);
    S[kind === 'seat' ? 'seats' : 'decor'] = S[kind === 'seat' ? 'seats' : 'decor'].filter(v => v.id !== o.id);
    buildGrid();
    $('sheet').hidden = true;
    save();
    return;
  }
  renderSheet();
  dirtyUI = true;
}

// ===== 介面：做雪糕面板 =====
const treatCache = new Map();
function makeImage(o) {
  const key = JSON.stringify([o.kind, o.scoops, o.topping]);
  if (!treatCache.has(key)) {
    if (treatCache.size > 500) {
      treatCache.clear();
    }
    treatCache.set(key, toCanvas(treat({
      kind: o.kind || 'cone',
      scoops: o.scoops.map(id => FLAVORS[id].color),
      topping: o.topping
    })));
  }
  return treatCache.get(key);
}
const imageCache = new Map();
function bmpURL(b, key) {
  if (!imageCache.has(key)) {
    imageCache.set(key, toCanvas(b).toDataURL());
  }
  return imageCache.get(key);
}
// 平常只在資料改變時換面板 HTML，避免每幀重建按鈕而吃掉小朋友的點擊。
function renderMake() {
  const guest = playerGuest();
  if (!guest) {
    $('make').className = 'idle';
    $('make').innerHTML = '等客人中… 點髒桌子可以清理';
    return;
  }

  const flavorsHTML = stocked().map(id => {
    const flavor = FLAVORS[id];
    const image = bmpURL(tub(flavor.color), 'tub:' + id);
    const seasonIcon = flavor.season === season() ? D.SEASON_ICONS[season()] : '';
    return [
      `<button data-craft="scoop:${id}"><img src="${image}" alt="">`,
      `${flavor.name}${seasonIcon}</button>`
    ].join('');
  }).join('');
  const toppingsHTML = S.toppings.map(id => {
    const chosen = craft.topping === id ? ' ✔' : '';
    return `<button data-craft="topping:${id}">${TOPPINGS[id]}${chosen}</button>`;
  }).join('');
  const firstOrderHint = S.day === 1 && S.stats.served === 0
    ? '<div class="hint">看單子 → 點下面口味！</div>'
    : '';

  $('make').className = '';
  $('make').innerHTML = [
    `<div class="previews"><label>${guest.special ? '✨ ' : ''}單子`,
    '<canvas id="orderPic" width="20" height="36"></canvas></label>',
    '<label>你做的<canvas id="craftPic" width="20" height="36"></canvas></label>',
    '<div class="actions"><button data-craft="reset">🗑 重來</button>',
    `<button data-craft="submit" ${craft.scoops.length ? '' : 'disabled'}>✔ 交給客人</button>`,
    '</div></div>',
    `<small>${esc(orderText(guest.order))}</small>${firstOrderHint}`,
    '<div class="row">',
    `<button data-craft="kind:cone">🍦 甜筒${craft.kind === 'cone' ? ' ✔' : ''}</button>`,
    `<button data-craft="kind:cup">🥤 杯裝${craft.kind === 'cup' ? ' ✔' : ''}</button>`,
    `</div><div class="ingredients">${flavorsHTML}</div>`,
    S.toppings.length ? `<div class="row">${toppingsHTML}</div>` : ''
  ].join('');

  const orderContext = $('orderPic').getContext('2d');
  const craftContext = $('craftPic').getContext('2d');
  orderContext.drawImage(makeImage(guest.order), 0, 0);
  if (craft.scoops.length) {
    craftContext.drawImage(makeImage(craft), 0, 0);
  }
  requestAnimationFrame(() => {
    cam.resize();
  });
}

function craftAction(action) {
  if (!playerGuest() || pendingChange) {
    return;
  }
  const [cmd, id] = action.split(':');
  playerGuest().playerTouched = true;
  if (cmd === 'reset') {
    craft = {
      kind: null,
      scoops: [],
      topping: null
    };
  }
  if (cmd === 'kind') {
    craft.kind = id;
  }
  if (cmd === 'scoop' && craft.scoops.length < 3) {
    craft.kind ??= 'cone';
    craft.scoops.push(id);
    tone(450 + craft.scoops.length * 140, .06, 'sine', .08);
  }
  if (cmd === 'topping') {
    craft.topping = craft.topping === id ? null : id;
  }
  if (cmd === 'submit') {
    submit();
  } else {
    const g = playerGuest();
    if (g && craft.kind === g.order.kind && craft.topping === g.order.topping && craft.scoops.length === g.order.scoops.length &&
      craft.scoops.every((v, i) => v === g.order.scoops[i])) {
      submit();
    }
  }
  dirtyUI = true;
}
// 場景素材採快取，排序只處理會前後遮擋的家具和人物。

// ===== 畫面：素材、人物與場景 =====
const assets = new Map();
function asset(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (!assets.has(key)) {
    const maker = name === 'wall' ? wall : (ICE_KIT[name] || KIT[name])?.make;
    if (!maker) {
      throw new Error('缺少素材 ' + name);
    }
    assets.set(key, toCanvas(maker(opts)));
  }
  return assets.get(key);
}
function drawAsset(name, x, y, opts = {}, flip = false) {
  const b = asset(name, opts);
  if (flip) {
    ctx.save();
    ctx.translate(x + b.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(b, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(b, x, y);
  }
}
function drawPerson(g, seated = false) {
  const sheet = toCanvas(makeCharacter(g.look));
  const col = g.moving ? 2 + Math.floor(g.frame) % 4 : Math.floor(g.frame || 0) % 2;
  const row = [2, 3, 1, 0][g.dir ?? 3];
  ctx.drawImage(sheet, col * FW, row * FH, FW, seated ? 24 : FH, Math.round(g.x - 12), Math.round(g.y - 30), FW, seated ? 24 : FH);
  if (seated && g.made) {
    ctx.drawImage(makeImage(g.made), g.x + 4, g.y - 20, 10, 18);
  }
}
function drawSeat(o, ghost = false) {
  const x = o.x * 32;
  const y = o.y * 32;
  if (o.type === 'stool') {
    drawAsset('stool', x, y);
  } else if (o.type === 'table4') {
    drawAsset('chair_down', x + 32, y);
    drawAsset('chair_right', x, y + 32);
    drawAsset('table', x + 32, y + 32);
    drawAsset('chair_left', x + 64, y + 32);
    drawAsset('chair_up', x + 32, y + 64);
  } else {
    drawAsset(o.type === 'sofa2' ? 'sofa' : 'chair_right', x, y, o.type === 'sofa2' ? {
      dir: 'right'
    } : {});
    drawAsset('table', x + 32, y);
    drawAsset(o.type === 'sofa2' ? 'sofa' : 'chair_left', x + 64, y, o.type === 'sofa2' ? {
      dir: 'left'
    } : {});
  }
  if (o.dirty && !ghost) {
    drawAsset('trash', x + (SEATS[o.type].w * 32 - 16) / 2, y + (o.type === 'table4' ? 32 : 0));
  }
}
function drawDecor(o) {
  const b = asset(o.type);
  drawAsset(o.type, o.x * 32, o.y * 32 + 32 - b.height, {}, o.flip);
}
function float(x, y, text, color) {
  floaters.push({
    x,
    y,
    text,
    color,
    life: 2
  });
}
function label(text, x, y, color = '#fff1dc', size = 10) {
  ctx.font = `bold ${size * cam.kz()}px system-ui`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#33213f';
  ctx.fillText(text, x + cam.kz(), y + cam.kz());
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
// 櫃台後的人先畫，再畫櫃台遮住下半身；座位區依 y 排序以呈現前後遮擋。
function draw(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = ['#c8e1cf', '#d9ebed', '#dfcba8', '#cbd7e8'][season()];
  ctx.fillRect(0, 0, cv.width, cv.height);
  cam.apply(ctx);
  const owned = S.lots * 6;
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < COLS; x++) {
      if (y >= 12) {
        drawAsset('sidewalk', x * 32, y * 32);
      } else if (x < owned && y >= 2) {
        drawAsset('floor_' + S.floor, x * 32, y * 32);
      } else if (x >= owned) {
        ctx.fillStyle = '#92849d';
        ctx.fillRect(x * 32, y * 32, 32, 32);
        if (y === 7 && x % 6 === 3) {
          label('待售店面', x * 32, y * 32, '#e8d9e9', 12);
        }
      }
    }
  }
  for (let x = 0; x < owned; x++) {
    drawAsset('wall', x * 32, 0, {
      color: S.wall === 'pink' ? '#ffc1d5' : '#9fe3cf',
      kind: ['window', 'shelf'].includes(S.wall) ? S.wall : 'plain'
    });
  }
  for (let k = 0; k < S.freezers; k++) {
    drawAsset('freezer', (Math.floor(k / 2) * 6 + k % 2 * 3) * 32, 64, {
      flavors: S.stock[k].map(id => id ? FLAVORS[id].color === 'rainbow' ? '#b98cff' : FLAVORS[id].color : '#b9b1c4')
    });
  }
  // 店員先畫，再由櫃台遮住下半身。
  const manager = {
    look: {
      ...randomLook(7),
      hair: 'bun',
      cloth: '#ff8fb1'
    },
    x: 48,
    y: 155,
    dir: 3,
    frame: now / 650
  };
  drawPerson(manager);
  for (const a of staff.filter(a => a.c.role === 'server')) {
    drawPerson(a);
  }
  for (let x = 0; x < owned; x += 2) {
    drawAsset('counter', x * 32, 144);
  }
  for (const w of windows) {
    drawAsset('register', windowX(w.i) * 32, 135);
    // 窗口 0 不放名牌，避免櫃台下緣的文字壓在點單客人頭上。
    if (w.i !== 0) {
      label(w.crew ? '店員' : '未開放', (windowX(w.i) + .5) * 32, 190, '#f5edf8', 8);
    }
  }
  const layers = [];
  for (const o of S.seats) {
    layers.push({
      y: (o.y + SEATS[o.type].h) * 32,
      draw: () => drawSeat(o)
    });
  }
  for (const o of S.decor) {
    layers.push({
      y: (o.y + 1) * 32,
      draw: () => drawDecor(o)
    });
  }
  for (const g of guests) {
    layers.push({
      y: g.y,
      draw: () => drawPerson(g, g.state === 'eat')
    });
  }
  for (const a of staff.filter(a => a.c.role !== 'server')) {
    layers.push({
      y: a.y,
      draw: () => {
        drawPerson(a);
        if (a.c.role === 'promoter') {
          ctx.fillStyle = '#fff1dc';
          ctx.fillRect(a.x - 15, a.y - 35, 30, 15);
          label('雪糕！', a.x, a.y - 24, '#c64f81', 8);
        }
      }
    });
  }
  layers.sort((a, b) => a.y - b.y).forEach(o => o.draw());
  for (let x = 0; x < owned; x++) {
    if (x !== 2) {
      drawAsset('storefront', x * 32, 352);
      drawAsset('awning', x * 32, 376);
    } else {
      ctx.fillStyle = '#fff1dc';
      ctx.fillRect(x * 32, 376, 32, 5);
    }
  }
  if (clock.night()) {
    ctx.fillStyle = `rgba(44,29,75,${(clock.t - .7) * .7})`;
    ctx.fillRect(0, 0, owned * 32, 448);
    for (let x = 1; x < owned; x += 5) {
      const g = ctx.createRadialGradient(x * 32, 145, 0, x * 32, 145, 80);
      g.addColorStop(0, '#fff4b52b');
      g.addColorStop(1, '#fff4b500');
      ctx.fillStyle = g;
      ctx.fillRect(x * 32 - 80, 65, 160, 160);
    }
  }
  for (const g of guests) {
    if (g.state === 'order') {
      const k = cam.kz();
      const x = g.x;
      const y = g.y - 77;
      ctx.fillStyle = '#fff3e9';
      ctx.strokeStyle = g.special ? '#ffd84a' : '#ff7fa8';
      ctx.lineWidth = 2 * k;
      ctx.fillRect(x - 20 * k, y - 14 * k, 40 * k, 51 * k);
      ctx.strokeRect(x - 20 * k, y - 14 * k, 40 * k, 51 * k);
      ctx.drawImage(makeImage(g.order), x - 10 * k, y - 11 * k, 20 * k, 36 * k);
      label(g.special ? '✨ 特別單' : g.window === 0 ? '↓ 請幫我做' : '製作中', x, y + 32 * k, '#aa3d73', 7);
      if (S.day === 1 && S.stats.served === 0 && g.window === 0) {
        label('↓ 看單子，點下面口味！', x + 38 * k, y - 20 * k, '#ffd84a', 9);
      }
      const ratio = Math.max(0, 1 - g.waited / g.patience);
      ctx.fillStyle = '#674268';
      ctx.fillRect(x - 14 * k, g.y + 3, 28 * k, 3 * k);
      ctx.fillStyle = '#9fe8cf';
      ctx.fillRect(x - 14 * k, g.y + 3, 28 * k * ratio, 3 * k);
    }
    if (g.bubble) {
      label(g.bubble.text, g.x, g.y - 34, '#fff1dc', 9);
    }
  }
  for (const a of staff) {
    if (a.bubble) {
      label(a.bubble.text, a.x, a.y - 32);
    }
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    label(f.text, f.x, f.y, f.color, 12);
    ctx.globalAlpha = 1;
  }
  if (placer.active) {
    const p = placer.p;
    ctx.globalAlpha = .65;
    if (p.kind === 'seat') {
      drawSeat(p, true);
    } else {
      drawDecor(p);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.reason ? '#ff557c' : '#9fe8cf';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x * 32, p.y * 32, p.w * 32, p.h * 32);
  }
}

// ===== 鏡頭與輸入 =====
function focusOwned() {
  cam.focus({
    x: 0,
    y: 0,
    w: S.lots * 192,
    h: 448
  }, {
    portraitMax: 1.1
  });
}
function focusCounter() {
  // 面板在 canvas 外，焦點以目前可用畫布定位窗口。
  cam.focus({
    x: 0,
    y: 75,
    w: Math.min(S.lots * 192, 420),
    h: 265
  }, {
    portraitMax: 1.25
  });
}
function resize() {
  cam.resize();
  if (S) {
    focusOwned();
  }
}
new ResizeObserver(() => cam.resize()).observe($('stage'));
addEventListener('resize', resize);
function objectAt(x, y) {
  return [...S.seats.map(o => ({
    o,
    kind: 'seat'
  })), ...S.decor.map(o => ({
    o,
    kind: 'decor'
  }))].reverse().find(({
    o
  }) => {
    const r = rect(o);
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  });
}
Y.bindPointer(cv, cam, {
  blocked: () => !running || summary || !!choice || contest || !!pendingChange,
  onTap: (x, y) => {
    if (placer.active) {
      placer.moveTo(Math.floor(x / 32 - placer.p.w / 2 + .5), Math.floor(y / 32 - placer.p.h / 2 + .5));
      return;
    }
    if (y >= 64 && y < 112) {
      const a = Math.floor(x / 192) * 2 + (x % 192 >= 96 ? 1 : 0);
      const b = Math.max(0, Math.min(3, Math.floor(x % 96 / 24)));
      const id = S.stock[a]?.[b];
      if (id) {
        craftAction('scoop:' + id);
        return;
      }
    }
    const g = guests.find(g => Math.abs(g.x - x) < 13 && y > g.y - 32 && y < g.y + 4);
    if (g) {
      Y.bubble(g, `${TYPES[g.type].name} · ${Math.round(Math.max(0, 1 - g.waited / g.patience) * 100)}% 耐心`, 3);
      return;
    }
    const hit = objectAt(Math.floor(x / 32), Math.floor(y / 32));
    if (hit) {
      if (hit.kind === 'seat' && hit.o.dirty) {
        clean(hit.o);
      } else {
        selectObject(hit.o, hit.kind);
      }
    } else {
      $('sheet').hidden = true;
    }
  },
  onHold: (x, y) => {
    const hit = objectAt(Math.floor(x / 32), Math.floor(y / 32));
    return hit ? startMove(hit.o, hit.kind) : false;
  },
  ghostHit: (x, y) => placer.active && x >= placer.p.x * 32 && x < (placer.p.x + placer.p.w) * 32 && y >= placer.p.y * 32 &&
    y < (placer.p.y + placer.p.h) * 32,
  onGhostGrab: (x, y) => placer.grab(x, y),
  onGhostDrag: (x, y) => placer.dragTo(x, y),
  onHover: (x, y) => {
    if (placer.active) {
      placer.moveTo(Math.floor(x / 32 - placer.p.w / 2 + .5), Math.floor(y / 32 - placer.p.h / 2 + .5));
    }
  }
});

// ===== 介面：時鐘、HUD 與主迴圈 =====
function hud() {
  $('date').textContent = `第 ${S.day} 天 · ${D.SEASON_ICONS[season()]}${Y.seasonOf(S.day)} ${dayEvent}`;
  $('clock').textContent = clock.clockText();
  $('money').textContent = `$${S.money}　💡${S.ideas}`;
  const st = star();
  const base = D.STAR_REP[st - 1];
  const top = D.STAR_REP[st] || base + 1000;
  $('reputation').innerHTML = [
    `${'★'.repeat(st)} <span class="rep"><i style="width:${Math.min(100,
      (S.rep - base) / (top - base) * 100)}%"></i></span> <small style="display:inline">${S.rep}`,
    `</small>`
  ].join('');
  $('challenge').textContent = '🎯 ' + challengeText() + (dayStats.challenge ? ' ✔' : '');
}
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000 || 0);
  last = now;
  if (running) {
    if (!paused) {
      update(dt * speed);
    }
    hud();
    if (dirtyUI) {
      dirtyUI = false;
      renderMake();
    }
    draw(now);
  }
  requestAnimationFrame(loop);
}
function showSettings() {
  $('settings').hidden = false;
  renderSettings();
}
function renderSettings() {
  $('settingsBody').innerHTML = [
    `<div class="row"><button data-setting="math">✨特別客人找錢題：${settings.math ? '開' :
      '關'}</button><button data-setting="sfx">音效：${audioPrefs.sfx ? '開' : '關'}`,
    `</button><button data-setting="music">音樂：${audioPrefs.music === 'off' ? '關' : '開'}</button></div>`
  ].join('');
}
let codeImport = false;
async function codeBox(importing) {
  codeImport = importing;
  $('codeBox').hidden = false;
  $('codeTitle').textContent = importing ? '📥 輸入存檔碼' : '📦 備份存檔碼';
  $('codeText').value = importing ? '' : S ? await codec.encode(S) : '';
  $('codeMsg').textContent = importing ? '貼上整串存檔碼，再按讀取。' : '長按文字也能全選複製，貼到安全的地方保存。';
  $('codeGo').textContent = importing ? '讀取' : '複製';
}

// ===== 輸入：按鈕與畫面切換 =====
// DOM 事件以固定容器代理，手機與滑鼠使用相同的操作流程。
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) {
    return;
  }
  if (b.dataset.act) {
    act(b.dataset.act);
  }
  if (b.dataset.tab) {
    openTab(b.dataset.tab);
  }
  if (b.dataset.craft) {
    craftAction(b.dataset.craft);
  }
  if (b.dataset.location !== undefined) {
    openLocation(locationOptions[+b.dataset.location].id);
  }
  if (b.dataset.change !== undefined) {
    answerChange(+b.dataset.change);
  }
  if (b.dataset.pick !== undefined) {
    pick(+b.dataset.pick);
  }
  if (b.dataset.contest && !contestDone) {
    const id = b.dataset.contest;
    if (contestSelected.includes(id)) {
      contestSelected = contestSelected.filter(v => v !== id);
    } else if (contestSelected.length < 3) {
      contestSelected.push(id);
    }
    renderContest();
  }
  if (b.dataset.setting) {
    if (b.dataset.setting === 'math') {
      settings.math = !settings.math;
    }
    if (b.dataset.setting === 'sfx') {
      audioPrefs.sfx = !audioPrefs.sfx;
    }
    if (b.dataset.setting === 'music') {
      audioPrefs.music = audioPrefs.music === 'off' ? 'auto' : 'off';
      if (audioPrefs.music === 'off') {
        stopMusic();
      } else {
        playMusic('icecream');
      }
    }
    writeJSON('icecream-settings', settings);
    saveAudioPrefs();
    renderSettings();
  }
});
$('locationCancel').onclick = cancelLocation;
$('startBtn').onclick = () => S ? begin() : chooseLocation();
$('restart').onclick = () => {
  if (!S || confirm('要重新開一間店嗎？舊進度會被新的店取代，先備份就能留住喔。')) {
    chooseLocation();
  }
};
$('home').onclick = async () => {
  placer.cancel();
  $('placeBar').hidden = true;
  await save();
  running = false;
  stopMusic();
  $('game').hidden = true;
  $('sheet').hidden = true;
  $('start').hidden = false;
  startLabel();
};
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? '▶' : '⏸';
};
$('speed').onclick = () => {
  speed = speed === 1 ? 2 : 1;
  $('speed').textContent = speed === 1 ? '⏩' : '2×';
};
$('settingsBtn').onclick = showSettings;
$('settingsClose').onclick = () => {
  $('settings').hidden = true;
};
$('plus').onclick = () => cam.zoomAt(1.2, cam.w / 2, cam.h / 2);
$('minus').onclick = () => cam.zoomAt(1 / 1.2, cam.w / 2, cam.h / 2);
$('focus').onclick = focusOwned;
$('next').onclick = next;
$('contestGo').onclick = () => contestDone ? next() : contestPick(contestSelected);
$('backup').onclick = () => codeBox(false);
$('import').onclick = () => codeBox(true);
$('codeClose').onclick = () => {
  $('codeBox').hidden = true;
};
$('codeGo').onclick = async () => {
  try {
    if (codeImport) {
      const s = await codec.decode($('codeText').value);
      S = normalize(s);
      await save();
      startLabel();
      $('codeMsg').textContent = '讀取成功！按開店就能繼續。';
    } else {
      try {
        await navigator.clipboard.writeText($('codeText').value);
        $('codeMsg').textContent = '已複製！';
      } catch {
        $('codeText').select();
        $('codeMsg').textContent = '已選取，請長按複製。';
      }
    }
  } catch (e) {
    $('codeMsg').textContent = e.message;
  }
};
$('legend').onclick = () => {
  S.legend = true;
  S.ended = true;
  $('ending').hidden = true;
  save();
  toast('👑 傳說模式！挑戰三連冠、全口味與夢幻店面！');
};
$('branch').onclick = () => {
  $('carry').innerHTML = '<p>帶一位夥伴去新店（最多保留 Lv3）</p>' + S.crew.map(c => `<button data-carry="${c.id}">${c.name} Lv${Math.min(3,
    c.lv)}</button>`).join('') + '<button data-carry="none">自己先出發</button>';
};
$('carry').onclick = e => {
  const b = e.target.closest('[data-carry]');
  if (b) {
    chooseLocation(S, b.dataset.carry === 'none' ? null : +b.dataset.carry);
  }
};

// ===== 開發用 API =====
function advance(sec) {
  const oldPause = paused;
  paused = false;
  for (let t = 0; t < sec; t += .1) {
    update(Math.min(.1, sec - t));
    if (summary || choice || contest || pendingChange) {
      break;
    }
  }
  paused = oldPause;
  dirtyUI = true;
  if (running && S) {
    // 背景預覽可能停掉 requestAnimationFrame；開發用快轉必須自行更新所有可見狀態。
    hud();
    renderMake();
    dirtyUI = false;
    // 面板高度可能剛改變，先取得最新畫布尺寸，再畫這一格，不能等下一次動畫回呼。
    cam.resize();
    draw(performance.now());
  }
}
if (import.meta.env.DEV) {
  window.ICE = {
    get S() {
      return S;
    },
    advance,
    serve(perfect = true) {
      if (pendingChange) {
        answerChange(pendingChange.cash - pendingChange.bill);
        return true;
      }
      const g = playerGuest();
      if (!g) {
        return false;
      }
      const made = structuredClone(g.order);
      if (!perfect) {
        const alt = stocked().find(id => id !== made.scoops[0]);
        made.scoops[0] = alt || 'vanilla';
      }
      return submit(made, true, true);
    },
    waiting: () => !!playerGuest(),
    buy,
    place,
    research,
    hire,
    train,
    setStock,
    inSummary: () => summary,
    inChoice: () => !!choice,
    inContest: () => contest,
    pick,
    contestPick,
    next,
    showEnding,
    newGamePlus(carryId, location) {
      const old = S;
      if (location) {
        ngPending = {
          old,
          carryId
        };
        openLocation(location);
      } else {
        chooseLocation(old, carryId);
      }
    },
    save,
    encode: () => codec.encode(S),
    decode: code => codec.decode(code)
  };
}

// ===== 開始：讀檔與啟動 =====
renderWho($('who'), '是店長');
lockGestures();
const loaded = await Y.loadBest(key);
if (loaded && loaded.v === 1 && Array.isArray(loaded.seats)) {
  S = normalize(loaded);
}
startLabel();
requestAnimationFrame(loop);
