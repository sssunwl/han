/* ============================================================
   小遊戲共用工具:音效、canvas 尺寸、存檔、「現在是誰在玩」
   做食物類小遊戲(章魚燒 / Pizza / 疊漢堡)共用,彈珠台與方塊世界有自己的一套。
   ============================================================ */
import { currentProfile } from './profile.js';

export const ME = currentProfile();

// ---------- 存檔 ----------
export function readJSON(k, d) {
  try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; }
}
export function writeJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}

/** 共用排行榜:{ profileId: best },同一台裝置上大家一起比 */
export function recordBest(key, score) {
  const all = readJSON(key, {});
  const isNew = !(all[ME.id] >= score);
  if (isNew) { all[ME.id] = score; writeJSON(key, all); }
  return isNew;
}

// ---------- 作品相簿:每個玩家各自一份,只留最近幾張(localStorage 容量有限) ----------
/** 從 canvas 切一塊下來縮成小張 JPEG。rect 是 CSS 座標,dpr 是 canvas 的像素比 */
export function snapshot(canvas, rect, dpr, size = 220) {
  const off = document.createElement('canvas');
  off.width = off.height = size;
  const o = off.getContext('2d');
  o.fillStyle = '#fff6ea'; o.fillRect(0, 0, size, size);
  const side = Math.max(rect.w, rect.h);
  const sx = rect.x + rect.w / 2 - side / 2, sy = rect.y + rect.h / 2 - side / 2;
  o.drawImage(canvas, sx * dpr, sy * dpr, side * dpr, side * dpr, 0, 0, size, size);
  return off.toDataURL('image/jpeg', 0.8);
}
export function saveShot(key, dataURL, keep = 6) {
  const list = readJSON(key, []);
  list.unshift(dataURL);
  while (list.length > keep) list.pop();
  // 存不下就少存幾張,不要讓遊戲因為存檔失敗而壞掉
  while (list.length && !writeJSON(key, list)) list.pop();
}
export function renderGallery(key, grid, emptyEl) {
  const list = readJSON(key, []);
  grid.innerHTML = list.map(src => `<img src="${src}" alt="作品">`).join('');
  grid.style.display = list.length ? '' : 'none';
  if (emptyEl) emptyEl.style.display = list.length ? 'none' : '';
}

// ---------- 音效:全部 WebAudio 合成,沒有音檔 ----------
let ac = null, sfxBus = null;
// 聲音設定存在這台裝置(不是存檔的一部分):{ sfx: true/false, music: 曲目 id 或 'off' }
const AUDIO_KEY = 'sun-games-audio';
export const audioPrefs = Object.assign({ sfx: true, music: 'auto' }, readJSON(AUDIO_KEY, {}));
export function saveAudioPrefs() { writeJSON(AUDIO_KEY, audioPrefs); if (sfxBus) sfxBus.gain.value = audioPrefs.sfx ? 1 : 0; }
function audio() {
  // iOS 要在使用者觸碰之後才能出聲,所以延到第一次用才建立
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    sfxBus = ac.createGain(); sfxBus.gain.value = audioPrefs.sfx ? 1 : 0; sfxBus.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
/** 給配樂引擎用:同一個 AudioContext */
export function audioCtx() { return audio(); }
export function tone(freq, dur = 0.12, type = 'sine', vol = 0.18, slide = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}
/** 短短的噪音:倒麵糊、滋滋聲 */
export function noise(dur = 0.2, vol = 0.08, hp = 1200) {
  const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxBus);
  src.start();
}
/** 完成時的上升音階 */
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 110));
}

// ---------- canvas:跟著容器大小、壓低手機的 pixelRatio ----------
export function fitCanvas(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const isTouch = matchMedia('(pointer:coarse)').matches;
  const view = { w: 0, h: 0, dpr: 1, ctx };
  function resize() {
    const r = canvas.getBoundingClientRect();
    // 手機 dpr 常常是 3,照畫會多算 9 倍像素,壓到 2 就很清楚了
    view.dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 2 : 2.5);
    view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    onResize && onResize(view);
  }
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  resize();
  return view;
}

/** 「現在是 🦖 Han 在玩」 */
export function renderWho(el, verb = '在玩') {
  el.innerHTML = `<span class="face">${ME.avatar}</span>現在是 <b>${escapeHTML(ME.name)}</b> ${verb}`;
}
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 擋掉雙指縮放、長按選單,避免小孩一不小心跳出遊戲 */
export function lockGestures() {
  for (const ev of ['gesturestart', 'contextmenu', 'dblclick']) {
    document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }
}
