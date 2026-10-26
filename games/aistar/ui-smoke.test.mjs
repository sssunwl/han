import * as O from './office.js';
import { Placer } from '../../shared/tycoon/place.js';
import { goTo,moveAgent } from '../../shared/tycoon/agent.js';
// Node 的假 DOM 煙霧測試，只驗證畫面程式能執行，不代表瀏覽器視覺驗收。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as E from './engine.js';
import * as D from './data.js';
import { Bmp, toCanvas } from '../../shared/pixelkit/core.js';
import { makeFrame, FW, FH } from '../../shared/pixelkit/character.js';
import { KIT as ST, makeAccessory, wall as stWall } from '../../shared/pixelkit/studio.js';
import { STREET_KIT } from '../../shared/pixelkit/street.js';
import { Camera } from '../../shared/tycoon/camera.js';
import { bindPointer } from '../../shared/tycoon/input.js';
import { botWeek } from '../../tools/aistar_autoplay.mjs';
const noop=()=>{};
const context2d=new Proxy({createLinearGradient:()=>({addColorStop:noop})},{get:(t,k)=>t[k]||noop});
const nodes=new Map();
function node(id='') {
  const classes=new Set(), listeners={};
  return {id,style:{setProperty:noop},dataset:{},children:[],innerHTML:'',textContent:'',hidden:false,disabled:false,clientWidth:375,offsetWidth:130,offsetHeight:45,scrollTop:0,
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
    addEventListener:(k,f)=>{(listeners[k]||=[]).push(f);},removeEventListener:noop,setPointerCapture:noop,appendChild:noop,remove:noop,
    getBoundingClientRect:()=>({left:0,top:0,width:375,height:390}),getContext:()=>context2d,toDataURL:()=> 'data:image/png;base64,test',
    querySelectorAll:()=>[],click(){listeners.click?.forEach(f=>f({target:{closest:()=>this}}));},fire(k,e){listeners[k]?.forEach(f=>f(e));}};
}
const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},createElement:()=>node(),addEventListener:noop};
for(const match of readFileSync(new URL('./index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g))document.getElementById(match[1]);
document.getElementById('tabs').children=['ops','stars','prod','build','co'].map(tab=>Object.assign(node(),{dataset:{tab}}));
globalThis.document=document;globalThis.devicePixelRatio=1;globalThis.ImageData=class {constructor(data,w,h){Object.assign(this,{data,width:w,height:h});}};
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
const sandbox={localStorage,O,Placer,goTo,moveAgent,STREET_KIT,E,D,Bmp,toCanvas,makeFrame,FW,FH,ST,makeAccessory,stWall,Camera,bindPointer,document,devicePixelRatio:1,ImageData:globalThis.ImageData,
  console,performance,Date,Math,Map,Set,addEventListener:noop,ResizeObserver:class {observe(){}},requestAnimationFrame:noop,setInterval:noop,setTimeout:()=>1,clearTimeout:noop,
  saveKey:()=> 'test',currentProfile:()=>({name:'測試'}),tone:noop,fanfare:noop,renderWho:noop,lockGestures:noop,escapeHTML:s=>String(s),
  audioPrefs:{sfx:false,music:'off'},saveAudioPrefs:noop,TRACKS:{},playMusic:noop,stopMusic:noop,nowPlaying:()=>null,
  loadBest:async()=>null,saveBoth:()=>({ls:true,idb:Promise.resolve(true)}),encodeSave:async()=>'',decodeSave:async()=>null,
  confirm:()=>true,window:{},navigator:{}};
const code=readFileSync(new URL('./main.js',import.meta.url),'utf8').replace(/^import .+;\n/gm,'').replace('import.meta.env?.DEV !== false','true');
vm.createContext(sandbox);vm.runInContext(code,sandbox,{filename:'main.js'});
const AS=sandbox.window.AS, S=E.newGame({seed:1234});AS.boot(S);
for(const b of document.getElementById('tabs').children) document.getElementById('tabs').fire('click',{target:{closest:()=>b}});
AS.tick(1);
botWeek(S);const R=E.endWeek(S);AS.play(R);assert.match(document.getElementById('nextBtn').textContent,/跳過/);
AS.tick(10);AS.skip();assert.equal(document.getElementById('nextBtn').disabled,false);assert.ok(document.getElementById('repBox').classList.contains('on'));
S.money=100000;S.lv=4;S.land=Array.from({length:24},(_,i)=>`${i%4},${Math.floor(i/4)}`);for(const type of ['sing','act','talk','lounge'])E.buildFloor(S,type);AS.render();AS.tick(1);
assert.equal(AS.cam.worldH,1760);
console.log('假 DOM 煙霧測試：五個抽屜、地圖繪製、播放、跳過及擴建可執行（未做瀏覽器視覺驗收）');

S.money=100000;S.lv=4;S.land=Array.from({length:24},(_,i)=>`${i%4},${Math.floor(i/4)}`);E.buildFloor(S,'style');E.buildFloor(S,'scout');E.hire(S,'trainer','charm');E.hire(S,'manager');E.hire(S,'chef');
S.floors.find(f=>f.type==='scout').lv=3;E.scoutWeek(S);const candidate=S.scouted[0];E.signScouted(S,candidate.id);
for(const b of document.getElementById('tabs').children){document.getElementById('tabs').fire('click',{target:{closest:()=>b}});if(b.dataset.tab==='co'){assert.match(document.getElementById('panel').innerHTML,/新人/);assert.match(document.getElementById('panel').innerHTML,/員工/);}if(b.dataset.tab==='stars')assert.match(document.getElementById('panel').innerHTML,/下次評鑑/);if(b.dataset.tab==='prod'){assert.match(document.getElementById('panel').innerHTML,/製作部/);assert.match(document.getElementById('panel').innerHTML,/團體/);assert.match(document.getElementById('panel').innerHTML,/SNS/);}}
AS.tick(1);AS.openTrainer();assert.match(document.getElementById('roomBody').innerHTML,/魅力/);
S.week=4;candidate.joined=1;const evaluation={week:4,items:[]};E.evaluate(S,evaluation);AS.openEvaluation(evaluation);assert.match(document.getElementById('roomBody').innerHTML,/分/);
console.log('第二階段假 DOM：星探、員工、明星分區、魅力訓練師及評鑑視窗可 render');

botWeek(S);const workersReport=E.endWeek(S);AS.play(workersReport);AS.tick(27);AS.skip();console.log('員工白天、中午、下班與隔日移動：假 DOM 執行通過');

AS.boot(E.newGame({seed:998}));assert.match(AS.renderPartners(),/蓋 🤝 會議室/);
AS.S.money=100000;AS.S.lv=4;AS.S.land=Array.from({length:24},(_,i)=>`${i%4},${Math.floor(i/4)}`);E.buildFloor(AS.S,'meeting');AS.S.floors.at(-1).lv=3;E.offerWeek(AS.S);
assert.match(AS.renderPartners(),/接受/);assert.match(AS.renderPartners(),/友好度/);
AS.openVisit(0);assert.match(document.getElementById('roomBody').innerHTML,/visitCanvas/);assert.match(document.getElementById('roomBody').innerHTML,/已合作/);
AS.openNpc(AS.S.rivals[0].stars[0].id);assert.match(document.getElementById('roomBody').innerHTML,/舞蹈/);AS.tick(1);
console.log('第四階段假 DOM:合作公司/邀請卡、參觀 canvas、NPC 資料可 render');

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.equal([...html.matchAll(/data-tab="/g)].length,5);assert.ok(!html.includes('data-tab="feed"'));assert.match(html,/id="logBtn"/);assert.match(html,/id="notifications"/);
const U=E.newGame({seed:777});U.money=100000;U.lv=4;U.district='harbor';while(!U.walkins.length)E.walkinWeek(U);AS.boot(U);AS.tick(1);
AS.openWalkin(U.walkins[0].id);assert.match(document.getElementById('roomBody').innerHTML,/簽約/);assert.match(document.getElementById('roomBody').innerHTML,/婉拒/);assert.match(document.getElementById('roomBody').innerHTML,/潛力/);
const rookie=U.walkins.find(st=>st.trainee);if(rookie)assert.match(AS.walkinHTML(rookie),/\?/);
document.getElementById('logBtn').onclick();assert.equal(document.getElementById('roomTitle').textContent,'📜 紀錄');assert.match(document.getElementById('roomBody').innerHTML,/class="feed"/);
E.feed(U,null,'新通知','sys');AS.render();assert.equal(document.getElementById('bFeed').style.display,'');
for(let i=0;i<5;i++)AS.notify({text:'公司通知 '+i});assert.equal(vm.runInContext('notifications.length',sandbox),3);AS.tick(5);assert.equal(vm.runInContext('notifications.length',sandbox),0);
const company=document.getElementById('tabs').children.find(b=>b.dataset.tab==='co');document.getElementById('tabs').fire('click',{target:{closest:()=>company}});assert.match(document.getElementById('panel').innerHTML,/🚚 地區/);
assert.equal(AS.cam.worldW,1024);assert.equal(AS.cam.worldH,1760);
// 走到街道端點,返程使用同一張通行表。
const star=U.stars[0];star.sched[0]='off';AS.tick(20);let actor=AS.actors.get(star.id);assert.ok(actor.x<0);assert.equal(Math.floor(actor.y/32),48);assert.equal(actor.hide,0);
star.sched[0]='rest';AS.tick(20);actor=AS.actors.get(star.id);assert.equal(actor.fi,U.floors.findIndex(f=>f.type==='dorm'));assert.equal(actor.hide,0);
console.log('v3-A 假 DOM:抽屜、紀錄/紅點、3 則通知與到期、自薦卡、地區與進出人行道通過');

const B=E.newGame({seed:733});AS.boot(B);AS.openAssistant();assert.match(document.getElementById('roomBody').innerHTML,/教學提示:開/);assert.match(document.getElementById('roomBody').innerHTML,/3,000/);assert.ok(AS.actors.has('assistant'));
assert.match(AS.adviceCard(),/本週建議/);B.adviceDismissedWeek=B.week;assert.equal(AS.adviceCard(),'');B.week++;assert.match(AS.adviceCard(),/本週建議/);
// 關閉／重開遊戲保留已看過的教學，只有按知道了才記錄。
const tip=document.getElementById('tutorialCard');tip.hidden=true;tip.innerHTML='';AS.showTip('ops');assert.equal(tip.hidden,false);document.getElementById('tipUnderstood').onclick();assert.ok(B.seenTips.includes('ops'));tip.hidden=true;tip.innerHTML='';AS.showTip('ops');assert.equal(tip.hidden,true);AS.showTip('sched');assert.match(tip.innerHTML,/每週選一件事/);document.getElementById('tipUnderstood').onclick();
const bstar=B.stars[0];AS.openStar(bstar.id);assert.match(document.getElementById('starBody').innerHTML,/📈 發展分析/);assert.match(document.getElementById('starBody').innerHTML,/下一個目標/);assert.doesNotMatch(AS.analysisHTML(bstar),/🧭 適性/);
B.assistant.lv=2;assert.match(AS.analysisHTML(bstar),/🧭 適性/);AS.openPicker(B.ops[0].id,0);assert.match(document.getElementById('pickList').innerHTML,/會影響:/);
B.event={id:'test',title:'測試',text:'',choices:[{label:'休息',hint:'會影響:體力 ↑ 心情 ↑'}]};AS.openEvent();assert.match(document.getElementById('evChoices').innerHTML,/體力 ↑/);
B.tipsOff=true;AS.openEvent();assert.doesNotMatch(document.getElementById('evChoices').innerHTML,/會影響/);AS.openPicker(B.ops[0].id,0);assert.doesNotMatch(document.getElementById('pickList').innerHTML,/會影響/);
B.tipsOff=false;bstar.sched=Array(7).fill('rest');const prior=AS.scheduleHTML();assert.match(prior,/scheduleStats/);assert.match(prior,/🎤\d\.\d/);assert.match(prior,/<b>[\s\S]*?⚡/);assert.match(prior,/體力 ↑↑/);assert.match(prior,/data-plan="train:sing"/);assert.match(prior,/weekStrip/);AS.E.setPlan(B,bstar.id,'train:dance');assert.equal(bstar.sched[6],'rest');assert.equal(bstar.sched.filter(v=>v==='train:dance').length>=5,true);assert.notEqual(AS.scheduleHTML(),prior);assert.match(AS.scheduleHTML(),/本週 .*? \+\d\.\d/);assert.match(AS.scheduleHTML(),/class="on">💃/);
assert.match(html,/repeat\(7,minmax\(34px/);B.week=30;B.assistant.lv=0;assert.equal(AS.adviceCard(),'');AS.openAssistant();assert.match(document.getElementById('roomBody').innerHTML,/升級成分析師/);
console.log('v3-B 假 DOM:小助理、建議卡/收起、首次教學、事件/選人 hint 開關、分析頁與行程即時指數通過');
// 實際小助理按鈕、候選揭露層級、推薦與日夜位置。
B.week=2;B.money=3000;B.assistant.lv=0;B.event=null;
document.getElementById('roomBody').onclick({target:{closest:()=>({dataset:{assistantUp:'1'}})}});assert.equal(B.assistant.lv,1);assert.equal(B.money,0);
const candidateB={...B.stars[1],id:'candidateB',trainee:true,signCost:200};B.walkins=[candidateB];assert.match(AS.walkinHTML(candidateB),/潛力 ★/);assert.match(AS.walkinHTML(candidateB),/:\?/);B.assistant.lv=2;assert.doesNotMatch(AS.walkinHTML(candidateB),/:\?/);
B.scouted=[candidateB];const scoutHTML=vm.runInContext('recruitmentHTML()',sandbox);for(const skill of D.SKILL_IDS)assert.ok(scoutHTML.includes(D.SKILLS[skill].name+' '+candidateB.skills[skill].toFixed(1)));
B.assistant.lv=3;assert.match(vm.runInContext('opCard(S.ops[0])',sandbox),/🔍 分析師推薦:/);
document.getElementById('roomBody').onclick({target:{closest:()=>({dataset:{tipsToggle:'1'}})}});assert.equal(B.tipsOff,true);assert.equal(tip.hidden,true);assert.doesNotMatch(AS.scheduleHTML(),/體力 ↑↑/);
const assistantDay=vm.runInContext('assistantTarget()',sandbox);assert.equal(assistantDay.fi,0);assert.equal(Math.floor(assistantDay.x/32),B.floors[0].x+1);
assert.equal(vm.runInContext('playback={t:2};assistantTarget().act',sandbox),'eat');assert.equal(vm.runInContext('playback={t:3.6};assistantTarget().outside',sandbox),true);vm.runInContext('playback=null',sandbox);
B.tipsOff=false;tip.hidden=true;tip.innerHTML='';B.seenTips=[];for(const key of ['ops','sched','stars','prod','co','event','evaluation','awards','offer','walkin'])AS.showTip(key);
for(let i=0;i<10;i++)document.getElementById('tipUnderstood').onclick();assert.equal(new Set(B.seenTips).size,10);
console.log('v3-B 補驗:升級與開關按鈕、候選揭露、Lv3 推薦、午餐/下班與十種教學排隊通過');

const C=E.newGame({seed:9060});AS.boot(C);C.tipsOff=false;C.event=null;
let workHTML=vm.runInContext('opsHTML()',sandbox);assert.match(workHTML,/🔮 工作預告/);assert.match(workHTML,/🙋 接案期望/);assert.match(workHTML,/下週/);assert.match(workHTML,/兩週後/);assert.match(workHTML,/剩 5 週/);
C.stars[0].expect.left=1;assert.match(vm.runInContext('workSections()',sandbox),/color:#b83a4e/);
const fold={dataset:{foldWork:'pipeline'}};document.getElementById('panel').fire('click',{target:{closest:sel=>sel.includes('[data-fold-work]')?fold:null}});assert.equal(storage.get('aistar-fold-pipeline'),'1');assert.doesNotMatch(vm.runInContext('workSections()',sandbox),/兩週後/);
document.getElementById('panel').fire('click',{target:{closest:sel=>sel.includes('[data-fold-work]')?fold:null}});assert.equal(storage.get('aistar-fold-pipeline'),'0');assert.match(vm.runInContext('workSections()',sandbox),/兩週後/);
const cstar=C.stars[0];C.ops=[];const gated={id:'gate',type:'drama',title:'預告短劇',topic:C.trend.topic,req:{skill:'act',target:4},w:{act:1},slots:[{role:'主角',who:null},{role:'配角',who:null}],days:4,weeks:1,left:1,status:'open',bids:[{id:cstar.id,text:'我想參加',reason:'career',supportOnly:true}],yields:[],pay:1000,fans:1000};C.ops.push(gated);cstar.skills.act=3.2;cstar.sched=Array(7).fill('rest');cstar.jobs=[];cstar.expect={kind:'career',media:'drama',left:2};
AS.openPicker(gated.id,0);let pickHTML=document.getElementById('pickList').innerHTML;assert.match(pickHTML,/演技差 0.8/);assert.match(pickHTML,new RegExp('disabled data-pk="'+cstar.id+'"'));assert.match(document.getElementById('pickHow').textContent,/演技 ≥ 4/);
assert.match(vm.runInContext('opCard(S.ops[0])',sandbox),/⭐ 期望/);assert.match(vm.runInContext('opCard(S.ops[0])',sandbox),new RegExp('disabled data-assign="gate" data-slot="0" data-star="'+cstar.id+'"'));
AS.openPicker(gated.id,1);pickHTML=document.getElementById('pickList').innerHTML;assert.doesNotMatch(pickHTML,new RegExp('disabled data-pk="'+cstar.id+'"'));
cstar.sprint={skill:'act',target:4,title:gated.title,week:C.week+2,left:2};assert.match(AS.scheduleHTML(),/🎯 衝刺:演技 3.2 → 4\(2 週\)/);
assert.match(html,/\.expectRow\{display:flex/);assert.match(html,/overflow-wrap:anywhere/);assert.match(code,/if \(true\)/);
console.log('v3-C 假 DOM:工作預告/接案期望與收合記憶、倒數紅色、主角門檻差額/停用選鈕、配角不受限、期望標記及行程衝刺通過');

// 回歸剛修好的視窗互斥:提示卡必須等其他視窗關閉才顯示。
C.seenTips=[];C.tipsOff=false;tip.hidden=true;tip.innerHTML='';vm.runInContext('tutorialQueue=[]',sandbox);let modalBlock=true;document.querySelector=()=>modalBlock?{}:null;AS.showTip('ops');assert.equal(tip.hidden,true);assert.ok(vm.runInContext("tutorialQueue.includes('ops')",sandbox));modalBlock=false;AS.render();assert.equal(tip.hidden,false);assert.match(tip.innerHTML,/📋 機會/);assert.equal(C.seenTips.includes('ops'),false);document.getElementById('tipUnderstood').onclick();assert.ok(C.seenTips.includes('ops'));
console.log('提示卡在其他視窗開啟時排隊,關閉後才顯示:回歸通過');

// v4: 抽屜、建造交易、買地與搬移。保留上面的歷代功能驗收。
const V=E.newGame({seed:44});V.money=100000;V.lv=4;AS.boot(V);
assert.match(html,/height:100dvh/);assert.match(html,/grid-template-columns:repeat\(5,1fr\) 1.35fr/);assert.equal((html.match(/data-tab="/g)||[]).length+1,6);
AS.openBuild();assert.ok(document.getElementById('sheet').classList.contains('on'));assert.match(document.getElementById('panel').innerHTML,/買地/);assert.match(document.getElementById('panel').innerHTML,/data-place="sing"/);
AS.openLand();assert.equal(AS.landMode,true);let chunk;for(let cy=0;cy<6;cy++)for(let cx=0;cx<4;cx++)if(O.adjacentLand(V,cx,cy))chunk={cx,cy};
AS.pointerHandlers.onTap(chunk.cx*256+10,chunk.cy*256+10);const owned=V.land.length;AS.confirmPlace();assert.equal(V.land.length,owned+1);
AS.startRoom('sing');assert.ok(AS.placer.active);AS.cancelPlace();assert.equal(AS.placer.active,false);const n=V.floors.length,p=O.findSpot(V,'sing');assert.ok(p);AS.startRoom('sing');AS.placer.moveTo(p.x,p.y);AS.confirmPlace();assert.equal(V.floors.length,n+1);
assert.equal(AS.pointerHandlers.onHold((V.floors[0].x+1)*32,(V.floors[0].y+1)*32),false);
const f=V.floors[1],old={x:f.x,y:f.y};assert.equal(AS.pointerHandlers.onHold((f.x+1)*32,(f.y+1)*32),true);AS.placer.moveTo(-1,0);AS.confirmPlace();assert.ok(AS.placer.active);AS.cancelPlace();assert.deepEqual({x:f.x,y:f.y},old);
let moved;for(let y=0;y<48&&!moved;y++)for(let x=0;x<32&&!moved;x++)if((x!==f.x||y!==f.y)&&!O.canPlaceRoom(V,f.type,x,y,1))moved={x,y};assert.ok(moved);assert.equal(AS.pointerHandlers.onHold((f.x+1)*32,(f.y+1)*32),true);const moveMoney=V.money;AS.placer.moveTo(moved.x,moved.y);AS.confirmPlace();assert.equal(f.x,moved.x);assert.equal(f.y,moved.y);assert.equal(V.money,moveMoney);
AS.openFloor(1);assert.doesNotMatch(document.getElementById('roomTitle').textContent,/\dF/);
AS.tick(20);const walking=AS.actors.get(V.stars[0].id),before={x:walking.x,y:walking.y};V.stars[0].sched[0]='off';AS.tick(.05);assert.ok(Math.hypot(walking.x-before.x,walking.y-before.y)<=8);AS.tick(30);assert.equal(Math.floor(walking.y/32),48);
console.log('v4 假 DOM:六鍵、全螢幕樣式、五抽屜、建造確認/取消、買地、長按搬移及人物逐步行走通過');
