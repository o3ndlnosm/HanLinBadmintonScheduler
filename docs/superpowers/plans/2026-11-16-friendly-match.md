# 貿聯×翰林友誼賽計分頁＋公司應援條 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `tournament.html` 支援「兩家公司比點、21 分制」的友誼賽，並加上公司應援條，舊比賽行為不變。

**Architecture:** 計分規則與點次存在資料庫（比賽層級 `score_rule`、場次層級 `point_no`／`event_tag`），前後端各自依資料檢查與呈現；
點數計算與應援的累積／裁切／比例都是純函式（jest），渲染層靠瀏覽器驗證；應援走獨立 RPC 與獨立計時器，失敗靜默，不碰計分流程。

**Tech Stack:** 原生 JS（瀏覽器 + CommonJS 匯出給 jest）、jest 30、Supabase Postgres（plpgsql security definer RPC）、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-11-16-friendly-match-design.md`

## Global Constraints

- 賽名「貿聯×翰林2026羽球聯合友誼賽」，`held_on` 2026-11-25
- 規則代碼只有兩個：`to15_cap21`（預設，舊比賽）、`to21_cap30`（友誼賽）
- 21 分制合法完賽比分：21:0–19；22–29 勝方對方 = 勝方 − 2；30:28、30:29
- 應援：每 2 秒最多算 10 下（超過捨棄）、每 2 秒送一次、總數每 3 秒輪詢；後端單次 `p_n` 只收 1–10 整數
- 點數：每點三戰兩勝（過半 = 2）、五點三勝（過半 = 3），過半數由資料推導，不寫死
- 任何 token 不得進 commit（repo 公開）；`qr/` 與交付檔放 `~/Downloads/badminton-friendly-1125/`
- 所有 SQL 檔可安全重跑；建賽有存在性檢查
- 改前端檔案要 bump `sw.js` 的 `CACHE_NAME`（目前 `hanlin-badminton-v15` → `v16`）
- 所有後端實測在測試比賽上做，清理時連 `report_a`／`report_b` 與應援數一起清
- `npm test` 一律在 worktree `~/HanLinBadmintonScheduler-friendly-1125` 跑（`node_modules` 為 symlink）

## Review Focus

1. 主辦手機有舊版 SW 快取：舊前端拿到 `scoreRule` 也不認得，會用 15 分制擋掉 22:20 → Task 7 上線後用開過主頁的瀏覽器實測重整兩次後可送出 22:20
2. 狂按途中切到背景或鎖螢幕：未送出的累積不可丟成負數或重複送 → Task 3 `flushOnHidden` 測試
3. 應援 RPC 失敗（離線、Supabase 暫停）：不得拋錯、不得出現錯誤框、比分輪詢照常 → Task 3 失敗路徑測試＋Task 5 瀏覽器實測
4. 點已 2:0 後第三場被輸成對方勝，或第三場 conflict：點的歸屬不變 → Task 2 測試
5. 比賽前 Supabase 又被暫停 → Task 7 最後一步：11/24 確認

---

### Task 1: 依比賽設定的計分規則（前端）

**Files:**
- Modify: `js/tournament-form.js`（`isLegalFinalScore`、`validateScores`、匯出）
- Test: `tests/tournament-form.test.js`

**Interfaces:**
- Produces:
  - `SCORE_RULES`：`{ to15_cap21: { max: 21, isLegal(a, b), rangeError, ruleError }, to21_cap30: { max: 30, … } }`
  - `resolveScoreRule(rule) -> string`：不認得或缺值回 `'to15_cap21'`
  - `isLegalFinalScore(a, b, rule = 'to15_cap21') -> boolean`
  - `validateScores(selfInput, oppInput, rule = 'to15_cap21') -> { ok, scoreSelf, scoreOpp } | { ok:false, error }`
  - `maxScoreOf(rule) -> number`

- [ ] **Step 1: 寫失敗測試**（新 `describe('validateScores — to21_cap30')`）
  - 合法（雙向都測，含輸方視角）：`21:0`、`21:19`、`22:20`、`25:23`、`29:27`、`30:28`、`30:29`、`19:21`
  - 不合法回 `{ ok:false, error:'比分不符合賽制（21 分制、deuce 最高 30 分），請確認' }`：`20:21`、`21:20`、`22:21`、`30:27`、`23:20`
  - 範圍錯誤回 `'比分需為 0–30 的整數'`：`31:29`、`''`、`'12.5'`、`'-1'`
  - 平手 `21:21` 回 `'羽球比賽不會平手，請確認比分'`
  - `resolveScoreRule(undefined)`、`resolveScoreRule('xx')` → `'to15_cap21'`；`maxScoreOf('to21_cap30')` → 30
  - 既有 15 分制測試不改，`validateScores(a, b)` 不帶 rule 時行為不變
- [ ] **Step 2:** `npm test -- tournament-form` → 新測試 FAIL
- [ ] **Step 3: 實作**：既有 15 分制判斷搬進 `SCORE_RULES.to15_cap21`，錯誤訊息照舊（`'比分需為 0–21 的整數'`、`'比分不符合賽制（15 分制、deuce 最高 21 分），請確認'`）；`validateScores` 依 `resolveScoreRule(rule)` 取規則
- [ ] **Step 4:** `npm test` → 全綠（含既有全部測試）
- [ ] **Step 5: Commit** `feat(tournament): 計分規則依比賽設定（新增 21 分制 deuce 上限 30）`

### Task 2: 點數計算純函式

**Files:**
- Create: `js/team-points.js`
- Test: `tests/team-points.test.js`

**Interfaces:**
- Consumes: match 物件欄位 `{ id, roundNo, courtNo, event, eventTag, pointNo, teamAId, teamBId, status, scoreA, scoreB }`
- Produces:
  - `hasPoints(matches) -> boolean`：任一場 `pointNo` 為數字
  - `computeTeamPoints(teams, matches) -> { points: [{ pointNo, event, eventTag, wins: { [teamId]: number }, played: number, total: number, winnerId: string|null }], totals: { [teamId]: number }, winnerId: string|null, allConfirmed: boolean }`
    - `points` 依 `pointNo` 升冪；`total` 為該點場數，`played` 為已確認場數
    - 點的 `winnerId`：確認勝場數 ≥ `Math.floor(total / 2) + 1` 的一方
    - 整體 `winnerId`：拿下點數 ≥ `Math.floor(points.length / 2) + 1` 的一方
    - 只計 `status === 'confirmed'`；`pointNo` 為 null 的場次忽略

- [ ] **Step 1: 寫失敗測試**（兩隊 `M`=貿聯、`H`=翰林，依 spec 的 15 場賽程建 fixture）
  - 全 pending：五點皆 `winnerId:null`、`wins` 皆 0、`totals {M:0,H:0}`、整體 `winnerId:null`、`allConfirmed:false`
  - 第一點 H 先贏兩場 → 該點 `winnerId:'H'`；之後第三場 M 勝 → `wins {M:1,H:2}`、`winnerId` 仍 `'H'`
  - 第一點 H 勝一場、第二場 conflict、第三場 pending → `winnerId:null`、`played:1`
  - H 拿下第 1–3 點 → 整體 `winnerId:'H'`、`totals.H === 3`；其餘場次仍 pending 時 `allConfirmed:false`
  - 15 場全確認 → `allConfirmed:true`
  - `hasPoints` 對第三屆格式（無 `pointNo`）回 false
- [ ] **Step 2:** `npm test -- team-points` → FAIL
- [ ] **Step 3: 實作** `js/team-points.js`（瀏覽器全域＋`module.exports`，同 `standings.js` 寫法）
- [ ] **Step 4:** `npm test` → 全綠
- [ ] **Step 5: Commit** `feat(tournament): 比點計算純函式 computeTeamPoints`

### Task 3: 應援條（純函式＋控制器）

**Files:**
- Create: `js/cheer.js`
- Test: `tests/cheer.test.js`

**Interfaces:**
- Consumes: Task 5 的 RPC 封裝 `sendCheer(token, teamId, n) -> Promise<{ [teamId]: number }>`、`fetchCheerTotals(token) -> Promise<{ [teamId]: number }>`（測試時以 mock 注入）
- Produces:
  - `CHEER_MAX_PER_WINDOW = 10`、`CHEER_FLUSH_MS = 2000`、`CHEER_POLL_MS = 3000`
  - `addTap(windowCount, max = 10) -> { windowCount, counted: boolean }`
  - `cheerRatio(totals, teamAId, teamBId) -> number`（A 方百分比 0–100，兩邊皆 0 時 50）
  - `displayTotals(serverTotals, pendingByTeam) -> { [teamId]: number }`（伺服器數＋本機尚未送出的量）
  - `createCheerController({ token, teamIds, send, fetchTotals, onChange }) -> { tap(teamId), flush(), poll(), stop() }`
    - `tap` 依 `addTap` 計入本機 pending，立即 `onChange(displayTotals(...))`
    - `flush` 每隊各送一次 pending（> 0 才送），送出前先把 pending 歸零；失敗靜默吞掉、不重送
    - `poll` 取總數後 `onChange`；失敗靜默
- [ ] **Step 1: 寫失敗測試**
  - `addTap` 第 1–10 下 `counted:true`，第 11 下 `counted:false` 且 `windowCount` 停在 10
  - `cheerRatio({M:0,H:0},'M','H') === 50`；`{M:30,H:10}` → 75
  - `displayTotals({M:5,H:3},{M:2}) → {M:7,H:3}`
  - 控制器：tap M 12 下 → `onChange` 顯示 M +10；`flush()` 後 `send` 只被呼叫一次且 `n === 10`；再 `flush()` 不呼叫 `send`
  - `send` reject 時 `flush()` 不拋錯，下一次 tap＋flush 照常送出
  - `fetchTotals` reject 時 `poll()` 不拋錯、不呼叫 `onChange`
  - 分頁轉背景（測試直接呼叫 `flush()` 模擬 `visibilitychange` hidden 的處理）後 pending 歸零、不重複送
- [ ] **Step 2:** `npm test -- cheer` → FAIL
- [ ] **Step 3: 實作** `js/cheer.js`（計時器與 DOM 綁定放在不匯出的 `mountCheerBar(view, token)`，由 Task 5 呼叫；計時器只在 `document.visibilityState === 'visible'` 時輪詢）
- [ ] **Step 4:** `npm test` → 全綠
- [ ] **Step 5: Commit** `feat(tournament): 公司應援條的累積、裁切與控制器`

### Task 4: 後端 schema 與 RPC

**Files:**
- Create: `docs/tournament/friendly-schema-2026-11-25.sql`
- Create: `docs/tournament/friendly-rpc-selftest.sql`（`begin; … rollback;` 自我測試，不留資料）

**Interfaces:**
- Produces（皆 `security definer`、`set search_path = public, pg_temp`）：
  - `tournaments.score_rule`、`tournament_matches.point_no`、`tournament_matches.event_tag`、表 `tournament_cheers`（見 spec「資料庫」1–3）
  - `tournament_score_legal(p_rule text, p_a int, p_b int) returns boolean`（immutable；規則同 Task 1，為前後端唯一的 SQL 版本）
  - `tournament_public_payload` 多吐 `tournament.scoreRule`、`matches[].pointNo`、`matches[].eventTag`（其餘 key 原樣保留，含 `playersA/B`）
  - `tournament_report_score` 改用 `tournament_score_legal`，錯誤訊息與 Task 1 相同字串
  - `tournament_cheer(p_token text, p_team uuid, p_n int) returns jsonb`、`tournament_cheer_totals(p_token text) returns jsonb`（回 `{ teamId: count }`；token 可為觀賽或該比賽任一隊輸分 token；`p_n` 非 1–10 整數或比賽 finished → raise）
  - `grant execute … to anon` 給兩個新 RPC
- [ ] **Step 1: 寫自我測試 SQL**：在交易內建測試比賽（`to21_cap30`、兩隊、3 場同一點），以 `do $$ … assert … $$` 驗證：
  - 22:20、30:29 收；22:21、21:20、31:29 擋（捕捉 exception 比對訊息）
  - 雙方一致 → confirmed；不一致 → conflict
  - 預設規則的比賽 21:20 收、22:20 擋
  - `tournament_cheer` 用觀賽 token 加 10 → 總數 10；`p_n` 0、11 擋；別場比賽的 token 擋
  - payload 帶 `scoreRule`、`pointNo`、`eventTag`
  - 第三屆 30 場 confirmed 比分 `tournament_score_legal('to15_cap21', …)` 全部 true
  - 結尾 `rollback`
- [ ] **Step 2: 寫 schema SQL**（add column if not exists／create table if not exists／create or replace）
- [ ] **Step 3: 在 Supabase SQL Editor 先跑 schema、再跑自我測試**（Chrome，`monaco.editor.getModels()[0].setValue(sql)` 後按 Run）→ 自我測試無 exception
- [ ] **Step 4:** 用第三屆的觀賽連結開舊頁面（線上 main 版前端）確認畫面照舊、30 場比分都在
- [ ] **Step 5: Commit** `feat(tournament): 比賽層級計分規則、點次欄位與應援 RPC（SQL）`

### Task 5: 計分頁整合（點數計分板、賽程標籤、應援條、標題）

**Files:**
- Modify: `js/tournament-api.js`（新增 `sendCheer`、`fetchCheerTotals`）
- Modify: `tests/tournament-api.test.js`
- Modify: `js/tournament.js`、`tournament.html`、`css/tournament.css`、`sw.js`（`CACHE_NAME` → `hanlin-badminton-v16`）
- Create: `docs/tournament/friendly-test-seed.sql`（建「～友誼賽測試（測完即刪）～」＋檔尾清理段；不 commit token）

**Interfaces:**
- Consumes: Task 1 `validateScores(…, rule)`、`maxScoreOf`；Task 2 `hasPoints`、`computeTeamPoints`；Task 3 `mountCheerBar`；Task 4 payload 欄位與 RPC
- Produces: `sendCheer(token, teamId, n)` → RPC `tournament_cheer`；`fetchCheerTotals(token)` → RPC `tournament_cheer_totals`

- [ ] **Step 1:** `tests/tournament-api.test.js` 加兩支新封裝的參數對應測試（比照既有 `reportScore` 測試）→ FAIL → 實作 → PASS
- [ ] **Step 2: `tournament.js` 改動**
  - `renderHeader`：`document.title = view.tournament.name`
  - `hasPoints(view.matches)` 時以 `renderPointBoard(view)` 取代 `renderStandings`：大字「貿聯 X : Y 翰林」、五列「第一點 男雙A　wins　拿下方／進行中」、整體勝方顯示「🏆 〇〇 拿下 N 點，確定勝出」、`allConfirmed` 時加「比賽結束」
  - 賽程 chip：有 `pointNo` 時為「場地1　第一點 男雙A」（點次用中文數字一～五）
  - 輸分彈窗：`validateScores(…, view.tournament.scoreRule)`；兩個輸入框 `max` 設為 `maxScoreOf(rule)`
  - 比點模式才呼叫 `mountCheerBar(view, auth.token)`（只掛一次）
- [ ] **Step 3: `tournament.html`／`css/tournament.css`**：點數計分板與應援條容器、`<script src="js/team-points.js">`、`<script src="js/cheer.js">`；樣式沿用既有 F1 風格與 `TEAM_COLORS`
- [ ] **Step 4:** `npm test` → 全綠
- [ ] **Step 5: 瀏覽器實測**（Supabase 跑 `friendly-test-seed.sql` 建測試比賽；本機靜態伺服器開 worktree 頁面；兩個輸分網址＋觀賽網址各開一分頁）逐項照 spec「邊界清單」：
  - 22:21、20:21、31:29 被擋，訊息為 21 分制；22:20、30:29 可送；雙方一致 → 已確認；不一致 → 比分不一致
  - 某點 2:0 後第三場輸成對方勝 → 該點仍歸原方；先拿 3 點 → 顯示確定勝出，後續場次可輸入
  - 狂按 → 本機立刻動；另一分頁 3 秒內看到變化；關掉網路 → 應援靜默、比分頁顯示既有的「連線異常」橫幅即可
  - 第三屆觀賽連結開本機版 → 排名表與畫面照舊
  - 375px 手機寬版面
- [ ] **Step 6:** 跑 `friendly-test-seed.sql` 檔尾清理段（連 report、應援數）並複驗測試比賽已刪
- [ ] **Step 7: Commit** `feat(tournament): 比點計分板、賽程點次標籤、公司應援條與動態標題`

### Task 6: 應援負載實測

**Files:**
- Create: `scripts/cheer-load-test.mjs`（Node 18+ 內建 fetch；token 從命令列參數讀，不寫死）

- [ ] **Step 1: 實作**：`node scripts/cheer-load-test.mjs <public_token> <teamAId> <teamBId> [clients=50] [seconds=60]`；每個模擬手機每 2 秒 `tournament_cheer` n=10、每 3 秒 `tournament_cheer_totals`、每 10 秒 `tournament_public_view`；輸出各 RPC 的請求數、錯誤數、p50／p95 毫秒
- [ ] **Step 2:** 對測試比賽跑一次 → 通過標準：錯誤率 0%、p95 < 1500 ms；結果原文存 `~/Downloads/badminton-friendly-1125/load-test-YYYYMMDD.txt`
- [ ] **Step 3:** 清理測試比賽（同 Task 5 Step 6）
- [ ] **Step 4: Commit** `chore(tournament): 應援負載實測腳本`

### Task 7: 建友誼賽、上線與交付

**Files:**
- Create: `docs/tournament/friendly-seed-2026-11-25.sql`
- Create: `docs/tournament/friendly-lineup-2026-11-25.sql`（場次粒度、可重跑；人名到了再填值）
- Modify: `CLAUDE.md`（「比賽計分頁」一節補：計分規則依比賽、比點模式、應援條、友誼賽 SQL 檔）

- [ ] **Step 1: 寫建賽 SQL**：存在性檢查（同名同日存在則 `raise notice` 跳過）；`club_id`／`created_by` 取自第三屆那筆；先建貿聯再建翰林；15 場依 spec 表格；檔尾純查詢列出 `public_token` 與兩隊 `captain_token`
- [ ] **Step 2:** Supabase 跑建賽 SQL → 複驗：2 隊、15 場、全 pending、`score_rule = 'to21_cap30'`、`point_no` 1–5 各 3 場；再跑一次確認沒有重複建
- [ ] **Step 3: 上線前檢查**（本專案沒有 test 分支，照 `prod-release-check` 精神手動做）：`git diff main...friendly-match-1125 --stat` 只含本計劃檔案；`npm test` 全綠；請使用者同意後合併進 main 並 push
- [ ] **Step 4: 線上驗證**：GitHub Pages 生效後，用友誼賽觀賽連結與兩個輸分連結開線上版（含開過主頁、有舊 SW 的瀏覽器重整兩次）→ 標題、點數計分板、應援條正常；不送出比分（正式比賽資料保持 pending）
- [ ] **Step 5: 交付**：`npx --yes qrcode` 產生 `貿聯-輸分.png`、`翰林-輸分.png`、`觀賽.png` 到 `~/Downloads/badminton-friendly-1125/`，連同三個網址寫成 `連結.txt`；用 SendUserFile 給使用者轉交孟娜
- [ ] **Step 6: Commit** `feat(tournament): 友誼賽建賽與出賽選手 SQL，更新 CLAUDE.md`
- [ ] **Step 7（11/24）:** 確認 Supabase 沒被暫停、觀賽連結可開；人名若已到，填 `friendly-lineup` 並跑、複驗後 commit
