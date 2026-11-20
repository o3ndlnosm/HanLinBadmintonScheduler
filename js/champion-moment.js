/**
 * 冠軍時刻（2026-11-25 貿聯×翰林友誼賽）：最後一輪開打前播「最終戰開場」，15 場打完播「冠軍揭曉」。
 * spec：docs/superpowers/specs/2026-11-20-champion-moment-design.md
 * 相依（由 html 的 <script> 順序保證；jest 以 global 注入）：
 *   team-points.js → computeTeamPoints / pointLabel / eventLabel / isFriendlyPair
 * 反目標：這裡任何錯誤都不能讓賽程、輸分、應援、直播比分條壞掉——呼叫端一律包 try/catch。
 * 頂層名稱一律帶 cm／CM 前綴：瀏覽器的 classic script 共用全域，重名的 const 會讓整支檔案載入失敗。
 */
const CM_INTRO_MS = 4000;
const CM_REVEAL_MS = 8000;
const CM_IMAGE_WAIT_MS = 2000;
const CM_IMG = { left: 'img/champion/team-left.webp', right: 'img/champion/team-right.webp' };

function cmPointMatches(view) {
  return view && Array.isArray(view.matches) ? view.matches.filter((m) => typeof m.pointNo === 'number') : [];
}

function cmLastRound(matches) {
  return Math.max(...matches.map((m) => m.roundNo));
}

// 'none'：一般畫面；'final'：最後一輪之前全部確認（最終戰）；'done'：全部確認或比賽 finished，且已有勝方（揭曉）。
// 只在比點賽制、且左貿聯右翰林時判斷。finished 但點數沒分出勝負（例如提早結束）→ none，不播揭曉。
function finalPhase(view) {
  if (!isFriendlyPair(view)) return 'none';
  const matches = cmPointMatches(view);
  if (!matches.length) return 'none';
  const result = computeTeamPoints(view.teams, view.matches);
  const finished = !!view.tournament && view.tournament.status === 'finished';
  if (result.allConfirmed || finished) return result.winnerId ? 'done' : 'none';
  const last = cmLastRound(matches);
  const before = matches.filter((m) => m.roundNo < last);
  if (!before.length) return 'none';
  return before.every((m) => m.status === 'confirmed') ? 'final' : 'none';
}

// 目前的勝方（提前確定也算）；還沒分出勝負 → null
function championInfo(view) {
  if (!isFriendlyPair(view)) return null;
  const result = computeTeamPoints(view.teams, view.matches);
  if (!result.winnerId) return null;
  const [ta, tb] = view.teams;
  const winner = result.winnerId === ta.id ? ta : tb;
  const loser = winner === ta ? tb : ta;
  return {
    winnerId: winner.id,
    winnerName: winner.name,
    side: winner === ta ? 'left' : 'right',
    won: result.totals[winner.id],
    lost: result.totals[loser.id],
  };
}

// 例：'最終戰　第四點 混雙B · 第五點 男雙B'（最後一輪的比點場次，依場地排）
function finalRoundLabel(view) {
  const matches = cmPointMatches(view);
  if (!matches.length) return '';
  const last = cmLastRound(matches);
  const games = matches.filter((m) => m.roundNo === last).sort((a, b) => a.courtNo - b.courtNo);
  return `最終戰　${games.map((m) => `${pointLabel(m.pointNo)} ${eventLabel(m)}`).join(' · ')}`;
}

// 「已經播過」的鍵：payload 沒有比賽 id，用名稱＋日期；不存通行碼
function playedKey(view, phase) {
  const t = (view && view.tournament) || {};
  return `cm:${t.name}|${t.heldOn}:${phase}`;
}

// 每台裝置只播一次：記在 localStorage；不能用（私密瀏覽、沙盒）就只記在這次開著的頁面
function createPlayedStore(storage) {
  const memory = new Set();
  return {
    has(key) {
      if (memory.has(key)) return true;
      try {
        return !!storage && storage.getItem(key) === '1';
      } catch (e) {
        return false;
      }
    },
    mark(key) {
      memory.add(key);
      try {
        if (storage) storage.setItem(key, '1');
      } catch (e) {
        // 記不了就只記在記憶體
      }
    },
  };
}

// ---------- DOM ----------

function cmEl(doc, tag, className, text) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function cmTeamImg(doc, side) {
  const img = cmEl(doc, 'img', `cm-img cm-img-${side}`);
  img.src = CM_IMG[side];
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  return img;
}

// 隊名色塊：底色、邊框、字色用 CSS 變數帶入（teamStyleById），貿聯藍底白字、翰林白底深藍字藍框
function cmSetPill(pill, team, style) {
  pill.textContent = team.name;
  pill.style.setProperty('--cm-fill', style.fill);
  pill.style.setProperty('--cm-edge', style.edge);
  pill.style.setProperty('--cm-ink', style.ink);
}

function cmBuildHero(doc) {
  const hero = cmEl(doc, 'div', 'cm-hero');
  hero.setAttribute('aria-label', '冠軍時刻');
  const hud = cmEl(doc, 'div', 'cm-hud');
  const score = cmEl(doc, 'div', 'cm-score');
  score.append(cmEl(doc, 'span', 'cm-pill cm-left'), cmEl(doc, 'span', 'cm-nums'), cmEl(doc, 'span', 'cm-pill cm-right'));
  hud.append(cmEl(doc, 'div', 'cm-badge'), score, cmEl(doc, 'div', 'cm-label'), cmEl(doc, 'div', 'cm-decider'));
  hero.append(cmTeamImg(doc, 'right'), cmTeamImg(doc, 'left'), cmEl(doc, 'div', 'cm-aura'), hud);
  return hero;
}

// 觀賽頁主視覺：#pointsSection 裡、#pointBoard 前面維持唯一一個 .cm-hero。
// #pointBoard 每 10 秒會清空重畫，主視覺放在它外面、原地更新文字，不重建（團體圖不會閃）。
// 主視覺出現時 #pointBoard 加 cm-active：CSS 藏起大比分與「🏆」橫幅（那句話已在主視覺裡），每點明細照常。
function renderChampionHero(section, view, phase, info) {
  const doc = section.ownerDocument;
  const board = section.querySelector('#pointBoard');
  let hero = section.querySelector('.cm-hero');
  if (phase === 'none') {
    if (hero) hero.remove();
    if (board) board.classList.remove('cm-active');
    return null;
  }
  if (!hero) {
    hero = cmBuildHero(doc);
    section.insertBefore(hero, board);
  }
  const done = phase === 'done';
  const [ta, tb] = view.teams;
  const styles = teamStyleById(view);
  const totals = computeTeamPoints(view.teams, view.matches).totals;
  hero.dataset.state = done ? 'champion' : 'final';
  if (done && info) hero.dataset.winner = info.side;
  else delete hero.dataset.winner;
  hero.querySelector('.cm-badge').textContent = done ? '🏆 冠軍' : '冠軍時刻';
  cmSetPill(hero.querySelector('.cm-pill.cm-left'), ta, styles[ta.id]);
  cmSetPill(hero.querySelector('.cm-pill.cm-right'), tb, styles[tb.id]);
  hero.querySelector('.cm-nums').textContent = `${totals[ta.id]} : ${totals[tb.id]}`;
  // 冠軍提前確定時，原本橫幅的資訊改放在比分下的小字
  hero.querySelector('.cm-label').textContent = !done && info
    ? `${info.winnerName} 已拿下 ${info.won} 點，確定勝出`
    : '總點數';
  hero.querySelector('.cm-decider').textContent = done && info
    ? `比賽結束：${info.winnerName} 以 ${info.won}：${info.lost} 勝出`
    : finalRoundLabel(view);
  if (board) board.classList.add('cm-active');
  return hero;
}

// 觀賽頁每次 renderAll 後呼叫（tournament.js 包 try/catch）。只在觀賽模式；輸分頁、其他比賽一律拿掉主視覺。
function syncChampionPage(view, { mode, section } = {}) {
  if (!section) return;
  const phase = mode === 'public' ? finalPhase(view) : 'none';
  renderChampionHero(section, view, phase, phase === 'none' ? null : championInfo(view));
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CM_INTRO_MS, CM_REVEAL_MS, CM_IMAGE_WAIT_MS, CM_IMG,
    finalPhase, championInfo, finalRoundLabel, playedKey, createPlayedStore,
    renderChampionHero, syncChampionPage,
  };
}
