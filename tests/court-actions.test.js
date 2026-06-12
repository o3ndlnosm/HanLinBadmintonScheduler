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
