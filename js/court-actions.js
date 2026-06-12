/**
 * 場地操作模組
 * 純函式、可注入亂數，供 script.js 呼叫並可獨立測試
 */

const MIN_COURTS = 1;
const MAX_COURTS = 6;

/**
 * 調整場地數量（直接修改傳入的 courts 陣列）
 * - 增加：在尾端推入空場地
 * - 減少：移除最後一面場地；若該場地有選手則擋下
 *
 * @param {Array} courts - 場地陣列
 * @param {number} delta - 調整量（+1 或 -1）
 * @returns {Object} { courtCount } 或 { error }
 */
function changeCourtCountLogic(courts, delta) {
  const newCount = courts.length + delta;
  if (newCount < MIN_COURTS) {
    return { error: '至少需要 ' + MIN_COURTS + ' 面場地' };
  }
  if (newCount > MAX_COURTS) {
    return { error: '最多 ' + MAX_COURTS + ' 面場地' };
  }

  if (delta > 0) {
    for (let i = 0; i < delta; i++) {
      courts.push([]);
    }
  } else {
    for (let i = 0; i < -delta; i++) {
      const last = courts[courts.length - 1];
      if (last.length > 0) {
        return { error: '場地 ' + courts.length + ' 還有選手，請先清空該場地' };
      }
      courts.pop();
    }
  }

  return { courtCount: courts.length };
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    changeCourtCountLogic
  };
}
