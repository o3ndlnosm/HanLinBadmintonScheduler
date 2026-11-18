# 觀賽頁嵌入 YouTube 直播 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 賽事資料有 YouTube 直播網址時，觀賽頁在賽名下方、點數比分板上方出現直播框；沒有網址時頁面不變。

**Architecture:** 新增 `js/live.js`：一個純函式從網址取出 11 碼影片 ID，一個掛載函式把直播框掛進 `#liveSection`，並以 section 上記錄的 ID 判斷要不要重掛。`renderAll` 只在觀賽模式呼叫它，包在 try/catch 裡。後端在 `tournaments` 加 `live_url` 欄位，由共用的 `tournament_public_payload` 送出 `liveUrl`。

**Tech Stack:** 原生 JS（`<script>` 依序載入，無打包）、Jest＋jsdom、Supabase（Postgres SQL，在 SQL Editor 執行）。

**Spec:** `docs/superpowers/specs/2026-11-18-live-stream-design.md`

## Global Constraints

- 不加任何依賴、不加打包；新檔比照 `js/cheer.js` 結尾的 `if (typeof module !== 'undefined' && module.exports)` 匯出。
- 計分頁所有本地 CSS／JS 網址改 `?v=19`，`sw.js` 的 `CACHE_NAME = 'hanlin-badminton-v19'`（`tests/tournament-html-assets.test.js` 會檢查）。
- 文案：區塊標題「直播」（圖示 `fas fa-video`）、iframe `title`「直播」、連結文字「在 YouTube 開啟」。
- 播放器網址 `https://www.youtube.com/embed/<ID>`，不帶任何參數（不自動播放）；連結網址 `https://www.youtube.com/watch?v=<ID>`。
- iframe `referrerPolicy = 'strict-origin-when-cross-origin'`；整頁的 `<meta name="referrer" content="no-referrer">` 不動。
- 只有 `auth.mode === 'public'`（`?t=`）才掛直播框；`captain`（`?c=`）一律不掛。
- 測試指令 `npm test`（會設 `TZ=America/Los_Angeles`；直接跑 `npx jest` 會有一項時區測試失敗）。
- repo 是公開的：任何 commit 不得含通行碼（32 位 hex）或直播網址。
- 只在 worktree `~/HanLinBadmintonScheduler-live-stream`（分支 `live-stream`）改；主目錄只讀。

## Review Focus

1. 瀏覽器是否真的讓 iframe 的 `referrerPolicy` 蓋過整頁的 `no-referrer`（YouTube 錯誤 153）——單元測試驗不到，上線後用真影片在 Chrome 與手機實測。
2. 375px 手機寬度：直播框維持 16:9、沒有水平捲動。
3. 每 10 秒 `renderAll` 重畫時，其他區塊的重畫不能清掉或重建直播框——Task 2 加「連續 renderAll 兩次仍是同一個 iframe」的測試。
4. 後端還沒加欄位時（payload 沒有 `liveUrl` 這個 key）：直播框不出現、不拋錯——Task 2 加測試。
5. 手機上全螢幕按鈕可用（`allowfullscreen`）——上線後實測。

---

### Task 1: `js/live.js`（網址取 ID＋直播框掛載）

**Files:**
- Create: `js/live.js`
- Test: `tests/live.test.js`（`@jest-environment jsdom`）

**Interfaces:**
- Produces:
  - `youtubeIdFrom(url: any): string | null`
  - `mountLiveBox(section: HTMLElement, url: any): void`
  - 匯出：`{ youtubeIdFrom, mountLiveBox }`

- [ ] **Step 1: 寫失敗的測試** `tests/live.test.js`

`youtubeIdFrom` 以 `test.each` 表格（ID 用 `AbCdEfGhI_-`）：

| 輸入 | 期望 |
|---|---|
| `https://www.youtube.com/watch?v=AbCdEfGhI_-` | `AbCdEfGhI_-` |
| `https://youtube.com/watch?v=AbCdEfGhI_-&t=30s` | 同上 |
| `https://m.youtube.com/watch?v=AbCdEfGhI_-` | 同上 |
| `https://youtu.be/AbCdEfGhI_-?si=xyz` | 同上 |
| `https://www.youtube.com/live/AbCdEfGhI_-?si=xyz` | 同上 |
| `https://www.youtube.com/embed/AbCdEfGhI_-` | 同上 |
| `AbCdEfGhI_-` | 同上 |
| `  https://youtu.be/AbCdEfGhI_-  ` | 同上 |
| `youtube.com/watch?v=AbCdEfGhI_-`（沒有 https://） | 同上 |
| `null`、`undefined`、`''`、`123` | `null` |
| `https://www.youtube.com.evil.com/watch?v=AbCdEfGhI_-` | `null` |
| `https://evilyoutube.com/watch?v=AbCdEfGhI_-` | `null` |
| `https://vimeo.com/123456` | `null` |
| `javascript:alert(1)` | `null` |
| `ftp://youtu.be/AbCdEfGhI_-` | `null` |
| `https://www.youtube.com/watch?v=short` | `null` |
| `https://www.youtube.com/watch?v=AbCdEfGhI_-"><b>` | `null` |
| `https://www.youtube.com/@somechannel/live` | `null` |

`mountLiveBox`（每個測試新建一個 `<section hidden>`）：
- `null 網址：區塊維持隱藏、沒有 iframe`
- `合法網址：區塊出現，iframe 指向 embed 網址且只送網域` — `section.hidden === false`；唯一的 iframe `src === 'https://www.youtube.com/embed/AbCdEfGhI_-'`、`referrerPolicy === 'strict-origin-when-cross-origin'`、`title === '直播'`、`allowFullscreen === true`；`h2` 文字含「直播」；`a` 的 `href === 'https://www.youtube.com/watch?v=AbCdEfGhI_-'`、`target === '_blank'`、`rel` 含 `noopener`、文字「在 YouTube 開啟」
- `同一支影片再掛一次（換成另一種網址寫法）：還是同一個 iframe 元素` — 先 `watch?v=` 再 `youtu.be/`，`expect(second).toBe(first)`
- `換影片：iframe 換成新 ID`
- `網址清空：區塊隱藏、iframe 移除`
- `其他網站的網址：區塊隱藏`

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/live.test.js`
Expected: FAIL，`Cannot find module '../js/live.js'`

- [ ] **Step 3: 實作 `js/live.js`**

- `youtubeIdFrom`：非字串回 `null`；`trim()`；整串符合 `/^[A-Za-z0-9_-]{11}$/` 直接回傳；沒有 `http(s)://` 開頭就補 `https://`；`new URL()` 失敗回 `null`；protocol 只收 `http:`／`https:`；hostname 只收 `youtube.com`、`www.youtube.com`、`m.youtube.com`、`youtu.be`（精確比對）；`youtu.be` 取路徑第一段，`youtube.com` 取 `/watch` 的 `v`、`/live/<ID>`、`/embed/<ID>`；取出的 ID 再用同一個 11 碼規則驗，不符回 `null`。
- `mountLiveBox`：目前 ID 記在 `section.dataset.liveId`（不用模組層變數，測試互不干擾）；新 ID 與記錄相同就直接 return；不同就清空 section 重建 `h2`（`<i class="fas fa-video"></i> 直播`）＋`div.live-frame > iframe`＋`a.live-open`，`allow = 'encrypted-media; picture-in-picture; fullscreen'`；ID 為 `null` 時清空並 `hidden = true`、刪掉 `dataset.liveId`。DOM 一律用 `createElement`／`textContent`，不用 `innerHTML` 拼網址。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest tests/live.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/live.js tests/live.test.js
git commit -m "feat: 直播框模組（YouTube 網址取 ID、只掛一次）"
```

### Task 2: 接上計分頁（HTML、CSS、renderAll、換版）

**Files:**
- Modify: `tournament.html`（`#pointsSection` 前加 `<section id="liveSection" class="live-section" hidden></section>`；`tournament.js` 前加 `<script src="js/live.js?v=19">`；所有 `?v=18` → `?v=19`）
- Modify: `sw.js`（`CACHE_NAME` → `hanlin-badminton-v19`）
- Modify: `css/tournament.css`（`.live-section`、`.live-frame`、`.live-frame iframe`、`.live-open`；用現有 `--f1-*` 變數；`.live-frame` 用 `aspect-ratio: 16 / 9`、`width: 100%`，iframe 填滿、無邊框）
- Modify: `js/tournament.js`（檔頭相依註解加 `live.js → mountLiveBox`；`renderAll` 在 `renderSchedule(view)` 之後、應援區塊之前加觀賽模式的直播掛載，包 try/catch，註解寫反目標）
- Test: `tests/tournament-render.test.js`（`SCRIPTS` 在 `'cheer'` 後加 `'live'`）

**Interfaces:**
- Consumes: `mountLiveBox(section, url)`（Task 1）；`view.tournament.liveUrl`（Task 3 的後端；前端不依賴它存在）

- [ ] **Step 1: 寫失敗的測試**（新 describe「直播框」，各測試自己設 `auth`，結束還原成 `captain`；需要時用 `globalEval('mountLiveBox = …')` 換成 spy，結束還原原函式）

- `觀賽模式有直播網址：直播框出現在點數比分板之前` — `auth = public`，`view.tournament.liveUrl = 'https://youtu.be/AbCdEfGhI_-'`；`#liveSection` 不隱藏、有 iframe；`liveSection.compareDocumentPosition(pointsSection) & Node.DOCUMENT_POSITION_FOLLOWING` 為真
- `連續 renderAll 兩次：還是同一個 iframe 元素`
- `輸分模式有直播網址：不掛直播框` — `auth = captain`；spy 沒被呼叫、`#liveSection` 隱藏
- `payload 沒有 liveUrl：直播框不出現、不拋錯`
- `比賽 finished 後網址還在：直播框照樣顯示`
- `直播框掛載出錯：賽程照樣畫出 15 列`

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/tournament-render.test.js`
Expected: FAIL（`#liveSection` 不存在、`live.js` 讀不到）

- [ ] **Step 3: 改 HTML、CSS、`renderAll`、`sw.js`**

- [ ] **Step 4: 跑全套測試**

Run: `npm test`
Expected: 全綠（原本 320 項，加上 Task 1、Task 2 的新測試）

- [ ] **Step 5: 本機瀏覽器看版面**（假資料測試頁，不碰正式資料）：375px 寬，直播框 16:9、沒有水平捲動；拿一部公開影片確認 iframe 載得出來

- [ ] **Step 6: Commit**

```bash
git add tournament.html sw.js css/tournament.css js/tournament.js tests/tournament-render.test.js
git commit -m "feat: 觀賽頁顯示 YouTube 直播框（v19）"
```

### Task 3: 後端 SQL 與當天作業說明

**Files:**
- Create: `docs/tournament/live-url-2026-11-25.sql`
- Modify: `docs/tournament/賽前作業.md`（加「填直播網址／清掉直播網址」兩行 SQL）
- Modify: `CLAUDE.md`（專案）：第 7 節加一條直播框說明；測試數字更新成實際數字；檔案樹加 `js/live.js`、`tests/live.test.js`

**Interfaces:**
- Produces: `tournament_public_payload(uuid)` 的 `tournament` 物件多 `liveUrl`（text 或 null）

- [ ] **Step 1: 寫 SQL 檔**，檔頭比照 `friendly-schema-2026-11-25.sql`（用途、可安全重跑、執行順序、回復方式）。內容：
  1. `alter table tournaments add column if not exists live_url text;`
  2. `tournament_public_payload`：逐字複製 `friendly-schema-2026-11-25.sql` 第 47 行起的定義，只在 `tournament` 物件加 `'liveUrl', t.live_url`
  3. 執行前比對用的唯讀查詢：`select pg_get_functiondef('public.tournament_public_payload(uuid)'::regprocedure);`
  4. 執行後檢查用的唯讀查詢：每場賽事 `tournament_public_payload(id)->'tournament' ? 'liveUrl'` 都是 true
  5. 回復：註解寫「重跑 `friendly-schema-2026-11-25.sql` 裡的 `tournament_public_payload` 定義；`live_url` 欄位留著無害」
- `賽前作業.md` 的兩行用 `where name = '貿聯×翰林2026羽球聯合友誼賽'` 指定賽事，網址留 `<直播網址>`。

- [ ] **Step 2: 檢查**

Run: `grep -c "'liveUrl', t.live_url" docs/tournament/live-url-2026-11-25.sql && npm test`
Expected: `1`，測試全綠

- [ ] **Step 3: Commit**

```bash
git add docs/tournament/live-url-2026-11-25.sql docs/tournament/賽前作業.md CLAUDE.md
git commit -m "docs: 直播網址欄位 SQL 與當天作業說明"
```

**不在本計劃內（要你同意才做）**：在正式 Supabase 執行這支 SQL、合併 `live-stream` 進 main、上線後暫時填影片實測。
