/**
 * 主頁賽事倒數：計算純函式
 * 設計見 docs/superpowers/specs/2026-08-04-index-countdown-design.md
 */

/**
 * 依當下時刻算出倒數狀態。
 * 時間全部由參數傳入，不讀系統時鐘，方便測試。
 */
function countdownState(nowMs, event) {
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);

  if (nowMs >= end) return { phase: 'ended' };
  if (nowMs >= start) return { phase: 'during' };

  // 不足一秒的餘數捨去，顯示上以秒為最小單位
  const totalSeconds = Math.floor((start - nowMs) / 1000);
  return {
    phase: 'before',
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 只有 phase === 'before' 的狀態需要格式化 */
function formatCountdown(state) {
  const hms = `${pad2(state.hours)} : ${pad2(state.minutes)} : ${pad2(state.seconds)}`;
  return state.days > 0 ? `${state.days} 天 ${hms}` : hms;
}

/**
 * 把賽事開始時刻格式化成「8/20 (四) 18:10 開打」。
 * 固定用台北時間解讀：先把 epoch 加 8 小時，再用 getUTC* 讀取，
 * 這樣不論使用者裝置在哪個時區，顯示的都是賽事當地的日期與星期。
 * 星期一律由日期推導，不寫死——寫死過一次就錯過一次（8/20 是四不是三）。
 */
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function formatEventDate(isoString) {
  const d = new Date(Date.parse(isoString) + 8 * 3600 * 1000);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const w = WEEKDAY_ZH[d.getUTCDay()];
  return `${md} (${w}) ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} 開打`;
}

// ── 以下為瀏覽器渲染層（jest 只測上方純函式） ──────────────

const EVENT = {
  name: '第三屆翰林匹克羽球運動會',
  // 取自第 1 輪 timeSlot（18:10-18:20）與第 10 輪（19:40-19:50）
  startAt: '2026-08-20T18:10:00+08:00',
  endAt: '2026-08-20T19:50:00+08:00',
  // 公開觀賽 token，本來就要貼社團群組
  url: 'tournament.html?t=4478488eb60c20146ae9639634944336',
};

let countdownTimer = null;

function renderCountdown(state, els) {
  if (state.phase === 'ended') {
    els.root.hidden = true;
    return;
  }

  els.root.hidden = false;
  els.root.classList.toggle('is-during', state.phase === 'during');

  if (state.phase === 'during') {
    els.main.textContent = '比賽進行中';
    els.sub.textContent = '';
    els.cta.textContent = '進入即時計分板 ›';
  } else {
    els.main.textContent = formatCountdown(state);
    els.sub.textContent = formatEventDate(EVENT.startAt);
    els.cta.textContent = '查看賽程 ›';
  }
}

function initCountdown() {
  const root = document.getElementById('eventCountdown');
  if (!root) return;

  const els = {
    root,
    main: document.getElementById('ecMain'),
    sub: document.getElementById('ecSub'),
    cta: document.getElementById('ecCta'),
  };

  root.href = EVENT.url;
  document.getElementById('ecName').textContent = EVENT.name;

  const tick = () => {
    const state = countdownState(Date.now(), EVENT);
    renderCountdown(state, els);
    // 賽事結束後不必再跑
    if (state.phase === 'ended' && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  tick();
  countdownTimer = setInterval(() => {
    // 分頁在背景時略過 DOM 更新，回前景時由 visibilitychange 立即補上
    if (document.hidden) return;
    tick();
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initCountdown);
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countdownState, formatCountdown, formatEventDate };
}
