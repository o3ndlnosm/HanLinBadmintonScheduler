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
  '呂孟娜':   { nick: '孟娜',   level: 'A' },
  '楊皓婷':   { nick: 'Irene',  level: 'B' },
  '陳威任':   { nick: '威任',   level: 'A' },
  '吳玉婷':   { nick: '小悠',   level: 'B' },
  '廖翊凱':   { nick: 'Alan',   level: 'A' },
  '蔡依玲':   { nick: 'Anita',  level: 'C' },
  '陳奕廷':   { nick: 'Eating', level: 'B' },
  '柳雨彤':   { nick: '雨彤',   level: 'B' },
  '林玉珠':   { nick: '玉珠',   level: 'C' },
  '劉杰妮':   { nick: '杰妮',   level: 'B' },
  '洪于婷':   { nick: '小于',   level: 'C' },
  '洪蘭萍':   { nick: '蘭萍',   level: 'C' },
  '林丞輊':   { nick: '阿輊',   level: 'B' },
  '沈閔諺':   { nick: 'Ryan',   level: 'B' },
  '高新翰':   { nick: '新翰',   level: 'B' },
  '陳怡伶':   { nick: 'Dora',   level: 'B' },
  '廖宏彬':   { nick: '宏彬',   level: 'C' },
  '蘇虹燏':   { nick: '橘子',   level: 'C' },
  '曾偉哲':   { nick: '偉哲',   level: 'A' },
  '陳彥文':   { nick: 'Rex',    level: 'B' },
  '黃詩蓓':   { nick: 'Kana',   level: 'C' },
  '邱韋欣':   { nick: 'Emma',   level: 'C' },
  '陳思齊':   { nick: '思齊',   level: 'C' },
  '謝郁嫺':   { nick: '郁嫺',   level: 'C' },
  '傅敬軒':   { nick: '敬軒',   level: 'A' },
  '黃迺芸':   { nick: '迺芸',   level: 'B' },
  '湯庭禎':   { nick: '庭禎',   level: 'B' },
  '邱奕鈞':   { nick: '奕鈞',   level: 'A' },
  '郭彥呈':   { nick: '彥呈',   level: 'B' },
  '吳萬萊':   { nick: '萬萊',   level: 'B' },
  '賴忠男':   { nick: '忠男',   level: 'A' },
};

// 出席紀錄欄位順序（與 2026 sheet 的欄位對應）
const COLUMN_ORDER = [
  '呂孟娜','楊皓婷','陳威任','吳玉婷','廖翊凱','蔡依玲','陳奕廷','柳雨彤',
  '林玉珠','劉杰妮','洪于婷','洪蘭萍','林丞輊','沈閔諺','高新翰','陳怡伶',
  '廖宏彬','蘇虹燏','曾偉哲','陳彥文','黃詩蓓','邱韋欣','陳思齊','謝郁嫺',
  '傅敬軒','黃迺芸','湯庭禎','邱奕鈞','郭彥呈','吳萬萊','賴忠男'
];

// ============================================================
// 各次社課的出席紀錄（Y=出席, N=缺席）
// ============================================================
const SESSIONS = [
  {
    id: '145', date: '2026/1/8',
    attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,N,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y'.split(',')
  },
  {
    id: '146', date: '2026/1/15',
    attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y'.split(',')
  },
  {
    id: '147', date: '2026/1/22',
    attendance: 'Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,N,Y,N,Y'.split(',')
  },
  {
    id: '148', date: '2026/1/29',
    attendance: 'Y,Y,N,Y,Y,Y,N,Y,N,Y,Y,Y,Y,N,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,N'.split(',')
  },
  {
    id: '149', date: '2026/2/5',
    attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,N,N,N,Y,N,Y,Y,Y,Y'.split(',')
  },
  {
    id: '150', date: '2026/2/12',
    attendance: 'Y,Y,N,Y,Y,N,Y,Y,Y,Y,Y,N,N,Y,Y,Y,Y,N,Y,Y,Y,N,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',')
  },
  {
    id: '151', date: '2026/2/26',
    attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,N,N,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,N,Y,Y,Y,Y'.split(',')
  },
  {
    id: '152', date: '2026/3/5',
    attendance: 'Y,Y,Y,Y,Y,N,Y,Y,N,Y,Y,Y,Y,Y,Y,Y,N,N,N,N,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',')
  },
  {
    id: '153', date: '2026/3/12',
    attendance: 'Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y,Y,N,Y,N,Y,Y,N,Y,N,Y,Y,Y,Y,Y,Y,Y,Y,N,Y,Y'.split(',')
  },
];

// ============================================================
// 模擬引擎
// ============================================================
function simulateSession(session, courts, rounds) {
  // 建立出席選手列表
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
  log.push(`第 ${session.id} 次社課｜${session.date}`);
  log.push(`出席：${attendees.length} 人｜A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}｜場地：${courts} 個｜模擬：${rounds} 輪`);
  log.push(`選手：${attendees.map(p => `${p.name}(${p.newLevel})`).join(', ')}`);
  log.push('='.repeat(70));

  let readyPlayers = attendees.map(p => ({ ...p }));
  let onCourt = [];
  const pairingHistory = {};

  const comboCount = {};
  const allMatchNames = []; // 記錄每場的4人組合（用於計算重複率）

  for (let round = 1; round <= rounds; round++) {
    log.push(`\n--- 第 ${round} 輪 ---`);

    // 上一輪場上的人回到準備區
    onCourt.forEach(courtPlayers => {
      courtPlayers.forEach(p => {
        p.justFinished = true;
        p.waitingTurns = 0;
        readyPlayers.push(p);
      });
    });
    onCourt = [];

    // 更新等待輪次
    readyPlayers.forEach(p => {
      if (!p.justFinished) {
        p.waitingTurns = (p.waitingTurns || 0) + 1;
      }
    });

    // 等待狀態分布
    const waitDist = {};
    readyPlayers.forEach(p => {
      const w = p.justFinished ? 'JF' : `W${p.waitingTurns}`;
      waitDist[w] = (waitDist[w] || 0) + 1;
    });
    log.push(`準備區 ${readyPlayers.length} 人：${Object.entries(waitDist).map(([k, v]) => `${k}=${v}`).join(', ')}`);

    // 排場
    for (let c = 0; c < courts; c++) {
      if (readyPlayers.length < 4) break;

      const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
      if (!result) {
        log.push(`  場地${c + 1}：無法配對`);
        continue;
      }

      const selectedNames = new Set(result.map(p => p.name));
      readyPlayers = readyPlayers.filter(p => !selectedNames.has(p.name));

      result.forEach(p => {
        p.justFinished = false;
        p.waitingTurns = 0;
        p.matches++;
      });

      // 記錄所有 6 對配對
      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const key = getPairKey(result[i].name, result[j].name);
          pairingHistory[key] = (pairingHistory[key] || 0) + 1;
        }
      }

      onCourt.push(result);
      const levels = result.map(p => p.newLevel).sort().join('');
      comboCount[levels] = (comboCount[levels] || 0) + 1;

      const matchKey = result.map(p => p.name).sort().join(',');
      allMatchNames.push(matchKey);

      log.push(`  場地${c + 1}：[${levels}] ${result.map(p => p.name).join(', ')}`);
    }

    // 等待中的人
    const waiters = readyPlayers.filter(p => !p.justFinished);
    if (waiters.length > 0) {
      log.push(`  等待中（${waiters.length}人）：${waiters.map(p => `${p.name}(${p.newLevel},等${p.waitingTurns}輪)`).join(', ')}`);
    }
  }

  // ============ 統計 ============
  log.push(`\n${'─'.repeat(70)}`);
  log.push('【統計報告】');

  // 組合分布
  log.push('\n組合類型分布：');
  const totalMatches = Object.values(comboCount).reduce((a, b) => a + b, 0);
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

  // Top 重複配對
  const topPairs = Object.entries(pairingHistory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  log.push('\n  最常同場 Top 8：');
  topPairs.forEach(([pair, count]) => {
    log.push(`    ${pair}：${count} 次`);
  });

  // 完全相同的 4 人組合重複
  const matchDuplicates = {};
  allMatchNames.forEach(key => { matchDuplicates[key] = (matchDuplicates[key] || 0) + 1; });
  const repeatedMatches = Object.entries(matchDuplicates).filter(([, c]) => c > 1);
  log.push(`\n4 人組合完全重複：${repeatedMatches.length > 0 ? repeatedMatches.length + ' 組' : '無'}`);
  repeatedMatches.forEach(([names, count]) => {
    log.push(`    ${names}：重複 ${count} 次`);
  });

  // 場次統計
  const allPlayers = attendees.map(p => p.name);
  // Collect from onCourt remaining + history
  const matchCountMap = {};
  attendees.forEach(p => { matchCountMap[p.name] = 0; });
  // Re-count from pairingHistory is complex; use the original players' matches field
  // But since we cloned, let's gather from all sources
  const allPlayerObjs = [...readyPlayers, ...onCourt.flat()];
  allPlayerObjs.forEach(p => {
    if (matchCountMap[p.name] !== undefined) {
      matchCountMap[p.name] = p.matches;
    }
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

  // 等待超過 2 輪統計
  let maxWaitEver = 0;
  readyPlayers.forEach(p => {
    if ((p.waitingTurns || 0) > maxWaitEver) maxWaitEver = p.waitingTurns;
  });

  const output = log.join('\n');
  return { output, attendeeCount: attendees.length, levelCounts, comboCount, maxPair, avgPair, maxM, minM };
}

// ============================================================
// 測試
// ============================================================
const allOutputs = [];
const summaryRows = [];

describe('真實社課出席資料模擬（第145-153次）', () => {

  SESSIONS.forEach(session => {
    test(`第 ${session.id} 次社課（${session.date}）`, () => {
      const result = simulateSession(session, 3, 12);
      allOutputs.push(result.output);
      console.log(result.output);

      summaryRows.push({
        id: session.id,
        date: session.date,
        count: result.attendeeCount,
        levels: `A${result.levelCounts.A}/B${result.levelCounts.B}/C${result.levelCounts.C}`,
        comboTypes: Object.keys(result.comboCount).length,
        avgPair: result.avgPair,
        maxPair: result.maxPair,
        matchDiff: `${result.maxM}-${result.minM}=${result.maxM - result.minM}`,
      });

      expect(result.attendeeCount).toBeGreaterThanOrEqual(4);
    });
  });

  afterAll(() => {
    // 總覽表
    const summary = [];
    summary.push('\n' + '='.repeat(70));
    summary.push('【全部社課模擬總覽】');
    summary.push('='.repeat(70));
    summary.push('');
    summary.push('次數  | 日期       | 人數 | 等級分布      | 組合種類 | 平均同場 | 最高同場 | 場次差距');
    summary.push('------|------------|------|--------------|---------|---------|---------|--------');
    summaryRows.forEach(r => {
      summary.push(
        `${r.id.padEnd(5)} | ${r.date.padEnd(10)} | ${String(r.count).padEnd(4)} | ${r.levels.padEnd(12)} | ${String(r.comboTypes).padEnd(7)} | ${String(r.avgPair).padEnd(7)} | ${String(r.maxPair).padEnd(7)} | ${r.matchDiff}`
      );
    });
    summary.push('');

    // 分析
    const avgMaxPair = (summaryRows.reduce((s, r) => s + r.maxPair, 0) / summaryRows.length).toFixed(1);
    summary.push(`平均「最高同場次數」：${avgMaxPair}`);

    const summaryStr = summary.join('\n');
    console.log(summaryStr);

    // 寫入檔案
    const fs = require('fs');
    const path = require('path');
    const fullReport = allOutputs.join('\n\n') + '\n\n' + summaryStr;
    fs.writeFileSync(
      path.join(__dirname, '真實社課模擬結果.txt'),
      fullReport,
      'utf-8'
    );
    console.log(`\n📄 完整報告已寫入 tests/真實社課模擬結果.txt`);
  });
});
