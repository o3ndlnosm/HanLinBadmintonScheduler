const {
  CHEER_MAX_PER_WINDOW, CHEER_FLUSH_MS, CHEER_POLL_MS,
  addTap, cheerRatio, displayTotals, createCheerController,
} = require('../js/cheer');

describe('常數（spec：每 2 秒最多算 10 下、每 2 秒送一次、每 3 秒輪詢）', () => {
  test('值', () => {
    expect(CHEER_MAX_PER_WINDOW).toBe(10);
    expect(CHEER_FLUSH_MS).toBe(2000);
    expect(CHEER_POLL_MS).toBe(3000);
  });
});

describe('addTap', () => {
  test('第 1–10 下計入，第 11 下不計且停在 10', () => {
    let w = 0;
    for (let i = 1; i <= 10; i++) {
      const r = addTap(w);
      expect(r).toEqual({ windowCount: i, counted: true });
      w = r.windowCount;
    }
    expect(addTap(w)).toEqual({ windowCount: 10, counted: false });
  });
});

describe('cheerRatio', () => {
  test('兩邊皆 0 → 各半', () => {
    expect(cheerRatio({ M: 0, H: 0 }, 'M', 'H')).toBe(50);
    expect(cheerRatio({}, 'M', 'H')).toBe(50);
  });
  test('A 方百分比', () => {
    expect(cheerRatio({ M: 30, H: 10 }, 'M', 'H')).toBe(75);
    expect(cheerRatio({ M: 0, H: 7 }, 'M', 'H')).toBe(0);
  });
});

describe('displayTotals', () => {
  test('伺服器數＋本機尚未送出的量', () => {
    expect(displayTotals({ M: 5, H: 3 }, { M: 2 })).toEqual({ M: 7, H: 3 });
  });
  test('伺服器缺某隊 → 視為 0', () => {
    expect(displayTotals({}, { H: 4 })).toEqual({ H: 4 });
  });
});

describe('createCheerController', () => {
  const setup = (overrides = {}) => {
    const calls = { send: [], changes: [] };
    const ctrl = createCheerController({
      token: 'pub',
      teamIds: ['M', 'H'],
      send: overrides.send || ((token, teamId, n) => {
        calls.send.push([token, teamId, n]);
        return Promise.resolve({ M: 100 + n, H: 50 });
      }),
      fetchTotals: overrides.fetchTotals || (() => Promise.resolve({ M: 1, H: 2 })),
      onChange: (t) => calls.changes.push(t),
    });
    return { ctrl, calls };
  };

  test('狂按 12 下：畫面立即 +10，送出一次 n=10，再 flush 不重送', async () => {
    const { ctrl, calls } = setup();
    for (let i = 0; i < 12; i++) ctrl.tap('M');
    expect(calls.changes[calls.changes.length - 1]).toEqual({ M: 10, H: 0 });
    await ctrl.flush();
    expect(calls.send).toEqual([['pub', 'M', 10]]);
    expect(calls.changes[calls.changes.length - 1]).toEqual({ M: 110, H: 50 });
    await ctrl.flush();
    expect(calls.send).toHaveLength(1);
  });

  test('flush 後重開新的 2 秒窗口，可再算 10 下', async () => {
    const { ctrl, calls } = setup();
    for (let i = 0; i < 10; i++) ctrl.tap('H');
    await ctrl.flush();
    for (let i = 0; i < 3; i++) ctrl.tap('H');
    await ctrl.flush();
    expect(calls.send).toEqual([['pub', 'H', 10], ['pub', 'H', 3]]);
  });

  test('兩隊各自累積、各自送出', async () => {
    const { ctrl, calls } = setup();
    ctrl.tap('M');
    ctrl.tap('H');
    ctrl.tap('H');
    await ctrl.flush();
    expect(calls.send).toEqual([['pub', 'M', 1], ['pub', 'H', 2]]);
  });

  test('送出失敗：flush 不拋錯、不重送，下一輪照常', async () => {
    let fail = true;
    const sent = [];
    const { ctrl } = setup({
      send: (token, teamId, n) => {
        sent.push(n);
        return fail ? Promise.reject(new Error('網路不穩')) : Promise.resolve({ M: n, H: 0 });
      },
    });
    ctrl.tap('M');
    await expect(ctrl.flush()).resolves.toBeUndefined();
    fail = false;
    ctrl.tap('M');
    ctrl.tap('M');
    await ctrl.flush();
    expect(sent).toEqual([1, 2]);
  });

  test('poll 成功更新畫面；失敗不拋錯也不更新', async () => {
    const { ctrl, calls } = setup();
    await ctrl.poll();
    expect(calls.changes).toEqual([{ M: 1, H: 2 }]);

    const bad = setup({ fetchTotals: () => Promise.reject(new Error('x')) });
    await expect(bad.ctrl.poll()).resolves.toBeUndefined();
    expect(bad.calls.changes).toEqual([]);
  });

  // 2026-11-17 review：送出途中的量不在顯示裡、較舊的總數直接覆蓋，狂按時數字會先往回掉再跳回
  test('送出途中再按：畫面不會掉回去（送出中的量仍計入顯示）', async () => {
    let resolveSend;
    const changes = [];
    const ctrl = createCheerController({
      token: 'pub', teamIds: ['M', 'H'],
      send: () => new Promise((r) => { resolveSend = r; }),
      fetchTotals: () => Promise.resolve({ M: 100, H: 0 }),
      onChange: (t) => changes.push(t.M),
    });
    await ctrl.poll();                       // 伺服器 100
    for (let i = 0; i < 10; i++) ctrl.tap('M'); // 110
    const sending = ctrl.flush();            // 10 下送出中
    ctrl.tap('M');                           // 再按 1 下
    expect(changes[changes.length - 1]).toBe(111);
    resolveSend({ M: 110, H: 0 });
    await sending;
    expect(changes[changes.length - 1]).toBe(111);
  });

  test('較舊的輪詢結果晚回來，畫面不會下降', async () => {
    const changes = [];
    let pollValue = { M: 100, H: 0 };
    const ctrl = createCheerController({
      token: 'pub', teamIds: ['M', 'H'],
      send: () => Promise.resolve({ M: 110, H: 0 }),
      fetchTotals: () => Promise.resolve(pollValue),
      onChange: (t) => changes.push(t.M),
    });
    for (let i = 0; i < 10; i++) ctrl.tap('M');
    await ctrl.flush();                      // 伺服器回 110
    pollValue = { M: 100, H: 0 };            // 送出前發出、較晚回來的舊輪詢
    await ctrl.poll();
    expect(changes[changes.length - 1]).toBe(110);
  });

  test('同時呼叫兩次 flush，同一批只送一次', async () => {
    const sent = [];
    const ctrl = createCheerController({
      token: 'pub', teamIds: ['M', 'H'],
      send: (token, teamId, n) => { sent.push(n); return Promise.resolve({ M: n, H: 0 }); },
      fetchTotals: () => Promise.resolve({}),
      onChange: () => {},
    });
    for (let i = 0; i < 4; i++) ctrl.tap('M');
    await Promise.all([ctrl.flush(), ctrl.flush()]);
    expect(sent).toEqual([4]);
  });

  test('沒有累積時 flush 不送任何請求', async () => {
    const { ctrl, calls } = setup();
    await ctrl.flush();
    expect(calls.send).toEqual([]);
  });
});
