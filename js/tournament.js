/**
 * 比賽頁邏輯：初始化、輪詢、渲染
 * 相依（由 tournament.html 的 <script> 順序保證）：
 *   dialog.js → showToast
 *   standings.js → computeStandings
 *   team-points.js → hasPoints / computeTeamPoints / pointLabel / eventLabel / teamColorById
 *   tournament-form.js → parseTokenFromUrl / matchState / validateScores
 *   tournament-api.js → fetchPublicView / fetchCaptainView / reportScore
 *   cheer.js → mountCheerBar
 *   live.js → mountLiveBox
 */
const POLL_INTERVAL_MS = 10000;

let auth = { mode: null, token: null };
let currentView = null;
let pollTimer = null;

// 記錄已呈現過確認狀態的場次，讓新確認的場次只閃一次
const seenConfirmed = new Set();
let firstRenderDone = false;

function teamNameById(view) {
  const map = {};
  view.teams.forEach((t) => { map[t.id] = t.name; });
  return map;
}

function makeTeamDot(color) {
  const dot = document.createElement('span');
  dot.className = 'team-dot';
  dot.style.backgroundColor = color;
  return dot;
}

// 賽程列的一側：隊名一行、出賽選手一行。isRight 決定色點在隊名的哪一邊與對齊方向
function makeSide(teamId, players, names, colors, isRight) {
  const side = document.createElement('span');
  side.className = isRight ? 'match-side right' : 'match-side';

  const teamLine = document.createElement('span');
  teamLine.className = 'side-team';
  const nameEl = document.createElement('span');
  nameEl.textContent = names[teamId];
  if (isRight) {
    teamLine.appendChild(nameEl);
    teamLine.appendChild(makeTeamDot(colors[teamId]));
  } else {
    teamLine.appendChild(makeTeamDot(colors[teamId]));
    teamLine.appendChild(nameEl);
  }
  side.appendChild(teamLine);

  // 名單為空（未灌資料、或 RPC 尚未更新）就不加這一行，版面等同改版前
  const lineup = formatLineup(players);
  if (lineup) {
    const playersEl = document.createElement('span');
    playersEl.className = 'side-players';
    playersEl.textContent = lineup;
    side.appendChild(playersEl);
  }
  return side;
}

// 比賽 finished 後鎖定輸入：captainCtx 視為 null（後端也會擋）
function captainCtxOf(view) {
  if (auth.mode !== 'captain') return null;
  if (view.tournament.status === 'finished') return null;
  return { myTeamId: view.myTeamId, reports: view.reports || {} };
}

function showFatal(message) {
  if (pollTimer) clearInterval(pollTimer);
  document.getElementById('pointsSection').hidden = true;
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
  document.title = view.tournament.name;
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

// 比點賽制的計分板：大字點數、五點各自的場次比數與歸屬（2026-11-25 友誼賽起）
function renderPointBoard(view) {
  const result = computeTeamPoints(view.teams, view.matches);
  const names = teamNameById(view);
  const colors = teamColorById(view);
  const [ta, tb] = view.teams;
  const box = document.getElementById('pointBoard');
  box.textContent = '';

  if (result.winnerId) {
    const loserId = result.winnerId === ta.id ? tb.id : ta.id;
    const won = result.totals[result.winnerId];
    const banner = document.createElement('div');
    banner.className = 'champion-banner';
    banner.textContent = result.allConfirmed
      ? `🏆 比賽結束：${names[result.winnerId]} 以 ${won}：${result.totals[loserId]} 勝出`
      : `🏆 ${names[result.winnerId]} 拿下 ${won} 點，確定勝出`;
    box.appendChild(banner);
  }

  const score = document.createElement('div');
  score.className = 'point-score';
  const side = (team, isRight) => {
    const el = document.createElement('span');
    el.className = isRight ? 'point-team right' : 'point-team';
    const label = document.createElement('span');
    label.textContent = team.name;
    if (auth.mode === 'captain' && team.id === view.myTeamId) el.classList.add('my-team');
    if (isRight) el.append(label, makeTeamDot(colors[team.id]));
    else el.append(makeTeamDot(colors[team.id]), label);
    return el;
  };
  const nums = document.createElement('span');
  nums.className = 'point-nums';
  nums.textContent = `${result.totals[ta.id]} : ${result.totals[tb.id]}`;
  score.append(side(ta, false), nums, side(tb, true));
  box.appendChild(score);

  const list = document.createElement('div');
  list.className = 'point-rows';
  result.points.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'point-row';
    if (p.winnerId) row.classList.add('decided');

    const label = document.createElement('span');
    label.className = 'point-label';
    const no = document.createElement('span');
    no.className = 'point-no';
    no.textContent = pointLabel(p.pointNo);
    const chip = document.createElement('span');
    chip.className = `event-chip ${p.event}`;
    chip.textContent = eventLabel(p);
    label.append(no, chip);

    const games = document.createElement('span');
    games.className = 'point-games';
    games.textContent = `${p.wins[ta.id]} : ${p.wins[tb.id]}`;

    const status = document.createElement('span');
    status.className = 'point-status';
    if (p.winnerId) {
      status.appendChild(makeTeamDot(colors[p.winnerId]));
      status.append(`${names[p.winnerId]}拿下`);
    } else {
      status.textContent = p.played ? '進行中' : '未開打';
    }
    row.append(label, games, status);
    list.appendChild(row);
  });
  box.appendChild(list);
  document.getElementById('pointsSection').hidden = false;
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
      if (match.status === 'confirmed') {
        if (firstRenderDone && !seenConfirmed.has(match.id)) {
          row.classList.add('just-confirmed');
        }
        seenConfirmed.add(match.id);
      } else {
        // 非 confirmed（例如未來改判退回 pending）：清掉記錄，讓下次重新確認時能再閃一次
        seenConfirmed.delete(match.id);
      }

      // 上排：賽點 chip 靠左、比分與狀態靠右
      const head = document.createElement('span');
      head.className = 'match-head';

      const chip = document.createElement('span');
      chip.className = `event-chip ${match.event}`;
      chip.textContent = typeof match.pointNo === 'number'
        ? `場地${match.courtNo}　${pointLabel(match.pointNo)}　${eventLabel(match)}`
        : `場地${match.courtNo}　${match.event}`;
      head.appendChild(chip);

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
      head.appendChild(result);
      row.appendChild(head);

      // 下排：兩隊各佔一半，選手緊貼自己的隊名下方
      const body = document.createElement('span');
      body.className = 'match-body';
      body.appendChild(makeSide(match.teamAId, match.playersA, names, colors, false));
      const vs = document.createElement('span');
      vs.className = 'match-vs';
      vs.textContent = 'vs';
      body.appendChild(vs);
      body.appendChild(makeSide(match.teamBId, match.playersB, names, colors, true));
      row.appendChild(body);

      if (state.canReport) {
        row.addEventListener('click', () => openReportForm(match));
      }
      card.appendChild(row);
    });
    box.appendChild(card);
  });
  document.getElementById('scheduleSection').hidden = false;
  firstRenderDone = true;
}

function renderAll(view) {
  renderHeader(view);
  // 比點模式需要兩隊（左右對戰）；資料不完整時退回排名表，不讓點數板拋錯
  const pointMode = hasPoints(view.matches) && view.teams.length >= 2;
  if (pointMode) renderPointBoard(view);
  else renderStandings(view);
  // 賽程（隊長輸分入口）先畫，應援條之後才掛
  renderSchedule(view);
  // 直播框只在觀賽頁（輸分的人在現場，不需要看直播）。反目標：直播框出錯不得連帶讓比分功能壞掉，包在 try/catch 裡。
  // mountLiveBox 內部保證同一支影片不重掛，每 10 秒重畫不會中斷播放。
  if (auth.mode === 'public') {
    try {
      mountLiveBox(document.getElementById('liveSection'), view.tournament.liveUrl);
    } catch (e) {
      // 直播框失敗靜默略過
    }
  }
  // 反目標：應援出錯不得連帶讓比分功能壞掉，所以包在 try/catch 裡、放在最後。
  // 應援條只在比點模式出現；mountCheerBar 內部保證只掛一次。
  // 應援數比賽結束才公布（15 場全部確認，或比賽 finished）；先設公布狀態再掛，finished 後才打開的人第一眼就看到總數。
  // finished 後應援條唯讀（沒有按鈕，後端也會擋應援），仍顯示應援總數。
  if (pointMode) {
    try {
      const finished = view.tournament.status === 'finished';
      setCheerReveal(finished || computeTeamPoints(view.teams, view.matches).allConfirmed);
      const colors = teamColorById(view);
      mountCheerBar(
        document.getElementById('cheerSection'),
        view.teams.slice(0, 2).map((t) => ({ id: t.id, name: t.name, color: colors[t.id] })),
        auth.token,
        { readOnly: finished }
      );
      // 頁面開著時才變 finished：上面不會重掛，另外切成唯讀
      setCheerReadOnly(finished);
    } catch (e) {
      // 應援失敗靜默略過
    }
  }
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
  document.getElementById('reportTitle').textContent = typeof match.pointNo === 'number'
    ? `第 ${match.roundNo} 輪　${pointLabel(match.pointNo)}　${eventLabel(match)}`
    : `第 ${match.roundNo} 輪　${match.event}`;
  document.getElementById('reportSubtitle').textContent =
    `${match.timeSlot}　場地${match.courtNo}`;
  document.getElementById('myTeamName').textContent = names[myTeamId];
  document.getElementById('oppTeamName').textContent = names[oppTeamId];

  // 本場我方出賽選手，避免隊長報錯場次；名單為空時整行不顯示
  const myPlayers = iAmTeamA ? match.playersA : match.playersB;
  const lineupEl = document.getElementById('reportLineup');
  const lineupText = formatLineup(myPlayers);
  lineupEl.textContent = lineupText ? `本場我方：${lineupText}` : '';
  lineupEl.hidden = !lineupText;

  // 已送過的話帶入自己上次回報（myReport 以 A/B 方向正規化存放，要轉回我方/對方）
  const report = (currentView.reports || {})[match.id];
  const selfInput = document.getElementById('scoreSelf');
  const oppInput = document.getElementById('scoreOpp');
  const maxScore = maxScoreOf(currentView.tournament.scoreRule);
  selfInput.max = maxScore;
  oppInput.max = maxScore;
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
    document.getElementById('scoreOpp').value,
    currentView.tournament.scoreRule
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
