const {
  parseTokenFromUrl, validateScores, matchState, formatLineup, lineupNames, resolveScoreRule, maxScoreOf,
} = require('../js/tournament-form');

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
  // 賽制：15 分制、一定打完。14 平後 deuce 需淨勝 2 分，20 平後先得 21 分者勝（上限 21）。
  // 合法完賽比分：15:0–13；16:14、17:15、18:16、19:17、20:18；21:19、21:20。
  test.each([
    ['15', '0'], ['15', '13'], ['16', '14'], ['17', '15'], ['18', '16'],
    ['19', '17'], ['20', '18'], ['21', '19'], ['21', '20'],
    // 輸方視角（自己分數較低）也要合法
    ['13', '15'], ['20', '21'],
  ])('合法完賽比分（%s:%s）', (a, b) => {
    expect(validateScores(a, b)).toEqual({ ok: true, scoreSelf: Number(a), scoreOpp: Number(b) });
  });
  test.each([
    ['', '15'], ['21', ''], ['abc', '15'], ['12.5', '15'], ['-1', '15'], ['22', '15'], ['15', '25'],
  ])('非 0–21 整數（%s, %s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b)).toEqual({ ok: false, error: '比分需為 0–21 的整數' });
  });
  test('平手 → 錯誤', () => {
    expect(validateScores('21', '21')).toEqual({ ok: false, error: '羽球比賽不會平手，請確認比分' });
  });
  test.each([
    ['14', '12'],  // 沒人到 15，比賽不會停
    ['16', '15'],  // deuce 中僅領先 1 分，不會結束
    ['15', '14'],  // 14 平後需淨勝 2，15:14 不是完賽比分
    ['21', '18'],  // 20:18 就結束了，不可能打到 21:18
    ['21', '15'],  // 同上，deuce 領先 2 分即止
    ['18', '15'],  // deuce 區間領先 3 分，不可能
    ['13', '11'],
    ['0', '14'],
  ])('不符合賽制的比分（%s:%s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b)).toEqual({
      ok: false,
      error: '比分不符合賽制（15 分制、deuce 最高 21 分），請確認',
    });
  });
});

describe('validateScores — to21_cap30（2026-11-25 貿聯×翰林友誼賽）', () => {
  // 賽制：21 分一局；20 平後須淨勝 2 分；29 平時先得第 30 分者勝。
  // 合法完賽比分：21:0–19；22–29 勝方對方 = 勝方 − 2；30:28、30:29。
  const R = 'to21_cap30';
  test.each([
    ['21', '0'], ['21', '19'], ['22', '20'], ['25', '23'], ['29', '27'], ['30', '28'], ['30', '29'],
    // 輸方視角
    ['19', '21'], ['29', '30'],
  ])('合法完賽比分（%s:%s）', (a, b) => {
    expect(validateScores(a, b, R)).toEqual({ ok: true, scoreSelf: Number(a), scoreOpp: Number(b) });
  });
  test.each([
    ['20', '21'],  // 20 平後不能以 1 分差結束
    ['21', '20'],
    ['22', '21'],  // 孟娜明確舉例不可出現
    ['30', '27'],  // 28:27 時就不會打到 30
    ['23', '20'],  // deuce 區間領先 3 分，不可能
    ['20', '18'],  // 沒人到 21
  ])('不符合賽制（%s:%s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b, R)).toEqual({
      ok: false,
      error: '比分不符合賽制（21 分制、deuce 最高 30 分），請確認',
    });
  });
  test.each([
    ['31', '29'], ['', '21'], ['12.5', '21'], ['-1', '21'],
  ])('非 0–30 整數（%s, %s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b, R)).toEqual({ ok: false, error: '比分需為 0–30 的整數' });
  });
  test('平手 → 錯誤', () => {
    expect(validateScores('21', '21', R)).toEqual({ ok: false, error: '羽球比賽不會平手，請確認比分' });
  });
});

describe('resolveScoreRule / maxScoreOf', () => {
  test('缺值或不認得的規則一律退回 15 分制（舊比賽行為）', () => {
    expect(resolveScoreRule(undefined)).toBe('to15_cap21');
    expect(resolveScoreRule('xx')).toBe('to15_cap21');
    expect(resolveScoreRule('to21_cap30')).toBe('to21_cap30');
  });
  test('上限分數依規則', () => {
    expect(maxScoreOf('to21_cap30')).toBe(30);
    expect(maxScoreOf('to15_cap21')).toBe(21);
    expect(maxScoreOf(undefined)).toBe(21);
  });
  test('不帶規則時 15 分制的 22:20 仍視為超出範圍', () => {
    expect(validateScores('22', '20')).toEqual({ ok: false, error: '比分需為 0–21 的整數' });
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

// 賽程列逐位選手排版用（2026-11-20：名字只在人與人之間折行）；formatLineup 是它用・接起來的結果
describe('lineupNames', () => {
  test('依序回傳每位選手的名字', () => {
    expect(lineupNames([{ name: '王小明Ming' }, { name: '李小華Hua' }])).toEqual(['王小明Ming', '李小華Hua']);
  });

  test('去掉前後空白、略過沒有名字或空白的項目', () => {
    expect(lineupNames([{ name: ' 小悠 ' }, {}, null, { name: '   ' }, { name: '雨彤' }])).toEqual(['小悠', '雨彤']);
  });

  test('不是陣列（未灌資料、RPC 尚未更新、人為誤植）回空陣列', () => {
    expect(lineupNames(undefined)).toEqual([]);
    expect(lineupNames({ name: '小悠' })).toEqual([]);
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
