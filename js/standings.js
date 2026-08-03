/**
 * 比賽排名純函式模組（移植自 v2 badminton-scheduler src/tournament/standings.js）
 * 只計 confirmed 場次。
 * 規則：勝場數 desc → 總得分 desc；兩者皆同 → 並列同名次（1,2,2,4）。
 */
function computeStandings(teams, matches) {
  const rows = new Map(
    teams.map((t) => [
      t.id,
      { teamId: t.id, name: t.name, wins: 0, losses: 0, pointsFor: 0, played: 0, rank: 0 },
    ])
  );
  matches.forEach((match) => {
    if (match.status !== 'confirmed') return;
    const a = rows.get(match.teamAId);
    const b = rows.get(match.teamBId);
    if (!a || !b) return;
    if (match.scoreA === match.scoreB) return; // 平手為無效資料（上游已擋，防禦性略過）
    a.played += 1;
    b.played += 1;
    a.pointsFor += match.scoreA;
    b.pointsFor += match.scoreB;
    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  });
  const sorted = [...rows.values()].sort(
    (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor
  );
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    row.rank =
      prev && prev.wins === row.wins && prev.pointsFor === row.pointsFor ? prev.rank : i + 1;
  });
  return sorted;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStandings };
}
