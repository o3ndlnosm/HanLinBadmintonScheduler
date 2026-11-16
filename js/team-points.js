/**
 * 比點賽制純函式模組（2026-11-25 貿聯×翰林友誼賽起）
 * 每場比賽帶 pointNo（第幾點）；每點三戰兩勝、整體五點三勝。
 * 過半數一律由資料推導（場數、點數），不寫死 2 與 3。
 * 只計 confirmed 場次；一點已有一方過半勝場後，後續場次的結果只顯示、不改變歸屬
 * （每點場數為奇數時，過半者唯一，自然成立）。
 */
function hasPoints(matches) {
  return matches.some((m) => typeof m.pointNo === 'number');
}

function majorityOf(n) {
  return Math.floor(n / 2) + 1;
}

function computeTeamPoints(teams, matches) {
  const teamIds = teams.map((t) => t.id);
  const zeroByTeam = () => Object.fromEntries(teamIds.map((id) => [id, 0]));

  const byPoint = new Map();
  matches.forEach((m) => {
    if (typeof m.pointNo !== 'number') return;
    if (!byPoint.has(m.pointNo)) byPoint.set(m.pointNo, []);
    byPoint.get(m.pointNo).push(m);
  });

  const points = [...byPoint.keys()].sort((a, b) => a - b).map((pointNo) => {
    const games = byPoint.get(pointNo);
    const wins = zeroByTeam();
    let played = 0;
    games.forEach((m) => {
      if (m.status !== 'confirmed' || m.scoreA === m.scoreB) return;
      const winner = m.scoreA > m.scoreB ? m.teamAId : m.teamBId;
      if (!(winner in wins)) return;
      wins[winner] += 1;
      played += 1;
    });
    const need = majorityOf(games.length);
    const winnerId = teamIds.find((id) => wins[id] >= need) || null;
    return {
      pointNo, event: games[0].event, eventTag: games[0].eventTag || '',
      wins, played, total: games.length, winnerId,
    };
  });

  const totals = zeroByTeam();
  points.forEach((p) => { if (p.winnerId) totals[p.winnerId] += 1; });
  const needPoints = majorityOf(points.length);
  const winnerId = points.length ? teamIds.find((id) => totals[id] >= needPoints) || null : null;
  const pointMatches = matches.filter((m) => typeof m.pointNo === 'number');
  const allConfirmed = pointMatches.length > 0 && pointMatches.every((m) => m.status === 'confirmed');

  return { points, totals, winnerId, allConfirmed };
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hasPoints, computeTeamPoints };
}
