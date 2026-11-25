/**
 * 觀賽頁 YouTube 直播框（2026-11-25 友誼賽起）
 * spec：docs/superpowers/specs/2026-11-18-live-stream-design.md
 *
 * 直播網址存在賽事資料（tournaments.live_url），由 tournament_public_payload 以 liveUrl 送來。
 * 反目標：
 * - 只嵌 YouTube：從網址取出 11 碼影片 ID 後自己組播放器網址，其他網站一律當成沒填。
 * - 每 10 秒重畫時不能重新載入影片：同一支影片不重掛。
 * - 輸分網址的通行碼不能外流：整頁是 no-referrer，只有這個 iframe 對 YouTube 送網域
 *   （沒有來源網址時 YouTube 播放器會顯示錯誤 153）。
 */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];

function youtubeIdFrom(url) {
  if (typeof url !== 'string') return null;
  let s = url.trim();
  if (YOUTUBE_ID_RE.test(s)) return s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  let id = null;
  if (host === 'youtu.be') {
    id = parts[0] || null;
  } else if (YOUTUBE_HOSTS.includes(host)) {
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if ((parts[0] === 'live' || parts[0] === 'embed') && parts.length === 2) id = parts[1];
  }
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

// ---- 開打前倒數（2026-11-23）：還沒填直播網址時直播框照樣出現，倒數到開打 ----
// 開打時間由 tournament.js 的 liveCountdownTarget 算好傳進來（v29 起＝第一輪開打，不再等於應援開放時間）；沒有就照舊隱藏。
let liveCountdownTimer = null;

function stopLiveCountdown() {
  if (liveCountdownTimer) clearInterval(liveCountdownTimer);
  liveCountdownTimer = null;
}

const pad2 = (n) => String(n).padStart(2, '0');

// 剩餘秒數 → 「2 天 03:04:05」；不到一天只有時分秒
function formatLiveCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hms = `${pad2(Math.floor(s / 3600) % 24)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
  return days > 0 ? `${days} 天 ${hms}` : hms;
}

// 開打時刻 → 「11/25（三）18:15 開打」。固定用台北時間（+8 小時再讀 UTC），星期由日期推導不寫死
const LIVE_WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
function formatLiveStart(startMs) {
  const d = new Date(startMs + 8 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${LIVE_WEEKDAY_ZH[d.getUTCDay()]}）`
    + `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} 開打`;
}

function liveHeading() {
  const h2 = document.createElement('h2');
  const icon = document.createElement('i');
  icon.className = 'fas fa-video';
  h2.appendChild(icon);
  h2.appendChild(document.createTextNode(' 直播'));
  return h2;
}

function mountLiveCountdown(section, startMs) {
  const frame = document.createElement('div');
  frame.className = 'live-frame live-waiting';
  const label = document.createElement('p');
  label.className = 'live-countdown-label';
  const time = document.createElement('p');
  time.className = 'live-countdown-time';
  const note = document.createElement('p');
  note.className = 'live-countdown-note';
  note.textContent = formatLiveStart(startMs);
  frame.append(label, time, note);
  section.append(liveHeading(), frame);

  const tick = () => {
    const left = Math.floor((startMs - Date.now()) / 1000);
    if (left > 0) {
      label.textContent = '直播倒數';
      time.textContent = formatLiveCountdown(left);
    } else {
      // 時間到了還沒填網址：等工作人員填，填了下一次刷新（10 秒）就換成播放器
      label.textContent = '直播即將開始';
      time.textContent = '';
      stopLiveCountdown();
    }
  };
  stopLiveCountdown();
  liveCountdownTimer = setInterval(tick, 1000);
  tick();
}

// countdownTo：開打時間（ISO 字串）；沒網址時有它就顯示倒數，沒有（第三屆、比賽 finished）就隱藏
function mountLiveBox(section, url, { countdownTo = null } = {}) {
  const id = youtubeIdFrom(url);

  if (!id) {
    const startMs = countdownTo ? Date.parse(countdownTo) : NaN;
    if (Number.isFinite(startMs)) {
      if (section.dataset.liveCountdown === String(startMs)) return; // 已在倒數，每 10 秒刷新不重畫
      section.textContent = '';
      delete section.dataset.liveId;
      mountLiveCountdown(section, startMs);
      section.dataset.liveCountdown = String(startMs);
      section.hidden = false;
      return;
    }
    stopLiveCountdown();
    section.textContent = '';
    delete section.dataset.liveId;
    delete section.dataset.liveCountdown;
    section.hidden = true;
    return;
  }

  if (id === section.dataset.liveId) return;
  stopLiveCountdown();
  delete section.dataset.liveCountdown;
  section.textContent = '';

  const frame = document.createElement('div');
  frame.className = 'live-frame';
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${id}`;
  iframe.title = '直播';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allow = 'encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  frame.appendChild(iframe);

  const open = document.createElement('a');
  open.className = 'live-open';
  open.href = `https://www.youtube.com/watch?v=${id}`;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.textContent = '在 YouTube 開啟';

  section.appendChild(liveHeading());
  section.appendChild(frame);
  section.appendChild(open);
  section.dataset.liveId = id;
  section.hidden = false;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { youtubeIdFrom, mountLiveBox, formatLiveCountdown, formatLiveStart };
}
