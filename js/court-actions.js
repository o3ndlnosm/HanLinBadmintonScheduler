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

/**
 * 單人替換：場上選手回預備區（等待 +1、不計場次），
 * 從預備區完全隨機抽一人補入原位置（保持隊伍分組）
 *
 * @param {Array} courts - 場地陣列
 * @param {Array} readyPlayers - 預備區選手陣列
 * @param {number} courtIndex - 場地索引
 * @param {string} playerName - 被換下的選手名稱
 * @param {Array<string>} excludeNames - 不可被抽中補位的名單
 * @param {Function} rng - 亂數函式（預設 Math.random，測試時注入）
 * @returns {Object} { swappedOut, swappedIn } 或 { error }
 */
function swapPlayerOnCourtLogic(courts, readyPlayers, courtIndex, playerName, excludeNames, rng) {
  excludeNames = excludeNames || [];
  rng = rng || Math.random;

  const court = courts[courtIndex];
  if (!court) {
    return { error: '找不到場地 ' + (courtIndex + 1) };
  }

  const courtIdx = court.findIndex((p) => p.name === playerName);
  if (courtIdx === -1) {
    return { error: '場上找不到選手 ' + playerName };
  }

  const pool = readyPlayers.filter((p) => !excludeNames.includes(p.name));
  if (pool.length === 0) {
    return { error: '預備區沒有人可以補位' };
  }

  const replacement = pool[Math.floor(rng() * pool.length)];

  // 補上者：移出預備區、等待歸零、清除標記、放入原位置
  const readyIdx = readyPlayers.findIndex((p) => p.name === replacement.name);
  readyPlayers.splice(readyIdx, 1);
  replacement.waitingTurns = 0;
  replacement.justFinished = false;
  replacement.justJoinedReady = false;
  const swappedOut = court[courtIdx];
  court[courtIdx] = replacement;

  // 被換下者：這場沒上，等待 +1、清除標記、回預備區（不計場次）
  swappedOut.waitingTurns = (swappedOut.waitingTurns || 0) + 1;
  swappedOut.justFinished = false;
  swappedOut.justJoinedReady = false;
  readyPlayers.push(swappedOut);

  return { swappedOut: swappedOut, swappedIn: replacement };
}

/**
 * 整組替換：從場上 4 人隨機抽 2 人，各自替換
 * 補位抽樣排除本次所有被換下者（換下後不會立刻被抽回）
 *
 * @param {Array} courts - 場地陣列
 * @param {Array} readyPlayers - 預備區選手陣列
 * @param {number} courtIndex - 場地索引
 * @param {Function} rng - 亂數函式（預設 Math.random，測試時注入）
 * @returns {Object} { swaps: [{ swappedOut, swappedIn }, ...] } 或 { error }
 */
function swapCourtCombinationLogic(courts, readyPlayers, courtIndex, rng) {
  rng = rng || Math.random;

  const court = courts[courtIndex];
  if (!court || court.length !== 4) {
    return { error: '場地必須有 4 位選手才能替換組合' };
  }
  if (readyPlayers.length < 2) {
    return { error: '預備區不足 2 人，無法替換組合' };
  }

  // 從場上 4 人隨機抽 2 個不同的人
  const firstIdx = Math.floor(rng() * 4);
  let secondIdx = Math.floor(rng() * 3);
  if (secondIdx >= firstIdx) secondIdx += 1;
  const targetNames = [court[firstIdx].name, court[secondIdx].name];

  // 補位抽樣排除兩位被換下者（第一位換下後已回預備區，必須排除）
  const excludeNames = targetNames.slice();
  const swaps = [];
  for (let i = 0; i < targetNames.length; i++) {
    const result = swapPlayerOnCourtLogic(
      courts, readyPlayers, courtIndex, targetNames[i], excludeNames, rng
    );
    if (result.error) {
      return result;
    }
    swaps.push(result);
  }

  return { swaps: swaps };
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    changeCourtCountLogic,
    swapPlayerOnCourtLogic,
    swapCourtCombinationLogic
  };
}
