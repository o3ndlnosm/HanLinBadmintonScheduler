/**
 * 直播畫面疊加比分（2026-11-25 友誼賽起）：overlay.html?t=<觀賽通行碼>，給 PRISM 網頁小工具疊在直播畫面左邊
 * （2026-11-25 改成左邊直條：總點數＋15 場照開打順序一行一場；原本左下角的橫條拿掉）。
 * spec：docs/superpowers/specs/2026-11-18-live-overlay-design.md
 * 相依（由 overlay.html 的 <script> 順序保證）：
 *   tournament-form.js → parseTokenFromUrl
 *   tournament-api.js → fetchPublicView
 *   team-points.js → hasPoints / computeTeamPoints / pointLabel / eventLabel / teamStyleById
 *   champion-moment.js → finalPhase / finalRoundLabel / createPlayedStore / createOverlayChampion（2026-11-25 冠軍時刻）
 * 反目標：
 * - 直播畫面上不能出現錯誤訊息：成功顯示過一次之後，讀取失敗、找不到比賽、算不出比分都保留上一次的畫面。
 * - 不接受輸分通行碼：只認 ?t=，有輸分權限的連結不該被貼進第三方 App。
 */
const OVERLAY_POLL_MS = 10000;
const OVERLAY_BAD_LINK = '請改用觀賽連結';
const OVERLAY_NOT_FOUND = '找不到比賽，請確認觀賽連結';
const OVERLAY_LOADING = '讀取比分中…';
const OVERLAY_NO_POINTS = '這場比賽沒有點數比分，請確認觀賽連結';

// 已確認的場次中輪次最大、同輪取場地號碼最大的那場（payload 沒有確認時間；輪次照時間排）
function latestConfirmedMatch(matches) {
  let best = null;
  (matches || []).forEach((m) => {
    if (m.status !== 'confirmed') return;
    if (!best || m.roundNo > best.roundNo || (m.roundNo === best.roundNo && m.courtNo > best.courtNo)) best = m;
  });
  return best;
}

// 比分條兩行的內容；非比點賽事或不足兩隊回 null（不畫）。
// 冠軍時刻（只在左貿聯右翰林）：最終戰時加「冠軍時刻」標籤、第二行換成最後一輪的場次；揭曉後標籤「🏆 冠軍」。
function overlayLines(view) {
  if (!view || !Array.isArray(view.teams) || view.teams.length < 2) return null;
  if (!Array.isArray(view.matches) || !hasPoints(view.matches)) return null;
  const [ta, tb] = view.teams;
  const styles = teamStyleById(view);
  const result = computeTeamPoints(view.teams, view.matches);
  const side = (t) => ({ name: t.name, color: styles[t.id].fill, edge: styles[t.id].edge, points: result.totals[t.id] || 0 });
  // 冠軍時刻的檔案沒載入或出錯時當作一般畫面：比分條永遠要畫得出來
  let phase = 'none';
  try {
    phase = finalPhase(view);
  } catch (e) {
    phase = 'none';
  }
  const tag = { final: '冠軍時刻', done: '🏆 冠軍' }[phase] || null;

  let detail;
  if (phase === 'final') {
    detail = finalRoundLabel(view);
  } else if (result.winnerId) {
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
  return { left: side(ta), right: side(tb), detail, tag, games: overlayGames(view, ta) };
}

// 左邊直條（2026-11-25）：15 場照開打順序（輪次、場地）一行一場；分數照比分條左右（ta 在左）排，沒確認的場次 score 是 null
function overlayGames(view, ta) {
  const POINT_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return view.matches
    .filter((m) => typeof m.pointNo === 'number')
    .slice()
    .sort((x, y) => x.roundNo - y.roundNo || x.courtNo - y.courtNo)
    .map((m) => {
      const label = `${POINT_NUMERALS[m.pointNo - 1] || m.pointNo} ${eventLabel(m)}`;
      if (m.status !== 'confirmed' || typeof m.scoreA !== 'number' || typeof m.scoreB !== 'number') {
        return { label, score: null };
      }
      const left = m.teamAId === ta.id ? m.scoreA : m.scoreB;
      const right = m.teamAId === ta.id ? m.scoreB : m.scoreA;
      return { label, score: { left, right, winner: left > right ? 'left' : left < right ? 'right' : null } };
    });
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
  // 邊框色與底色不同（翰林白點）時加內框，點的大小不變
  const dot = (color, edge) => {
    const el = document.createElement('span');
    el.className = 'ov-dot';
    el.style.backgroundColor = color;
    if (edge && edge !== color) el.style.boxShadow = `inset 0 0 0 0.45vmin ${edge}`;
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
  if (lines.tag) {
    const tag = document.createElement('span');
    tag.className = 'ov-tag';
    tag.textContent = lines.tag;
    score.append(tag);
  }
  score.append(
    dot(lines.left.color, lines.left.edge), name(lines.left.name), nums,
    name(lines.right.name), dot(lines.right.color, lines.right.edge)
  );

  const detail = document.createElement('div');
  detail.className = 'ov-detail';
  detail.textContent = lines.detail;

  bar.append(score);
  if (Array.isArray(lines.games) && lines.games.length) bar.append(renderGameRows(lines.games));
  bar.append(detail);
  root.appendChild(bar);
}

// 一行一場：「一 男雙A」＋「21-15」，勝方分數加 ov-win、沒打的是「–」
function renderGameRows(games) {
  const list = document.createElement('div');
  list.className = 'ov-games';
  games.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'ov-game-row';
    const name = document.createElement('span');
    name.className = 'ov-game-name';
    name.textContent = g.label;
    const cell = document.createElement('span');
    cell.className = 'ov-game';
    if (!g.score) {
      cell.textContent = '–';
    } else {
      const num = (value, won) => {
        const el = document.createElement('span');
        el.textContent = String(value);
        if (won) el.className = 'ov-win';
        return el;
      };
      cell.append(num(g.score.left, g.score.winner === 'left'), '-', num(g.score.right, g.score.winner === 'right'));
    }
    row.append(name, cell);
    list.append(row);
  });
  return list;
}

// localStorage 取用本身就可能丟例外（沙盒、私密瀏覽）
function overlayStorage() {
  try {
    return window.localStorage;
  } catch (e) {
    return undefined;
  }
}

// 比賽當天不改版就能關掉冠軍時刻動畫：PRISM 小工具網址加 &cm=0，只留比分條（標籤照常）
function overlayChampionEnabled(search) {
  return new URLSearchParams(search || '').get('cm') !== '0';
}

// 冠軍時刻（2026-11-25）：出錯（含 champion-moment.js 沒載入）就不播，比分條照常
function createChampionForOverlay({ doc, storage, enabled }) {
  try {
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return createOverlayChampion({ doc, store: createPlayedStore(storage), reduce, enabled });
  } catch (e) {
    console.warn('[overlay] 冠軍時刻無法啟用', e);
    return null;
  }
}

// doc、storage 給測試注入（預設是這一頁與它的 localStorage）
function initOverlay({ search, root, fetchView, intervalMs = OVERLAY_POLL_MS, doc = document, storage = overlayStorage() }) {
  const auth = parseTokenFromUrl(search || '');
  if (auth.mode !== 'public') {
    renderOverlay(root, null, OVERLAY_BAD_LINK);
    return { refresh: async () => {}, stop: () => {}, ready: Promise.resolve() };
  }
  const champion = createChampionForOverlay({ doc, storage, enabled: overlayChampionEnabled(search) });

  // 設定時（還沒成功顯示過比分）每種狀態都要看得出來：透明頁一片空白時，設定的人分不出還在讀、讀不到或連結不對。
  // 顯示過比分之後（直播中）一律保留上一次畫面，不出現任何提示或錯誤字。
  let shown = false;
  renderOverlay(root, null, OVERLAY_LOADING);
  async function refresh() {
    try {
      const view = await fetchView(auth.token);
      if (!view || !view.tournament) {
        if (!shown) renderOverlay(root, null, OVERLAY_NOT_FOUND);
        return;
      }
      const lines = overlayLines(view);
      if (!lines) {
        if (!shown) renderOverlay(root, null, OVERLAY_NO_POINTS);
        return;
      }
      renderOverlay(root, lines);
      shown = true;
      if (champion) {
        try {
          champion.update(view);
        } catch (e) {
          // 冠軍時刻出錯只寫主控台，比分條已經畫好、不受影響
          console.warn('[overlay] 冠軍時刻播放失敗', e);
        }
      }
    } catch (e) {
      // 讀取失敗：畫面維持原樣（設定時停在「讀取比分中…」）；原因只寫到主控台，不會出現在直播畫面上
      console.warn('[overlay] 讀取比分失敗', e);
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
    OVERLAY_POLL_MS, OVERLAY_BAD_LINK, OVERLAY_NOT_FOUND, OVERLAY_LOADING, OVERLAY_NO_POINTS,
    latestConfirmedMatch, overlayLines, overlayGames, renderOverlay, initOverlay,
  };
}
