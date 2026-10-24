/* ============================================================
   pixelkit 家具:第一批「雪糕店」
   每件都是一個函式,回傳 Bmp。尺寸都是 32px 格的倍數(小東西 16px)。
   KIT 是清單:名字 → { w, h, tags, make(opts) },匯出工具與預覽頁都讀這份。
   ============================================================ */
import { Bmp, outline, tone, mix } from './core.js';

export const FLAVORS = {
  vanilla: '#fff1c9', strawberry: '#ff9fbe', chocolate: '#8a5a3c', mint: '#9fe8cf',
  mango: '#ffcf4a', grape: '#c6a2ff', matcha: '#a9cf6a', soda: '#8fd3ff',
};
const FL = Object.values(FLAVORS);

const WHITE = tone('#f4f1fa'), PINK = tone('#ff9fbe'), MINT = tone('#9fe3cf'), WOOD = tone('#c98a55'), STEEL = tone('#b9c2d6');
const CREAM = tone('#fff3dc');

/** 3/4 視角的箱子:上面一條亮面(topH 高)、正面本色、底下一條陰影 */
function box(b, x, y, w, h, topH, t, front = t) {
  b.rect(x, y, w, topH, t.hi);
  b.hline(x, y + topH, w, t.lo);                       // 檯面邊緣的陰影線
  b.rect(x, y + topH + 1, w, h - topH - 1, front.mid);
  b.vline(x, y + topH + 1, h - topH - 2, front.hi);    // 左邊受光
  b.hline(x, y + h - 1, w, front.lo);
}
/** 一球雪糕(圓頂 + 亮點 + 底下一圈影) */
function scoop(b, cx, cy, r, c) {
  const t = tone(c);
  b.oval(cx, cy, r, r * 0.85, t.mid);
  b.oval(cx + r * 0.25, cy + r * 0.35, r * 0.75, r * 0.45, t.lo);
  b.oval(cx - r * 0.05, cy - r * 0.15, r * 0.8, r * 0.6, t.mid);
  b.px(cx - r * 0.45, cy - r * 0.45, t.hi); b.px(cx - r * 0.45 + 1, cy - r * 0.45, t.hi); b.px(cx - r * 0.45, cy - r * 0.45 + 1, t.hi);
  // 下緣小波浪(融化的感覺)
  for (let i = -r + 1; i < r; i += 3) b.px(cx + i, cy + r * 0.8, t.lo);
}

// ---------------- 冰櫃 ----------------
function freezer({ flavors = FL.slice(0, 6) } = {}) {
  const W = 96, H = 64, b = new Bmp(W, H);
  // 玻璃罩裡面
  b.rect(2, 6, W - 4, 20, '#d9eefc');
  b.rect(2, 6, W - 4, 3, '#b9d6ee');                  // 後壁比較暗
  // 一格一格的雪糕桶
  const n = flavors.length, cw = Math.floor((W - 8) / n);
  flavors.forEach((c, i) => {
    const x = 4 + i * cw, t = tone(c);
    b.rect(x, 12, cw - 2, 11, STEEL.lo);
    b.hline(x, 12, cw - 2, STEEL.hi); b.vline(x, 13, 9, STEEL.hi);
    b.hline(x + 1, 22, cw - 3, STEEL.mid);              // 桶子
    b.rect(x + 1, 12, cw - 4, 9, t.mid);
    b.rect(x + 1, 18, cw - 4, 3, t.lo);
    b.hline(x + 2, 12, cw - 7, t.hi); b.px(x + 2, 13, t.hi);
    // 挖過的痕跡
    b.hline(x + 3, 15, 4, t.lo); b.hline(x + 4, 16, 3, t.hi);
    b.hline(x + cw - 7, 18, 3, t.lo); b.px(x + cw - 5, 17, t.lo);
    b.hline(x + cw - 7, 19, 3, t.hi); b.px(x + 2, 19, t.hi);
  });
  // 玻璃:斜斜的反光
  for (let i = 0; i < 3; i++) for (let j = 0; j < 18; j++) {
    b.px(10 + i * 30 + j * 0.5 | 0, 7 + j, '#ffffff66');
    b.px(12 + i * 30 + j * 0.5 | 0, 7 + j, '#ffffff33');
  }
  // 玻璃框
  b.rect(1, 3, W - 2, 3, STEEL.hi); b.hline(1, 5, W - 2, STEEL.lo);
  b.rect(1, 3, 2, 24, STEEL.mid); b.rect(W - 3, 3, 2, 24, STEEL.mid);
  // 檯面
  b.rect(1, 26, W - 2, 3, WHITE.hi); b.hline(1, 29, W - 2, WHITE.lo);
  // 櫃身:白色 + 粉紅下擺 + 三塊門板
  b.rect(1, 30, W - 2, 27, WHITE.mid); b.vline(1, 30, 27, WHITE.hi);
  for (let i = 0; i < 3; i++) {
    const x = 6 + i * 30;
    b.rect(x, 33, 25, 12, WHITE.lo); b.rect(x + 1, 34, 23, 10, WHITE.mid); b.hline(x + 1, 34, 23, WHITE.hi);
    b.rect(x + 9, 38, 7, 2, STEEL.lo);                 // 把手
  }
  b.rect(1, 47, W - 2, 8, PINK.mid); b.hline(1, 47, W - 2, PINK.hi); b.hline(1, 54, W - 2, PINK.lo);
  for (let x = 4; x < W - 3; x += 8) b.oval(x + 2, 51, 1.6, 1.6, PINK.hi);   // 粉紅波點
  b.rect(1, 56, W - 2, 2, '#6a5b7a'); b.rect(4, 58, 4, 4, '#4a3f58'); b.rect(W - 8, 58, 4, 4, '#4a3f58');
  return outline(b);
}

// ---------------- 櫃台、收銀機 ----------------
function counter({ color = '#9fe3cf' } = {}) {
  const b = new Bmp(64, 48), t = tone(color);
  box(b, 1, 1, 62, 43, 11, CREAM, t);
  // 厚檯面的前緣、右側陰影和左上反光。
  b.hline(2, 2, 59, CREAM.hi); b.hline(3, 9, 57, CREAM.mid);
  b.rect(1, 11, 62, 3, CREAM.mid); b.hline(1, 14, 62, CREAM.lo);
  b.hline(4, 3, 23, '#ffffff'); b.vline(61, 3, 9, CREAM.lo);
  b.hline(3, 15, 58, t.lo);
  // 正面直條門板
  for (let x = 6; x < 58; x += 13) { b.vline(x, 16, 24, t.lo); b.vline(x + 1, 17, 21, t.hi);
    b.hline(x + 3, 18, 8, t.hi); b.hline(x + 3, 37, 8, t.lo);
    b.vline(x + 10, 19, 18, t.lo); }
  b.rect(1, 40, 62, 4, t.dk);
  // 檯面木紋
  for (let x = 4; x < 60; x += 9) b.hline(x, 5 + (x % 3), 4, CREAM.mid);
  return outline(b);
}
function register() {
  const b = new Bmp(32, 32);
  b.rect(4, 14, 24, 14, STEEL.mid); b.rect(4, 14, 24, 3, STEEL.hi); b.hline(4, 27, 24, STEEL.lo);
  b.rect(6, 18, 14, 7, '#4a3f58');                      // 按鍵區
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) b.px(7 + x * 3, 19 + y * 3, x === 3 ? PINK.mid : '#e9e4f5');
  b.rect(22, 18, 4, 7, STEEL.lo);
  b.hline(6, 26, 19, STEEL.hi); b.hline(7, 27, 11, STEEL.lo);
  b.hline(10, 5, 10, '#c8ffe8'); b.px(23, 20, '#9df0c8');
  b.rect(8, 4, 16, 9, '#5a4c6c'); b.rect(9, 5, 14, 6, '#9df0c8'); b.hline(10, 7, 6, '#4fb88a');  // 螢幕
  b.rect(14, 12, 4, 2, '#5a4c6c');
  return outline(b);
}

// ---------------- 牆上:菜單板、甜筒招牌、遮陽棚 ----------------
function menuBoard() {
  const b = new Bmp(64, 40);
  b.rect(1, 1, 62, 38, WOOD.mid); b.hline(1, 1, 62, WOOD.hi); b.hline(1, 38, 62, WOOD.lo);
  b.rect(4, 4, 56, 32, '#3d4a48'); b.rect(4, 4, 56, 2, '#2f3a39');
  FL.slice(0, 6).forEach((c, i) => {
    const x = 8 + (i % 2) * 27, y = 9 + Math.floor(i / 2) * 9;
    b.oval(x + 2, y + 2, 2.5, 2.5, c); b.px(x + 1, y + 1, mix(c, 0.4));
    for (let k = 0; k < 14; k += 2) b.px(x + 7 + k, y + 2, '#e9f3ef');            // 粉筆字
    b.px(x + 7, y + 4, '#ffd84a'); b.px(x + 8, y + 4, '#ffd84a');                 // 價錢
  });
  return outline(b);
}
function coneSign() {
  const b = new Bmp(32, 48);
  // 甜筒
  for (let y = 0; y < 22; y++) { const w = Math.max(1, Math.round(10 - y * 0.45)); b.rect(16 - w, 22 + y, w * 2, 1, (y % 4 < 2) ? '#e3a85e' : '#cf9046'); }
  for (let y = 23; y < 40; y += 4) for (let x = 8; x < 24; x += 4) b.px(x + (y % 8 ? 2 : 0), y, '#a86e32');
  scoop(b, 16, 15, 10, FLAVORS.strawberry);
  scoop(b, 16, 7, 7, FLAVORS.vanilla);
  b.px(13, 1, '#e84a5f'); b.px(14, 1, '#e84a5f'); b.px(13, 2, '#c93348'); b.vline(15, 0, 2, '#5a8a3a'); // 櫻桃
  return outline(b);
}
function awning({ color = '#ff9fbe' } = {}) {
  const b = new Bmp(32, 16), t = tone(color);
  for (let i = 0; i < 4; i++) {
    const c = i % 2 ? WHITE : t;
    b.rect(i * 8, 0, 8, 10, c.mid); b.vline(i * 8, 0, 10, c.hi);
    b.oval(i * 8 + 4, 10, 4, 3, c.mid); b.hline(i * 8 + 1, 12, 6, c.lo);
  }
  b.hline(0, 0, 32, t.dk);
  return b;     // 要接成一長條,不描邊
}

// ---------------- 桌椅 ----------------
function table({ top = '#fff3dc' } = {}) {
  const b = new Bmp(32, 32), t = tone(top);
  b.oval(16, 29, 8, 2, '#00000033');
  b.rect(14, 14, 4, 14, STEEL.mid); b.vline(14, 14, 14, STEEL.hi);
  b.oval(16, 27, 6, 2, STEEL.lo);
  b.oval(16, 10, 14, 7, t.lo);
  b.oval(16, 9, 14, 6.5, t.mid);
  b.oval(13, 7, 8, 3, t.hi);
  b.hline(9, 4, 10, mix(top, 0.45)); b.hline(10, 15, 13, t.lo);
  b.vline(17, 17, 8, STEEL.lo); b.hline(12, 26, 5, STEEL.hi);
  return outline(b);
}
/** 椅子:dir 0 下(面向下)、1 上、2 左、3 右 */
function chair({ dir = 0, color = '#ff9fbe' } = {}) {
  const b = new Bmp(32, 32), t = tone(color);
  const legs = () => { b.rect(9, 22, 2, 8, STEEL.lo); b.rect(21, 22, 2, 8, STEEL.lo); b.rect(11, 22, 2, 6, STEEL.mid); b.rect(19, 22, 2, 6, STEEL.mid); };
  if (dir === 0 || dir === 1) {
    legs();
    if (dir === 1) { b.rrect(8, 15, 16, 8, t.mid, 2); b.hline(9, 15, 14, t.hi); b.hline(9, 22, 14, t.lo); }   // 坐墊在前面
    b.rrect(8, 4, 16, 14, t.mid, 2); b.rect(10, 6, 12, 9, dir === 0 ? t.lo : t.hi);   // 椅背
    b.hline(9, 4, 14, t.hi); b.vline(23, 6, 11, t.lo);
    b.hline(11, 7, 10, dir === 0 ? t.mid : t.hi);
    b.hline(10, 20, 12, t.hi); b.hline(10, 24, 12, t.lo);
    b.vline(9, 25, 4, STEEL.hi); b.vline(21, 25, 4, STEEL.mid);
    if (dir === 0) { b.rrect(8, 16, 16, 8, t.mid, 2); b.hline(9, 16, 14, t.hi); b.hline(9, 23, 14, t.lo); }
  } else {
    // 後腳先畫，座面上緣能看見，前後腳各錯開兩格。
    b.rect(11, 20, 2, 8, STEEL.lo); b.rect(24, 19, 2, 9, STEEL.lo);
    b.rect(8, 22, 2, 8, STEEL.mid); b.vline(8, 23, 6, STEEL.hi);
    b.rect(21, 22, 2, 8, STEEL.mid); b.vline(21, 23, 6, STEEL.hi);
    b.rrect(7, 16, 18, 7, t.lo, 2);
    b.rrect(7, 15, 18, 5, t.mid, 2); b.hline(9, 15, 12, t.hi);
    b.hline(8, 20, 15, t.lo); b.hline(9, 21, 13, t.mid);
    b.rrect(20, 5, 6, 15, t.lo, 2);
    b.rrect(19, 4, 5, 14, t.mid, 2); b.vline(19, 6, 10, t.hi);
    b.hline(20, 4, 3, t.hi); b.vline(22, 7, 8, t.lo);
    if (dir === 3) { const m = new Bmp(32, 32); m.blit(b, 0, 0, true); return outline(m); }
  }
  return outline(b);
}

// ---------------- 地板、牆、門 ----------------
function floor({ kind = 'check' } = {}) {
  const b = new Bmp(32, 32);
  if (kind === 'check') {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const c = (x + y) % 2 ? PINK : CREAM;
      b.rect(x * 16, y * 16, 16, 16, c.mid); b.hline(x * 16, y * 16, 16, c.hi); b.vline(x * 16, y * 16, 16, c.hi);
      b.hline(x * 16, y * 16 + 15, 16, mix(c.mid, -0.10));
      b.vline(x * 16 + 15, y * 16 + 1, 14, mix(c.mid, -0.08));
      b.hline(x * 16 + 3, y * 16 + 3, 5, mix(c.mid, 0.12));
      b.hline(x * 16 + 10, y * 16 + 12, 3, mix(c.mid, -0.035));
    }
  } else if (kind === 'wood') {
    for (let y = 0; y < 4; y++) {
      const off = (y % 2) * 13;
      b.rect(0, y * 8, 32, 8, WOOD.mid); b.hline(0, y * 8, 32, WOOD.hi); b.hline(0, y * 8 + 7, 32, WOOD.lo);
      b.vline((off + 20) % 32, y * 8, 8, WOOD.lo);
      b.vline((off + 21) % 32, y * 8 + 1, 6, WOOD.hi);
      // 木紋以 modulo 回繞，跨 tile 的紋路不會截斷。
      for (let j = 0; j < 12; j++) {
        b.px((off + 3 + j) % 32, y * 8 + 3 + (j > 8 ? 1 : 0), mix(WOOD.mid, -0.09));
        if (j < 7) b.px((off + 8 + j) % 32, y * 8 + 5, mix(WOOD.mid, 0.10));
      }
    }
  } else if (kind === 'mint') {
    b.rect(0, 0, 32, 32, MINT.hi);
    for (let i = 0; i < 32; i += 8) { b.hline(0, i, 32, MINT.mid); b.vline(i, 0, 32, MINT.mid); }
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) {
      b.hline(x + 1, y + 1, 6, mix(MINT.hi, 0.15));
      b.vline(x + 7, y + 2, 6, mix(MINT.hi, -0.06));
      if ((x + y) % 16 === 0) b.hline(x + 3, y + 3, 2, mix(MINT.hi, 0.23));
    }
  }
  return b;
}
function wall({ color = '#9fe3cf', kind = 'plain' } = {}) {
  const b = new Bmp(32, 64), t = tone(color);
  b.rect(0, 0, 32, 40, t.mid);
  for (let x = 2; x < 32; x += 8) b.rect(x, 0, 3, 40, t.hi);                // 直條壁紙
  b.rect(0, 40, 32, 3, CREAM.hi); b.hline(0, 43, 32, CREAM.lo);              // 腰線
  b.rect(0, 44, 32, 17, PINK.mid);                                            // 下半粉紅護牆板
  b.rect(3, 47, 26, 11, PINK.lo); b.rect(4, 48, 24, 9, PINK.mid); b.hline(4, 48, 24, PINK.hi);
  b.rect(0, 61, 32, 3, PINK.dk);
  if (kind === 'window') {
    b.rect(4, 6, 24, 26, '#f4f1fa'); b.rect(6, 8, 20, 22, '#bfe6ff'); b.rect(6, 8, 20, 6, '#d8f1ff');
    b.vline(16, 8, 22, '#f4f1fa'); b.hline(6, 18, 20, '#f4f1fa');
    b.px(8, 10, '#fff'); b.px(9, 10, '#fff'); b.px(8, 11, '#fff'); b.rect(4, 32, 24, 2, CREAM.lo);
  } else if (kind === 'shelf') {
    b.rect(3, 22, 26, 3, WOOD.mid); b.hline(3, 22, 26, WOOD.hi); b.hline(3, 25, 26, WOOD.lo);
    [FLAVORS.mango, FLAVORS.mint, FLAVORS.grape].forEach((c, i) => { const x = 5 + i * 8; b.rect(x, 14, 6, 8, tone(c).mid); b.hline(x, 14, 6, tone(c).hi); b.rect(x + 1, 12, 4, 2, '#f4f1fa'); });
  }
  return b;
}
function door() {
  const b = new Bmp(32, 64);
  b.rect(1, 2, 30, 61, WOOD.mid); b.vline(1, 2, 61, WOOD.hi); b.vline(30, 2, 61, WOOD.lo);
  b.hline(3, 3, 25, WOOD.hi); b.vline(28, 5, 55, WOOD.lo);
  b.hline(5, 38, 21, WOOD.hi);
  b.rect(5, 6, 22, 30, '#bfe6ff'); b.rect(5, 6, 22, 9, '#d8f1ff');
  for (let j = 0; j < 12; j++) b.px(9 + j * 0.5 | 0, 8 + j, '#ffffff88');
  b.rect(5, 40, 22, 18, WOOD.lo); b.rect(6, 41, 20, 16, WOOD.mid); b.hline(6, 41, 20, WOOD.hi);
  b.rect(23, 37, 2, 6, '#ffd84a');                                           // 門把
  // 掛牌:小愛心
  b.rect(10, 20, 12, 9, CREAM.hi); b.hline(10, 28, 12, CREAM.lo);
  b.map(13, 22, ['.11.11.', '1111111', '.11111.', '..111..', '...1...'], { 1: '#ff6f91' });
  return outline(b);
}

// ---------------- 盆栽、垃圾桶 ----------------
function plant({ kind = 'round' } = {}) {
  if (kind === 'tall') {
    const b = new Bmp(32, 64), g = tone('#6cc36a');
    b.rect(10, 48, 12, 14, '#e9d2b6'); b.hline(10, 48, 12, '#f8ead8'); b.rect(10, 59, 12, 3, '#c9ad8c'); b.rect(9, 46, 14, 3, '#f8ead8');
    b.vline(16, 26, 21, '#5a8a3a');
    const leaf = (x, y, rx, ry) => { b.oval(x, y, rx, ry, g.mid); b.oval(x - rx * 0.3, y - ry * 0.3, rx * 0.55, ry * 0.5, g.hi);
      b.hline(x - 2, y + 1, 4, g.lo); b.px(x - 1, y, g.hi); };
    leaf(10, 30, 6, 4); leaf(22, 26, 6, 4); leaf(12, 18, 6, 4); leaf(21, 12, 5, 4); leaf(15, 6, 4, 4); leaf(20, 38, 5, 3);
    return outline(b);
  }
  const b = new Bmp(32, 48), g = tone('#6cc36a');
  b.rect(8, 32, 16, 13, PINK.mid); b.vline(8, 32, 13, PINK.hi); b.hline(8, 44, 16, PINK.lo); b.rect(7, 30, 18, 3, PINK.hi);
  b.oval(16, 20, 12, 11, g.lo); b.oval(15, 18, 11, 10, g.mid);
  for (const [x, y] of [[9, 13], [14, 10], [20, 14], [11, 20], [18, 21], [22, 19]]) { b.oval(x, y, 3, 2.5, g.hi); }
  for (const [x, y] of [[12, 16], [19, 12], [16, 23]]) { b.px(x, y, '#ffd0e0'); b.px(x + 1, y, '#ff8fb1'); }   // 小花
  return outline(b);
}
function bin() {
  const b = new Bmp(24, 32);
  b.rect(3, 9, 18, 21, STEEL.mid); b.vline(3, 9, 21, STEEL.hi); b.vline(20, 9, 21, STEEL.lo);
  for (let x = 6; x < 19; x += 4) b.vline(x, 12, 15, STEEL.lo);
  b.rrect(2, 5, 20, 5, PINK.mid, 2); b.hline(3, 5, 18, PINK.hi); b.rect(9, 2, 6, 3, PINK.lo);
  return outline(b);
}

// ---------------- 雪糕本身 ----------------
/** 甜筒:scoops 是 1~3 個口味色 */
function cone({ scoops = [FLAVORS.strawberry] } = {}) {
  const n = Math.max(1, Math.min(3, scoops.length));
  const height = 16 + n * 6; // KIT 的 22 / 28 / 34，包含外框留白。
  const b = new Bmp(16, height), top = height - 15;
  for (let y = 0; y < 12; y++) { const w = Math.max(1, Math.round(5 - y * 0.4)); b.rect(8 - w, top + 1 + y, w * 2, 1, y % 3 ? '#e3a85e' : '#cf9046'); }
  b.px(6, top + 4, '#a86e32'); b.px(9, top + 6, '#a86e32'); b.px(7, top + 8, '#a86e32');
  scoops.slice(0, 3).forEach((c, i) => scoop(b, 8, top - i * 6, 5, c));
  return outline(b);
}
/** 杯裝 */
function cup({ scoops = [FLAVORS.mint, FLAVORS.vanilla], color = '#ff9fbe' } = {}) {
  const b = new Bmp(20, 22), t = tone(color);
  scoops.slice(0, 2).forEach((c, i) => scoop(b, 7 + i * 6, 9 - i, 4.5, c));
  b.rect(3, 12, 14, 8, t.mid); b.hline(3, 12, 14, t.hi); b.hline(4, 19, 12, t.lo); b.vline(3, 12, 7, t.hi);
  b.hline(6, 15, 5, t.hi); b.hline(7, 16, 3, t.hi);
  b.vline(15, 14, 5, t.lo);
  b.rect(2, 11, 16, 2, '#f4f1fa');
  b.vline(15, 3, 9, '#ffd84a'); b.px(15, 2, '#ffd84a');            // 小湯匙
  return outline(b);
}

/** 清單:預覽頁與匯出工具都讀這個 */
export const KIT = {
  freezer: { w: 96, h: 64, tags: ['雪糕店', '家具'], make: freezer },
  counter: { w: 64, h: 48, tags: ['雪糕店', '家具'], make: counter },
  counter_pink: { w: 64, h: 48, tags: ['雪糕店', '家具'], make: () => counter({ color: '#ffb3c9' }) },
  register: { w: 32, h: 32, tags: ['雪糕店', '小物'], make: register },
  menu_board: { w: 64, h: 40, tags: ['雪糕店', '牆面'], make: menuBoard },
  cone_sign: { w: 32, h: 48, tags: ['雪糕店', '牆面'], make: coneSign },
  awning: { w: 32, h: 16, tags: ['雪糕店', '牆面', '可接續'], make: awning },
  awning_mint: { w: 32, h: 16, tags: ['雪糕店', '牆面', '可接續'], make: () => awning({ color: '#9fe3cf' }) },
  table: { w: 32, h: 32, tags: ['家具'], make: table },
  chair_down: { w: 32, h: 32, tags: ['家具'], make: () => chair({ dir: 0 }) },
  chair_up: { w: 32, h: 32, tags: ['家具'], make: () => chair({ dir: 1 }) },
  chair_left: { w: 32, h: 32, tags: ['家具'], make: () => chair({ dir: 2 }) },
  chair_right: { w: 32, h: 32, tags: ['家具'], make: () => chair({ dir: 3 }) },
  floor_check: { w: 32, h: 32, tags: ['地板', '可接續'], make: () => floor({ kind: 'check' }) },
  floor_wood: { w: 32, h: 32, tags: ['地板', '可接續'], make: () => floor({ kind: 'wood' }) },
  floor_mint: { w: 32, h: 32, tags: ['地板', '可接續'], make: () => floor({ kind: 'mint' }) },
  wall: { w: 32, h: 64, tags: ['牆面', '可接續'], make: () => wall() },
  wall_window: { w: 32, h: 64, tags: ['牆面'], make: () => wall({ kind: 'window' }) },
  wall_shelf: { w: 32, h: 64, tags: ['牆面'], make: () => wall({ kind: 'shelf' }) },
  wall_pink: { w: 32, h: 64, tags: ['牆面', '可接續'], make: () => wall({ color: '#ffc6d6' }) },
  door: { w: 32, h: 64, tags: ['牆面'], make: door },
  plant_round: { w: 32, h: 48, tags: ['裝飾'], make: () => plant({ kind: 'round' }) },
  plant_tall: { w: 32, h: 64, tags: ['裝飾'], make: () => plant({ kind: 'tall' }) },
  bin: { w: 24, h: 32, tags: ['小物'], make: bin },
  cone_1: { w: 16, h: 22, tags: ['雪糕'], make: () => cone({ scoops: [FLAVORS.strawberry] }) },
  cone_2: { w: 16, h: 28, tags: ['雪糕'], make: () => cone({ scoops: [FLAVORS.chocolate, FLAVORS.vanilla] }) },
  cone_3: { w: 16, h: 34, tags: ['雪糕'], make: () => cone({ scoops: [FLAVORS.mint, FLAVORS.mango, FLAVORS.grape] }) },
  cup: { w: 20, h: 22, tags: ['雪糕'], make: cup },
};
export { cone, cup, freezer, counter, chair, wall, floor, plant, awning };
