# AI Star Builder v4.1 手機版驗收報告

共用 offline.js 現在記錄頁面載入時是否已有 Service Worker controller,換版接手才顯示「有新版本 · 點一下更新」。提示是行內樣式的獨立 DOM 按鈕,固定在最上方,點擊重新載入;首次安裝不提示,同頁不重複插入。返回前景時呼叫 reg.update(),失敗不干擾遊戲。sw-template.js 保留 cache-first、skipWaiting 與 clients.claim,只更新註解。

手機版修正 v4 覆蓋掉的安全區內距,加入 100vh → -webkit-fill-available → 100dvh 高度退路,canvas 跟隨容器高度。visualViewport resize、window resize 與 ResizeObserver 都會重算鏡頭。零尺寸先保留初始對焦要求,下一 frame 重試;新局、繼續、存檔碼與第二季沿用 boot() 的 layout(true),開場對準大廳與街道。

頂部維持兩列精簡狀態,趨勢與目標合併到同一列小籤,點擊或鍵盤可展開完整內容。通知移到下方,手機最多兩則且每則一行,角色對話也限制同時兩則。時鐘與播放控制移到下方工具列上面,縮放放在右側小籤旁。未計安全區時,頂部狀態、小籤與兩則通知約 130px,為 640px 高度的約 20%。

六鍵工具列保留至少 53px 高度,360px 寬時文字不換行。抽屜使用 62dvh、內部捲動、44px 關閉鍵,可向下拖把手、點 ✕ 或點上方地圖關閉;點地圖關閉當次不再開房間。開抽屜會取消擺放,小助理提示維持較高圖層可操作,擺放列及提示卡底部都避開 home bar。橫式矮螢幕改右側抽屜。視窗限制 86dvh 且內捲,視窗按鈕至少 44px,點遮罩可關閉。canvas 保留 bindPointer 的單指拖曳、雙指縮放,禁止 contextmenu、iOS 選字與 callout;抽屜使用 pan-y,按鈕使用 manipulation。viewport 原已有 viewport-fit=cover 與 user-scalable=no,現在也納入回歸檢查。

房名從背景快取移至即時繪製,與人數同用 cam.kz() 補償,縮小後仍為至少 10px 螢幕字級。未改 engine.js、LEARNING、noRest>=7、shared/tycoon 或 character.js,window.AS 所有方法與 DEV 保護保留,沒有新增依賴。修改限 main.js、index.html、ui-smoke.test.mjs、本報告、shared/offline.js 與 sw-template.js,未提交、推送或操作 .git。

## 驗證

main.js、ui-smoke.test.mjs、offline.js、sw-template.js 全部 node --check 通過。engine.test.mjs、ui-smoke.test.mjs、migrate-test 與 8 mix 160 全部通過,0 測試錯誤。八局結局週為 31、34、34、36、41、42、46、33;v1–v8 各遷移至 v9 後跑十週皆 0 錯誤。煙霧測試原有搬移案例仍印出一次「找不到路徑,移至目標」後備警告,不是測試失敗。

新增假 DOM 檢查 360×640、375×667、390×844、430×932 直式與 844×390 橫式,確認啟動 canvas 尺寸、鏡頭數值、visualViewport 尺寸更新、零尺寸待重試狀態、抽屜三種關閉方法,並檢查安全區、viewport-fit、dvh、boot 初始對焦契約。共用離線更新另外以 VM 模擬首次安裝、換版提示去重、點擊 reload 與前景 update。

正式建置指令為 ../han/node_modules/.bin/vite build --configLoader runner --outDir /tmp/aistar-v41-build,成功;產出 sw.js 版本 c40c954776fe,44 個預快取檔案,已確認仍含 self.skipWaiting() 與 self.clients.claim()。建置有既有 kidcraft 大型 chunk 提示。

## 尚待確認

沒有做瀏覽器或實機驗收。上述尺寸是程式與假 DOM 驗證,無法證明 iPhone Safari 網址列動畫、安全區實際值、主畫面模式、雙指縮放及拖曳手感完全符合預期;仍需實機確認文字密度與觸控。既有家具不擋路、人物可能共站及短時段路程尚未抵達等呈現限制維持。

已經開著舊版 offline.js 的頁面不可能取得本次新增的 listener,部署後那個舊頁面需要手動重新整理一次,才會啟用日後的更新提示。之後裝有 v4.1 程式的頁面在新版 SW 接手時即可看到提示,長期背景開啟也會於返回前景查更新。本次只完成工作區修改與 /tmp 建置,尚未部署線上版本。
