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
    '--f1-conflict': '#c8102e', '--f1-win': '#1a8a4a', '--f1-wait': '#a86b00',
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
