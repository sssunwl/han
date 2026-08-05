import * as THREE from 'three';
import { currentProfile, saveKey } from '../../shared/profile.js';

/* ============================================================
   方塊世界 KidCraft — 給小四生的極簡 Minecraft 原型
   設計原則:沒有血量、沒有怪物、摔不死、隨時自動存檔
   ============================================================ */

// ---------- 世界大小 ----------
const WX = 80, WY = 40, WZ = 80;   // 方塊數
const CS = 16;                      // chunk 邊長(XZ)
const NCX = Math.ceil(WX / CS), NCZ = Math.ceil(WZ / CS);
const ME = currentProfile();                    // 誰在玩,決定要讀寫哪一份存檔
const SAVE_KEY = saveKey('kidcraft', 'world');

// ---------- 方塊定義 ----------
// tiles: [上, 側, 下] 對應圖集索引
const BLOCKS = {
  1: { name: '草地', tiles: [0, 1, 2], color: '#6aa84f' },
  2: { name: '泥土', tiles: [2, 2, 2], color: '#8b5a2b' },
  3: { name: '石頭', tiles: [3, 3, 3], color: '#8e8e8e' },
  4: { name: '木頭', tiles: [5, 4, 5], color: '#7a5230' },
  5: { name: '樹葉', tiles: [6, 6, 6], color: '#4f9e3a' },
  6: { name: '沙子', tiles: [7, 7, 7], color: '#e6d8a0' },
  7: { name: '木板', tiles: [8, 8, 8], color: '#c69c6d' },
  8: { name: '紅磚', tiles: [9, 9, 9], color: '#b4553f' },
  9: { name: '彩虹', tiles: [10, 10, 10], color: '#e05fc0' },
};
const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// ---------- 方塊資料 ----------
const world = new Uint8Array(WX * WY * WZ);
const placed = new Uint8Array(WX * WY * WZ);   // 1 = 玩家自己放的(任務判定用)
const idx = (x, y, z) => (y * WZ + z) * WX + x;
const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < WX && y < WY && z < WZ;
function getBlock(x, y, z) {
  if (!inside(x, y, z)) return 0;
  return world[idx(x, y, z)];
}
function setBlock(x, y, z, v) {
  if (!inside(x, y, z)) return;
  world[idx(x, y, z)] = v;
  markDirty(x, z);
}

// ---------- 地形產生 ----------
function hash2(x, z) {                       // 固定亂數(同一座標永遠同結果)
  let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function heightAt(x, z) {
  const h = 10
    + Math.sin(x * 0.11) * 2.0
    + Math.cos(z * 0.09) * 2.0
    + Math.sin((x + z) * 0.045) * 3.0
    + Math.sin(x * 0.027) * Math.cos(z * 0.031) * 4.5;
  return Math.max(2, Math.floor(h));
}
function generateWorld() {
  world.fill(0);
  placed.fill(0);
  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y++) {
        let b = 3;                                   // 石頭
        if (y === h) b = h <= 6 ? 6 : 1;             // 低窪是沙灘,其他是草
        else if (y > h - 3) b = h <= 6 ? 6 : 2;      // 表土
        world[idx(x, y, z)] = b;
      }
      // 種樹
      if (h > 7 && hash2(x, z) > 0.988 && x > 2 && z > 2 && x < WX - 3 && z < WZ - 3) {
        const th = 4 + Math.floor(hash2(z, x) * 3);
        for (let i = 1; i <= th; i++) world[idx(x, h + i, z)] = 4;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (let dy = th - 2; dy <= th + 1; dy++) {
              const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy - th);
              if (d > 3) continue;
              const yy = h + dy;
              if (!inside(x + dx, yy, z + dz)) continue;
              if (world[idx(x + dx, yy, z + dz)] === 0) world[idx(x + dx, yy, z + dz)] = 5;
            }
      }
    }
  }
}

// ---------- 存檔 ----------
function pack(arr) {
  let s = '';
  const CH = 8192;
  for (let i = 0; i < arr.length; i += CH)
    s += String.fromCharCode.apply(null, arr.subarray(i, i + CH));
  return btoa(s);
}
function unpack(raw, arr) {
  const s = atob(raw);
  if (s.length !== arr.length) return false;
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return true;
}
function saveWorld() {
  try {
    localStorage.setItem(SAVE_KEY, pack(world));
    localStorage.setItem(SAVE_KEY + '-placed', pack(placed));
    localStorage.setItem(SAVE_KEY + '-pos', JSON.stringify(camera.position.toArray()));
    localStorage.setItem(SAVE_KEY + '-quest', JSON.stringify({ q: questIndex, stats, flags }));
    return true;
  } catch (e) { return false; }
}
function loadWorld() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    if (!unpack(raw, world)) return false;
    const rp = localStorage.getItem(SAVE_KEY + '-placed');
    if (rp) unpack(rp, placed);
    const rq = localStorage.getItem(SAVE_KEY + '-quest');
    if (rq) {
      const d = JSON.parse(rq);
      questIndex = d.q | 0;
      Object.assign(stats, d.stats || {});
      Object.assign(flags, d.flags || {});
    }
    return true;
  } catch (e) { return false; }
}
function clearSave() {
  ['', '-placed', '-pos', '-quest'].forEach(k => localStorage.removeItem(SAVE_KEY + k));
}

// ---------- 材質圖集(程式畫的像素貼圖,不需外部檔案) ----------
function makeAtlas() {
  const T = 16, N = 16;
  const c = document.createElement('canvas');
  c.width = T * N; c.height = T;
  const g = c.getContext('2d');
  const rnd = (seed) => { let h = Math.sin(seed * 12.9898) * 43758.5453; return h - Math.floor(h); };

  function tile(i, base, speck, amount = 0.35, seed = 1) {
    g.fillStyle = base;
    g.fillRect(i * T, 0, T, T);
    g.fillStyle = speck;
    for (let px = 0; px < T; px++)
      for (let py = 0; py < T; py++)
        if (rnd(seed + px * 31 + py * 7 + i * 101) < amount) g.fillRect(i * T + px, py, 1, 1);
  }

  tile(0, '#6aa84f', '#5c9443', .4, 3);                 // 0 草(上)
  tile(1, '#8b5a2b', '#7a4d24', .35, 5);                // 1 草(側)
  g.fillStyle = '#6aa84f'; g.fillRect(1 * T, 0, T, 4);
  g.fillStyle = '#5c9443';
  for (let px = 0; px < T; px++) g.fillRect(1 * T + px, 3 + Math.floor(rnd(px * 3) * 2), 1, 1);
  tile(2, '#8b5a2b', '#7a4d24', .35, 7);                // 2 泥土
  tile(3, '#8e8e8e', '#7d7d7d', .35, 11);               // 3 石頭
  tile(4, '#7a5230', '#63421f', .18, 13);               // 4 木頭(側)
  g.fillStyle = '#63421f';
  [2, 6, 10, 13].forEach(px => g.fillRect(4 * T + px, 0, 1, T));
  tile(5, '#a9814f', '#8c6a3f', .2, 17);                // 5 木頭(上)
  g.strokeStyle = '#7a5230'; g.lineWidth = 1;
  g.beginPath(); g.arc(5 * T + 8, 8, 5, 0, 7); g.stroke();
  g.beginPath(); g.arc(5 * T + 8, 8, 2, 0, 7); g.stroke();
  tile(6, '#4f9e3a', '#3d7d2c', .45, 19);               // 6 樹葉
  tile(7, '#e6d8a0', '#d8c78b', .3, 23);                // 7 沙
  tile(8, '#c69c6d', '#b0895c', .15, 29);               // 8 木板
  g.fillStyle = '#9c784f';
  [0, 5, 10, 15].forEach(py => g.fillRect(8 * T, py, T, 1));
  g.fillStyle = '#b4553f'; g.fillRect(9 * T, 0, T, T);  // 9 紅磚
  g.fillStyle = '#ddd5c8';
  [0, 5, 10, 15].forEach(py => g.fillRect(9 * T, py, T, 1));
  for (let r = 0; r < 4; r++) g.fillRect(9 * T + (r % 2 ? 4 : 11), r * 5, 1, 5);
  for (let px = 0; px < T; px++) {                      // 10 彩虹
    g.fillStyle = `hsl(${px * 22},80%,60%)`;
    g.fillRect(10 * T + px, 0, 1, T);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, N };
}
const ATLAS = makeAtlas();
const TW = 1 / ATLAS.N, PAD = 0.0015;

// ---------- three.js 基本場景 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8f5);
// 霧只用來柔化世界最外圈,拉太近的話中距離地形會整片褪成天空色,看起來像破洞
scene.fog = new THREE.Fog(0x9fd8f5, 95, 190);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 260);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const material = new THREE.MeshBasicMaterial({ map: ATLAS.tex, vertexColors: true });

// ---------- 建 mesh(每個 chunk 一份,只畫看得到的面) ----------
const FACES = [
  { dir: [1, 0, 0], shade: 0.80, corners: [[1, 1, 0], [1, 0, 0], [1, 1, 1], [1, 0, 1]] }, // +X
  { dir: [-1, 0, 0], shade: 0.80, corners: [[0, 1, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0]] }, // -X
  { dir: [0, 1, 0], shade: 1.00, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] }, // +Y
  { dir: [0, -1, 0], shade: 0.52, corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] }, // -Y
  { dir: [0, 0, 1], shade: 0.68, corners: [[1, 1, 1], [1, 0, 1], [0, 1, 1], [0, 0, 1]] }, // +Z
  { dir: [0, 0, -1], shade: 0.68, corners: [[0, 1, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0]] }, // -Z
];
const UVQ = [[0, 0], [0, 1], [1, 0], [1, 1]];

const chunkMeshes = [];
const dirty = new Set();
function chunkKey(cx, cz) { return cz * NCX + cx; }
function markDirty(x, z) {
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < NCX && nz < NCZ) dirty.add(chunkKey(nx, nz));
    }
}

function buildChunk(cx, cz) {
  const pos = [], uv = [], col = [], ind = [];
  const x0 = cx * CS, z0 = cz * CS;
  const x1 = Math.min(x0 + CS, WX), z1 = Math.min(z0 + CS, WZ);
  let v = 0;

  for (let x = x0; x < x1; x++)
    for (let z = z0; z < z1; z++)
      for (let y = 0; y < WY; y++) {
        const b = world[idx(x, y, z)];
        if (!b) continue;
        const def = BLOCKS[b];
        for (const f of FACES) {
          const [dx, dy, dz] = f.dir;
          if (getBlock(x + dx, y + dy, z + dz)) continue;      // 被擋住就不畫
          const tile = dy === 1 ? def.tiles[0] : dy === -1 ? def.tiles[2] : def.tiles[1];
          const u0 = tile * TW + PAD, u1 = (tile + 1) * TW - PAD;
          for (let i = 0; i < 4; i++) {
            const c = f.corners[i];
            pos.push(x + c[0], y + c[1], z + c[2]);
            uv.push(UVQ[i][0] ? u1 : u0, UVQ[i][1] ? 1 - PAD : PAD);
            col.push(f.shade, f.shade, f.shade);
          }
          ind.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
          v += 4;
        }
      }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);

  const k = chunkKey(cx, cz);
  if (chunkMeshes[k]) { scene.remove(chunkMeshes[k]); chunkMeshes[k].geometry.dispose(); }
  const mesh = new THREE.Mesh(geo, material);
  chunkMeshes[k] = mesh;
  scene.add(mesh);
}
function rebuildAll() {
  for (let cz = 0; cz < NCZ; cz++) for (let cx = 0; cx < NCX; cx++) buildChunk(cx, cz);
}
function flushDirty() {
  if (!dirty.size) return;
  for (const k of dirty) buildChunk(k % NCX, Math.floor(k / NCX));
  dirty.clear();
}

// ---------- 選取框 ----------
const hl = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
);
hl.visible = false;
scene.add(hl);

// ---------- 玩家 ----------
const PLAYER = { r: 0.3, h: 1.8, eye: 1.62 };
const vel = new THREE.Vector3();
let onGround = false, flying = false;
let yaw = 0, pitch = 0;
const keys = new Set();
const spawn = new THREE.Vector3(WX / 2 + 0.5, heightAt(WX >> 1, WZ >> 1) + 3 + PLAYER.eye, WZ / 2 + 0.5);

function solidAt(x, y, z) { return getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== 0; }
function collides(px, py, pz) {
  const r = PLAYER.r, feet = py - PLAYER.eye;
  for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++)
    for (let z = Math.floor(pz - r); z <= Math.floor(pz + r); z++)
      for (let y = Math.floor(feet + 0.001); y <= Math.floor(feet + PLAYER.h - 0.001); y++)
        if (getBlock(x, y, z)) return true;
  return false;
}
function moveAxis(axis, amount, canStepUp = false) {
  if (amount === 0) return;
  const p = camera.position;
  const before = p[axis];
  p[axis] += amount;
  if (!collides(p.x, p.y, p.z)) return;
  // 撞到一格高的小台階就自動踏上去(小孩不用一直跳)
  if (canStepUp) {
    const beforeY = p.y;
    p.y += 1.05;
    if (!collides(p.x, p.y, p.z)) return;
    p.y = beforeY;
  }
  p[axis] = before;
  if (axis === 'y') { if (amount < 0) onGround = true; vel.y = 0; }
}

function respawn() {
  camera.position.copy(spawn);
  // 從空中往下找地面
  let y = WY - 2;
  while (y > 1 && !getBlock(WX >> 1, y, WZ >> 1)) y--;
  camera.position.y = y + 1 + PLAYER.eye;
  vel.set(0, 0, 0);
}

// ---------- 視角 / 輸入 ----------
const startEl = document.getElementById('start');
const canvas = renderer.domElement;

let playing = false;      // 已按下「開始玩」
let lockWorks = false;    // 這台瀏覽器的滑鼠鎖定可用嗎
const isLocked = () => document.pointerLockElement === canvas;
// 有滑鼠鎖定就照一般 FPS 玩;鎖定不可用時退回拖曳模式,一樣能玩
const active = () => playing && (isLocked() || !lockWorks);
function lockPointer() { try { canvas.requestPointerLock(); } catch (e) { } }

document.getElementById('playBtn').onclick = () => {
  startEl.style.display = 'none';
  playing = true;
  lockPointer();
  setTimeout(() => { if (!lockWorks) toast('提示:按住滑鼠拖曳可以轉視角'); }, 500);
};
document.getElementById('resetBtn').onclick = () => {
  clearSave();
  questIndex = 0;
  stats.placed = stats.dug = stats.rainbow = 0;
  flags.tower = false;
  generateWorld(); rebuildAll(); respawn(); drawQuest();
  toast('已經產生一個全新的世界！');
};

document.addEventListener('pointerlockchange', () => {
  if (isLocked()) { lockWorks = true; return; }
  if (playing && lockWorks) { saveWorld(); toast('已暫停（進度已存檔）點畫面繼續玩'); }
});

// 轉視角:鎖定滑鼠時直接動;沒鎖定就用「按住拖曳」
let dragging = false, dragStart = null;
document.addEventListener('mousemove', (e) => {
  if (!playing) return;
  if (!isLocked() && !dragging) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

let sel = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code >= 'Digit1' && e.code <= 'Digit9') { sel = +e.code[5] - 1; drawHotbar(); }
  if (e.code === 'KeyF') { flying = !flying; vel.set(0, 0, 0); toast(flying ? '飛行模式：開（空白鍵上升、Shift 下降）' : '飛行模式：關'); }
  if (e.code === 'KeyR') { respawn(); toast('回到出生點'); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('wheel', (e) => {
  if (!active()) return;
  sel = (sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
  drawHotbar();
}, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 挖 / 放 ----------
function raycastVoxel(maxDist = 6) {
  const o = camera.position.clone();
  const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const step = [Math.sign(d.x), Math.sign(d.y), Math.sign(d.z)];
  const tDelta = [Math.abs(1 / d.x), Math.abs(1 / d.y), Math.abs(1 / d.z)];
  const tMax = [
    step[0] > 0 ? (x + 1 - o.x) / d.x : step[0] < 0 ? (x - o.x) / d.x : Infinity,
    step[1] > 0 ? (y + 1 - o.y) / d.y : step[1] < 0 ? (y - o.y) / d.y : Infinity,
    step[2] > 0 ? (z + 1 - o.z) / d.z : step[2] < 0 ? (z - o.z) / d.z : Infinity,
  ];
  let normal = [0, 0, 0], t = 0;
  while (t <= maxDist) {
    if (getBlock(x, y, z)) return { x, y, z, normal };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    t = tMax[a];
    tMax[a] += tDelta[a];
    if (a === 0) { x += step[0]; normal = [-step[0], 0, 0]; }
    else if (a === 1) { y += step[1]; normal = [0, -step[1], 0]; }
    else { z += step[2]; normal = [0, 0, -step[2]]; }
    if (!inside(x, y, z) && (y < 0 || y >= WY)) return null;
  }
  return null;
}

function digBlock(x, y, z) {
  setBlock(x, y, z, 0);
  placed[idx(x, y, z)] = 0;
  stats.dug++;
  beep([220], 0.08, 0.06);
}
function placeBlock(x, y, z, id) {
  setBlock(x, y, z, id);
  placed[idx(x, y, z)] = 1;
  stats.placed++;
  if (id === 9) stats.rainbow++;
  beep([440], 0.08, 0.06);
  // 疊到 4 格高就達成「塔」
  if (!flags.tower) {
    let run = 1;
    for (let yy = y - 1; yy >= 0 && isPlaced(x, yy, z); yy--) run++;
    for (let yy = y + 1; yy < WY && isPlaced(x, yy, z); yy++) run++;
    if (run >= 4) flags.tower = true;
  }
}

function useTool(e) {
  const hit = raycastVoxel();
  if (!hit) return;
  if (e.button === 0) {
    digBlock(hit.x, hit.y, hit.z);
  } else if (e.button === 2) {
    const nx = hit.x + hit.normal[0], ny = hit.y + hit.normal[1], nz = hit.z + hit.normal[2];
    if (!inside(nx, ny, nz) || getBlock(nx, ny, nz)) return;
    // 別把方塊蓋在自己身上
    const p = camera.position, r = PLAYER.r, feet = p.y - PLAYER.eye;
    const overlap = nx + 1 > p.x - r && nx < p.x + r && nz + 1 > p.z - r && nz < p.z + r
      && ny + 1 > feet && ny < feet + PLAYER.h;
    // 小孩最常做的事就是低頭對著腳下按右鍵。這裡一定要講原因,不能默默沒反應
    if (overlap) { toast('你站的位置放不下方塊，往前面一點放'); return; }
    placeBlock(nx, ny, nz, HOTBAR[sel]);
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (!playing) return;
  if (isLocked()) { useTool(e); return; }
  if (lockWorks) { lockPointer(); return; }   // 暫停中 → 點一下繼續
  dragging = true;                            // 沒有滑鼠鎖定 → 拖曳模式
  dragStart = [e.clientX, e.clientY];
});
addEventListener('mouseup', (e) => {
  if (!playing || !dragging) return;
  dragging = false;
  if (Math.hypot(e.clientX - dragStart[0], e.clientY - dragStart[1]) < 5) useTool(e);
});

// ---------- HUD ----------
const hotbarEl = document.getElementById('hotbar');
function drawHotbar() {
  hotbarEl.innerHTML = HOTBAR.map((id, i) => `
    <div class="slot ${i === sel ? 'on' : ''}">
      <span class="no">${i + 1}</span>
      <div class="sw" style="background:${BLOCKS[id].color}"></div>
      <div class="nm">${BLOCKS[id].name}</div>
    </div>`).join('');
}
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.style.opacity = 0, 2200);
}
document.getElementById('who').innerHTML =
  `<span class="face">${ME.avatar}</span>現在是 <b>${ME.name}</b> 的世界`;
document.getElementById('hint').innerHTML =
  '左鍵挖 · 右鍵放 · 1~9 換方塊<br>F 飛行 · R 回出生點 · Esc 暫停存檔';

/* ============================================================
   任務系統
   小四生怕的是「不知道要幹嘛」,所以一次只給一個任務、一定要能自動判定完成。
   ============================================================ */
let questIndex = 0;
const stats = { placed: 0, dug: 0, rainbow: 0 };
const flags = { tower: false };

// --- 判定用的小工具 ---
const isPlaced = (x, y, z) => inside(x, y, z) && placed[idx(x, y, z)] === 1;

// 頭頂 1~4 格內有自己放的方塊 = 有屋頂
function hasRoofOverhead() {
  const x = Math.floor(camera.position.x), z = Math.floor(camera.position.z);
  const head = Math.floor(camera.position.y);
  for (let dy = 1; dy <= 4; dy++) if (isPlaced(x, head + dy, z)) return true;
  return false;
}

// 玩家站的位置往外洪水填充,填不出去 = 待在密閉空間裡
function insideSealedRoom() {
  const sx = Math.floor(camera.position.x);
  const sy = Math.floor(camera.position.y - PLAYER.eye + 0.1);
  const sz = Math.floor(camera.position.z);
  if (!inside(sx, sy, sz) || getBlock(sx, sy, sz)) return false;

  const seen = new Set([idx(sx, sy, sz)]);
  const queue = [[sx, sy, sz]];
  let ownWalls = 0, cells = 0;
  const LIMIT = 320, REACH = 11;

  while (queue.length) {
    const [x, y, z] = queue.pop();
    cells++;
    if (cells > LIMIT) return false;                       // 空間太大 = 通到外面
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!inside(nx, ny, nz)) return false;               // 漏到世界外
      if (Math.abs(nx - sx) > REACH || Math.abs(ny - sy) > REACH || Math.abs(nz - sz) > REACH)
        return false;                                       // 跑太遠 = 沒封起來
      if (getBlock(nx, ny, nz)) {                           // 撞到牆
        if (placed[idx(nx, ny, nz)]) ownWalls++;
        continue;
      }
      const k = idx(nx, ny, nz);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny, nz]);
    }
  }
  return cells >= 2 && ownWalls >= 6;   // 要有一定比例是自己蓋的,不能只是躲進山洞
}

const QUESTS = [
  { title: '放下你的第一個方塊',
    hint: '準星對著地面，按右鍵',
    goal: 1, get: () => stats.placed },
  { title: '挖掉 5 個方塊',
    hint: '準星對著方塊，按左鍵',
    goal: 5, get: () => stats.dug },
  { title: '蓋一座 4 格高的塔',
    hint: '對著同一個地方一直往上疊',
    goal: 1, get: () => flags.tower ? 1 : 0 },
  { title: '幫自己蓋一個屋頂',
    hint: '走到自己蓋的東西下面，讓頭頂有方塊',
    goal: 1, get: () => hasRoofOverhead() ? 1 : 0, slow: true },
  { title: '蓋一間不漏光的小房子，然後站進去',
    hint: '四面牆＋屋頂，全部封起來，不能留洞',
    goal: 1, get: () => insideSealedRoom() ? 1 : 0, slow: true },
  { title: '放 10 個彩虹方塊',
    hint: '按 9 換成彩虹方塊',
    goal: 10, get: () => stats.rainbow },
  { title: '全部完成了！想蓋什麼都可以',
    hint: '接下來這個世界都是你的',
    goal: 0, get: () => 0 },
];

const qEl = document.getElementById('quest');
const qTitle = qEl.querySelector('.q-title');
const qHint = qEl.querySelector('.q-hint');
const qFill = qEl.querySelector('.q-bar i');
const qCount = qEl.querySelector('.q-count');

function drawQuest() {
  const q = QUESTS[questIndex];
  qTitle.textContent = q.title;
  qHint.textContent = q.hint;
  const done = q.goal === 0;
  qEl.classList.toggle('done', done);
  qEl.querySelector('.q-bar').style.display = done ? 'none' : '';
  qCount.style.display = done ? 'none' : '';
  if (!done) {
    const p = Math.min(q.get(), q.goal);
    qFill.style.width = (p / q.goal * 100) + '%';
    qCount.textContent = `${p} / ${q.goal}`;
  }
}

// --- 音效:程式合成,不需要音檔 ---
let audio = null;
function beep(freqs, vol = 0.18, dur = 0.12) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    freqs.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    });
  } catch (e) { }
}

const confettiEl = document.getElementById('confetti');
const celebrateEl = document.getElementById('celebrate');
function celebrate(text) {
  beep([523.25, 659.25, 783.99, 1046.5], 0.22, 0.3);
  celebrateEl.querySelector('.c-sub').textContent = text;
  celebrateEl.classList.add('show');
  setTimeout(() => celebrateEl.classList.remove('show'), 1800);

  const colors = ['#ff5d5d', '#ffd257', '#7bdc7b', '#5db8ff', '#e05fc0', '#fff'];
  for (let i = 0; i < 44; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.top = '-20px';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = (1.4 + Math.random() * 1.2) + 's';
    p.style.animationDelay = (Math.random() * 0.4) + 's';
    confettiEl.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
  qEl.classList.add('pop');
  setTimeout(() => qEl.classList.remove('pop'), 260);
}

let questTimer = 0;
function checkQuest(dt) {
  const q = QUESTS[questIndex];
  if (q.goal === 0) return;
  if (q.slow) {                       // 需要掃描世界的判定,不用每一幀都跑
    questTimer += dt;
    if (questTimer < 0.4) { drawQuest(); return; }
    questTimer = 0;
  }
  if (q.get() >= q.goal) {
    questIndex++;
    celebrate(QUESTS[questIndex].goal === 0 ? QUESTS[questIndex].title : '下一個任務：' + QUESTS[questIndex].title);
    saveWorld();
  }
  drawQuest();
}

// ---------- 啟動 ----------
if (!loadWorld()) generateWorld();
rebuildAll();
drawHotbar();
drawQuest();
respawn();
const savedPos = localStorage.getItem(SAVE_KEY + '-pos');
if (savedPos) { try { camera.position.fromArray(JSON.parse(savedPos)); } catch (e) { } }

if (import.meta.env.DEV) window.KC = {
  camera, scene, THREE, world, placed, idx, getBlock, setBlock, heightAt, respawn, useTool, step,
  placeBlock, digBlock,
  QUESTS, stats, flags, insideSealedRoom, hasRoofOverhead,
  get sel() { return sel; }, get quest() { return questIndex; }, set quest(v) { questIndex = v; drawQuest(); },
};

setInterval(() => { if (playing) saveWorld(); }, 10000);
addEventListener('beforeunload', saveWorld);

// ---------- 主迴圈 ----------
function step(dt) {
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  const on = active();
  if (on) {
    const speed = flying ? 11 : 4.6;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const dir = new THREE.Vector3();
    if (keys.has('KeyW')) dir.add(fwd);
    if (keys.has('KeyS')) dir.sub(fwd);
    if (keys.has('KeyD')) dir.add(right);
    if (keys.has('KeyA')) dir.sub(right);
    if (dir.lengthSq()) dir.normalize().multiplyScalar(speed);

    if (flying) {
      let vy = 0;
      if (keys.has('Space')) vy += speed;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vy -= speed;
      moveAxis('x', dir.x * dt); moveAxis('z', dir.z * dt); moveAxis('y', vy * dt);
    } else {
      vel.y -= 26 * dt;
      const grounded = onGround;
      if (keys.has('Space') && grounded) vel.y = 8.4;
      onGround = false;
      moveAxis('x', dir.x * dt, grounded);
      moveAxis('z', dir.z * dt, grounded);
      moveAxis('y', vel.y * dt);
      if (camera.position.y < -20) respawn();   // 掉出世界 → 不會死,直接送回家
    }
  }

  // 選取框
  const hit = on ? raycastVoxel() : null;
  if (hit) { hl.visible = true; hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); }
  else hl.visible = false;

  if (on) checkQuest(dt);
  flushDirty();
}

let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(dt);
  renderer.render(scene, camera);
}
animate();
