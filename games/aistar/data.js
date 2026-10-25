/* ============================================================
   AI 明星養成:數值與清單(純資料,engine.js 跟畫面都讀這份)
   ============================================================ */

export const SKILLS = {
  sing: { name: '歌唱', icon: '🎤' },
  dance: { name: '舞蹈', icon: '💃' },
  act: { name: '演技', icon: '🎭' },
  talk: { name: '口才', icon: '🎙' },
};
export const SKILL_IDS = Object.keys(SKILLS);

/* ---------- 媒體 ----------
   w = 看哪些技能(加起來 1;sw = 每個角色各看什麼,沒寫就跟 w 一樣)、weeks = 做幾週、pay/fans = 基本酬勞與粉絲、
   slots = 角色(第一個是主要的,一定要有人)、lv = 公司幾級才會出現、big = 大場面 */
export const MEDIA = {
  short:   { name: '短影音挑戰', icon: '📱', pf: '閃拍', w: { dance: 0.6, talk: 0.4 }, days: 1, weeks: 1, pay: 320, fans: 420, slots: ['挑戰者'], lv: 1 },
  drama:   { name: 'AI 短劇', icon: '🎬', pf: '星劇場', w: { act: 1 }, days: 4, weeks: 1, pay: 1000, fans: 950, slots: ['主角', '配角'], lv: 1, big: true },
  live:    { name: '直播', icon: '🔴', pf: '直播島', w: { talk: 0.8, sing: 0.2 }, days: 1, weeks: 1, pay: 300, fans: 300, slots: ['主持'], lv: 1 },
  podcast: { name: 'Podcast', icon: '🎧', pf: '耳朵電台', w: { talk: 1 }, days: 1, weeks: 1, pay: 380, fans: 260, slots: ['主持'], lv: 1 },
  voice:   { name: 'AI 繪本配音', icon: '📖', pf: '故事盒子', w: { talk: 0.6, act: 0.4 }, days: 2, weeks: 1, pay: 520, fans: 280, slots: ['配音'], lv: 1 },
  duo:     { name: '雙人企劃', icon: '👯', pf: '閃拍', w: { dance: 0.5, sing: 0.5 }, days: 2, weeks: 1, pay: 700, fans: 750, slots: ['搭檔', '搭檔'], lv: 1 },
  ad:      { name: '廣告', icon: '📺', pf: '電視', w: { sing: 0.25, dance: 0.25, act: 0.25, talk: 0.25 }, days: 2, weeks: 1, pay: 1700, fans: 220, slots: ['代言人'], lv: 2 },
  game:    { name: '遊戲代言', icon: '🎮', pf: '遊戲公司', w: { talk: 0.5, act: 0.5 }, days: 1, weeks: 1, pay: 2000, fans: 260, slots: ['代言人'], lv: 2, fame: true },
  contest: { name: '選秀節目', icon: '🏆', pf: '星光擂台', w: null, days: 3, weeks: 1, pay: 700, fans: 1900, slots: ['參賽者'], lv: 2, big: true },
  concert: { name: '虛擬演唱會', icon: '🎤', pf: '元宇宙舞台', w: { sing: 0.6, dance: 0.4 }, days: 4, weeks: 2, pay: 4200, fans: 6000, slots: ['主唱', '伴舞'], sw: [{ sing: 0.8, dance: 0.2 }, { dance: 0.8, sing: 0.2 }], lv: 3, big: true },
  // 限時新平台(事件帶出來)
  holo:    { name: '全息直播', icon: '🌐', pf: '全息島', w: { talk: 0.5, dance: 0.5 }, days: 1, weeks: 1, pay: 900, fans: 1000, slots: ['主持'], lv: 1, temp: true },
  pet:     { name: 'AI 寵物頻道', icon: '🐾', pf: '毛毛台', w: { talk: 0.5, act: 0.5 }, days: 1, weeks: 1, pay: 800, fans: 900, slots: ['主持'], lv: 1, temp: true },
  // 最終目標
  dome:    { name: '星光巨蛋演唱會', icon: '🏟', pf: '星光巨蛋', w: { sing: 0.4, dance: 0.4, talk: 0.2 }, days: 5, weeks: 2, pay: 30000, fans: 60000, slots: ['主唱', '主舞', '主持'], sw: [{ sing: 0.8, dance: 0.2 }, { dance: 0.8, sing: 0.2 }, { talk: 0.8, act: 0.2 }], lv: 4, big: true, final: true },
};
export const NORMAL_MEDIA = Object.keys(MEDIA).filter(k => !MEDIA[k].temp && !MEDIA[k].final);
/** 主角類的角色(愛面子搶這個,配角就不開心) */
export const LEAD_ROLES = ['主角', '主唱'];

export const TITLES = {
  short: ['#{t}舞蹈挑戰', '#{t}變裝挑戰', '#{t}搞笑對嘴', '#{t}一秒變身'],
  drama: ['《{t}偵探社》', '《我的{t}同學》', '《{t}大冒險》', '《穿越到{t}世界》', '《{t}學園》'],
  live: ['{t}聊天直播', '{t}開箱直播', '一起畫{t}直播'],
  podcast: ['《聊聊{t}》', '{t}冷知識電台', '睡前{t}故事'],
  voice: ['AI 繪本《{t}的一天》', '有聲書《{t}小百科》', '動畫《{t}小隊》配音'],
  duo: ['雙人{t}舞蹈挑戰', '{t}雙人合唱', '{t}雙人搞笑短片'],
  ad: ['{t}果汁廣告', '{t}文具廣告', '{t}運動鞋廣告', '{t}早餐穀片廣告'],
  game: ['手遊《{t}王國》代言', '《{t}賽車》代言', '《{t}牧場》代言'],
  contest: ['星光擂台:{t}特別賽', '全國{t}才藝大賽'],
  concert: ['{t}虛擬演唱會', '元宇宙{t}音樂祭'],
  holo: ['全息{t}派對'], pet: ['AI 寵物陪你看{t}'],
  dome: ['星光巨蛋演唱會'],
};

export const TOPICS = [
  { id: 'dino', name: '恐龍', icon: '🦖' }, { id: 'space', name: '太空', icon: '🚀' }, { id: 'food', name: '美食', icon: '🍜' },
  { id: 'sport', name: '運動', icon: '⚽' }, { id: 'sea', name: '海洋', icon: '🐬' }, { id: 'magic', name: '魔法', icon: '🪄' },
  { id: 'retro', name: '復古', icon: '📼' }, { id: 'animal', name: '動物', icon: '🐱' }, { id: 'rain', name: '下雨天', icon: '☔' },
  { id: 'robot', name: '機器人', icon: '🤖' }, { id: 'detective', name: '偵探', icon: '🔍' }, { id: 'festival', name: '音樂祭', icon: '🎪' },
];
export const topicById = id => TOPICS.find(t => t.id === id);

/* ---------- 性格 ---------- */
export const TRAITS = {
  comp:    { name: '好勝', icon: '🔥', desc: '大案子一定搶;沒搶到會更努力練習' },
  shy:     { name: '害羞', icon: '🙈', desc: '很少主動搶;大場面會緊張,有好朋友在就不怕' },
  perf:    { name: '完美主義', icon: '💎', desc: '只搶最拿手的;練過的項目演得更好' },
  funny:   { name: '愛搞笑', icon: '😂', desc: '愛短影音和直播;讓全公司心情變好' },
  jeal:    { name: '愛吃醋', icon: '💢', desc: '看別人被選會不開心;連輸三次會鬧彆扭' },
  hot:     { name: '熱血', icon: '⚡', desc: '什麼都想搶,練習很拚,但比較容易累' },
  chill:   { name: '悠哉', icon: '🌙', desc: '不太搶,心情很穩;練習比較慢' },
  curious: { name: '好奇', icon: '🔍', desc: '愛新平台和熱門話題;沒選上會找人組隊' },
  dream:   { name: '夢想家', icon: '🌠', desc: '有一個夢想的媒體,得到會大爆發' },
  kind:    { name: '貼心', icon: '💗', desc: '會讓給朋友;沒選上也會恭喜別人' },
  proud:   { name: '愛面子', icon: '👑', desc: '想當主角,不喜歡配角和小案子' },
  solo:    { name: '獨行俠', icon: '🎧', desc: '不喜歡雙人企劃,一個人表現更好' },
};
export const TRAIT_IDS = Object.keys(TRAITS);

/* ---------- 明星的名字、口頭禪、配色 ---------- */
export const NAMES = ['露露', '琪琪', '桃桃', '諾娃', '皮克', '比比', '可可', '多多', '咪咪', '菈菈', '珠珠', '露米', '艾可', '米亞', '阿哲',
  '小凱', '阿布', '提提', '泡泡', '雷雷', '小光', '星宇', '安安', '樂樂', '莉莉', '歐歐', '小薰', '阿傑', '奈奈', '飛飛', '妮妮', '路卡',
  '小雨', '果果', '丁丁', '嘟嘟', '艾瑪', '小森', '柚子', '布丁', '麻糬', '小葵', '阿澄', '悠悠', '咕咕', '小藍'];
export const EMOJIS = ['🌟', '🌙', '🍓', '🐱', '🐰', '🦊', '🍀', '🎈', '🧁', '🐬', '🌈', '⚡', '🍑', '🐼', '🎀', '🪐', '🍙', '🦄', '🐧', '🌻'];
export const CATCH = ['嗶嗶~', 'OK 的啦!', '衝了!', '嘿嘿~', '好耶!', '嗯哼。', '喵~', '沒問題!', '耶比!', '哇喔!', '啾咪~', '好的好的!',
  '真的假的!', '加油加油!', '叮咚~', '呼呼~', '啦啦啦~', '讚啦!', '咻~', '嘻嘻。'];
export const GLOWS = ['#ff5ec4', '#6fe0ff', '#ffd25a', '#7fdc8a', '#b98cff', '#ff9a52', '#ff6f6f', '#5a8aff'];

/* ---------- 公司 ---------- */
export const LEVELS = [null,
  { name: '小工作室', max: 4, floors: 5, ops: 3, rent: 150, cost: 0, fans: 0 },
  { name: '攝影棚', max: 6, floors: 7, ops: 4, rent: 350, cost: 4000, fans: 5000 },
  { name: '媒體大樓', max: 8, floors: 9, ops: 5, rent: 700, cost: 15000, fans: 25000 },
  { name: '星光塔', max: 9, floors: 12, ops: 6, rent: 1200, cost: 40000, fans: 80000 },
];
export const FLOORS = {
  lobby: { name:'大廳', icon:'🏢', desc:'新人試鏡與出入口；Lv3 每週機會 +1', build:0, cost:[1500,4000] },
  studio: { name:'攝影棚', icon:'🎬', desc:'拍攝與 AI 剪輯；酬勞、粉絲 +0/10/20%', build:0, cost:[2000,5000] },
  dance: { name:'舞蹈室', icon:'💃', desc:'舞蹈練習 ×1/1.2/1.4，容納 2/3/4 人', build:1500, cost:[1200,3000] },
  sing: { name:'錄音室', icon:'🎤', desc:'歌唱練習 ×1/1.2/1.4，容納 2/3/4 人', build:1500, cost:[1200,3000] },
  act: { name:'表演教室', icon:'🎭', desc:'演技練習 ×1/1.2/1.4，容納 2/3/4 人', build:1800, cost:[1200,3000] },
  talk: { name:'綜藝教室', icon:'🎙', desc:'口才練習 ×1/1.2/1.4，容納 2/3/4 人', build:1800, cost:[1200,3000] },
  cafe: { name:'員工餐廳', icon:'🍱', desc:'每日午餐體力 +6/10/14', build:1200, cost:[1000,2500] },
  dorm: { name:'宿舍', icon:'🛏', desc:'每日晚上體力 +8/12/16', build:1200, cost:[1000,2500] },
  lounge: { name:'休息室', icon:'🧖', desc:'沒工作的晚上體力 +8/10/12、心情 +3', build:2500, cost:[2000,5000] },
};
export const salary = st => Math.round(60 + st.fans / 160);
export const auditionCost = n => 800 + n * 250;
export const OUTFIT_COST = 300, MEET_COST = 500, TALK_COST = 150;

export const GRADES = [
  { g: 'S', min: 78, mult: 1.6, color: '#ffd25a' },
  { g: 'A', min: 63, mult: 1.25, color: '#ff8fb1' },
  { g: 'B', min: 46, mult: 1.0, color: '#6fe0ff' },
  { g: 'C', min: -999, mult: 0.6, color: '#b9c2d6' },
];
export const gradeOf = score => GRADES.find(g => score >= g.min);

export const RIVALS = [
  { name: '閃亮娛樂', icon: '💫', fans: 8000, g: 0.058 },
  { name: '銀河工作室', icon: '🌌', fans: 5000, g: 0.064 },
  { name: '泡泡星文化', icon: '🫧', fans: 2500, g: 0.072 },
];

/* ---------- 階段目標 ---------- */
export const GOALS = [
  { id: 'debut', icon: '🌱', name: '出道', desc: '完成第一個案子、公司粉絲 1,000', prize: 800 },
  { id: 'known', icon: '⭐', name: '小有名氣', desc: '公司粉絲 10,000、升到 Lv2 攝影棚', prize: 2000 },
  { id: 'popular', icon: '🌟', name: '人氣公司', desc: '排行榜前 2 名、升到 Lv3 媒體大樓', prize: 5000 },
  { id: 'dome', icon: '🏟', name: '星光巨蛋', desc: '公司粉絲 100,000、升到 Lv4 星光塔 → 解鎖巨蛋演唱會', prize: 10000 },
  { id: 'final', icon: '🏆', name: '巨蛋成功', desc: '星光巨蛋演唱會拿到 A 以上', prize: 0, final: true },
];

export const ENDINGS = {
  family: { icon: '🤝', name: '大家庭結局', text: '沒有人離開,大家感情都好好。這間公司像一個大家庭,每個人都在這裡發光。' },
  rivals: { icon: '⚔️', name: '宿敵變戰友結局', text: '{a} 和 {b} 從競爭對手變成最好的戰友。互相比較、互相幫忙,才讓彼此變得更強。' },
  superstar: { icon: '👑', name: '超級巨星結局', text: '{a} 成為全國最紅的 AI 明星,一個人就撐起半間公司!' },
  allround: { icon: '🌈', name: '全能公司結局', text: '短劇、直播、Podcast、演唱會……每一種媒體都拿過 S,你們是最全能的公司。' },
  star: { icon: '✨', name: '星光結局', text: '一路上有歡笑也有不服氣,最後大家一起站上了星光巨蛋。' },
};
