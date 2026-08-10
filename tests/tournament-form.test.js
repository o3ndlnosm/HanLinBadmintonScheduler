const { parseTokenFromUrl, validateScores, matchState, formatLineup } = require('../js/tournament-form');

describe('parseTokenFromUrl', () => {
  test('?c= 為隊長模式', () => {
    expect(parseTokenFromUrl('?c=abc123')).toEqual({ mode: 'captain', token: 'abc123' });
  });
  test('?t= 為觀賽模式', () => {
    expect(parseTokenFromUrl('?t=pub456')).toEqual({ mode: 'public', token: 'pub456' });
  });
  test('c 與 t 同時存在時隊長優先', () => {
    expect(parseTokenFromUrl('?t=pub&c=cap')).toEqual({ mode: 'captain', token: 'cap' });
  });
  test('無參數 → mode null', () => {
    expect(parseTokenFromUrl('')).toEqual({ mode: null, token: null });
  });
});

describe('validateScores', () => {
  test('合法比分', () => {
    expect(validateScores('21', '15')).toEqual({ ok: true, scoreSelf: 21, scoreOpp: 15 });
  });
  test('0 分合法', () => {
    expect(validateScores('21', '0')).toEqual({ ok: true, scoreSelf: 21, scoreOpp: 0 });
  });
  // 15 分制：14 平後需淨勝 2 分，20 平後先得 21 分者勝，故上限為 21
  test('21 分為上限，21:20 合法', () => {
    expect(validateScores('21', '20')).toEqual({ ok: true, scoreSelf: 21, scoreOpp: 20 });
  });
  test.each([
    ['', '15'], ['21', ''], ['abc', '15'], ['12.5', '15'], ['-1', '15'], ['22', '15'], ['15', '25'],
  ])('非 0–21 整數（%s, %s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b)).toEqual({ ok: false, error: '比分需為 0–21 的整數' });
  });
  test('平手 → 錯誤', () => {
    expect(validateScores('21', '21')).toEqual({ ok: false, error: '羽球比賽不會平手，請確認比分' });
  });
});

describe('matchState', () => {
  const match = { id: 'm1', teamAId: 'TA', teamBId: 'TB', status: 'pending', scoreA: null, scoreB: null };
  const myCtx = (reports) => ({ myTeamId: 'TA', reports });

  test('confirmed → 已確認、不可回報', () => {
    expect(matchState({ ...match, status: 'confirmed' }, myCtx({}))).toEqual(
      { label: '已確認', cssClass: 'confirmed', canReport: false });
  });
  test('conflict＋自己的場次 → 可重送', () => {
    expect(matchState({ ...match, status: 'conflict' }, myCtx({}))).toEqual(
      { label: '比分不一致', cssClass: 'conflict', canReport: true });
  });
  test('conflict＋非自己的場次 → 不可回報', () => {
    expect(matchState({ ...match, status: 'conflict' }, { myTeamId: 'TX', reports: {} })).toEqual(
      { label: '比分不一致', cssClass: 'conflict', canReport: false });
  });
  test('pending＋觀賽（ctx null）→ 未完成', () => {
    expect(matchState(match, null)).toEqual({ label: '未完成', cssClass: 'pending', canReport: false });
  });
  test('pending＋雙方皆未報 → 請輸入比分', () => {
    expect(matchState(match, myCtx({ m1: { myReport: null, oppReported: false } }))).toEqual(
      { label: '請輸入比分', cssClass: 'action-needed', canReport: true });
  });
  test('pending＋我方已報對方未報 → 等待對方確認', () => {
    expect(matchState(match, myCtx({ m1: { myReport: { scoreA: 21, scoreB: 15 }, oppReported: false } }))).toEqual(
      { label: '等待對方確認', cssClass: 'waiting', canReport: true });
  });
  test('pending＋對方已報我方未報 → 提示輸入（2026-08-03 縮短為 5 字，見 375px 版面實測）', () => {
    expect(matchState(match, myCtx({ m1: { myReport: null, oppReported: true } }))).toEqual(
      { label: '對方已回報', cssClass: 'action-needed', canReport: true });
  });
});

describe('formatLineup', () => {
  test('兩位選手以・相接', () => {
    expect(formatLineup([{ name: '小悠' }, { name: '雨彤' }])).toBe('小悠・雨彤');
  });

  test('單一選手直接回傳名字', () => {
    expect(formatLineup([{ name: 'Alan' }])).toBe('Alan');
  });

  test('三位以上全部列出', () => {
    expect(formatLineup([{ name: '甲' }, { name: '乙' }, { name: '丙' }])).toBe('甲・乙・丙');
  });

  test('空陣列回空字串', () => {
    expect(formatLineup([])).toBe('');
  });

  test('undefined 回空字串（RPC 尚未更新時的情況）', () => {
    expect(formatLineup(undefined)).toBe('');
  });

  test('非陣列回空字串（人為誤植）', () => {
    expect(formatLineup({ name: '小悠' })).toBe('');
  });

  test('略過沒有 name 的項目', () => {
    expect(formatLineup([{ name: '小悠' }, {}, { name: '雨彤' }])).toBe('小悠・雨彤');
  });

  test('名字前後空白會被去除', () => {
    expect(formatLineup([{ name: ' 小悠 ' }, { name: '雨彤' }])).toBe('小悠・雨彤');
  });
});
