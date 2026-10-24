// makeToast 顯示短提示；itemHTML 產生可由 data-act 分派事件的商店按鈕。

// ===== 提示與商店按鈕 =====

/** 跳脫介面文字，避免名稱被當成 HTML。 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

/** 建立短暫提示顯示器；新提示會取代上一個隱藏計時。 */
export function makeToast(el, ms = 3000) {
  let timer;
  return text => {
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('on'), ms);
  };
}

/** 產生已跳脫文字的商店按鈕，事件由 data-act 分派。 */
export function itemHTML({
  act,
  icon,
  name,
  sub = '',
  cost = '',
  lockText = '',
  disabled = false
}) {
  return [
    `<button class="item" data-act="${esc(act)}" ${disabled ? 'disabled' : ''}><span class="ic">${esc(icon)}`,
    `</span><span class="tx"><b>${esc(name)}</b><small>${esc(sub)}`,
    `</small></span><span>${esc(lockText || cost)}</span></button>`
  ].join('');
}
