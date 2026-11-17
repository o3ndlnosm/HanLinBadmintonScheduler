/**
 * 公司應援條（2026-11-25 貿聯×翰林友誼賽起）
 * 純炒氣氛、不影響任何結果。設計見 docs/superpowers/specs/2026-11-16-friendly-match-design.md
 *
 * - 點擊先在本機累積並立即反映在畫面上；每 2 秒送一次；每 2 秒窗口每隊最多算 10 下，超過捨棄
 * - 總數每 3 秒輪詢（分頁在背景時暫停）
 * - 應援請求失敗一律靜默略過、不重送，絕不影響比分功能
 *
 * 相依（瀏覽器，由 tournament.html 的 <script> 順序保證）：tournament-api.js → sendCheer / fetchCheerTotals
 */
const CHEER_MAX_PER_WINDOW = 10;
const CHEER_FLUSH_MS = 2000;
const CHEER_POLL_MS = 3000;

function addTap(windowCount, max = CHEER_MAX_PER_WINDOW) {
  if (windowCount >= max) return { windowCount: max, counted: false };
  return { windowCount: windowCount + 1, counted: true };
}

// A 方占比（0–100）；兩邊皆 0 時各半
function cheerRatio(totals, teamAId, teamBId) {
  const a = (totals && totals[teamAId]) || 0;
  const b = (totals && totals[teamBId]) || 0;
  if (a + b === 0) return 50;
  return (a / (a + b)) * 100;
}

function displayTotals(serverTotals, pendingByTeam) {
  const out = { ...(serverTotals || {}) };
  Object.entries(pendingByTeam || {}).forEach(([teamId, n]) => {
    out[teamId] = (out[teamId] || 0) + n;
  });
  return out;
}

function createCheerController({ token, teamIds, send, fetchTotals, onChange }) {
  let server = Object.fromEntries(teamIds.map((id) => [id, 0]));
  const pending = Object.fromEntries(teamIds.map((id) => [id, 0]));   // 本機累積、尚未送出
  const inflight = Object.fromEntries(teamIds.map((id) => [id, 0]));  // 已送出、還沒回來
  const windowCount = Object.fromEntries(teamIds.map((id) => [id, 0]));

  // 顯示 = 伺服器數 + 送出中 + 本機累積：送出途中再按，數字不會先掉回去
  const emit = () => onChange(displayTotals(displayTotals(server, inflight), pending));
  // 總數只會增加：逐隊取大值，較舊的回應（例如送出前發出、較晚回來的輪詢）不會讓畫面下降。
  // 代價：用 SQL 歸零後，開著的頁面要重新整理才會看到歸零。
  const accept = (totals) => {
    if (!totals || typeof totals !== 'object') return;
    Object.entries(totals).forEach(([id, n]) => {
      if (typeof n === 'number') server[id] = Math.max(server[id] || 0, n);
    });
  };

  function tap(teamId) {
    if (!(teamId in pending)) return false;
    const r = addTap(windowCount[teamId]);
    windowCount[teamId] = r.windowCount;
    if (r.counted) pending[teamId] += 1;
    emit();
    return r.counted;
  }

  // 送出前先把本機累積移到「送出中」（失敗也不重送），並重開下一個 2 秒窗口
  async function flush() {
    const batch = teamIds.filter((id) => pending[id] > 0).map((id) => [id, pending[id]]);
    teamIds.forEach((id) => { windowCount[id] = 0; });
    batch.forEach(([id, n]) => { pending[id] = 0; inflight[id] += n; });
    for (const [teamId, n] of batch) {
      try {
        accept(await send(token, teamId, n));
      } catch (e) {
        // 應援失敗靜默略過
      } finally {
        inflight[teamId] -= n;
      }
    }
    if (batch.length) emit();
  }

  async function poll() {
    try {
      accept(await fetchTotals(token));
      emit();
    } catch (e) {
      // 應援失敗靜默略過
    }
  }

  return { tap, flush, poll };
}

// ---- 瀏覽器掛載（渲染層，靠瀏覽器驗證） ----
let cheerMounted = false;

// teams：[{ id, name, color }]，取前兩隊（左 A、右 B）
function mountCheerBar(container, teams, token) {
  if (cheerMounted || !container || teams.length < 2) return;
  cheerMounted = true;
  const [ta, tb] = teams;

  container.textContent = '';
  const counts = document.createElement('div');
  counts.className = 'cheer-counts';
  const countA = document.createElement('span');
  const countB = document.createElement('span');
  counts.append(countA, countB);

  const bar = document.createElement('div');
  bar.className = 'cheer-bar';
  const fillA = document.createElement('div');
  fillA.className = 'cheer-fill';
  fillA.style.backgroundColor = ta.color;
  bar.style.backgroundColor = tb.color;
  bar.appendChild(fillA);

  const buttons = document.createElement('div');
  buttons.className = 'cheer-buttons';
  const makeBtn = (team) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cheer-btn';
    btn.style.borderColor = team.color;
    btn.textContent = `為${team.name}加油`;
    return btn;
  };
  const btnA = makeBtn(ta);
  const btnB = makeBtn(tb);
  buttons.append(btnA, btnB);
  container.append(counts, bar, buttons);
  container.hidden = false;

  const render = (totals) => {
    const a = totals[ta.id] || 0;
    const b = totals[tb.id] || 0;
    countA.textContent = `${ta.name} ${a.toLocaleString()}`;
    countB.textContent = `${b.toLocaleString()} ${tb.name}`;
    fillA.style.width = `${cheerRatio(totals, ta.id, tb.id)}%`;
  };
  render({});

  const ctrl = createCheerController({
    token, teamIds: [ta.id, tb.id], send: sendCheer, fetchTotals: fetchCheerTotals, onChange: render,
  });

  const bump = (btn) => {
    btn.classList.remove('bump');
    void btn.offsetWidth; // 重新觸發動畫
    btn.classList.add('bump');
  };
  btnA.addEventListener('click', () => { ctrl.tap(ta.id); bump(btnA); });
  btnB.addEventListener('click', () => { ctrl.tap(tb.id); bump(btnB); });

  setInterval(() => ctrl.flush(), CHEER_FLUSH_MS);
  setInterval(() => { if (document.visibilityState === 'visible') ctrl.poll(); }, CHEER_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ctrl.flush();
    else ctrl.poll();
  });
  ctrl.poll();
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHEER_MAX_PER_WINDOW, CHEER_FLUSH_MS, CHEER_POLL_MS,
    addTap, cheerRatio, displayTotals, createCheerController,
  };
}
