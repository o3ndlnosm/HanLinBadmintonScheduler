/**
 * 配對核心邏輯模組
 * 從 script.js 抽取的純函式，可獨立測試
 */

function getPairKey(name1, name2) {
  return [name1, name2].sort().join('-');
}

// ABC 等級組合合法性檢查 - 10 種合法組合平等對待
function getABCCombinationPriority(players) {
  if (players.length !== 4) return 0;

  const levels = players.map(p => p.newLevel || 'B').sort().join('');

  // 禁止的 5 種跨級組合（A 和 C 直接搭配）
  const forbiddenCombinations = [
    'AAAC', 'ACCC', 'AABC', 'ABBC', 'ABCC'
  ];

  return forbiddenCombinations.includes(levels) ? 0 : 1;
}

// ABC 智能選手選擇：簡化版 — 等待≥2輪必上 + 合法組合 + 搭檔歷史去重
function selectPlayersWithABCLogic(availablePlayers, pairingHistory) {
  if (availablePlayers.length < 4) {
    return null;
  }

  // 1. 找出等待 ≥ 2 輪的必選選手
  const mustPlay = availablePlayers.filter(p => (p.waitingTurns || 0) >= 2);

  // 2. 生成所有可能的 4 人組合
  const allCombinations = [];
  function generateCombinations(players, current, start) {
    if (current.length === 4) {
      allCombinations.push([...current]);
      return;
    }
    for (let i = start; i < players.length; i++) {
      current.push(players[i]);
      generateCombinations(players, current, i + 1);
      current.pop();
    }
  }
  generateCombinations(availablePlayers, [], 0);

  // 3. 過濾合法組合，並計算包含多少必選選手
  const mustPlayNames = new Set(mustPlay.map(p => p.name));
  const mustPlayTarget = Math.min(mustPlay.length, 4);

  let validCombinations = allCombinations
    .filter(combo => getABCCombinationPriority(combo) > 0)
    .map(combo => {
      const mustPlayCount = combo.filter(p => mustPlayNames.has(p.name)).length;
      return { combo, mustPlayCount };
    });

  // 4. 盡量包含最多必選選手
  if (validCombinations.length > 0 && mustPlayTarget > 0) {
    const maxMustPlay = Math.max(...validCombinations.map(c => c.mustPlayCount));
    validCombinations = validCombinations.filter(c => c.mustPlayCount === maxMustPlay);
  }

  // 5. 如果沒有任何合法組合，開放所有組合
  if (validCombinations.length === 0) {
    validCombinations = allCombinations.map(combo => {
      const mustPlayCount = combo.filter(p => mustPlayNames.has(p.name)).length;
      return { combo, mustPlayCount };
    });
    const maxMustPlay = Math.max(...validCombinations.map(c => c.mustPlayCount));
    validCombinations = validCombinations.filter(c => c.mustPlayCount === maxMustPlay);
  }

  // 6. 評分：搭檔歷史去重 + 等待輪次
  const scored = validCombinations.map(({ combo, mustPlayCount }) => {
    let historyScore = 0;
    for (let i = 0; i < combo.length; i++) {
      for (let j = i + 1; j < combo.length; j++) {
        const key = getPairKey(combo[i].name, combo[j].name);
        historyScore += (pairingHistory[key] || 0);
      }
    }

    const waitingScore = combo.reduce((sum, p) => {
      const turns = p.waitingTurns || 0;
      const justFinishedPenalty = p.justFinished ? -2 : 0;
      return sum + turns + justFinishedPenalty;
    }, 0);

    return { combo, mustPlayCount, historyScore, waitingScore };
  });

  // 7. 排序：必選人數 desc > 等待分數 desc > 歷史分數 asc
  scored.sort((a, b) => {
    if (a.mustPlayCount !== b.mustPlayCount) return b.mustPlayCount - a.mustPlayCount;
    if (a.waitingScore !== b.waitingScore) return b.waitingScore - a.waitingScore;
    if (a.historyScore !== b.historyScore) return a.historyScore - b.historyScore;
    return 0;
  });

  if (scored.length === 0) return null;

  // 8. 同分候選隨機選一個
  const best = scored[0];
  const topCandidates = scored.filter(s =>
    s.mustPlayCount === best.mustPlayCount &&
    s.waitingScore === best.waitingScore &&
    s.historyScore === best.historyScore
  );
  const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  return chosen.combo;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getPairKey,
    getABCCombinationPriority,
    selectPlayersWithABCLogic
  };
}
