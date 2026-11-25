// 應援條交界光縫（2026-11-25）：原本白色圓點整顆放大縮小，翰林白底那側看起來像單方面往貿聯頂。
// 改成左右對稱的直立光縫：只能上下伸縮（scaleY），不得整顆 scale 往左右鼓；要有金色光暈，白底那側也看得到。
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tournament.css'), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}
function keyframes(name) {
  const start = css.indexOf(`@keyframes ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(start, i + 1); }
  }
  return '';
}
const px = (body, prop) => Number((body.match(new RegExp(`(?:^|\\s)${prop}:\\s*(\\d+)px`)) || [])[1]);

test('交界光縫是直立的（比應援條高、寬度窄），不是圓點', () => {
  const core = block('.cheer-spark-core');
  expect(px(core, 'height')).toBeGreaterThan(px(block('.cheer-bar'), 'height'));
  expect(px(core, 'width')).toBeLessThan(px(core, 'height') / 2);
  expect(core).not.toMatch(/border-radius:\s*50%/);
});

test('有金色光暈：白底那一側也看得到', () => {
  expect(block('.cheer-spark-core')).toMatch(/box-shadow:[^;]*#ffd23f/i);
});

test('閃動只上下伸縮，不整顆放大縮小往左右鼓', () => {
  const kf = keyframes('cheer-flicker');
  expect(kf).toMatch(/scaleY\(/);
  expect(kf).not.toMatch(/scale\(|scaleX\(/);
});
