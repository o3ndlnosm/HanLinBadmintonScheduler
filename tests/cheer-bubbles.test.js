/**
 * @jest-environment jsdom
 */
// 2026-11-17 應援泡泡：固定口號、每側同時最多 3 個、跑完移除、動畫建立失敗不留元素
const { cheerSlogans, createBubbleLayer, CHEER_BUBBLE_MAX_PER_SIDE } = require('../js/cheer');

let anims;
let layer;

beforeEach(() => {
  document.body.innerHTML = '<div id="layer"></div>';
  layer = document.getElementById('layer');
  anims = [];
  Element.prototype.animate = function () {
    const a = { onfinish: null, oncancel: null };
    anims.push(a);
    return a;
  };
});

const bubbles = (side) => layer.querySelectorAll(`.cheer-bubble${side ? `.cheer-bubble-${side}` : ''}`);

test('口號：通用 6 句＋帶隊名 3 句', () => {
  expect(cheerSlogans('貿聯')).toEqual([
    '加油！', '衝啊！', '好球！', '穩住！', '漂亮！', '拿下這分！',
    '貿聯加油！', '貿聯衝衝衝！', '貿聯必勝！',
  ]);
});

test('冒一個泡泡：文字、隊色、從左側', () => {
  const layerApi = createBubbleLayer(layer);
  expect(layerApi.pop('a', '加油！', '#e10600')).toBe(true);
  const [el] = bubbles('a');
  expect(bubbles()).toHaveLength(1);
  expect(el.textContent).toBe('加油！');
  expect(el.style.backgroundColor).toBe('rgb(225, 6, 0)');
  expect(el.style.left).not.toBe('');
  expect(el.style.right).toBe('');
});

test('每側同時最多 3 個，另一側不受影響', () => {
  expect(CHEER_BUBBLE_MAX_PER_SIDE).toBe(3);
  const api = createBubbleLayer(layer);
  const results = [1, 2, 3, 4].map(() => api.pop('a', '衝啊！', '#e10600'));
  expect(results).toEqual([true, true, true, false]);
  expect(api.live('a')).toBe(3);
  expect(api.pop('b', '翰林加油！', '#00a19c')).toBe(true);
  const [b] = bubbles('b');
  expect(b.style.right).not.toBe('');
  expect(b.style.left).toBe('');
});

test('動畫結束移除元素、只減一次；取消也移除', () => {
  const api = createBubbleLayer(layer);
  api.pop('a', '好球！', '#e10600');
  api.pop('a', '穩住！', '#e10600');
  api.pop('a', '漂亮！', '#e10600');
  anims[0].onfinish();
  expect(bubbles('a')).toHaveLength(2);
  expect(api.live('a')).toBe(2);
  anims[0].onfinish();
  expect(api.live('a')).toBe(2);
  anims[1].oncancel();
  expect(bubbles('a')).toHaveLength(1);
  expect(api.live('a')).toBe(1);
});

test('瀏覽器不支援動畫：不冒、不留元素', () => {
  layer.animate = undefined;
  const api = createBubbleLayer(layer);
  expect(api.pop('a', '加油！', '#e10600')).toBe(false);
  expect(bubbles()).toHaveLength(0);
});

test('動畫建立失敗：不冒、不留元素、不佔上限', () => {
  Element.prototype.animate = () => { throw new Error('boom'); };
  const api = createBubbleLayer(layer);
  expect(api.pop('a', '加油！', '#e10600')).toBe(false);
  expect(bubbles()).toHaveLength(0);
  expect(api.live('a')).toBe(0);
});

describe('泡泡的字色與外框（2026-11-25 友誼賽代表色）', () => {
  test('給 ink 與 edge：字用 ink、加 1px edge 外框', () => {
    const api = createBubbleLayer(layer);
    expect(api.pop('b', '翰林加油！', '#ffffff', { ink: '#14649c', edge: '#187fc4' })).toBe(true);
    const [el] = bubbles('b');
    expect(el.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(el.style.color).toBe('rgb(20, 100, 156)');
    expect(el.style.border).toMatch(/1px solid/);
    expect(el.style.border).toMatch(/#187fc4|rgb\(24, 127, 196\)/);
  });

  test('edge 與底色相同：不加外框', () => {
    const api = createBubbleLayer(layer);
    api.pop('a', '貿聯加油！', '#0077cb', { ink: '#ffffff', edge: '#0077cb' });
    expect(bubbles('a')[0].style.border).toBe('');
  });

  test('沒給第四個參數：沿用 CSS 的白字、沒有外框', () => {
    const api = createBubbleLayer(layer);
    api.pop('a', '加油！', '#e10600');
    const [el] = bubbles('a');
    expect(el.style.color).toBe('');
    expect(el.style.border).toBe('');
  });
});
