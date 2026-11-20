// 冠軍時刻的字型（2026-11-20 瀏覽器實看發現）：tournament.css 的 `.tournament-page *:not(i)`（specificity 0,1,1）
// 會蓋掉每個元素的 font-family，大數字變回 Titillium 細字、粗字也不是 Noto Sans TC 900。
// 宣告字型（font-family 或 font 簡寫）的規則，選擇器 specificity 一律要高過它。
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'champion-moment.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// 簡易 specificity：id／class 與屬性與偽類／元素與偽元素；:not(x) 算 x 的
function specificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  const rest = selector.trim().replace(/:not\(([^)]*)\)/g, (m, inner) => {
    const [ia, ib, ic] = specificity(inner);
    a += ia;
    b += ib;
    c += ic;
    return '';
  });
  a += (rest.match(/#[\w-]+/g) || []).length;
  b += (rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  c += (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length + (rest.match(/::[\w-]+/g) || []).length;
  return [a, b, c];
}
const higher = (x, y) => (x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2]);
const PAGE_RULE = specificity('.tournament-page *:not(i)');

test('specificity 小工具', () => {
  expect(PAGE_RULE).toEqual([0, 1, 1]);
  expect(specificity('.cm-hero .cm-hud *')).toEqual([0, 2, 0]);
  expect(specificity('.cm-title span')).toEqual([0, 1, 1]);
  expect(specificity('.cm-nums')).toEqual([0, 1, 0]);
});

test('宣告字型的規則，選擇器 specificity 都高過 .tournament-page *:not(i)', () => {
  const selectors = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /(^|;)\s*font(-family)?\s*:/.test(body))
    .flatMap(([, sel]) => sel.split(',').map((s) => s.trim()));
  expect(selectors.length).toBeGreaterThan(0);
  expect(selectors.filter((sel) => !higher(specificity(sel), PAGE_RULE))).toEqual([]);
});

test('大數字（主視覺比分、揭曉比分）用 Anton，其餘用 Noto Sans TC', () => {
  expect(css).toMatch(/--cm-font-num:\s*"Anton"/);
  expect(css).toMatch(/--cm-font-display:\s*"Noto Sans TC"/);
  expect(css).toMatch(/\.cm-hero \.cm-hud \.cm-nums[^{]*\{[^}]*font-family:\s*var\(--cm-font-num\)/);
  expect(css).toMatch(/\.cm-reveal-score[^{]*\{[^}]*font-family:\s*var\(--cm-font-num\)/);
});

// 2026-11-20 審查：iOS 15 Safari（iPhone 7 等停在 15 的機型）不支援容器單位，含 cqmin 的宣告整條失效，
// 大比分與「冠軍時刻」大字會掉回約 16px。每條含容器單位的宣告，前面都要有同屬性、不用容器單位的備援。
test('用到容器單位（cqmin）的宣告，同一條規則前面都有不用容器單位的備援', () => {
  const CQ = /\dcq(min|max|w|h|i|b)\b/;
  const missing = [];
  [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].forEach(([, sel, body]) => {
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
    decls.forEach(([prop, value], i) => {
      if (!CQ.test(value)) return;
      const hasFallback = decls.slice(0, i).some(([p, v]) => p === prop && !CQ.test(v));
      if (!hasFallback) missing.push(`${sel.trim()} → ${prop}`);
    });
  });
  expect(missing).toEqual([]);
});
