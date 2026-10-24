// DayClock 管營業時鐘；planArrivals 排來客；rng(seed) 讓同一種子可重現。

// ===== 亂數、到店計畫與營業時鐘 =====

/** 建立 16807 線性同餘亂數，讓相同種子的開局可以重現。 */
export const rng = seed => {
  let s = (Math.trunc(seed) % 2147483647 + 2147483647) % 2147483647 || 1;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
};

/** 按非負權重抽取一個值，支援遊戲提供自己的亂數來源。 */
export function weightedPick(entries, rnd = Math.random) {
  const total = entries.reduce((s, e) => s + Math.max(0, e[1]), 0);
  let n = rnd() * total;
  for (const [v, w] of entries) {
    n -= Math.max(0, w);
    if (n < 0) {
      return v;
    }
  }
  return entries.at(-1)?.[0];
}

/** 建立到店資料並按時間排序，pick 回傳各客人的額外資料。 */
export function planArrivals(n, {
  from = .03,
  to = .85,
  pick = () => ({}),
  rnd = Math.random
} = {}) {
  return Array.from({
    length: n
  }, () => ({
    t: from + rnd() * (to - from),
    ...pick()
  })).sort((a, b) => a.t - b.t);
}

/** 依營業天數取得季節，預設每七天換季。 */
export const seasonOf = (day, perSeason = 7, seasons = ['春', '夏', '秋', '冬']) => seasons[Math.floor((day - 1) / perSeason) % seasons.length];
export class DayClock {

  /** 設定一天的真實秒數與開關店時刻，初始進度為零。 */
  constructor({
    seconds = 110,
    openHour = 10,
    closeHour = 20
  } = {}) {
    Object.assign(this, {
      seconds,
      openHour,
      closeHour,
      t: 0
    });
  }

  /** 將當日進度重設為零。 */
  start() {
    this.t = 0;
  }

  /** 推進營業時間，將進度限制在 0～1。 */
  tick(dt) {
    this.t = Math.min(1, Math.max(0, this.t + dt / this.seconds));
    return this.t;
  }

  /** 判斷是否已進入當天的傍晚時段。 */
  night() {
    return this.t >= .7;
  }

  /** 產生十分鐘一跳的時鐘文字與日夜圖示。 */
  clockText() {
    const m = Math.floor((this.openHour * 60 + (this.closeHour - this.openHour) * 60 * this.t) / 10) * 10;
    return `${this.night() ? '🌙' : '☀️'} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
}
