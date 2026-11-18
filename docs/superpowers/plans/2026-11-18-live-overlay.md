# 直播畫面疊加比分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增透明背景的 `overlay.html?t=<觀賽通行碼>`，給 PRISM 網頁小工具疊在直播畫面左下角，顯示總點數比分與最新打完的一場。

**Architecture:** 隊伍顏色先從 `tournament.js` 搬到 `team-points.js` 共用。新增 `js/overlay.js`：純函式 `overlayLines(view)` 算出兩行內容，`renderOverlay` 畫 DOM，`initOverlay` 驗證通行碼、每 10 秒用 `fetchPublicView` 重讀；讀取失敗保留上一次的畫面。不動後端。

**Tech Stack:** 原生 JS（`<script>` 依序載入）、Jest＋jsdom。

**Spec:** `docs/superpowers/specs/2026-11-18-live-overlay-design.md`

## Global Constraints

- 不加依賴、不打包；新檔結尾比照 `js/cheer.js` 的 `module.exports` 守衛。
- 隊伍顏色：`TEAM_COLORS = ['#e10600', '#00a19c', '#ff8000', '#9b5de5', '#f5c518']`，依 `view.teams` 順序配色。
- 第二行文案（逐字）：`尚未開打`；`最新：第三點 女雙 21:18 貿聯勝`（`最新：${pointLabel} ${eventLabel} ${左}:${右} ${勝隊}勝`）；`貿聯 拿下 3 點，確定勝出`；`比賽結束：貿聯 以 3：1 勝出`（全形冒號）。
- 只認 `?t=`；帶 `?c=` 或沒帶通行碼時只顯示 `請改用觀賽連結`，不讀資料。
- 重讀間隔 10000 ms；讀取失敗不顯示錯誤、保留上一次畫面。
- 換版 v20：`tournament.html` 全部 `?v=20`、`overlay.html` 本地資源 `?v=20`、`sw.js` `CACHE_NAME = 'hanlin-badminton-v20'`。
- 測試指令 `npm test`。任何 commit 不得含 32 位 hex 通行碼。
- 只在 worktree `~/HanLinBadmintonScheduler-live-overlay`（分支 `live-overlay`）改。

## Review Focus

1. PRISM 網頁小工具是否真的顯示透明背景、`vh` 字級在小工具全畫面時是否合適——單元測試驗不到，11-19 測試直播時在手機上實測。
2. 小工具沒設全畫面（例如被縮成一小塊）時比分條仍可讀——本機假資料頁量 1280×720 與 375×211 兩種尺寸。
3. PRISM 內建瀏覽器的快取：上線後第一次載入是否拿到舊版——11-19 實測，必要時在 PRISM 重新載入小工具。
4. 非比點賽事（第三屆）或隊伍不足兩隊：疊加頁不畫比分、不拋錯——Task 2 加測試。
5. 連續跑 3 小時：每次重畫取代舊內容、不累積 DOM——Task 2 加「重畫兩次後只有一個比分條」測試。

---

### Task 1: 隊伍顏色搬到 `team-points.js`（先釘住現況再搬）

**Files:**
- Modify: `js/team-points.js`（加 `TEAM_COLORS`、`teamColorById`，並匯出）
- Modify: `js/tournament.js:28-35`（刪掉兩者的定義，其餘呼叫不變）
- Test: `tests/team-points.test.js`、`tests/tournament-render.test.js`

**Interfaces:**
- Produces: `TEAM_COLORS: string[]`、`teamColorById(view: { teams: {id}[] }): { [teamId]: string }`（`team-points.js` 匯出）

- [ ] **Step 1: 特性測試（先在舊程式上跑綠）** `tests/tournament-render.test.js` 加 `點數比分板的隊伍色點：貿聯紅、翰林青` — `renderAll(friendlyView())` 後 `#pointBoard .team-dot` 前兩個的 `style.backgroundColor` 依序為 `rgb(225, 6, 0)`、`rgb(0, 161, 156)`。
- [ ] **Step 2:** `npx jest tests/tournament-render.test.js` → Expected: PASS（釘住現況）
- [ ] **Step 3: 寫失敗的測試** `tests/team-points.test.js` 加 `teamColorById 依隊伍順序配色、超過五隊從頭輪`：6 隊 → `#e10600, #00a19c, #ff8000, #9b5de5, #f5c518, #e10600`；`TEAM_COLORS` 長度 5。
- [ ] **Step 4:** `npx jest tests/team-points.test.js` → Expected: FAIL（`teamColorById is not a function`）
- [ ] **Step 5: 搬移**：定義移到 `team-points.js` 並匯出；`tournament.js` 刪掉定義，檔頭相依註解的 `team-points.js` 那行補上 `teamColorById`。
- [ ] **Step 6:** `npm test` → Expected: 全綠；`grep -n "TEAM_COLORS =\|function teamColorById" js/*.js` 只出現在 `team-points.js`（代替 no-undef 掃描：repo 沒有 eslint；計分頁的 jsdom 渲染測試照 `<script>` 順序載入並實際呼叫 `teamColorById`）
- [ ] **Step 7: Commit** `refactor: 隊伍顏色搬到 team-points.js 共用`

### Task 2: 疊加頁 `overlay.html`＋`js/overlay.js`＋`css/overlay.css`（v20）

**Files:**
- Create: `overlay.html`、`js/overlay.js`、`css/overlay.css`
- Modify: `tournament.html`（`?v=19` → `?v=20`）、`sw.js`（v20）、`tests/tournament-html-assets.test.js`（同時檢查 `overlay.html`）
- Test: `tests/overlay.test.js`（`@jest-environment jsdom`）

**Interfaces:**
- Consumes: `teamColorById`（Task 1）、`computeTeamPoints`／`hasPoints`／`pointLabel`／`eventLabel`（`team-points.js`）、`parseTokenFromUrl`（`tournament-form.js`）、`fetchPublicView`（`tournament-api.js`）
- Produces:
  - `OVERLAY_POLL_MS = 10000`
  - `latestConfirmedMatch(matches): match | null`
  - `overlayLines(view): { left: {name, color, points}, right: {name, color, points}, detail: string } | null`（非比點或不足兩隊回 `null`）
  - `renderOverlay(root: HTMLElement, lines | null, message?: string): void`
  - `initOverlay({ search, root, fetchView, intervalMs = OVERLAY_POLL_MS }): { refresh(): Promise<void>, stop(): void }`

- [ ] **Step 1: 寫失敗的測試** `tests/overlay.test.js`（用 Task 1 的友誼賽 15 場賽程做資料，隊伍 `M` 貿聯、`H` 翰林）：
  - `latestConfirmedMatch`：沒有確認的回 `null`；確認了 r1c3 與 r2c1 → 回 r2c1；同輪 r2c1、r2c2 → 回 r2c2；`conflict`／`pending` 不算。
  - `overlayLines`：
    - 都沒確認 → `left` `{name:'貿聯', color:'#e10600', points:0}`、`right` `{name:'翰林', color:'#00a19c', points:0}`、`detail` `尚未開打`
    - 最新一場是第三點女雙、`teamAId:'M'`、21:18 → `最新：第三點 女雙 21:18 貿聯勝`
    - 同一場但 `teamAId:'H'`、`teamBId:'M'`、`scoreA:18`、`scoreB:21` → 仍是 `21:18 貿聯勝`（照左右順序，不照 A/B 隊）
    - 貿聯先拿下第一～三點、還有場次沒確認 → `貿聯 拿下 3 點，確定勝出`
    - 15 場全部確認、貿聯 3：1（有一點對方贏）→ `比賽結束：貿聯 以 3：1 勝出`
    - 非比點賽事（`pointNo` 全是 `null`）或只有一隊 → `null`
  - `renderOverlay`：畫出一個 `.ov-bar`，第一行有兩個 `.ov-dot`（顏色同上）、`.ov-nums` 文字 `2 : 1`、`.ov-detail` 文字同 `detail`；連畫兩次後仍只有一個 `.ov-bar`；`lines` 為 `null` 且有 `message` 時只顯示 `message`；兩者都沒有時清空。
  - `initOverlay`（`jest.useFakeTimers()`，`fetchView` 用 `jest.fn`）：
    - `search: '?c=abc'` 與 `''` → 顯示 `請改用觀賽連結`，`fetchView` 沒被呼叫
    - `'?t=tok'` → 立刻呼叫 `fetchView('tok')` 並畫出比分；推進 10000 ms 再呼叫一次
    - 成功一次後 `fetchView` 拋錯 → 畫面維持上一次內容、沒有任何錯誤文字
    - 第一次就回 `{ tournament: null }` → 顯示 `找不到比賽，請確認觀賽連結`（設定時填錯網址才看得到；成功過之後不會再出現）
    - `stop()` 後推進時間不再呼叫
  - `tests/tournament-html-assets.test.js`：`overlay.html` 引用 `js/overlay.js` 與 `css/overlay.css`，且所有本地資源帶與 `CACHE_NAME` 相同的版本號。
- [ ] **Step 2:** `npx jest tests/overlay.test.js tests/tournament-html-assets.test.js` → Expected: FAIL（找不到 `../js/overlay.js`、`overlay.html`）
- [ ] **Step 3: 實作**
  - `overlay.js`：DOM 一律 `createElement`／`textContent`。`initOverlay` 用 `parseTokenFromUrl`，只在 `mode === 'public'` 時讀資料。檔尾在瀏覽器環境以 `DOMContentLoaded` 呼叫 `initOverlay({ search: location.search, root: document.getElementById('overlay'), fetchView: fetchPublicView })`。
  - `overlay.html`：`<title>直播比分疊加</title>`、viewport meta、`<meta name="referrer" content="no-referrer">`、Noto Sans TC（同 `tournament.html` 的 Google Fonts 連結）、`css/overlay.css?v=20`、`<div id="overlay"></div>`；script 依序 `tournament-form`、`tournament-api`、`team-points`、`overlay`，皆 `?v=20`。
  - `overlay.css`：`html, body { background: transparent; margin: 0; }`；`#overlay` 固定在左下（`left`/`bottom` 各 `2.5vh`）；`.ov-bar` 半透明深色底 `rgba(0,0,0,0.62)`、白字、圓角，第一行 `font-size: 4.2vh`、數字粗體，`.ov-detail` `0.62em`。
  - 換版 v20（`tournament.html`、`overlay.html`、`sw.js`）。
- [ ] **Step 4:** `npm test` → Expected: 全綠
- [ ] **Step 5: 本機假資料頁**：比照上次的做法（stub `fetch`，不碰正式資料），在 1280×720 與 375×211 量比分條位置、字級，確認背景透明（`getComputedStyle(document.body).backgroundColor` 為 `rgba(0, 0, 0, 0)`）。
- [ ] **Step 6: Commit** `feat: 直播畫面疊加比分頁 overlay.html（v20）`

### Task 3: 文件

**Files:**
- Modify: `docs/tournament/賽前作業.md`（「重新整理一次」→「重新整理一兩次」；新增「直播疊加比分（PRISM）」小節：Widget → Web、網址 `…/overlay.html?t=<觀賽通行碼>`、設成全畫面、不要貼輸分連結、比分要等隊長輸入才會更新）
- Modify: `CLAUDE.md`（第 7 節加疊加頁一條；測試數字更新；檔案樹加 `overlay.html`、`js/overlay.js`、`css/overlay.css`、`tests/overlay.test.js`；`team-points.js` 說明補「隊伍顏色」）

- [ ] **Step 1:** 改兩份文件
- [ ] **Step 2:** `grep -c "重新整理一次" docs/tournament/賽前作業.md` → Expected: `0`；`npm test` 全綠
- [ ] **Step 3: Commit** `docs: 疊加比分設定步驟、重新整理一兩次`

**不在本計劃內（要你同意才做）**：合併 `live-overlay` 進 main、上線後實跑、11-19 在 PRISM 實測。

## 執行時的變更（2026-11-18）

- 「全部確認」的例子改成 3：2（15 場全確認時 5 點都分出勝負，3：1 不可能）。
- 尺寸單位 `vh` 改 `vmin`、字放大（第一行 5.6vmin、第二行 3.4vmin）：實測 4.2vh 在手機嵌入框裡第二行只剩約 5px。
- `initOverlay` 另回傳 `ready`（第一次讀取的 promise），測試用。
- review 後：還沒顯示過比分時顯示 `讀取比分中…`／`這場比賽沒有點數比分，請確認觀賽連結`，讀取失敗寫到主控台；顯示過之後算不出比分也保留上一次畫面。
