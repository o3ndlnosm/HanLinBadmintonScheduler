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

function mountLiveBox(section, url) {
  const id = youtubeIdFrom(url);
  const current = section.dataset.liveId || null;
  if (id === current) return;

  section.textContent = '';
  if (!id) {
    delete section.dataset.liveId;
    section.hidden = true;
    return;
  }

  const h2 = document.createElement('h2');
  const icon = document.createElement('i');
  icon.className = 'fas fa-video';
  h2.appendChild(icon);
  h2.appendChild(document.createTextNode(' 直播'));

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

  section.appendChild(h2);
  section.appendChild(frame);
  section.appendChild(open);
  section.dataset.liveId = id;
  section.hidden = false;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { youtubeIdFrom, mountLiveBox };
}
