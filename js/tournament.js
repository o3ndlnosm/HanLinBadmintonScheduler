/**
 * 比賽頁邏輯：初始化、輪詢、渲染
 * 相依（由 tournament.html 的 <script> 順序保證）：
 *   dialog.js → showToast
 *   standings.js → computeStandings
 *   tournament-form.js → parseTokenFromUrl / matchState / validateScores
 *   tournament-api.js → fetchPublicView / fetchCaptainView / reportScore
 */
const POLL_INTERVAL_MS = 10000;

let auth = { mode: null, token: null };
let currentView = null;
let pollTimer = null;

function teamNameById(view) {
  const map = {};
  view.teams.forEach((t) => { map[t.id] = t.name; });
  return map;
}

// 比賽 finished 後鎖定輸入：captainCtx 視為 null（後端也會擋）
function captainCtxOf(view) {
  if (auth.mode !== 'captain') return null;
  if (view.tournament.status === 'finished') return null;
  return { myTeamId: view.myTeamId, reports: view.reports || {} };
}

function showFatal(message) {
  if (pollTimer) clearInterval(pollTimer);
  document.getElementById('standingsSection').hidden = true;
  document.getElementById('scheduleSection').hidden = true;
  const box = document.getElementById('errorBox');
  box.textContent = message;
  box.hidden = false;
}

function setOffline(message) {
  const box = document.getElementById('offlineBox');
  if (message) {
    box.textContent = `連線異常（${message}），稍後會自動重試`;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function renderHeader(view) {
  document.getElementById('tournamentName').textContent = view.tournament.name;
  document.getElementById('finishedBadge').hidden = view.tournament.status !== 'finished';
}

function renderStandings(view) {
  const rows = computeStandings(view.teams, view.matches);
  const allDone = view.matches.length > 0 && view.matches.every((m) => m.status === 'confirmed');
  const box = document.getElementById('standings');
  box.textContent = '';

  if (allDone) {
    const champs = rows.filter((r) => r.rank === 1).map((r) => r.name).join('、');
    const runners = rows.filter((r) => r.rank === 2).map((r) => r.name).join('、');
    const banner = document.createElement('div');
    banner.className = 'champion-banner';
    banner.textContent = runners
      ? `🏆 冠軍：${champs}　🥈 亞軍：${runners}`
      : `🏆 冠軍：${champs}`;
    box.appendChild(banner);
  }

  const table = document.createElement('table');
  table.className = 'standings-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  ['名次', '隊伍', '勝', '敗', '總得分', '完賽'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (auth.mode === 'captain' && r.teamId === view.myTeamId) tr.className = 'my-team';
    const cells = [r.rank, r.name, r.wins, r.losses, r.pointsFor, r.played];
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 1) td.className = 'team-name';
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  box.appendChild(table);
  document.getElementById('standingsSection').hidden = false;
}

function renderSchedule(view) {
  const ctx = captainCtxOf(view);
  const names = teamNameById(view);
  const box = document.getElementById('schedule');
  box.textContent = '';

  const byRound = new Map();
  view.matches.forEach((m) => {
    if (!byRound.has(m.roundNo)) byRound.set(m.roundNo, []);
    byRound.get(m.roundNo).push(m);
  });

  [...byRound.keys()].sort((a, b) => a - b).forEach((roundNo) => {
    const matches = byRound.get(roundNo);
    const card = document.createElement('div');
    card.className = 'round-card';
    const title = document.createElement('div');
    title.className = 'round-title';
    title.textContent = `第 ${roundNo} 輪　${matches[0].timeSlot}`;
    card.appendChild(title);

    matches.forEach((match) => {
      const state = matchState(match, ctx);
      const isMine =
        !!ctx && (match.teamAId === ctx.myTeamId || match.teamBId === ctx.myTeamId);

      const row = document.createElement('div');
      row.className = 'match-row';
      if (isMine) row.classList.add('match-mine');
      if (state.canReport) row.classList.add('can-report');

      const chip = document.createElement('span');
      chip.className = `event-chip ${match.event}`;
      chip.textContent = `場地${match.courtNo}　${match.event}`;
      row.appendChild(chip);

      const teams = document.createElement('span');
      teams.className = 'match-teams';
      teams.textContent = `${names[match.teamAId]} vs ${names[match.teamBId]}`;
      row.appendChild(teams);

      const result = document.createElement('span');
      result.className = 'match-result';
      if (match.status === 'confirmed') {
        const score = document.createElement('span');
        score.className = 'match-score';
        score.textContent = `${match.scoreA}：${match.scoreB}`;
        result.appendChild(score);
      }
      const label = document.createElement('span');
      label.className = `state-label ${state.cssClass}`;
      label.textContent = state.label;
      result.appendChild(label);
      row.appendChild(result);

      if (state.canReport) {
        row.addEventListener('click', () => openReportForm(match));
      }
      card.appendChild(row);
    });
    box.appendChild(card);
  });
  document.getElementById('scheduleSection').hidden = false;
}

function renderAll(view) {
  renderHeader(view);
  renderStandings(view);
  renderSchedule(view);
}

async function refresh() {
  let view;
  try {
    view = auth.mode === 'captain'
      ? await fetchCaptainView(auth.token)
      : await fetchPublicView(auth.token);
  } catch (err) {
    setOffline(err.message);
    return;
  }
  if (!view || !view.tournament) {
    showFatal('找不到比賽，請確認連結是否正確');
    return;
  }
  setOffline(null);
  currentView = view;
  renderAll(view);
}

// Task 5 實作；先放空殼避免 ReferenceError
function openReportForm(match) {}

function init() {
  auth = parseTokenFromUrl(location.search);
  if (!auth.mode) {
    showFatal('找不到比賽，請確認連結是否正確');
    return;
  }
  refresh();
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

document.addEventListener('DOMContentLoaded', init);
