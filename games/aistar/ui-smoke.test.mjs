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
    addEventListener:(k,f)=>{listeners[k]=f;},removeEventListener:noop,setPointerCapture:noop,appendChild:noop,remove:noop,
    getBoundingClientRect:()=>({left:0,top:0,width:375,height:390}),getContext:()=>context2d,toDataURL:()=> 'data:image/png;base64,test',
    querySelectorAll:()=>[],click(){listeners.click?.({target:{closest:()=>this}});},fire(k,e){listeners[k]?.(e);}};
}
const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},createElement:()=>node(),addEventListener:noop};
for(const match of readFileSync(new URL('./index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g))document.getElementById(match[1]);
document.getElementById('tabs').children=['ops','sched','stars','prod','co'].map(tab=>Object.assign(node(),{dataset:{tab}}));
globalThis.document=document;globalThis.devicePixelRatio=1;globalThis.ImageData=class {constructor(data,w,h){Object.assign(this,{data,width:w,height:h});}};
const sandbox={STREET_KIT,E,D,Bmp,toCanvas,makeFrame,FW,FH,ST,makeAccessory,stWall,Camera,bindPointer,document,devicePixelRatio:1,ImageData:globalThis.ImageData,
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
S.money=100000;S.lv=4;for(const type of ['sing','act','talk','lounge'])E.buildFloor(S,type);AS.render();AS.tick(1);
assert.equal(AS.cam.worldH,S.floors.length*96+184);
console.log('假 DOM 煙霧測試：五個分頁、大樓繪製、播放、跳過及擴樓可執行（未做瀏覽器視覺驗收）');

S.money=100000;S.lv=4;E.buildFloor(S,'style');E.buildFloor(S,'scout');E.hire(S,'trainer','charm');E.hire(S,'manager');E.hire(S,'chef');
S.floors.find(f=>f.type==='scout').lv=3;E.scoutWeek(S);const candidate=S.scouted[0];E.signScouted(S,candidate.id);
for(const b of document.getElementById('tabs').children){document.getElementById('tabs').fire('click',{target:{closest:()=>b}});if(b.dataset.tab==='co'){assert.match(document.getElementById('panel').innerHTML,/新人/);assert.match(document.getElementById('panel').innerHTML,/員工/);}if(b.dataset.tab==='stars')assert.match(document.getElementById('panel').innerHTML,/下次評鑑/);if(b.dataset.tab==='prod'){assert.match(document.getElementById('panel').innerHTML,/製作部/);assert.match(document.getElementById('panel').innerHTML,/團體/);assert.match(document.getElementById('panel').innerHTML,/SNS/);}}
AS.tick(1);AS.openTrainer();assert.match(document.getElementById('roomBody').innerHTML,/魅力/);
S.week=4;candidate.joined=1;const evaluation={week:4,items:[]};E.evaluate(S,evaluation);AS.openEvaluation(evaluation);assert.match(document.getElementById('roomBody').innerHTML,/分/);
console.log('第二階段假 DOM：星探、員工、明星分區、魅力訓練師及評鑑視窗可 render');

botWeek(S);const workersReport=E.endWeek(S);AS.play(workersReport);AS.tick(27);AS.skip();console.log('員工白天、中午、下班與隔日移動：假 DOM 執行通過');

AS.boot(E.newGame({seed:998}));assert.match(AS.renderPartners(),/蓋 🤝 會議室/);
AS.S.money=100000;AS.S.lv=4;E.buildFloor(AS.S,'meeting');AS.S.floors.at(-1).lv=3;E.offerWeek(AS.S);
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
assert.equal(AS.cam.worldW,416);assert.equal(AS.cam.worldH,U.floors.length*96+184);
// 出門與回來必須走過人行道,不能在大廳消失。
const star=U.stars[0];star.sched[0]='off';AS.tick(6);let actor=AS.actors.get(star.id);assert.ok(actor.x < -48 || actor.x > 368);assert.equal(actor.hide,0);assert.equal(Math.round(actor.y),128+(U.floors.length-1)*96+108);
star.sched[0]='rest';AS.tick(10);actor=AS.actors.get(star.id);assert.equal(actor.fi,U.floors.findIndex(f=>f.type==='dorm'));assert.ok(actor.x>=0&&actor.x<=320);assert.equal(actor.hide,0);
console.log('v3-A 假 DOM:5 分頁、紀錄/紅點、3 則通知與到期、自薦卡、地區、416 街景及進出人行道通過');
