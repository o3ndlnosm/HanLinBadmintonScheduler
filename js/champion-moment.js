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
// cm2（2026-11-25）：當天上午用正式比賽測試確認過比分，看過的裝置記成已播過；換字首讓舊記錄全部作廢
function playedKey(view, phase) {
  const t = (view && view.tournament) || {};
  return `cm2:${t.name}|${t.heldOn}:${phase}`;
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

// ---------- 全螢幕圖層（開場、揭曉）：一律掛在 body，不放在每 10 秒會清空重畫的 #pointBoard／#overlay 裡 ----------

// 等團體圖解碼、粗體與數字字型下載完再開始（網路慢時不會空白衝入、砸下動畫中途不會換字），
// 最多等 CM_IMAGE_WAIT_MS，逾時照播。字型用 display=swap，不先 load 的話要等字第一次畫出來才開始下載。
function cmWaitAssets(imgs, doc) {
  const win = doc.defaultView;
  const settle = (fn) => {
    try {
      return Promise.resolve(fn()).catch(() => {});
    } catch (e) {
      return Promise.resolve();
    }
  };
  const waits = imgs.map((img) => settle(() => (typeof img.decode === 'function' ? img.decode() : undefined)));
  if (doc.fonts && typeof doc.fonts.load === 'function') {
    waits.push(settle(() => doc.fonts.load('900 1em "Noto Sans TC"', '冠軍時刻奪冠！貿聯翰林')));
    waits.push(settle(() => doc.fonts.load('1em Anton', '0123456789 :')));
  }
  const timeout = new Promise((resolve) => { win.setTimeout(resolve, CM_IMAGE_WAIT_MS); });
  return Promise.race([Promise.all(waits), timeout]);
}

// 同時只留一個圖層（開場還在播時就揭曉 → 換成揭曉）：連同舊圖層的計時器一起清掉，
// 免得舊計時器晚點跑完時把新圖層的播放狀態（body.cm-playing）拿掉
function cmClearLayers(doc) {
  doc.querySelectorAll('.cm-layer').forEach((el) => (typeof el.cmRemove === 'function' ? el.cmRemove() : el.remove()));
}

// 建圖層＋計時器：remove 會清掉所有計時器；不管圖載入與時間軸，capMs 到一定移除
function cmMountLayer(doc, className, { reduce, stream, capMs }) {
  cmClearLayers(doc);
  const win = doc.defaultView;
  const layer = cmEl(doc, 'div', `cm-layer ${className}`);
  if (stream) layer.classList.add('cm-stream');
  if (reduce) layer.classList.add('cm-reduce');
  layer.setAttribute('aria-hidden', 'true');
  const timers = [];
  const at = (ms, fn) => { timers.push(win.setTimeout(fn, ms)); };
  // 播放期間 body 加 cm-playing（疊加頁藉此藏起比分條，播完才回到比分條）
  const remove = () => {
    timers.forEach((t) => win.clearTimeout(t));
    layer.remove();
    if (!doc.querySelector('.cm-layer')) doc.body.classList.remove('cm-playing');
  };
  layer.cmRemove = remove;
  layer.addEventListener('click', remove);
  doc.body.classList.add('cm-playing');
  at(capMs, remove);
  return { layer, win, at, remove };
}

// 紙花：長方形小紙片旋轉飄落（canvas）。沒有 canvas 或 requestAnimationFrame 時回 null（不畫，其餘照常）
function cmConfetti(canvas, win, count) {
  let ctx = null;
  try {
    ctx = canvas.getContext('2d');
  } catch (e) {
    ctx = null;
  }
  if (!ctx || typeof win.requestAnimationFrame !== 'function') return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const unit = Math.min(w, h);
  let bits = [];
  let running = false;
  let last = 0;
  function frame(now) {
    if (!canvas.isConnected) {
      running = false;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    bits = bits.filter((b) => {
      b.sway += dt * 3;
      b.rot += b.vr * dt;
      b.x += (b.vx + Math.sin(b.sway) * b.w * 6) * dt;
      b.y += b.vy * dt;
      if (b.y > h + 20) return false;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(1, Math.abs(Math.cos(b.sway * 1.7)) * 0.8 + 0.2);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
      return true;
    });
    if (bits.length) win.requestAnimationFrame(frame);
    else running = false;
  }
  return {
    burst(colors) {
      for (let i = 0; i < count; i++) {
        bits.push({
          x: Math.random() * w, y: -Math.random() * h * 0.6 - 10,
          vy: unit * (0.18 + Math.random() * 0.25), vx: unit * (Math.random() - 0.5) * 0.12,
          w: unit * (0.012 + Math.random() * 0.012), h: unit * (0.02 + Math.random() * 0.02),
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 9, sway: Math.random() * 6.28,
          color: colors[i % colors.length],
        });
      }
      if (!running) {
        running = true;
        last = win.performance ? win.performance.now() : Date.now();
        win.requestAnimationFrame(frame);
      }
    },
  };
}

// 最終戰開場（約 4 秒）：變暗 → 兩隊衝進來 → 「冠軍時刻」大字砸下（閃光、震動）→ 大字放大淡出 → 圖層淡出移除。
// stream：直播疊加頁版本（兩隊左右對峙，收尾時退出）。時間軸照示範頁。
function playIntro({ doc = document, reduce = false, stream = false } = {}) {
  const { layer, win, at, remove } = cmMountLayer(doc, 'cm-intro', {
    reduce, stream, capMs: CM_IMAGE_WAIT_MS + CM_INTRO_MS,
  });
  const right = cmTeamImg(doc, 'right');
  const left = cmTeamImg(doc, 'left');
  const title = cmEl(doc, 'div', 'cm-title');
  title.appendChild(cmEl(doc, 'span', '', '冠軍時刻'));
  layer.append(cmEl(doc, 'div', 'cm-veil'), right, left, title, cmEl(doc, 'div', 'cm-flash'));
  doc.body.appendChild(layer);
  cmWaitAssets([right, left], doc).then(() => {
    if (!layer.isConnected) return;
    at(200, () => layer.classList.add('cm-players-in'));
    at(950, () => {
      layer.classList.add('cm-title-in');
      if (!reduce) layer.classList.add('cm-shake');
    });
    at(1300, () => layer.classList.remove('cm-shake'));
    at(2900, () => layer.classList.add('cm-title-out'));
    // 直播版：兩隊退出、變暗的底淡掉，回到透明畫面＋比分條；手機版整個圖層淡出
    at(3300, () => layer.classList.add(stream ? 'cm-players-out' : 'cm-out'));
    at(CM_INTRO_MS, remove);
  });
  return layer;
}

// 冠軍揭曉（約 8 秒）：勝方團體圖從它那一側衝進來、隊名色塊＋金色「奪冠！」＋最終比分、紙花（在圖前、字後）。
function playReveal(info, view, { doc = document, reduce = false, stream = false } = {}) {
  const { layer, win, at, remove } = cmMountLayer(doc, `cm-reveal cm-side-${info.side}`, {
    reduce, stream, capMs: CM_IMAGE_WAIT_MS + CM_REVEAL_MS,
  });
  const winner = view.teams.find((t) => t.id === info.winnerId);
  const style = teamStyleById(view)[winner.id];
  const img = cmTeamImg(doc, info.side);
  img.classList.add('cm-reveal-img');
  const canvas = cmEl(doc, 'canvas', 'cm-confetti');
  const text = cmEl(doc, 'div', 'cm-reveal-text');
  const pill = cmEl(doc, 'div', 'cm-pill');
  cmSetPill(pill, winner, style);
  text.append(pill, cmEl(doc, 'div', 'cm-win', '奪冠！'), cmEl(doc, 'div', 'cm-reveal-score', `${info.won} : ${info.lost}`));
  layer.append(cmEl(doc, 'div', 'cm-reveal-bg'), img, canvas, text, cmEl(doc, 'div', 'cm-flash'));
  doc.body.appendChild(layer);
  cmWaitAssets([img], doc).then(() => {
    if (!layer.isConnected) return;
    layer.classList.add('cm-on');
    if (!reduce) {
      layer.classList.add('cm-shake');
      at(350, () => layer.classList.remove('cm-shake'));
    }
    // 金色＋勝方隊色（翰林白底就用白與翰林藍）
    const accent = style.edge === style.fill ? '#ffffff' : style.edge;
    const confetti = cmConfetti(canvas, win, reduce ? 40 : 150);
    if (confetti) {
      confetti.burst(['#ffd36b', '#fff3c4', style.fill, accent]);
      at(1400, () => confetti.burst(['#ffd36b', style.edge]));
    }
    at(CM_REVEAL_MS - 600, () => layer.classList.add('cm-out'));
    at(CM_REVEAL_MS, remove);
  });
  return layer;
}

// 觀賽頁每次 renderAll 後呼叫（tournament.js 包 try/catch）。只在觀賽模式；輸分頁、其他比賽一律拿掉主視覺。
// 開場、揭曉各自每台裝置只播一次；分頁在背景時不播也不記（回前景時 tournament.js 會 refresh 再呼叫一次）。
// 第一次看到就已經是 done：跳過開場直接揭曉。階段倒退（改判）不重播、不收回記錄。
function syncChampionPage(view, { mode, section, store, doc = document, reduce = false } = {}) {
  if (!section) return;
  const phase = mode === 'public' ? finalPhase(view) : 'none';
  const info = phase === 'none' ? null : championInfo(view);
  renderChampionHero(section, view, phase, info);
  if (phase === 'none' || !store || doc.hidden) return;
  const finalKey = playedKey(view, 'final');
  const doneKey = playedKey(view, 'done');
  if (phase === 'final' && !store.has(finalKey)) {
    store.mark(finalKey);
    playIntro({ doc, reduce });
  } else if (phase === 'done' && info && !store.has(doneKey)) {
    store.mark(doneKey);
    store.mark(finalKey);
    playReveal(info, view, { doc, reduce });
  }
}

const CM_PHASE_ORDER = { none: 0, final: 1, done: 2 };

// 直播疊加頁（PRISM 網頁小工具）：只在輪詢時親眼看到階段往前切換才播。載入當下只記下階段、不播——
// PRISM 重新載入小工具、或直播中途才加上疊加頁時，不會突然全螢幕蓋住正在打的球；不需要確認 PRISM 會不會保留 localStorage。
// 另外照樣記 store，同一台電腦不重播。不看分頁在不在背景（PRISM 可能把小工具當背景頁，照套就永遠不會播）。
// enabled=false（網址 &cm=0）：只更新比分條，不播動畫。
function createOverlayChampion({ doc = document, store, enabled = true, reduce = false } = {}) {
  let seen = null;
  return {
    update(view) {
      const phase = finalPhase(view);
      const prev = seen;
      seen = phase;
      if (!enabled || prev === null || !store) return;
      if (CM_PHASE_ORDER[phase] <= CM_PHASE_ORDER[prev]) return; // 沒有往前切換（含改判倒退）不播
      // 疊加頁與觀賽頁各記各的：同一個瀏覽器先開過觀賽頁（例如賽前在電腦上測），疊加頁照樣要播
      const finalKey = `${playedKey(view, 'final')}:overlay`;
      if (phase === 'final') {
        if (store.has(finalKey)) return;
        store.mark(finalKey);
        playIntro({ doc, reduce, stream: true });
        return;
      }
      const doneKey = `${playedKey(view, 'done')}:overlay`;
      const info = championInfo(view);
      if (!info || store.has(doneKey)) return;
      store.mark(doneKey);
      store.mark(finalKey);
      playReveal(info, view, { doc, reduce, stream: true });
    },
  };
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CM_INTRO_MS, CM_REVEAL_MS, CM_IMAGE_WAIT_MS, CM_IMG,
    finalPhase, championInfo, finalRoundLabel, playedKey, createPlayedStore,
    renderChampionHero, syncChampionPage, playIntro, playReveal, createOverlayChampion,
  };
}
