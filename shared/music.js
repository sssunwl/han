/* ============================================================
   配樂引擎:全部用 WebAudio 即時合成的 8-bit 日式小曲,沒有音檔(離線也能播、沒有版權問題)
   用法:playMusic('yu') / stopMusic()
   每首曲子 = 音階 + 速度 + 和弦進行,旋律用固定種子的隨機漫步產生(每次播放都一樣)。
   排程用「往前排 0.3 秒」的做法,不會因為畫面卡頓而走音。
   ============================================================ */
import { audioCtx } from './kit.js';

// 日本五聲音階(半音數):陽音階(明亮)、陰音階(夜晚、憂愁)
const YO = [0, 2, 5, 7, 9];
const IN = [0, 1, 5, 7, 8];

export const TRACKS = {
  yu:       { name: '溫泉街',  bpm: 112, root: 62, scale: YO, lead: 'square',   prog: [0, 3, 4, 0], drums: 'walk',   seed: 11 },
  yozakura: { name: '夜櫻',    bpm: 76,  root: 64, scale: IN, lead: 'triangle', prog: [0, 3, 0, 4], drums: 'none',   seed: 23 },
  matsuri:  { name: '祭典',    bpm: 138, root: 62, scale: YO, lead: 'square',   prog: [0, 0, 3, 4], drums: 'taiko',  seed: 37 },
  yuki:     { name: '雪見',    bpm: 88,  root: 69, scale: YO, lead: 'sine',     prog: [0, 4, 3, 0], drums: 'soft',   seed: 51 },
};

let bus = null, timer = null, cur = null, step = 0, nextAt = 0, melody = null, bass = null;

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const note = (tr, deg, oct = 0) => {
  const n = tr.scale.length, i = ((deg % n) + n) % n;
  return tr.root + tr.scale[i] + 12 * (oct + Math.floor(deg / n));
};

/** 32 步(4 小節 × 8 個八分音符)旋律,A A' B A 的結構 */
function compose(tr) {
  const r = rng(tr.seed);
  const phrase = () => {
    const out = []; let d = 4;
    for (let i = 0; i < 32; i++) {
      if (r() < 0.22) { out.push(null); continue; }           // 休止
      d += Math.round((r() - 0.5) * 3);
      d = Math.max(0, Math.min(9, d));
      out.push(d);
    }
    return out;
  };
  const A = phrase(), B = phrase();
  const A2 = A.map((d, i) => (i > 24 && d != null) ? d + 1 : d);
  return [...A, ...A2, ...B, ...A];
}

function voice(type, freq, t, dur, vol) {
  const a = audioCtx();
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}
function drum(kind, t) {
  const a = audioCtx();
  if (kind === 'kick') {                                  // 太鼓 / 大鼓:往下滑的正弦波
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.25);
  } else {                                                // 小鼓 / 拍子木:短噪音
    const n = Math.floor(a.sampleRate * 0.06), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = kind === 'clap' ? 2500 : 5000; g.gain.value = 0.06;
    src.connect(f).connect(g).connect(bus); src.start(t);
  }
}

function schedule() {
  const a = audioCtx(); if (!a || !cur) return;
  const tr = TRACKS[cur], eighth = 60 / tr.bpm / 2;
  while (nextAt < a.currentTime + 0.3) {
    const i = step % 128, bar = Math.floor(i / 8) % 4, chord = tr.prog[bar];
    const m = melody[i];
    if (m != null) voice(tr.lead, hz(note(tr, m + chord)), nextAt, eighth * 1.8, tr.lead === 'square' ? 0.035 : 0.06);
    if (i % 4 === 0) voice('triangle', hz(note(tr, chord, -2)), nextAt, eighth * 3.5, 0.09);   // 低音:每兩拍
    if (i % 4 === 2 && tr.drums !== 'none') voice('triangle', hz(note(tr, chord + 2, -2)), nextAt, eighth * 1.5, 0.05);
    if (tr.drums === 'taiko') { if (i % 8 === 0 || i % 8 === 3 || i % 8 === 6) drum('kick', nextAt); if (i % 4 === 2) drum('clap', nextAt); }
    else if (tr.drums === 'walk') { if (i % 8 === 0) drum('kick', nextAt); if (i % 8 === 4) drum('clap', nextAt); }
    else if (tr.drums === 'soft') { if (i % 16 === 0) drum('tick', nextAt); }
    step++; nextAt += eighth;
  }
}

export function playMusic(id) {
  const a = audioCtx(); if (!a || !TRACKS[id]) return;
  if (cur === id && timer) return;
  stopMusic();
  if (!bus) { bus = a.createGain(); bus.connect(a.destination); }
  bus.gain.cancelScheduledValues(a.currentTime);
  bus.gain.setValueAtTime(0.0001, a.currentTime);
  bus.gain.linearRampToValueAtTime(0.7, a.currentTime + 1.2);   // 淡入
  cur = id; step = 0; nextAt = a.currentTime + 0.1;
  melody = compose(TRACKS[id]);
  timer = setInterval(schedule, 100);
  schedule();
}
export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null; cur = null;
  if (bus) { const a = audioCtx(); bus.gain.cancelScheduledValues(a.currentTime); bus.gain.setTargetAtTime(0.0001, a.currentTime, 0.15); }
}
export const nowPlaying = () => cur;
// 分頁切到背景就停,回來再接著播(省電,也避免 iOS 在背景亂叫)
let resumeId = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { resumeId = cur; stopMusic(); }
  else if (resumeId) { playMusic(resumeId); resumeId = null; }
});
