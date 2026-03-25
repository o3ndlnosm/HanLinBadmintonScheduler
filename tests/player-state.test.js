const {
  moveToReadyLogic,
  moveToRestLogic,
  calculateActivePlayersAverageMatches
} = require('../js/player-state');

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

// 工具函式：建立初始遊戲狀態
function makeState(overrides = {}) {
  return {
    players: overrides.players || [],
    readyPlayers: overrides.readyPlayers || [],
    restingPlayers: overrides.restingPlayers || [],
    courts: overrides.courts || [[], [], []]
  };
}

// ============================================================
// 核心功能：休息區回來保留等待輪次
// ============================================================
describe('休息區回到準備區：等待輪次保留', () => {

  test('從休息區回來的選手，waitingTurns 不會被重置', () => {
    const player = makePlayer('小明', { waitingTurns: 5 });
    const state = makeState({
      restingPlayers: [player]
    });

    const result = moveToReadyLogic('小明', state);

    expect(result).not.toBeNull();
    expect(result.movedPlayer.waitingTurns).toBe(5);
    expect(result.readyPlayers).toHaveLength(1);
    expect(result.restingPlayers).toHaveLength(0);
  });

  test('從休息區回來的選手，各種等待輪次值都能保留', () => {
    const testCases = [0, 1, 2, 3, 7, 10];

    testCases.forEach(turns => {
      const player = makePlayer('測試', { waitingTurns: turns });
      const state = makeState({ restingPlayers: [player] });

      const result = moveToReadyLogic('測試', state);
      expect(result.movedPlayer.waitingTurns).toBe(turns);
    });
  });

  test('完整流程：準備區 → 休息區 → 準備區，等待輪次保留', () => {
    const player = makePlayer('小華', { waitingTurns: 3 });

    // 步驟 1：選手在準備區，移到休息區
    const state1 = makeState({ readyPlayers: [player] });
    const afterRest = moveToRestLogic('小華', state1);
    expect(afterRest.movedPlayer.waitingTurns).toBe(3);

    // 步驟 2：從休息區回到準備區
    const state2 = makeState({ restingPlayers: afterRest.restingPlayers });
    const afterReady = moveToReadyLogic('小華', state2);

    expect(afterReady.movedPlayer.waitingTurns).toBe(3);
  });

  test('多次來回休息區，等待輪次始終保留', () => {
    let player = makePlayer('小美', { waitingTurns: 4 });

    for (let i = 0; i < 3; i++) {
      // 移到休息區
      const stateToRest = makeState({ readyPlayers: [player] });
      const afterRest = moveToRestLogic('小美', stateToRest);

      // 從休息區回來
      const stateToReady = makeState({ restingPlayers: afterRest.restingPlayers });
      const afterReady = moveToReadyLogic('小美', stateToReady);

      expect(afterReady.movedPlayer.waitingTurns).toBe(4);
      player = afterReady.movedPlayer;
    }
  });
});

// ============================================================
// 對比：從選手列表加入準備區，等待輪次歸零
// ============================================================
describe('從選手列表加入準備區：等待輪次歸零', () => {

  test('從選手列表加入的選手，waitingTurns 歸零', () => {
    const player = makePlayer('新手', { waitingTurns: 5 });
    const state = makeState({
      players: [player]
    });

    const result = moveToReadyLogic('新手', state);

    expect(result).not.toBeNull();
    expect(result.movedPlayer.waitingTurns).toBe(0);
  });

  test('選手列表加入 vs 休息區回來的行為差異', () => {
    const fromList = makePlayer('列表選手', { waitingTurns: 5 });
    const fromRest = makePlayer('休息選手', { waitingTurns: 5 });

    const stateList = makeState({ players: [fromList] });
    const stateRest = makeState({ restingPlayers: [fromRest] });

    const resultList = moveToReadyLogic('列表選手', stateList);
    const resultRest = moveToReadyLogic('休息選手', stateRest);

    // 列表加入：歸零
    expect(resultList.movedPlayer.waitingTurns).toBe(0);
    // 休息區回來：保留
    expect(resultRest.movedPlayer.waitingTurns).toBe(5);
  });
});

// ============================================================
// moveToRest 測試
// ============================================================
describe('moveToRestLogic', () => {

  test('將準備區選手移到休息區', () => {
    const player = makePlayer('小明', { waitingTurns: 2 });
    const state = makeState({ readyPlayers: [player] });

    const result = moveToRestLogic('小明', state);

    expect(result).not.toBeNull();
    expect(result.readyPlayers).toHaveLength(0);
    expect(result.restingPlayers).toHaveLength(1);
    expect(result.movedPlayer.name).toBe('小明');
    expect(result.movedPlayer.waitingTurns).toBe(2);
  });

  test('找不到選手時回傳 null', () => {
    const state = makeState({ readyPlayers: [] });
    const result = moveToRestLogic('不存在', state);
    expect(result).toBeNull();
  });

  test('只移除指定選手，其他選手不受影響', () => {
    const p1 = makePlayer('A', { waitingTurns: 1 });
    const p2 = makePlayer('B', { waitingTurns: 3 });
    const state = makeState({ readyPlayers: [p1, p2] });

    const result = moveToRestLogic('A', state);

    expect(result.readyPlayers).toHaveLength(1);
    expect(result.readyPlayers[0].name).toBe('B');
    expect(result.restingPlayers[0].name).toBe('A');
  });
});

// ============================================================
// moveToReady 其他行為測試
// ============================================================
describe('moveToReadyLogic 其他行為', () => {

  test('找不到選手時回傳 null', () => {
    const state = makeState();
    const result = moveToReadyLogic('不存在', state);
    expect(result).toBeNull();
  });

  test('從選手列表加入：justJoinedReady 為 true', () => {
    const player = makePlayer('小明');
    const state = makeState({ players: [player] });

    const result = moveToReadyLogic('小明', state);
    expect(result.movedPlayer.justJoinedReady).toBe(true);
  });

  test('從休息區回來：justJoinedReady 為 false（直接顯示等待輪次）', () => {
    const player = makePlayer('小明', { waitingTurns: 3 });
    const state = makeState({ restingPlayers: [player] });

    const result = moveToReadyLogic('小明', state);
    expect(result.movedPlayer.justJoinedReady).toBe(false);
  });

  test('移入準備區後清除 justFinished 標記', () => {
    const player = makePlayer('小明', { justFinished: true });
    const state = makeState({ restingPlayers: [player] });

    const result = moveToReadyLogic('小明', state);
    expect(result.movedPlayer.justFinished).toBe(false);
  });

  test('場次調整為活躍選手平均場次', () => {
    const existing1 = makePlayer('A', { matches: 6 });
    const existing2 = makePlayer('B', { matches: 4 });
    const player = makePlayer('新加入', { matches: 0 });

    const state = makeState({
      restingPlayers: [player],
      readyPlayers: [existing1, existing2]
    });

    const result = moveToReadyLogic('新加入', state);
    // 平均場次 = (6 + 4) / 2 = 5
    expect(result.movedPlayer.matches).toBe(5);
  });

  test('同時存在於選手列表和休息區時，優先取休息區（保留等待輪次）', () => {
    const inList = makePlayer('小明', { waitingTurns: 0 });
    const inRest = makePlayer('小明', { waitingTurns: 7 });

    const state = makeState({
      players: [inList],
      restingPlayers: [inRest]
    });

    const result = moveToReadyLogic('小明', state);
    // 休息區優先 → 等待輪次保留
    expect(result.movedPlayer.waitingTurns).toBe(7);
  });
});

// ============================================================
// calculateActivePlayersAverageMatches 測試
// ============================================================
describe('calculateActivePlayersAverageMatches', () => {

  test('無活躍選手時回傳 0', () => {
    expect(calculateActivePlayersAverageMatches([], [[], [], []])).toBe(0);
  });

  test('只有準備區選手', () => {
    const players = [
      makePlayer('A', { matches: 4 }),
      makePlayer('B', { matches: 6 })
    ];
    expect(calculateActivePlayersAverageMatches(players, [[], [], []])).toBe(5);
  });

  test('場地上和準備區都有選手', () => {
    const ready = [makePlayer('A', { matches: 2 })];
    const courts = [
      [makePlayer('B', { matches: 4 }), makePlayer('C', { matches: 6 })],
      [],
      []
    ];
    // 平均 = (2 + 4 + 6) / 3 = 4
    expect(calculateActivePlayersAverageMatches(ready, courts)).toBe(4);
  });

  test('平均場次四捨五入', () => {
    const players = [
      makePlayer('A', { matches: 3 }),
      makePlayer('B', { matches: 4 })
    ];
    // 平均 = 3.5 → 四捨五入 = 4
    expect(calculateActivePlayersAverageMatches(players, [[], [], []])).toBe(4);
  });
});
