const {
  getPairKey,
  getABCCombinationPriority,
  selectPlayersWithABCLogic
} = require('../js/pairing-logic');

function makePlayer(name, newLevel, waitingTurns = 0) {
  return { name, newLevel, waitingTurns, matches: 0, justFinished: false };
}

/**
 * 模擬多輪排場，輸出詳細紀錄
 * @param {string} scenarioName - 場景名稱
 * @param {Array} initialPlayers - 初始選手列表
 * @param {number} courts - 場地數
 * @param {number} rounds - 模擬輪數
 */
function simulateSession(scenarioName, initialPlayers, courts, rounds) {
  const log = [];
  log.push(`\n${'='.repeat(70)}`);
  log.push(`場景：${scenarioName}`);
  log.push(`人數：${initialPlayers.length} 人 | 場地：${courts} 個 | 模擬：${rounds} 輪`);

  const levelCounts = { A: 0, B: 0, C: 0 };
  initialPlayers.forEach(p => levelCounts[p.newLevel]++);
  log.push(`等級分布：A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}`);
  log.push('='.repeat(70));

  // 狀態
  let readyPlayers = initialPlayers.map(p => ({ ...p }));
  let onCourt = []; // 目前在場上的選手（分場地）
  const pairingHistory = {};
  const matchLog = []; // 每輪比賽紀錄
  const playerStats = {}; // 選手統計
  initialPlayers.forEach(p => {
    playerStats[p.name] = { matches: 0, totalWait: 0, maxWait: 0, partners: {} };
  });

  for (let round = 1; round <= rounds; round++) {
    log.push(`\n--- 第 ${round} 輪 ---`);

    // 把上一輪場上的人放回準備區
    onCourt.forEach(courtPlayers => {
      courtPlayers.forEach(p => {
        p.justFinished = true;
        p.waitingTurns = 0;
        readyPlayers.push(p);
      });
    });
    onCourt = [];

    // 更新等待輪次（非剛下場的選手 +1）
    readyPlayers.forEach(p => {
      if (!p.justFinished) {
        p.waitingTurns = (p.waitingTurns || 0) + 1;
      }
    });

    // 記錄等待狀態
    const waitingDist = {};
    readyPlayers.forEach(p => {
      const w = p.justFinished ? 'JF' : `W${p.waitingTurns}`;
      waitingDist[w] = (waitingDist[w] || 0) + 1;
    });
    log.push(`準備區 ${readyPlayers.length} 人：${Object.entries(waitingDist).map(([k, v]) => `${k}=${v}`).join(', ')}`);

    // 為每個場地安排比賽
    const roundMatches = [];
    for (let c = 0; c < courts; c++) {
      if (readyPlayers.length < 4) break;

      const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
      if (!result) {
        log.push(`  場地${c + 1}：無法配對`);
        continue;
      }

      // 從準備區移除
      const selectedNames = new Set(result.map(p => p.name));
      readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

      // 清除狀態
      result.forEach(p => {
        p.justFinished = false;
        p.waitingTurns = 0;
        p.matches++;
      });

      // 記錄配對歷史（全部 6 對）
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const key = getPairKey(result[i].name, result[j].name);
          pairingHistory[key] = (pairingHistory[key] || 0) + 1;

          // 選手統計
          playerStats[result[i].name].partners[result[j].name] =
            (playerStats[result[i].name].partners[result[j].name] || 0) + 1;
          playerStats[result[j].name].partners[result[i].name] =
            (playerStats[result[j].name].partners[result[i].name] || 0) + 1;
        }
      }

      onCourt.push(result);
      const levels = result.map(p => p.newLevel).sort().join('');
      const names = result.map(p => p.name).join(', ');
      roundMatches.push({ court: c + 1, levels, names, players: result });
      log.push(`  場地${c + 1}：[${levels}] ${names}`);

      // 更新選手統計
      result.forEach(p => {
        playerStats[p.name].matches++;
      });
    }

    // 記錄剩餘等待者
    if (readyPlayers.length > 0) {
      const waiters = readyPlayers.map(p => {
        const w = p.justFinished ? '剛下場' : `等${p.waitingTurns}輪`;
        return `${p.name}(${p.newLevel},${w})`;
      }).join(', ');
      log.push(`  等待中：${waiters}`);
    }

    // 更新等待統計
    readyPlayers.forEach(p => {
      const wait = p.waitingTurns || 0;
      playerStats[p.name].totalWait += wait;
      if (wait > playerStats[p.name].maxWait) {
        playerStats[p.name].maxWait = wait;
      }
    });

    matchLog.push(roundMatches);
  }

  // ============ 統計報告 ============
  log.push(`\n${'─'.repeat(70)}`);
  log.push('【統計報告】');

  // 組合類型統計
  const comboCount = {};
  matchLog.forEach(roundMatches => {
    roundMatches.forEach(m => {
      comboCount[m.levels] = (comboCount[m.levels] || 0) + 1;
    });
  });
  log.push('\n組合類型分布：');
  Object.entries(comboCount).sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => {
    const bar = '█'.repeat(count);
    log.push(`  ${combo}：${count} 次 ${bar}`);
  });

  // 配對重複度分析
  const pairCounts = Object.values(pairingHistory);
  const maxPair = Math.max(...pairCounts, 0);
  const avgPair = pairCounts.length > 0 ? (pairCounts.reduce((a, b) => a + b, 0) / pairCounts.length).toFixed(1) : 0;
  const pairDist = {};
  pairCounts.forEach(c => { pairDist[c] = (pairDist[c] || 0) + 1; });

  log.push('\n配對重複度：');
  log.push(`  總配對數：${pairCounts.length} 對`);
  log.push(`  平均同場次數：${avgPair}`);
  log.push(`  最高同場次數：${maxPair}`);
  log.push('  分布：');
  Object.entries(pairDist).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([count, pairs]) => {
    log.push(`    同場 ${count} 次：${pairs} 對`);
  });

  // 找出最常配對的前 5 組
  const topPairs = Object.entries(pairingHistory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topPairs.length > 0) {
    log.push('\n  最常同場 Top 5：');
    topPairs.forEach(([pair, count]) => {
      log.push(`    ${pair}：${count} 次`);
    });
  }

  // 選手場次統計
  const matchCounts = Object.entries(playerStats)
    .map(([name, stats]) => ({ name, matches: stats.matches }))
    .sort((a, b) => b.matches - a.matches);
  const maxMatches = matchCounts[0]?.matches || 0;
  const minMatches = matchCounts[matchCounts.length - 1]?.matches || 0;

  log.push(`\n選手場次：最多 ${maxMatches} 場 / 最少 ${minMatches} 場 / 差距 ${maxMatches - minMatches}`);
  log.push('  各選手場次：');
  matchCounts.forEach(({ name, matches }) => {
    const bar = '█'.repeat(matches);
    const level = initialPlayers.find(p => p.name === name)?.newLevel || '?';
    log.push(`    ${name}(${level})：${matches} 場 ${bar}`);
  });

  // 等待輪次統計
  const maxWaits = Object.entries(playerStats)
    .map(([name, stats]) => ({ name, maxWait: stats.maxWait }))
    .filter(x => x.maxWait >= 2)
    .sort((a, b) => b.maxWait - a.maxWait);

  if (maxWaits.length > 0) {
    log.push('\n等待超過 2 輪的選手：');
    maxWaits.forEach(({ name, maxWait }) => {
      log.push(`    ${name}：最多等待 ${maxWait} 輪`);
    });
  } else {
    log.push('\n沒有選手等待超過 2 輪');
  }

  const output = log.join('\n');
  return { output, pairingHistory, playerStats, comboCount };
}

// ============================================================
// 各種場景模擬
// ============================================================

const allOutputs = [];

describe('模擬測試：各種人數與等級分布', () => {

  // 場景 1：12 人（4 的倍數，最小規模）
  test('場景 1：12 人（A2/B6/C4）3 場地 x 10 輪', () => {
    const players = [
      ...Array.from({ length: 2 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output, comboCount } = simulateSession('12人（A2/B6/C4）- 最小規模', players, 3, 10);
    allOutputs.push(output);
    console.log(output);
    expect(Object.keys(comboCount).length).toBeGreaterThan(0);
  });

  // 場景 2：16 人（4 的倍數）
  test('場景 2：16 人（A3/B8/C5）3 場地 x 10 輪', () => {
    const players = [
      ...Array.from({ length: 3 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 5 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('16人（A3/B8/C5）- 4的倍數', players, 3, 10);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 3：20 人（4 的倍數）
  test('場景 3：20 人（A4/B10/C6）3 場地 x 10 輪', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('20人（A4/B10/C6）- 4的倍數', players, 3, 10);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 4：24 人（4 的倍數，常見出席數）
  test('場景 4：24 人（A5/B12/C7）3 場地 x 12 輪', () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 12 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('24人（A5/B12/C7）- 常見出席數', players, 3, 12);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 5：31 人（上週實際人數）
  test('場景 5：31 人（A7/B14/C10）3 場地 x 12 輪', () => {
    const players = [
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 14 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('31人（A7/B14/C10）- 上週實際', players, 3, 12);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 6：31 人用真實名字
  test('場景 6：上週實際名單 31 人 x 12 輪', () => {
    const players = [
      makePlayer('孟娜', 'A'), makePlayer('威任', 'A'), makePlayer('Alan', 'A'),
      makePlayer('偉哲', 'A'), makePlayer('忠男', 'A'), makePlayer('奕鈞', 'A'),
      makePlayer('敬軒', 'A'),
      makePlayer('Irene', 'B'), makePlayer('小悠', 'B'), makePlayer('阿輊', 'B'),
      makePlayer('Ryan', 'B'), makePlayer('新翰', 'B'), makePlayer('Dora', 'B'),
      makePlayer('庭禎', 'B'), makePlayer('萬萊', 'B'), makePlayer('彥呈', 'B'),
      makePlayer('迺芸', 'B'), makePlayer('杰妮', 'B'), makePlayer('Rex', 'B'),
      makePlayer('Eating', 'B'), makePlayer('雨彤', 'B'),
      makePlayer('Anita', 'C'), makePlayer('玉珠', 'C'), makePlayer('小于', 'C'),
      makePlayer('蘭萍', 'C'), makePlayer('宏彬', 'C'), makePlayer('橘子', 'C'),
      makePlayer('Kana', 'C'), makePlayer('Emma', 'C'), makePlayer('郁嫺', 'C'),
      makePlayer('思齊', 'C'),
    ];
    const { output } = simulateSession('上週實際名單（第153次社課）', players, 3, 12);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 7：極端 - B 全部
  test('場景 7：18 人全部 B 級 x 10 輪', () => {
    const players = Array.from({ length: 18 }, (_, i) => makePlayer(`B${i + 1}`, 'B'));
    const { output } = simulateSession('18人全B - 極端同質', players, 3, 10);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 8：極端 - A 多 C 多，B 少
  test('場景 8：20 人（A8/B4/C8）極端兩極分化 x 10 輪', () => {
    const players = [
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('20人（A8/B4/C8）- 兩極分化', players, 3, 10);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 9：小規模
  test('場景 9：8 人（A1/B4/C3）2 場地 x 10 輪', () => {
    const players = [
      makePlayer('A1', 'A'),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 3 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('8人（A1/B4/C3）- 小規模2場地', players, 2, 10);
    allOutputs.push(output);
    console.log(output);
  });

  // 場景 10：大規模
  test('場景 10：36 人（A9/B18/C9）3 場地 x 15 輪', () => {
    const players = [
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 18 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const { output } = simulateSession('36人（A9/B18/C9）- 大規模', players, 3, 15);
    allOutputs.push(output);
    console.log(output);
  });

  // 最後輸出到檔案
  afterAll(() => {
    const fs = require('fs');
    const fullReport = allOutputs.join('\n\n');
    fs.writeFileSync(
      require('path').join(__dirname, '模擬測試結果.txt'),
      fullReport,
      'utf-8'
    );
    console.log(`\n\n📄 完整報告已寫入 tests/模擬測試結果.txt`);
  });
});
