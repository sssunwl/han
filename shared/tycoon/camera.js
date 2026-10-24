// Camera 使用世界像素；resize 保留中心，apply 設定畫布轉換，worldAt 接 client 座標。

// ===== 世界像素與鏡頭 =====
export class Camera {

  /** 建立世界範圍與鏡頭狀態，立即配合畫布大小調整。 */
  constructor(canvas, {
    worldW,
    worldH,
    maxScale = 2.4
  }) {
    Object.assign(this, {
      canvas,
      worldW,
      worldH,
      maxScale,
      x: 0,
      y: 0,
      s: 1,
      w: 0,
      h: 0
    });
    this.resize();
  }

  /** 更新畫布尺寸與 dpr（最多 2），保留原本畫面中心。 */
  resize() {
    const cx = this.x + this.w / this.s / 2;
    const cy = this.y + this.h / this.s / 2;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.minScale = Math.min(this.w / this.worldW, this.h / this.worldH, .8);
    this.s = Math.max(this.minScale, this.s);
    this.x = cx - this.w / this.s / 2;
    this.y = cy - this.h / this.s / 2;
    this.clamp();
  }

  /** 限制鏡頭邊界；世界比可見區小時置中顯示。 */
  clamp() {
    this.x = Math.max(Math.min(0, (this.worldW - this.w / this.s) / 2), Math.min(Math.max(0, this.worldW - this.w / this.s), this.x));
    this.y = Math.max(Math.min(0, (this.worldH - this.h / this.s) / 2), Math.min(Math.max(0, this.worldH - this.h / this.s), this.y));
  }

  /** 以畫布內的螢幕座標為中心縮放，維持指向的世界位置。 */
  zoomAt(k, sx, sy) {
    const wx = this.x + sx / this.s;
    const wy = this.y + sy / this.s;
    this.s = Math.max(this.minScale, Math.min(this.maxScale, this.s * k));
    this.x = wx - sx / this.s;
    this.y = wy - sy / this.s;
    this.clamp();
  }

  /** 以世界像素矩形對焦，直式畫面可另設縮放上限。 */
  focus(r, {
    portraitMax = 1.2
  } = {}) {
    this.s = Math.max(this.minScale, Math.min(this.maxScale, this.w / r.w, this.h / r.h, this.h > this.w ? portraitMax : this.maxScale));
    this.x = r.x + r.w / 2 - this.w / this.s / 2;
    this.y = r.y + r.h / 2 - this.h / this.s / 2;
    this.clamp();
  }

  /** 將 dpr、縮放與鏡頭位移套用至繪圖環境。 */
  apply(ctx) {
    ctx.setTransform(this.dpr * this.s, 0, 0, this.dpr * this.s, -this.x * this.dpr * this.s, -this.y * this.dpr * this.s);
    ctx.imageSmoothingEnabled = false;
  }

  /** 將 client 座標換成世界像素座標。 */
  worldAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return [this.x + (x - r.left) / this.s, this.y + (y - r.top) / this.s];
  }

  /** 將世界像素座標換成畫布內的螢幕座標。 */
  toScreen(x, y) {
    return [(x - this.x) * this.s, (y - this.y) * this.s];
  }

  /** 縮小世界時補償文字大小，讓標籤仍能閱讀。 */
  kz() {
    return 1 / Math.min(1, this.s);
  }
}
