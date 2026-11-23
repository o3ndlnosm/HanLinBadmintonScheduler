/**
 * @jest-environment jsdom
 */
// 觀賽頁 YouTube 直播框（spec：docs/superpowers/specs/2026-11-18-live-stream-design.md）
// 反目標：不能嵌入 YouTube 以外的網站、不能每次重畫就重新載入影片、只對 YouTube 送網域不送通行碼。
const { youtubeIdFrom, mountLiveBox, formatLiveCountdown, formatLiveStart } = require('../js/live.js');

const ID = 'AbCdEfGhI_-';

describe('youtubeIdFrom：只從 YouTube 網址取出 11 碼影片 ID', () => {
  test.each([
    ['https://www.youtube.com/watch?v=AbCdEfGhI_-', ID],
    ['https://youtube.com/watch?v=AbCdEfGhI_-&t=30s', ID],
    ['https://m.youtube.com/watch?v=AbCdEfGhI_-', ID],
    ['https://youtu.be/AbCdEfGhI_-?si=xyz', ID],
    ['https://www.youtube.com/live/AbCdEfGhI_-?si=xyz', ID],
    ['https://www.youtube.com/embed/AbCdEfGhI_-', ID],
    ['AbCdEfGhI_-', ID],
    ['  https://youtu.be/AbCdEfGhI_-  ', ID],
    ['youtube.com/watch?v=AbCdEfGhI_-', ID],
  ])('%s → 影片 ID', (input, expected) => {
    expect(youtubeIdFrom(input)).toBe(expected);
  });

  test.each([
    [null], [undefined], [''], [123],
    ['https://www.youtube.com.evil.com/watch?v=AbCdEfGhI_-'],
    ['https://evilyoutube.com/watch?v=AbCdEfGhI_-'],
    ['https://vimeo.com/123456'],
    ['javascript:alert(1)'],
    ['ftp://youtu.be/AbCdEfGhI_-'],
    ['https://www.youtube.com/watch?v=short'],
    ['https://www.youtube.com/watch?v=AbCdEfGhI_-"><b>'],
    ['https://www.youtube.com/@somechannel/live'],
  ])('%p → null', (input) => {
    expect(youtubeIdFrom(input)).toBeNull();
  });
});

describe('mountLiveBox：直播框只掛一次、換影片才換', () => {
  let section;
  beforeEach(() => {
    document.body.innerHTML = '<section id="liveSection" hidden></section>';
    section = document.getElementById('liveSection');
  });
  const frames = () => section.querySelectorAll('iframe');

  test('null 網址：區塊維持隱藏、沒有 iframe', () => {
    mountLiveBox(section, null);
    expect(section.hidden).toBe(true);
    expect(frames()).toHaveLength(0);
  });

  test('合法網址：區塊出現，iframe 指向 embed 網址且只送網域', () => {
    mountLiveBox(section, `https://www.youtube.com/watch?v=${ID}`);
    expect(section.hidden).toBe(false);
    expect(frames()).toHaveLength(1);
    const f = frames()[0];
    expect(f.src).toBe(`https://www.youtube.com/embed/${ID}`);
    expect(f.referrerPolicy).toBe('strict-origin-when-cross-origin');
    expect(f.title).toBe('直播');
    expect(f.allowFullscreen).toBe(true);
    expect(section.querySelector('h2').textContent).toContain('直播');
    const a = section.querySelector('a');
    expect(a.href).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    expect(a.textContent).toBe('在 YouTube 開啟');
  });

  test('同一支影片再掛一次（換成另一種網址寫法）：還是同一個 iframe 元素', () => {
    mountLiveBox(section, `https://www.youtube.com/watch?v=${ID}`);
    const first = frames()[0];
    mountLiveBox(section, `https://youtu.be/${ID}`);
    expect(frames()).toHaveLength(1);
    expect(frames()[0]).toBe(first);
  });

  test('換影片：iframe 換成新 ID', () => {
    mountLiveBox(section, `https://youtu.be/${ID}`);
    mountLiveBox(section, 'https://youtu.be/ZyXwVuTsRqP');
    expect(frames()).toHaveLength(1);
    expect(frames()[0].src).toBe('https://www.youtube.com/embed/ZyXwVuTsRqP');
  });

  test('網址清空：區塊隱藏、iframe 移除', () => {
    mountLiveBox(section, `https://youtu.be/${ID}`);
    mountLiveBox(section, '');
    expect(section.hidden).toBe(true);
    expect(frames()).toHaveLength(0);
  });

  test('其他網站的網址：區塊隱藏', () => {
    mountLiveBox(section, 'https://vimeo.com/123456');
    expect(section.hidden).toBe(true);
    expect(frames()).toHaveLength(0);
  });
});

// 2026-11-23：還沒填直播網址時直播框照樣出現，倒數到開打（tournament.cheerOpensAt，友誼賽 18:15）
describe('直播倒數：還沒有直播網址時', () => {
  const START = '2026-11-25T10:15:00+00:00'; // 台北 18:15
  const START_MS = Date.parse(START);
  let section;
  let nowSpy;
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<section id="liveSection" hidden></section>';
    section = document.getElementById('liveSection');
    nowSpy = jest.spyOn(Date, 'now');
  });
  afterEach(() => {
    mountLiveBox(section, null); // 停掉倒數計時器
    nowSpy.mockRestore();
    jest.useRealTimers();
  });
  const timeText = () => section.querySelector('.live-countdown-time').textContent;
  const labelText = () => section.querySelector('.live-countdown-label').textContent;

  test('格式：超過一天帶天數，不到一天只有時分秒', () => {
    expect(formatLiveCountdown(2 * 86400 + 3 * 3600 + 4 * 60 + 5)).toBe('2 天 03:04:05');
    expect(formatLiveCountdown(59)).toBe('00:00:59');
  });

  test('開打時間用台北時間顯示，星期由日期推導', () => {
    expect(formatLiveStart(START_MS)).toBe('11/25（三）18:15 開打');
  });

  test('有開打時間、沒網址：直播框出現倒數，沒有 iframe', () => {
    nowSpy.mockReturnValue(START_MS - (86400 + 60) * 1000);
    mountLiveBox(section, null, { countdownTo: START });
    expect(section.hidden).toBe(false);
    expect(section.querySelectorAll('iframe')).toHaveLength(0);
    expect(labelText()).toBe('直播倒數');
    expect(timeText()).toBe('1 天 00:01:00');
    expect(section.textContent).toContain('11/25（三）18:15 開打');
  });

  test('每秒更新；重複掛載（每 10 秒刷新）不重畫、不疊計時器', () => {
    nowSpy.mockReturnValue(START_MS - 10 * 1000);
    mountLiveBox(section, null, { countdownTo: START });
    const el = section.querySelector('.live-countdown-time');
    mountLiveBox(section, null, { countdownTo: START });
    expect(section.querySelector('.live-countdown-time')).toBe(el);
    expect(jest.getTimerCount()).toBe(1);
    nowSpy.mockReturnValue(START_MS - 9 * 1000);
    jest.advanceTimersByTime(1000);
    expect(timeText()).toBe('00:00:09');
  });

  test('時間到了還沒網址：顯示「直播即將開始」、停掉計時器', () => {
    nowSpy.mockReturnValue(START_MS - 1000);
    mountLiveBox(section, null, { countdownTo: START });
    nowSpy.mockReturnValue(START_MS);
    jest.advanceTimersByTime(1000);
    expect(labelText()).toBe('直播即將開始');
    expect(timeText()).toBe('');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('之後填了網址：換成 iframe、倒數計時器停掉', () => {
    nowSpy.mockReturnValue(START_MS - 60 * 1000);
    mountLiveBox(section, null, { countdownTo: START });
    mountLiveBox(section, `https://youtu.be/${ID}`, { countdownTo: START });
    expect(section.querySelectorAll('iframe')).toHaveLength(1);
    expect(section.querySelector('.live-countdown-time')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('沒有開打時間（第三屆）或格式不認得：照舊隱藏', () => {
    mountLiveBox(section, null, { countdownTo: null });
    expect(section.hidden).toBe(true);
    mountLiveBox(section, null, { countdownTo: 'not-a-date' });
    expect(section.hidden).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('倒數中改成不倒數（比賽 finished）：區塊隱藏、計時器停掉', () => {
    nowSpy.mockReturnValue(START_MS - 60 * 1000);
    mountLiveBox(section, null, { countdownTo: START });
    mountLiveBox(section, null, { countdownTo: null });
    expect(section.hidden).toBe(true);
    expect(section.textContent).toBe('');
    expect(jest.getTimerCount()).toBe(0);
  });
});
