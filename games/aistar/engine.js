/* ============================================================
   AI 明星養成:遊戲引擎(純邏輯,不碰 DOM)
   - 整局狀態都在一個物件 S 裡,直接存檔。亂數用固定種子(狀態 S.rs 也存進存檔),
     所以同一個種子 + 同樣的操作 = 同樣的結果,自動玩家可以在 Node 直接跑。
   - 畫面只要呼叫:newGame / assign / setPlan / chooseEvent / 各種購買 / endWeek,
     然後讀 S 畫出來;明星講的話都寫進 S.feed(有遞增的 n,畫面拿新的去冒泡泡)。
   ============================================================ */
import * as D from './data.js';
import * as L from './lines.js';
import { randomLook, CLOTH_COLORS } from '../../shared/pixelkit/character.js';
import { ACCESSORIES } from '../../shared/pixelkit/studio.js';

const { MEDIA, TOPICS, TRAITS, LEVELS } = D;
// 七天制的進步速度可獨立校準，不改目標與評價門檻。
export const LEARNING = Object.freeze({ training: 0.12, work: 0.035 });
// 七天制一個人一週能接好幾個小案子,作品的粉絲/酬勞要打折,節奏才跟 v1 差不多(結局約第 30~60 週)
export const OUTPUT = Object.freeze({ fans: 0.36, pay: 0.45 });

// ---------- 亂數(mulberry32,狀態存在 S.rs) ----------
export function rnd(S) {
  let t = (S.rs = (S.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (S, a, b) => a + Math.floor(rnd(S) * (b - a + 1));
const pick = (S, a) => a[Math.floor(rnd(S) * a.length)];
const chance = (S, p) => rnd(S) < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(S, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weighted(S, list) {                       // [[item, weight], ...]
  const tot = list.reduce((a, [, w]) => a + w, 0); let r = rnd(S) * tot;
  for (const [it, w] of list) { if ((r -= w) <= 0) return it; }
  return list[list.length - 1][0];
}

// ---------- 小工具 ----------
export const has = (st, t) => st.traits.includes(t);
export const voice = st => st.traits[0];
export const starById = (S, id) => S.stars.find(s => s.id === id);
export const team = S => S.stars.filter(s => !s.gone);
export const totalFans = S => team(S).reduce((a, s) => a + s.fans, 0);
export const freeDays = st => (st.sched || []).filter(v => !v.startsWith('job:')).length;
export const isFree = (st, op = null) => !st.gone && (!op || !st.trainee || ['short','live'].includes(op.type)) && freeDays(st) - (st.sickDays || []).filter(d=>!st.sched[d].startsWith('job:')).length >= (op?.days || 1) && (!op || !(st.jobs || []).includes(op.id));
export const opById = (S, id) => S.ops.find(o => o.id === id);
const nameOf = (S, id) => (starById(S, id) || {}).name || '';
const topicName = id => TOPICS.find(t => t.id === id).name;
const fmt = n => Math.round(n).toLocaleString('en-US');

const relKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export const rel = (S, a, b) => S.rel[relKey(a, b)] || 0;
export const isFriend = (S, a, b) => rel(S, a, b) >= 40;
export const isRival = (S, a, b) => rel(S, a, b) <= -30;
export function addRel(S, a, b, n) {
  if (a === b) return;
  const k = relKey(a, b), before = S.rel[k] || 0, after = clamp(before + n, -100, 100);
  S.rel[k] = after;
  if (after <= -30 && !S.everRival.includes(k)) S.everRival.push(k);
  // 曾經是對手、現在變成好朋友 → 惺惺相惜
  if (before < 40 && after >= 40 && S.everRival.includes(k) && !S.stats.rivalFriends.includes(k)) {
    S.stats.rivalFriends.push(k);
    const [x, y] = k.split('|');
    feed(S, null, '⚔️→🤝 ' + fill(pick(S, L.RIVAL_TO_FRIEND), { a: nameOf(S, x), b: nameOf(S, y) }), 'good');
  }
}
export const friendsOf = (S, st) => team(S).filter(o => o.id !== st.id && isFriend(S, st.id, o.id));
export const rivalsOf = (S, st) => team(S).filter(o => o.id !== st.id && isRival(S, st.id, o.id));

// ---------- 講話 ----------
export function fill(t, v = {}) { return t.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)); }
/** 從表裡挑一句:主性格的版本優先,有時用副性格,不然用通用 _ */
function pickLine(S, st, table) {
  const [a, b] = st.traits;
  if (table[a] && (!table[b] || chance(S, 0.75))) return pick(S, table[a]);
  if (table[b] && chance(S, 0.5)) return pick(S, table[b]);
  return pick(S, table._ || table[a] || table[b] || ['……']);
}
function withCatch(S, st, text, p = 0.35) {
  if (!text) return text;
  return chance(S, p) ? text.replace(/[。!?~…]*$/, m => m || '!') + ' ' + st.catch : text;
}
export function feed(S, id, text, kind = 'say', extra = {}) {
  S.seq = (S.seq || 0) + 1;
  S.feed.push({ n: S.seq, w: S.week, id, text, kind, ...extra });
  if (S.feed.length > 160) S.feed.splice(0, S.feed.length - 160);
}
function say(S, st, table, vars = {}, kind = 'say', extra = {}) {
  // 夢想家的「夢想成真/夢想沒了」只在跟夢想的媒體有關時才講
  const op = extra.op && opById(S, extra.op);
  if (has(st, 'dream') && table.dream && (!op || op.type !== st.dream)) { table = { ...table }; delete table.dream; }
  const text = withCatch(S, st, fill(pickLine(S, st, table), { name: st.name, ...vars }));
  feed(S, st.id, text, kind, extra);
  return text;
}

// ---------- 明星 ----------
function makeStar(S) {
  const used = new Set(S.stars.map(s => s.name).concat(S.usedNames || []));
  const name = pick(S, D.NAMES.filter(n => !used.has(n))) || '新人' + S.nextId;
  (S.usedNames = S.usedNames || []).push(name);
  let look;
  for (let k = 0; k < 8; k++) {           // 盡量不要跟現在的人撞髮型+髮色
    look = randomLook(ri(S, 1, 2e9));
    if (!team(S).some(o => o.look.hair === look.hair && o.look.hairColor === look.hairColor)) break;
  }
  const t1 = pick(S, D.TRAIT_IDS), t2 = pick(S, D.TRAIT_IDS.filter(t => t !== t1));
  const skills = {};
  for (const k of D.SKILL_IDS) skills[k] = +(1 + rnd(S) * 1.6).toFixed(2);
  const spec = pick(S, D.SKILL_IDS);
  skills[spec] = +(skills[spec] + 2.4 + rnd(S) * 1.2).toFixed(2);
  const usedAcc = team(S).map(s => s.acc), usedGlow = team(S).map(s => s.glow);
  const career = drawCareer(S, {skills});
  return {
    career, careerStep:0, trainee:false, pot:1,
    id: 's' + S.nextId++, name, look,
    acc: pick(S, ACCESSORIES.filter(a => !usedAcc.includes(a)).concat(usedAcc.length >= ACCESSORIES.length ? ACCESSORIES : [])),
    glow: pick(S, D.GLOWS.filter(g => !usedGlow.includes(g)).concat(usedGlow.length >= D.GLOWS.length ? D.GLOWS : [])),
    emoji: pick(S, D.EMOJIS), catch: pick(S, D.CATCH),
    traits: [t1, t2], skills, spec,
    topic: pick(S, TOPICS).id, dream: pick(S, ['drama', 'concert', 'contest', 'short', 'podcast', 'voice', 'live', 'ad']),
    mood: 65, energy: 90, loyalty: 72, fans: ri(S, 60, 260),
    wish: null, wishIn: ri(S, 2, 5), lost: 0, sulk: 0, motivated: 0, jobs: [], sched: null, trust: 40, done: {},
    trained: {}, talked: 0, joined: S.week, stat: { ops: 0, S: 0, best: null, byType:{}, roles:[] },
  };
}
export const bestSkill = st => D.SKILL_IDS.reduce((a, k) => (st.skills[k] > st.skills[a] ? k : a), D.SKILL_IDS[0]);

// ---------- 開新局 ----------
export function newGame({ seed = (Date.now() % 2147483647) | 0, company = '星光 AI 娛樂', ng = 0, mentor = null, trophies = [] } = {}) {
  const S = {
    v: 3, staff:[], scouted:[], seed, rs: seed, week: 1, ng, company, lv: 1, floors: initialFloors(), money: 2500,
    stars: [], rel: {}, everRival: [], ops: [], nextId: 1, feed: [], seq: 0, trend: null, nextTrend: null,
    rivals: D.RIVALS.map(r => ({ ...r, fans: Math.round(r.fans * (1 + 0.6 * ng)), g: r.g * (1 + 0.12 * ng) })),
    goals: [], trophies: trophies.slice(), mentor, teamups: [], temp: [], flags: {}, event: null,
    audition: null, auditionIn: 3, report: null, ended: false, endingPending: null, domeTries: 0,
    stats: { ops: 0, byType: {}, left: 0, rivalFriends: [], S: 0, best: 'C', events: 0 },
  };
  for (let i = 0; i < 4; i++) S.stars.push(makeStar(S));
  // 開局的人際關係:隨機一對好朋友、一對對手,其他普通
  const ids = shuffle(S, S.stars.map(s => s.id));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) S.rel[relKey(ids[i], ids[j])] = ri(S, -12, 22);
  S.rel[relKey(ids[0], ids[1])] = ri(S, 45, 60);
  S.rel[relKey(ids[2], ids[3])] = ri(S, -50, -35); S.everRival.push(relKey(ids[2], ids[3]));
  if (chance(S, 0.5)) { S.rel[relKey(ids[1], ids[2])] = ri(S, 42, 55); }
  else { S.rel[relKey(ids[0], ids[3])] = ri(S, -45, -32); S.everRival.push(relKey(ids[0], ids[3])); }
  S.nextTrend = genTrend(S);
  feed(S, null, `🎉 ${S.company} 開張了!${ng ? `(第 ${ng + 1} 季)` : ''}旗下 4 位 AI 明星報到。`, 'sys');
  if (mentor) feed(S, null, `🧑‍🏫 前輩 ${mentor.name} 留下來當老師,大家練習效果 +15%。`, 'sys');
  beginWeek(S);
  return S;
}

// ---------- 趨勢 ----------
function availMedia(S) {
  return D.NORMAL_MEDIA.filter(k => MEDIA[k].lv <= S.lv).concat(S.temp.map(t => t.type));
}
function genTrend(S) {
  const pool = availMedia(S).filter(k => !(S.flags.cool && S.flags.cool.type === k));
  return { hot: pick(S, pool), topic: pick(S, TOPICS).id };
}
export const isHot = (S, op) => S.trend && op.type === S.trend.hot;
export const isTopic = (S, op) => S.trend && op.topic === S.trend.topic;
export const trendMult = (S, op) => (isHot(S, op) ? 1.5 : 1) * (isTopic(S, op) ? 1.2 : 1) * (S.flags.cool && S.flags.cool.type === op.type ? 0.6 : 1);

// ---------- 機會 ----------
const payScale = S => 1 + 0.5 * (S.lv - 1) + 0.2 * Math.log2(1 + totalFans(S) / 20000);
const fansScale = S => 1 + 0.35 * (S.lv - 1);
function makeOp(S, type, extra = {}) {
  const m = MEDIA[type], topic = extra.topic || (chance(S, 0.4) ? S.trend.topic : pick(S, TOPICS).id);
  const t = TOPICS.find(x => x.id === topic);
  let w = m.w;
  if (!w) { const k = pick(S, D.SKILL_IDS); w = { [k]: 1 }; }     // 選秀:這次比哪一項
  const ed = ['drama','voice','ad','game','live','podcast'].includes(type) ? 1 + 0.1 * Math.max(0, roomLv(S, 'studio') - 1) : 1;
  return {
    id: 'o' + S.nextId++, type, topic, title: fill(pick(S, D.TITLES[type]), { t: t.name }), w,
    slots: m.slots.map(role => ({ role, who: null })), days: m.days, weeks: m.weeks, left: m.weeks, log: {},
    pay: Math.round(m.pay * payScale(S) * ed * (0.85 + rnd(S) * 0.3) / 10) * 10,
    fans: Math.round(m.fans * fansScale(S) * ed * (0.85 + rnd(S) * 0.3) / 10) * 10, sw: m.sw || null,
    big: !!m.big, status: 'open', bids: [], yields: [], born: S.week, ...extra,
  };
}
export const mainSkill = op => Object.keys(op.w).reduce((a, k) => (op.w[k] > (op.w[a] || 0) ? k : a), Object.keys(op.w)[0]);
export const slotW = (op, slot) => (op.sw && op.sw[slot]) || op.w;
export const skillFit = (st, op, slot = 0) => Object.entries(slotW(op, slot)).reduce((a, [k, w]) => a + w * st.skills[k], 0);
/** 多角色的機會:看最適合的那個角色 */
const bestFit = (st, op) => Math.max(...op.slots.map((_, i) => skillFit(st, op, i)));
const hasLead = op => op.slots.some(s => D.LEAD_ROLES.includes(s.role));

function wishMatches(S, st, op) {
  const w = st.wish; if (!w) return false;
  if (w.type === 'career') return careerLikes(st,op.type);
  if (w.type === 'media') return op.type === w.media;
  if (w.type === 'lead') return hasLead(op);
  if (w.type === 'trend') return isHot(S, op) || isTopic(S, op);
  if (w.type === 'with') return op.slots.length > 1;
  return false;
}

/** 這位明星有多想要這個機會 → { v, reason } */
export function interest(S, st, op) {
  const fit = bestFit(st, op), f = {};
  let v = 20 + fit * 4.5 + (st.mood - 50) * 0.15;
  if (careerLikes(st,op.type)) { const bonus=st.career==='idol'?5:15; v+=bonus; f.career=bonus; }
  if (fit >= 5) f.skill = (fit - 4) * 4;
  const T = t => has(st, t);
  if (T('comp')) { v += op.big ? 12 : 6; if (op.big) f.big = 10; }
  if (T('shy')) v -= op.big ? 26 : 14;
  if (T('perf')) { if (bestSkill(st) === mainSkill(op)) { v += 14; f.skill = (f.skill || 0) + 8; } else v -= 12; }
  if (T('funny') && ['short', 'live', 'contest', 'duo', 'pet', 'holo'].includes(op.type)) v += 14;
  if (T('jeal')) { v += 5 * st.lost; if (st.lost) f.revenge = 5 * st.lost; }
  if (T('hot')) v += 10;
  if (T('chill')) v -= 12;
  if (T('curious') && (isHot(S, op) || isTopic(S, op) || MEDIA[op.type].temp)) { v += 16; f.trend = 16; }
  if (T('dream') && op.type === st.dream) { v += 35; f.dream = 35; }
  if (T('proud')) { if (op.big || hasLead(op)) { v += 14; f[hasLead(op) ? 'lead' : 'big'] = 14; } if (op.pay < 500) v -= 14; }
  if (T('solo')) v += op.slots.length > 1 && op.type !== 'drama' ? -22 : 5;
  if (!T('dream') && op.type === st.dream) { v += 10; f.dream = 10; }
  if (st.topic === op.topic) { v += 20; f.topic = 20; }
  if (isHot(S, op)) { v += 8; f.trend = (f.trend || 0) + 8; }
  if (wishMatches(S, st, op)) { v += 25; f.wish = 25; }
  if (st.lost && !T('jeal')) { v += 5 * Math.min(st.lost, 3); f.revenge = 5 * Math.min(st.lost, 3); }
  if (st.energy < 30) v -= 20;
  if (st.sulk) v -= 60;
  v += (rnd(S) - 0.5) * 18;
  let reason = 'generic', best = 7;
  for (const [k, x] of Object.entries(f)) if (x > best) { best = x; reason = k; }
  return { v, reason };
}

function computeBids(S, op) {
  const cands = team(S).filter(st => isFree(st, op)).map(st => ({ st, ...interest(S, st, op) })).filter(c => c.v > 55).sort((a, b) => b.v - a.v).slice(0, 4);
  // 對手也在搶 → 好勝、愛吃醋的加碼,理由變成「不能讓對手搶走」
  for (let i = 1; i < cands.length; i++) {
    const c = cands[i], r = cands.slice(0, i).find(p => isRival(S, p.st.id, c.st.id));
    if (r && (has(c.st, 'comp') || has(c.st, 'jeal') || chance(S, 0.5))) { c.reason = 'rival'; c.rival = r.st.name; c.v += 10; }
  }
  // 想跟好朋友一起(多人企劃)
  if (op.slots.length > 1) for (const c of cands) {
    const fr = cands.find(p => p !== c && isFriend(S, p.st.id, c.st.id));
    if (fr && chance(S, 0.6)) { c.reason = 'friend'; c.friend = fr.st.name; }
  }
  // 貼心的人:好朋友也在搶 → 讓出來
  op.yields = [];
  for (const c of cands.slice()) {
    if (!has(c.st, 'kind') || op.slots.length > 1) continue;
    const fr = cands.find(p => p !== c && isFriend(S, p.st.id, c.st.id));
    if (fr && chance(S, 0.65)) {
      cands.splice(cands.indexOf(c), 1);
      const text = withCatch(S, c.st, fill(pick(S, L.YIELD._), { friend: fr.st.name }));
      op.yields.push({ id: c.st.id, friend: fr.st.id, text });
      feed(S, c.st.id, text, 'yield', { op: op.id });
    }
  }
  op.bids = cands.map(c => {
    const st = c.st, m = MEDIA[op.type];
    const vars = { career:D.CAREERS[st.career].name, media: m.name, skill: D.SKILLS[mainSkill(op)].name, topic: TOPICS.find(t => t.id === op.topic).name, rival: c.rival, friend: c.friend, op: op.title };
    const open = pick(S, L.OPEN[voice(st)]);
    const reason = fill(pickLine(S, st, L.REASON[c.reason] || L.REASON.generic), vars);
    const end = /[!?。~…]$/.test(reason) ? '' : voice(st) === 'shy' ? '……' : voice(st) === 'chill' ? '~' : '!';
    let close = pick(S, L.CLOSE[voice(st)]);
    if (/…$/.test(reason + end) && /^…/.test(close)) close = close.replace(/^…+/, '');
    const text = withCatch(S, st, [open, reason + end, close].filter(Boolean).join(' '), 0.3);
    feed(S, st.id, text, 'bid', { op: op.id });
    return { id: st.id, v: Math.round(c.v), reason: c.reason, text };
  });
}

// ---------- 演出分數 ----------
/** 演出分數(0~100 左右)。noise=false 給畫面上的「預估評價」用 */
export function perf(S, st, op, slot = 0, noise = true, mates = null) {
  const others = (mates || op.slots.map(s => s.who)).filter(id => id && id !== st.id);
  const log = op.log?.[st.id], mood = log?.n ? log.m / log.n : st.mood, energy = log?.n ? log.e / log.n : st.energy;
  let v = 20 + skillFit(st, op, slot) * 7.4 + (mood - 55) * 0.2;
  if (energy < 25) v -= 14;
  const friendIn = others.some(id => isFriend(S, st.id, id)), rivalIn = others.some(id => isRival(S, st.id, id));
  if (has(st, 'shy') && op.big && !friendIn && mood < 75) v -= 12;
  if (has(st, 'perf') && st.trained[mainSkill(op)] >= S.week - 2) v += 7;
  if (has(st, 'hot')) v += 3;
  if (has(st, 'solo')) v += op.slots.length > 1 ? -6 : 5;
  if (has(st, 'funny') && ['short', 'live', 'duo'].includes(op.type)) v += 4;
  if (op.type === st.dream) v += has(st, 'dream') ? 10 : 4;
  if (has(st, 'proud') && op.slots[slot] && !D.LEAD_ROLES.includes(op.slots[slot].role) && op.slots.length > 1 && op.type !== 'duo') v -= 5;
  if (friendIn) v += 8;
  if (rivalIn) v += 5;
  if (st.topic === op.topic) v += 4;
  if (st.motivated) v += 3;
  if (S.mentor) v += 3;
  if (op.type === 'dome') v += Math.min(8, (team(S).length - 3) * 1.5) - 10;   // 超大場面比較難,但全公司在台下應援
  if (noise) v += (rnd(S) - 0.5) * 18;
  return v;
}
export const estimate = (S, st, op, slot = 0) => D.gradeOf(perf(S, st, op, slot, false, op.slots.map((s, i) => (i === slot ? st.id : s.who))));

// ---------- 每週開始 ----------
export function beginWeek(S) {
  scoutWeek(S);
  S.trend = S.nextTrend || genTrend(S);
  if (S.flags.cool && --S.flags.cool.weeks <= 0) delete S.flags.cool;
  S.temp = S.temp.filter(t => --t.weeks > 0 || (feed(S, null, `🌐 限時平台「${MEDIA[t.type].name}」結束了。`, 'sys'), false));
  S.nextTrend = genTrend(S);
  if (S.nextTrend.hot === S.trend.hot && chance(S, 0.6)) S.nextTrend = genTrend(S);
  S.flags.down = false; S.flags.rain = false; S.flags.power = false;

  // 新機會
  const types = availMedia(S), n = LEVELS[S.lv].ops + (roomLv(S, 'lobby') >= 3 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const t = weighted(S, types.map(k => [k, (k === S.trend.hot ? 2.6 : 1) * (MEDIA[k].temp ? 2 : 1) * (k === 'concert' ? 0.7 : 1)]));
    S.ops.push(makeOp(S, t));
  }
  // 自己組隊的企劃
  for (const tu of S.teamups.splice(0)) {
    const a = starById(S, tu.a), b = starById(S, tu.b);
    if (!a || !b || a.gone || b.gone) continue;
    const op = makeOp(S, 'duo', { self: true }); op.title = `${a.name}×${b.name} 自製企劃`; op.pay = Math.round(op.pay * 0.6);
    S.ops.push(op);
  }
  // 巨蛋
  if (S.goals.includes('dome') && !S.ended && !S.ops.some(o => o.type === 'dome') && !(S.domeWait > 0)) {
    const op = makeOp(S, 'dome'); op.title = '🏟 星光巨蛋演唱會'; op.fans = Math.round(MEDIA.dome.fans * (1 + 0.3 * S.ng)); op.pay = MEDIA.dome.pay;
    S.ops.push(op);
    feed(S, null, '🏟 星光巨蛋演唱會可以報名了!要 3 位明星一起,評價 A 以上就成功!', 'good');
  }
  if (S.domeWait > 0) S.domeWait--;

  for (const st of team(S)) {
    st.talkedThisWeek = false; st.done = {};
    if (!st.sched) autoArrange(S, st.id);
    else st.sched = st.sched.map(v => v.startsWith('job:') ? 'train:' + bestSkill(st) : v);
    st.jobs = [];
    if (st.cold) { st.sched[0] = st.sched[1] = 'rest'; st.cold = false; st.sickDays = [0,1]; say(S, st, L.TIRED, {}, 'sad'); }
    else st.sickDays = [];
    for (const op of S.ops) if (op.slots.some(s => s.who === st.id)) { st.jobs.push(op.id); scheduleJob(st, op); }

    if (st.motivated) st.motivated--;
    if (!st.wish && --st.wishIn <= 0) newWish(S, st);
  }
  for (const op of S.ops) if (op.status === 'open' && (op.born === S.week || op.type === 'dome')) computeBids(S, op);
  chatter(S);
  // 事件
  S.event = null;
  const leaver = team(S).filter(s => (s.loyalty < 25 || s.evalDoubt) && !s.promise).sort((a, b) => a.loyalty - b.loyalty)[0];
  if (leaver && team(S).length > 2) { S.event = leaveEvent(S, leaver); delete leaver.evalDoubt; }
  else if (S.week > 1 && chance(S, 0.5)) S.event = randomEvent(S);
  if (S.event) feed(S, null, `📣 ${S.event.title}`, 'event');
  // 試鏡
  if (--S.auditionIn <= 0) {
    S.auditionIn = 6;
    if (debuted(S).length < LEVELS[S.lv].max) openAudition(S);
  }
}

function chatter(S) {
  const t = team(S); if (t.length < 2) return;
  const lines = ri(S, 1, 2);
  for (let i = 0; i < lines; i++) {
    const a = pick(S, t), fr = friendsOf(S, a), rv = rivalsOf(S, a);
    if (fr.length && chance(S, 0.45)) feed(S, a.id, fill(pick(S, L.CHAT_FRIEND), { a: a.name, b: pick(S, fr).name }), 'chat');
    else if (rv.length && chance(S, 0.5)) feed(S, a.id, fill(pick(S, L.CHAT_RIVAL), { a: a.name, b: pick(S, rv).name }), 'chat');
    else say(S, a, L.CHAT_SELF, {}, 'chat');
  }
}

// ---------- 心願 ----------
function newWish(S, st) {
  const fr = friendsOf(S, st);
  const opts = [['career',2], ['media', 3], ['train', 2], ['rest', st.energy < 60 ? 3 : 1], ['outfit', 1.5], ['meet', st.fans > 800 ? 1.5 : 0.3], ['trend', 1.5]];
  if (fr.length) opts.push(['with', 2]);
  if (has(st, 'proud') || has(st, 'comp') || has(st, 'dream')) opts.push(['lead', 2.5]);
  const type = weighted(S, opts), w = { type, left: 6 };
  if (type === 'media') w.media = has(st, 'dream') && chance(S, 0.6) && MEDIA[st.dream].lv <= S.lv ? st.dream : pick(S, availMedia(S));
  if (type === 'train') w.skill = pick(S, D.SKILL_IDS);
  if (type === 'with') w.friend = pick(S, fr).id;
  st.wish = w;
  say(S, st, { _: L.WISH[type] }, { career:D.CAREERS[st.career].name, media: w.media && MEDIA[w.media].name, skill: w.skill && D.SKILLS[w.skill].name, friend: w.friend && nameOf(S, w.friend) }, 'wish');
}
export function wishText(S, st) {
  const w = st.wish; if (!w) return '';
  switch (w.type) {
    case 'career': return `想往${D.CAREERS[st.career].name}的目標前進`;
    case 'media': return `想接${MEDIA[w.media].icon}${MEDIA[w.media].name}`;
    case 'with': return `想跟${nameOf(S, w.friend)}一起工作`;
    case 'train': return `想練${D.SKILLS[w.skill].icon}${D.SKILLS[w.skill].name}`;
    default: return { lead: '想當主角/主唱', rest: '想休息一週', outfit: '想要新造型', trend: '想上熱門話題的案子', meet: '想辦粉絲見面會' }[w.type];
  }
}
function wishDone(S, st) {
  if (!st.wish) return;
  st.mood = clamp(st.mood + 18, 0, 100); st.loyalty = clamp(st.loyalty + 14, 0, 100);
  if (st.promise) delete st.promise;
  st.wish = null; st.wishIn = ri(S, 2, 4);
  say(S, st, L.WISH_DONE, {}, 'good');
}

// ---------- 玩家操作:指派 ----------
/** 把明星排進某個機會的某個角色。回傳 null 或錯誤訊息 */
export function assign(S, opId, slotIdx, starId) {
  const op = opById(S, opId), st = starById(S, starId);
  if (!op || op.status !== 'open') return '這個機會已經開始了';
  if (!st || st.gone) return '找不到這位明星';
  if(st.jobs.includes(op.id)) return '已經參加這個機會了';
  if(!isFree(st,op)) return `${st.name}這週排不下，要留 ${op.days} 天空檔`;
  const slot = op.slots[slotIdx];
  if (!slot || slot.who) return '這個角色已經有人了';
  slot.who = st.id; st.jobs.push(op.id); scheduleJob(st, op);
  const bid = op.bids.find(b => b.id === st.id);
  const isLead = slotIdx === 0 && op.slots.length > 1 && D.LEAD_ROLES.includes(slot.role);
  if (bid && !(has(st, 'proud') && hasLead(op) && !isLead)) {
    say(S, st, L.WIN, {}, 'win', { op: op.id });
    st.mood = clamp(st.mood + 8, 0, 100); st.loyalty = clamp(st.loyalty + 2, 0, 100); st.lost = 0;
  } else if (op.slots.length > 1 && slotIdx > 0 && op.type !== 'duo') {
    say(S, st, L.SUPPORT_ROLE, {}, 'say', { op: op.id });
    if (has(st, 'proud')) st.mood = clamp(st.mood - 6, 0, 100);
  } else {
    const iv = interest(S, st, op).v;
    if (iv < 35) { say(S, st, L.ASSIGN_UNWANTED, {}, 'say', { op: op.id }); st.mood = clamp(st.mood - (has(st, 'proud') || has(st, 'solo') ? 6 : 3), 0, 100); }
    else say(S, st, L.WIN, {}, 'win', { op: op.id });
  }
  if (wishMatches(S, st, op) && st.wish.type !== 'with') wishDone(S, st);
  if (op.slots.every(s => s.who)) lockOp(S, op);
  return null;
}
/** 角色排好了 → 開工,沒選上的人當場反應 */
function lockOp(S, op) {
  op.status = 'run'; op.left = op.weeks;
  const ids = op.slots.map(s => s.who).filter(Boolean), winner = starById(S, ids[0]);
  for (const b of op.bids) {
    const st = starById(S, b.id);
    if (!st || st.gone || ids.includes(st.id)) continue;
    loseReaction(S, st, op, winner);
  }
  for (const y of op.yields) { const st = starById(S, y.id); if (st && ids.includes(y.friend)) { addRel(S, st.id, y.friend, 6); st.loyalty = clamp(st.loyalty + 2, 0, 100); } }
  // 同場的兩人:想跟對方一起的心願
  for (const id of ids) { const st = starById(S, id); if (st.wish && st.wish.type === 'with' && ids.includes(st.wish.friend)) wishDone(S, st); }
  if (op.type === 'dome') S.domeTries++;
}
function loseReaction(S, st, op, winner) {
  st.lost++;
  const T = t => has(st, t), w = winner ? winner.name : '別人';
  say(S, st, L.LOSE, { winner: w }, 'lose', { op: op.id });
  let mood = -2, loyal = -2;
  if (T('comp')) { st.motivated = 2; if (winner) addRel(S, st.id, winner.id, -6); mood -= 2; }
  if (T('shy')) mood -= 1;
  if (T('perf')) { mood -= 4; if (!st.wish) { st.wish = { type: 'train', skill: mainSkill(op), left: 5 }; } }
  if (T('funny')) { mood += 1; if (chance(S, 0.3)) { st.fans += 80; feed(S, st.id, `😂 ${st.name} 把「沒選上」拍成搞笑影片,粉絲 +80`, 'good'); } }
  if (T('jeal')) { mood -= 10; if (winner) addRel(S, st.id, winner.id, -8); if (st.lost >= 3) { st.sulk = 1; say(S, st, L.SULK, {}, 'sulk'); } }
  if (T('hot')) { for(let d=0;d<7;d++) if(st.sched[d].startsWith('train:')) setDay(S,st.id,d,'train:'+mainSkill(op)); st.motivated = Math.max(st.motivated, 1); }
  if (T('chill')) { mood += 1; loyal += 1; }
  if (T('curious') && chance(S, 0.4)) {
    const mate = shuffle(S, team(S).filter(o => o.id !== st.id && !isRival(S, o.id, st.id)))[0];
    if (mate && !S.teamups.length) { S.teamups.push({ a: st.id, b: mate.id }); feed(S, st.id, fill(pick(S, L.TEAMUP), { a: st.name, b: mate.name }), 'idea'); }
  }
  if (T('dream') && op.type === st.dream) { mood -= 16; loyal -= 8; }
  if (T('kind') && winner) { mood += 1; addRel(S, st.id, winner.id, 5); }
  if (T('proud')) { mood -= 8; loyal -= 4; }
  if (T('solo')) { mood -= 1; loyal -= 1; }
  if (winner && !T('kind') && isFriend(S, st.id, winner.id)) addRel(S, st.id, winner.id, -2);
  st.mood = clamp(st.mood + mood, 0, 100); st.loyalty = clamp(st.loyalty + loyal, 0, 100);
}

export const DAY_NAMES = ['一','二','三','四','五','六','日'];
export const ACT_NAMES = { rest:'🛏 休息', off:'🎉 放假', live:'🔴 直播', 'train:sing':'🎤 練唱', 'train:dance':'💃 練舞', 'train:act':'🎭 練演技', 'train:talk':'🎙 練口才', 'train:charm':'💄 練魅力' };
export const PLAN_NAMES = ACT_NAMES;
const initialFloors = () => ['lobby','studio','dance','cafe','dorm'].map(type => ({type,lv:1}));
export const roomLv = (S, type) => Math.max(0, ...S.floors.filter(f => f.type === type).map(f => f.lv));
function scheduleJob(st, op) {
  let n = op.days;
  for (const d of [0,1,2,3,4,5,6]) if (n && !st.sched[d].startsWith('job:') && !st.sickDays?.includes(d)) { st.sched[d] = 'job:' + op.id; n--; }
}
export function setDay(S, id, d, value) {
  const st = starById(S,id);
  if (!st || st.gone || !Number.isInteger(d) || d < 0 || d > 6) return '找不到這天行程';
  if (st.sched[d].startsWith('job:')) return '這天要工作';
  if (st.sickDays?.includes(d)) return '感冒了，這天要休息';
  if (!ACT_NAMES[value]) return '不能排這種行程';
  st.sched[d] = value; return null;
}
// 保留舊呼叫介面，事件與外部自動玩家也能使用。
export function setPlan(S,id,value) {
  const st = starById(S,id); if (!st || !ACT_NAMES[value]) return '行程不正確';
  for (let d=0; d<7; d++) if (!st.sched[d].startsWith('job:')) setDay(S,id,d,value);
  return null;
}
export function autoArrange(S,id) {
  const st = starById(S,id); if (!st || st.gone) return;
  st.sched ||= Array(7).fill('rest');
  const ks = D.SKILL_IDS.slice().sort((a,b)=>st.skills[b]-st.skills[a]);
  const free = [6,0,1,2,3,4,5].filter(d=>!st.sched[d].startsWith('job:'));
  let n=0;
  for (const d of free) st.sched[d] = 'train:' + (st.wish?.type === 'train' ? st.wish.skill : (st.trainee ? ks[n++ % 3] : D.CAREERS[st.career]?.skill || ks[n++ % 2]));
  if (free.length) st.sched[free[0]] = st.wish?.type === 'rest' ? 'off' : 'rest';
  if (st.energy < 40) for (const d of free.filter(d=>d!==6).slice(0,2)) st.sched[d]='rest';
  for (const d of st.sickDays || []) if (!st.sched[d].startsWith('job:')) st.sched[d]='rest';
}
export function autoArrangeAll(S) { for (const st of team(S)) autoArrange(S,st.id); }
export function floorFor(S, value, op = null) {
  if (value === 'off') return -1;
  let type = value === 'rest' ? 'dorm' : value === 'live' ? 'studio' : value.startsWith('train:') ? value.slice(6) : 'studio';
  if (value.startsWith('job:')) {
    op ||= opById(S,value.slice(4));
    if (['concert','contest','dome'].includes(op?.type)) return -1;
    if (['short','duo','holo'].includes(op?.type)) type='dance';
  }
  if(type==='charm' || op?.type==='fashion') type='style';
  let i = S.floors.findIndex(f=>f.type===type);
  return i < 0 ? Math.max(0,S.floors.findIndex(f=>f.type==='studio')) : i;
}
export function floorCost(S,type) { const f=D.FLOORS[type]; return f?.build ? Math.round(f.build*(1+0.25*(S.floors.length-5))/10)*10 : 0; }
export function upgradeCost(S,i) { const f=S.floors[i]; return f ? D.FLOORS[f.type].cost[f.lv-1] || 0 : 0; }
export function buildFloor(S,type) {
  if (!D.FLOORS[type]?.build) return '不能加蓋這種樓層';
  if (S.floors.length >= LEVELS[S.lv].floors) return '公司要升級才能再往上蓋';
  const cost=floorCost(S,type); if (S.money<cost) return `要 $${fmt(cost)}`;
  S.money-=cost; S.floors.push({type,lv:1}); feed(S,null,`🏗 蓋好了${D.FLOORS[type].name}！`,'good'); return null;
}
export function upgradeFloor(S,i) {
  const f=S.floors[i]; if (!f) return '找不到樓層'; if (f.lv>=3) return '已經最高級';
  const cost=upgradeCost(S,i); if (S.money<cost) return `要 $${fmt(cost)}`;
  S.money-=cost; f.lv++; feed(S,null,`${D.FLOORS[f.type].icon} ${i+1}F 升到 Lv${f.lv}！`,'good'); return null;
}
export function migrate(S) {
  if(S.v===3) return S;
  if(S.v===2) {
    S.staff=[]; S.scouted=[];
    for(const st of [...S.stars,...(S.audition||[])]) {
      st.skills.charm=+(1+rnd(S)*1.4).toFixed(2); st.career=drawCareer(S,st); st.careerStep=0; st.trainee=false; st.pot=1;
      st.stat.byType={}; st.stat.roles=[];
    }
    S.v=3; return S;
  }
  if(S.v!==1) return S;
  const fac=S.fac || {}; S.floors=initialFloors();
  if(S.lv>=2) S.floors.push({type:'sing',lv:1});
  if(S.lv>=3) S.floors.push({type:'act',lv:1},{type:'talk',lv:1});
  for(const f of S.floors) if(D.SKILL_IDS.includes(f.type)) f.lv=clamp(fac.gym||1,1,3);
  if(fac.lounge) S.floors.push({type:'lounge',lv:clamp(fac.lounge,1,3)});
  S.floors[1].lv=Math.min(3,1+(fac.edit||0)); delete S.fac;
  for(const op of S.ops) { op.days=MEDIA[op.type].days; op.weeks=MEDIA[op.type].weeks; op.left=Math.min(op.left,op.weeks); op.log={}; }
  for(const st of [...S.stars,...(S.audition||[])]) {
    st.jobs=st.job?[st.job]:[]; st.trust=40; st.done={};
    st.sched=null; st.sickDays=[];
    autoArrange(S,st.id);                              // 沒工作的人照專長排練習、週日休息
    if(st.job) { const op=opById(S,st.job); if(op) scheduleJob(st,op); }
    delete st.job; delete st.plan;
  }
  S.v=2; return migrate(S);
}

// ---------- 購買 ----------
export function canUpgrade(S) {
  const nx = LEVELS[S.lv + 1]; if (!nx) return '已經是最高級了';
  if (totalFans(S) < nx.fans) return `粉絲要 ${fmt(nx.fans)}`;
  if (S.money < nx.cost) return `要 $${fmt(nx.cost)}`;
  return null;
}
export function upgradeCompany(S) {
  const why = canUpgrade(S); if (why) return why;
  S.money -= LEVELS[S.lv + 1].cost; S.lv++;
  feed(S, null, `🏢 公司升級成 Lv${S.lv}「${LEVELS[S.lv].name}」!明星名額 ${LEVELS[S.lv].max} 位、每週 ${LEVELS[S.lv].ops} 個機會。`, 'good');
  for (const st of team(S)) st.mood = clamp(st.mood + 8, 0, 100);
  checkGoals(S);
  return null;
}
export function buyOutfit(S, id) {
  const st = starById(S, id);
  if (S.money < D.OUTFIT_COST) return `要 $${D.OUTFIT_COST}`;
  S.money -= D.OUTFIT_COST;
  st.look = { ...st.look, cloth: pick(S, CLOTH_COLORS.filter(c => c !== st.look.cloth)) };
  st.mood = clamp(st.mood + 8, 0, 100);
  feed(S, st.id, `👗 ${st.name} 換上新造型!`, 'good');
  if (st.wish && st.wish.type === 'outfit') wishDone(S, st);
  return null;
}
export function meetFans(S, id) {
  const st = starById(S, id);
  if (S.money < D.MEET_COST) return `要 $${D.MEET_COST}`;
  if (st.energy < 20) return `${st.name}太累了`;
  S.money -= D.MEET_COST;
  const g = Math.round(250 + st.fans * 0.06);
  st.fans += g; st.energy = clamp(st.energy - 10, 0, 100); st.mood = clamp(st.mood + 10, 0, 100);
  feed(S, st.id, `🎪 ${st.name} 的粉絲見面會,粉絲 +${fmt(g)}`, 'good');
  if (st.wish && st.wish.type === 'meet') wishDone(S, st);
  return null;
}
export function talk(S, id) {
  const st = starById(S, id);
  if (st.talkedThisWeek) return '這週已經談過了';
  if (S.money < D.TALK_COST) return `要 $${D.TALK_COST}(請喝飲料)`;
  S.money -= D.TALK_COST; st.talkedThisWeek = true; st.done.talk = true;
  st.mood = clamp(st.mood + 12, 0, 100); st.loyalty = clamp(st.loyalty + 7, 0, 100);
  if (st.sulk) { st.sulk = 0; st.lost = 0; }
  say(S, st, L.COMFORT, {}, 'good');
  return null;
}
export function interact(S,id,kind) {
  const st=starById(S,id); if(!st || st.gone) return '找不到這位明星';
  if(!['chat','snack','cheer','talk'].includes(kind)) return '沒有這種互動';
  if(st.done[kind]) return '這週已經做過了';
  if(kind==='talk') return talk(S,id);
  if(kind==='snack' && S.money<60) return '點心要 $60';
  st.done[kind]=true;
  if(kind==='chat') { st.mood=clamp(st.mood+4,0,100); st.trust=clamp(st.trust+3,0,100); return say(S,st,L.CHAT_BOSS,{friend:friendsOf(S,st)[0]?.name||'大家',rival:rivalsOf(S,st)[0]?.name||'其他夥伴',career:D.CAREERS[st.career].name,wish:wishText(S,st)||'找到新目標'},'chat'); }
  if(kind==='snack') { S.money-=60; st.energy=clamp(st.energy+10,0,100); }
  if(kind==='cheer') { st.mood=clamp(st.mood+6,0,100); st.trust=clamp(st.trust+2,0,100); }
  feed(S,id,kind==='snack'?'🍪 謝謝點心！充滿活力了！':'👏 謝謝鼓勵，我會加油！','good'); return null;
}
function openAudition(S) {
  const c = [makeStar(S), makeStar(S), makeStar(S)];
  for (const st of c) st.intro = withCatch(S, st, fill(pickLine(S, st, L.INTRO), { name: st.name, media: MEDIA[st.dream].name }), 0.5);
  S.audition = c;
  feed(S, null, '🎙 試鏡會開始了!有 3 位新人想加入(在「公司」頁)。', 'event');
}
export function sign(S, i) {
  const st = S.audition && S.audition[i];
  if (!st) return '沒有試鏡';
  if (debuted(S).length >= LEVELS[S.lv].max) return `公司最多 ${LEVELS[S.lv].max} 位,要先升級`;
  const cost = D.auditionCost(debuted(S).length);
  if (S.money < cost) return `簽約金要 $${fmt(cost)}`;
  S.money -= cost; delete st.intro; st.joined = S.week;
  for (const o of team(S)) S.rel[relKey(o.id, st.id)] = ri(S, -10, 20);
  S.stars.push(st); autoArrange(S, st.id); S.audition = null;
  feed(S, st.id, `🎉 ${st.name} 加入公司!`, 'good');
  return null;
}
export function skipAudition(S) { S.audition = null; }
export function auditionNow(S) {
  if (S.audition) return null;
  if (debuted(S).length >= LEVELS[S.lv].max) return `公司最多 ${LEVELS[S.lv].max} 位,要先升級`;
  if (S.auditionIn > 0) return `還要 ${S.auditionIn} 週才能再辦試鏡`;
  openAudition(S); S.auditionIn = 6; return null;
}

// ---------- 事件 ----------
function leaveEvent(S, st) {
  return {
    id: 'leave', star: st.id, title: st.evalDoubt?`${st.name} 想找老闆聊聊`:`${st.name} 收到別家公司的邀請`, text: st.evalDoubt?'我是不是不適合……我想聽聽你的建議，再一起想想下一步。':withCatch(S, st, fill(pickLine(S, st, L.LEAVE), {})),
    choices: [
      { label: `☕ 好好談心($${D.TALK_COST * 2})`, cost: D.TALK_COST * 2 },
      { label: st.wish ? `🤞 答應他的心願:${wishText(S, st)}(4 週內)` : '🤞 答應下次給他好機會(4 週內)' },
      { label: '👋 祝福他離開' },
    ],
  };
}
// 每個事件:when 回傳要用的明星(或 true),text/choices 用那位明星
const EVENTS = [
  { id: 'fake', w: 1.2, when: S => pick(S, team(S)), title: st => `有人用 AI 做了假影片冒充 ${st.name}!`,
    text: st => `網路上出現一支「${st.name}」的影片,可是那根本不是${st.name},是別人用 AI 做出來的。粉絲都搞混了!`,
    choices: st => [
      { label: '📢 發聲明澄清($500)', cost: 500, go: S => { st.fans += 150; st.mood += 8; return `大家知道那是假的了!${st.name}的粉絲反而 +150。小知識:AI 做的影片要標示「AI 生成」。`; } },
      { label: '🙋 請粉絲一起檢舉', go: S => { st.mood -= 5; st.fans = Math.round(st.fans * 0.97); return '粉絲幫忙檢舉,假影片被下架了,不過還是有人搞混。'; } },
      { label: '🤐 不理它', go: S => { st.fans = Math.round(st.fans * 0.85); st.mood -= 12; st.loyalty -= 6; return `假影片越傳越廣,${st.name}的粉絲掉了 15%,心情很差……`; } },
    ] },
  { id: 'bday', w: 1, when: S => pick(S, team(S)), title: st => `今天是 ${st.name} 的生日!`, text: st => `${st.emoji} ${st.name}偷偷看了好幾次日曆……`,
    choices: st => [
      { label: '🎂 辦慶生會($400)', cost: 400, go: S => { for (const o of team(S)) { o.mood += 8; addRel(S, o.id, st.id, 5); } st.mood += 15; st.loyalty += 8; return '大家一起唱生日快樂歌!全員心情變好,感情也更好了。'; } },
      { label: '🎁 送小禮物($100)', cost: 100, go: S => { st.mood += 10; st.loyalty += 3; return `${st.name}收到禮物很開心!`; } },
      { label: '💌 寫張卡片', go: S => { st.mood += 4; return `${st.name}把卡片貼在鏡子上。`; } },
    ] },
  { id: 'letter', w: 1, when: S => pick(S, team(S)), title: st => `${st.name} 收到一大箱粉絲手寫信`, text: st => '「你的影片讓我每天都很開心!」',
    choices: st => [{ label: '💌 太好了!', go: S => { st.mood += 15; st.loyalty += 4; return `${st.name}一封一封讀完,超級開心!`; } }] },
  { id: 'viral', w: 1, when: S => pick(S, team(S)), title: st => `${st.name} 的舊影片突然爆紅!`, text: st => '大家都在轉發,點閱一直衝!',
    choices: st => [
      { label: '🔴 趁勝追擊開直播', go: S => { const g = Math.round(400 + st.fans * 0.25); st.fans += g; st.energy -= 20; return `直播超多人看!粉絲 +${fmt(g)},不過有點累。`; } },
      { label: '😌 讓他好好享受', go: S => { const g = Math.round(200 + st.fans * 0.12); st.fans += g; st.mood += 10; return `粉絲 +${fmt(g)},${st.name}心情很好。`; } },
    ] },
  { id: 'cold', w: 0.8, when: S => pick(S, team(S).filter(s => !(s.jobs || []).length)), title: st => `${st.name} 感冒了`, text: st => '一直打噴嚏,聲音也啞了……',
    choices: st => [
      { label: '🏥 帶去看醫生($200)', cost: 200, go: S => { st.energy = Math.max(st.energy, 60); setPlan(S, st.id, 'rest'); return `看完醫生好多了,這週先休息。`; } },
      { label: '🛌 在家休息', go: S => { st.energy = Math.min(st.energy, 30); setPlan(S, st.id, 'rest'); st.mood -= 4; return `${st.name}在家休息,體力恢復得比較慢。`; } },
    ] },
  { id: 'down', w: 0.7, when: S => true, title: () => '直播島伺服器當機!', text: () => '這週直播和 Podcast 都沒辦法播。',
    choices: () => [{ label: '😮 好吧', go: S => { S.flags.down = true; return '這週直播、Podcast 收入是 0,自己直播也不行。'; } }] },
  { id: 'idea', w: 1.1, when: S => { const t = shuffle(S, team(S)); return t.length >= 2 ? [t[0], t[1]] : null; },
    title: ([a, b]) => `${a.name} 跟 ${b.name} 的點子不一樣`, text: ([a, b]) => `${a.name}想拍${topicName(a.topic)}主題,${b.name}想拍${topicName(b.topic === a.topic ? TOPICS[(TOPICS.findIndex(t => t.id === a.topic) + 5) % TOPICS.length].id : b.topic)}主題,兩個人都覺得自己的比較好。`,
    choices: ([a, b]) => [
      { label: `👉 用 ${a.name} 的`, go: S => { a.mood += 10; if (has(b, 'jeal') || has(b, 'proud')) { b.mood -= 10; addRel(S, a.id, b.id, -6); return `${a.name}好開心,${b.name}有點不服氣。`; } b.mood -= 3; return `${a.name}好開心,${b.name}說「下次用我的!」`; } },
      { label: `👉 用 ${b.name} 的`, go: S => { b.mood += 10; if (has(a, 'jeal') || has(a, 'proud')) { a.mood -= 10; addRel(S, a.id, b.id, -6); return `${b.name}好開心,${a.name}有點不服氣。`; } a.mood -= 3; return `${b.name}好開心,${a.name}說「下次用我的!」`; } },
      { label: '🤝 兩個合起來拍($600)', cost: 600, go: S => { a.mood += 5; b.mood += 5; addRel(S, a.id, b.id, 12); a.fans += 200; b.fans += 200; return '兩個點子合在一起,意外地超好看!兩人感情變好了。'; } },
    ] },
  { id: 'platform', w: 0.9, when: S => (S.temp.length ? null : true), title: () => '新平台上線了!', text: () => '聽說有一個全新的平台,好奇的明星已經坐不住了。',
    choices: () => [{ label: '🌐 看看是什麼', go: S => { const t = pick(S, ['holo', 'pet']); S.temp.push({ type: t, weeks: 5 }); return `「${MEDIA[t].icon} ${MEDIA[t].name}」上線 5 週!新的機會會出現在機會板上。`; } }] },
  { id: 'algo', w: 0.8, when: S => true, title: () => '演算法大改版!', text: (_, S) => `${MEDIA[S.trend.hot].name}突然不紅了,接下來兩週效果打折。`,
    choices: () => [{ label: '📉 知道了', go: S => { S.flags.cool = { type: S.trend.hot, weeks: 2 }; S.trend.hot = pick(S, availMedia(S).filter(k => k !== S.flags.cool.type)); return `改成推 ${MEDIA[S.trend.hot].icon}${MEDIA[S.trend.hot].name}!`; } }] },
  { id: 'teacher', w: 1, when: S => true, title: () => 'AI 老師來上課', text: () => '有一位很會教的 AI 老師,可以幫全公司上一堂課。要上哪一科?',
    choices: () => D.SKILL_IDS.slice(0, 3).map(k => ({ label: `${D.SKILLS[k].icon} ${D.SKILLS[k].name}課($600)`, cost: 600, go: S => { for (const o of team(S)) o.skills[k] = Math.min(10, o.skills[k] + 0.4); return `全員${D.SKILLS[k].name} +0.4!`; } })).concat([{ label: '不用了', go: () => '這次先不上課。' }]) },
  { id: 'charity', w: 0.8, when: S => pick(S, team(S).filter(s => !(s.jobs || []).length)), title: st => '公益活動邀請', text: st => `動物之家想請 ${st.name} 幫忙拍影片,讓更多人來認養小貓小狗。沒有酬勞喔。`,
    choices: st => [
      { label: '🐶 答應', go: S => { st.fans += 300; st.mood += 10; st.loyalty += 5; st.energy -= 10; return `影片幫好多小動物找到家!${st.name}粉絲 +300,心情超好。`; } },
      { label: '這週太忙了', go: () => '下次有機會再幫忙。' },
    ] },
  { id: 'tired', w: 1, when: S => team(S).filter(s => s.energy < 45).sort((a, b) => a.energy - b.energy)[0], title: st => `${st.name} 太累了,想放假`, text: st => withCatch(S0, st, pick(S0, L.TIRED._)),
    choices: st => [
      { label: '🏖 放假一週', go: S => { if (!st.jobs.length) setPlan(S, st.id, 'rest'); st.energy += 25; st.mood += 15; st.loyalty += 5; return `${st.name}好好休息,充飽電了。`; } },
      { label: '💪 再撐一下', go: S => { st.mood -= 10; st.loyalty -= 6; return `${st.name}嘆了一口氣……`; } },
    ] },
  { id: 'snack', w: 0.8, when: S => true, title: () => '粉絲送來一大盒點心!', text: () => '是手作的餅乾,上面畫著每個人的臉。',
    choices: () => [{ label: '🍪 大家一起吃', go: S => { for (const o of team(S)) o.mood += 6; return '全員心情 +6!'; } }] },
  { id: 'battle', w: 1, when: S => { for (const a of team(S)) { const r = rivalsOf(S, a)[0]; if (r) return [a, r]; } return null; },
    title: ([a, b]) => `${a.name} 和 ${b.name} 想比一場舞`, text: ([a, b]) => `兩個人互看不順眼,說要比一場舞決勝負!`,
    choices: ([a, b]) => [
      { label: '🕺 辦一場友誼賽', go: S => { a.skills.dance = Math.min(10, a.skills.dance + 0.3); b.skills.dance = Math.min(10, b.skills.dance + 0.3); const w = a.skills.dance >= b.skills.dance ? a : b; addRel(S, a.id, b.id, 15); w.fans += 200; return `${w.name}贏了!比完兩個人握手,說「你也很強」。關係變好了,舞蹈都 +0.3。`; } },
      { label: '🙅 叫他們專心工作', go: S => { a.mood -= 4; b.mood -= 4; return '兩個人不情願地回去工作了。'; } },
    ] },
  { id: 'copy', w: 0.8, when: S => pick(S, team(S)), title: st => `別家公司抄了 ${st.name} 的舞`, text: st => `${S0.rivals[0].name}的新影片,動作跟 ${st.name} 上次的舞一模一樣!`,
    choices: st => [
      { label: '💃 拍一支更厲害的新版本', go: S => { st.energy -= 12; st.fans += 400; st.skills.dance = Math.min(10, st.skills.dance + 0.2); return `新版本更好看!${st.name}粉絲 +400。`; } },
      { label: '😄 一笑置之', go: S => { const f = team(S).find(o => has(o, 'funny')); if (f) { f.fans += 300; return `${f.name}拍了一支「原版 vs 抄襲版」搞笑對比,大家笑翻,粉絲 +300!`; } st.mood -= 4; return `${st.name}有點不開心。`; } },
    ] },
  { id: 'sponsor', w: 0.8, when: S => true, title: () => '贊助商要送東西', text: () => '一家器材公司想贊助你們,可以選一個:',
    choices: () => [
      { label: '💰 現金 $1,000', go: S => { S.money += 1000; return '收到 $1,000!'; } },
      { label: '🏋 新的練習器材', go: S => { for (const o of team(S)) { const k = bestSkill(o); o.skills[k] = Math.min(10, o.skills[k] + 0.15); } return '全員最強的技能 +0.15!'; } },
    ] },
  { id: 'rain', w: 0.7, when: S => true, title: () => '下雨天,外景取消', text: () => '這週一直下雨,大家都待在室內。',
    choices: () => [{ label: '☔ 那就錄 Podcast!', go: S => { S.flags.rain = true; return '這週 Podcast 和配音的粉絲 ×1.5!'; } }] },
  { id: 'retouch', w: 0.8, when: S => pick(S, team(S)), title: st => `AI 修圖修太多了`, text: st => `${st.name}的新照片被 AI 修得太誇張,粉絲說「這不是${st.name}吧?」`,
    choices: st => [
      { label: '📸 發一張沒修過的照片', go: S => { st.fans += 200; st.mood += 5; return `粉絲說「真的${st.name}比較可愛!」粉絲 +200。`; } },
      { label: '🔁 重拍一組($300)', cost: 300, go: S => { st.mood += 2; return '重拍的照片很自然。'; } },
    ] },
  { id: 'robot', w: 0.6, when: S => true, title: () => '公司的機器人助手當機了', text: () => '它一直重複說「早安早安早安早安」……',
    choices: () => [
      { label: '🔧 修好它($200)', cost: 200, go: () => '機器人恢復正常了。' },
      { label: '🎥 拍成影片', go: S => { const f = team(S).find(o => has(o, 'funny')) || pick(S, team(S)); f.fans += 250; f.mood += 6; return `${f.name}跟機器人一起「早安早安」,影片爆紅,粉絲 +250!`; } },
    ] },
  { id: 'school', w: 0.8, when: S => pick(S, team(S).filter(s => !(s.jobs || []).length)), title: st => '小學邀請去分享', text: st => `有一間小學想請 ${st.name} 去分享「怎麼做出好影片」。`,
    choices: st => [
      { label: '🏫 去!', go: S => { const ok = st.skills.talk >= 3.5 || has(st, 'funny'); st.energy -= 8; if (ok) { st.fans += 260; st.mood += 8; return `小朋友聽得好開心,一直舉手問問題!粉絲 +260。`; } st.mood -= 3; st.skills.talk = Math.min(10, st.skills.talk + 0.3); return `${st.name}有點緊張,講得結結巴巴,不過口才 +0.3。`; } },
      { label: '這次先不要', go: () => '下次再說。' },
    ] },
  { id: 'kindhelp', w: 0.8, when: S => { const k = team(S).find(o => has(o, 'kind')); const t = k && team(S).filter(o => o.id !== k.id).sort((a, b) => a.mood - b.mood)[0]; return k && t ? [k, t] : null; },
    title: ([k, t]) => `${k.name} 在幫 ${t.name} 練習`, text: ([k, t]) => `${k.name}注意到${t.name}最近沒什麼精神,下班後留下來陪他練習。`,
    choices: ([k, t]) => [{ label: '🥹 好溫暖', go: S => { addRel(S, k.id, t.id, 15); t.mood += 10; const s = bestSkill(k); t.skills[s] = Math.min(10, t.skills[s] + 0.3); return `${t.name}心情變好,${D.SKILLS[s].name} +0.3,兩人感情變好了。`; } }] },
  { id: 'mean', w: 0.9, when: S => pick(S, team(S)), title: st => `網路上有人留壞話給 ${st.name}`, text: st => `${st.name}看到一則很難聽的留言,整個人悶悶的。`,
    choices: st => [
      { label: '🫂 陪他聊聊,一起檢舉', go: S => { st.mood += 6; st.loyalty += 6; return `${st.name}說:「你說得對,不要因為一個人的壞話,忘了很多人喜歡我。」`; } },
      { label: '📵 讓他這週不要看留言', go: S => { st.mood += 2; return '先離開網路休息一下,心情慢慢好起來。'; } },
    ] },
  { id: 'nominate', w: 0.7, when: S => (S.week > 6 ? team(S).sort((a, b) => b.fans - a.fans)[0] : null), title: st => '頒獎典禮邀請!', text: st => '「年度新星獎」想請公司派一位明星出席走紅毯。要派誰?',
    choices: () => team(S0).slice().sort((a, b) => b.fans - a.fans).slice(0, 3).map(o => ({ label: `${o.emoji} ${o.name}`, go: S => { const g = Math.round(300 + o.fans * 0.08); o.fans += g; o.mood += 10; for (const x of team(S)) if (x.id !== o.id && (has(x, 'jeal') || has(x, 'proud'))) { x.mood -= 6; } return `${o.name}在紅毯上超亮眼!粉絲 +${fmt(g)}。`; } })) },
  { id: 'power', w: 0.6, when: S => true, title: () => '停電了!', text: () => '整棟大樓停電,沒辦法練習。大家只好點蠟燭聊天。',
    choices: () => [{ label: '🕯 那就聊天吧', go: S => { S.flags.power = true; const t = team(S); for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) addRel(S, t[i].id, t[j].id, 4); return '這週練習沒效果,不過大家聊了好多,感情都變好了。'; } }] },
  { id: 'jealtalk', w: 1.2, when: S => team(S).find(o => o.lost >= 2), title: st => `${st.name} 覺得大家都不選他`, text: st => withCatch(S0, st, pick(S0, (L.SULK[voice(st)] || L.SULK._))),
    choices: st => [
      { label: `☕ 找他聊聊($${D.TALK_COST})`, cost: D.TALK_COST, go: S => { st.mood += 12; st.loyalty += 6; st.sulk = 0; st.lost = 0; return fill(pick(S, L.COMFORT[voice(st)] || L.COMFORT._)); } },
      { label: '🤞 答應下次有機會給他', go: S => { st.mood += 4; st.wish = { type: 'media', media: pick(S, availMedia(S)), left: 4 }; return `${st.name}說:「真的喔!我等著!」(心願:${wishText(S, st)})`; } },
    ] },
];
let S0 = null;                                        // 事件文字裡要用到 S 的時候(只在 randomEvent 期間有效)
function randomEvent(S) {
  S0 = S;
  const pool = shuffle(S, EVENTS).filter(e => !(S.flags.lastEv === e.id));
  for (const e of pool) {
    if (!chance(S, Math.min(1, e.w * 0.7))) continue;
    const ctx = e.when(S); if (!ctx) continue;
    S.flags.lastEv = e.id;
    const ev = { id: e.id, title: e.title(ctx), text: e.text(ctx, S), choices: e.choices(ctx).map(c => ({ label: c.label, cost: c.cost || 0 })) };
    ev.ctx = Array.isArray(ctx) ? ctx.map(x => x.id) : ctx === true ? null : ctx.id;
    S0 = null;
    return ev;
  }
  S0 = null;
  return null;
}
/** 玩家選了事件的第 i 個選項 → 回傳結果文字 */
export function chooseEvent(S, i) {
  const ev = S.event; if (!ev) return null;
  let res;
  if (ev.id === 'leave') {
    const st = starById(S, ev.star);
    if (i === 0) {
      if (S.money < D.TALK_COST * 2) return `要 $${D.TALK_COST * 2}`;
      S.money -= D.TALK_COST * 2; st.loyalty = clamp(st.loyalty + 30, 0, 100); st.mood = clamp(st.mood + 12, 0, 100);
      res = `${st.name}:` + withCatch(S, st, fill(pickLine(S, st, L.STAY)));
    } else if (i === 1) {
      st.promise = S.week + 4; st.loyalty = clamp(st.loyalty + 18, 0, 100);
      if (!st.wish) st.wish = { type: 'media', media: pick(S, availMedia(S)), left: 4 };
      st.wish.left = 4;
      res = `${st.name}:「好,我再相信你一次!」(4 週內要做到:${wishText(S, st)})`;
    } else res = starLeaves(S, st);
  } else {
    const e = EVENTS.find(x => x.id === ev.id);
    const ctx = ev.ctx == null ? true : Array.isArray(ev.ctx) ? ev.ctx.map(id => starById(S, id)) : starById(S, ev.ctx);
    if (ctx && (Array.isArray(ctx) ? ctx.some(x => !x || x.gone) : ctx !== true && ctx.gone)) { S.event = null; return '(事件結束了)'; }
    S0 = S;
    const ch = e.choices(ctx)[i]; S0 = null;
    if (!ch) return null;
    if (ch.cost && S.money < ch.cost) return `要 $${fmt(ch.cost)}`;
    S.money -= ch.cost || 0;
    res = ch.go(S);
    for (const st of team(S)) { st.mood = clamp(st.mood, 0, 100); st.loyalty = clamp(st.loyalty, 0, 100); st.energy = clamp(st.energy, 0, 100); }
  }
  S.stats.events++;
  feed(S, null, '📣 ' + res, 'event');
  S.event = null;
  return res;
}
function starLeaves(S, st) {
  st.gone = true; S.stats.left++;
  for (const op of S.ops.slice().filter(op => st.jobs.includes(op.id))) {
    for (const s of op.slots) if (s.who === st.id) s.who = null;
    if (!op.slots[0].who) {                           // 主角走了:換別人頂上,沒人就取消
      const k = op.slots.findIndex(s => s.who);
      if (k > 0) { op.slots[0].who = op.slots[k].who; op.slots[k].who = null; }
      else if (op.status === 'run') S.ops.splice(S.ops.indexOf(op), 1);
    }
  }
  st.jobs = [];
  const keep = Math.round(st.fans * 0.3);
  feed(S, st.id, `${st.name}:` + withCatch(S, st, fill(pickLine(S, st, L.BYE))), 'bye');
  for (const o of friendsOf(S, st)) o.mood = clamp(o.mood - 10, 0, 100);
  for (const o of team(S)) o.mood = clamp(o.mood - 3, 0, 100);
  // 粉絲大部分跟著走,一小部分留給公司(分給大家)
  const t = team(S); for (const o of t) o.fans += Math.round(keep / t.length);
  st.fans = 0;
  return `${st.name} 離開了公司,大部分粉絲也跟著走了。`;
}

// ---------- 每週結算 ----------
export function endWeek(S) {
  if (S.event) return null;                        // 事件要先回答
  const R = { week: S.week, items: [], money0: S.money, fans0: totalFans(S), grades: [] };
  const mood0 = Object.fromEntries(team(S).map(s => [s.id, s.mood]));
  // 1. 機會:主角有人的 → 開工;都沒人的 → 被別家接走
  for (const op of S.ops.slice()) {
    if (op.status !== 'open') continue;
    if (op.slots[0].who) { lockOp(S, op); continue; }
    for (const s of op.slots) if (s.who) { const st = starById(S,s.who); st.jobs=st.jobs.filter(id=>id!==op.id); st.sched=st.sched.map(v=>v==='job:'+op.id?'rest':v); s.who = null; }
    if (op.type === 'dome') continue;                // 巨蛋會一直留著
    S.ops.splice(S.ops.indexOf(op), 1);
    if (op.bids.length && chance(S, 0.5)) feed(S, null, `《${op.title.replace(/[《》]/g, '')}》被${pick(S, S.rivals).name}接走了。`, 'sys');
    for (const b of op.bids) { const st = starById(S, b.id); if (st && !st.gone && !st.jobs.length) st.mood = clamp(st.mood - 2, 0, 100); }
  }
  R.timeline = []; R.opTypes = Object.fromEntries(S.ops.map(op=>[op.id,op.type]));
  const startSkills = Object.fromEntries(team(S).map(st=>[st.id,{...st.skills}]));
  for(let d=0;d<7;d++) {
    const seq=S.seq, acts={}, floorOf={}, used={}, sulkOf={};
    for(const st of team(S)) {
      const value=st.sched[d]; acts[st.id]=value; sulkOf[st.id]=!!st.sulk; floorOf[st.id]=floorFor(S,value);
      const T=t=>has(st,t);
      if(value.startsWith('job:')) {
        const op=opById(S,value.slice(4)); if(op) {
          const log=(op.log ||= {})[st.id] ||= {e:0,m:0,n:0}; log.e+=st.energy; log.m+=st.mood; log.n++;
          const i=op.slots.findIndex(s=>s.who===st.id);
          for(const [k,w] of Object.entries(slotW(op,i))) st.skills[k]=Math.min(10,st.skills[k]+LEARNING.work*w*(1-st.skills[k]/11));
          st.energy-=T('hot')?18:15; st.worked=true;
        }
      } else if(value==='rest' || value==='off') {
        st.energy+=value==='off'?25:T('chill')?40:30; st.mood+=value==='off'?15:4;
        if(value==='off') { R.items.push({id:st.id,text:`🎉 ${st.name} 放假去玩`}); feed(S,st.id,'🎉 今天放假去玩，回來再加油！','chat'); }
        if(st.wish?.type==='rest') wishDone(S,st);
      } else if(value==='live') {
        if(!S.flags.down) {
          const hot=S.trend.hot==='live'?1.5:1;
          const g=Math.round((60+st.skills.talk*35+st.fans*0.015)*hot/3), m=Math.round((60+st.fans*0.02)*hot/3);
          st.fans+=g; S.money+=m; R.items.push({id:st.id,text:`🔴 ${st.name} 自己直播：粉絲 +${fmt(g)}、$${fmt(m)}`});
        }
        st.energy-=8;
      } else if(value.startsWith('train:') && !st.sulk) {
        const k=value.slice(6), room=k==='charm'?'style':k, rooms=S.floors.filter(f=>f.type===room), lv=roomLv(S,room), capacity=rooms.reduce((a,f)=>a+f.lv+1,0);
        used[k]=(used[k]||0)+1;
        let seat=used[k];
        for(let fi=0;fi<S.floors.length;fi++) if(S.floors[fi].type===room) {floorOf[st.id]=fi;seat-=S.floors[fi].lv+1;if(seat<=0)break;}
        let mult=(lv?1+0.2*(lv-1):0.5)*(0.7+st.mood/170)*(T('hot')?1.3:1)*(T('chill')?0.8:1)*(st.motivated?1.5:1)*(S.mentor?1.15:1);
        mult*=st.pot*trainingStaff(S,k);
        if(lv && used[k]>capacity) {mult*=0.5; if(!R.items.some(i=>i.crowded===k)) R.items.push({crowded:k,text:`${D.FLOORS[room].name}太擠了，部分練習效果減半。`});}
        if(st.energy<20) mult*=0.5; if(S.flags.power) mult=0;
        st.skills[k]=Math.min(10,st.skills[k]+LEARNING.training*mult*(1-st.skills[k]/11)); st.trained[k]=S.week;
        st.energy-=T('hot')?12:10;
        if(st.wish?.type==='train' && st.wish.skill===k && mult) wishDone(S,st);
      }
      // 每天只因同桌朋友增加一次心情。
      st.energy+=(roomLv(S,'cafe') ? 2+4*roomLv(S,'cafe') : 3)+staffEffect(S,'chef', [4,6,8]);
      if(value!=='off' && friendsOf(S,st).some(fr=>fr.sched[d]!=='off')) st.mood++;
      const dorm=roomLv(S,'dorm'), lounge=roomLv(S,'lounge');
      if(dorm) st.energy+=4+4*dorm;
      if(lounge && !value.startsWith('job:')) {st.energy+=6+2*lounge;st.mood+=3;}
      for(const k of ['energy','mood','loyalty']) st[k]=clamp(st[k],0,100);
      st.noRest=(value==='rest'||value==='off')?0:(st.noRest||0)+1;
      if(st.noRest>=6 && !st.warnedRest) {st.warnedRest=true; st.mood=clamp(st.mood-10,0,100); R.items.push({id:st.id,text:`😵 ${st.name} 一整週沒休息`,big:true}); if(chance(S,0.25)) st.cold=true; say(S,st,L.TIRED,{},'sad');}
    }
    let says=S.feed.filter(f=>f.n>seq && f.id).slice(0,3).map(({id,text})=>({id,text}));
    if(!says.length && chance(S,0.6)) {const st=pick(S,team(S)), fr=friendsOf(S,st).find(f=>acts[f.id]!=='off'); if(fr) feed(S,st.id,fill(pick(S,L.CHAT_FRIEND),{a:st.name,b:fr.name}),'chat'); else say(S,st,L.CHAT_SELF,{},'chat'); says=S.feed.slice(-1).map(({id,text})=>({id,text}));}
    R.timeline.push({acts,floorOf,says,sulkOf});
  }
  for(const st of team(S)) {
    st.warnedRest=false;
    if(st.sulk) {st.sulk--; R.items.push({id:st.id,text:`💢 ${st.name} 鬧彆扭，暫停練習。`});}
    for(const k of D.SKILL_IDS) if(st.skills[k]>startSkills[st.id][k]+0.05) R.items.push({id:st.id,text:`${D.SKILLS[k].icon} ${st.name} ${D.SKILLS[k].name} ${startSkills[st.id][k].toFixed(1)} → ${st.skills[k].toFixed(1)}`});
  }
  for(const op of S.ops.slice()) if(op.status==='run') {
    if(--op.left>0) R.items.push({op:op.id,text:`${MEDIA[op.type].icon} ${op.title} 製作中……(還有 ${op.left} 週)`});
    else finishOp(S,op,R);
  }
  // 4. 心願倒數
  for (const st of team(S)) {
    if (st.wish && --st.wish.left <= 0) {
      st.wish = null; st.wishIn = ri(S, 2, 3); st.mood -= 8; st.loyalty -= 8;
      say(S, st, L.WISH_FAIL, {}, 'sad');
      if (st.promise) { st.loyalty -= 20; delete st.promise; }
    }
  }
  // 5. 心情、體力、歸屬感
  const funny = team(S).some(s => has(s, 'funny') && !s.sulk);
  for (const st of team(S)) {
    st.energy = clamp(st.energy, 0, 100);
    st.mood += (55 + 3 * roomLv(S,'lounge') - st.mood) * 0.12 + (funny ? 1.5 : 0);
    if (st.energy < 20) { st.mood -= 6; if (chance(S, 0.5)) say(S, st, L.TIRED, {}, 'sad'); }
    if (S.money < 0) st.mood -= 3;
    st.mood = clamp(st.mood, 0, 100);
    const loyalty0 = st.loyalty;
    st.loyalty += st.mood > 70 ? 0.5 : st.mood < 35 ? -3 : 0;
    if (!st.worked && !st.sched.some(v=>v==='rest'||v==='off')) st.loyalty -= 1;          // 一整週沒有工作,有點無聊
    if (st.energy < 15) st.loyalty -= 1;
    st.loyalty = clamp(st.loyalty, 0, 100);
    // 一直被冷落的人(連輸)每週再少一點
    if (st.lost >= 2) st.loyalty = clamp(st.loyalty - 2, 0, 100);
    st.worked = false;
    if (st.promise && S.week >= st.promise) { st.loyalty = clamp(st.loyalty - 20, 0, 100); delete st.promise; feed(S, st.id, `${st.name}:你說好的事……沒做到。`, 'sad'); }
    if(st.trust>=70 && st.loyalty<loyalty0) st.loyalty=(st.loyalty+loyalty0)/2;
  }
  for (const st of team(S)) {
    const d = st.mood - mood0[st.id];
    if (d <= -12) R.items.push({ id: st.id, text: `😞 ${st.name}這週心情變差了(${Math.round(d)})` });
  }
  for(const st of team(S)) checkCareer(S,st,R);
  evaluate(S,R);
  for(const st of S.staff) {st.weeks++; if(st.weeks%8===0 && st.lv<3) {st.lv++;feed(S,null,`${st.name}升到 Lv${st.lv}!` ,'good');}}
  // 6. 房租、薪水
  const rent = LEVELS[S.lv].rent, pay = team(S).reduce((a, s) => a + D.salary(s), 0);
  const staffPay=S.staff.reduce((a,st)=>a+D.staffSalary(st),0);
  S.money -= rent + pay + staffPay;
  R.items.push({ text: `🏢 房租 $${fmt(rent)} + 明星薪水 $${fmt(pay)} + 員工薪水 $${fmt(staffPay)}` });
  // 7. 別家公司
  for (const r of S.rivals) r.fans = Math.round(r.fans * (1 + r.g * (0.7 + rnd(S) * 0.6)) + 60);
  // 8. 季度星光榜(每 12 週)
  if (S.week % 12 === 0) {
    const rk = rankNow(S), prize = [0, 3000, 1500, 800, 300][rk];
    S.money += prize;
    R.items.push({ text: `📊 季度星光榜:第 ${rk} 名!獎金 $${fmt(prize)}`, big: true });
    feed(S, null, `📊 季度星光榜公布:${S.company} 第 ${rk} 名!`, 'good');
  }
  checkGoals(S, R);
  if(S.endingPending) S.endingPending=computeEnding(S);
  R.money1 = S.money; R.fans1 = totalFans(S);
  for (const st of team(S)) if (st.fans > (st.stat.peak || 0)) st.stat.peak = st.fans;
  S.report = R;
  S.week++;
  if (!S.endingPending) beginWeek(S);
  return R;
}

function finishOp(S, op, R) {
  const ids = op.slots.map(s => s.who).filter(Boolean), m = MEDIA[op.type];
  const shares = op.slots.length === 1 ? [1] : op.type === 'dome' || op.type === 'duo' ? op.slots.map(() => 1 / op.slots.length) : [0.62, 0.38];
  let score = 0, wsum = 0;
  const per = op.slots.map((s, i) => {
    if (!s.who) return null;
    const st = starById(S, s.who), v = perf(S, st, op, i);
    score += v * shares[i]; wsum += shares[i];
    return v;
  });
  score /= wsum || 1;
  if (!op.slots.every(s => s.who)) score -= 6;      // 少一個人
  let g = D.gradeOf(score), contest = '';
  if (op.type === 'contest') {
    const npc = [0, 1, 2].map(() => 42 + Math.min(30, S.week * 0.6) + rnd(S) * 22);
    const place = 1 + npc.filter(x => x > score).length;
    contest = ` 第 ${place} 名`;
    g = D.GRADES[Math.min(3, place - 1)];
  }
  let mult = g.mult * trendMult(S, op);
  if (S.flags.down && (op.type === 'live' || op.type === 'podcast')) mult = 0;
  const fanMult = S.flags.rain && (op.type === 'podcast' || op.type === 'voice') ? 1.5 : 1;
  const fame = m.fame ? 1 + ids.reduce((a, id) => a + starById(S, id).fans, 0) / 20000 : 1;
  const pull = ids.reduce((a, id) => a + starById(S, id).fans, 0) * 0.03;     // 越紅的明星,作品帶來越多新粉絲
  const sat = 1 / (1 + totalFans(S) / 250000);                                 // 全國就這麼多人,越後面越難漲
  const money = Math.round(op.pay * OUTPUT.pay * mult * fame * (1+staffEffect(S,'manager',[0.1,0.15,0.2])+(['fashion','ad'].includes(op.type)?staffEffect(S,'stylist',[0.05,0.08,0.1]):0))), fans = Math.round((op.fans + pull) * OUTPUT.fans * mult * fanMult * sat);
  S.money += money;
  ids.forEach(id => {
    const st = starById(S, id), i = op.slots.findIndex(s => s.who === id);
    st.fans += Math.round(fans * shares[i] / wsum);
    st.stat.byType[op.type]=(st.stat.byType[op.type]||0)+1;
    st.stat.roles.push({type:op.type,role:op.slots[i].role,grade:g.g,sing:(slotW(op,i).sing||0),first:op.type==='contest'&&g.g==='S'});
    st.stat.ops++; if (g.g === 'S') st.stat.S++;
    if (!st.stat.best || 'SABC'.indexOf(g.g) < 'SABC'.indexOf(st.stat.best)) st.stat.best = g.g;
    st.jobs = st.jobs.filter(id => id !== op.id);
    st.mood = clamp(st.mood + ({ S: 14, A: 8, B: 2, C: -8 })[g.g], 0, 100);
    if (g.g === 'S' || g.g === 'A') st.loyalty = clamp(st.loyalty + 2, 0, 100);
  });
  for(const id of ids) checkCareer(S,starById(S,id),R);
  // 同場的人:關係變化
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    if (isRival(S, a, b)) addRel(S, a, b, g.g === 'S' || g.g === 'A' ? 22 : 6);
    else addRel(S, a, b, g.g === 'C' ? 2 : op.self ? 14 : 8);
  }
  const lead = starById(S, ids[0]);
  if (lead) say(S, lead, L.RESULT[g.g], {}, g.g === 'C' ? 'sad' : 'good');
  S.stats.ops++; S.stats.byType[op.type] = (S.stats.byType[op.type] || 0) + 1;
  if (g.g === 'S') (S.stats.goodType = S.stats.goodType || {})[op.type] = 1;
  if (g.g === 'S') S.stats.S++;
  if ('SABC'.indexOf(g.g) < 'SABC'.indexOf(S.stats.best)) S.stats.best = g.g;
  R.items.push({ op: op.id, grade: g.g, ids, big: true, text: `${m.icon} ${op.title}(${ids.map(id => nameOf(S, id)).join('、')})評價 ${g.g}${contest}!$${fmt(money)}、粉絲 +${fmt(fans)}${isHot(S, op) ? ' 🔥' : ''}` });
  R.grades.push(g.g);
  S.ops.splice(S.ops.indexOf(op), 1);
  if (op.type === 'dome') {
    if (g.g === 'S' || g.g === 'A') { S.endingPending = computeEnding(S); S.goals.push('final'); }
    else { S.domeWait = 3; feed(S, null, `🏟 巨蛋演唱會評價 ${g.g}……差一點點!練習一下,3 週後可以再挑戰。`, 'sad'); }
  }
}

// ---------- 排行、目標、結局 ----------
export function ranking(S) {
  return [{ name: S.company, icon: '⭐', fans: totalFans(S), me: true }].concat(S.rivals.map(r => ({ name: r.name, icon: r.icon, fans: r.fans }))).sort((a, b) => b.fans - a.fans);
}
export const rankNow = S => ranking(S).findIndex(r => r.me) + 1;
function goalMet(S, id) {
  const f = totalFans(S);
  if (id === 'debut') return S.stats.ops >= 1 && f >= 1000;
  if (id === 'known') return f >= 10000 && S.lv >= 2;
  if (id === 'popular') return rankNow(S) <= 2 && S.lv >= 3;
  if (id === 'dome') return f >= 100000 && S.lv >= 4;
  return false;
}
export const nextGoal = S => D.GOALS.find(g => !S.goals.includes(g.id));
function checkGoals(S, R) {
  for (const g of D.GOALS) {
    if (g.final || S.goals.includes(g.id)) continue;
    if (D.GOALS.indexOf(g) > 0 && !S.goals.includes(D.GOALS[D.GOALS.indexOf(g) - 1].id)) break;   // 照順序
    if (!goalMet(S, g.id)) break;
    S.goals.push(g.id); S.money += g.prize;
    S.goalWeek = S.goalWeek || {}; S.goalWeek[g.id] = S.week;
    feed(S, null, `${g.icon} 達成目標「${g.name}」!獎金 $${fmt(g.prize)}`, 'goal');
    if (R) R.items.push({ text: `${g.icon} 達成目標「${g.name}」!獎金 $${fmt(g.prize)}`, big: true, goal: g.id });
    if (!S.trophies.some(t => t.id === g.id && t.ng === S.ng)) S.trophies.push({ id: g.id, icon: g.icon, name: g.name, ng: S.ng, week: S.week });
  }
}
export function computeEnding(S) {
  const t = team(S), f = totalFans(S);
  const top = t.slice().sort((a, b) => b.fans - a.fans)[0];
  let kind = 'star', a = '', b = '';
  const rf = S.stats.rivalFriends.find(k => k.split('|').every(id => starById(S, id) && !starById(S, id).gone));
  let avg = 0, n = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { avg += rel(S, t[i].id, t[j].id); n++; }
  avg = n ? avg / n : 0;
  const all = D.NORMAL_MEDIA.every(k => (S.stats.goodType || {})[k]);
  const debuted=t.filter(st=>!st.trainee);
  if(debuted.length && debuted.filter(st=>st.careerStep===3).length/debuted.length>=0.6) kind='dreams';
  else if (rf) { kind = 'rivals'; [a, b] = rf.split('|').map(id => nameOf(S, id)); }
  else if (top && top.fans >= f * 0.45) { kind = 'superstar'; a = top.name; }
  else if (!S.stats.left && avg >= 15) kind = 'family';
  else if (all) kind = 'allround';
  const E = D.ENDINGS[kind], used = new Set();
  return {
    kind, icon: E.icon, name: E.name, text: fill(E.text, { a, b }), week: S.week, fans: f, rank: rankNow(S),
    lines: t.map(st => {                             // 同一句不要講兩次
      let text = '';
      for (let k = 0; k < 6 && (!text || used.has(text)); k++) text = fill(pickLine(S, st, L.ENDING_LINE));
      used.add(text);
      return { id: st.id, text: withCatch(S, st, text, 0.5)+` (${D.CAREERS[st.career].icon} ${st.careerStep===3?D.CAREERS[st.career].name+'夢想達成!':'離'+D.CAREERS[st.career].name+'還差一點，會繼續加油'})` };
    }),
  };
}
/** 看完結局:記獎盃,S.ended = true(還可以繼續經營,或開第二季) */
export function acceptEnding(S) {
  const e = S.endingPending; if (!e) return;
  S.ended = true; S.ending = e; S.endingPending = null;
  S.trophies.push({ id: 'end_' + e.kind, icon: e.icon, name: e.name, ng: S.ng, week: e.week });
  S.trophies.push({ id: 'final', icon: '🏆', name: '巨蛋成功', ng: S.ng, week: e.week });
  beginWeek(S);
}
/** 第二季:選一位留下當前輩,其他全部重新隨機 */
export function newSeason(S, mentorId, seed) {
  const m = starById(S, mentorId);
  const mentor = m ? { name: m.name, look: m.look, acc: m.acc, glow: m.glow, emoji: m.emoji, traits: m.traits } : null;
  return newGame({ seed, company: S.company, ng: S.ng + 1, mentor, trophies: S.trophies });
}

export const debuted=S=>team(S).filter(st=>!st.trainee);
export const traineeCapacity=S=>2+2*S.floors.filter(f=>f.type==='dorm').length;
export const potentialStars=st=>'★'.repeat(st.pot<1?1:st.pot<1.2?2:3);
export const careerLikes=(st,type)=>st.career==='idol'||D.CAREERS[st.career]?.media.includes(type);
function drawCareer(S,st) {const r=rnd(S); return r<0.6?Object.keys(D.CAREERS).find(k=>D.CAREERS[k].skill===bestSkill(st)):r<0.8?'idol':pick(S,Object.keys(D.CAREERS));}
export function checkCareer(S,st,R) {
 const b=st.stat.byType||{}, roles=st.stat.roles||[], n=(...types)=>types.reduce((a,k)=>a+(b[k]||0),0), a=roles.some(r=>['S','A'].includes(r.grade)&&['concert','dome'].includes(r.type)&&r.role==='主唱');
 const conditions={
 singer:[roles.filter(r=>r.sing>=0.5).length>=2,st.skills.sing>=7,a],
 actor:[n('drama')>=2,st.skills.act>=7,roles.some(r=>r.type==='drama'&&r.role==='主角'&&r.grade==='S')],
 dancer:[n('short','duo')>=3,st.skills.dance>=7,roles.some(r=>r.first||(r.type==='dome'&&r.role==='主舞'&&['S','A'].includes(r.grade)))],
 variety:[n('podcast','live')>=3,st.skills.talk>=7,st.fans>=20000],
 model:[n('fashion','ad','game')>=2,st.skills.charm>=7,roles.some(r=>r.type==='fashion'&&r.grade==='S')],
 idol:[Object.keys(b).filter(k=>b[k]>0).length>=4,D.SKILL_IDS.every(k=>st.skills[k]>=5),st.fans>=30000&&team(S).every(o=>o.fans<=st.fans)]};
 while(st.careerStep<3 && conditions[st.career][st.careerStep]) {
  st.careerStep++;st.mood=clamp(st.mood+15,0,100);st.loyalty=clamp(st.loyalty+10,0,100);st.trust=clamp(st.trust+5,0,100);
  const text=say(S,st,L.CAREER_STEP,{career:D.CAREERS[st.career].name,step:st.careerStep},'good');
  R?.items.push({id:st.id,text:`${st.name}：${text}`,big:true});
 }
}
export const staffEffect=(S,role,values)=>Math.max(0,...S.staff.filter(st=>st.role===role).map(st=>values[st.lv-1]));
export const trainingStaff=(S,k)=>(1+Math.max(0,...S.staff.filter(st=>st.role==='trainer'&&st.skill===k).map(st=>[0.15,0.25,0.35][st.lv-1])))*(k==='charm'?1+staffEffect(S,'stylist',[0.2,0.3,0.4]):1);
export function canHire(S,role) {
 if(!D.STAFF_ROLES[role])return '找不到職業';
 if(S.staff.length>=1+S.lv)return '員工名額滿了';
 const floor={chef:'cafe',scout:'scout',stylist:'style'}[role];
 if(floor&&!roomLv(S,floor))return '要先蓋'+D.FLOORS[floor].name;
 if(S.money<600+300*S.staff.length)return '錢不夠';return null;
}
export function hire(S,role,skill) {
 const err=canHire(S,role);if(err)return err;
 if(role==='trainer'&&!D.SKILLS[skill])return '請選科目';
 const name=pick(S,D.STAFF_NAMES.filter(n=>!S.staff.some(st=>st.name===n))); if(!name)return '暫時沒有人應徵';
 const look=randomLook(ri(S,1,2e9)); look.cloth=pick(S,CLOTH_COLORS.filter(c=>c==='#4a5a8a'));
 S.money-=600+300*S.staff.length; S.staff.push({id:'e'+S.nextId++,name,role,skill,lv:1,weeks:0,look});feed(S,null,`${D.STAFF_ROLES[role].icon} ${name}加入公司!`,'good');return null;
}
export function fireStaff(S,id) {S.staff=S.staff.filter(st=>st.id!==id);}
export function scoutWeek(S) {
 S.scouted=S.scouted.filter(st=>{if(S.week-st.found<=2)return true;feed(S,null,`${st.name} 被別家公司簽走了`,'sys');return false;});
 const lv=roomLv(S,'scout');if(!lv)return;
 const bonus=S.staff.some(st=>st.role==='scout')?0.25:0;
 const count=(chance(S,(lv===1?0.5:1)+bonus)?1:0)+(lv===3&&chance(S,0.5+bonus)?1:0);
 for(let i=0;i<count&&S.scouted.length<3;i++) {
  const st=makeStar(S);st.trainee=true;st.pot=+(0.95+rnd(S)*0.45).toFixed(2);st.found=S.week;
  st.intro=fill(pickLine(S,st,L.INTRO),{name:st.name,media:MEDIA[st.dream].name});S.scouted.push(st);
 }
}
export function signScouted(S,id) {
 const st=S.scouted.find(st=>st.id===id);if(!st)return '新人已經離開了';
 if(team(S).filter(st=>st.trainee).length>=traineeCapacity(S))return '練習生名額滿了';
 if(S.money<300)return '簽約金要 $300';S.money-=300;st.joined=S.week;S.stars.push(st);S.scouted=S.scouted.filter(st=>st.id!==id);autoArrange(S,id);feed(S,id,`${st.name}成為練習生，一起加油!`,'good');return null;
}
export function dismissScouted(S,id) {S.scouted=S.scouted.filter(st=>st.id!==id);}
export function evaluate(S,R) {
 if(S.week%4)return; R.evaluation=[];
 for(const st of team(S).filter(st=>st.trainee)) {
  const weeks=S.week-st.joined+1, skills=Object.values(st.skills).sort((a,b)=>b-a),score=20+skills.slice(0,3).reduce((a,b)=>a+b,0)/3*7+(st.mood-55)*0.1,grade=D.gradeOf(score).g;
  st.evaluation={id:st.id,score,grade,canDebut:score>=63&&weeks>=4,weeks};R.evaluation.push({...st.evaluation});
  say(S,st,L.EVAL[grade],{},grade==='C'?'say':'good');st.evalCs=grade==='C'?(st.evalCs||0)+1:0;
  if(st.evalCs>=3) {st.evalDoubt=true;st.loyalty=clamp(st.loyalty-10,0,100);feed(S,st.id,'我是不是不適合……我想跟老闆聊聊，再試試看。','sad');}
 }
}
export function debut(S,id) {
 const st=starById(S,id);if(!st?.trainee||!st.evaluation?.canDebut)return '還要再練習，等下次評鑑!';
 if(debuted(S).length>=LEVELS[S.lv].max)return '名額滿了，公司升級後才能出道';
 if(S.money<1000)return '出道舞台要 $1,000';S.money-=1000;st.trainee=false;st.debutWeek=S.week;st.fans+=500;st.mood=clamp(st.mood+20,0,100);
 const text=say(S,st,L.DEBUT,{},'good');S.report?.items.push({id,text:`🎉 ${st.name}出道!${text}`,big:true});
 if(!S.trophies.some(t=>t.id==='first_debut'))S.trophies.push({id:'first_debut',name:'第一位出道',icon:'🎉',week:S.week,ng:S.ng});return null;
}
