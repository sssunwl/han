// 辦公室配置純邏輯。房間陣列索引永遠是引擎 room id。
import * as D from './data.js';
import { Grid } from '../../shared/tycoon/grid.js';

export const roomRect = (S, i) => {
  const f = S.floors[i];
  return f ? { x: f.x, y: f.y, ...D.ROOM_SIZE[f.type] } : null;
};
export const doorOf = r => [r.x + Math.floor(r.w / 2), r.y + r.h - 1];
export const ownsTile = (S, x, y) => !!(x >= 0 && y >= 0 && x < D.COLS && y < D.ROWS &&
  S.land?.includes(`${Math.floor(x / D.CHUNK)},${Math.floor(y / D.CHUNK)}`));
// 保留原本房間造價與學習速度,土地採較平緩的擴張成本。
export const landCost = S => Math.round(600 * 1.35 ** (S.land.length - 4) / 50) * 50;
export const landNeed = S => S.land.length >= 19 ? 4 : S.land.length >= 14 ? 3 : S.land.length >= 8 ? 2 : 1;
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function adjacentLand(S, cx, cy) {
  return Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 &&
    cx < D.COLS / D.CHUNK && cy < D.ROWS / D.CHUNK && !S.land.includes(`${cx},${cy}`) &&
    neighbors.some(([dx, dy]) => S.land.includes(`${cx + dx},${cy + dy}`));
}
export function buyLand(S, cx, cy) {
  if (!adjacentLand(S, cx, cy)) return '只能買相鄰的土地';
  if (S.lv < landNeed(S)) return `需要公司 Lv${landNeed(S)}`;
  const cost = landCost(S);
  if (S.money < cost) return `要 $${cost}`;
  S.money -= cost;
  S.land.push(`${cx},${cy}`);
  return null;
}

// 人行道、走廊與房內通行格共用一張表。牆只在門口開洞。
export function walkGrid(S) {
  const g = new Grid(D.COLS, D.ROWS + 3);
  g.setWalk((x, y) => y === D.ROWS || ownsTile(S, x, y));
  for (let i = 0; i < S.floors.length; i++) {
    const r = roomRect(S, i);
    if (!Number.isFinite(r.x)) continue;
    const [dx, dy] = doorOf(r);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        g.walk[y][x] = (x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1) ||
          (x === dx && y === dy);
      }
    }
  }
  return g;
}

export function canPlaceRoom(S, type, x, y, ignoreIndex = -1) {
  const size = D.ROOM_SIZE[type];
  if (!size) return '找不到房間';
  const r = { x, y, ...size };
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
      x + r.w > D.COLS || y + r.h > D.ROWS) return '超出土地範圍';
  for (let yy = y; yy < y + r.h; yy++) {
    for (let xx = x; xx < x + r.w; xx++) {
      if (!ownsTile(S, xx, yy)) return '這裡還不是你的土地';
    }
  }
  for (let i = 0; i < S.floors.length; i++) {
    if (i === ignoreIndex) continue;
    const b = roomRect(S, i);
    if (!Number.isFinite(b.x)) continue;
    if (x < b.x + b.w && x + r.w > b.x && y < b.y + b.h && y + r.h > b.y) return '房間不能重疊';
    if (x <= b.x + b.w && x + r.w >= b.x && y <= b.y + b.h && y + r.h >= b.y) {
      return `要保留一格走廊,這樣會堵住${D.FLOORS[S.floors[i].type].name}的門`;
    }
  }
  const floors = S.floors.map((f, i) => i === ignoreIndex ? { ...f, x, y } : f);
  if (ignoreIndex < 0) floors.push({ type, lv: 1, x, y });
  const next = { ...S, floors }, g = walkGrid(next);
  const lobby = floors.findIndex(f => f.type === 'lobby');
  if (lobby < 0) return null;
  const d = g.bfs(doorOf(roomRect(next, lobby)));
  for (let i = 0; i < floors.length; i++) {
    if (!Number.isFinite(floors[i].x)) continue;
    const [dx, dy] = doorOf(roomRect(next, i));
    if (d[dy]?.[dx] < 0) return `這樣會堵住${D.FLOORS[floors[i].type].name}的門`;
  }
  if (d[D.ROWS][16] < 0) return '這樣會堵住大廳通往街道的門';
  return null;
}

export function findSpot(S, type) {
  const candidates = [];
  for (let y = 0; y < D.ROWS; y++) {
    for (let x = 0; x < D.COLS; x++) if (ownsTile(S, x, y)) candidates.push({ x, y });
  }
  const distance = p => Math.abs(p.x - 15) + Math.abs(p.y - 44);
  candidates.sort((a, b) => distance(a) - distance(b) || b.y - a.y || a.x - b.x);
  return candidates.find(p => !canPlaceRoom(S, type, p.x, p.y)) || null;
}

// 只由新局與舊檔遷移呼叫。擴地免費且不改金錢、等級或房間順序。
export function layoutRooms(S) {
  S.land = [...D.START_LAND];
  for (const f of S.floors) { delete f.x; delete f.y; }
  const lobby = S.floors.find(f => f.type === 'lobby');
  if (lobby) Object.assign(lobby, { x: 13, y: 43 });
  for (const f of S.floors) {
    if (f === lobby) continue;
    let p = findSpot(S, f.type);
    while (!p) {
      const choices = [];
      for (let cy = 5; cy >= 0; cy--) {
        for (let cx = 0; cx < 4; cx++) if (adjacentLand(S, cx, cy)) choices.push({ cx, cy });
      }
      const distance = c => Math.abs(c.cx - 1.5) + Math.abs(c.cy - 4.5);
      choices.sort((a, b) => distance(a) - distance(b));
      if (!choices.length) throw Error('辦公室土地已滿');
      const c = choices[0];
      S.land.push(`${c.cx},${c.cy}`);
      p = findSpot(S, f.type);
    }
    Object.assign(f, p);
  }
  return S;
}
