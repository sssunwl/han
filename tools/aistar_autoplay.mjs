// AI 明星養成自動玩家:直接在 Node 跑引擎(engine.js 不碰 DOM),一路玩到結局,
// 印出每個目標是第幾週達成、結局種類、有沒有出錯。調平衡、檢查重玩性用。
//
// 用法:
//   node tools/aistar_autoplay.mjs [局數=3] [策略=mix] [最多週數=200]
//     策略:best(永遠給最強的人)/ fair(優先給一直沒被選的人)/ mix(兩種混著)
//   node tools/aistar_autoplay.mjs compare 111 222   → 印兩局開頭的對照紀錄(陣容、性格、誰搶什麼、怎麼反應)
import * as E from '../games/aistar/engine.js';
import * as D from '../games/aistar/data.js';

const fmt = n => Math.round(n).toLocaleString('en-US');

/** 一週的決策 */
export function botWeek(S, style = 'mix') {
  // 1. 事件:付得起就選第一個,不然選最後一個(通常免費)
  if (S.event) {
    const ev = S.event;
    let i = ev.id === 'leave' ? (S.money > 600 ? 0 : 1) : ev.choices.findIndex(c => !c.cost || S.money > c.cost + 800);
    if (i < 0) i = ev.choices.length - 1;
    const r = E.chooseEvent(S, i);
    if (S.event) E.chooseEvent(S, ev.choices.length - 1);   // 錢不夠被擋 → 選最後一個
  }
  if (style === 'lazy' && S.event && S.event.id === 'leave') E.chooseEvent(S, 2);
  E.autoArrangeAll(S);
  const fair = style === 'fair' || (style === 'mix' && S.week % 2 === 0);
  // 2. 機會:巨蛋優先,其他照酬勞大的先
  const ops = S.ops.filter(o => o.status === 'open').sort((a, b) => (b.type === 'dome') - (a.type === 'dome') || b.pay - a.pay);
  const dome = ops.find(o => o.type === 'dome');
  if (dome) {
    // 巨蛋:每個角色找最適合的人,預估平均夠高才報名;不然先練那個角色要的技能
    const pickd = [], est = [];
    dome.slots.forEach((s, i) => { const c = E.team(S).filter(st => !pickd.includes(st) && st.energy >= 40).sort((a, b) => E.perf(S, b, dome, i, false) - E.perf(S, a, dome, i, false))[0]; pickd.push(c); est.push(c ? E.perf(S, c, dome, i, false, pickd.map(x => x && x.id)) : 0); });
    const avg = est.reduce((a, b) => a + b, 0) / est.length;
    if (avg >= 72 && pickd.every(c => c && E.isFree(c, dome))) pickd.forEach((c, i) => E.assign(S, dome.id, i, c.id));
    S._domePlan = pickd.map(c => c && c.id);
  }
  for (const op of ops) {
    if (op.type === 'dome') continue;
    for (let i = 0; i < op.slots.length; i++) {
      if (op.slots[i].who) continue;
      const free = E.team(S).filter(st => E.isFree(st, op) && st.energy >= 25 && !(dome && op.weeks > 1 && (S._domePlan || []).includes(st.id)));
      if (!free.length) break;
      const score = st => {
        const g = E.estimate(S, st, op, i), base = { S: 4, A: 3, B: 2, C: 0 }[g.g] * 10 + E.perf(S, st, op, i, false) / 10;
        const bid = op.bids.some(b => b.id === st.id) ? 6 : 0;
        return fair ? base + bid * 2 + st.lost * 8 + (st.loyalty < 40 ? 15 : 0) + (st.wish && st.wish.type === 'media' && st.wish.media === op.type ? 12 : 0) : base + bid;
      };
      const best = free.sort((a, b) => score(b) - score(a))[0];
      if (op.type === 'dome' && E.estimate(S, best, op, i).g === 'C') continue;
      if (E.estimate(S, best, op, i).g === 'C' && op.type !== 'dome' && i === 0 && free.length < 2) continue;
      E.assign(S, op.id, i, best.id);
    }
  }
  // 巨蛋未達到預估時，利用空檔補該角色的技能。
  if(dome) for(const [i,id] of (S._domePlan||[]).entries()) if(id && !E.starById(S,id).jobs.includes(dome.id)) {
    const st=E.starById(S,id), k=E.mainSkill({w:dome.sw[i]});
    for(let d=0;d<6;d++) if(!st.sched[d].startsWith('job:')) E.setDay(S,id,d,'train:'+k);
  }
  // 4. 照顧人:歸屬感低就談心,心願能買就買
  for (const st of style === 'lazy' ? [] : E.team(S)) {
    if ((st.loyalty < 45 || st.sulk) && S.money > 1500) E.interact(S, st.id, 'talk');
    if(st.energy<45 && S.money>800) E.interact(S,st.id,'snack');
    if (st.wish && st.wish.type === 'outfit' && S.money > 2000) E.buyOutfit(S, st.id);
    if (st.wish && st.wish.type === 'meet' && S.money > 2500 && !st.jobs.length) E.meetFans(S, st.id);
  }
  // 5. 花錢:升公司 > 試鏡 > 設施
  if (!E.canUpgrade(S)) E.upgradeCompany(S);
  if (S.audition) {
    const best = S.audition.map((c, i) => [i, Math.max(...Object.values(c.skills))]).sort((a, b) => b[1] - a[1])[0];
    if (E.sign(S, best[0])) E.skipAudition(S);
  } else if (E.team(S).length < D.LEVELS[S.lv].max && S.money > D.auditionCost(E.team(S).length) + 3000) E.auditionNow(S);
  const nx = D.LEVELS[S.lv + 1];
  const reserve = nx ? nx.cost * 0.6 : 0;
  for(const type of ['sing','act','talk','lounge']) if(!E.roomLv(S,type)) {
    if(S.money>E.floorCost(S,type)+reserve+2000) E.buildFloor(S,type);
    break;
  }
  for(const type of ['dance','sing','act','talk','cafe','dorm','studio']) {
    const i=S.floors.findIndex(f=>f.type===type && f.lv<3);
    if(i>=0 && S.money>E.upgradeCost(S,i)+reserve+2000) E.upgradeFloor(S,i);
  }
}

export function run(seed, style = 'mix', maxWeeks = 200, log = false) {
  const S = E.newGame({ seed });
  const out = { seed, style, goals: {}, minMoney: S.money, left: 0, errors: [] };
  try {
    while (S.week <= maxWeeks) {
      botWeek(S, style);
      const r = E.endWeek(S);
      if (!r) { out.errors.push('endWeek 被事件擋住 week ' + S.week); E.chooseEvent(S, S.event.choices.length - 1); continue; }
      out.minMoney = Math.min(out.minMoney, S.money);
      if (log) console.log(`W${r.week} $${fmt(S.money)} 粉絲${fmt(E.totalFans(S))} Lv${S.lv} 第${E.rankNow(S)}名 ` + r.grades.join(''));
      // 健康檢查（結局當週也要檢查）
      for (const st of E.team(S)) for (const k of ['mood', 'energy', 'loyalty', 'fans']) if (!Number.isFinite(st[k])) out.errors.push(`W${S.week} ${st.name}.${k}=${st[k]}`);
      if (!Number.isFinite(S.money)) out.errors.push('money NaN');
      if(r.timeline.length!==7 || r.timeline.some(d=>d.says.length>3)) out.errors.push('時間軸格式不正確');
      for(const st of E.team(S)) {
        if(st.sched.length!==7 || st.sched.some(v=>!E.ACT_NAMES[v] && !v.startsWith('job:'))) out.errors.push('行程格式不正確');
        if(st.jobs.some(id=>!E.opById(S,id)?.slots.some(s=>s.who===st.id))) out.errors.push('工作預約遺失');
        if(Object.values(st.skills).some(v=>!Number.isFinite(v)||v<0||v>10))out.errors.push('技能超出範圍');
      }
      if (S.endingPending) { out.ending = S.endingPending; E.acceptEnding(S); break; }
    }
  } catch (e) { out.errors.push(e.stack.split('\n').slice(0, 3).join(' | ')); }
  out.goals = S.goalWeek || {};
  out.week = S.week; out.fans = E.totalFans(S); out.left = S.stats.left; out.team = E.team(S).length; out.saveSize = JSON.stringify(S).length;
  out.S = S;
  return out;
}

function compare(seeds) {
  for (const seed of seeds) {
    const S = E.newGame({ seed });
    console.log(`\n==================== 種子 ${seed} ====================`);
    for (const st of S.stars) console.log(`${st.emoji} ${st.name}  性格:${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' + ')}  專長:${D.SKILLS[st.spec].name}  喜歡:${D.TOPICS.find(t => t.id === st.topic).name}  夢想:${D.MEDIA[st.dream].name}  口頭禪「${st.catch}」  配件:${st.acc}`);
    const t = E.team(S), rels = [];
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const v = E.rel(S, t[i].id, t[j].id); if (v >= 40 || v <= -30) rels.push(`${t[i].name}${v >= 40 ? '🤝' : '⚔️'}${t[j].name}`); }
    console.log('關係:' + rels.join('  '));
    let seen = S.feed.length ? S.feed[S.feed.length - 1].n : 0;
    seen = 0;
    for (let w = 0; w < 4; w++) {
      console.log(`--- 第 ${S.week} 週  趨勢:${D.MEDIA[S.trend.hot].name}🔥 話題#${D.TOPICS.find(x => x.id === S.trend.topic).name}`);
      const before = S.seq;
      botWeek(S, 'mix');
      const name = id => (E.starById(S, id) || {}).name || '';
      for (const f of S.feed.filter(f => f.n > seen && f.n <= S.seq)) {
        if (f.kind === 'sys') continue;
        const op = f.op && S.ops.find(o => o.id === f.op);
        const who = f.id && !f.text.startsWith(name(f.id)) ? name(f.id) + ':' : '';
        console.log(`  [${f.kind}] ${who}${f.text}${f.kind === 'bid' && op ? `  (搶 ${op.title})` : ''}`);
      }
      seen = S.seq;
      const r = E.endWeek(S);
      for (const it of r.items.filter(i => i.big)) console.log('  ★ ' + it.text);
    }
  }
}

function migrateTest() {
  const S=E.newGame({seed:222});
  botWeek(S); S.v=1; S.fac={gym:2,lounge:1,edit:2}; delete S.floors;
  for(const st of [...S.stars,...(S.audition||[])]) { st.job=st.jobs[0]||null; st.plan='train:'+E.bestSkill(st); delete st.sched; delete st.jobs; delete st.trust; delete st.done; }
  for(const op of S.ops) {delete op.days;delete op.log;op.weeks=3;op.left=3;}
  E.migrate(S);
  if(S.v!==2 || S.fac || S.stars.some(st=>st.sched.length!==7||st.job!==undefined)) throw Error('遷移失敗');
  for(let w=0;w<10;w++) {botWeek(S); const r=E.endWeek(S); if(!r||r.timeline.length!==7) throw Error('遷移後結算失敗');}
  console.log('v1 → v2 遷移後 10 週：0 錯誤');
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('aistar_autoplay.mjs')) {
  if (process.argv[2] === 'migrate-test') migrateTest();
  else if (process.argv[2] === 'compare') compare(process.argv.slice(3).map(Number));
  else {
    const N = Number(process.argv[2] || 3), style = process.argv[3] || 'mix', MAX = Number(process.argv[4] || 200);
    for (let i = 0; i < N; i++) {
      const r = run(1000 + i * 7919, style, MAX, process.env.LOG === '1');
      console.log(`種子 ${r.seed} [${style}] 結局:${r.ending ? r.ending.icon + r.ending.name + ' 第 ' + r.ending.week + ' 週' : '沒到(停在第 ' + r.week + ' 週)'}  目標週:${Object.entries(r.goals).map(([k, v]) => k + '=' + v).join(' ')}  粉絲 ${fmt(r.fans)}  最低存款 $${fmt(r.minMoney)}  離開 ${r.left} 人  剩 ${r.team} 人  存檔 ${(r.saveSize / 1024).toFixed(1)}KB  錯誤 ${r.errors.length}${r.errors.length ? ' ' + r.errors.slice(0, 3).join(' / ') : ''}`);
    }
  }
}
