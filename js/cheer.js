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
const CHEER_SPARK_MAX_LIVE = 60;  // 同時存在的火花上限（手機效能）
const CHEER_SPARK_YELLOW = '#ffd23f';
const CHEER_BUBBLE_MAX_PER_SIDE = 3;  // 每側同時存在的泡泡上限
const CHEER_BUBBLE_MS = 1400;

// 泡泡口號（2026-11-17 設計見 docs/superpowers/specs/2026-11-17-cheer-bubbles-design.md）：不放嗆對方的話
function cheerSlogans(teamName) {
  return [
    '加油！', '衝啊！', '好球！', '穩住！', '漂亮！', '拿下這分！',
    `${teamName}加油！`, `${teamName}衝衝衝！`, `${teamName}必勝！`,
  ];
}

// 這次增加量 → 交界火花顆數（2026-11-17 設計見 docs/superpowers/specs/2026-11-17-cheer-sparks-design.md）
function sparkCount(n) {
  if (!(n > 0)) return 0;
  return Math.min(5 + n, 18);
}

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

  let shownLast = Object.fromEntries(teamIds.map((id) => [id, 0]));
  let primed = false;  // 還沒接受過伺服器總數

  // 顯示 = 伺服器數 + 送出中 + 本機累積：送出途中再按，數字不會先掉回去。
  // bursts = 各隊顯示總數比上次多了多少（自己按、別人的批次一律同一套）；
  // 自己按的量送出回來時已經算在上次的顯示裡，所以不會重複算。
  // quiet：第一次接受伺服器總數（打開頁面 0 → 幾千）不算增加。
  const emit = (quiet = false) => {
    const shown = displayTotals(displayTotals(server, inflight), pending);
    const bursts = {};
    if (!quiet) {
      teamIds.forEach((id) => {
        const d = (shown[id] || 0) - (shownLast[id] || 0);
        if (d > 0) bursts[id] = d;
      });
    }
    shownLast = shown;
    onChange(shown, bursts);
  };
  // 總數只會增加：逐隊取大值，較舊的回應（例如送出前發出、較晚回來的輪詢）不會讓畫面下降。
  // 代價：用 SQL 歸零後，開著的頁面要重新整理才會看到歸零。
  // 回傳 true 表示這是第一次接受伺服器總數。
  // skipInflight（輪詢用）：有點擊正在送出的隊伍不併入。輪詢若在伺服器寫入之後才讀，值已含送出中的量，
  // 再加上顯示裡的 inflight 就會重複算（數字先多跳、火花重複噴）；那一隊的新總數等送出回應帶回來。
  const accept = (totals, skipInflight = false) => {
    if (!totals || typeof totals !== 'object') return false;
    Object.entries(totals).forEach(([id, n]) => {
      if (skipInflight && inflight[id] > 0) return;
      if (typeof n === 'number') server[id] = Math.max(server[id] || 0, n);
    });
    const first = !primed;
    primed = true;
    return first;
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
    let quiet = false;
    for (const [teamId, n] of batch) {
      try {
        if (accept(await send(token, teamId, n))) quiet = true;
      } catch (e) {
        // 應援失敗靜默略過
      } finally {
        inflight[teamId] -= n;
      }
    }
    if (batch.length) emit(quiet);
  }

  async function poll() {
    try {
      const first = accept(await fetchTotals(token), true);
      emit(first);
    } catch (e) {
      // 應援失敗靜默略過
    }
  }

  return { tap, flush, poll };
}

// 火花層：在 layer（position: relative 的容器）裡，從 (x, y) 往 dir（+1 右、−1 左）噴火花。
// 每顆只動 transform／opacity，跑完就移除；同時存在超過 maxLive 這批就少噴；
// 瀏覽器不支援 Web Animations、或動畫建立失敗時不噴（也不留元素、不佔上限）。回傳實際噴出的顆數。
function createSparkLayer(layer, maxLive = CHEER_SPARK_MAX_LIVE) {
  let live = 0;

  function burst(x, y, dir, color, n) {
    if (typeof layer.animate !== 'function') return 0;
    const want = Math.min(sparkCount(n), maxLive - live);
    const palette = [color, CHEER_SPARK_YELLOW, '#ffffff'];
    let made = 0;
    for (let i = 0; i < want; i++) {
      const el = document.createElement('span');
      const size = 2 + Math.random() * 3;
      el.className = 'cheer-spark';
      el.style.left = `${x - size / 2}px`;
      el.style.top = `${y - size / 2}px`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.backgroundColor = palette[i % palette.length];

      const ang = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2; // 往前、上下 ±63°
      const dist = 14 + Math.random() * 34;
      let anim;
      try {
        layer.appendChild(el);
        anim = el.animate([
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) scale(0.2)`, opacity: 0 },
        ], { duration: 380 + Math.random() * 320, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' });
      } catch (e) {
        el.remove();  // 一顆失敗，這批其餘的也會失敗
        break;
      }
      live += 1;
      made += 1;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.remove();
        live -= 1;
      };
      anim.onfinish = finish;
      anim.oncancel = finish;
    }
    return made;
  }

  return { burst, live: () => live };
}

// 泡泡層：side 'a'（左側）或 'b'（右側），彈出、上飄、淡出。寫法同火花層：跑完移除、每側同時最多 maxPerSide 個、
// 不支援 Web Animations 或建立失敗時不冒（也不留元素、不佔上限）。回傳有沒有冒出來。
function createBubbleLayer(layer, maxPerSide = CHEER_BUBBLE_MAX_PER_SIDE) {
  const live = { a: 0, b: 0 };

  // color 是泡泡底色；ink 字色（沒給沿用 CSS 的白字）；edge 與底色不同時加 1px 外框（翰林白底藍框，2026-11-25 代表色）
  function pop(side, text, color, { ink, edge } = {}) {
    if (typeof layer.animate !== 'function' || !(side in live)) return false;
    if (live[side] >= maxPerSide) return false;
    const el = document.createElement('span');
    el.className = `cheer-bubble cheer-bubble-${side}`;
    el.textContent = text;
    el.style.backgroundColor = color;
    if (ink) el.style.color = ink;
    if (edge && edge !== color) el.style.border = `1px solid ${edge}`;
    el.style[side === 'a' ? 'left' : 'right'] = `${2 + Math.random() * 26}%`;
    let anim;
    try {
      layer.appendChild(el);
      anim = el.animate([
        { transform: 'translateY(6px) scale(0.6)', opacity: 0 },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.15 },
        { transform: 'translateY(-4px) scale(1)', opacity: 1, offset: 0.75 },
        { transform: 'translateY(-10px) scale(0.95)', opacity: 0 },
      ], { duration: CHEER_BUBBLE_MS, easing: 'ease-out' });
    } catch (e) {
      el.remove();
      return false;
    }
    live[side] += 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.remove();
      live[side] -= 1;
    };
    anim.onfinish = finish;
    anim.oncancel = finish;
    return true;
  }

  return { pop, live: (side) => live[side] };
}

// ---- 瀏覽器掛載（渲染層；結構、火花與泡泡的觸發、公布與唯讀有 jsdom 測試，版面與動畫靠瀏覽器驗證） ----
let cheerMounted = false;
// 比賽結束（15 場全部確認或 finished）才公布應援數；比賽中標題列只顯示隊名（2026-11-17 使用者拍板）
let cheerRevealed = false;
let cheerRenderHead = null;  // 掛載後：用最後一次的總數重畫標題列
let cheerGoReadOnly = null;  // 掛載後：把開著的應援條切成唯讀
let cheerGoWritable = null;  // 掛載後：把唯讀的應援條切回可加油（比賽 finished 被改回進行中）
let cheerSetLocked = null;   // 掛載後：鎖定／解鎖加油按鈕（應援開放時間前顯示但不能按）

// 由 tournament.js 每次刷新時依比賽狀態設定；掛載前呼叫也有效（掛載時讀這個旗標）
function setCheerReveal(revealed) {
  cheerRevealed = !!revealed;
  if (cheerRenderHead) cheerRenderHead();
}

// mountCheerBar 只掛一次，由 tournament.js 每次刷新時依目前狀態呼叫這個切換：
// 頁面開著時比賽才變 finished（賽後收尾）→ 切成唯讀；應援開放時間到了（2026-11-23）→ 切回可加油、出現按鈕。
// 輸分頁一律帶 readOnly: true，這裡等於沒動作。掛載前呼叫沒有作用，由 mountCheerBar 的 readOnly 處理。
function setCheerReadOnly(readOnly) {
  if (readOnly && cheerGoReadOnly) cheerGoReadOnly();
  if (!readOnly && cheerGoWritable) cheerGoWritable();
}

// 應援開放時間前（2026-11-23 第二輪，使用者要按鈕看得到、只是不能按）：按鈕照樣顯示但 disabled；
// 時間到由 tournament.js 刷新時 setCheerLocked(false) 解鎖。唯讀時沒有按鈕，鎖定狀態記著，切回可加油時沿用。
function setCheerLocked(locked) {
  if (cheerSetLocked) cheerSetLocked(locked);
}

// teams：[{ id, name, color, edge?, ink? }]，取前兩隊（左 A、右 B）。color 是底色；edge 邊框色（預設同 color）；ink 泡泡字色（預設白）
// readOnly（比賽 finished，或輸分頁）：沒有加油按鈕、不送應援；總數照常輪詢，別人加油時照樣噴火花、冒泡泡
// locked（應援還沒開放）：按鈕顯示但 disabled，按了不算
function mountCheerBar(container, teams, token, { readOnly = false, locked = false } = {}) {
  if (cheerMounted || !container || teams.length < 2) return;
  cheerMounted = true;
  const [ta, tb] = teams;

  container.textContent = '';
  // 標題列：隊名（公布後加上應援總數）；泡泡疊在這一行上
  const head = document.createElement('div');
  head.className = 'cheer-head';
  const counts = document.createElement('div');
  counts.className = 'cheer-counts';
  const countA = document.createElement('span');
  const totalLabel = document.createElement('span');
  totalLabel.className = 'cheer-total-label';
  totalLabel.textContent = '應援總數';
  const countB = document.createElement('span');
  counts.append(countA, totalLabel, countB);
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'cheer-bubbles';
  head.append(counts, bubbleEl);

  const bar = document.createElement('div');
  bar.className = 'cheer-bar';
  const fillA = document.createElement('div');
  fillA.className = 'cheer-fill';
  fillA.style.backgroundColor = ta.color;
  bar.style.backgroundColor = tb.color;
  // B 隊底色與邊框色不同（翰林白底）時整條加 1px 內框，白色輸分頁上也看得出應援條的範圍；左邊 A 色塊蓋住的那段不影響
  if (tb.edge && tb.edge !== tb.color) bar.style.boxShadow = `inset 0 0 0 1px ${tb.edge}`;
  bar.appendChild(fillA);

  // 交界火花：bar 為了圓角是 overflow: hidden，火花另外疊在上面的 fx 層
  const track = document.createElement('div');
  track.className = 'cheer-track';
  const fx = document.createElement('div');
  fx.className = 'cheer-fx';
  const core = document.createElement('div');
  core.className = 'cheer-spark-core';
  fx.appendChild(core);
  track.append(bar, fx);
  container.append(head, track);

  container.hidden = false;

  const sparkLayer = createSparkLayer(fx);
  const bubbleLayer = createBubbleLayer(bubbleEl);
  const motionOff = () => (typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    || document.visibilityState === 'hidden';
  // 從光點目前的位置噴：A 隊往右（B 那側）、B 隊往左
  const burstAtJunction = (bursts) => {
    if (!bursts || motionOff()) return;
    const layerBox = fx.getBoundingClientRect();
    const coreBox = core.getBoundingClientRect();
    const x = coreBox.left + coreBox.width / 2 - layerBox.left;
    const y = layerBox.height / 2;
    if (bursts[ta.id]) sparkLayer.burst(x, y, 1, ta.color, bursts[ta.id]);
    if (bursts[tb.id]) sparkLayer.burst(x, y, -1, tb.color, bursts[tb.id]);
  };
  // 一次增加只冒一個泡泡（量交給火花），A 在左、B 在右
  const pickSlogan = (team) => {
    const list = cheerSlogans(team.name);
    return list[Math.floor(Math.random() * list.length)];
  };
  const popBubbles = (bursts) => {
    if (!bursts || motionOff()) return;
    if (bursts[ta.id]) bubbleLayer.pop('a', pickSlogan(ta), ta.color, { ink: ta.ink, edge: ta.edge });
    if (bursts[tb.id]) bubbleLayer.pop('b', pickSlogan(tb), tb.color, { ink: tb.ink, edge: tb.edge });
  };

  let last = {};
  const renderHead = () => {
    if (cheerRevealed) {
      countA.textContent = `${ta.name} ${(last[ta.id] || 0).toLocaleString()}`;
      countB.textContent = `${(last[tb.id] || 0).toLocaleString()} ${tb.name}`;
    } else {
      countA.textContent = ta.name;
      countB.textContent = tb.name;
    }
    totalLabel.hidden = !cheerRevealed;
  };
  cheerRenderHead = renderHead;

  const render = (totals, bursts) => {
    last = totals;
    renderHead();
    const ratio = cheerRatio(totals, ta.id, tb.id);
    fillA.style.width = `${ratio}%`;
    core.style.left = `${ratio}%`;
    try {
      burstAtJunction(bursts);
    } catch (e) {
      // 火花失敗靜默略過，不影響應援數
    }
    try {
      popBubbles(bursts);
    } catch (e) {
      // 泡泡失敗靜默略過，不影響應援數
    }
  };
  render({});

  const ctrl = createCheerController({
    token, teamIds: [ta.id, tb.id], send: sendCheer, fetchTotals: fetchCheerTotals, onChange: render,
  });

  // 加油按鈕＋定時送出。掛載時可加油就直接開；唯讀掛載的由 setCheerReadOnly(false) 開
  let buttons = null;
  let flushTimer = null;
  let isReadOnly = true;
  let isLocked = !!locked;
  const applyLocked = () => {
    if (!buttons) return;
    buttons.querySelectorAll('.cheer-btn').forEach((b) => { b.disabled = isLocked; });
  };
  const bump = (btn) => {
    btn.classList.remove('bump');
    void btn.offsetWidth; // 重新觸發動畫
    btn.classList.add('bump');
  };
  const makeBtn = (team) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cheer-btn';
    btn.style.borderColor = team.edge || team.color;
    btn.textContent = `為${team.name}加油`;
    btn.addEventListener('click', () => {
      if (isLocked) return; // disabled 已擋掉點擊，這裡再保險一次
      ctrl.tap(team.id);
      bump(btn);
    });
    return btn;
  };
  const goWritable = () => {
    if (!isReadOnly) return;
    isReadOnly = false;
    buttons = document.createElement('div');
    buttons.className = 'cheer-buttons';
    buttons.append(makeBtn(ta), makeBtn(tb));
    container.append(buttons);
    applyLocked();
    flushTimer = setInterval(() => ctrl.flush(), CHEER_FLUSH_MS);
  };
  if (!readOnly) goWritable();
  cheerGoWritable = goWritable;
  cheerSetLocked = (next) => {
    isLocked = !!next;
    applyLocked();
  };
  setInterval(() => { if (document.visibilityState === 'visible') ctrl.poll(); }, CHEER_POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (!isReadOnly) ctrl.flush(); }
    else ctrl.poll();
  });
  // 切唯讀：拿掉按鈕、停掉定時送出；還沒送出的點擊最後送一次（後端會拒絕），送出失敗後數字回到伺服器值，
  // 不會停在本機多算的數字上
  cheerGoReadOnly = () => {
    if (isReadOnly) return;
    isReadOnly = true;
    if (buttons) buttons.remove();
    buttons = null;
    clearInterval(flushTimer);
    flushTimer = null;
    ctrl.flush();
  };
  ctrl.poll();
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHEER_MAX_PER_WINDOW, CHEER_FLUSH_MS, CHEER_POLL_MS, CHEER_SPARK_MAX_LIVE,
    CHEER_BUBBLE_MAX_PER_SIDE, CHEER_BUBBLE_MS,
    addTap, cheerRatio, displayTotals, createCheerController, sparkCount, createSparkLayer,
    cheerSlogans, createBubbleLayer,
    mountCheerBar, setCheerReveal, setCheerReadOnly, setCheerLocked,
  };
}
