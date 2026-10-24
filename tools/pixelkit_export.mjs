// pixelkit 匯出:把 shared/pixelkit 的家具與角色輸出成 PNG + JSON(之後打包販售的底稿)
// 用法:node tools/pixelkit_export.mjs   → 輸出到 tools/out/pixelkit/(不進 repo)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bmp } from '../shared/pixelkit/core.js';
import { KIT } from '../shared/pixelkit/furniture.js';
import { makeCharacter, randomLook, HAIRS, HAIR_COLORS, CLOTH_COLORS, FW, FH, DIRS, COLS } from '../shared/pixelkit/character.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'pixelkit');
mkdirSync(join(OUT, 'characters'), { recursive: true });

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(b) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b.w, 0); ihdr.writeUInt32BE(b.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((b.w * 4 + 1) * b.h);
  for (let y = 0; y < b.h; y++) Buffer.from(b.d.buffer, y * b.w * 4, b.w * 4).copy(raw, y * (b.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// 家具:貨架式打包成一張
const items = Object.entries(KIT).map(([name, k]) => [name, k.make()]).sort((a, b) => b[1].h - a[1].h);
const W = 512; let x = 0, y = 0, rowH = 0; const rects = {};
for (const [name, b] of items) { if (x + b.w > W) { x = 0; y += rowH + 2; rowH = 0; } rects[name] = [x, y, b.w, b.h]; x += b.w + 2; rowH = Math.max(rowH, b.h); }
const sheet = new Bmp(W, y + rowH);
for (const [name, b] of items) sheet.blit(b, rects[name][0], rects[name][1]);
writeFileSync(join(OUT, 'icecream_shop.png'), png(sheet));
writeFileSync(join(OUT, 'icecream_shop.json'), JSON.stringify(rects, null, 1));

// 角色:每種髮型 × 衣服各一張範例 sheet + 隨機 12 位
let n = 0;
HAIRS.forEach((h, i) => [0, 1, 2].forEach(j => { writeFileSync(join(OUT, 'characters', `${h}_${j + 1}.png`), png(makeCharacter({ ...randomLook(i * 31 + j), hair: h, hairColor: HAIR_COLORS[(i + j * 3) % 8], cloth: CLOTH_COLORS[(i + j * 2) % 8] }))); n++; }));
writeFileSync(join(OUT, 'characters', 'layout.json'), JSON.stringify({ frame: [FW, FH], rows: DIRS, cols: COLS }, null, 1));

writeFileSync(join(OUT, 'LICENSE.txt'), `Suniverse Pixel Kit — Ice Cream Shop (draft)

All art in this pack is original and generated procedurally by code written with AI assistance
(Claude, Anthropic). No third-party sprites were traced or copied. Please mark it as
"AI-generated" when listing on itch.io.

You may use these assets in personal and commercial games and videos, and modify them.
You may not resell or redistribute the assets themselves (alone or as part of another asset pack).
`);
console.log(`輸出到 ${OUT}:家具 ${items.length} 件、角色 ${n} 張`);
