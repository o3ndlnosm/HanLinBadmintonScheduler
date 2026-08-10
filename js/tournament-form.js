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

function validateScores(selfInput, oppInput) {
  const selfStr = String(selfInput).trim();
  const oppStr = String(oppInput).trim();
  const s = Number(selfStr);
  const o = Number(oppStr);
  if (
    selfStr === '' || oppStr === '' ||
    !Number.isInteger(s) || !Number.isInteger(o) ||
    s < 0 || s > 21 || o < 0 || o > 21
  ) {
    return { ok: false, error: '比分需為 0–21 的整數' };
  }
  if (s === o) return { ok: false, error: '羽球比賽不會平手，請確認比分' };
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

// 出賽選手名單格式化：[{name:'小悠'},{name:'雨彤'}] → '小悠・雨彤'
// 名單缺漏或格式不符時一律回空字串，呼叫端據此退回「只顯示隊名」的版面
function formatLineup(players) {
  if (!Array.isArray(players)) return '';
  return players
    .map((p) => (p && typeof p.name === 'string' ? p.name.trim() : ''))
    .filter((n) => n !== '')
    .join('・');
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseTokenFromUrl, validateScores, matchState, formatLineup };
}
