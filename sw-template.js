// 遊戲間的 Service Worker —— 讓整個站在飛航模式也能玩。
// 這是範本:npm run build 時 vite.config.js 會填入版本號與檔案清單,輸出成 dist/sw.js。
// 不要直接改 dist/sw.js。

const VERSION = '__VERSION__';
const BASE = '__BASE__';
const CACHE = `han-${VERSION}`;
const FILES = __FILES__;

// 大廳連到 games/kidcraft/ 這種「資料夾網址」,快取裡存的是 index.html
const URLS = [BASE, ...FILES.map((f) => BASE + f)];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(URLS.map((u) => new Request(u, { cache: 'reload' }))))
      // 新版裝好就直接接手,不用等所有分頁都關掉
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('han-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// 網址正規化:去掉 ?touch 之類的參數、資料夾網址補上 index.html
function cacheKey(url) {
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  return url.origin + path;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;

  // 快取優先:有網路沒網路都一樣快,也不會因為網路慢卡在白畫面。
  // 新版接手後,offline.js 會提示已開啟的頁面點一下重新載入。
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(cacheKey(url));
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        // 沒網路又不在清單裡:頁面請求就退回大廳,至少不是恐龍畫面
        if (req.mode === 'navigate') {
          const lobby = await c.match(BASE + 'index.html');
          if (lobby) return lobby;
        }
        throw err;
      }
    }),
  );
});
