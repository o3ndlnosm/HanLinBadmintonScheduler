const {
  changeCourtCountLogic,
  swapPlayerOnCourtLogic,
  swapCourtCombinationLogic
} = require('../js/court-actions');

// 工具函式：建立測試選手
function makePlayer(name, opts = {}) {
  return {
    name,
    newLevel: opts.newLevel || 'B',
    level: opts.level || 4,
    waitingTurns: opts.waitingTurns || 0,
    matches: opts.matches || 0,
    justFinished: opts.justFinished || false,
    justJoinedReady: opts.justJoinedReady || false
  };
}

// 工具函式：依序回傳指定亂數值的 rng
function makeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// ============================================================
// changeCourtCountLogic：場地數量調整
// ============================================================
describe('changeCourtCountLogic：場地數量調整', () => {

  test('增加一面場地：3 → 4，新場地為空陣列', () => {
    const courts = [[], [], []];
    const result = changeCourtCountLogic(courts, 1);
    expect(result.error).toBeUndefined();
    expect(result.courtCount).toBe(4);
    expect(courts.length).toBe(4);
    expect(courts[3]).toEqual([]);
  });

  test('減少一面空場地：3 → 2', () => {
    const courts = [[], [], []];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.courtCount).toBe(2);
    expect(courts.length).toBe(2);
  });

  test('最後一面場地有選手時不可減少，回傳錯誤且場地不變', () => {
    const courts = [[], [], [makePlayer('A')]];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(3);
    expect(courts[2].length).toBe(1);
  });

  test('上限 6 面：6 面時再增加回傳錯誤', () => {
    const courts = [[], [], [], [], [], []];
    const result = changeCourtCountLogic(courts, 1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(6);
  });

  test('下限 1 面：1 面時再減少回傳錯誤', () => {
    const courts = [[]];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(1);
  });
});

// ============================================================
// swapPlayerOnCourtLogic：單人替換
// ============================================================
describe('swapPlayerOnCourtLogic：單人替換', () => {

  test('被換下者：等待輪次 +1、清除標記、回預備區、場次不變', () => {
    const c = makePlayer('C', { waitingTurns: 2, matches: 3 });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.error).toBeUndefined();
    expect(result.swappedOut.name).toBe('C');
    expect(result.swappedOut.waitingTurns).toBe(3); // 2 + 1
    expect(result.swappedOut.matches).toBe(3);       // 沒上場，場次不變
    expect(result.swappedOut.justFinished).toBe(false);
    expect(result.swappedOut.justJoinedReady).toBe(false);
    expect(readyPlayers.some((p) => p.name === 'C')).toBe(true);
  });

  test('換下「剛下場」者：標記清除，直接顯示等待輪次', () => {
    const c = makePlayer('C', { waitingTurns: 0, justFinished: true });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedOut.waitingTurns).toBe(1);
    expect(result.swappedOut.justFinished).toBe(false);
  });

  test('補上者：移出預備區、等待歸零、清除標記、放入原位置（隊伍不變）', () => {
    const e = makePlayer('E', { waitingTurns: 4, justJoinedReady: true });
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [e];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedIn.name).toBe('E');
    expect(result.swappedIn.waitingTurns).toBe(0);
    expect(result.swappedIn.justJoinedReady).toBe(false);
    expect(courts[0][2].name).toBe('E');             // C 原本在索引 2（隊伍二）
    expect(courts[0].length).toBe(4);
    expect(readyPlayers.some((p) => p.name === 'E')).toBe(false);
  });

  test('完全隨機：rng 決定補位人選（含剛下場者也可被抽中）', () => {
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [
      makePlayer('E'),
      makePlayer('F'),
      makePlayer('G', { justFinished: true })
    ];

    // rng = 0.99 → 抽中池中最後一位 G（剛下場者）
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0.99);
    expect(result.swappedIn.name).toBe('G');
  });

  test('excludeNames 會從抽樣池排除', () => {
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // 排除 F 後池中只剩 E，rng 0.99 也只能抽到 E
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C', 'F'], () => 0.99);
    expect(result.swappedIn.name).toBe('E');
  });

  test('預備區無人可補：回傳錯誤且狀態不變', () => {
    const c = makePlayer('C', { waitingTurns: 2 });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.error).toBeDefined();
    expect(courts[0][2].name).toBe('C');
    expect(c.waitingTurns).toBe(2);
  });

  test('場上找不到選手：回傳錯誤', () => {
    const courts = [[makePlayer('A')]];
    const readyPlayers = [makePlayer('E')];
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'X', ['X'], () => 0);
    expect(result.error).toBeDefined();
  });
});

// ============================================================
// swapCourtCombinationLogic：整組隨機替換 2 人
// ============================================================
describe('swapCourtCombinationLogic：整組隨機替換 2 人', () => {

  function makeFullCourt() {
    return [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
  }

  test('恰好替換 2 人，補上 2 位不同的預備區選手', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E'), makePlayer('F'), makePlayer('G')];

    // rng 依序：抽第 1 目標(0→A)、抽第 2 目標(0→剩餘第一位 B)、補位抽樣、補位抽樣
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0, 0, 0, 0]));

    expect(result.error).toBeUndefined();
    expect(result.swaps.length).toBe(2);
    const onCourt = courts[0].map((p) => p.name);
    expect(onCourt.length).toBe(4);
    // 被換下的 2 人回到預備區
    expect(readyPlayers.length).toBe(3); // 3 - 2 補上 + 2 換下 = 3
    const swappedOutNames = result.swaps.map((s) => s.swappedOut.name);
    swappedOutNames.forEach((name) => {
      expect(onCourt.includes(name)).toBe(false);
      expect(readyPlayers.some((p) => p.name === name)).toBe(true);
    });
    // 補上的 2 人不同且都在場上
    const swappedInNames = result.swaps.map((s) => s.swappedIn.name);
    expect(new Set(swappedInNames).size).toBe(2);
    swappedInNames.forEach((name) => {
      expect(onCourt.includes(name)).toBe(true);
    });
  });

  test('被換下的人不會被抽回補位（預備區恰 2 人時，補位必為原本那 2 人）', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // rng 全取 0.99：若未排除被換下者，第二次補位會抽到剛換下的人
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0.99]));

    expect(result.error).toBeUndefined();
    const swappedInNames = result.swaps.map((s) => s.swappedIn.name).sort();
    expect(swappedInNames).toEqual(['E', 'F']);
  });

  test('被換下的 2 人各自等待輪次 +1', () => {
    const a = makePlayer('A', { waitingTurns: 1 });
    const b = makePlayer('B', { waitingTurns: 2 });
    const courts = [[a, b, makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // 目標選取 rng=0,0 → A 與 B
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));

    expect(result.swaps[0].swappedOut.name).toBe('A');
    expect(result.swaps[1].swappedOut.name).toBe('B');
    expect(a.waitingTurns).toBe(2);
    expect(b.waitingTurns).toBe(3);
  });

  test('場地未滿 4 人：回傳錯誤', () => {
    const courts = [[makePlayer('A'), makePlayer('B')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));
    expect(result.error).toBeDefined();
  });

  test('預備區不足 2 人：回傳錯誤且狀態不變', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E')];
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));
    expect(result.error).toBeDefined();
    expect(courts[0].map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(readyPlayers.length).toBe(1);
  });
});

// ============================================================
// waitingTurnsBeforeMatch 快照：排上場歸零後替換仍顯示「原值 +1」
// （排場流程會把上場選手 waitingTurns 歸零，替換需還原上場前的等待）
// ============================================================
describe('替換與上場前等待快照 waitingTurnsBeforeMatch', () => {

  test('被換下者有快照（排上場時被歸零）：等待 = 快照 +1，快照清除', () => {
    // 模擬孟娜情境：C 原本等待 2 場，排上場時 waitingTurns 被歸零、快照記 2
    const c = makePlayer('C', { waitingTurns: 0 });
    c.waitingTurnsBeforeMatch = 2;
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedOut.waitingTurns).toBe(3); // 2 + 1，而非 0 + 1
    expect(result.swappedOut.waitingTurnsBeforeMatch).toBeUndefined();
  });

  test('被換下者無快照（手動上場保留等待值）：等待 = 現值 +1', () => {
    const c = makePlayer('C', { waitingTurns: 2 });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedOut.waitingTurns).toBe(3); // 2 + 1
  });

  test('補上者：上場時記下快照，之後再被換下顯示正確等待', () => {
    const e = makePlayer('E', { waitingTurns: 4 });
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [e, makePlayer('F')];

    // E 補上場：等待歸零、快照記 4
    const first = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);
    expect(first.swappedIn.name).toBe('E');
    expect(first.swappedIn.waitingTurns).toBe(0);
    expect(first.swappedIn.waitingTurnsBeforeMatch).toBe(4);

    // E 又被換下：等待 = 4 + 1
    const second = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'E', ['E'], () => 0);
    expect(second.swappedOut.name).toBe('E');
    expect(second.swappedOut.waitingTurns).toBe(5);
    expect(second.swappedOut.waitingTurnsBeforeMatch).toBeUndefined();
  });
});
