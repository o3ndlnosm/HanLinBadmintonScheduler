// 計分頁的本地 CSS / JS 網址必須帶版本號，且與 sw.js 的 CACHE_NAME 一致。
// 為什麼：sw.js 以 stale-while-revalidate 快取所有同源 GET，計分頁檔案網址固定時，
// 開過舊版計分頁的手機第一次打開新比賽會拿到「新 HTML＋舊 JS」（2026-11-17 review：
// 舊前端用 15 分制擋掉友誼賽的 21 分制比分）。網址帶版本號後舊快取一定找不到，第一次就是新版。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tournament.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const version = sw.match(/CACHE_NAME = 'hanlin-badminton-v(\d+)'/)[1];

const localAssets = [
  ...[...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => m[1]),
];

test('tournament.html 至少引用了計分頁的 JS 與 CSS', () => {
  expect(localAssets.some((u) => u.startsWith('js/tournament.js'))).toBe(true);
  expect(localAssets.some((u) => u.startsWith('css/tournament.css'))).toBe(true);
});

test.each(localAssets)('%s 帶有與 CACHE_NAME 相同的版本號', (url) => {
  expect(url).toMatch(new RegExp(`\\?v=${version}$`));
});

// 輸分頁改白色（2026-11-19）：顏色要在 body 畫出來之前決定，才不會先黑一下再變白，
// 所以 page-theme.js 放 <head>，且要排在它依賴的 tournament-form.js（parseTokenFromUrl）之後。
test('page-theme.js 在 <head>、排在 tournament-form.js 之後；body 不再重複載 tournament-form.js', () => {
  const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  // 比對 <script src=…> 標籤本身，不比對純文字：註解裡提到檔名不算載入
  const formAt = head.indexOf('<script src="js/tournament-form.js');
  const themeAt = head.indexOf('<script src="js/page-theme.js');
  expect(formAt).toBeGreaterThan(-1);
  expect(themeAt).toBeGreaterThan(formAt);
  expect(body).not.toContain('<script src="js/tournament-form.js');
  expect(body).toContain('<script src="js/tournament.js');
});

// 直播疊加比分頁（2026-11-18）：同樣受 SW 快取影響，資源網址也要帶同一個版本號
const overlayHtml = fs.readFileSync(path.join(root, 'overlay.html'), 'utf8');
const overlayAssets = [
  ...[...overlayHtml.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]),
  ...[...overlayHtml.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => m[1]),
];

test('overlay.html 引用疊加頁的 JS 與 CSS', () => {
  expect(overlayAssets.some((u) => u.startsWith('js/overlay.js'))).toBe(true);
  expect(overlayAssets.some((u) => u.startsWith('css/overlay.css'))).toBe(true);
});

test.each(overlayAssets)('overlay.html 的 %s 帶有與 CACHE_NAME 相同的版本號', (url) => {
  expect(url).toMatch(new RegExp(`\\?v=${version}$`));
});
