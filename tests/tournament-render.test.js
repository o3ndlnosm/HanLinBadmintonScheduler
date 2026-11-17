/**
 * @jest-environment jsdom
 */
// 計分頁渲染層的整合測試：載入 tournament.html 的 body 與實際的 js 檔（依 <script> 順序），
// 直接呼叫 renderAll(view)。
// 反目標（spec）：應援功能出錯不得連帶讓比分輸入（賽程列）壞掉。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SCRIPTS = ['dialog', 'standings', 'team-points', 'tournament-form', 'tournament-api', 'cheer', 'tournament'];

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
  SCRIPTS.forEach((name) => globalEval(fs.readFileSync(path.join(root, 'js', `${name}.js`), 'utf8')));
  globalEval("auth = { mode: 'captain', token: 'cap-M' };");
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

  test('比賽中（還有沒確認的）：不公布、可以加油', () => {
    globalEval('renderAll')(friendlyView());
    expect(revealSpy).toHaveBeenLastCalledWith(false);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
  });

  test('15 場全部確認：公布', () => {
    globalEval('renderAll')(allConfirmed(friendlyView()));
    expect(revealSpy).toHaveBeenLastCalledWith(true);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: false });
  });

  test('比賽 finished：仍掛應援條（唯讀）並公布', () => {
    const view = friendlyView();
    view.tournament.status = 'finished';
    globalEval('renderAll')(view);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy.mock.calls[0][3]).toEqual({ readOnly: true });
    expect(revealSpy).toHaveBeenLastCalledWith(true);
    // 頁面開著時才變 finished：mountCheerBar 只掛一次，要另外切成唯讀（review Important 1）
    expect(readOnlySpy).toHaveBeenLastCalledWith(true);
  });

  test('公布出錯：賽程照樣畫出來、renderAll 不拋錯', () => {
    window.setCheerReveal = () => { throw new Error('reveal boom'); };
    expect(() => globalEval('renderAll')(friendlyView())).not.toThrow();
    expect(document.querySelectorAll('#schedule .match-row')).toHaveLength(15);
  });
});
