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
