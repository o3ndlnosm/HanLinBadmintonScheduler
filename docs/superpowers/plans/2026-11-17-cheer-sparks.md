# 應援條交界火花 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 應援條兩色交界加一顆閃爍光點，任一隊顯示總數增加時從交界朝對方噴火花。

**Architecture:** 控制器在 `onChange` 多傳第二個參數 `bursts`（各隊這次增加多少）；畫面層用火花層把 bursts 畫成粒子。
增加量由「這次顯示總數 − 上次顯示總數」算出，所以自己按、別人的批次都走同一條路，自己按的量送出回來時不會重複噴。

**Tech Stack:** vanilla JS、Web Animations API、jest（node 與 jsdom）。

**Spec:** `docs/superpowers/specs/2026-11-17-cheer-sparks-design.md`

## Global Constraints

- 顆數 = min(5 + 增加量, 18)；同時存在上限 60；顏色：隊色、`#ffd23f`、`#fff` 輪替。
- 第一次成功拿到伺服器總數不噴；沒算進的點擊不噴；減少動態效果與分頁背景時不噴。
- 火花任何錯誤不得影響應援數與比分（靜默略過）。
- `tournament.html` 的 `?v=` 與 `sw.js` 的 CACHE_NAME 一起升到 17（既有測試會擋）。

## Review Focus

1. 打開頁面第一次輪詢（0 → 幾千）不噴。
2. 自己按一下噴一次；送出回來、伺服器總數含自己那下時不再噴。
3. 比例 0% 或 100% 時，375px 寬沒有水平捲動。
4. 減少動態效果時沒有火花、光點不閃。
5. 分頁在背景時不累積火花元素。

---

### Task 1: 增加量與火花層（邏輯）

**Files:**
- Modify: `js/cheer.js`
- Test: `tests/cheer.test.js`、Create: `tests/cheer-sparks.test.js`（jsdom）

**Interfaces:**
- Produces:
  - `sparkCount(n: number) → number`：n ≤ 0 → 0，否則 min(5 + n, 18)。
  - `createCheerController(...)` 的 `onChange(totals, bursts)`：`bursts` 是 `{ [teamId]: 增加量 }`，只列增加量 > 0 的隊；第一次成功接受伺服器總數那次為 `{}`。
  - `createSparkLayer(layer: HTMLElement, maxLive = 60) → { burst(x, y, dir, color, n) → 實際噴出顆數, live() → 目前存在顆數 }`。
    `dir` 為 +1（往右）或 −1（往左）；元素沒有 `animate` 時不噴、回傳 0；動畫結束移除元素。

- [ ] **Step 1: 寫失敗的測試**
  - `sparkCount`：0→0、1→6、12→17、13→18、1000→18。
  - 控制器：
    - 自己按一下 → 最後一次 bursts 為 `{ M: 1 }`。
    - 第一次 poll 回 5000 → bursts `{}`；第二次 poll 回 5003 → `{ M: 3 }`。
    - 按 1 下後 flush，回應的伺服器總數 = 先前 + 1 + 別人 3 → 這次 bursts `{ M: 3 }`。
    - 第 11 下（超過上限）→ 沒有新的 onChange 帶 bursts。
    - 較舊的輪詢回來（較小）→ bursts `{}`。
  - 火花層（jsdom，stub `animate`）：
    - burst n=1 → 6 個元素、回傳 6。
    - 連續 burst 到超過 60 → `live()` 不超過 60。
    - 動畫結束（呼叫 `onfinish`）→ 元素移除、`live()` 歸零。
    - 沒有 `animate` → 回傳 0、不留元素。
- [ ] **Step 2: 跑測試確認失敗**：`npx jest tests/cheer.test.js tests/cheer-sparks.test.js`，預期 sparkCount／createSparkLayer 未定義、bursts 為 undefined。
- [ ] **Step 3: 實作** `sparkCount`、控制器的 `last`／`primed` 與 bursts 計算、`createSparkLayer`。
- [ ] **Step 4: 跑測試確認通過**，再跑 `npm test` 全綠。
- [ ] **Step 5: Commit** `feat(cheer): 應援增加量與火花層`

### Task 2: 接上應援條、樣式、版號

**Files:**
- Modify: `js/cheer.js`（mountCheerBar）、`css/tournament.css`、`tournament.html`、`sw.js`

**Interfaces:**
- Consumes: Task 1 的 `onChange(totals, bursts)`、`createSparkLayer`。

- [ ] **Step 1:** mountCheerBar 把 `.cheer-bar` 包進 `.cheer-track`（position: relative），上面疊 `.cheer-fx`（不攔點擊）與 `.cheer-spark-core`。
  render 收到 bursts 時，A 隊往右、B 隊往左，從光點目前位置噴；減少動態效果或分頁背景時跳過；整段包 try/catch。
- [ ] **Step 2:** CSS：光點閃爍動畫、`.cheer-spark`、`.cheer-section { overflow: hidden }`；減少動態效果時光點不閃、不過渡。
- [ ] **Step 3:** `?v=16` → `?v=17`、CACHE_NAME → `hanlin-badminton-v17`；`npm test` 全綠。
- [ ] **Step 4:** 本機瀏覽器實測（Review Focus 1–5，假資料，不碰正式比賽）。
- [ ] **Step 5: Commit** `feat(cheer): 應援條交界火花`
