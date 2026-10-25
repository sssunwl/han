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
  assert.equal(S.v,2);assert.equal(S.floors.length,5);assert.equal(st.sched.length,7);assert.equal(st.sched[6],'rest');
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
  E.migrate(S);assert.equal(S.v,2);assert.equal(S.floors.length,9);assert.equal(op.left,2);assert.equal(op.days,5);
  assert.equal(S.stars[0].sched.filter(v=>v==='job:test').length,5);assert.equal(S.floors[1].lv,3);assert.equal(E.roomLv(S,'dance'),3);
  assert.equal(S.stars[1].sched[0],'train:talk');assert.equal(S.stars[1].sched[6],'rest');assert.equal(S.fac,undefined);
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
