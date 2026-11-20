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

const POINT_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// 1 → '第一點'（point_no 的 DB check 為 1–9）
function pointLabel(pointNo) {
  return `第${POINT_NUMERALS[pointNo - 1] || pointNo}點`;
}

// { event:'男雙', eventTag:'A' } → '男雙A'
function eventLabel(match) {
  return `${match.event}${match.eventTag || ''}`;
}

// 隊伍代表色：依 view.teams 的固定順序配色（比照 F1 車隊色，供快速辨識）。
// 計分頁（tournament.js）與直播疊加頁（overlay.js）共用，顏色只在這裡改。
const TEAM_COLORS = ['#e10600', '#00a19c', '#ff8000', '#9b5de5', '#f5c518'];

// 友誼賽代表色（2026-11-25 起；spec：docs/superpowers/specs/2026-11-20-champion-moment-design.md）。
// 兩家代表色幾乎同色，用「主客場」區分：貿聯實心藍、翰林白底藍邊。fill 底色、edge 邊框、ink 放在 fill 上的字色。
// 翰林藍 #187fc4 放白底當小字對比只有約 4.3：1，字改用加深的 #14649c（≥ 4.5）；色塊與邊框仍用 #187fc4。
const BRAND_STYLES = {
  貿聯: { fill: '#0077cb', edge: '#0077cb', ink: '#ffffff' },
  翰林: { fill: '#ffffff', edge: '#187fc4', ink: '#14649c' },
};

// 代表色與冠軍時刻只在「恰好兩隊、左貿聯右翰林」時啟用：團體圖朝向固定（貿聯朝右放左邊），
// 正式資料就是這個順序；其他比賽（第三屆 5 隊）一律不受影響。
function isFriendlyPair(view) {
  const teams = view && view.teams;
  return Array.isArray(teams) && teams.length === 2
    && !!teams[0] && teams[0].name === '貿聯'
    && !!teams[1] && teams[1].name === '翰林';
}

function teamStyleById(view) {
  const brand = isFriendlyPair(view);
  const map = {};
  view.teams.forEach((t, i) => {
    if (brand) {
      map[t.id] = { ...BRAND_STYLES[t.name] };
      return;
    }
    const fill = TEAM_COLORS[i % TEAM_COLORS.length];
    map[t.id] = { fill, edge: fill, ink: '#ffffff' };
  });
  return map;
}

// 各隊底色（色點、應援條、火花用）；與 teamStyleById 同源
function teamColorById(view) {
  const styles = teamStyleById(view);
  return Object.fromEntries(Object.entries(styles).map(([id, s]) => [id, s.fill]));
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasPoints, computeTeamPoints, pointLabel, eventLabel,
    TEAM_COLORS, BRAND_STYLES, isFriendlyPair, teamStyleById, teamColorById,
  };
}
