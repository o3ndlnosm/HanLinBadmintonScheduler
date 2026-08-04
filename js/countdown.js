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

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countdownState, formatCountdown };
}
