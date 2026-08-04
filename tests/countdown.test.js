const { countdownState, formatCountdown, formatEventDate } = require('../js/countdown');

// 測試專用固定值，與 js/countdown.js 的 EVENT 常數無關（不需同步）：
// 這裡測的是 countdownState 的三狀態邊界邏輯，用什麼時間值都成立。
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

// 這組測試依賴 package.json 的 test script 把 TZ 設成非台北時區（目前是
// America/Los_Angeles）才有鑑別力：若測試環境本地時區恰好就是 Asia/Taipei，
// 誤用 getMonth()/getDay()/getHours() 的錯誤實作會與正確的 getUTC* 實作
// 給出相同結果，下面的時區獨立性測試就會變成假陽性（測了等於沒測）。
describe('formatEventDate', () => {
  test('測試環境時區不是台北（否則下面的時區獨立性測試沒有鑑別力）', () => {
    // 本地時區若等於賽事時區（Asia/Taipei），誤用 getMonth()/getDay() 的錯誤實作
    // 會與正確實作給出相同結果，時區測試就形同虛設。
    // 由 package.json 的 test script 設定 TZ 保證。
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('Asia/Taipei');
  });

  test('賽事開打時刻：8/20 是星期四', () => {
    expect(formatEventDate('2026-08-20T18:10:00+08:00')).toBe('8/20 (四) 18:10 開打');
  });

  test('另一個已知星期，驗證星期對照表沒有 off-by-one：8/16 是星期日，時分補零', () => {
    expect(formatEventDate('2026-08-16T09:05:00+08:00')).toBe('8/16 (日) 09:05 開打');
  });

  test('時區獨立性：台北時間跨日的時刻，不論裝置時區都要顯示台北當地的日期與星期', () => {
    // UTC 上是 8/19 16:30（星期三），若誤用 getUTCDate()/getUTCDay() 而未先 +8 小時，
    // 或誤用本地時區方法，結果會變成 8/19。
    expect(formatEventDate('2026-08-20T00:30:00+08:00')).toBe('8/20 (四) 00:30 開打');
  });
});
