// 註冊 Service Worker,讓整站離線可玩(見 sw-template.js)。
// 只在 build 出來的正式版註冊:dev server 的檔案隨時在變,快取起來只會礙事。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.getElementById('han-update')) return;
    const bar = document.createElement('button');
    bar.id = 'han-update';
    bar.textContent = '有新版本 · 點一下更新';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;width:100%;z-index:2147483647;padding:calc(5px + env(safe-area-inset-top)) 8px 5px;border:0;background:#27345eee;color:#fff;font:12px system-ui;cursor:pointer;touch-action:manipulation';
    bar.addEventListener('click', () => location.reload());
    document.body.appendChild(bar);
  });
  const register = () => {
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch(() => {});
  };
  if (document.readyState === 'complete') register();
  else addEventListener('load', register, { once: true });
}
