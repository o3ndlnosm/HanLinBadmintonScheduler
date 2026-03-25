/**
 * 選手狀態轉換模組
 * 從 script.js 抽取的純函式，可獨立測試
 */

/**
 * moveToReady 核心邏輯：將選手從選手列表或休息區移入準備區
 * - 從休息區回來：保留等待輪次
 * - 從選手列表初次加入：等待輪次歸零
 * - 場次調整為活躍選手平均場次
 *
 * @param {string} name - 選手名稱
 * @param {Object} state - 包含 players, readyPlayers, restingPlayers, courts
 * @returns {Object} 更新後的 state，或 null 如果找不到選手
 */
function moveToReadyLogic(name, state) {
  const { players, readyPlayers, restingPlayers, courts } = state;

  const fromRest = restingPlayers.find((p) => p.name === name);
  const fromPlayers = players.find((p) => p.name === name);
  const player = fromRest || fromPlayers;

  if (!player) {
    return null;
  }

  const newPlayers = players.filter((p) => p.name !== name);
  const newRestingPlayers = restingPlayers.filter((p) => p.name !== name);

  // 從休息區回來：保留等待輪次；從選手列表初次加入：歸零
  if (!fromRest) {
    player.waitingTurns = 0;
  }
  // 只有從選手列表初次加入才標記「剛加入」，休息區回來直接顯示等待輪次
  player.justJoinedReady = !fromRest;

  // 清除剛下場標記（如果有）
  if (player.justFinished) {
    player.justFinished = false;
  }

  // 將選手場次調整為所有活躍選手的平均場次
  const averageMatches = calculateActivePlayersAverageMatches(readyPlayers, courts);
  player.matches = averageMatches;

  const newReadyPlayers = [...readyPlayers, player];

  return {
    players: newPlayers,
    readyPlayers: newReadyPlayers,
    restingPlayers: newRestingPlayers,
    movedPlayer: player
  };
}

/**
 * moveToRest 核心邏輯：將選手從準備區移入休息區
 *
 * @param {string} name - 選手名稱
 * @param {Object} state - 包含 readyPlayers, restingPlayers
 * @returns {Object} 更新後的 state，或 null 如果找不到選手
 */
function moveToRestLogic(name, state) {
  const { readyPlayers, restingPlayers } = state;

  const player = readyPlayers.find((p) => p.name === name);
  if (!player) {
    return null;
  }

  const newReadyPlayers = readyPlayers.filter((p) => p.name !== name);
  const newRestingPlayers = [...restingPlayers, player];

  return {
    readyPlayers: newReadyPlayers,
    restingPlayers: newRestingPlayers,
    movedPlayer: player
  };
}

/**
 * 計算所有活躍選手的平均場次
 *
 * @param {Array} readyPlayers - 準備區選手
 * @param {Array} courts - 場地陣列 (每個元素為選手陣列)
 * @returns {number} 平均場次（四捨五入）
 */
function calculateActivePlayersAverageMatches(readyPlayers, courts) {
  const allActivePlayers = [];

  courts.forEach(court => {
    if (court.length > 0) {
      allActivePlayers.push(...court);
    }
  });

  allActivePlayers.push(...readyPlayers);

  if (allActivePlayers.length === 0) {
    return 0;
  }

  const totalMatches = allActivePlayers.reduce((sum, player) => sum + (player.matches || 0), 0);
  return Math.round(totalMatches / allActivePlayers.length);
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    moveToReadyLogic,
    moveToRestLogic,
    calculateActivePlayersAverageMatches
  };
}
