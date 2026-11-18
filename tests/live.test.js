/**
 * @jest-environment jsdom
 */
// 觀賽頁 YouTube 直播框（spec：docs/superpowers/specs/2026-11-18-live-stream-design.md）
// 反目標：不能嵌入 YouTube 以外的網站、不能每次重畫就重新載入影片、只對 YouTube 送網域不送通行碼。
const { youtubeIdFrom, mountLiveBox } = require('../js/live.js');

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
