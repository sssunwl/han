// 客人通用流程：進門 → 排隊 → 被服務 → 使用設施／座位 → 評價 → 離開。

// ===== 角色移動、泡泡與排隊 =====
// goTo 設路徑；每幀 moveAgent、tickBubble、runState，遊戲自行提供各狀態處理器。
import { tileOf } from './grid.js';

/** 沿角色的 path 前進，更新方向，走完後只呼叫一次 then。 */
export function moveAgent(a, dt, speed = 55) {
  a.frame = (a.frame || 0) + dt * 9;
  let step = speed * dt;
  while (step > 0 && a.path?.length) {
    const [x, y] = a.path[0];
    const dx = x - a.x;
    const dy = y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > .5) {
      a.dir = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 0 : 2 : dy > 0 ? 3 : 1;
    }
    if (d <= step) {
      a.x = x;
      a.y = y;
      a.path.shift();
      step -= d;
    } else {
      a.x += dx / d * step;
      a.y += dy / d * step;
      step = 0;
    }
  }
  if (!a.path?.length) {
    a.moving = false;
    const f = a.then;
    a.then = null;
    f?.();
  }
}

/** 尋找通往目標格的路徑，設定角色移動與抵達回呼。 */
export function goTo(grid, a, tile, then, opts = {}) {
  const path = grid.findPath(opts.from || tileOf(a.x, a.y, opts.T || 32), tile, opts.toPx);
  if (!path) {
    return false;
  }
  a.path = path;
  a.then = then;
  a.moving = true;
  return true;
}

/** 替角色顯示一段有時限的泡泡文字。 */
export function bubble(a, text, sec = 2) {
  a.bubble = {
    text,
    until: sec
  };
}

/** 推進泡泡倒數，時間到就移除。 */
export function tickBubble(a, dt) {
  if (a.bubble && (a.bubble.until -= dt) <= 0) {
    a.bubble = null;
  }
}
export class Queue {

  /** 建立排隊站位與獨立的客人 ID 清單。 */
  constructor(spots = []) {
    this.spots = spots;
    this.ids = [];
  }

  /** 讓 ID 加入隊尾；重複加入不會佔用第二個位置。 */
  join(id) {
    if (!this.ids.includes(id)) {
      this.ids.push(id);
    }
    return this.indexOf(id);
  }

  /** 將指定 ID 從隊伍移除。 */
  remove(id) {
    this.ids = this.ids.filter(v => v !== id);
  }

  /** 回傳客人在隊伍中的索引；不在隊伍時為 −1。 */
  indexOf(id) {
    return this.ids.indexOf(id);
  }

  /** 取得隊首 ID，空隊伍回傳 null。 */
  front() {
    return this.ids[0] ?? null;
  }

  /** 取得客人對應的站位；超出已配置站位時回傳 null。 */
  spotOf(id) {
    const i = this.indexOf(id);
    return i < 0 ? null : this.spots[i] || null;
  }
}

/** 呼叫目前狀態的處理器，由遊戲自行定義各狀態規則。 */
export const runState = (a, dt, handlers) => handlers[a.state]?.(a, dt);
