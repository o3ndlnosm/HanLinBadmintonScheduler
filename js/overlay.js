/**
 * 直播畫面疊加比分（2026-11-25 友誼賽起）：overlay.html?t=<觀賽通行碼>，給 PRISM 網頁小工具疊在直播畫面左下角。
 * spec：docs/superpowers/specs/2026-11-18-live-overlay-design.md
 * 相依（由 overlay.html 的 <script> 順序保證）：
 *   tournament-form.js → parseTokenFromUrl
 *   tournament-api.js → fetchPublicView
 *   team-points.js → hasPoints / computeTeamPoints / pointLabel / eventLabel / teamColorById
 * 反目標：
 * - 直播畫面上不能出現錯誤訊息：成功顯示過一次之後，讀取失敗或找不到比賽都保留上一次的畫面。
 * - 不接受輸分通行碼：只認 ?t=，有輸分權限的連結不該被貼進第三方 App。
 */
const OVERLAY_POLL_MS = 10000;
const OVERLAY_BAD_LINK = '請改用觀賽連結';
const OVERLAY_NOT_FOUND = '找不到比賽，請確認觀賽連結';

// 已確認的場次中輪次最大、同輪取場地號碼最大的那場（payload 沒有確認時間；輪次照時間排）
function latestConfirmedMatch(matches) {
  let best = null;
  (matches || []).forEach((m) => {
    if (m.status !== 'confirmed') return;
    if (!best || m.roundNo > best.roundNo || (m.roundNo === best.roundNo && m.courtNo > best.courtNo)) best = m;
  });
  return best;
}

// 比分條兩行的內容；非比點賽事或不足兩隊回 null（不畫）
function overlayLines(view) {
  if (!view || !Array.isArray(view.teams) || view.teams.length < 2) return null;
  if (!Array.isArray(view.matches) || !hasPoints(view.matches)) return null;
  const [ta, tb] = view.teams;
  const colors = teamColorById(view);
  const result = computeTeamPoints(view.teams, view.matches);
  const side = (t) => ({ name: t.name, color: colors[t.id], points: result.totals[t.id] || 0 });

  let detail;
  if (result.winnerId) {
    // 文字同觀賽頁點數比分板的橫幅
    const winner = result.winnerId === ta.id ? ta : tb;
    const loser = winner === ta ? tb : ta;
    const won = result.totals[winner.id];
    detail = result.allConfirmed
      ? `比賽結束：${winner.name} 以 ${won}：${result.totals[loser.id]} 勝出`
      : `${winner.name} 拿下 ${won} 點，確定勝出`;
  } else {
    const m = latestConfirmedMatch(view.matches);
    if (!m) {
      detail = '尚未開打';
    } else {
      // 照比分條的左右順序排，不照場次的 A/B 隊
      const leftScore = m.teamAId === ta.id ? m.scoreA : m.scoreB;
      const rightScore = m.teamAId === ta.id ? m.scoreB : m.scoreA;
      const winnerName = leftScore > rightScore ? ta.name : tb.name;
      detail = `最新：${pointLabel(m.pointNo)} ${eventLabel(m)} ${leftScore}:${rightScore} ${winnerName}勝`;
    }
  }
  return { left: side(ta), right: side(tb), detail };
}

function renderOverlay(root, lines, message) {
  root.textContent = '';
  if (!lines && !message) return;
  const bar = document.createElement('div');
  bar.className = 'ov-bar';
  if (!lines) {
    bar.classList.add('ov-message');
    bar.textContent = message;
    root.appendChild(bar);
    return;
  }
  const dot = (color) => {
    const el = document.createElement('span');
    el.className = 'ov-dot';
    el.style.backgroundColor = color;
    return el;
  };
  const name = (text) => {
    const el = document.createElement('span');
    el.className = 'ov-name';
    el.textContent = text;
    return el;
  };
  const score = document.createElement('div');
  score.className = 'ov-score';
  const nums = document.createElement('span');
  nums.className = 'ov-nums';
  nums.textContent = `${lines.left.points} : ${lines.right.points}`;
  score.append(dot(lines.left.color), name(lines.left.name), nums, name(lines.right.name), dot(lines.right.color));

  const detail = document.createElement('div');
  detail.className = 'ov-detail';
  detail.textContent = lines.detail;

  bar.append(score, detail);
  root.appendChild(bar);
}

function initOverlay({ search, root, fetchView, intervalMs = OVERLAY_POLL_MS }) {
  const auth = parseTokenFromUrl(search || '');
  if (auth.mode !== 'public') {
    renderOverlay(root, null, OVERLAY_BAD_LINK);
    return { refresh: async () => {}, stop: () => {}, ready: Promise.resolve() };
  }

  let shown = false;
  async function refresh() {
    try {
      const view = await fetchView(auth.token);
      if (!view || !view.tournament) {
        // 只在設定時（還沒成功顯示過）提示連結有誤；直播中不出現
        if (!shown) renderOverlay(root, null, OVERLAY_NOT_FOUND);
        return;
      }
      renderOverlay(root, overlayLines(view));
      shown = true;
    } catch (e) {
      // 讀取失敗：保留上一次的畫面，不顯示錯誤
    }
  }

  const timer = setInterval(refresh, intervalMs);
  const ready = refresh();
  return { refresh, stop: () => clearInterval(timer), ready };
}

// 瀏覽器載入時啟動；Node（jest）以 require 載入時不啟動，由測試注入 fetchView
if (typeof module === 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initOverlay({ search: location.search, root: document.getElementById('overlay'), fetchView: fetchPublicView });
  });
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OVERLAY_POLL_MS, OVERLAY_BAD_LINK, OVERLAY_NOT_FOUND,
    latestConfirmedMatch, overlayLines, renderOverlay, initOverlay,
  };
}
