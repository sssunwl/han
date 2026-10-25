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
  const m=D.MEDIA[type];const op={id,type,topic:S.trend.topic,title:'測試作品',days:m.days,weeks:m.weeks,left:m.weeks,w:m.w||{sing:1},sw:m.sw,slots:m.slots.map(role=>({role,who:null})),status:'open',bids:[],yields:[],pay:100,fans:100,log:{}};
  S.ops.push(op);return op;
}
{
  const S=fresh(), st=S.stars[0];S.ops=[];
  assert.equal(S.v,4);assert.equal(S.floors.length,5);assert.equal(st.sched.length,7);assert.equal(st.sched[6],'rest');
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
  assert.equal(E.buildFloor(S,'sing'),'公司要升級才能再往上蓋');
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
  E.migrate(S);assert.equal(S.v,4);assert.equal(S.floors.length,9);assert.equal(op.left,2);assert.equal(op.days,5);
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
  E.migrate(S); assert.equal(S.v, 4); assert.deepEqual(S.groups, []); assert.equal(S.sns.strategy, 'vlog');
  for (const k of ['mixing_console', 'monitor_wall', 'sns_wall', 'heart_sign', 'red_carpet', 'award_trophy', 'confetti', 'album_cover']) { const it = KIT[k], b = it.make(); assert.equal(b.w, it.w); assert.equal(b.h, it.h); }
}
console.log('第三階段:製作部企劃/取消/不被接走/分潤遞減、排行、打歌、SNS、團體/C 位/默契、頒獎、遷移、新素材:通過');
