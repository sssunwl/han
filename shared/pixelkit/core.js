/* ============================================================
   pixelkit 核心:純 JS 的點陣圖(不靠 DOM)
   同一份繪圖程式,瀏覽器拿去轉 canvas、Node 拿去輸出 PNG(tools/pixelkit_export.mjs)。

   畫風規則(全部素材都照這個):
   - 俯視斜 3/4,32px 一格
   - 外框統一深紫棕 OUTLINE,畫完由 outline() 自動描,不用手畫
   - 每個顏色用 tone() 拿「亮 / 本色 / 暗」三階,光從左上來
   參考 LimeZu Modern Interiors 的視角與比例,但每一點都是這裡的程式畫的,沒有描任何一張圖。
   ============================================================ */

export const OUTLINE = '#2b1f2e';

const rgbaCache = new Map();
export function rgba(hex) {
  let v = rgbaCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
  rgbaCache.set(hex, v);
  return v;
}
const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
/** 往黑(k<0)或往白(k>0)混一點 */
export function mix(hex, k) {
  const [r, g, b] = rgba(hex), t = k > 0 ? 255 : 0, a = Math.abs(k);
  return '#' + hex2(r + (t - r) * a) + hex2(g + (t - g) * a) + hex2(b + (t - b) * a);
}
/** 三階色:hi 亮面、mid 本色、lo 陰影、dk 最暗(縫線、內陰影) */
export function tone(hex) {
  return { hi: mix(hex, 0.28), mid: hex, lo: mix(hex, -0.2), dk: mix(hex, -0.4) };
}

export class Bmp {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const [r, g, b, a] = rgba(c), i = (y * this.w + x) * 4;
    if (a === 255) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255; return; }
    // 半透明(玻璃、反光):疊在原本的顏色上
    const k = a / 255, ka = this.d[i + 3] / 255, oa = k + ka * (1 - k) || 1;
    this.d[i] = (r * k + this.d[i] * ka * (1 - k)) / oa;
    this.d[i + 1] = (g * k + this.d[i + 1] * ka * (1 - k)) / oa;
    this.d[i + 2] = (b * k + this.d[i + 2] * ka * (1 - k)) / oa;
    this.d[i + 3] = oa * 255;
  }
  rect(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  /** 圓角矩形(r=1 或 2) */
  rrect(x, y, w, h, c, r = 1) {
    this.rect(x + r, y, w - 2 * r, h, c); this.rect(x, y + r, r, h - 2 * r, c); this.rect(x + w - r, y + r, r, h - 2 * r, c);
    if (r === 2) { this.px(x + 1, y + 1, c); this.px(x + w - 2, y + 1, c); this.px(x + 1, y + h - 2, c); this.px(x + w - 2, y + h - 2, c); }
  }
  /** 實心橢圓 */
  oval(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
  }
  /** 照字串圖畫:每個字元查表換顏色,'.' 或空白是透明 */
  map(x, y, rows, pal) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) this.px(x + i, y + j, c); } });
  }
  alpha(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  /** 把另一張貼上來(flip = 左右鏡像) */
  blit(src, ox, oy, flip = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (!src.d[i + 3]) continue;
      const tx = ox + (flip ? src.w - 1 - x : x), ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const j = (ty * this.w + tx) * 4;
      if (src.d[i + 3] === 255) { this.d[j] = src.d[i]; this.d[j + 1] = src.d[i + 1]; this.d[j + 2] = src.d[i + 2]; this.d[j + 3] = 255; }
      else this.px(tx, ty, '#' + hex2(src.d[i]) + hex2(src.d[i + 1]) + hex2(src.d[i + 2]) + hex2(src.d[i + 3]));
    }
  }
}

/** 自動描外框:透明、而且上下左右有實心的格子 → 塗外框色 */
export function outline(b, c = OUTLINE) {
  const add = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (b.alpha(x, y) > 40) continue;
    if (b.alpha(x - 1, y) > 40 || b.alpha(x + 1, y) > 40 || b.alpha(x, y - 1) > 40 || b.alpha(x, y + 1) > 40) add.push([x, y]);
  }
  for (const [x, y] of add) b.px(x, y, c);
  return b;
}

/** 做一張素材:fn 在 (1,1) 起畫,四周留 1px 給外框 */
export function sprite(w, h, fn, { line = true } = {}) {
  const b = new Bmp(w, h);
  fn(b);
  return line ? outline(b) : b;
}

/** 瀏覽器用:轉成 canvas(有快取) */
const canvasCache = new WeakMap();
export function toCanvas(b) {
  let c = canvasCache.get(b);
  if (c) return c;
  c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(b.d), b.w, b.h), 0, 0);
  canvasCache.set(b, c);
  return c;
}
