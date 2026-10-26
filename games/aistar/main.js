/* ============================================================
   AI 明星養成:畫面
   上:攝影棚(pixelkit 程式畫的場景 + Q 版小人,頭上冒對話泡泡)
   下:📋 機會 / ⭐ 明星 / 💬 訊息 / 🏢 公司 四個分頁 + ▶ 下一週
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

// 公司剖面：世界座標由樓頂向下，樓層索引仍由 1F 往上。
const RW = 416, TX = 48;
const cv = $('cv'), ctx = cv.getContext('2d');
const cam = new Camera(cv, { worldW:416, worldH:664, maxScale:3 });
const view = {ctx, get w(){return cam.w;}, get h(){return cam.h;}, get dpr(){return cam.dpr;}};
let sceneKey='', bgCanvas=null, playback=null, speed=1, sceneTime=0;
const actors = new Map(), sprCache={};
const spr = k => sprCache[k] ||= toCanvas(ST[k].make());
const floorY = i => 128 + (S.floors.length-1-i)*96;
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
function layout(initial=false) {
  const nextH=(S?.floors.length||5)*96+184, delta=nextH-cam.worldH;
  cam.worldH=nextH;
  if(!initial && delta){cam.y+=delta;for(const a of actors.values()){a.y+=delta;if(a.dest)a.dest.y+=delta;}}
  cam.resize();
  if(initial) {cam.s=cam.w/RW;cam.x=0;cam.y=cam.worldH-cam.h/cam.s;cam.clamp();}
}
new ResizeObserver(()=>layout()).observe(cv);
function buildBg() {
  const c=document.createElement('canvas');c.width=416;c.height=cam.worldH;
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  drawStreet(g);g.save();g.translate(TX,0);
  S.floors.forEach((f,i)=>{
    const y=floorY(i), r=ROOMS[f.type], wall=toCanvas(stWall({color:r.color}));
    g.save();g.beginPath();g.rect(0,y,288,48);g.clip();
    for(let x=0;x<288;x+=32)g.drawImage(wall,x,y);g.restore();
    for(let yy=48;yy<96;yy+=32)for(let x=0;x<288;x+=32)g.drawImage(spr('floor_'+r.kind),x,y+yy,32,Math.min(32,96-yy));
    for(const [k,x,yy,lv] of r.furniture) if(f.lv>=lv)g.drawImage(spr(k),x,y+yy);
    g.fillStyle='#35344f';g.fillRect(288,y,32,96);
    g.strokeStyle='#e6e2fa';g.strokeRect(0,y,320,96);
    g.fillStyle='#fff';g.font='bold 9px sans-serif';g.textAlign='left';g.fillText(`${i+1}F ${D.FLOORS[f.type].name} Lv${f.lv}`,4,y+11);
  });
  g.drawImage(spr('roof_sign'),110,102);
  g.fillStyle='#fff';g.font='bold 10px sans-serif';g.textAlign='center';g.fillText(S.company.slice(0,12),158,116,86);
  {g.fillStyle='#ffffff35';g.fillRect(0,8,320,86);g.strokeStyle='#fff9';g.setLineDash([5,5]);g.strokeRect(2,10,316,82);g.setLineDash([]);g.fillStyle='#fff';g.font='14px sans-serif';g.fillText('🏗 ＋ 蓋新樓層',160,60);}
  g.drawImage(streetSprite('door_glass'),0,floorY(0)+56);g.restore();
  bgCanvas=c;sceneKey=JSON.stringify([S.floors,S.company,S.lv,S.district]);
}
function currentDay() {return playback?.R.timeline[Math.min(6,Math.floor(playback.t/4))];}
function targetOf(st,idx) {
  if(st.role) return staffTarget(st,idx);
  const day=currentDay(), p=playback?(playback.t%4)/4:0.3;
  let act=day?.acts[st.id] || st.sched[0], fi=day?.floorOf[st.id] ?? E.floorFor(S,act);
  if(playback && p>=0.45 && p<0.60 && fi!==-1) {act='eat';fi=roomIndex('cafe');if(fi<0)fi=day.floorOf[st.id];}
  else if(playback && p>=(fi===-1?0.7:0.85)) {
    if(p<0.93 && roomIndex('lounge')>=0 && !act.startsWith('job:')) {act='relax';fi=roomIndex('lounge');}
    else {act='sleep';fi=roomIndex('dorm');if(fi<0)fi=0;}
  }
  const outside=fi===-1; if(outside)fi=0;
  const spots=ROOMS[S.floors[fi]?.type||'lobby'].spots;
  let [x,y]=spots[idx%spots.length];
  if(S.floors[fi]?.type==='studio' && !['eat','sleep','relax'].includes(act)) {
    const type=act.startsWith('job:') ? (playback?.R.opTypes?.[act.slice(4)] || E.opById(S,act.slice(4))?.type) : '';
    x=act==='live'||type==='live'||type==='holo'?238:act==='train:talk'||type==='podcast'?146:act==='train:sing'?95:40;
    x+=(idx%2)*15;y=76;
  }
  const sulk=(day?.sulkOf?.[st.id] ?? !!st.sulk) && act.startsWith('train:');
  return {fi,x:outside?10:sulk?266:x+Math.floor(idx/spots.length)*9,y:floorY(fi)+y,act,outside};
}
function placeActors(snap=false) {
  const team=[...E.team(S),...S.staff],used={};
  for(const id of actors.keys())if(!team.some(st=>st.id===id))actors.delete(id);
  for(const st of team) {
    const fi=currentDay()?.floorOf[st.id] ?? E.floorFor(S,st.sched?.[0]||'rest');
    const idx=used[fi]||0;used[fi]=idx+1;
    const dest=targetOf(st,idx);
    let a=actors.get(st.id);
    if(!a){a={x:304,y:floorY(0)+78,fi:0,t:0,phase:'walk',hide:0,dir:'down'};actors.set(st.id,a);}
    a.dest=dest;a.act=dest.act;
    if(snap){Object.assign(a,{x:dest.x,y:dest.y,fi:dest.fi,phase:'walk',hide:0});}
  }
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
  placeActors();
  const motionDt=dt*(playback?speed:1);
  for(const a of actors.values()) {
    a.t+=motionDt; const dest=a.dest;
    if(a.wasOutside&&!dest.outside)a.returning=true;
    a.wasOutside=dest.outside;
    if(a.phase==='lift') {
      a.hide=1;a.wait-=motionDt;
      if(a.wait<=0){a.fi=dest.fi;a.y=floorY(a.fi)+78;a.x=304;a.hide=0;a.phase='walk';}
      continue;
    }
    const changing=a.fi!==dest.fi;
    const ground=floorY(0)+108, exit=a.dest.x<160?-TX-24:RW-TX+24;
    let tx=changing?304:dest.x, ty=changing?floorY(a.fi)+78:dest.y;
    if(!changing&&dest.outside){if(a.y<ground-1){tx=8;ty=Math.abs(a.x-8)>2?floorY(0)+78:ground;}else{tx=exit;ty=ground;}}
    else if(a.y>floorY(0)+96){tx=8;ty=Math.abs(a.x-8)>2?ground:floorY(0)+78;}

    const dx=tx-a.x,dy=ty-a.y,dist=Math.hypot(dx,dy),v=Math.min(dist,motionDt*(a.returning?500:dest.outside?350:170));
    a.moving=dist>1;
    if(a.moving){a.hide=0;a.x+=dx/dist*v;a.y+=dy/dist*v;a.dir=dx<0?'left':'right';}
    else if(changing){a.phase='lift';a.wait=a.returning?0.12:0.4;a.hide=1;}
    else {a.dir='down';a.hide=0;if(!dest.outside)a.returning=false;}
  }
}
function draw(now) {
  if(!S)return;
  if(sceneKey!==JSON.stringify([S.floors,S.company,S.lv,S.district])) {layout();buildBg();}
  ctx.setTransform(cam.dpr,0,0,cam.dpr,0,0);
  const p=playback?(playback.t%4)/4:0.3, night=p>0.85;
  const sky=ctx.createLinearGradient(0,0,0,cam.h);sky.addColorStop(0,night?'#172447':'#72bce9');sky.addColorStop(1,night?'#443e72':'#e3f4ff');ctx.fillStyle=sky;ctx.fillRect(0,0,cam.w,cam.h);
  cam.apply(ctx);ctx.drawImage(bgCanvas,0,0);
  const traffic=sceneTime%8;ctx.drawImage(streetSprite(Math.floor(sceneTime/8)%3?'car':'bus'),-70+traffic*70,floorY(0)+122);
  ctx.save();ctx.translate(TX,0);
  S.floors.forEach((f,i)=>{
    const near=[...actors.values()].filter(a=>(a.phase==='lift'&&(a.fi===i||a.dest.fi===i)) || (a.fi===i && a.x>284 && a.moving));
    const open=near.reduce((v,a)=>Math.max(v,a.phase==='lift'?Math.min(1,(0.45-a.wait)*8):Math.max(0,1-Math.abs(a.x-304)/24)),0);
    const frame=Math.round(open*4), key='lift_'+frame;
    sprCache[key] ||= toCanvas(ST.elevator_door.make({open:frame/4}));
    ctx.drawImage(sprCache[key],288,floorY(i)+24);
  });
  S.floors.forEach((f,i)=>{for(const [k,x,y,lv] of ROOMS[f.type].furniture) if(k==='camera' && f.lv>=lv){ctx.fillStyle=Math.floor(sceneTime*3)%2?'#ff5969':'#542d45';ctx.fillRect(x+8,floorY(i)+y+15,3,3);}});
  for(const [id,a] of [...actors].sort((a,b)=>a[1].y-b[1].y)) {const st=E.starById(S,id)||S.staff.find(st=>st.id===id);if(st && !a.hide)drawActor(st,a,now);}
  if(S.scouted.length){const st=S.scouted[0];ctx.drawImage(portrait(st).canvas,66,floorY(0)+48);ctx.drawImage(spr('visitor_sign'),70,floorY(0)+30);}
  if(S.offers.length&&!night){const r=S.rivals[S.offers[0].partner];ctx.drawImage(portrait(r.stars[0]).canvas,194,floorY(0)+48);ctx.drawImage(spr('visitor_badge'),209,floorY(0)+68);ctx.font='14px sans-serif';ctx.fillText(r.icon,205,floorY(0)+37);if(Math.floor(sceneTime)%7<4){ctx.fillStyle='#fffdf5';ctx.fillRect(32,floorY(0)-18,235,29);ctx.fillStyle='#554466';ctx.font='10px sans-serif';ctx.textAlign='left';const text=S.offers[0].greeting||'期待一起合作!';ctx.fillText(text.slice(0,21),38,floorY(0)-6);ctx.fillText(text.slice(21),38,floorY(0)+5);}}
  if(!night)for(const v of (playback?.R.visitors||[])){const day=currentDay();if(!day?.acts[v.our]?.includes(v.op))continue;const fi=day.floorOf[v.our];if(fi==null||fi<0)continue;/* 跟我們的明星同一層 */v.npc.forEach((st,i)=>ctx.drawImage(portrait(st,'down',Math.floor(sceneTime*2)%2?'idle0':'walk1').canvas,210+i*28,floorY(fi)+48));}
  drawWalkins();ctx.restore();
  ctx.globalAlpha=1;
}
function drawActor(st,a) {
  const act=a.act, type=act?.startsWith('job:') ? (playback?.R.opTypes?.[act.slice(4)] || E.opById(S,act.slice(4))?.type) : '';
  let kind=act==='eat'?'eat':act==='sleep'||act==='rest'?'sleep':act==='relax'?'relax':act==='live'||type==='live'||type==='holo'?'live':act==='train:dance'||['short','duo'].includes(type)?'dance':act==='train:sing'||['own_album','group_album'].includes(type)?'sing':act==='train:talk'||['podcast','own_show'].includes(type)?'talk':'act';
  if(st.role&&act!=='eat')kind='staff';
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
  playback={R,t:0,said:new Set()};
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
bindPointer(cv,cam,{blocked:()=>!S,onTap:(x,y)=>{
  x-=TX;
  if(playback)return;
  const wi=S.walkins.find((st,i)=>Math.abs(x-[110,151,263][i])<18&&Math.abs(y-floorY(0)-92)<20);if(wi){openWalkin(wi.id);return;}
  if(S.offers.length&&Math.abs(x-206)<22&&Math.abs(y-floorY(0)-65)<35){openCompany('partners');toast(S.offers[0].greeting||'歡迎合作!');return;}
  if(S.scouted.length&&Math.abs(x-78)<20&&Math.abs(y-floorY(0)-65)<35){openCompany('scouted');return;}
  for(const [id,a] of actors)if(!a.hide&&Math.abs(a.x-x)<17&&Math.abs(a.y-16-y)<21){if(E.starById(S,id))openInteract(id);else openCompany();return;}
  if(y<96 && x>=0 && x<320){openBuild();return;}
  if(x<0||x>320)return;
  const i=S.floors.length-1-Math.floor((y-128)/96);if(i>=0&&i<S.floors.length)openFloor(i);
}});

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
  if (bubOn.size < 3) for (const [id, q] of bubQ) {
    if (bubOn.size >= 3) break;
    if (bubOn.has(id) || !q.length || !actors.has(id)) continue;
    const f = q.shift(), st = E.starById(S, id); if (!st) continue;
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
  tab = b.dataset.tab; sfx.tap();
  for (const x of $('tabs').children) x.classList.toggle('on', x === b);
  $('panel').scrollTop = 0;
  render();
});
function renderTab() {
  const p = $('panel'), y = p.scrollTop;
  p.innerHTML = tab === 'ops' ? opsHTML() : tab === 'sched' ? scheduleHTML() : tab === 'stars' ? starsHTML() : tab === 'prod' ? prodHTML() : coHTML();
  if(playback) {                                   // 播放中:先看就好,只有「看事件」可以按
    p.innerHTML='<div class="card2" style="background:#efe9ff"><b>▶ 這週播放中</b><div class="meta">按下面的「⏭ 跳過播放」或右上角 ⏭ 就能馬上排下一週。</div></div>'+p.innerHTML;
    p.querySelectorAll('button:not([data-ev])').forEach(b=>b.disabled=true);
  }
  p.scrollTop = y;
}

const REASONS = { career:'大目標', skill: '最拿手', dream: '夢想', rival: '不想輸給對手', topic: '喜歡這個話題', revenge: '上次沒選上', friend: '想跟朋友一起', wish: '心願', trend: '追流行', big: '想要大舞台', lead: '想當主角', generic: '想試試看' };
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
function opsHTML() {
  const open = S.ops.filter(o => o.status === 'open' && !o.project), run = S.ops.filter(o => o.status === 'run' && !o.project);
  let h = '';
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
    <div class="meta">${opMeta(op)}</div>
    ${op.partner!=null?`<div class="rew"><span>💰 約 $${fmt(E.cooperationPreview(S,op).money)}</span><span>👥 約 +${fmt(E.cooperationPreview(S,op).fans)}</span><span class="muted">${op.offerType==='loan'?'技能至少 5，酬勞全給公司':'B 評價預估'}</span></div>`:op.project ? `<div class="rew"><span>💿 上架後 8 週每週分潤</span><span class="muted">${D.BUDGETS[op.budget].name}預算</span></div>` : `<div class="rew"><span>💰 $${fmt(op.pay * mult)}</span><span>👥 +${fmt(op.fans * mult)}</span><span class="muted">(B 評價時)</span></div>`}`;
  if(op.npc?.length)h+=`<div class="slots">${E.partnerStars(S,op).map(st=>`<span class="slot">${ptImg(st)}${esc(st.name)} ✅ 已就位</span>`).join('')}</div>`;
  if (op.slots.length > 1) h += `<div class="slots">${op.slots.map(s => `<span class="slot">${ptImg(E.starById(S, s.who))}${s.role}${s.who ? ':' + esc(E.starById(S, s.who).name) : ':—'}</span>`).join('')}</div>`;
  const bids = op.bids.filter(b => { const st = E.starById(S, b.id); return st && !st.gone; });
  if (bids.length) {
    h += `<div class="h4">想搶這個的人(${bids.length})</div>`;
    for (const b of bids) {
      const st = E.starById(S, b.id), free = E.isFree(st, op), mine = op.slots.some(s => s.who === st.id);
      const g = empty >= 0 && free ? E.estimate(S, st, op, empty) : null;
      h += `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)}:${esc(b.text)}<div class="why">理由:${REASONS[b.reason] || ''} · ${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')}</div></div>
        <div class="act">${mine ? '<span class="muted">✅ 選了</span>' : free && empty >= 0 ? `${gradeChip(g)}<button class="sbtn" data-assign="${op.id}" data-slot="${empty}" data-star="${st.id}">選${op.slots.length > 1 ? '為' + op.slots[empty].role : '他'}</button>` : '<span class="muted">有別的工作</span>'}</div></div>`;
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
function scheduleHTML() {
  return `<div class="card2"><button class="sbtn" data-auto="1">🪄 全部自動排</button><div class="meta">點格子換行程。工作已預約，週日記得休息！</div></div>`+E.team(S).map(st=>{
    const e=estimateEnergy(st), rest=st.sched.some(v=>v==='rest'||v==='off');
    return `<div class="scheduleRow"><div class="scheduleGrid"><div class="person">${ptImg(st)}${esc(st.name)}${bar(st.energy,'#61bb8b')}</div>${st.sched.map((v,d)=>`<button data-day="${d}" data-star="${st.id}" class="${v.startsWith('job:')?'job':''}" title="週${E.DAY_NAMES[d]} ${esc(E.ACT_NAMES[v]||'工作')}"><small>${E.DAY_NAMES[d]}</small>${actIcon(v)}</button>`).join('')}</div><div class="scheduleNote" style="color:${e<20||!rest?'#b83a4e':'#75658b'}">這週體力預估 ${e}${e<20?' · 😵 太累了':''}${!rest?' · ⚠ 沒有休息日':''}</div></div>`;
  }).join('');
}
function switchSchedule() {
  $('starBox').classList.remove('on');tab='sched';
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
function floorListHTML() {
  return S.floors.map((f,i)=>({f,i})).reverse().map(({f,i})=>`<div class="floorRow"><div><b>${i+1}F ${D.FLOORS[f.type].icon} ${D.FLOORS[f.type].name} Lv${f.lv}</b><div class="muted">${D.FLOORS[f.type].desc}</div></div>${f.lv<3?`<button class="sbtn ghost" data-floor="${i}" ${S.money<E.upgradeCost(S,i)?'disabled':''}>升級 $${fmt(E.upgradeCost(S,i))}</button>`:'最高級'}</div>`).join('');
}
function openFloor(i) {
  const f=S.floors[i], def=D.FLOORS[f.type];
  const here=[...actors].filter(([,a])=>a.fi===i&&!a.hide).map(([id])=>(E.starById(S,id)||S.staff.find(st=>st.id===id)).name);
  $('roomTitle').textContent=`${i+1}F ${def.icon} ${def.name} Lv${f.lv}`;
  $('roomBody').innerHTML=`<p class="txt">${def.desc}</p><p class="txt">今天在這層：${here.map(esc).join('、')||'大家都去別處忙了'}</p>${f.lv<3?`<button class="choice" data-room-up="${i}" ${S.money<E.upgradeCost(S,i)?'disabled':''}>升級 $${fmt(E.upgradeCost(S,i))}${S.money<E.upgradeCost(S,i)?'（錢不夠）':''}</button>`:'<p class="muted">已經是最高級！</p>'}`;
  $('roomBox').classList.add('on');
}
function openBuild() {
  $('roomTitle').textContent='🏗 蓋新樓層';
  const full=false;
  $('roomBody').innerHTML=`<p class="txt">目前 ${S.floors.length} 層${full?'，公司要升級才能再往上蓋。':''}</p>`+Object.entries(D.FLOORS).filter(([,f])=>f.build).map(([type,f])=>{
    const cost=E.floorCost(S,type), reason=full?'公司要先升級':S.money<cost?'錢不夠':'';
    return `<button class="choice" data-room-build="${type}" ${reason?'disabled':''}>${f.icon} ${f.name} $${fmt(cost)}<div class="muted">${f.desc}${reason?' · '+reason:''}</div></button>`;
  }).join('');$('roomBox').classList.add('on');
}
function openInteract(id) {
  const st=E.starById(S,id);$('roomTitle').textContent=`${st.emoji} ${st.name} · ${careerTag(st)} · 信任 ${Math.round(st.trust)}`;
  $('roomBody').innerHTML=`<div style="text-align:center">${ptImg(st)}</div>`+[['chat','💬 聊天'],['snack','🍪 點心 $60'],['cheer','👏 鼓勵'],['talk','☕ 談心 $150']].map(([kind,label])=>`<button class="choice" data-interact="${kind}" data-id="${id}" ${st.done[kind]?'disabled':''}>${label}${st.done[kind]?'（這週做過了）':''}</button>`).join('')+`<button class="choice" data-room-star="${id}">📋 資料</button>`;
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
  if(d.roomUp!==undefined)err=E.upgradeFloor(S,+d.roomUp);
  if(d.roomBuild)err=E.buildFloor(S,d.roomBuild);
  if(d.roomStar){$('roomBox').classList.remove('on');openStar(d.roomStar);return;}
  if(d.interact){const st=E.starById(S,d.id), already=st.done[d.interact];
    const result=E.interact(S,d.id,d.interact);err=typeof result==='string' && (already || !st.done[d.interact])?result:null;}
  if(err){toast(err);return;}
  $('roomBox').classList.remove('on');save();render();
};

function starsHTML() {
  let h = `<div class="sec">已出道明星 ${E.debuted(S).length} / ${D.LEVELS[S.lv].max}</div>`;
  h += '<div class="sec">⭐ 已出道</div>'+E.debuted(S).map(st=>starCard(st)).join('');
  h += `<div class="sec">🌱 練習生(下次評鑑:第 ${Math.ceil(S.week/4)*4} 週)</div>`+E.team(S).filter(st=>st.trainee).map(st=>starCard(st)).join('');
  if (S.mentor) h += `<div class="card2"><b>🧑‍🏫 前輩 ${esc(S.mentor.name)}</b><div class="meta">上一季留下來的前輩,不搶工作,教大家練習(練習效果 +15%、演出 +3)。</div></div>`;
  return h;
}
function starCard(st, full = false) {
  const fr = E.friendsOf(S, st), rv = E.rivalsOf(S, st);
  const sk = D.SKILL_IDS.map(k => `<div class="${k === E.bestSkill(st) ? 'sp' : ''}">${D.SKILLS[k].icon}${st.skills[k].toFixed(1)}</div>`).join('');
  const plans = `<button class="miniSched" data-schedule="1" aria-label="查看七天行程">${st.sched.map(v=>`<span>${actIcon(v)}</span>`).join('')}</button>`;
  return `<div class="card2"><div class="star"><img class="pt big" data-open="${st.id}" style="--g:${st.glow}33" src="${portrait(st).url}" alt="">
    <div class="body"><div class="nm" style="color:${st.glow}">${st.emoji} ${esc(st.name)} <span class="tag">${st.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' · ')}</span></div>
    <div class="meta">${careerTag(st)} · 潛力 ${E.potentialStars(st)}${(g => g ? ` · 👯 ${esc(g.name)}${g.center === st.id ? '・C 位' : ''}` : '')(E.groupOf(S, st.id))}</div><div class="sk">${sk}</div>
    <div class="bars"><div>${moodFace(st.mood)} 心情${bar(st.mood, '#ff8fb1')}</div><div>⚡ 體力${bar(st.energy, st.energy < 25 ? '#ff6f6f' : '#7fdc8a')}</div><div>💗 歸屬${bar(st.loyalty, st.loyalty < 30 ? '#ff6f6f' : '#b98cff')}</div></div>
    <div class="wish">👥 粉絲 ${fmt(st.fans)}${st.wish ? ` · 💭 ${esc(E.wishText(S, st))}(剩 ${st.wish.left} 週)` : ''}${st.lost >= 2 ? ` · 連續 ${st.lost} 次沒選上` : ''}</div>
    ${fr.length || rv.length ? `<div class="rels">${fr.map(o => '🤝' + esc(o.name)).join(' ')} ${rv.map(o => '⚔️' + esc(o.name)).join(' ')}</div>` : ''}
    ${full ? `<div class="wish">❤️ 喜歡 #${D.topicById(st.topic).name} · 🌠 夢想:${D.MEDIA[st.dream].icon}${D.MEDIA[st.dream].name} · 口頭禪「${esc(st.catch)}」</div>
      <div class="wish">🎬 做過 ${st.stat.ops} 個作品${st.stat.best ? ',最好 ' + st.stat.best : ''} · 加入第 ${st.joined} 週</div>` : ''}
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
    <div class="meta">目前 ${S.floors.length} 層。</div></div>`;
  h += `<div class="card2"><b>🏢 公司樓層</b>${floorListHTML()}<button class="sbtn" data-build="1">🏗 蓋新樓層</button></div>`;
  h += recruitmentHTML();
  // 試鏡
  h += `<div class="card2"><b>🎙 試鏡</b>`;
  if (S.audition) {
    h += `<div class="meta">簽約金 $${fmt(D.auditionCost(E.debuted(S).length))} · 名額 ${E.debuted(S).length}/${lv.max}</div>`;
    S.audition.forEach((c, i) => {
      h += `<div class="bid"><img class="pt" style="--g:${c.glow}22" src="${portrait(c).url}" alt=""><div class="say" style="--c:${c.glow}">${nameTag(c)}:${esc(c.intro || '')}
        <div class="why">${c.traits.map(t => D.TRAITS[t].icon + D.TRAITS[t].name).join(' ')} · ${careerTag(c)}<br>${D.SKILL_IDS.map(k=>D.SKILLS[k].icon+c.skills[k].toFixed(1)).join(' ')}</div></div>
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
  const b = e.target.closest('[data-visit],[data-npc],[data-offer-yes],[data-offer-no],[data-proj-new],[data-proj-cancel],[data-grp-new],[data-grp-album],[data-grp-disband],[data-sns],[data-gotobuild],[data-hire],[data-fire],[data-scout-sign],[data-scout-no],[data-debut],[data-assign],[data-pick],[data-plan],[data-talk],[data-outfit],[data-meet],[data-up],[data-floor],[data-build],[data-day],[data-auto],[data-schedule],[data-sign],[data-skipaud],[data-aud],[data-ng],[data-backup],[data-open],[data-ev]');
  if (!b || !S || (playback && !('ev' in b.dataset))) return;
  const d = b.dataset;
  let err = null;
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
  $('pickHow').textContent = '沒來搶的人也可以指派,不過如果他沒興趣,心情會差一點。';
  const free = E.team(S).filter(st=>E.isFree(st,op) && (!op.only || op.only.includes(st.id))).map(st => ({ st, g: E.estimate(S, st, op, slot), bid: op.bids.some(b => b.id === st.id) }))
    .sort((a, b) => 'SABC'.indexOf(a.g.g) - 'SABC'.indexOf(b.g.g));
  $('pickList').innerHTML = free.length ? free.map(({ st, g, bid }) => `<div class="bid">${ptImg(st)}<div class="say" style="--c:${st.glow}">${nameTag(st)} ${bid ? '<span class="tag hot">想要</span>' : ''}
    <div class="why">${D.SKILL_IDS.map(k => D.SKILLS[k].icon + st.skills[k].toFixed(1)).join(' ')} · ⚡${Math.round(st.energy)} · ${moodFace(st.mood)}</div></div>
    <div class="act">${gradeChip(g)}<button class="sbtn" data-pk="${st.id}">選</button></div></div>`).join('') : '<p class="muted">大家這週都有工作了。</p>';
  $('pickBox').classList.add('on');
}
$('pickList').addEventListener('click', e => {
  const b = e.target.closest('[data-pk]'); if (!b || !pickCtx || playback) return;
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
  const ev = S.event; if (!ev) return;
  $('evTitle').textContent = '📣 ' + ev.title;
  const ids = ev.id === 'leave' ? [ev.star] : Array.isArray(ev.ctx) ? ev.ctx : ev.ctx ? [ev.ctx] : [];
  $('evWho').innerHTML = `<div style="text-align:center">${ids.map(id => E.starById(S, id)).filter(Boolean).map(st => ptImg(st, 'pt big')).join(' ')}</div>`;
  $('evText').textContent = ev.text;
  $('evChoices').innerHTML = ev.choices.map((c, i) => `<button class="choice" data-ch="${i}">${esc(c.label)}${c.cost && S.money < c.cost ? ' <small>(錢不夠)</small>' : ''}</button>`).join('');
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
  toast(noPlay ? '之後按「開始這週」會直接出週報' : '之後會在大樓裡播完一週');
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
$('helpClose').addEventListener('click', () => $('helpBox').classList.remove('on'));

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
  S = E.migrate(sv); playback=null; sceneKey=''; $('playControls').hidden=true; $('nextBtn').disabled=false;
  for(const n of notifications)n.el.remove();notifications=[];walkinArrival.clear();
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
  get S() { return S; }, openWalkin, notify, walkinHTML, openVisit, openNpc, renderPartners, openEvaluation, openTrainer, openAwards, openProjectWizard, openGroupWizard, actors, cam, view, E, D, play, skip, render, save, boot, showEnding, openEvent, refreshStart, loadBest: () => loadBest(SAVE_KEY),
  next() { $('nextBtn').click(); }, closeReport() { $('repGo').click(); },
  // 窗格在背景時 requestAnimationFrame 不跑:手動推進 sec 秒的畫格
  tick(sec = 1) { const t0 = performance.now(); for (let t = 0; t < sec; t += 0.05) { step(0.05); updateBubbles(t0 + t * 1000); } draw(t0 + sec * 1000); updateBubbles(t0 + sec * 1000); },
};

function staffTarget(st,idx) {
 const p=playback?(playback.t%4)/4:0.3;
 let type=st.role==='trainer'?(st.skill==='charm'?'style':st.skill):D.STAFF_ROLES[st.role].floor;
 let fi=roomIndex(type);if(fi<0)fi=0;
 const outside=!!playback&&p>=0.85;
 if(outside)fi=0;
 else if(playback&&p>=0.45&&p<0.60){fi=Math.max(0,roomIndex('cafe'));}
 let [x,y]=ROOMS[S.floors[fi].type].spots[idx%4];
 if(!(playback&&p>=0.45&&p<0.60)){[x,y]=st.role==='chef'?[40,59]:st.role==='manager'?[85,78]:st.role==='trainer'?[244,79]:st.role==='scout'?[48,73]:[42,77];}
 return {fi,x:outside?10:x,y:floorY(fi)+y,act:p>=0.45&&p<0.60?'eat':'staff',outside};
}
function recruitmentHTML() {
 const lv=E.roomLv(S,'scout'), reveal=lv>=3||S.staff.some(st=>st.role==='scout'&&st.lv===3);
 return districtHTML()+`<div class="card2" id="scouted"><b>🙋 新人(自薦/星探)</b><div class="meta">練習生 ${E.team(S).filter(st=>st.trainee).length}/${E.traineeCapacity(S)} 位${lv?'':' · 蓋星探部就能找新人'}</div>`+S.walkins.map(st=>walkinHTML(st)).join('')+S.scouted.map(st=>`<div class="bid">${ptImg(st)}<div class="say">${nameTag(st)}<div class="why">${st.traits.map(t=>D.TRAITS[t].name).join(' · ')}<br>${careerTag(st)} · 潛力 ${lv>=2?E.potentialStars(st):'?'}${reveal?' · 專長 '+D.SKILLS[E.bestSkill(st)].name:''}<br>${esc(st.intro)}</div><button class="sbtn" data-scout-sign="${st.id}">簽成練習生 $300</button> <button class="sbtn ghost" data-scout-no="${st.id}">不用了</button></div></div>`).join('')+`</div><div class="card2"><b>👥 員工 (${S.staff.length}/${1+S.lv})</b>`+S.staff.map(st=>`<div class="floorRow"><div>${D.STAFF_ROLES[st.role].icon} ${esc(st.name)} Lv${st.lv}${st.skill?' · '+D.SKILLS[st.skill].name:''}<div class="meta">${D.STAFF_ROLES[st.role].desc} · 週薪 $${D.staffSalary(st)}</div></div><button class="sbtn ghost" data-fire="${st.id}">謝謝你，再見</button></div>`).join('')+`<div class="h4">請人 $${600+300*S.staff.length}</div>`+Object.entries(D.STAFF_ROLES).map(([role,r])=>{const why=E.canHire(S,role);return `<button class="choice" data-hire="${role}" ${why?'disabled':''}>${r.icon} ${r.name}<div class="meta">${r.desc}${why?' · '+why:''}</div></button>`;}).join('')+'</div>';
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
 evaluationOpen=true;
 $('roomTitle').textContent='🌱 月末評鑑 · 第 '+R.week+' 週';
 $('roomBody').innerHTML=`<div style="text-align:center"><img width="192" height="96" src="${spr('score_board').toDataURL()}" alt="評鑑分數板"></div>`+R.evaluation.map(ev=>{
 const st=E.starById(S,ev.id),why=E.debuted(S).length>=D.LEVELS[S.lv].max?'名額滿了，公司升級後才能出道':S.money<1000?'出道舞台要 $1,000':'';
 return `<div class="bid">${ptImg(st)}<div class="say"><b>${esc(st.name)}</b> · 練習 ${ev.weeks} 週<div><strong style="font-size:36px;color:${D.GRADES.find(g=>g.g===ev.grade).color}">${ev.grade}</strong> ${ev.score.toFixed(1)} 分</div>${!st.trainee?'🎉 已出道!':ev.canDebut?`<button class="choice" data-eval-debut="${st.id}" ${why?'disabled':''}>${why||'🎉 出道! $1,000'}</button>`:'繼續練習，下次再加油!'}</div></div>`;
 }).join('');$('roomBox').classList.add('on');
}

function openCompany(section) {
 tab='co';for(const b of $('tabs').children)b.classList.toggle('on',b.dataset.tab===tab);
 render();if(section)$(section)?.scrollIntoView?.({block:'nearest'});
}

// ============================================================
//  第 3 階段:🎛 製作分頁(企劃、排行、上架作品、團體、SNS)、頒獎典禮
// ============================================================
function prodHTML() {
  const lv = E.roomLv(S, 'production');
  let h = `<div class="card2"><b>🎛 製作部</b>`;
  if (!lv) h += `<div class="meta">先蓋 🎛 製作部,就能自己做單曲、短劇、綜藝和團體專輯。做好了每週都有播放分潤。</div><button class="sbtn" data-gotobuild="1">🏗 去蓋樓層</button></div>`;
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
  if (!E.roomLv(S, 'sns')) h += `<div class="meta">蓋 📱 SNS 部門之後,每週選一種貼文策略,大家會被動漲粉。</div><button class="sbtn" data-gotobuild="1">🏗 去蓋樓層</button>`;
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
    sfx.pick(); $('roomBox').classList.remove('on'); toast(`🎛 企劃開始了!到「🎛 製作」選人`);
    tab = 'prod'; for (const x of $('tabs').children) x.classList.toggle('on', x.dataset.tab === tab);
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
 if(!E.roomLv(S,'meeting'))h+='<p>蓋 🤝 會議室，別家公司就會來找你合作</p><button class="sbtn" data-gotobuild="1">去蓋樓</button>';
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

const streetCache={}, walkinArrival=new Map();
function streetSprite(k){return streetCache[k] ||= toCanvas(STREET_KIT[k].make());}
function drawStreet(g){
 const id=S.district, ground=floorY(0)+96;
 g.drawImage(streetSprite('skyline_'+id),0,ground-180);
 for(let y=ground-96;y>30;y-=96)for(const [x,k] of [[0,'a'],[368,'b']])g.drawImage(streetSprite('neighbor_'+id+'_'+k),x,y);
 for(let x=0;x<RW;x+=32){g.drawImage(streetSprite('sidewalk'),x,ground);g.drawImage(streetSprite('road'),x,ground+24);}
 for(const x of [27,386])g.drawImage(streetSprite('street_lamp'),x,ground-37);
 g.drawImage(streetSprite(id==='harbor'?'palm':'tree'),2,ground-35);
 const prop={alley:'cat',shops:'shop_awning',city:'big_screen_out',avenue:'neon_arrow',harbor:'palm'}[id];
 g.drawImage(streetSprite(prop),368,ground-(id==='alley'?2:70));if(id==='alley')g.drawImage(streetSprite('power_pole'),30,ground-64);
}
let notifications=[];
function notify(f){const el=document.createElement('div');el.className='notice';el.textContent=f.text;$('notifications').appendChild(el);notifications.push({el,until:performance.now()+4000});while(notifications.length>3)notifications.shift().el.remove();}
$('logBtn').onclick=()=>{feedSeen=S.seq;$('bFeed').style.display='none';$('roomTitle').textContent='📜 紀錄';$('roomBody').innerHTML=feedHTML();$('roomBox').classList.add('on');};
const conditionText=st=>({lead:'想當主角',album:'想要自己的單曲',off:'每週至少一天放假'}[st.walkinCondition]||'沒有額外條件');
function walkinHTML(st){return `<div class="card2">${ptImg(st)}<b>${esc(st.name)} · ${st.trainee?'🌱 素人':'⭐ 有經驗的明星'}</b><p>${esc(st.intro)}</p><p>${st.traits.map(t=>D.TRAITS[t].name).join(' · ')} · ${careerTag(st)}</p><p>${D.SKILL_IDS.map(k=>D.SKILLS[k].name+':'+(!st.trainee||k===E.bestSkill(st)?st.skills[k].toFixed(1):'?')).join(' · ')}</p><p>潛力 ${E.roomLv(S,'scout')>=2?E.potentialStars(st):'?'} · ${conditionText(st)}</p><button class="sbtn" data-walkin-sign="${st.id}">簽約 $${fmt(st.signCost)}</button> <button class="sbtn ghost" data-walkin-no="${st.id}">婉拒</button></div>`;}
function openWalkin(id){const st=S.walkins.find(s=>s.id===id);if(!st)return;$('roomTitle').textContent='🙋 自薦';$('roomBody').innerHTML=walkinHTML(st);$('roomBox').classList.add('on');}
function drawWalkins(){ctx.globalAlpha=1;ctx.textAlign='left';S.walkins.forEach((st,i)=>{const t=Math.min(1,(sceneTime-(walkinArrival.has(st.id)?walkinArrival.get(st.id):(walkinArrival.set(st.id,sceneTime),sceneTime)))/3),x=t<0.5?-60+t*136:8+(t-0.5)*2*(([110,151,263][i]-8)),y=t<0.5?floorY(0)+108:floorY(0)+108-(t-0.5)*32;ctx.drawImage(portrait(st,t<1?'right':'down',t<1?'walk1':'idle0').canvas,x-12,y-30);ctx.font='14px sans-serif';ctx.fillText('❔',x-6,y-34);});}
function districtHTML(){const d=E.district(S),n=D.DISTRICTS[D.DISTRICTS.indexOf(d)+1];return `<div class="card2"><b>🚚 地區 · ${d.icon} ${d.name}</b><img style="width:100%;height:48px;object-fit:cover;image-rendering:pixelated" src="${streetSprite('skyline_'+d.id).toDataURL()}" alt="${d.name}街景"><p>房租 ×${d.rent} · 粉絲/酬勞 +${Math.round(d.bonus*100)}% · 每週機會 +${d.ops}</p>${n?`<p>下一站:${n.icon} ${n.name} · 公司 Lv${n.lv}${n.fans?' · 粉絲 '+fmt(n.fans):''} · $${fmt(n.cost)}<br>房租 ×${n.rent} · 粉絲/酬勞 +${n.bonus*100}% · 每週機會 +${n.ops}</p><button class="sbtn" data-move="${n.id}" ${E.canMoveDistrict(S,n.id)?'disabled':''}>搬家</button>`:'已到最終地區'}</div>`;}
for(const id of ['panel','roomBody'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-walkin-sign],[data-walkin-no],[data-move]');if(!b||playback)return;let err;if(b.dataset.move){if(!confirm('確定搬家?所有樓層、明星和員工都會一起搬。'))return;err=E.moveDistrict(S,b.dataset.move);}else if(b.dataset.walkinSign)err=E.signWalkin(S,b.dataset.walkinSign);else E.declineWalkin(S,b.dataset.walkinNo);if(err)toast(err);else{$('roomBox').classList.remove('on');render();save();}});
