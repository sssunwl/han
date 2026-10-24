// 用法：loadBest(key) 讀最新存檔，saveBoth 雙寫；makeCodec 產生專用碼，autoSave 綁生命週期。
/* ============================================================
   經營遊戲共用存檔：雙保險 + 存檔碼
   - localStorage 是主存檔。但 sssunwl.github.io 底下所有專案共用同一份 ~5MB 額度
     (方塊世界一個世界就 ~1.4MB),滿了 setItem 會丟錯 → 以前是默默存失敗。
   - 所以每次存檔也寫一份到 IndexedDB(額度大很多);讀檔時兩邊拿比較新的那份(savedAt)。
   - 存檔碼:整份存檔壓縮成一串文字,可以貼到另一台裝置(或 iPhone 主畫面 App ↔ Safari,
     兩邊的儲存空間是分開的)。
   ============================================================ */
// ===== IndexedDB 與雙重存檔 =====
const DB_NAME = 'han-saves';
const STORE = 'kv';
let dbP = null;

/** 開啟並共用 IndexedDB 連線；失敗時清空快取，讓下一次可以重試。 */
function db() {
  if (!dbP) {
    dbP = new Promise((ok, no) => {
      if (!('indexedDB' in self)) {
        no(new Error('no idb'));
        return;
      }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }).catch(e => {
      dbP = null;
      throw e;
    });
  }
  return dbP;
}

/** 在指定模式的交易中執行操作，等交易完成才回傳結果。 */
function tx(mode, fn) {
  return db().then(d => new Promise((ok, no) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => no(t.error);
  }));
}

/** 寫入 IndexedDB；失敗回傳 false，讓遊戲能提示備份。 */
export const idbPut = (k, v) => tx('readwrite', s => s.put(v, k)).then(() => true, () => false);

/** 從 IndexedDB 讀取資料，讀不到時回傳 null。 */
export const idbGet = k => tx('readonly', s => s.get(k)).catch(() => null);

/** 刪除 IndexedDB 的指定存檔，失敗時安靜回傳 null。 */
export const idbDel = k => tx('readwrite', s => s.delete(k)).catch(() => null);

/** 解析 JSON 存檔；損壞或沒有內容時回傳 null。 */
const parse = raw => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

/** 讀檔:localStorage 跟 IndexedDB 哪份比較新就用哪份 */
export async function loadBest(key) {
  let ls = null;
  try {
    ls = parse(localStorage.getItem(key));
  } catch (e) {/* 被擋住也照樣讀 IDB */}
  const idb = parse(await idbGet(key));
  if (!ls) {
    return idb;
  }
  if (!idb) {
    return ls;
  }
  return (idb.savedAt || 0) > (ls.savedAt || 0) ? idb : ls;
}

/** 寫檔:回傳 { ls, idb } 兩邊各自成功沒(idb 是 Promise) */
export function saveBoth(key, obj) {
  const raw = JSON.stringify(obj);
  let ls = false;
  try {
    localStorage.setItem(key, raw);
    ls = true;
  } catch (e) {
    ls = false;
  }
  return {
    ls,
    idb: idbPut(key, raw)
  };
}

// ===== 存檔碼 =====

/** makeCodec({prefix,name,validate}) 建立各遊戲專用存檔碼。 */
export function makeCodec({
  prefix,
  name,
  validate
}) {
  const PREFIX_Z = `${prefix}Z:`;
  const PREFIX_P = `${prefix}P:`;

  /** 分段將位元組轉成 base64，避免大存檔超過函式參數上限。 */
  const b64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  };

  /** 將 base64 存檔文字還原成位元組。 */
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

  /** 透過壓縮或解壓縮串流轉換位元組。 */
  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  /** 存檔 → 一串文字(瀏覽器支援就壓縮,短很多) */
  async function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if ('CompressionStream' in self) {
      try {
        return PREFIX_Z + b64(await pipe(bytes, new CompressionStream('deflate-raw')));
      } catch (e) {/* 退回不壓縮 */}
    }
    return PREFIX_P + b64(bytes);
  }

  /** 文字 → 存檔;看不懂就丟錯(訊息給小朋友看得懂) */
  async function decode(code) {
    const s = String(code).replace(/\s+/g, '');
    let bytes;
    try {
      if (s.startsWith(PREFIX_Z)) {
        if (!('DecompressionStream' in self)) {
          throw new Error('這台裝置的瀏覽器太舊,讀不了壓縮過的存檔碼');
        }
        bytes = await pipe(unb64(s.slice(PREFIX_Z.length)), new DecompressionStream('deflate-raw'));
      } else if (s.startsWith(PREFIX_P)) {
        bytes = unb64(s.slice(PREFIX_P.length));
      } else {
        throw new Error(`這不是${name}的存檔碼`);
      }
    } catch (e) {
      const mine = /存檔碼|瀏覽器/.test(e.message || '');
      throw mine ? e : new Error('存檔碼不完整,可能沒有複製到整串');
    }
    const obj = parse(new TextDecoder().decode(bytes));
    if (!obj || !validate(obj)) {
      throw new Error('存檔碼壞掉了，請重新複製一次');
    }
    return obj;
  }
  return {
    encode,
    decode
  };
}

// ===== 自動存檔與提示 =====

/** 自動存檔；回傳解除監聽函式，離開畫面時仍保存。 */
export function autoSave({
  save,
  active,
  every = 15000
}) {

  /** 分頁進入背景時立刻保存，不等待下一次定時存檔。 */
  const hidden = () => {
    if (document.hidden) {
      save();
    }
  };

  /** 離開頁面時要求保存目前進度。 */
  const leave = () => save();
  document.addEventListener('visibilitychange', hidden);
  addEventListener('pagehide', leave);
  const timer = setInterval(() => {
    if (active()) {
      save();
    }
  }, every);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', hidden);
    removeEventListener('pagehide', leave);
  };
}

/** saveBadge(el, onWarnOnce) 回傳接收 ok／backup／fail 的狀態顯示器。 */
export function saveBadge(el, onWarnOnce = () => {}) {
  let timer;
  let warned = false;
  return kind => {
    if (el) {
      el.textContent = kind === 'fail' ? '⚠ 存檔失敗' : '💾 已存檔';
      el.classList.toggle('bad', kind === 'fail');
      el.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('on'), kind === 'fail' ? 5000 : 1400);
    }
    if (kind !== 'ok' && !warned) {
      warned = true;
      onWarnOnce(kind);
    }
  };
}
