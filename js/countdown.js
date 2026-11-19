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

/**
 * 有沒有觀賽連結。event.url 是選填：社內比賽（第三屆）放公開觀賽連結；
 * 對外友誼賽（2026-11-25）不放——repo 公開，觀賽頁有對方同仁的名字，
 * 連結寫進程式等於任何翻 GitHub 的人都打得開（spec：docs/superpowers/specs/2026-11-19-countdown-friendly-design.md）。
 * 空字串也當成沒有，免得出現指向空網址的「前往賽程」。
 */
const NO_LINK_NOTE = '觀賽連結請看社團群組';

function hasEventLink(event) {
  return Boolean(event.url);
}

/**
 * 點橫幅時彈窗要顯示的內文（兩行；沒有連結時多一行告訴大家去哪裡找）。
 * 內容是開窗當下的快照，不逐秒更新——要看跳動的倒數，關掉彈窗看橫幅即可。
 * 賽事結束後橫幅已隱藏，理論上開不了彈窗，回 null 讓呼叫端直接不開。
 */
function eventDialogText(state, event) {
  if (state.phase === 'ended') return null;
  const first = state.phase === 'during' ? '比賽進行中' : `還有 ${formatCountdown(state)}`;
  const text = `${first}\n${formatEventDate(event.startAt)}`;
  return hasEventLink(event) ? text : `${text}\n${NO_LINK_NOTE}`;
}

/** 彈窗按鈕：有連結時「關閉＋前往賽程／進入即時計分板」（新分頁開）；沒有連結時只有「關閉」。 */
function eventDialogButtons(state, event) {
  if (state.phase === 'ended') return [];
  if (!hasEventLink(event)) {
    return [{ text: '關閉', value: false, className: 'btn-primary', primary: true }];
  }
  return [
    { text: '關閉', value: false, className: 'btn-secondary' },
    {
      text: state.phase === 'during' ? '進入即時計分板' : '前往賽程',
      value: true,
      href: event.url,
      className: 'btn-primary',
      primary: true,
    },
  ];
}

/** 橫幅最下面那行提示字（點下去會發生什麼）。 */
function bannerCtaText(state, event) {
  if (state.phase === 'ended') return '';
  if (hasEventLink(event)) return state.phase === 'during' ? '進入即時計分板 ›' : '查看賽程 ›';
  return state.phase === 'during' ? NO_LINK_NOTE : '比賽資訊 ›';
}

// ── 以下為瀏覽器渲染層（jest 只測上方純函式） ──────────────

const EVENT = {
  name: '第三屆翰林匹克羽球運動會',
  // startAt 取自第 1 輪 timeSlot（18:10-18:20）。
  // endAt 不等於賽程表第 10 輪的預定結束時間（19:50）：10 輪 × 10 分鐘首尾相接、
  // 零緩衝，實際幾乎不可能準時，且主頁是進入計分頁的唯一入口，19:50 一到入口消失，
  // 屆時可能還在打最後幾輪、名次正在決定。故留 70 分鐘延誤緩衝到 21:00，
  // 賽後這段時間也讓想回看最終戰績的人仍找得到入口。
  startAt: '2026-08-20T18:10:00+08:00',
  endAt: '2026-08-20T21:00:00+08:00',
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
  } else {
    els.main.textContent = formatCountdown(state);
    els.sub.textContent = formatEventDate(EVENT.startAt);
  }
  els.cta.textContent = bannerCtaText(state, EVENT);
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

  document.getElementById('ecName').textContent = EVENT.name;

  // 橫幅是 button 不是連結：排場資料只存在記憶體，離開這一頁就全沒了，
  // 上課途中誰誤觸都不能把整頁導走。要看賽程走彈窗裡的連結，開新分頁。
  root.addEventListener('click', () => {
    const state = countdownState(Date.now(), EVENT);
    const message = eventDialogText(state, EVENT);
    if (message === null) return;

    openDialog({
      title: EVENT.name,
      message,
      type: 'info',
      iconClass: 'fa-trophy dialog-icon-trophy',
      dismissValue: false,
      buttons: eventDialogButtons(state, EVENT),
    });
  });

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
  module.exports = {
    countdownState, formatCountdown, formatEventDate, eventDialogText, eventDialogButtons, bannerCtaText,
  };
}
