/**
 * v2 badminton-scheduler Supabase 後端的薄封裝（比賽模式三個 RPC）
 * anon key 為公開值，安全由 RLS 與 security definer RPC 把關（同 v1 寫死 Google API key 的模式）
 */
const TOURNAMENT_SUPABASE_URL = 'https://ijevdpufitfgqlbjsxbo.supabase.co'; // 部署前填入：v2 專案的 VITE_SUPABASE_URL
const TOURNAMENT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqZXZkcHVmaXRmZ3FsYmpzeGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjM3NjYsImV4cCI6MjA5OTQ5OTc2Nn0.UD4vvdn9ul9jb6UUhxCmM-AXRSYXRsN7sVO2hBm5H1g'; // 部署前填入：v2 專案的 VITE_SUPABASE_ANON_KEY

async function callTournamentRpc(fn, args) {
  const res = await fetch(`${TOURNAMENT_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: TOURNAMENT_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${TOURNAMENT_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.message) || `連線失敗（${res.status}）`);
  }
  return body;
}

function fetchPublicView(token) {
  return callTournamentRpc('tournament_public_view', { p_token: token });
}

function fetchCaptainView(token) {
  return callTournamentRpc('tournament_captain_view', { p_token: token });
}

function reportScore(token, matchId, scoreSelf, scoreOpp) {
  return callTournamentRpc('tournament_report_score', {
    p_token: token, p_match: matchId, p_score_self: scoreSelf, p_score_opp: scoreOpp,
  });
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchPublicView, fetchCaptainView, reportScore };
}
