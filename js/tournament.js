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

// 隊伍代表色：依 view.teams 的固定順序配色（比照 F1 車隊色，供快速辨識）
const TEAM_COLORS = ['#e10600', '#00a19c', '#ff8000', '#9b5de5', '#f5c518'];

function teamColorById(view) {
  const map = {};
  view.teams.forEach((t, i) => { map[t.id] = TEAM_COLORS[i % TEAM_COLORS.length]; });
  return map;
}

function makeTeamDot(color) {
  const dot = document.createElement('span');
  dot.className = 'team-dot';
  dot.style.backgroundColor = color;
  return dot;
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
  const colors = teamColorById(view);
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (auth.mode === 'captain' && r.teamId === view.myTeamId) tr.className = 'my-team';
    const cells = [r.rank, r.name, r.wins, r.losses, r.pointsFor, r.played];
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 1) {
        td.className = 'team-name';
        td.appendChild(makeTeamDot(colors[r.teamId]));
        const label = document.createElement('span');
        label.textContent = value;
        td.appendChild(label);
      } else {
        td.textContent = value;
      }
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

  const colors = teamColorById(view);
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
      teams.appendChild(makeTeamDot(colors[match.teamAId]));
      const vsLabel = document.createElement('span');
      vsLabel.textContent = `${names[match.teamAId]} vs ${names[match.teamBId]}`;
      teams.appendChild(vsLabel);
      teams.appendChild(makeTeamDot(colors[match.teamBId]));
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

let reportingMatchId = null;
let submitting = false;

function openReportForm(match) {
  const names = teamNameById(currentView);
  const myTeamId = currentView.myTeamId;
  const iAmTeamA = match.teamAId === myTeamId;
  const oppTeamId = iAmTeamA ? match.teamBId : match.teamAId;

  reportingMatchId = match.id;
  document.getElementById('reportTitle').textContent = `第 ${match.roundNo} 輪　${match.event}`;
  document.getElementById('reportSubtitle').textContent =
    `${match.timeSlot}　場地${match.courtNo}`;
  document.getElementById('myTeamName').textContent = names[myTeamId];
  document.getElementById('oppTeamName').textContent = names[oppTeamId];

  // 已送過的話帶入自己上次回報（myReport 以 A/B 方向正規化存放，要轉回我方/對方）
  const report = (currentView.reports || {})[match.id];
  const selfInput = document.getElementById('scoreSelf');
  const oppInput = document.getElementById('scoreOpp');
  if (report && report.myReport) {
    selfInput.value = iAmTeamA ? report.myReport.scoreA : report.myReport.scoreB;
    oppInput.value = iAmTeamA ? report.myReport.scoreB : report.myReport.scoreA;
  } else {
    selfInput.value = '';
    oppInput.value = '';
  }

  document.getElementById('reportOverlay').hidden = false;
  document.getElementById('reportSubmit').disabled = false; // 避免殘留前一場的送出中狀態
  selfInput.focus();
}

function closeReportForm() {
  reportingMatchId = null;
  document.getElementById('reportOverlay').hidden = true;
}

async function submitReport() {
  if (submitting || !reportingMatchId) return;
  const check = validateScores(
    document.getElementById('scoreSelf').value,
    document.getElementById('scoreOpp').value
  );
  if (!check.ok) {
    showToast(check.error, 'warning');
    return;
  }
  const matchId = reportingMatchId; // 記住這次送出的是哪一場，回來後才不會誤關到別場的表單
  submitting = true;
  const submitBtn = document.getElementById('reportSubmit');
  submitBtn.disabled = true;
  try {
    const result = await reportScore(
      auth.token, matchId, check.scoreSelf, check.scoreOpp
    );
    if (reportingMatchId === matchId) {
      closeReportForm();
      if (result.status === 'confirmed') {
        showToast('雙方比分一致，成績已確認！', 'success');
      } else if (result.status === 'conflict') {
        showToast('比分不一致，請與對方隊長重新確認後再送一次', 'warning');
      } else {
        showToast('已送出，等待對方隊長確認', 'info');
      }
    }
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
    await refresh(); // 例如已被確認/比賽結束時，讓畫面同步最新狀態
  } finally {
    submitting = false;
    if (reportingMatchId === matchId) submitBtn.disabled = false;
  }
}

function bindReportForm() {
  document.getElementById('reportSubmit').addEventListener('click', submitReport);
  document.getElementById('reportCancel').addEventListener('click', () => {
    if (submitting) {
      showToast('送出中，請稍候', 'warning');
      return;
    }
    closeReportForm();
  });
  document.getElementById('reportOverlay').addEventListener('click', (e) => {
    if (submitting) return;
    if (e.target === document.getElementById('reportOverlay')) closeReportForm();
  });
}

// 輪詢的 callback：分頁隱藏時略過，避免背景分頁持續打請求（回前景時 visibilitychange 會補刷新）
function pollTick() {
  if (document.hidden) return;
  refresh();
}

function init() {
  auth = parseTokenFromUrl(location.search);
  if (!auth.mode) {
    showFatal('找不到比賽，請確認連結是否正確');
    return;
  }
  bindReportForm();
  refresh();
  pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

document.addEventListener('DOMContentLoaded', init);
