# 經營遊戲骨架

這些 ES modules 不依賴套件。雪糕店已使用所有模組；溫泉旅館之後要遷移過來（這次沒動）。可從 `index.js` 一次匯入，也可直接匯入單一模組。遊戲自行定義持久狀態、價格、人物狀態與畫面；骨架不寫死任何遊戲資料。

`store.js`：`idbPut(key,value)`、`idbGet(key)`、`idbDel(key)` 操作共用的 han-saves 資料庫。`loadBest(key)` 比較 localStorage 與 IndexedDB 的 savedAt，`saveBoth(key,obj)` 回傳 `{ls,idb:Promise<boolean>}`；呼叫者先在資料加 savedAt。`makeCodec({prefix,name,validate})` 回傳非同步 `encode(obj)`／`decode(code)`，支援 deflate-raw 與未壓縮後備。`autoSave({save,active,every=15000})` 綁定計時、隱藏與離頁事件，回傳解除函式。`saveBadge(el,onWarnOnce)` 回傳接受 ok／backup／fail 的顯示函式。

`grid.js`：`new Grid(cols,rows)` 建立 `walk[y][x]`。`setWalk((x,y)=>boolean)` 重建通行表，`inside(x,y)` 檢查界線，`bfs(start,walk=this.walk)` 回傳未到達為 −1 的距離表。`findPath(from,to,toPx)` 回傳含起終點的像素座標陣列，無路回傳 null；預設每格 32px、落腳在格子下方。`findDoor(rect,dist)` 找四邊最接近起點的可達格，回傳 `{x,y,side,d}` 或 null。`tileOf(px,py,T=32)` 同時有模組函式與實例方法；`near(a,b,rad)` 支援 `{x,y}` 或座標陣列。

`agent.js`：角色有 x、y、path、dir、frame、then；`goTo(grid,a,tile,then,opts)` 設定路徑並回傳是否成功，opts 可設 from、T、toPx。`moveAgent(a,dt,speed=55)` 沿路移動，方向是右／上／左／下，完成只呼叫一次 then。`bubble(a,text,sec)`、`tickBubble(a,dt)` 管短句，`runState(a,dt,handlers)` 呼叫目前狀態的 handler。`new Queue(spots)` 的 join／remove／indexOf／front／spotOf 管 ID 排隊；滿額以外 spotOf 回傳 null，遊戲自行安排門外等候。

`day.js`：`new DayClock({seconds,openHour,closeHour})` 有 t、start／tick／clockText／night；時間限制 0～1，時鐘十分鐘一跳。`planArrivals(n,{from,to,pick,rnd})` 產生排序到店表，pick 回傳自訂客人資料。`weightedPick([[值,權重]],rnd)` 抽權重；`seasonOf(day,perSeason=7,seasons)` 預設春夏秋冬；`rng(seed)` 使用 16807 線性同餘產生可重現亂數。

`goals.js`：`checkMilestones(S,list,checks,key='milestones',onGet)` 跳過 final 與既有目標，checks 是以 id 索引的判斷函式，獎勵寫入 money／ideas。`nextGoal(S,list,key)` 回傳下一個未完成項目，`addTrophy(S,m,extra)` 去重加入獎盃。`newGamePlus(old,fresh,{carry,ng='ng'})` 深複製新資料、保留 carry 欄位、增加周目與 career.days／served／earned；員工上限等遊戲特例由呼叫者處理。

`camera.js`：`new Camera(canvas,{worldW,worldH,maxScale=2.4})` 管 x／y／s。`resize()` 限 dpr≤2、保留中心；`clamp()` 限界、較小世界置中；`zoomAt(k,sx,sy)` 以畫布內螢幕座標縮放；`focus(rectPx,{portraitMax})` 對焦區域。每幀 `apply(ctx)`，`worldAt(clientX,clientY)` 轉世界、`toScreen(wx,wy)` 轉畫布內螢幕座標，`kz()` 讓縮小時文字保持可讀。

`input.js`：`bindPointer(canvas,cam,handlers)` 回傳解除函式。handlers 支援 onTap、onHold、ghostHit、onGhostGrab、onGhostDrag、onHover、blocked。onHold 在 450ms 呼叫，回傳 true 進入 ghost 拖動；超過 8px 取消長按並拖鏡頭。雙指與滾輪以指標中心縮放，取消指標不會誤觸點擊。onGhostGrab 可接 Placer.grab 記住手指相對位置。

`place.js`：`new Placer({canPlace,onChange,takeOut,putBack})`，canPlace 回傳錯誤字串或 null。`start(p)` 開始新擺放，`startMove(obj,p)` 先取出原物件；`moveTo(x,y)` 更新 p.reason，`grab(wx,wy,T)`／`dragTo(wx,wy,T)` 管拖曳。`confirm()` 重新驗證，成功回傳 p 並結束、失敗回傳 null；`cancel()` 還原搬移物件。active 表示正在擺放。遊戲在確認後扣錢與加入資料；搬移過程存檔時，應把 original 加回存檔快照。

`ui.js`：`makeToast(el,ms=3000)` 回傳顯示文字函式，以 `.on` 控制可見。`itemHTML({act,icon,name,sub,cost,lockText,disabled})` 回傳商店按鈕，所有文字先跳脫，事件由 data-act 代理。

## 做一款新經營遊戲的步驟

1. 在 data.js 定義價格、格子配置、客人類型與目標；用單一 S 保存持久狀態，不存走動中的客人。
2. 建立 Grid，定義佔用表與 canPlace；BFS 從入口檢查櫃台與每件設施的 findDoor。
3. 用 DayClock 與 planArrivals 排一天；每位客人建立狀態機，透過 Queue、goTo、moveAgent、runState 完成服務與評價。
4. 將 Camera、bindPointer、Placer 接到 canvas；購物面板用 itemHTML，提示用 makeToast。
5. 用 checkMilestones 給獎，遊戲自行顯示結局；分店透過 newGamePlus，明確列出繼承欄位。
6. 用 saveKey 隔離玩家、loadBest 讀檔、saveBoth 雙寫、autoSave 自存與 makeCodec 備份。最後提供 DEV API、自動玩家與手機版面，確認 build 可離線載入。
