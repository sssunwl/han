// 純 Node 規則驗收：不需要 DOM、網路或第三方套件。
import assert from 'node:assert/strict';
import * as E from './engine.js';
import * as D from './data.js';
import * as L from './lines.js';
import { KIT } from '../../shared/pixelkit/studio.js';
import { botWeek } from '../../tools/aistar_autoplay.mjs';
const fresh = seed => E.newGame({seed:seed||123});
const settle = S => {while(S.event) E.chooseEvent(S,S.event.choices.length-1);return E.endWeek(S);};
function opportunity(S,type,id='test') {
  const m=D.MEDIA[type];const op={id,type,req:null,topic:S.trend.topic,title:'測試作品',days:m.days,weeks:m.weeks,left:m.weeks,w:m.w||{sing:1},sw:m.sw,slots:m.slots.map(role=>({role,who:null})),status:'open',bids:[],yields:[],pay:100,fans:100,log:{}};
  S.ops.push(op);return op;
}
{
  const S=fresh(), st=S.stars[0];S.ops=[];
  assert.equal(S.v,8);assert.equal(S.floors.length,5);assert.equal(st.sched.length,7);assert.equal(st.sched[6],'rest');
  const one=opportunity(S,'short'), two=opportunity(S,'voice','test2');
  assert.equal(E.assign(S,one.id,0,st.id),null);assert.equal(E.assign(S,two.id,0,st.id),null);
  assert.deepEqual(st.jobs,['test','test2']);assert.equal(E.freeDays(st),4);assert.equal(st.sched[6],'rest');
  assert.equal(E.isFree(st,one),false);assert.equal(E.setDay(S,st.id,0,'off'),'這天要工作');
  assert.ok(E.setDay(S,st.id,3,'job:test'));assert.equal(E.setDay(S,st.id,3,'off'),null);
  E.autoArrangeAll(S);assert.equal(st.sched.filter(v=>v.startsWith('job:')).length,3);
  const R=settle(S);assert.equal(R.timeline.length,7);assert.equal(R.timeline[0].acts[st.id],'job:test');
  assert.ok(R.timeline.every(d=>d.says.length<=3));assert.equal(st.jobs.length,0);
}
{
  const S=fresh(33), a=S.stars[0], b=S.stars[1];S.ops=[];
  const op=opportunity(S,'concert');E.assign(S,op.id,0,a.id);E.assign(S,op.id,1,b.id);
  const R=settle(S);assert.equal(op.left,1);assert.equal(op.log[a.id].n,4);assert.equal(R.timeline[0].floorOf[a.id],-1);
  assert.equal(a.sched.filter(v=>v==='job:test').length,4);assert.ok(a.jobs.includes(op.id));
  assert.equal(R.timeline[0].acts[a.id],'job:test');assert.equal(op.log[a.id].n,4);
  settle(S);assert.ok(!S.ops.includes(op));assert.ok(!a.jobs.includes(op.id));
}
{
  const S=fresh(), st=S.stars[0];st.energy=30;st.mood=30;
  assert.equal(typeof E.interact(S,st.id,'chat'),'string');assert.equal(st.trust,43);assert.equal(st.mood,34);
  const money=S.money;assert.equal(E.interact(S,st.id,'snack'),null);assert.equal(st.energy,40);assert.equal(S.money,money-60);
  assert.ok(E.interact(S,st.id,'snack'));assert.equal(S.money,money-60);
  E.interact(S,st.id,'cheer');assert.equal(st.trust,45);E.interact(S,st.id,'talk');assert.equal(st.done.talk,true);
  settle(S);assert.deepEqual(st.done,{});
  S.money=0;assert.ok(E.interact(S,st.id,'snack'));assert.ok(!st.done.snack);
  for(const t of D.TRAIT_IDS) assert.ok(L.CHAT_BOSS[t].length>=4);
}
{
  const S=fresh();S.money=100000;
  assert.equal(E.buildFloor(S,'sing'),null);S.floors.pop();S.money=100000;
  S.lv=2;assert.equal(E.floorCost(S,'sing'),1500);assert.equal(E.buildFloor(S,'sing'),null);
  assert.equal(E.floorCost(S,'act'),2250);assert.equal(E.upgradeCost(S,5),1200);E.upgradeFloor(S,5);assert.equal(S.floors[5].lv,2);
  assert.equal(E.buildFloor(S,'sing'),null);assert.equal(E.roomLv(S,'sing'),2);
}
{
  const S=fresh();S.ops=[];const st=S.stars[0];st.traits=['chill','kind'];st.energy=0;st.mood=40;st.sched=Array(7).fill('rest');
  S.stars=S.stars.slice(0,1);S.event=null;
  const R=settle(S);assert.equal(st.energy,100);assert.equal(R.timeline[0].acts[st.id],'rest');
  // 完成後改行程不會改掉已產生的播放記錄。
  st.sched[0]='off';assert.equal(R.timeline[0].acts[st.id],'rest');
}
{
  // 舊檔：高等級、超過新樓層上限、進行中的長工作與舊設施。
  const S=fresh();S.lv=3;S.fac={gym:3,lounge:3,edit:3};S.v=1;delete S.floors;
  S.ops=[];const op=opportunity(S,'dome');op.weeks=op.left=3;
  for(const [i,st] of S.stars.entries()){st.job=i===0?op.id:null;st.plan='train:talk';delete st.jobs;delete st.sched;delete st.trust;delete st.done;}
  op.slots[0].who=S.stars[0].id;op.status='run';
  E.migrate(S);assert.equal(S.v,8);assert.equal(S.floors.length,9);assert.equal(op.left,2);assert.equal(op.days,5);
  assert.equal(S.stars[0].sched.filter(v=>v==='job:test').length,5);assert.equal(S.floors[1].lv,3);assert.equal(E.roomLv(S,'dance'),3);
  assert.ok(E.ACT_NAMES[S.stars[1].sched[0]]);assert.equal(S.stars[1].sched[6],'rest');assert.equal(S.fac,undefined);
  const same=JSON.stringify(S);E.migrate(S);assert.equal(JSON.stringify(S),same);
  for(let i=0;i<10;i++){botWeek(S);assert.ok(settle(S));}
}
{
  const a=fresh(785), b=fresh(785);
  for(let i=0;i<10;i++) {botWeek(a);botWeek(b);assert.deepEqual(settle(a),settle(b));assert.deepEqual(a,b);}
}
{
  const S=fresh(717);S.ops=[];S.event=null;
  for(const st of S.stars){st.sched=Array(7).fill('train:dance');st.sulk=0;st.mood=60;}
  const R=settle(S);
  assert.ok(R.items.some(i=>i.crowded==='dance'));
  assert.equal(R.items.filter(i=>i.text.includes('一整週沒休息')).length,4);
  for(const st of S.stars) for(const k of ['energy','mood','loyalty'])assert.ok(st[k]>=0&&st[k]<=100);
}
{
  const S=fresh(888);S.ops=[];S.event=null;
  const st=S.stars[0];st.cold=true;E.beginWeek(S);
  assert.deepEqual(st.sched.slice(0,2),['rest','rest']);assert.ok(E.setDay(S,st.id,0,'off'));
  assert.equal(E.setDay(S,st.id,2,'off'),null);
  const op=opportunity(S,'dome');assert.equal(E.assign(S,op.id,0,st.id),null);
  assert.deepEqual(st.sched.slice(0,2),['rest','rest']);assert.equal(st.sched.filter(v=>v==='job:test').length,5);
}
{
  for(const k of ['bunk_bed','bed','dining_table','food_counter','bowl','fridge','massage_chair','foot_bath','speaker','elevator_door','reception','clapper','mic_hand','notes','roof_sign']) {
    const item=KIT[k], b=item.make();assert.equal(b.w,item.w);assert.equal(b.h,item.h);assert.ok(b.d.some(v=>v>0));
  }
  assert.notDeepEqual(KIT.elevator_door.make({open:0}).d,KIT.elevator_door.make({open:1}).d);
}
console.log('引擎規則、互動、樓層、多週工作、遷移及固定種子：通過');

{
 const S=fresh(911);assert.equal(D.SKILL_IDS.length,5);assert.ok(S.stars.every(st=>st.skills.charm>=1&&st.career&&!st.trainee&&st.pot===1));
 S.money=100000;S.lv=4;E.buildFloor(S,'style');E.buildFloor(S,'scout');
 assert.equal(E.floorFor(S,'train:charm'),S.floors.findIndex(f=>f.type==='style'));
 const fashion=opportunity(S,'fashion');assert.equal(E.floorFor(S,'job:'+fashion.id),E.floorFor(S,'train:charm'));
 E.hire(S,'trainer','charm');E.hire(S,'stylist');assert.equal(E.trainingStaff(S,'charm'),1.15*1.2);
 E.hire(S,'manager');assert.equal(E.staffEffect(S,'manager',[.1,.15,.2]),.1);
 E.hire(S,'chef');assert.equal(E.staffEffect(S,'chef',[4,6,8]),4);
 assert.equal(D.staffSalary(S.staff[0]),80);assert.ok(S.staff.every(st=>st.look.cloth==='#4a5a8a'));
 S.ops=[];const rent=D.LEVELS[S.lv].rent,salary=S.stars.reduce((a,st)=>a+D.salary(st),0),staffSalary=S.staff.reduce((a,st)=>a+D.staffSalary(st),0),money=S.money;
 const R=settle(S);assert.equal(S.money,money-rent-salary-staffSalary);assert.ok(R.items.some(it=>it.text.includes('員工薪水')));
 for(const st of S.staff)st.weeks=7;settle(S);assert.ok(S.staff.every(st=>st.lv===2));
 const id=S.staff[0].id;E.fireStaff(S,id);assert.ok(!S.staff.some(st=>st.id===id));
}
{
 const S=fresh(900);S.money=100000;S.lv=4;S.ops=[];E.buildFloor(S,'scout');const fi=S.floors.findIndex(f=>f.type==='scout');S.floors[fi].lv=3;
 E.scoutWeek(S);assert.ok(S.scouted.length);const candidate=S.scouted[0];assert.ok(candidate.pot>=.95&&candidate.pot<=1.4);
 assert.equal(E.signScouted(S,candidate.id),null);assert.equal(D.salary(candidate),30);assert.equal(E.traineeCapacity(S),4);
 const op=opportunity(S,'drama');assert.equal(E.isFree(candidate,op),false);assert.ok(E.assign(S,op.id,0,candidate.id));
 const short=opportunity(S,'short','small');assert.equal(E.isFree(candidate,short),true);assert.equal(E.assign(S,short.id,0,candidate.id),null);
 candidate.jobs=[];candidate.sched=Array(7).fill('rest');S.ops=[];
 Object.keys(candidate.skills).forEach(k=>candidate.skills[k]=8);S.week=4;candidate.joined=1;
 const R={items:[]};E.evaluate(S,R);assert.equal(R.evaluation[0].canDebut,true);assert.ok(['S','A'].includes(R.evaluation[0].grade));
 S.lv=1;assert.ok(E.debut(S,candidate.id).includes('名額滿了'));S.lv=2;S.money=999;assert.ok(E.debut(S,candidate.id));S.money=1000;
 assert.equal(E.debut(S,candidate.id),null);assert.equal(candidate.trainee,false);assert.equal(S.money,0);assert.ok(S.trophies.some(t=>t.id==='first_debut'));
 E.scoutWeek(S);S.week=20;const expired=S.scouted.map(st=>st.id);E.scoutWeek(S);assert.ok(expired.every(id=>!S.scouted.some(st=>st.id===id)));assert.ok(S.feed.some(f=>f.text.includes('被別家公司簽走了')));
}
{
 const S=fresh(),st=S.stars[0],R={items:[]};st.career='singer';st.careerStep=0;st.skills.sing=8;
 st.stat.roles=[{type:'concert',role:'伴舞',grade:'S',sing:.2},{type:'duo',role:'搭檔',grade:'B',sing:.5}];E.checkCareer(S,st,R);assert.equal(st.careerStep,0);
 st.stat.roles.push({type:'concert',role:'主唱',grade:'A',sing:.8});E.checkCareer(S,st,R);assert.equal(st.careerStep,3);assert.equal(R.items.length,3);
 assert.ok(S.feed.some(f=>f.text.includes('歌手')));
 for(const s of S.stars){s.careerStep=3;}assert.equal(E.computeEnding(S).kind,'dreams');
 assert.ok(E.computeEnding(S).lines.every(l=>l.text.includes('夢想達成')));
}
{
 for(const k of ['vanity','clothes_rack','full_mirror','runway','desk_pc','phone_desk','whiteboard_map','score_board','visitor_sign']){
  const item=KIT[k],b=item.make();assert.equal(b.w,item.w);assert.equal(b.h,item.h);assert.ok(b.d.some(v=>v>0));
 }
}
console.log('第二階段：魅力、角色里程碑、練習生限制、評鑑出道、候選過期、員工效果薪水名額及新家具：通過');

{
 const S=fresh(822);S.ops=[];const op=opportunity(S,'fashion');E.assign(S,op.id,0,S.stars[0].id);
 const boosted=structuredClone(S);boosted.staff=[{id:'employee',name:'文青',role:'manager',lv:1,weeks:0},{id:'stylist',name:'美晴',role:'stylist',lv:1,weeks:0}];
 const a=settle(S), b=settle(boosted), pay=R=>Number(R.items.find(it=>it.op==='test'&&it.grade).text.match(/!\$([\d,]+)/)[1].replaceAll(',',''));
 assert.ok(Math.abs(pay(b)-pay(a)*1.15)<=1);assert.equal(a.grades[0],b.grades[0]);
 const before=S.stars.length;S.money=100000;S.lv=4;E.buildFloor(S,'scout');S.floors.find(f=>f.type==='scout').lv=3;
 while(E.team(S).filter(st=>st.trainee).length<E.traineeCapacity(S)){E.scoutWeek(S);for(const st of S.scouted.slice())E.signScouted(S,st.id);}
 E.scoutWeek(S);assert.ok(E.signScouted(S,S.scouted[0].id).includes('名額滿了'));assert.equal(E.debuted(S).length,before);
}

{
 const S=fresh(),st=S.stars[0];st.trainee=true;st.joined=1;for(const k of D.SKILL_IDS)st.skills[k]=1;
 for(const week of [4,8,12]){S.week=week;E.evaluate(S,{items:[]});}assert.equal(st.evalDoubt,true);
 E.beginWeek(S);assert.equal(S.event.id,'leave');assert.equal(S.event.star,st.id);assert.match(S.event.text,/再一起想想/);
 E.chooseEvent(S,0);assert.equal(S.event,null);assert.equal(st.gone,undefined);
}

// ---------- 第 3 階段:製作部、SNS、團體、排行、頒獎 ----------
{
  const S = fresh(901); S.money = 300000; S.lv = 4; S.event = null;
  // 沒有製作部不能開企劃;蓋了之後可以,同時企劃數 = 製作部 Lv
  assert.match(E.canStartProject(S, 'own_album', 'small'), /製作部/);
  for (const t of ['production', 'sns', 'sing', 'talk']) assert.equal(E.buildFloor(S, t), null);
  const m0 = S.money;
  assert.equal(E.startProject(S, 'own_album', 'mid'), null); assert.equal(S.money, m0 - 5000);
  assert.match(E.startProject(S, 'own_show', 'small'), /同時只能做 1/);
  const op = S.ops.find(o => o.project);
  // 取消退一半
  assert.equal(E.cancelProject(S, op.id), null); assert.equal(S.money, m0 - 2500);
  assert.equal(E.startProject(S, 'own_album', 'small'), null);
  const p2 = S.ops.find(o => o.project);
  // 沒人接也不會被別家公司接走
  S.event = null; E.endWeek(S); assert.ok(S.ops.includes(p2));
  // 做完 → 上架、之後每週分潤遞減
  assert.equal(E.assign(S, p2.id, 0, E.debuted(S)[0].id), null);
  for (let i = 0; i < 4 && !S.releases.length; i++) { S.event = null; E.endWeek(S); }
  assert.equal(S.releases.length, 1);
  const r = S.releases[0], money = [];
  for (let i = 0; i < 3; i++) { S.event = null; const before = r.total.money; E.endWeek(S); money.push(r.total.money - before); }
  assert.ok(money[0] > money[1] && money[1] > money[2] && money[2] > 0);
  assert.ok(S.chart.length >= 3 && S.chart.some(c => c.mine));
  // 打歌舞台:上架 6 週內每週都有一個,只給原唱
  const ms = S.ops.find(o => o.type === 'musicshow');
  assert.ok(ms && ms.only.includes(r.artists[0]));
  const other = E.debuted(S).find(st => !r.artists.includes(st.id));
  assert.match(E.assign(S, ms.id, 0, other.id), /原唱/);
  // SNS 四種策略都能用,而且會產生貼文
  for (const k of Object.keys(D.SNS)) assert.equal(E.setSnsStrategy(S, k), null);
  S.event = null; const f0 = E.totalFans(S); E.endWeek(S); assert.ok(S.posts.length >= 2);
  // 員工:製作人 / 小編要先有樓層
  assert.equal(E.hire(S, 'producer'), null); assert.equal(E.hire(S, 'editor'), null);
}
{
  const S = fresh(902); S.money = 300000; S.lv = 4; S.event = null;
  for (const t of ['production', 'sing']) E.buildFloor(S, t);
  const ids = E.debuted(S).slice(0, 3).map(s => s.id);
  assert.match(E.formGroup(S, '', 'cute', ids.slice(0, 2)), /3~5/);
  assert.equal(E.formGroup(S, '測試團', 'cute', ids), null);
  assert.match(E.formGroup(S, '', 'cool', ids), /已經在別的團/);
  const g = S.groups[0]; assert.equal(g.name, '測試團');
  const tw = E.teamwork(S, g); assert.ok(tw >= 0 && tw <= 100);
  assert.equal(E.startProject(S, 'group_album', 'small', g.id), null);
  const op = S.ops.find(o => o.type === 'group_album');
  assert.equal(op.slots.length, 3); assert.equal(op.slots[0].role, 'C 位');
  assert.ok(op.bids.every(b => ids.includes(b.id)) && op.bids.every(b => b.reason === 'center'));
  // 選 C 位 → 其他團員自動補上;想要 C 位但沒選上的人會反應
  op.bids = ids.map(id => ({ id, v: 80, reason: 'center', text: 'C 位給我!' }));
  const before = S.seq;
  assert.equal(E.assign(S, op.id, 0, ids[0]), null);
  assert.ok(op.slots.every(s => s.who)); assert.equal(op.status, 'run'); assert.equal(g.center, ids[0]);
  assert.ok(S.feed.filter(f => f.n > before && f.kind === 'lose').length === 2);
  for (let i = 0; i < 3; i++) { S.event = null; E.endWeek(S); }
  assert.ok(g.fans > 0 && g.albums === 1);
  // 頒獎:第 24 週結算會有 5 個獎
  while (S.week % 24) { S.event = null; E.endWeek(S); }
  S.event = null; const R = E.endWeek(S);
  assert.equal(R.awards.length, 5); assert.ok(R.awards.every(a => a.nominees.length >= 2 && a.winner));
  assert.equal(E.disbandGroup(S, g.id), null); assert.equal(S.groups.length, 0);
}
{
  // v3 → v4 遷移
  const S = fresh(903); S.v = 3; delete S.releases; delete S.groups; delete S.chart; delete S.posts; delete S.sns; delete S.actLog;
  E.migrate(S); assert.equal(S.v, 8); assert.deepEqual(S.groups, []); assert.equal(S.sns.strategy, 'vlog');
  for (const k of ['mixing_console', 'monitor_wall', 'sns_wall', 'heart_sign', 'red_carpet', 'award_trophy', 'confetti', 'album_cover']) { const it = KIT[k], b = it.make(); assert.equal(b.w, it.w); assert.equal(b.h, it.h); }
}
console.log('第三階段:製作部企劃/取消/不被接走/分潤遞減、排行、打歌、SNS、團體/C 位/默契、頒獎、遷移、新素材:通過');

// 第 4 階段:邀請、結算與 NPC 不佔玩家名額。
{
 const S=fresh(44);assert.equal(S.v,8);assert.equal(S.offers.length,0);
 const names=[...S.stars,...S.rivals.flatMap(r=>r.stars)].map(st=>st.name);assert.equal(new Set(names).size,names.length);
 for(const r of S.rivals){assert.equal(r.rel,30);assert.equal(r.stars.length,3);for(const st of r.stars)assert.ok(D.SKILL_IDS.every(k=>st.skills[k]>=3&&st.skills[k]<=7));}
 S.money=100000;S.lv=4;E.buildFloor(S,'meeting');S.floors.at(-1).lv=2;
 E.offerWeek(S);assert.equal(S.offers.length,1);let o=S.offers[0];let r=S.rivals[o.partner];const rel=r.rel;E.declineOffer(S,o.id);assert.equal(r.rel,rel-3);
 E.offerWeek(S);o=S.offers[0];r=S.rivals[o.partner];const before=r.rel;S.week++;E.offerWeek(S);assert.equal(r.rel,before-2);assert.ok(S.feed.some(f=>f.text.includes('等不到回覆')));
 o=S.offers[0];assert.equal(E.acceptOffer(S,o.id),null);assert.ok(S.ops.includes(o.op));assert.equal(S.offers.length,0);assert.equal(o.op.own,true);
 const op=o.op;const npc=E.partnerStars(S,op)[0];if(npc)assert.equal(E.npcPerf(S,npc,op),Object.entries(op.w).reduce((n,[k,w])=>n+npc.skills[k]*w,0)*7.4+20+S.rivals[op.partner].rel*0.05);
}
for(const type of ['collab','loan','joint']) {
 const S=fresh(72);S.ops=[];S.event=null;S.lv=4;S.money=100000;S.floors.push({type:'meeting',lv:3});for(const r of S.rivals)r.rel=80;
 let offer;for(let i=0;i<100&&!offer;i++){S.offers=[];E.offerWeek(S);offer=S.offers.find(o=>o.type===type);}assert.ok(offer,type);
 S.offers=[offer];const r=S.rivals[offer.partner],op=offer.op;E.acceptOffer(S,offer.id);
 assert.equal(op.slots.length,type==='joint'?2:1);assert.equal(op.npc.length,type==='loan'?0:type==='joint'?2:1);
 for(let i=0;i<op.slots.length;i++){const st=S.stars[i];for(const k of D.SKILL_IDS)st.skills[k]=8;assert.equal(E.assign(S,op.id,i,st.id),null);}
 if(type==='loan')assert.equal(E.floorFor(S,'job:'+op.id),-1);
 const money=S.money,fans=S.stars[0].fans;let R=settle(S);if(type==='joint')R=settle(S);
 assert.equal(S.stats.cooperations[type],1);assert.equal(r.collabs,1);assert.ok(S.money>money-10000);assert.ok(S.stars[0].fans>fans);
 assert.ok(S.feed.some(f=>f.text.includes(op.title)&&f.text.includes('粉絲 +')));
 if(type==='joint')assert.ok(S.trophies.some(t=>t.id==='joint'));
 assert.ok(R.items.some(it=>it.op===op.id));
}
{
 const S=fresh(81);for(const r of S.rivals)r.rel=70;
 for(let i=0;i<40;i++){const op=opportunity(S,'short','unused'+i);op.bids=[{id:S.stars[0].id}];}
 settle(S);assert.ok(S.feed.some(f=>f.text.includes('被其他小公司接走了')));assert.ok(!S.feed.some(f=>S.rivals.some(r=>f.text.includes('被'+r.name+'接走了'))));
 const old=fresh();old.v=4;delete old.offers;for(const r of old.rivals){delete r.stars;delete r.rel;delete r.collabs;}E.migrate(old);assert.equal(old.v,8);assert.equal(old.rivals[0].stars.length,3);assert.deepEqual(old.offers,[]);
 for(const [key,w,h] of [['meeting_table',96,40],['projector_screen',64,48],['handshake_sign',32,32],['visitor_badge',12,12]]){assert.equal(KIT[key].w,w);assert.equal(KIT[key].h,h);const b=KIT[key].make();assert.equal(b.w,w);assert.equal(b.h,h);}
}
console.log('第四階段:邀請產生/過期/接受/拒絕、NPC 分數與位置、三種合作、友好保護、v5 遷移及四項素材通過');
{
 const S=fresh(333);E.offerWeek(S);assert.equal(S.offers.length,0);
 S.floors.push({type:'meeting',lv:1});let total=0;
 for(let n=0;n<400;n++){S.offers=[];E.offerWeek(S);total+=S.offers.length;assert.ok(S.offers.every(o=>o.type!=='joint'));}
 assert.ok(total>160&&total<240,'Lv1 邀請機率約一半');
 S.floors.at(-1).lv=3;total=0;
 for(let n=0;n<200;n++){S.offers=[];E.offerWeek(S);assert.ok(S.offers.length>=1&&S.offers.length<=2);total+=S.offers.length;}
 assert.ok(total>270&&total<330,'Lv3 保證一個，約一半再一個');
 S.offers=[];E.offerWeek(S);E.offerWeek(S);assert.ok(S.offers.length<=3);
 for(const t of D.TRAIT_IDS){assert.ok(L.REASON.partner[t].length>=2);assert.ok(L.LOAN_GO[t].length>=2);assert.ok(L.LOAN_BACK[t].length>=2);}assert.equal(L.PARTNER_REP.length,8);
 const st=S.stars[0],op={days:5,type:'live',offerType:'loan',loanSkill:'sing',id:'loan-test'};st.skills.sing=4.9;assert.equal(E.isFree(st,op),false);st.skills.sing=5;assert.equal(E.isFree(st,op),true);
}
{
 const { decodeSave } = await import('./store.js');
 for(const v of [1,2,3,4,5,6,7,8]) {
  const S=fresh(987);S.v=v;
  const code='AISTAR1P:'+Buffer.from(JSON.stringify(S)).toString('base64');
  const saved=await decodeSave(code);assert.equal(saved.v,8);assert.equal(saved.rivals[0].stars.length,3);
 }
}
console.log('邀請頻率/上限、聯演門檻、12 種性格台詞、借將技能門檻與 v1–v7 存檔碼通過');

// v3-A:地區、無限樓層、自薦、條件、薪水及街景規格。
{
 const S=fresh(301);assert.equal(S.district,'alley');assert.deepEqual(E.LEARNING,{training:0.12,work:0.035});
 S.money=100000;assert.ok(E.moveDistrict(S,'shops'));S.lv=2;
 const mood=S.stars[0].mood,money=S.money, floors=S.floors, stars=S.stars;
 assert.equal(E.moveDistrict(S,'shops'),null);assert.equal(S.money,money-6000);assert.equal(S.stars[0].mood,Math.min(100,mood+10));assert.equal(S.floors,floors);assert.equal(S.stars,stars);
 assert.ok(E.moveDistrict(S,'alley'));assert.ok(E.moveDistrict(S,'shops'));assert.ok(E.moveDistrict(S,'city'));
 S.lv=4;assert.ok(E.moveDistrict(S,'harbor'));S.stars[0].fans=200000;assert.equal(E.moveDistrict(S,'harbor'),null);
 S.money=0;assert.ok(E.buildFloor(S,'dance'));S.money=1e8;S.lv=1;for(let i=0;i<30;i++)assert.equal(E.buildFloor(S,'dance'),null);assert.equal(S.floors.length,35);
}
{
 const S=fresh(302);S.ops=[];S.event=null;S.money=1e7;for(const st of S.stars)st.sched=Array(7).fill('rest');
 const T=structuredClone(S);T.district='harbor';const a=settle(S),b=settle(T);
 assert.equal(S.money-T.money,Math.round(D.LEVELS[1].rent*3));
 assert.match(b.items.find(x=>x.text.includes('房租')).text,/房租/);
 // 相同種子與工作在不同地區,只增加酬勞與粉絲。
 const A=fresh(33);A.ops=[];A.event=null;const op=opportunity(A,'short');E.assign(A,op.id,0,A.stars[0].id);
 const B=structuredClone(A);B.district='harbor';settle(A);settle(B);
 assert.ok(B.stars[0].fans>A.stars[0].fans);assert.ok(B.money+Math.round(D.LEVELS[1].rent*3)>A.money);
 // 播放分潤與 SNS 也套地區倍率。
 const C=fresh(98);C.event=null;C.ops=[];C.floors.push({type:'sns',lv:1});C.releases=[{id:'release',type:'own_album',title:'測試',artists:[C.stars[0].id],week:1,weeksLeft:8,budget:'small',quality:80,total:{money:0,fans:0},w:{sing:1}}];
 for(const st of C.stars)st.sched=Array(7).fill('rest');const H=structuredClone(C);H.district='harbor';const cr=settle(C),hr=settle(H);
 assert.equal(H.releases[0].total.money,Math.round(C.releases[0].total.money*1.3));assert.ok(E.totalFans(H)>E.totalFans(C));assert.ok(cr.items.some(x=>x.text.includes('SNS'))&&hr.items.some(x=>x.text.includes('SNS')));
}
{
 const S=fresh(777);S.walkins=[];S.district='harbor';S.lv=4;S.money=1e7;
 const found=[];for(let i=0;i<100;i++){S.walkins=[];E.walkinWeek(S);found.push(...S.walkins);assert.ok(S.walkins.length<=3);}
 const rookie=found.find(s=>s.trainee),experienced=found.find(s=>!s.trainee);assert.ok(rookie&&experienced);
 assert.ok(found.some(s=>s.needOff)&&found.some(s=>s.wish?.type==='lead')&&found.some(s=>s.wish?.media==='own_album'));
 for(const st of found){assert.ok(st.pot>=0.85&&st.pot<=1.35);assert.ok(st.intro.length>10);if(!st.trainee){assert.ok(st.fans>=1500&&st.fans<=6000);assert.equal(st.salaryBonus,0.5);assert.ok(Object.values(st.skills).every(v=>v<=8));} }
 assert.equal(rookie.signCost,200);assert.equal(experienced.signCost,Math.round(D.auditionCost(4)*1.6));
 S.walkins=[rookie,experienced];const money=S.money;assert.equal(E.signWalkin(S,rookie.id),null);assert.equal(S.money,money-200);assert.ok(rookie.trainee);assert.equal(rookie.sched.length,7);
 assert.equal(E.signWalkin(S,experienced.id),null);assert.ok(!experienced.trainee);assert.equal(D.salary(experienced),Math.round((60+experienced.fans/160)*1.5));
 assert.deepEqual(S.stats.walkins,{rookie:1,experienced:1});
 const stale=found.find(st=>st!==rookie&&st!==experienced);stale.found=S.week-2;S.walkins=[stale];E.walkinWeek(S);assert.ok(!S.walkins.includes(stale));assert.ok(S.feed.some(f=>f.text.includes('等不到回覆,去別家')));
 const off=S.stars[0];off.needOff=true;off.sched=Array(7).fill('rest');S.ops=[];S.event=null;const T=structuredClone(S);T.stars[0].needOff=false;settle(S);settle(T);assert.equal(T.stars[0].loyalty-S.stars[0].loyalty,3);
 for(const type of ['rookie','experienced'])for(const trait of D.TRAIT_IDS)assert.ok(L.WALKIN[type][trait].length>=2);
 const V=fresh();V.v=5;delete V.district;delete V.walkins;for(const st of V.stars)delete st.salaryBonus;E.migrate(V);assert.equal(V.v,8);assert.equal(V.district,'alley');assert.deepEqual(V.walkins,[]);assert.ok(V.stars.every(st=>st.salaryBonus===0));
}
{
 const {STREET_KIT}=await import('../../shared/pixelkit/street.js');
 for(const [key,entry] of Object.entries(STREET_KIT)){const b=entry.make();assert.equal(b.w,entry.w,key);assert.equal(b.h,entry.h,key);assert.ok(b.d.some(v=>v>0),key);}
 for(const d of D.DISTRICTS){assert.equal(STREET_KIT['skyline_'+d.id].w,416);assert.equal(STREET_KIT['skyline_'+d.id].h,80);for(const k of ['a','b']){assert.equal(STREET_KIT['neighbor_'+d.id+'_'+k].w,48);assert.equal(STREET_KIT['neighbor_'+d.id+'_'+k].h,96);}}
 assert.equal(STREET_KIT.car.make({color:'#fa8282'}).w,40);
}
console.log('v3-A:地區搬家/房租/工作及分潤/SNS 加成、無限樓層、自薦/過期/條件/薪水、v6 遷移及所有街景素材通過');
{
 const S=fresh(632);S.money=0;S.lv=2;assert.match(E.moveDistrict(S,'shops'),/費不夠/);assert.equal(S.district,'alley');
 const H=fresh(632);H.district='harbor';S.ops=[];H.ops=[];S.pipeline=[];H.pipeline=[];E.beginWeek(S);E.beginWeek(H);assert.equal(H.ops.length,D.LEVELS[H.lv].ops+2);assert.equal(S.ops.length,D.LEVELS[S.lv].ops);
 const T=fresh(777);T.district='harbor';T.lv=4;T.money=0;while(!T.walkins.some(s=>s.trainee))E.walkinWeek(T);const st=T.walkins.find(s=>s.trainee);assert.match(E.signWalkin(T,st.id),/簽約金/);assert.ok(T.walkins.includes(st));
 T.money=1e7;for(const s of T.stars)s.trainee=true;assert.match(E.signWalkin(T,st.id),/名額/);
 E.declineWalkin(T,st.id);assert.ok(!T.walkins.includes(st));
 const A=fresh(634);A.event=null;A.ops=[];for(const s of A.stars)s.sched=Array(7).fill('rest');A.stars[0].wish={type:'lead',left:1};A.stars[0].walkinCondition='lead';
 const B=structuredClone(A);delete B.stars[0].walkinCondition;settle(A);settle(B);assert.equal(B.stars[0].loyalty-A.stars[0].loyalty,4);
}
console.log('v3-A 補驗:搬家資金、地區機會數、自薦資金/名額/拒絕及心願失敗 1.5 倍通過');

// v3-B:導覽優先序、每個大目標的三個步驟與實際里程碑對照。
{
 const S=fresh(711),st=S.stars[0];S.event=null;S.ops=[];S.trend=null;
 for(const x of S.stars){x.sched=Array(7).fill('rest');x.energy=80;x.wish=null;x.sprint=null;x.expect=null;}
 const rs=S.rs;assert.ok(E.assistantAdvice(S));assert.equal(S.rs,rs);
 S.event={};st.sched=Array(7).fill('train:sing');st.energy=10;assert.equal(E.assistantAdvice(S),'先處理事件');
 S.event=null;assert.match(E.assistantAdvice(S),/沒排休息/);st.sched[6]='rest';assert.match(E.assistantAdvice(S),/快沒力/);st.energy=80;
 const op={...fresh().ops[0],id:'test',w:{sing:1},slots:[{role:'主唱',who:null}],bids:[],status:'open'};st.skills.sing=10;S.ops=[op];st.wish={type:'rest',left:1};assert.match(E.assistantAdvice(S),/預估 [SA]/);
 S.ops=[];assert.match(E.assistantAdvice(S),/心願快到期/);st.wish=null;st.trainee=true;S.week=3;assert.match(E.assistantAdvice(S),/月末評鑑/);
 st.trainee=false;S.trend={hot:'short',topic:'food'};assert.match(E.assistantAdvice(S),/×1.5/);S.week=9;assert.equal(E.assistantAdvice(S),null);
 const before=S.money;assert.ok(E.upgradeAssistant(S));assert.equal(S.money,before);
 S.money=26000;for(const [lv,cost] of E.ASSISTANT_COSTS.entries()){const money=S.money;assert.equal(E.upgradeAssistant(S),null);assert.equal(S.assistant.lv,lv+1);assert.equal(S.money,money-cost);assert.ok(E.assistantAdvice(S));}
 assert.ok(E.upgradeAssistant(S));assert.equal(S.staff.length,0);assert.equal(S.assistant.acc,'headphones');
 const expected={singer:['歌唱類作品 0 / 2','歌唱 4.0 / 7','演唱會或巨蛋主唱 A 以上 0 / 1'],actor:['AI 短劇作品 0 / 2','演技 4.0 / 7','AI 短劇主角 S 0 / 1'],dancer:['短影音或雙人企劃 0 / 3','舞蹈 4.0 / 7','第一名或巨蛋主舞 A 以上 0 / 1'],variety:['Podcast 或直播作品 0 / 3','口才 4.0 / 7','粉絲 100 / 20000'],model:['走秀或代言作品 0 / 2','魅力 4.0 / 7','時尚走秀 S 0 / 1'],idol:['不同類型作品 0 / 4','5 項都 ≥ 5:還差 歌唱 4.0、舞蹈 4.0、演技 4.0、口才 4.0、魅力 4.0','粉絲 100 / 30000 · 全公司人氣第一 0 / 1']};
 for(const [career,progress] of Object.entries(expected))for(let step=0;step<3;step++){
  Object.assign(st,{career,careerStep:step,skills:Object.fromEntries(D.SKILL_IDS.map(k=>[k,4])),stat:{byType:{},roles:[]},fans:100});S.stars[1].fans=200;
  const next=E.careerNext(S,st);assert.equal(next.progress,progress[step]);assert.ok(next.text.includes(D.CAREERS[career].name));
  E.checkCareer(S,st,{items:[]});assert.equal(st.careerStep,step);
 }
 const roles=[{sing:0.8,type:'concert',role:'主唱',grade:'A'},{sing:0.6,type:'drama',role:'主角',grade:'S',first:true},{type:'fashion',grade:'S'}];
 Object.assign(st,{skills:Object.fromEntries(D.SKILL_IDS.map(k=>[k,8])),fans:50000,stat:{byType:{drama:2,short:3,podcast:3,fashion:2},roles}});
 for(const career of Object.keys(D.CAREERS)){st.career=career;st.careerStep=0;E.checkCareer(S,st,{items:[]});assert.equal(st.careerStep,3);assert.equal(E.careerNext(S,st).text,'🎉 夢想達成!');}
 st.career='singer';st.careerStep=1;st.skills.sing=6.1;st.energy=90;st.mood=80;st.pot=1.2;st.traits=['hot','perf'];S.flags.power=false;
 const gain=E.trainingGain(S,st,'sing',1),mult=E.trainingMultiplier(S,st,'sing');assert.ok(Math.abs(gain-E.LEARNING.training*mult*(1-6.1/11))<1e-12);
 const a=E.analyzeStar(S,st),weeks=a.practice[0].weeks;let value=6.1;for(let i=0;i<weeks*5;i++)value+=E.LEARNING.training*mult*(1-value/11);assert.ok(value>=7);assert.ok(weeks<=10);assert.match(a.advice,/每週練 5 天/);
 st.skills.sing=0;st.pot=0.5;assert.match(E.analyzeStar(S,st).advice,/超過 10 週/);
 st.traits=['funny','kind'];st.skills=Object.fromEntries(D.SKILL_IDS.map(k=>[k,5]));st.pot=1;const scores=E.analyzeStar(S,st).aptitude;assert.equal(scores.find(x=>x.id==='variety').score,58);assert.equal(scores.find(x=>x.id==='singer').score,50);
 st.traits=['shy','kind'];assert.equal(E.analyzeStar(S,st).aptitude.find(x=>x.id==='variety').score,42);
 S.assistant.lv=1;assert.deepEqual(E.analyzeStar(S,st).aptitude,[]);S.assistant.lv=2;assert.equal(E.analyzeStar(S,st).aptitude.length,6);
 const snapshot=JSON.stringify(S);E.analyzeStar(S,st);E.assistantAdvice(S);E.selectionHint(S,st,op);E.analystRecommendation(S,op);assert.equal(JSON.stringify(S),snapshot);
}
{
 // 每個事件工廠都至少產生一組選項，動態小編與紅毯選項也由實際事件生成覆蓋。
 const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('./engine.js',import.meta.url),'utf8'));
 const section=source.slice(source.indexOf('function leaveEvent'),source.indexOf('let S0 = null'));
 assert.equal([...section.matchAll(/label:/g)].length,[...section.matchAll(/hint:/g)].length);
 const seen=new Set();for(let seed=1;seed<=500;seed++){const S=fresh(seed);for(const st of S.stars){st.lost=3;st.energy=20;}S.week=12;S.staff.push({role:'editor',lv:3});for(let w=0;w<3;w++){if(S.event){assert.ok(S.event.choices.every(c=>typeof c.hint==='string'&&c.hint.length>5));seen.add(S.event.id);E.chooseEvent(S,0);}E.endWeek(S);}}
 assert.ok(seen.size>=20);
 for(let v=1;v<=6;v++){const S=fresh(v);S.v=v;delete S.assistant;delete S.seenTips;delete S.tipsOff;E.migrate(S);assert.equal(S.v,8);assert.equal(S.assistant.lv,0);assert.deepEqual(S.seenTips,[]);assert.equal(S.tipsOff,false);}
 const S=fresh();S.v=6;S.week=30;delete S.assistant;E.migrate(S);assert.ok(S.assistant);assert.equal(E.assistantAdvice(S),null);
}
console.log('v3-B:建議優先序、18 個里程碑、練習公式/週數、適性、三級學費、事件 hint 與 v7 遷移通過');

{
 const S=fresh(901);S.v=6;S.event={id:'fake',ctx:S.stars[0].id,choices:[{label:'澄清'},{label:'檢舉'},{label:'不理'}]};delete S.assistant;E.migrate(S);assert.match(S.event.choices[0].hint,/粉絲 ↑/);assert.match(S.event.choices[2].hint,/歸屬 ↓/);
}

// v3-C:跨週預告的內容與熱門趨勢都不能在開案時重抽。
{
 const S=fresh(9001), original=structuredClone(S.pipeline);assert.equal(S.v,8);
 assert.ok(original.some(p=>p.week===2));assert.ok(original.some(p=>p.week===3));
 for(let week=2;week<=3;week++){
  S.week=week;S.ops=[];E.beginWeek(S);
  const expected=original.filter(p=>p.week===week),actual=S.ops.filter(o=>o.born===week&&!o.own);
  assert.deepEqual(actual.map(o=>({type:o.type,topic:o.topic,title:o.title,req:o.req,w:o.w})),expected.map(({type,topic,title,req,w})=>({type,topic,title,req,w})));
  for(const p of expected)assert.equal(p.hot,p.type===S.trend.hot);
  assert.ok(S.pipeline.every(p=>p.week>week&&p.week<=week+2));
 }
 // 升級不會偷偷改掉已預告的門檻或標題。
 const planned=structuredClone(S.pipeline.filter(p=>p.week===4));S.lv=4;S.week=4;S.ops=[];E.beginWeek(S);
 assert.deepEqual(S.ops.filter(o=>o.type!=='musicshow').map(o=>o.req),planned.map(p=>p.req));
}
{
 const S=fresh(9002),st=S.stars[0];S.ops=[];st.skills.act=3.2;
 const op=opportunity(S,'drama');op.req=E.requirements(S,'drama',op.w);
 assert.equal(E.assign(S,op.id,0,st.id),`${st.name} 的演技 3.2,要 4 才能接`);assert.equal(st.jobs.length,0);
 assert.equal(E.assign(S,op.id,1,st.id),null);
 for(const type of ['drama','concert','contest','ad','game','fashion','dome']){
  const T=fresh(9);T.ops=[];T.lv=4;const o=opportunity(T,type);o.req=E.requirements(T,type,o.w);
  for(let i=0;i<o.slots.length;i++){
   const x=T.stars[i],r=E.slotRequirement(T,o,i);x.skills=Object.fromEntries(D.SKILL_IDS.map(k=>[k,0]));
   if(r){assert.ok(E.requirementError(T,x,o,i));x.skills[r.skill]=r.target;assert.equal(E.requirementError(T,x,o,i),null);}
   else assert.equal(E.requirementError(T,x,o,i),null);
  }
 }
 const T=fresh(9010);T.ops=[];const solo=opportunity(T,'fashion'),drama=opportunity(T,'drama','drama');solo.req=E.requirements(T,'fashion',solo.w);drama.req=E.requirements(T,'drama',drama.w);
 for(const x of T.stars){x.skills.charm=1;x.skills.act=1;x.traits=['hot','comp'];x.sprint=null;}
 E.computeBids(T,solo);assert.equal(solo.bids.length,0);E.computeBids(T,drama);assert.ok(drama.bids.length);assert.ok(drama.bids.every(b=>b.supportOnly));
}
{
 const prepare=(value=3.6)=>{const S=fresh(9020);S.week=2;S.ops=[];S.floors.push({type:'act',lv:3});S.pipeline=[{week:3,type:'drama',title:'衝刺試鏡',topic:'space',w:{act:1},req:{skill:'act',target:4}}];for(const x of S.stars){x.sprint=null;x.skills.act=1;}const st=S.stars[0];st.career='actor';st.skills.act=value;st.traits=['shy','kind'];st.energy=90;st.mood=60;E.beginWeek(S);return {S,st};};
 const {S,st}=prepare();assert.equal(st.sprint.skill,'act');assert.equal(st.sprint.left,1);assert.ok(S.feed.some(f=>f.id===st.id&&f.kind==='wish'&&f.text.includes('演技')));
 E.autoArrange(S,st.id);assert.equal(st.sched[6],'rest');assert.ok(st.sched.slice(0,6).every(v=>v==='train:act'));
 S.event=null;S.ops=[];st.wish={type:'outfit',left:1};for(const x of S.stars){x.sched[6]='rest';x.energy=90;}assert.match(E.assistantAdvice(S),/想衝演技/);
 st.skills.act=4;S.week=3;S.ops=[];E.beginWeek(S);const op=S.ops.find(o=>o.title==='衝刺試鏡');assert.equal(S.stats.sprintSuccess,1);assert.equal(op.bids.find(b=>b.id===st.id).reason,'sprint');assert.match(op.bids.find(b=>b.id===st.id).text,/我練到了/);
 st.expect=null;st.wish=null;st.mood=20;st.loyalty=20;st.trust=20;assert.equal(E.assign(S,op.id,0,st.id),null);assert.ok(st.mood>=35&&st.loyalty>=28);assert.equal(st.trust,25);assert.equal(st.sprint,null);
 const F=prepare();const before=F.st.mood;F.S.week=3;F.S.ops=[];E.beginWeek(F.S);assert.equal(F.S.stats.sprintFail,1);assert.equal(F.st.mood,before-5);assert.ok(F.S.feed.some(f=>f.text==='還差一點……下次。'));
 // 沒選上照原輸家反應,最後清掉衝刺。
 const N=prepare();N.st.skills.act=4;N.S.week=3;N.S.ops=[];E.beginWeek(N.S);const n=N.S.ops.find(o=>o.title==='衝刺試鏡');N.S.stars[1].skills.act=5;E.assign(N.S,n.id,0,N.S.stars[1].id);E.assign(N.S,n.id,1,N.S.stars[2].id);assert.equal(N.st.sprint,null);assert.ok(N.S.feed.some(f=>f.kind==='lose'&&f.id===N.st.id));
 for(const lines of Object.values(L.SPRINT))assert.ok(lines.length>=2);
}
{
 const S=fresh(9030),st=S.stars[0];assert.ok(E.debuted(S).every(x=>x.expect?.left===5));
 st.expect={kind:'dream',media:'short',left:1};S.ops=[];const op=opportunity(S,'short');st.wish=null;st.mood=20;st.loyalty=20;assert.equal(E.assign(S,op.id,0,st.id),null);assert.equal(S.stats.expectDone,1);assert.ok(st.mood>=30);assert.ok(st.loyalty>=26);assert.equal(st.expect,null);
 E.beginWeek(S);assert.equal(st.expect,null);S.week++;E.beginWeek(S);assert.equal(st.expect.left,5);
 const F=fresh(9031),x=F.stars[0];x.expect={kind:'career',media:'dome',left:1};for(const a of F.stars){a.sched=Array(7).fill('rest');a.wish=null;}F.ops=[];F.event=null;E.endWeek(F);assert.equal(F.stats.expectFail,1);assert.equal(x.expect.left,5);assert.ok(F.feed.some(f=>f.id===x.id&&L.EXPECT_FAIL._.some(t=>f.text.includes(t))));
 const d=opportunity(F,'drama');x.expect={kind:'lead',left:5};assert.equal(E.expectMatches(x,d,1),false);assert.equal(E.expectMatches(x,d,0),true);
 let lead=0,dream=0,career=0;for(let i=0;i<1000;i++){x.traits=['comp','hot'];E.newExpect(F,x);({lead:()=>lead++,dream:()=>dream++,career:()=>career++}[x.expect.kind])();}assert.ok(career>520&&career<680&&lead>140&&dream>140);
 x.traits=['shy','kind'];for(let i=0;i<100;i++){E.newExpect(F,x);assert.notEqual(x.expect.kind,'lead');}
}
// 連續事件經正式 beginWeek / chooseEvent 路徑,連存檔還原也保留排程。
function showScheduled(S,id,st=S.stars[0]){
 for(const x of S.stars){x.loyalty=80;delete x.evalDoubt;delete x.promise;}
 S.pendingEvents=[{id,week:S.week,ctx:st.id}];E.beginWeek(S);assert.equal(S.event.id,id==='salary_poach'?'leave':id);return S.event;
}
{
 const cases=[['salary_request',0,'salary_review'],['salary_request',1,'salary_poach'],['fake_fans',0,'authentic_brand'],['fake_fans',1,'fake_exposed'],['vote_scheme',0,'integrity_award'],['vote_scheme',1,'vote_inquiry'],['contract_renew',0,'contract_terms'],['dance_sprain',0,'rehab_done'],['dance_sprain',1,'injury_worse']];
 for(const [id,choice,next] of cases){
  let S=fresh(9040);S.money=10000;const st=S.stars[0];showScheduled(S,id);E.chooseEvent(S,choice);const pending=S.pendingEvents.find(e=>e.id===next);assert.ok(pending,id+' → '+next);
  const delay=pending.week-S.week;if(id==='salary_request')assert.ok(delay>=3&&delay<=4);if(id==='fake_fans')assert.ok(delay>=4&&delay<=6);if(id==='contract_renew')assert.equal(delay,2);if(id==='dance_sprain')assert.equal(delay,1);
  S=E.migrate(JSON.parse(JSON.stringify(S)));S.week=pending.week;E.beginWeek(S);assert.equal(S.event.id,next==='salary_poach'?'leave':next);assert.equal(S.event.chain,true);assert.ok(S.event.choices.every(c=>c.hint));
  if(next==='salary_poach')assert.match(S.event.text,/加薪/);
  const before=S.stars[0].fans;E.chooseEvent(S,0);assert.equal(S.stats.chains||0,['fake_exposed','vote_inquiry'].includes(next)?0:1);
  if(next==='fake_exposed'||next==='vote_inquiry'){assert.ok(S.stars[0].fans<before);assert.ok(S.pendingEvents.some(e=>e.id==='trust_rebuild'));}
  if(next==='integrity_award')assert.ok(S.trophies.some(t=>t.name==='誠信獎'));
  if(next==='injury_worse'){const x=S.stars[0];assert.equal(E.isFree(x,{days:1,type:'short'}),false);E.autoArrange(S,x.id);assert.ok(x.sched.every(v=>v==='rest'));S.week++;E.beginWeek(S);assert.ok(x.sched.every(v=>v==='rest'));assert.ok(E.setDay(S,x.id,0,'train:dance'));S.week++;E.beginWeek(S);assert.equal(x.sickDays.length,0);}
 }
 // 合約確認的兩種條款都可完成;受傷兩個選項都必須真正休養。
 for(const id of ['contract_terms','injury_worse','rehab_done','fake_exposed','vote_inquiry'])for(let i=0;i<2;i++){
  const S=fresh(9041);S.money=10000;showScheduled(S,id);assert.ok(E.chooseEvent(S,i));assert.equal(S.event,null);if(id==='injury_worse')assert.equal(S.stars[0].restUntil,S.week+2);
 }
 // 跳槽事件優先,到期的故事不能被吃掉。
 const S=fresh(9042);S.stars[0].loyalty=1;E.scheduleEvent(S,'contract_terms',0,S.stars[1]);E.beginWeek(S);assert.equal(S.event.id,'leave');assert.equal(S.pendingEvents.length,1);E.chooseEvent(S,0);E.beginWeek(S);assert.equal(S.event.id,'contract_terms');
}
{
 assert.ok(E.EVENTS.length>=60);assert.equal(new Set(E.EVENTS.map(e=>e.id)).size,E.EVENTS.length);
 // 每個定義實際生成選項,不靠原始碼中 hint 字樣數量判斷。
 for(const ev of E.EVENTS){const S=fresh(9050);S.money=100000;S.week=12;S.stars.forEach(x=>{x.lost=3;x.energy=20;});S.staff.push({role:'editor',lv:3});
  if(ev.id==='kindhelp')S.stars[0].traits=['kind','hot'];const ctx=ev.when(S)||S.stars[0];const ids=Array.isArray(ctx)?ctx.map(x=>x.id):ctx===true?null:ctx.id;
  S.pendingEvents=[{id:ev.id,week:12,ctx:ids}];for(const x of S.stars)x.loyalty=80;
  // 舊事件有雙人 context,透過隨機路徑已測;排程也支援同一格式。
  E.beginWeek(S);assert.equal(S.event.id,ev.id);assert.ok(S.event.choices.length);assert.ok(S.event.choices.every(c=>typeof c.hint==='string'&&c.hint.startsWith('會影響:')));
 }
 let seen=0;for(let seed=1;seed<=80;seed++){const S=fresh(seed),last={};S.pendingEvents=[];for(let i=0;i<28;i++){S.week++;for(const x of S.stars)x.loyalty=80;E.beginWeek(S);if(S.event&&!S.event.chain){assert.ok(S.week-(last[S.event.id]??-99)>=8);last[S.event.id]=S.week;seen++;}S.event=null;S.ops=[];}}
 assert.ok(seen>900&&seen<1750); // 60% 每週事件率的寬鬆統計檢查。
 const S=fresh(9051);S.v=7;delete S.pipeline;delete S.pendingEvents;E.migrate(S);assert.equal(S.v,8);assert.ok(S.pipeline.some(p=>p.week===S.week+1));assert.ok(S.pipeline.some(p=>p.week===S.week+2));assert.deepEqual(S.pendingEvents,[]);assert.ok(S.stars.every(x=>x.expect===null&&x.sprint===null));
 console.log('v3-C:預告/熱門一致、各角色門檻與配角競標、衝刺/期望生命週期、五條故事雙分支、所有事件提示、8 週不重複、60% 頻率與 v8 遷移通過');
}

{
 const added=E.EVENTS.slice(E.EVENTS.findIndex(e=>e.id==='salary_request'));
 assert.ok(added.filter(e=>!e.followup).length>=30);
 for(const ev of added){const count=ev.choices(fresh().stars[0]).length;for(let i=0;i<count;i++){const S=fresh(9070);S.money=100000;showScheduled(S,ev.id);const result=E.chooseEvent(S,i);assert.equal(S.event,null,ev.id);assert.equal(typeof result,'string');for(const st of S.stars)for(const k of ['mood','loyalty','trust','energy','fans'])assert.ok(Number.isFinite(st[k]),ev.id+'.'+k);assert.ok(Number.isFinite(S.money));assert.doesNotThrow(()=>JSON.parse(JSON.stringify(S)));}}
 console.log('v3-C:新增 '+added.length+' 個事件('+added.filter(e=>!e.followup).length+' 個獨立事件),每個選項均可執行並存檔');
}
