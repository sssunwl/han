import * as O from './office.js';
import { Placer } from '../../shared/tycoon/place.js';
import { goTo, moveAgent } from '../../shared/tycoon/agent.js';
/* ============================================================
   AI 明星養成:畫面
   全螢幕俯視辦公室、走廊尋路、房間擺放與六鍵工具列。
   抽屜保留機會、明星行程、製作及公司管理。
   遊戲規則全部在 engine.js,這裡只負責畫出來、把玩家的點擊交給引擎。
   ============================================================ */
import '../../shared/offline.js';
import { saveKey, currentProfile } from '../../shared/profile.js';
import { tone, fanfare, renderWho, lockGestures, escapeHTML, audioPrefs, saveAudioPrefs } from '../../shared/kit.js';
import { TRACKS, playMusic, stopMusic, nowPlaying } from '../../shared/music.js';
import { Bmp, toCanvas } from '../../shared/pixelkit/core.js';
import { makeFrame, FW, FH } from '../../shared/pixelkit/character.js';
import { KIT as ST, makeAccessory, wall as stWall } from '../../shared/pixelkit/studio.js';
import { STREET_KIT } from '../../shared/pixelkit/street.js';
import { Camera } from '../../shared/tycoon/camera.js';
import { bindPointer } from '../../shared/tycoon/input.js';
import * as E from './engine.js';
import * as D from './data.js';
import { loadBest, saveBoth, encodeSave, decodeSave } from './store.js';

const $ = id => document.getElementById(id);
const esc = escapeHTML;
const fmt = n => Math.round(n).toLocaleString('en-US');
const SAVE_KEY = saveKey('aistar', 'save1');
lockGestures();
renderWho($('who'), '在經營');

let S = null, running = false, tab = 'ops', feedSeen = 0, bubbleSeen = 0;

// ---------- 小音效 ----------
const sfx = {
  tap: () => tone(620, 0.04, 'square', 0.05),
  pick: () => { tone(660, 0.08, 'triangle', 0.14); setTimeout(() => tone(880, 0.1, 'triangle', 0.14), 70); },
  lose: () => tone(300, 0.18, 'sine', 0.08, -80),
  coin: () => { tone(1040, 0.06, 'square', 0.06); setTimeout(() => tone(1400, 0.08, 'square', 0.06), 60); },
  bad: () => tone(200, 0.15, 'sawtooth', 0.05),
};
function pickMusic() {
  if (!running || audioPrefs.music === 'off') { stopMusic(); return; }
  const want = TRACKS[audioPrefs.music] ? audioPrefs.music : 'matsuri';
  if (nowPlaying() !== want) playMusic(want);
}
function soundIcon() { $('soundBtn').textContent = !audioPrefs.sfx && audioPrefs.music === 'off' ? '🔇' : audioPrefs.music === 'off' ? '🔈' : '🔊'; }
$('soundBtn').addEventListener('click', () => {
  // 🔊 全開 → 🔈 只有音效 → 🔇 全關 → 🔊
  if (audioPrefs.music !== 'off') audioPrefs.music = 'off';
  else if (audioPrefs.sfx) audioPrefs.sfx = false;
  else { audioPrefs.sfx = true; audioPrefs.music = 'auto'; }
  saveAudioPrefs(); soundIcon(); pickMusic(); sfx.tap();
  toast({ '🔊': '音樂和音效都開', '🔈': '只開音效', '🔇': '全部靜音' }[$('soundBtn').textContent]);
});
soundIcon();

let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); }

// ---------- 頭像(小人 + 配件,轉成圖片快取) ----------
const ptCache = new Map();
function portrait(st, dir = 'down', col = 'idle0') {
  const k = [st.look.skin, st.look.hair, st.look.hairColor, st.look.cloth, st.acc, st.glow, dir, col].join('|');
  if (!ptCache.has(k)) {
    const b = new Bmp(FW, FH);
    b.blit(makeFrame(st.look, dir, col), 0, 0);
    if (!st.role && dir !== 'up') b.blit(makeAccessory(st.acc, st.glow), 0, (col === 'walk1' || col === 'walk3') ? 1 : 0, dir === 'right');
    const c = toCanvas(b);
    ptCache.set(k, { canvas: c, url: dir === 'down' && col === 'idle0' ? c.toDataURL() : null });
  }
  return ptCache.get(k);
}
const careerTag=st=>`${D.CAREERS[st.career].icon} ${D.CAREERS[st.career].name} ${'●'.repeat(st.careerStep)}${'○'.repeat(3-st.careerStep)}`;
const ptImg = (st, cls = 'pt') => st ? `<img class="${cls}" style="--g:${st.glow}22" src="${portrait(st).url}" alt="">` : '';
const nameTag = st => `<b style="--c:${st.glow};color:${st.glow}">${esc(st.name)}</b>`;

// 世界座標為 32px 方格,房間索引保持與引擎相同。
const TX = 0;
const cv = $('cv'), ctx = cv.getContext('2d');
const cam = new Camera(cv, { worldW:1024, worldH:1760, maxScale:3 });
const view = {ctx, get w(){return cam.w;}, get h(){return cam.h;}, get dpr(){return cam.dpr;}};
let sceneKey='', bgCanvas=null, playback=null, speed=1, sceneTime=0;
const actors = new Map(), sprCache={};
const spr = k => sprCache[k] ||= toCanvas(ST[k].make());

const roomIndex = type => S.floors.findIndex(f=>f.type===type);
// 每種房間都有四個可用站位；家具按等級累加。
const ROOMS = {
 meeting:{color:'#a29aba',kind:'wood',furniture:[['meeting_table',94,45,1],['schedule_board',16,10,1],['plant_studio',239,25,2],['projector_screen',120,2,3],['handshake_sign',205,12,1]],spots:[[80,78],[115,80],[175,78],[220,80]]},
 style:{color:'#bc93af',kind:'wood',furniture:[['vanity',16,25,1],['clothes_rack',90,27,1],['full_mirror',205,7,2],['runway',101,70,3],['spotlight',250,18,3]],spots:[[45,78],[95,80],[164,78],[224,80]]},
 scout:{color:'#8fa9b2',kind:'wood',furniture:[['desk_pc',24,26,1],['whiteboard_map',125,14,1],['desk_pc',204,28,2],['phone_desk',92,44,3]],spots:[[48,77],[102,80],[165,79],[231,78]]},
 lobby:{color:'#7889b2',kind:'studio', furniture:[['reception',18,30,1],['sofa',112,44,1],['plant_studio',236,24,2],['trophy_case',204,12,3]], spots:[[94,76],[160,78],[202,76],[238,80]]},
 studio:{color:'#7476aa',kind:'studio', furniture:[['green_screen',6,9,1],['camera',78,30,1],['ring_light',245,28,1],['podcast_desk',124,28,1],['stream_desk',206,30,2],['neon_sign',104,4,3]], spots:[[40,77],[146,74],[190,76],[236,78]]},
 dance:{color:'#b68eb8',kind:'wood', furniture:[['dance_mirror',12,5,1],['speaker',224,23,2],['dance_mirror',116,5,3],['neon_sign',180,0,3]], spots:[[40,78],[94,80],[150,78],[202,81]]},
 sing:{color:'#8e92b7',kind:'carpet', furniture:[['mic_stand',40,25,1],['speaker',204,23,2],['mic_stand',134,25,3],['neon_sign',93,2,3]], spots:[[76,78],[112,82],[168,78],[238,82]]},
 act:{color:'#83a790',kind:'wood', furniture:[['green_screen',8,8,1],['camera',112,24,1],['clapper',160,52,2],['green_screen',192,8,3]], spots:[[39,78],[94,80],[170,79],[225,80]]},
 talk:{color:'#b9a58c',kind:'wood', furniture:[['podcast_desk',18,32,1],['mic_stand',116,24,2],['podcast_desk',184,32,3]], spots:[[36,73],[66,73],[200,73],[232,73]]},
 cafe:{color:'#d0aa87',kind:'wood', furniture:[['food_counter',8,18,1],['dining_table',94,56,1],['dining_table',181,56,1],['fridge',250,9,2],['dining_table',10,58,3]], spots:[[108,72],[140,72],[195,72],[227,72]]},
 dorm:{color:'#8d8db5',kind:'carpet', furniture:[['bunk_bed',8,30,1],['bed',111,24,1],['bunk_bed',173,30,2],['plant_studio',252,27,3]], spots:[[36,71],[91,75],[143,73],[211,74]]},
 production:{color:'#6d6a9e',kind:'studio', furniture:[['mixing_console',18,38,1],['monitor_wall',118,4,1],['desk_pc',200,30,2],['speaker',90,24,3]], spots:[[60,80],[150,80],[232,80],[110,82]]},
 sns:{color:'#d79abd',kind:'carpet', furniture:[['sns_wall',14,4,1],['desk_pc',100,30,1],['heart_sign',188,10,2],['ring_light',240,28,3]], spots:[[64,80],[130,78],[200,80],[252,80]]},
 lounge:{color:'#9eb7b2',kind:'carpet', furniture:[['massage_chair',22,38,1],['sofa_mint',113,36,1],['foot_bath',210,57,2],['massage_chair',250,38,3]], spots:[[38,75],[128,75],[157,75],[225,76]]},
};
const MAP_ROOMS=Object.fromEntries(Object.entries(ROOMS).map(([type,room])=>{
 const {w,h}=D.ROOM_SIZE[type];
 return [type,{furniture:room.furniture.map(([key,x,y,lv])=>[key,12+x/288*(w*32-40),22+y/96*(h*32-65),lv]),spots:Array.from({length:(w-2)*(h-2)},(_,i)=>[1+i%(w-2),1+Math.floor(i/(w-2))])}];
}));
let initialLayoutPending=false, layoutQueued=false;
function layout(initial=false) {
  initialLayoutPending ||= initial;
  const rect=cv.getBoundingClientRect();
  if(!rect.width || !rect.height){
    if(!layoutQueued){layoutQueued=true;requestAnimationFrame(()=>{layoutQueued=false;layout();});}
    return;
  }
  initial=initialLayoutPending;initialLayoutPending=false;
  cam.resize();
  if(initial){cam.s=Math.max(cam.minScale,Math.min(cam.w/512,(cam.h-140)/640,cam.maxScale));cam.x=512-cam.w/cam.s/2;cam.y=1640-(cam.h-70)/cam.s;cam.clamp();}
}
new ResizeObserver(()=>layout()).observe(cv);
window.visualViewport?.addEventListener('resize',()=>layout());
addEventListener('resize',()=>layout());
cv.addEventListener('contextmenu',e=>e.preventDefault());
let officeGrid=null;
function buildBg(){
 const c=document.createElement('canvas');c.width=1024;c.height=1760;const g=c.getContext('2d');g.imageSmoothingEnabled=false;

 for(let y=0;y<55;y++)for(let x=0;x<32;x++){
  if(y>=51){g.drawImage(spr(y===51?'sidewalk_top':'ground_'+S.district),x*32,y*32);if(y>51){g.fillStyle='#10152c33';g.fillRect(x*32,y*32,32,32);}continue;}
  if(y>=48){g.drawImage(spr(y===48?'sidewalk_top':'road_top'),x*32,y*32);continue;}
  g.fillStyle='#b6b5a1';g.fillRect(x*32,y*32,32,32);if(!O.ownsTile(S,x,y))g.drawImage(spr('ground_'+S.district),x*32,y*32);g.fillStyle='#ffffff10';g.fillRect(x*32,y*32,31,1);
  if(!O.ownsTile(S,x,y)){g.fillStyle='#10152c40';g.fillRect(x*32,y*32,32,32);}
 }
 for(let i=0;i<S.floors.length;i++){
  const f=S.floors[i],r=O.roomRect(S,i),[dx,dy]=O.doorOf(r);
  for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)g.drawImage(spr('floor_'+f.type),(r.x+x)*32,(r.y+y)*32);
  for(let x=0;x<r.w;x++){g.drawImage(spr('wall_top'),(r.x+x)*32,r.y*32);g.drawImage(spr(r.x+x===dx?'door_top':'wall_top'),(r.x+x)*32,(r.y+r.h-1)*32+16);}
  for(let y=0;y<r.h;y++){g.drawImage(spr('wall_side'),r.x*32,(r.y+y)*32);g.drawImage(spr('wall_side'),(r.x+r.w)*32-8,(r.y+y)*32);}
  g.save();g.beginPath();g.rect(r.x*32+8,r.y*32+17,r.w*32-16,r.h*32-49);g.clip();
  for(const [k,x,y,lv] of MAP_ROOMS[f.type].furniture)if(f.lv>=lv){const asset=spr(k);g.drawImage(asset,r.x*32+x,r.y*32+y,asset.width*.65,asset.height*.65);}
  g.restore();
 }
 if(S.district==='harbor')for(let x=0;x<32;x++)for(let y=46;y<48;y++)if(!O.ownsTile(S,x,y)){g.drawImage(spr('floor_wood'),x*32,y*32);}
 if(S.district==='shops')for(const x of [25,890])g.drawImage(streetSprite('shop_awning'),x,1450);
 for(let x=32;x<1024;x+=192){const a=streetSprite(S.district==='harbor'?'palm':S.district==='alley'?'power_pole':'street_lamp');g.drawImage(a,x+96,1662-a.height);}
 bgCanvas=c;officeGrid=O.walkGrid(S);sceneKey=JSON.stringify([S.floors,S.company,S.lv,S.district,S.land]);
 for(const a of actors.values())a.routeKey='';
}
function currentDay() {return playback?.R?.timeline?.[Math.min(6,Math.floor(playback.t/4))];}
function targetOf(st,idx){
 const day=currentDay(),p=playback?(playback.t%4)/4:.3;
 let act=st.sched?.[0]||'staff',fi=0;
 if(st.id==='assistant')fi=0;
 else if(st.role)fi=Math.max(0,roomIndex(st.role==='trainer'?(st.skill==='charm'?'style':st.skill):D.STAFF_ROLES[st.role].floor));
 else {act=day?.acts[st.id]||act;fi=day?.floorOf[st.id]??E.floorFor(S,act);}
 if(playback&&p<.12){fi=roomIndex('dorm');act='sleep';}
 else if(playback&&p>=.45&&p<.60&&fi>=0&&roomIndex('cafe')>=0){fi=roomIndex('cafe');act='eat';}
 else if(playback&&p>=.85){fi=st.role||st.id==='assistant'?-1:roomIndex('dorm');act='sleep';}
 if(fi<0)return {fi:-1,x:-24,y:1559,act,outside:true};
 const r=O.roomRect(S,fi),spots=MAP_ROOMS[S.floors[fi].type].spots,[sx,sy]=spots[idx%spots.length],tx=r.x+sx,ty=r.y+sy;
 return {fi,x:(tx+.5)*32,y:(ty+.8)*32,act,outside:false};
}
function placeActors(snap=false){
 if(!S)return;
 const people=[...E.team(S),...S.staff,S.assistant,...S.walkins,...S.scouted.slice(0,1)];
 if(S.offers.length){const st=S.rivals[S.offers[0].partner].stars[0];people.push({...st,id:'rep:'+st.id});}
 for(const v of playback?.R.visitors||[])if(currentDay()?.acts[v.our]?.includes(v.op))for(const st of v.npc)people.push({...st,id:'npc:'+st.id,visitorOf:v.our});
 const used={};for(const a of actors.values())a.present=false;
 people.forEach(st=>{const extra=S.walkins.includes(st)||S.scouted.includes(st)||st.id.startsWith('rep:');let dest=extra?targetOf(S.assistant,(used[0]||0)+2):targetOf(st,used[st.role||'star']||0);
 if(st.visitorOf){const own=E.starById(S,st.visitorOf);if(own)dest=targetOf(own,2);}
 used[st.role||'star']=(used[st.role||'star']||0)+1;
 let a=actors.get(st.id);if(!a){a={x:16,y:1559,t:0,hide:0,dir:'down'};actors.set(st.id,a);if(snap&&!extra){a.x=dest.x;a.y=dest.y;}}
 a.st=st;a.present=true;a.dest=dest;a.act=dest.act;a.fi=dest.fi;
 });for(const [id,a] of actors)if(!a.present){if(a.x<=-23&&Math.floor(a.y/32)===48)actors.delete(id);else{a.dest={fi:-1,x:-24,y:1559,act:'off',outside:true};a.act='off';a.fi=-1;}}
}
function step(dt) {
  sceneTime+=dt;
  if(playback) {
    playback.t=Math.min(28,playback.t+dt*speed);
    const d=Math.min(6,Math.floor(playback.t/4)), p=(playback.t%4)/4;
    $('timeBar').textContent=`第 ${playback.R.week} 週 · 週${E.DAY_NAMES[d]} ${p<0.15?'早上':p<0.45?'上午':p<0.60?'中午':p<0.85?'下午':'晚上'}`;
    if(playback.day!==d){playback.day=d;bubQ.clear();for(const b of bubOn.values())b.el.remove();bubOn.clear();}
    if(p>=0.3 && !playback.said.has(d)) {playback.said.add(d);for(const f of playback.R.timeline[d].says){const q=bubQ.get(f.id)||[];q.push(f);bubQ.set(f.id,q);}}
    if(playback.t>=28){skip();return;}
  }
  if(sceneKey!==JSON.stringify([S.floors,S.company,S.lv,S.district,S.land]))buildBg();
  placeActors();
  const motionDt=dt*(playback?speed:1);
  if(!officeGrid)buildBg();
  for(const a of actors.values()){
   a.t+=motionDt;const dest=a.dest,key=dest.x+','+dest.y;
   if(a.routeKey!==key){a.routeKey=key;const tile=[Math.max(0,Math.floor(dest.x/32)),Math.floor(dest.y/32)],from=[Math.max(0,Math.floor(a.x/32)),Math.floor(a.y/32)];
    if(!goTo(officeGrid,a,tile,null,{from})){console.warn('[AI Star] 找不到路徑,移至目標',a.st.id);a.x=dest.x;a.y=dest.y;a.path=[];}else if(dest.outside)a.path.push([dest.x,dest.y]);
   }
   moveAgent(a,motionDt,playback?420:150);a.dir=['right','up','left','down'][typeof a.dir==='number'?a.dir:3];
  }
}
function draw(){
 if(!S)return;
 if(sceneKey!==JSON.stringify([S.floors,S.company,S.lv,S.district,S.land])){layout();buildBg();}
 ctx.setTransform(cam.dpr,0,0,cam.dpr,0,0);ctx.fillStyle='#242637';ctx.fillRect(0,0,cam.w,cam.h);cam.apply(ctx);ctx.drawImage(bgCanvas,0,0);
 ctx.drawImage(streetSprite(Math.floor(sceneTime/8)%3?'car':'bus'),-70+(sceneTime%16)*75,1580);
 for(const a of [...actors.values()].sort((a,b)=>a.y-b.y)){drawActor(a.st,a);if(a.st.id==='assistant'||S.walkins.some(st=>st.id===a.st.id)){ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(a.st.id==='assistant'?'💡':'❔',a.x-7,a.y-35);}}
 S.floors.forEach((f,i)=>{const r=O.roomRect(S,i);ctx.font=`bold ${10*cam.kz()}px sans-serif`;ctx.textAlign='left';ctx.fillStyle='#27243eee';ctx.fillRect(r.x*32+6,r.y*32+3,ctx.measureText(D.FLOORS[f.type].name+' Lv'+f.lv).width+8,16*cam.kz());ctx.fillStyle='#fff';ctx.fillText(D.FLOORS[f.type].name+' Lv'+f.lv,r.x*32+10,r.y*32+3+12*cam.kz());const count=[...actors.values()].filter(a=>a.fi===i).length;ctx.fillStyle='#fff';ctx.font=`${10*cam.kz()}px sans-serif`;ctx.textAlign='right';ctx.fillText('👥 '+count+(['sing','dance','act','talk','style'].includes(f.type)?'/'+(f.lv+1):''),(r.x+r.w)*32-10,r.y*32+30);});
 if(landMode)for(let cy=0;cy<6;cy++)for(let cx=0;cx<4;cx++)if(O.adjacentLand(S,cx,cy)){ctx.fillStyle=landPick?.cx===cx&&landPick?.cy===cy?'#80efb966':'#f9d78133';ctx.fillRect(cx*256,cy*256,256,256);ctx.strokeStyle='#ffe9a2';ctx.strokeRect(cx*256,cy*256,256,256);ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('$'+fmt(O.landCost(S)),cx*256+128,cy*256+128);}
 if(placer.active){const p=placer.p;ctx.fillStyle=p.reason?'#ff526d88':'#60efa488';ctx.fillRect(p.x*32,p.y*32,p.w*32,p.h*32);ctx.strokeStyle=p.reason?'#ff5577':'#b4ffd1';ctx.lineWidth=3;ctx.strokeRect(p.x*32,p.y*32,p.w*32,p.h*32);}
 ctx.globalAlpha=1;
}
function drawActor(st,a) {
  const act=a.act, type=act?.startsWith('job:') ? (playback?.R.opTypes?.[act.slice(4)] || E.opById(S,act.slice(4))?.type) : '';
  let kind=act==='eat'?'eat':act==='sleep'||act==='rest'?'sleep':act==='relax'?'relax':act==='live'||type==='live'||type==='holo'?'live':act==='train:dance'||['short','duo'].includes(type)?'dance':act==='train:sing'||['own_album','group_album'].includes(type)?'sing':act==='train:talk'||['podcast','own_show'].includes(type)?'talk':'act';
  if((st.role||st.id==='assistant')&&act!=='eat')kind='staff';
  else if(act==='train:charm'||type==='fashion')kind='style';
  if((currentDay()?.sulkOf?.[st.id] ?? !!st.sulk) && !act.startsWith('job:') && !['eat','sleep'].includes(kind))kind='sulk';
  const moving=a.moving, col=moving?['walk0','walk1','walk2','walk3'][Math.floor(a.t*8)%4]:'idle0';
  const dance=kind==='dance'&&!moving, jump=dance?-Math.abs(Math.sin(a.t*Math.PI/0.4))*3:0;
  ctx.save();ctx.translate(Math.round(a.x),Math.round(a.y+jump));
  if(dance && Math.floor(a.t/0.4)%2)ctx.scale(-1,1);
  if(kind==='sleep'&&!moving){ctx.rotate(-Math.PI/2);ctx.drawImage(portrait(st,'down',col).canvas,-12,-22);ctx.fillStyle='#7fbee2';ctx.fillRect(-10,-7,20,19);}
  else ctx.drawImage(portrait(st,moving?a.dir:'down',col).canvas,-12,-30);
  if(!moving) {
    if(kind==='staff') {
      ctx.fillStyle='#e7e4ff';
      if(st.role==='manager'){ctx.fillRect(9,-22,3,7);}
      else if(st.role==='trainer'){ctx.fillRect(10,-18-Math.round(Math.sin(a.t*8)*3),5,3);}
      else if(st.role==='chef'){ctx.drawImage(spr('bowl'),8,-12);}
      else {ctx.fillStyle=Math.floor(a.t*4)%2?'#a3f2ea':'#638ca6';ctx.fillRect(8,-13,8,3);}
    }
    if(kind==='sing')ctx.drawImage(spr('mic_hand'),7,-18);
    if(kind==='eat'){ctx.drawImage(spr('bowl'),-6,-12);}                 // 餐桌是背景家具,這裡只疊碗
    if(kind==='relax'){ctx.fillStyle='#625176';ctx.fillRect(-13,-10,6,9);ctx.fillRect(7,-10,6,9);ctx.drawImage(spr('foot_bath'),-16,-5);}
    if(kind==='act'){ctx.drawImage(spr('clapper'),14,-13);ctx.fillStyle=Math.floor(a.t*3)%2?'#ff5260':'#542e42';ctx.fillRect(18,-25,3,3);}
    const particle={dance:'💦',sing:'♪',act:'🎬',talk:'…',live:'♥',eat:'♨',sleep:'zzz',relax:'✨',sulk:'💢',staff:st.role==='manager'?'…':st.role==='trainer'?'♪':'·',style:'✨'}[kind];
    const phase=(a.t%1.6)/1.6;ctx.globalAlpha=1-phase;ctx.fillStyle=kind==='live'?'#ff69aa':'#fff';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(particle,10,-32-phase*15);
  }
  if(st.role){ctx.globalAlpha=1;ctx.font='11px sans-serif';ctx.fillText(D.STAFF_ROLES[st.role].icon,0,-35);}
  ctx.restore();
}
let lastT=performance.now();
function frame(now){const dt=Math.min(0.05,(now-lastT)/1000);lastT=now;if(running&&S){step(dt);draw(now);updateBubbles(now);}requestAnimationFrame(frame);}
function play(R) {
  if(!R?.timeline)return;
  cancelPlace();closeSheet();playback={R,t:0,said:new Set()};
  bubQ.clear();for(const b of bubOn.values())b.el.remove();bubOn.clear();
  pumpFeed(); bubbleSeen=S.seq; $('playControls').hidden=false;
  $('repBox').classList.remove('on');
  render();
}
function skip() {
  if(!playback)return;const R=playback.R;playback=null;
  $('playControls').hidden=true;$('timeBar').textContent='週一 · 排定這週行程';$('nextBtn').disabled=false;
  placeActors(true);render();showReport(R);
}
$('speedBtn').onclick=()=>{speed=speed===4?1:speed*2;$('speedBtn').textContent=`⏩ ${speed}×`;};
$('skipBtn').onclick=skip;
let landMode=false,landPick=null;
const placer=new Placer({canPlace:p=>O.canPlaceRoom(S,p.type,p.x,p.y,p.index),onChange:p=>{ $('placeBar').hidden=false;$('placeText').textContent=p.reason?'⚠ '+p.reason:'用手指拖曳房間,綠色就能蓋';$('placeOk').disabled=!!p.reason;$('placeOk').textContent=p.index>=0?'✅ 搬到這裡(免費)':'✅ 蓋在這裡 $'+fmt(E.floorCost(S,p.type));}});
function closeSheet(){$('sheet').classList.remove('on');}
function openSheet(){cancelPlace();$('sheet').classList.add('on');}
function startRoom(type,index=-1){if(playback)return false;if(index>=0&&type==='lobby'){toast('大廳不能搬動');return false;}landMode=false;closeSheet();const spot=index<0&&O.findSpot(S,type);if(index<0&&!spot)toast('地不夠了,可以先到 🏗 建造 → 🗺 買地');if(spot){const k=D.ROOM_SIZE[type];cam.x=(spot.x+k.w/2)*32-cam.w/cam.s/2;cam.y=(spot.y+k.h/2)*32-(cam.h-140)/cam.s/2;cam.clamp();}const r=index>=0?O.roomRect(S,index):spot?{...spot,...D.ROOM_SIZE[type]}:{x:Math.round((cam.x+cam.w/cam.s/2)/32-D.ROOM_SIZE[type].w/2),y:Math.round((cam.y+cam.h/cam.s/2)/32-D.ROOM_SIZE[type].h/2),...D.ROOM_SIZE[type]};placer.start({...r,type,index});return true;}
function cancelPlace(){placer.cancel();landMode=false;landPick=null;$('placeBar').hidden=true;}
function confirmPlace(){let err;if(landMode){if(!landPick)return;err=O.buyLand(S,landPick.cx,landPick.cy);}else{const p=placer.confirm();if(!p)return;err=p.index>=0?E.moveRoom(S,p.index,p.x,p.y):E.buildFloor(S,p.type,p.x,p.y);}if(err){toast(err);return;}cancelPlace();sceneKey='';save();render();}
function openLand(){placer.cancel();landMode=true;landPick=null;closeSheet();$('placeBar').hidden=false;$('placeText').textContent='點選相鄰土地 · 需要公司 Lv'+O.landNeed(S);$('placeOk').textContent='🗺 確認買地 $'+fmt(O.landCost(S));$('placeOk').disabled=true;}
$('placeOk').onclick=confirmPlace;$('placeCancel').onclick=cancelPlace;$('sheetClose').onclick=closeSheet;
let sheetDown=0;$('sheetHandle').addEventListener('pointerdown',e=>{sheetDown=e.clientY;$('sheetHandle').setPointerCapture?.(e.pointerId);});$('sheetHandle').addEventListener('pointerup',e=>{if(e.clientY-sheetDown>45)closeSheet();});
$('zoomIn').onclick=()=>cam.zoomAt(1.25,cam.w/2,cam.h/2);$('zoomOut').onclick=()=>cam.zoomAt(.8,cam.w/2,cam.h/2);
const roomAt=(x,y)=>S.floors.findIndex((f,i)=>{const r=O.roomRect(S,i);return x>=r.x*32&&x<(r.x+r.w)*32&&y>=r.y*32&&y<(r.y+r.h)*32;});
const pointerHandlers={blocked:()=>!S,ghostHit:(x,y)=>placer.active&&x>=placer.p.x*32&&x<(placer.p.x+placer.p.w)*32&&y>=placer.p.y*32&&y<(placer.p.y+placer.p.h)*32,onGhostGrab:(x,y)=>placer.grab(x,y),onGhostDrag:(x,y)=>placer.dragTo(x,y),onHold:(x,y)=>{if($('sheet').classList.contains('on')||playback||landMode)return false;const i=roomAt(x,y);return i>=0&&startRoom(S.floors[i].type,i);},onTap:(x,y)=>{
 if($('sheet').classList.contains('on')){closeSheet();return;}
 if(landMode){const cx=Math.floor(x/256),cy=Math.floor(y/256);if(!O.adjacentLand(S,cx,cy))return;landPick={cx,cy};$('placeOk').disabled=S.lv<O.landNeed(S)||S.money<O.landCost(S);$('placeText').textContent='買下這塊地? 需要公司 Lv'+O.landNeed(S);return;}
 if(placer.active||playback)return;
 for(const [id,a] of actors)if(Math.abs(a.x-x)<17&&Math.abs(a.y-16-y)<21){if(id==='assistant')openAssistant();else if(S.walkins.some(st=>st.id===id))openWalkin(id);else if(id.startsWith('rep:')){openCompany('partners');toast(S.offers[0]?.greeting||'期待一起合作!');}else if(id.startsWith('npc:'))openNpc(id.slice(4));else if(S.scouted.some(st=>st.id===id))openCompany('scouted');else if(E.starById(S,id))openInteract(id);else openCompany();return;}
 const i=roomAt(x,y);if(i>=0)openFloor(i);
}};
bindPointer(cv,cam,pointerHandlers);

for(const id of ['trend','goal']){
 const el=$(id);el.setAttribute?.('role','button');el.tabIndex=0;
 const expand=()=>{ $('roomTitle').textContent=id==='trend'?'📈 趨勢':'🎯 目標';$('roomBody').innerHTML=el.innerHTML;$('roomBox').classList.add('on'); };
 el.addEventListener('click',expand);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();expand();}});
}
// 點視窗外緣可收起,事件選擇仍保留,下次可從看事件重開。
for(const id of ['evBox','repBox','pickBox','starBox','endBox','ngBox','helpBox','codeBox','awardBox','roomBox'])$(id).addEventListener('click',e=>{if(e.target===$(id))$(id).classList.remove('on');});


// ---------- 對話泡泡 ----------
const bubQ = new Map();          // 明星 id → 等著講的話
const bubOn = new Map();         // 明星 id → { el, until }
function pumpFeed() {
  for (const f of S.feed) {
    if (f.n <= bubbleSeen) continue;
    bubbleSeen = f.n;
    if(!f.id && ['sys','event','goal','good'].includes(f.kind)){notify(f);continue;}
    if (!f.id || !actors.has(f.id) || !['bid', 'win', 'lose', 'say', 'chat', 'wish', 'good', 'sad', 'sulk', 'yield', 'idea'].includes(f.kind)) continue;
    const q = bubQ.get(f.id) || []; q.push(f); while (q.length > 2) q.shift(); bubQ.set(f.id, q);
  }
}
function updateBubbles(now) {
  for(const n of notifications){n.el.style.opacity=Math.max(0,Math.min(1,(n.until-now)/600));if(now>=n.until)n.el.remove();}notifications=notifications.filter(n=>now<n.until);
  const box = $('bubbles');
  for (const [id, b] of bubOn) if (now > b.until || !actors.has(id)) { b.el.remove(); bubOn.delete(id); }
  if (bubOn.size < (cam.w<900?2:3)) for (const [id, q] of bubQ) {
    if (bubOn.size >= (cam.w<900?2:3)) break;
    if (bubOn.has(id) || !q.length || !actors.has(id)) continue;
    const f = q.shift(), st = id==='assistant'?S.assistant:E.starById(S, id); if (!st) continue;
    const el = document.createElement('div'); el.className = 'bub'; el.style.setProperty('--c', st.glow);
    let text = f.text.replace(new RegExp('^' + st.name + '[::]'), '');
    if (text.length > 46) text = text.slice(0, 44) + '…';
    el.innerHTML = `<b>${esc(st.name)}</b> ${esc(text)}`;
    box.appendChild(el);
    bubOn.set(id, { el, until: now + 2600 + text.length * 70 });
  }
  const placed = [], W = $('bubbles').clientWidth;
  for (const [id, b] of [...bubOn].filter(([id]) => actors.has(id)).sort((p, q) => actors.get(q[0]).y - actors.get(p[0]).y)) {
    const a = actors.get(id); if (!a) continue;
    const screen=cam.toScreen(a.x+TX,a.y);
    b.el.style.display = a.hide || screen[1]<0 || screen[1]>cam.h+32 ? 'none' : '';
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    const x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, cam.toScreen(a.x+TX,a.y)[0]));     // 靠邊的泡泡往內推,不要被擠扁
    let y = cam.toScreen(a.x+TX,a.y-33)[1];
    // 跟已經放好的泡泡疊到 → 往上移
    for (let k = 0; k < 6; k++) {
      const hit = placed.find(p => Math.abs(p.x - x) < (p.w + w) / 2 + 2 && y - h < p.y + 2 && y > p.y - p.h - 2);
      if (!hit) break;
      y = hit.y - hit.h - 6;
    }
    placed.push({ x, y, w, h });
    b.el.style.left = x + 'px'; b.el.style.top = Math.max(h + 2, y) + 'px';
  }
}

// ============================================================
//  介面
// ============================================================
function render() {
  if (!S) return;
  if (tutorialQueue.length && $('tutorialCard').hidden && !document.querySelector?.('.modal.on')) showTip(tutorialQueue.shift());
  pumpFeed();
  placeActors();
  $('coName').innerHTML = `<b>${esc(S.company)}</b>第 ${S.week} 週 · Lv${S.lv} ${D.LEVELS[S.lv].name}${S.ng ? ` · 第 ${S.ng + 1} 季` : ''}`;
  $('money').textContent = (S.money < 0 ? '-$' : '$') + fmt(Math.abs(S.money));
  $('money').style.color = S.money < 0 ? '#ff8f8f' : '';
  $('fans').textContent = fmt(E.totalFans(S));
  $('rankNo').textContent = '第' + E.rankNow(S);
  const tr = S.trend, nx = S.nextTrend, tp = id => D.topicById(id);
  $('trend').innerHTML = `<span>📈 本週</span><span class="hot">🔥 ${D.MEDIA[tr.hot].icon}${D.MEDIA[tr.hot].name} ×1.5</span><span>${tp(tr.topic).icon}#${tp(tr.topic).name} ×1.2</span>`
    + (S.flags.cool ? `<span>📉 ${D.MEDIA[S.flags.cool.type].name}降溫</span>` : '')
    + `<span class="nx">下週 🔥${D.MEDIA[nx.hot].icon}${D.MEDIA[nx.hot].name}</span>`;
  renderGoal();
  const open = S.ops.filter(o => o.status === 'open' && !o.project && o.slots.some(s => !s.who)).length;
  const openProj = S.ops.filter(o => o.project && o.status === 'open' && !o.slots[0].who).length;
  $('bProd').textContent = openProj || ''; $('bProd').style.display = openProj ? '' : 'none';
  $('bOps').textContent = open || ''; $('bOps').style.display = open ? '' : 'none';
  const newFeed = S.feed.filter(f => f.n > feedSeen).length;
  $('bFeed').textContent = '●'; $('bFeed').style.display = newFeed ? '' : 'none';
  $('bCo').textContent = '!'; $('bCo').style.display = S.audition || (!E.canUpgrade(S)) ? '' : 'none';
  $('nextBtn').textContent = playback ? '⏭ 跳過播放' : S.event ? '📣 先看事件' : '▶ 開始這週';
  $('nextBtn').classList.toggle('wait', !!S.event);
  renderTab();
}
function renderGoal() {
  if (S.ended) { $('goal').innerHTML = `🏆 <b>已經登上星光巨蛋!</b> 可以繼續經營,或在「公司」開始第二季`; return; }
  const g = E.nextGoal(S); if (!g) { $('goal').textContent = ''; return; }
  const f = E.totalFans(S);
  const target = { debut: 1000, known: 10000, popular: 25000, dome: 100000 }[g.id];
  const pct = target ? Math.min(100, f / target * 100) : (S.domeTries ? 60 : 30);
  $('goal').innerHTML = `🎯 <b>${g.icon} ${g.name}</b><span>${g.desc}</span><span class="gbar"><i style="width:${pct}%"></i></span>`;
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if(!b.dataset.tab)return;tab = b.dataset.tab; openSheet();sfx.tap();
  for (const x of $('tabs').children) x.classList.toggle('on', x === b);
  $('panel').scrollTop = 0;
  render();
});
function renderTab() {
  const p = $('panel'), y = p.scrollTop;
  p.innerHTML = tab === 'ops' ? opsHTML() : tab === 'stars' ? starsHTML() : tab === 'prod' ? prodHTML() : tab === 'build' ? buildHTML() : coHTML();
  if(playback) {                                   // 播放中:先看就好,只有「看事件」可以按
    p.innerHTML='<div class="card2" style="background:#efe9ff"><b>▶ 這週播放中</b><div class="meta">按下面的「⏭ 跳過播放」或右上角 ⏭ 就能馬上排下一週。</div></div>'+p.innerHTML;
    p.querySelectorAll('button:not([data-ev])').forEach(b=>b.disabled=true);
  }
  p.scrollTop = y;
  showTip(tab);
  const advice=E.assistantAdvice(S);if(advice&&assistantBubbleWeek!==S.week){assistantBubbleWeek=S.week;bubQ.set('assistant',[{text:advice}]);}
  for(const key of [S.event?'event':null,S.offers.length?'offer':null,S.walkins.length?'walkin':null])if(key)showTip(key);
}

const REASONS = { sprint:'我練到了!讓我接!', career:'大目標', skill: '最拿手', dream: '夢想', rival: '不想輸給對手', topic: '喜歡這個話題', revenge: '上次沒選上', friend: '想跟朋友一起', wish: '心願', trend: '追流行', big: '想要大舞台', lead: '想當主角', generic: '想試試看' };
const gradeChip = g => `<span class="gr" style="background:${g.color}">${g.g}</span>`;
function opTags(op) {
  const t = [];
  if (op.type === 'dome') t.push('<span class="tag final">🏆 最終目標</span>');
  if (E.isHot(S, op)) t.push('<span class="tag hot">🔥 熱門 ×1.5</span>');
  if (E.isTopic(S, op)) t.push(`<span class="tag topic">#${D.topicById(op.topic).name} ×1.2</span>`);
  if (op.big && op.type !== 'dome') t.push('<span class="tag big">大場面</span>');
  if(op.partner!=null)t.push(`<span class="tag self">🤝 ${D.OFFERS[op.offerType].name}</span>`);
  if (op.self) t.push('<span class="tag self">自己提的企劃</span>');
  if (D.MEDIA[op.type].temp) t.push('<span class="tag hot">🌐 限時平台</span>');
  if (op.project) t.push('<span class="tag self">🎛 自家企劃</span>');
  if (op.type === 'musicshow') t.push('<span class="tag hot">🎶 打歌</span>');
  return t.join(' ');
}
function opMeta(op) {
  const m = D.MEDIA[op.type];
  const sk = op.sw ? op.slots.map((s, i) => `${s.role}看${Object.keys(op.sw[i]).filter(k => op.sw[i][k] >= 0.5).map(k => D.SKILLS[k].icon).join('')}`).join('、')
    : Object.keys(op.w).map(k => D.SKILLS[k].icon + D.SKILLS[k].name).join(' ');
  return `${op.partner!=null?D.OFFERS[op.offerType].name:m.name} · ${op.partner!=null?esc(S.rivals[op.partner].name):m.pf} · ${op.weeks} 週，每週 ${op.days} 天 · ${sk}`;
}
const foldedWork = {};
for(const key of ['pipeline','expect'])try{foldedWork[key]=localStorage.getItem('aistar-fold-'+key)==='1';}catch{}
function workSections(){
 const panel=(key,title,body)=>`<div class="card2 workPreview"><button class="sbtn ghost" data-fold-work="${key}" aria-expanded="${!foldedWork[key]}">${foldedWork[key]?'▸':'▾'} ${title}</button>${foldedWork[key]?'':body}</div>`;
 const preview=[1,2].map(n=>`<div class="h4">${n===1?'下週':'兩週後'}</div>`+(S.pipeline||[]).filter(p=>p.week===S.week+n).map(p=>`<div class="meta">${D.MEDIA[p.type].icon} ${esc(p.title)}${p.hot?' <span class="tag hot">🔥 熱門</span>':''}<div>${esc(E.requirementText(p))}</div></div>`).join('')).join('');
 const expects=E.debuted(S).map(st=>`<div class="expectRow">${ptImg(st)}<span>${esc(st.name)} · 想接:${esc(E.expectText(st))}</span><span style="color:${st.expect?.left<=2?'#b83a4e':'inherit'}">${st.expect?'剩 '+st.expect.left+' 週':'下週更新'}</span></div>`).join('');
 return panel('pipeline','🔮 工作預告',preview)+panel('expect','🙋 接案期望',expects);
}
function gapLabel(st,op,slot){const r=E.slotRequirement(S,op,slot);return E.requirementError(S,st,op,slot)?`<span class="muted">${D.SKILLS[r.skill].name}差 ${(r.target-st.skills[r.skill]).toFixed(1)}</span>`:'';}
function opsHTML() {
  const open = S.ops.filter(o => o.status === 'open' && !o.project), run = S.ops.filter(o => o.status === 'run' && !o.project);
  let h = adviceCard()+workSections();
  if (S.event) h += `<div class="card2" style="background:#fff3c4"><b>📣 ${esc(S.event.title)}</b><div class="meta">要先決定怎麼處理,才能進到下一週。</div><button class="sbtn" data-ev="1">看事件</button></div>`;
  h += `<div class="sec">本週機會(沒人接的,下週會被別家公司接走)</div>`;
  if (!open.length) h += '<p class="muted">這週的機會都排好了!其他人可以去「📅 行程」排練習或休息。</p>';
  for (const op of open) h += opCard(op);
  if (run.length) {
    h += `<div class="sec" style="margin-top:14px">進行中</div>`;
    for (const op of run) h += runCard(op);
  }
  return h;
}
function runCard(op) {
  const ids = op.slots.map(s => s.who).filter(Boolean);
  return `<div class="card2 run"><h3>${D.MEDIA[op.type].icon} ${esc(op.title)}</h3><div class="meta">還有 ${op.left} 週 · ${ids.map(id => esc(E.starById(S, id)?.name || '')).join('、')}</div>
    <div class="slots">${op.slots.map(s => `<span class="slot">${ptImg(E.starById(S, s.who))}${s.role}${s.who ? '' : ':—'}</span>`).join('')}${E.partnerStars(S,op).map(st=>`<span class="slot">${ptImg(st)}${esc(st.name)} ✅ 已就位</span>`).join('')}</div></div>`;
}
function opCard(op, extra = '') {
  const m = D.MEDIA[op.type], empty = op.slots.findIndex(s => !s.who);
  const mult = E.trendMult(S, op);
  let h = `<div class="card2"><h3>${m.icon} ${esc(op.title)} ${opTags(op)}</h3>
    <div class="meta">${opMeta(op)}</div><div class="meta">${esc(E.requirementText(op))}</div>
    ${op.partner!=null?`<div class="rew"><span>💰 約 $${fmt(E.cooperationPreview(S,op).money)}</span><span>👥 約 +${fmt(E.cooperationPreview(S,op).fans)}</span><span class="muted">${op.offerType==='loan'?'技能至少 5，酬勞全給公司':'B 評價預估'}</span></div>`:op.project ? `<div class="rew"><span>💿 上架後 8 週每週分潤</span><span class="muted">${D.BUDGETS[op.budget].name}預算</span></div>` : `<div class="rew"><span>💰 $${fmt(op.pay * mult)}</span><span>👥 +${fmt(op.fans * mult)}</span><span class="muted">(B 評價時)</span></div>`}`;
  if(S.assistant.lv>=3){const rec=E.analystRecommendation(S,op);if(rec)h+=`<div class="meta">🔍 分析師推薦:${esc(rec.st.name)}(預估 ${gradeLabel(rec.st,op,empty)})</div>`;}
  if(op.npc?.length)h+=`<div class="slots">${E.partnerStars(S,op).map(st=>`<span class="slot">${ptImg(st)}${esc(st.name)} ✅ 已就位</span>`).join('')}</div>`;
  if (op.slots.length > 1) h += `<div class="slots">${op.slots.map(s => `<span class="slot">${ptImg(E.starById(S, s.who))}${s.role}${s.who ? ':' + esc(E.starById(S, s.who).name) : ':—'}</span>`).join('')}</div>`;
  const bids = op.bids.filter(b => { const st = E.starById(S, b.id); return st && !st.gone; });
  if (bids.length) {
    h += `<div class="h4">想搶這個的人(${bids.length})</div>`;
    for (const b of bids) {
      const st = E.starById(S, b.id), free = E.isFree(st, op), mine = op.slots.some(s => s.who === st.id);
      const g = empty >= 0 && free ? E.estimate(S, st, op, empty) : null;
      h += `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)}:${esc(b.text)} ${E.expectMatches(st,op)?'<span class="tag hot">⭐ 期望</span>':''}${b.supportOnly?'<span class="tag">想接配角</span>':''}<div class="why">理由:${REASONS[b.reason] || ''} · ${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')}</div></div>
        <div class="act">${mine ? '<span class="muted">✅ 選了</span>' : free && empty >= 0 ? `${gradeChip(g)}${scoreHTML(st,op,empty)}${gapLabel(st,op,empty)}<button class="sbtn" ${E.requirementError(S,st,op,empty)?'disabled':''} data-assign="${op.id}" data-slot="${empty}" data-star="${st.id}">選${op.slots.length > 1 ? '為' + op.slots[empty].role : '他'}</button>${impact(E.selectionHint(S,st,op))}` : '<span class="muted">有別的工作</span>'}</div></div>`;
    }
  } else h += `<div class="h4">還沒有人來搶 —— 可以直接指派</div>`;
  for (const y of op.yields) { const st = E.starById(S, y.id); if (st) h += `<div class="yield">💗 ${nameTag(st)}:${esc(y.text)}</div>`; }
  if (empty >= 0) h += `<div class="acts"><button class="sbtn ghost" data-pick="${op.id}" data-slot="${empty}">👉 指派${op.slots.length > 1 ? op.slots[empty].role : ''}給${op.only ? '' : '其他人'}…</button>${empty > 0 ? '<span class="muted">(不選也可以,下週會自己開工)</span>' : ''}</div>`;
  if (op.groupId && op.type === 'group_album' && empty === 0) h = h.replace('想搶這個的人', '想站 C 位的人');
  return h + extra + '</div>';
}

function bar(v, c) { return `<div class="b"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div>`; }
const moodFace = v => v >= 75 ? '😄' : v >= 50 ? '🙂' : v >= 30 ? '😐' : '😣';
function actIcon(v) {return v.startsWith('job:')?'🎬':E.ACT_NAMES[v]?.split(' ')[0]||'🛏';}
function estimateEnergy(st) {
  let e=st.energy;
  for(const v of st.sched) {
    e+=v.startsWith('job:')?(E.has(st,'hot')?-18:-15):v.startsWith('train:')?(E.has(st,'hot')?-12:-10):v==='rest'?(E.has(st,'chill')?40:30):v==='off'?25:-8;
    e+=(E.roomLv(S,'cafe')?2+4*E.roomLv(S,'cafe'):3)+E.staffEffect(S,'chef',[4,6,8]);
    if(E.roomLv(S,'dorm'))e+=4+4*E.roomLv(S,'dorm');
    if(E.roomLv(S,'lounge')&&!v.startsWith('job:'))e+=6+2*E.roomLv(S,'lounge');
    e=Math.max(0,Math.min(100,e));
  }
  return Math.round(e);
}
const PLAN_LABEL={'train:sing':'🎤 唱','train:dance':'💃 舞','train:act':'🎭 演','train:talk':'🎙 說','train:charm':'💄 魅','live':'🔴 直播','rest':'🛏 休息','off':'🎉 放假'};
let openCards=new Set();
try{openCards=new Set(JSON.parse(localStorage.getItem('aistar-open-cards')||'[]'));}catch{}
function toggleCard(id){openCards.has(id)?openCards.delete(id):openCards.add(id);try{localStorage.setItem('aistar-open-cards',JSON.stringify([...openCards]));}catch{}render();}
// 明星+行程合併:每人一張卡,收起時只看指數與「這週做什麼」,展開看完整資料
function planRow(st){
  const locked=st.restUntil>S.week||st.travelUntil>S.week;
  const week=`<div class="weekStrip" title="這週七天">${st.sched.map((v,d)=>`<span class="${v.startsWith('job:')?'job':''}"><small>${E.DAY_NAMES[d]}</small>${actIcon(v)}</span>`).join('')}</div>`;
  if(locked)return week+`<div class="scheduleNote">${st.restUntil>S.week?'🏥 休養中,這週都休息':'✈ 海外交流中'}</div>`;
  const e=estimateEnergy(st);
  return `<div class="planPick">${E.PLAN_OPTIONS.map(v=>`<button data-plan="${v}" data-star="${st.id}" class="${st.plan===v?'on':''}">${PLAN_LABEL[v]}</button>`).join('')}</div>${week}<div class="scheduleNote" style="color:${e<20?'#b83a4e':'#75658b'}">${st.planAuto!==false?'🪄 自動 · ':''}週末體力約 ${e}${e<20?' · 😵 太累了':''} ${scheduleGains(st)}</div>`;
}
function scheduleHTML(){return starsHTML();}
function starRow(st){
  const open=openCards.has(st.id);
  return `<div class="card2 starRow${open?' open':''}"><div class="starHead" data-fold-star="${st.id}"><img class="pt" style="--g:${st.glow}33" src="${portrait(st).url}" alt=""><div class="body"><div class="nm" style="color:${st.glow}">${st.emoji} ${esc(st.name)} <span class="tag">${careerTag(st)}</span></div><div class="scheduleStats">${scheduleStats(st)}</div></div><span class="fold">${open?'▾':'▸'}</span></div>
    ${st.sprint?`<div class="scheduleNote">🎯 衝刺:${D.SKILLS[st.sprint.skill].name} ${st.skills[st.sprint.skill].toFixed(1)} → ${st.sprint.target}(${st.sprint.left} 週)</div>`:''}
    ${planRow(st)}${open?starCard(st,false,true):''}</div>`;
}
function switchSchedule() {
  $('starBox').classList.remove('on');openSheet();tab='stars';
  for(const b of $('tabs').children)b.classList.toggle('on',b.dataset.tab===tab);
  render();
}
function cycleDay(id,d) {
  const st=E.starById(S,id), v=st.sched[d];
  if(v.startsWith('job:')) {toast(`這天要拍《${E.opById(S,v.slice(4))?.title.replace(/[《》]/g,'')||'預約工作'}》`);return;}
  const ks=[E.bestSkill(st),...D.SKILL_IDS.filter(k=>k!==E.bestSkill(st))];
  const options=['rest',...ks.map(k=>'train:'+k),'live','off'];
  const err=E.setDay(S,id,d,options[(options.indexOf(v)+1)%options.length]);
  if(err)toast(err);saveSoon();render();
}
function openFloor(i) {
  const f=S.floors[i], def=D.FLOORS[f.type];
  const here=[...actors].filter(([,a])=>a.fi===i&&!a.hide).map(([,a])=>a.st.name);
  $('roomTitle').textContent=`${def.icon} ${def.name} Lv${f.lv}`;
  $('roomBody').innerHTML=`<p class="txt">${def.desc}</p><p class="txt">今天在這間房：${here.map(esc).join('、')||'大家都去別處忙了'}</p>${f.lv<3?`<button class="choice" data-room-up="${i}" ${S.money<E.upgradeCost(S,i)?'disabled':''}>升級 $${fmt(E.upgradeCost(S,i))}${S.money<E.upgradeCost(S,i)?'（錢不夠）':''}</button>`:'<p class="muted">已經是最高級！</p>'}`;
  $('roomBox').classList.add('on');
}
function buildHTML(){return `<div class="card2"><b>🏗 蓋新房間</b><p>保留一格走廊,大廳不能移動。長按房間 450ms 可搬動。</p><button class="choice" data-land="1">🗺 買地 $${fmt(O.landCost(S))} · 公司 Lv${O.landNeed(S)} · 已有 ${S.land.length} 塊</button></div>`+Object.entries(D.FLOORS).filter(([,f])=>f.build).map(([type,f])=>{const cost=E.floorCost(S,type),r=D.ROOM_SIZE[type],why=S.money<cost?'錢不夠':'';return `<button class="choice" data-place="${type}" ${why?'disabled':''}>${f.icon} ${f.name} $${fmt(cost)} · ${r.w}×${r.h}<div class="muted">${f.desc}${why?' · '+why:''}</div></button>`;}).join('');}
function openBuild(){tab='build';render();openSheet();}
$('panel').addEventListener('click',e=>{const b=e.target.closest('[data-place],[data-land]');if(!b||playback)return;if(b.dataset.land)openLand();else if(b.dataset.place)startRoom(b.dataset.place);});
function openInteract(id) {
  const st=E.starById(S,id);$('roomTitle').textContent=`${st.emoji} ${st.name} · ${careerTag(st)} · 信任 ${Math.round(st.trust)}`;
  $('roomBody').innerHTML=`<div style="text-align:center">${ptImg(st)}</div>`+[['chat','💬 聊天'],['snack','🍪 點心 $60'],['cheer','👏 鼓勵'],['talk','☕ 談心 $150']].map(([kind,label])=>`<button class="choice" data-interact="${kind}" data-id="${id}" ${st.done[kind]?'disabled':''}>${label}${st.done[kind]?'（這週做過了）':''}</button>`).join('')+`<button class="choice" data-room-star="${id}">📋 資料</button><button class="choice" data-analysis="${id}">📈 發展分析</button>`;
  $('roomBox').classList.add('on');
}
let evaluationOpen=false;
$('roomClose').onclick=()=>{
 $('roomBox').classList.remove('on');
 if(evaluationOpen){evaluationOpen=false;postReport('eval');}
};
$('roomBody').onclick=e=>{
  const b=e.target.closest('button');if(!b||playback)return;const d=b.dataset;let err;
  if(d.trainer||d.evalDebut||'wiz' in d)return;
  if(d.analysis){$('roomBox').classList.remove('on');openStar(d.analysis);$('developmentAnalysis').scrollIntoView?.();return;}
  if(d.assistantUp){err=E.upgradeAssistant(S);if(err)toast(err);openAssistant();save();render();return;}
  if(d.tipsToggle){S.tipsOff=!S.tipsOff;if(S.tipsOff){tutorialQueue=[];$('tutorialCard').hidden=true;$('tutorialCard').innerHTML='';}openAssistant();save();render();return;}
  if(d.roomUp!==undefined)err=E.upgradeFloor(S,+d.roomUp);
  if(d.roomBuild){$('roomBox').classList.remove('on');startRoom(d.roomBuild);return;}
  if(d.roomStar){$('roomBox').classList.remove('on');openStar(d.roomStar);return;}
  if(d.interact){const st=E.starById(S,d.id), already=st.done[d.interact];
    const result=E.interact(S,d.id,d.interact);err=typeof result==='string' && (already || !st.done[d.interact])?result:null;}
  if(err){toast(err);return;}
  $('roomBox').classList.remove('on');save();render();
};

function starsHTML() {
  let h = `<div class="card2"><button class="sbtn" data-auto="1">🪄 全部交給小助理排</button><div class="meta">每人每週選一件事:🎬 工作天照預約、週日固定休息,其他天就做你選的。體力太低會自動插一天休息。點名字展開資料。</div>${impact('🛏 休息 體力 ↑↑ · 🎉 放假 體力 ↑ 心情 ↑↑ · 練習 技能 ↑ 體力 ↓ · 🔴 直播 粉絲 ↑ 錢 ↑ 體力 ↓ · 🎬 工作 體力 ↓↓')}</div>`;
  h += `<div class="sec">⭐ 已出道 ${E.debuted(S).length} / ${D.LEVELS[S.lv].max}</div>`+E.debuted(S).map(starRow).join('');
  h += `<div class="sec">🌱 練習生(下次評鑑:第 ${Math.ceil(S.week/4)*4} 週)</div>`+E.team(S).filter(st=>st.trainee).map(starRow).join('');
  if (S.mentor) h += `<div class="card2"><b>🧑‍🏫 前輩 ${esc(S.mentor.name)}</b><div class="meta">上一季留下來的前輩,不搶工作,教大家練習(練習效果 +15%、演出 +3)。</div></div>`;
  return h;
}
function starCard(st, full = false, inRow = false) {
  const fr = E.friendsOf(S, st), rv = E.rivalsOf(S, st);
  const sk = D.SKILL_IDS.map(k => `<div class="${k === E.bestSkill(st) ? 'sp' : ''}">${D.SKILLS[k].icon}${st.skills[k].toFixed(1)}</div>`).join('');
  const plans = full ? `<button class="miniSched" data-schedule="1" aria-label="查看這週行程">${st.sched.map(v=>`<span>${actIcon(v)}</span>`).join('')}</button>` : '';
  return `<div class="${inRow?'rowMore':'card2'}"><div class="star">${inRow?'':`<img class="pt big" data-open="${st.id}" style="--g:${st.glow}33" src="${portrait(st).url}" alt="">`}
    <div class="body"><div class="nm" style="color:${st.glow}">${inRow?`<button class="sbtn ghost" data-open="${st.id}">📋 完整資料</button>`:`${st.emoji} ${esc(st.name)}`} <span class="tag">${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' · ')}</span></div>
    <div class="meta">${careerTag(st)} · 潛力 ${S.assistant.lv>=1?E.potentialStars(st):'?'}${(g => g ? ` · 👯 ${esc(g.name)}${g.center === st.id ? '・C 位' : ''}` : '')(E.groupOf(S, st.id))}</div><div class="sk">${sk}</div>
    <div class="bars"><div>${moodFace(st.mood)} 心情${bar(st.mood, '#ff8fb1')}</div><div>⚡ 體力${bar(st.energy, st.energy < 25 ? '#ff6f6f' : '#7fdc8a')}</div><div>💗 歸屬${bar(st.loyalty, st.loyalty < 30 ? '#ff6f6f' : '#b98cff')}</div></div>
    <div class="wish">👥 粉絲 ${fmt(st.fans)}${st.wish ? ` · 💭 ${esc(E.wishText(S, st))}(剩 ${st.wish.left} 週)` : ''}${st.lost >= 2 ? ` · 連續 ${st.lost} 次沒選上` : ''}</div>
    ${fr.length || rv.length ? `<div class="rels">${fr.map(o => '🤝' + esc(o.name)).join(' ')} ${rv.map(o => '⚔️' + esc(o.name)).join(' ')}</div>` : ''}
    ${full ? `<div class="wish">❤️ 喜歡 #${D.topicById(st.topic).name} · 🌠 夢想:${D.MEDIA[st.dream].icon}${D.MEDIA[st.dream].name} · 口頭禪「${esc(st.catch)}」</div>
      <div class="wish">🎬 做過 ${st.stat.ops} 個作品${st.stat.best ? ',最好 ' + st.stat.best : ''} · 加入第 ${st.joined} 週</div>` : ''}
    ${full?analysisHTML(st):''}
    ${plans}
    <div class="acts"><button class="sbtn ghost" data-talk="${st.id}" ${st.talkedThisWeek ? 'disabled' : ''}>☕ 談心 $${D.TALK_COST}</button><button class="sbtn ghost" data-outfit="${st.id}">👗 新造型 $${D.OUTFIT_COST}</button><button class="sbtn ghost" data-meet="${st.id}" ${!E.freeDays(st) ? 'disabled' : ''}>🎪 見面會 $${D.MEET_COST}</button></div>
    </div></div></div>`;
}
function feedHTML() {
  const list = S.feed.slice(-90).reverse();
  let h = '<ul class="feed">', wk = null;
  for (const f of list) {
    if (f.w !== wk) { wk = f.w; h += `<li class="wk">— 第 ${wk} 週 —</li>`; }
    const st = f.id && E.starById(S, f.id);
    const text = st ? f.text.replace(new RegExp('^' + st.name + '[::]'), '') : f.text;
    h += `<li class="${f.kind}">${st ? ptImg(st) : ''}<div><span class="nm" style="color:${st ? st.glow : '#ffd25a'}">${st ? esc(st.name) + ':' : ''}</span><span class="tx">${esc(text)}</span></div></li>`;
  }
  return h + '</ul>';
}
function coHTML() {
  const lv = D.LEVELS[S.lv], nx = D.LEVELS[S.lv + 1], why = E.canUpgrade(S);
  let h = `<div class="card2"><div class="lvbox"><div><b>🏢 Lv${S.lv} ${lv.name}</b><div class="meta">明星 ${E.debuted(S).length}/${lv.max} 位 · 每週 ${lv.ops} 個機會 · 房租 $${fmt(lv.rent)}/週</div></div>
    ${nx ? `<button class="sbtn" data-up="1" ${why ? 'disabled' : ''}>升級 $${fmt(nx.cost)}</button>` : '<span class="tag">最高級</span>'}</div>
    ${nx ? `<div class="meta">下一級:${nx.name}(要粉絲 ${fmt(nx.fans)}、$${fmt(nx.cost)})→ ${nx.max} 位明星、每週 ${nx.ops} 個機會${S.lv + 1 === 3 ? '、解鎖虛擬演唱會和舞台' : S.lv + 1 === 2 ? '、解鎖廣告/遊戲代言/選秀' : ''}${why ? ' · <b>還差:' + why + '</b>' : ''}</div>` : ''}
    <div class="meta">目前 ${S.floors.length} 間房。</div></div>`;

  h += recruitmentHTML();
  // 試鏡
  h += `<div class="card2"><b>🎙 試鏡</b>`;
  if (S.audition) {
    h += `<div class="meta">簽約金 $${fmt(D.auditionCost(E.debuted(S).length))} · 名額 ${E.debuted(S).length}/${lv.max}</div>`;
    S.audition.forEach((c, i) => {
      h += `<div class="bid"><img class="pt" style="--g:${c.glow}22" src="${portrait(c).url}" alt=""><div class="say" style="--c:${c.glow}">${nameTag(c)}:${esc(c.intro || '')}
        <div class="why">${c.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')} · ${careerTag(c)} · 潛力 ${S.assistant.lv>=1?E.potentialStars(c):'?'}<br>${D.SKILL_IDS.map(k=>D.SKILLS[k].icon+c.skills[k].toFixed(1)).join(' ')}</div></div>
        <div class="act"><button class="sbtn" data-sign="${i}">簽約</button></div></div>`;
    });
    h += `<button class="sbtn ghost" data-skipaud="1" style="margin-top:6px">這次都不要</button>`;
  } else h += `<div class="meta">${E.debuted(S).length >= lv.max ? '名額滿了,升級公司才能找新人。' : S.auditionIn > 0 ? `${S.auditionIn} 週後可以再辦試鏡。` : '可以辦試鏡了!'}</div>${E.debuted(S).length < lv.max && S.auditionIn <= 0 ? '<button class="sbtn" data-aud="1">辦試鏡</button>' : ''}`;
  h += '</div>';
  // 排行
  h += renderPartners();
  h += `<div class="card2"><b>📊 公司排行(粉絲數)</b><ul class="rank">${E.ranking(S).map((r, i) => `<li class="${r.me ? 'me' : ''}">${i + 1}. ${r.icon} ${esc(r.name)}<span class="f">${fmt(r.fans)}</span></li>`).join('')}</ul><div class="meta">每 12 週公布「季度星光榜」,前幾名有獎金。</div></div>`;
  // 目標、獎盃
  h += `<div class="card2"><b>🎯 目標</b>${D.GOALS.map(g => `<div class="meta">${S.goals.includes(g.id) ? '✅' : '⬜'} ${g.icon} <b>${g.name}</b>:${g.desc}${S.goalWeek && S.goalWeek[g.id] ? `(第 ${S.goalWeek[g.id]} 週)` : ''}</div>`).join('')}
    ${S.trophies.length ? `<div class="trophies">${S.trophies.map(t => `<span title="${esc(t.name)}">${t.icon}</span>`).join('')}</div>` : ''}</div>`;
  if (S.ended) h += `<div class="card2"><b>🌱 第二季</b><div class="meta">${S.ending ? `這一季的結局:${S.ending.icon} ${S.ending.name}(第 ${S.ending.week} 週)` : ''}</div><button class="sbtn" data-ng="1">開始第二季</button></div>`;
  h += `<div class="card2"><b>💾 存檔</b><div class="meta">每 15 秒自動存一次。換裝置可以用存檔碼。</div><div class="acts"><button class="sbtn ghost" data-backup="1">📦 備份存檔碼</button></div></div>`;
  return h;
}

// 分頁裡的按鈕(事件委派)
$('panel').addEventListener('click', e => {
  const b = e.target.closest('[data-fold-star],[data-fold-work],[data-visit],[data-npc],[data-offer-yes],[data-offer-no],[data-proj-new],[data-proj-cancel],[data-grp-new],[data-grp-album],[data-grp-disband],[data-sns],[data-gotobuild],[data-hire],[data-fire],[data-scout-sign],[data-scout-no],[data-debut],[data-assign],[data-pick],[data-plan],[data-talk],[data-outfit],[data-meet],[data-up],[data-floor],[data-build],[data-day],[data-auto],[data-schedule],[data-sign],[data-skipaud],[data-aud],[data-ng],[data-backup],[data-open],[data-ev]');
  if (!b || !S || (playback && !('ev' in b.dataset))) return;
  const d = b.dataset;
  let err = null;
  if(d.foldStar){toggleCard(d.foldStar);return;}
  if(d.foldWork){foldedWork[d.foldWork]=!foldedWork[d.foldWork];try{localStorage.setItem('aistar-fold-'+d.foldWork,foldedWork[d.foldWork]?'1':'0');}catch{}render();return;}
  if(d.visit) {openVisit(+d.visit-1);return;}
  else if(d.npc) {openNpc(d.npc);return;}
  else if(d.offerYes) err=E.acceptOffer(S,d.offerYes);
  else if(d.offerNo) err=E.declineOffer(S,d.offerNo);
  else if(d.projNew) {openProjectWizard();return;}
  else if(d.projCancel) {if(confirm('取消這個企劃?會退一半預算。'))err=E.cancelProject(S,d.projCancel);}
  else if(d.grpNew) {openGroupWizard();return;}
  else if(d.grpAlbum) {openProjectWizard('group_album',d.grpAlbum);return;}
  else if(d.grpDisband) {if(confirm('確定要解散這個團體嗎?'))err=E.disbandGroup(S,d.grpDisband);}
  else if(d.sns) {err=E.setSnsStrategy(S,d.sns);if(!err)sfx.tap();}
  else if(d.gotobuild) {openBuild();return;}
  else if(d.hire) {if(d.hire==='trainer'){openTrainer();return;} err=E.hire(S,d.hire);}
  else if(d.fire) {if(confirm('謝謝你，再見。確定要讓這位員工離職嗎?'))E.fireStaff(S,d.fire);}
  else if(d.scoutSign) err=E.signScouted(S,d.scoutSign);
  else if(d.scoutNo) E.dismissScouted(S,d.scoutNo);
  else if(d.debut) err=E.debut(S,d.debut);
  else if (d.assign) { err = doAssign(d.assign, +d.slot, d.star); }
  else if (d.pick) { openPicker(d.pick, +d.slot); return; }
  else if (d.plan) { err = E.setPlan(S, d.star, d.plan); if (!err) sfx.tap(); }
  else if (d.talk) { err = E.talk(S, d.talk); if (!err) sfx.pick(); }
  else if (d.outfit) { err = E.buyOutfit(S, d.outfit); if (!err) { sfx.coin(); ptCache.clear(); } }
  else if (d.meet) { err = E.meetFans(S, d.meet); if (!err) sfx.coin(); }
  else if (d.up) { err = E.upgradeCompany(S); if (!err) { fanfare(); toast(`🏢 升級成「${D.LEVELS[S.lv].name}」!`); } }
  else if (d.floor !== undefined) { err = E.upgradeFloor(S,+d.floor); }
  else if (d.build) {openBuild();return;}
  else if (d.auto) {E.autoArrangeAll(S);}
  else if (d.day !== undefined) {cycleDay(d.star,+d.day);return;}
  else if (d.schedule) {switchSchedule();return;}
  else if (d.sign) { err = E.sign(S, +d.sign); if (!err) { fanfare(); placeActors(); } }
  else if (d.skipaud) { E.skipAudition(S); sfx.tap(); }
  else if (d.aud) { err = E.auditionNow(S); if (!err) sfx.pick(); }
  else if (d.ng) { openNg(); return; }
  else if (d.backup) { openCode('backup'); return; }
  else if (d.open) { openStar(d.open); return; }
  else if (d.ev) { openEvent(); return; }
  if (err) { toast('⚠ ' + err); sfx.bad(); }
  saveSoon(); render();
});
function doAssign(opId, slot, starId) {
  const before = S.seq;
  const err = E.assign(S, opId, slot, starId);
  if (err) return err;
  sfx.pick();
  if (S.feed.some(f => f.n > before && f.kind === 'lose')) setTimeout(sfx.lose, 260);
  return null;
}

// ---------- 選人視窗 ----------
let pickCtx = null;
function openPicker(opId, slot) {
  const op = E.opById(S, opId); if (!op) return;
  pickCtx = { opId, slot };
  $('pickTitle').textContent = `${D.MEDIA[op.type].icon} ${op.title}${op.slots.length > 1 ? ' · ' + op.slots[slot].role : ''}`;
  $('pickHow').textContent = S.tipsOff?'':'沒來搶的人也可以指派,不過如果他沒興趣,心情會差一點。'+' '+E.requirementText(op);
  const free = E.team(S).filter(st=>E.isFree(st,op) && (!op.only || op.only.includes(st.id))).map(st => ({ st, g: E.estimate(S, st, op, slot), bid: op.bids.some(b => b.id === st.id) }))
    .sort((a, b) => 'SABC'.indexOf(a.g.g) - 'SABC'.indexOf(b.g.g));
  $('pickList').innerHTML = free.length ? free.map(({ st, g, bid }) => `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)} ${bid ? '<span class="tag hot">想要</span>' : ''}
    <div class="why">${D.SKILL_IDS.map(k => D.SKILLS[k].icon + st.skills[k].toFixed(1)).join(' ')} · ⚡${Math.round(st.energy)} · ${moodFace(st.mood)}</div></div>
    <div class="act">${gradeChip(g)}${scoreHTML(st,op,slot)}${gapLabel(st,op,slot)}<button class="sbtn" ${E.requirementError(S,st,op,slot)?'disabled':''} data-pk="${st.id}">選</button>${impact(E.selectionHint(S,st,op))}</div></div>`).join('') : '<p class="muted">大家這週都有工作了。</p>';
  $('pickBox').classList.add('on');
}
$('pickList').addEventListener('click', e => {
  const b = e.target.closest('[data-pk]'); if (!b || b.disabled || !pickCtx || playback) return;
  const err = doAssign(pickCtx.opId, pickCtx.slot, b.dataset.pk);
  if (err) { toast('⚠ ' + err); sfx.bad(); }
  $('pickBox').classList.remove('on'); saveSoon(); render();
});
$('pickClose').addEventListener('click', () => $('pickBox').classList.remove('on'));

// ---------- 明星詳細 ----------
let starOpen = null;
function openStar(id) {
  const st = E.starById(S, id); if (!st) return;
  starOpen = id;
  const said = S.feed.filter(f => f.id === id).slice(-5).reverse();
  $('starBody').innerHTML = starCard(st, true) + `<div class="h4">最近說的話</div>${said.map(f => `<div class="muted" style="color:#5b4a8a">「${esc(f.text.replace(new RegExp('^' + st.name + '[::]'), ''))}」</div>`).join('') || '<div class="muted">……</div>'}`;
  $('starBox').classList.add('on');
}
$('starBody').addEventListener('click', e => {
  const b = e.target.closest('[data-plan],[data-talk],[data-outfit],[data-meet],[data-schedule]'); if (!b || playback) return;
  const d = b.dataset; let err = null;
  if (d.schedule) {switchSchedule();return;}
  if (d.plan) err = E.setPlan(S, d.star, d.plan);
  else if (d.talk) err = E.talk(S, d.talk);
  else if (d.outfit) { err = E.buyOutfit(S, d.outfit); ptCache.clear(); }
  else if (d.meet) err = E.meetFans(S, d.meet);
  if (err) { toast('⚠ ' + err); sfx.bad(); } else sfx.pick();
  saveSoon(); render(); openStar(starOpen);
});
$('starClose').addEventListener('click', () => $('starBox').classList.remove('on'));

// ---------- 事件 ----------
function openEvent() {
  showTip('event');
  const ev = S.event; if (!ev) return;
  $('evTitle').textContent = '📣 ' + ev.title;
  const ids = ev.id === 'leave' ? [ev.star] : Array.isArray(ev.ctx) ? ev.ctx : ev.ctx ? [ev.ctx] : [];
  $('evWho').innerHTML = `<div style="text-align:center">${ids.map(id => E.starById(S, id)).filter(Boolean).map(st => ptImg(st, 'pt big')).join(' ')}</div>`;
  $('evText').textContent = ev.text;
  $('evChoices').innerHTML = ev.choices.map((c, i) => `<button class="choice" data-ch="${i}">${esc(c.label)}${impact(c.hint||'會影響:依選擇改變')}${c.cost && S.money < c.cost ? ' <small>(錢不夠)</small>' : ''}</button>`).join('');
  $('evMsg').textContent = '';
  $('evBox').classList.add('on');
}
$('evChoices').addEventListener('click', e => {
  const b = e.target.closest('[data-ch]'); if (!b) return;   // 播放中也可以回答事件(事件屬於新的一週)
  const id = S.event && S.event.id;
  const res = E.chooseEvent(S, +b.dataset.ch);
  if (S.event) { $('evMsg').textContent = '⚠ ' + (res || ''); sfx.bad(); return; }
  sfx.pick();
  $('evChoices').innerHTML = `<p class="txt" style="color:#4b3fa0">${esc(res || '')}</p><button class="btn wide" id="evOk">好</button>`;
  $('evOk').addEventListener('click', () => { $('evBox').classList.remove('on'); render(); });
  if (id === 'leave') ptCache.clear();
  save(); render();
});

// ---------- 下一週 ----------
$('nextBtn').addEventListener('click', () => {
  if (!S) return;
  if (playback) { skip(); return; }                // 播放中按下面的按鈕 = 跳過播放
  if(placer.active||landMode){toast('先完成建造或按取消');return;}
  if ($('repBox').classList.contains('on')) { $('repGo').click(); return; }   // 週報還開著:先收起來
  if (S.event) { openEvent(); return; }
  const unassigned = S.ops.filter(o => o.status === 'open' && !o.slots[0].who && o.type !== 'dome').length;
  const idleBidders = E.team(S).filter(st => E.isFree(st) && S.ops.some(o => o.status === 'open' && o.bids.some(b => b.id === st.id)));
  if (unassigned && idleBidders.length && !confirm(`還有 ${unassigned} 個機會沒有人接(會被別家公司接走),確定要進到下一週嗎?`)) return;
  const R = E.endWeek(S);
  if (!R) return;
  save();
  if (noPlay) { placeActors(true); render(); showReport(R); } else play(R);
});
// 「不看播放」:按開始這週就直接出週報(設定記在這台裝置)
let noPlay = false;
try { noPlay = localStorage.getItem('aistar-noplay') === '1'; } catch (e) { /* 被擋就用預設 */ }
function playBtnText() { $('noPlayBtn').textContent = noPlay ? '🎬 播放:關' : '🎬 播放:開'; }
$('noPlayBtn').addEventListener('click', () => {
  noPlay = !noPlay; playBtnText(); sfx.tap();
  try { localStorage.setItem('aistar-noplay', noPlay ? '1' : '0'); } catch (e) { /* 存不了就只在這次有效 */ }
  toast(noPlay ? '之後按「開始這週」會直接出週報' : '之後會在辦公室播完一週');
});
playBtnText();
function showReport(R) {
  $('repTitle').textContent = `第 ${R.week} 週`;
  const dm = R.money1 - R.money0, df = R.fans1 - R.fans0;
  $('repSum').textContent = `💰${dm >= 0 ? '+' : '-'}$${fmt(Math.abs(dm))}  👥${df >= 0 ? '+' : ''}${fmt(df)}`;
  // 只列重點(作品評價、目標、排行);練習、房租這些收在「看全部」
  const minor = R.items.filter(it => !it.big).length;
  $('repList').className = 'rep';
  $('repList').innerHTML = R.items.map(it => {
    const g = it.grade && D.GRADES.find(x => x.g === it.grade);
    return `<li class="${it.big ? '' : 'minor'}">${g ? gradeChip(g) : ''}${esc(it.text)}</li>`;
  }).join('');
  $('repMore').style.display = minor ? '' : 'none';
  $('repMore').textContent = `看全部(還有 ${minor} 項)▾`;
  $('repBox').classList.add('on');
  if (R.grades.includes('S') || R.items.some(i => i.goal)) fanfare(); else if (R.grades.length) sfx.coin();
}
$('repMore').addEventListener('click', () => { $('repList').classList.add('all'); $('repMore').style.display = 'none'; });
$('repGo').addEventListener('click', () => {
  $('repBox').classList.remove('on'); sfx.tap();
  render();
  postReport('report');
});

// ---------- 結局 ----------
function showEnding() {
  const e = S.endingPending || S.ending; if (!e) return;
  $('endTitle').textContent = `${e.icon} ${e.name}`;
  $('endText').textContent = e.text;
  $('endLines').innerHTML = e.lines.map(l => { const st = E.starById(S, l.id); return st ? `<div class="eline">${ptImg(st)}${nameTag(st)}:${esc(l.text)}</div>` : ''; }).join('');
  $('endStats').textContent = `第 ${e.week} 週登上星光巨蛋 · 粉絲 ${fmt(e.fans)} · 排行第 ${e.rank} 名 · 做了 ${S.stats.ops} 個作品(S 評價 ${S.stats.S} 次)`;
  drawEndStage();
  $('endBox').classList.add('on');
  fanfare(); setTimeout(fanfare, 700);
}
function drawEndStage() {
  const c = $('endCv'), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#120e2c'; g.fillRect(0, 0, 320, 150);
  for (let i = 0; i < 40; i++) { g.fillStyle = ['#ffd25a', '#ff5ec4', '#6fe0ff'][i % 3]; g.fillRect((i * 73) % 320, (i * 37) % 60, 2, 2); }
  g.globalAlpha = 0.18; g.fillStyle = '#fff6c0';
  for (const x of [70, 160, 250]) { g.beginPath(); g.moveTo(x - 6, 0); g.lineTo(x + 6, 0); g.lineTo(x + 50, 140); g.lineTo(x - 50, 140); g.fill(); }
  g.globalAlpha = 1;
  const stg = spr('stage');
  g.drawImage(stg, 0, 0, 96, 56, 16, 80, 288, 70);
  const t = E.team(S), w = Math.min(36, 260 / Math.max(1, t.length));
  t.forEach((st, i) => g.drawImage(portrait(st).canvas, 160 - (t.length * w) / 2 + i * w + (w - 24) / 2, 70 + (i % 2) * 4, 24 * 1.4, 32 * 1.4));
}
$('endGo').addEventListener('click', () => {
  if (S.endingPending) E.acceptEnding(S);
  $('endBox').classList.remove('on'); save(); render();
});
$('endNg').addEventListener('click', () => { if (S.endingPending) E.acceptEnding(S); $('endBox').classList.remove('on'); save(); openNg(); });
function openNg() {
  $('ngList').innerHTML = E.team(S).map(st => `<div class="bid">${ptImg(st)}<div class="say">${nameTag(st)} <span class="muted">${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')} · 粉絲 ${fmt(st.fans)}</span></div><div class="act"><button class="sbtn" data-mentor="${st.id}">留下當前輩</button></div></div>`).join('');
  $('ngBox').classList.add('on');
}
$('ngList').addEventListener('click', e => {
  const b = e.target.closest('[data-mentor]'); if (!b) return;
  if (!confirm('開始第二季後,現在這間公司就會結束(獎盃會留著)。確定嗎?')) return;
  boot(E.newSeason(S, b.dataset.mentor, newSeed()));
  $('ngBox').classList.remove('on'); save();
  toast('🌱 第二季開始!全新的明星陣容');
});
$('ngClose').addEventListener('click', () => $('ngBox').classList.remove('on'));
$('helpBtn').addEventListener('click', () => { sfx.tap(); $('helpBox').classList.add('on'); });
$('helpClose').addEventListener('click', () => { $('helpBox').classList.remove('on'); if (S) render(); });

// ============================================================
//  存檔
// ============================================================
function save() {
  if (!S) return;
  S.savedAt = Date.now();
  const r = saveBoth(SAVE_KEY, S);
  badge(r.ls ? 'ok' : 'backup');
  if (!r.ls) r.idb.then(ok => { if (!ok) badge('fail'); });
}
let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 800); }
let badgeT = 0;
function badge(kind) {
  const el = $('saveDot');
  el.textContent = kind === 'fail' ? '⚠ 存檔失敗' : '💾 已存檔';
  el.classList.toggle('bad', kind === 'fail'); el.classList.add('on');
  clearTimeout(badgeT); badgeT = setTimeout(() => el.classList.remove('on'), kind === 'fail' ? 5000 : 1200);
}
addEventListener('visibilitychange', () => { if (document.hidden && running) save(); });
addEventListener('pagehide', () => { if (running) save(); });
setInterval(() => { if (running && S) save(); }, 15000);

const newSeed = () => (Date.now() % 2147483647) || 1;
function show(id) { for (const s of ['startScreen', 'gameScreen']) $(s).classList.toggle('on', s === id); }
/** 把一份存檔放進遊戲(開始、讀存檔碼、第二季都走這裡) */
function boot(sv) {
  cancelPlace();actors.clear();officeGrid=null;S = E.migrate(sv); assistantBubbleWeek=0; tutorialQueue=[]; $('tutorialCard').hidden=true;$('tutorialCard').innerHTML=''; playback=null; sceneKey=''; $('playControls').hidden=true; $('nextBtn').disabled=false;
  for(const n of notifications)n.el.remove();notifications=[];
  actors.clear(); bubQ.clear(); for (const [, b] of bubOn) b.el.remove(); bubOn.clear();
  ptCache.clear(); bgCanvas = null;
  bubbleSeen = Math.max(0, S.seq - 6);           // 開場只冒最近幾句
  feedSeen = S.seq;
  show('gameScreen');
  running = true;
  layout(true); placeActors(true); render(); pickMusic();
  if (S.endingPending) showEnding();
  else if (S.event) setTimeout(openEvent, 600);
}
async function start(fresh) {
  sfx.tap();
  const name = ($('coInput').value || '').trim().slice(0, 12) || '星光 AI 娛樂';
  const sv = fresh ? null : await loadBest(SAVE_KEY);
  if (sv) { boot(sv); return; }
  boot(E.newGame({ seed: newSeed(), company: name }));
  save();
  setTimeout(() => $('helpBox').classList.add('on'), 400);
}
$('startBtn').addEventListener('click', () => start(false));
$('newBtn').addEventListener('click', async () => {
  if ((await loadBest(SAVE_KEY)) && !confirm('確定要重新開一間公司嗎?現在的進度會不見。(想留著的話先按「📦 備份存檔碼」)')) return;
  start(true);
});
$('backBtn').addEventListener('click', () => { save(); running = false; stopMusic(); refreshStart(); show('startScreen'); });
async function refreshStart() {
  const s = await loadBest(SAVE_KEY);
  $('backupBtn').style.display = s ? '' : 'none';
  $('nameRow').style.display = s ? 'none' : '';
  $('trophyNote').textContent = s && s.trophies && s.trophies.length ? `🏆 獎盃牆:${s.trophies.map(x => x.icon).join('')}` : '';
  if (s) {
    const fans = (s.stars || []).filter(x => !x.gone).reduce((a, x) => a + x.fans, 0);
    $('startBtn').textContent = `繼續經營(${s.ng ? `第 ${s.ng + 1} 季 · ` : ''}第 ${s.week} 週 · 粉絲 ${fmt(fans)})`;
    $('newBtn').style.display = '';
  } else { $('startBtn').textContent = '開一間公司!'; $('newBtn').style.display = 'none'; }
}
refreshStart();

// ---------- 存檔碼 ----------
let codeMode = 'backup';
async function openCode(mode) {
  codeMode = mode; $('codeMsg').textContent = '';
  if (mode === 'backup') {
    if (S) save();
    const sv = S || await loadBest(SAVE_KEY); if (!sv) return;
    $('codeTitle').textContent = '📦 備份存檔碼';
    $('codeHow').innerHTML = '把下面這一整串複製起來(傳給自己、存在備忘錄)。<br>換手機、或 iPhone 主畫面 App 跟 Safari 之間,用「📥 輸入存檔碼」貼上就能接著玩。';
    $('codeText').value = await encodeSave(sv); $('codeText').readOnly = true;
    $('codeGo').textContent = '複製';
  } else {
    $('codeTitle').textContent = '📥 輸入存檔碼';
    $('codeHow').innerHTML = `把存檔碼整串貼在下面。<b>會蓋掉「${esc(currentProfile().name)}」現在的公司。</b>`;
    $('codeText').value = ''; $('codeText').readOnly = false;
    $('codeGo').textContent = '讀取這個存檔';
  }
  $('codeBox').classList.add('on');
}
$('backupBtn').addEventListener('click', () => openCode('backup'));
$('restoreBtn').addEventListener('click', () => openCode('restore'));
$('codeClose').addEventListener('click', () => $('codeBox').classList.remove('on'));
$('codeGo').addEventListener('click', async () => {
  const ta = $('codeText');
  if (codeMode === 'backup') {
    ta.focus(); ta.select();
    let ok = false;
    try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
    $('codeMsg').textContent = ok ? '✅ 複製好了!' : '請長按上面的文字 → 全選 → 拷貝';
    return;
  }
  try {
    const sv = await decodeSave(ta.value);
    const cur = await loadBest(SAVE_KEY);
    if (cur && !confirm(`要用存檔碼裡的公司(第 ${sv.week} 週)蓋掉現在的公司(第 ${cur.week} 週)嗎?`)) return;
    sv.savedAt = Date.now();
    const r = saveBoth(SAVE_KEY, sv);
    if (!r.ls && !(await r.idb)) throw new Error('這台裝置存不下,空間滿了');
    $('codeMsg').textContent = `✅ 讀到了!第 ${sv.week} 週的「${sv.company}」`;
    await refreshStart();
    setTimeout(() => $('codeBox').classList.remove('on'), 900);
  } catch (e) { $('codeMsg').textContent = '❌ ' + e.message; }
});

requestAnimationFrame(frame);

// 開發用:自動玩家、快轉
if (import.meta.env?.DEV !== false) window.AS = {   // 開發用(正式版沒有;Node 假 DOM 測試也要用)
  get S() { return S; }, O, placer, pointerHandlers, startRoom, confirmPlace, cancelPlace, openLand, openBuild, openFloor, closeSheet, openSheet, get landMode(){return landMode;}, openAssistant, adviceCard, showTip, analysisHTML, scheduleHTML, openStar, openPicker, cycleDay, openWalkin, notify, walkinHTML, openVisit, openNpc, renderPartners, openEvaluation, openTrainer, openAwards, openProjectWizard, openGroupWizard, actors, cam, view, E, D, play, skip, render, save, boot, showEnding, openEvent, refreshStart, loadBest: () => loadBest(SAVE_KEY),
  next() { $('nextBtn').click(); }, closeReport() { $('repGo').click(); },
  // 窗格在背景時 requestAnimationFrame 不跑:手動推進 sec 秒的畫格
  tick(sec = 1) { const t0 = performance.now(); for (let t = 0; t < sec; t += 0.05) { step(0.05); updateBubbles(t0 + t * 1000); } draw(t0 + sec * 1000); updateBubbles(t0 + sec * 1000); },
};

function staffTarget(st,idx){return targetOf(st,idx);}
function recruitmentHTML() {
 const lv=E.roomLv(S,'scout'), reveal=S.assistant.lv>=2||lv>=3||S.staff.some(st=>st.role==='scout'&&st.lv===3);
 return districtHTML()+`<div class="card2" id="scouted"><b>🙋 新人(自薦/星探)</b><div class="meta">練習生 ${E.team(S).filter(st=>st.trainee).length}/${E.traineeCapacity(S)} 位${lv?'':' · 蓋星探部就能找新人'}</div>`+S.walkins.map(st=>walkinHTML(st)).join('')+S.scouted.map(st=>`<div class="bid">${ptImg(st)}<div class="say">${nameTag(st)}<div class="why">${st.traits.map(t=>D.TRAITS[t].name).join(' · ')}<br>${careerTag(st)} · 潛力 ${S.assistant.lv>=1||lv>=2?E.potentialStars(st):'?'}${S.assistant.lv>=2?' · '+D.SKILL_IDS.map(k=>D.SKILLS[k].name+' '+st.skills[k].toFixed(1)).join(' · '):reveal?' · 專長 '+D.SKILLS[E.bestSkill(st)].name:''}<br>${esc(st.intro)}</div><button class="sbtn" data-scout-sign="${st.id}">簽成練習生 $300</button> <button class="sbtn ghost" data-scout-no="${st.id}">不用了</button></div></div>`).join('')+`</div><div class="card2"><b>👥 員工 (${S.staff.length}/${1+S.lv})</b>`+S.staff.map(st=>`<div class="floorRow"><div>${D.STAFF_ROLES[st.role].icon} ${esc(st.name)} Lv${st.lv}${st.skill?' · '+D.SKILLS[st.skill].name:''}<div class="meta">${D.STAFF_ROLES[st.role].desc} · 週薪 $${D.staffSalary(st)}</div></div><button class="sbtn ghost" data-fire="${st.id}">謝謝你，再見</button></div>`).join('')+`<div class="h4">請人 $${600+300*S.staff.length}</div>`+Object.entries(D.STAFF_ROLES).map(([role,r])=>{const why=E.canHire(S,role);return `<button class="choice" data-hire="${role}" ${why?'disabled':''}>${r.icon} ${r.name}<div class="meta">${r.desc}${why?' · '+why:''}</div></button>`;}).join('')+'</div>';
}
function openTrainer() {
 $('roomTitle').textContent='🏋 訓練師要教哪一科?';
 $('roomBody').innerHTML=D.SKILL_IDS.map(k=>`<button class="choice" data-trainer="${k}">${D.SKILLS[k].icon} ${D.SKILLS[k].name}</button>`).join('');$('roomBox').classList.add('on');
}
$('roomBody').addEventListener('click',e=>{
 const b=e.target.closest('[data-trainer],[data-eval-debut]');if(!b||playback)return;
 const err=b.dataset.trainer?E.hire(S,'trainer',b.dataset.trainer):E.debut(S,b.dataset.evalDebut);
 if(err)toast(err);else if(b.dataset.trainer)$('roomBox').classList.remove('on');
 else openEvaluation(S.report); saveSoon();render();
});
function openEvaluation(R) {
 showTip('evaluation');
 evaluationOpen=true;
 $('roomTitle').textContent='🌱 月末評鑑 · 第 '+R.week+' 週';
 $('roomBody').innerHTML=`<div style="text-align:center"><img width="192" height="96" src="${spr('score_board').toDataURL()}" alt="評鑑分數板"></div>`+R.evaluation.map(ev=>{
 const st=E.starById(S,ev.id),why=E.debuted(S).length>=D.LEVELS[S.lv].max?'名額滿了，公司升級後才能出道':S.money<1000?'出道舞台要 $1,000':'';
 return `<div class="bid">${ptImg(st)}<div class="say"><b>${esc(st.name)}</b> · 練習 ${ev.weeks} 週<div><strong style="font-size:36px;color:${D.GRADES.find(g=>g.g===ev.grade).color}">${ev.grade}</strong> ${ev.score.toFixed(1)} 分</div>${!st.trainee?'🎉 已出道!':ev.canDebut?`<button class="choice" data-eval-debut="${st.id}" ${why?'disabled':''}>${why||'🎉 出道! $1,000'}</button>`:'繼續練習，下次再加油!'}</div></div>`;
 }).join('');$('roomBox').classList.add('on');
}

function openCompany(section) {
 openSheet();tab='co';for(const b of $('tabs').children)b.classList.toggle('on',b.dataset.tab===tab);
 render();if(section)$(section)?.scrollIntoView?.({block:'nearest'});
}

// ============================================================
//  第 3 階段:🎛 製作分頁(企劃、排行、上架作品、團體、SNS)、頒獎典禮
// ============================================================
function prodHTML() {
  const lv = E.roomLv(S, 'production');
  let h = `<div class="card2"><b>🎛 製作部</b>`;
  if (!lv) h += `<div class="meta">先蓋 🎛 製作部,就能自己做單曲、短劇、綜藝和團體專輯。做好了每週都有播放分潤。</div><button class="sbtn" data-gotobuild="1">🏗 去蓋房間</button></div>`;
  else h += `<div class="meta">Lv${lv} · 同時可以做 ${E.projectSlots(S)} 個企劃(現在 ${E.projectsRunning(S)} 個)</div><button class="sbtn" data-proj-new="1" ${E.projectsRunning(S) >= E.projectSlots(S) ? 'disabled' : ''}>＋ 新企劃</button></div>`;
  for (const op of S.ops.filter(o => o.project)) h += op.status === 'open' ? opCard(op, `<div class="acts"><button class="sbtn ghost" data-proj-cancel="${op.id}">取消企劃(退一半預算)</button></div>`) : runCard(op);
  // 音樂排行
  if (S.chart?.length) h += `<div class="card2"><b>🎵 本週音樂排行</b><ul class="chart">${S.chart.map((c, i) => `<li class="${c.mine ? 'me' : ''}"><span class="no">${i + 1}</span><span class="ti">${esc(c.title)} <span class="muted">${esc(c.artist)}</span></span><span class="ar">${c.prev ? (c.prev > i + 1 ? '▲' : c.prev < i + 1 ? '▼' : '－') : 'NEW'}</span></li>`).join('')}</ul><div class="meta">上架 6 週內的歌會上榜;上「🎶 打歌舞台」(在機會分頁)可以加分。</div></div>`;
  // 上架作品
  const rel = (S.releases || []).filter(r => r.weeksLeft > 0 || S.week - r.week < 12).slice(-6).reverse();
  if (rel.length) h += `<div class="card2"><b>💿 上架中的作品</b>${rel.map(r => {
    const g = D.GRADES.find(x => x.g === r.grade), grp = r.groupId && E.groupById(S, r.groupId);
    return `<div class="floorRow"><div>${D.MEDIA[r.type].icon} ${esc(r.title)} ${gradeChip(g)}<div class="meta">${grp ? esc(grp.name) : r.artists.map(id => esc(E.starById(S, id)?.name || '')).join('、')} · ${r.weeksLeft > 0 ? `分潤還有 ${r.weeksLeft} 週` : '分潤結束'} · 累計 $${fmt(r.total.money)}、粉絲 +${fmt(r.total.fans)}${r.wins ? ` · 🏆 一位 ${r.wins} 次` : ''}</div></div></div>`;
  }).join('')}</div>`;
  // 團體
  h += `<div class="card2"><b>👯 團體</b>`;
  for (const g of S.groups || []) {
    const tw = E.teamwork(S, g), c = D.CONCEPTS[g.concept];
    h += `<div class="card2" style="background:#f7f4ff;box-shadow:none;margin:8px 0 0"><b>${c.icon} ${esc(g.name)}</b> <span class="tag">${c.name}風</span>
      <div class="members">${g.members.map(id => E.starById(S, id)).filter(st => st && !st.gone).map(st => `<span title="${esc(st.name)}">${ptImg(st)}${g.center === st.id ? '⭐' : ''}</span>`).join('')}</div>
      <div class="meta">默契 ${tw}<div class="twbar"><i style="width:${tw}%"></i></div>團體粉絲 ${fmt(g.fans)} · 專輯 ${g.albums || 0} 張${g.wins ? ` · 一位 ${g.wins} 次` : ''}${g.center ? ` · 上次 C 位:${esc(E.starById(S, g.center)?.name || '')}` : ''}</div>
      <div class="acts"><button class="sbtn" data-grp-album="${g.id}">💽 做新專輯</button><button class="sbtn ghost" data-grp-disband="${g.id}">解散</button></div></div>`;
  }
  const can = E.debuted(S).filter(st => !E.groupOf(S, st.id)).length;
  h += `<div class="meta">選 3~5 位已出道的明星組團,團員感情越好默契越高;做專輯時大家會搶 C 位!</div><button class="sbtn" data-grp-new="1" ${can < 3 ? 'disabled' : ''}>＋ 成立新團體($${fmt(D.GROUP_COST)})</button>${can < 3 ? '<span class="muted"> 沒有團的已出道明星要 3 位以上</span>' : ''}</div>`;
  // SNS
  h += `<div class="card2"><b>📱 SNS</b>`;
  if (!E.roomLv(S, 'sns')) h += `<div class="meta">蓋 📱 SNS 部門之後,每週選一種貼文策略,大家會被動漲粉。</div><button class="sbtn" data-gotobuild="1">🏗 去蓋房間</button>`;
  else h += `<div class="meta">這週的貼文策略(SNS 部門 Lv${E.roomLv(S, 'sns')}):</div><div class="snsOpts">${Object.entries(D.SNS).map(([k, v]) => `<button data-sns="${k}" class="${S.sns.strategy === k ? 'on' : ''}">${v.icon} ${v.name}<div class="muted">${v.desc}</div></button>`).join('')}</div>`;
  h += (S.posts || []).slice(0, 6).map(p => { const st = E.starById(S, p.id); return st ? `<div class="post">${ptImg(st)}<div><b style="color:${st.glow}">${esc(st.name)}</b> <span class="muted">第 ${p.week} 週</span><div>${esc(p.text)}</div><div class="lk">♥ ${fmt(p.likes)}</div></div></div>` : ''; }).join('');
  return h + '</div>';
}

// ---------- 新企劃精靈(類型 → 預算 → 團體) ----------
let wiz = null;
function openProjectWizard(type = null, groupId = null) {
  wiz = { type, groupId: groupId || (S.groups[0] && S.groups[0].id) || null };
  wizStep();
  $('roomBox').classList.add('on');
}
function wizStep() {
  if (!wiz.type) {
    $('roomTitle').textContent = '🎛 新企劃:要做什麼?';
    $('roomBody').innerHTML = D.PROJECTS.map(t => {
      const m = D.MEDIA[t], why = E.canStartProject(S, t, 'small', wiz.groupId);
      const blocked = why && !/預算/.test(why);
      return `<button class="choice" data-wiz="type" data-v="${t}" ${blocked ? 'disabled' : ''}>${m.icon} ${m.name}<div class="muted">${m.weeks} 週、每週 ${m.days} 天 · 看${Object.keys(m.w).map(k => D.SKILLS[k].icon).join('')}${t === 'group_album' ? '(依團體風格)' : ''}${blocked ? ' · ' + why : ''}</div></button>`;
    }).join('');
    return;
  }
  if (wiz.type === 'group_album' && !wiz.groupOk && S.groups.length > 1) {
    $('roomTitle').textContent = '💽 哪一團要出專輯?';
    $('roomBody').innerHTML = S.groups.map(g => `<button class="choice" data-wiz="group" data-v="${g.id}">${D.CONCEPTS[g.concept].icon} ${esc(g.name)}<div class="muted">默契 ${E.teamwork(S, g)} · 粉絲 ${fmt(g.fans)}</div></button>`).join('');
    return;
  }
  $('roomTitle').textContent = `${D.MEDIA[wiz.type].icon} ${D.MEDIA[wiz.type].name}:預算多少?`;
  $('roomBody').innerHTML = `<p class="txt" style="font-size:13px">預算越高,作品品質加越多,上架後的分潤也越多。</p>` + Object.entries(D.BUDGETS).map(([k, b]) => {
    const why = E.canStartProject(S, wiz.type, k, wiz.groupId);
    return `<button class="choice" data-wiz="budget" data-v="${k}" ${why ? 'disabled' : ''}>${b.name}預算 $${fmt(b.cost)}<div class="muted">品質 +${b.bonus} · 分潤 ×${b.mult}${why ? ' · ' + why : ''}</div></button>`;
  }).join('');
}

// ---------- 成立團體 ----------
let grpConcept = 'cute', grpSuggest = '';
function openGroupWizard() {
  grpConcept = 'cute'; grpSuggest = E.randomGroupName(S);
  const pool = E.debuted(S).filter(st => !E.groupOf(S, st.id));
  $('roomTitle').textContent = '👯 成立新團體';
  $('roomBody').innerHTML = `<div class="meta">選 3~5 位團員(感情好的人放一起,默契比較高)</div><div class="picklist">${pool.map(st => `<label><input type="checkbox" data-member="${st.id}">${ptImg(st)}<span><b style="color:${st.glow}">${esc(st.name)}</b> <span class="muted">${careerTag(st)} · ${D.SKILL_IDS.map(k => D.SKILLS[k].icon + st.skills[k].toFixed(0)).join(' ')}</span></span></label>`).join('')}</div>
    <input id="grpName" maxlength="10" placeholder="團名(不填就用:${esc(grpSuggest)})">
    <div class="meta">風格:</div><div class="snsOpts" id="grpConcepts">${Object.entries(D.CONCEPTS).map(([k, c]) => `<button data-wiz="concept" data-v="${k}" class="${k === grpConcept ? 'on' : ''}">${c.icon} ${c.name}<div class="muted">看${Object.keys(c.w).map(x => D.SKILLS[x].icon + D.SKILLS[x].name).join('、')}</div></button>`).join('')}</div>
    <button class="btn wide" data-wiz="grpok" style="margin-top:10px">成立!($${fmt(D.GROUP_COST)})</button>`;
  $('roomBox').classList.add('on');
}
$('roomBody').addEventListener('click', e => {
  const b = e.target.closest('[data-wiz]'); if (!b || playback) return;
  const k = b.dataset.wiz, v = b.dataset.v;
  if (k === 'type') { wiz.type = v; sfx.tap(); wizStep(); return; }
  if (k === 'group') { wiz.groupId = v; wiz.groupOk = true; sfx.tap(); wizStep(); return; }
  if (k === 'budget') {
    const err = E.startProject(S, wiz.type, v, wiz.groupId);
    if (err) { toast('⚠ ' + err); sfx.bad(); return; }
    sfx.pick(); $('roomBox').classList.remove('on');openSheet(); toast(`🎛 企劃開始了!到「🎛 製作」選人`);
    openSheet();tab = 'prod'; for (const x of $('tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
    save(); render(); return;
  }
  if (k === 'concept') { grpConcept = v; for (const x of $('grpConcepts').children) x.classList.toggle('on', x.dataset.v === v); sfx.tap(); return; }
  if (k === 'grpok') {
    const ids = [...$('roomBody').querySelectorAll('[data-member]')].filter(x => x.checked).map(x => x.dataset.member);
    const err = E.formGroup(S, $('grpName').value.trim() || grpSuggest, grpConcept, ids);
    if (err) { toast('⚠ ' + err); sfx.bad(); return; }
    fanfare(); $('roomBox').classList.remove('on'); toast('👯 新團體成立了!');
    save(); render();
  }
});

// ---------- 週報之後:評鑑 → 頒獎 → 結局 / 事件 ----------
function postReport(from) {
  const R = S.report;
  if (from === 'report' && R?.evaluation?.length) { openEvaluation(R); return; }
  if ((from === 'report' || from === 'eval') && R?.awards?.length) { openAwards(R); return; }
  if (S.endingPending) showEnding();
  else if (S.event) openEvent();
}

// ---------- 頒獎典禮 ----------
let award = null;
function openAwards(R) {
 showTip('awards');
  award = { list: R.awards, i: 0, shown: false };
  $('awardImg').src = spr('red_carpet').toDataURL();
  renderAward();
  $('awardBox').classList.add('on');
}
function renderAward() {
  const a = award.list[award.i];
  $('awardTitle').textContent = `🏆 年度頒獎典禮 · ${a.icon} ${a.name}`;
  const noms = a.nominees.map(n => {
    const st = n.id && E.starById(S, n.id), win = award.shown && n.label === a.winner.label && n.value === a.winner.value;   // 存檔讀回來不是同一個物件,用內容比
    return `<div class="nom ${win ? 'win' : ''}"><span>${st ? ptImg(st) : ''}${n.mine ? '⭐ ' : ''}${esc(n.label)}</span><span class="v">${award.shown ? (win ? '🏆 得獎!' : '') : '入圍'}</span></div>`;
  }).join('');
  $('awardBody').innerHTML = `<div class="meta">入圍名單(⭐ 是我們公司的)</div>${noms}${award.shown ? `<p class="txt" style="margin:6px 0 0">${a.winner.mine ? '🎉 恭喜!' : a.nominees.some(n => n.mine) ? '這次沒拿到,下次再加油!' : '這個獎我們沒有入圍,明年加油!'}</p>` : ''}`;
  $('awardGo').textContent = !award.shown ? '揭曉!' : award.i < award.list.length - 1 ? '下一個獎 ▶' : '典禮結束';
  $('awardConfetti').innerHTML = '';
  if (award.shown && a.winner.mine) {
    $('awardConfetti').innerHTML = Array.from({ length: 30 }, (_, k) => `<span style="left:${(k * 37) % 100}%;top:${-(k % 5) * 6}px;background:${['#ffd25a', '#ff5ec4', '#6fe0ff', '#7fdc8a'][k % 4]};animation-delay:${(k % 7) * 0.08}s"></span>`).join('');
    fanfare();
  } else if (award.shown) sfx.lose();
}
$('awardGo').addEventListener('click', () => {
  if (!award) return;
  if (!award.shown) { award.shown = true; renderAward(); return; }
  if (award.i < award.list.length - 1) { award.i++; award.shown = false; sfx.tap(); renderAward(); return; }
  closeAwards();
});
$('awardSkip').addEventListener('click', closeAwards);
function closeAwards() { $('awardBox').classList.remove('on'); award = null; render(); postReport('awards'); }

function renderPartners(){
 let h='<div class="card2" id="partners"><b>🤝 合作</b>';
 if(!E.roomLv(S,'meeting'))h+='<p>蓋 🤝 會議室，別家公司就會來找你合作</p><button class="sbtn" data-gotobuild="1">去蓋房間</button>';
 h+=S.rivals.map((r,i)=>`<div class="card2"><b>${r.icon} ${esc(r.name)}</b><div>粉絲 ${fmt(r.fans)} · 友好度 ${r.rel}/100</div><progress max="100" value="${r.rel}" style="width:100%"></progress><div>${r.stars.map(st=>`<button class="sbtn ghost" data-npc="${st.id}" aria-label="${esc(st.name)}">${ptImg(st)}</button>`).join('')}<button class="sbtn" data-visit="${i+1}">👀 參觀</button></div></div>`).join('');
 h+=S.offers.map(o=>`<div class="card2"><b>${esc(S.rivals[o.partner].name)} · ${D.OFFERS[o.type].name}</b><p>派 ${o.op.slots.length} 人 · 每週 ${o.op.days} 天、${o.op.weeks} 週${o.type==='loan'?` · ${D.SKILLS[o.op.loanSkill].name} ≥ 5`:''}</p><div>預估酬勞 $${fmt(E.cooperationPreview(S,o.op).money)} · 粉絲 +${fmt(E.cooperationPreview(S,o.op).fans)}</div><div class="muted">本週內回覆，實際成果依演出評價。</div><button class="sbtn" data-offer-yes="${o.id}">接受</button> <button class="sbtn ghost" data-offer-no="${o.id}">婉拒</button></div>`).join('');
 return h+'</div>';
}
function openNpc(id){const st=S.rivals.flatMap(r=>r.stars).find(st=>st.id===id);if(!st)return;$('roomTitle').textContent=st.name;$('roomBody').innerHTML=ptImg(st)+`<p>${st.traits.map(t=>D.TRAITS[t].name).join('、')}</p><p>${D.SKILL_IDS.map(k=>D.SKILLS[k].name+' '+st.skills[k].toFixed(1)).join(' · ')}</p>`;$('roomBox').classList.add('on');}
function openVisit(i){
 const r=S.rivals[i];$('roomTitle').textContent=`👀 ${r.icon} ${r.name}`;
 $('roomBody').innerHTML=`<canvas id="visitCanvas" style="width:100%;max-width:320px;image-rendering:pixelated"></canvas><p>${r.intro}</p><p>友好度 ${r.rel}/100 · 已合作 ${r.collabs} 次</p>`;
 const c=$('visitCanvas');c.width=320;c.height=r.rooms.length*96;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
 r.rooms.forEach((type,idx)=>{const y=(r.rooms.length-1-idx)*96,room=ROOMS[type],wall=toCanvas(stWall({color:r.color}));for(let x=0;x<320;x+=32){g.drawImage(wall,x,y);for(let yy=48;yy<96;yy+=32)g.drawImage(spr('floor_'+room.kind),x,y+yy,32,Math.min(32,96-yy));}for(const [k,x,yy,lv] of room.furniture)if(lv<=2)g.drawImage(spr(k),x,y+yy);g.fillStyle='#fff';g.font='10px sans-serif';g.fillText(`${idx+1}F ${D.FLOORS[type].name}`,4,y+12);});
 const base=document.createElement('canvas');base.width=c.width;base.height=c.height;base.getContext('2d').drawImage(c,0,0);
 const animate=()=>{if(!$('roomBox').classList.contains('on')||$('visitCanvas')!==c)return;g.drawImage(base,0,0);r.stars.forEach((st,j)=>g.drawImage(portrait(st,'down',Math.floor(performance.now()/600)%2?'idle0':'walk1').canvas,90+j*45,(r.rooms.length-2-j)*96+48));requestAnimationFrame(animate);};$('roomBox').classList.add('on');animate();
}

const streetCache={};
function streetSprite(k){return streetCache[k] ||= toCanvas(STREET_KIT[k].make());}
let notifications=[];
function notify(f){const el=document.createElement('div');el.className='notice';el.textContent=f.text;$('notifications').appendChild(el);notifications.push({el,until:performance.now()+4000});while(notifications.length>(cam.w<900?2:3))notifications.shift().el.remove();}
$('logBtn').onclick=()=>{feedSeen=S.seq;$('bFeed').style.display='none';$('roomTitle').textContent='📜 紀錄';$('roomBody').innerHTML=feedHTML();$('roomBox').classList.add('on');};
const conditionText=st=>({lead:'想當主角',album:'想要自己的單曲',off:'每週至少一天放假'}[st.walkinCondition]||'沒有額外條件');
function walkinHTML(st){return `<div class="card2">${ptImg(st)}<b>${esc(st.name)} · ${st.trainee?'🌱 素人':'⭐ 有經驗的明星'}</b><p>${esc(st.intro)}</p><p>${st.traits.map(t=>D.TRAITS[t].name).join(' · ')} · ${careerTag(st)}</p><p>${D.SKILL_IDS.map(k=>D.SKILLS[k].name+':'+(S.assistant.lv>=2||!st.trainee||k===E.bestSkill(st)?st.skills[k].toFixed(1):'?')).join(' · ')}</p><p>潛力 ${S.assistant.lv>=1||E.roomLv(S,'scout')>=2?E.potentialStars(st):'?'} · ${conditionText(st)}</p><button class="sbtn" data-walkin-sign="${st.id}">簽約 $${fmt(st.signCost)}</button> <button class="sbtn ghost" data-walkin-no="${st.id}">婉拒</button></div>`;}
function openWalkin(id){const st=S.walkins.find(s=>s.id===id);if(!st)return;$('roomTitle').textContent='🙋 自薦';$('roomBody').innerHTML=walkinHTML(st);$('roomBox').classList.add('on');}
function districtHTML(){const d=E.district(S),n=D.DISTRICTS[D.DISTRICTS.indexOf(d)+1];return `<div class="card2"><b>🚚 地區 · ${d.icon} ${d.name}</b><img style="width:100%;height:48px;object-fit:cover;image-rendering:pixelated" src="${streetSprite('skyline_'+d.id).toDataURL()}" alt="${d.name}街景"><p>房租 ×${d.rent} · 粉絲/酬勞 +${Math.round(d.bonus*100)}% · 每週機會 +${d.ops}</p>${n?`<p>下一站:${n.icon} ${n.name} · 公司 Lv${n.lv}${n.fans?' · 粉絲 '+fmt(n.fans):''} · $${fmt(n.cost)}<br>房租 ×${n.rent} · 粉絲/酬勞 +${n.bonus*100}% · 每週機會 +${n.ops}</p><button class="sbtn" data-move="${n.id}" ${E.canMoveDistrict(S,n.id)?'disabled':''}>搬家</button>`:'已到最終地區'}</div>`;}
for(const id of ['panel','roomBody'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-walkin-sign],[data-walkin-no],[data-move]');if(!b||playback)return;let err;if(b.dataset.move){if(!confirm('確定搬家?所有房間、明星和員工都會一起搬。'))return;err=E.moveDistrict(S,b.dataset.move);}else if(b.dataset.walkinSign)err=E.signWalkin(S,b.dataset.walkinSign);else E.declineWalkin(S,b.dataset.walkinNo);if(err)toast(err);else{$('roomBox').classList.remove('on');render();save();}});

let assistantBubbleWeek=0;
function assistantTarget(){return targetOf(S.assistant,0);}
const impact=t=>S.tipsOff?'':`<div class="impact">${esc(t)}</div>`;
function scoreHTML(st,op,slot){return S.assistant.lv>=3?`<small>${Math.round(E.perf(S,st,op,slot,false))}</small>`:'';}
function gradeLabel(st,op,slot){return E.estimate(S,st,op,slot).g+(S.assistant.lv>=3?' '+Math.round(E.perf(S,st,op,slot,false)):'');}
function adviceCard(){const text=E.assistantAdvice(S);return text&&S.adviceDismissedWeek!==S.week?`<div class="card2 assistantAdvice"><button class="sbtn ghost" data-dismiss-advice="1" aria-label="收起本週建議">✕</button><b>💡 本週建議</b><p>${esc(text)}</p><button class="sbtn" data-assistant="1">找小助理</button></div>`:'';}
function openAssistant(){$('roomTitle').textContent='💡 小助理';$('roomBody').innerHTML=ptImg(S.assistant)+`<b>${esc(S.assistant.name)} · ${E.ASSISTANT_TITLES[S.assistant.lv]} Lv${S.assistant.lv}</b><p>本週建議:${esc(E.assistantAdvice(S)||'升級成分析師,就能繼續收到每週建議。')}</p><p>Lv1:潛力星星、每週建議。Lv2:適性、候選全部技能。Lv3:推薦人選、預估分數。</p><button class="choice" data-assistant-up="1" ${S.assistant.lv===3?'disabled':''}>升級 ${E.ASSISTANT_COSTS[S.assistant.lv]?'$'+fmt(E.ASSISTANT_COSTS[S.assistant.lv]):'已滿級'}</button><button class="choice" data-tips-toggle="1">教學提示:${S.tipsOff?'關':'開'}</button>`;$('roomBox').classList.add('on');}
function analysisHTML(st){const a=E.analyzeStar(S,st),k=a.strongest;return `<div id="developmentAnalysis" class="card2"><b>📈 發展分析</b><p>最突出:${D.SKILLS[k.skill].name} ${k.value.toFixed(1)},全公司第 ${k.rank}。${esc(a.trait)}</p><p>下一個目標:${esc(a.next.text)}<br>${esc(a.next.progress)}</p><p>建議練習:${esc(a.advice)}</p>${a.aptitude.length?`<p>🧭 適性:${a.aptitude.slice(0,3).map(x=>x.name+' '+x.score).join('、')}${a.aptitude[0].id!==st.career?'<br>其實他也很適合當 '+a.aptitude[0].name:''}</p>`:''}</div>`;}
function scheduleStats(st){return D.SKILL_IDS.map(k=>`${k===E.bestSkill(st)?'<b>':''}${D.SKILLS[k].icon}${st.skills[k].toFixed(1)}${k===E.bestSkill(st)?'</b>':''}`).join(' ')+` · ⚡${Math.round(st.energy)} ${moodFace(st.mood)}`;}
function scheduleGains(st){return D.SKILL_IDS.map(k=>{const days=st.sched.filter(v=>v==='train:'+k).length;return days?'本週 '+D.SKILLS[k].icon+' +'+E.trainingGain(S,st,k,days).toFixed(1):'';}).filter(Boolean).join(' · ');}
const TIP_TEXT={ops:['📋 機會','先看技能與預估評價,再選適合的人。','沒人接的機會,下週會被別家公司接走。'],sched:['📅 行程','每人每週選一件事就好。','工作天照預約,週日固定休息。'],stars:['⭐ 明星與行程','每人每週選一件事:練哪項、直播、休息或放假。','工作天照預約,週日固定休息;點名字展開資料。'],prod:['🎛 製作','蓋製作部後,可以做自己的作品。','上架後每週都有播放分潤。'],co:['🏢 公司','在這裡升級公司、擴建、找新人和員工。','搬到新地區也能提高曝光。'],event:['📣 事件','每個選擇都有不同影響。','處理事件後才能進到下一週。'],evaluation:['🌱 月末評鑑','每四週檢查練習生的進步。','準備好了就能安排出道。'],awards:['🏆 頒獎','每二十四週舉辦頒獎典禮。','作品與粉絲都是努力的成果。'],offer:['🤝 合作邀請','別家公司會提出合作。','注意天數、技能要求與回覆期限。'],walkin:['🙋 自薦','有人來公司毛遂自薦。','兩週沒回覆就會離開,記得看條件。']};
let tutorialQueue=[];
function showTip(key){
 if(!S||S.tipsOff||S.seenTips.includes(key)||!TIP_TEXT[key])return;
 const box=$('tutorialCard');
 // 有別的視窗開著(例如一開始的「怎麼玩」)或已經有一張提示卡,先排隊,關掉之後再出現
 if((!box.hidden&&box.innerHTML)||document.querySelector?.('.modal.on')){if(key!==box.dataset.tip&&!tutorialQueue.includes(key))tutorialQueue.push(key);return;}
 box.dataset.tip=key;
 box.innerHTML=`<b>${TIP_TEXT[key][0]}</b><p>${TIP_TEXT[key].slice(1).map(esc).join('<br>')}</p><button class="sbtn" id="tipUnderstood">知道了</button>`;
 box.hidden=false;
 $('tipUnderstood').onclick=()=>{if(!S.seenTips.includes(key))S.seenTips.push(key);box.hidden=true;box.innerHTML='';saveSoon();const next=tutorialQueue.shift();if(next)showTip(next);render();};
}
$('panel').addEventListener('click',e=>{const b=e.target.closest('[data-dismiss-advice],[data-assistant]');if(!b)return;if(b.dataset.assistant)openAssistant();else{S.adviceDismissedWeek=S.week;render();saveSoon();}});
