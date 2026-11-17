/**
 * @jest-environment jsdom
 */
// 2026-11-17 交界火花接上應援條：結構、第一次總數不噴、別人加油從交界朝對方噴、減少動態效果不噴
const TEAMS = [
  { id: 'M', name: '貿聯', color: '#e10600' },
  { id: 'H', name: '翰林', color: '#00a19c' },
];

let mountCheerBar;
let totals;
let frames;

const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const container = () => document.getElementById('cheer');
const sparks = () => document.querySelectorAll('#cheer .cheer-fx .cheer-spark');
const buttons = () => document.querySelectorAll('#cheer .cheer-btn');
const dxOf = (kf) => Number(/translate\((-?[\d.e-]+)px/.exec(kf[1].transform)[1]);

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="cheer"></div>';
  frames = [];
  Element.prototype.animate = function (kf) {
    frames.push(kf);
    return { onfinish: null, oncancel: null };
  };
  window.matchMedia = undefined;
  totals = { M: 100, H: 100 };
  global.fetchCheerTotals = jest.fn(() => Promise.resolve(totals));
  global.sendCheer = jest.fn(() => Promise.resolve(totals));
  jest.isolateModules(() => { ({ mountCheerBar } = require('../js/cheer')); });
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
  expect(frames).toHaveLength(6);
  expect(frames.every((kf) => dxOf(kf) > 0)).toBe(true);
  frames = [];
  buttons()[1].click();
  expect(frames).toHaveLength(6);
  expect(frames.every((kf) => dxOf(kf) < 0)).toBe(true);
});

test('系統開了減少動態效果：不噴', async () => {
  window.matchMedia = () => ({ matches: true });
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  buttons()[0].click();
  expect(sparks()).toHaveLength(0);
});

// 2026-11-17 review Minor 3：分頁在背景時不噴
test('分頁在背景：不噴', async () => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
  try {
    mountCheerBar(container(), TEAMS, 'pub');
    await tick();
    buttons()[0].click();
    expect(sparks()).toHaveLength(0);
  } finally {
    delete document.visibilityState;
  }
});

// 2026-11-17 review Minor 4：火花出錯不影響應援數與按鈕回饋
test('火花出錯：數字照常更新、按鈕照常有回饋', async () => {
  window.matchMedia = () => { throw new Error('boom'); };
  mountCheerBar(container(), TEAMS, 'pub');
  await tick();
  buttons()[0].click();
  expect(document.querySelector('#cheer .cheer-counts').textContent).toContain('101');
  expect(buttons()[0].classList.contains('bump')).toBe(true);
});
