/**
 * @jest-environment jsdom
 */
// 輸分頁改白色（spec：docs/superpowers/specs/2026-11-19-captain-light-theme-design.md）
// 輸分連結（?c=）用白色版、觀賽連結（?t=）維持黑色版，避免兩種頁面被搞混。
// 判斷規則只沿用 parseTokenFromUrl，不另寫一份網址規則。
Object.assign(global, require('../js/tournament-form'));
const { pageThemeFor, applyPageTheme } = require('../js/page-theme');

test.each([
  ['?c=cap123', 'light'],
  ['?t=pub123', 'dark'],
  ['', 'dark'],
  ['?c=&t=pub123', 'dark'],
  ['?t=pub123&c=cap123', 'light'],
])('pageThemeFor(%s) → %s', (search, theme) => {
  expect(pageThemeFor(search)).toBe(theme);
});

test('applyPageTheme light：<html> 加 theme-light、theme-color 改白', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  applyPageTheme(document, 'light');
  expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#ffffff');
});

test('applyPageTheme dark：拿掉 theme-light、theme-color 回黑', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  document.documentElement.classList.add('theme-light');
  applyPageTheme(document, 'dark');
  expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#000000');
});

test('沒有 theme-color meta 時不拋錯，class 照樣加上', () => {
  document.head.innerHTML = '';
  expect(() => applyPageTheme(document, 'light')).not.toThrow();
  expect(document.documentElement.classList.contains('theme-light')).toBe(true);
});
