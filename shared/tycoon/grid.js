// 通用格子：setWalk 設可走區，再用 bfs／findDoor 驗證動線，findPath 回傳像素路徑。

// ===== 通行表、尋路與入口 =====

/** 接受座標陣列或物件，統一轉為 [x, y]。 */
const xy = p => Array.isArray(p) ? p : [p.x, p.y];

/** 將世界像素座標換成所在的格子座標。 */
export const tileOf = (px, py, T = 32) => [Math.floor(px / T), Math.floor(py / T)];

/** 檢查兩個座標之間是否在指定半徑內。 */
export const near = (a, b, rad) => Math.hypot(xy(a)[0] - xy(b)[0], xy(a)[1] - xy(b)[1]) <= rad;
export class Grid {

  /** 建立格子大小，預設全部可通行。 */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.setWalk(() => true);
  }

  /** 檢查座標是否位於格子範圍內。 */
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** 以判斷函式重建 walk[y][x] 通行表。 */
  setWalk(fn) {
    this.walk = Array.from({
      length: this.rows
    }, (_, y) => Array.from({
      length: this.cols
    }, (_, x) => !!fn(x, y)));
    return this;
  }

  /** 從起點廣度搜尋，回傳距離表；不可到達的格子為 −1。 */
  bfs(start, walk = this.walk) {
    const [sx, sy] = xy(start);
    const d = walk.map(r => r.map(() => -1));
    const q = [];
    if (this.inside(sx, sy) && walk[sy][sx]) {
      d[sy][sx] = 0;
      q.push([sx, sy]);
    }
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (this.inside(nx, ny) && walk[ny][nx] && d[ny][nx] < 0) {
          d[ny][nx] = d[y][x] + 1;
          q.push([nx, ny]);
        }
      }
    }
    return d;
  }

  /** 回傳包含起終點的像素路徑；找不到路就回傳 null。 */
  findPath(from, to, toPx = (x, y) => [(x + .5) * 32, (y + .8) * 32]) {
    const a = xy(from);
    const b = xy(to);
    const d = this.bfs(a);
    let [x, y] = b;
    if (!this.inside(x, y) || d[y][x] < 0) {
      return null;
    }
    const out = [toPx(x, y)];
    while (d[y][x] > 0) {
      const n = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].find(([nx, ny]) => this.inside(nx, ny) && d[ny][nx] === d[y][x] - 1);
      [x, y] = n;
      out.push(toPx(x, y));
    }
    return out.reverse();
  }

  /** 找矩形四邊可達、且離起點最近的外側格子。 */
  findDoor(r, d) {
    const c = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      c.push([x, r.y - 1, 'top'], [x, r.y + r.h, 'bottom']);
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      c.push([r.x - 1, y, 'left'], [r.x + r.w, y, 'right']);
    }
    return c.filter(([x, y]) => this.inside(x, y) && d[y][x] >= 0).map(([x, y, side]) => ({
      x,
      y,
      side,
      d: d[y][x]
    })).sort((a, b) => a.d - b.d)[0] || null;
  }

  /** 以目前使用的格子尺寸將像素換成格子座標。 */
  tileOf(px, py, T = 32) {
    return tileOf(px, py, T);
  }
}
