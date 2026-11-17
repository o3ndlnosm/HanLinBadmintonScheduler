/**
 * @jest-environment jsdom
 */
// 2026-11-17 交界火花接上應援條：結構、第一次總數不噴、別人加油從交界朝對方噴、減少動態效果不噴
// 2026-11-17 應援泡泡＋比賽結束才公布應援數：比賽中只顯示隊名、該隊那側冒泡泡、公布後顯示應援總數、finished 唯讀
const TEAMS = [
  { id: 'M', name: '貿聯', color: '#e10600' },
  { id: 'H', name: '翰林', color: '#00a19c' },
];

let mountCheerBar;
let setCheerReveal;
let setCheerReadOnly;
let cheerSlogans;
let totals;
let frames;

const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const container = () => document.getElementById('cheer');
const sparks = () => document.querySelectorAll('#cheer .cheer-fx .cheer-spark');
const bubbles = (side) => document.querySelectorAll(`#cheer .cheer-bubbles .cheer-bubble${side ? `-${side}` : ''}`);
const buttons = () => document.querySelectorAll('#cheer .cheer-btn');
const headText = () => document.querySelector('#cheer .cheer-counts').textContent;
const label = () => document.querySelector('#cheer .cheer-total-label');
// 泡泡也會呼叫 animate，方向只看火花
const sparkFrames = () => frames.filter((f) => f.el.classList.contains('cheer-spark')).map((f) => f.kf);
const dxOf = (kf) => Number(/translate\((-?[\d.e-]+)px/.exec(kf[1].transform)[1]);

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="cheer"></div>';
  frames = [];
  Element.prototype.animate = function (kf) {
    frames.push({ el: this, kf });
    return { onfinish: null, oncancel: null };
  };
  window.matchMedia = undefined;
  totals = { M: 100, H: 100 };
  global.fetchCheerTotals = jest.fn(() => Promise.resolve(totals));
  global.sendCheer = jest.fn(() => Promise.resolve(totals));
  jest.isolateModules(() => {
    ({ mountCheerBar, setCheerReveal, setCheerReadOnly, cheerSlogans } = require('../js/cheer'));
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('應援條包在軌道裡，交界有光點，光點跟著比例走', async () => {
  totals = { M: 300, H: 100 };
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  expect(document.querySelector('#cheer .cheer-track .cheer-bar')).not.toBeNull();
  const core = document.querySelector('#cheer .cheer-track .cheer-fx .cheer-spark-core');
  expect(core).not.toBeNull();
  expect(core.style.left).toBe('75%');
});

test('打開頁面第一次拿到總數不噴；之後別人加油就噴', async () => {
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  expect(sparks()).toHaveLength(0);
  totals = { M: 103, H: 100 };
  jest.advanceTimersByTime(3000);
  await tick();
  expect(sparks()).toHaveLength(8);
});

test('貿聯往右（翰林那側）噴、翰林往左噴', async () => {
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  buttons()[0].click();
  expect(sparkFrames()).toHaveLength(6);
  expect(sparkFrames().every((kf) => dxOf(kf) > 0)).toBe(true);
  frames = [];
  buttons()[1].click();
  expect(sparkFrames()).toHaveLength(6);
  expect(sparkFrames().every((kf) => dxOf(kf) < 0)).toBe(true);
});

test('系統開了減少動態效果：不噴、不冒泡泡', async () => {
  window.matchMedia = () => ({ matches: true });
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  buttons()[0].click();
  expect(sparks()).toHaveLength(0);
  expect(bubbles()).toHaveLength(0);
});

// 2026-11-17 review Minor 3：分頁在背景時不噴
test('分頁在背景：不噴、不冒泡泡', async () => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
  try {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    buttons()[0].click();
    expect(sparks()).toHaveLength(0);
    expect(bubbles()).toHaveLength(0);
  } finally {
    delete document.visibilityState;
  }
});

// 2026-11-17 review Minor 4：火花出錯不影響應援數與按鈕回饋（應援數要公布後才看得到）
test('火花出錯：數字照常更新、按鈕照常有回饋', async () => {
  window.matchMedia = () => { throw new Error('boom'); };
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  setCheerReveal(true);
  buttons()[0].click();
  expect(headText()).toContain('101');
  expect(buttons()[0].classList.contains('bump')).toBe(true);
});

describe('應援泡泡', () => {
  test('自己按一下：貿聯那側冒一個泡泡，文字是貿聯的口號', async () => {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    buttons()[0].click();
    expect(bubbles('a')).toHaveLength(1);
    expect(bubbles('b')).toHaveLength(0);
    expect(cheerSlogans('貿聯')).toContain(bubbles('a')[0].textContent);
  });

  test('打開頁面第一次拿到總數不冒；之後別人一次湧進 20 下只冒一個', async () => {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    expect(bubbles()).toHaveLength(0);
    totals = { M: 120, H: 100 };
    jest.advanceTimersByTime(3000);
    await tick();
    expect(bubbles('a')).toHaveLength(1);
    expect(bubbles('b')).toHaveLength(0);
  });

  test('狂按：同一側同時最多 3 個', async () => {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    for (let i = 0; i < 5; i++) buttons()[0].click();
    expect(bubbles('a')).toHaveLength(3);
  });
});

describe('比賽結束才公布應援數', () => {
  test('比賽中：只顯示隊名，任何時刻都沒有數字', async () => {
    mountCheerBar(container(), TEAMS, 'pub');
    expect(/\d/.test(headText())).toBe(false);
    await tick();
    buttons()[0].click();
    totals = { M: 150, H: 130 };
    jest.advanceTimersByTime(3000);
    await tick();
    expect(headText()).toContain('貿聯');
    expect(headText()).toContain('翰林');
    expect(/\d/.test(headText())).toBe(false);
    expect(label().hidden).toBe(true);
  });

  test('公布：顯示「應援總數」與兩隊數字；收回公布後又藏起來', async () => {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    setCheerReveal(true);
    expect(label().hidden).toBe(false);
    expect(label().textContent).toBe('應援總數');
    expect(headText()).toContain('貿聯 100');
    expect(headText()).toContain('100 翰林');
    setCheerReveal(false);
    expect(/\d/.test(headText())).toBe(false);
    expect(label().hidden).toBe(true);
  });

  test('掛載前就公布：第一次拿到總數就顯示數字', async () => {
    setCheerReveal(true);
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    expect(headText()).toContain('貿聯 100');
  });

  test('唯讀（比賽已鎖定）：沒有加油按鈕，總數照常輪詢並公布', async () => {
    setCheerReveal(true);
    mountCheerBar(container(), TEAMS, 'pub', { readOnly: true });
    await tick();
    expect(buttons()).toHaveLength(0);
    expect(headText()).toContain('貿聯 100');
    totals = { M: 120, H: 100 };
    jest.advanceTimersByTime(3000);
    await tick();
    expect(headText()).toContain('貿聯 120');
    expect(global.sendCheer).not.toHaveBeenCalled();
  });

  // 2026-11-17 review Important 1：頁面開著時比賽才變 finished（賽後收尾時現場頁面幾乎都開著）
  test('開著的頁面中途變唯讀：按鈕拿掉、沒送出的點擊不再算進公布的數字、定時送出停掉', async () => {
    global.sendCheer = jest.fn(() => Promise.reject(new Error('比賽已結束')));
    setCheerReveal(true);
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    expect(jest.getTimerCount()).toBe(2); // 定時送出＋輪詢
    buttons()[0].click();
    expect(headText()).toContain('貿聯 101');
    setCheerReadOnly(true);
    await tick();
    expect(buttons()).toHaveLength(0);
    expect(headText()).toContain('貿聯 100');
    expect(jest.getTimerCount()).toBe(1); // 只剩輪詢
  });
});
