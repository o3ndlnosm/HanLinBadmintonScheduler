const { computeStandings } = require('../js/standings');

const TEAMS = [
  { id: 'A', name: '明明只是想領個參加獎' },
  { id: 'B', name: '羽出驚人死不休' },
  { id: 'C', name: '紅鯉魚與綠鯉魚與驢' },
  { id: 'D', name: '我的字典裡沒有輸' },
  { id: 'E', name: '羽你分享的快樂' },
];

const m = (a, sa, b, sb) => ({ teamAId: a, teamBId: b, status: 'confirmed', scoreA: sa, scoreB: sb });

// 2025 第二屆計分板逐場實況（同 v2 測資）
const LAST_YEAR = [
  m('A', 14, 'B', 21), m('C', 21, 'D', 9), m('D', 12, 'E', 21), m('A', 20, 'C', 22),
  m('B', 18, 'C', 21), m('D', 22, 'E', 20), m('A', 15, 'E', 21), m('B', 12, 'D', 21),
  m('A', 21, 'C', 5), m('B', 20, 'D', 22), m('C', 18, 'E', 21), m('A', 21, 'B', 11),
  m('A', 21, 'D', 16), m('B', 21, 'E', 10), m('C', 21, 'E', 10),
  m('A', 11, 'D', 21), m('B', 13, 'C', 21), m('B', 10, 'E', 21),
  m('A', 21, 'E', 8), m('C', 21, 'D', 11),
];

test('去年計分板快照：勝場/總得分/名次與試算表一致', () => {
  const rows = computeStandings(TEAMS, LAST_YEAR);
  expect(rows.map((r) => [r.teamId, r.wins, r.losses, r.pointsFor, r.played, r.rank])).toEqual([
    ['C', 6, 2, 150, 8, 1],
    ['A', 4, 4, 144, 8, 2],
    ['D', 4, 4, 134, 8, 3],
    ['E', 4, 4, 132, 8, 4],
    ['B', 2, 6, 126, 8, 5],
  ]);
});

test('pending 與 conflict 場次不計入排名', () => {
  const rows = computeStandings(TEAMS.slice(0, 2), [
    m('A', 21, 'B', 10),
    { teamAId: 'A', teamBId: 'B', status: 'pending', scoreA: null, scoreB: null },
    { teamAId: 'A', teamBId: 'B', status: 'conflict', scoreA: null, scoreB: null },
  ]);
  expect(rows[0]).toMatchObject({ teamId: 'A', wins: 1, pointsFor: 21, played: 1, rank: 1 });
  expect(rows[1]).toMatchObject({ teamId: 'B', wins: 0, pointsFor: 10, played: 1, rank: 2 });
});

test('勝場與總得分皆同 → 並列同名次，後續名次跳號', () => {
  const teams = [
    { id: 'A', name: 'a' }, { id: 'B', name: 'b' }, { id: 'C', name: 'c' }, { id: 'D', name: 'd' },
  ];
  const rows = computeStandings(teams, [m('A', 21, 'C', 10), m('B', 21, 'D', 10)]);
  expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 3]);
});

test('沒有任何完賽場次：全員 0，並列第 1', () => {
  const rows = computeStandings(TEAMS, []);
  expect(rows).toHaveLength(5);
  rows.forEach((r) => expect(r).toMatchObject({ wins: 0, losses: 0, pointsFor: 0, played: 0, rank: 1 }));
});

test('平手比分視為無效資料，略過不計', () => {
  const teams = [{ id: 'A', name: 'a' }, { id: 'B', name: 'b' }];
  const rows = computeStandings(teams, [
    { teamAId: 'A', teamBId: 'B', status: 'confirmed', scoreA: 21, scoreB: 21 },
  ]);
  rows.forEach((r) => expect(r).toMatchObject({ wins: 0, losses: 0, pointsFor: 0, played: 0 }));
});
