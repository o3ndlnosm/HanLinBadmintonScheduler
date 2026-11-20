/**
 * @jest-environment jsdom
 */
// 觀賽頁的全螢幕開場與揭曉（spec：docs/superpowers/specs/2026-11-20-champion-moment-design.md）
// 每台裝置只播一次、分頁在背景不播、點一下略過、圖層時間到一定移除、圖載不完也照播。
Object.assign(global, require('../js/team-points'));
const {
  CM_INTRO_MS, CM_REVEAL_MS, CM_IMAGE_WAIT_MS, syncChampionPage, createPlayedStore, playedKey,
} = require('../js/champion-moment');

const SCHEDULE = [
  [1, 1, '男雙', 'A', 1], [1, 2, '混雙', 'A', 2], [1, 3, '女雙', '', 3],
  [2, 1, '混雙', 'B', 4], [2, 2, '男雙', 'B', 5], [2, 3, '男雙', 'A', 1],
  [3, 1, '混雙', 'A', 2], [3, 2, '女雙', '', 3], [3, 3, '混雙', 'B', 4],
  [4, 1, '男雙', 'B', 5], [4, 2, '男雙', 'A', 1],
  [5, 1, '混雙', 'A', 2], [5, 2, '女雙', '', 3],
  [6, 1, '混雙', 'B', 4], [6, 2, '男雙', 'B', 5],
];

function friendlyView() {
  return {
    tournament: { name: '貿聯×翰林2026羽球聯合友誼賽', heldOn: '2026-11-25', status: 'active' },
    teams: [{ id: 'M', name: '貿聯', players: [] }, { id: 'H', name: '翰林', players: [] }],
    matches: SCHEDULE.map(([roundNo, courtNo, event, eventTag, pointNo]) => ({
      id: `r${roundNo}c${courtNo}`, roundNo, courtNo, event, eventTag, pointNo,
      teamAId: 'M', teamBId: 'H', status: 'pending', scoreA: null, scoreB: null,
    })),
  };
}

const confirmUpTo = (view, round, winnerOf) => {
  view.matches.filter((m) => m.roundNo <= round).forEach((m) => {
    const w = winnerOf(m);
    m.status = 'confirmed';
    [m.scoreA, m.scoreB] = w === m.teamAId ? [21, 15] : [15, 21];
  });
  return view;
};
// 第 1～5 輪：總點數 2：1，最後一輪決定冠軍；第 6 輪都給翰林 → 翰林 3：2
const OPEN_FINAL = (m) => ({ 1: 'M', 2: 'M', 3: 'H' }[m.pointNo] || (m.roundNo === 2 ? 'M' : 'H'));
const finalView = () => confirmUpTo(friendlyView(), 5, OPEN_FINAL);
const hanlinWins = () => confirmUpTo(friendlyView(), 6, (m) => (m.roundNo === 6 ? 'H' : OPEN_FINAL(m)));

let section;
let store;
const layers = () => document.querySelectorAll('body > .cm-layer');
const layer = () => document.querySelector('body > .cm-layer');
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const setHidden = (value) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
const sync = (view, opts = {}) => syncChampionPage(view, { mode: 'public', section, store, ...opts });

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '<section id="pointsSection"><h2>點數比分</h2><div id="pointBoard"></div></section>';
  section = document.getElementById('pointsSection');
  store = createPlayedStore(undefined);
  HTMLCanvasElement.prototype.getContext = () => null; // jsdom 沒有 canvas：紙花不畫，其餘照常
  delete HTMLImageElement.prototype.decode;
  setHidden(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('最終戰開場', () => {
  test('第一次看到最終戰（前景）：播開場、記下 final；照時間軸走完後移除', async () => {
    const view = finalView();
    sync(view);
    expect(layers()).toHaveLength(1);
    expect(layer().classList.contains('cm-intro')).toBe(true);
    expect(layer().querySelector('.cm-title').textContent).toBe('冠軍時刻');
    expect(store.has(playedKey(view, 'final'))).toBe(true);
    await flush();
    jest.advanceTimersByTime(200);
    expect(layer().classList.contains('cm-players-in')).toBe(true);
    jest.advanceTimersByTime(750);
    expect(layer().classList.contains('cm-title-in')).toBe(true);
    expect(layer().classList.contains('cm-shake')).toBe(true);
    jest.advanceTimersByTime(350);
    expect(layer().classList.contains('cm-shake')).toBe(false);
    jest.advanceTimersByTime(1600);
    expect(layer().classList.contains('cm-title-out')).toBe(true);
    jest.advanceTimersByTime(CM_INTRO_MS - 2900);
    expect(layers()).toHaveLength(0);
  });

  test('同一台裝置已經播過：再 sync 不播', () => {
    sync(finalView());
    layer().click();
    sync(finalView());
    expect(layers()).toHaveLength(0);
  });

  test('分頁在背景：不播也不記；回到前景再 sync 才播', () => {
    const view = finalView();
    setHidden(true);
    sync(view);
    expect(layers()).toHaveLength(0);
    expect(store.has(playedKey(view, 'final'))).toBe(false);
    setHidden(false);
    sync(view);
    expect(layers()).toHaveLength(1);
  });

  test('點一下圖層：立即移除', () => {
    sync(finalView());
    layer().click();
    expect(layers()).toHaveLength(0);
  });

  test('輸分模式：不播', () => {
    sync(finalView(), { mode: 'captain' });
    expect(layers()).toHaveLength(0);
  });

  test('storage 讀寫丟例外：仍只播一次（退回記憶體）', () => {
    store = createPlayedStore({ getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } });
    sync(finalView());
    layer().click();
    sync(finalView());
    expect(layers()).toHaveLength(0);
  });

  test('團體圖的 decode() 一直不完成：等滿 CM_IMAGE_WAIT_MS 照播，之後準時移除', async () => {
    HTMLImageElement.prototype.decode = () => new Promise(() => {});
    sync(finalView());
    await flush();
    jest.advanceTimersByTime(CM_IMAGE_WAIT_MS - 1);
    await flush();
    jest.advanceTimersByTime(200);
    expect(layer().classList.contains('cm-players-in')).toBe(false);
    jest.advanceTimersByTime(1);
    await flush();
    jest.advanceTimersByTime(200);
    expect(layer().classList.contains('cm-players-in')).toBe(true);
    jest.advanceTimersByTime(CM_INTRO_MS);
    expect(layers()).toHaveLength(0);
  });

  test('減少動態效果：圖層有 cm-reduce、不震動', async () => {
    sync(finalView(), { reduce: true });
    await flush();
    jest.advanceTimersByTime(1000);
    expect(layer().classList.contains('cm-reduce')).toBe(true);
    expect(layer().classList.contains('cm-shake')).toBe(false);
  });
});

describe('冠軍揭曉', () => {
  test('第一次看到就是 done：跳過開場直接揭曉，記下 done 與 final；之後改判退回最終戰也不播開場', () => {
    const view = hanlinWins();
    sync(view);
    expect(layers()).toHaveLength(1);
    expect(layer().classList.contains('cm-reveal')).toBe(true);
    expect(store.has(playedKey(view, 'done'))).toBe(true);
    expect(store.has(playedKey(view, 'final'))).toBe(true);
    layer().click();
    view.matches.find((m) => m.id === 'r6c2').status = 'pending';
    sync(view);
    expect(layers()).toHaveLength(0);
  });

  test('翰林勝的揭曉：勝方團體圖在右、隊名色塊、奪冠！、3 : 2；紙花在圖之後、字之前', () => {
    sync(hanlinWins());
    const el = layer();
    expect(el.classList.contains('cm-side-right')).toBe(true);
    expect(el.querySelector('.cm-reveal-img').getAttribute('src')).toContain('team-right');
    expect(el.querySelector('.cm-reveal-text .cm-pill').textContent).toBe('翰林');
    expect(el.querySelector('.cm-win').textContent).toBe('奪冠！');
    expect(el.querySelector('.cm-reveal-score').textContent).toBe('3 : 2');
    const order = [...el.children].map((c) => c.className.split(' ')[0]);
    expect(order.indexOf('cm-reveal-img')).toBeLessThan(order.indexOf('cm-confetti'));
    expect(order.indexOf('cm-confetti')).toBeLessThan(order.indexOf('cm-reveal-text'));
  });

  test('揭曉約 8 秒：淡出後移除', async () => {
    sync(hanlinWins());
    await flush();
    jest.advanceTimersByTime(CM_REVEAL_MS - 600);
    expect(layer().classList.contains('cm-out')).toBe(true);
    jest.advanceTimersByTime(600);
    expect(layers()).toHaveLength(0);
  });

  test('最終戰開場還在播時就揭曉：同時只留一個圖層', () => {
    const view = finalView();
    sync(view);
    sync(hanlinWins());
    expect(layers()).toHaveLength(1);
    expect(layer().classList.contains('cm-reveal')).toBe(true);
  });
});
