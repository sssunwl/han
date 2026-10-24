/* ============================================================
   pixelkit 角色:大頭小身的 Q 版小人(約 2 頭身)
   一格 24×32,腳踩在 y=30。不換衣服,只換「膚色、髮型、髮色、衣服顏色」。
   一層一層疊:後髮 → 腳 → 身體 → 手 → 頭 → 臉 → 前髮,最後整隻一起描外框。

   makeCharacter(opts) 回傳 sprite sheet(Bmp,有快取):
     4 列方向:下、左、右、上      6 欄:待機 0~1、走路 0~3
   ============================================================ */
import { Bmp, outline, tone, mix } from './core.js';

export const FW = 24, FH = 32;
export const DIRS = ['down', 'left', 'right', 'up'];
export const COLS = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3'];

export const SKINS = ['#ffe0c7', '#f5c9a3', '#e0a77c', '#b9805a', '#8a5a3c'];
export const HAIR_COLORS = ['#3a2a2a', '#6b4430', '#a8683c', '#e8bf5a', '#d8573f', '#8a6ad8', '#4d8f6a', '#f2eee8'];
export const CLOTH_COLORS = ['#ff8fb1', '#6fc3ff', '#ffd25a', '#7fdc8a', '#b98cff', '#ff9a52', '#f4f1fa', '#4a5a8a'];
export const HAIRS = ['short', 'bob', 'long', 'ponytail', 'twintails', 'spiky', 'bun', 'curly'];
export const HAIR_NAMES = { short: '短髮', bob: '妹妹頭', long: '長髮', ponytail: '馬尾', twintails: '雙馬尾', spiky: '刺刺頭', bun: '包包頭', curly: '捲捲頭' };

const LINE = '#3a3150';                     // 角色外框用柔和的深灰紫,比家具的外框淡一點
const SHOE = tone('#5a4a5e'), PANTS = tone('#4a5a8a');

/** 這一格的姿勢:bob 身體往下 1px、lA/lB 左右腳抬起、sw 手擺、step 側面跨步 */
function pose(col) {
  switch (col) {
    case 'idle1': return { blink: true, bob: 0, lA: 0, lB: 0, sw: 0, step: 0 };
    case 'walk1': return { bob: 1, lA: 1, lB: 0, sw: 1, step: 2 };
    case 'walk3': return { bob: 1, lA: 0, lB: 1, sw: -1, step: -2 };
    default: return { bob: 0, lA: 0, lB: 0, sw: 0, step: 0 };
  }
}

// 頭:佔了一半以上身高。用「超橢圓」畫成圓角方形的臉(SQ 越大越方,2 = 正圓)
// 頭、頭髮、臉都在原本的位置畫好,最後整組往下移 HEAD_DROP 格(身體和腳變短,頭就往下)
const HEAD = { cx: 12, cy: 9, rx: 8.6, ry: 7.6 };     // 頭與身體之間留脖子,才不會像在低頭
const SQ = 3;
const HEAD_DROP = 3;
const inHead = (x, y, bob, dx = 0, grow = 0) => {
  const a = Math.abs((x + 0.5 - HEAD.cx - dx) / (HEAD.rx + grow)), b = Math.abs((y + 0.5 - HEAD.cy - bob) / (HEAD.ry + grow));
  return a ** SQ + b ** SQ <= 1;
};

function drawLegs(b, dir, p) {
  const leg = (x, lift) => {
    const bot = 30 - lift;
    b.rect(x, 26, 3, bot - 27, PANTS.mid); b.vline(x, 26, bot - 27, PANTS.hi);      // 短腿:3 格 + 鞋
    b.rect(x, bot - 1, 3, 1, SHOE.mid);
  };
  if (dir === 'down' || dir === 'up') { leg(8, p.lA); leg(13, p.lB); }
  else { leg(10 - p.step, p.step > 0 ? 1 : 0); leg(11 + p.step, p.step < 0 ? 1 : 0); }
}
function drawBody(b, dir, p, o) {
  const c = tone(o.cloth), y0 = 21 + p.bob, side = dir !== 'down' && dir !== 'up';
  const x0 = side ? 8 : 7, w = side ? 8 : 10, h = 5 - p.bob;                          // 短身:5 格
  b.rect(x0, y0, w, h, c.mid); b.vline(x0, y0, h, c.hi); b.vline(x0 + w - 1, y0, h, c.lo); b.hline(x0, y0 + h - 1, w, c.lo);
  if (dir === 'down') { b.px(11, y0, tone(o.skin).mid); b.px(12, y0, tone(o.skin).mid); }       // 領口
}
function drawArms(b, dir, p, o, layer) {
  const c = tone(o.cloth), s = tone(o.skin), y = 22 + p.bob;
  const arm = (x, yy, far) => { b.rect(x, yy, 2, 2, far ? c.lo : c.mid); b.rect(x, yy + 2, 2, 2, far ? s.lo : s.mid); };
  if (dir === 'down' || dir === 'up') { if (layer === 'front') { arm(5, y + Math.max(0, p.sw), false); arm(17, y + Math.max(0, -p.sw), false); } }
  else if (layer === 'back') arm(13 + p.sw, y, true);
  else arm(9 - p.sw * 2, y + Math.abs(p.sw), false);
}
function drawHead(b, dir, p, o) {
  const s = tone(o.skin), dx = 0;                    // 側面頭不要往前偏(偏了會像往前探)
  b.rect(10, 16 + p.bob, 4, 2, s.lo);                 // 脖子
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (inHead(x, y, p.bob, dx)) b.px(x, y, s.mid);
  // 下巴右下緣一圈淡陰影(光從左上來)
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!inHead(x, y, p.bob, dx) || (inHead(x, y + 1, p.bob, dx) && inHead(x + 1, y, p.bob, dx))) continue;
    if (y > HEAD.cy + p.bob + 3 && x > HEAD.cx + dx - 3) b.px(x, y, s.lo);
  }
}
// 臉:參考 LimeZu 小孩角色的比例 —— 眼睛小、位置低(靠近下巴)、沒有嘴巴,只留腮紅
function drawFace(b, dir, p, o) {
  if (dir === 'up') return;
  const y = 11 + p.bob, eye = x => { if (p.blink) { b.hline(x, y + 1, 2, LINE); return; } b.rect(x, y, 2, 2, '#3b2c4a'); b.px(x, y, '#ffffff'); };
  if (dir === 'down') { eye(7); eye(15); b.hline(5, y + 2, 2, '#ffa3b5'); b.hline(17, y + 2, 2, '#ffa3b5'); }
  else { eye(5); b.hline(4, y + 2, 2, '#ffa3b5'); }
}

/** 頭髮。layer 'back' 畫在身體後面(長髮、馬尾、雙馬尾) */
function drawHair(b, dir, p, o, layer) {
  const t = tone(o.hairColor), st = o.hair, dy = p.bob;
  const h = new Bmp(FW, FH), side = dir === 'left', up = dir === 'up';
  const cx = side ? 11 : 12;
  const fill = (fn, c = t.mid) => {
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++)
      if (fn(x - cx, y - 10 - dy, x, y)) h.px(x, y, c);
  };
  // 垂髮以逐列收窄的輪廓畫出髮梢，避免矩形髮片。
  const tail = (x, y, length, width) => {
    for (let j = 0; j < length; j++) {
      const w = Math.max(1, width - Math.floor(j * width / length));
      h.rect(x - Math.floor(w / 2), y + j + dy, w, 1, t.mid);
    }
  };
  // 綁點在頭側偏上；髮尾先窄後寬，末端稍向外收尖。
  const twinTail = right => {
    for (let y = 7; y <= 22; y++) {
      const width = y < 10 ? 2 : y < 12 ? 3 : y < 19 ? 4 : y < 21 ? 3 : 2;
      const x = right ? (y < 10 ? 19 : 23 - width) : (y < 10 ? 3 : 1);
      h.hline(x, y + dy, width, t.mid);
    }
  };
  if (layer === 'back') {
    if (st === 'long') {
      if (side) tail(17, 10, 15, 8);
      else if (up) { tail(8, 11, 14, 7); tail(15, 11, 14, 8); }
      else { tail(4, 10, 14, 4); tail(20, 10, 14, 4); }
    }
    if (st === 'ponytail') tail(side ? 20 : up ? 14 : 21, 10, 13, 5);
    if (st === 'twintails') {
      twinTail(true);
      if (!side) twinTail(false);
    }
  } else {
    const grow = st === 'curly' ? 1.3 : 0.5;
    const end = { short: 2, bob: 6, long: 6, ponytail: 2, twintails: 3, spiky: 1, bun: 2, curly: 5 }[st];
    fill((u, v, x, y) => {
      if (!inHead(x, y, dy, 0, grow)) return false;
      if (up) return v <= Math.max(5, end) - Math.max(0, 2 - Math.abs(u)) * 0.6;
      const fringe = -2 + ((st === 'spiky' || st === 'curly') && (x % 3 === 0) ? 1 : 0);
      if (side) return v <= fringe || (u >= 4 + Math.max(0, v) * 0.18 && v <= end);
      return v <= fringe - (st === 'long' && Math.abs(u) < 2 ? 1 : 0) || (Math.abs(u) >= 7 && v <= end);
    });
    if (st === 'bob' && side) tail(18, 10, 8, 5);
    if (st === 'curly') {
      for (const [x, y] of [[6, 5], [11, 3], [17, 4], [20, 8], [4, 9], [20, 12]]) h.oval(x, y + dy, 2.4, 2, t.mid);
    }
    if (st === 'spiky') fill((u, v, x) => v >= -9 && v <= -6 && Math.abs(u) < 7 && x % 3 <= v + 9);
    if (st === 'bun') {
      // 髮髻放頭頂偏右:頭抬高後正上方沒空間,放正中間會被頭頂蓋掉
      h.oval(side ? 18 : 16.5, 2.9 + dy, 3, 2.5, t.mid);
      h.hline(side ? 16 : 15, 5 + dy, 3, t.lo);
    }
    // 後腦底下留一小段脖子；綁髮在後腦上方也能辨認。
    if (up) {
      b.rect(10, 16 + dy, 4, 3, tone(o.skin).mid);
      if (st === 'ponytail') tail(14, 11, 12, 5);
      if (st === 'twintails') { twinTail(false); twinTail(true); }
    }
  }
  // 柔和的單像素弧形光澤，避開最上緣，淺髮再降低對比。
  const light = mix(o.hairColor, ['#f2eee8', '#e8bf5a'].includes(o.hairColor.toLowerCase()) ? 0.07 : 0.16);
  const arcX = side ? 5 : 6;
  const glints = new Set([[arcX, 6], [arcX + 1, 5], [arcX + 2, 5], [arcX + 3, 4]].map(([x, y]) => `${x},${y}`));
  // 只在髮片內畫分束：右緣暗面與彎曲的髮流。

  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!h.alpha(x, y)) continue;
    const v = y - dy;
    if (!h.alpha(x + 1, y) || (!h.alpha(x, y + 1) && v > 6)) h.px(x, y, t.lo);
    else if (layer === 'front' && glints.has(`${x},${v}`) && h.alpha(x, y - 1)) h.px(x, y, light);
    else if (v > 6 && v < 24 && (x === 7 + Math.floor((v - 6) / 7) || x === 13 + Math.floor((v - 6) / 8) || x === 18 + Math.floor((v - 6) / 9))) h.px(x, y, t.lo);
    else if (v > 8 && x < 8 && x % 3 === 0) h.px(x, y, light);
  }
  b.blit(h, 0, 0);
  if (layer === 'front' && (st === 'ponytail' || st === 'twintails')) {
    const xs = st === 'ponytail' ? [side ? 20 : up ? 14 : 21] : side ? [20] : [3, 20];
    const tieY = (st === 'twintails' ? 8 : 11) + dy;
    xs.forEach(x => {
      const tieX = st === 'twintails' ? x : x - 1;
      b.hline(tieX, tieY, st === 'twintails' ? 2 : 3, '#ff8fb1');
      b.px(tieX, tieY, '#ffd1de');
    });
  }
}

function frame(dir, col, o) {
  const b = new Bmp(FW, FH), p = pose(col);
  const d = dir === 'right' ? 'left' : dir;             // 右邊 = 左邊鏡像
  const back = new Bmp(FW, FH), head = new Bmp(FW, FH);
  drawHair(back, d, p, o, 'back');
  b.blit(back, 0, HEAD_DROP);
  drawArms(b, d, p, o, 'back');
  drawLegs(b, d, p);
  drawBody(b, d, p, o);
  drawArms(b, d, p, o, 'front');
  drawHead(head, d, p, o);
  drawFace(head, d, p, o);
  drawHair(head, d, p, o, 'front');
  b.blit(head, 0, HEAD_DROP);
  outline(b, LINE);
  let out = b;
  if (dir === 'right') { out = new Bmp(FW, FH); out.blit(b, 0, 0, true); }
  const sh = new Bmp(FW, FH); sh.oval(12, 30.4, 6, 1.5, '#00000040'); sh.blit(out, 0, 0);    // 腳底影子(不描邊)
  return sh;
}

export const DEFAULT = { skin: SKINS[0], hair: 'short', hairColor: HAIR_COLORS[1], cloth: CLOTH_COLORS[0] };

const cache = new Map();
/** 整張 sprite sheet:4 列方向 × 6 欄 */
export function makeCharacter(opts = {}) {
  const o = { ...DEFAULT, ...opts }, key = [o.skin, o.hair, o.hairColor, o.cloth].join('|');
  if (cache.has(key)) return cache.get(key);
  const sheet = new Bmp(FW * COLS.length, FH * DIRS.length);
  DIRS.forEach((dir, r) => COLS.forEach((col, c) => sheet.blit(frame(dir, col, o), c * FW, r * FH)));
  cache.set(key, sheet);
  return sheet;
}
/** 只要一格 */
export function makeFrame(opts, dir = 'down', col = 'idle0') { return frame(dir, col, { ...DEFAULT, ...opts }); }

/** 隨機一位路人(seed 一樣就長一樣) */
export function randomLook(seed = Math.random() * 1e9) {
  let s = (seed | 0) || 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(r() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), hairColor: pick(HAIR_COLORS.slice(0, 7)), cloth: pick(CLOTH_COLORS) };
}
