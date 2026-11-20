// 2026-11-20：選手名只在人與人之間折行（spec：docs/superpowers/specs/2026-11-20-captain-cheer-readonly-name-wrap-design.md）
// 每位選手的 span 是 inline-block（放不下就整塊換行）；單一名字比欄位還寬時會縮到欄寬、在塊內折行，max-width: 100% 只是保險。
// 實際版面靠瀏覽器 375px 實看；這裡只釘住規則存在。
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tournament.css'), 'utf8');

function declsOf(selector) {
  const m = css.match(new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  if (!m) return null;
  const out = {};
  for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

test('.side-player 是 inline-block、最寬不超過欄位', () => {
  expect(declsOf('.side-player')).toMatchObject({ display: 'inline-block', 'max-width': '100%' });
});

// 計分頁也載入排場主頁的 css/style.css；2026-11-20 第一版用 .player-name 撞到它（字放大成 1.4rem、加粗，
// 每位選手各佔一行）。jsdom 不載 CSS 測不到，所以釘住：計分頁選手名的 class 不能出現在 style.css。
test('計分頁選手名的 class 不跟排場主頁 style.css 撞名', () => {
  const tournamentJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'tournament.js'), 'utf8');
  const cls = tournamentJs.match(/nameEl\.className = '([\w-]+)'/)[1];
  const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  expect(styleCss).not.toMatch(new RegExp(`\\.${cls}(?![\\w-])`));
  expect(declsOf(`.${cls}`)).toMatchObject({ display: 'inline-block', 'max-width': '100%' });
});
