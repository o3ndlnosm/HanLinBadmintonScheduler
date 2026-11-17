#!/usr/bin/env node
// 公司應援負載實測：模擬 N 支手機同時狂按 S 秒。
// 用法：node scripts/cheer-load-test.mjs <public_token> <teamAId> <teamBId> [clients=50] [seconds=60]
// 每支模擬手機：每 2 秒 tournament_cheer（n=10，隨機一隊）、每 3 秒 tournament_cheer_totals、
//              每 10 秒 tournament_public_view（同前端的實際節奏）。
// 通過標準（spec）：錯誤率 0%、p95 < 1500 ms。只對測試比賽跑；token 由命令列帶入，不寫進任何檔案。
//
// 為什麼不用 fetch：Node 的 fetch 會把陸續加入的模擬手機請求集中到少數幾條既有的 HTTP/2 連線上排隊
// （2026-11-17 量測：25 支手機只開 4 條連線、最多 112 個請求卡在客戶端，p50 4 s；同負載從 Chrome 發 p95 128 ms）。
// 真實情境是每支手機的瀏覽器各自一條 HTTP/2 連線並多工送出，所以這裡每支模擬手機開一個 node:http2 session。
import { readFileSync } from 'node:fs';
import http2 from 'node:http2';
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
function record(fn, ms, errKey) {
  const s = (stats[fn] ||= { ok: 0, err: 0, ms: [], errors: {} });
  s.ms.push(ms);
  if (errKey) { s.err += 1; s.errors[errKey] = (s.errors[errKey] || 0) + 1; } else s.ok += 1;
}

// 一支模擬手機 = 一條 HTTP/2 連線，請求在上面多工送出（同瀏覽器）
function makePhone() {
  const session = http2.connect(URL_BASE);
  session.on('error', () => {}); // 個別請求的錯誤由 request 的 error 事件記錄
  const rpc = (fn, args) => new Promise((resolve) => {
    const t0 = performance.now();
    const body = JSON.stringify(args);
    let req;
    try {
      req = session.request({
        ':method': 'POST', ':path': `/rest/v1/rpc/${fn}`,
        'content-type': 'application/json', apikey: KEY, authorization: `Bearer ${KEY}`,
      });
    } catch (e) {
      record(fn, performance.now() - t0, e.code || e.name);
      resolve();
      return;
    }
    let status = 0;
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', () => {});
    req.on('end', () => {
      record(fn, performance.now() - t0, status >= 200 && status < 300 ? null : String(status));
      resolve();
    });
    req.on('error', (e) => { record(fn, performance.now() - t0, e.code || e.name); resolve(); });
    req.setTimeout(20000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.end(body);
  });
  return { rpc, close: () => session.close() };
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
  const phone = makePhone();
  const timers = [
    process.env.SKIP_CHEER ? null
      : setInterval(() => phone.rpc('tournament_cheer', { p_token: token, p_team: Math.random() < 0.5 ? teamA : teamB, p_n: 10 }), 2000),
    setInterval(() => phone.rpc('tournament_cheer_totals', { p_token: token }), 3000),
    setInterval(() => phone.rpc('tournament_public_view', { p_token: token }), 10000),
  ];
  await new Promise((r) => setTimeout(r, deadline - Date.now()));
  timers.filter(Boolean).forEach(clearInterval);
  setTimeout(() => phone.close(), 3000); // 等最後一批回應再關連線
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
