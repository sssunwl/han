/* ============================================================
   溫泉旅館 v2 的資料:地圖、設施、擺設、組合、研究、員工、宣傳、排行
   數值都集中在這裡,要調平衡只改這個檔。
   ============================================================ */

export const T = 32;                  // 一格 32px(LimeZu 32×32 素材)
export const COLS = 32, ROWS = 24;    // 整片土地(格)
export const CHUNK = 8;               // 一塊地 8×8 格,買地以塊為單位 → 4×3 塊
export const DAY_SECONDS = 140;       // 1 倍速下一天幾秒(地圖大,要給客人時間走路)
export const YEAR_DAYS = 28;          // 一年 = 四季 × 7 天

// ---------- 起始土地、大門、櫃台 ----------
export const START_CHUNKS = ['1,2', '2,2'];       // 下方中間兩塊(x8~23, y16~23)
export const ENTRANCE = [16, 23];                 // 大門那一格
export const SPAWN = [16.5, 24.7];                // 客人從畫面外走進來
export const DESK = { x: 13, y: 20, w: 3, h: 2, staff: [14.5, 20.2] };
export const QUEUE = { x: 14, y: 22, max: 8 };    // 排隊:從 (14,22) 往右排
/** 不能蓋東西、但可以走的格子(排隊區、大門) */
export function isReserved(x, y) {
  if (y === 22 && x >= 12 && x <= 22) return true;
  if (x === 16 && y === 23) return true;
  return false;
}
/** 櫃台本體與後面的員工區:不能蓋、也不能走 */
export const isDeskArea = (x, y) => x >= 13 && x <= 15 && y >= 19 && y <= 21;

/** 第 n 塊地(已經有 n 塊)的價錢與星級門檻 */
export const landCost = n => Math.round(600 * Math.pow(1.55, n - 2) / 50) * 50;
export const landNeed = n => [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5][n - 2] || 5;

// ---------- 設施 ----------
// cost[i] = 蓋到第 i+1 級;need[i] = 需要幾星;research = 要先研究才能蓋
export const FAC = {
  room: {
    name: '和室', icon: '🛏', w: 3, h: 3, cost: [300, 500, 900], need: [1, 1, 3],
    group: 2, price: [60, 100, 160], comfort: [0, 8, 16],
    desc: '兩人房。一間住一組客人,等級越高房價越貴、越舒服。',
  },
  bigroom: {
    name: '大和室', icon: '🛌', w: 4, h: 3, cost: [800, 1200, 2000], need: [2, 2, 3], research: true,
    group: 4, price: [55, 90, 140], comfort: [4, 12, 20],
    desc: '可以住 3~4 人的家族房。沒有大和室,家族旅行就只會兩個人來。',
  },
  bath: {
    name: '大浴場', icon: '🛁', w: 4, h: 3, cost: [400, 800, 1500], need: [1, 1, 3],
    sat: [14, 22, 32], cap: [3, 4, 6], time: 7, pool: 'bath',
    desc: '室內大浴池。上班族跟長輩最愛。',
  },
  onsen: {
    name: '露天風呂', icon: '♨️', w: 6, h: 4, cost: [1500, 2600, 4200], need: [2, 2, 4],
    sat: [26, 38, 52], cap: [4, 6, 8], time: 9, pool: 'onsen',
    desc: '旅館的招牌!冬天效果 ×1.5,周圍種滿植物會變成「秘湯」。',
  },
  family: {
    name: '家族風呂', icon: '🚿', w: 3, h: 3, cost: [700, 1100, 1800], need: [2, 2, 4], research: true,
    sat: [20, 28, 38], cap: [2, 3, 4], fee: [30, 50, 80], time: 8, pool: 'bath', private: true,
    desc: '包場的小浴池,一次只給一組客人。情侶跟家族會付錢來泡。',
  },
  footbath: {
    name: '足湯', icon: '🦶', w: 2, h: 2, cost: [300, 500, 800], need: [1, 2, 3], research: true,
    sat: [6, 9, 13], cap: [2, 2, 3], time: 4, pool: 'onsen',
    desc: '泡腳的小池子,便宜又佔地小。旁邊放長椅會變成「足湯廣場」。',
  },
  dining: {
    name: '食堂', icon: '🍱', w: 4, h: 3, cost: [400, 800, 1500], need: [1, 1, 3],
    sat: [12, 20, 30], cap: [2, 4, 4], fee: [30, 50, 80], time: 7,
    desc: '晚餐吃會席料理,每位客人都會付餐費。',
  },
  shop: {
    name: '土產店', icon: '🎁', w: 3, h: 3, cost: [300, 600, 1100], need: [1, 2, 3],
    sat: [6, 10, 16], cap: [2, 2, 3], fee: [20, 35, 55], time: 4,
    desc: '賣當地特產。蓋在食堂旁邊會變成「溫泉街」。',
  },
  lounge: {
    name: '休憩室', icon: '🛋', w: 3, h: 3, cost: [350, 650, 1100], need: [1, 2, 3], research: true,
    sat: [8, 12, 18], cap: [2, 3, 3], time: 5,
    desc: '泡完湯躺沙發看書。蓋在浴場附近會變成「湯上り處」。',
  },
  karaoke: {
    name: '卡拉OK', icon: '🎤', w: 3, h: 3, cost: [600, 1000, 1700], need: [2, 3, 4], research: true,
    sat: [10, 16, 24], cap: [3, 3, 4], fee: [20, 35, 50], time: 6,
    desc: '唱歌的包廂。家族跟外國旅客最愛,會付錢。',
  },
};
export const FAC_ORDER = ['room', 'bigroom', 'bath', 'onsen', 'family', 'footbath', 'dining', 'shop', 'lounge', 'karaoke'];

// ---------- 擺設 ----------
// 放在走道上,會讓附近 2 格內的設施變好(val 加總的一半,最多 +10)
export const DECOR = {
  bush: { name: '灌木', cost: 40, val: 2, plant: true },
  pot: { name: '陶壺', cost: 30, val: 1 },
  bonsai_s: { name: '小盆栽', cost: 60, val: 3, plant: true },
  plant: { name: '觀葉植物', cost: 70, val: 3, plant: true },
  vase: { name: '花瓶', cost: 50, val: 2 },
  flowers: { name: '花盆', cost: 90, val: 4, plant: true },
  bench: { name: '長椅', cost: 100, val: 3 },
  palm: { name: '大盆栽', cost: 100, val: 4, plant: true, research: true },
  fishbowl: { name: '金魚缸', cost: 80, val: 3, research: true },
  bonsai_l: { name: '松樹盆景', cost: 140, val: 5, plant: true, research: true },
  garland: { name: '燈籠串', cost: 160, val: 5, research: true },
};
export const DECOR_ORDER = ['bush', 'pot', 'bonsai_s', 'plant', 'vase', 'flowers', 'bench', 'palm', 'fishbowl', 'bonsai_l', 'garland'];

// ---------- 組合(發現時口碑 +20,效果持續)----------
export const COMBOS = [
  { id: 'garden_room', name: '庭景和室', hint: '和室旁邊 1 格內有 2 盆以上植物', effect: '那間房舒適度 +6' },
  { id: 'hidden', name: '秘湯', hint: '露天風呂 2 格內有 3 盆以上植物', effect: '露天風呂滿意度 +10' },
  { id: 'street', name: '溫泉街', hint: '土產店跟食堂相鄰(1 格內)', effect: '土產店消費 ×1.3' },
  { id: 'yuagari', name: '湯上り處', hint: '休憩室在浴場或露天風呂 2 格內', effect: '休憩室滿意度 +8' },
  { id: 'plaza', name: '足湯廣場', hint: '足湯 2 格內有長椅', effect: '足湯滿意度 +6' },
  { id: 'festival', name: '燈籠祭', hint: '擺 3 串以上燈籠串', effect: '每天多 1 位客人' },
  { id: 'aquarium', name: '金魚大廳', hint: '櫃台 3 格內有金魚缸', effect: '入住時滿意度 +4' },
];

// ---------- 研究(用客人給的 💡 靈感點)----------
export const RESEARCH = [
  { id: 'lounge', name: '休憩室', cost: 15, need: 1, fac: 'lounge' },
  { id: 'footbath', name: '足湯', cost: 20, need: 1, fac: 'footbath' },
  { id: 'palm', name: '大盆栽', cost: 10, need: 1, decor: 'palm' },
  { id: 'fishbowl', name: '金魚缸', cost: 12, need: 1, decor: 'fishbowl' },
  { id: 'bigroom', name: '大和室', cost: 35, need: 2, fac: 'bigroom' },
  { id: 'family', name: '家族風呂', cost: 45, need: 2, fac: 'family' },
  { id: 'bonsai_l', name: '松樹盆景', cost: 20, need: 2, decor: 'bonsai_l' },
  { id: 'karaoke', name: '卡拉OK', cost: 50, need: 3, fac: 'karaoke' },
  { id: 'garland', name: '燈籠串', cost: 25, need: 3, decor: 'garland' },
  // 被動研究:不解鎖東西,而是讓整間旅館變強
  { id: 'service', name: '接待訓練', cost: 40, need: 1, perk: '入住時滿意度 +4,櫃台辦手續變快' },
  { id: 'cleaning', name: '清潔用具', cost: 35, need: 1, perk: '員工打掃時間減半' },
  { id: 'water', name: '溫泉水質改良', cost: 60, need: 2, perk: '所有浴池滿意度 +5' },
  { id: 'cuisine', name: '料理研究', cost: 70, need: 2, perk: '食堂餐費 ×1.25、滿意度 +4' },
  { id: 'souvenir', name: '特產開發', cost: 60, need: 2, perk: '土產店消費 ×1.3' },
  { id: 'futon', name: '高級寢具', cost: 80, need: 3, perk: '所有房間舒適度 +5' },
  { id: 'pr', name: '宣傳技巧', cost: 90, need: 3, perk: '宣傳費 6 折、效果多 1 天' },
  { id: 'night', name: '夜間營業', cost: 120, need: 4, perk: '客人晚上可以玩更久(多一個設施)' },
];

// ---------- 員工:負責打掃退房後的房間 ----------
export const STAFF_HIRE = n => 250 + n * 200;     // 已經有 n 位時,再請一位的費用
export const STAFF_SALARY = 30;                   // 每人每天
export const staffMax = stars => 1 + stars;

// ---------- 宣傳(3 天)----------
export const ADS = [
  { id: 'family', name: '親子雜誌', cost: 250, need: 1, type: 'family', text: '家族客變多' },
  { id: 'couple', name: '情侶網紅', cost: 300, need: 1, type: 'couple', text: '情侶變多' },
  { id: 'worker', name: '商務訂房網', cost: 300, need: 1, type: 'worker', text: '上班族變多' },
  { id: 'elder', name: '長青旅行團', cost: 350, need: 2, type: 'elder', text: '長輩變多' },
  { id: 'tourist', name: '海外旅遊網', cost: 500, need: 2, type: 'tourist', text: '外國旅客變多' },
  { id: 'tv', name: '電視廣告', cost: 1500, need: 3, type: null, text: '每天多 3 位客人' },
];
export const AD_DAYS = 3;

// ---------- 星級 ----------
export const STAR_REP = [0, 250, 900, 2400, 6000];
export const REVIEW_REP = [-15, -4, 10, 24, 40];
export function starsOf(rep) {
  let s = 1;
  for (let i = 0; i < STAR_REP.length; i++) if (rep >= STAR_REP[i]) s = i + 1;
  return s;
}

// ---------- 全國溫泉旅館排行(每年年底結算)----------
export const RIVALS = [24000, 18000, 14000, 10500, 7800, 5600, 3900, 2600, 1600, 900, 400, 120];
export const rankOf = rep => 1 + RIVALS.filter(v => v > rep).length;

// ---------- 客人 ----------
export const TYPES = {
  family: { name: '家族旅行', likes: ['shop', 'karaoke', 'family', 'footbath'], size: [2, 4] },
  couple: { name: '情侶', likes: ['onsen', 'family', 'dining'], size: [2, 2] },
  worker: { name: '上班族', likes: ['bath', 'dining', 'lounge'], size: [1, 1] },
  tourist: { name: '外國旅客', likes: ['onsen', 'shop', 'footbath', 'karaoke'], size: [1, 2] },
  elder: { name: '長輩', likes: ['bath', 'lounge', 'footbath'], size: [1, 2] },
};
export const TYPE_KEYS = Object.keys(TYPES);

// ---------- 季節:每季 7 天 ----------
export const SEASONS = [
  { name: '春', icon: '🌸', arrive: 1.1, onsen: 1.0, tint: null },
  { name: '夏', icon: '🌻', arrive: 1.0, onsen: 0.8, tint: null },
  { name: '秋', icon: '🍁', arrive: 1.2, onsen: 1.1, tint: 'rgba(255,140,40,0.08)' },
  { name: '冬', icon: '❄️', arrive: 1.3, onsen: 1.5, tint: 'rgba(170,200,255,0.10)' },
];
export const seasonOf = day => SEASONS[Math.floor((day - 1) / 7) % 4];

// ---------- 隨機事件(第 3 天起,每天 25%)----------
export const EVENTS = [
  { id: 'press', text: '📰 旅遊雜誌記者今天會來住!他的評價算 3 倍', weight: 2 },
  { id: 'group', text: '🚌 有一團旅行團預約,今天客人比較多', weight: 3 },
  { id: 'rain', text: '🌧 下雨天,客人少一點,但泡湯的人特別開心', weight: 2 },
  { id: 'festival', text: '🏮 附近有祭典,大家心情很好', weight: 2 },
];

// ---------- 評語 ----------
export const REVIEWS = {
  5: ['這輩子住過最棒的溫泉旅館!', '一定會再來,下次帶家人一起', '{fav}太讚了,完全放鬆了'],
  4: ['很舒服的旅館,{fav}很好', '服務很親切,推薦', '泡完湯睡得超好'],
  3: ['還不錯,但可以再多一點設施', '普通的溫泉旅館', '房間有點簡單'],
  2: ['等太久了…', '想泡湯但人太多', '有點失望'],
  1: ['不會再來了', '什麼都沒有…', '房間好髒…'],
};
