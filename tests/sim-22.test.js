const {
  getPairKey,
  selectPlayersWithABCLogic
} = require('../js/pairing-logic');

function makePlayer(name, newLevel) {
  return { name, newLevel, waitingTurns: 0, matches: 0, justFinished: false };
}

function simulateSequential(label, players, numCourts, totalEndMatches) {
  const attendees = players.map(p => ({ ...p }));
  const levelCounts = { A: 0, B: 0, C: 0 };
  attendees.forEach(p => levelCounts[p.newLevel]++);

  const log = [];
  log.push(`\n${'='.repeat(70)}`);
  log.push(`${label}`);
  log.push(`出席：${attendees.length} 人｜A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}｜場地：${numCourts} 個`);
  log.push(`模擬：${totalEndMatches} 次下場`);
  log.push('='.repeat(70));

  let readyPlayers = attendees.map(p => ({ ...p }));
  const courts = Array.from({ length: numCourts }, () => null);
  const pairingHistory = {};
  const comboCount = {};
  const allMatchKeys = [];
  const waitHistory = {};
  attendees.forEach(p => { waitHistory[p.name] = []; });

  function assignCourt(courtIdx) {
    if (readyPlayers.length < 4) return null;
    const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
    if (!result) return null;

    const selectedNames = new Set(result.map(p => p.name));
    readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

    result.forEach(p => {
      waitHistory[p.name].push(p.waitingTurns || 0);
      p.justFinished = false;
      p.waitingTurns = 0;
      p.matches++;
    });

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const key = getPairKey(result[i].name, result[j].name);
        pairingHistory[key] = (pairingHistory[key] || 0) + 1;
      }
    }

    courts[courtIdx] = result;
    const levels = result.map(p => p.newLevel).sort().join('');
    comboCount[levels] = (comboCount[levels] || 0) + 1;
    allMatchKeys.push(result.map(p => p.name).sort().join(','));
    return { result, levels };
  }

  // 初始排場
  log.push('\n【初始排場】');
  readyPlayers.forEach(p => { p.waitingTurns = 1; });
  for (let c = 0; c < numCourts; c++) {
    const match = assignCourt(c);
    if (match) log.push(`  場地${c + 1}：[${match.levels}] ${match.result.map(p => p.name).join(', ')}`);
  }
  log.push(`  等待中：${readyPlayers.length} 人`);

  // 逐場下場
  let courtOrder = 0;
  for (let endCount = 1; endCount <= totalEndMatches; endCount++) {
    let courtIdx = -1;
    for (let tries = 0; tries < numCourts; tries++) {
      const idx = (courtOrder + tries) % numCourts;
      if (courts[idx] !== null) { courtIdx = idx; courtOrder = (idx + 1) % numCourts; break; }
    }
    if (courtIdx === -1) continue;

    const finishedPlayers = courts[courtIdx];
    finishedPlayers.forEach(p => { p.justFinished = true; p.waitingTurns = 0; });
    readyPlayers.push(...finishedPlayers);
    courts[courtIdx] = null;

    readyPlayers.forEach(p => {
      if (!p.justFinished) p.waitingTurns = (p.waitingTurns || 0) + 1;
    });
    readyPlayers.forEach(p => {
      if (p.justFinished && !finishedPlayers.includes(p)) {
        p.justFinished = false;
        if (p.waitingTurns === 0) p.waitingTurns = 1;
      }
    });

    const waitDist = {};
    readyPlayers.forEach(p => {
      const w = p.justFinished ? 'JF' : `W${p.waitingTurns}`;
      waitDist[w] = (waitDist[w] || 0) + 1;
    });
    const maxWait = Math.max(...readyPlayers.map(p => p.waitingTurns || 0));

    log.push(`\n第${String(endCount).padStart(2)} 次下場（場地${courtIdx + 1}）| 準備區 ${readyPlayers.length} 人 | ${Object.entries(waitDist).map(([k, v]) => `${k}=${v}`).join(' ')} | 最高等待=${maxWait}`);

    const match = assignCourt(courtIdx);
    if (match) {
      const info = match.result.map(p => {
        const w = waitHistory[p.name][waitHistory[p.name].length - 1];
        return `${p.name}(等${w})`;
      }).join(', ');
      log.push(`  → [${match.levels}] ${info}`);
    } else {
      log.push(`  → 無法配對`);
    }
  }

  // 統計
  log.push(`\n${'═'.repeat(70)}`);
  log.push('【統計報告】');

  const totalMatches = Object.values(comboCount).reduce((a, b) => a + b, 0);
  log.push(`\n總比賽場次：${totalMatches} 場`);

  log.push('\n組合類型分布：');
  Object.entries(comboCount).sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => {
    const pct = Math.round(count / totalMatches * 100);
    log.push(`  ${combo}：${count} 次（${pct}%）${'█'.repeat(count)}`);
  });

  const pairCounts = Object.values(pairingHistory);
  const maxPair = Math.max(...pairCounts, 0);
  const avgPair = pairCounts.length > 0 ? (pairCounts.reduce((a, b) => a + b, 0) / pairCounts.length).toFixed(2) : 0;
  log.push(`\n配對重複度：平均同場 ${avgPair} | 最高同場 ${maxPair}`);
  const pairDist = {};
  pairCounts.forEach(c => { pairDist[c] = (pairDist[c] || 0) + 1; });
  Object.entries(pairDist).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([count, pairs]) => {
    log.push(`    同場 ${count} 次：${pairs} 對`);
  });

  const matchDup = {};
  allMatchKeys.forEach(key => { matchDup[key] = (matchDup[key] || 0) + 1; });
  const repeats = Object.entries(matchDup).filter(([, c]) => c > 1);
  log.push(`\n4人組合完全重複：${repeats.length > 0 ? repeats.length + ' 組' : '無'}`);
  repeats.forEach(([names, count]) => log.push(`    ${names}：${count} 次`));

  // 等待分析
  log.push(`\n${'─'.repeat(70)}`);
  log.push('【等待輪次分析】');

  const allWaits = [];
  const playerWaitSummary = [];
  attendees.forEach(p => {
    const waits = waitHistory[p.name];
    if (waits.length === 0) return;
    allWaits.push(...waits);
    const avg = (waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1);
    const max = Math.max(...waits);
    playerWaitSummary.push({ name: p.name, level: p.newLevel, matches: waits.length, avg: parseFloat(avg), max, waits });
  });
  playerWaitSummary.sort((a, b) => b.max - a.max || b.avg - a.avg);

  const waitDistGlobal = {};
  allWaits.forEach(w => { waitDistGlobal[w] = (waitDistGlobal[w] || 0) + 1; });
  const totalW = allWaits.length;

  log.push('\n全體等待輪次分布：');
  Object.entries(waitDistGlobal).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([wait, count]) => {
    const pct = Math.round(count / totalW * 100);
    log.push(`  等 ${wait} 輪：${count} 次（${pct}%）${'█'.repeat(Math.round(count / 2))}`);
  });

  const globalAvg = (allWaits.reduce((a, b) => a + b, 0) / allWaits.length).toFixed(1);
  const globalMax = Math.max(...allWaits);
  log.push(`\n  平均等待：${globalAvg} 輪 | 最大等待：${globalMax} 輪`);

  log.push('\n各選手等待歷程：');
  log.push('選手         | 等級 | 場次 | 平均等待 | 最大 | 每次上場前等待');
  log.push('-------------|------|------|---------|------|---------------');
  playerWaitSummary.forEach(p => {
    const nameCol = (p.name + '        ').slice(0, 12);
    log.push(`${nameCol} |  ${p.level}   |  ${String(p.matches).padStart(2)}  |   ${String(p.avg).padStart(4)}  |  ${String(p.max).padStart(2)}  | [${p.waits.join(', ')}]`);
  });

  const matchCounts = playerWaitSummary.map(p => p.matches);
  const maxM = Math.max(...matchCounts);
  const minM = Math.min(...matchCounts);
  log.push(`\n場次公平性：最多 ${maxM} 場 / 最少 ${minM} 場 / 差距 ${maxM - minM}`);

  const output = log.join('\n');
  return { output, globalAvg: parseFloat(globalAvg), globalMax, maxPair, maxM, minM, comboCount, repeats };
}

// ============================================================
// 22 人模擬：不同等級分布
// ============================================================

const allOutputs = [];

describe('22 人逐場模擬', () => {

  test('22 人（A5/B10/C7）— 接近實際比例', () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 10 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const r = simulateSequential('22人（A5/B10/C7）— 接近實際比例', players, 3, 30);
    allOutputs.push(r.output);
    console.log(r.output);
  });

  test('22 人（A4/B11/C7）— B 稍多', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 11 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const r = simulateSequential('22人（A4/B11/C7）— B稍多', players, 3, 30);
    allOutputs.push(r.output);
    console.log(r.output);
  });

  test('22 人（A6/B9/C7）— A 稍多', () => {
    const players = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`C${i + 1}`, 'C')),
    ];
    const r = simulateSequential('22人（A6/B9/C7）— A稍多', players, 3, 30);
    allOutputs.push(r.output);
    console.log(r.output);
  });

  test('22 人用真實名字（從 27 人中取 22 人）', () => {
    const players = [
      makePlayer('孟娜', 'A'), makePlayer('威任', 'A'), makePlayer('Alan', 'A'),
      makePlayer('偉哲', 'A'), makePlayer('敬軒', 'A'),
      makePlayer('Irene', 'B'), makePlayer('小悠', 'B'), makePlayer('阿輊', 'B'),
      makePlayer('Ryan', 'B'), makePlayer('新翰', 'B'), makePlayer('Dora', 'B'),
      makePlayer('庭禎', 'B'), makePlayer('萬萊', 'B'), makePlayer('彥呈', 'B'),
      makePlayer('迺芸', 'B'),
      makePlayer('Anita', 'C'), makePlayer('玉珠', 'C'), makePlayer('宏彬', 'C'),
      makePlayer('橘子', 'C'), makePlayer('Kana', 'C'), makePlayer('思齊', 'C'),
      makePlayer('郁嫺', 'C'),
    ];
    const r = simulateSequential('22人真實名字（A5/B10/C7）', players, 3, 30);
    allOutputs.push(r.output);
    console.log(r.output);
  });

  afterAll(() => {
    // 對照表
    const compare = [];
    compare.push('\n' + '='.repeat(70));
    compare.push('【22 人 vs 24-29 人 等待輪次對照】');
    compare.push('='.repeat(70));
    compare.push('');
    compare.push('人數 | 等待人數 | 理論最大等待 | 說明');
    compare.push('-----|---------|-------------|------');
    compare.push('22   | 10      | 10÷4=2.5→3  | 最多等 3 輪');
    compare.push('24   | 12      | 12÷4=3→3    | 最多等 3 輪，但易形成固定循環');
    compare.push('25   | 13      | 13÷4=3.25→4 | 最多等 4 輪');
    compare.push('27   | 15      | 15÷4=3.75→4 | 最多等 4-5 輪');
    compare.push('29   | 17      | 17÷4=4.25→5 | 最多等 5 輪');
    compare.push('31   | 19      | 19÷4=4.75→5 | 最多等 5 輪');
    compare.push('');
    compare.push('結論：22 人是讓最大等待控制在 3 輪以內的甜蜜點。');

    const compareStr = compare.join('\n');
    console.log(compareStr);

    const fs = require('fs');
    const path = require('path');
    const fullReport = allOutputs.join('\n\n') + '\n\n' + compareStr;
    fs.writeFileSync(path.join(__dirname, '22人模擬結果.txt'), fullReport, 'utf-8');
    console.log(`\n📄 完整報告已寫入 tests/22人模擬結果.txt`);
  });
});
