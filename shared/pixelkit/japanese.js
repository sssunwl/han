/* ============================================================
   pixelkit 家具:第二批「和風・溫泉旅館」
   畫風跟 furniture.js 一樣:俯視斜 3/4、32px 一格、自動描外框、光從左上來(tone 三階)。
   名字沿用溫泉旅館原本用的(存檔裡的擺設就是存這些名字),尺寸也一樣,換素材不用改擺放座標。
   全部是這裡的程式畫的,沒有描任何一張圖。

   JP_KIT:名字 → { w, h, tags, make() };地板(fl_*、tatami、rock)是 64×64 可重複鋪、不描邊。
   ============================================================ */
import { Bmp, outline, tone, mix } from './core.js';

const WOOD = tone('#c98a55'), DARK = tone('#8a5a3a'), HINOKI = tone('#e9c98f'), PAPER = tone('#f6efdc');
const STONE = tone('#a9a7b4'), RED = tone('#d8452f'), INDIGO = tone('#3f4f8f'), GOLD = tone('#e8bf5a');
const WHITE = tone('#f4f1fa'), LEAF = tone('#6cc36a'), PINE = tone('#4f9a5a'), IRON = tone('#4a4452');
const TATAMI = tone('#cfc47e'), HERI = tone('#3f5f46'), STEEL = tone('#b9c2d6'), CLAY = tone('#b9774e');
const BLUE = tone('#6fb6e8'), CREAM = tone('#fff3dc'), BLACK = tone('#3a3440');

/** 3/4 視角的箱子:上面一條亮面(topH 高)、正面本色、底下一條陰影 */
function box(b, x, y, w, h, topH, t, front = t) {
  b.rect(x, y, w, topH, t.hi);
  b.hline(x, y + topH, w, t.lo);
  b.rect(x, y + topH + 1, w, h - topH - 1, front.mid);
  b.vline(x, y + topH + 1, h - topH - 2, front.hi);
  b.hline(x, y + h - 1, w, front.lo);
}
/** 一團葉子:暗底 + 本色 + 左上亮點 */
function leaves(b, cx, cy, rx, ry, g = LEAF) {
  b.oval(cx + 1, cy + 1, rx, ry, g.lo);
  b.oval(cx, cy, rx, ry, g.mid);
  b.oval(cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.45, g.hi);
}
/** 花盆(上寬下窄一點) */
function planter(b, x, y, w, h, t) {
  for (let j = 0; j < h; j++) { const k = j > h * 0.5 ? 1 : 0; b.rect(x + k, y + j, w - 2 * k, 1, t.mid); b.px(x + k, y + j, t.hi); b.px(x + w - 1 - k, y + j, t.lo); }
  b.rect(x - 1, y - 2, w + 2, 3, t.hi); b.hline(x - 1, y, w + 2, t.lo);
  b.hline(x + 1, y + h - 1, w - 2, t.dk);
}
/** 地板/貼圖用:沒有外框的 64×64 */
const tile = fn => () => { const b = new Bmp(64, 64); fn(b); return b; };
const mk = (w, h, fn) => () => { const b = new Bmp(w, h); fn(b); return outline(b); };

// ================= 地板 =================
const tatami = tile(b => {
  // 一片直的 + 兩片橫的,四邊接起來可以無限鋪
  const mat = (x, y, w, h, vertical) => {
    b.rect(x, y, w, h, TATAMI.mid);
    if (vertical) { for (let i = x + 4; i < x + w - 3; i += 3) b.vline(i, y, h, TATAMI.lo); b.vline(x + 5, y, h, TATAMI.hi); }
    else { for (let j = y + 4; j < y + h - 3; j += 3) b.hline(x, j, w, TATAMI.lo); b.hline(x, y + 5, w, TATAMI.hi); }
    if (vertical) { b.rect(x, y, 3, h, HERI.mid); b.rect(x + w - 3, y, 3, h, HERI.mid); b.vline(x, y, h, HERI.hi); b.vline(x + w - 1, y, h, HERI.dk); }
    else { b.rect(x, y, w, 3, HERI.mid); b.rect(x, y + h - 3, w, 3, HERI.mid); b.hline(x, y, w, HERI.hi); b.hline(x, y + h - 1, w, HERI.dk); }
  };
  mat(0, 0, 32, 64, true); mat(32, 0, 32, 32, false); mat(32, 32, 32, 32, false);
  b.vline(31, 0, 64, TATAMI.dk); b.hline(32, 31, 32, TATAMI.dk);
});
/** 長條木地板:一排只有一個接縫(太多接縫會看起來像磚牆) */
function planks(b, t, rowH, seed) {
  for (let r = 0; r < 64 / rowH; r++) {
    const y = r * rowH, off = (r * seed) % 64;
    b.rect(0, y, 64, rowH, t.mid); b.hline(0, y, 64, mix(t.mid, 0.1)); b.hline(0, y + rowH - 1, 64, t.lo);
    b.vline(off, y, rowH - 1, t.lo);
    b.hline((off + 9) % 64, y + 3, 7, mix(t.mid, -0.06)); b.hline((off + 40) % 64, y + rowH - 3, 9, mix(t.mid, 0.06));
  }
}
const fl_wood = tile(b => planks(b, tone('#d39a62'), 8, 23));        // 大廳:亮木頭
const fl_wood2 = tile(b => planks(b, tone('#a8764e'), 8, 17));       // 走廊:深一點的木頭
const fl_dining = tile(b => {
  // 食堂:紅棕色木地板,板子比較寬
  planks(b, tone('#9a5a3e'), 16, 29);
  for (let x = 6; x < 64; x += 21) for (let y = 8; y < 64; y += 16) b.px(x, y, '#7a4430');
});
const fl_bath = tile(b => {
  // 浴場:淺藍白小方磚
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
    const t = (x + y) % 32 ? tone('#d9eef2') : tone('#cbe6ec');
    b.rect(x, y, 16, 16, t.mid); b.hline(x, y, 15, t.hi); b.vline(x, y, 15, t.hi);
    b.hline(x, y + 15, 16, '#9fc4cc'); b.vline(x + 15, y, 16, '#9fc4cc');
  }
});
const fl_stone = tile(b => {
  // 戶外石板:錯開的方石,石縫深色
  b.rect(0, 0, 64, 64, '#7d7a86');
  const rows = [[0, 20, 42], [10, 34, 54], [0, 22, 44], [12, 30, 50]];
  rows.forEach((xs, r) => {
    const y = r * 16;
    xs.forEach((x, i) => {
      const w = (xs[i + 1] ?? (xs[0] + 64)) - x - 2, t = tone(['#b4b1bd', '#a9a6b3', '#bdbac4'][(r + i) % 3]);
      for (const xx of [x, x - 64]) {
        b.rrect(xx + 1, y + 1, w, 14, t.mid, 1); b.hline(xx + 2, y + 1, w - 2, t.hi); b.vline(xx + 1, y + 2, 12, t.hi);
        b.hline(xx + 2, y + 14, w - 2, t.lo); b.px(xx + 5 + (i * 7) % (w - 6 || 1), y + 7, t.lo);
      }
    });
  });
});
const rock = tile(b => {
  // 露天風呂池邊的圓石(會被裁成池子的形狀)
  b.rect(0, 0, 64, 64, '#5f5b68');
  const stones = [[8, 8, 9, 7], [26, 6, 8, 6], [44, 9, 10, 7], [60, 4, 6, 6], [4, 26, 6, 7], [18, 24, 9, 8], [36, 26, 8, 7], [53, 26, 9, 8],
    [10, 44, 9, 7], [28, 42, 8, 7], [45, 45, 9, 8], [61, 42, 5, 7], [2, 60, 8, 6], [20, 60, 8, 6], [38, 61, 9, 5], [56, 60, 7, 6]];
  stones.forEach(([x, y, rx, ry], i) => {
    const t = tone(['#b3b0bc', '#a19eac', '#c2bfc9', '#9895a3'][i % 4]);
    for (const [dx, dy] of [[0, 0], [64, 0], [-64, 0], [0, 64], [0, -64]]) {
      b.oval(x + dx, y + dy, rx, ry, t.lo); b.oval(x + dx - 1, y + dy - 1, rx - 1, ry - 1, t.mid);
      b.oval(x + dx - rx * 0.35, y + dy - ry * 0.4, rx * 0.35, ry * 0.3, t.hi);
    }
  });
});

// ================= 和室 =================
const FUTON = { blue: '#5b7fd1', gold: '#e2a93c', gray: '#9aa0ad', purple: '#9a6ad0' };
/** 被子上半:床墊 + 兩個枕頭(下緣接被子,不留外框) */
const futon_top = mk(64, 32, b => {
  b.rect(2, 4, 60, 28, WHITE.mid); b.rect(2, 4, 60, 2, WHITE.hi); b.vline(2, 6, 26, WHITE.hi); b.vline(61, 6, 26, WHITE.lo);
  const pil = tone('#cfdcec');
  for (const x of [7, 35]) {
    b.rrect(x, 8, 22, 14, '#8a96b0', 2); b.rrect(x + 1, 9, 20, 11, pil.mid, 2);
    b.hline(x + 2, 9, 18, pil.hi); b.hline(x + 3, 10, 6, '#ffffff'); b.hline(x + 2, 19, 18, pil.lo);
    b.px(x + 15, 14, pil.lo); b.px(x + 16, 15, pil.lo);
  }
  b.hline(3, 30, 58, WHITE.lo);
});
/** 被子下半(花色),上緣接 futon_top */
function futonBlanket(color) {
  return mk(64, 32, b => {
    const t = tone(color);
    b.rect(2, 0, 60, 26, t.mid); b.rect(2, 0, 60, 3, t.hi); b.hline(2, 3, 60, t.lo);
    b.vline(2, 3, 23, t.hi); b.vline(61, 3, 23, t.lo);
    for (let y = 8; y < 24; y += 7) for (let x = 7 + (y % 2) * 6; x < 58; x += 12) {           // 小花紋
      b.px(x, y, t.hi); b.px(x - 1, y + 1, t.hi); b.px(x + 1, y + 1, t.hi); b.px(x, y + 2, t.hi); b.px(x, y + 1, mix(color, 0.5));
    }
    b.rect(2, 24, 60, 2, t.dk);
    b.rect(3, 26, 58, 4, WHITE.mid); b.hline(3, 29, 58, WHITE.lo);                                 // 底下露出來的床墊
  });
}
const zabuton = mk(32, 32, b => {
  const t = tone('#c8584a');
  b.rrect(4, 12, 24, 16, t.lo, 2); b.rrect(4, 10, 24, 15, t.mid, 2);
  b.rrect(6, 11, 20, 11, t.hi, 2); b.rrect(7, 12, 18, 9, t.mid, 2);
  b.px(16, 16, t.dk); b.px(15, 16, t.lo); b.px(17, 16, t.lo);
  for (const [x, y] of [[4, 10], [27, 10], [4, 24], [27, 24]]) b.px(x, y, GOLD.mid);               // 四角流蘇
});
const lowtable = mk(64, 64, b => {
  b.rect(8, 40, 4, 16, DARK.lo); b.rect(52, 40, 4, 16, DARK.lo);
  box(b, 3, 18, 58, 26, 20, DARK);
  b.rect(6, 21, 52, 14, mix(DARK.hi, 0.06)); b.hline(10, 24, 18, DARK.mid); b.hline(30, 30, 22, DARK.mid);
  b.rect(10, 44, 4, 14, DARK.mid); b.rect(50, 44, 4, 14, DARK.mid);
});
const kotatsu = mk(64, 64, b => {
  const q = tone('#d86a5a');
  b.rrect(2, 22, 60, 38, q.lo, 2); b.rrect(2, 20, 60, 36, q.mid, 2);
  for (let x = 8; x < 60; x += 10) for (let y = 30; y < 54; y += 8) { b.px(x, y, q.hi); b.px(x + 1, y, q.hi); b.px(x, y + 1, q.hi); }
  box(b, 8, 14, 48, 22, 16, WOOD);
  b.rect(11, 17, 42, 10, mix(WOOD.hi, 0.05));
  b.oval(42, 20, 5, 3, '#ff9a3a'); b.oval(41, 19, 3, 2, '#ffc070'); b.px(42, 16, '#5a8a3a');      // 橘子
  b.oval(30, 22, 4, 2.5, '#ff9a3a'); b.px(29, 21, '#ffc070');
});
const teatable = mk(64, 64, b => {
  b.rect(8, 44, 4, 14, BLACK.lo); b.rect(52, 44, 4, 14, BLACK.lo);
  box(b, 2, 8, 60, 40, 32, tone('#6a3f2a'));
  b.rect(5, 11, 54, 26, '#8a5a3e'); b.hline(5, 11, 54, '#a4704e'); b.vline(5, 11, 26, '#a4704e');
  b.rect(16, 18, 32, 12, '#c45a3a'); b.hline(16, 18, 32, '#e07a5a'); b.hline(16, 29, 32, '#9a3f2a'); // 桌巾
  b.rect(10, 48, 4, 10, '#5a3a2a'); b.rect(50, 48, 4, 10, '#5a3a2a');
});
function scroll(kind) {
  return mk(32, 64, b => {
    b.rect(5, 2, 22, 3, DARK.mid); b.hline(5, 2, 22, DARK.hi); b.px(15, 0, IRON.mid); b.px(16, 0, IRON.mid); b.px(15, 1, IRON.mid); b.px(16, 1, IRON.mid);
    b.rect(7, 5, 18, 50, tone('#7a8c6a').mid);                                                       // 布邊
    b.rect(9, 9, 14, 40, PAPER.mid); b.vline(9, 9, 40, PAPER.hi); b.vline(22, 9, 40, PAPER.lo);
    if (kind === 1) {
      // 書法:一筆一筆的墨
      b.map(11, 13, ['.##.##..', '..###...', '.#####..', '...#....', '..#.#...', '.#...#..'], { '#': '#2b1f2e' });
      b.map(11, 22, ['..##....', '.####...', '...#....', '.#####..', '..#.#...'], { '#': '#2b1f2e' });
      b.map(12, 32, ['.###..', '#...#.', '.###..', '..#...', '.#.#..'], { '#': '#2b1f2e' });
      b.rect(17, 43, 3, 3, '#d8452f');                                                                 // 印章
    } else {
      // 山水:遠山 + 紅太陽
      b.oval(18, 15, 2.5, 2.5, '#e8644a');
      for (let j = 0; j < 9; j++) b.hline(15 - j * 0.6, 26 + j, 2 + j * 1.2, j < 2 ? '#8a8f9a' : '#5f6672');
      for (let j = 0; j < 7; j++) b.hline(10, 33 + j, 3 + j, '#8a8f9a');
      b.hline(10, 43, 12, '#9fb0c0'); b.hline(12, 45, 8, '#9fb0c0');
    }
    b.rect(5, 55, 22, 4, DARK.mid); b.hline(5, 55, 22, DARK.hi); b.rect(4, 56, 2, 2, DARK.lo); b.rect(26, 56, 2, 2, DARK.lo);
  });
}
const vase = mk(32, 64, b => {
  const c = tone('#3f6f9a');
  // 花:兩枝高的 + 葉子
  b.vline(14, 10, 26, PINE.lo); b.vline(18, 16, 20, PINE.lo); b.vline(11, 22, 14, PINE.lo);
  for (const [x, y, col] of [[14, 9, '#ff7a9a'], [18, 15, '#fff0f4'], [11, 21, '#ff9fbe'], [20, 24, '#ff7a9a']]) { b.oval(x, y, 3, 2.6, col); b.px(x - 1, y - 1, mix(col, 0.5)); b.px(x, y, '#ffd84a'); }
  leaves(b, 8, 32, 4, 2, LEAF); leaves(b, 22, 31, 4, 2, LEAF);
  b.rect(12, 34, 8, 4, c.mid); b.hline(11, 34, 10, c.hi);                                          // 瓶口
  b.oval(16, 48, 9, 11, c.lo); b.oval(15, 47, 8.5, 10.5, c.mid); b.oval(12, 43, 2.5, 4, c.hi);
  b.hline(9, 46, 14, '#f4f1fa'); b.px(16, 51, '#f4f1fa'); b.px(13, 52, '#f4f1fa');               // 白色花紋
  b.rect(10, 58, 12, 3, c.dk);
});
function bonsai(big) {
  return mk(32, big ? 96 : 64, b => {
    const H = big ? 96 : 64;
    if (big) { box(b, 3, 74, 26, 20, 4, DARK); b.rect(6, 84, 3, 10, DARK.dk); b.rect(23, 84, 3, 10, DARK.dk); }   // 木台
    const py = big ? 64 : 50;
    b.rect(5, py, 22, 8, tone('#4f6f8a').mid); b.rect(4, py - 2, 24, 3, tone('#4f6f8a').hi); b.hline(5, py + 7, 22, tone('#4f6f8a').lo);
    b.rect(8, py + 8, 3, 2, tone('#4f6f8a').dk); b.rect(21, py + 8, 3, 2, tone('#4f6f8a').dk);
    b.rect(7, py - 2, 18, 1, '#6a5040');
    // 彎彎的樹幹
    const top = big ? 18 : 18;
    for (let y = py - 2; y > top + 6; y--) { const x = 15 + Math.round(Math.sin((py - y) / (big ? 7 : 6)) * (big ? 5 : 3)); b.rect(x, y, big ? 4 : 3, 1, '#7a5238'); b.px(x, y, '#9a6a48'); }
    if (big) {
      // 松樹:一層一層的雲朵狀葉團
      leaves(b, 9, 46, 7, 4, PINE); leaves(b, 22, 38, 8, 4.5, PINE); leaves(b, 9, 30, 8, 4.5, PINE);
      leaves(b, 21, 22, 8, 4.5, PINE); leaves(b, 14, 13, 9, 5.5, PINE);
    } else {
      leaves(b, 10, 26, 7, 5, PINE); leaves(b, 21, 21, 7, 5, PINE); leaves(b, 16, 33, 5, 3, PINE);
    }
    void H;
  });
}
const shoji_win = mk(96, 64, b => {
  box(b, 1, 2, 94, 58, 3, WOOD);
  b.rect(5, 7, 86, 46, PAPER.mid);
  for (let x = 5; x < 92; x += 11) b.vline(x, 7, 46, WOOD.lo);
  for (let y = 7; y < 54; y += 9) b.hline(5, y, 86, WOOD.lo);
  b.rect(5, 7, 86, 4, '#ffffff73');
  b.vline(48, 5, 50, WOOD.mid); b.vline(47, 5, 50, WOOD.hi);
  b.rect(1, 54, 94, 6, WOOD.mid); b.hline(1, 54, 94, WOOD.hi);
});
const irori = mk(64, 32, b => {
  box(b, 2, 4, 60, 26, 18, DARK);
  b.rect(8, 8, 48, 12, '#9a958e'); b.rect(8, 8, 48, 2, '#7d7872');                                 // 灰
  for (const [x, y] of [[22, 13], [28, 15], [34, 13], [40, 14]]) { b.rect(x, y, 4, 3, '#3a2c2a'); b.px(x + 1, y, '#ff7a3a'); b.px(x + 2, y + 1, '#ffb04a'); }
  b.oval(32, 9, 6, 4, IRON.mid); b.oval(31, 8, 3, 2, IRON.hi); b.vline(32, 0, 5, IRON.lo);        // 鐵壺
});
const heater = mk(32, 32, b => {
  // 火缽:圓圓的陶缽 + 炭火
  const c = tone('#5f7fa0');
  b.oval(16, 20, 12, 9, c.lo); b.oval(15, 19, 11.5, 8.5, c.mid); b.oval(11, 16, 4, 3, c.hi);
  b.oval(16, 13, 10, 3.5, c.dk); b.oval(16, 13, 9, 2.8, '#9a958e');
  for (const x of [11, 15, 19]) { b.rect(x, 12, 3, 2, '#3a2c2a'); b.px(x + 1, 12, '#ff7a3a'); }
  b.hline(8, 21, 16, '#f4f1fa'); b.px(16, 24, '#f4f1fa');
});
const tansu = mk(32, 96, b => {
  box(b, 2, 4, 28, 88, 5, DARK);
  for (let i = 0; i < 6; i++) {
    const y = 13 + i * 13;
    b.rect(5, y, 22, 11, DARK.lo); b.rect(6, y + 1, 20, 9, DARK.mid); b.hline(6, y + 1, 20, DARK.hi);
    b.rect(10, y + 4, 4, 3, IRON.mid); b.rect(18, y + 4, 4, 3, IRON.mid); b.px(10, y + 4, IRON.hi); b.px(18, y + 4, IRON.hi);
  }
  b.rect(4, 92, 4, 3, DARK.dk); b.rect(24, 92, 4, 3, DARK.dk);
});
const altar = mk(32, 96, b => {
  box(b, 2, 6, 28, 86, 4, BLACK);
  b.rect(2, 2, 28, 5, BLACK.hi); b.hline(1, 2, 30, GOLD.mid);
  b.rect(6, 14, 20, 40, '#5a3a20'); b.rect(7, 15, 18, 38, GOLD.lo);
  b.rect(10, 20, 12, 24, GOLD.mid); b.oval(16, 26, 4, 4, GOLD.hi); b.rect(13, 30, 6, 12, GOLD.hi);   // 佛像剪影
  b.rect(4, 14, 2, 40, GOLD.mid); b.rect(26, 14, 2, 40, GOLD.mid);                                     // 打開的門
  b.rect(6, 56, 20, 3, GOLD.mid); b.rect(9, 60, 4, 5, WHITE.mid); b.rect(19, 60, 4, 5, WHITE.mid);
  b.px(10, 58, '#ffb04a'); b.px(20, 58, '#ffb04a');
  for (let i = 0; i < 2; i++) { const y = 68 + i * 11; b.rect(6, y, 20, 9, BLACK.lo); b.rect(7, y + 1, 18, 7, BLACK.mid); b.rect(14, y + 3, 4, 2, GOLD.mid); }
});
const bench = mk(64, 64, b => {
  // 茶屋長椅:紅毛氈
  b.rect(6, 42, 4, 20, DARK.lo); b.rect(54, 42, 4, 20, DARK.lo);
  b.rect(10, 44, 3, 16, DARK.mid); b.rect(50, 44, 3, 16, DARK.mid);
  box(b, 2, 28, 60, 18, 10, RED, tone('#a8352a'));
  for (let x = 6; x < 60; x += 9) b.px(x, 32, RED.mid);
  b.rect(2, 44, 60, 3, DARK.mid); b.hline(2, 44, 60, DARK.hi);
  b.rect(8, 56, 48, 2, DARK.lo);                                                                  // 橫木
});
function dining(fancy) {
  return mk(64, 96, b => {
    const cush = tone(fancy ? '#9a4ad0' : '#c8584a');
    const cushion = (x, y) => { b.rrect(x, y + 1, 22, 13, cush.lo, 2); b.rrect(x, y, 22, 12, cush.mid, 2); b.hline(x + 2, y, 18, cush.hi); b.px(x + 11, y + 6, cush.dk); };
    cushion(5, 6); cushion(37, 6);
    // 桌子(高級版是紅漆)
    const top = fancy ? tone('#b8302a') : DARK;
    box(b, 2, 24, 60, 42, 34, top);
    b.rect(5, 27, 54, 28, fancy ? '#c8423a' : mix(DARK.hi, 0.04));
    b.rect(6, 62, 4, 6, top.dk); b.rect(54, 62, 4, 6, top.dk);
    // 料理:每人一份(飯碗、湯、魚盤),上下兩排
    const meal = (x, y) => {
      b.rect(x, y, 22, 12, fancy ? '#2b1f2e' : '#5a3a2a'); b.rect(x + 1, y + 1, 20, 10, fancy ? '#3a2c3e' : '#6e4a36'); // 托盤
      b.oval(x + 5, y + 6, 3.4, 3, WHITE.mid); b.oval(x + 5, y + 5, 2.4, 1.6, '#ffffff');               // 飯
      b.oval(x + 12, y + 6, 3, 2.8, RED.lo); b.oval(x + 12, y + 5, 2, 1.4, '#c98a55');                  // 味噌湯
      b.rect(x + 16, y + 3, 5, 7, '#e8f0f7'); b.rect(x + 17, y + 5, 3, 3, '#ff9a7a');                   // 魚
    };
    meal(5, 29); meal(37, 29); meal(5, 42); meal(37, 42);
    if (fancy) {
      b.oval(32, 41, 5, 4, IRON.mid); b.oval(32, 40, 3.5, 2.5, '#e8a05a'); b.hline(29, 36, 6, IRON.hi);   // 小火鍋
      b.px(31, 34, '#ffffff99'); b.px(33, 33, '#ffffff99');
    } else {
      b.rect(30, 38, 4, 5, '#7fb0d0'); b.hline(30, 38, 4, '#cfe8f7');                                 // 茶杯
    }
    cushion(5, 74); cushion(37, 74);
  });
}
const genkan = mk(64, 32, b => {
  box(b, 1, 4, 62, 24, 10, HINOKI);
  for (const [x, c] of [[8, '#5b7fd1'], [20, '#5b7fd1'], [36, '#d86a5a'], [48, '#d86a5a']]) {
    const t = tone(c);
    b.rrect(x, 6, 8, 7, t.mid, 1); b.hline(x + 1, 6, 6, t.hi); b.rect(x + 1, 9, 6, 3, t.lo);       // 拖鞋
  }
});

// ================= 浴場 =================
const tub = mk(64, 96, b => {
  box(b, 3, 10, 58, 82, 8, HINOKI);
  b.rect(8, 16, 48, 60, '#5fbfd6'); b.rect(8, 16, 48, 4, '#4aa6be');
  for (let i = 0; i < 6; i++) b.hline(12 + (i * 13) % 36, 24 + i * 9, 8, '#ffffff66');
  for (let y = 20; y < 88; y += 12) b.hline(3, y, 3, HINOKI.lo);
  b.rect(3, 80, 58, 3, IRON.mid); b.rect(3, 30, 3, 2, IRON.mid); b.rect(58, 30, 3, 2, IRON.mid);
});
function bucket(plastic) {
  return mk(32, 32, b => {
    const t = plastic ? tone('#4f9ae0') : HINOKI;
    for (let j = 0; j < 14; j++) { const k = j > 9 ? 1 : 0; b.rect(7 + k, 14 + j, 18 - 2 * k, 1, t.mid); b.px(7 + k, 14 + j, t.hi); b.px(24 - k, 14 + j, t.lo); }
    b.oval(16, 13, 9, 3.5, t.hi); b.oval(16, 13.5, 7.5, 2.2, plastic ? '#bfe6ff' : '#8fd0e0');
    if (!plastic) { b.hline(7, 18, 18, IRON.mid); b.hline(8, 25, 16, IRON.mid); for (let x = 10; x < 24; x += 3) b.vline(x, 19, 6, HINOKI.lo); }
    else { b.hline(10, 20, 12, '#ffffff'); b.hline(10, 21, 12, '#ffffff'); }
  });
}
const duck = mk(32, 32, b => {
  const y = tone('#ffd23a');
  b.oval(15, 21, 8, 5, y.lo); b.oval(14, 20, 7.5, 4.6, y.mid); b.oval(12, 18, 3, 2, y.hi);         // 身體
  b.oval(19, 13, 4.5, 4.2, y.mid); b.oval(18, 12, 2, 1.6, y.hi);                                    // 頭
  b.rect(23, 13, 4, 2, '#ff8a2a'); b.hline(23, 15, 3, '#e06a1a');                                   // 嘴
  b.px(20, 12, '#2b1f2e');
  b.oval(15, 27, 9, 1.4, '#ffffff66');
});
const shower = mk(32, 64, b => {
  b.rect(5, 6, 22, 22, STEEL.lo); b.rect(6, 7, 20, 20, '#d8f1ff'); b.rect(6, 7, 20, 6, '#eef9ff');   // 鏡子
  b.px(9, 9, '#fff'); b.px(10, 9, '#fff'); b.px(9, 10, '#fff');
  b.vline(24, 1, 8, STEEL.mid); b.rect(21, 0, 7, 3, STEEL.hi); b.hline(21, 3, 7, STEEL.lo);       // 蓮蓬頭
  for (const x of [22, 24, 26]) b.px(x, 4, '#9fd8ef');
  b.rect(8, 30, 16, 4, STEEL.mid); b.hline(8, 30, 16, STEEL.hi); b.rect(9, 34, 3, 3, RED.mid); b.rect(20, 34, 3, 3, BLUE.mid);  // 水龍頭
  b.vline(24, 9, 22, IRON.mid);
  // 小板凳
  b.rect(8, 50, 3, 10, '#c8c0b0'); b.rect(21, 50, 3, 10, '#c8c0b0');
  b.rrect(6, 44, 20, 8, tone('#f4f1fa').mid, 2); b.hline(7, 44, 18, '#ffffff'); b.hline(7, 51, 18, WHITE.lo);
});
const screen = mk(96, 96, b => {
  // 金屏風:四扇,鋸齒狀立著
  for (let i = 0; i < 4; i++) {
    const x = 3 + i * 23, dy = i % 2 ? 4 : 0, t = i % 2 ? tone('#d6a940') : GOLD;
    b.rect(x, 8 + dy, 22, 80 - dy, BLACK.mid);
    b.rect(x + 2, 10 + dy, 18, 74 - dy, t.mid); b.vline(x + 2, 10 + dy, 74 - dy, t.hi);
    b.rect(x + 2, 10 + dy, 18, 2, t.hi);
  }
  // 屏風上的畫:松樹 + 雲
  for (let x = 10; x < 86; x += 2) b.px(x, 30 + Math.round(Math.sin(x / 9) * 3), '#fff6d0');
  b.rect(30, 46, 4, 32, '#6a4a30'); leaves(b, 24, 46, 10, 5, PINE); leaves(b, 42, 40, 10, 5, PINE); leaves(b, 56, 50, 8, 4, PINE);
  b.rect(54, 52, 22, 2, '#6a4a30');
  b.rect(2, 88, 92, 4, BLACK.dk);
});
const sink = mk(64, 64, b => {
  b.rect(6, 2, 52, 22, STEEL.lo); b.rect(8, 4, 48, 18, '#d8f1ff'); b.rect(8, 4, 48, 5, '#eef9ff'); b.vline(32, 4, 18, STEEL.mid);
  b.px(11, 6, '#fff'); b.px(12, 6, '#fff'); b.px(11, 7, '#fff'); b.px(36, 6, '#fff'); b.px(37, 6, '#fff');
  box(b, 2, 26, 60, 34, 12, HINOKI);
  for (const x of [16, 48]) { b.oval(x, 32, 9, 4, WHITE.lo); b.oval(x, 32, 8, 3.2, '#e8f4fa'); b.rect(x - 1, 26, 3, 3, STEEL.mid); }
  b.rect(8, 44, 20, 12, HINOKI.lo); b.rect(36, 44, 20, 12, HINOKI.lo); b.rect(9, 45, 18, 10, HINOKI.mid); b.rect(37, 45, 18, 10, HINOKI.mid);
  b.rect(16, 49, 4, 2, IRON.mid); b.rect(44, 49, 4, 2, IRON.mid);
});

// ================= 櫃台、土產店、庭園 =================
const counter = mk(96, 64, b => {
  box(b, 1, 8, 94, 54, 14, HINOKI, DARK);
  for (let x = 8; x < 92; x += 16) { b.vline(x, 26, 30, DARK.lo); b.vline(x + 1, 26, 30, DARK.hi); }
  b.rect(1, 56, 94, 6, DARK.dk);
  b.rect(36, 26, 24, 14, '#f4f1fa'); b.rect(37, 27, 22, 12, RED.mid);                                 // 布簾小招牌
  b.map(44, 28, ['.#.#.#', '#.#.#.', '.#.#.#', '......', '#....#', '.####.'], { '#': '#fff6e8' });     // ♨
  b.rect(12, 5, 14, 8, PAPER.mid); b.hline(12, 5, 14, '#ffffff'); b.vline(19, 5, 8, PAPER.lo);       // 登記簿
  b.oval(72, 10, 4, 3, GOLD.mid); b.oval(71, 9, 2, 1.5, GOLD.hi); b.rect(70, 12, 5, 2, IRON.mid); b.px(72, 6, IRON.mid);  // 服務鈴
  b.rect(82, 2, 8, 12, CLAY.mid); b.rect(81, 1, 10, 2, CLAY.hi); b.vline(86, 0, 2, PINE.mid);       // 小花瓶
});
function crates(fancy) {
  return mk(64, 96, b => {
    // 土產架:三層木架,每層擺不同的盒子
    b.rect(3, 6, 4, 88, DARK.mid); b.rect(57, 6, 4, 88, DARK.mid); b.vline(3, 6, 88, DARK.hi);
    if (fancy) { b.rect(3, 2, 58, 12, INDIGO.mid); b.hline(3, 2, 58, INDIGO.hi); for (let x = 14; x < 56; x += 14) b.vline(x, 4, 10, INDIGO.lo); b.map(25, 4, ['.##.##.', '#######', '.#####.', '..###..', '...#...'], { '#': '#fff6e8' }); }
    const shelf = (y, items) => {
      b.rect(5, y, 54, 4, WOOD.hi); b.hline(5, y + 4, 54, WOOD.lo); b.rect(5, y + 5, 54, 3, WOOD.mid);
      items(y);
    };
    const boxy = (x, y, w, h, c, band) => { const t = tone(c); b.rect(x, y - h, w, h, t.mid); b.hline(x, y - h, w, t.hi); b.vline(x + w - 1, y - h, h, t.lo); if (band) b.rect(x, y - h + Math.floor(h / 2) - 1, w, 2, band); };
    shelf(34, y => { boxy(8, y, 14, 12, '#f4f1fa', '#d8452f'); boxy(24, y, 14, 10, '#e2a93c', '#8a5a3a'); boxy(40, y, 14, 12, '#7fdc8a', '#f4f1fa'); if (fancy) boxy(24, y - 10, 12, 8, '#ff9fbe', '#fff'); });
    shelf(60, y => { for (let i = 0; i < 5; i++) { b.oval(11 + i * 10, y - 5, 4, 4, '#f6e2c0'); b.oval(10 + i * 10, y - 6, 2, 1.5, '#fff6e8'); b.px(11 + i * 10, y - 5, '#c98a55'); } });   // 溫泉饅頭
    shelf(86, y => { boxy(8, y, 22, 14, fancy ? '#9a6ad0' : '#5b7fd1', '#e8bf5a'); boxy(34, y, 22, 16, '#c8584a', '#f4f1fa'); if (fancy) { b.rect(44, y - 24, 6, 8, '#ffd84a'); b.px(46, y - 26, '#d8452f'); } });
    // 價錢牌
    b.rect(26, 63, 12, 6, '#fff6e8'); b.hline(28, 65, 8, '#d8452f');
  });
}
const flowers = mk(64, 64, b => {
  box(b, 3, 40, 58, 20, 4, WOOD);
  b.rect(6, 42, 52, 2, '#6a5040');
  for (let i = 0; i < 6; i++) leaves(b, 10 + i * 9, 33 - (i % 2) * 3, 7, 8, LEAF);
  const cols = ['#ff7a9a', '#ffd84a', '#fff0f4', '#b98cff', '#ff9a52'];
  for (let i = 0; i < 12; i++) { const x = 8 + (i * 13) % 48, y = 28 + (i * 7) % 10, c = cols[i % cols.length]; b.oval(x, y, 2.6, 2.4, c); b.px(x - 1, y - 1, mix(c, 0.5)); b.px(x, y, mix(c, -0.3)); }
});
const garland = mk(96, 64, b => {
  // 兩根竹竿 + 一串紅白燈籠
  b.rect(2, 4, 4, 58, '#a8b85a'); b.vline(2, 4, 58, '#c8d87a'); b.rect(90, 4, 4, 58, '#a8b85a'); b.vline(90, 4, 58, '#c8d87a');
  for (let y = 14; y < 60; y += 12) { b.hline(2, y, 4, '#7a8a3a'); b.hline(90, y, 4, '#7a8a3a'); }
  for (let x = 6; x < 90; x++) b.px(x, 8 + Math.round(Math.sin((x - 6) / 84 * Math.PI) * 10), '#3a3440');
  for (let i = 0; i < 5; i++) {
    const x = 16 + i * 16, y = 10 + Math.round(Math.sin((x - 6) / 84 * Math.PI) * 10), t = i % 2 ? WHITE : RED;
    b.rect(x - 3, y + 1, 6, 2, BLACK.mid);
    b.oval(x, y + 10, 6, 7, t.mid); b.oval(x - 2, y + 8, 2, 3, t.hi); b.oval(x + 3, y + 12, 2, 3, t.lo);
    for (let j = 6; j < 15; j += 3) b.hline(x - 5, y + j, 10, t.lo);
    b.rect(x - 3, y + 17, 6, 2, BLACK.mid); b.px(x, y + 20, GOLD.mid);
  }
});
const bush = mk(32, 64, b => {
  // 修剪成圓球的杜鵑
  b.rect(10, 54, 12, 6, '#6a5040');
  leaves(b, 16, 44, 13, 10, LEAF); leaves(b, 10, 40, 7, 6, LEAF); leaves(b, 22, 39, 7, 6, LEAF); leaves(b, 16, 34, 8, 6, LEAF);
  for (const [x, y] of [[9, 38], [18, 33], [23, 42], [13, 47], [20, 49]]) { b.px(x, y, '#ff7ab0'); b.px(x + 1, y, '#ffb3d0'); b.px(x, y + 1, '#e85a96'); }
});

// ================= 休憩室、卡拉 OK、擺設 =================
function sofa(color) {
  return mk(96, 64, b => {
    const t = tone(color);
    b.rect(8, 54, 4, 8, DARK.mid); b.rect(84, 54, 4, 8, DARK.mid);
    b.rrect(4, 8, 88, 28, t.lo, 2); b.rrect(4, 6, 88, 26, t.mid, 2); b.hline(6, 6, 84, t.hi);       // 椅背
    for (const x of [8, 36, 64]) { b.rrect(x, 10, 24, 18, t.hi, 2); b.rrect(x + 1, 11, 22, 16, t.mid, 2); }
    b.rrect(2, 30, 92, 26, t.lo, 2); b.rrect(2, 28, 92, 24, t.mid, 2); b.hline(4, 28, 88, t.hi);    // 坐墊
    b.vline(33, 30, 20, t.lo); b.vline(63, 30, 20, t.lo);
    b.rrect(0, 16, 8, 38, t.mid, 2); b.vline(1, 17, 34, t.hi); b.rrect(88, 16, 8, 38, t.lo, 2);     // 扶手
    b.rect(14, 34, 10, 7, '#f4f1fa'); b.hline(14, 34, 10, '#ffffff');                                  // 小毛巾
  });
}
const bookshelf = mk(64, 64, b => {
  box(b, 2, 2, 60, 58, 4, DARK);
  const cols = ['#d8452f', '#5b7fd1', '#e2a93c', '#7fdc8a', '#9a6ad0', '#f4f1fa', '#ff9a52'];
  for (let r = 0; r < 3; r++) {
    const y = 9 + r * 16;
    b.rect(5, y, 54, 14, DARK.dk);
    for (let x = 6, i = r * 3; x < 57; i++) { const w = 3 + (i * 7) % 3, h = 10 + (i * 5) % 4, c = tone(cols[i % cols.length]); b.rect(x, y + 14 - h, w, h, c.mid); b.vline(x, y + 14 - h, h, c.hi); b.hline(x, y + 16 - h, w, c.lo); x += w + ((i % 5 === 4) ? 2 : 0); }
    b.rect(5, y + 14, 54, 2, DARK.hi);
  }
});
const fireplace = mk(64, 68, b => {
  // 鑄鐵柴爐 + 煙囪
  b.rect(27, 0, 8, 26, IRON.mid); b.vline(27, 0, 26, IRON.hi); b.hline(26, 10, 10, IRON.lo);
  b.rrect(8, 24, 46, 36, IRON.lo, 2); b.rrect(8, 22, 46, 34, IRON.mid, 2); b.hline(10, 22, 42, IRON.hi); b.vline(8, 24, 30, IRON.hi);
  b.rect(16, 30, 30, 18, BLACK.dk); b.rect(17, 31, 28, 16, '#3a1a14');
  b.oval(31, 42, 9, 5, '#ff7a2a'); b.oval(30, 40, 6, 5, '#ffb04a'); b.oval(29, 39, 3, 3, '#ffe28a');  // 火
  b.rect(19, 44, 24, 3, '#6a4030');
  for (let x = 18; x < 46; x += 4) b.vline(x, 31, 16, '#2a2228');
  b.rect(10, 56, 4, 8, IRON.dk); b.rect(48, 56, 4, 8, IRON.dk);
  b.rect(2, 62, 58, 4, STONE.mid); b.hline(2, 62, 58, STONE.hi);                                     // 石墊
});
const palm = mk(32, 64, b => {
  // 大盆栽:藍色陶盆 + 寬葉
  planter(b, 7, 46, 18, 14, tone('#3f6f9a'));
  b.vline(15, 24, 22, '#5a7a3a'); b.vline(17, 30, 16, '#5a7a3a');
  for (const [x, y, rx] of [[8, 30, 7], [24, 26, 7], [10, 16, 6], [22, 12, 6], [16, 6, 5], [16, 22, 6], [6, 40, 5], [26, 38, 5]]) leaves(b, x, y, rx, 4, LEAF);
});
const plant = mk(32, 64, b => {
  // 觀葉植物:虎尾蘭在高腳架上
  b.rect(9, 44, 2, 18, DARK.mid); b.rect(21, 44, 2, 18, DARK.mid); b.rect(7, 42, 18, 3, DARK.hi); b.rect(10, 54, 12, 2, DARK.lo);
  planter(b, 9, 32, 14, 10, tone('#f0e6d6'));
  const blade = (x, top, lean) => { for (let y = top; y < 31; y++) { const xx = x + Math.round((31 - y) * lean); b.rect(xx, y, 3, 1, PINE.mid); b.px(xx, y, PINE.hi); if (y % 4 === 0) b.px(xx + 1, y, '#c8d87a'); } };
  blade(11, 10, -0.15); blade(15, 4, 0); blade(19, 9, 0.18); blade(13, 16, -0.3); blade(18, 15, 0.32);
});
const fishbowl = mk(32, 32, b => {
  b.rect(9, 26, 14, 4, DARK.mid); b.hline(9, 26, 14, DARK.hi);
  b.oval(16, 16, 10, 10, '#d8f1ffcc'); b.oval(16, 18, 9, 7.5, '#7fc8eacc');
  b.oval(16, 7, 6, 1.6, '#eef9ff');
  b.oval(13, 19, 3, 2, '#ff6a3a'); b.px(16, 19, '#ff6a3a'); b.px(17, 18, '#ff9a6a'); b.px(17, 20, '#ff9a6a'); b.px(12, 18, '#2b1f2e');
  b.oval(19, 15, 2, 1.4, '#ff4a4a'); b.px(21, 15, '#ff8a8a');
  b.px(10, 12, '#ffffff'); b.px(10, 13, '#ffffff'); b.px(11, 11, '#ffffff');
  b.vline(21, 21, 4, '#5aa84a'); b.vline(23, 20, 5, '#5aa84a');
});
const pot = mk(32, 32, b => {
  // 陶壺:咖啡色釉
  const c = tone('#9a6a48');
  b.oval(16, 20, 10, 9, c.lo); b.oval(15, 19, 9.6, 8.6, c.mid); b.oval(11, 16, 3, 4, c.hi);
  b.rect(11, 7, 10, 5, c.mid); b.rect(10, 6, 12, 2, c.hi); b.hline(11, 11, 10, c.lo);
  for (let x = 8; x < 24; x += 3) b.px(x, 22 + (x % 2), '#e8c58e');                               // 流釉
  b.hline(9, 23, 14, mix('#9a6a48', 0.25));
});
function speaker(tall) {
  return mk(32, tall ? 96 : 64, b => {
    const H = tall ? 96 : 64;
    box(b, 3, 2, 26, H - 4, 3, BLACK);
    const cone = (cy, r) => { b.oval(16, cy, r, r, IRON.dk); b.oval(16, cy, r - 1.5, r - 1.5, IRON.mid); b.oval(16, cy, r * 0.35, r * 0.35, IRON.lo); b.px(14, cy - r + 2, IRON.hi); };
    cone(13, 5); cone(tall ? 34 : 34, 9); if (tall) cone(62, 9);
    b.rect(10, H - 10, 12, 2, '#5dff9b');
  });
}
function mic(color) {
  return mk(32, 64, b => {
    const t = tone(color);
    b.oval(16, 60, 8, 2, IRON.mid); b.oval(16, 59.5, 6, 1.2, IRON.hi);
    b.vline(16, 22, 38, IRON.mid); b.vline(15, 22, 38, IRON.hi);
    b.rect(14, 20, 5, 3, IRON.lo);
    b.rect(14, 8, 5, 12, t.mid); b.vline(14, 8, 12, t.hi);
    b.oval(16, 7, 4, 4, STEEL.mid); b.oval(15, 6, 2, 2, STEEL.hi); for (let x = 14; x < 19; x += 2) b.px(x, 8, STEEL.lo);
  });
}
const keyboard = mk(64, 32, b => {
  b.rect(8, 18, 2, 12, IRON.mid); b.rect(54, 18, 2, 12, IRON.mid); b.rect(8, 26, 48, 2, IRON.lo);
  box(b, 2, 4, 60, 16, 4, tone('#d8452f'));
  b.rect(5, 9, 54, 8, '#f4f1fa');
  for (let x = 5; x < 59; x += 4) b.vline(x, 9, 8, '#c8c0d8');
  for (let x = 7; x < 57; x += 4) if (x % 28 !== 23) b.rect(x, 9, 2, 5, '#2b1f2e');
  b.rect(10, 5, 8, 2, '#ffd84a'); b.px(44, 5, '#5dff9b'); b.px(47, 5, '#5dff9b');
});
const guitar = mk(32, 64, b => {
  b.rect(8, 58, 16, 3, IRON.mid); b.vline(10, 44, 15, IRON.lo); b.vline(22, 44, 15, IRON.lo);    // 架子
  b.rect(14, 4, 4, 30, DARK.mid); b.vline(14, 4, 30, DARK.hi);                                    // 琴頸
  b.rect(13, 1, 6, 5, BLACK.mid); b.px(12, 2, STEEL.mid); b.px(19, 2, STEEL.mid); b.px(12, 4, STEEL.mid); b.px(19, 4, STEEL.mid);
  const t = tone('#3f8fd8');
  b.oval(16, 42, 9, 9, t.mid); b.oval(16, 33, 6.5, 6, t.mid); b.oval(13, 36, 3, 4, t.hi); b.oval(19, 46, 4, 3, t.lo);
  b.rect(12, 42, 8, 2, '#f4f1fa'); b.rect(13, 37, 6, 2, IRON.mid);
  b.vline(16, 6, 38, '#e8e8f0');
});

// ================= 原本 proc.js 畫的(石燈籠、竹子、鯉魚旗…)重畫成同一個畫風 =================
const stone_lantern = mk(32, 64, b => {
  box(b, 7, 53, 18, 9, 3, STONE);
  b.rect(13, 40, 6, 14, STONE.mid); b.vline(13, 40, 14, STONE.hi); b.vline(18, 40, 14, STONE.lo);
  box(b, 8, 28, 16, 13, 2, STONE);
  b.rect(11, 32, 10, 6, '#ffd36b'); b.rect(12, 33, 8, 3, '#fff0b0');                                 // 燈火
  b.rect(3, 22, 26, 3, STONE.hi); b.rect(5, 25, 22, 3, STONE.lo); b.px(3, 21, STONE.hi); b.px(28, 21, STONE.hi);   // 笠
  b.oval(16, 18, 4, 4, STONE.mid); b.oval(15, 17, 2, 2, STONE.hi); b.rect(15, 12, 2, 3, STONE.mid);   // 寶珠
  b.px(9, 57, '#7cb85a'); b.px(10, 58, '#7cb85a'); b.px(22, 56, '#7cb85a');                          // 青苔
});
const bamboo = mk(32, 64, b => {
  const stalk = (x, top, t) => { b.rect(x, top, 4, 61 - top, t.mid); b.vline(x, top, 61 - top, t.hi); b.vline(x + 3, top, 61 - top, t.lo); for (let y = top + 9; y < 59; y += 11) b.hline(x, y, 4, t.dk); };
  stalk(6, 10, tone('#7cbf5a')); stalk(15, 3, tone('#5aa84a')); stalk(23, 13, tone('#88c96a'));
  const leaf = (x, y, dir) => { for (let i = 0; i < 7; i++) b.px(x + i * dir, y + (i > 4 ? 1 : 0), i < 2 ? PINE.lo : PINE.mid); b.px(x + dir * 2, y - 1, LEAF.hi); };
  for (const [x, y, d] of [[5, 12, -1], [10, 18, 1], [14, 6, -1], [20, 10, 1], [22, 16, 1], [27, 20, 1], [4, 28, -1], [19, 26, 1], [12, 34, -1]]) { leaf(x, y, d); leaf(x, y + 2, d); }
  b.rect(3, 58, 26, 4, '#6a5040');
});
const andon = mk(32, 48, b => {
  b.rect(8, 6, 16, 3, DARK.mid); b.hline(8, 6, 16, DARK.hi);
  b.rect(9, 9, 14, 30, '#fff3cf'); b.rect(9, 9, 14, 30, '#ffc85a55');
  b.vline(9, 9, 30, DARK.mid); b.vline(22, 9, 30, DARK.mid); b.vline(15, 9, 30, '#c9a46a'); b.vline(16, 9, 30, '#c9a46a');
  b.hline(10, 24, 12, '#c9a46a');
  b.rect(11, 12, 4, 10, '#ffffffaa');
  b.rect(8, 39, 16, 3, DARK.mid); b.rect(9, 42, 2, 4, DARK.lo); b.rect(21, 42, 2, 4, DARK.lo);
});
const koinobori = mk(32, 80, b => {
  b.rect(3, 4, 3, 72, '#d9c8a0'); b.vline(3, 4, 72, '#f0e2c0'); b.oval(4.5, 3, 2.5, 2.5, GOLD.mid);
  const fish = (y, c) => {
    const t = tone(c);
    b.rect(7, y, 18, 8, t.mid); b.hline(7, y, 18, t.hi); b.hline(7, y + 6, 18, mix(c, 0.45)); b.hline(7, y + 7, 18, t.lo);
    b.rect(25, y + 1, 2, 6, t.mid); b.px(27, y + 1, t.mid); b.px(28, y, t.mid); b.px(27, y + 6, t.mid); b.px(28, y + 7, t.mid);   // 尾巴
    for (let x = 13; x < 24; x += 3) b.px(x, y + 3, t.lo);                                             // 鱗
    b.oval(10, y + 3, 2, 2, '#ffffff'); b.px(10, y + 3, '#2b1f2e');
  };
  fish(8, '#2f3a8f'); fish(20, '#d23a3a'); fish(32, '#2f9e6a');
  b.rect(0, 74, 10, 4, '#6a5040');
});
const cabinet = mk(32, 64, b => {
  box(b, 4, 4, 24, 58, 2, tone('#3d5bd8'));
  b.rect(5, 6, 22, 7, '#ff4fb8'); b.rect(8, 8, 16, 3, '#ffe04a');                                 // 招牌
  b.rect(7, 16, 18, 16, '#1a1426'); b.rect(8, 17, 16, 14, '#2bd9ff');                               // 螢幕
  b.rect(10, 21, 4, 4, '#ffe04a'); b.rect(17, 24, 3, 3, '#ff4fb8'); b.hline(8, 29, 16, '#5dff9b');
  box(b, 4, 34, 24, 8, 3, tone('#2a3fa6'));
  b.rect(9, 33, 2, 4, '#c8c8d0'); b.oval(10, 33, 2, 1.6, '#ff4040'); b.px(17, 36, '#ffe04a'); b.px(20, 36, '#5dff9b'); b.px(23, 36, '#ff4fb8');
  b.rect(13, 48, 6, 5, '#1a1426'); b.hline(14, 49, 4, '#ffe04a');                                  // 投幣口
});
const torii = mk(64, 64, b => {
  b.rect(1, 5, 62, 4, '#2b1f2e'); b.px(0, 4, '#2b1f2e'); b.px(63, 4, '#2b1f2e');                   // 笠木(黑)
  b.rect(3, 9, 58, 4, RED.mid); b.hline(3, 9, 58, RED.hi); b.hline(3, 12, 58, RED.lo);
  b.rect(8, 18, 48, 4, RED.mid); b.hline(8, 18, 48, RED.hi); b.hline(8, 21, 48, RED.lo);              // 貫
  for (const x of [14, 45]) { b.rect(x, 13, 5, 47, RED.mid); b.vline(x, 13, 47, RED.hi); b.vline(x + 4, 13, 47, RED.lo); b.rect(x - 1, 56, 7, 6, '#2b1f2e'); }
  b.rect(28, 12, 8, 7, '#2b1f2e'); b.rect(29, 13, 6, 5, GOLD.hi);                                    // 匾額
});
const saisen = mk(32, 32, b => {
  box(b, 3, 10, 26, 19, 6, WOOD);
  for (let x = 5; x < 28; x += 3) b.vline(x, 10, 6, WOOD.dk);
  b.rect(3, 20, 26, 2, GOLD.mid); b.map(13, 22, ['##.##', '.###.', '##.##'], { '#': '#fff6e8' });
  b.px(8, 8, '#2b1f2e'); b.vline(16, 0, 9, '#d8452f'); b.oval(16, 2, 2, 2, GOLD.mid);               // 鈴繩
});
const eggpot = mk(32, 32, b => {
  b.oval(16, 20, 13, 8, IRON.lo); b.oval(16, 19, 12.5, 7.5, IRON.mid); b.oval(10, 17, 3, 2, IRON.hi);
  b.oval(16, 14, 11, 4, IRON.dk); b.oval(16, 14, 10, 3.2, '#7fd8d0');
  for (const x of [10, 15, 20]) { b.oval(x, 13.5, 2.2, 1.8, '#fff6e0'); b.px(x - 1, 13, '#ffffff'); }
  b.px(12, 6, '#ffffff88'); b.px(13, 4, '#ffffff66'); b.px(19, 7, '#ffffff88'); b.px(20, 5, '#ffffff66');   // 熱氣
  b.rect(3, 13, 3, 2, IRON.lo); b.rect(26, 13, 3, 2, IRON.lo);
});
const eggbasket = mk(32, 32, b => {
  const t = tone('#c9944e');
  b.oval(16, 22, 11, 6, t.lo); b.oval(16, 21, 10.5, 5.5, t.mid);
  for (let x = 7; x < 26; x += 3) b.vline(x, 18, 8, t.lo);
  for (const [x, y] of [[10, 16], [15, 15], [20, 16], [12, 19], [18, 19]]) { b.oval(x, y, 3, 2.6, '#f6ead0'); b.px(x - 1, y - 1, '#ffffff'); }
  for (let x = 6; x < 27; x++) b.px(x, 9 + Math.round(Math.pow((x - 16) / 10, 2) * 8), t.hi);         // 提把
});
const massagebed = mk(64, 32, b => {
  b.rect(6, 20, 3, 10, DARK.lo); b.rect(55, 20, 3, 10, DARK.lo);
  box(b, 2, 6, 60, 16, 10, WHITE, tone('#e2d8c6'));
  b.rrect(4, 7, 14, 8, '#ffffff', 2); b.hline(5, 14, 12, WHITE.lo);                                  // 枕頭
  b.rect(46, 7, 12, 8, tone('#9fd6c8').lo); b.rect(46, 7, 12, 6, tone('#9fd6c8').mid); b.hline(46, 7, 12, tone('#9fd6c8').hi);   // 摺好的毛巾
  b.rect(6, 28, 52, 2, DARK.mid);
});
const teaset = mk(32, 32, b => {
  b.oval(10, 18, 7, 6, IRON.lo); b.oval(10, 17, 6.5, 5.5, IRON.mid); b.oval(8, 15, 2, 2, IRON.hi);   // 茶釜
  b.rect(8, 10, 5, 3, IRON.lo); b.px(4, 16, IRON.mid); b.px(16, 16, IRON.mid);
  b.oval(23, 20, 5, 3.5, tone('#5f9e4a').lo); b.oval(23, 19, 4.5, 3, tone('#5f9e4a').mid); b.oval(23, 18.5, 3, 1.5, '#9fd88a');   // 抹茶碗
  b.rect(19, 25, 8, 2, '#f6ead0'); b.px(26, 10, '#ffffff88'); b.px(11, 7, '#ffffff88');
});

export const JP_KIT = {
  // 地板
  tatami: { w: 64, h: 64, tags: ['和風', '地板'], make: tatami },
  fl_wood: { w: 64, h: 64, tags: ['地板'], make: fl_wood },
  fl_wood2: { w: 64, h: 64, tags: ['地板'], make: fl_wood2 },
  fl_bath: { w: 64, h: 64, tags: ['浴場', '地板'], make: fl_bath },
  fl_stone: { w: 64, h: 64, tags: ['戶外', '地板'], make: fl_stone },
  fl_dining: { w: 64, h: 64, tags: ['地板'], make: fl_dining },
  rock: { w: 64, h: 64, tags: ['戶外', '地板'], make: rock },
  // 和室
  futon_top: { w: 64, h: 32, tags: ['和風', '家具'], make: futon_top },
  futon_blue: { w: 64, h: 32, tags: ['和風', '家具'], make: futonBlanket(FUTON.blue) },
  futon_gold: { w: 64, h: 32, tags: ['和風', '家具'], make: futonBlanket(FUTON.gold) },
  futon_gray: { w: 64, h: 32, tags: ['和風', '家具'], make: futonBlanket(FUTON.gray) },
  futon_purple: { w: 64, h: 32, tags: ['和風', '家具'], make: futonBlanket(FUTON.purple) },
  zabuton: { w: 32, h: 32, tags: ['和風', '家具'], make: zabuton },
  lowtable: { w: 64, h: 64, tags: ['和風', '家具'], make: lowtable },
  kotatsu: { w: 64, h: 64, tags: ['和風', '家具'], make: kotatsu },
  teatable: { w: 64, h: 64, tags: ['和風', '家具'], make: teatable },
  scroll1: { w: 32, h: 64, tags: ['和風', '牆面'], make: scroll(1) },
  scroll2: { w: 32, h: 64, tags: ['和風', '牆面'], make: scroll(2) },
  vase: { w: 32, h: 64, tags: ['和風', '裝飾'], make: vase },
  bonsai_s: { w: 32, h: 64, tags: ['和風', '裝飾', '植物'], make: bonsai(false) },
  bonsai_l: { w: 32, h: 96, tags: ['和風', '裝飾', '植物'], make: bonsai(true) },
  shoji_win: { w: 96, h: 64, tags: ['和風', '牆面'], make: shoji_win },
  irori: { w: 64, h: 32, tags: ['和風', '家具'], make: irori },
  heater: { w: 32, h: 32, tags: ['和風', '小物'], make: heater },
  tansu: { w: 32, h: 96, tags: ['和風', '家具'], make: tansu },
  altar: { w: 32, h: 96, tags: ['和風', '家具'], make: altar },
  bench: { w: 64, h: 64, tags: ['和風', '家具'], make: bench },
  dining: { w: 64, h: 96, tags: ['和風', '家具'], make: dining(false) },
  dining_g: { w: 64, h: 96, tags: ['和風', '家具'], make: dining(true) },
  genkan: { w: 64, h: 32, tags: ['和風', '家具'], make: genkan },
  // 浴場
  tub: { w: 64, h: 96, tags: ['浴場', '家具'], make: tub },
  bucket: { w: 32, h: 32, tags: ['浴場', '小物'], make: bucket(false) },
  bucket_blue: { w: 32, h: 32, tags: ['浴場', '小物'], make: bucket(true) },
  duck: { w: 32, h: 32, tags: ['浴場', '小物'], make: duck },
  shower: { w: 32, h: 64, tags: ['浴場', '家具'], make: shower },
  screen: { w: 96, h: 96, tags: ['和風', '家具'], make: screen },
  sink: { w: 64, h: 64, tags: ['浴場', '家具'], make: sink },
  // 櫃台、土產店、庭園
  counter: { w: 96, h: 64, tags: ['和風', '家具'], make: counter },
  crates_a: { w: 64, h: 96, tags: ['和風', '家具'], make: crates(false) },
  crates_b: { w: 64, h: 96, tags: ['和風', '家具'], make: crates(true) },
  flowers: { w: 64, h: 64, tags: ['裝飾', '植物'], make: flowers },
  garland: { w: 96, h: 64, tags: ['和風', '裝飾'], make: garland },
  bush: { w: 32, h: 64, tags: ['裝飾', '植物'], make: bush },
  // 休憩室、卡拉 OK、擺設
  sofa: { w: 96, h: 64, tags: ['家具'], make: sofa('#4f5f9f') },
  sofa_w: { w: 96, h: 64, tags: ['家具'], make: sofa('#e8dcc4') },
  bookshelf: { w: 64, h: 64, tags: ['家具'], make: bookshelf },
  fireplace: { w: 64, h: 68, tags: ['家具'], make: fireplace },
  palm: { w: 32, h: 64, tags: ['裝飾', '植物'], make: palm },
  plant: { w: 32, h: 64, tags: ['裝飾', '植物'], make: plant },
  fishbowl: { w: 32, h: 32, tags: ['裝飾'], make: fishbowl },
  pot: { w: 32, h: 32, tags: ['和風', '裝飾'], make: pot },
  speaker: { w: 32, h: 96, tags: ['卡拉OK', '家具'], make: speaker(true) },
  speaker_s: { w: 32, h: 64, tags: ['卡拉OK', '家具'], make: speaker(false) },
  mic: { w: 32, h: 64, tags: ['卡拉OK', '小物'], make: mic('#3a3440') },
  mic2: { w: 32, h: 64, tags: ['卡拉OK', '小物'], make: mic('#ff6fae') },
  keyboard: { w: 64, h: 32, tags: ['卡拉OK', '家具'], make: keyboard },
  guitar: { w: 32, h: 64, tags: ['卡拉OK', '小物'], make: guitar },
  // 原本 proc.js 的
  stone_lantern: { w: 32, h: 64, tags: ['和風', '裝飾'], make: stone_lantern },
  bamboo: { w: 32, h: 64, tags: ['和風', '裝飾', '植物'], make: bamboo },
  andon: { w: 32, h: 48, tags: ['和風', '裝飾'], make: andon },
  koinobori: { w: 32, h: 80, tags: ['和風', '裝飾'], make: koinobori },
  cabinet: { w: 32, h: 64, tags: ['家具'], make: cabinet },
  torii: { w: 64, h: 64, tags: ['和風', '家具'], make: torii },
  saisen: { w: 32, h: 32, tags: ['和風', '家具'], make: saisen },
  eggpot: { w: 32, h: 32, tags: ['和風', '小物'], make: eggpot },
  eggbasket: { w: 32, h: 32, tags: ['和風', '小物'], make: eggbasket },
  massagebed: { w: 64, h: 32, tags: ['家具'], make: massagebed },
  teaset: { w: 32, h: 32, tags: ['和風', '小物'], make: teaset },
};
