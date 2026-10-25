// Node 的假 DOM 煙霧測試，只驗證畫面程式能執行，不代表瀏覽器視覺驗收。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as E from './engine.js';
import * as D from './data.js';
import { Bmp, toCanvas } from '../../shared/pixelkit/core.js';
import { makeFrame, FW, FH } from '../../shared/pixelkit/character.js';
import { KIT as ST, makeAccessory, wall as stWall } from '../../shared/pixelkit/studio.js';
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
document.getElementById('tabs').children=['ops','sched','stars','feed','co'].map(tab=>Object.assign(node(),{dataset:{tab}}));
globalThis.document=document;globalThis.devicePixelRatio=1;globalThis.ImageData=class {constructor(data,w,h){Object.assign(this,{data,width:w,height:h});}};
const sandbox={E,D,Bmp,toCanvas,makeFrame,FW,FH,ST,makeAccessory,stWall,Camera,bindPointer,document,devicePixelRatio:1,ImageData:globalThis.ImageData,
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
botWeek(S);const R=E.endWeek(S);AS.play(R);assert.equal(document.getElementById('nextBtn').disabled,true);
AS.tick(10);AS.skip();assert.equal(document.getElementById('nextBtn').disabled,false);assert.ok(document.getElementById('repBox').classList.contains('on'));
S.money=100000;S.lv=4;for(const type of ['sing','act','talk','lounge'])E.buildFloor(S,type);AS.render();AS.tick(1);
assert.equal(AS.cam.worldH,S.floors.length*96+128);
console.log('假 DOM 煙霧測試：五個分頁、大樓繪製、播放、跳過及擴樓可執行（未做瀏覽器視覺驗收）');
