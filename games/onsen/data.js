/* ============================================================
   溫泉旅館 v2 的資料:地圖、設施、擺設、組合、研究、員工、宣傳、排行
   數值都集中在這裡,要調平衡只改這個檔。
   ============================================================ */

export const T = 32;                  // 一格 32px(pixelkit 32px 格)
export const COLS = 32, ROWS = 24;    // 整片土地(格)
export const CHUNK = 8;               // 一塊地 8×8 格,買地以塊為單位 → 4×3 塊
export const DAY_SECONDS = 140;       // 1 倍速下一天幾秒(地圖大,要給客人時間走路)
export const YEAR_DAYS = 28;          // 一年 = 四季 × 7 天

// ---------- 起始土地、大門、櫃台 ----------
export const START_CHUNKS = ['1,2', '2,2'];       // 下方中間兩塊(x8~23, y16~23)
export const ENTRANCE = [16, 23];                 // 大門那一格
export const SPAWN = [16.5, 24.7];                // 客人從畫面外走進來
export const DESK = { x: 13, y: 20, w: 3, h: 2, staff: [14.5, 20.55] };
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
  egg: {
    name: '溫泉蛋攤', icon: '🥚', w: 2, h: 2, cost: [200, 350, 600], need: [1, 1, 2],
    sat: [5, 8, 12], cap: [2, 2, 3], fee: [10, 15, 25], time: 3,
    desc: '用溫泉水煮蛋的小攤子,便宜又受歡迎。外國旅客最愛。',
  },
  arcade: {
    name: '遊戲機台區', icon: '🕹', w: 3, h: 3, cost: [450, 800, 1300], need: [1, 2, 3],
    sat: [8, 13, 19], cap: [2, 3, 4], fee: [15, 25, 40], time: 5,
    desc: '溫泉旅館必備的復古遊戲機台。家族跟上班族會投幣玩。',
  },
  tea: {
    name: '茶室', icon: '🍵', w: 3, h: 3, cost: [500, 900, 1500], need: [2, 2, 3], research: true,
    sat: [12, 18, 26], cap: [2, 3, 3], fee: [25, 40, 60], time: 6,
    desc: '喝抹茶、吃和菓子的安靜房間。長輩跟外國旅客最愛。',
  },
  massage: {
    name: '按摩室', icon: '💆', w: 3, h: 3, cost: [600, 1000, 1600], need: [2, 3, 4], research: true,
    sat: [14, 20, 28], cap: [1, 2, 2], fee: [50, 80, 120], time: 7,
    desc: '泡完湯按摩最舒服。人少但很賺,上班族跟長輩最愛。',
  },
  koi: {
    name: '錦鯉池', icon: '🎏', w: 4, h: 3, cost: [900, 1500, 2400], need: [2, 3, 4],
    sat: [9, 13, 18], cap: [3, 4, 5], time: 5, pool: 'koi',
    desc: '戶外的鯉魚池,看魚游來游去很療癒。情侶跟長輩喜歡。',
  },
  shrine: {
    name: '小神社', icon: '⛩', w: 2, h: 2, cost: [800, 1300, 2000], need: [3, 3, 4], research: true,
    sat: [8, 12, 16], cap: [2, 2, 3], fee: [10, 20, 30], time: 4,
    desc: '客人會來參拜、買御守。有神社的旅館,遇到事件時運氣比較好。',
  },
};
export const FAC_ORDER = ['room', 'bigroom', 'bath', 'onsen', 'family', 'footbath', 'dining', 'shop', 'lounge', 'karaoke', 'egg', 'arcade', 'tea', 'massage', 'koi', 'shrine'];

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
  andon: { name: '行燈', cost: 60, val: 2 },
  bamboo: { name: '竹叢', cost: 80, val: 3, plant: true },
  stone_lantern: { name: '石燈籠', cost: 120, val: 4 },
  fireplace: { name: '暖爐', cost: 150, val: 4, research: true },
  koinobori: { name: '鯉魚旗', cost: 180, val: 5, research: true },
};
export const DECOR_ORDER = ['bush', 'pot', 'andon', 'bonsai_s', 'plant', 'vase', 'bamboo', 'flowers', 'bench', 'stone_lantern', 'palm', 'fishbowl', 'bonsai_l', 'fireplace', 'garland', 'koinobori'];

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
  { id: 'tea', name: '茶室', cost: 30, need: 2, fac: 'tea' },
  { id: 'massage', name: '按摩室', cost: 55, need: 2, fac: 'massage' },
  { id: 'fireplace', name: '暖爐', cost: 20, need: 2, decor: 'fireplace' },
  { id: 'shrine', name: '小神社', cost: 60, need: 3, fac: 'shrine' },
  { id: 'koinobori', name: '鯉魚旗', cost: 30, need: 3, decor: 'koinobori' },
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

// 員工職業:每個人有自己的名字、職業、等級(1~5)。做事會累積經驗,經驗滿了花錢受訓就升一級
// pow 是給畫面看的說明;實際效果寫在 main.js 的 crewLv() 那幾個地方
// look = 制服:同一種職業固定髮色 + 衣服色(髮型每人不同),一眼看出誰是做什麼的;chars 只是舊存檔的編號
export const STAFF_ROLES = {
  clean: { name: '打掃', icon: '🧹', look: { hairColor: '#6b4430', cloth: '#7fdc8a' }, chars: [14, 15, 16], desc: '打掃退房後的房間。等級越高掃越快', pow: lv => lv > 1 ? `打掃時間 -${(lv - 1) * 12}%` : '打掃速度普通' },
  desk: { name: '接待', icon: '🛎', look: { hairColor: '#3a2a2a', cloth: '#ff8fb1' }, chars: [17, 20], desc: '站櫃台幫客人辦入住。辦得快,客人一進門就開心', pow: lv => `辦手續變快 · 入住滿意 +${lv * 2}` },
  cook: { name: '廚師', icon: '🍳', look: { hairColor: '#d8573f', cloth: '#f4f1fa' }, chars: [18], desc: '在食堂煮飯。沒有食堂的話就沒事做', pow: lv => `餐費 +${lv * 8}% · 吃飯滿意 +${lv * 2}` },
  yumori: { name: '湯守', icon: '♨️', look: { hairColor: '#e8bf5a', cloth: '#6fc3ff' }, chars: [19, 15], desc: '照顧浴池、調水溫。所有浴池的客人更舒服', pow: lv => `泡湯滿意 +${lv * 2}` },
};
export const ROLE_ORDER = ['clean', 'desk', 'cook', 'yumori'];
export const STAFF_NAMES = ['小春', '阿健', '美雪', '大翔', '花子', '拓海', '優子', '阿蓮', '千夏', '小太郎', '櫻', '阿寬', '桃子', '翔太', '小雪', '阿德'];
export const STAFF_MAX_LV = 5;
export const xpNeed = lv => lv * 6;                 // 從 lv 升到 lv+1 要的經驗
export const trainCost = lv => 150 + lv * 150;      // 受訓費
export const salaryOf = lv => STAFF_SALARY + (lv - 1) * 10;

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
// 每間有自己的起始口碑跟每天成長;第二年年底剛好跟玩家拚第一(自動玩家實測)
export const INNS = [
  { name: '箱根 滿月亭', rep: 3000, grow: 360 },
  { name: '草津 鶴之湯', rep: 2400, grow: 290 },
  { name: '別府 地獄屋', rep: 1900, grow: 230 },
  { name: '由布院 花水木', rep: 1500, grow: 180 },
  { name: '登別 熊之湯', rep: 1100, grow: 135 },
  { name: '道後 白鷺館', rep: 800, grow: 100 },
  { name: '城崎 柳月', rep: 550, grow: 70 },
  { name: '銀山 燈屋', rep: 380, grow: 48 },
  { name: '黑川 森之宿', rep: 240, grow: 30 },
  { name: '熱海 海音', rep: 140, grow: 18 },
  { name: '下呂 翡翠庵', rep: 70, grow: 9 },
  { name: '乳頭 秘湯庵', rep: 20, grow: 4 },
];
/** 對手的新聞:會讓那間成長變快,並在幾天內搶走你的客人 */
export const RIVAL_NEWS = [
  '開了全新的露天風呂', '請到名廚坐鎮', '上了電視旅遊節目', '推出情侶優惠', '整修完成重新開幕', '辦了賞月祭',
];

// ---------- 客人 ----------
export const TYPES = {
  family: { name: '家族旅行', likes: ['shop', 'karaoke', 'family', 'footbath', 'arcade', 'egg'], size: [2, 4] },
  couple: { name: '情侶', likes: ['onsen', 'family', 'dining', 'koi', 'shrine'], size: [2, 2] },
  worker: { name: '上班族', likes: ['bath', 'dining', 'lounge', 'massage', 'arcade'], size: [1, 1] },
  tourist: { name: '外國旅客', likes: ['onsen', 'shop', 'egg', 'tea', 'shrine', 'karaoke'], size: [1, 2] },
  elder: { name: '長輩', likes: ['bath', 'lounge', 'tea', 'massage', 'koi'], size: [1, 2] },
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

// ---------- 成就(kind 由 main.js 判斷;reward 解鎖時直接給)----------
export const ACHIEVEMENTS = [
  { id: 'g1', name: '開張大吉', desc: '招待第 1 位客人', kind: 'guests', n: 1, reward: { money: 100 } },
  { id: 'g50', name: '小有名氣', desc: '累積招待 50 位客人', kind: 'guests', n: 50, reward: { money: 300 } },
  { id: 'g300', name: '人氣旅館', desc: '累積招待 300 位客人', kind: 'guests', n: 300, reward: { money: 1000 } },
  { id: 'g1000', name: '千客萬來', desc: '累積招待 1000 位客人', kind: 'guests', n: 1000, reward: { money: 3000, ideas: 30 } },
  { id: 'r5_10', name: '好評不斷', desc: '拿到 10 則 5 星評價', kind: 'best5', n: 10, reward: { ideas: 5 } },
  { id: 'r5_100', name: '口碑傳奇', desc: '拿到 100 則 5 星評價', kind: 'best5', n: 100, reward: { ideas: 20 } },
  { id: 's3', name: '三星旅館', desc: '升到 3 星', kind: 'stars', n: 3, reward: { money: 500 } },
  { id: 's5', name: '五星旅館', desc: '升到 5 星', kind: 'stars', n: 5, reward: { money: 2000, ideas: 20 } },
  { id: 'top10', name: '全國前十', desc: '排行進入前 10 名', kind: 'rank', n: 10, reward: { money: 500 } },
  { id: 'top3', name: '頒獎台', desc: '排行進入前 3 名', kind: 'rank', n: 3, reward: { money: 1500 } },
  { id: 'top1', name: '日本第一', desc: '排行第 1 名', kind: 'rank', n: 1, reward: { money: 5000, ideas: 50 } },
  { id: 'e10k', name: '萬元戶', desc: '累積賺到 ¥10,000', kind: 'earned', n: 10000, reward: { ideas: 5 } },
  { id: 'e100k', name: '溫泉大亨', desc: '累積賺到 ¥100,000', kind: 'earned', n: 100000, reward: { ideas: 30 } },
  { id: 'd1500', name: '大豐收', desc: '一天收入超過 ¥1,500', kind: 'dayIncome', n: 1500, reward: { money: 300 } },
  { id: 'd3000', name: '爆滿的一天', desc: '一天收入超過 ¥3,000', kind: 'dayIncome', n: 3000, reward: { money: 800 } },
  { id: 'occ', name: '全館客滿', desc: '入住率 100%(至少 6 間房)', kind: 'occ100', n: 6, reward: { money: 500 } },
  { id: 'perfect', name: '完美的一天', desc: '一天至少 5 則評價而且全部 5 星', kind: 'perfect', n: 5, reward: { ideas: 10 } },
  { id: 'land6', name: '地主', desc: '擁有 6 塊土地', kind: 'land', n: 6, reward: { money: 800 } },
  { id: 'land12', name: '溫泉鄉', desc: '買下全部 12 塊土地', kind: 'land', n: 12, reward: { money: 5000 } },
  { id: 'types', name: '什麼都有', desc: '每一種設施都至少蓋一間', kind: 'types', n: 16, reward: { ideas: 30 } },
  { id: 'combo3', name: '組合高手', desc: '發現 3 種組合', kind: 'combos', n: 3, reward: { ideas: 10 } },
  { id: 'comboAll', name: '組合大師', desc: '發現全部組合', kind: 'combos', n: 7, reward: { money: 3000 } },
  { id: 'staff5', name: '大家庭', desc: '請到 5 位員工', kind: 'staff', n: 5, reward: { money: 500 } },
  { id: 'heart', name: '有人情味的老闆', desc: '在人生選擇裡選了 5 次溫暖的選項', kind: 'heart', n: 5, reward: { ideas: 15 } },
  { id: 'wish', name: '有求必應', desc: '滿足客人的願望 20 次', kind: 'wishes', n: 20, reward: { ideas: 10 } },
];

// ---------- 人生選擇(每天開始時有機會跳出;need = 條件)----------
// effect 欄位:money / rep / ideas / staff / closed(今天不營業) / arrive(今天客人數 +/-) /
//   mod:{ sat, arrive, days }(幾天內的加成)/ path:'heart'|'biz'|'trad' / gamble:{ p, win, lose } / perm:'source' 之類永久效果
export const CHOICES = [
  { id: 'typhoon', title: '🌀 颱風要來了!', text: '氣象報告說今晚颱風會經過。', options: [
    { label: '照常營業', desc: '客人會少一半,而且可能有損壞', effect: { arrive: -0.5, gamble: { p: 0.5, win: {}, lose: { money: -400 } }, path: 'biz' } },
    { label: '休息一天,順便大掃除', desc: '今天不營業,接下來 3 天客人更滿意', effect: { closed: true, mod: { sat: 6, days: 3 }, path: 'trad' } },
    { label: '開放給附近居民避難', desc: '今天沒收入,但口碑大加', effect: { closed: true, rep: 120, path: 'heart' } },
  ] },
  { id: 'star', title: '🎬 大明星想包場', text: '有位大明星想包下整間旅館一天,開價很高。', need: { stars: 3 }, options: [
    { label: '接受!', desc: '¥3,000 入帳,今天沒有其他客人', effect: { money: 3000, closed: true, path: 'biz' } },
    { label: '婉拒,常客比較重要', desc: '口碑 +40', effect: { rep: 40, path: 'trad' } },
  ] },
  { id: 'raise', title: '🧹 員工想加薪', text: '員工們說最近太忙了,希望加薪。', need: { staff: 2 }, options: [
    { label: '加薪', desc: '每天薪水多 ¥10/人,大家更有幹勁(打掃更快)', effect: { perm: 'raise', path: 'heart' } },
    { label: '發一次獎金', desc: '花 ¥400,大家開心幾天', effect: { money: -400, mod: { sat: 3, days: 3 }, path: 'heart' } },
    { label: '不加', desc: '可能有人會離職', effect: { gamble: { p: 0.5, win: {}, lose: { staff: -1 } }, path: 'biz' } },
  ] },
  { id: 'source', title: '♨️ 源泉的主人來了', text: '附近的溫泉源頭要賣,買下來泉質會更好。', need: { stars: 2 }, once: true, options: [
    { label: '買下源泉', desc: '花 ¥3,000,所有浴池永久滿意度 +8', effect: { money: -3000, perm: 'source', path: 'trad' } },
    { label: '先不要', desc: '', effect: {} },
  ] },
  { id: 'influencer', title: '📱 網紅想免費入住', text: '有位旅遊網紅說,讓她免費住就幫忙宣傳。', options: [
    { label: '好啊', desc: '接下來 3 天每天多 2 位客人', effect: { mod: { arrive: 2, days: 3 }, path: 'biz' } },
    { label: '不行,要付錢', desc: '¥100 入帳', effect: { money: 100, path: 'trad' } },
  ] },
  { id: 'noise', title: '🎤 鄰居抱怨太吵', text: '附近居民說卡拉OK晚上太吵了。', need: { fac: 'karaoke' }, options: [
    { label: '加裝隔音', desc: '花 ¥500', effect: { money: -500, rep: 10, path: 'heart' } },
    { label: '不理他', desc: '口碑 -40', effect: { rep: -40, path: 'biz' } },
  ] },
  { id: 'cooking', title: '🍱 料理比賽邀請', text: '溫泉鄉要辦料理比賽,問你要不要派廚師參加。', need: { fac: 'dining' }, options: [
    { label: '參加!', desc: '報名費 ¥200,贏了口碑大漲', effect: { money: -200, gamble: { p: 0.5, win: { rep: 150, ideas: 10 }, lose: { rep: 10 } }, path: 'biz' } },
    { label: '這次先不要', desc: '', effect: {} },
  ] },
  { id: 'lostkid', title: '🧒 有小朋友迷路了', text: '一個小朋友在旅館門口哭,說找不到爸爸媽媽。', options: [
    { label: '大家一起幫忙找', desc: '今天客人少一點,口碑 +50', effect: { arrive: -2, rep: 50, path: 'heart' } },
    { label: '交給警察', desc: '口碑 +10', effect: { rep: 10, path: 'biz' } },
  ] },
  { id: 'antique', title: '🏮 老旅館要收起來了', text: '隔壁鎮的老旅館老闆退休,想把古董家具便宜賣給你。', options: [
    { label: '買下來', desc: '花 ¥600,靈感 +20、口碑 +30', effect: { money: -600, ideas: 20, rep: 30, path: 'trad' } },
    { label: '不用了', desc: '', effect: {} },
  ] },
  { id: 'festival', title: '🎆 地方祭典要贊助', text: '溫泉鄉的夏日祭典在找贊助商。', options: [
    { label: '贊助 ¥800', desc: '接下來 2 天每天多 4 位客人', effect: { money: -800, mod: { arrive: 4, days: 2 }, path: 'heart' } },
    { label: '不贊助', desc: '', effect: {} },
  ] },
  { id: 'tv', title: '📺 電視台想來採訪', text: '旅遊節目想來拍你的旅館。拍得好就爆紅,拍得不好…', need: { stars: 2 }, options: [
    { label: '歡迎!', desc: '評價高的旅館會大紅(神社會保佑你)', effect: { gamble: { p: 0.6, win: { rep: 200, mod: { arrive: 3, days: 3 } }, lose: { rep: -60 } }, path: 'biz' } },
    { label: '還沒準備好', desc: '', effect: {} },
  ] },
  { id: 'poach', title: '😠 對手想挖角', text: '對手旅館想用高薪挖走你的員工。', need: { staff: 2 }, options: [
    { label: '加薪留人', desc: '花 ¥500', effect: { money: -500, path: 'heart' } },
    { label: '讓他走', desc: '少一位員工', effect: { staff: -1, path: 'biz' } },
  ] },
  { id: 'cat', title: '🐈 旅館來了一隻貓', text: '一隻小貓每天都在大門口等,客人很喜歡牠。', once: true, options: [
    { label: '收養當看板貓', desc: '永久:每位客人入住時滿意度 +3', effect: { perm: 'cat', rep: 20, path: 'heart' } },
    { label: '送去收容所', desc: '', effect: { path: 'biz' } },
  ] },
];
export const PATHS = { heart: '人情派', biz: '生意派', trad: '傳統派' };

// ---------- 客人的小願望(想要還沒蓋的設施)----------
export const WISHES = {
  egg: '好想吃溫泉蛋…', arcade: '想玩遊戲機!', tea: '想喝杯抹茶', massage: '肩膀好酸,想按摩',
  koi: '想看錦鯉', shrine: '想去參拜', karaoke: '想唱歌!', footbath: '想泡個腳', onsen: '想泡露天風呂',
  dining: '肚子好餓', shop: '想買伴手禮', lounge: '想找地方休息',
};
