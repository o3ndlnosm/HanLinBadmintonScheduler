/**
 * 比賽頁純函式：網址解析、比分驗證、場次狀態呈現
 * 與 DOM 無關，jest 可直接測
 */
function parseTokenFromUrl(search) {
  const params = new URLSearchParams(search);
  const captain = params.get('c');
  if (captain) return { mode: 'captain', token: captain };
  const pub = params.get('t');
  if (pub) return { mode: 'public', token: pub };
  return { mode: null, token: null };
}

// 計分規則依比賽設定（tournaments.score_rule）。後端 tournament_score_legal 為同一份規則的 SQL 版本，改規則兩邊要同步。
// to15_cap21（預設，第三屆）：15 分制、一定打完；14 平後淨勝 2，20 平後先得 21 分者勝。
//   合法完賽比分：15:0–13；16–20 帶淨勝 2；21:19、21:20。
// to21_cap30（2026-11-25 友誼賽）：21 分一局；20 平後淨勝 2，29 平時先得 30 分者勝。
//   合法完賽比分：21:0–19；22–29 帶淨勝 2；30:28、30:29。
const DEFAULT_SCORE_RULE = 'to15_cap21';
const SCORE_RULES = {
  to15_cap21: {
    max: 21,
    isLegal(w, l) {
      if (w === 15) return l <= 13;
      if (w >= 16 && w <= 20) return l === w - 2;
      if (w === 21) return l === 19 || l === 20;
      return false;
    },
    ruleError: '比分不符合賽制（15 分制、deuce 最高 21 分），請確認',
  },
  to21_cap30: {
    max: 30,
    isLegal(w, l) {
      if (w === 21) return l <= 19;
      if (w >= 22 && w <= 29) return l === w - 2;
      if (w === 30) return l === 28 || l === 29;
      return false;
    },
    ruleError: '比分不符合賽制（21 分制、deuce 最高 30 分），請確認',
  },
};

// 缺值或不認得的規則一律視為 15 分制：舊後端不會回 scoreRule，舊比賽行為必須不變
function resolveScoreRule(rule) {
  return Object.prototype.hasOwnProperty.call(SCORE_RULES, rule) ? rule : DEFAULT_SCORE_RULE;
}

function maxScoreOf(rule) {
  return SCORE_RULES[resolveScoreRule(rule)].max;
}

function isLegalFinalScore(a, b, rule) {
  return SCORE_RULES[resolveScoreRule(rule)].isLegal(Math.max(a, b), Math.min(a, b));
}

function validateScores(selfInput, oppInput, rule) {
  const spec = SCORE_RULES[resolveScoreRule(rule)];
  const selfStr = String(selfInput).trim();
  const oppStr = String(oppInput).trim();
  const s = Number(selfStr);
  const o = Number(oppStr);
  if (
    selfStr === '' || oppStr === '' ||
    !Number.isInteger(s) || !Number.isInteger(o) ||
    s < 0 || s > spec.max || o < 0 || o > spec.max
  ) {
    return { ok: false, error: `比分需為 0–${spec.max} 的整數` };
  }
  if (s === o) return { ok: false, error: '羽球比賽不會平手，請確認比分' };
  if (!spec.isLegal(Math.max(s, o), Math.min(s, o))) {
    return { ok: false, error: spec.ruleError };
  }
  return { ok: true, scoreSelf: s, scoreOpp: o };
}

// captainCtx：null（觀賽模式，或比賽已結束鎖定輸入）或 { myTeamId, reports }
function matchState(match, captainCtx) {
  if (match.status === 'confirmed') {
    return { label: '已確認', cssClass: 'confirmed', canReport: false };
  }
  const isMine =
    !!captainCtx &&
    (match.teamAId === captainCtx.myTeamId || match.teamBId === captainCtx.myTeamId);
  if (match.status === 'conflict') {
    return { label: '比分不一致', cssClass: 'conflict', canReport: isMine };
  }
  // pending
  if (!isMine) return { label: '未完成', cssClass: 'pending', canReport: false };
  const report = (captainCtx.reports || {})[match.id] || { myReport: null, oppReported: false };
  if (report.myReport && !report.oppReported) {
    return { label: '等待對方確認', cssClass: 'waiting', canReport: true };
  }
  if (!report.myReport && report.oppReported) {
    // 2026-08-03：原文案「對方已回報，請輸入比分」(11 字) 在 375px 手機版讓結果欄過寬，
    // 壓縮隊名欄導致長隊名逐字直排斷成多行、列高暴增（見 375px 實測），改成 5 字縮短版。
    return { label: '對方已回報', cssClass: 'action-needed', canReport: true };
  }
  return { label: '請輸入比分', cssClass: 'action-needed', canReport: true };
}

// 出賽選手名字：[{name:' 小悠 '},{},{name:'雨彤'}] → ['小悠','雨彤']；名單缺漏或格式不符回空陣列
function lineupNames(players) {
  if (!Array.isArray(players)) return [];
  return players
    .map((p) => (p && typeof p.name === 'string' ? p.name.trim() : ''))
    .filter((n) => n !== '');
}

// 出賽選手名單格式化：[{name:'小悠'},{name:'雨彤'}] → '小悠・雨彤'
// 名單缺漏或格式不符時一律回空字串，呼叫端據此退回「只顯示隊名」的版面
function formatLineup(players) {
  return lineupNames(players).join('・');
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseTokenFromUrl, validateScores, isLegalFinalScore, matchState, formatLineup, lineupNames,
    SCORE_RULES, resolveScoreRule, maxScoreOf,
  };
}
