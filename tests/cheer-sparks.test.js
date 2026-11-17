/**
 * @jest-environment jsdom
 */
// 2026-11-17 交界火花的火花層：顆數、同時存在上限、動畫結束移除、不支援動畫時不噴
const { createSparkLayer } = require('../js/cheer');

let finishers;
const realAnimate = Element.prototype.animate;

beforeEach(() => {
  finishers = [];
  Element.prototype.animate = function () {
    const anim = { onfinish: null };
    finishers.push(anim);
    return anim;
  };
  document.body.innerHTML = '<div id="fx"></div>';
});

afterAll(() => { Element.prototype.animate = realAnimate; });

const layerEl = () => document.getElementById('fx');

test('增加 1 → 噴 6 顆', () => {
  const layer = createSparkLayer(layerEl());
  expect(layer.burst(100, 7, 1, '#e10600', 1)).toBe(6);
  expect(layerEl().children).toHaveLength(6);
  expect(layer.live()).toBe(6);
});

test('同時存在的火花不超過上限', () => {
  const layer = createSparkLayer(layerEl(), 60);
  for (let i = 0; i < 10; i++) layer.burst(100, 7, -1, '#00a19c', 13);
  expect(layer.live()).toBe(60);
  expect(layerEl().children).toHaveLength(60);
});

test('動畫結束就移除元素', () => {
  const layer = createSparkLayer(layerEl());
  layer.burst(100, 7, 1, '#e10600', 1);
  finishers.forEach((a) => a.onfinish());
  expect(layerEl().children).toHaveLength(0);
  expect(layer.live()).toBe(0);
});

test('瀏覽器不支援動畫 → 不噴、不留元素', () => {
  Element.prototype.animate = undefined;
  const layer = createSparkLayer(layerEl());
  expect(layer.burst(100, 7, 1, '#e10600', 5)).toBe(0);
  expect(layerEl().children).toHaveLength(0);
});
