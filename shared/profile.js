/* ============================================================
   玩家檔案 —— 刻意「不做登入」
   小孩記不住密碼,而且向未成年人收集帳號/email 是個人資料的雷區。
   這裡只是在這台裝置上「選自己是誰」:沒有密碼、沒有伺服器、
   任何資料都不會離開這台電腦。代價是換裝置就看不到自己的作品。
   ============================================================ */

const LIST_KEY = 'sun-games-profiles';
const CUR_KEY = 'sun-games-current';
const SEED_KEY = 'sun-games-seeded';

export const AVATARS = ['🦖', '🐱', '🐼', '🦊', '🐸', '🦉', '🐙', '🦄', '🐧', '🐝', '🦁', '🐢'];
export const COLORS = ['#ff8a5b', '#5db8ff', '#7bdc7b', '#ffd257', '#e05fc0', '#9d8cff'];

// 內建的試玩名單。SEED_VERSION 加一就會把新加的人補進已經在用的裝置,
// 但不會把使用者自己刪掉的人救回來。
const SEED_VERSION = 2;
const DEFAULT_PROFILES = [
  { id: 'han',   name: 'Han',   avatar: '🦖', color: '#ff8a5b' },
  { id: 'masa',  name: 'Masa',  avatar: '🦊', color: '#5db8ff' },
  { id: 'lam',   name: 'Lam',   avatar: '🐼', color: '#7bdc7b' },
  { id: 'sunny', name: 'Sunny', avatar: '🐝', color: '#ffd257' },
  { id: 'jolin', name: 'Jolin', avatar: '🦄', color: '#e05fc0' },
  { id: 'ricky', name: 'Ricky', avatar: '🐙', color: '#9d8cff' },
];

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (e) { return fallback; }
}

export function getProfiles() {
  let list = read(LIST_KEY, null);
  if (!Array.isArray(list)) list = [];

  const seeded = Number(localStorage.getItem(SEED_KEY) || 0);
  if (seeded < SEED_VERSION) {
    const have = new Set(list.map(p => p.id));
    for (const d of DEFAULT_PROFILES) if (!have.has(d.id)) list.push({ ...d });
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
    localStorage.setItem(SEED_KEY, String(SEED_VERSION));
  }
  if (!list.length) {                       // 全部被刪光了也要留一個
    list = [{ ...DEFAULT_PROFILES[0] }];
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  }
  return list;
}

export function addProfile(name, avatar) {
  const list = getProfiles();
  const clean = String(name).trim().slice(0, 12) || '新玩家';
  const id = 'p' + Date.now().toString(36);
  list.push({ id, name: clean, avatar: avatar || '🐱', color: COLORS[list.length % COLORS.length] });
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
  return id;
}

export function removeProfile(id) {
  const list = getProfiles().filter(p => p.id !== id);
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
  if (getCurrentId() === id) localStorage.removeItem(CUR_KEY);
}

export function getCurrentId() { return localStorage.getItem(CUR_KEY); }
export function setCurrentId(id) { localStorage.setItem(CUR_KEY, id); }

export function currentProfile() {
  const list = getProfiles();
  return list.find(p => p.id === getCurrentId()) || list[0];
}

/** 每個玩家的存檔互不干擾:kidcraft:han:world */
export function saveKey(game, name) {
  return `${game}:${currentProfile().id}:${name}`;
}
