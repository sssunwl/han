/* ============================================================
   pixelkit 攝影棚:第三批「AI 媒體公司」(AI 明星養成用)
   攝影機、補光燈、綠幕、麥克風、Podcast 桌、直播桌、練舞鏡、舞台、沙發、大螢幕、
   獎盃櫃、霓虹招牌、行程白板,外加 Q 版小人頭上的小配件。
   畫風照 furniture.js:俯視斜 3/4、32px 一格、outline() 自動描邊、tone() 三階色,光從左上來。
   全部是這裡的程式畫的,沒有描任何外部素材。
   ============================================================ */
import { Bmp, outline, tone, mix, OUTLINE } from './core.js';

const STEEL = tone('#b9c2d6'), DARK = tone('#4a4560'), BLACK = tone('#3a3548'), WOOD = tone('#c98a55');
const WHITE = tone('#f4f1fa'), PINK = tone('#ff8fb1'), CYAN = tone('#6fe0ff'), PURPLE = tone('#9a7bff'), GOLD = tone('#ffd25a');
const GREEN = tone('#5fd68a');

/** 3/4 視角的箱子:上面一條亮面(topH 高)、正面本色、底下一條陰影(跟 furniture.js 同一套) */
function box(b, x, y, w, h, topH, t, front = t) {
  b.rect(x, y, w, topH, t.hi);
  b.hline(x, y + topH, w, t.lo);
  b.rect(x, y + topH + 1, w, h - topH - 1, front.mid);
  b.vline(x, y + topH + 1, h - topH - 2, front.hi);
  b.hline(x, y + h - 1, w, front.lo);
}
/** 三腳架 */
function tripod(b, cx, top, bot) {
  b.vline(cx, top, bot - top - 4, DARK.mid); b.vline(cx + 1, top, bot - top - 4, DARK.lo);
  for (let i = 0; i < 6; i++) { b.px(cx - 1 - i, bot - 5 + i, DARK.mid); b.px(cx + 2 + i, bot - 5 + i, DARK.lo); }
  b.vline(cx, bot - 4, 4, DARK.lo);
}

// ---------------- 地板 ----------------
function floor({ kind = 'studio' } = {}) {
  const b = new Bmp(32, 32);
  if (kind === 'studio') {                     // 灰藍色攝影棚地板,大塊磁磚 + 細縫
    const t = tone('#8d93b8');
    b.rect(0, 0, 32, 32, t.mid);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      b.hline(x * 16, y * 16, 16, mix(t.mid, 0.08)); b.vline(x * 16, y * 16, 16, mix(t.mid, 0.08));
      b.hline(x * 16, y * 16 + 15, 16, t.lo); b.vline(x * 16 + 15, y * 16 + 1, 14, mix(t.mid, -0.1));
      b.hline(x * 16 + 3, y * 16 + 3, 4, mix(t.mid, 0.16));
    }
  } else if (kind === 'carpet') {             // 紫色地毯(休息區),小點點
    const t = tone('#7d6bc4');
    b.rect(0, 0, 32, 32, t.mid);
    for (let y = 2; y < 32; y += 6) for (let x = (y % 12 ? 1 : 4); x < 32; x += 6) { b.px(x, y, t.hi); b.px(x + 1, y + 1, t.lo); }
  } else if (kind === 'stage') {              // 舞台木地板,深色亮漆
    const t = tone('#7a4a3a');
    for (let y = 0; y < 4; y++) {
      const off = (y % 2) * 11;
      b.rect(0, y * 8, 32, 8, t.mid); b.hline(0, y * 8, 32, t.hi); b.hline(0, y * 8 + 7, 32, t.lo);
      b.vline((off + 18) % 32, y * 8, 8, t.lo);
      for (let j = 0; j < 8; j++) b.px((off + 4 + j) % 32, y * 8 + 3, mix(t.mid, 0.1));
    }
  } else if (kind === 'wood') {
    for (let y = 0; y < 4; y++) {
      const off = (y % 2) * 13;
      b.rect(0, y * 8, 32, 8, WOOD.mid); b.hline(0, y * 8, 32, WOOD.hi); b.hline(0, y * 8 + 7, 32, WOOD.lo);
      b.vline((off + 20) % 32, y * 8, 8, WOOD.lo);
      for (let j = 0; j < 10; j++) b.px((off + 3 + j) % 32, y * 8 + 3, mix(WOOD.mid, -0.09));
    }
  }
  return b;
}

// ---------------- 牆 ----------------
function wall({ color = '#5b5f9e', kind = 'plain' } = {}) {
  const b = new Bmp(32, 64), t = tone(color);
  b.rect(0, 0, 32, 46, t.mid);
  for (let y = 4; y < 46; y += 10) b.hline(0, y, 32, mix(t.mid, 0.06));     // 吸音板的橫紋
  for (let x = 0; x < 32; x += 16) b.vline(x, 0, 46, t.lo);
  b.rect(0, 46, 32, 3, '#2f2c48'); b.hline(0, 46, 32, mix('#2f2c48', 0.2));   // 踢腳板
  b.rect(0, 49, 32, 15, mix(t.mid, -0.25));
  b.hline(0, 49, 32, mix(t.mid, -0.1));
  if (kind === 'window') {
    b.rect(4, 6, 24, 28, '#e9e4f5'); b.rect(6, 8, 20, 24, '#2b3a78');
    b.rect(6, 8, 20, 8, '#3f4f96');
    for (const [x, y] of [[9, 11], [20, 10], [14, 19], [23, 24], [8, 26]]) b.px(x, y, '#fff6c0');   // 夜景的星星
    b.rect(8, 24, 4, 8, '#1f2a5a'); b.rect(13, 21, 5, 11, '#1f2a5a'); b.rect(19, 26, 6, 6, '#1f2a5a');
    b.px(14, 23, '#ffd25a'); b.px(16, 25, '#ffd25a'); b.px(9, 26, '#ffd25a');
    b.vline(16, 8, 24, '#e9e4f5');
  } else if (kind === 'poster') {
    b.rect(7, 8, 18, 24, WHITE.hi); b.rect(8, 9, 16, 22, PINK.hi);
    star(b, 16, 17, 5, GOLD.mid, GOLD.hi);
    b.hline(10, 26, 12, WHITE.mid); b.hline(12, 28, 8, WHITE.mid);
  }
  return b;
}
/** 五角星(實心,小尺寸也看得出來):點在星形多邊形裡就塗 */
function star(b, cx, cy, r, c, hi) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + 0.5 + Math.cos(a) * rr, cy + 0.5 + Math.sin(a) * rr]); }
  const inside = (x, y) => { let k = false; for (let i = 0, j = 9; i < 10; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) k = !k; } return k; };
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (inside(x + 0.5, y + 0.5)) b.px(x, y, c);
  if (hi) { b.px(cx - 1, cy - 1, hi); b.px(cx, cy - 2, hi); }
}

// ---------------- 攝影機(三腳架) ----------------
function camera() {
  const b = new Bmp(32, 48);
  tripod(b, 15, 22, 46);
  b.rect(6, 10, 18, 12, BLACK.mid); b.rect(6, 10, 18, 3, BLACK.hi); b.hline(6, 21, 18, BLACK.lo);
  b.rect(23, 12, 6, 8, DARK.mid); b.rect(28, 13, 2, 6, '#7fd3ff');               // 鏡頭(朝右前方)
  b.px(28, 14, '#ffffff');
  b.rect(9, 6, 8, 4, BLACK.lo); b.rect(10, 7, 6, 2, '#7fd3ff');                  // 上面的小螢幕
  b.rect(8, 15, 3, 3, '#ff4f5e'); b.px(8, 15, '#ffb3ba');                        // 錄影紅燈
  b.hline(12, 18, 8, BLACK.lo);
  return outline(b);
}

// ---------------- 補光燈(環形燈) ----------------
function ringLight() {
  const b = new Bmp(32, 48);
  tripod(b, 15, 22, 46);
  b.oval(16, 12, 10, 10, '#fff6d8'); b.oval(16, 12, 7, 7, '#00000000');
  for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {                     // 中間挖空
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 12);
    if (d < 6.5) b.d[(y * 32 + x) * 4 + 3] = 0;
    else if (d < 10.5) b.px(x, y, d < 8 ? '#ffffff' : (x < 16 && y < 12 ? '#fffbe8' : '#f2e3b0'));
  }
  b.rect(14, 18, 4, 4, DARK.mid);                                                  // 夾手機的座
  b.rect(13, 10, 6, 9, BLACK.mid); b.rect(14, 11, 4, 6, '#8fd3ff');               // 手機
  return outline(b);
}

// ---------------- 綠幕 ----------------
function greenScreen() {
  const b = new Bmp(64, 64);
  b.vline(3, 2, 60, STEEL.mid); b.vline(4, 2, 60, STEEL.lo);
  b.vline(59, 2, 60, STEEL.mid); b.vline(60, 2, 60, STEEL.lo);
  b.rect(2, 2, 60, 3, STEEL.hi); b.hline(2, 4, 60, STEEL.lo);
  b.rect(6, 5, 52, 44, GREEN.mid);
  for (let x = 10; x < 56; x += 9) b.vline(x, 6, 42, GREEN.hi);                   // 布的皺褶
  for (let x = 14; x < 56; x += 9) b.vline(x, 8, 38, GREEN.lo);
  b.rect(6, 49, 52, 8, GREEN.lo); b.hline(6, 49, 52, mix(GREEN.mid, 0.1));        // 下面鋪到地上
  b.rect(6, 57, 52, 3, GREEN.dk);
  for (const x of [1, 57]) { b.rect(x, 60, 6, 3, DARK.mid); }
  return outline(b);
}

// ---------------- 麥克風架 ----------------
function micStand() {
  const b = new Bmp(32, 48);
  b.vline(15, 14, 28, DARK.mid); b.vline(16, 14, 28, DARK.lo);
  b.oval(16, 44, 7, 2.2, DARK.mid); b.hline(10, 43, 8, DARK.hi);
  for (let i = 0; i < 6; i++) b.px(16 + i, 14 - i, DARK.mid);                       // 斜臂
  b.oval(23, 6, 3.6, 4.4, STEEL.mid);                                              // 麥克風頭(網)
  for (let y = 3; y < 10; y += 2) b.hline(21, y, 4, STEEL.lo);
  b.px(21, 4, STEEL.hi); b.px(22, 3, STEEL.hi);
  b.rect(21, 10, 4, 3, BLACK.mid);
  return outline(b);
}

// ---------------- Podcast 桌(兩支麥克風 + 耳機) ----------------
function podcastDesk() {
  const b = new Bmp(64, 48);
  box(b, 1, 18, 62, 26, 10, WOOD, tone('#8a5a3c'));
  b.hline(3, 19, 40, mix(WOOD.hi, 0.2));
  for (const x of [14, 46]) {                                                       // 桌上的麥克風
    b.rect(x - 1, 14, 3, 8, DARK.mid); b.oval(x, 9, 3.6, 4.4, STEEL.mid);
    for (let y = 6; y < 13; y += 2) b.hline(x - 2, y, 4, STEEL.lo);
    b.px(x - 2, 7, STEEL.hi);
    b.oval(x + 1, 25, 6, 2, '#00000030');
  }
  // 耳機放桌上
  b.rect(26, 22, 2, 4, PINK.mid); b.rect(35, 22, 2, 4, PINK.mid);
  b.hline(27, 21, 9, PINK.lo);
  // 正面「ON AIR」小燈
  b.rect(24, 34, 16, 6, '#3a1e2a'); b.rect(25, 35, 14, 4, '#ff4f5e'); b.hline(26, 36, 4, '#ffd1d6');
  b.rect(1, 42, 62, 2, mix('#8a5a3c', -0.3));
  return outline(b);
}

// ---------------- 直播桌(螢幕 + 鍵盤 + 小補光) ----------------
function streamDesk() {
  const b = new Bmp(64, 48);
  box(b, 1, 22, 62, 22, 9, WHITE, tone('#b6a8e8'));
  // 螢幕
  b.rect(16, 3, 30, 19, BLACK.mid); b.rect(18, 5, 26, 14, '#2b2550');
  b.rect(18, 5, 26, 3, '#ff5e8a');                                                 // 直播中標題列
  b.px(19, 6, '#ffffff'); b.px(20, 6, '#ffffff');
  b.map(25, 9, ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...'], { 1: '#ff8fb1' });   // 愛心
  for (let i = 0; i < 4; i++) b.hline(35, 10 + i * 2, 6 - i, '#9df0c8');            // 留言
  b.rect(29, 22, 4, 2, BLACK.lo);
  // 鍵盤與小燈
  b.rect(19, 25, 22, 4, DARK.mid); for (let x = 20; x < 40; x += 2) b.px(x, 26, '#b9c2d6');
  b.rect(5, 12, 7, 7, '#fff6d8'); b.rect(7, 14, 3, 3, '#ffffff'); b.vline(8, 19, 5, DARK.mid);   // 小補光
  b.rect(48, 21, 6, 5, PINK.mid); b.hline(48, 21, 6, PINK.hi);                      // 桌上的杯子
  b.rect(54, 22, 2, 2, PINK.lo);
  for (let x = 4; x < 60; x += 12) b.px(x, 38, mix('#b6a8e8', 0.3));
  return outline(b);
}

// ---------------- 練舞鏡(掛牆 + 扶桿) ----------------
function danceMirror() {
  const b = new Bmp(64, 64);
  b.rect(2, 4, 60, 44, STEEL.hi);
  b.rect(4, 6, 56, 40, '#cfe9ff'); b.rect(4, 6, 56, 10, '#e3f3ff');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 30; j++) {                        // 斜斜的反光
    b.px(10 + i * 18 + (j * 0.5 | 0), 8 + j, '#ffffff99');
    b.px(12 + i * 18 + (j * 0.5 | 0), 8 + j, '#ffffff55');
  }
  b.vline(32, 6, 40, STEEL.lo);
  b.rect(0, 50, 64, 3, WOOD.mid); b.hline(0, 50, 64, WOOD.hi); b.hline(0, 52, 64, WOOD.lo);   // 扶桿
  for (const x of [6, 56]) b.rect(x, 48, 2, 10, STEEL.mid);
  return outline(b);
}

// ---------------- 舞台(地上的一塊,前緣有燈) ----------------
function stage({ w = 96 } = {}) {
  const h = 56, b = new Bmp(w, h), t = tone('#7a4a3a');
  b.rect(1, 1, w - 2, 40, t.mid);
  for (let y = 1; y < 41; y += 8) { b.hline(1, y, w - 2, t.hi); b.hline(1, y + 7, w - 2, t.lo); }
  for (let y = 1; y < 41; y += 8) for (let x = (y % 16 ? 9 : 25); x < w - 2; x += 32) b.vline(x, y, 8, t.lo);
  b.oval(w / 2, 22, w / 3, 12, '#fff6c040');                                        // 聚光燈照到的地方
  b.rect(1, 41, w - 2, 12, PURPLE.mid); b.hline(1, 41, w - 2, PURPLE.hi); b.hline(1, 52, w - 2, PURPLE.dk);
  for (let x = 6; x < w - 4; x += 12) { b.rect(x, 44, 5, 5, GOLD.hi); b.px(x + 1, 45, '#ffffff'); }   // 前緣小燈
  return outline(b);
}

// ---------------- 沙發 ----------------
function sofa({ color = '#ff8fb1' } = {}) {
  const b = new Bmp(64, 40), t = tone(color);
  box(b, 2, 2, 60, 16, 4, t);                                                       // 椅背
  b.rect(1, 12, 10, 22, t.mid); b.vline(1, 12, 22, t.hi); b.hline(1, 12, 10, t.hi); // 扶手
  b.rect(53, 12, 10, 22, t.lo); b.hline(53, 12, 10, t.mid);
  b.rect(11, 18, 42, 12, t.hi); b.hline(11, 29, 42, t.lo); b.vline(32, 18, 12, t.lo);   // 坐墊
  b.rect(11, 30, 42, 4, t.lo);
  b.rect(4, 34, 4, 4, '#4a3f58'); b.rect(56, 34, 4, 4, '#4a3f58');
  b.rect(15, 14, 8, 7, '#ffd25a'); b.hline(15, 14, 8, mix('#ffd25a', 0.3));          // 抱枕
  return outline(b);
}

// ---------------- 牆上大螢幕(趨勢圖) ----------------
function bigScreen() {
  const b = new Bmp(64, 48);
  b.rect(1, 1, 62, 40, BLACK.mid); b.hline(1, 1, 62, BLACK.hi);
  b.rect(4, 4, 56, 32, '#1d2050');
  for (let x = 6; x < 58; x += 8) b.vline(x, 6, 28, '#2a2e66');
  const pts = [30, 27, 28, 22, 24, 17, 19, 12];
  pts.forEach((y, i) => { if (i) for (let k = 0; k <= 7; k++) b.px(6 + (i - 1) * 7 + k, Math.round(pts[i - 1] + (y - pts[i - 1]) * k / 7), '#6fe0ff'); });
  b.rect(53, 9, 3, 3, '#ffd25a');                                                   // 最高點的星
  b.rect(6, 6, 10, 3, '#ff5e8a'); b.rect(18, 6, 6, 3, '#9df0c8');
  b.rect(28, 41, 8, 4, BLACK.lo); b.rect(22, 45, 20, 2, BLACK.mid);
  return outline(b);
}

// ---------------- 獎盃櫃 ----------------
function trophyCase({ n = 3 } = {}) {
  const b = new Bmp(32, 56);
  box(b, 1, 1, 30, 52, 4, WOOD);
  b.rect(4, 7, 24, 42, '#e8f4ff'); b.rect(4, 7, 24, 3, '#c9def2');
  for (let s = 0; s < 3; s++) b.rect(4, 20 + s * 13, 24, 2, WOOD.lo);
  const slots = [[10, 12], [20, 12], [10, 25], [20, 25], [10, 38], [20, 38]];
  slots.slice(0, n).forEach(([x, y], i) => {
    const c = i % 3 === 2 ? tone('#c9d2e8') : GOLD;
    b.rect(x - 3, y - 4, 6, 4, c.mid); b.px(x - 3, y - 4, c.hi); b.px(x - 4, y - 3, c.mid); b.px(x + 3, y - 3, c.mid);
    b.rect(x - 1, y, 2, 3, c.lo); b.rect(x - 3, y + 3, 6, 2, c.lo);
  });
  for (let j = 0; j < 20; j++) b.px(7 + (j * 0.4 | 0), 9 + j * 2, '#ffffff88');
  return outline(b);
}

// ---------------- 霓虹招牌 ----------------
function neonSign({ color = '#ff5ec4' } = {}) {
  const b = new Bmp(64, 28), t = tone(color);
  b.rect(1, 1, 62, 26, '#2a2140'); b.hline(1, 1, 62, '#3a2f56');
  b.oval(32, 14, 26, 9, mix(color, -0.55) + '80');                                  // 光暈
  star(b, 12, 14, 6, t.hi, '#ffffff');
  // 「AI」兩個字母
  b.map(24, 8, ['.111..1', '1...1.1', '11111.1', '1...1.1', '1...1.1'], { 1: CYAN.hi });
  b.map(37, 7, ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...'], { 1: t.hi });     // 愛心
  b.px(38, 8, '#ffffff');
  b.hline(24, 16, 22, t.mid); b.hline(26, 19, 18, mix(color, 0.4));
  star(b, 52, 14, 5, CYAN.hi, '#ffffff');
  return outline(b);
}

// ---------------- 行程白板 ----------------
function scheduleBoard() {
  const b = new Bmp(64, 40);
  b.rect(1, 1, 62, 34, STEEL.hi); b.rect(3, 3, 58, 30, '#fbfbff');
  for (let i = 1; i < 5; i++) b.vline(3 + i * 12, 3, 30, '#d9dcf0');
  const notes = ['#ffd25a', '#ff8fb1', '#9df0c8', '#8fd3ff', '#c6a2ff'];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) if ((i + j) % 3 !== 1) {
    b.rect(5 + i * 12, 6 + j * 13, 8, 8, notes[(i + j * 2) % 5]); b.hline(6 + i * 12, 8 + j * 13, 5, '#00000030');
  }
  b.rect(8, 35, 48, 2, STEEL.lo); b.rect(40, 34, 8, 2, '#5a8aff');                  // 筆槽
  return outline(b);
}

// ---------------- 盆栽(小) ----------------
function plant() {
  const b = new Bmp(32, 40), g = tone('#6cc36a');
  b.rect(10, 26, 12, 12, '#f4f1fa'); b.hline(10, 26, 12, '#ffffff'); b.rect(10, 35, 12, 3, '#cfc8e0');
  b.oval(16, 16, 9, 9, g.mid); b.oval(13, 13, 5, 5, g.hi); b.oval(19, 20, 5, 4, g.lo);
  for (const [x, y] of [[9, 9], [22, 11], [16, 6], [12, 21]]) b.oval(x, y, 3, 3, g.mid);
  return outline(b);
}

// ---------------- 聚光燈(吊在天花板,畫在牆上方) ----------------
function spotlight() {
  const b = new Bmp(16, 20);
  b.vline(7, 0, 5, DARK.mid);
  b.rect(3, 5, 10, 8, BLACK.mid); b.hline(3, 5, 10, BLACK.hi);
  b.rect(4, 13, 8, 3, GOLD.hi); b.hline(5, 14, 6, '#ffffff');
  return outline(b);
}

// ---------------- 機器人小助手(公司吉祥物,裝飾) ----------------
function robot() {
  const b = new Bmp(24, 32);
  b.vline(12, 2, 4, DARK.mid); b.rect(11, 0, 3, 3, '#ff5e8a');
  b.rect(4, 6, 16, 12, WHITE.mid); b.hline(4, 6, 16, WHITE.hi); b.vline(19, 7, 11, WHITE.lo);
  b.rect(6, 9, 12, 6, '#2b2550'); b.rect(8, 11, 2, 2, CYAN.hi); b.rect(14, 11, 2, 2, CYAN.hi);
  b.rect(7, 19, 10, 8, WHITE.mid); b.vline(16, 19, 8, WHITE.lo); b.rect(10, 21, 4, 3, PINK.mid);
  b.rect(4, 20, 2, 5, WHITE.lo); b.rect(18, 20, 2, 5, WHITE.lo);
  b.oval(12, 29, 5, 1.6, DARK.mid);
  return outline(b);
}

/* ============================================================
   頭上的小配件:跟角色同一個 24×32 格子,直接疊在 makeFrame 的圖上面。
   對齊 character.js 現在的比例(頭頂約 y=4、眼睛 y=14、臉寬 x=4~20)。
   ============================================================ */
export const ACCESSORIES = ['headphones', 'crown', 'starclip', 'glasses', 'cap', 'bow', 'antenna', 'halo'];
export const ACC_NAMES = { headphones: '耳機', crown: '小皇冠', starclip: '星星髮夾', glasses: '圓眼鏡', cap: '棒球帽', bow: '蝴蝶結', antenna: 'AI 天線', halo: '光環' };
function accessory(kind, color = '#ff8fb1') {
  const b = new Bmp(24, 32), t = tone(color);
  switch (kind) {
    case 'headphones':
      for (let x = 5; x <= 18; x++) { const y = 4 - Math.round(Math.sin((x - 4.5) / 14.5 * Math.PI) * 3); b.px(x, y, t.mid); b.px(x, y + 1, t.lo); }
      b.rect(2, 11, 3, 6, t.mid); b.vline(2, 11, 6, t.hi); b.rect(19, 11, 3, 6, t.lo); b.vline(19, 11, 6, t.mid);
      b.vline(4, 5, 6, t.lo); b.vline(19, 5, 6, t.lo);
      break;
    case 'crown':
      b.rect(8, 3, 8, 3, GOLD.mid); b.hline(8, 5, 8, GOLD.lo);
      for (const x of [8, 11, 12, 15]) b.px(x, 2, GOLD.mid);
      b.px(8, 1, GOLD.hi); b.px(15, 1, GOLD.hi); b.px(11, 1, GOLD.hi); b.px(12, 1, GOLD.hi);
      b.px(10, 4, color); b.px(13, 4, color); b.px(9, 3, GOLD.hi);
      break;
    case 'starclip':
      star(b, 17, 5, 3, GOLD.mid, '#ffffff');
      break;
    case 'glasses':
      for (const x0 of [5, 13]) { b.rect(x0, 12, 6, 1, OUTLINE); b.rect(x0, 16, 6, 1, OUTLINE); b.vline(x0, 13, 3, OUTLINE); b.vline(x0 + 5, 13, 3, OUTLINE); b.px(x0 + 1, 13, '#ffffffaa'); }
      b.hline(11, 13, 2, OUTLINE);
      return b;                                                                      // 眼鏡不描外框(本身就是線)
    case 'cap':
      for (let y = 1; y <= 7; y++) { const w = Math.round(Math.sqrt(1 - ((7 - y) / 7) ** 2) * 9); b.hline(12 - w, y, w * 2, y < 3 ? t.hi : t.mid); }
      b.rect(5, 7, 14, 2, t.lo); b.rect(9, 9, 10, 1, t.dk);                          // 帽沿
      b.px(12, 1, '#ffffff');
      break;
    case 'bow':
      b.map(3, 2, ['11...11', '111.111', '1111111', '111.111', '11...11'], { 1: t.mid });
      b.px(6, 4, t.lo); b.px(4, 3, t.hi); b.px(3, 2, t.hi);
      break;
    case 'antenna':
      b.vline(12, 0, 5, '#9aa3c0'); b.vline(13, 1, 4, '#6a7090');
      b.rect(11, 0, 3, 2, color); b.px(11, 0, '#ffffff');
      break;
    case 'halo':
      for (let x = 6; x <= 17; x++) { const dy = Math.round(Math.sin((x - 5.5) / 12.5 * Math.PI) * 1.4); b.px(x, 1 - dy + 1, GOLD.hi); b.px(x, 3 + dy - 1, GOLD.mid); }
      b.px(6, 2, GOLD.hi); b.px(17, 2, GOLD.mid);
      return b;
  }
  return outline(b);
}
const accCache = new Map();
export function makeAccessory(kind, color) {
  const k = kind + '|' + color;
  if (!accCache.has(k)) accCache.set(k, accessory(kind, color));
  return accCache.get(k);
}

// 公司大樓用具：沿用三階色與像素描邊。
function bed({ bunk = false } = {}) {
  const b=new Bmp(bunk?64:32,48);
  for(const [x,y] of (bunk?[[3,5],[29,25]]:[[2,19]])) {
    box(b,x,y,28,18,4,WOOD); b.rect(x+2,y+2,24,10,WHITE.mid);
    b.rect(x+3,y+2,8,7,WHITE.hi); b.rect(x+11,y+3,14,10,CYAN.mid); b.hline(x+12,y+4,12,CYAN.hi);
    b.rect(x,y+15,3,8,WOOD.lo);b.rect(x+25,y+15,3,8,WOOD.lo);
  }
  if(bunk) {b.rect(3,2,3,41,WOOD.mid);b.rect(56,2,3,43,WOOD.lo);for(let y=12;y<44;y+=7)b.hline(49,y,9,WOOD.hi);}
  return outline(b);
}
function diningTable() {
  const b=new Bmp(64,32);box(b,2,6,60,12,5,WOOD);b.rect(8,16,4,13,WOOD.lo);b.rect(52,16,4,13,WOOD.lo);
  box(b,3,23,58,5,2,WOOD);box(b,3,1,58,4,2,WOOD); return outline(b);
}
function bowl() {
  const b=new Bmp(12,10);b.hline(1,4,10,WHITE.hi);b.rect(2,5,8,3,CYAN.mid);b.hline(4,8,4,CYAN.lo);
  b.vline(4,0,3,WHITE.mid);b.vline(8,1,2,WHITE.hi);return outline(b);
}
function foodCounter() {
  const b=new Bmp(64,48);box(b,2,20,60,26,6,CYAN);b.rect(3,5,3,17,STEEL.mid);b.rect(58,5,3,17,STEEL.lo);box(b,1,3,62,5,2,WHITE);
  for(let x=10;x<55;x+=15){b.rect(x,21,12,5,STEEL.lo);b.rect(x+2,21,8,3,GOLD.mid);} b.blit(bowl(),40,12);return outline(b);
}
function fridge() {
  const b=new Bmp(32,64);box(b,3,2,26,59,5,WHITE);b.hline(4,25,24,STEEL.lo);b.rect(23,13,2,9,DARK.mid);b.rect(23,32,2,14,DARK.mid);b.rect(8,8,8,6,CYAN.mid);return outline(b);
}
function massageChair() {
  const b=new Bmp(32,40);box(b,6,2,20,26,6,PURPLE);box(b,3,23,26,10,4,PURPLE);box(b,1,17,6,16,3,DARK);box(b,25,17,6,16,3,DARK);b.rect(7,34,18,4,BLACK.mid);b.rect(8,7,16,10,PURPLE.lo);return outline(b);
}
function footBath() {
  const b=new Bmp(32,24);box(b,2,5,28,16,5,WOOD);b.rect(5,7,22,7,CYAN.mid);b.hline(8,8,7,CYAN.hi);return outline(b);
}
function speaker() {
  const b=new Bmp(32,48);box(b,4,2,24,43,4,BLACK);for(const [y,r] of [[14,6],[32,8]]) {b.rect(16-r,y-r,r*2,r*2,DARK.mid);b.rect(13,y-3,6,6,STEEL.lo);}b.px(23,6,GREEN.hi);return outline(b);
}
function elevatorDoor({open=0}={}) {
  const b=new Bmp(32,64);box(b,1,1,30,62,3,DARK);b.rect(4,8,24,52,BLACK.lo);
  const w=Math.round(12*(1-Math.max(0,Math.min(1,open))));
  if(w){b.rect(4,9,w,50,STEEL.mid);b.rect(28-w,9,w,50,STEEL.lo);b.vline(5,10,48,STEEL.hi);}
  b.rect(12,3,8,3,GREEN.mid);b.px(30,32,GOLD.hi);return outline(b);
}
function reception() {
  const b=new Bmp(64,48);box(b,2,20,60,26,7,WOOD);b.rect(9,30,46,9,PURPLE.mid);box(b,23,7,20,14,2,DARK);b.rect(26,9,14,7,CYAN.mid);b.rect(7,15,11,5,WHITE.hi);return outline(b);
}
function clapper() { const b=new Bmp(12,12);b.rect(1,4,10,7,BLACK.mid);b.rect(1,1,10,3,WHITE.mid);for(let x=2;x<11;x+=4)b.rect(x,1,2,3,BLACK.mid);b.hline(3,7,6,WHITE.mid);return outline(b); }
function micHand() {const b=new Bmp(8,10);b.rect(2,1,5,4,STEEL.mid);b.rect(3,5,2,5,BLACK.mid);b.px(3,1,WHITE.hi);return outline(b);}
function notes() {const b=new Bmp(8,8);b.vline(4,0,6,CYAN.mid);b.hline(4,0,4,CYAN.mid);b.rect(1,5,4,3,PINK.mid);return outline(b);}
function roofSign() {const b=new Bmp(96,24);box(b,1,1,94,20,3,PURPLE);b.rect(4,5,88,12,DARK.lo);b.rect(13,21,4,3,STEEL.mid);b.rect(79,21,4,3,STEEL.mid);return outline(b);}

// 公司第二階段家具，沿用 Bmp 與既有木框、金屬配色。
function officeProp(kind,w,h) {
 const b=new Bmp(w,h);
 if(kind==='vanity'||kind==='full_mirror') {
  box(b,3,2,w-6,h-18,3,WOOD);b.rect(6,5,w-12,h-25,CYAN.mid);b.hline(8,7,w-17,WHITE.hi);
  if(kind==='vanity') {box(b,1,h-19,w-2,8,3,WOOD);for(let y=5;y<h-20;y+=7){b.rect(3,y,2,2,GOLD.hi);b.rect(w-5,y,2,2,GOLD.hi);}}
  b.rect(5,h-11,3,10,WOOD.lo);b.rect(w-8,h-11,3,10,WOOD.lo);
 } else if(kind==='clothes_rack') {
  b.rect(3,4,w-6,3,STEEL.mid);b.rect(4,4,3,h-5,STEEL.lo);b.rect(w-7,4,3,h-5,STEEL.lo);
  for(let i=0;i<4;i++){const x=10+i*12;b.rect(x+3,7,2,5,STEEL.mid);b.rect(x,12,11,23,[PINK.mid,CYAN.mid,PURPLE.mid,GREEN.mid][i]);b.rect(x-2,13,15,6,[PINK.lo,CYAN.lo,PURPLE.lo,GREEN.lo][i]);}
 } else if(kind==='runway') {box(b,1,4,w-2,h-6,5,PURPLE);for(let x=5;x<w-3;x+=9)b.rect(x,h-6,3,2,GOLD.hi);}
 else if(kind==='desk_pc') {box(b,2,28,w-4,12,4,WOOD);box(b,18,2,28,23,3,DARK);b.rect(21,5,22,14,CYAN.mid);b.rect(29,25,7,3,STEEL.mid);b.rect(18,30,29,4,STEEL.lo);b.rect(6,40,4,8,WOOD.lo);b.rect(w-10,40,4,8,WOOD.lo);}
 else if(kind==='phone_desk') {box(b,2,19,w-4,11,3,WOOD);box(b,7,10,18,9,2,DARK);b.rect(5,7,22,5,BLACK.mid);for(let y=13;y<18;y+=2)for(let x=13;x<21;x+=3)b.px(x,y,WHITE.hi);}
 else if(kind==='visitor_sign') {box(b,1,1,14,13,2,PURPLE);b.rect(6,3,5,2,WHITE.hi);b.rect(9,5,2,3,WHITE.hi);b.rect(6,7,4,2,WHITE.hi);b.px(7,11,WHITE.hi);}
 else {box(b,1,1,w-2,h-2,3,WOOD);b.rect(4,4,w-8,h-8,kind==='score_board'?DARK.lo:WHITE.mid);for(let i=0;i<6;i++){const x=8+i%3*(w/3-2),y=8+Math.floor(i/3)*15;b.rect(x,y,12,10,[CYAN.mid,PINK.mid,GREEN.mid][i%3]);b.px(x+5,y,GOLD.mid);}}
 return outline(b);
}
/** 清單:預覽頁與匯出工具都讀這個 */
export const KIT = {
  vanity:{w:32,h:48,tags:['公司大樓'],make:()=>officeProp('vanity',32,48)},
  clothes_rack:{w:64,h:48,tags:['公司大樓'],make:()=>officeProp('clothes_rack',64,48)},
  full_mirror:{w:32,h:64,tags:['公司大樓'],make:()=>officeProp('full_mirror',32,64)},
  runway:{w:96,h:24,tags:['公司大樓'],make:()=>officeProp('runway',96,24)},
  desk_pc:{w:64,h:48,tags:['公司大樓'],make:()=>officeProp('desk_pc',64,48)},
  phone_desk:{w:32,h:32,tags:['公司大樓'],make:()=>officeProp('phone_desk',32,32)},
  whiteboard_map:{w:64,h:40,tags:['公司大樓'],make:()=>officeProp('whiteboard_map',64,40)},
  score_board:{w:96,h:48,tags:['公司大樓'],make:()=>officeProp('score_board',96,48)},
  visitor_sign:{w:16,h:16,tags:['公司大樓'],make:()=>officeProp('visitor_sign',16,16)},
  bunk_bed: { w:64, h:48, tags:['公司大樓'], make:() => bed({bunk:true}) },
  bed: { w:32, h:48, tags:['公司大樓'], make:bed },
  dining_table: { w:64, h:32, tags:['公司大樓'], make:diningTable },
  food_counter: { w:64, h:48, tags:['公司大樓'], make:foodCounter },
  bowl: { w:12, h:10, tags:['公司大樓'], make:bowl },
  fridge: { w:32, h:64, tags:['公司大樓'], make:fridge },
  massage_chair: { w:32, h:40, tags:['公司大樓'], make:massageChair },
  foot_bath: { w:32, h:24, tags:['公司大樓'], make:footBath },
  speaker: { w:32, h:48, tags:['公司大樓'], make:speaker },
  elevator_door: { w:32, h:64, tags:['公司大樓'], make:elevatorDoor },
  reception: { w:64, h:48, tags:['公司大樓'], make:reception },
  clapper: { w:12, h:12, tags:['公司大樓'], make:clapper },
  mic_hand: { w:8, h:10, tags:['公司大樓'], make:micHand },
  notes: { w:8, h:8, tags:['公司大樓'], make:notes },
  roof_sign: { w:96, h:24, tags:['公司大樓'], make:roofSign },
  floor_studio: { w: 32, h: 32, tags: ['攝影棚', '地板', '可接續'], make: () => floor({ kind: 'studio' }) },
  floor_carpet: { w: 32, h: 32, tags: ['攝影棚', '地板', '可接續'], make: () => floor({ kind: 'carpet' }) },
  floor_stage: { w: 32, h: 32, tags: ['攝影棚', '地板', '可接續'], make: () => floor({ kind: 'stage' }) },
  floor_wood: { w: 32, h: 32, tags: ['攝影棚', '地板', '可接續'], make: () => floor({ kind: 'wood' }) },
  wall_studio: { w: 32, h: 64, tags: ['攝影棚', '牆面', '可接續'], make: () => wall() },
  wall_window: { w: 32, h: 64, tags: ['攝影棚', '牆面'], make: () => wall({ kind: 'window' }) },
  wall_poster: { w: 32, h: 64, tags: ['攝影棚', '牆面'], make: () => wall({ kind: 'poster' }) },
  camera: { w: 32, h: 48, tags: ['攝影棚', '器材'], make: camera },
  ring_light: { w: 32, h: 48, tags: ['攝影棚', '器材'], make: ringLight },
  green_screen: { w: 64, h: 64, tags: ['攝影棚', '器材'], make: greenScreen },
  mic_stand: { w: 32, h: 48, tags: ['攝影棚', '器材'], make: micStand },
  podcast_desk: { w: 64, h: 48, tags: ['攝影棚', '家具'], make: podcastDesk },
  stream_desk: { w: 64, h: 48, tags: ['攝影棚', '家具'], make: streamDesk },
  dance_mirror: { w: 64, h: 64, tags: ['攝影棚', '牆面'], make: danceMirror },
  stage: { w: 96, h: 56, tags: ['攝影棚', '舞台'], make: stage },
  sofa: { w: 64, h: 40, tags: ['攝影棚', '家具'], make: sofa },
  sofa_mint: { w: 64, h: 40, tags: ['攝影棚', '家具'], make: () => sofa({ color: '#7fdcc0' }) },
  big_screen: { w: 64, h: 48, tags: ['攝影棚', '牆面'], make: bigScreen },
  trophy_case: { w: 32, h: 56, tags: ['攝影棚', '家具'], make: trophyCase },
  neon_sign: { w: 64, h: 28, tags: ['攝影棚', '牆面'], make: neonSign },
  schedule_board: { w: 64, h: 40, tags: ['攝影棚', '牆面'], make: scheduleBoard },
  plant_studio: { w: 32, h: 40, tags: ['攝影棚', '裝飾'], make: plant },
  spotlight: { w: 16, h: 20, tags: ['攝影棚', '器材'], make: spotlight },
  robot: { w: 24, h: 32, tags: ['攝影棚', '裝飾'], make: robot },
};
export { floor, wall, camera, ringLight, greenScreen, micStand, podcastDesk, streamDesk, danceMirror, stage, sofa, bigScreen, trophyCase, neonSign, scheduleBoard, plant, spotlight, robot, star };
