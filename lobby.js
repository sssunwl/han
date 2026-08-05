import { AVATARS, getProfiles, addProfile, removeProfile, getCurrentId, setCurrentId, currentProfile } from './shared/profile.js';

const playersEl = document.getElementById('players');
const newBox = document.getElementById('newBox');
const nameInput = document.getElementById('newName');
const pickerEl = document.getElementById('avatarPicker');
let pickedAvatar = AVATARS[0];

// 一進來就先確保有選中的人,遊戲才知道要讀誰的存檔
if (!getProfiles().some(p => p.id === getCurrentId())) setCurrentId(currentProfile().id);

function drawPlayers() {
  const cur = getCurrentId();
  playersEl.innerHTML = '';
  for (const p of getProfiles()) {
    const el = document.createElement('div');
    el.className = 'player' + (p.id === cur ? ' on' : '');
    el.style.color = p.color;
    el.innerHTML = `
      <span class="del" title="刪掉這個玩家">✕</span>
      <div class="face">${p.avatar}</div>
      <div class="nm">${p.name}</div>`;
    el.onclick = (e) => {
      if (e.target.classList.contains('del')) {
        if (confirm(`要刪掉「${p.name}」嗎？他蓋的東西也會一起不見。`)) {
          removeProfile(p.id);
          if (!getProfiles().some(x => x.id === getCurrentId())) setCurrentId(currentProfile().id);
          drawPlayers();
        }
        return;
      }
      setCurrentId(p.id);
      drawPlayers();
    };
    playersEl.appendChild(el);
  }

  const add = document.createElement('div');
  add.className = 'player add';
  add.innerHTML = `<div class="face">＋</div><div class="nm">新增</div>`;
  add.onclick = () => { newBox.classList.add('open'); nameInput.focus(); };
  playersEl.appendChild(add);
}

function drawPicker() {
  pickerEl.innerHTML = '';
  for (const a of AVATARS) {
    const b = document.createElement('button');
    b.textContent = a;
    b.className = a === pickedAvatar ? 'on' : '';
    b.onclick = () => { pickedAvatar = a; drawPicker(); };
    pickerEl.appendChild(b);
  }
}

document.getElementById('createBtn').onclick = () => {
  const id = addProfile(nameInput.value, pickedAvatar);
  setCurrentId(id);
  nameInput.value = '';
  newBox.classList.remove('open');
  drawPlayers();
};
document.getElementById('cancelBtn').onclick = () => {
  nameInput.value = '';
  newBox.classList.remove('open');
};
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('createBtn').click();
});

drawPlayers();
drawPicker();
