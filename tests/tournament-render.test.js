/**
 * @jest-environment jsdom
 */
// 計分頁渲染層的整合測試：載入 tournament.html 的 body 與實際的 js 檔（依 <script> 順序），
// 直接呼叫 renderAll(view)。
// 反目標（spec）：應援功能出錯不得連帶讓比分輸入（賽程列）壞掉。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SCRIPTS = ['dialog', 'standings', 'team-points', 'tournament-form', 'tournament-api', 'cheer', 'live', 'tournament'];

// 友誼賽賽程（輪, 場地, 賽點, A/B, 點）
const SCHEDULE = [
  [1, 1, '男雙', 'A', 1], [1, 2, '混雙', 'A', 2], [1, 3, '女雙', '', 3],
  [2, 1, '混雙', 'B', 4], [2, 2, '男雙', 'B', 5], [2, 3, '男雙', 'A', 1],
  [3, 1, '混雙', 'A', 2], [3, 2, '女雙', '', 3], [3, 3, '混雙', 'B', 4],
  [4, 1, '男雙', 'B', 5], [4, 2, '男雙', 'A', 1],
  [5, 1, '混雙', 'A', 2], [5, 2, '女雙', '', 3],
  [6, 1, '混雙', 'B', 4], [6, 2, '男雙', 'B', 5],
];

function friendlyView(teams = [{ id: 'M', name: '貿聯', players: [] }, { id: 'H', name: '翰林', players: [] }]) {
  return {
    tournament: { name: '貿聯×翰林2026羽球聯合友誼賽', heldOn: '2026-11-25', status: 'active', scoreRule: 'to21_cap30' },
    teams,
    myTeamId: 'M',
    reports: {},
    matches: SCHEDULE.map(([roundNo, courtNo, event, eventTag, pointNo]) => ({
      id: `r${roundNo}c${courtNo}`, roundNo, courtNo, timeSlot: '18:15-18:30', event, eventTag, pointNo,
      teamAId: 'M', teamBId: 'H', playersA: [], playersB: [], status: 'pending', scoreA: null, scoreB: null,
    })),
  };
}

const globalEval = (code) => (0, eval)(code); // 在 jsdom 的全域執行，等同瀏覽器載入 <script>

beforeAll(() => {
  const html = fs.readFileSync(path.join(root, 'tournament.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
  SCRIPTS.forEach((name) => {
    let code = fs.readFileSync(path.join(root, 'js', `${name}.js`), 'utf8');
    // tournament.js 頂層的 `let auth` 在間接 eval 下只屬於那次 eval，外面直接 assign 改不到它；
    // 附一個測試用 setter，才能真的切換觀賽／輸分模式。
    if (name === 'tournament') code += '\nwindow.__setAuth = (a) => { auth = a; };';
    globalEval(code);
  });
  window.__setAuth({ mode: 'captain', token: 'cap-M' });
});

beforeEach(() => {
  document.getElementById('schedule').textContent = '';
  document.getElementById('scheduleSection').hidden = true;
});

test('應援條掛載出錯時，賽程（輸分入口）照樣畫出來、renderAll 不拋錯', () => {
  globalEval("mountCheerBar = function () { throw new Error('cheer boom'); };");
  expect(() => globalEval('renderAll')(friendlyView())).not.toThrow();
  expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
  expect(document.getElementById('scheduleSection').hidden).toBe(false);
});

test('比點資料但隊伍不足兩隊：不拋錯、賽程照樣畫出來', () => {
  globalEval('mountCheerBar = function () {};');
  const view = friendlyView([{ id: 'M', name: '貿聯', players: [] }]);
  expect(() => globalEval('renderAll')(view)).not.toThrow();
  expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
});

test('點數比分板的隊伍色點：貿聯紅、翰林青', () => {
  window.mountCheerBar = jest.fn();
  window.setCheerReveal = jest.fn();
  window.setCheerReadOnly = jest.fn();
  globalEval('renderAll')(friendlyView());
  const dots = [...document.querySelectorAll('#pointBoard .team-dot')];
  expect(dots[0].style.backgroundColor).toBe('rgb(225, 6, 0)');
  expect(dots[1].style.backgroundColor).toBe('rgb(0, 161, 156)');
});

// 2026-11-20 名單改中英文後，375px 時「李小華｜Hua」這種中文名與英文名之間被斷開：改成每位選手一個不拆開的區塊
describe('賽程列的選手名', () => {
  const withPlayers = () => {
    const view = friendlyView();
    view.matches[4].playersA = [{ name: '張大同Datong' }, { name: '劉美美Mei' }];
    view.matches[4].playersB = [{ name: '王小明Ming' }, { name: '李小華Hua' }];
    return view;
  };

  beforeEach(() => {
    window.mountCheerBar = jest.fn();
    window.setCheerReveal = jest.fn();
    window.setCheerReadOnly = jest.fn();
  });

  test('每位選手一個 .side-player，分隔號跟在前一位後面（折行時・留在行尾）', () => {
    globalEval('renderAll')(withPlayers());
    const sides = document.querySelectorAll('#schedule .match-row')[4].querySelectorAll('.side-players');
    expect(sides).toHaveLength(2);
    const names = (el) => [...el.querySelectorAll('.side-player')].map((n) => n.textContent);
    expect(names(sides[0])).toEqual(['張大同Datong・', '劉美美Mei']);
    expect(names(sides[1])).toEqual(['王小明Ming・', '李小華Hua']);
  });

  test('整行文字跟改版前一樣是「A・B」', () => {
    globalEval('renderAll')(withPlayers());
    const sides = document.querySelectorAll('#schedule .match-row')[4].querySelectorAll('.side-players');
    expect(sides[1].textContent).toBe('王小明Ming・李小華Hua');
  });

  test('名單是空的：不加選手那一行（版面等同只顯示隊名）', () => {
    globalEval('renderAll')(withPlayers());
    expect(document.querySelectorAll('#schedule .match-row')[0].querySelectorAll('.side-players')).toHaveLength(0);
  });
});

// 2026-11-17 比賽結束才公布應援數：15 場全部確認或比賽 finished 才公布；finished 後應援條唯讀仍掛
describe('應援條公布與唯讀', () => {
  let mountSpy;
  let revealSpy;
  let readOnlySpy;
  const allConfirmed = (view) => {
    view.matches.forEach((m) => { m.status = 'confirmed'; m.scoreA = 21; m.scoreB = 15; });
    return view;
  };

  beforeEach(() => {
    mountSpy = jest.fn();
    revealSpy = jest.fn();
    window.mountCheerBar = mountSpy;
    window.setCheerReveal = revealSpy;
    readOnlySpy = jest.fn();
    window.setCheerReadOnly = readOnlySpy;
  });

  // 這個檔的預設是輸分模式；觀賽頁的情境用這個切過去再切回來
  const asPublic = (fn) => {
    window.__setAuth({ mode: 'public', token: 'pub' });
    try {
      fn();
    } finally {
      window.__setAuth({ mode: 'captain', token: 'cap-M' });
    }
  };

  test('觀賽頁比賽中（還有沒確認的）：不公布、可以加油', () => {
    asPublic(() => globalEval('renderAll')(friendlyView()));
    expect(revealSpy).toHaveBeenLastCalledWith(false);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
    expect(readOnlySpy).toHaveBeenLastCalledWith(false);
  });

  // 2026-11-20 孟娜：輸分頁只顯示應援狀況、不要加油按鈕（場邊的人看的、按的都是觀賽頁）
  test('輸分頁比賽中：應援條唯讀（沒有加油按鈕），一樣不公布', () => {
    globalEval('renderAll')(friendlyView());
    expect(revealSpy).toHaveBeenLastCalledWith(false);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('觀賽頁 15 場全部確認（還沒 finished）：公布、仍可以加油', () => {
    asPublic(() => globalEval('renderAll')(allConfirmed(friendlyView())));
    expect(revealSpy).toHaveBeenLastCalledWith(true);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
  });

  // 要在觀賽頁跑：輸分頁本來就一律唯讀，在輸分頁跑的話拿掉 finished 判斷也會過（2026-11-20 review Important 1）
  test('觀賽頁比賽 finished：仍掛應援條（唯讀）並公布', () => {
    const view = friendlyView();
    view.tournament.status = 'finished';
    asPublic(() => globalEval('renderAll')(view));
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(revealSpy).toHaveBeenLastCalledWith(true);
    // 頁面開著時才變 finished：mountCheerBar 只掛一次，要另外切成唯讀（2026-11-17 review Important 1）
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('公布出錯：賽程照樣畫出來、renderAll 不拋錯', () => {
    window.setCheerReveal = () => { throw new Error('reveal boom'); };
    expect(() => globalEval('renderAll')(friendlyView())).not.toThrow();
    expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
  });
});

describe('直播框', () => {
  const URL1 = 'https://youtu.be/AbCdEfGhI_-';
  let realMountLive;
  let section;
  const withLive = (url) => {
    const view = friendlyView();
    view.tournament.liveUrl = url;
    return view;
  };

  beforeAll(() => { realMountLive = window.mountLiveBox; });

  beforeEach(() => {
    window.mountCheerBar = jest.fn();
    window.setCheerReveal = jest.fn();
    window.setCheerReadOnly = jest.fn();
    window.mountLiveBox = realMountLive;
    section = document.getElementById('liveSection');
    section.textContent = '';
    section.hidden = true;
    delete section.dataset.liveId;
    window.__setAuth({ mode: 'public', token: 'pub' });
  });

  afterEach(() => {
    window.__setAuth({ mode: 'captain', token: 'cap-M' });
    window.mountLiveBox = realMountLive;
  });

  test('觀賽模式有直播網址：直播框出現在點數比分板之前', () => {
    globalEval('renderAll')(withLive(URL1));
    expect(section.hidden).toBe(false);
    expect(section.querySelectorAll('iframe')).toHaveLength(1);
    const points = document.getElementById('pointsSection');
    expect(section.compareDocumentPosition(points) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('連續 renderAll 兩次：還是同一個 iframe 元素', () => {
    globalEval('renderAll')(withLive(URL1));
    const first = section.querySelector('iframe');
    globalEval('renderAll')(withLive(URL1));
    expect(section.querySelectorAll('iframe')).toHaveLength(1);
    expect(section.querySelector('iframe')).toBe(first);
  });

  test('輸分模式有直播網址：不掛直播框', () => {
    window.__setAuth({ mode: 'captain', token: 'cap-M' });
    const spy = jest.fn();
    window.mountLiveBox = spy;
    globalEval('renderAll')(withLive(URL1));
    expect(spy).not.toHaveBeenCalled();
    expect(section.hidden).toBe(true);
  });

  test('payload 沒有 liveUrl：直播框不出現、不拋錯', () => {
    expect(() => globalEval('renderAll')(friendlyView())).not.toThrow();
    expect(section.hidden).toBe(true);
    expect(section.querySelectorAll('iframe')).toHaveLength(0);
  });

  test('比賽 finished 後網址還在：直播框照樣顯示', () => {
    const view = withLive(URL1);
    view.tournament.status = 'finished';
    globalEval('renderAll')(view);
    expect(section.hidden).toBe(false);
    expect(section.querySelectorAll('iframe')).toHaveLength(1);
  });

  test('直播框掛載出錯：賽程照樣畫出 15 列', () => {
    window.mountLiveBox = () => { throw new Error('live boom'); };
    expect(() => globalEval('renderAll')(withLive(URL1))).not.toThrow();
    expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
  });
});
