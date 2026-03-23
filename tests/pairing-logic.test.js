const {
  getPairKey,
  getABCCombinationPriority,
  selectPlayersWithABCLogic
} = require('../js/pairing-logic');

// 工具函式：建立測試選手
function makePlayer(name, newLevel, waitingTurns = 0, opts = {}) {
  return {
    name,
    newLevel,
    level: newLevel === 'A' ? 6 : newLevel === 'B' ? 4 : 2,
    waitingTurns,
    matches: opts.matches || 0,
    justFinished: opts.justFinished || false
  };
}

// ============================================================
// getABCCombinationPriority 測試
// ============================================================
describe('getABCCombinationPriority', () => {
  test('回傳 0 如果不是 4 個人', () => {
    const players = [makePlayer('A1', 'A'), makePlayer('A2', 'A')];
    expect(getABCCombinationPriority(players)).toBe(0);
  });

  // 10 種合法組合全部回傳 1
  const validCombos = [
    ['AAAA', ['A', 'A', 'A', 'A']],
    ['AAAB', ['A', 'A', 'A', 'B']],
    ['AABB', ['A', 'A', 'B', 'B']],
    ['AACC', ['A', 'A', 'C', 'C']],
    ['ABBB', ['A', 'B', 'B', 'B']],
    ['BBBB', ['B', 'B', 'B', 'B']],
    ['BBBC', ['B', 'B', 'B', 'C']],
    ['BBCC', ['B', 'B', 'C', 'C']],
    ['BCCC', ['B', 'C', 'C', 'C']],
    ['CCCC', ['C', 'C', 'C', 'C']],
  ];

  test.each(validCombos)('%s 為合法組合（回傳 1）', (label, levels) => {
    const players = levels.map((l, i) => makePlayer(`P${i}`, l));
    expect(getABCCombinationPriority(players)).toBe(1);
  });

  // 5 種禁止組合全部回傳 0
  const forbiddenCombos = [
    ['AAAC', ['A', 'A', 'A', 'C']],
    ['ACCC', ['A', 'C', 'C', 'C']],
    ['AABC', ['A', 'A', 'B', 'C']],
    ['ABBC', ['A', 'B', 'B', 'C']],
    ['ABCC', ['A', 'B', 'C', 'C']],
  ];

  test.each(forbiddenCombos)('%s 為禁止組合（回傳 0）', (label, levels) => {
    const players = levels.map((l, i) => makePlayer(`P${i}`, l));
    expect(getABCCombinationPriority(players)).toBe(0);
  });

  test('預設等級為 B', () => {
    const players = [
      { name: 'P1' }, { name: 'P2' }, { name: 'P3' }, { name: 'P4' }
    ];
    // BBBB 是合法的
    expect(getABCCombinationPriority(players)).toBe(1);
  });
});

// ============================================================
// getPairKey 測試
// ============================================================
describe('getPairKey', () => {
  test('名字排序後組合', () => {
    expect(getPairKey('Bob', 'Alice')).toBe('Alice-Bob');
    expect(getPairKey('Alice', 'Bob')).toBe('Alice-Bob');
  });
});

// ============================================================
// selectPlayersWithABCLogic 測試
// ============================================================
describe('selectPlayersWithABCLogic', () => {
  test('不足 4 人回傳 null', () => {
    const players = [makePlayer('A1', 'A'), makePlayer('B1', 'B')];
    expect(selectPlayersWithABCLogic(players, {})).toBeNull();
  });

  test('剛好 4 人且合法組合直接回傳', () => {
    const players = [
      makePlayer('A1', 'A'), makePlayer('A2', 'A'),
      makePlayer('B1', 'B'), makePlayer('B2', 'B')
    ];
    const result = selectPlayersWithABCLogic(players, {});
    expect(result).toHaveLength(4);
    const names = result.map(p => p.name).sort();
    expect(names).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  test('等待 ≥ 2 輪的選手被優先選中', () => {
    const players = [
      makePlayer('A1', 'B', 3),  // 等待 3 輪
      makePlayer('A2', 'B', 2),  // 等待 2 輪
      makePlayer('A3', 'B', 0),
      makePlayer('A4', 'B', 0),
      makePlayer('A5', 'B', 0),
      makePlayer('A6', 'B', 0),
    ];
    const result = selectPlayersWithABCLogic(players, {});
    expect(result).toHaveLength(4);
    const names = result.map(p => p.name);
    expect(names).toContain('A1');
    expect(names).toContain('A2');
  });

  test('禁止組合被排除', () => {
    // 只有 A 和 C，任何 4 人組合都是禁止的（AAAC, ACCC, AACC 除外）
    const players = [
      makePlayer('A1', 'A'), makePlayer('A2', 'A'),
      makePlayer('C1', 'C'), makePlayer('C2', 'C'),
    ];
    // AACC 是合法的，應該回傳
    const result = selectPlayersWithABCLogic(players, {});
    expect(result).toHaveLength(4);
    const levels = result.map(p => p.newLevel).sort().join('');
    expect(levels).toBe('AACC');
  });

  test('搭檔歷史去重：選擇配過最少次的組合', () => {
    // 6 個 B 選手，都等待 0 輪
    const players = [
      makePlayer('B1', 'B', 0),
      makePlayer('B2', 'B', 0),
      makePlayer('B3', 'B', 0),
      makePlayer('B4', 'B', 0),
      makePlayer('B5', 'B', 0),
      makePlayer('B6', 'B', 0),
    ];

    // B1-B2, B1-B3, B2-B3 已經配過很多次
    const history = {
      'B1-B2': 5,
      'B1-B3': 5,
      'B2-B3': 5,
    };

    // 跑 20 次，確認 B1+B2+B3 同時出現的機率很低
    let b123Together = 0;
    for (let i = 0; i < 20; i++) {
      const result = selectPlayersWithABCLogic(players, history);
      const names = result.map(p => p.name);
      if (names.includes('B1') && names.includes('B2') && names.includes('B3')) {
        b123Together++;
      }
    }
    // 應該很少把 B1, B2, B3 放在一起
    expect(b123Together).toBeLessThan(5);
  });

  test('等待 ≥ 2 輪但無法形成合法組合時，仍盡量包含', () => {
    // 必選：A1(A, 等待3), C1(C, 等待2)
    // 其他：B1, B2, B3
    // A+C 在一起的合法組合只有 AACC（但只有1A1C），
    // 或者含 B 的組合 ABBC/ABCC 都禁止
    // 但 ABBB 是合法的！ → A1+B1+B2+B3
    // BCCC 也合法但只有 1C
    const players = [
      makePlayer('A1', 'A', 3),
      makePlayer('C1', 'C', 2),
      makePlayer('B1', 'B', 0),
      makePlayer('B2', 'B', 0),
      makePlayer('B3', 'B', 0),
    ];
    const result = selectPlayersWithABCLogic(players, {});
    expect(result).toHaveLength(4);
    const names = result.map(p => p.name);
    // 至少要包含 A1（等待最久，且 ABBB 合法）
    expect(names).toContain('A1');
  });

  test('剛下場選手優先級降低', () => {
    const players = [
      makePlayer('B1', 'B', 1, { justFinished: true }),
      makePlayer('B2', 'B', 1, { justFinished: true }),
      makePlayer('B3', 'B', 1),
      makePlayer('B4', 'B', 1),
      makePlayer('B5', 'B', 1),
      makePlayer('B6', 'B', 1),
    ];
    // B1, B2 剛下場，其他人等待 1 輪
    // 跑 20 次統計
    let b1b2Count = 0;
    for (let i = 0; i < 20; i++) {
      const result = selectPlayersWithABCLogic(players, {});
      const names = result.map(p => p.name);
      if (names.includes('B1') && names.includes('B2')) {
        b1b2Count++;
      }
    }
    // 不剛下場的 4 人 (B3-B6) waitingScore = 4, 而含 B1+B2 的 waitingScore 較低
    // 所以 B3+B4+B5+B6 應該被優先選擇
    expect(b1b2Count).toBeLessThan(5);
  });

  test('模擬 24 人（4的倍數）情境：歷史去重有效', () => {
    // 簡化版：8 個 B 選手，模擬等待輪次都是 1
    const players = [];
    for (let i = 1; i <= 8; i++) {
      players.push(makePlayer(`B${i}`, 'B', 1));
    }

    // B1-B2-B3-B4 已經一起打過
    const history = {
      'B1-B2': 3, 'B1-B3': 3, 'B1-B4': 3,
      'B2-B3': 3, 'B2-B4': 3, 'B3-B4': 3,
    };

    // 跑 20 次，B1+B2+B3+B4 完整重複的機率應該很低
    let sameGroupCount = 0;
    for (let i = 0; i < 20; i++) {
      const result = selectPlayersWithABCLogic(players, history);
      const names = new Set(result.map(p => p.name));
      if (names.has('B1') && names.has('B2') && names.has('B3') && names.has('B4')) {
        sameGroupCount++;
      }
    }
    expect(sameGroupCount).toBe(0); // 有歷史記錄時完全不應該再選同一組
  });

  test('模擬真實場景：A7 B14 C10 的等級分布', () => {
    const players = [];
    for (let i = 1; i <= 7; i++) players.push(makePlayer(`A${i}`, 'A', 1));
    for (let i = 1; i <= 14; i++) players.push(makePlayer(`B${i}`, 'B', 1));
    for (let i = 1; i <= 10; i++) players.push(makePlayer(`C${i}`, 'C', 1));

    const result = selectPlayersWithABCLogic(players, {});
    expect(result).toHaveLength(4);

    // 確認選出的組合是合法的
    const levels = result.map(p => p.newLevel).sort().join('');
    const forbidden = ['AAAC', 'ACCC', 'AABC', 'ABBC', 'ABCC'];
    expect(forbidden).not.toContain(levels);
  });

  test('多次執行產生不同組合（驗證隨機性）', () => {
    const players = [];
    for (let i = 1; i <= 8; i++) {
      players.push(makePlayer(`B${i}`, 'B', 1));
    }

    const results = new Set();
    for (let i = 0; i < 30; i++) {
      const result = selectPlayersWithABCLogic(players, {});
      const key = result.map(p => p.name).sort().join(',');
      results.add(key);
    }
    // 8 選 4 = 70 種組合，跑 30 次應至少出現 3 種不同組合
    expect(results.size).toBeGreaterThanOrEqual(3);
  });
});
