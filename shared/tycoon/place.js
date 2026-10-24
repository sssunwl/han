// Placer 管擺放交易；canPlace 回傳錯誤文字或 null。搬移先 takeOut，取消必 putBack。

// ===== 擺放與搬移交易 =====
export class Placer {

  /** 接收驗證、更新顯示與搬移交易的回呼。 */
  constructor(opts) {
    Object.assign(this, opts);
    this.p = null;
  }

  /** 回傳目前是否正在擺放物件。 */
  get active() {
    return !!this.p;
  }

  /** 取消上一筆擺放，再複製新物件並檢查初始位置。 */
  start(p) {
    this.cancel();
    this.p = {
      ...p
    };
    this.moveTo(p.x, p.y);
    return this.p;
  }

  /** 記住原物件並暫時取出，讓取消時可以完整還原。 */
  startMove(obj, p) {
    this.start(p);
    this.original = obj;
    this.takeOut(obj);
    this.moveTo(p.x, p.y);
  }

  /** 更新格子位置與 reason，通知介面顯示是否合法。 */
  moveTo(x, y) {
    if (!this.p) {
      return;
    }
    Object.assign(this.p, {
      x,
      y
    });
    this.p.reason = this.canPlace(this.p) || null;
    this.onChange?.(this.p);
  }

  /** 記住手指相對物件的位置，避免拖曳開始時跳動。 */
  grab(wx, wy, T = 32) {
    if (this.p) {
      this.grip = [wx / T - this.p.x, wy / T - this.p.y];
    }
  }

  /** 依抓取偏移將指標位置換成新的格子位置。 */
  dragTo(wx, wy, T = 32) {
    if (this.p) {
      const [x, y] = this.grip || [this.p.w / 2, this.p.h / 2];
      this.moveTo(Math.round(wx / T - x), Math.round(wy / T - y));
    }
  }

  /** 重新驗證擺放；合法才結束交易並回傳物件。 */
  confirm() {
    if (!this.p) {
      return null;
    }
    this.p.reason = this.canPlace(this.p) || null;
    if (this.p.reason) {
      return null;
    }
    const p = this.p;
    this.p = null;
    this.original = null;
    return p;
  }

  /** 取消擺放；若是搬移，就把原物件放回去。 */
  cancel() {
    if (this.original) {
      this.putBack(this.original);
    }
    this.original = null;
    this.p = null;
    this.grip = null;
  }
}
