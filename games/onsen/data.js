/* ============================================================
   溫泉旅館的資料:地圖、設施、客人類型、季節、事件
   數值都集中在這裡,要調平衡只改這個檔。
   ============================================================ */

export const T = 32;                 // 一格 32px(LimeZu 32×32 素材)
export const COLS = 22, ROWS = 14;   // 世界大小(格)
export const DAY_SECONDS = 100;      // 1 倍速下,一天是幾秒

// ---------- 地圖 ----------
// 室內 x1~13、y1~12;x14 以右是戶外。y0 是後牆。
export const BUILDING = { x: 1, y: 1, w: 13, h: 12 };

/** 設施格。door = 客人站在走廊上「進門」的那一格 */
export const SLOTS = [
  { id: 'room1', kind: 'room', x: 1, y: 1, w: 3, h: 3, door: [2, 4] },
  { id: 'room2', kind: 'room', x: 4, y: 1, w: 3, h: 3, door: [5, 4] },
  { id: 'room3', kind: 'room', x: 7, y: 1, w: 3, h: 3, door: [8, 4] },
  { id: 'room4', kind: 'room', x: 10, y: 1, w: 3, h: 3, door: [11, 4] },
  { id: 'bath', kind: 'bath', x: 1, y: 6, w: 4, h: 3, door: [2, 5] },
  { id: 'dining', kind: 'dining', x: 6, y: 6, w: 4, h: 3, door: [7, 5] },
  { id: 'shop', kind: 'shop', x: 11, y: 6, w: 3, h: 3, door: [12, 5] },
  { id: 'onsen', kind: 'onsen', x: 15, y: 1, w: 6, h: 4, door: [17, 5] },
  { id: 'garden', kind: 'garden', x: 15, y: 7, w: 6, h: 3, door: [17, 6] },
  // 別館:後期客滿時的出路。need = 這一格第一次蓋要幾星(覆蓋 FAC 的設定)
  { id: 'room5', kind: 'room', x: 15, y: 11, w: 3, h: 3, door: [16, 10], need: 3, annex: true },
  { id: 'room6', kind: 'room', x: 18, y: 11, w: 3, h: 3, door: [19, 10], need: 4, annex: true },
];

// 櫃台
export const DESK = { x: 2, y: 10, spot: [3.5, 12.8], staff: [3.5, 10.2] };   // 櫃台佔 x2~4、y10~11,員工站後面
export const ENTRANCE = [7.5, 13.9];       // 客人從這裡進來、離開
export const EAST_DOOR = [13, 4];

/** 可以走的格子 */
export function buildWalkable() {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) g[y][x] = true; };
  for (let x = 1; x <= 13; x++) { set(x, 4); set(x, 5); }          // 上方走廊
  for (let y = 6; y <= 8; y++) { set(5, y); set(10, y); }          // 兩條直走廊
  for (let x = 1; x <= 13; x++) for (let y = 9; y <= 12; y++) set(x, y);   // 大廳
  for (let x = 2; x <= 4; x++) for (let y = 9; y <= 11; y++) g[y][x] = false;  // 櫃台本身與後面
  set(7, 13);                                                        // 大門
  set(14, 4); set(14, 5);                                            // 東門
  for (let x = 14; x <= 21; x++) { set(x, 5); set(x, 6); set(x, 10); }   // 戶外步道
  for (let y = 7; y <= 9; y++) set(14, y);                           // 往別館的小路
  return g;
}

// ---------- 設施 ----------
// cost[i] = 蓋到第 i+1 級的價錢;need[i] = 需要幾星
export const FAC = {
  room: {
    name: '和室', icon: '🛏', cost: [200, 450, 900], need: [1, 1, 3],
    price: [60, 100, 160], comfort: [0, 8, 16],
    desc: '客人住的房間。等級越高,一晚房價越貴、客人越滿意。一間住一組客人。',
  },
  bath: {
    name: '大浴場', icon: '🛁', cost: [300, 650, 1300], need: [1, 1, 3],
    sat: [14, 22, 32], cap: [3, 4, 6], time: 7,
    desc: '室內大浴池。上班族最愛。等級越高池子越大、可以同時泡更多人。',
  },
  dining: {
    name: '食堂', icon: '🍱', cost: [350, 750, 1500], need: [1, 1, 3],
    sat: [12, 20, 30], cap: [2, 4, 4], fee: [30, 50, 80], time: 7,
    desc: '晚餐吃會席料理。每位客人都會付餐費。情侶跟上班族很喜歡。',
  },
  shop: {
    name: '土產店', icon: '🎁', cost: [300, 600, 1100], need: [1, 2, 3],
    sat: [6, 10, 16], cap: [2, 2, 3], fee: [20, 35, 55], time: 4,
    desc: '賣當地特產。家族跟外國旅客會買很多。',
  },
  onsen: {
    name: '露天風呂', icon: '♨️', cost: [1200, 2400, 4000], need: [2, 2, 4],
    sat: [26, 38, 52], cap: [4, 6, 8], time: 9,
    desc: '戶外溫泉,旅館的招牌!冬天效果加倍,也會讓更多客人慕名而來。',
  },
  garden: {
    name: '庭園', icon: '🌸', cost: [800, 1600, 3000], need: [3, 3, 4],
    sat: [8, 12, 18], cap: [3, 4, 5], time: 5, aura: [4, 8, 12],
    desc: '可以散步的日式庭園。所有住客都會多一點滿意度,人氣也會上升。',
  },
};

// ---------- 星級 ----------
export const STAR_REP = [0, 150, 450, 1000, 2000];       // 累積口碑達到幾分升到 1~5 星
export const REVIEW_REP = [-15, -4, 10, 24, 40];         // 一則 1~5 星評價加幾分口碑
export function starsOf(rep) {
  let s = 1;
  for (let i = 0; i < STAR_REP.length; i++) if (rep >= STAR_REP[i]) s = i + 1;
  return s;
}

// ---------- 客人 ----------
export const TYPES = {
  family: { name: '家族旅行', likes: ['shop', 'garden', 'bath'], groups: [2, 2] },
  couple: { name: '情侶', likes: ['onsen', 'dining', 'garden'], groups: [2, 2] },
  worker: { name: '上班族', likes: ['bath', 'dining'], groups: [1, 1] },
  tourist: { name: '外國旅客', likes: ['onsen', 'shop', 'dining'], groups: [1, 2] },
};
export const TYPE_KEYS = Object.keys(TYPES);

// ---------- 季節:每季 7 天 ----------
export const SEASONS = [
  { name: '春', icon: '🌸', arrive: 1.1, onsen: 1.0, tint: null },
  { name: '夏', icon: '🌻', arrive: 1.0, onsen: 0.8, tint: null },
  { name: '秋', icon: '🍁', arrive: 1.2, onsen: 1.1, tint: 'rgba(255,140,40,0.10)' },
  { name: '冬', icon: '❄️', arrive: 1.3, onsen: 1.5, tint: 'rgba(170,200,255,0.12)' },
];
export const seasonOf = day => SEASONS[Math.floor((day - 1) / 7) % 4];

// ---------- 隨機事件(第 3 天起,每天 25%)----------
export const EVENTS = [
  { id: 'press', text: '📰 旅遊雜誌記者今天會來住!他的評價算 3 倍', weight: 2 },
  { id: 'group', text: '🚌 有一團旅行團預約,今天客人比較多', weight: 3 },
  { id: 'rain', text: '🌧 下雨天,客人少一點,但泡湯的人特別開心', weight: 2 },
  { id: 'festival', text: '🏮 附近有夏祭り,大家心情很好', weight: 2 },
];

// ---------- 評語 ----------
export const REVIEWS = {
  5: ['這輩子住過最棒的溫泉旅館!', '一定會再來,下次帶家人一起', '{fav}太讚了,完全放鬆了'],
  4: ['很舒服的旅館,{fav}很好', '服務很親切,推薦', '泡完湯睡得超好'],
  3: ['還不錯,但可以再多一點設施', '普通的溫泉旅館', '房間有點簡單'],
  2: ['等太久了…', '想泡湯但人太多', '有點失望'],
  1: ['不會再來了', '什麼都沒有…', '好無聊'],
};
