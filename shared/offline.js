// 註冊 Service Worker,讓整站離線可玩(見 sw-template.js)。
// 只在 build 出來的正式版註冊:dev server 的檔案隨時在變,快取起來只會礙事。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL;
  addEventListener('load', () => {
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {});
  });
}
