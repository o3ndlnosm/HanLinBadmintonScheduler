// 冠軍時刻的純函式（spec：docs/superpowers/specs/2026-11-20-champion-moment-design.md）
// 最後一輪以前全部確認 → 最終戰（final）；15 場全部確認或比賽 finished（且有勝方）→ 揭曉（done）。
Object.assign(global, require('../js/team-points'));
const {
  CM_INTRO_MS, CM_REVEAL_MS, CM_IMAGE_WAIT_MS, CM_IMG,
  finalPhase, championInfo, finalRoundLabel, playedKey, createPlayedStore,
} = require('../js/champion-moment');

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
    matches: SCHEDULE.map(([roundNo, courtNo, event, eventTag, pointNo]) => ({
      id: `r${roundNo}c${courtNo}`, roundNo, courtNo, timeSlot: '18:15-18:30', event, eventTag, pointNo,
      teamAId: 'M', teamBId: 'H', playersA: [], playersB: [], status: 'pending', scoreA: null, scoreB: null,
    })),
  };
}

// 第 1～round 輪設成 confirmed；winners[pointNo] 是該點每一場的勝方（預設貿聯）
function confirmUpTo(view, round, winners = {}) {
  view.matches.forEach((m) => {
    if (m.roundNo > round) return;
    const w = winners[m.pointNo] || 'M';
    m.status = 'confirmed';
    [m.scoreA, m.scoreB] = w === m.teamAId ? [21, 15] : [15, 21];
  });
  return view;
}
const MAOLIAN_3_2 = { 1: 'M', 2: 'M', 3: 'M', 4: 'H', 5: 'H' };
const HANLIN_3_2 = { 1: 'H', 2: 'H', 3: 'H', 4: 'M', 5: 'M' };

describe('finalPhase', () => {
  test('都還沒打、打到一半 → none', () => {
    expect(finalPhase(friendlyView())).toBe('none');
    expect(finalPhase(confirmUpTo(friendlyView(), 3))).toBe('none');
  });

  test('第 5 輪還有一場沒確認 → none', () => {
    const view = confirmUpTo(friendlyView(), 4);
    view.matches.find((m) => m.id === 'r5c1').status = 'confirmed';
    expect(finalPhase(view)).toBe('none');
  });

  test('第 1～5 輪全部確認 → final', () => {
    expect(finalPhase(confirmUpTo(friendlyView(), 5, MAOLIAN_3_2))).toBe('final');
  });

  test('第 6 輪確認了一場 → 仍是 final', () => {
    const view = confirmUpTo(friendlyView(), 5, MAOLIAN_3_2);
    Object.assign(view.matches.find((m) => m.id === 'r6c1'), { status: 'confirmed', scoreA: 15, scoreB: 21 });
    expect(finalPhase(view)).toBe('final');
  });

  test('15 場全部確認 → done', () => {
    expect(finalPhase(confirmUpTo(friendlyView(), 6, HANLIN_3_2))).toBe('done');
  });

  test('比賽 finished 且已有勝方 → done', () => {
    const view = confirmUpTo(friendlyView(), 3, MAOLIAN_3_2);
    view.tournament.status = 'finished';
    expect(finalPhase(view)).toBe('done');
  });

  test('比賽 finished 但點數沒分出勝負 → none', () => {
    const view = confirmUpTo(friendlyView(), 1);
    view.tournament.status = 'finished';
    expect(finalPhase(view)).toBe('none');
  });

  test('第 6 輪先確認、前面還有沒確認的 → none', () => {
    const view = confirmUpTo(friendlyView(), 4);
    view.matches.filter((m) => m.roundNo === 6).forEach((m) => Object.assign(m, { status: 'confirmed', scoreA: 21, scoreB: 15 }));
    expect(finalPhase(view)).toBe('none');
  });

  test('全部都是第 1 輪：沒有「最後一輪之前」，不進 final；全部確認才 done', () => {
    const view = friendlyView();
    view.matches.forEach((m) => { m.roundNo = 1; });
    confirmUpTo(view, 1, MAOLIAN_3_2);
    view.matches.slice(10).forEach((m) => { m.status = 'pending'; });
    expect(finalPhase(view)).toBe('none');
    confirmUpTo(view, 1, MAOLIAN_3_2);
    expect(finalPhase(view)).toBe('done');
  });

  test('不是左貿聯右翰林（順序相反、五隊）→ none', () => {
    const reversed = confirmUpTo(friendlyView([{ id: 'H', name: '翰林', players: [] }, { id: 'M', name: '貿聯', players: [] }]), 5);
    expect(finalPhase(reversed)).toBe('none');
    const five = confirmUpTo(friendlyView(['M', 'H', 'C', 'D', 'E'].map((id) => ({ id, name: `${id}隊`, players: [] }))), 5);
    expect(finalPhase(five)).toBe('none');
  });

  test('一般賽制（沒有 pointNo）、資料不完整 → none', () => {
    const view = confirmUpTo(friendlyView(), 6);
    view.matches.forEach((m) => { delete m.pointNo; });
    expect(finalPhase(view)).toBe('none');
    expect(finalPhase(null)).toBe('none');
    expect(finalPhase({ teams: friendlyView().teams })).toBe('none');
  });
});

describe('championInfo', () => {
  test('貿聯 3：2 → 左邊勝', () => {
    expect(championInfo(confirmUpTo(friendlyView(), 6, MAOLIAN_3_2))).toEqual({
      winnerId: 'M', winnerName: '貿聯', side: 'left', won: 3, lost: 2,
    });
  });

  test('翰林 3：2 → 右邊勝', () => {
    expect(championInfo(confirmUpTo(friendlyView(), 6, HANLIN_3_2))).toEqual({
      winnerId: 'H', winnerName: '翰林', side: 'right', won: 3, lost: 2,
    });
  });

  test('還沒分出勝負 → null', () => {
    expect(championInfo(confirmUpTo(friendlyView(), 1))).toBeNull();
  });
});

describe('finalRoundLabel', () => {
  test('最後一輪的場次依場地排：最終戰　第四點 混雙B · 第五點 男雙B', () => {
    expect(finalRoundLabel(friendlyView())).toBe('最終戰　第四點 混雙B · 第五點 男雙B');
  });

  test('場次順序打亂也一樣', () => {
    const view = friendlyView();
    view.matches.reverse();
    expect(finalRoundLabel(view)).toBe('最終戰　第四點 混雙B · 第五點 男雙B');
  });
});

describe('只播一次的記錄', () => {
  const fakeStorage = () => {
    const data = {};
    return { getItem: jest.fn((k) => (k in data ? data[k] : null)), setItem: jest.fn((k, v) => { data[k] = String(v); }) };
  };

  test('鍵用比賽名稱＋日期＋階段（不存通行碼）', () => {
    expect(playedKey(friendlyView(), 'final')).toBe('cm:貿聯×翰林2026羽球聯合友誼賽|2026-11-25:final');
    expect(playedKey(friendlyView(), 'done')).toBe('cm:貿聯×翰林2026羽球聯合友誼賽|2026-11-25:done');
  });

  test('先 false、mark 之後 true；同一個 storage 的另一個 store（重新整理後）也看得到', () => {
    const storage = fakeStorage();
    const store = createPlayedStore(storage);
    expect(store.has('k')).toBe(false);
    store.mark('k');
    expect(store.has('k')).toBe(true);
    expect(createPlayedStore(storage).has('k')).toBe(true);
  });

  test('storage 讀寫丟例外：退回記憶體，這次開著的頁面仍只播一次', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const store = createPlayedStore(broken);
    expect(store.has('k')).toBe(false);
    expect(() => store.mark('k')).not.toThrow();
    expect(store.has('k')).toBe(true);
  });

  test('沒有 storage：只記在記憶體', () => {
    const store = createPlayedStore(undefined);
    store.mark('k');
    expect(store.has('k')).toBe(true);
  });
});

test('時間與圖檔常數', () => {
  expect([CM_INTRO_MS, CM_REVEAL_MS, CM_IMAGE_WAIT_MS]).toEqual([4000, 8000, 2000]);
  expect(CM_IMG).toEqual({ left: 'img/champion/team-left.webp', right: 'img/champion/team-right.webp' });
});
