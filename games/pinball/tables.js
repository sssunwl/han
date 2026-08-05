/* ============================================================
   機台資料
   所有機台共用同一副外殼(邊框、發球道、下方檔板),
   差別在裡面的擺設、配色與過關分數 —— 要加新機台只要在最下面多加一筆。
   座標系統固定 400 × 700,畫面再等比例縮放。
   ============================================================ */

export const TW = 400, TH = 700;      // 檯面尺寸
export const BALL_R = 9;

/** 產生橢圓弧線上的點(角度用度數,y 軸向下) */
function arc(cx, cy, rx, ry, a0, a1, steps = 22) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (a0 + (a1 - a0) * i / steps) * Math.PI / 180;
    pts.push([cx + rx * Math.cos(t), cy - ry * Math.sin(t)]);
  }
  return pts;
}

/** 把一串點接成線段 */
function chain(pts, kind = 'wall') {
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++)
    segs.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1], kind });
  return segs;
}

/** 外殼:所有機台共用 */
/* 上方外拱只是機台外框。發球道是一條 J 型軌道:直上 → 被導向左邊 →
   在右上方把球倒進檯面。軌道的內外壁共用圓心、半徑固定差 30,
   整條等寬,球才不會在半路被夾住。 */
const ARC_CX = 190, ARC_CY = 215, OUT_RX = 180, OUT_RY = 148;
const CH_CX = 296, CH_CY = 300;                   // 導軌圓心
export const LANE = { inner: 340, outer: 370, floor: 690, curveY: 300, exit: [296, 140] };

export function buildShell() {
  const walls = [];

  // 機台外框:左牆 → 上方外拱 → 右牆
  walls.push(...chain([[10, 560], [10, ARC_CY]]));
  walls.push(...chain(arc(ARC_CX, ARC_CY, OUT_RX, OUT_RY, 180, 0, 34)));
  walls.push(...chain([[LANE.outer, ARC_CY], [LANE.outer, 700]]));

  // 發球道直線段 + 底(底一定要封,否則力道不夠的球會掉出去被判失球)
  walls.push(...chain([[LANE.inner, 700], [LANE.inner, LANE.curveY]]));
  walls.push(...chain([[LANE.inner, LANE.floor], [LANE.outer, LANE.floor]]));

  // J 型導軌:外側把球轉向左邊,內側當底,末端開口讓球落進檯面。
  // 只轉到 72 度就放開 —— 轉太滿(92 度)球會橫著飛到最左邊,完全錯過保險桿。
  const outArc = arc(CH_CX, CH_CY, 74, 160, 0, 72, 18);
  walls.push(...chain(outArc));
  walls.push(...chain(arc(CH_CX, CH_CY, 44, 130, 0, 72, 16)));

  // 導軌與右外框之間會夾出一個死角,球飛進去就會順著滑回發球道,
  // 一局要重發十幾次。把那個口封起來(封的是上方,不擋球從軌道口射出)。
  walls.push(...chain([outArc[outArc.length - 1], [LANE.outer, ARC_CY]]));

  // 左右下方導板(把球帶向擋板)。斜度要夠陡,
  // 否則導板與彈射器之間只剩 20 單位寬,球(直徑 18)會直接楔在那裡動不了。
  walls.push(...chain([[10, 560], [78, 672], [78, 700]]));
  walls.push(...chain([[LANE.inner, 560], [272, 672], [272, 700]]));

  return walls;
}

/** 兩側的三角彈射器(打到會把球彈開並加分)。整組對稱於檯面中線 x=175 */
export const SLINGS = [
  { x1: 70, y1: 520, x2: 112, y2: 600, kind: 'sling' },
  { x1: 280, y1: 520, x2: 238, y2: 600, kind: 'sling' },
];
/** 彈射器的背面(球不會穿過去) */
export const SLING_BACKS = [
  ...chain([[70, 520], [64, 602], [112, 600]]),
  ...chain([[280, 520], [286, 602], [238, 600]]),
];

export const FLIPPERS = {
  left: { x: 92, y: 652, len: 78, rest: 30, up: -32 },
  right: { x: 258, y: 652, len: 78, rest: 150, up: 212 },
};

/** 發球道:球的起點與擋住球回流的閘門 */
export const PLUNGER = { x: 355, y: 664, gateY: 330 };

/* ---------------- 機台 ---------------- */

export const TABLES = [
  {
    id: 'space',
    name: '太空站',
    emoji: '🚀',
    goal: 20000,
    palette: {
      floor1: '#241a4a', floor2: '#120c2b',
      line: '#5de3ff', bumper: '#ff5d8f', bumperRing: '#ffd257',
      target: '#7bdc7b', rollover: '#ffd257', glow: '#5de3ff',
    },
    bumpers: [
      { x: 122, y: 262, r: 26, score: 100 },
      { x: 228, y: 262, r: 26, score: 100 },
      { x: 175, y: 340, r: 26, score: 100 },
    ],
    // 標靶要放在球真的會經過的中央帶。擺兩側的話小孩整局都打不到。
    targets: [
      { x: 95, y: 430, w: 40, h: 10, score: 500 },
      { x: 145, y: 448, w: 40, h: 10, score: 500 },
      { x: 205, y: 448, w: 40, h: 10, score: 500 },
      { x: 255, y: 430, w: 40, h: 10, score: 500 },
    ],
    rollovers: [
      { x: 120, y: 175, r: 11, score: 250 },
      { x: 175, y: 163, r: 11, score: 250 },
      { x: 230, y: 175, r: 11, score: 250 },
    ],
    posts: [
      { x: 175, y: 520, r: 12, score: 50 },
      { x: 100, y: 500, r: 12, score: 50 },
      { x: 250, y: 500, r: 12, score: 50 },
    ],
  },

  {
    id: 'reef',
    name: '海底礁',
    emoji: '🐠',
    goal: 30000,
    palette: {
      floor1: '#07394d', floor2: '#032230',
      line: '#7ef7d2', bumper: '#ffb45d', bumperRing: '#fff2a8',
      target: '#7ef7d2', rollover: '#ffe07b', glow: '#7ef7d2',
    },
    bumpers: [
      { x: 105, y: 300, r: 24, score: 150 },
      { x: 175, y: 232, r: 30, score: 200 },
      { x: 245, y: 300, r: 24, score: 150 },
      { x: 175, y: 380, r: 22, score: 150 },
    ],
    targets: [
      { x: 100, y: 462, w: 40, h: 10, score: 700 },
      { x: 150, y: 476, w: 40, h: 10, score: 700 },
      { x: 200, y: 476, w: 40, h: 10, score: 700 },
      { x: 250, y: 462, w: 40, h: 10, score: 700 },
    ],
    rollovers: [
      { x: 110, y: 178, r: 11, score: 400 },
      { x: 175, y: 165, r: 11, score: 400 },
      { x: 240, y: 178, r: 11, score: 400 },
      { x: 175, y: 545, r: 12, score: 400 },
    ],
    posts: [
      { x: 122, y: 386, r: 11, score: 80 },
      { x: 228, y: 386, r: 11, score: 80 },
    ],
  },

  {
    id: 'jungle',
    name: '叢林神殿',
    emoji: '🐍',
    goal: 50000,
    palette: {
      floor1: '#1e3d1c', floor2: '#0d2110',
      line: '#c8f56a', bumper: '#ff7a45', bumperRing: '#ffd257',
      target: '#c8f56a', rollover: '#ffd257', glow: '#c8f56a',
    },
    bumpers: [
      { x: 108, y: 232, r: 22, score: 200 },
      { x: 242, y: 232, r: 22, score: 200 },
      { x: 175, y: 296, r: 28, score: 250 },
      { x: 108, y: 360, r: 22, score: 200 },
      { x: 242, y: 360, r: 22, score: 200 },
    ],
    targets: [
      { x: 78, y: 448, w: 42, h: 10, score: 800 },
      { x: 127, y: 468, w: 42, h: 10, score: 800 },
      { x: 175, y: 478, w: 42, h: 10, score: 800 },
      { x: 223, y: 468, w: 42, h: 10, score: 800 },
      { x: 272, y: 448, w: 42, h: 10, score: 800 },
    ],
    rollovers: [
      { x: 105, y: 172, r: 11, score: 600 },
      { x: 175, y: 158, r: 11, score: 600 },
      { x: 245, y: 172, r: 11, score: 600 },
    ],
    posts: [
      { x: 145, y: 552, r: 11, score: 100 },
      { x: 205, y: 552, r: 11, score: 100 },
    ],
  },
];
