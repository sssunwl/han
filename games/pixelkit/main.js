import { toCanvas } from '../../shared/pixelkit/core.js';
import { KIT } from '../../shared/pixelkit/furniture.js';
import { JP_KIT } from '../../shared/pixelkit/japanese.js';

const $ = id => document.getElementById(id);
const Z = 3;

// ---------- 家具清單 ----------
const made = {};
for (const [name, k] of Object.entries(KIT)) {
  const b = k.make(); made[name] = b;
  const c = document.createElement('canvas'); c.width = b.w * Z; c.height = b.h * Z;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(toCanvas(b), 0, 0, c.width, c.height);
  const card = document.createElement('div'); card.className = 'card';
  const wrap = document.createElement('div'); wrap.className = 'checker'; wrap.appendChild(c);
  card.append(wrap, Object.assign(document.createElement('span'), { textContent: `${name} ${b.w}×${b.h}` }));
  $('kit').appendChild(card);
}
// 和風組(溫泉旅館用)
for (const [name, k] of Object.entries(JP_KIT)) {
  const b = k.make();
  const c = document.createElement('canvas'); c.width = b.w * Z; c.height = b.h * Z;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(toCanvas(b), 0, 0, c.width, c.height);
  const card = document.createElement('div'); card.className = 'card';
  const wrap = document.createElement('div'); wrap.className = 'checker'; wrap.appendChild(c);
  card.append(wrap, Object.assign(document.createElement('span'), { textContent: `${name} ${b.w}×${b.h}` }));
  $('kitJP').appendChild(card);
}

// ---------- 場景 ----------
const sc = $('scene').getContext('2d');
sc.imageSmoothingEnabled = false;
export const scene = { ctx: sc, made, extra: [] };
function drawScene() {
  const d = (n, x, y) => sc.drawImage(toCanvas(made[n]), x, y);
  for (let x = 0; x < 256; x += 32) d(x === 96 ? 'wall_shelf' : x === 192 || x === 32 ? 'wall_window' : 'wall', x, 0);
  for (let x = 0; x < 256; x += 32) d('awning', x, 0);
  for (let y = 64; y < 192; y += 32) for (let x = 0; x < 256; x += 32) d('floor_check', x, y);
  d('menu_board', 128, 12); d('cone_sign', 4, 14);
  d('freezer', 64, 50); d('counter', 160, 66); d('register', 176, 56);
  d('plant_tall', 222, 40);
  d('table', 40, 140); d('chair_right', 14, 136); d('chair_left', 66, 136);
  d('table', 184, 140); d('chair_right', 158, 136); d('chair_left', 210, 136);
  d('plant_round', 116, 140); d('bin', 4, 92);
  d('cone_2', 52, 136); d('cup', 190, 134);
  for (const f of scene.extra) f(sc);
}
scene.draw = drawScene;
drawScene();

// ---------- 換裝 ----------
import { makeCharacter, makeFrame, randomLook, FW, FH, SKINS, HAIR_COLORS, CLOTH_COLORS, HAIRS } from '../../shared/pixelkit/character.js';

const DIRS=['down','left','right','up'];
const HAIR_NAMES={short:'短髮',bob:'妹妹頭',long:'長髮',ponytail:'馬尾',twintails:'雙馬尾',spiky:'刺刺頭',bun:'包包頭',curly:'捲髮'};
const look = { ...randomLook(13), hair: 'twintails', hairColor: HAIR_COLORS[3], cloth: CLOTH_COLORS[0] };
const ctl = $('controls');
const opt = (label, key, list, names, swatch) => {
  ctl.insertAdjacentHTML('beforeend', `<b>${label}</b><div class="row" data-key="${key}">${list.map(v =>
    swatch ? `<button class="sw" data-v="${v}" style="background:${v}"></button>` : `<button data-v="${v}">${names[v]}</button>`).join('')}</div>`);
};
opt('髮型', 'hair', HAIRS, HAIR_NAMES); opt('髮色', 'hairColor', HAIR_COLORS, null, true);
opt('衣服顏色', 'cloth', CLOTH_COLORS, null, true); opt('膚色', 'skin', SKINS, null, true);
ctl.insertAdjacentHTML('beforeend', '<b></b><div class="row"><button id="rand">🎲 隨機</button></div>');
ctl.addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  if (btn.id === 'rand') Object.assign(look, randomLook());
  else look[btn.parentElement.dataset.key] = btn.dataset.v;
  sync();
});
function sync() {
  for (const row of ctl.querySelectorAll('[data-key]')) for (const b of row.children) b.classList.toggle('on', b.dataset.v === look[row.dataset.key]);
}
sync();

// 四個方向一起走
const walkers = DIRS.map(dir => {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas'); c.width = FW * 4; c.height = FH * 4;
  fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: { down: '下', left: '左', right: '右', up: '上' }[dir] }));
  $('walkers').appendChild(fig);
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return { dir, g };
});
// 一整張 sheet 也放一份(看全部格子)
const sheetC = document.createElement('canvas'); sheetC.width = FW * 6 * 3; sheetC.height = FH * 4 * 3;
const sheetFig = document.createElement('figure'); sheetFig.append(sheetC, Object.assign(document.createElement('figcaption'), { textContent: 'sprite sheet(待機×2 + 走路×4)' }));
$('walkers').appendChild(sheetFig);
const sg = sheetC.getContext('2d'); sg.imageSmoothingEnabled = false;

// 路人
const crowd = Array.from({ length: 10 }, (_, i) => ({ look: randomLook(i * 7919 + 13), x: i * 27 + 6, v: (i % 2 ? -1 : 1) * (0.25 + (i % 3) * 0.08) }));
const cg = $('crowd').getContext('2d'); cg.imageSmoothingEnabled = false;

// 場景裡的客人與店員
const people = [
  { look: { ...look }, x: 176, y: 64, dir: 'down', staff: true },
  { look: randomLook(42), x: 120, y: 120, dir: 'up', walk: true },
  { look: randomLook(99), x: 210, y: 176, dir: 'left', walk: true, vx: -0.3 },
  { look: randomLook(7), x: 24, y: 176, dir: 'right', walk: true, vx: 0.25 },
];
scene.extra.push(g => {
  people[0].look = look;
  const t = performance.now();
  for (const p of [...people].sort((a, b) => a.y - b.y)) {
    const col = p.walk ? 2 + Math.floor(t / 140) % 4 : Math.floor(t / 600) % 2;
    const sheet = toCanvas(makeCharacter(p.look));
    g.drawImage(sheet, col * FW, DIRS.indexOf(p.dir) * FH, FW, FH, Math.round(p.x - 12), Math.round(p.y - 30), FW, FH);
  }
});

function tick(t) {
  const col = 2 + Math.floor(t / 140) % 4;
  const sheet = toCanvas(makeCharacter(look));
  for (const w of walkers) { w.g.clearRect(0, 0, FW * 4, FH * 4); w.g.drawImage(sheet, col * FW, DIRS.indexOf(w.dir) * FH, FW, FH, 0, 0, FW * 4, FH * 4); }
  sg.clearRect(0, 0, sheetC.width, sheetC.height); sg.drawImage(sheet, 0, 0, sheetC.width, sheetC.height);
  cg.fillStyle = '#3d3456'; cg.fillRect(0, 0, 256, 48);
  for (const p of crowd) {
    p.x += p.v; if (p.x < -20) p.x = 276; if (p.x > 276) p.x = -20;
    const s = toCanvas(makeCharacter(p.look));
    cg.drawImage(s, (2 + Math.floor(t / 150) % 4) * FW, DIRS.indexOf(p.v > 0 ? 'right' : 'left') * FH, FW, FH, Math.round(p.x - 12), 12, FW, FH);
  }
  for (const p of people) if (p.vx) { p.x += p.vx; if (p.x < 10 || p.x > 246) { p.vx *= -1; p.dir = p.vx > 0 ? 'right' : 'left'; } }
  scene.draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.PK = { look, makeCharacter, makeFrame };

// ---------- 一覽:8 種髮型 × 換顏色 ----------
{
  const g = $('gallery').getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#3d3456'; g.fillRect(0, 0, 256, 160);
  const put = (o, x, y, dir = 'down') => g.drawImage(toCanvas(makeFrame(o, dir)), x, y);
  HAIRS.forEach((h, i) => {
    put({ hair: h, hairColor: HAIR_COLORS[i % 7], skin: SKINS[i % 5], cloth: CLOTH_COLORS[i] }, 8 + i * 30, 8);
    put({ hair: h, hairColor: HAIR_COLORS[(i + 3) % 7], skin: SKINS[(i + 2) % 5], cloth: CLOTH_COLORS[(i + 4) % 8] }, 8 + i * 30, 46, 'left');
    put({ hair: h, hairColor: HAIR_COLORS[(i + 5) % 7], skin: SKINS[(i + 1) % 5], cloth: CLOTH_COLORS[(i + 2) % 8] }, 8 + i * 30, 84, 'right');
    put({ hair: h, hairColor: HAIR_COLORS[(i + 1) % 7], skin: SKINS[(i + 3) % 5], cloth: CLOTH_COLORS[(i + 6) % 8] }, 8 + i * 30, 122, 'up');
  });
}

// ===== 雪糕店擴充素材 =====
import { ICE_KIT } from '../../shared/pixelkit/icecream.js';
for (const [name, kit] of Object.entries(ICE_KIT)) {
  const bitmap = kit.make();
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.w * Z;
  canvas.height = bitmap.h * Z;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(toCanvas(bitmap), 0, 0, canvas.width, canvas.height);
  const card = document.createElement('div');
  card.className = 'card';
  const wrap = document.createElement('div');
  wrap.className = 'checker';
  wrap.append(canvas);
  card.append(wrap, Object.assign(document.createElement('span'), {
    textContent: `${name} ${bitmap.w}×${bitmap.h}`
  }));
  $('kitIce').append(card);
}
