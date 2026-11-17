# 應援泡泡＋比賽結束才公布應援數 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 應援時在該隊那側冒固定口號的對話泡泡；比賽中隱藏應援數，15 場全部確認（或比賽 finished）後才公布；finished 後應援條改唯讀仍顯示。

**Architecture:** 泡泡層跟火花層同一個模式（DOM＋Web Animations、跑完移除、建立失敗不留元素），由同一個 `bursts` 觸發。
公布狀態是 cheer.js 的模組層旗標，`setCheerReveal()` 設定並重畫標題列；`tournament.js` 的 `renderAll` 每次刷新時依 `computeTeamPoints(...).allConfirmed` 與 `tournament.status` 呼叫它。

**Tech Stack:** vanilla JS、Web Animations API、jest（jsdom）。

**Spec:** `docs/superpowers/specs/2026-11-17-cheer-bubbles-design.md`

## Global Constraints

- 口號：通用「加油！」「衝啊！」「好球！」「穩住！」「漂亮！」「拿下這分！」；帶隊名「{隊名}加油！」「{隊名}衝衝衝！」「{隊名}必勝！」。
- 一次增加只冒 1 個；每側同時最多 3 個；約 1.4 秒（1400 ms）；底色隊色、白字；A 左、B 右，水平位置在該側隨機。
- 第一次拿到伺服器總數不冒；減少動態效果、分頁在背景時不冒；出錯靜默略過，不影響應援數與比分。
- 公布前畫面不出現應援數；公布那一行：`應援總數`＋兩隊數字（千分位，同現在 `toLocaleString()`）。
- 公布條件：`allConfirmed || tournament.status === 'finished'`；finished 時唯讀（沒有加油按鈕、不送應援），仍每 3 秒輪詢總數。
- `tournament.html` 的 `?v=` 與 `sw.js` CACHE_NAME 一起升到 18。

## Review Focus

1. 公布前，任何時刻（第一次輪詢、按按鈕、別人湧入後）應援區都不出現數字。
2. 已公布後比分又被改成未全部確認（`allConfirmed` 變回 false）：數字重新藏起來。
3. finished 之後才打開頁面：沒有按鈕、不送應援，但照樣輪詢並顯示應援總數。
4. 泡泡上飄時不被應援區切掉、375px 不出現水平捲動。
5. 自己狂按加上別人一大批同時進來：每側同時存在的泡泡不超過 3 個。

---

### Task 1: 口號與泡泡層（邏輯）

**Files:**
- Modify: `js/cheer.js`
- Create: `tests/cheer-bubbles.test.js`（jsdom）

**Interfaces:**
- Produces:
  - 常數 `CHEER_BUBBLE_MAX_PER_SIDE = 3`、`CHEER_BUBBLE_MS = 1400`。
  - `cheerSlogans(teamName: string) → string[]`：9 個，先通用 6 個、再帶隊名 3 個（順序同 Global Constraints）。
  - `createBubbleLayer(layer: HTMLElement, maxPerSide = CHEER_BUBBLE_MAX_PER_SIDE) → { pop(side: 'a'|'b', text, color) → boolean, live(side) → number }`。
    元素為 `span.cheer-bubble.cheer-bubble-a`（或 `-b`），`textContent = text`、`style.backgroundColor = color`；
    a 用 `style.left`、b 用 `style.right`，值為 2–28% 隨機；動畫 `CHEER_BUBBLE_MS`。
    `layer.animate` 不存在 → 回 false、不留元素；append 或 animate 拋錯 → 移除元素、回 false、不佔數；`onfinish`／`oncancel` 移除並減數（只減一次）。
  - 全部加進 `module.exports`。

- [ ] **Step 1: 寫失敗的測試**（`tests/cheer-bubbles.test.js`）
  - `cheerSlogans('貿聯')` 長度 9，`toEqual(['加油！','衝啊！','好球！','穩住！','漂亮！','拿下這分！','貿聯加油！','貿聯衝衝衝！','貿聯必勝！'])`。
  - `pop('a','加油！','#e10600')` → true；layer 內 1 個 `.cheer-bubble.cheer-bubble-a`，文字 `加油！`、底色 `rgb(225, 6, 0)`、有 `style.left` 沒有 `style.right`。
  - 同側連 pop 4 次 → 前 3 次 true、第 4 次 false，`live('a') === 3`；這時 `pop('b', …)` 仍 true。
  - 呼叫第一個動畫的 `onfinish` → 元素移除、`live('a') === 2`；再呼叫一次 `onfinish` 仍是 2。`oncancel` 同樣會移除。
  - layer 沒有 `animate` → false、0 個元素。
  - `animate` 拋錯 → false、0 個元素、`live('a') === 0`。
- [ ] **Step 2: 跑測試確認失敗**：`npx jest tests/cheer-bubbles.test.js`，預期 `cheerSlogans`／`createBubbleLayer` is not a function。
- [ ] **Step 3: 實作**上述常數與兩個函式（照 `createSparkLayer` 的寫法：`live` 分 a、b 兩個計數）。
- [ ] **Step 4: 跑測試確認通過**，再 `npm test` 全綠。
- [ ] **Step 5: Commit** `feat(cheer): 應援口號與泡泡層`

### Task 2: 接上應援條：隊名列、泡泡、公布、唯讀

**Files:**
- Modify: `js/cheer.js`（`mountCheerBar`、新增 `setCheerReveal`）、`js/tournament.js`（`renderAll`）、`css/tournament.css`、`tournament.html`、`sw.js`、專案 `CLAUDE.md`
- Test: `tests/cheer-mount.test.js`、`tests/tournament-render.test.js`

**Interfaces:**
- Consumes: Task 1 的 `cheerSlogans`、`createBubbleLayer`；既有 `computeTeamPoints(teams, matches).allConfirmed`（`js/team-points.js`）。
- Produces:
  - `mountCheerBar(container, teams, token, { readOnly = false } = {})`：readOnly 時不建 `.cheer-buttons`、不設 flush 計時器、分頁切背景也不 flush；輪詢照舊。
  - `setCheerReveal(revealed: boolean) → void`：存模組層旗標；已掛載就用最後一次的總數重畫標題列。掛載前呼叫也有效（掛載時讀旗標）。
  - 結構：`.cheer-head`（相對定位）內含 `.cheer-counts`（`countA`、`.cheer-total-label`、`countB` 三個 span）與 `.cheer-bubbles` 疊層（不攔點擊）。
    未公布：`countA = ta.name`、`countB = tb.name`、label `hidden`；公布：`countA = '貿聯 1,234'` 格式、label 文字 `應援總數` 顯示、`countB = '987 翰林'` 格式。
  - `render(totals, bursts)` 在火花之後，對每隊 bursts > 0 用 `cheerSlogans(隊名)` 隨機挑一句 `pop`（A 用 `'a'`、B 用 `'b'`）；守門與 try/catch 同火花。

- [ ] **Step 1: 改既有測試、寫失敗的新測試**（`tests/cheer-mount.test.js`）
  - 既有測試的 `animate` stub 改成記 `{ el: this, kf }`；方向測試只看 `el.classList.contains('cheer-spark')` 的那些（泡泡也會呼叫 animate）。
  - 既有「火花出錯：數字照常更新」改成先 `setCheerReveal(true)` 再按，仍預期含 `101`。
  - 新增：
    - 比賽中：輪詢 `{M:100,H:100}` 並按一下貿聯後，`.cheer-counts` 文字含「貿聯」「翰林」、`/\d/` 不成立。
    - 自己按一下 → `.cheer-bubbles .cheer-bubble-a` 1 個，文字在 `cheerSlogans('貿聯')` 裡；沒有 `-b`。
    - 打開頁面第一次拿到總數 → 0 個泡泡；之後輪詢 `{M:120,H:100}` → `-a` 恰 1 個。
    - 狂按貿聯 5 下（同一 2 秒窗口內）→ `-a` 3 個。
    - 減少動態效果、分頁在背景兩個既有測試，另外斷言 `.cheer-bubble` 0 個。
    - `setCheerReveal(true)` → label 文字 `應援總數` 且未 hidden、counts 含 `貿聯 100`；再 `setCheerReveal(false)` → 又沒有數字。
    - 先 `setCheerReveal(true)` 再掛載 → 第一次輪詢後就顯示數字。
    - `{ readOnly: true }`：沒有 `.cheer-btn`；`advanceTimersByTime(2000)` 後 `sendCheer` 沒被呼叫；公布時仍顯示數字。
  - `tests/tournament-render.test.js` 新增（用 `jest.fn` 換掉全域 `mountCheerBar`、`setCheerReveal`）：
    - 15 場都 pending → `setCheerReveal(false)`、`mountCheerBar` 第 4 參數 `{ readOnly: false }`。
    - 15 場都 confirmed（各帶合法比分）→ `setCheerReveal(true)`。
    - `status: 'finished'` → `mountCheerBar` 有被呼叫且 `{ readOnly: true }`、`setCheerReveal(true)`。
    - `setCheerReveal` 拋錯 → 賽程仍畫出 15 列、`renderAll` 不拋錯。
- [ ] **Step 2: 跑測試確認失敗**：`npx jest tests/cheer-mount.test.js tests/tournament-render.test.js`。
- [ ] **Step 3: 實作** `mountCheerBar`／`setCheerReveal`／render 泡泡；`renderAll` 改成：比點模式就掛（不再排除 finished），在同一個 try 裡先 `setCheerReveal(...)` 再 `mountCheerBar(..., { readOnly: status === 'finished' })`，更新旁邊註解。
- [ ] **Step 4: CSS**：`.cheer-head{position:relative}`、`.cheer-bubbles` 絕對定位鋪滿不攔點擊、`.cheer-bubble`（絕對定位、白字、粗體、小圓角，A 左下角、B 右下角是尖角、不換行）、`.cheer-total-label`；確認泡泡上飄在 `.cheer-section` 的上內距裡、不被切。
- [ ] **Step 5:** `?v=17` → `?v=18`、CACHE_NAME → `hanlin-badminton-v18`；專案 CLAUDE.md 第 7 節補泡泡與公布、測試數更新；`npm test` 全綠。
- [ ] **Step 6:** 本機瀏覽器實測（假資料，不碰正式比賽）：Review Focus 1–5，375px 寬、交界 0%／100%。
- [ ] **Step 7: Commit** `feat(cheer): 應援泡泡、比賽結束才公布應援數、finished 後唯讀`
