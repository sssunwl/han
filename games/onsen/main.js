import '../../shared/offline.js';
import { saveKey, getProfiles, currentProfile } from '../../shared/profile.js';
import { readJSON, writeJSON, tone, noise, fanfare, renderWho, lockGestures, escapeHTML, audioPrefs, saveAudioPrefs } from '../../shared/kit.js';
import { TRACKS, playMusic, stopMusic, nowPlaying } from '../../shared/music.js';
import { toCanvas } from '../../shared/pixelkit/core.js';
import { JP_KIT } from '../../shared/pixelkit/japanese.js';
import { makeCharacter, randomLook, FW, FH, HAIRS, SKINS } from '../../shared/pixelkit/character.js';
import {
  T, COLS, ROWS, CHUNK, OY, DAY_SECONDS, YEAR_DAYS, START_CHUNKS, ENTRANCE, SPAWN, DESK, QUEUE, isReserved, isDeskArea,
  landCost, landNeed, FAC, FAC_ORDER, DECOR, DECOR_ORDER, COMBOS, RESEARCH, STAFF_HIRE, staffMax,
  STAFF_ROLES, ROLE_ORDER, STAFF_NAMES, STAFF_MAX_LV, xpNeed, trainCost, salaryOf,
  ADS, AD_DAYS, STAR_REP, REVIEW_REP, starsOf, TYPES, TYPE_KEYS, seasonOf, EVENTS, REVIEWS,
  INNS, RIVAL_NEWS, ACHIEVEMENTS, CHOICES, PATHS, WISHES,
  FLOORS, WALLS, DECO_BONUS, HALL_COST,
  MILESTONES, LEGEND_GOALS, LEGEND_RIVAL, LEGEND_GROW, NG_MONEY, NG_RIVAL, NG_CARRY_MAX_LV,
} from './data.js';
import { loadBest, saveBoth, encodeSave, decodeSave } from './store.js';
import { buildProcSprites } from './proc.js';

/* ============================================================
   溫泉旅館 v2 —— 自由建造版
   像素美術有兩套,可以在開始畫面 / 🎵 選單切換(只是換圖,存檔、玩法完全一樣):
     Pixelkit:自己用程式畫的(shared/pixelkit/),家具在 japanese.js、人物在 character.js
     LimeZu:LimeZu Modern Interiors 裁切後的 atlas(public/onsen/,tools/onsen_atlas.py 產生)+ proc.js;
             LimeZu 沒有的(v2.4 新擺設、新地板、牆紙)用 Pixelkit 的補

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
if (document.fonts) document.fonts.load('12px Cubic11').catch(() => {});   // 畫布上的字也要用像素字,先載好
renderWho($('who'), '是老闆');

// ---------- 素材 ----------
// 家具、地板:pixelkit 和風組(名字跟舊版 atlas 一樣,存檔裡的擺設直接對得上)
const SPR = {};
for (const [n, k] of Object.entries(JP_KIT)) SPR[n] = toCanvas(k.make());

// ---------- 畫風:Pixelkit / LimeZu(存在這台裝置,不是存檔的一部分)----------
const STYLE_KEY = 'sun-onsen-style';
let style = (() => { try { return localStorage.getItem(STYLE_KEY) === 'limezu' ? 'limezu' : 'pixel'; } catch (e) { return 'pixel'; } })();
const LZ = { atlas: null, R: null, spr: {}, proc: {}, ready: null };
/** LimeZu atlas 用到才載(Pixelkit 模式不用下載那張圖) */
function loadLimeZu() {
  if (!LZ.ready) LZ.ready = Promise.all([
    fetch(BASE + 'onsen/atlas.json').then(r => r.json()),
    new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = BASE + 'onsen/atlas.png'; }),
  ]).then(([R, im]) => {
    LZ.R = R; LZ.atlas = im;
    for (const [n, r] of Object.entries(R)) {
      if (n.startsWith('char')) continue;
      const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      c.getContext('2d').drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      LZ.spr[n] = c;
    }
    LZ.proc = buildProcSprites();
  }).catch(e => { LZ.ready = null; throw e; });
  return LZ.ready;
}
const isLZ = () => style === 'limezu' && !!LZ.atlas;
/** 依畫風拿圖;LimeZu 沒有的就用 Pixelkit 的 */
const IMG = n => (isLZ() && (LZ.spr[n] || LZ.proc[n])) || SPR[n];
const sprW = n => SPR[n] ? SPR[n].width : 32;         // 佔幾格:兩套一樣,一律用 Pixelkit 的尺寸算
const sprH = n => SPR[n] ? SPR[n].height : 32;
const imgW = n => IMG(n) ? IMG(n).width : 32;         // 畫的時候:用實際那張圖的大小
const imgH = n => IMG(n) ? IMG(n).height : 32;
const picCache = {};
const sprURL = n => { const k = (isLZ() ? 'L:' : 'P:') + n; return picCache[k] || (picCache[k] = IMG(n).toDataURL()); };
if (style === 'limezu') loadLimeZu().catch(() => {});

// 人物:pixelkit 的 Q 版小人(24×32,腳踩 y=30)。只換髮型/顏色,不換衣服
// 客人:char 是一個數字,同一個數字永遠長一樣(睡覺存檔只存數字)
// 員工:每種職業固定髮色 + 衣服色(data.js STAFF_ROLES.look),髮型每個人不一樣,小朋友一眼分得出誰是做什麼的
const GUEST_CLOTH = ['#ffd25a', '#b98cff', '#ff9a52', '#4a5a8a', '#e86a6a', '#5ec2b5', '#c98a55', '#ffb3c9'];   // 不跟員工制服撞色
const looks = new Map();
function guestLook(n) {
  const k = 'g' + n;
  if (!looks.has(k)) { const l = randomLook(n * 7919 + 13); l.cloth = GUEST_CLOTH[(n * 37) % GUEST_CLOTH.length]; looks.set(k, l); }
  return looks.get(k);
}
const hashStr = str => [...String(str)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
function staffLook(c) {
  const k = 's' + c.id + c.role;
  if (!looks.has(k)) { const h = hashStr(c.id); looks.set(k, { ...STAFF_ROLES[c.role].look, hair: HAIRS[h % HAIRS.length], skin: SKINS[(h >>> 4) % 4] }); }
  return looks.get(k);
}
const OKAMI = { skin: SKINS[0], hair: 'bun', hairColor: '#3a2a2a', cloth: '#8a4a7a' };      // 櫃台的老闆娘
// who = { look(Pixelkit 長相), lz(LimeZu premade 角色編號 1~20)}:兩種畫風各自用自己的
const whoCache = new Map();
function guestWho(n) { const k = 'g' + n; if (!whoCache.has(k)) whoCache.set(k, { look: guestLook(n), lz: ((n - 1) % 12) + 1 }); return whoCache.get(k); }
function staffWho(c) { const k = 's' + c.id + c.role; if (!whoCache.has(k)) whoCache.set(k, { look: staffLook(c), lz: c.char || 14 }); return whoCache.get(k); }
const OKAMI_WHO = { look: OKAMI, lz: 13 };
/** 跟人物身高有關的數字(對話泡泡、頭上的職業圖示、點人的範圍) */
const charH = () => isLZ() ? { bub: 66, soak: 50, lie: 30, icon: 64, hit: 46, deskDy: -0.35 * T } : { bub: 34, soak: 24, lie: 22, icon: 38, hit: 32, deskDy: 0 };
const sheetOf = look => toCanvas(makeCharacter(look));

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
      { id: 'f1', type: 'room', x: 8, y: OY + 16, lv: 1 },
      { id: 'f2', type: 'bath', x: 19, y: OY + 16, lv: 1 },
    ],
    decor: [{ id: 'd1', type: 'bonsai_s', x: 12, y: OY + 21 }, { id: 'd2', type: 'bush', x: 17, y: OY + 21 }], mapV: 2,
    research: [], crew: [newCrew('clean', [])], combos: [], ads: {}, sleepers: [], bestRank: null,
    stats: { guests: 0, earned: 0, best5: 0, wishes: 0 },
    ...extraFields(),
  };
}
/** v2.1 新增的欄位;舊存檔讀進來時補上 */
function extraFields() {
  return {
    perm: [], mods: [], paths: { heart: 0, biz: 0, trad: 0 }, ach: [], hist: [], typeCount: {}, wishLog: {},
    seenChoices: [], inns: INNS.map(i => ({ name: i.name, rep: i.rep, grow: i.grow, boost: 0 })), prevRank: null, news: null,
    // v2.3:里程碑、結局、傳說模式、第二間旅館
    milestones: [], legendGoals: [], trophies: [], winStreak: 0, yearWins: 0, ng: 0, ended: false, legend: false,
    bestReview: null, career: { days: 0, guests: 0, earned: 0 },
  };
}
/** 新員工:名字不重複,外觀照職業挑 */
function newCrew(role, crew) {
  const usedN = new Set(crew.map(c => c.name)), usedC = new Set(crew.map(c => c.char));
  const name = STAFF_NAMES.find(n => !usedN.has(n)) || '新人';
  const chars = STAFF_ROLES[role].chars;
  const char = chars.find(c => !usedC.has(c)) || chars[crew.length % chars.length];
  return { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name, role, lv: 1, xp: 0, char };
}
const stars = () => starsOf(S.rep);
const facById = id => S.facs.find(f => f.id === id);
const F = f => FAC[f.type];
const unlocked = id => (FAC[id] ? !FAC[id].research : !DECOR[id].research) || S.research.includes(id);
const isRoom = f => f.type === 'room' || f.type === 'bigroom';
const has = id => S.research.includes(id);           // 被動研究
const perm = id => (S.perm || []).includes(id);      // 人生選擇留下的永久效果
const rankNow = () => 1 + S.inns.filter(i => i.rep > S.rep).length;
const modSum = k => (S.mods || []).reduce((a, m) => a + (m[k] || 0), 0);
// 員工效果:同職業的等級加起來(有上限),接待只看站在櫃台最厲害的那位
const crewSum = (role, cap = 8) => Math.min(cap, S.crew.filter(c => c.role === role).reduce((a, c) => a + c.lv, 0));
const deskLv = () => Math.max(0, ...staff.filter(a => a.state === 'desk').map(a => a.c.lv));
const cookLvAt = id => Math.min(8, staff.filter(a => a.state === 'post' && a.post === id).reduce((s, a) => s + a.c.lv, 0));
function gainXp(c, n) {
  if (!c || c.lv >= STAFF_MAX_LV) return;
  const before = c.xp >= xpNeed(c.lv);
  c.xp = Math.min(xpNeed(c.lv), c.xp + n);
  if (!before && c.xp >= xpNeed(c.lv)) toast(`📘 ${c.name}(${STAFF_ROLES[c.role].name})經驗滿了,可以去「員工」幫他受訓升級!`);
}

// ---------- 存檔 ----------
function save() {
  if (!S) return;
  S.sleepers = guests.filter(g => g.state === 'sleep').map(g => ({
    char: g.char, type: g.type, room: g.room, sat: g.sat, vip: g.vip, group: g.group,
  }));
  // 搬移到一半:先把東西放回原位再存,不然存檔裡它會不見
  const moving = place && place.kind === 'move';
  if (moving) putBack(place);
  S.savedAt = Date.now();
  const r = saveBoth(SAVE_KEY, S);          // localStorage + IndexedDB 兩份(見 store.js)
  if (moving) takeOut(place);
  savedBadge(r.ls ? 'ok' : 'backup');
  if (!r.ls) r.idb.then(ok => { if (!ok) savedBadge('fail'); });
}
// iPhone 主畫面 App 直接滑掉時 pagehide / visibilitychange 不一定會觸發 → 另外每 15 秒自動存一次
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);
setInterval(() => { if (running && S) save(); }, 15000);
let badgeTimer = 0, spaceWarned = false;
/** 右上角的小字:💾 已存檔 / ⚠ 存檔失敗 */
function savedBadge(kind) {
  const el = $('saveDot'); if (!el) return;
  el.textContent = kind === 'fail' ? '⚠ 存檔失敗' : '💾 已存檔';
  el.classList.toggle('bad', kind === 'fail');
  el.classList.add('on');
  clearTimeout(badgeTimer); badgeTimer = setTimeout(() => el.classList.remove('on'), kind === 'fail' ? 5000 : 1400);
  if (kind !== 'ok' && !spaceWarned) {
    spaceWarned = true;
    toast(kind === 'fail' ? '⚠ 存不了檔!請回開始畫面按「📦 備份存檔碼」把進度抄下來' : '⚠ 這台裝置的空間快滿了,存檔改放在備用位置。建議回開始畫面「📦 備份存檔碼」');
  }
}

// ============================================================
//  格子:佔用、可走、尋路、門
// ============================================================
const chunkKey = (x, y) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
const isOwned = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && S.owned.includes(chunkKey(x, y));
const decorW = type => Math.max(1, Math.round(sprW(type) / T));

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
  if (place && (place.kind === 'fac' || place.isFac) && !findDoor({ x, y, w, h }, d)) return '這裡沒有路可以進去';
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
    if ((f.type === 'bath' || f.type === 'onsen') && decorNear(r, 2, d => d.type === 'vending').length) add('milk', 6);
    if ((f.type === 'onsen' || f.type === 'footbath') && decorNear(r, 2, d => d.type === 'sakura' || d.type === 'maple').length) add('hanami', 8);
    if (f.type === 'arcade' && decorNear(r, 2, d => d.type === 'gacha').length && decorNear(r, 2, d => d.type === 'claw').length) add('gamecorner', 8);
    f.deco = OUTDOOR[f.type] ? (f.floor ? DECO_BONUS : 0) : (f.floor ? DECO_BONUS : 0) + (f.wall ? DECO_BONUS : 0);   // 裝潢加成
  }
  if (decorNear({ x: DESK.x, y: DESK.y, w: DESK.w, h: DESK.h }, 3, d => d.type === 'maneki').length) found.add('lucky');
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
  koi: L => [{ x: 0.4, y: 0.4, w: 2.4, h: 1.5 }, { x: 0.3, y: 0.3, w: 3.0, h: 1.6 }, { x: 0.25, y: 0.25, w: 3.5, h: 1.7 }][L - 1],
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
    case 'koi': { const p = POOLS.koi(L); return Array.from({ length: cap }, (_, i) => ({ x: p.x + p.w * (i + 0.5) / cap, y: 2.85, dir: 1 })); }
    case 'egg': return [{ x: 0.6, y: 1.95, dir: 1 }, { x: 1.4, y: 1.95, dir: 1 }, { x: 1.0, y: 1.6, dir: 1 }].slice(0, cap);
    case 'arcade': return [{ x: 0.5, y: 2.85, dir: 1 }, { x: 1.5, y: 2.85, dir: 1 }, { x: 2.5, y: 2.85, dir: 1 }, { x: 1.5, y: 2.25, dir: 1 }].slice(0, cap);
    case 'tea': return [{ x: 0.7, y: 2.3, dir: 0 }, { x: 2.3, y: 2.3, dir: 2 }, { x: 1.5, y: 2.85, dir: 1 }].slice(0, cap);
    case 'massage': return [{ x: 1.5, y: 1.15, dir: 3, lie: true }, { x: 1.5, y: 2.45, dir: 3, lie: true }].slice(0, cap);
    case 'shrine': return [{ x: 0.6, y: 1.95, dir: 1 }, { x: 1.4, y: 1.95, dir: 1 }, { x: 1.0, y: 1.7, dir: 1 }].slice(0, cap);
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
    do { char = 1 + Math.floor(Math.random() * 500); } while (used.has(char));     // 數字決定長相(guestLook)
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
  if (deskTimer < (has('service') ? 0.6 : 1.0) * (1 - deskLv() * 0.08)) return;
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
  const dl = deskLv();
  if (dl) { g.sat += dl * 2; const a = staff.filter(x => x.state === 'desk').sort((p, q) => q.c.lv - p.c.lv)[0]; gainXp(a.c, 0.5); }
  if (perm('cat')) g.sat += 3;
  g.sat += modSum('sat');
  S.typeCount[g.type] = (S.typeCount[g.type] || 0) + 1;
  // 小願望:想去某個喜歡的設施。有蓋 → 用到就「願望實現」;沒蓋 → 記下來給老闆看
  const likes = TYPES[g.type].likes;
  const want = likes[Math.floor(Math.random() * likes.length)];
  if (Math.random() < 0.35 && WISHES[want]) {
    if (S.facs.some(f => f.type === want && f.door)) { g.wish = want; if (g.plan && !g.plan.includes(want)) g.plan.unshift(want); }
    else { S.wishLog[want] = (S.wishLog[want] || 0) + 1; setTimeout(() => bubble(g, WISHES[want], 2.6), 1300); }
  }
  tone(880, 0.08, 'triangle', 0.14); setTimeout(() => tone(1175, 0.1, 'triangle', 0.12), 90);
  bubble(g, '入住!', 1.2);
  g.plan = makePlan(g);
  if (g.wish && !g.plan.includes(g.wish)) g.plan.unshift(g.wish);
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
  g.then = () => { g.dir = sp.dir; g.soak = !!sp.soak; g.under = !!sp.under; g.lie = !!sp.lie; then(); };
}
function exitFac(a) {
  const f = a.at && facById(a.at);
  if (f && f.occ && f.occ[a.spot] === a.id) f.occ[a.spot] = null;
  a.soak = false; a.under = false; a.lie = false;
  if (f && f.door) { a.x = (f.door[0] + 0.5) * T; a.y = (f.door[1] + 0.8) * T; }
  a.at = null; a.spot = -1;
}

function nextActivity(g) {
  if (t > (has('night') ? 0.88 : 0.8) || !g.plan.length) { goSleep(g); return; }
  // 路上有牛奶販賣機、扭蛋機、按摩椅…的話,有時候會先停下來玩一下(每人最多 2 次)
  if ((g.attr || 0) < 2 && Math.random() < 0.35 && tryAttraction(g)) return;
  const type = g.plan.shift();
  const f = pickFac(type, g);
  if (!f) { nextActivity(g); return; }
  bubble(g, FAC[type].icon, 2);
  enterFac(g, f.id, () => { g.state = 'using'; g.timer = FAC[type].time * (0.85 + Math.random() * 0.3); g.using = f.id; });
}
/** 找一個附近可以用的擺設,走到旁邊、停一下、付錢、開心 */
function tryAttraction(g) {
  const [gx, gy] = tileOf(g);
  const cands = [];
  for (const d of S.decor) {
    const u = DECOR[d.type].use; if (!u) continue;
    const w = decorW(d.type);
    // 擺設前面(下面一格)或左右,走得到的格子
    const spots = [];
    for (let x = d.x; x < d.x + w; x++) spots.push([x, d.y + 1, 1]);
    spots.push([d.x - 1, d.y, 0], [d.x + w, d.y, 2]);
    const ok = spots.find(([x, y]) => y >= 0 && y < ROWS && x >= 0 && x < COLS && walk[y][x] && dist[y][x] >= 0);
    if (ok) cands.push({ d, u, at: ok, far: Math.abs(ok[0] - gx) + Math.abs(ok[1] - gy) });
  }
  if (!cands.length) return false;
  cands.sort((a, b) => a.far - b.far);
  const c = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
  if (c.far > 14) return false;                      // 太遠就算了
  g.attr = (g.attr || 0) + 1; S.stats.attr = (S.stats.attr || 0) + 1;
  g.state = 'toFac';
  goTo(g, c.at[0], c.at[1], () => {
    if (!S.decor.includes(c.d)) { nextActivity(g); return; }
    g.dir = c.at[2]; g.state = 'rest'; g.timer = 2.2;
    bubble(g, c.u.icon, 2);
    g.sat += c.u.sat + (c.u.likes === g.type ? 3 : 0);
    if (c.u.fee) pay(g, c.u.fee);
    else float(g.x, g.y - 36, '♥', '#ff7a9a');
  });
  return true;
}
function finishActivity(g) {
  const f = facById(g.using);
  g.using = null;
  if (!f) { exitFac(g); nextActivity(g); return; }
  const d = F(f), L = f.lv;
  let gain = d.sat[L - 1] + (f.aura || 0) + (f.combo || 0) + (f.deco || 0);
  if (TYPES[g.type].likes.includes(f.type)) { gain *= 1.5; g.favHit = f.type; }
  if (f.type === 'onsen') gain *= seasonOf(S.day).onsen;
  if (event && event.id === 'rain' && d.pool) gain *= 1.3;
  if (has('water') && d.pool) gain += 5;
  if (perm('source') && d.pool && f.type !== 'koi') gain += 8;
  f.uses = (f.uses || 0) + 1;
  if (g.wish === f.type) { gain += 8; g.wish = null; S.stats.wishes++; float(g.x, g.y - 46, '願望實現!', '#9dffbf'); }
  if (has('cuisine') && f.type === 'dining') gain += 4;
  const cl = f.type === 'dining' ? cookLvAt(f.id) : 0;
  if (cl) { gain += cl * 2; for (const a of staff) if (a.state === 'post' && a.post === f.id) gainXp(a.c, 0.5); }
  const yl = d.pool && f.type !== 'koi' ? crewSum('yumori') : 0;
  if (yl) gain += yl * 2;
  // 玩越多項,後面的開心程度遞減(不然每個人都 5 星,設施等級就沒差了)
  gain *= Math.pow(0.75, g.done || 0);
  g.done = (g.done || 0) + 1;
  g.sat += gain;
  if (d.fee) {
    let fee = d.fee[L - 1];
    if (f.type === 'shop') fee = Math.round(fee * (0.6 + Math.random() * 0.9) * (g.type === 'family' || g.type === 'tourist' ? 1.4 : 1) * (f.street ? 1.3 : 1) * (has('souvenir') ? 1.3 : 1));
    if (f.type === 'dining' && has('cuisine')) fee = Math.round(fee * 1.25);
    if (cl) fee = Math.round(fee * (1 + cl * 0.08));
    pay(g, fee);
  }
  float(g.x, g.y - 36, '♥', '#ff7a9a');
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
  float(g.x, g.y - 40, '+¥' + amount, '#ffd84a');
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
  const rv = { st, text: lines[Math.floor(Math.random() * lines.length)].replace('{fav}', g.favHit ? FAC[g.favHit].name : '溫泉'), type: g.type, vip: g.vip };
  today.reviews.push(rv);
  if (st === 5 && (!S.bestReview || g.vip || !S.bestReview.vip)) S.bestReview = { text: rv.text, type: g.type, vip: g.vip, day: S.day };   // 結局畫面用
  today.served++; S.stats.guests++;
  if (st === 5) S.stats.best5++;
  float(g.x, g.y - 50, '★'.repeat(st), st >= 4 ? '#ffd84a' : '#ddd');
  float(g.x + 20, g.y - 36, '💡+' + idea, '#bfe8ff');
  bubble(g, st >= 4 ? '😊' : st === 3 ? '🙂' : '😞', 2);
  // 同組最後一位退房,房間就變髒
  if (r && !guests.some(o => o !== g && o.room === r.id)) r.dirty = true;
  g.room = null;
  if (stars() > before) starUp();
  if (S.stats.guests % 5 === 0) checkAch();
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
//  員工:每個人照自己的職業做事
//    打掃  找髒房間 → 走過去 → 打掃 → 回大廳
//    接待  站到櫃台旁邊(畫在櫃台後面),幫客人辦入住
//    廚師  走去食堂待著煮飯(人少的那間優先)
//    湯守  在各個浴池之間巡,調水溫
// ============================================================
const DESK_SPOTS = [DESK.x + 0.55, DESK.x + DESK.w - 0.55];
const LOBBY = i => [11 + i % 4, OY + 21];
function syncStaff() {
  staff = staff.filter(a => S.crew.includes(a.c));
  for (const c of S.crew) {
    if (staff.some(a => a.c === c)) continue;
    const i = staff.length;
    staff.push({ id: c.id, c, char: c.char, x: (LOBBY(i)[0]) * T + 16, y: (OY + 21.8) * T, dir: 3, frame: 0, moving: false, path: [], state: 'idle', target: null, post: null, timer: 0, at: null });
  }
}
/** 讓員工離開現在的崗位(設施要拆、要搬的時候) */
function releaseStaff(fid) {
  for (const a of staff) if (a.post === fid || a.target === fid || a.at === fid) {
    exitFac(a); a.moving = false; a.path = []; a.post = null; a.target = null; a.state = 'idle'; a.timer = 1;
  }
}
const nearest = (a, list) => { const [sx, sy] = tileOf(a); return list.sort((p, q) => (Math.abs(p.door[0] - sx) + Math.abs(p.door[1] - sy)) - (Math.abs(q.door[0] - sx) + Math.abs(q.door[1] - sy)))[0]; };
function updateStaff(a, dt) {
  if (a.bubble) { a.bubble.until -= dt; if (a.bubble.until <= 0) a.bubble = null; }
  if (a.moving) { moveAgent(a, dt); return; }
  a.frame += dt * 3;
  if (a.timer > 0 && (a.state === 'idle' || a.state === 'check')) { a.timer -= dt; return; }
  const role = a.c.role, lv = a.c.lv, home = () => { a.state = 'back'; goTo(a, ...LOBBY(staff.indexOf(a)), () => { a.state = 'idle'; a.dir = 3; a.timer = 1.5; }); };
  if (role === 'clean') {
    if (a.state === 'idle') {
      const claimed = new Set(staff.map(s => s.target).filter(Boolean));
      const dirty = S.facs.filter(f => f.dirty && f.door && !claimed.has(f.id) && !guests.some(g => g.room === f.id));
      if (!dirty.length) return;
      const f = nearest(a, dirty);       // 去最近的那間(本來挑清單第一間,常常要橫越整張地圖)
      a.target = f.id; a.state = 'going';
      goTo(a, f.door[0], f.door[1], () => {
        const ff = facById(a.target);
        if (!ff) { a.state = 'idle'; a.target = null; return; }
        a.at = ff.id; a.x = (ff.x + F(ff).w / 2) * T; a.y = (ff.y + F(ff).h - 0.3) * T;
        a.state = 'cleaning'; a.timer = (has('cleaning') ? 2 : 4) * (perm('raise') ? 0.7 : 1) * (1 - (lv - 1) * 0.12); bubble(a, '🧹', a.timer);
      });
    } else if (a.state === 'cleaning') {
      a.timer -= dt;
      if (a.timer <= 0) {
        const f = facById(a.target);
        if (f) { f.dirty = false; float(a.x, a.y - 36, '✨', '#fff'); gainXp(a.c, 1); }
        exitFac(a); a.target = null; home();
      }
    }
  } else if (role === 'desk') {
    if (a.state !== 'idle') return;
    const used = staff.filter(o => o.state === 'desk' || o.state === 'toDesk').map(o => o.spot);
    const spot = [0, 1].find(i => !used.includes(i));
    if (spot == null) { a.timer = 5; return; }     // 櫃台站滿了,在大廳待命
    a.state = 'toDesk'; a.spot = spot;
    goTo(a, DESK.x - 1, DESK.y + 1, () => { a.state = 'desk'; a.x = DESK_SPOTS[spot] * T; a.y = (DESK.y + 0.55) * T; a.dir = 3; });
  } else if (role === 'cook') {
    if (a.state === 'post') { if (!facById(a.post)) { a.post = null; a.state = 'idle'; } return; }
    if (a.state !== 'idle') return;
    const kitchens = S.facs.filter(f => f.type === 'dining' && f.door);
    if (!kitchens.length) { a.timer = 8; if (!a.bubble) bubble(a, '沒有食堂可以煮飯…', 2.5); return; }
    const cnt = id => staff.filter(o => o.post === id).length;
    const f = kitchens.sort((p, q) => cnt(p.id) - cnt(q.id))[0];
    a.post = f.id; a.state = 'toPost';
    goTo(a, f.door[0], f.door[1], () => {
      const ff = facById(a.post);
      if (!ff) { a.post = null; a.state = 'idle'; return; }
      const n = staff.filter(o => o.post === ff.id && o.state === 'post').length;
      a.at = ff.id; a.x = (ff.x + 2 + (n % 2) * 0.6) * T; a.y = (ff.y + 2.15) * T; a.dir = 3; a.state = 'post'; bubble(a, '🍳', 1.5);
    });
  } else if (role === 'yumori') {
    if (a.state === 'check') { exitFac(a); home(); return; }
    if (a.state !== 'idle') return;
    const pools = S.facs.filter(f => F(f).pool && f.type !== 'koi' && f.door);
    if (!pools.length) { a.timer = 8; if (!a.bubble) bubble(a, '沒有浴池可以顧…', 2.5); return; }
    const f = pools[Math.floor(Math.random() * pools.length)];
    a.state = 'patrol';
    goTo(a, f.door[0], f.door[1], () => {
      if (!facById(f.id)) { a.state = 'idle'; return; }
      a.state = 'check'; a.timer = 3; bubble(a, '♨️ 調水溫', 2.5); gainXp(a.c, 0.4);
    });
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
  if (comboOn('lucky')) n += 1;
  n += modSum('arrive');
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
  toast(S.news ? `📰 ${S.news}` : event ? event.text : `第 ${S.day} 天 · ${season.icon}${season.name}天`);
  S.news = null;
  hud();
  maybeChoice();
  pickMusic();
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
  if (t > 0.97 && today.occ == null) {
    // 入住率 = 今晚有人住的房間 / 全部房間(在大家睡下的那一刻算)
    const rooms = S.facs.filter(isRoom);
    const used = new Set(guests.filter(g => g.room && g.state !== 'leaving').map(g => g.room));
    today.occ = rooms.length ? used.size / rooms.length : 0;
    today.rooms = rooms.length;
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
  today.salary = Math.min(S.money, S.crew.reduce((a, c) => a + salaryOf(c.lv) + (perm('raise') ? 10 : 0), 0));
  S.money -= today.salary;
  for (const c of S.crew) gainXp(c, 1);          // 上了一天班,大家都多一點經驗
  for (const k of Object.keys(S.ads)) if (--S.ads[k] <= 0) delete S.ads[k];
  for (const m of S.mods) m.days--;
  S.mods = S.mods.filter(m => m.days > 0);
  // 經營紀錄(最近 28 天)
  const avg = today.reviews.length ? today.reviews.reduce((a, r) => a + r.st, 0) / today.reviews.length : null;
  S.hist.push({ d: S.day, income: today.income, served: today.served, occ: today.occ ?? 0, avg, rep: S.rep });
  if (S.hist.length > 28) S.hist.shift();
  // 對手每天成長;偶爾有新聞(成長變快,而且搶走你一點客人)
  S.prevRank = rankNow();
  for (const inn of S.inns) {
    inn.rep += Math.round(inn.grow * (0.7 + Math.random() * 0.6) * (inn.boost > 0 ? 1.6 : 1) * (S.legend ? LEGEND_GROW : 1));
    if (inn.boost > 0) inn.boost--;
  }
  if (Math.random() < 0.18) {
    const near = S.inns.filter(i => Math.abs(i.rep - S.rep) < Math.max(800, S.rep * 0.4));
    const inn = (near.length ? near : S.inns)[Math.floor(Math.random() * (near.length || S.inns.length))];
    inn.boost = 3;
    S.news = `${inn.name}${RIVAL_NEWS[Math.floor(Math.random() * RIVAL_NEWS.length)]}!客人被搶走了一些(打廣告可以搶回來)`;
    S.mods.push({ arrive: -2, days: 2, src: 'rival' });
  }
  today.newAch = checkAch();
  // 年底排行
  today.year = null;
  if (S.day % YEAR_DAYS === 0) {
    const rank = rankNow();
    const reward = Math.max(0, 13 - rank) * 200;
    S.money += reward; S.ideas += 10;
    S.bestRank = Math.min(S.bestRank || 99, rank);
    if (rank === 1) { S.winStreak++; S.yearWins++; } else S.winStreak = 0;
    today.year = { rank, reward };
  }
  today.newMs = checkMilestones();
  // 結局:五星 + 全國第一(只有一次;傳說模式不會再跳)
  if (!S.ended && stars() === 5 && rankNow() === 1) S.endingPending = true;
  S.dayDone = true;             // 結算畫面時關掉 App,下次打開直接從下一天開始(不會重玩一天)
  showSummary();
  save();
}

// ============================================================
//  里程碑、傳說目標、獎盃牆
// ============================================================
const facTypes = () => new Set(S.facs.map(f => f.type)).size;
const MS_CHECK = {
  street: () => stars() >= 3 && facTypes() >= 8,
  podium: () => rankNow() <= 3,
  meisho: () => S.facs.filter(f => f.lv === 3).length >= 6,
  threepeat: () => S.winStreak >= 3,
  maxall: () => facTypes() >= FAC_ORDER.length && S.facs.every(f => f.lv === 3),
  combos: () => S.combos.length >= COMBOS.length,
};
/** 進度文字(給「下一個目標」看) */
const MS_PROGRESS = {
  street: () => `${stars()}/3 星 · 設施 ${facTypes()}/8 種`,
  podium: () => `現在第 ${rankNow()} 名`,
  meisho: () => `Lv3 設施 ${S.facs.filter(f => f.lv === 3).length}/6 間`,
  ending: () => `${stars()}/5 星 · 全國第 ${rankNow()} 名`,
  threepeat: () => `連續第一 ${S.winStreak}/3 年`,
  maxall: () => `設施 ${facTypes()}/${FAC_ORDER.length} 種 · Lv3 ${S.facs.filter(f => f.lv === 3).length}/${S.facs.length} 間`,
  combos: () => `組合 ${S.combos.length}/${COMBOS.length}`,
};
function addTrophy(m) { S.trophies.push({ icon: m.icon, name: m.name, inn: S.ng + 1, day: S.day }); }
function checkMilestones() {
  const got = [];
  const run = (list, key) => {
    for (const m of list) {
      if (m.final || S[key].includes(m.id) || !MS_CHECK[m.id]()) continue;
      S[key].push(m.id); got.push(m); addTrophy(m);
      if (m.reward.money) S.money += m.reward.money;
      if (m.reward.ideas) S.ideas += m.reward.ideas;
    }
  };
  run(MILESTONES, 'milestones');
  if (S.legend) run(LEGEND_GOALS, 'legendGoals');
  return got;
}
/** 下一個還沒達成的目標 */
function nextGoal() {
  const list = S.legend ? LEGEND_GOALS.filter(m => !S.legendGoals.includes(m.id)) : MILESTONES.filter(m => !S.milestones.includes(m.id));
  return list[0] || null;
}

// ============================================================
//  人生選擇
// ============================================================
let inChoice = false;
function choiceOk(c) {
  const n = c.need || {};
  if (c.once && S.seenChoices.includes(c.id)) return false;
  if (n.stars && stars() < n.stars) return false;
  if (n.staff && S.crew.length < n.staff) return false;
  if (n.fac && !S.facs.some(f => f.type === n.fac)) return false;
  return true;
}
function maybeChoice() {
  if (S.day < 3 || Math.random() > 0.3) return;
  // 最近 5 天出過的不要再出
  const recent = S.seenChoices.slice(-5);
  const pool = CHOICES.filter(c => choiceOk(c) && !recent.includes(c.id));
  if (!pool.length) return;
  showChoice(pool[Math.floor(Math.random() * pool.length)]);
}
function showChoice(c) {
  inChoice = true;
  S.seenChoices.push(c.id);
  if (S.seenChoices.length > 40) S.seenChoices.shift();
  $('cTitle').textContent = c.title;
  $('cText').textContent = c.text;
  $('cOpts').innerHTML = c.options.map((o, i) => `<button class="copt" data-i="${i}"><b>${escapeHTML(o.label)}</b>${o.desc ? `<small>${escapeHTML(o.desc)}</small>` : ''}</button>`).join('');
  $('cOpts').onclick = e => {
    const b = e.target.closest('.copt'); if (!b) return;
    const o = c.options[Number(b.dataset.i)];
    const msg = applyEffect(o.effect);
    $('choice').classList.remove('on');
    inChoice = false;
    toast(`${o.label}${msg ? ':' + msg : ''}`);
    tone(700, 0.08, 'triangle', 0.14);
    checkAch(); hud(); save();
  };
  $('choice').classList.add('on');
  tone(523, 0.12, 'triangle', 0.15); setTimeout(() => tone(659, 0.15, 'triangle', 0.15), 120);
}
/** 套用選項的效果,回傳一句結果說明 */
function applyEffect(e, depth = 0) {
  const out = [];
  if (e.gamble) {
    // 有神社的旅館運氣比較好
    const p = e.gamble.p + (S.facs.some(f => f.type === 'shrine') ? 0.15 : 0);
    const win = Math.random() < p;
    out.push(win ? '🍀 運氣不錯!' : '💦 運氣不好…');
    out.push(applyEffect(win ? e.gamble.win : e.gamble.lose, depth + 1));
  }
  if (e.money) { S.money = Math.max(0, S.money + e.money); out.push(`${e.money > 0 ? '+' : ''}¥${e.money}`); }
  if (e.rep) { S.rep = Math.max(0, S.rep + e.rep); out.push(`口碑 ${e.rep > 0 ? '+' : ''}${e.rep}`); }
  if (e.ideas) { S.ideas += e.ideas; out.push(`💡+${e.ideas}`); }
  if (e.staff && e.staff < 0 && S.crew.length > 1) {
    const c = S.crew[S.crew.length - 1];
    S.crew = S.crew.filter(x => x !== c); syncStaff();
    out.push(`${c.name}(${STAFF_ROLES[c.role].name})離職了`);
  }
  if (e.closed) { arrivals = []; out.push('今天休息'); }
  if (e.arrive) {
    if (e.arrive < 0 && e.arrive > -1) arrivals = arrivals.filter(() => Math.random() > -e.arrive);
    else if (e.arrive < 0) arrivals.splice(0, -e.arrive);
  }
  if (e.mod) S.mods.push({ ...e.mod });
  if (e.perm && !S.perm.includes(e.perm)) S.perm.push(e.perm);
  if (e.path && depth === 0) S.paths[e.path]++;
  return out.filter(Boolean).join(' ');
}
const innStyle = () => {
  const [k, v] = Object.entries(S.paths).sort((a, b) => b[1] - a[1])[0];
  return v ? PATHS[k] : '新手老闆';
};

// ============================================================
//  成就
// ============================================================
function achValue(a) {
  switch (a.kind) {
    case 'guests': return S.stats.guests;
    case 'best5': return S.stats.best5;
    case 'stars': return stars();
    case 'rank': return -rankNow();                       // 名次越小越好
    case 'earned': return S.stats.earned;
    case 'dayIncome': return today ? today.income : 0;
    case 'occ100': return today && today.occ >= 1 ? today.rooms : 0;
    case 'perfect': return today && today.reviews.length && today.reviews.every(r => r.st === 5) ? today.reviews.length : 0;
    case 'land': return S.owned.length;
    case 'types': return new Set(S.facs.map(f => f.type)).size;
    case 'combos': return S.combos.length;
    case 'staff': return S.crew.length;
    case 'heart': return S.paths.heart;
    case 'wishes': return S.stats.wishes;
  }
  return 0;
}
const achDone = a => a.kind === 'rank' ? achValue(a) >= -a.n : achValue(a) >= a.n;
function checkAch() {
  if (!S) return [];
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (S.ach.includes(a.id) || !achDone(a)) continue;
    S.ach.push(a.id); got.push(a);
    if (a.reward.money) S.money += a.reward.money;
    if (a.reward.ideas) S.ideas += a.reward.ideas;
  }
  got.forEach((a, i) => setTimeout(() => {
    const r = [a.reward.money && `¥${a.reward.money}`, a.reward.ideas && `💡${a.reward.ideas}`].filter(Boolean).join(' ');
    toast(`🏆 成就解鎖「${a.name}」${r ? '  獎勵 ' + r : ''}`);
    [784, 988, 1175, 1568].forEach((f, k) => setTimeout(() => tone(f, 0.12, 'square', 0.06), k * 80));
  }, 400 + i * 3200));
  if (got.length) hud();
  return got;
}

// ============================================================
//  配樂:自動依季節與日夜換曲,也可以自己選或關掉
// ============================================================
function autoTrack() {
  if (t > 0.74) return 'yozakura';
  return { 春: 'yu', 夏: 'matsuri', 秋: 'yu', 冬: 'yuki' }[seasonOf(S.day).name];
}
function pickMusic() {
  if (!running && !S) return;
  const want = audioPrefs.music === 'off' ? null : audioPrefs.music === 'auto' ? autoTrack() : audioPrefs.music;
  if (!want) { stopMusic(); return; }
  if (nowPlaying() !== want) playMusic(want);
}
function openMusic() {
  const cur = audioPrefs.music;
  const row = (id, name, sub) => `<button class="item ${cur === id ? 'sel' : ''}" data-music="${id}"><span class="ic">${id === 'off' ? '🔇' : id === 'auto' ? '🔁' : '🎵'}</span><span class="tx"><b>${name}</b><small>${sub}</small></span><span class="pr">${cur === id ? '播放中' : ''}</span></button>`;
  openSheet('🎵 音樂與音效', row('auto', '自動', '依季節換曲,晚上變成夜曲') +
    Object.entries(TRACKS).map(([id, tr]) => row(id, tr.name, `${tr.bpm} BPM`)).join('') +
    row('off', '關閉音樂', '') +
    `<h4 class="sec">🎨 畫風</h4>` + styleButtons() +
    `<h4 class="sec">🔔 音效</h4>` +
    `<button class="item" data-sfx="1"><span class="ic">${audioPrefs.sfx ? '🔔' : '🔕'}</span><span class="tx"><b>音效:${audioPrefs.sfx ? '開' : '關'}</b><small>點一下切換(投幣、入住、升級的聲音)</small></span></button>`);
}
$('sheetBody').addEventListener('click', e => {
  const st = e.target.closest('[data-style]');
  if (st) { setStyle(st.dataset.style).then(() => { if ($('sheet').classList.contains('on')) openMusic(); }); return; }
  const m = e.target.closest('[data-music]'), x = e.target.closest('[data-sfx]');
  if (m) { audioPrefs.music = m.dataset.music; saveAudioPrefs(); pickMusic(); openMusic(); }
  if (x) { audioPrefs.sfx = !audioPrefs.sfx; saveAudioPrefs(); openMusic(); updateMuteIcon(); }
});
const STYLES = { pixel: ['Pixelkit', '遊戲間自己畫的 Q 版(預設)'], limezu: ['LimeZu', '原本的 LimeZu 畫風'] };
function styleButtons() {
  return Object.entries(STYLES).map(([id, [name, sub]]) => `<button class="item ${style === id ? 'sel' : ''}" data-style="${id}"><span class="ic">${id === 'pixel' ? '🧸' : '🏠'}</span><span class="tx"><b>${name}</b><small>${sub}</small></span><span class="pr">${style === id ? '使用中' : ''}</span></button>`).join('');
}
/** 換畫風:只是換圖。LimeZu 的 atlas 第一次用才下載 */
async function setStyle(s2) {
  if (s2 === 'limezu') { try { await loadLimeZu(); } catch (e) { toast('LimeZu 的圖載不到,先用 Pixelkit'); s2 = 'pixel'; } }
  style = s2;
  try { localStorage.setItem(STYLE_KEY, s2); } catch (e) { /* 存不了也沒關係,這次照樣換 */ }
  if (S && running) rebuild();
  updateStyleBtn();
}
function updateStyleBtn() { const b = $('styleBtn'); if (b) b.textContent = `🎨 畫風:${STYLES[style][0]}`; }
function updateMuteIcon() { $('musicBtn').textContent = audioPrefs.music === 'off' && !audioPrefs.sfx ? '🔇' : '🎵'; }

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
  const im = IMG(name);
  if (im) c.drawImage(im, Math.round(x), Math.round(y));
}
/** 只畫一張圖的其中幾列(sy 起、sh 高):食堂桌子要把後排坐墊跟桌面分開畫,客人才夾得在中間 */
function sprRows(name, x, y, sy, sh) {
  const im = IMG(name);
  ctx.drawImage(im, 0, sy, im.width, sh, Math.round(x), Math.round(y) + sy, im.width, sh);
}
/** 擺設用:flip 就左右鏡像 */
function sprF(name, x, y, flip) {
  if (!flip) { spr(name, x, y); return; }
  ctx.save(); ctx.translate(Math.round(x) + imgW(name), Math.round(y)); ctx.scale(-1, 1); spr(name, 0, 0); ctx.restore();
}
function tile(c, name, x, y, w, h) {
  const im = IMG(name);
  for (let yy = y; yy < y + h; yy += 64) for (let xx = x; xx < x + w; xx += 64) {
    const cw = Math.min(64, x + w - xx), ch = Math.min(64, y + h - yy);
    c.drawImage(im, 0, 0, cw, ch, xx, yy, cw, ch);
  }
}

const FLOOR = { room: 'tatami', bigroom: 'tatami', bath: 'fl_bath', family: 'fl_bath', onsen: 'fl_stone', footbath: 'fl_stone', dining: 'fl_dining', shop: 'fl_wood', lounge: 'fl_wood', karaoke: 'fl_dining',
  egg: 'fl_stone', arcade: 'fl_dining', tea: 'tatami', massage: 'fl_wood', koi: 'fl_stone', shrine: 'fl_stone' };
const OUTDOOR = { onsen: 1, footbath: 1, egg: 1, koi: 1, shrine: 1 };

const floorOf = f => f.floor || FLOOR[f.type];
const wallOf = f => f.wall || 'wl_plain';
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
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isOwned(x, y)) tile(g, hallFloor('hall'), x * T, y * T, T, T);
  tile(g, hallFloor('lobby'), 11 * T, (OY + 19) * T, 10 * T, 4 * T);
  tile(g, 'fl_stone', ENTRANCE[0] * T, ENTRANCE[1] * T, T, T);
  // 還沒買的地:種一些樹、竹林,看起來像山邊(買下來就清掉)
  const SCEN = ['bush', 'bamboo', 'bush', 'maple', 'sakura', 'bamboo', 'bush'];
  for (let cy = 0; cy < ROWS / CHUNK; cy++) for (let cx = 0; cx < COLS / CHUNK; cx++) {
    if (S.owned.includes(`${cx},${cy}`)) continue;
    let s2 = cx * 31 + cy * 17 + 3;
    const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
    const items = [];
    for (let i = 0; i < 4; i++) items.push([SCEN[Math.floor(r2() * SCEN.length)], cx * CHUNK + 1 + Math.floor(r2() * (CHUNK - 3)), cy * CHUNK + 3 + Math.floor(r2() * (CHUNK - 3))]);
    items.sort((a, b) => a[2] - b[2]).forEach(([n, x, y]) => g.drawImage(SPR[n], x * T, (y + 1) * T - sprH(n)));   // 一律用 Pixelkit 的樹(LimeZu 的灌木是盆栽)
  }
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
    tile(g, floorOf(f), f.x * T, f.y * T, F(f).w * T, F(f).h * T);
    if (!OUTDOOR[f.type]) {
      // 牆紙:室內設施最上面那一條(家具、客人會畫在它上面,看起來像靠著牆)
      const wl = SPR[wallOf(f)], w = F(f).w * T;
      for (let x = 0; x < w; x += 32) g.drawImage(wl, 0, 0, Math.min(32, w - x), 24, f.x * T + x, f.y * T, Math.min(32, w - x), 24);
      wallBox(g, f);
    }
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
  if (style === 'koi') {
    // 錦鯉池:石頭邊 + 深綠色的水 + 游來游去的魚
    drawPool(p, ox, oy, 'onsen', now);
    ctx.save(); roundRect(x, y, w, h, Math.min(16, h / 2)); ctx.clip();
    ctx.fillStyle = 'rgba(20,90,80,.55)'; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 4; i++) {
      const a = now / (1400 + i * 300) + i * 1.7;
      const fx = x + w / 2 + Math.cos(a) * (w / 2 - 10), fy = y + h / 2 + Math.sin(a * 1.3) * (h / 2 - 6);
      ctx.fillStyle = ['#ff8a3d', '#ffffff', '#ff5050', '#ffd84a'][i];
      ctx.fillRect(Math.round(fx) - 4, Math.round(fy) - 2, 8, 4); ctx.fillRect(Math.round(fx) + (Math.sin(a) > 0 ? -7 : 4), Math.round(fy) - 1, 3, 2);
    }
    ctx.restore();
    return;
  }
  if (style === 'bath') {
    ctx.fillStyle = '#9c6b3f'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    ctx.fillStyle = '#c18d58'; ctx.fillRect(x - 5, y - 5, w + 10, 4);
  } else {
    ctx.save(); roundRect(x - 9, y - 9, w + 18, h + 18, Math.min(22, h / 2)); ctx.clip();
    for (let yy = y - 9; yy < y + h + 9; yy += 64) for (let xx = x - 9; xx < x + w + 9; xx += 64) ctx.drawImage(IMG('rock'), xx, yy);
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

/** layer:'back' 只畫在「桌子後面的客人」更後面的東西(食堂後排坐墊);'front' 畫其餘;不給就全畫 */
function drawFac(f, now, layer) {
  const L = f.lv, ox = f.x * T, oy = f.y * T;
  if (layer === 'back' && f.type !== 'dining') return;
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
      // 桌子圖的前 22 列是後排坐墊:坐在後排的客人要夾在坐墊跟桌面之間
      const n = L >= 3 ? 'dining_g' : 'dining';
      const part = x => layer === 'back' ? sprRows(n, x, oy, 0, 22) : layer === 'front' ? sprRows(n, x, oy, 22, sprH(n) - 22) : spr(n, x, oy);
      part(ox); if (L >= 2) part(ox + 2 * T);
      if (layer === 'back') return;
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
    case 'egg': {
      spr('eggpot', ox + 0.1 * T, oy + 0.1 * T); spr('eggbasket', ox + 1.0 * T, oy + 0.1 * T);
      if (L >= 2) spr('andon', ox + 1.3 * T, oy - 0.9 * T);
      break;
    }
    case 'arcade': {
      spr('cabinet', ox, oy - 0.2 * T); spr('cabinet', ox + T, oy - 0.2 * T);
      if (L >= 2) spr('cabinet', ox + 2 * T, oy - 0.2 * T);
      if (L >= 3) spr('fishbowl', ox + 2.1 * T, oy + 1.6 * T);
      break;
    }
    case 'tea': {
      spr('teatable', ox + 0.5 * T, oy + 0.9 * T); spr('teaset', ox + 0.9 * T, oy + 0.6 * T);
      spr('scroll2', ox + 0.1 * T, oy - 0.6 * T);
      if (L >= 2) spr('vase', ox + 2.1 * T, oy - 0.6 * T);
      if (L >= 3) spr('bonsai_s', ox + 2.1 * T, oy + 0.9 * T);
      break;
    }
    case 'massage': {
      spr('massagebed', ox + 0.5 * T, oy + 0.4 * T);
      if (L >= 2) spr('massagebed', ox + 0.5 * T, oy + 1.7 * T);
      spr('plant', ox + 0.05 * T, oy + 1.0 * T);
      if (L >= 3) spr('andon', ox + 2.2 * T, oy + 1.3 * T);
      break;
    }
    case 'koi': {
      drawPool(POOLS.koi(L), ox, oy, 'koi', now);
      if (L >= 2) spr('stone_lantern', ox + 3.1 * T, oy - 0.8 * T);
      if (L >= 3) spr('bamboo', ox - 0.1 * T, oy - 0.9 * T);
      break;
    }
    case 'shrine': {
      spr('torii', ox, oy - 0.6 * T); spr('saisen', ox + 0.5 * T, oy + 0.8 * T);
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
  ctx.font = `${Math.round(12 * k)}px "Cubic11","PingFang TC",sans-serif`;
  const w = ctx.measureText(text).width + 12 * k, hh = 18 * k;
  ctx.fillStyle = bg; roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + k);
}
function bubbleAt(x, y, text) {
  const k = kz();
  ctx.font = `${Math.round(12 * k)}px "Cubic11","PingFang TC",sans-serif`;
  const w = Math.max(24 * k, ctx.measureText(text).width + 12 * k), hh = 20 * k;
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  roundRect(x - w / 2, y - hh, w, hh, 8 * k); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 4 * k, y); ctx.lineTo(x + 4 * k, y); ctx.lineTo(x, y + 5 * k); ctx.fill();
  ctx.fillStyle = '#3a2c22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - hh / 2);
}

// 遊戲裡的方向編號(0 右、1 上、2 左、3 下)→ character.js sheet 的列(下、左、右、上)
const DIR_ROW = [2, 3, 1, 0];
/** 畫一個人,(x, y) 是腳底。sheet 一列 6 格:待機 0~1、走路 2~5 */
function drawChar(who, x, y, dir, frame, moving, soak) {
  if (isLZ()) { drawCharLZ(who.lz, x, y, dir, frame, moving, soak); return; }
  const sh = sheetOf(who.look);
  const col = moving ? 2 + (Math.floor(frame) % 4) : Math.floor(frame / 3) % 2;
  const sx = col * FW, sy = DIR_ROW[dir] * FH;
  const dx = Math.round(x - FW / 2), dy = Math.round(y - 30);
  if (soak) {
    // 泡在水裡:只露出頭跟肩膀,整個人往下沉
    const h = 20;
    ctx.drawImage(sh, sx, sy, FW, h, dx, dy + 9, FW, h);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(dx + 3, dy + 8 + h, FW - 6, 1);
    return;
  }
  ctx.drawImage(sh, sx, sy, FW, FH, dx, dy, FW, FH);     // 影子已經畫在 sheet 裡
}
/** LimeZu 的 premade 角色:每格 32×64,一列 6 格,方向 0 右 1 上 2 左 3 下;上半待機、下半走路 */
function drawCharLZ(n, x, y, dir, frame, moving, soak) {
  const r = LZ.R['char' + n];
  const f = dir * 6 + (Math.floor(frame) % 6);
  const sx = r[0] + f * 32, sy = r[1] + (moving ? 64 : 0);
  const dx = Math.round(x - 16), dy = Math.round(y - 60);
  if (soak) {
    ctx.drawImage(LZ.atlas, sx, sy, 32, 44, dx, dy + 8, 32, 44);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(dx + 6, dy + 50, 20, 2);
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(LZ.atlas, sx, sy, 32, 64, dx, dy, 32, 64);
}
/** 按摩床上躺著(頭朝左),身上蓋一條毛巾 */
function drawLying(who, x, y) {
  const cx = Math.round(x), cy = Math.round(y - 13);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2);
  if (isLZ()) {
    // LimeZu 角色的身體在 32×64 那格的第 20~63 列:轉過來大約 44 寬
    const r = LZ.R['char' + who.lz];
    ctx.drawImage(LZ.atlas, r[0] + 18 * 32, r[1] + 20, 32, 44, -16, -22, 32, 44);
    ctx.restore();
    ctx.fillStyle = '#2b1f2e'; ctx.fillRect(cx - 1, cy - 11, 22, 22);
    ctx.fillStyle = '#7fbfb0'; ctx.fillRect(cx, cy - 10, 20, 20);
    ctx.fillStyle = '#9fd6c8'; ctx.fillRect(cx, cy - 10, 20, 17);
    ctx.fillStyle = '#c8eee4'; ctx.fillRect(cx, cy - 10, 2, 17);
    return;
  }
  ctx.drawImage(sheetOf(who.look), 0, 0, FW, 28, -FW / 2, -14, FW, 28);      // 轉 -90°:頭(圖的上方)朝左
  ctx.restore();
  ctx.fillStyle = '#2b1f2e'; ctx.fillRect(cx + 1, cy - 9, 15, 18);
  ctx.fillStyle = '#7fbfb0'; ctx.fillRect(cx + 2, cy - 8, 13, 16);
  ctx.fillStyle = '#9fd6c8'; ctx.fillRect(cx + 2, cy - 8, 13, 13);
  ctx.fillStyle = '#c8eee4'; ctx.fillRect(cx + 2, cy - 8, 2, 13);
}
/** 和室裡睡著的客人:頭靠在枕頭上,被子蓋到下巴 */
const FUTON_COLOR = ['#5b7fd1', '#e2a93c', '#9a6ad0'], FUTON_HI = ['#8ea8e6', '#f0c776', '#bc9ae2'];
function drawSleepers(f) {
  const zs = guests.filter(g => g.room === f.id && g.state === 'sleep');
  if (!zs.length) return;
  const ox = f.x * T, oy = f.y * T, n = f.type === 'bigroom' ? 4 : 2;
  zs.slice(0, n).forEach((g, i) => {
    const px = ox + (i >> 1) * 2 * T + (i % 2 ? 46 : 18), py = oy + T + 15;      // 枕頭中心(futon_top 裡的位置)
    const who = guestWho(g.char);
    if (isLZ()) {
      // LimeZu:頭在那格的第 18~44 列
      const r = LZ.R['char' + who.lz];
      ctx.drawImage(LZ.atlas, r[0] + 18 * 32, r[1] + 18, 32, 24, px - 16, py - 20, 32, 24);
    } else ctx.drawImage(sheetOf(who.look), 0, 0, FW, 19, px - FW / 2, py - 15, FW, 19);
    ctx.fillStyle = FUTON_COLOR[f.lv - 1]; ctx.fillRect(px - 12, py + 1, 24, 17);   // 一路接到下面的被子   // 被子蓋到下巴(頭的圖 16 列以下是脖子)
    ctx.fillStyle = FUTON_HI[f.lv - 1]; ctx.fillRect(px - 12, py + 1, 24, 2);        // 被子反摺的亮邊
    ctx.fillStyle = '#2b1f2e'; ctx.fillRect(px - 12, py, 24, 1);
  });
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
    drawFac(f, now, 'back');
    for (const g of vis) if (g.at === f.id && g.under) drawChar(guestWho(g.char), g.x, g.y, g.dir, g.frame, false, false);
    drawFac(f, now, 'front');
    for (const g of vis) if (g.at === f.id && g.lie) drawLying(guestWho(g.char), g.x, g.y);
    if (isRoom(f)) drawSleepers(f);
  }
  const CH = charH();
  drawChar(OKAMI_WHO, DESK.staff[0] * T, DESK.staff[1] * T + CH.deskDy, 3, now / 250, false, false);
  for (const a of staff) if (a.state === 'desk') drawChar(staffWho(a.c), a.x, a.y + CH.deskDy, a.dir, now / 250 + 2, false, false);
  spr('counter', DESK.x * T, DESK.y * T);

  // 擺設、客人、員工一起按照 y 排序,才有前後遮擋
  const items = [];
  for (const d of S.decor) items.push({ y: (d.y + 1) * T, draw: () => sprF(d.type, d.x * T, (d.y + 1) * T - imgH(d.type), d.flip) });
  for (const g of vis) if (!g.under && !g.lie) items.push({ y: g.y, draw: () => drawChar(guestWho(g.char), g.x, g.y, g.dir, g.frame, g.moving, g.soak) });
  for (const a of staff) if (a.state !== 'desk') items.push({ y: a.y, draw: () => drawChar(staffWho(a.c), a.x, a.y, a.dir, a.frame, a.moving, false) });
  items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

  for (const f of S.facs) {
    if (!isRoom(f) || !guests.some(g => g.room === f.id && g.state === 'sleep')) continue;
    const k = (now / 600) % 1;
    ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.font = '12px "Cubic11",sans-serif'; ctx.textAlign = 'center';
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
  for (const a of [...vis, ...staff]) if (a.bubble) bubbleAt(a.x, a.y - (a.soak ? CH.soak : a.lie ? CH.lie : CH.bub), a.bubble.text);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of staff) if (!a.bubble) {
    ctx.font = `${Math.round(10 * kz())}px sans-serif`; ctx.fillStyle = '#fff';
    ctx.fillText(STAFF_ROLES[a.c.role].icon + (a.c.lv > 1 ? a.c.lv : ''), a.x, a.y - CH.icon);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx) {
    ctx.globalAlpha = 1 - f.t;
    ctx.font = `${Math.round(12 * kz())}px "Cubic11","PingFang TC",sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,25,10,.8)';
    ctx.strokeText(f.text, f.x, f.y - f.t * 24); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 24);
    ctx.globalAlpha = 1;
  }
}

function drawGhost(now) {
  const p = place, x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
  ctx.globalAlpha = 0.75;
  if (!isFacPlace(p)) sprF(p.type, x, y + T - imgH(p.type), p.flip);
  else { tile(ctx, p.obj ? floorOf(p.obj) : FLOOR[p.type], x, y, w, h); drawFac({ type: p.type, x: p.x, y: p.y, lv: p.obj ? p.obj.lv : 1 }, now); }
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
    if (!F(f).pool || f.type === 'koi') continue;
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
  $('nation').textContent = `全國 #${rankNow()}`;
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
  ({ build: startPlaceFac, decor: startPlaceDecor, research: doResearch, hire: doHire, train: doTrain, fire: doFire, ad: doAd, hall: k => openInterior({ hall: k }) })[act](id);
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
    const lock = !unlocked(id) ? '需要研究' : d.stars && stars() < d.stars ? `🔒 ${d.stars}★` : '';
    const pic = `<img class="pic" src="${sprURL(id)}" style="width:${sprW(id)}px;height:${sprH(id)}px">`;
    const use = d.use ? ` · ${d.use.icon}客人會用${d.use.fee ? `(¥${d.use.fee})` : ''}` : '';
    return itemHTML({ act: 'decor:' + id, icon: pic, name: d.name, sub: `風雅 +${d.val}${d.plant ? ' · 植物' : ''}${use}`, cost: '¥' + d.cost, lockText: lock, disabled: !!lock || S.money < d.cost });
  }).join('') + `<h4 class="sec">🎨 換地板</h4>` +
    itemHTML({ act: 'hall:hall', icon: `<img class="pic" src="${sprURL(hallFloor('hall'))}" style="width:32px;height:32px">`, name: '走廊地板', sub: '整片走廊換一種地板', cost: '¥' + HALL_COST, lockText: '', disabled: false }) +
    itemHTML({ act: 'hall:lobby', icon: `<img class="pic" src="${sprURL(hallFloor('lobby'))}" style="width:32px;height:32px">`, name: '大廳地板', sub: '櫃台那一區', cost: '¥' + HALL_COST, lockText: '', disabled: false }) +
    '<p class="note">室內設施的地板、牆紙:點設施 → 🎨 裝潢</p>');
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
const faceCache = {};
/** 員工名單的大頭照:正面待機那一格 */
function faceURL(c) {
  const k = (isLZ() ? 'L' : 'P') + c.id + c.role;
  if (!faceCache[k]) {
    const cv2 = document.createElement('canvas'); cv2.width = FW; cv2.height = FH;
    if (isLZ()) { const r = LZ.R['char' + (c.char || 14)]; cv2.width = 32; cv2.height = 44; cv2.getContext('2d').drawImage(LZ.atlas, r[0] + 18 * 32, r[1] + 6, 32, 44, 0, 0, 32, 44); }
    else cv2.getContext('2d').drawImage(sheetOf(staffLook(c)), 0, 0, FW, FH, 0, 0, FW, FH);
    faceCache[k] = cv2.toDataURL();
  }
  return faceCache[k];
}
function openStaff() {
  const max = staffMax(stars()), cost = STAFF_HIRE(S.crew.length), full = S.crew.length >= max;
  const dirty = S.facs.filter(f => f.dirty).length;
  const face = c => `<img class="face" src="${faceURL(c)}" alt="">`;
  const cards = S.crew.map(c => {
    const ro = STAFF_ROLES[c.role], need = xpNeed(c.lv), maxed = c.lv >= STAFF_MAX_LV, ready = !maxed && c.xp >= need;
    const tc = trainCost(c.lv);
    const btn = maxed ? '<button disabled>最高級</button>'
      : `<button data-act="train:${c.id}" ${ready && S.money >= tc ? '' : 'disabled'}>${ready ? `受訓 ¥${tc}` : '經驗不夠'}</button>`;
    return `<div class="crew">${face(c)}<span class="tx"><b>${escapeHTML(c.name)} · ${ro.icon}${ro.name} Lv${c.lv}</b>
      <small>${ro.pow(c.lv)} · 薪水 ¥${salaryOf(c.lv)}/天</small>
      <span class="xp"><i style="width:${maxed ? 100 : c.xp / need * 100}%"></i></span>
      <small>${maxed ? '已經是大師了!' : `經驗 ${Math.floor(c.xp)}/${need}(做事就會累積)`}</small></span>
      <span class="btns">${btn}${S.crew.length > 1 ? `<button class="ghost" data-act="fire:${c.id}">請他走</button>` : ''}</span></div>`;
  }).join('');
  openSheet('👥 員工', `<p class="note">每位員工有自己的職業。做事會累積經驗,經驗滿了花錢受訓就升一級(最高 Lv${STAFF_MAX_LV}),等級越高越厲害,薪水也高一點。<br>
    現在 <b>${S.crew.length}</b> 位(最多 ${max} 位,星星越多可以請越多)· 待打掃 ${dirty} 間</p>${cards}
    <h4 class="sec">再請一位(¥${cost.toLocaleString()})</h4>` +
    ROLE_ORDER.map(k => { const ro = STAFF_ROLES[k]; return itemHTML({ act: 'hire:' + k, icon: ro.icon, name: ro.name, sub: ro.desc, cost: '¥' + cost.toLocaleString(), lockText: full ? `🔒 已滿 ${max} 位` : '', disabled: full || S.money < cost }); }).join(''));
}
function openAds() {
  const st = stars();
  const now = Object.keys(S.ads).length ? '進行中:' + Object.entries(S.ads).map(([k, v]) => `${ADS.find(a => a.id === k).name}(剩 ${v} 天)`).join('、') : '目前沒有宣傳';
  openSheet(`📣 宣傳(效果 ${AD_DAYS} 天)`, `<p class="note">${now}</p>` +
    ADS.map(a => itemHTML({ act: 'ad:' + a.id, icon: '📣', name: a.name, sub: a.text, cost: '¥' + adCost(a).toLocaleString(), lockText: S.ads[a.id] ? '進行中' : st < a.need ? `🔒 ${a.need}★` : '', disabled: !!S.ads[a.id] || st < a.need || S.money < adCost(a) })).join(''));
}
let statsTab = 'goal';
function openStats(tab = statsTab) {
  statsTab = tab;
  const tabs = [['goal', '🎯 目標'], ['report', '📊 報表'], ['rank', '🏆 排行'], ['ach', `🎖 成就 ${S.ach.length}/${ACHIEVEMENTS.length}`], ['combo', `🎉 組合 ${S.combos.length}/${COMBOS.length}`]];
  const head = `<div class="tabs">${tabs.map(([id, n]) => `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'goal') {
    const row = (m, done) => `<div class="item ${done ? '' : 'dim'}"><span class="ic">${done ? m.icon : '🔒'}</span><span class="tx"><b>${m.name}</b><small>${m.desc}${done ? '' : `(${MS_PROGRESS[m.id]()})`}</small></span><span class="pr">${done ? '✅' : m.reward ? `¥${m.reward.money.toLocaleString()}` : '結局'}</span></div>`;
    body = `<h4>🎯 里程碑(最後一個是結局)</h4>${MILESTONES.map(m => row(m, S.milestones.includes(m.id))).join('')}` +
      (S.ended ? `<h4>👑 傳說目標${S.legend ? '' : '(選「繼續經營」才會開始)'}</h4>${LEGEND_GOALS.map(m => row(m, S.legendGoals.includes(m.id))).join('')}` : '') +
      `<h4>🏆 獎盃牆</h4>${S.trophies.length ? `<div class="trophies">${S.trophies.map(x => `<div><b>${x.icon}</b>${escapeHTML(x.name)}<br><small>第 ${x.inn} 間 · 第 ${x.day} 天</small></div>`).join('')}</div>` : '<p class="note">達成里程碑就會掛上來。開第二間旅館時,獎盃牆會跟著你。</p>'}` +
      (S.ng ? `<p class="note">這是你的第 ${S.ng + 1} 間旅館。以前累積:${S.career.days} 天、${S.career.guests.toLocaleString()} 位客人</p>` : '');
  } else if (tab === 'report') {
    const h = S.hist.slice(-14);
    const rooms = S.facs.filter(isRoom).length;
    const last = h[h.length - 1];
    const maxInc = Math.max(1, ...h.map(x => x.income));
    const bars = (key, max, fmt) => `<div class="bars">${h.map(x => `<div class="bar" title="第${x.d}天 ${fmt(x[key])}"><i style="height:${Math.max(3, (x[key] || 0) / max * 100)}%"></i><span>${x.d}</span></div>`).join('')}</div>`;
    const types = Object.entries(S.typeCount).sort((a, b) => b[1] - a[1]);
    const totalT = types.reduce((a, b) => a + b[1], 0) || 1;
    const uses = S.facs.filter(f => !isRoom(f)).sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 6);
    const wishes = Object.entries(S.wishLog).filter(([k]) => !S.facs.some(f => f.type === k)).sort((a, b) => b[1] - a[1]).slice(0, 4);
    body = `<div class="kpis">
      <div><b>${last ? Math.round(last.occ * 100) : 0}%</b><span>昨晚入住率</span></div>
      <div><b>${rooms}</b><span>房間數</span></div>
      <div><b>${last && last.avg ? last.avg.toFixed(1) + '★' : '—'}</b><span>昨天評價</span></div>
      <div><b>${innStyle()}</b><span>旅館風格</span></div></div>
      <h4>每天收入(最近 ${h.length} 天)</h4>${h.length ? bars('income', maxInc, v => '¥' + v) : '<p class="note">過完第一天就會有資料</p>'}
      <h4>入住率</h4>${h.length ? bars('occ', 1, v => Math.round(v * 100) + '%') : ''}
      <h4>客人類型</h4>${types.map(([k, v]) => `<div class="hbar"><span>${TYPES[k].name}</span><i style="width:${v / totalT * 100}%"></i><em>${v}</em></div>`).join('') || '<p class="note">還沒有客人</p>'}
      <h4>最受歡迎的設施</h4>${uses.map(f => `<div class="hbar"><span>${F(f).icon} ${F(f).name}</span><i style="width:${(f.uses || 0) / Math.max(1, uses[0].uses || 1) * 100}%"></i><em>${f.uses || 0}</em></div>`).join('') || '<p class="note">還沒有人用過</p>'}
      ${wishes.length ? `<h4>💬 客人希望有…</h4>${wishes.map(([k, v]) => `<div class="hbar"><span>${FAC[k].icon} ${FAC[k].name}</span><i class="wish" style="width:${Math.min(100, v * 10)}%"></i><em>${v} 次</em></div>`).join('')}` : ''}`;
  } else if (tab === 'rank') {
    const list = [...S.inns.map(i => ({ ...i, me: false })), { name: '★ 你的旅館', rep: S.rep, me: true }].sort((a, b) => b.rep - a.rep);
    const r = rankNow(), d = S.prevRank ? S.prevRank - r : 0;
    body = `<p class="note">全國溫泉旅館排行(口碑)。現在第 <b>${r}</b> 名${d > 0 ? ` ⬆${d}` : d < 0 ? ` ⬇${-d}` : ''},每年第 ${YEAR_DAYS} 天結算一次領獎金。對手也會成長、偶爾推出新東西搶客人。</p>` +
      list.map((x, i) => `<div class="rk ${x.me ? 'me' : ''}"><span class="no">${i + 1}</span><span class="nm">${escapeHTML(x.name)}</span><span class="st">${'★'.repeat(starsOf(x.rep))}</span><span class="rp">${x.rep.toLocaleString()}</span>${x.boost > 0 ? '<span class="hot">🔥</span>' : ''}</div>`).join('');
  } else if (tab === 'ach') {
    body = ACHIEVEMENTS.map(a => {
      const got = S.ach.includes(a.id);
      const r = [a.reward.money && `¥${a.reward.money}`, a.reward.ideas && `💡${a.reward.ideas}`].filter(Boolean).join(' ');
      return `<div class="item ${got ? '' : 'dim'}"><span class="ic">${got ? '🏆' : '🔒'}</span><span class="tx"><b>${a.name}</b><small>${a.desc}</small></span><span class="pr">${got ? '✅' : r}</span></div>`;
    }).join('');
  } else {
    body = COMBOS.map(c => {
      const got = S.combos.includes(c.id);
      return `<div class="item ${got ? '' : 'dim'}"><span class="ic">${got ? '🎉' : '❔'}</span><span class="tx"><b>${got ? c.name : '???'}</b><small>${got ? c.effect : '提示:' + c.hint}</small></span><span class="pr">${got && comboOn(c.id) ? '生效中' : ''}</span></div>`;
    }).join('') + `<p class="note">最佳全國排名:${S.bestRank ? '#' + S.bestRank : '還沒有'} · 招待 ${S.stats.guests} 位 · 5 星 ${S.stats.best5} 則 · 願望實現 ${S.stats.wishes} 次</p>`;
  }
  openSheet('📊 經營', head + body);
}
$('sheetBody').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) openStats(t.dataset.tab); });

function doResearch(id) {
  const r = RESEARCH.find(x => x.id === id);
  if (S.ideas < r.cost || S.research.includes(id)) return;
  S.ideas -= r.cost; S.research.push(id);
  fanfare(); toast(`💡 研究完成:${r.name}!`);
  hud(); openResearch(); save();
}
function doHire(role) {
  const cost = STAFF_HIRE(S.crew.length);
  if (!STAFF_ROLES[role] || S.money < cost || S.crew.length >= staffMax(stars())) return;
  const c = newCrew(role, S.crew);
  S.money -= cost; S.crew.push(c); syncStaff(); checkAch();
  tone(880, 0.1, 'triangle', 0.15); toast(`${STAFF_ROLES[role].icon} ${c.name}來當${STAFF_ROLES[role].name}了!`);
  hud(); openStaff(); save();
}
function doTrain(id) {
  const c = S.crew.find(x => x.id === id);
  if (!c || c.lv >= STAFF_MAX_LV || c.xp < xpNeed(c.lv) || S.money < trainCost(c.lv)) return;
  S.money -= trainCost(c.lv); c.lv++; c.xp = 0;
  fanfare(); toast(`🎓 ${c.name}升到 Lv${c.lv}!${STAFF_ROLES[c.role].pow(c.lv)}`);
  const a = staff.find(x => x.c === c); if (a) float(a.x, a.y - 44, 'Lv UP!', '#ffd84a');
  hud(); openStaff(); save();
}
function doFire(id) {
  const c = S.crew.find(x => x.id === id);
  if (!c || S.crew.length <= 1 || !confirm(`確定要請${c.name}離開嗎?`)) return;
  const a = staff.find(x => x.c === c); if (a) exitFac(a);
  S.crew = S.crew.filter(x => x !== c); syncStaff();
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
const isFacPlace = p => p.kind === 'fac' || (p.kind === 'move' && p.isFac);
function updatePlace() {
  place.reason = canPlace(place.w, place.h, place.x, place.y);
  if (!place.reason && S.money < place.cost) place.reason = '錢不夠';
  const tip = '用手指拖著它移動';
  $('pbText').textContent = place.reason ? `${place.name}:${place.reason}`
    : place.kind === 'move' ? `${place.name}:搬到這裡(免費)· ${tip}` : `${place.name} ¥${place.cost.toLocaleString()} · ${tip}`;
  $('pbOk').disabled = !!place.reason;
  $('pbOk').textContent = place.kind === 'move' ? '✔ 放這裡' : '✔ 蓋在這裡';
  $('pbFlip').style.display = isFacPlace(place) ? 'none' : '';
  $('placeBar').classList.add('on');
}
// 搬移:先把東西從地圖拿起來(這樣格子算得出能不能放),確定才放回去
function takeOut(p) { if (p.isFac) S.facs = S.facs.filter(x => x !== p.obj); else S.decor = S.decor.filter(x => x !== p.obj); }
function putBack(p) { (p.isFac ? S.facs : S.decor).push(p.obj); }
function startMove(sel) {
  const isFac = !!sel.fac, obj = sel.fac || sel.decor;
  if (isFac && (guests.some(g => g.room === obj.id || g.at === obj.id || g.target === obj.id) || staff.some(a => a.target === obj.id))) { toast('有人在用,等他們離開再搬'); return false; }
  closePanel(); closeSheet();
  if (isFac) releaseStaff(obj.id);
  const d = isFac ? F(obj) : DECOR[obj.type];
  place = { kind: 'move', isFac, obj, type: obj.type, w: isFac ? d.w : decorW(obj.type), h: isFac ? d.h : 1, x: obj.x, y: obj.y, cost: 0, name: d.name, flip: !!obj.flip };
  takeOut(place); rebuild();
  mode = 'place'; updatePlace();
  return true;
}
function confirmPlace() {
  if (mode === 'land') { buyLand(); return; }
  if (!place || place.reason) return;
  if (place.kind === 'move') {
    const p = place; place = null;
    p.obj.x = p.x; p.obj.y = p.y;
    if (p.isFac) p.obj.occ = []; else p.obj.flip = p.flip;
    putBack(p); rebuild();
    tone(660, 0.08, 'triangle', 0.14); float((p.x + p.w / 2) * T, p.y * T, '搬好了!', '#9dffbf');
    hud(); save(); endMode();
    return;
  }
  S.money -= place.cost;
  const id = (place.kind === 'fac' ? 'f' : 'd') + (S.nextId++);
  if (place.kind === 'fac') S.facs.push({ id, type: place.type, x: place.x, y: place.y, lv: 1 });
  else S.decor.push({ id, type: place.type, x: place.x, y: place.y, flip: !!place.flip });
  rebuild();
  noise(0.3, 0.06, 600); [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.16), i * 90));
  float((place.x + place.w / 2) * T, place.y * T, '完成!', '#ffd84a');
  checkAch(); hud(); save();
  if (place.kind === 'decor' && S.money >= place.cost) updatePlace();      // 擺設可以連續擺
  else endMode();
}
function endMode() {
  if (place && place.kind === 'move') { putBack(place); place = null; rebuild(); }   // 取消搬移 → 放回原位
  mode = 'normal'; place = null; landPick = null; $('placeBar').classList.remove('on');
}
$('pbFlip').addEventListener('click', () => { if (!place) return; place.flip = !place.flip; tone(520, 0.04, 'square', 0.05); });
$('pbOk').addEventListener('click', confirmPlace);
$('pbCancel').addEventListener('click', endMode);

// ---------- 買地 ----------
function openLand() {
  closeSheet(); closePanel();
  mode = 'land'; landPick = null;
  const n = S.owned.length;
  $('pbText').textContent = buyableChunks().length ? `點一塊相鄰的地(下一塊 ¥${landCost(n).toLocaleString()},需要 ${landNeed(n)}★)` : '已經買下所有土地了!';
  $('pbOk').disabled = true; $('pbOk').textContent = '🗺 買下'; $('pbFlip').style.display = 'none';
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
  rebuild(); fanfare(); toast('🗺 土地擴大了!可以蓋更多設施'); checkAch();
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
    $('pStat').textContent = d.use ? `客人經過會停下來用:${d.use.icon}${d.use.fee ? ` 收 ¥${d.use.fee}` : ''} · 滿意 +${d.use.sat}` : '';
    $('pBtn').style.display = 'none'; $('pFlip').style.display = ''; $('pDeco').style.display = 'none';
    $('pSell').textContent = `收起(退 ¥${Math.floor(d.cost / 2)})`;
  } else {
    const f = sel.fac, d = F(f), L = f.lv, st = stars();
    const stat = [];
    if (isRoom(f)) stat.push(`房價 ¥${d.price[L - 1]}/人`, `住 ${d.group} 人`, `舒適 +${d.comfort[L - 1]}`);
    if (d.sat) stat.push(`滿意 +${d.sat[L - 1]}`);
    if (d.cap) stat.push(`${d.cap[L - 1]} 人`);
    if (d.fee) stat.push(`消費 ¥${d.fee[L - 1]}`);
    if (f.aura) stat.push(`擺設 +${f.aura}`);
    if (f.deco) stat.push(`🎨裝潢 +${f.deco}`);
    if (f.comboNames && f.comboNames.length) stat.push('🎉' + f.comboNames.join('、'));
    if (isRoom(f)) stat.push(f.dirty ? '🧹 待打掃' : guests.some(g => g.room === f.id) ? '有客人' : '空房');
    if (!f.door) stat.push('⚠️ 沒有路進去');
    $('pIcon').textContent = d.icon;
    $('pName').textContent = `${d.name} · ${'●'.repeat(L)}${'○'.repeat(3 - L)}`;
    $('pDesc').textContent = d.desc;
    $('pStat').textContent = stat.join(' · ');
    const btn = $('pBtn'); btn.style.display = ''; $('pFlip').style.display = 'none'; $('pDeco').style.display = '';
    if (L >= 3) { btn.textContent = '已經是最高級'; btn.disabled = true; }
    else if (st < d.need[L]) { btn.textContent = `🔒 升級需要 ${d.need[L]}★`; btn.disabled = true; }
    else { btn.textContent = `升級 ¥${d.cost[L].toLocaleString()}`; btn.disabled = S.money < d.cost[L]; }
    const refund = Math.floor(d.cost.slice(0, L).reduce((a, b) => a + b, 0) / 2);
    $('pSell').textContent = `拆除(退 ¥${refund.toLocaleString()})`;
  }
  $('panel').classList.add('on');
}
function closePanel() { selected = null; $('panel').classList.remove('on'); }
$('pMove').addEventListener('click', () => { if (selected) startMove(selected); });
$('pFlip').addEventListener('click', () => { const d = selected && selected.decor; if (!d) return; d.flip = !d.flip; tone(520, 0.04, 'square', 0.05); save(); });
$('pClose').addEventListener('click', closePanel);
$('pDeco').addEventListener('click', () => { const f = selected && selected.fac; if (f) openInterior({ fac: f }); });

// ---------- 裝潢:換地板、牆紙 ----------
let interiorFor = null;
/** target = { fac } 或 { hall: 'hall' | 'lobby' } */
function openInterior(target) {
  interiorFor = target;
  const f = target.fac, st = stars();
  const cur = f ? floorOf(f) : hallFloor(target.hall);
  const sw = (id, info, kind, on) => {
    const lock = info.stars && st < info.stars ? `🔒${info.stars}★` : '';
    return `<button class="swatch ${on ? 'on' : ''}" data-deco="${kind}:${id}" ${lock || on ? 'disabled' : ''}>
      <img src="${sprURL(id)}" alt=""><b>${info.name}</b><small>${on ? '使用中' : lock || '¥' + (f ? info.cost : HALL_COST)}</small></button>`;
  };
  let html = `<h4 class="sec">地板</h4><div class="swatches">${Object.entries(FLOORS).map(([id, info]) => sw(id, info, 'floor', id === cur)).join('')}</div>`;
  if (f && !OUTDOOR[f.type]) html += `<h4 class="sec">牆紙</h4><div class="swatches">${Object.entries(WALLS).map(([id, info]) => sw(id, info, 'wall', id === wallOf(f))).join('')}</div>`;
  html += f ? `<p class="note">換過地板 +${DECO_BONUS}、換過牆紙 +${DECO_BONUS},這間的客人更滿意(${F(f).name}現在 🎨+${f.deco || 0})</p>` : '<p class="note">走廊、大廳換地板只是好看,沒有加成</p>';
  openSheet(f ? `🎨 裝潢:${F(f).name}` : target.hall === 'lobby' ? '🎨 大廳地板' : '🎨 走廊地板', html);
}
$('sheetBody').addEventListener('click', e => {
  const b = e.target.closest('[data-deco]'); if (!b || !interiorFor) return;
  const [kind, id] = b.dataset.deco.split(':'), info = (kind === 'wall' ? WALLS : FLOORS)[id];
  const f = interiorFor.fac, cost = f ? info.cost : HALL_COST;
  if (S.money < cost) { toast('錢不夠喔'); return; }
  if (info.stars && stars() < info.stars) return;
  S.money -= cost;
  if (f) f[kind] = id; else { S.hall = S.hall || {}; S.hall[interiorFor.hall] = id; }
  rebuild(); hud(); save();
  tone(660, 0.08, 'triangle', 0.14); setTimeout(() => tone(990, 0.1, 'triangle', 0.12), 90);
  openInterior(interiorFor);
});
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
    releaseStaff(f.id);
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
  $('sOcc').textContent = today.rooms ? `${Math.round((today.occ || 0) * 100)}%` : '—';
  const dr = S.prevRank ? S.prevRank - rankNow() : 0;
  $('sAch').innerHTML = (today.newAch || []).map(a => `<div class="achline">🏆 成就解鎖:<b>${a.name}</b></div>`).join('') +
    (dr ? `<div class="achline">${dr > 0 ? '⬆' : '⬇'} 全國排名${dr > 0 ? '上升' : '下降'} ${Math.abs(dr)} 名</div>` : '') +
    (today.newMs || []).map(m => `<div class="msline">${m.icon} 里程碑達成:<b>${m.name}</b><br><small>獎勵 ¥${m.reward.money.toLocaleString()} + 💡${m.reward.ideas} · 已經掛上獎盃牆</small></div>`).join('');
  const ng = nextGoal();
  $('sGoal').innerHTML = S.endingPending ? '<div class="goal">🗾 你的旅館成為了全國第一!按下一步……</div>'
    : ng ? `<div class="goal">🎯 下一個目標:<b>${ng.icon} ${ng.name}</b><br><small>${ng.desc}(${MS_PROGRESS[ng.id]()})</small></div>` : '';
  if ((today.newMs || []).length) setTimeout(() => [523, 659, 784, 1047, 1319].forEach((f, k) => setTimeout(() => tone(f, 0.18, 'triangle', 0.14), k * 110)), 700);
  $('sYear').innerHTML = today.year ? `<div class="year">🏆 年度全國溫泉旅館排行:<b>第 ${today.year.rank} 名</b>${today.year.reward ? `<br>獎金 ¥${today.year.reward.toLocaleString()} + 💡10` : ''}</div>` : '';
  $('sReviews').innerHTML = r.length ? shuffle(r).slice(0, 3).map(x => `
    <div class="review"><span class="rs">${'★'.repeat(x.st)}</span><span class="rt">「${escapeHTML(x.text)}」</span>
    <span class="rw">— ${TYPES[x.type].name}${x.vip ? '(雜誌記者)' : ''}</span></div>`).join('')
    : '<div class="review"><span class="rt">今天還沒有人退房。客人住一晚,明天早上才會留評價。</span></div>';
  const st = stars(), next = STAR_REP[st];
  $('sRep').textContent = (next ? `口碑 ${S.rep} / ${next}(下一顆星)` : `口碑 ${S.rep} · 五星!`) + ` · 全國 #${rankNow()}`;
  $('summary').classList.add('on');
  fanfare();
}
$('sNext').addEventListener('click', () => {
  $('summary').classList.remove('on');
  delete S.dayDone;
  if (S.endingPending) { showEnding(); return; }
  inSummary = false; S.day++; startDay(); save();
});

// ============================================================
//  結局:日本第一溫泉旅館 → 謝幕 → 繼續(傳說模式)或開第二間旅館
// ============================================================
function showEnding() {
  inSummary = true;                       // 結局畫面期間時間停止
  if (!S.ended) {
    S.ended = true; S.awaitChoice = true; delete S.endingPending;
    S.milestones.push('ending'); addTrophy(MILESTONES.find(m => m.final));
    save();
  }
  const total5 = S.stats.best5, br = S.bestReview;
  $('eSub').textContent = `${S.ng ? `第 ${S.ng + 1} 間旅館 · ` : ''}開業第 ${S.day} 天,全國溫泉旅館排行第 1 名`;
  $('eNums').innerHTML = [
    [S.day + ' 天', '經營天數'], [S.stats.guests.toLocaleString(), '招待客人'], [total5.toLocaleString(), '五星評價'],
    ['¥' + S.stats.earned.toLocaleString(), '總收入'], [`${S.combos.length}/${COMBOS.length}`, '發現組合'], [`${S.ach.length}/${ACHIEVEMENTS.length}`, '成就'],
  ].map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join('');
  $('eReview').innerHTML = br ? `<div class="review"><span class="rs">★★★★★</span><span class="rt">「${escapeHTML(br.text)}」</span><span class="rw">— ${TYPES[br.type].name}${br.vip ? '(雜誌記者)' : ''}・第 ${br.day} 天</span></div>` : '';
  $('eCrew').textContent = S.crew.map(c => `${STAFF_ROLES[c.role].icon}${c.name} Lv${c.lv}`).join('、');
  // 謝幕名單(慢慢往上捲)
  const who = escapeHTML(currentName());
  const lines = [
    ['老闆', who], ['老闆娘', '櫃台的阿姨(一直站在那裡)'],
    ...S.crew.map(c => [STAFF_ROLES[c.role].name, `${escapeHTML(c.name)}(Lv${c.lv})`]),
    ['客人', `${S.stats.guests.toLocaleString()} 位客人,謝謝你們`],
    ['對手', S.inns.slice().sort((a, b) => b.rep - a.rep).slice(0, 3).map(i => escapeHTML(i.name)).join('、')],
    ['美術', 'Pixelkit(全部用程式畫)'], ['音樂', 'WebAudio 即時合成的 8-bit 和風曲'], ['製作', '遊戲間'],
  ];
  $('eRoll').innerHTML = `<div class="rollin">${lines.map(([k, v]) => `<p><small>${k}</small>${v}</p>`).join('')}<p class="fin">♨️ 完 ♨️</p></div>`;
  $('eChoose').style.display = ''; $('eCarry').style.display = 'none';
  $('ending').classList.add('on');
  [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 0.28, 'triangle', 0.15), 300 + k * 220));
}
const currentName = () => currentProfile().name || '你';
/** 傳說模式:對手變強,多一間「傳說之湯」緊追在後 */
$('eLegend').addEventListener('click', () => {
  S.legend = true; delete S.awaitChoice;
  const h = S.hist.filter(x => x.rep != null), k = Math.min(7, h.length - 1);
  const daily = k > 0 ? (h[h.length - 1].rep - h[h.length - 1 - k].rep) / k : S.rep / Math.max(1, S.day);
  if (!S.inns.some(i => i.name === LEGEND_RIVAL)) S.inns.push({ name: LEGEND_RIVAL, rep: S.rep - 200, grow: Math.round(Math.min(2000, Math.max(300, daily * 1.1))), boost: 0 });
  $('ending').classList.remove('on');
  toast(`👑 傳說模式!對手變強了,「${LEGEND_RIVAL}」緊追在後。新目標在「📊 經營 → 🎯 目標」`);
  inSummary = false; S.day++; startDay(); save();
});
$('eNew').addEventListener('click', () => {
  // 選一位員工帶過去
  $('eChoose').style.display = 'none'; $('eCarry').style.display = '';
  $('eCarryList').innerHTML = S.crew.map(c => `<button class="copt" data-id="${c.id}"><b>${STAFF_ROLES[c.role].icon} ${escapeHTML(c.name)} · ${STAFF_ROLES[c.role].name} Lv${c.lv}</b><small>帶過去會保留到最多 Lv${NG_CARRY_MAX_LV}</small></button>`).join('');
});
$('eCarryList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) newInn(b.dataset.id); });
$('eBack').addEventListener('click', () => { $('eChoose').style.display = ''; $('eCarry').style.display = 'none'; });
/** 開第二間旅館(NG+):帶走起始資金、一位員工、研究、成就、獎盃牆 */
function newInn(carryId) {
  const old = S, n = (old.ng || 0) + 1, s = freshSave();
  s.ng = n; s.money = NG_MONEY(n);
  s.research = [...old.research]; s.ach = [...old.ach]; s.trophies = [...old.trophies];
  s.career = { days: (old.career?.days || 0) + old.day, guests: (old.career?.guests || 0) + old.stats.guests, earned: (old.career?.earned || 0) + old.stats.earned };
  const c = old.crew.find(x => x.id === carryId);
  if (c) { const keep = { ...c, lv: Math.min(c.lv, NG_CARRY_MAX_LV), xp: 0 }; s.crew = [keep, newCrew('clean', [keep])]; }
  s.inns = INNS.map(i => ({ name: i.name, rep: Math.round(i.rep * NG_RIVAL(n)), grow: Math.round(i.grow * NG_RIVAL(n)), boost: 0 }));
  $('ending').classList.remove('on');
  boot(s);
  save();
  toast(`🏯 第 ${n + 1} 間旅館開幕!起始資金 ¥${s.money.toLocaleString()}${c ? `,${c.name}也跟過來了` : ''}。對手這次更強喔`);
}

// ---------- 速度、縮放、工具列 ----------
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  const v = Number(b.dataset.speed);
  paused = v === 0; if (v) speed = v;
  document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
}));
$('zIn').addEventListener('click', () => zoomAt(1.25, vw / 2, vh / 2));
$('zOut').addEventListener('click', () => zoomAt(0.8, vw / 2, vh / 2));
const TOOLS = { tBuild: openBuild, tDecor: openDecor, tLand: openLand, tResearch: openResearch, tStaff: openStaff, tAds: openAds, tStats: openStats };
$('musicBtn').addEventListener('click', () => { tone(600, 0.04, 'square', 0.05); openMusic(); });
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
    clearTimeout(holdTimer);
  } else {
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    const [wx, wy] = worldAt(e);
    if (mode === 'place' && place && onGhost(wx, wy)) grabGhost(wx, wy);
    else if (mode === 'normal' && !inSummary) {
      // 長按 0.45 秒:直接拿起來搬
      const o = occ[Math.floor(wy / T)] && occ[Math.floor(wy / T)][Math.floor(wx / T)];
      clearTimeout(holdTimer);
      if (o && (o.fac || o.decor)) holdTimer = setTimeout(() => {
        if (!drag || drag.moved || ptrs.size !== 1) return;
        if (startMove(o.fac ? { fac: o.fac } : { decor: o.decor })) { grabGhost(wx, wy); drag.moved = true; tone(440, 0.06, 'triangle', 0.12); navigator.vibrate && navigator.vibrate(20); }
      }, 450);
    }
  }
});
let holdTimer = 0;
const onGhost = (wx, wy) => wx >= (place.x - 0.5) * T && wx <= (place.x + place.w + 0.5) * T && wy >= (place.y - 0.5) * T && wy <= (place.y + place.h + 0.5) * T;
function grabGhost(wx, wy) { drag.ghost = true; drag.gx = wx / T - place.x; drag.gy = wy / T - place.y; }
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
  if (Math.hypot(dx, dy) > 8) { drag.moved = true; clearTimeout(holdTimer); }
  if (drag.ghost) {
    if (!place) { drag.ghost = false; return; }
    const [wx, wy] = worldAt(e);
    const nx = Math.round(wx / T - drag.gx), ny = Math.round(wy / T - drag.gy);
    if (nx !== place.x || ny !== place.y) { place.x = nx; place.y = ny; updatePlace(); tone(500, 0.02, 'square', 0.03); }
    return;
  }
  if (drag.moved) { cam.x = drag.cx - dx / cam.s; cam.y = drag.cy - dy / cam.s; clampCam(); }
});
const endPtr = e => {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  clearTimeout(holdTimer);
  if (!drag) return;
  const tap = !drag.moved && !drag.ghost; drag = null;
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
  const g = all.find(g => Math.abs(wx - g.x) < (isLZ() ? 13 : 12) && wy < g.y + 2 && wy > g.y - charH().hit);
  if (g) { if (g.type) showGuest(g); else bubble(g, `${g.c.name} ${STAFF_ROLES[g.c.role].icon}Lv${g.c.lv}`, 2); tone(700, 0.05, 'sine', 0.1); return; }
  const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
  const o = occ[ty] && occ[ty][tx];
  if (o && o.fac) { openPanel({ fac: o.fac }); tone(600, 0.05, 'sine', 0.1); return; }
  if (o && o.decor) { openPanel({ decor: o.decor }); tone(600, 0.05, 'sine', 0.1); return; }
  closePanel(); closeSheet();
}

// ============================================================
//  主迴圈
// ============================================================
let last = 0, panelAt = 0, musicAt = 0;
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
    if (!paused && !inSummary && !inChoice) step(real * speed); else stepParticles(0);
    $('clock').textContent = clockText();
    if (now - musicAt > 2000) { musicAt = now; pickMusic(); }
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
  if (style === 'limezu') { try { await loadLimeZu(); } catch (e) { style = 'pixel'; } }
  boot(fresh ? freshSave() : ((await loadBest(SAVE_KEY)) || freshSave()));
}
/** v2.4 地圖往上加高 OY 格:舊存檔的東西整個往下搬,土地編號 cy + 4 */
function migrateMap(sv) {
  if (sv.mapV >= 2) return;
  for (const f of sv.facs) f.y += OY;
  for (const d of sv.decor) d.y += OY;
  sv.owned = sv.owned.map(k => { const [cx, cy] = k.split(',').map(Number); return `${cx},${cy + OY / CHUNK}`; });
  sv.mapV = 2;
}
/** 走廊、大廳的地板(可以在擺設選單換) */
const hallFloor = k => (S.hall && S.hall[k]) || (k === 'lobby' ? 'fl_wood' : 'fl_wood2');
/** 把一份存檔放進遊戲、從頭初始化畫面(開始、讀存檔碼、開第二間旅館都走這裡) */
function boot(save0) {
  S = save0;
  S.ads = S.ads || {}; S.research = S.research || []; S.combos = S.combos || [];
  for (const [k, v] of Object.entries(extraFields())) if (S[k] == null) S[k] = v;
  S.stats.wishes = S.stats.wishes || 0;
  if (!S.crew) { S.crew = []; for (let i = 0; i < (S.staff || 1); i++) S.crew.push(newCrew('clean', S.crew)); delete S.staff; }
  for (const d of S.decor) d.flip = !!d.flip;
  migrateMap(S);
  if (S.dayDone) { delete S.dayDone; if (!S.endingPending) S.day++; }      // 上次停在結算畫面
  guests = []; staff = []; fx = []; parts = []; deskQueue = [];
  inSummary = false; inChoice = false; $('summary').classList.remove('on'); $('choice').classList.remove('on'); $('ending').classList.remove('on');
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
  if (S.endingPending || S.awaitChoice) showEnding();      // 結局看到一半關掉的話,再演一次
  if (innerHeight > innerWidth) setTimeout(() => toast('📱 手機橫放看得比較多;兩指可以縮放,一指拖曳移動'), 3200);
}
$('startBtn').addEventListener('click', () => start(false));
$('newBtn').addEventListener('click', async () => {
  if ((await loadBest(SAVE_KEY)) && !confirm('確定要重新開一間旅館嗎?現在的進度會不見。(想留著的話先按「📦 備份存檔碼」)')) return;
  start(true);
});
$('backBtn').addEventListener('click', () => { save(); running = false; closePanel(); closeSheet(); endMode(); refreshStart(); show('startScreen'); });
async function refreshStart() {
  const s = await loadBest(SAVE_KEY);
  $('backupBtn').style.display = s ? '' : 'none';
  $('trophyNote').textContent = s && s.trophies && s.trophies.length ? `🏆 獎盃牆:${s.trophies.map(x => x.icon).join('')}` : '';
  // 存檔是跟著大廳選的玩家走的:換了人,旅館就是另一間
  const others = getProfiles().filter(p => p.id !== currentProfile().id).map(p => [p, readJSON(`onsen:${p.id}:save2`, null)]).filter(([, v]) => v);
  $('otherSaves').innerHTML = !s && others.length ? `其他玩家有旅館:${others.map(([p, v]) => `${p.avatar}${escapeHTML(p.name)}(第 ${v.day} 天)`).join('、')}<br>是你的話,回大廳換成那個人就看得到。` : '';
  if (s) {
    $('startBtn').textContent = `繼續經營(${s.ng ? `第 ${s.ng + 1} 間 · ` : ''}第 ${s.day} 天 · ${'★'.repeat(starsOf(s.rep))}${s.legend ? ' · 👑傳說' : ''})`;
    $('newBtn').style.display = '';
  } else {
    $('startBtn').textContent = '開一間溫泉旅館!';
    $('newBtn').style.display = 'none';
    // v1 的舊存檔格式不相容
    if (readJSON(saveKey('onsen', 'save'), null)) $('oldNote').style.display = '';
  }
}
refreshStart();
updateStyleBtn();
$('styleBtn').addEventListener('click', () => setStyle(style === 'pixel' ? 'limezu' : 'pixel'));

// ---------- 存檔碼:備份 / 換裝置 ----------
let codeMode = 'backup';
async function openCode(mode) {
  codeMode = mode;
  $('codeMsg').textContent = '';
  if (mode === 'backup') {
    const sv = await loadBest(SAVE_KEY);
    if (!sv) return;
    $('codeTitle').textContent = '📦 備份存檔碼';
    $('codeHow').innerHTML = '把下面這一整串複製起來(傳給自己、存在備忘錄)。<br>換手機、或 iPhone 主畫面 App 跟 Safari 之間,用「📥 輸入存檔碼」貼上就能接著玩。';
    $('codeText').value = await encodeSave(sv); $('codeText').readOnly = true;
    $('codeGo').textContent = '複製';
  } else {
    $('codeTitle').textContent = '📥 輸入存檔碼';
    $('codeHow').innerHTML = `把存檔碼整串貼在下面。<b>會蓋掉「${escapeHTML(currentProfile().name)}」現在的旅館。</b>`;
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
    if (cur && !confirm(`要用存檔碼裡的旅館(第 ${sv.day} 天)蓋掉現在的旅館(第 ${cur.day} 天)嗎?`)) return;
    sv.savedAt = Date.now();
    const r = saveBoth(SAVE_KEY, sv);       // 直接寫兩份(不經過 save(),那個會帶上目前畫面上的客人)
    if (!r.ls && !(await r.idb)) throw new Error('這台裝置存不下,空間滿了');
    $('codeMsg').textContent = `✅ 讀到了!第 ${sv.day} 天的旅館`;
    await refreshStart();
    setTimeout(() => $('codeBox').classList.remove('on'), 900);
  } catch (e) { $('codeMsg').textContent = '❌ ' + e.message; }
});

// 開發用:窗格在背景時 requestAnimationFrame 不跑,用 advance(秒) 快轉
if (import.meta.env.DEV) window.ON = {
  get S() { return S; }, focus: () => { focusOwned(); }, spotsOf, cam: (x, y, s) => { Object.assign(cam, { x, y, s }); }, guests: () => guests, staff: () => staff, t: () => t, rebuild, canPlace, tapWorld, openPanel, facById,
  advance(sec, st = 0.05) { for (let s = 0; s < sec && !inSummary && !inChoice; s += st) step(st * speed); $('clock').textContent = clockText(); draw(performance.now()); },
  place(kind, type, x, y) { if (kind === 'fac') startPlaceFac(type); else startPlaceDecor(type); place.x = x; place.y = y; updatePlace(); const r = place.reason; if (!r) confirmPlace(); else endMode(); return r; },
  buy(cx, cy) { mode = 'land'; landPick = { cx, cy, k: `${cx},${cy}` }; buyLand(); },
  train: doTrain, move: sel => startMove(sel), confirm: confirmPlace, place_: () => place,
  toScreen(tx, ty) { const r = cv.getBoundingClientRect(); return [r.left + (tx * T - cam.x) * cam.s, r.top + (ty * T - cam.y) * cam.s]; },
  money(n) { S.money += n; hud(); }, rep(n) { S.rep += n; hud(); }, ideas(n) { S.ideas += n; hud(); }, research: doResearch, hire: doHire, ad: doAd,
  upgrade(id) { openPanel({ fac: facById(id) }); $('pBtn').click(); closePanel(); }, showEnding, newInn, checkMilestones, setStyle, style: () => style, encodeSave, decodeSave, refreshStart, save,
  inSummary: () => inSummary, inChoice: () => inChoice, next: () => $('sNext').click(), showChoice: id => showChoice(CHOICES.find(c => c.id === id)), checkAch,
  pick: i => document.querySelectorAll('.copt')[i].click(),
};
requestAnimationFrame(loop);
