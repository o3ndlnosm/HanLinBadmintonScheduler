const { countdownState, formatCountdown } = require('../js/countdown');

const EVENT = {
  startAt: '2026-08-20T18:10:00+08:00',
  endAt: '2026-08-20T19:50:00+08:00',
};
const START = Date.parse(EVENT.startAt);
const END = Date.parse(EVENT.endAt);

// 用秒數往前推，避免手算 epoch 造成的魔術數字
const before = (d, h, m, s) => START - ((d * 86400 + h * 3600 + m * 60 + s) * 1000);

describe('時區', () => {
  test('常數帶 +08:00，解析結果等同對應的 UTC 時刻', () => {
    expect(START).toBe(Date.parse('2026-08-20T10:10:00Z'));
    expect(END).toBe(Date.parse('2026-08-20T11:50:00Z'));
  });
});

describe('countdownState 三個狀態', () => {
  test('開打前為 before，並拆出天時分秒', () => {
    expect(countdownState(before(16, 8, 24, 31), EVENT)).toEqual({
      phase: 'before', days: 16, hours: 8, minutes: 24, seconds: 31,
    });
  });

  test('剩不到一天時 days 為 0', () => {
    expect(countdownState(before(0, 5, 3, 2), EVENT)).toEqual({
      phase: 'before', days: 0, hours: 5, minutes: 3, seconds: 2,
    });
  });

  test('剩不到一分鐘', () => {
    expect(countdownState(before(0, 0, 0, 45), EVENT)).toEqual({
      phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 45,
    });
  });

  test('比賽期間為 during', () => {
    expect(countdownState(START + 30 * 60 * 1000, EVENT)).toEqual({ phase: 'during' });
  });

  test('結束後為 ended', () => {
    expect(countdownState(END + 1000, EVENT)).toEqual({ phase: 'ended' });
  });
});

describe('countdownState 邊界', () => {
  test('now 正好等於 startAt 即進入 during', () => {
    expect(countdownState(START, EVENT)).toEqual({ phase: 'during' });
  });

  test('startAt 前 1 毫秒仍是 before（不足一秒顯示 0 秒）', () => {
    expect(countdownState(START - 1, EVENT)).toEqual({
      phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 0,
    });
  });

  test('now 正好等於 endAt 即進入 ended', () => {
    expect(countdownState(END, EVENT)).toEqual({ phase: 'ended' });
  });

  test('endAt 前 1 毫秒仍是 during', () => {
    expect(countdownState(END - 1, EVENT)).toEqual({ phase: 'during' });
  });
});

describe('formatCountdown', () => {
  test('剩超過一天時帶「天」，時分秒補零', () => {
    expect(formatCountdown({ phase: 'before', days: 16, hours: 8, minutes: 24, seconds: 31 }))
      .toBe('16 天 08 : 24 : 31');
  });

  test('剩不到一天時不顯示「天」', () => {
    expect(formatCountdown({ phase: 'before', days: 0, hours: 5, minutes: 3, seconds: 2 }))
      .toBe('05 : 03 : 02');
  });

  test('全為個位數時補零', () => {
    expect(formatCountdown({ phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 7 }))
      .toBe('00 : 00 : 07');
  });
});
