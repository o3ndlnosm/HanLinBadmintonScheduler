const {
  getPairKey,
  selectPlayersWithABCLogic
} = require('../js/pairing-logic');

function makePlayer(name, newLevel) {
  return { name, newLevel, waitingTurns: 0, matches: 0, justFinished: false };
}

// ============================================================
// 全名 → 暱稱 + 等級 對照表
// ============================================================
const PLAYER_DATA = {
  '呂孟娜': { nick: '孟娜', level: 'A' },
  '楊皓婷': { nick: 'Irene', level: 'B' },
  '陳威任': { nick: '威任', level: 'A' },
  '吳玉婷': { nick: '小悠', level: 'B' },
  '廖翊凱': { nick: 'Alan', level: 'A' },
  '蔡依玲': { nick: 'Anita', level: 'C' },
  '陳奕廷': { nick: 'Eating', level: 'B' },
  '柳雨彤': { nick: '雨彤', level: 'B' },
  '林玉珠': { nick: '玉珠', level: 'C' },
  '劉杰妮': { nick: '杰妮', level: 'B' },
  '洪于婷': { nick: '小于', level: 'C' },
  '洪蘭萍': { nick: '蘭萍', level: 'C' },
  '林丞輊': { nick: '阿輊', level: 'B' },
  '沈閔諺': { nick: 'Ryan', level: 'B' },
  '高新翰': { nick: '新翰', level: 'B' },
  '陳怡伶': { nick: 'Dora', level: 'B' },
  '廖宏彬': { nick: '宏彬', level: 'C' },
  '蘇虹燏': { nick: '橘子', level: 'C' },
  '曾偉哲': { nick: '偉哲', level: 'A' },
  '陳彥文': { nick: 'Rex', level: 'B' },
  '黃詩蓓': { nick: 'Kana', level: 'C' },
  '邱韋欣': { nick: 'Emma', level: 'C' },
  '陳思齊': { nick: '思齊', level: 'C' },
  '謝郁嫺': { nick: '郁嫺', level: 'C' },
  '傅敬軒': { nick: '敬軒', level: 'A' },
  '黃迺芸': { nick: '迺芸', level: 'B' },
  '湯庭禎': { nick: '庭禎', level: 'B' },
  '邱奕鈞': { nick: '奕鈞', level: 'A' },
  '郭彥呈': { nick: '彥呈', level: 'B' },
  '吳萬萊': { nick: '萬萊', level: 'B' },
  '賴忠男': { nick: '忠男', level: 'A' },
};

const COLUMN_ORDER = [
  '呂孟娜','楊皓婷','陳威任','吳玉婷','廖翊凱','蔡依玲','陳奕廷','柳雨彤',
  '林玉珠','劉杰妮','洪于婷','洪蘭萍','林丞輊','沈閔諺','高新翰','陳怡伶',
  '廖宏彬','蘇虹燏','曾偉哲','陳彥文','黃詩蓓','邱韋欣','陳思齊','謝郁嫺',
  '傅敬軒','黃迺芸','湯庭禎','邱奕鈞','郭彥呈','吳萬萊','賴忠男'
];

const SESSIONS = [
  { id: '145', date: '2026/1/8',   attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,N,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y'.split(',') },
  { id: '146', date: '2026/1/15',  attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y'.split(',') },
  { id: '147', date: '2026/1/22',  attendance: 'Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,N,Y,N,Y'.split(',') },
  { id: '148', date: '2026/1/29',  attendance: 'Y,Y,N,Y,Y,Y,N,Y,N,Y,Y,Y,Y,N,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,N'.split(',') },
  { id: '149', date: '2026/2/5',   attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,N,N,N,Y,N,Y,Y,Y,Y'.split(',') },
  { id: '150', date: '2026/2/12',  attendance: 'Y,Y,N,Y,Y,N,Y,Y,Y,Y,Y,N,N,Y,Y,Y,Y,N,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',') },
  { id: '151', date: '2026/2/26',  attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,N,N,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,N,Y,Y,Y,Y'.split(',') },
  { id: '152', date: '2026/3/5',   attendance: 'Y,Y,Y,Y,Y,N,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,N,N,N,N,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',') },
  { id: '153', date: '2026/3/12',  attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,N,Y,N,Y,Y,N,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',') },
];

// ============================================================
// 逐場模擬引擎（一場一場下場，不是三場同時下）
// ============================================================
function simulateSequential(session, numCourts, totalEndMatches) {
  const attendees = [];
  session.attendance.forEach((status, i) => {
    if (status === 'Y' && PLAYER_DATA[COLUMN_ORDER[i]]) {
      const { nick, level } = PLAYER_DATA[COLUMN_ORDER[i]];
      attendees.push(makePlayer(nick, level));
    }
  });

  const levelCounts = { A: 0, B: 0, C: 0 };
  attendees.forEach(p => levelCounts[p.newLevel]++);

  const log = [];
  log.push(`\n${'='.repeat(70)}`);
  log.push(`第 ${session.id} 次社課｜${session.date}（逐場模擬）`);
  log.push(`出席：${attendees.length} 人｜A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}｜場地：${numCourts} 個`);
  log.push(`模擬：${totalEndMatches} 次下場（一場一場依序下）`);
  log.push(`選手：${attendees.map(p => `${p.name}(${p.newLevel})`).join(', ')}`);
  log.push('='.repeat(70));

  // 狀態
  let readyPlayers = attendees.map(p => ({ ...p }));
  const courts = Array.from({ length: numCourts }, () => null); // null = 空場地
  const pairingHistory = {};
  const comboCount = {};
  const allMatchKeys = [];

  // ---- 初始排場：填滿所有場地 ----
  log.push('\n【初始排場】');
  for (let c = 0; c < numCourts; c++) {
    if (readyPlayers.length < 4) break;

    // 初始排場前，所有人等待 1 輪
    readyPlayers.forEach(p => { if (p.waitingTurns === 0) p.waitingTurns = 1; });

    const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
    if (!result) continue;

    const selectedNames = new Set(result.map(p => p.name));
    readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

    result.forEach(p => { p.justFinished = false; p.waitingTurns = 0; p.matches++; });

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const key = getPairKey(result[i].name, result[j].name);
        pairingHistory[key] = (pairingHistory[key] || 0) + 1;
      }
    }

    courts[c] = result;
    const levels = result.map(p => p.newLevel).sort().join('');
    comboCount[levels] = (comboCount[levels] || 0) + 1;
    allMatchKeys.push(result.map(p => p.name).sort().join(','));
    log.push(`  場地${c + 1}：[${levels}] ${result.map(p => p.name).join(', ')}`);
  }

  // 記錄初始等待
  const initWaiters = readyPlayers.filter(p => !p.justFinished);
  if (initWaiters.length > 0) {
    log.push(`  等待中（${initWaiters.length}人）：${initWaiters.map(p => `${p.name}(${p.newLevel})`).join(', ')}`);
  }

  // ---- 逐場下場循環 ----
  // 模擬一場一場結束，按場地 1→2→3→1→2→3... 循環
  let courtOrder = 0;
  for (let endCount = 1; endCount <= totalEndMatches; endCount++) {
    // 找下一個有比賽的場地結束
    let courtIdx = -1;
    for (let tries = 0; tries < numCourts; tries++) {
      const idx = (courtOrder + tries) % numCourts;
      if (courts[idx] !== null) {
        courtIdx = idx;
        courtOrder = (idx + 1) % numCourts;
        break;
      }
    }
    if (courtIdx === -1) {
      log.push(`\n第 ${endCount} 次下場：所有場地都空，跳過`);
      continue;
    }

    log.push(`\n--- 第 ${endCount} 次下場（場地${courtIdx + 1}）---`);

    // 1. 場上 4 人下場 → 回到準備區
    const finishedPlayers = courts[courtIdx];
    finishedPlayers.forEach(p => {
      p.justFinished = true;
      p.waitingTurns = 0;
    });
    readyPlayers.push(...finishedPlayers);
    courts[courtIdx] = null;

    // 2. 所有在準備區且非剛下場的人，等待輪次 +1
    readyPlayers.forEach(p => {
      if (!p.justFinished) {
        p.waitingTurns = (p.waitingTurns || 0) + 1;
      }
    });

    // 3. 清除之前剛下場的標記（只保留本輪剛下場的）
    readyPlayers.forEach(p => {
      if (p.justFinished && !finishedPlayers.includes(p)) {
        // 之前的剛下場 → 變成等待 1 輪
        p.justFinished = false;
        if (p.waitingTurns === 0) p.waitingTurns = 1;
      }
    });

    // 等待狀態
    const waitDist = {};
    readyPlayers.forEach(p => {
      const w = p.justFinished ? 'JF' : `W${p.waitingTurns}`;
      waitDist[w] = (waitDist[w] || 0) + 1;
    });
    log.push(`準備區 ${readyPlayers.length} 人：${Object.entries(waitDist).map(([k, v]) => `${k}=${v}`).join(', ')}`);

    // 顯示等待 ≥ 2 輪的選手
    const urgentPlayers = readyPlayers.filter(p => (p.waitingTurns || 0) >= 2);
    if (urgentPlayers.length > 0) {
      log.push(`  ⚠ 等待≥2輪：${urgentPlayers.map(p => `${p.name}(等${p.waitingTurns}輪)`).join(', ')}`);
    }

    // 4. 為空場地排新的比賽
    if (readyPlayers.length >= 4) {
      const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
      if (result) {
        const selectedNames = new Set(result.map(p => p.name));
        readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

        result.forEach(p => { p.justFinished = false; p.waitingTurns = 0; p.matches++; });

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
        log.push(`  → 新比賽：[${levels}] ${result.map(p => p.name).join(', ')}`);
      } else {
        log.push(`  → 無法配對（等級限制）`);
      }
    } else {
      log.push(`  → 人數不足，場地${courtIdx + 1}暫時空置`);
    }
  }

  // ============ 統計 ============
  log.push(`\n${'─'.repeat(70)}`);
  log.push('【統計報告】');

  // 組合分布
  const totalMatches = Object.values(comboCount).reduce((a, b) => a + b, 0);
  log.push(`\n總比賽場次：${totalMatches} 場（初始 ${numCourts} 場 + ${totalEndMatches} 次下場）`);
  log.push('\n組合類型分布：');
  Object.entries(comboCount).sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => {
    const pct = Math.round(count / totalMatches * 100);
    const bar = '█'.repeat(count);
    log.push(`  ${combo}：${count} 次（${pct}%）${bar}`);
  });
  log.push(`  共 ${Object.keys(comboCount).length} 種組合類型`);

  // 配對重複度
  const pairCounts = Object.values(pairingHistory);
  const maxPair = Math.max(...pairCounts, 0);
  const avgPair = pairCounts.length > 0
    ? (pairCounts.reduce((a, b) => a + b, 0) / pairCounts.length).toFixed(2)
    : 0;

  log.push('\n配對重複度：');
  log.push(`  總配對組合數：${pairCounts.length} 對`);
  log.push(`  平均同場次數：${avgPair}`);
  log.push(`  最高同場次數：${maxPair}`);

  const pairDist = {};
  pairCounts.forEach(c => { pairDist[c] = (pairDist[c] || 0) + 1; });
  Object.entries(pairDist).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([count, pairs]) => {
    log.push(`    同場 ${count} 次：${pairs} 對`);
  });

  const topPairs = Object.entries(pairingHistory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  log.push('\n  最常同場 Top 8：');
  topPairs.forEach(([pair, count]) => {
    log.push(`    ${pair}：${count} 次`);
  });

  // 4 人組合完全重複
  const matchDup = {};
  allMatchKeys.forEach(key => { matchDup[key] = (matchDup[key] || 0) + 1; });
  const repeats = Object.entries(matchDup).filter(([, c]) => c > 1);
  log.push(`\n4 人組合完全重複：${repeats.length > 0 ? repeats.length + ' 組' : '無'}`);
  repeats.forEach(([names, count]) => {
    log.push(`    ${names}：重複 ${count} 次`);
  });

  // 場次統計
  const allPlayerObjs = [...readyPlayers, ...courts.filter(c => c !== null).flat()];
  const matchCountMap = {};
  attendees.forEach(p => { matchCountMap[p.name] = 0; });
  allPlayerObjs.forEach(p => {
    if (matchCountMap[p.name] !== undefined) matchCountMap[p.name] = p.matches;
  });

  const matchEntries = Object.entries(matchCountMap).sort((a, b) => b[1] - a[1]);
  const maxM = matchEntries[0]?.[1] || 0;
  const minM = matchEntries[matchEntries.length - 1]?.[1] || 0;
  log.push(`\n選手場次：最多 ${maxM} 場 / 最少 ${minM} 場 / 差距 ${maxM - minM}`);
  matchEntries.forEach(([name, matches]) => {
    const level = attendees.find(p => p.name === name)?.newLevel || '?';
    const bar = '█'.repeat(matches);
    log.push(`  ${name}(${level})：${matches} 場 ${bar}`);
  });

  // 等待輪次最高統計（需要在過程中追蹤）
  log.push('');

  const output = log.join('\n');
  return { output, attendeeCount: attendees.length, levelCounts, comboCount, maxPair, avgPair, maxM, minM, totalMatches };
}

// ============================================================
// 測試
// ============================================================
const allOutputs = [];
const summaryRows = [];

describe('逐場模擬（一場一場下場）— 真實社課資料', () => {

  SESSIONS.forEach(session => {
    // 每次社課模擬 30 次下場（約等於實際 2 小時的場次量）
    test(`第 ${session.id} 次社課（${session.date}）`, () => {
      const result = simulateSequential(session, 3, 30);
      allOutputs.push(result.output);
      console.log(result.output);

      summaryRows.push({
        id: session.id,
        date: session.date,
        count: result.attendeeCount,
        levels: `A${result.levelCounts.A}/B${result.levelCounts.B}/C${result.levelCounts.C}`,
        totalMatches: result.totalMatches,
        comboTypes: Object.keys(result.comboCount).length,
        avgPair: result.avgPair,
        maxPair: result.maxPair,
        matchDiff: `${result.maxM}-${result.minM}=${result.maxM - result.minM}`,
      });

      expect(result.attendeeCount).toBeGreaterThanOrEqual(4);
    });
  });

  afterAll(() => {
    const summary = [];
    summary.push('\n' + '='.repeat(80));
    summary.push('【逐場模擬總覽】一場一場依序下場，每次社課 30 次下場');
    summary.push('='.repeat(80));
    summary.push('');
    summary.push('次數  | 日期       | 人數 | 等級分布      | 總場次 | 組合種類 | 平均同場 | 最高同場 | 場次差距');
    summary.push('------|------------|------|--------------|--------|---------|---------|---------|--------');
    summaryRows.forEach(r => {
      summary.push(
        `${r.id.padEnd(5)} | ${r.date.padEnd(10)} | ${String(r.count).padEnd(4)} | ${r.levels.padEnd(12)} | ${String(r.totalMatches).padEnd(6)} | ${String(r.comboTypes).padEnd(7)} | ${String(r.avgPair).padEnd(7)} | ${String(r.maxPair).padEnd(7)} | ${r.matchDiff}`
      );
    });

    const avgMaxPair = (summaryRows.reduce((s, r) => s + r.maxPair, 0) / summaryRows.length).toFixed(1);
    summary.push('');
    summary.push(`平均「最高同場次數」：${avgMaxPair}`);
    summary.push('');
    summary.push('備註：逐場模擬更接近實際操作。每次下場只有 1 個場地的 4 人回到準備區，');
    summary.push('      而非 3 場同時下場 12 人同時回來。等待輪次以「場地下場次數」為單位累加。');

    const summaryStr = summary.join('\n');
    console.log(summaryStr);

    const fs = require('fs');
    const path = require('path');
    const fullReport = allOutputs.join('\n\n') + '\n\n' + summaryStr;
    fs.writeFileSync(
      path.join(__dirname, '逐場模擬結果.txt'),
      fullReport,
      'utf-8'
    );
    console.log(`\n📄 完整報告已寫入 tests/逐場模擬結果.txt`);
  });
});
