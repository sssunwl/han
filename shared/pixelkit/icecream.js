/* 雪糕店原創素材：全部用 Bmp 畫；ICE_KIT 可直接供預覽頁與遊戲載入。 */
import { Bmp, outline, tone } from './core.js';

// ===== 共用色票與立體明暗 =====
const pink = tone('#ff9fbe');
const steel = tone('#b9c2d6');
const wood = tone('#c98a55');

/** 畫左上受光、底部陰影的立體盒子。 */
function box(b, x, y, w, h, c) {
  const t = tone(c);
  b.rect(x, y, w, h, t.mid);
  b.rect(x, y, w, 3, t.hi);
  b.vline(x, y, h, t.hi);
  b.rect(x, y + h - 3, w, 3, t.lo);
}

// ===== 雪糕與操作面板素材 =====

/** 畫一至三球的甜筒或杯裝，彩虹與配料都以點陣生成。 */
export function treat({
  kind = 'cone',
  scoops = ['#ff9fbe'],
  topping = null
} = {}) {
  const b = new Bmp(20, 36);
  if (kind === 'cup') {
    box(b, 4, 25, 12, 9, '#ff9fbe');
    b.rect(3, 24, 14, 3, '#fff1dc');
  } else {
    for (let y = 24; y < 35; y++) {
      const w = Math.max(1, Math.ceil((35 - y) * .55));
      b.rect(10 - w, y, w * 2, 1, y % 3 ? '#e3a85e' : '#af743c');
    }
  }
  scoops.slice(0, 3).forEach((c, i) => {
    const cy = 23 - i * 8;
    const t = tone(c === 'rainbow' ? '#ff9fbe' : c);
    b.oval(10, cy, 8, 6, t.mid);
    b.oval(11, cy + 3, 6, 2, t.lo);
    if (c === 'rainbow') {
      for (let y = -5; y < 5; y++) {
        for (let x = -7; x < 7; x++) {
          if (x * x / 64 + y * y / 36 < 1) {
            b.px(10 + x, cy + y, ['#ff809b', '#ffcf4a', '#9fe8cf', '#8fd3ff', '#b98cff'][Math.floor((y + 5) / 2)]);
          }
        }
      }
    }
    b.rect(5, cy - 3, 3, 2, t.hi);
  });
  const y = 23 - (Math.min(3, scoops.length) - 1) * 8;
  if (topping === 'cherry') {
    b.oval(10, y - 3, 2, 2, '#dd355c');
    b.vline(11, y - 7, 3, '#5a8a3a');
  }
  if (topping === 'sprinkles' || topping === 'gold') {
    for (let i = 0; i < 9; i++) {
      b.rect(4 + i * 7 % 12, y - 3 + i * 3 % 5, 2, 1, topping === 'gold' ? '#ffd84a' : ['#ff4f86', '#8fd3ff', '#fff36a'][i % 3]);
    }
  }
  if (topping === 'choco') {
    b.hline(4, y - 2, 12, '#633c32');
    for (let x = 5; x < 17; x += 4) {
      b.vline(x, y - 2, 4, '#633c32');
    }
  }
  return outline(b);
}

/** 畫冰櫃口味桶，供做雪糕面板的按鈕使用。 */
export function tub(color = '#ff9fbe') {
  const b = new Bmp(24, 16);
  box(b, 2, 4, 20, 10, '#b9c2d6');
  b.oval(12, 6, 9, 4, color === 'rainbow' ? '#b98cff' : color);
  b.hline(5, 4, 8, '#ffffff');
  return outline(b);
}

// ===== 座位 =====

/** 畫單人高腳椅。 */
export function stool() {
  const b = new Bmp(32, 32);
  b.rect(14, 15, 4, 14, steel.mid);
  b.oval(16, 28, 8, 2, steel.lo);
  b.oval(16, 13, 12, 6, pink.lo);
  b.oval(16, 11, 12, 5, pink.mid);
  b.oval(13, 9, 7, 2, pink.hi);
  return outline(b);
}

/** 畫側面沙發，右向款以原圖鏡像保持一致。 */
export function sofa({
  dir = 'left'
} = {}) {
  const b = new Bmp(32, 32);
  box(b, 5, 14, 23, 13, '#c5a0df');
  box(b, 3, 4, 7, 22, '#b98cce');
  box(b, 6, 23, 23, 5, '#9c6ab8');
  b.rect(7, 28, 3, 3, wood.lo);
  b.rect(24, 28, 3, 3, wood.lo);
  if (dir === 'right') {
    const n = new Bmp(32, 32);
    n.blit(b, 0, 0, true);
    return outline(n);
  }
  return outline(b);
}

// ===== 店內裝潢 =====

/** 畫三顆帶繩氣球。 */
export function balloons() {
  const b = new Bmp(32, 48);
  ['#ff9fbe', '#8fd3ff', '#ffd84a'].forEach((c, i) => {
    const x = 8 + i * 8;
    const y = 10 + i % 2 * 7;
    b.vline(x, y + 8, 35 - y, '#e7d7e6');
    b.oval(x, y, 6, 9, c);
    b.rect(x - 3, y - 5, 2, 3, tone(c).hi);
  });
  return outline(b);
}

/** 畫立燈，燈罩上緣較亮。 */
export function lamp() {
  const b = new Bmp(32, 64);
  b.oval(16, 59, 10, 3, steel.lo);
  b.rect(15, 20, 3, 39, steel.mid);
  for (let y = 4; y < 23; y++) {
    const w = 7 + Math.floor(y / 5);
    b.rect(16 - w, y, w * 2, 1, y < 8 ? '#fff6ca' : '#ffdba0');
  }
  b.hline(5, 23, 22, '#bf8c75');
  return outline(b);
}

/** 畫圓形分層地毯。 */
export function rug() {
  const b = new Bmp(64, 32);
  b.oval(32, 17, 30, 13, pink.lo);
  b.oval(32, 15, 28, 11, pink.mid);
  b.oval(32, 15, 22, 8, pink.hi);
  b.oval(32, 15, 16, 5, pink.mid);
  return outline(b);
}

/** 畫點唱機的燈框、選曲面板與喇叭。 */
export function jukebox() {
  const b = new Bmp(32, 48);
  b.rrect(3, 3, 26, 42, '#b875af', 2);
  b.oval(16, 13, 12, 10, '#ffd84a');
  b.oval(16, 13, 9, 7, '#6a476f');
  box(b, 7, 20, 18, 11, '#8fd3ff');
  box(b, 8, 33, 16, 9, '#4a3f58');
  for (let x = 10; x < 24; x += 3) {
    b.vline(x, 34, 7, '#c5a0df');
  }
  return outline(b);
}

/** 畫玻璃魚缸、魚群與下方木櫃。 */
export function aquarium() {
  const b = new Bmp(64, 48);
  box(b, 2, 29, 60, 16, '#c98a55');
  box(b, 2, 4, 60, 28, '#8fd3ff');
  b.rect(5, 7, 54, 21, '#abe8ed');
  for (let x = 9; x < 60; x += 16) {
    b.oval(x, 15 + x % 7, 4, 2, '#ffae67');
    b.rect(x - 5, 14 + x % 7, 2, 4, '#ffcf4a');
    b.vline(x + 2, 22, 6, '#68ad75');
  }
  b.hline(3, 5, 58, '#ffffff');
  return outline(b);
}

/** 畫粉紫色的霓虹甜筒招牌。 */
export function neon() {
  const b = new Bmp(32, 48);
  box(b, 3, 2, 26, 43, '#4c315e');
  const t = treat({
    scoops: ['#ff7fa8', '#b98cff']
  });
  b.blit(t, 6, 6);
  for (let x = 4; x < 29; x += 3) {
    b.px(x, 3, '#ffb1ee');
    b.px(x, 43, '#ffb1ee');
  }
  return outline(b);
}

/** 畫透明糖果球與轉鈕機身。 */
export function gumball() {
  const b = new Bmp(32, 48);
  box(b, 7, 28, 18, 16, '#ff7fa8');
  b.oval(16, 17, 12, 13, '#d6f2ff');
  for (let i = 0; i < 23; i++) {
    b.oval(7 + i * 7 % 18, 12 + i * 5 % 15, 2, 2, ['#ff7fa8', '#ffd84a', '#9fe8cf'][i % 3]);
  }
  box(b, 4, 29, 24, 5, '#ff7fa8');
  b.rect(14, 35, 5, 3, '#fff1dc');
  b.rect(12, 41, 9, 3, '#4a3f58');
  return outline(b);
}

/** 畫有表情的雪糕人偶看板。 */
export function mascot() {
  const b = new Bmp(32, 48);
  box(b, 7, 43, 20, 3, '#c98a55');
  b.blit(treat({
    scoops: ['#fff1c9', '#ff9fbe', '#9fe8cf']
  }), 6, 4);
  b.px(12, 15, '#3b2a55');
  b.px(20, 15, '#3b2a55');
  b.hline(14, 19, 5, '#e76a8a');
  b.rect(3, 25, 5, 3, '#fff1c9');
  b.rect(24, 25, 5, 3, '#fff1c9');
  return outline(b);
}

// ===== 清潔標記與街景 =====

/** 畫吃完的空杯與滴痕，作為髒座位標記。 */
export function trash() {
  const b = new Bmp(16, 16);
  b.oval(8, 12, 7, 2, '#b89b9b');
  box(b, 5, 4, 7, 8, '#efd8e1');
  b.rect(4, 3, 9, 2, '#fff1dc');
  b.rect(9, 1, 1, 5, '#c98a55');
  return outline(b);
}

/** 畫可接續的人行道磚，不加外輪廓。 */
export function sidewalk() {
  const b = new Bmp(32, 32);
  b.rect(0, 0, 32, 32, '#b9b1c4');
  for (let y = 0; y < 32; y += 16) {
    b.hline(0, y, 32, '#d9d2df');
    b.hline(0, y + 15, 32, '#948b9e');
    b.vline(y ? 16 : 0, y, 16, '#948b9e');
  }
  return b;
}

/** 畫可接續的店面玻璃與低牆。 */
export function storefront() {
  const b = new Bmp(32, 32);
  b.rect(0, 0, 32, 18, '#c1e5efaa');
  b.rect(0, 18, 32, 14, '#ffb1c8');
  b.vline(0, 0, 32, '#fff1dc');
  b.rect(0, 17, 32, 3, '#fff1dc');
  b.hline(0, 31, 32, '#b26c91');
  b.hline(5, 5, 15, '#ffffff99');
  return b;
}

/** 畫小費罐與罐內零錢。 */
export function tipjar() {
  const b = new Bmp(16, 16);
  box(b, 3, 4, 10, 10, '#abe8ed');
  b.oval(8, 4, 5, 2, '#d9f4fc');
  b.rect(5, 8, 6, 3, '#ffd84a');
  return outline(b);
}

// ===== 預覽與遊戲共用清單 =====
export const ICE_KIT = Object.fromEntries(Object.entries({
  treat: () => treat(),
  tub: () => tub(),
  stool,
  sofa,
  balloons,
  lamp,
  rug,
  jukebox,
  aquarium,
  neon,
  gumball,
  mascot,
  trash,
  sidewalk,
  storefront,
  tipjar
}).map(([name, make]) => {
  const b = make();
  return [name, {
    w: b.w,
    h: b.h,
    tags: ['雪糕店'],
    make
  }];
}));
