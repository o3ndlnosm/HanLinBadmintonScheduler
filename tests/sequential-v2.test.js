const {
  getPairKey,
  selectPlayersWithABCLogic
} = require('../js/pairing-logic');

function makePlayer(name, newLevel) {
  return { name, newLevel, waitingTurns: 0, matches: 0, justFinished: false };
}

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
// 逐場模擬 V2：追蹤每位選手的等待輪次歷程
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
  log.push(`第 ${session.id} 次社課｜${session.date}（逐場模擬 V2）`);
  log.push(`出席：${attendees.length} 人｜A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}｜場地：${numCourts} 個`);
  log.push(`模擬：${totalEndMatches} 次下場`);
  log.push('='.repeat(70));

  let readyPlayers = attendees.map(p => ({ ...p }));
  const courts = Array.from({ length: numCourts }, () => null);
  const pairingHistory = {};
  const comboCount = {};
  const allMatchKeys = [];

  // 每位選手的等待歷程追蹤
  const waitHistory = {}; // name → [每次上場前等了幾輪]
  attendees.forEach(p => { waitHistory[p.name] = []; });

  // 輔助：選人並記錄
  function assignCourt(courtIdx) {
    if (readyPlayers.length < 4) return null;

    const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
    if (!result) return null;

    const selectedNames = new Set(result.map(p => p.name));
    readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

    result.forEach(p => {
      // 記錄這位選手上場前等了幾輪
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

  // ---- 初始排場 ----
  log.push('\n【初始排場】');
  readyPlayers.forEach(p => { p.waitingTurns = 1; });
  for (let c = 0; c < numCourts; c++) {
    const match = assignCourt(c);
    if (match) {
      log.push(`  場地${c + 1}：[${match.levels}] ${match.result.map(p => p.name).join(', ')}`);
    }
  }

  const initWaiters = readyPlayers.length;
  if (initWaiters > 0) {
    log.push(`  等待中：${initWaiters} 人`);
  }

  // ---- 逐場下場循環 ----
  let courtOrder = 0;
  for (let endCount = 1; endCount <= totalEndMatches; endCount++) {
    // 找有比賽的場地
    let courtIdx = -1;
    for (let tries = 0; tries < numCourts; tries++) {
      const idx = (courtOrder + tries) % numCourts;
      if (courts[idx] !== null) {
        courtIdx = idx;
        courtOrder = (idx + 1) % numCourts;
        break;
      }
    }
    if (courtIdx === -1) continue;

    // 1. 下場
    const finishedPlayers = courts[courtIdx];
    finishedPlayers.forEach(p => {
      p.justFinished = true;
      p.waitingTurns = 0;
    });
    readyPlayers.push(...finishedPlayers);
    courts[courtIdx] = null;

    // 2. 非剛下場的人 waitingTurns +1
    readyPlayers.forEach(p => {
      if (!p.justFinished) {
        p.waitingTurns = (p.waitingTurns || 0) + 1;
      }
    });

    // 3. 之前的 justFinished → 變正常等待
    readyPlayers.forEach(p => {
      if (p.justFinished && !finishedPlayers.includes(p)) {
        p.justFinished = false;
        if (p.waitingTurns === 0) p.waitingTurns = 1;
      }
    });

    // 等待狀態紀錄
    const waitDist = {};
    readyPlayers.forEach(p => {
      const w = p.justFinished ? 'JF' : `W${p.waitingTurns}`;
      waitDist[w] = (waitDist[w] || 0) + 1;
    });

    // 最高等待
    const maxWait = Math.max(...readyPlayers.map(p => p.waitingTurns || 0));
    const urgentCount = readyPlayers.filter(p => (p.waitingTurns || 0) >= 3).length;

    log.push(`\n第${String(endCount).padStart(2)} 次下場（場地${courtIdx + 1}）| 準備區 ${readyPlayers.length} 人 | ${Object.entries(waitDist).map(([k, v]) => `${k}=${v}`).join(' ')} | 最高等待=${maxWait}`);

    // 4. 排新比賽
    const match = assignCourt(courtIdx);
    if (match) {
      const selectedInfo = match.result.map(p => {
        const waited = waitHistory[p.name][waitHistory[p.name].length - 1];
        return `${p.name}(等${waited})`;
      }).join(', ');
      log.push(`  → [${match.levels}] ${selectedInfo}`);
    } else {
      log.push(`  → 無法配對`);
    }
  }

  // ============ 統計報告 ============
  log.push(`\n${'═'.repeat(70)}`);
  log.push('【統計報告】');

  const totalMatches = Object.values(comboCount).reduce((a, b) => a + b, 0);
  log.push(`\n總比賽場次：${totalMatches} 場`);

  // 組合分布
  log.push('\n組合類型分布：');
  Object.entries(comboCount).sort((a, b) => b[1] - a[1]).forEach(([combo, count]) => {
    const pct = Math.round(count / totalMatches * 100);
    const bar = '█'.repeat(count);
    log.push(`  ${combo}：${count} 次（${pct}%）${bar}`);
  });

  // 配對重複度
  const pairCounts = Object.values(pairingHistory);
  const maxPair = Math.max(...pairCounts, 0);
  const avgPair = pairCounts.length > 0
    ? (pairCounts.reduce((a, b) => a + b, 0) / pairCounts.length).toFixed(2) : 0;

  log.push('\n配對重複度：');
  log.push(`  平均同場：${avgPair} | 最高同場：${maxPair}`);
  const pairDist = {};
  pairCounts.forEach(c => { pairDist[c] = (pairDist[c] || 0) + 1; });
  Object.entries(pairDist).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([count, pairs]) => {
    log.push(`    同場 ${count} 次：${pairs} 對`);
  });

  // 4 人完全重複
  const matchDup = {};
  allMatchKeys.forEach(key => { matchDup[key] = (matchDup[key] || 0) + 1; });
  const repeats = Object.entries(matchDup).filter(([, c]) => c > 1);
  log.push(`\n4人組合完全重複：${repeats.length > 0 ? repeats.length + ' 組' : '無'}`);
  repeats.forEach(([names, count]) => log.push(`    ${names}：${count} 次`));

  // ======== 等待輪次分析（重點！） ========
  log.push(`\n${'─'.repeat(70)}`);
  log.push('【等待輪次分析】每位選手每次上場前等了幾輪');
  log.push('');

  // 全域等待統計
  const allWaits = [];
  const playerWaitSummary = [];

  attendees.forEach(p => {
    const waits = waitHistory[p.name];
    if (waits.length === 0) return;
    allWaits.push(...waits);

    const avg = (waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1);
    const max = Math.max(...waits);
    const min = Math.min(...waits);
    playerWaitSummary.push({
      name: p.name,
      level: p.newLevel,
      matches: waits.length,
      avg: parseFloat(avg),
      max,
      min,
      waits
    });
  });

  // 按最大等待排序
  playerWaitSummary.sort((a, b) => b.max - a.max || b.avg - a.avg);

  // 等待輪次分布表
  const waitDistGlobal = {};
  allWaits.forEach(w => { waitDistGlobal[w] = (waitDistGlobal[w] || 0) + 1; });

  log.push('全體等待輪次分布（上場前等了幾輪）：');
  const totalWaitEntries = allWaits.length;
  Object.entries(waitDistGlobal).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([wait, count]) => {
    const pct = Math.round(count / totalWaitEntries * 100);
    const bar = '█'.repeat(Math.round(count / 2));
    log.push(`  等 ${wait} 輪：${count} 次（${pct}%）${bar}`);
  });

  const globalAvg = (allWaits.reduce((a, b) => a + b, 0) / allWaits.length).toFixed(1);
  const globalMax = Math.max(...allWaits);
  log.push(`\n  平均等待：${globalAvg} 輪 | 最大等待：${globalMax} 輪`);

  // 每位選手詳細
  log.push('\n各選手等待歷程（按最大等待排序）：');
  log.push('選手         | 等級 | 場次 | 平均等待 | 最大 | 最小 | 每次上場前等待輪次');
  log.push('-------------|------|------|---------|------|------|------------------');
  playerWaitSummary.forEach(p => {
    const nameCol = (p.name + '        ').slice(0, 12);
    const waitsStr = p.waits.join(', ');
    log.push(`${nameCol} |  ${p.level}   |  ${String(p.matches).padStart(2)}  |   ${String(p.avg).padStart(4)}  |  ${String(p.max).padStart(2)}  |  ${String(p.min).padStart(2)}  | [${waitsStr}]`);
  });

  // 場次公平性
  const matchCounts = playerWaitSummary.map(p => p.matches);
  const maxM = Math.max(...matchCounts);
  const minM = Math.min(...matchCounts);
  log.push(`\n場次公平性：最多 ${maxM} 場 / 最少 ${minM} 場 / 差距 ${maxM - minM}`);

  const output = log.join('\n');
  return {
    output, attendeeCount: attendees.length, levelCounts, comboCount,
    maxPair, avgPair, maxM, minM, totalMatches,
    globalAvgWait: parseFloat(globalAvg), globalMaxWait: globalMax
  };
}

// ============================================================
// 測試
// ============================================================
const allOutputs = [];
const summaryRows = [];

describe('逐場模擬 V2（含等待歷程）— 真實社課資料', () => {

  SESSIONS.forEach(session => {
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
        avgWait: result.globalAvgWait,
        maxWait: result.globalMaxWait,
      });

      expect(result.attendeeCount).toBeGreaterThanOrEqual(4);
    });
  });

  afterAll(() => {
    const summary = [];
    summary.push('\n' + '='.repeat(90));
    summary.push('【逐場模擬 V2 總覽】含等待輪次追蹤');
    summary.push('='.repeat(90));
    summary.push('');
    summary.push('次數  | 日期       | 人數 | 等級分布      | 場次 | 組合數 | 平均同場 | 最高同場 | 場次差 | 平均等待 | 最高等待');
    summary.push('------|------------|------|--------------|------|--------|---------|---------|--------|---------|--------');
    summaryRows.forEach(r => {
      summary.push(
        `${r.id.padEnd(5)} | ${r.date.padEnd(10)} | ${String(r.count).padEnd(4)} | ${r.levels.padEnd(12)} | ${String(r.totalMatches).padEnd(4)} | ${String(r.comboTypes).padEnd(6)} | ${String(r.avgPair).padEnd(7)} | ${String(r.maxPair).padEnd(7)} | ${r.matchDiff.padEnd(6)} | ${String(r.avgWait).padEnd(7)} | ${r.maxWait}`
      );
    });

    const avgMaxWait = (summaryRows.reduce((s, r) => s + r.maxWait, 0) / summaryRows.length).toFixed(1);
    const avgAvgWait = (summaryRows.reduce((s, r) => s + r.avgWait, 0) / summaryRows.length).toFixed(1);
    summary.push('');
    summary.push(`全社課平均「平均等待」：${avgAvgWait} 輪`);
    summary.push(`全社課平均「最高等待」：${avgMaxWait} 輪`);
    summary.push('');
    summary.push('說明：');
    summary.push('  - 「等待輪次」= 每次有場地下場但自己沒被選上，就算等 1 輪');
    summary.push('  - 「平均等待」= 該選手所有上場前的等待輪次取平均');
    summary.push('  - 31 人 3 場地，每次只有 4 人上場，19 人等待 → 理論最大等待 ≈ 19/4 ≈ 5 輪');

    const summaryStr = summary.join('\n');
    console.log(summaryStr);

    const fs = require('fs');
    const path = require('path');
    const fullReport = allOutputs.join('\n\n') + '\n\n' + summaryStr;
    fs.writeFileSync(
      path.join(__dirname, '逐場模擬V2結果.txt'),
      fullReport,
      'utf-8'
    );
    console.log(`\n📄 完整報告已寫入 tests/逐場模擬V2結果.txt`);
  });
});
