/**
 * 替換功能模擬：
 * 1. 孟娜情境重現 — 排上場後組合重複，按「替換組合」隨機換 2 人
 * 2. 單人「替換」與連鎖替換的等待輪次正確性
 * 3. 逐場全場模擬 —
 *    a. 22 人標準社課，途中加開第 4 面場地（6/25 情境）
 *    b. 14 人小場（人少易固定輪替），自動偵測重複組合觸發替換組合
 *
 * 全程使用種子亂數（含取代 Math.random），報告內容完全可重現，
 * 執行後寫入 tests/替換功能模擬結果.txt
 */
const { getPairKey, selectPlayersWithABCLogic } = require('../js/pairing-logic');
const {
  swapPlayerOnCourtLogic,
  swapCourtCombinationLogic,
  changeCourtCountLogic
} = require('../js/court-actions');
const fs = require('fs');
const path = require('path');

// mulberry32 種子亂數
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePlayer(name, newLevel, waitingTurns = 0, justFinished = false) {
  return { name, newLevel, waitingTurns, matches: 0, justFinished, justJoinedReady: false };
}

function makeRoster(nA, nB, nC) {
  return [
    ...Array.from({ length: nA }, (_, i) => makePlayer(`A${i + 1}`, 'A')),
    ...Array.from({ length: nB }, (_, i) => makePlayer(`B${i + 1}`, 'B')),
    ...Array.from({ length: nC }, (_, i) => makePlayer(`C${i + 1}`, 'C'))
  ];
}

function fmtWait(p) {
  return p.justFinished ? '剛下場' : `等待${p.waitingTurns}場`;
}

const report = [];

// ============================================================
// 第一部分：孟娜情境重現（替換組合）
// ============================================================
describe('孟娜情境：排上場組合重複 → 替換組合', () => {

  // 準備區 A-D 等待2場、E-G 等待1場、H-J 剛下場；ABCD 被排上場（等待歸零、快照記2）
  function buildScenario() {
    const court = ['A', 'B', 'C', 'D'].map((n) => {
      const p = makePlayer(n, 'B', 0);
      p.waitingTurnsBeforeMatch = 2; // 排上場前等待 2 場
      return p;
    });
    const ready = [
      makePlayer('E', 'B', 1), makePlayer('F', 'B', 1), makePlayer('G', 'B', 1),
      makePlayer('H', 'B', 0, true), makePlayer('I', 'B', 0, true), makePlayer('J', 'B', 0, true)
    ];
    return { courts: [court], ready };
  }

  test('替換組合：換下 2 人顯示「等待3場」，從準備區完全隨機補 2 人', () => {
    report.push('='.repeat(70));
    report.push('【第一部分】孟娜情境重現 — 替換組合');
    report.push('='.repeat(70));
    report.push('');
    report.push('情境：準備區 A~D 等待2場、E~G 等待1場、H~J 剛下場');
    report.push('　　　按「排上場」→ ABCD 被排上（與前一場組合重複）→ 按「替換組合」');
    report.push('');

    [625, 20260612, 888].forEach((seed) => {
      const { courts, ready } = buildScenario();
      const rng = mulberry32(seed);

      const result = swapCourtCombinationLogic(courts, ready, 0, rng);

      expect(result.error).toBeUndefined();
      expect(result.swaps.length).toBe(2);

      const lines = result.swaps.map((s) => {
        // 被換下者等待 = 上場前快照(2) + 1 = 3
        expect(s.swappedOut.waitingTurns).toBe(3);
        expect(s.swappedOut.waitingTurnsBeforeMatch).toBeUndefined();
        // 補位者不可是剛被換下的人
        expect(['A', 'B', 'C', 'D'].includes(s.swappedIn.name)).toBe(false);
        return `${s.swappedOut.name} → ${s.swappedIn.name}`;
      });

      // 場上仍 4 人且不重複
      const names = courts[0].map((p) => p.name);
      expect(names.length).toBe(4);
      expect(new Set(names).size).toBe(4);

      const outs = result.swaps.map((s) => `${s.swappedOut.name}(${fmtWait(s.swappedOut)})`).join('、');
      report.push(`種子 ${seed}：替換 ${lines.join('、')}`);
      report.push(`  換下回準備區：${outs}`);
      report.push(`  替換後場上：${names.join(', ')}`);
      report.push('');
    });

    report.push('結論：被換下者一律顯示「等待3場」（原值2+1），補位完全隨機（含剛下場者），');
    report.push('　　　且不會抽回剛被換下的人。');
    report.push('');
  });

  test('準備區不足 2 人時替換組合被擋下', () => {
    const { courts } = buildScenario();
    const ready = [makePlayer('E', 'B', 1)];
    const result = swapCourtCombinationLogic(courts, ready, 0, mulberry32(1));
    expect(result.error).toBeDefined();
    report.push(`防呆驗證：準備區僅 1 人按「替換組合」→ 「${result.error}」`);
    report.push('');
  });
});

// ============================================================
// 第二部分：單人替換與連鎖替換
// ============================================================
describe('單人替換與連鎖替換', () => {

  test('單人替換 C → 等待3場；再換下補位者 → 等待輪次不失真', () => {
    report.push('='.repeat(70));
    report.push('【第二部分】單人「替換」與連鎖替換');
    report.push('='.repeat(70));
    report.push('');

    const court = ['A', 'B', 'C', 'D'].map((n) => {
      const p = makePlayer(n, 'B', 0);
      p.waitingTurnsBeforeMatch = 2;
      return p;
    });
    const courts = [court];
    const ready = [
      makePlayer('E', 'B', 1), makePlayer('F', 'B', 1), makePlayer('G', 'B', 1),
      makePlayer('H', 'B', 0, true)
    ];
    const rng = mulberry32(777);

    // 第一次：替換 C
    const first = swapPlayerOnCourtLogic(courts, ready, 0, 'C', ['C'], rng);
    expect(first.error).toBeUndefined();
    expect(first.swappedOut.waitingTurns).toBe(3); // 2 + 1
    const inName = first.swappedIn.name;
    report.push(`單人替換 C：C → ${inName}`);
    report.push(`  C 回準備區顯示「${fmtWait(first.swappedOut)}」（原等待2場 +1）`);
    report.push(`  ${inName} 補上（上場前${first.swappedIn.waitingTurnsBeforeMatch === 0 ? '剛下場/等待0場' : `等待${first.swappedIn.waitingTurnsBeforeMatch}場`}）`);

    // 第二次：把剛補上的人再換下 → 等待 = 他上場前的值 +1
    const inPreWait = first.swappedIn.waitingTurnsBeforeMatch;
    const second = swapPlayerOnCourtLogic(courts, ready, 0, inName, [inName], rng);
    expect(second.error).toBeUndefined();
    expect(second.swappedOut.waitingTurns).toBe(inPreWait + 1);
    report.push(`連鎖替換 ${inName}：${inName} → ${second.swappedIn.name}`);
    report.push(`  ${inName} 回準備區顯示「${fmtWait(second.swappedOut)}」（上場前${inPreWait}場 +1，不因短暫上場而失真）`);
    report.push('');
  });

  test('準備區無人可補時單人替換被擋下', () => {
    const courts = [['A', 'B', 'C', 'D'].map((n) => makePlayer(n, 'B', 0))];
    const result = swapPlayerOnCourtLogic(courts, [], 0, 'C', ['C'], mulberry32(1));
    expect(result.error).toBeDefined();
    report.push(`防呆驗證：準備區 0 人按「替換」→ 「${result.error}」`);
    report.push('');
  });
});

// ============================================================
// 第三部分：逐場全場模擬（共用 harness）
// ============================================================

/**
 * 逐場模擬：
 * - 比照 generateMatchForCourtImmediate：上場時記 waitingTurnsBeforeMatch 快照後歸零
 * - 比照真實流程：場次在下場時計算
 * - 新排組合與該場地前一場重複 ≥3 人 → 自動「替換組合」
 * - 內部以 expect 驗證狀態守恆與替換正確性
 */
function runSequentialSimulation(opts) {
  const { label, roster, totalEnds, open4thAt = null, seed } = opts;
  const realRandom = Math.random;
  Math.random = mulberry32(seed); // 鎖定排場邏輯內部的隨機性，確保報告可重現

  try {
    const attendees = roster;
    const TOTAL = attendees.length;
    const levelCounts = { A: 0, B: 0, C: 0 };
    attendees.forEach((p) => levelCounts[p.newLevel]++);

    report.push('='.repeat(70));
    report.push(`【${label}】`);
    report.push(`出席：${TOTAL} 人（A=${levelCounts.A} / B=${levelCounts.B} / C=${levelCounts.C}）｜初始 3 面場地｜種子 ${seed}`);
    report.push(`模擬：${totalEnds} 次下場${open4thAt ? `｜第 ${open4thAt} 次下場後加開第 4 面場地（6/25 情境）` : ''}`);
    report.push('規則：新排組合與該場地前一場重複 ≥3 人 → 自動按「替換組合」');
    report.push('='.repeat(70));

    let readyPlayers = attendees;
    const courts = [[], [], []];
    const pairingHistory = {};
    const lastComboByCourt = {};
    const waitHistory = {};
    attendees.forEach((p) => { waitHistory[p.name] = []; });

    let repeatCount = 0;
    let fullRepeatCount = 0;
    let swapTriggerCount = 0;
    let overlapBeforeSum = 0;
    let overlapAfterSum = 0;
    const swapOutCounts = {};

    function checkInvariants() {
      const onCourt = courts.flat();
      expect(onCourt.length + readyPlayers.length).toBe(TOTAL);
      const allNames = [...onCourt, ...readyPlayers].map((p) => p.name);
      expect(new Set(allNames).size).toBe(TOTAL);
    }

    function assignCourt(courtIdx) {
      if (readyPlayers.length < 4) return null;
      const result = selectPlayersWithABCLogic(readyPlayers, pairingHistory);
      if (!result) return null;

      const selectedNames = new Set(result.map((p) => p.name));
      readyPlayers = readyPlayers.filter((p) => !selectedNames.has(p.name));

      result.forEach((p) => {
        waitHistory[p.name].push(p.waitingTurns || 0);
        p.justFinished = false;
        // 比照 generateMatchForCourtImmediate：記快照後歸零
        p.waitingTurnsBeforeMatch = p.waitingTurns || 0;
        p.waitingTurns = 0;
      });

      for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
          const key = getPairKey(result[i].name, result[j].name);
          pairingHistory[key] = (pairingHistory[key] || 0) + 1;
        }
      }

      courts[courtIdx] = result;
      return result;
    }

    // 與該場地前一場組合的重複人數；≥3 觸發替換組合
    function handleRepeatAndSwap(courtIdx) {
      const prev = lastComboByCourt[courtIdx];
      const current = courts[courtIdx].map((p) => p.name);
      if (prev) {
        const overlap = current.filter((n) => prev.includes(n));
        if (overlap.length >= 3) {
          repeatCount++;
          if (overlap.length === 4) fullRepeatCount++;
          report.push(`  ⚠ 與前一場重複 ${overlap.length} 人（${overlap.join(', ')}）→ 自動替換組合`);

          // 換前快照（驗證被換下者等待 = 快照 +1）
          const preSnapshot = {};
          courts[courtIdx].forEach((p) => { preSnapshot[p.name] = p.waitingTurnsBeforeMatch; });

          const swapResult = swapCourtCombinationLogic(courts, readyPlayers, courtIdx);
          if (swapResult.error) {
            report.push(`    替換失敗：${swapResult.error}`);
          } else {
            swapTriggerCount++;
            swapResult.swaps.forEach((s) => {
              expect(s.swappedOut.waitingTurns).toBe((preSnapshot[s.swappedOut.name] || 0) + 1);
              swapOutCounts[s.swappedOut.name] = (swapOutCounts[s.swappedOut.name] || 0) + 1;
              // 被換下者沒上場：撤回上場紀錄
              waitHistory[s.swappedOut.name].pop();
              waitHistory[s.swappedIn.name].push(s.swappedIn.waitingTurnsBeforeMatch || 0);
            });
            const desc = swapResult.swaps.map((s) => `${s.swappedOut.name}(${fmtWait(s.swappedOut)}) → ${s.swappedIn.name}`).join('、');
            const after = courts[courtIdx].map((p) => p.name);
            const afterOverlap = after.filter((n) => prev.includes(n)).length;
            overlapBeforeSum += overlap.length;
            overlapAfterSum += afterOverlap;
            report.push(`    替換：${desc}`);
            report.push(`    替換後：[${after.join(', ')}]（與前一場重複 ${afterOverlap} 人）`);
          }
        }
      }
      lastComboByCourt[courtIdx] = courts[courtIdx].map((p) => p.name);
    }

    // 初始排場
    report.push('');
    report.push('【初始排場】');
    readyPlayers.forEach((p) => { p.waitingTurns = 1; });
    for (let c = 0; c < courts.length; c++) {
      const match = assignCourt(c);
      if (match) {
        lastComboByCourt[c] = match.map((p) => p.name);
        report.push(`  場地${c + 1}：${match.map((p) => p.name).join(', ')}`);
      }
    }
    report.push(`  等待中：${readyPlayers.length} 人`);
    checkInvariants();

    // 逐場下場
    let courtOrder = 0;
    for (let endCount = 1; endCount <= totalEnds; endCount++) {
      let courtIdx = -1;
      for (let tries = 0; tries < courts.length; tries++) {
        const idx = (courtOrder + tries) % courts.length;
        if (courts[idx].length === 4) { courtIdx = idx; courtOrder = (idx + 1) % courts.length; break; }
      }
      if (courtIdx === -1) break;

      // 下場：比照真實流程在下場時計場次
      const finished = courts[courtIdx];
      finished.forEach((p) => { p.matches++; p.justFinished = true; p.waitingTurns = 0; });
      readyPlayers.push(...finished);
      courts[courtIdx] = [];

      // 等待輪次更新（比照既有模擬慣例）
      readyPlayers.forEach((p) => {
        if (!p.justFinished) p.waitingTurns = (p.waitingTurns || 0) + 1;
      });
      readyPlayers.forEach((p) => {
        if (p.justFinished && !finished.includes(p)) {
          p.justFinished = false;
          if (p.waitingTurns === 0) p.waitingTurns = 1;
        }
      });

      const maxWait = Math.max(...readyPlayers.map((p) => p.waitingTurns || 0));
      report.push('');
      report.push(`第${String(endCount).padStart(2)} 次下場（場地${courtIdx + 1}）| 準備區 ${readyPlayers.length} 人 | 最高等待=${maxWait}`);

      const match = assignCourt(courtIdx);
      if (match) {
        report.push(`  → ${match.map((p) => `${p.name}(等${p.waitingTurnsBeforeMatch})`).join(', ')}`);
        handleRepeatAndSwap(courtIdx);
      } else {
        report.push('  → 人數不足，場地閒置');
      }
      checkInvariants();

      // 6/25 情境：加開第 4 面場地
      if (open4thAt && endCount === open4thAt) {
        const r = changeCourtCountLogic(courts, 1);
        expect(r.courtCount).toBe(4);
        report.push('');
        report.push(`【6/25 情境】第 ${endCount} 次下場後加開第 4 面場地（${r.courtCount} 面）`);
        const match4 = assignCourt(3);
        if (match4) {
          lastComboByCourt[3] = match4.map((p) => p.name);
          report.push(`  場地4 首場：${match4.map((p) => `${p.name}(等${p.waitingTurnsBeforeMatch})`).join(', ')}`);
        } else {
          report.push('  場地4：準備區人數不足，暫時閒置');
        }
        checkInvariants();
      }
    }

    // 統計
    report.push('');
    report.push('═'.repeat(70));
    report.push(`【統計報告 — ${label}】`);
    report.push('');
    report.push(`重複組合（與前一場重複 ≥3 人）：${repeatCount} 次（其中 4 人完全相同 ${fullRepeatCount} 次）`);
    report.push(`自動替換組合觸發：${swapTriggerCount} 次`);
    if (swapTriggerCount > 0) {
      report.push(`替換前/後與前一場平均重複：${(overlapBeforeSum / swapTriggerCount).toFixed(1)} 人 → ${(overlapAfterSum / swapTriggerCount).toFixed(1)} 人`);
    }
    const swapOutList = Object.entries(swapOutCounts).sort((a, b) => b[1] - a[1]);
    if (swapOutList.length > 0) {
      report.push(`被替換下場次數：${swapOutList.map(([n, c]) => `${n}×${c}`).join('、')}`);
    }

    const matchCounts = attendees.map((p) => p.matches);
    const maxM = Math.max(...matchCounts);
    const minM = Math.min(...matchCounts);
    report.push('');
    report.push(`場次公平性：最多 ${maxM} 場 / 最少 ${minM} 場 / 差距 ${maxM - minM}`);

    const allWaits = [];
    attendees.forEach((p) => { allWaits.push(...waitHistory[p.name]); });
    const avgWait = (allWaits.reduce((a, b) => a + b, 0) / allWaits.length).toFixed(1);
    const maxWaitG = Math.max(...allWaits);
    report.push(`上場前等待：平均 ${avgWait} 輪 / 最大 ${maxWaitG} 輪`);

    const waitDist = {};
    allWaits.forEach((w) => { waitDist[w] = (waitDist[w] || 0) + 1; });
    report.push('等待分布：' + Object.entries(waitDist)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([w, c]) => `等${w}輪×${c}`).join('、'));
    report.push('');

    return { repeatCount, fullRepeatCount, swapTriggerCount, maxM, minM };
  } finally {
    Math.random = realRandom;
  }
}

describe('逐場全場模擬', () => {

  test('22 人標準社課：36 次下場，第 18 次後加開第 4 面場地', () => {
    report.push('='.repeat(70));
    report.push('【第三部分】逐場全場模擬');
    report.push('='.repeat(70));
    report.push('');

    const stats = runSequentialSimulation({
      label: '場景 A：22 人標準社課 + 6/25 加開場地',
      roster: makeRoster(5, 10, 7),
      totalEnds: 36,
      open4thAt: 18,
      seed: 20260625
    });

    // 22 人時準備區夠大，重複組合應極少
    expect(stats.repeatCount).toBeLessThanOrEqual(2);
    expect(stats.maxM - stats.minM).toBeLessThanOrEqual(3);
  });

  test('14 人小場：30 次下場，重複組合自動替換', () => {
    const stats = runSequentialSimulation({
      label: '場景 B：14 人小場（人少易固定輪替，孟娜痛點情境）',
      roster: makeRoster(3, 6, 5),
      totalEnds: 30,
      seed: 625
    });

    // 14 人時必然出現重複組合，且自動替換組合有實際觸發
    expect(stats.repeatCount).toBeGreaterThan(0);
    expect(stats.swapTriggerCount).toBeGreaterThan(0);
    expect(stats.maxM - stats.minM).toBeLessThanOrEqual(4);

    report.push('觀察：22 人時配對演算法（搭檔歷史去重）已讓重複組合極少出現；');
    report.push('　　　人少（≤14 人）時固定輪替難以避免，「替換組合」正是為此而生。');
    report.push('　　　補位為完全隨機（孟娜方案一），偶爾仍會抽回上一場的人——');
    report.push('　　　此時可再按一次「替換組合」重抽（無確認框，重抽成本低）。');
    report.push('　　　全程等待輪次與場次公平性不受替換影響。');
    report.push('');
  });
});

// ============================================================
// 報告輸出
// ============================================================
afterAll(() => {
  const header = [
    '＝'.repeat(35),
    '翰林羽球排場系統 — 替換功能模擬結果',
    '產生方式：npx jest tests/swap-simulation.test.js（種子亂數，內容可重現）',
    '＝'.repeat(35),
    ''
  ];
  const fullReport = header.concat(report).join('\n') + '\n';
  fs.writeFileSync(path.join(__dirname, '替換功能模擬結果.txt'), fullReport, 'utf-8');
  console.log('\n📄 報告已寫入 tests/替換功能模擬結果.txt');
});
