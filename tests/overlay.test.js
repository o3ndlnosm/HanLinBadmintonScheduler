/**
 * @jest-environment jsdom
 */
// 直播畫面疊加比分（spec：docs/superpowers/specs/2026-11-18-live-overlay-design.md）
// 反目標：直播畫面上不能出現錯誤訊息；不接受輸分通行碼。
Object.assign(global, require('../js/team-points'), require('../js/tournament-form'), require('../js/champion-moment'));
const {
  OVERLAY_POLL_MS, latestConfirmedMatch, overlayLines, renderOverlay, initOverlay,
} = require('../js/overlay');

// 友誼賽賽程（輪, 場地, 賽點, A/B, 點）
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
    tournament: { name: '貿聯×翰林2026羽球聯合友誼賽', heldOn: '2026-11-25', status: 'active', scoreRule: 'to21_cap30', liveUrl: null },
    teams: [{ id: 'M', name: '貿聯', players: [] }, { id: 'H', name: '翰林', players: [] }],
    matches: SCHEDULE.map(([roundNo, courtNo, event, eventTag, pointNo]) => ({
      id: `r${roundNo}c${courtNo}`, roundNo, courtNo, timeSlot: '18:15-18:30', event, eventTag, pointNo,
      teamAId: 'M', teamBId: 'H', playersA: [], playersB: [], status: 'pending', scoreA: null, scoreB: null,
    })),
  };
}

// 讓某場確認，winner 為 'M' 或 'H'（21:15）
function win(view, id, winner) {
  const m = view.matches.find((x) => x.id === id);
  m.status = 'confirmed';
  const aWins = winner === m.teamAId;
  m.scoreA = aWins ? 21 : 15;
  m.scoreB = aWins ? 15 : 21;
  return view;
}

describe('latestConfirmedMatch：最新打完的一場', () => {
  test('沒有確認的場次 → null', () => {
    expect(latestConfirmedMatch(friendlyView().matches)).toBeNull();
  });
  test('取輪次最大的', () => {
    const v = win(win(friendlyView(), 'r1c3', 'M'), 'r2c1', 'H');
    expect(latestConfirmedMatch(v.matches).id).toBe('r2c1');
  });
  test('同一輪取場地號碼最大的', () => {
    const v = win(win(friendlyView(), 'r2c1', 'M'), 'r2c2', 'H');
    expect(latestConfirmedMatch(v.matches).id).toBe('r2c2');
  });
  test('conflict／pending 不算', () => {
    const v = win(friendlyView(), 'r1c1', 'M');
    v.matches.find((m) => m.id === 'r3c1').status = 'conflict';
    expect(latestConfirmedMatch(v.matches).id).toBe('r1c1');
  });
});

describe('overlayLines：比分條兩行的內容', () => {
  test('都沒確認：0 : 0、尚未開打', () => {
    expect(overlayLines(friendlyView())).toEqual({
      left: { name: '貿聯', color: '#0077cb', edge: '#0077cb', points: 0 },
      right: { name: '翰林', color: '#ffffff', edge: '#187fc4', points: 0 },
      detail: '尚未開打',
      tag: null,
    });
  });

  test('最新一場：第三點 女雙 21:18 貿聯勝', () => {
    const v = friendlyView();
    Object.assign(v.matches.find((m) => m.id === 'r1c3'), { status: 'confirmed', scoreA: 21, scoreB: 18 });
    expect(overlayLines(v).detail).toBe('最新：第三點 女雙 21:18 貿聯勝');
  });

  test('場次的 A 隊是右邊那隊：比分仍照左右順序排', () => {
    const v = friendlyView();
    Object.assign(v.matches.find((m) => m.id === 'r1c3'), {
      teamAId: 'H', teamBId: 'M', status: 'confirmed', scoreA: 18, scoreB: 21,
    });
    expect(overlayLines(v).detail).toBe('最新：第三點 女雙 21:18 貿聯勝');
  });

  test('已拿下過半點數但還有場次沒確認：確定勝出', () => {
    const v = friendlyView();
    ['r1c1', 'r2c3', 'r1c2', 'r3c1', 'r1c3', 'r3c2'].forEach((id) => win(v, id, 'M'));
    const lines = overlayLines(v);
    expect(lines.left.points).toBe(3);
    expect(lines.right.points).toBe(0);
    expect(lines.detail).toBe('貿聯 拿下 3 點，確定勝出');
  });

  test('15 場全部確認：比賽結束', () => {
    const v = friendlyView();
    // 第一～三點貿聯 2:1，第四、五點翰林 2:1 → 3：2
    ['r1c1', 'r2c3', 'r1c2', 'r3c1', 'r1c3', 'r3c2', 'r6c1', 'r6c2'].forEach((id) => win(v, id, 'M'));
    ['r4c2', 'r5c1', 'r5c2', 'r2c1', 'r3c3', 'r2c2', 'r4c1'].forEach((id) => win(v, id, 'H'));
    expect(overlayLines(v).detail).toBe('比賽結束：貿聯 以 3：2 勝出');
  });

  test('非比點賽事或只有一隊：null', () => {
    const v = friendlyView();
    v.matches.forEach((m) => { m.pointNo = null; });
    expect(overlayLines(v)).toBeNull();
    const one = friendlyView();
    one.teams = one.teams.slice(0, 1);
    expect(overlayLines(one)).toBeNull();
  });
});

describe('renderOverlay：畫比分條', () => {
  let root;
  beforeEach(() => {
    document.body.textContent = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  const lines = {
    left: { name: '貿聯', color: '#e10600', points: 2 },
    right: { name: '翰林', color: '#00a19c', points: 1 },
    detail: '最新：第三點 女雙 21:18 貿聯勝',
  };

  test('兩行內容與隊伍色', () => {
    renderOverlay(root, lines);
    const dots = root.querySelectorAll('.ov-dot');
    expect(dots).toHaveLength(2);
    expect(dots[0].style.backgroundColor).toBe('rgb(225, 6, 0)');
    expect(dots[1].style.backgroundColor).toBe('rgb(0, 161, 156)');
    expect(root.querySelector('.ov-nums').textContent).toBe('2 : 1');
    expect(root.querySelector('.ov-score').textContent).toContain('貿聯');
    expect(root.querySelector('.ov-score').textContent).toContain('翰林');
    expect(root.querySelector('.ov-detail').textContent).toBe(lines.detail);
  });

  test('連畫兩次仍只有一個比分條', () => {
    renderOverlay(root, lines);
    renderOverlay(root, lines);
    expect(root.querySelectorAll('.ov-bar')).toHaveLength(1);
  });

  test('沒有比分、有訊息：只顯示訊息；兩者都沒有：清空', () => {
    renderOverlay(root, null, '請改用觀賽連結');
    expect(root.textContent).toBe('請改用觀賽連結');
    expect(root.querySelector('.ov-nums')).toBeNull();
    renderOverlay(root, null);
    expect(root.textContent).toBe('');
  });
});

describe('initOverlay：只認觀賽連結、每 10 秒重讀、失敗保留上次', () => {
  let root;
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.textContent = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => { jest.useRealTimers(); });

  test.each([['?c=abc'], [''], ['?t='], ['?t=tok&c=abc']])('%p：顯示請改用觀賽連結、不讀資料', async (search) => {
    const fetchView = jest.fn();
    const ctl = initOverlay({ search, root, fetchView });
    await ctl.ready;
    expect(root.textContent).toBe('請改用觀賽連結');
    expect(fetchView).not.toHaveBeenCalled();
    ctl.stop();
  });

  test('?t=：立刻讀並畫出比分，10 秒後再讀一次', async () => {
    const fetchView = jest.fn(() => Promise.resolve(friendlyView()));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    expect(fetchView).toHaveBeenCalledWith('tok');
    expect(root.querySelector('.ov-nums').textContent).toBe('0 : 0');
    jest.advanceTimersByTime(OVERLAY_POLL_MS);
    expect(fetchView).toHaveBeenCalledTimes(2);
    ctl.stop();
  });

  test('成功一次後讀取失敗：畫面維持上一次、沒有錯誤文字', async () => {
    const fetchView = jest.fn(() => Promise.resolve(friendlyView()));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    const before = root.innerHTML;
    fetchView.mockImplementationOnce(() => Promise.reject(new Error('網路不穩，請確認連線後再試一次')));
    await ctl.refresh();
    expect(root.innerHTML).toBe(before);
    fetchView.mockImplementationOnce(() => Promise.resolve({ tournament: null }));
    await ctl.refresh();
    expect(root.innerHTML).toBe(before);
    ctl.stop();
  });

  test('第一次就找不到比賽：顯示請確認觀賽連結', async () => {
    const fetchView = jest.fn(() => Promise.resolve({ tournament: null }));
    const ctl = initOverlay({ search: '?t=wrong', root, fetchView });
    await ctl.ready;
    expect(root.textContent).toBe('找不到比賽，請確認觀賽連結');
    ctl.stop();
  });

  // review Important 1：透明頁在設定時一片空白，分不出「還在讀」「讀不到」「連結不對」
  test('第一次還沒讀到：顯示讀取比分中…', () => {
    const fetchView = jest.fn(() => new Promise(() => {}));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    expect(root.textContent).toBe('讀取比分中…');
    ctl.stop();
  });

  test('第一次就讀取失敗：停在讀取比分中…，原因記到主控台', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchView = jest.fn(() => Promise.reject(new Error('連線失敗（500）')));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    expect(root.textContent).toBe('讀取比分中…');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    ctl.stop();
  });

  test('RPC 回 null（通行碼錯）：顯示找不到比賽', async () => {
    const fetchView = jest.fn(() => Promise.resolve(null));
    const ctl = initOverlay({ search: '?t=wrong', root, fetchView });
    await ctl.ready;
    expect(root.textContent).toBe('找不到比賽，請確認觀賽連結');
    ctl.stop();
  });

  test('第一次就是非比點賽事：提示這場沒有點數比分', async () => {
    const v = friendlyView();
    v.matches.forEach((m) => { m.pointNo = null; });
    const fetchView = jest.fn(() => Promise.resolve(v));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    expect(root.textContent).toBe('這場比賽沒有點數比分，請確認觀賽連結');
    ctl.stop();
  });

  test('顯示過比分後拿到算不出比分的資料：保留上一次畫面', async () => {
    const fetchView = jest.fn(() => Promise.resolve(friendlyView()));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    const before = root.innerHTML;
    const v = friendlyView();
    v.teams = v.teams.slice(0, 1);
    fetchView.mockImplementationOnce(() => Promise.resolve(v));
    await ctl.refresh();
    expect(root.innerHTML).toBe(before);
    ctl.stop();
  });

  test('stop() 之後不再讀', async () => {
    const fetchView = jest.fn(() => Promise.resolve(friendlyView()));
    const ctl = initOverlay({ search: '?t=tok', root, fetchView });
    await ctl.ready;
    ctl.stop();
    jest.advanceTimersByTime(OVERLAY_POLL_MS * 3);
    expect(fetchView).toHaveBeenCalledTimes(1);
  });
});

describe('冠軍時刻的標籤與第二行（2026-11-25 友誼賽）', () => {
  // 第 1～upTo 輪全部確認，winnerOf(match) 決定每場勝方
  const confirmRounds = (v, upTo, winnerOf = () => 'M') => {
    v.matches.filter((m) => m.roundNo <= upTo).forEach((m) => win(v, m.id, winnerOf(m)));
    return v;
  };
  const BLUE_EDGE = /#187fc4|rgb\(24, 127, 196\)/;

  test('最後一輪之前全部確認：標籤「冠軍時刻」、第二行是最後一輪的場次', () => {
    const lines = overlayLines(confirmRounds(friendlyView(), 5));
    expect(lines.tag).toBe('冠軍時刻');
    expect(lines.detail).toBe('最終戰　第四點 混雙B · 第五點 男雙B');
  });

  test('15 場全部確認：標籤「🏆 冠軍」、第二行沿用比賽結束', () => {
    const lines = overlayLines(confirmRounds(friendlyView(), 6, (m) => (m.pointNo <= 3 ? 'M' : 'H')));
    expect(lines.tag).toBe('🏆 冠軍');
    expect(lines.detail).toBe('比賽結束：貿聯 以 3：2 勝出');
  });

  test('還沒到最終戰：沒有標籤', () => {
    expect(overlayLines(confirmRounds(friendlyView(), 3)).tag).toBeNull();
  });

  test('兩隊但不是貿聯翰林：沒有標籤、第二行照舊（其他比賽不變）', () => {
    const v = confirmRounds(friendlyView(), 5);
    v.teams = [{ id: 'M', name: 'A隊', players: [] }, { id: 'H', name: 'B隊', players: [] }];
    const lines = overlayLines(v);
    expect(lines.tag).toBeNull();
    expect(lines.detail).not.toContain('最終戰');
  });

  test('有標籤：比分前面多一個 .ov-tag；沒有標籤就不出現', () => {
    const root = document.createElement('div');
    renderOverlay(root, overlayLines(confirmRounds(friendlyView(), 5)));
    expect(root.querySelector('.ov-score .ov-tag').textContent).toBe('冠軍時刻');
    expect(root.querySelector('.ov-score').firstElementChild.className).toBe('ov-tag');
    renderOverlay(root, overlayLines(friendlyView()));
    expect(root.querySelector('.ov-tag')).toBeNull();
  });

  test('色點：貿聯藍、翰林白加藍色內框', () => {
    const root = document.createElement('div');
    renderOverlay(root, overlayLines(friendlyView()));
    const [m, h] = root.querySelectorAll('.ov-dot');
    expect(m.style.backgroundColor).toBe('rgb(0, 119, 203)');
    expect(m.style.boxShadow).toBe('');
    expect(h.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(h.style.boxShadow).toMatch(/inset/);
    expect(h.style.boxShadow).toMatch(BLUE_EDGE);
  });
});
