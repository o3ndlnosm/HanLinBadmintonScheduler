# 比賽計分頁（隊長輸分＋即時排名）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8/20 第三屆羽球賽的比賽頁：隊長各自用手機輸入比分（雙方一致才確認），即時排名與冠亞軍，公開計分板。

**Architecture:** v1 新增獨立頁 `tournament.html`（觀賽/隊長同一頁，網址 token 參數區分），純前端 vanilla JS，後端借用 v2 badminton-scheduler 已部署的 Supabase（三個 security definer RPC，狀態機在後端原子執行）。不碰現有排場系統任何檔案。

**Tech Stack:** 原生 JS/HTML/CSS（無建置流程）、jest 30（既有）、Supabase REST RPC（原生 `fetch`）。

**Spec:** `docs/superpowers/specs/2026-08-03-tournament-score-entry-design.md`

## Global Constraints

- 原生 JS，無建置流程，無新增 runtime 相依套件（QR 腳本用 `npx qrcode`，不進 package.json）
- 介面文字一律繁體中文
- 不修改 `index.html`、`js/script.js`、`css/style.css` 及任何既有模組
- 新 JS 模組一律用既有雙用匯出格式：檔尾 `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }`（瀏覽器以 `<script>` 載入靠全域函式，jest 以 `require` 載入）
- 比分規則：0–30 整數、不得平手（前端先擋，後端 RPC 亦驗）
- 排名規則：勝場 desc → 總得分 desc → 兩者皆同並列同名次（1,2,2,4）
- Supabase URL 與 anon key 由使用者提供後寫死於 `js/tournament-api.js`（anon key 為公開值，安全由 RLS 與 security definer RPC 把關）
- 測試指令：`npx jest tests/<檔名> -v`（全部：`npm test`）
- 每個 Task 完成即 commit，訊息用繁中、慣例前綴（feat/test/docs/chore）

## 後端介面備忘（v2 已存在，本計劃不改後端）

呼叫方式：`POST <SUPABASE_URL>/rest/v1/rpc/<fn>`，headers 帶 `Content-Type: application/json`、`apikey: <anon>`、`Authorization: Bearer <anon>`。

- `tournament_public_view({p_token})` → `{tournament:{name,heldOn,status}, teams:[{id,name,players}], matches:[{id,roundNo,timeSlot,courtNo,event,teamAId,teamBId,status,scoreA,scoreB}]}`；token 無效回 `null`
- `tournament_captain_view({p_token})` → 同上再加 `myTeamId` 與 `reports`（`{<matchId>: {myReport: {scoreA,scoreB,reportedAt}|null, oppReported: boolean}}`，只含自己隊的場次；**myReport 一律以 A/B 方向正規化存放**）；token 無效回 `null`
- `tournament_report_score({p_token,p_match,p_score_self,p_score_opp})` → `{status:'pending'|'confirmed'|'conflict'}`；違規時 HTTP 400，body 的 `message` 為繁中錯誤訊息（如「羽球比賽不會平手，請確認比分」「這場比賽成績已確認，如需更正請找主辦」），可直接顯示
- match `status`：`pending`（未賽或單方已報）→ `confirmed`（雙方一致，寫入 scoreA/scoreB）或 `conflict`（不一致；任一方重送覆蓋自己那份後重判）

---

### Task 1: 排名純函式 `js/standings.js`

**Files:**
- Create: `js/standings.js`
- Test: `tests/standings.test.js`

**Interfaces:**
- Consumes: 無（純函式，無相依）
- Produces: `computeStandings(teams, matches)` → 依名次排序的陣列，元素 `{teamId, name, wins, losses, pointsFor, played, rank}`。`teams: [{id, name}]`；`matches: [{teamAId, teamBId, status, scoreA, scoreB}]`。Task 4 的渲染直接吃這個輸出。

- [ ] **Step 1: 寫失敗測試**（自 v2 vitest 測試轉為 jest；快照測資為去年計分板實況）

`tests/standings.test.js`：

```js
const { computeStandings } = require('../js/standings');

const TEAMS = [
  { id: 'A', name: '明明只是想領個參加獎' },
  { id: 'B', name: '羽出驚人死不休' },
  { id: 'C', name: '紅鯉魚與綠鯉魚與驢' },
  { id: 'D', name: '我的字典裡沒有輸' },
  { id: 'E', name: '羽你分享的快樂' },
];

const m = (a, sa, b, sb) => ({ teamAId: a, teamBId: b, status: 'confirmed', scoreA: sa, scoreB: sb });

// 2025 第二屆計分板逐場實況（同 v2 測資）
const LAST_YEAR = [
  m('A', 14, 'B', 21), m('C', 21, 'D', 9), m('D', 12, 'E', 21), m('A', 20, 'C', 22),
  m('B', 18, 'C', 21), m('D', 22, 'E', 20), m('A', 15, 'E', 21), m('B', 12, 'D', 21),
  m('A', 21, 'C', 5), m('B', 20, 'D', 22), m('C', 18, 'E', 21), m('A', 21, 'B', 11),
  m('A', 21, 'D', 16), m('B', 21, 'E', 10), m('C', 21, 'E', 10),
  m('A', 11, 'D', 21), m('B', 13, 'C', 21), m('B', 10, 'E', 21),
  m('A', 21, 'E', 8), m('C', 21, 'D', 11),
];

test('去年計分板快照：勝場/總得分/名次與試算表一致', () => {
  const rows = computeStandings(TEAMS, LAST_YEAR);
  expect(rows.map((r) => [r.teamId, r.wins, r.losses, r.pointsFor, r.played, r.rank])).toEqual([
    ['C', 6, 2, 150, 8, 1],
    ['A', 4, 4, 144, 8, 2],
    ['D', 4, 4, 134, 8, 3],
    ['E', 4, 4, 132, 8, 4],
    ['B', 2, 6, 126, 8, 5],
  ]);
});

test('pending 與 conflict 場次不計入排名', () => {
  const rows = computeStandings(TEAMS.slice(0, 2), [
    m('A', 21, 'B', 10),
    { teamAId: 'A', teamBId: 'B', status: 'pending', scoreA: null, scoreB: null },
    { teamAId: 'A', teamBId: 'B', status: 'conflict', scoreA: null, scoreB: null },
  ]);
  expect(rows[0]).toMatchObject({ teamId: 'A', wins: 1, pointsFor: 21, played: 1, rank: 1 });
  expect(rows[1]).toMatchObject({ teamId: 'B', wins: 0, pointsFor: 10, played: 1, rank: 2 });
});

test('勝場與總得分皆同 → 並列同名次，後續名次跳號', () => {
  const teams = [
    { id: 'A', name: 'a' }, { id: 'B', name: 'b' }, { id: 'C', name: 'c' }, { id: 'D', name: 'd' },
  ];
  const rows = computeStandings(teams, [m('A', 21, 'C', 10), m('B', 21, 'D', 10)]);
  expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 3]);
});

test('沒有任何完賽場次：全員 0，並列第 1', () => {
  const rows = computeStandings(TEAMS, []);
  expect(rows).toHaveLength(5);
  rows.forEach((r) => expect(r).toMatchObject({ wins: 0, losses: 0, pointsFor: 0, played: 0, rank: 1 }));
});

test('平手比分視為無效資料，略過不計', () => {
  const teams = [{ id: 'A', name: 'a' }, { id: 'B', name: 'b' }];
  const rows = computeStandings(teams, [
    { teamAId: 'A', teamBId: 'B', status: 'confirmed', scoreA: 21, scoreB: 21 },
  ]);
  rows.forEach((r) => expect(r).toMatchObject({ wins: 0, losses: 0, pointsFor: 0, played: 0 }));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/standings.test.js -v`
Expected: FAIL（`Cannot find module '../js/standings'`）

- [ ] **Step 3: 實作**（移植 v2 `src/tournament/standings.js`，ESM 改雙用匯出）

`js/standings.js`：

```js
/**
 * 比賽排名純函式模組（移植自 v2 badminton-scheduler src/tournament/standings.js）
 * 只計 confirmed 場次。
 * 規則：勝場數 desc → 總得分 desc；兩者皆同 → 並列同名次（1,2,2,4）。
 */
function computeStandings(teams, matches) {
  const rows = new Map(
    teams.map((t) => [
      t.id,
      { teamId: t.id, name: t.name, wins: 0, losses: 0, pointsFor: 0, played: 0, rank: 0 },
    ])
  );
  matches.forEach((match) => {
    if (match.status !== 'confirmed') return;
    const a = rows.get(match.teamAId);
    const b = rows.get(match.teamBId);
    if (!a || !b) return;
    if (match.scoreA === match.scoreB) return; // 平手為無效資料（上游已擋，防禦性略過）
    a.played += 1;
    b.played += 1;
    a.pointsFor += match.scoreA;
    b.pointsFor += match.scoreB;
    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  });
  const sorted = [...rows.values()].sort(
    (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor
  );
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    row.rank =
      prev && prev.wins === row.wins && prev.pointsFor === row.pointsFor ? prev.rank : i + 1;
  });
  return sorted;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStandings };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/standings.test.js -v`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add js/standings.js tests/standings.test.js
git commit -m "feat: 比賽排名純函式（移植 v2 standings，含去年快照測資）"
```

---

### Task 2: 表單驗證與狀態呈現純函式 `js/tournament-form.js`

**Files:**
- Create: `js/tournament-form.js`
- Test: `tests/tournament-form.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `parseTokenFromUrl(search)` → `{mode: 'captain'|'public'|null, token: string|null}`（吃 `location.search` 字串）
  - `validateScores(selfInput, oppInput)` → `{ok: true, scoreSelf, scoreOpp}` 或 `{ok: false, error}`（吃表單原始字串）
  - `matchState(match, captainCtx)` → `{label, cssClass, canReport}`；`captainCtx` 為 `null`（觀賽或已 finished）或 `{myTeamId, reports}`（reports 即 captain_view 的 reports 物件）

- [ ] **Step 1: 寫失敗測試**

`tests/tournament-form.test.js`：

```js
const { parseTokenFromUrl, validateScores, matchState } = require('../js/tournament-form');

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
  test.each([
    ['', '15'], ['21', ''], ['abc', '15'], ['12.5', '15'], ['-1', '15'], ['31', '15'],
  ])('非 0–30 整數（%s, %s）→ 錯誤', (a, b) => {
    expect(validateScores(a, b)).toEqual({ ok: false, error: '比分需為 0–30 的整數' });
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
  test('pending＋對方已報我方未報 → 提示輸入', () => {
    // 2026-08-03 因 375px 版面實測縮短：原「對方已回報，請輸入比分」(11 字) 讓結果欄過寬、
    // 壓縮隊名欄導致長隊名折成多行、列高暴增，改為 5 字「對方已回報」（見 final-fix-report.md）。
    expect(matchState(match, myCtx({ m1: { myReport: null, oppReported: true } }))).toEqual(
      { label: '對方已回報', cssClass: 'action-needed', canReport: true });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/tournament-form.test.js -v`
Expected: FAIL（`Cannot find module '../js/tournament-form'`）

- [ ] **Step 3: 實作**

`js/tournament-form.js`：

```js
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
    s < 0 || s > 30 || o < 0 || o > 30
  ) {
    return { ok: false, error: '比分需為 0–30 的整數' };
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
    // 2026-08-03 因 375px 版面實測縮短：原文案 11 字，改為 5 字（見 final-fix-report.md）
    return { label: '對方已回報', cssClass: 'action-needed', canReport: true };
  }
  return { label: '請輸入比分', cssClass: 'action-needed', canReport: true };
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseTokenFromUrl, validateScores, matchState };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/tournament-form.test.js -v`
Expected: PASS（15 tests）

- [ ] **Step 5: Commit**

```bash
git add js/tournament-form.js tests/tournament-form.test.js
git commit -m "feat: 比賽頁表單驗證與場次狀態純函式"
```

---

### Task 3: Supabase RPC 薄封裝 `js/tournament-api.js`

**Files:**
- Create: `js/tournament-api.js`
- Test: `tests/tournament-api.test.js`

**Interfaces:**
- Consumes: 無（原生 `fetch`）
- Produces（皆回傳 Promise，失敗時 throw `Error`，`error.message` 可直接顯示給使用者）:
  - `fetchPublicView(token)` → public payload 或 `null`
  - `fetchCaptainView(token)` → captain payload 或 `null`
  - `reportScore(token, matchId, scoreSelf, scoreOpp)` → `{status}`

- [ ] **Step 1: 寫失敗測試**（stub `global.fetch`，驗證 URL/headers/body 與錯誤映射）

`tests/tournament-api.test.js`：

```js
const api = require('../js/tournament-api');

afterEach(() => {
  delete global.fetch;
});

test('reportScore：URL、headers、body 正確且回傳 JSON', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) });
  const result = await api.reportScore('tok', 'match-1', 21, 15);
  expect(result).toEqual({ status: 'pending' });
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/rest\/v1\/rpc\/tournament_report_score$/);
  expect(opts.method).toBe('POST');
  expect(opts.headers['Content-Type']).toBe('application/json');
  expect(opts.headers.apikey).toBeTruthy();
  expect(opts.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(opts.body)).toEqual({
    p_token: 'tok', p_match: 'match-1', p_score_self: 21, p_score_opp: 15,
  });
});

test('fetchPublicView / fetchCaptainView 呼叫對應 RPC 並帶 p_token', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => null });
  await api.fetchPublicView('pub');
  await api.fetchCaptainView('cap');
  expect(global.fetch.mock.calls[0][0]).toMatch(/tournament_public_view$/);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ p_token: 'pub' });
  expect(global.fetch.mock.calls[1][0]).toMatch(/tournament_captain_view$/);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ p_token: 'cap' });
});

test('後端 4xx：丟出 body.message（繁中訊息直接可顯示）', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 400,
    json: async () => ({ message: '羽球比賽不會平手，請確認比分' }),
  });
  await expect(api.reportScore('tok', 'm', 21, 21)).rejects.toThrow('羽球比賽不會平手，請確認比分');
});

test('非 JSON 錯誤回應：顯示連線失敗與狀態碼', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 502,
    json: async () => { throw new Error('not json'); },
  });
  await expect(api.fetchPublicView('tok')).rejects.toThrow('連線失敗（502）');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/tournament-api.test.js -v`
Expected: FAIL（`Cannot find module '../js/tournament-api'`）

- [ ] **Step 3: 實作**

`js/tournament-api.js`：

```js
/**
 * v2 badminton-scheduler Supabase 後端的薄封裝（比賽模式三個 RPC）
 * anon key 為公開值，安全由 RLS 與 security definer RPC 把關（同 v1 寫死 Google API key 的模式）
 */
const TOURNAMENT_SUPABASE_URL = '__SUPABASE_URL__'; // 部署前填入：v2 專案的 VITE_SUPABASE_URL
const TOURNAMENT_SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__'; // 部署前填入：v2 專案的 VITE_SUPABASE_ANON_KEY

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
```

注意：`__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` 是待使用者提供的部署設定，不是計劃缺口；Task 7 第一步會填入實際值。測試不依賴這兩個值。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/tournament-api.test.js -v`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add js/tournament-api.js tests/tournament-api.test.js
git commit -m "feat: Supabase 比賽 RPC 薄封裝（fetch、錯誤訊息映射）"
```

---

### Task 4: 比賽頁（觀賽模式）`tournament.html` + `css/tournament.css` + `js/tournament.js`

**Files:**
- Create: `tournament.html`
- Create: `css/tournament.css`
- Create: `js/tournament.js`

**Interfaces:**
- Consumes: `computeStandings`（Task 1）、`parseTokenFromUrl` / `matchState`（Task 2）、`fetchPublicView` / `fetchCaptainView`（Task 3）、`showToast`（既有 `js/dialog.js`）
- Produces: 全域 `currentView`（最新 payload）、`auth`（`{mode, token}`）、`refresh()`、`teamNameById(view)`；Task 5 的隊長功能掛在同一檔案的 `openReportForm(match)`（本 Task 先放空殼）

- [ ] **Step 1: 建立 `tournament.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#4a7dbc">
    <title>翰林羽球社 第三屆運動會</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="css/tournament.css">
</head>
<body class="tournament-page">
    <header class="header tournament-header">
        <h1><i class="fas fa-trophy"></i> <span id="tournamentName">第三屆運動會</span></h1>
        <div id="finishedBadge" class="finished-badge" hidden>比賽已結束</div>
    </header>

    <main class="tournament-main">
        <div id="offlineBox" class="offline-box" hidden></div>
        <div id="errorBox" class="error-box" hidden></div>

        <section id="standingsSection" hidden>
            <h2><i class="fas fa-ranking-star"></i> 即時排名</h2>
            <div id="standings"></div>
        </section>

        <section id="scheduleSection" hidden>
            <h2><i class="fas fa-table-list"></i> 賽程</h2>
            <div id="schedule"></div>
        </section>
    </main>

    <!-- 隊長輸分彈窗（Task 5 啟用） -->
    <div id="reportOverlay" class="report-overlay" hidden>
        <div class="report-modal">
            <h3 id="reportTitle">輸入比分</h3>
            <p id="reportSubtitle" class="report-subtitle"></p>
            <div class="score-inputs">
                <label>我方 <span id="myTeamName"></span>
                    <input id="scoreSelf" type="number" inputmode="numeric" min="0" max="30" step="1">
                </label>
                <span class="score-colon">：</span>
                <label>對方 <span id="oppTeamName"></span>
                    <input id="scoreOpp" type="number" inputmode="numeric" min="0" max="30" step="1">
                </label>
            </div>
            <div class="report-actions">
                <button id="reportCancel" type="button" class="btn-cancel">取消</button>
                <button id="reportSubmit" type="button" class="btn-submit">送出</button>
            </div>
        </div>
    </div>

    <script src="js/dialog.js"></script>
    <script src="js/standings.js"></script>
    <script src="js/tournament-form.js"></script>
    <script src="js/tournament-api.js"></script>
    <script src="js/tournament.js"></script>
</body>
</html>
```

- [ ] **Step 2: 建立 `css/tournament.css`**（手機優先；只用 `style.css` 既有變數，不新發明色票）

```css
/* 比賽頁專屬樣式：沿用 style.css 的 :root 變數 */
.tournament-main {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 0.8rem 3rem;
}

.tournament-header {
  text-align: center;
  padding: 0.8rem;
}

.finished-badge {
  display: inline-block;
  margin-top: 0.3rem;
  padding: 0.15rem 0.8rem;
  background: var(--neutral);
  color: var(--text-light);
  border-radius: 999px;
  font-size: 0.85rem;
}

.tournament-main h2 {
  margin: 1.2rem 0 0.6rem;
  font-size: 1.1rem;
  color: var(--primary-dark);
}

.offline-box,
.error-box {
  margin: 0.8rem 0;
  padding: 0.8rem;
  border-radius: var(--border-radius);
  text-align: center;
}

.offline-box {
  background: var(--warning-light);
  color: var(--text-dark);
}

.error-box {
  background: var(--danger-light);
  color: var(--text-light);
  padding: 2rem 1rem;
  font-size: 1.1rem;
}

/* 排名表 */
.standings-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: var(--border-radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.standings-table th,
.standings-table td {
  padding: 0.55rem 0.4rem;
  text-align: center;
  border-bottom: 1px solid var(--bg-light);
}

.standings-table th {
  background: var(--primary);
  color: white;
  font-size: 0.85rem;
}

.standings-table td.team-name {
  text-align: left;
  font-weight: 600;
}

.standings-table tr.my-team {
  background: #eaf1fb;
}

.champion-banner {
  margin-bottom: 0.6rem;
  padding: 0.8rem;
  background: linear-gradient(135deg, var(--warning), var(--warning-dark));
  color: white;
  border-radius: var(--border-radius);
  text-align: center;
  font-size: 1.05rem;
  font-weight: 700;
  box-shadow: var(--shadow);
}

/* 賽程 */
.round-card {
  background: white;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);
  margin-bottom: 0.8rem;
  overflow: hidden;
}

.round-title {
  padding: 0.45rem 0.8rem;
  background: var(--bg-light);
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--neutral-dark);
}

.match-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.8rem;
  border-top: 1px solid var(--bg-light);
}

.match-row.match-mine {
  border-left: 4px solid var(--primary);
  background: #f6f9ff;
}

.match-row.can-report {
  cursor: pointer;
}

.event-chip {
  flex: none;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: white;
  background: var(--info);
}

.event-chip.男雙 { background: var(--primary); }
.event-chip.女雙 { background: var(--danger); }
.event-chip.混雙 { background: var(--secondary); }

.match-teams {
  flex: 1;
  min-width: 0;
  font-size: 0.92rem;
}

.match-result {
  flex: none;
  text-align: right;
  font-size: 0.85rem;
}

.match-score {
  font-weight: 700;
  font-size: 1rem;
}

.state-label { display: block; }
.state-label.confirmed { color: var(--secondary-dark); }
.state-label.pending { color: var(--neutral); }
.state-label.waiting { color: var(--warning-dark); }
.state-label.conflict { color: var(--danger-dark); font-weight: 700; }
.state-label.action-needed { color: var(--primary-dark); font-weight: 700; }

/* 隊長輸分彈窗 */
.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.report-modal {
  background: white;
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  padding: 1.2rem;
  width: min(92vw, 360px);
}

.report-subtitle {
  color: var(--neutral);
  font-size: 0.9rem;
  margin: 0.3rem 0 0.8rem;
}

.score-inputs {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  justify-content: center;
}

.score-inputs label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--neutral-dark);
}

.score-inputs input {
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.6rem;
  font-size: 1.4rem;
  text-align: center;
  border: 2px solid var(--bg-light);
  border-radius: var(--border-radius);
}

.score-colon {
  font-size: 1.4rem;
  padding-bottom: 0.6rem;
}

.report-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
}

.report-actions button {
  flex: 1;
  padding: 0.65rem;
  border: none;
  border-radius: var(--border-radius);
  font-size: 1rem;
  cursor: pointer;
}

.btn-cancel { background: var(--bg-light); color: var(--text-dark); }
.btn-submit { background: var(--primary); color: white; }
.btn-submit:disabled { opacity: 0.6; }
```

- [ ] **Step 3: 建立 `js/tournament.js`（觀賽模式：初始化、輪詢、渲染）**

```js
/**
 * 比賽頁邏輯：初始化、輪詢、渲染
 * 相依（由 tournament.html 的 <script> 順序保證）：
 *   dialog.js → showToast
 *   standings.js → computeStandings
 *   tournament-form.js → parseTokenFromUrl / matchState / validateScores
 *   tournament-api.js → fetchPublicView / fetchCaptainView / reportScore
 */
const POLL_INTERVAL_MS = 10000;

let auth = { mode: null, token: null };
let currentView = null;
let pollTimer = null;

function teamNameById(view) {
  const map = {};
  view.teams.forEach((t) => { map[t.id] = t.name; });
  return map;
}

// 比賽 finished 後鎖定輸入：captainCtx 視為 null（後端也會擋）
function captainCtxOf(view) {
  if (auth.mode !== 'captain') return null;
  if (view.tournament.status === 'finished') return null;
  return { myTeamId: view.myTeamId, reports: view.reports || {} };
}

function showFatal(message) {
  if (pollTimer) clearInterval(pollTimer);
  document.getElementById('standingsSection').hidden = true;
  document.getElementById('scheduleSection').hidden = true;
  const box = document.getElementById('errorBox');
  box.textContent = message;
  box.hidden = false;
}

function setOffline(message) {
  const box = document.getElementById('offlineBox');
  if (message) {
    box.textContent = `連線異常（${message}），稍後會自動重試`;
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

function renderHeader(view) {
  document.getElementById('tournamentName').textContent = view.tournament.name;
  document.getElementById('finishedBadge').hidden = view.tournament.status !== 'finished';
}

function renderStandings(view) {
  const rows = computeStandings(view.teams, view.matches);
  const allDone = view.matches.length > 0 && view.matches.every((m) => m.status === 'confirmed');
  const box = document.getElementById('standings');
  box.textContent = '';

  if (allDone) {
    const champs = rows.filter((r) => r.rank === 1).map((r) => r.name).join('、');
    const runners = rows.filter((r) => r.rank === 2).map((r) => r.name).join('、');
    const banner = document.createElement('div');
    banner.className = 'champion-banner';
    banner.textContent = runners
      ? `🏆 冠軍：${champs}　🥈 亞軍：${runners}`
      : `🏆 冠軍：${champs}`;
    box.appendChild(banner);
  }

  const table = document.createElement('table');
  table.className = 'standings-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  ['名次', '隊伍', '勝', '敗', '總得分', '完賽'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (auth.mode === 'captain' && r.teamId === view.myTeamId) tr.className = 'my-team';
    const cells = [r.rank, r.name, r.wins, r.losses, r.pointsFor, r.played];
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 1) td.className = 'team-name';
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  box.appendChild(table);
  document.getElementById('standingsSection').hidden = false;
}

function renderSchedule(view) {
  const ctx = captainCtxOf(view);
  const names = teamNameById(view);
  const box = document.getElementById('schedule');
  box.textContent = '';

  const byRound = new Map();
  view.matches.forEach((m) => {
    if (!byRound.has(m.roundNo)) byRound.set(m.roundNo, []);
    byRound.get(m.roundNo).push(m);
  });

  [...byRound.keys()].sort((a, b) => a - b).forEach((roundNo) => {
    const matches = byRound.get(roundNo);
    const card = document.createElement('div');
    card.className = 'round-card';
    const title = document.createElement('div');
    title.className = 'round-title';
    title.textContent = `第 ${roundNo} 輪　${matches[0].timeSlot}`;
    card.appendChild(title);

    matches.forEach((match) => {
      const state = matchState(match, ctx);
      const isMine =
        !!ctx && (match.teamAId === ctx.myTeamId || match.teamBId === ctx.myTeamId);

      const row = document.createElement('div');
      row.className = 'match-row';
      if (isMine) row.classList.add('match-mine');
      if (state.canReport) row.classList.add('can-report');

      const chip = document.createElement('span');
      chip.className = `event-chip ${match.event}`;
      chip.textContent = `場地${match.courtNo}　${match.event}`;
      row.appendChild(chip);

      const teams = document.createElement('span');
      teams.className = 'match-teams';
      teams.textContent = `${names[match.teamAId]} vs ${names[match.teamBId]}`;
      row.appendChild(teams);

      const result = document.createElement('span');
      result.className = 'match-result';
      if (match.status === 'confirmed') {
        const score = document.createElement('span');
        score.className = 'match-score';
        score.textContent = `${match.scoreA}：${match.scoreB}`;
        result.appendChild(score);
      }
      const label = document.createElement('span');
      label.className = `state-label ${state.cssClass}`;
      label.textContent = state.label;
      result.appendChild(label);
      row.appendChild(result);

      if (state.canReport) {
        row.addEventListener('click', () => openReportForm(match));
      }
      card.appendChild(row);
    });
    box.appendChild(card);
  });
  document.getElementById('scheduleSection').hidden = false;
}

function renderAll(view) {
  renderHeader(view);
  renderStandings(view);
  renderSchedule(view);
}

async function refresh() {
  let view;
  try {
    view = auth.mode === 'captain'
      ? await fetchCaptainView(auth.token)
      : await fetchPublicView(auth.token);
  } catch (err) {
    setOffline(err.message);
    return;
  }
  if (!view || !view.tournament) {
    showFatal('找不到比賽，請確認連結是否正確');
    return;
  }
  setOffline(null);
  currentView = view;
  renderAll(view);
}

// Task 5 實作；先放空殼避免 ReferenceError
function openReportForm(match) {}

function init() {
  auth = parseTokenFromUrl(location.search);
  if (!auth.mode) {
    showFatal('找不到比賽，請確認連結是否正確');
    return;
  }
  refresh();
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 4: 手動驗證（無後端也能驗的部分）**

Run: `npx http-server -p 8000`（背景），瀏覽器開 `http://localhost:8000/tournament.html`
Expected: 顯示「找不到比賽，請確認連結是否正確」（無 token）；開 `tournament.html?t=xxx` 因 URL 未填會 fetch 失敗 → 顯示連線異常提示。Console 無 ReferenceError。

- [ ] **Step 5: 跑全部測試確認沒破壞既有測試**

Run: `npm test`
Expected: 既有測試與 Task 1–3 測試全 PASS

- [ ] **Step 6: Commit**

```bash
git add tournament.html css/tournament.css js/tournament.js
git commit -m "feat: 比賽頁觀賽模式（排名表、賽程表、10 秒輪詢）"
```

---

### Task 5: 隊長輸分（表單、送出、狀態回饋）

**Files:**
- Modify: `js/tournament.js`（實作 `openReportForm` 空殼＋新增送出邏輯與事件繫結）

**Interfaces:**
- Consumes: `validateScores`（Task 2）、`reportScore`（Task 3）、`showToast`（dialog.js）、Task 4 的 `currentView` / `auth` / `refresh()` / `teamNameById`
- Produces: 無（終端 UI 行為）

- [ ] **Step 1: 把 Task 4 的 `openReportForm` 空殼換成實作，並在檔尾 `init()` 前加入送出/取消邏輯**

以下整段取代 `function openReportForm(match) {}`：

```js
let reportingMatchId = null;
let submitting = false;

function openReportForm(match) {
  const names = teamNameById(currentView);
  const myTeamId = currentView.myTeamId;
  const iAmTeamA = match.teamAId === myTeamId;
  const oppTeamId = iAmTeamA ? match.teamBId : match.teamAId;

  reportingMatchId = match.id;
  document.getElementById('reportTitle').textContent = `第 ${match.roundNo} 輪　${match.event}`;
  document.getElementById('reportSubtitle').textContent =
    `${match.timeSlot}　場地${match.courtNo}`;
  document.getElementById('myTeamName').textContent = names[myTeamId];
  document.getElementById('oppTeamName').textContent = names[oppTeamId];

  // 已送過的話帶入自己上次回報（myReport 以 A/B 方向正規化存放，要轉回我方/對方）
  const report = (currentView.reports || {})[match.id];
  const selfInput = document.getElementById('scoreSelf');
  const oppInput = document.getElementById('scoreOpp');
  if (report && report.myReport) {
    selfInput.value = iAmTeamA ? report.myReport.scoreA : report.myReport.scoreB;
    oppInput.value = iAmTeamA ? report.myReport.scoreB : report.myReport.scoreA;
  } else {
    selfInput.value = '';
    oppInput.value = '';
  }

  document.getElementById('reportOverlay').hidden = false;
  selfInput.focus();
}

function closeReportForm() {
  reportingMatchId = null;
  document.getElementById('reportOverlay').hidden = true;
}

async function submitReport() {
  if (submitting || !reportingMatchId) return;
  const check = validateScores(
    document.getElementById('scoreSelf').value,
    document.getElementById('scoreOpp').value
  );
  if (!check.ok) {
    showToast(check.error, 'warning');
    return;
  }
  submitting = true;
  const submitBtn = document.getElementById('reportSubmit');
  submitBtn.disabled = true;
  try {
    const result = await reportScore(
      auth.token, reportingMatchId, check.scoreSelf, check.scoreOpp
    );
    closeReportForm();
    if (result.status === 'confirmed') {
      showToast('雙方比分一致，成績已確認！', 'success');
    } else if (result.status === 'conflict') {
      showToast('比分不一致，請與對方隊長重新確認後再送一次', 'warning');
    } else {
      showToast('已送出，等待對方隊長確認', 'info');
    }
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
    await refresh(); // 例如已被確認/比賽結束時，讓畫面同步最新狀態
  } finally {
    submitting = false;
    submitBtn.disabled = false;
  }
}

function bindReportForm() {
  document.getElementById('reportSubmit').addEventListener('click', submitReport);
  document.getElementById('reportCancel').addEventListener('click', closeReportForm);
  document.getElementById('reportOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('reportOverlay')) closeReportForm();
  });
}
```

並在 `init()` 內、`refresh();` 之前加入一行：

```js
  bindReportForm();
```

- [ ] **Step 2: 手動驗證（無後端）**

Run: `npx http-server -p 8000`，開 `http://localhost:8000/tournament.html?c=dummy`
Expected: fetch 失敗顯示連線異常（URL 未填屬預期）；Console 無語法錯誤。用 DevTools 手動呼叫 `openReportForm` 前先塞假資料：

```js
currentView = { myTeamId: 'T1', teams: [{id:'T1',name:'A'},{id:'T2',name:'B'}], reports: {} };
openReportForm({ id: 'm1', roundNo: 1, timeSlot: '18:10-18:20', courtNo: 1, event: '男雙', teamAId: 'T1', teamBId: 'T2' });
```

Expected: 彈窗開啟、我方/對方隊名正確；輸入 21/21 按送出 → toast「羽球比賽不會平手」；取消與點背景可關閉。

- [ ] **Step 3: 跑全部測試**

Run: `npm test`
Expected: 全 PASS（本 Task 無新 jest；確保沒破壞）

- [ ] **Step 4: Commit**

```bash
git add js/tournament.js
git commit -m "feat: 隊長輸分表單（雙方確認狀態回饋、送出鎖定、預帶上次回報）"
```

---

### Task 6: seed SQL、QR 產生腳本、賽前作業文件

**Files:**
- Create: `docs/tournament/seed-2026-08-20.sql`
- Create: `scripts/generate-qr.sh`
- Create: `docs/tournament/賽前作業.md`
- Modify: `.gitignore`（無則建立；加入 `qr/` 與 `node_modules/`）

**Interfaces:**
- Consumes: v2 Supabase 資料表 DDL（tokens 由欄位 default 自動產生，不需手動生）
- Produces: 使用者可執行的一次性 seed 與營運文件

- [ ] **Step 1: 建立 `docs/tournament/seed-2026-08-20.sql`**

```sql
-- 8/20 第三屆羽球賽 一次性 seed（在 v2 Supabase SQL editor 執行，service role 不受 RLS 限制）
-- 執行前：先跑下面兩個查詢，把查到的值取代 DO 區塊開頭的兩個 '<...>'：
--   select id, name from clubs;
--   select id, email from auth.users;

do $$
declare
  v_club uuid := '<你的 club_id>';
  v_user uuid := '<你的 auth.users id>';
  v_t uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid;
begin
  insert into tournaments (club_id, name, held_on, status, created_by)
  values (v_club, '第三屆羽球社運動會', '2026-08-20', 'active', v_user)
  returning id into v_t;

  -- 先以字母建隊（隊伍 1–5 對應 A–E 由抽籤決定；抽完再跑下方「抽籤後」更新）
  insert into tournament_teams (tournament_id, name) values (v_t, 'A') returning id into v_a;
  insert into tournament_teams (tournament_id, name) values (v_t, 'B') returning id into v_b;
  insert into tournament_teams (tournament_id, name) values (v_t, 'C') returning id into v_c;
  insert into tournament_teams (tournament_id, name) values (v_t, 'D') returning id into v_d;
  insert into tournament_teams (tournament_id, name) values (v_t, 'E') returning id into v_e;

  -- 30 場賽程（10 輪 × 3 場地；場地1=女雙、場地2=男雙、場地3=混雙）
  insert into tournament_matches
    (tournament_id, round_no, time_slot, court_no, event, team_a_id, team_b_id)
  values
    (v_t,  1, '18:10-18:20', 1, '女雙', v_c, v_d),
    (v_t,  1, '18:10-18:20', 2, '男雙', v_a, v_e),
    (v_t,  1, '18:10-18:20', 3, '混雙', v_a, v_b),
    (v_t,  2, '18:20-18:30', 1, '女雙', v_a, v_b),
    (v_t,  2, '18:20-18:30', 2, '男雙', v_b, v_c),
    (v_t,  2, '18:20-18:30', 3, '混雙', v_d, v_e),
    (v_t,  3, '18:30-18:40', 1, '女雙', v_c, v_e),
    (v_t,  3, '18:30-18:40', 2, '男雙', v_a, v_d),
    (v_t,  3, '18:30-18:40', 3, '混雙', v_b, v_c),
    (v_t,  4, '18:40-18:50', 1, '女雙', v_b, v_d),
    (v_t,  4, '18:40-18:50', 2, '男雙', v_c, v_d),
    (v_t,  4, '18:40-18:50', 3, '混雙', v_a, v_e),
    (v_t,  5, '18:50-19:00', 1, '女雙', v_a, v_e),
    (v_t,  5, '18:50-19:00', 2, '男雙', v_b, v_e),
    (v_t,  5, '18:50-19:00', 3, '混雙', v_c, v_d),
    (v_t,  6, '19:00-19:10', 1, '女雙', v_a, v_d),
    (v_t,  6, '19:00-19:10', 2, '男雙', v_a, v_c),
    (v_t,  6, '19:00-19:10', 3, '混雙', v_b, v_e),
    (v_t,  7, '19:10-19:20', 1, '女雙', v_b, v_e),
    (v_t,  7, '19:10-19:20', 2, '男雙', v_b, v_d),
    (v_t,  7, '19:10-19:20', 3, '混雙', v_a, v_c),
    (v_t,  8, '19:20-19:30', 1, '女雙', v_a, v_c),
    (v_t,  8, '19:20-19:30', 2, '男雙', v_c, v_e),
    (v_t,  8, '19:20-19:30', 3, '混雙', v_b, v_d),
    (v_t,  9, '19:30-19:40', 1, '女雙', v_d, v_e),
    (v_t,  9, '19:30-19:40', 2, '男雙', v_a, v_b),
    (v_t,  9, '19:30-19:40', 3, '混雙', v_c, v_e),
    (v_t, 10, '19:40-19:50', 1, '女雙', v_b, v_c),
    (v_t, 10, '19:40-19:50', 2, '男雙', v_d, v_e),
    (v_t, 10, '19:40-19:50', 3, '混雙', v_a, v_d);
end $$;

-- seed 完取 token（public_token 給觀賽連結、captain_token 給各隊 QR code）
select t.public_token, tm.name as team, tm.captain_token
from tournaments t
join tournament_teams tm on tm.tournament_id = t.id
where t.name = '第三屆羽球社運動會'
order by tm.name;

-- ============================================================
-- 抽籤後執行：把分隊名單掛到抽到的字母隊。
-- 每段把 <字母> 換成該分隊抽到的 A–E（隊名可順便改成隊長名，如 'A｜敬軒隊'）。
-- ============================================================

-- 分隊 1（邱奕鈞、陳奕廷、高新翰、陳怡伶、劉凡瑀、洪蘭萍）
-- update tournament_teams set
--   players = '[{"name":"邱奕鈞"},{"name":"陳奕廷"},{"name":"高新翰"},{"name":"陳怡伶"},{"name":"劉凡瑀"},{"name":"洪蘭萍"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆羽球社運動會')
--   and name = '<字母>';

-- 分隊 2（曾偉哲、吳萬萊、陳彥文、劉杰妮、林玉珠、湯庭禎）
-- update tournament_teams set
--   players = '[{"name":"曾偉哲"},{"name":"吳萬萊"},{"name":"陳彥文"},{"name":"劉杰妮"},{"name":"林玉珠"},{"name":"湯庭禎"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆羽球社運動會')
--   and name = '<字母>';

-- 分隊 3（賴忠男、林丞輊、李俊寬、楊皓婷、柳雨彤、吳玉婷）
-- update tournament_teams set
--   players = '[{"name":"賴忠男"},{"name":"林丞輊"},{"name":"李俊寬"},{"name":"楊皓婷"},{"name":"柳雨彤"},{"name":"吳玉婷"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆羽球社運動會')
--   and name = '<字母>';

-- 分隊 4（傅敬軒、郭彥呈、廖宏彬、呂孟娜、蔡依玲）
-- update tournament_teams set
--   players = '[{"name":"傅敬軒"},{"name":"郭彥呈"},{"name":"廖宏彬"},{"name":"呂孟娜"},{"name":"蔡依玲"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆羽球社運動會')
--   and name = '<字母>';

-- 分隊 5（廖翊凱、陳威任、黃迺芸、洪于婷、謝郁嫺）
-- update tournament_teams set
--   players = '[{"name":"廖翊凱"},{"name":"陳威任"},{"name":"黃迺芸"},{"name":"洪于婷"},{"name":"謝郁嫺"}]'
-- where tournament_id = (select id from tournaments where name = '第三屆羽球社運動會')
--   and name = '<字母>';

-- 賽後收尾（鎖定所有輸入）：
-- update tournaments set status = 'finished' where name = '第三屆羽球社運動會';
```

- [ ] **Step 2: 建立 `scripts/generate-qr.sh`**

```bash
#!/usr/bin/env bash
# 產生各隊隊長 QR code（輸出到 qr/，勿 commit——內含 captain token）
# 用法：./scripts/generate-qr.sh <頁面base網址> <A隊token> <B隊token> <C隊token> <D隊token> <E隊token>
# 例：  ./scripts/generate-qr.sh https://o3ndlnosm.github.io/HanLinBadmintonScheduler aaa bbb ccc ddd eee
set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "用法：$0 <base網址> <A token> <B token> <C token> <D token> <E token>" >&2
  exit 1
fi

BASE="${1%/}"
shift
LETTERS=(A B C D E)
mkdir -p qr

i=0
for token in "$@"; do
  letter="${LETTERS[$i]}"
  url="${BASE}/tournament.html?c=${token}"
  npx --yes qrcode -o "qr/captain-${letter}.png" -w 600 "$url"
  echo "qr/captain-${letter}.png ← ${url}"
  i=$((i + 1))
done
echo "完成。觀賽連結請另用 ?t=<public_token> 分享。"
```

- [ ] **Step 3: 測試 QR 腳本（假 token）**

Run: `chmod +x scripts/generate-qr.sh && ./scripts/generate-qr.sh https://example.com t1 t2 t3 t4 t5 && ls qr/`
Expected: 印出 5 行、`qr/` 內有 `captain-A.png` … `captain-E.png`；用預覽開任一張確認是 QR 圖。驗完 `rm -rf qr/`。

- [ ] **Step 4: 建立/更新 `.gitignore`**（無此檔則建立）

```
node_modules/
qr/
```

- [ ] **Step 5: 建立 `docs/tournament/賽前作業.md`**

```markdown
# 8/20 第三屆 賽前作業清單

依序執行；1–3 可在賽前任何時候做，4–5 抽籤後做。

1. **填 Supabase 連線**：把 v2 專案的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   填入 `js/tournament-api.js` 開頭兩個常數，push 部署到 GitHub Pages。
2. **Seed 資料**：開 v2 Supabase SQL editor，照 `docs/tournament/seed-2026-08-20.sql`
   開頭註解查好 club_id 與 user id 後執行 DO 區塊，再跑 token 查詢並把結果存好。
3. **產 QR code**：`./scripts/generate-qr.sh <Pages 網址> <A~E 五個 captain_token>`，
   輸出在 `qr/`（勿 commit）。公開觀賽連結 = `<Pages 網址>/tournament.html?t=<public_token>`。
4. **抽籤後掛名單**：執行 seed SQL 檔下方五段「抽籤後」update（把 `<字母>` 換成抽到的隊）。
5. **發放**：QR code 印出或私訊給各隊隊長；觀賽連結貼到社團群組。

當天：管理者用 v2 管理頁監看、必要時補登/改判；賽後執行 seed SQL 檔末的
`status = 'finished'` 鎖定輸入。
```

- [ ] **Step 6: Commit**

```bash
git add docs/tournament/ scripts/generate-qr.sh .gitignore
git commit -m "docs: 比賽 seed SQL、QR 產生腳本與賽前作業清單"
```

---

### Task 7: 端對端驗證與收尾（需使用者提供 Supabase URL/anon key）

**Files:**
- Modify: `js/tournament-api.js`（填入實際 URL/anon key）
- Modify: `CLAUDE.md`（補充比賽頁說明）

**Interfaces:**
- Consumes: 使用者提供的 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`；使用者已執行 seed SQL
- Produces: 可交付的完整功能

- [ ] **Step 1: 填入 Supabase 常數**：把 `js/tournament-api.js` 的 `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` 換成使用者提供的實際值（**執行到此步時若還沒拿到，停下來向使用者要**）

- [ ] **Step 2: 跑全部 jest**

Run: `npm test`
Expected: 全 PASS

- [ ] **Step 3: 端對端手動驗證（照 spec 邊界清單逐項）**

前置：使用者已在 Supabase 跑完 seed，並提供 public_token 與兩個 captain_token（例如 A、B 隊）。
Run: `npx http-server -p 8000`，依下表逐項操作並記錄結果：

| # | 情境 | 操作 | 預期 |
|---|---|---|---|
| 1 | 觀賽正常 | 開 `?t=<public_token>` | 排名表全 0 並列第 1；30 場賽程依輪次排列，狀態「未完成」 |
| 2 | 無效 token | 開 `?t=xxx`、`?c=xxx` | 「找不到比賽，請確認連結是否正確」，不再輪詢 |
| 3 | 無 token | 開 `tournament.html` | 同上 |
| 4 | 隊長視角 | 開 `?c=<A隊token>` | A 隊 12 場高亮、顯示「請輸入比分」；他隊場次「未完成」不可點 |
| 5 | 單方回報 | A 隊對 R1 混雙輸 21:15 送出 | toast「已送出，等待對方隊長確認」；該場變「等待對方確認」 |
| 6 | 一致確認 | 另開視窗 `?c=<B隊token>`，同場輸 15:21 | toast「成績已確認」；雙方與觀賽頁 10 秒內看到 21：15 與排名更新 |
| 7 | 不一致衝突 | 另一場 A 輸 21:10、B 輸 21:12 | 雙方看到「比分不一致」；排名不變 |
| 8 | 衝突重送 | B 重開該場（預帶上次值）改輸 10:21 | 變「已確認」，排名更新 |
| 9 | confirmed 鎖定 | A 再點已確認場次 | 不可點（無 can-report）；直接打 RPC 會回「成績已確認，如需更正請找主辦」 |
| 10 | 比分驗證 | 輸入空值、31、-1、12.5、21:21 | 前端 toast 擋下，不發請求 |
| 11 | 網路失敗 | DevTools 切 offline 等下次輪詢 | 顯示「連線異常…稍後會自動重試」；恢復連線後自動復原 |
| 12 | 連點送出 | 送出瞬間連點按鈕 | 按鈕 disabled，只發一次請求（DevTools Network 確認） |
| 13 | finished 鎖定 | SQL 把 status 改 'finished' | 標題出現「比賽已結束」；隊長場次全部不可點；改回 'active' 復原 |
| 14 | 手機實測 | 手機開隊長連結 | 版面正常、數字鍵盤、切回前景即刷新 |

Expected: 全部符合。任何一項不符 → 回頭修，重驗該項。

- [ ] **Step 4: 更新 `CLAUDE.md`**：「專案結構」的檔案樹加入以下節點，並在「核心功能與實作」末尾加一節：

```markdown
### 7. 比賽計分頁（tournament.html）
- 8/20 第三屆比賽用：隊長輸分（雙方一致才確認）、即時排名、公開計分板
- 後端借用 v2 badminton-scheduler 的 Supabase RPC，設定在 `js/tournament-api.js`
- 純函式：`js/standings.js`（排名）、`js/tournament-form.js`（驗證/狀態），各有 jest 測試
- 賽前作業與 seed 見 `docs/tournament/賽前作業.md`
```

- [ ] **Step 5: 最終 commit**

```bash
git add js/tournament-api.js CLAUDE.md
git commit -m "chore: 填入 Supabase 連線設定並更新專案文件"
```

---

## Self-Review 紀錄

- **Spec coverage**：雙方確認輸分（Task 3/5＋後端既有）、即時排名與冠亞軍（Task 1/4）、公開計分板與輪詢（Task 4）、token 模式與無效 token（Task 2/4）、seed 與 QR 與抽籤流程（Task 6）、邊界清單 9 項全部對應 Task 7 驗證表、CLAUDE.md 出入修正不在本 spec 範圍（僅補新功能一節）。
- **Placeholder scan**：`__SUPABASE_URL__` 等為使用者部署設定（Task 7 Step 1 有取得程序），非計劃缺口；seed SQL 的 `<你的 club_id>` / `<字母>` 為使用者執行時依實況填入的參數，文件內有查詢指引。其餘無 TBD。
- **Type consistency**：`computeStandings` 回傳欄位（teamId/name/wins/losses/pointsFor/played/rank）與 Task 4 渲染一致；`matchState` 回傳（label/cssClass/canReport）與 Task 4 CSS class（confirmed/pending/waiting/conflict/action-needed）一致；`reports` 結構（myReport{scoreA,scoreB}/oppReported）在 Task 2 測試與 Task 5 預帶邏輯一致（含 A/B 方向轉換）。
