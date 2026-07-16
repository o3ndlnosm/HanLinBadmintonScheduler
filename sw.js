/**
 * 翰林羽球排場系統 Service Worker
 * 策略：同源資源 stale-while-revalidate（先用快取秒開，背景更新，下次載入生效）
 * CDN / Google API 一律直接走網路，不快取（避免影響 OAuth 與 Sheets API）
 */
const CACHE_NAME = 'hanlin-badminton-v4';

const PRECACHE_URLS = [
  './',
  'index.html',
  'css/style.css',
  'js/court-actions.js',
  'js/dialog.js',
  'js/script.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只處理同源 GET，其餘（CDN、Google API）直接走網路
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetched = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached); // 離線時退回快取

      return cached || fetched;
    })
  );
});
