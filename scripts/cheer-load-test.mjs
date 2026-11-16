#!/usr/bin/env node
// 公司應援負載實測：模擬 N 支手機同時狂按 S 秒。
// 用法：node scripts/cheer-load-test.mjs <public_token> <teamAId> <teamBId> [clients=50] [seconds=60]
// 每支模擬手機：每 2 秒 tournament_cheer（n=10，隨機一隊）、每 3 秒 tournament_cheer_totals、
//              每 10 秒 tournament_public_view（同前端的實際節奏）。
// 通過標準（spec）：錯誤率 0%、p95 < 1500 ms。只對測試比賽跑；token 由命令列帶入，不寫進任何檔案。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [token, teamA, teamB, clientsArg = '50', secondsArg = '60'] = process.argv.slice(2);
if (!token || !teamA || !teamB) {
  console.error('用法：node scripts/cheer-load-test.mjs <public_token> <teamAId> <teamBId> [clients] [seconds]');
  process.exit(2);
}
const CLIENTS = Number(clientsArg);
const SECONDS = Number(secondsArg);

// 連線設定沿用前端，避免兩份 key 不同步
const apiSrc = readFileSync(fileURLToPath(new URL('../js/tournament-api.js', import.meta.url)), 'utf8');
const URL_BASE = apiSrc.match(/TOURNAMENT_SUPABASE_URL = '([^']+)'/)[1];
const KEY = apiSrc.match(/TOURNAMENT_SUPABASE_ANON_KEY = '([^']+)'/)[1];

const stats = {};
async function rpc(fn, args) {
  const s = (stats[fn] ||= { ok: 0, err: 0, ms: [], errors: {} });
  const t0 = performance.now();
  try {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(args),
    });
    await res.text();
    s.ms.push(performance.now() - t0);
    if (res.ok) s.ok += 1;
    else { s.err += 1; s.errors[res.status] = (s.errors[res.status] || 0) + 1; }
  } catch (e) {
    s.ms.push(performance.now() - t0);
    s.err += 1;
    s.errors[e.name] = (s.errors[e.name] || 0) + 1;
  }
}

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function client(deadline) {
  // 錯開起跑，模擬手機陸續加入
  await new Promise((r) => setTimeout(r, Math.random() * 2000));
  // 診斷用：SKIP_CHEER=1 只跑讀取，用來分辨瓶頸是應援寫入還是整體請求量
  const timers = [
    process.env.SKIP_CHEER ? null
      : setInterval(() => rpc('tournament_cheer', { p_token: token, p_team: Math.random() < 0.5 ? teamA : teamB, p_n: 10 }), 2000),
    setInterval(() => rpc('tournament_cheer_totals', { p_token: token }), 3000),
    setInterval(() => rpc('tournament_public_view', { p_token: token }), 10000),
  ];
  await new Promise((r) => setTimeout(r, deadline - Date.now()));
  timers.filter(Boolean).forEach(clearInterval);
}

const startedAt = new Date();
const deadline = Date.now() + SECONDS * 1000;
console.log(`開始：${startedAt.toISOString()}，${CLIENTS} 支模擬手機 × ${SECONDS} 秒，目標 ${URL_BASE}`);
await Promise.all(Array.from({ length: CLIENTS }, () => client(deadline)));
await new Promise((r) => setTimeout(r, 3000)); // 等最後一批請求回來

let totalReq = 0;
let totalErr = 0;
let worstP95 = 0;
for (const [fn, s] of Object.entries(stats)) {
  const n = s.ok + s.err;
  totalReq += n;
  totalErr += s.err;
  const p95 = pct(s.ms, 95);
  worstP95 = Math.max(worstP95, p95);
  console.log(`${fn.padEnd(26)} 請求 ${String(n).padStart(5)}  錯誤 ${s.err}${s.err ? ' ' + JSON.stringify(s.errors) : ''}  ` +
    `p50 ${pct(s.ms, 50).toFixed(0)} ms  p95 ${p95.toFixed(0)} ms  max ${Math.max(...s.ms).toFixed(0)} ms`);
}
const rps = totalReq / SECONDS;
const pass = totalErr === 0 && worstP95 < 1500;
console.log(`合計 ${totalReq} 請求（約 ${rps.toFixed(1)} req/s），錯誤 ${totalErr}，最差 p95 ${worstP95.toFixed(0)} ms → ${pass ? 'PASS' : 'FAIL'}（標準：錯誤 0、p95 < 1500 ms）`);
process.exit(pass ? 0 : 1);
