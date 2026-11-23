/**
 * @jest-environment jsdom
 */
// 計分頁渲染層的整合測試：載入 tournament.html 的 body 與實際的 js 檔（依 <script> 順序），
// 直接呼叫 renderAll(view)。
// 反目標（spec）：應援功能出錯不得連帶讓比分輸入（賽程列）壞掉。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SCRIPTS = ['dialog', 'standings', 'team-points', 'tournament-form', 'tournament-api', 'cheer', 'live', 'champion-moment', 'tournament'];

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
    if (name === 'tournament') code += '\nwindow.__setAuth = (a) => { auth = a; };\nwindow.__resetChampionStore = () => { championStore = null; };';
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

test('點數比分板的隊伍色點：貿聯藍、翰林白（代表色）', () => {
  window.mountCheerBar = jest.fn();
  window.setCheerReveal = jest.fn();
  window.setCheerReadOnly = jest.fn();
  globalEval('renderAll')(friendlyView());
  const dots = [...document.querySelectorAll('#pointBoard .team-dot')];
  expect(dots[0].style.backgroundColor).toBe('rgb(0, 119, 203)');
  expect(dots[1].style.backgroundColor).toBe('rgb(255, 255, 255)');
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

  // 2026-11-23 應援開放時間（cheerOpensAt）：還沒到就唯讀，到了就可以加油；沒設（第三屆、舊後端）不限制
  test('觀賽頁應援還沒開放：唯讀（沒有加油按鈕）', () => {
    const view = friendlyView();
    view.tournament.cheerOpensAt = '2999-01-01T00:00:00+00:00';
    asPublic(() => globalEval('renderAll')(view));
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('觀賽頁應援開放時間已過：可以加油', () => {
    const view = friendlyView();
    view.tournament.cheerOpensAt = '2000-01-01T00:00:00+00:00';
    asPublic(() => globalEval('renderAll')(view));
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
    expect(readOnlySpy).toHaveBeenLastCalledWith(false);
  });

  // 開放時間已過不能蓋掉其他唯讀條件（2026-11-23 review）
  test('開放時間已過但比賽 finished：仍唯讀', () => {
    const view = friendlyView();
    view.tournament.cheerOpensAt = '2000-01-01T00:00:00+00:00';
    view.tournament.status = 'finished';
    asPublic(() => globalEval('renderAll')(view));
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('開放時間已過但在輸分頁：仍唯讀', () => {
    const view = friendlyView();
    view.tournament.cheerOpensAt = '2000-01-01T00:00:00+00:00';
    globalEval('renderAll')(view);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('頁面開著、時間走過開放時間：下一次刷新切回可加油', () => {
    const opens = Date.parse('2026-11-25T10:15:00+00:00');
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(opens - 1000);
    try {
      const view = friendlyView();
      view.tournament.cheerOpensAt = '2026-11-25T10:15:00+00:00';
      asPublic(() => globalEval('renderAll')(view));
      expect(readOnlySpy).toHaveBeenLastCalledWith(true);
      nowSpy.mockReturnValue(opens);
      asPublic(() => globalEval('renderAll')(view));
      expect(readOnlySpy).toHaveBeenLastCalledWith(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('開放時間格式不認得：當作沒設，可以加油（後端仍會擋）', () => {
    const view = friendlyView();
    view.tournament.cheerOpensAt = 'not-a-date';
    asPublic(() => globalEval('renderAll')(view));
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
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

describe('代表色的色點（2026-11-25 友誼賽）', () => {
  beforeEach(() => {
    window.mountCheerBar = jest.fn();
    window.setCheerReveal = jest.fn();
    window.setCheerReadOnly = jest.fn();
  });

  test('翰林白點加藍色內框、貿聯藍點不加（點的大小不變）：點數比分板與賽程列都一樣', () => {
    globalEval('renderAll')(friendlyView());
    const boardDots = [...document.querySelectorAll('#pointBoard .point-score .team-dot')];
    const rowDots = [...document.querySelectorAll('#schedule .match-row')[0].querySelectorAll('.team-dot')];
    [boardDots, rowDots].forEach(([m, h]) => {
      expect(m.style.backgroundColor).toBe('rgb(0, 119, 203)');
      expect(m.style.boxShadow).toBe('');
      expect(h.style.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(h.style.boxShadow).toMatch(/inset/);
      expect(h.style.boxShadow).toMatch(/#187fc4|rgb\(24, 127, 196\)/);
    });
  });

  test('第三屆（五隊、排名表）：色點照舊、沒有內框', () => {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    const rgb = ['rgb(225, 6, 0)', 'rgb(0, 161, 156)', 'rgb(255, 128, 0)', 'rgb(155, 93, 229)', 'rgb(245, 197, 24)'];
    globalEval('renderAll')({
      tournament: { name: '第三屆翰林匹克羽球運動會', heldOn: '2026-08-20', status: 'active' },
      teams: ids.map((id) => ({ id, name: `${id}隊`, players: [] })),
      myTeamId: 'A',
      reports: {},
      matches: [{
        id: 'm1', roundNo: 1, courtNo: 1, timeSlot: '18:10-18:25', event: '男雙',
        teamAId: 'A', teamBId: 'B', playersA: [], playersB: [], status: 'pending', scoreA: null, scoreB: null,
      }],
    });
    const cells = [...document.querySelectorAll('#standings td.team-name')];
    expect(cells).toHaveLength(5);
    cells.forEach((td) => {
      const dot = td.querySelector('.team-dot');
      expect(dot.style.backgroundColor).toBe(rgb[ids.indexOf(td.textContent.trim()[0])]);
      expect(dot.style.boxShadow).toBe('');
    });
  });
});

describe('冠軍時刻主視覺（2026-11-25 友誼賽）', () => {
  // 第 1～round 輪設成 confirmed，winnerOf(match) 決定勝方
  const confirmUpTo = (view, round, winnerOf) => {
    view.matches.filter((m) => m.roundNo <= round).forEach((m) => {
      const w = winnerOf(m);
      m.status = 'confirmed';
      [m.scoreA, m.scoreB] = w === m.teamAId ? [21, 15] : [15, 21];
    });
    return view;
  };
  // 第 1～5 輪打完：第一、二點貿聯、第三點翰林，第四、五點各 1：1 → 總點數 2：1，最後一輪決定冠軍
  const OPEN_FINAL = (m) => ({ 1: 'M', 2: 'M', 3: 'H' }[m.pointNo] || (m.roundNo === 2 ? 'M' : 'H'));
  const hero = () => document.querySelector('#pointsSection > .cm-hero');
  const text = (sel) => hero().querySelector(sel).textContent;
  const board = () => document.getElementById('pointBoard');
  const render = (view) => globalEval('renderAll')(view);

  beforeEach(() => {
    window.mountCheerBar = jest.fn();
    window.setCheerReveal = jest.fn();
    window.setCheerReadOnly = jest.fn();
    window.localStorage.clear();
    window.__resetChampionStore();
    window.__setAuth({ mode: 'public', token: 'pub' });
  });
  afterEach(() => {
    window.__setAuth({ mode: 'captain', token: 'cap-M' });
    render(friendlyView()); // 回到一般畫面（拿掉主視覺），不影響其他測試
    document.querySelectorAll('.cm-layer').forEach((el) => el.remove());
  });

  test('最終戰（總點數 2：1）：主視覺在點數比分板前面，冠軍時刻、大比分、最終輪場次', () => {
    render(confirmUpTo(friendlyView(), 5, OPEN_FINAL));
    expect(hero()).not.toBeNull();
    expect(hero().nextElementSibling).toBe(board());
    expect(hero().dataset.state).toBe('final');
    expect(text('.cm-badge')).toBe('冠軍時刻');
    expect(text('.cm-nums')).toBe('2 : 1');
    expect(text('.cm-label')).toBe('總點數');
    expect(text('.cm-decider')).toBe('最終戰　第四點 混雙B · 第五點 男雙B');
    expect(board().classList.contains('cm-active')).toBe(true);
  });

  test('隊名色塊用代表色（貿聯藍底白字、翰林白底深藍字藍框）', () => {
    render(confirmUpTo(friendlyView(), 5, OPEN_FINAL));
    const [left, right] = hero().querySelectorAll('.cm-pill');
    expect([left.textContent, right.textContent]).toEqual(['貿聯', '翰林']);
    expect(left.style.getPropertyValue('--cm-fill')).toBe('#0077cb');
    expect(right.style.getPropertyValue('--cm-fill')).toBe('#ffffff');
    expect(right.style.getPropertyValue('--cm-edge')).toBe('#187fc4');
    expect(right.style.getPropertyValue('--cm-ink')).toBe('#14649c');
  });

  test('連續 renderAll 兩次：同一個主視覺元素、只有一個', () => {
    const view = confirmUpTo(friendlyView(), 5, OPEN_FINAL);
    render(view);
    const first = hero();
    render(view);
    expect(hero()).toBe(first);
    expect(document.querySelectorAll('.cm-hero')).toHaveLength(1);
  });

  test('翰林 3：2 全部確認：冠軍狀態、勝方在右、比賽結束', () => {
    const view = confirmUpTo(friendlyView(), 6, (m) => (m.roundNo === 6 ? 'H' : OPEN_FINAL(m)));
    render(view);
    expect(hero().dataset.state).toBe('champion');
    expect(hero().dataset.winner).toBe('right');
    expect(text('.cm-badge')).toBe('🏆 冠軍');
    expect(text('.cm-nums')).toBe('2 : 3');
    expect(text('.cm-decider')).toBe('比賽結束：翰林 以 3：2 勝出');
  });

  test('冠軍已提前確定（貿聯 3 點）再進最終戰：比分下的小字改成確定勝出', () => {
    render(confirmUpTo(friendlyView(), 5, (m) => (m.pointNo <= 3 ? 'M' : 'H')));
    expect(hero().dataset.state).toBe('final');
    expect(text('.cm-label')).toBe('貿聯 已拿下 3 點，確定勝出');
  });

  test('輸分模式：不掛主視覺、不播開場', () => {
    window.__setAuth({ mode: 'captain', token: 'cap-M' });
    render(confirmUpTo(friendlyView(), 5, OPEN_FINAL));
    expect(hero()).toBeNull();
    expect(board().classList.contains('cm-active')).toBe(false);
    expect(document.querySelectorAll('body > .cm-layer')).toHaveLength(0);
  });

  test('觀賽模式第一次看到最終戰：renderAll 播開場；之後每 10 秒重畫不再播', () => {
    const view = confirmUpTo(friendlyView(), 5, OPEN_FINAL);
    render(view);
    expect(document.querySelectorAll('body > .cm-layer.cm-intro')).toHaveLength(1);
    document.querySelector('body > .cm-layer').click();
    render(view);
    expect(document.querySelectorAll('body > .cm-layer')).toHaveLength(0);
  });

  test('第 5 輪還沒打完：沒有主視覺', () => {
    render(confirmUpTo(friendlyView(), 4, OPEN_FINAL));
    expect(hero()).toBeNull();
  });

  test('改判退回：從最終戰退回一般畫面時拿掉主視覺', () => {
    const view = confirmUpTo(friendlyView(), 5, OPEN_FINAL);
    render(view);
    expect(hero()).not.toBeNull();
    view.matches.find((m) => m.id === 'r5c2').status = 'pending';
    render(view);
    expect(hero()).toBeNull();
    expect(board().classList.contains('cm-active')).toBe(false);
  });

  test('比賽 finished 但點數沒分出勝負：沒有主視覺、不拋錯', () => {
    const view = confirmUpTo(friendlyView(), 1, OPEN_FINAL);
    view.tournament.status = 'finished';
    expect(() => render(view)).not.toThrow();
    expect(hero()).toBeNull();
  });

  test('冠軍時刻的檔案沒載入：賽程 15 列、renderAll 不拋錯、點數比分板照常（2026-11-20 審查補）', () => {
    const saved = { sync: globalEval('syncChampionPage'), store: globalEval('createPlayedStore') };
    globalEval('syncChampionPage = undefined; createPlayedStore = undefined;');
    window.__resetChampionStore();
    try {
      expect(() => render(confirmUpTo(friendlyView(), 5, OPEN_FINAL))).not.toThrow();
      expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
      expect(document.querySelector('#pointBoard .point-score')).not.toBeNull();
      expect(hero()).toBeNull();
    } finally {
      window.syncChampionPage = saved.sync;
      window.createPlayedStore = saved.store;
      window.__resetChampionStore();
    }
  });

  test('主視覺出錯：賽程照樣 15 列、renderAll 不拋錯', () => {
    const original = globalEval('renderChampionHero');
    globalEval("renderChampionHero = function () { throw new Error('cm boom'); };");
    try {
      expect(() => render(confirmUpTo(friendlyView(), 5, OPEN_FINAL))).not.toThrow();
      expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
    } finally {
      window.renderChampionHero = original;
    }
  });
});
