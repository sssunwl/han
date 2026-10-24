// 雪糕店資料；數值與順序維持不變，集中列出以便之後調整平衡。

// ===== 地圖與時間 =====
export const T = 32;                          // 一格的世界像素
export const COLS = 30;                       // 店內總欄數
export const ROWS = 12;                       // 店內總列數（人行道另加兩列）
export const DAY_SECONDS = 110;               // 一倍速每個營業日的秒數
export const STAR_REP = [0, 500, 2000, 5500, 13000]; // 一至五星所需口碑
export const starsOf = rep => STAR_REP.filter(n => rep >= n).length;
export const SEASONS = ['春', '夏', '秋', '冬'];
export const SEASON_ICONS = ['🌸', '☀️', '🍁', '❄️'];

// price 為單球價；tags 影響喜好與比賽；season 0～3 代表春夏秋冬；ng 只在分店開放。
// ===== 口味 =====
export const FLAVORS = {
  vanilla:    { id: 'vanilla',    name: '香草',  color: '#fff1c9', tags: ['classic'],                  price: 10 },
  strawberry: { id: 'strawberry', name: '草莓',  color: '#ff9fbe', tags: ['fruit', 'classic'],         price: 10 },
  chocolate:  { id: 'chocolate',  name: '朱古力', color: '#8a5a3c', tags: ['rich', 'classic'],          price: 10 },
  mint:       { id: 'mint',       name: '薄荷',  color: '#9fe8cf', tags: ['fresh'],                    price: 10 },
  mango:      { id: 'mango',      name: '芒果',  color: '#ffcf4a', tags: ['fruit'],                    price: 10 },
  grape:      { id: 'grape',      name: '葡萄',  color: '#9c6ad8', tags: ['fruit'],                    price: 15 },
  matcha:     { id: 'matcha',     name: '抹茶',  color: '#a9cf6a', tags: ['jp'],                       price: 15 },
  soda:       { id: 'soda',       name: '汽水',  color: '#8fd3ff', tags: ['fresh'],                    price: 15 },
  sesame:     { id: 'sesame',     name: '黑芝麻', color: '#5d5862', tags: ['jp', 'rich'],               price: 15 },
  blueberry:  { id: 'blueberry',  name: '藍莓',  color: '#4f6fd8', tags: ['fruit', 'fresh'],           price: 15 },
  lemon:      { id: 'lemon',      name: '檸檬',  color: '#fff36a', tags: ['fruit', 'fresh'],           price: 15 },
  peach:      { id: 'peach',      name: '蜜桃',  color: '#ffbe9a', tags: ['fruit'],                    price: 15 },
  caramel:    { id: 'caramel',    name: '焦糖',  color: '#c98a4a', tags: ['rich'],                     price: 15 },
  redbean:    { id: 'redbean',    name: '紅豆',  color: '#9a4a4a', tags: ['jp'],                       price: 15 },
  sakura:     { id: 'sakura',     name: '櫻花',  color: '#ffd9ec', tags: ['jp', 'season'],             price: 20, season: 0 },
  watermelon: { id: 'watermelon', name: '西瓜',  color: '#ff5a6a', tags: ['fruit', 'fresh', 'season'], price: 20, season: 1 },
  pumpkin:    { id: 'pumpkin',    name: '南瓜',  color: '#ff8a2a', tags: ['rich', 'season'],           price: 20, season: 2 },
  cranberry:  { id: 'cranberry',  name: '紅莓',  color: '#c4304a', tags: ['fruit', 'season'],          price: 20, season: 3 },
  rainbow:    { id: 'rainbow',    name: '彩虹',  color: 'rainbow', tags: ['classic', 'fruit'],         price: 25, ng: true },
};

// w/h 是佔用格數，seats 是座位數，cost 是購買價，need 是星級，comfort 是舒適加分。
// ===== 座位 =====
export const SEATS = {
  stool:  { name: '吧台椅', w: 1, h: 1, seats: 1, cost: 50,  need: 1, comfort: 0 },
  table2: { name: '雙人桌', w: 3, h: 1, seats: 2, cost: 120, need: 1, comfort: 0 },
  table4: { name: '四人桌', w: 3, h: 3, seats: 4, cost: 320, need: 2, comfort: 0 },
  sofa2:  { name: '沙發座', w: 3, h: 1, seats: 2, cost: 420, need: 3, comfort: 8 },
};

// val 是魅力，cost 是購買價，need 是星級，w/h 是佔用格數，ng 代表二周目限定。
// ===== 裝潢 =====
export const DECOR = {
  plant_round: { name: '圓盆栽',  val: 2, cost: 60,  need: 1, w: 1, h: 1, ng: false },
  plant_tall:  { name: '高盆栽',  val: 3, cost: 90,  need: 1, w: 1, h: 1, ng: false },
  bin:         { name: '垃圾桶',  val: 1, cost: 30,  need: 1, w: 1, h: 1, ng: false },
  cone_sign:   { name: '甜筒招牌', val: 3, cost: 100, need: 1, w: 1, h: 1, ng: false },
  balloons:    { name: '氣球',   val: 3, cost: 80,  need: 1, w: 1, h: 1, ng: false },
  lamp:        { name: '立燈',   val: 4, cost: 140, need: 2, w: 1, h: 1, ng: false },
  rug:         { name: '圓地毯',  val: 4, cost: 150, need: 2, w: 2, h: 1, ng: false },
  gumball:     { name: '糖果機',  val: 5, cost: 200, need: 2, w: 1, h: 1, ng: false },
  jukebox:     { name: '點唱機',  val: 6, cost: 300, need: 3, w: 1, h: 1, ng: false },
  mascot:      { name: '雪糕人偶', val: 6, cost: 320, need: 3, w: 1, h: 1, ng: false },
  aquarium:    { name: '水族箱',  val: 8, cost: 500, need: 4, w: 2, h: 1, ng: false },
  neon:        { name: '霓虹甜筒', val: 8, cost: 450, need: 1, w: 1, h: 1, ng: true },
};

// patience 是耐心秒數；balls 是一／二／三球權重；cone 是甜筒機率；tip 是基本小費。
// ===== 客人 =====
export const TYPES = {
  kid:     { name: '小朋友', patience: 45, balls: [6, 3, 1], cone: 0.8, tip: 1 },
  student: { name: '學生',  patience: 35, balls: [3, 5, 2], cone: 0.6, tip: 2 },
  family:  { name: '家庭',  patience: 40, balls: [4, 4, 2], cone: 0.5, tip: 2 },
  office:  { name: '上班族', patience: 22, balls: [3, 5, 2], cone: 0.3, tip: 5 },
  elder:   { name: '長輩',  patience: 50, balls: [7, 3, 0], cone: 0.2, tip: 3 },
  tourist: { name: '遊客',  patience: 30, balls: [1, 3, 6], cone: 0.5, tip: 6 },
  critic:  { name: '美食家', patience: 30, balls: [0, 0, 1], cone: 0,   tip: 10 },
};

// ===== 店面位置 =====
// flow 為基本客流；types 為客群權重；season 為春夏秋冬客流倍率；fourth 為起始第四口味。
// floor/wall 為贈送風格，rent 為每日租金。
export const LOCATIONS = [
  {
    id: 'beach', name: '🏖 海邊', desc: '遊客多，夏天爆滿、冬天冷清',
    flow: 5, types: { tourist: 3, family: 2, student: 1, kid: 1 },
    season: [1, 1.6, 0.9, 0.6], fourth: 'soda', wall: 'window',
  },
  {
    id: 'school', name: '🏫 小學旁邊', desc: '小朋友超多，大多只買一球',
    flow: 6, types: { kid: 4, student: 2, family: 1, elder: 1 },
    season: [1, 0.8, 1, 1], fourth: 'mango',
  },
  {
    id: 'park', name: '🌳 公園', desc: '家庭最多，喜歡坐下來慢慢吃',
    flow: 5, types: { family: 3, kid: 2, elder: 2, student: 1 },
    season: [1.2, 1.2, 1, 0.7], fourth: 'mint',
  },
  {
    id: 'station', name: '🚉 車站', desc: '上班族趕時間，做得快小費多',
    flow: 6, types: { office: 4, student: 2, tourist: 1 },
    season: [1, 1, 1, 1], fourth: 'lemon',
  },
  {
    id: 'oldtown', name: '🏮 老街', desc: '長輩和遊客，喜歡和風口味',
    flow: 5, types: { elder: 3, tourist: 2, family: 1 },
    season: [1, 1, 1.2, 1], fourth: 'matcha', floor: 'wood',
  },
  {
    id: 'mall', name: '🏬 商場', desc: '什麼客人都有，每天租金 $40',
    flow: 7, types: { kid: 1, student: 1, family: 1, office: 1, elder: 1, tourist: 1 },
    season: [1, 1, 1, 1], fourth: 'mango', rent: 40,
  },

];

// ===== 配料與研究 =====
export const TOPPINGS = { sprinkles: '彩色米', cherry: '櫻桃', choco: '朱古力醬', gold: '金箔' };
// cost 為靈感消耗，need 為星級；口味依原本清單順序逐步提高費用與門檻。
export const RESEARCH = [...Object.values(FLAVORS).filter(f => !('season' in f)).map((f, i) => ({
  id: f.id,
  name: f.name,
  kind: 'flavor',
  cost: Math.min(12, 4 + Math.max(0, i - 5)),
  need: i > 10 ? 3 : i > 7 ? 2 : 1,
  ng: f.ng
})), ...Object.entries(TOPPINGS).map(([id, name], i) => ({
  id,
  name,
  kind: 'topping',
  cost: [6, 8, 10, 20][i],
  need: [1, 2, 3, 1][i],
  ng: id === 'gold'
})), ...['快手挖球', '保冷櫃', '集點卡', '外帶紙袋', '自家烤甜筒', '甜點師'].map((name, i) => ({
  id: ['quick', 'cold', 'loyal', 'bag', 'baked', 'chef'][i],
  name,
  kind: 'passive',
  cost: [8, 8, 12, 6, 10, 14][i],
  need: [1, 1, 2, 1, 3, 4][i]
}))];

// ===== 員工 =====
// color 為職業固定衣服色；雇用與受訓消耗金錢，xpNeed 為下一級所需工作經驗。
// ===== 職業外觀 =====
export const ROLES = {
  server:   { name: '店員', icon: '🍦', color: '#ff8fb1' },
  cleaner:  { name: '清潔', icon: '🧹', color: '#8fd3ff' },
  promoter: { name: '宣傳', icon: '📣', color: '#ffd25a' },
};
export const hireCost = n => 200 + 150 * n;      // n 為目前員工數
export const trainCost = lv => 120 + 120 * lv;    // lv 為目前等級
export const xpNeed = lv => 12 * lv;
export const staffMax = star => 1 + star;

// ===== 雪糕節主題 =====
// tag 對應口味 tags；color 改用三種口味的色相差計分。
export const THEMES = [
  { name: '🍓 水果派對', tag: 'fruit' },
  { name: '🍫 濃濃濃', tag: 'rich' },
  { name: '🌸 季節限定', tag: 'season' },
  { name: '🍵 和風', tag: 'jp' },
  { name: '🧊 清涼', tag: 'fresh' },
  { name: '✨ 經典', tag: 'classic' },
  { name: '🌈 繽紛顏色', tag: 'color' },
];

// ===== 里程碑與評語 =====
// reward.money/ideas 為達標獎勵；final 交由遊戲結局流程處理，不由一般里程碑自動發獎。
export const MILESTONES = [
  { id: 'open', name: '🍦 開張大吉', desc: '服務 20 位客人', reward: { money: 300, ideas: 3 } },
  { id: 'popular', name: '⭐ 人氣小店', desc: '達到 3★', reward: { money: 800, ideas: 5 } },
  { id: 'collector', name: '🎨 口味收藏家', desc: '學會 10 種口味', reward: { money: 1000, ideas: 8 } },
  { id: 'large', name: '🏬 雪糕大店', desc: '擁有 12 個座位', reward: { money: 2000, ideas: 10 } },
  { id: 'final', name: '🏆 全城最好吃的雪糕店', desc: '達到 5★，雪糕節拿第一名', final: true },
];

// 由一星到五星，每級四則評語。
export const REVIEWS = [
  ['下次想試別的口味！', '今天想要杯裝呢。', '希望下次多一球。', '再快一點就好了！'],
  ['也不錯啦～', '甜甜的，心情變好了。', '下次再來試試！', '這家很親切。'],
  ['好吃！', '喜歡這裡的雪糕。', '今天吃得很開心。', '放學再來！'],
  ['口味好棒！', '朋友一定會喜歡。', '坐著慢慢吃真舒服。', '店長做得好漂亮！'],
  ['全城最好吃！', '今天的雪糕滿分！', '這是我最愛的小店！', '每一球都是幸福！'],
];

// ===== 人生選擇 =====
// opts 為 [選項文字, 效果]；money/rep 立即套用，mod.days 為持續天數，perm 為永久效果。
// kids/party/flow 為額外客流，mood 為心情，berry/rain/donate 是對應事件旗標。
export const CHOICES = [
  {
    id: 'berry', title: '草莓大豐收', text: '農夫想便宜賣給你！',
    opts: [
      ['花 $100 收下', { money: -100, mod: { days: 3, berry: true, mood: 5 } }],
      ['謝謝，不用了', {}],
    ],
  },
  {
    id: 'school', title: '學校來參觀', text: '老師想帶小朋友認識雪糕店。',
    opts: [
      ['歡迎！多 6 位小朋友', { rep: 20, mod: { days: 1, kids: 6 } }],
      ['今天先不接待', {}],
    ],
  },
  {
    id: 'video', title: '網紅來拍片', text: '她想介紹你的招牌雪糕。',
    opts: [
      ['免費請她吃 $30', { money: -30, rep: 40 }],
      ['照常收費', { money: 20 }],
    ],
  },
  {
    id: 'rival', title: '隔壁開新店', text: '要怎樣讓大家看見我們？',
    opts: [
      ['花 $80 做傳單', { money: -80, mod: { days: 2, flow: 3 } }],
      ['專心做好雪糕', { mod: { days: 2, flow: -2 } }],
    ],
  },
  {
    id: 'machine', title: '雪糕機特價', text: '新機器能讓店員快 20%。',
    opts: [
      ['花 $300 買下', { money: -300, perm: 'machine' }],
      ['暫時不買', {}],
    ],
  },
  {
    id: 'recipe', title: '老爺爺的祖傳配方', text: '願意學學新口味嗎？',
    opts: [
      ['請教配方', { learn: true }],
      ['謝謝爺爺！', { rep: 10 }],
    ],
  },
  {
    id: 'party', title: '生日派對訂單', text: '四位小朋友想吃三球雪糕。',
    opts: [
      ['接下訂單', { mod: { days: 1, party: 4 } }],
      ['下次一起慶祝', {}],
    ],
  },
  {
    id: 'charity', title: '慈善義賣', text: '一起幫助社區的小朋友。',
    opts: [
      ['捐出今天小費', { rep: 60, mod: { days: 1, donate: true } }],
      ['這次先不參加', {}],
    ],
  },
  {
    id: 'rain', title: '下大雨了', text: '今天要怎樣營業？',
    opts: [
      ['提早休息，補貼 $50', { money: 50, rest: true }],
      ['照常開店', { mod: { days: 1, rain: true } }],
    ],
  },
  {
    id: 'magazine', title: '雪糕雜誌專訪', text: '雜誌想拍你的店面。',
    opts: [
      ['花 $150 拍照', { money: -150, rep: 80 }],
      ['下次吧', {}],
    ],
  },
];
