const { hasPoints, computeTeamPoints, pointLabel, eventLabel, TEAM_COLORS, teamColorById } = require('../js/team-points');

// 2026-11-25 貿聯×翰林友誼賽：M=貿聯（team A）、H=翰林（team B）
const TEAMS = [{ id: 'M', name: '貿聯' }, { id: 'H', name: '翰林' }];

// [輪, 場地, 賽點, A/B, 第幾點]（試算表「貿聯友誼賽」分頁）
const SCHEDULE = [
  [1, 1, '男雙', 'A', 1], [1, 2, '混雙', 'A', 2], [1, 3, '女雙', '', 3],
  [2, 1, '混雙', 'B', 4], [2, 2, '男雙', 'B', 5], [2, 3, '男雙', 'A', 1],
  [3, 1, '混雙', 'A', 2], [3, 2, '女雙', '', 3], [3, 3, '混雙', 'B', 4],
  [4, 1, '男雙', 'B', 5], [4, 2, '男雙', 'A', 1],
  [5, 1, '混雙', 'A', 2], [5, 2, '女雙', '', 3],
  [6, 1, '混雙', 'B', 4], [6, 2, '男雙', 'B', 5],
];

const pendingMatches = () => SCHEDULE.map(([roundNo, courtNo, event, eventTag, pointNo]) => ({
  id: `r${roundNo}c${courtNo}`, roundNo, courtNo, event, eventTag, pointNo,
  teamAId: 'M', teamBId: 'H', status: 'pending', scoreA: null, scoreB: null,
}));

// 把指定場次設成 confirmed；winner 'M' 或 'H'
function confirm(matches, id, winner) {
  const m = matches.find((x) => x.id === id);
  m.status = 'confirmed';
  [m.scoreA, m.scoreB] = winner === 'M' ? [21, 15] : [15, 21];
}

// 第 n 點的三場（依輪次排序）
const POINT_MATCHES = {
  1: ['r1c1', 'r2c3', 'r4c2'],
  2: ['r1c2', 'r3c1', 'r5c1'],
  3: ['r1c3', 'r3c2', 'r5c2'],
  4: ['r2c1', 'r3c3', 'r6c1'],
  5: ['r2c2', 'r4c1', 'r6c2'],
};

describe('hasPoints', () => {
  test('友誼賽賽程（有 pointNo）→ true', () => {
    expect(hasPoints(pendingMatches())).toBe(true);
  });
  test('第三屆格式（無 pointNo）→ false', () => {
    expect(hasPoints([{ id: 'x', teamAId: 'A', teamBId: 'B', status: 'pending' }])).toBe(false);
    expect(hasPoints([{ id: 'x', pointNo: null }])).toBe(false);
    expect(hasPoints([])).toBe(false);
  });
});

describe('computeTeamPoints', () => {
  test('全部未賽：五點都進行中、雙方 0 點、尚無勝方', () => {
    const r = computeTeamPoints(TEAMS, pendingMatches());
    expect(r.points.map((p) => p.pointNo)).toEqual([1, 2, 3, 4, 5]);
    expect(r.points[0]).toEqual({
      pointNo: 1, event: '男雙', eventTag: 'A', wins: { M: 0, H: 0 }, played: 0, total: 3, winnerId: null,
    });
    expect(r.points.every((p) => p.winnerId === null)).toBe(true);
    expect(r.totals).toEqual({ M: 0, H: 0 });
    expect(r.winnerId).toBeNull();
    expect(r.allConfirmed).toBe(false);
  });

  test('某點一方先贏兩場 → 拿下該點', () => {
    const ms = pendingMatches();
    confirm(ms, 'r1c1', 'H');
    confirm(ms, 'r2c3', 'H');
    const p1 = computeTeamPoints(TEAMS, ms).points[0];
    expect(p1.wins).toEqual({ M: 0, H: 2 });
    expect(p1.winnerId).toBe('H');
  });

  test('2:0 後第三場由對方贏 → 比數 1:2，點仍歸原方', () => {
    const ms = pendingMatches();
    confirm(ms, 'r1c1', 'H');
    confirm(ms, 'r2c3', 'H');
    confirm(ms, 'r4c2', 'M');
    const r = computeTeamPoints(TEAMS, ms);
    expect(r.points[0].wins).toEqual({ M: 1, H: 2 });
    expect(r.points[0].winnerId).toBe('H');
    expect(r.totals).toEqual({ M: 0, H: 1 });
  });

  test('2:0 後第三場比分不一致 → 比數不變、點仍歸原方（plan Review Focus 4）', () => {
    const ms = pendingMatches();
    confirm(ms, 'r1c1', 'H');
    confirm(ms, 'r2c3', 'H');
    ms.find((x) => x.id === 'r4c2').status = 'conflict';
    const p1 = computeTeamPoints(TEAMS, ms).points[0];
    expect(p1.wins).toEqual({ M: 0, H: 2 });
    expect(p1.winnerId).toBe('H');
  });

  test('pending 與 conflict 場次不計入：1 勝＋1 衝突＋1 未賽 → 進行中', () => {
    const ms = pendingMatches();
    confirm(ms, 'r1c1', 'H');
    ms.find((x) => x.id === 'r2c3').status = 'conflict';
    const p1 = computeTeamPoints(TEAMS, ms).points[0];
    expect(p1.wins).toEqual({ M: 0, H: 1 });
    expect(p1.played).toBe(1);
    expect(p1.winnerId).toBeNull();
  });

  test('一方先拿三點 → 確定勝出，其餘場次仍未完成', () => {
    const ms = pendingMatches();
    [1, 2, 3].forEach((n) => POINT_MATCHES[n].slice(0, 2).forEach((id) => confirm(ms, id, 'H')));
    const r = computeTeamPoints(TEAMS, ms);
    expect(r.totals).toEqual({ M: 0, H: 3 });
    expect(r.winnerId).toBe('H');
    expect(r.allConfirmed).toBe(false);
  });

  test('拿兩點時尚未確定勝出', () => {
    const ms = pendingMatches();
    [1, 2].forEach((n) => POINT_MATCHES[n].slice(0, 2).forEach((id) => confirm(ms, id, 'M')));
    const r = computeTeamPoints(TEAMS, ms);
    expect(r.totals).toEqual({ M: 2, H: 0 });
    expect(r.winnerId).toBeNull();
  });

  test('15 場全確認 → allConfirmed，3:2 由拿三點的一方勝出', () => {
    const ms = pendingMatches();
    const pointWinner = { 1: 'M', 2: 'H', 3: 'M', 4: 'H', 5: 'M' };
    Object.entries(POINT_MATCHES).forEach(([n, ids]) => {
      const w = pointWinner[n];
      const l = w === 'M' ? 'H' : 'M';
      confirm(ms, ids[0], w);
      confirm(ms, ids[1], l);
      confirm(ms, ids[2], w);
    });
    const r = computeTeamPoints(TEAMS, ms);
    expect(r.totals).toEqual({ M: 3, H: 2 });
    expect(r.winnerId).toBe('M');
    expect(r.allConfirmed).toBe(true);
  });

  test('沒有 pointNo 的場次被忽略', () => {
    const ms = pendingMatches();
    ms.push({ id: 'extra', roundNo: 7, courtNo: 1, event: '男雙', eventTag: '', pointNo: null,
      teamAId: 'M', teamBId: 'H', status: 'confirmed', scoreA: 21, scoreB: 0 });
    const r = computeTeamPoints(TEAMS, ms);
    expect(r.points).toHaveLength(5);
    expect(r.points.every((p) => p.total === 3)).toBe(true);
  });
});

describe('pointLabel / eventLabel', () => {
  test('點次用中文數字', () => {
    expect(pointLabel(1)).toBe('第一點');
    expect(pointLabel(5)).toBe('第五點');
    expect(pointLabel(9)).toBe('第九點');
  });
  test('賽點接上 A/B 組別，沒有組別時只顯示賽點', () => {
    expect(eventLabel({ event: '男雙', eventTag: 'A' })).toBe('男雙A');
    expect(eventLabel({ event: '女雙', eventTag: '' })).toBe('女雙');
    expect(eventLabel({ event: '混雙' })).toBe('混雙');
  });
});

describe('teamColorById（計分頁與直播疊加頁共用的隊伍色）', () => {
  test('依隊伍順序配色、超過五隊從頭輪', () => {
    const view = { teams: ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id })) };
    expect(teamColorById(view)).toEqual({
      A: '#e10600', B: '#00a19c', C: '#ff8000', D: '#9b5de5', E: '#f5c518', F: '#e10600',
    });
    expect(TEAM_COLORS).toHaveLength(5);
  });
});
