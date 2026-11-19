/**
 * 頁面顏色：輸分連結（?c=）用白色版，觀賽連結（?t=）維持黑色版，避免兩種頁面被搞混（2026-11-19 孟娜許願）。
 * spec：docs/superpowers/specs/2026-11-19-captain-light-theme-design.md
 *
 * 為什麼放 <head>：body 畫出來之前就替 <html> 標好 theme-light，畫面不會先黑一下再變白。
 * 相依：tournament-form.js 的 parseTokenFromUrl（tournament.html 在 head 先載它）。
 * 判斷規則只沿用 parseTokenFromUrl，不另寫一份網址規則，兩邊才不會各說各話。
 */
const PAGE_THEME_COLOR = { light: '#ffffff', dark: '#000000' };

function pageThemeFor(search) {
  return parseTokenFromUrl(search).mode === 'captain' ? 'light' : 'dark';
}

function applyPageTheme(doc, theme) {
  const light = theme === 'light';
  doc.documentElement.classList.toggle('theme-light', light);
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? PAGE_THEME_COLOR.light : PAGE_THEME_COLOR.dark);
}

if (typeof module === 'undefined') {
  applyPageTheme(document, pageThemeFor(location.search));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pageThemeFor, applyPageTheme };
}
