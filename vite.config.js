import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = '/han/';

// 離線用:build 完把 dist/ 裡每個檔案都列進 sw.js 的預先快取清單。
// 版本號 = 所有檔案內容的雜湊,任何一個檔案改了 → sw.js 內容就變 →
// 瀏覽器裝新版 SW、建新快取、刪掉舊快取。不用手動改版本號。
function offlineServiceWorker() {
  let outDir;
  return {
    name: 'han-offline-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else if (name !== 'sw.js') files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      files.sort();

      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      const template = readFileSync('sw-template.js', 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace('__BASE__', BASE)
        .replace('__FILES__', JSON.stringify(files, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`\n[offline] sw.js 版本 ${version},預先快取 ${files.length} 個檔案`);
    },
  };
}

export default {
  // GitHub Pages 是子路徑 https://sssunwl.github.io/han/,不設 base 資源會 404
  base: BASE,
  plugins: [offlineServiceWorker()],
  build: {
    rollupOptions: {
      input: {
        lobby: 'index.html',
        kidcraft: 'games/kidcraft/index.html',
        pinball: 'games/pinball/index.html',
        takoyaki: 'games/takoyaki/index.html',
        pizza: 'games/pizza/index.html',
        burger: 'games/burger/index.html',
        onsen: 'games/onsen/index.html',
        aistar: 'games/aistar/index.html',
      },
    },
  },
};
