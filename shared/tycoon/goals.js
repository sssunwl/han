// 里程碑檢查只處理非結局項；結局由遊戲顯示。newGamePlus 保留指定資料與生涯統計。

// ===== 里程碑與分店繼承 =====

/** 以目標 ID 去重加入獎盃，並記錄達成天數與額外資料。 */
export function addTrophy(S, m, extra = {}) {
  S.trophies ??= [];
  if (!S.trophies.some(t => t.id === m.id)) {
    S.trophies.push({
      id: m.id,
      name: m.name,
      day: S.day,
      ...extra
    });
  }
}

/** 檢查未完成的非結局目標，加入獎盃並發放金錢與靈感。 */
export function checkMilestones(S, list, checks, key = 'milestones', onGet = () => {}) {
  S[key] ??= [];
  for (const m of list) {
    if (!m.final && !S[key].includes(m.id) && checks[m.id]?.(S)) {
      S[key].push(m.id);
      addTrophy(S, m);
      S.money += m.reward?.money || 0;
      S.ideas += m.reward?.ideas || 0;
      onGet(m);
    }
  }
}

/** 取得第一個尚未完成的目標，供介面顯示下一步。 */
export const nextGoal = (S, list, key = 'milestones') => list.find(m => !(S[key] || []).includes(m.id));

/** 深複製新存檔，帶走指定欄位，增加周目並累加生涯統計。 */
export function newGamePlus(old, fresh, {
  carry = [],
  ng = 'ng'
} = {}) {
  const s = structuredClone(fresh);
  for (const k of carry) {
    if (old[k] !== undefined) {
      s[k] = structuredClone(old[k]);
    }
  }
  s[ng] = (old[ng] || 0) + 1;
  s.career = {};
  for (const k of ['days', 'served', 'earned']) {
    s.career[k] = (old.career?.[k] || 0) + (k === 'days' ? old.day : old.stats?.[k] || 0);
  }
  return s;
}
