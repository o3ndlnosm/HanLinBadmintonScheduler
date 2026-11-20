# 冠軍時刻＋友誼賽代表色（v24）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**狀態：** 2026-11-20 16:30 使用者確認「照建議進實作」（揭曉畫面、設計文件、本計劃，含 Task 8 `&cm=0`）。

**難度與分工：** 一般（多個檔案、動到畫面、要補行為測試）。本 session（Opus 5.5）依 executing-plans 逐項做；做完派全新 Opus 審整條分支；上正式前跑 prod-release-check，合併與推送由使用者執行。
**風險：** 一般（純前端、不動計分與後端），但比賽當天全場都會看到。**回復路徑：** `git revert` 這次合併帶上 main 的 commit 範圍並推送，約 1～2 分鐘後 GitHub Pages 回到 v23（`6092760`），觀眾重新整理一到兩次。

**Goal:** 友誼賽最後一輪開打前，觀賽頁與直播疊加頁播「最終戰開場」並進入最終戰主視覺；15 場打完播「冠軍揭曉」；兩隊在所有畫面改用代表色（主客場）。

**Architecture:** 新增 `js/champion-moment.js`：純函式（階段、勝方、最終輪文字、只播一次的記錄）＋觀賽頁與疊加頁各一個 DOM 入口。全螢幕圖層一律掛在 `document.body`：`#pointBoard`、`#overlay` 每 10 秒重畫時會被清空，圖層放裡面會被切掉。代表色由 `js/team-points.js` 的 `teamStyleById` 統一提供 `{fill, edge, ink}`。不改後端。

**Tech Stack:** Vanilla JS、CSS（container query 單位）、Canvas 2D（紙花）、Jest＋jsdom、Service Worker 快取。

**Spec:** `docs/superpowers/specs/2026-11-20-champion-moment-design.md`。視覺依據：示範頁 artifact「冠軍時刻示範」v13，原檔副本 `~/Downloads/badminton-friendly-1125/champion-moment-demo-v13.html`（不進 repo；CSS 數值、時間軸、紙花參數照它搬）。

## Global Constraints

- 只在 `isFriendlyPair(view)` 為真時啟用代表色與冠軍時刻：恰好兩隊、`teams[0].name === '貿聯'`、`teams[1].name === '翰林'`。
  順序也要對：團體圖朝向是固定的（貿聯朝右放左邊、翰林朝左放右邊），正式資料就是這個順序。第三屆（5 隊）畫面完全不變。
- 代表色：貿聯 `{ fill: '#0077cb', edge: '#0077cb', ink: '#ffffff' }`；翰林 `{ fill: '#ffffff', edge: '#187fc4', ink: '#14649c' }`；其他比賽 `{ fill: TEAM_COLORS[i], edge: 同 fill, ink: '#ffffff' }`。`edge === fill` 時不加任何外框樣式（第三屆的 DOM 與畫面不變）。
- 文字一字不差：開場大字 `冠軍時刻`；主視覺上方 `冠軍時刻`（最終戰）／`🏆 冠軍`（揭曉後）；比分下小字 `總點數`；最終輪 `最終戰　` 接各場 `第四點 混雙B`，以 ` · ` 連接；揭曉 `奪冠！`；結束文字沿用 `比賽結束：${勝方} 以 ${勝}：${負} 勝出`。
- 時間：開場圖層 4000 ms 移除（示範頁時間軸：200 衝入、950 大字、2900 大字淡出、3300 收尾）；揭曉圖層 8000 ms 移除；等圖最多 2000 ms；揭曉後最終比分淡入延遲 0.45 s。圖層一律由 `setTimeout` 移除，不依賴 `animationend`。
- 只播一次：`localStorage` 鍵 `cm:${tournament.name}|${tournament.heldOn}:final`／`:done`（payload 沒有比賽 id，不存通行碼）；讀寫 try/catch，不能用時退回記憶體。
- 輸分頁（`auth.mode === 'captain'`）不播、不掛主視覺，只換代表色。
- 反目標：冠軍時刻出錯不得讓賽程、輸分、應援壞掉（比照應援條包 try/catch）；直播疊加頁不得出現錯誤字。
- 換版 v24：`sw.js` `CACHE_NAME = 'hanlin-badminton-v24'`；`tournament.html`、`overlay.html` 所有本地 `?v=23` → `?v=24`，新增的 css／js 也帶 `?v=24`。
  Task 9 之前，新加進 html 的 css／js 先帶目前的 `?v=23`（`tournament-html-assets.test.js` 會檢查版本號與 `CACHE_NAME` 一致），Task 9 一起換。
- 公開 repo：測試、文件、commit 訊息不得出現真實人名與通行碼（團體圖是 AI 生成）。

## Review Focus

1. 網路慢、團體圖還沒載完：開場與揭曉先等圖（`img.decode()`，最多 2000 ms），逾時照播；圖層照樣準時移除。→ Task 6 測試。
2. 比賽被標成 `finished` 但點數沒分出勝負：不播揭曉、不掛冠軍主視覺、不拋錯。→ Task 3、Task 5 測試。
3. 每 10 秒重畫：主視覺不能每次重建（圖片閃爍）、全螢幕圖層不能被重畫清掉。→ Task 5、Task 7 測試。
4. 已確認比分被改判退回、階段倒退：不重播、不收回已播記錄；畫面照當下資料（退回 none 時拿掉主視覺）。→ Task 5、Task 6 測試。
5. 疊加頁播放中又收到輪詢：比分條照常更新、動畫圖層不被清掉、時間到一定移除。→ Task 7 測試。

---

### Task 1：代表色 `teamStyleById`

**Files:** Modify `js/team-points.js`；Test `tests/team-points.test.js`

**Interfaces:**
- Produces：`isFriendlyPair(view) -> boolean`、`teamStyleById(view) -> { [teamId]: { fill, edge, ink } }`、`BRAND_STYLES`（以隊名為鍵）。`teamColorById(view)` 保留，改成回傳各隊的 `fill`。

- [ ] **Step 1：寫失敗的測試**（新 describe `代表色（2026-11-25 友誼賽）`）
  - `isFriendlyPair`：`[貿聯, 翰林]` → true；順序相反、三隊、隊名多空白（`' 貿聯'`）、`teams` 缺漏 → false。
  - `teamStyleById(friendlyView)` → `{ M: { fill: '#0077cb', edge: '#0077cb', ink: '#ffffff' }, H: { fill: '#ffffff', edge: '#187fc4', ink: '#14649c' } }`。
  - 五隊（第三屆）→ `fill` 依序為 `TEAM_COLORS`、`edge === fill`、`ink === '#ffffff'`。
  - `teamColorById(friendlyView)` → `{ M: '#0077cb', H: '#ffffff' }`；既有六隊測試（只有 id）不改、照樣通過。
  - 對比：測試內寫 WCAG 相對亮度小工具，`contrast('#14649c', '#ffffff') >= 4.5`、`contrast('#ffffff', '#0077cb') >= 4.5`。
- [ ] **Step 2：** `npm test -- tests/team-points.test.js` → FAIL（`isFriendlyPair is not a function`）
- [ ] **Step 3：** 在 `js/team-points.js` 實作並加進 `module.exports`。
- [ ] **Step 4：** 同指令 → PASS
- [ ] **Step 5：** `git add js/team-points.js tests/team-points.test.js && git commit -m "feat: 友誼賽代表色 teamStyleById（貿聯實心藍、翰林白底藍邊）"`

### Task 2：觀賽頁、輸分頁、應援條套用代表色

**Files:** Modify `js/tournament.js`（`makeTeamDot`、四個 `teamColorById` 呼叫點、`mountCheerBar` 的 teams）、`js/cheer.js`（應援條內框、按鈕邊框、泡泡字色與邊框）；Test `tests/tournament-render.test.js`、`tests/cheer-mount.test.js`、`tests/cheer-bubbles.test.js`

**Interfaces:**
- Consumes：`teamStyleById`（Task 1）。
- Produces：`makeTeamDot(style)`：`backgroundColor = style.fill`，`edge !== fill` 時 `boxShadow = inset 0 0 0 2px ${edge}`（點的大小不變）。
  `mountCheerBar` 的 teams 改成 `[{ id, name, color, edge, ink }]`（`color` 仍是 fill；`edge`、`ink` 可省略，預設 `color`、`'#ffffff'`）。
  泡泡 `pop(side, text, color, { ink, edge } = {})`：字色 `ink`（預設白）、`edge !== color` 時 `1px solid edge` 外框。火花 `burst(..., color, n)` 不變（傳 fill；翰林是白色火花）。

- [ ] **Step 1：寫失敗的測試**
  - render：把 `點數比分板的隊伍色點：貿聯紅、翰林青` 改成 `…貿聯藍、翰林白底藍框`：`dots[0]` 底色 `rgb(0, 119, 203)`、`boxShadow === ''`；`dots[1]` 底色 `rgb(255, 255, 255)`、`boxShadow` 含 `rgb(24, 127, 196)`。
  - render：五隊非比點 view（排名表）→ 色點底色依序為 `TEAM_COLORS`、全部 `boxShadow === ''`。
  - cheer-mount：teams 帶 edge／ink 時，`.cheer-fill` 底色是 A 的 fill、`.cheer-bar` 底色是 B 的 fill 且 `boxShadow` 含 B 的 edge；翰林按鈕 `borderColor` 是 `rgb(24, 127, 196)`；只帶 `color` 的既有寫法照舊。
  - cheer-bubbles：`pop('b', '翰林加油！', '#ffffff', { ink: '#14649c', edge: '#187fc4' })` → `style.color === 'rgb(20, 100, 156)'`、`border` 含 `rgb(24, 127, 196)`；沒給第四個參數 → 白字、沒有外框。
- [ ] **Step 2：** `npm test -- tests/tournament-render.test.js tests/cheer-mount.test.js tests/cheer-bubbles.test.js` → 新測試 FAIL
- [ ] **Step 3：** 實作。`tournament.js` 四處改用 `teamStyleById`；應援條的 teams 由 style 組成。
- [ ] **Step 4：** 同指令 → PASS；再跑 `npm test` 全綠。
- [ ] **Step 5：** commit `feat: 觀賽頁、輸分頁、應援條改用代表色（第三屆不變）`

### Task 3：冠軍時刻純函式

**Files:** Create `js/champion-moment.js`（純函式段＋`module.exports`）；Test `tests/champion-moment.test.js`

**Interfaces:**
- Consumes：`computeTeamPoints`、`pointLabel`、`eventLabel`、`isFriendlyPair`（全域，測試用 `Object.assign(global, require('../js/team-points'))`）。
- Produces：
  - `finalPhase(view) -> 'none' | 'final' | 'done'`：只在比點且 `isFriendlyPair`；`done` ＝（`allConfirmed` 或 `status === 'finished'`）**且有勝方**；`final` ＝ 比點場次最大 `roundNo` 之前的場次全部 confirmed、且最大輪次 > 1、且不是 done；其他 none。
  - `championInfo(view) -> null | { winnerId, winnerName, side: 'left' | 'right', won, lost }`。
  - `finalRoundLabel(view) -> string`：最大輪次的比點場次依 `courtNo` 排，`最終戰　` ＋ `${pointLabel} ${eventLabel}` 以 ` · ` 連接。
  - `playedKey(view, phase) -> string`、`createPlayedStore(storage) -> { has(key), mark(key) }`。
  - 常數 `CM_INTRO_MS = 4000`、`CM_REVEAL_MS = 8000`、`CM_IMAGE_WAIT_MS = 2000`、`CM_IMG = { left: 'img/champion/team-left.webp', right: 'img/champion/team-right.webp' }`。

- [ ] **Step 1：寫失敗的測試**（測試內 helper：`confirmUpTo(view, round, winnerOfPoint)` 把第 1～round 輪設成 confirmed，比分 21:15 給該點指定的勝方）
  - `finalPhase`：不是貿聯翰林（五隊、順序相反）→ none；沒有 pointNo → none；第 5 輪還有未確認 → none；第 1～5 輪全確認 → final；第 6 輪確認一場 → final；15 場全確認 → done；`finished` 且有勝方 → done；`finished` 但點數未分勝負 → none；全部都是第 1 輪 → 未全確認 none、全確認 done；第 6 輪先確認、前面有未確認 → none。
  - `championInfo`：貿聯 3:2 → `{ winnerId: 'M', winnerName: '貿聯', side: 'left', won: 3, lost: 2 }`；翰林勝 → `side: 'right'`；沒有勝方 → null。
  - `finalRoundLabel(friendlyView())` → `'最終戰　第四點 混雙B · 第五點 男雙B'`。
  - `playedKey` → `'cm:貿聯×翰林2026羽球聯合友誼賽|2026-11-25:final'`。
  - `createPlayedStore`：先 false、mark 後 true；`getItem`／`setItem` 丟例外時仍正確（退回記憶體）；`storage` 為 undefined 也可用。
- [ ] **Step 2：** `npm test -- tests/champion-moment.test.js` → FAIL（找不到模組）
- [ ] **Step 3：** 實作純函式段（瀏覽器下為全域函式，Node 下匯出；寫法比照 `team-points.js`）。
- [ ] **Step 4：** 同指令 → PASS
- [ ] **Step 5：** commit `feat: 冠軍時刻階段判斷（最終戰／揭曉）與只播一次的記錄`

### Task 4：疊加頁比分條的冠軍時刻標籤與最終輪文字

**Files:** Modify `js/overlay.js`（`overlayLines`、`renderOverlay`、色點）、`css/overlay.css`（`.ov-tag`、色點外框）、`overlay.html`（在 `overlay.js` 前載入 `js/champion-moment.js`）；Test `tests/overlay.test.js`

**Interfaces:**
- Consumes：`finalPhase`、`finalRoundLabel`（Task 3）、`teamStyleById`（Task 1）。
- Produces：`overlayLines(view)` 回傳 `{ left: { name, color, edge, points }, right: {…}, detail, tag }`；`tag`：`'冠軍時刻'`（final）、`'🏆 冠軍'`（done）、`null`（其他、或不是貿聯翰林）。final 時 `detail = finalRoundLabel(view)`；done 沿用既有結束文字。`renderOverlay` 在有 tag 時於比分前加 `<span class="ov-tag">`。

- [ ] **Step 1：寫失敗的測試**：final → tag 與 detail 如上；done → `tag: '🏆 冠軍'`、`detail: '比賽結束：貿聯 以 3：2 勝出'`；none → `tag: null`、detail 照舊；兩隊但不是貿聯翰林 → `tag: null`；`renderOverlay` 有 tag 時出現 `.ov-tag` 文字、沒有時不出現；既有 64–65、119–120 行改成 `{ name, color, edge, points }` 代表色，128–129 行色點改 `rgb(0, 119, 203)`／`rgb(255, 255, 255)`，翰林色點有 edge 外框。
- [ ] **Step 2：** `npm test -- tests/overlay.test.js` → FAIL
- [ ] **Step 3：** 實作；`.ov-tag` 用示範頁 `.gold-tag` 的金色漸層字。
- [ ] **Step 4：** 同指令 → PASS
- [ ] **Step 5：** commit `feat: 疊加頁比分條加冠軍時刻標籤與最終輪場次、代表色`

### Task 5：觀賽頁最終戰／冠軍主視覺（不含動畫）

**Files:** Modify `js/champion-moment.js`（DOM 段）、`js/tournament.js`（`renderAll`）、`tournament.html`（`<head>` 加 `css/champion-moment.css?v=…`、`tournament.js` 前加 `js/champion-moment.js?v=…`）；Create `css/champion-moment.css`；Test `tests/tournament-render.test.js`（`SCRIPTS` 在 `'tournament'` 前加 `'champion-moment'`）

**Interfaces:**
- Produces：`renderChampionHero(section, view, phase, info) -> HTMLElement | null`。在 `#pointsSection` 最前面維持唯一一個 `.cm-hero`（`data-state` 為 `final`／`champion`，champion 時 `data-winner` 為 `left`／`right`），**原地更新文字，不重建**；phase 為 none 時移除。
  內容：`.cm-img.cm-img-left`／`.cm-img-right`、`.cm-aura`、`.cm-badge`、`.cm-pill.cm-left`／`.cm-right`（隊色樣式）、`.cm-nums`、`.cm-label`、`.cm-decider`。
  主視覺出現時 `#pointBoard` 加 `cm-active`：CSS 隱藏 `.point-score` 與 `.champion-banner`（大比分與橫幅的字已在主視覺裡，避免同一句出現兩次；每點明細照常）。
  - `.cm-label`：預設 `總點數`；final 階段若已提前確定勝方，改成 `${勝方} 已拿下 ${點數} 點，確定勝出`（原本橫幅的資訊不消失）。
  - `.cm-decider`：final → `finalRoundLabel`；champion → `比賽結束：…`。
  - 冠軍狀態：勝方圖固定在下半部、亮；敗方在上半部、變暗變灰；光暈只剩勝方隊色（示範頁 v13 的 `final-a`／`final-b` 規則）。
  - 尺寸起點：`aspect-ratio: 4 / 5; max-height: 72vh; container-type: size`；Task 9 在 375px 實看後可調（記 Ruling）。
- `renderAll`：觀賽模式且比點時，在賽程畫完之後、應援之前，`try { syncChampionPage(view, …) } catch {}`（本 task 先只呼叫主視覺；Task 6 換成完整的 `syncChampionPage`）。

- [ ] **Step 1：寫失敗的測試**（describe `冠軍時刻主視覺`，觀賽模式）：
  - 第 1～5 輪全確認 → 有 `#pointsSection > .cm-hero[data-state="final"]`；`.cm-badge` 是 `冠軍時刻`、`.cm-decider` 是 `最終戰　第四點 混雙B · 第五點 男雙B`；`#pointBoard` 有 `cm-active`。
  - 連續 `renderAll` 兩次 → 同一個 `.cm-hero` 元素、只有一個。
  - 翰林 3:2 全確認 → `data-state="champion"`、`data-winner="right"`、`.cm-badge` 是 `🏆 冠軍`、`.cm-decider` 是 `比賽結束：翰林 以 3：2 勝出`。
  - 提前確定（第 3 輪貿聯已 3 點）＋第 1～5 輪全確認 → `.cm-label` 是 `貿聯 已拿下 3 點，確定勝出`。
  - 輸分模式、或第 5 輪還沒打完 → 沒有 `.cm-hero`、`#pointBoard` 沒有 `cm-active`。
  - 從 final 改判退回 none → `.cm-hero` 與 `cm-active` 都拿掉。
  - `finished` 但沒有勝方 → 沒有 `.cm-hero`、`renderAll` 不拋錯。
  - 主視覺出錯（把 `renderChampionHero` 換成丟例外）→ 賽程 15 列、`renderAll` 不拋錯。
- [ ] **Step 2：** `npm test -- tests/tournament-render.test.js` → 新測試 FAIL
- [ ] **Step 3：** 實作 DOM 與 CSS（數值照示範頁 `.hud`、`.team-img`、`.aura`、`.badge`、`.nums`、`.label`、`.decider`，`cq*` 單位換算到主視覺盒子）。
- [ ] **Step 4：** 同指令 → PASS；`npm test` 全綠。
- [ ] **Step 5：** commit `feat: 觀賽頁最終戰與冠軍主視覺`

### Task 6：觀賽頁全螢幕開場與揭曉（每台只播一次）

**Files:** Modify `js/champion-moment.js`、`css/champion-moment.css`、`js/tournament.js`；Test `tests/champion-moment-page.test.js`（jsdom、`jest.useFakeTimers()`）

**Interfaces:**
- Produces：
  - `syncChampionPage(view, { mode, store, doc = document, reduce }) -> void`：非觀賽模式或非貿聯翰林 → 拿掉主視覺後返回；否則 `renderChampionHero`，再依階段：final 且未播、`!doc.hidden` → `store.mark(final)`、`playIntro`；done 且未播、`!doc.hidden` → `store.mark(done)`＋`store.mark(final)`、`playReveal`。分頁在背景時不記也不播（回前景時 `tournament.js` 既有的 `visibilitychange → refresh()` 會再呼叫）。
  - `playIntro({ doc, reduce }) -> HTMLElement`：`.cm-layer.cm-intro` 掛在 `doc.body`，含兩張 `.cm-img`、`.cm-title`（`冠軍時刻`）；先等圖（最多 `CM_IMAGE_WAIT_MS`）再照時間軸加 class；`CM_INTRO_MS` 後移除；點一下立即移除。
  - `playReveal(info, view, { doc, reduce }) -> HTMLElement`：`.cm-layer.cm-reveal`，依序含勝方圖（`cm-side-left`／`right`）、`canvas.cm-confetti`、`.cm-reveal-text`（`.cm-pill` 勝方隊色、`.cm-win` `奪冠！`、`.cm-reveal-score` `${won} : ${lost}`）；紙花在圖前、字後；`CM_REVEAL_MS` 後移除；點一下立即移除。同時只留一個 `.cm-layer`。
  - `reduce`（`prefers-reduced-motion`）→ 圖層加 `cm-reduce`：不震動、不閃光、紙花 40 片（一般 150 片，示範頁參數）。
- `tournament.js`：模組層建一個 `createPlayedStore(window.localStorage)`（取用包 try/catch），`renderAll` 改呼叫 `syncChampionPage`。

- [ ] **Step 1：寫失敗的測試**
  - final 第一次 sync（觀賽、前景）→ `body > .cm-intro`；`store.has(final)`；推進 `CM_IMAGE_WAIT_MS + CM_INTRO_MS` 後圖層移除。
  - 同一個 store 再 sync → 不再出現 `.cm-intro`。
  - `doc.hidden` 為 true → 不播、`store.has(final)` 為 false；改回 false 再 sync → 播。
  - 點圖層 → 立即移除。
  - 第一次看到就是 done → 只出現 `.cm-reveal`，store 記下 done 與 final；之後改判退回 final → 不播開場。
  - 翰林勝的揭曉：`.cm-pill` 是 `翰林`、`.cm-win` 是 `奪冠！`、`.cm-reveal-score` 是 `3 : 2`、圖片 `src` 含 `team-right`、圖層有 `cm-side-right`；canvas 在圖之後、字之前。
  - 輸分模式 → 不播。
  - storage 丟例外 → 仍只播一次。
  - 圖的 `decode()` 永遠不完成 → `CM_IMAGE_WAIT_MS` 後照播，之後準時移除。
  - `reduce: true` → 圖層有 `cm-reduce`。
- [ ] **Step 2：** `npm test -- tests/champion-moment-page.test.js` → FAIL
- [ ] **Step 3：** 實作（時間軸、紙花 canvas 照示範頁 `playFinal`／`playChampion`／`confetti`；canvas 依 `devicePixelRatio` 最多 2 倍）。
- [ ] **Step 4：** 同指令 → PASS；`npm test` 全綠。
- [ ] **Step 5：** commit `feat: 觀賽頁最終戰開場與冠軍揭曉動畫（每台只播一次）`

### Task 7：疊加頁的開場與揭曉（只在親眼看到切換時播）

**Files:** Modify `js/champion-moment.js`、`js/overlay.js`（`initOverlay`）、`css/champion-moment.css`（`.cm-stream` 版：開場左右對峙後退出；揭曉字放勝方圖的另一半、垂直置中、光暈跟著字）、`overlay.html`（加 `css/champion-moment.css`）；Test `tests/overlay.test.js`（fake timers）

**Interfaces:**
- Produces：`createOverlayChampion({ doc = document, store, enabled = true }) -> { update(view) }`。第一次 `update` 只記下階段、不播；之後 `none → final` 播開場、`final → done` 或 `none → done` 播揭曉（各自查 store、播了就 mark）；不看 `doc.hidden`；圖層掛 `doc.body`（不是 `#overlay`）、加 `cm-stream`、時間到由計時器移除。
- `initOverlay` 每次成功 `renderOverlay` 之後 `try { champion.update(view) } catch (e) { console.warn(…) }`。

- [ ] **Step 1：寫失敗的測試**
  - 載入時已是 final → 不播；之後輪詢變 done → 播 `.cm-reveal.cm-stream`。
  - 載入時 none、輪詢變 final → 播開場；`CM_IMAGE_WAIT_MS + CM_INTRO_MS` 後移除。
  - 播放中再輪詢一次 → `.cm-layer` 仍在、`.ov-bar` 照常更新。
  - 同一個 store 重新 `initOverlay`（模擬 PRISM 重載）且已是 done → 不播。
  - `update` 出錯 → 比分條照常、畫面沒有錯誤字。
- [ ] **Step 2：** `npm test -- tests/overlay.test.js` → FAIL
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 同指令 → PASS；`npm test` 全綠。
- [ ] **Step 5：** commit `feat: 疊加頁冠軍時刻（只在輪詢看到階段切換時播）`

### Task 8：疊加頁 `&cm=0` 關閉開關

**Files:** Modify `js/overlay.js`（網址 `cm=0` → `createOverlayChampion({ enabled: false })`）、`docs/tournament/賽前作業.md`；Test `tests/overlay.test.js`

- [ ] **Step 1：** 測試：`?t=x&cm=0` 時 none → final 不播、比分條與 `.ov-tag` 照常；`?t=x` 照播。
- [ ] **Step 2–4：** FAIL → 實作 → PASS
- [ ] **Step 5：** commit `feat: 疊加頁網址加 cm=0 可關閉冠軍時刻動畫`

### Task 9：換版 v24、文件、瀏覽器實看

**Files:** Modify `sw.js`、`tournament.html`、`overlay.html`、`CLAUDE.md`（測試數、v24 說明）、`docs/tournament/賽前作業.md`（當天提醒：第 5 輪比分要盡快雙方輸入，最終戰開場才會準時；疊加頁重新載入不會重播）

- [ ] **Step 1：** 換版；`npm test` → 全綠，記下測試數（`tournament-html-assets.test.js` 會自動檢查新 css／js 的 `?v=24`）。
- [ ] **Step 2：瀏覽器實看**（worktree 起本機靜態伺服器；Chrome 開頁後用 JS 把 `fetchPublicView`／應援 API 換成假資料再 `refresh()`）：
  手機 375×812 的開場、最終戰主視覺、兩種勝方的揭曉與冠軍主視覺；輸分頁（白色主題）的色點、應援條、泡泡；
  16:9 疊加頁的開場、兩種勝方的揭曉、比分條標籤；五隊假資料（第三屆）顏色不變、沒有主視覺。
  截圖存 `~/Downloads/badminton-friendly-1125/v24-*.png`，每張先分區放大看過再交給使用者。
- [ ] **Step 3：** commit `chore: v24 換版與賽前作業提醒`

### 之後（不在本計劃的 task 內）

全新 Opus 審整條分支 → 修 Critical／Important（各自先寫會紅的測試）→ prod-release-check → 使用者 fast-forward 合併並推 main → 上線實跑（觀賽頁、輸分頁、疊加頁、第三屆頁不變）→ 比賽前用測試資料在 PRISM 小工具裡看一次開場（需要使用者的手機）。
