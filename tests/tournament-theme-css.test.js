// 輸分頁改白色（spec：docs/superpowers/specs/2026-11-19-captain-light-theme-design.md）
// 反目標：觀賽頁外觀有任何變化；白底上出現看不清的字或黑底色塊。
// 做法是只在 css/tournament.css 檔尾新增 `:root.theme-light` 與 `.theme-light …` 覆寫，原規則不動。
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tournament.css'), 'utf8');

// 取出某個區塊（selector 後面第一對大括號）裡的 --f1-* 宣告
function varsOf(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out = {};
  for (const m of body.matchAll(/(--f1-[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const dark = varsOf(':root');
const light = varsOf(':root.theme-light');

test('觀賽頁（黑色版）原值不變', () => {
  expect(dark['--f1-bg']).toBe('#26262b');
  expect(dark['--f1-panel']).toBe('#000000');
  expect(dark['--f1-fg']).toBe('#ffffff');
  expect(dark['--f1-win']).toBe('#37c871');
});

test('黑色版每個顏色變數，白色版都有自己的值（--f1-red 除外，兩版同色）', () => {
  const colorVars = Object.keys(dark).filter((k) => /^#|^rgb/.test(dark[k]) && k !== '--f1-red');
  expect(colorVars.length).toBeGreaterThan(0);
  colorVars.forEach((k) => expect([k, light[k]]).toEqual([k, expect.any(String)]));
});

test('白色版色值照 spec', () => {
  expect(light).toMatchObject({
    '--f1-bg': '#f2f2f5', '--f1-panel': '#ffffff', '--f1-line': '#dcdce2',
    '--f1-fg': '#15151e', '--f1-fg-muted': '#5c5c66', '--f1-fg-faint': '#767680',
    '--f1-conflict': '#c8102e', '--f1-win': '#157a40', '--f1-wait': '#8f5b00',
  });
});

// 對比（WCAG 2.x 相對亮度公式）：狀態字落在實際會出現的底色上要 ≥ 4.5:1。
// 2026-11-19 review：原本的綠 #1a8a4a、黃 #a86b00 在自己場次列（淡紅底）上只有約 4.0，連線異常框的黃字只有 3.65。
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function over(fg, alpha, bg) { // 半透明色疊在底色上的實際顏色
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('白色版狀態字在實際底色上的對比 ≥ 4.5', () => {
  const panel = rgbOf(light['--f1-panel'] || '#000000');
  const page = rgbOf(light['--f1-bg'] || '#000000');
  const mineRow = over([225, 6, 0], 0.05, panel); // .match-row.match-mine 的淡紅底
  const offlineBox = over([230, 164, 23], 0.12, page); // .offline-box 的淡黃底（疊在頁底上）
  test.each([
    ['--f1-win（已確認）', '--f1-win', 'panel', panel],
    ['--f1-win（已確認）', '--f1-win', '自己場次列', mineRow],
    ['--f1-wait（等待）', '--f1-wait', 'panel', panel],
    ['--f1-wait（等待）', '--f1-wait', '自己場次列', mineRow],
    ['--f1-wait（連線異常框）', '--f1-wait', '連線異常框', offlineBox],
    ['--f1-conflict（比分不一致）', '--f1-conflict', '自己場次列', mineRow],
    ['--f1-fg-muted（次要字）', '--f1-fg-muted', 'panel', panel],
  ])('%s 在 %s', (_label, key, _where, bg) => {
    expect(contrast(rgbOf(light[key]), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

test.each([
  '.theme-light .report-modal',
  '.theme-light .score-inputs input',
  '.theme-light .tournament-page .app-toast',
  '.theme-light .report-overlay',
  '.theme-light .cheer-btn:active',
  '.theme-light .event-chip.男雙',
  '.theme-light .event-chip.女雙',
  '.theme-light .event-chip.混雙',
])('寫死深色的地方有白色版覆寫：%s', (selector) => {
  expect(css).toContain(`${selector} {`);
});
