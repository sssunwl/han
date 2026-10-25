/* ============================================================
   AI 明星養成:數值與清單(純資料,engine.js 跟畫面都讀這份)
   ============================================================ */

export const SKILLS = {
  sing: { name: '歌唱', icon: '🎤' },
  dance: { name: '舞蹈', icon: '💃' },
  act: { name: '演技', icon: '🎭' },
  talk: { name: '口才', icon: '🎙' },
  charm: { name: '魅力', icon: '💄' },
};
export const SKILL_IDS = Object.keys(SKILLS);

/* ---------- 媒體 ----------
   w = 看哪些技能(加起來 1;sw = 每個角色各看什麼,沒寫就跟 w 一樣)、weeks = 做幾週、pay/fans = 基本酬勞與粉絲、
   slots = 角色(第一個是主要的,一定要有人)、lv = 公司幾級才會出現、big = 大場面 */
export const MEDIA = {
  fashion: { name:'時尚走秀', icon:'📸', pf:'星光伸展台', w:{charm:0.7,dance:0.3}, days:2,weeks:1,pay:900,fans:650,slots:['模特'],lv:1 },
  short:   { name: '短影音挑戰', icon: '📱', pf: '閃拍', w: { dance: 0.6, talk: 0.4 }, days: 1, weeks: 1, pay: 320, fans: 420, slots: ['挑戰者'], lv: 1 },
  drama:   { name: 'AI 短劇', icon: '🎬', pf: '星劇場', w: { act: 1 }, days: 4, weeks: 1, pay: 1000, fans: 950, slots: ['主角', '配角'], lv: 1, big: true },
  live:    { name: '直播', icon: '🔴', pf: '直播島', w: { talk: 0.8, sing: 0.2 }, days: 1, weeks: 1, pay: 300, fans: 300, slots: ['主持'], lv: 1 },
  podcast: { name: 'Podcast', icon: '🎧', pf: '耳朵電台', w: { talk: 1 }, days: 1, weeks: 1, pay: 380, fans: 260, slots: ['主持'], lv: 1 },
  voice:   { name: 'AI 繪本配音', icon: '📖', pf: '故事盒子', w: { talk: 0.6, act: 0.4 }, days: 2, weeks: 1, pay: 520, fans: 280, slots: ['配音'], lv: 1 },
  duo:     { name: '雙人企劃', icon: '👯', pf: '閃拍', w: { dance: 0.5, sing: 0.5 }, days: 2, weeks: 1, pay: 700, fans: 750, slots: ['搭檔', '搭檔'], lv: 1 },
  ad:      { name: '廣告', icon: '📺', pf: '電視', w: { charm:0.4, sing:0.2, dance:0.2, act:0.2 }, days: 2, weeks: 1, pay: 1700, fans: 220, slots: ['代言人'], lv: 2 },
  game:    { name: '遊戲代言', icon: '🎮', pf: '遊戲公司', w: { talk:0.4, act:0.3, charm:0.3 }, days: 1, weeks: 1, pay: 2000, fans: 260, slots: ['代言人'], lv: 2, fame: true },
  contest: { name: '選秀節目', icon: '🏆', pf: '星光擂台', w: null, days: 3, weeks: 1, pay: 700, fans: 1900, slots: ['參賽者'], lv: 2, big: true },
  concert: { name: '虛擬演唱會', icon: '🎤', pf: '元宇宙舞台', w: { sing: 0.6, dance: 0.4 }, days: 4, weeks: 2, pay: 4200, fans: 6000, slots: ['主唱', '伴舞'], sw: [{ sing: 0.8, dance: 0.2 }, { dance: 0.8, sing: 0.2 }], lv: 3, big: true },
  // 限時新平台(事件帶出來)
  holo:    { name: '全息直播', icon: '🌐', pf: '全息島', w: { talk: 0.5, dance: 0.5 }, days: 1, weeks: 1, pay: 900, fans: 1000, slots: ['主持'], lv: 1, temp: true },
  pet:     { name: 'AI 寵物頻道', icon: '🐾', pf: '毛毛台', w: { talk: 0.5, act: 0.5 }, days: 1, weeks: 1, pay: 800, fans: 900, slots: ['主持'], lv: 1, temp: true },
  // 自家企劃(製作部做的,不會出現在每週隨機機會裡,也不會被別家公司接走)
  own_album:   { name:'自家單曲', icon:'💿', pf:'自家製作', w:{sing:0.7,dance:0.3}, days:2, weeks:3, pay:0, fans:700, slots:['主唱'], lv:1, own:true, project:true, needs:['sing'] },
  own_drama:   { name:'自家短劇', icon:'🎞', pf:'自家製作', w:{act:1}, days:2, weeks:4, pay:0, fans:1100, slots:['主角','配角'], lv:1, own:true, project:true, needs:['studio'], big:true },
  own_show:    { name:'自家綜藝', icon:'📺', pf:'自家製作', w:{talk:0.7,act:0.3}, days:2, weeks:3, pay:0, fans:800, slots:['主持','來賓'], lv:1, own:true, project:true, needs:['talk'] },
  group_album: { name:'團體專輯', icon:'💽', pf:'自家製作', w:{sing:0.5,charm:0.5}, days:2, weeks:3, pay:0, fans:1500, slots:['C 位'], lv:1, own:true, project:true, needs:['sing','dance'], big:true },
  musicshow:   { name:'音樂節目', icon:'🎶', pf:'打歌舞台', w:{sing:0.6,dance:0.4}, days:1, weeks:1, pay:400, fans:900, slots:['原唱'], lv:1, own:true },
  // 最終目標
  dome:    { name: '星光巨蛋演唱會', icon: '🏟', pf: '星光巨蛋', w: { sing: 0.4, dance: 0.4, talk: 0.2 }, days: 5, weeks: 2, pay: 30000, fans: 60000, slots: ['主唱', '主舞', '主持'], sw: [{ sing: 0.8, dance: 0.2 }, { dance: 0.8, sing: 0.2 }, { talk: 0.8, act: 0.2 }], lv: 4, big: true, final: true },
};
export const NORMAL_MEDIA = Object.keys(MEDIA).filter(k => !MEDIA[k].temp && !MEDIA[k].final && !MEDIA[k].own);
export const PROJECTS = Object.keys(MEDIA).filter(k => MEDIA[k].project);
export const SONG_TYPES = ['own_album', 'group_album'];
/** 主角類的角色(愛面子搶這個,配角就不開心) */
export const LEAD_ROLES = ['主角', '主唱'];

export const TITLES = {
  fashion:['{t}主題走秀','{t}時尚雜誌封面','{t}童裝型錄'],
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
  own_album: ['「{t}之歌」', '「{t}的約定」', '「我的{t}日記」', '「{t}星期天」'],
  own_drama: ['《{t}偵探事件簿》', '《{t}放學後》', '《{t}奇幻旅程》'],
  own_show: ['《{t}大挑戰》', '《{t}超級任務》', '《{t}知識王》'],
  group_album: ['《{t}》'], musicshow: ['打歌舞台'],
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
  { name: '星光塔', max: 10, floors: 12, ops: 6, rent: 1200, cost: 40000, fans: 80000 },
];
export const FLOORS = {
  style:{name:'造型室',icon:'💄',build:1800,cost:[1200,3000],desc:'魅力練習 ×1/1.2/1.4，容納 2/3/4 人'},
  scout:{name:'星探部',icon:'🔭',build:2000,cost:[1500,4000],desc:'每週去街上、網路、學校找新人(Lv 越高找越多、越會看潛力)'},
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
  // 第 3 階段
FLOORS.production = { name:'製作部', icon:'🎛', build:3000, cost:[2500,6000], desc:'自己做專輯、短劇、綜藝,做好了每週有播放分潤;可同時做 1/2/3 個企劃' };
FLOORS.sns = { name:'SNS 部門', icon:'📱', build:2500, cost:[2000,5000], desc:'經營社群:每週選一種貼文策略,大家被動漲粉(效果 ×1/1.4/1.8)' };
export const salary = st => st.trainee ? 30 : Math.round(60 + st.fans / 160);
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
  dreams:{icon:'🌈',name:'夢想成真結局',text:'每個人都朝自己的夢想前進，而且大部分都實現了!'},
  family: { icon: '🤝', name: '大家庭結局', text: '沒有人離開,大家感情都好好。這間公司像一個大家庭,每個人都在這裡發光。' },
  rivals: { icon: '⚔️', name: '宿敵變戰友結局', text: '{a} 和 {b} 從競爭對手變成最好的戰友。互相比較、互相幫忙,才讓彼此變得更強。' },
  superstar: { icon: '👑', name: '超級巨星結局', text: '{a} 成為全國最紅的 AI 明星,一個人就撐起半間公司!' },
  allround: { icon: '🌈', name: '全能公司結局', text: '短劇、直播、Podcast、演唱會……每一種媒體都拿過 S,你們是最全能的公司。' },
  star: { icon: '✨', name: '星光結局', text: '一路上有歡笑也有不服氣,最後大家一起站上了星光巨蛋。' },
};

export const CAREERS = {
 singer:{name:'歌手',icon:'🎤',skill:'sing',media:['concert','duo','live']},
 actor:{name:'演員',icon:'🎭',skill:'act',media:['drama','voice','pet']},
 dancer:{name:'舞者',icon:'💃',skill:'dance',media:['short','duo','holo']},
 variety:{name:'綜藝人',icon:'🎙',skill:'talk',media:['podcast','live','voice']},
 model:{name:'模特',icon:'📸',skill:'charm',media:['fashion','ad','game']},
 idol:{name:'全能偶像',icon:'🌟',media:[]},
};
export const STAFF_NAMES=['文青','大山','小禾','阿松','美晴','家豪','曉彤','明軒','采芸','立平','子晴','信宏','佩珊','佳穎','俊文','怡君'];
export const STAFF_ROLES={
 manager:{name:'經紀人',icon:'🧑‍💼',floor:'lobby',desc:'所有作品酬勞 +10/15/20%'},
 trainer:{name:'訓練師',icon:'🏋',desc:'指定科目練習 ×1.15/1.25/1.35'},
 chef:{name:'廚師',icon:'🧑‍🍳',floor:'cafe',desc:'午餐體力再 +4/6/8'},
 scout:{name:'星探',icon:'🔭',floor:'scout',desc:'發掘新人機率 +25%，Lv3 看得到最強技能'},
 stylist:{name:'造型師',icon:'💄',floor:'style',desc:'魅力練習 ×1.2/1.3/1.4，走秀與廣告酬勞 +5/8/10%'},
};
STAFF_ROLES.producer = { name:'製作人', icon:'🎛', floor:'production', desc:'自家企劃品質 +5/8/12、播放分潤 +10/20/30%' };
STAFF_ROLES.editor = { name:'小編', icon:'📱', floor:'sns', desc:'SNS 效果 ×1/1.15/1.3;Lv3 可以幫忙處理假影片、壞留言' };
CAREERS.singer.media.push('own_album', 'group_album', 'musicshow');
CAREERS.dancer.media.push('group_album', 'musicshow');
CAREERS.actor.media.push('own_drama');
CAREERS.variety.media.push('own_show');

/* ---------- 第 3 階段:製作、SNS、團體、排行、頒獎 ---------- */
export const BUDGETS = {
  small: { name:'小', cost:2000, bonus:0, mult:1 },
  mid:   { name:'中', cost:5000, bonus:6, mult:1.8 },
  big:   { name:'大', cost:12000, bonus:12, mult:3 },
};
export const SNS = {
  vlog:      { name:'日常 Vlog', icon:'📹', desc:'每個人都漲一點粉,心情 +2' },
  challenge: { name:'跟風挑戰', icon:'🔥', desc:'漲粉;這週有接到熱門 🔥 媒體的人 ×3' },
  behind:    { name:'幕後花絮', icon:'🎬', desc:'漲一點粉;信任、歸屬感 +2' },
  qa:        { name:'粉絲問答', icon:'💬', desc:'粉絲最少的 3 位大漲,其他人一點點' },
};
export const CONCEPTS = {
  cute:  { name:'可愛', icon:'🍬', w:{ sing:0.5, charm:0.5 } },
  cool:  { name:'帥氣', icon:'😎', w:{ dance:0.6, charm:0.4 } },
  fresh: { name:'清新', icon:'🌿', w:{ sing:0.6, talk:0.4 } },
  funny: { name:'搞笑', icon:'🤪', w:{ talk:0.6, act:0.4 } },
};
export const GROUP_PREFIX = ['星星', '彩虹', '泡泡', '閃光', 'Pixel', 'Sunny', 'Cosmo', '棉花', '蘇打', '晴天'];
export const GROUP_SUFFIX = ['糖', '小隊', 'Pop', 'Wave', 'Five', '少年團', '少女隊', '樂團', 'Stars', '探險隊'];
export const GROUP_COST = 3000;
export const NPC_SONGS = ['「月亮汽水」', '「跳跳糖」', '「晴天列車」', '「彩色雨傘」', '「小小宇宙」', '「草莓地圖」', '「藍色鯨魚」', '「夏日冰塊」', '「星空電話」', '「好朋友進行曲」'];
export const NPC_NAMES = ['小晴', '阿森', '米米', '雷歐', '蘋蘋', '凱凱', '莎莎', '豆豆'];
export const AWARDS = [
  { cat:'rookie', icon:'🌱', name:'年度新人' },
  { cat:'song', icon:'🎵', name:'年度歌曲' },
  { cat:'group', icon:'👯', name:'年度團體' },
  { cat:'acting', icon:'🎭', name:'年度演技' },
  { cat:'popular', icon:'⭐', name:'人氣獎' },
];
export const staffSalary = st => 80+40*(st.lv-1);
