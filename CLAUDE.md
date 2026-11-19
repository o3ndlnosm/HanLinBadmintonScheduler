# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

翰林羽球排場系統 - 一個用於管理多個羽球場地選手輪替配對的場地排程系統。使用原生 JavaScript、HTML 和 CSS 建立的單頁應用程式，完全在瀏覽器中運行，無需後端伺服器。

## 系統架構

- **純前端應用程式**：無後端伺服器、資料庫或建置流程
- **單一 HTML 頁面**：`index.html` 載入所有功能
- **主要 JavaScript 檔案**：`js/script.js` (2841 行) 包含所有遊戲邏輯
- **樣式設計**：`css/style.css` 使用現代 CSS 變數和響應式設計
- **外部相依套件** (透過 CDN)：
  - Font Awesome 圖示
  - Google Sheets API 用於載入選手資料
  - Google OAuth2 用於身份驗證

## 開發指令

```bash
# 使用 VS Code Live Server 擴充功能啟動開發伺服器
# 連接埠設定為 5501 (在 .vscode/settings.json 中)

# 或使用任何靜態檔案伺服器：
python -m http.server 8000
# 或
npx http-server
```

## 核心功能與實作

### 1. 選手管理系統
- 新增選手與技能等級 (1-10)
- 追蹤比賽場次和等待輪次
- 手動模式切換進行比賽安排

### 2. 場地排程演算法

**核心規則：**
- 兩隊技能等級差異必須 ≤ ±1.5
- 複雜輪替以避免固定模式
- 基於等待輪次和比賽場次的優先權系統

**選手選擇邏輯 (js/script.js)：**
- `selectPlayersForMatch` (858 行)：主要選擇邏輯
- `selectPlayersScenarioOne` (881 行)：處理 1-4 位準備選手
- `selectPlayersScenarioTwo` (951 行)：處理 5-8+ 位準備選手
- `findOptimalCombination` (682 行)：實作 ±1.5 技能配對
- `findOptimalCombinationRelaxed` (778 行)：嚴格規則失敗時的寬鬆配對

### 3. 語音播報系統 (48-288 行)
- 基於佇列的順序播報
- 行動裝置保持活躍機制
- 可設定語音選擇

### 4. Google Sheets 整合
- **API 金鑰**：硬編碼於 2175 行
- **試算表 ID**：硬編碼於 2178 行
- 依出席狀態篩選選手
- 直接匯入，無模態對話框

### 5. 手動比賽模式
- 在自動和手動場地分配之間切換
- `generateMatchForCourtImmediate` (1322 行)：特定場地生成
- 驗證防止選手同時在多個場地

### 6. 場地數量與選手替換
- 場地數量可手動調整 1-6 面（場地區上方 − / ＋ 控制）
- 手動模式下可「替換」單一場上選手或「替換組合」隨機換 2 人
- 被換下者回預備區且等待輪次 +1（不計場次），補位從預備區完全隨機抽出
- 邏輯位於 `js/court-actions.js`，測試位於 `tests/court-actions.test.js`

### 7. 比賽計分頁（tournament.html）
- 8/20 第三屆比賽用：隊長輸分（雙方一致才確認）、即時排名、公開計分板
- **計分規則依比賽設定**（2026-11-16 起，`tournaments.score_rule`）：
  - `to15_cap21`（預設，第三屆）：15 分制、一定打完；14 平後淨勝 2，20 平後先得 21 分者勝。
    合法完賽比分只有 15:0–13、16–20 帶淨勝 2 分、21:19、21:20
  - `to21_cap30`（11/25 友誼賽）：21 分一局；20 平後淨勝 2，29 平時先得 30 分者勝。
    合法完賽比分只有 21:0–19、22–29 帶淨勝 2 分、30:28、30:29
  - 前端 `SCORE_RULES`（tournament-form.js）與後端 `tournament_score_legal`
    （`docs/tournament/friendly-schema-2026-11-25.sql`）各驗一次，改規則兩邊要同步改；
    不認得或缺值的規則一律視為 `to15_cap21`（舊後端、舊比賽行為不變）
- **比點模式**（11/25 貿聯×翰林友誼賽）：任一場有 `pointNo` 就顯示點數計分板（`js/team-points.js`），
  取代排名表；每點過半勝場拿下、整體過半點數勝出，過半數由資料推導不寫死。
  賽程標籤顯示「第一點 男雙A」（`point_no` + `event_tag`）
- **公司應援條**（`js/cheer.js`，只在比點模式）：純炒氣氛、不影響比分。本機累積、每 2 秒送一次、
  每隊每 2 秒窗口最多算 10 下、總數每 3 秒輪詢；失敗一律靜默、與計分完全分開。
  後端只檢查單次 1–10，anon key 公開可被灌數——已知且接受（觀賽 token 全場共用，無法依 token 限流）
- **交界火花**（2026-11-17，設計 `docs/superpowers/specs/2026-11-17-cheer-sparks-design.md`）：兩色交界一顆閃爍光點；
  任一隊顯示總數增加時從交界朝對方噴火花（控制器 `onChange(totals, bursts)`，bursts = 顯示總數差，自己按與別人的批次同一套）。
  第一次拿到伺服器總數不噴；輪詢不併入有點擊送出中的隊（否則送出中的量會被算兩次）；同時存在最多 60 顆；
  減少動態效果與分頁背景時不噴；`.cheer-section` 的 `overflow: hidden` 是防 375px 水平捲動用的，不要拿掉
- **應援泡泡＋比賽結束才公布應援數**（2026-11-17，設計 `docs/superpowers/specs/2026-11-17-cheer-bubbles-design.md`）：
  跟火花同一個 bursts 觸發，該隊那側冒固定口號泡泡（`cheerSlogans`，不放嗆對方的話），一次增加只冒 1 個、每側同時最多 3 個。
  比賽中標題列只顯示隊名；`renderAll` 依 `allConfirmed || status === 'finished'` 呼叫 `setCheerReveal()` 才公布應援總數。
  finished 後應援條仍掛但唯讀（`mountCheerBar(..., { readOnly: true })`，沒有按鈕），收尾後才打開的人也看得到總數；
  頁面開著時才變 finished，由 `renderAll` 每次呼叫的 `setCheerReadOnly(true)` 切成唯讀（拿掉按鈕、停掉定時送出）
- **YouTube 直播框**（`js/live.js`，2026-11-18，設計 `docs/superpowers/specs/2026-11-18-live-stream-design.md`）：
  網址存在 `tournaments.live_url`，由 `tournament_public_payload` 以 `tournament.liveUrl` 送出（SQL `docs/tournament/live-url-2026-11-25.sql`）。
  只在觀賽模式（`?t=`）掛在點數比分板上方；`youtubeIdFrom` 只認 YouTube 網址、自己組 embed 網址；同一支影片不重掛（記在 `section.dataset.liveId`）。
  整頁是 `no-referrer`，iframe 另設 `referrerPolicy = 'strict-origin-when-cross-origin'` 只送網域——**拿掉會變成 YouTube 錯誤 153**（2026-11-18 對照組實測）
- **直播畫面疊加比分**（`overlay.html`＋`js/overlay.js`＋`css/overlay.css`，2026-11-18，設計 `docs/superpowers/specs/2026-11-18-live-overlay-design.md`）：
  給 PRISM 網頁小工具疊在直播畫面左下角，整頁透明；只認 `?t=`（輸分連結只顯示「請改用觀賽連結」）。
  `overlayLines(view)` 算兩行內容（總點數＋最新確認的一場，比分照左右順序、不照 A/B 隊），每 10 秒重讀；成功顯示過之後，讀取失敗或找不到比賽都保留上一次畫面，直播畫面上不出現錯誤字。
  尺寸用 `vmin`（直立直播時不會撐得比畫面寬）。隊伍顏色 `TEAM_COLORS`／`teamColorById` 在 `team-points.js`，計分頁與疊加頁共用
- **輸分頁白色版**（`js/page-theme.js`，2026-11-19，設計 `docs/superpowers/specs/2026-11-19-captain-light-theme-design.md`）：
  輸分連結（`?c=`）是白色、觀賽連結（`?t=`）維持黑色，避免兩種頁面搞混；所有比賽都套用。
  `<head>` 先載 `tournament-form.js` 再載 `page-theme.js`，在 body 畫出來前替 `<html>` 加 `theme-light`（判斷只沿用 `parseTokenFromUrl`）。
  白色版只在 `css/tournament.css` 檔尾新增（`:root.theme-light` 變數＋`.theme-light …` 覆寫寫死深色處），**上面的黑色原規則不要改**；
  在 `:root` 加新的顏色變數時，白色版也要給一個值（`tests/tournament-theme-css.test.js` 會擋）
- 負載實測用 `scripts/cheer-load-test.mjs`（每支模擬手機一條 HTTP/2 連線）。**不要改回 fetch**：
  Node fetch 會把模擬手機的請求擠進少數連線排隊，量到的是測試工具的瓶頸（2026-11-17 實測 p95 15 s vs 實際 164 ms）
- 後端借用 v2 badminton-scheduler 的 Supabase RPC，設定在 `js/tournament-api.js`
- 純函式：`js/standings.js`（排名）、`js/tournament-form.js`（驗證/狀態）、`js/team-points.js`（比點）、
  `js/cheer.js`（應援累積／裁切／比例／火花增加量／口號）、`js/live.js`（YouTube 網址取 ID），各有 jest 測試
- 第三屆賽前作業與 seed 見 `docs/tournament/賽前作業.md`；友誼賽 SQL 為 `docs/tournament/friendly-*.sql`
  （schema → rpc-selftest 驗證 → seed 建賽 → lineup 掛人名；測試比賽用 seed 換賽名建、test-cleanup 刪）
- 建賽時同一交易內 `now()` 相同，隊伍 `created_at` 要明確錯開，否則 payload 的隊伍順序（左右與配色）不保證

### 8. 主頁賽事倒數（js/countdown.js）
- 目前倒數 **2026-11-25 貿聯×翰林友誼賽**（2026-11-19 起；上一場是 8/20 第三屆），開打後顯示「比賽進行中」，21:00 後自動隱藏
  （第 6 輪預定 19:45 結束，比照第三屆留延誤緩衝）
- **`EVENT.url` 是選填**（2026-11-19，設計 `docs/superpowers/specs/2026-11-19-countdown-friendly-design.md`）：
  - 有 → 彈窗有「前往賽程／進入即時計分板」（新分頁開），提示字「查看賽程 ›／進入即時計分板 ›」（第三屆用法）。
  - 沒有（或空字串）→ 彈窗只有「關閉」並多一行「觀賽連結請看社團群組」，提示字「比賽資訊 ›／觀賽連結請看社團群組」。
  - 友誼賽**刻意不放**：repo 公開，觀賽頁有貿聯同仁名字，連結寫進程式等於公開名單（`tests/countdown.test.js` 釘住 `EVENT.url` 為空）。
    對外比賽照這樣做；社內比賽要放連結時再加回 `url`。
- **橫幅是 `<button>` 不是連結**：點擊只開賽事彈窗（`eventDialogText` 組內文 + `openDialog`），
  要進計分頁得走彈窗裡的「前往賽程」，以新分頁開啟。為什麼：排場資料只在記憶體，
  上課途中誰誤觸把頁面導走就全沒了。不要改回 `<a href>`——那還有中鍵、長按選單等
  繞過 click handler 的導航路徑（2026-08-07 改動，見
  `docs/superpowers/specs/2026-08-07-countdown-popup-design.md`）
- 賽事時間寫死為 `EVENT` 常數（帶 `+08:00` 時區），主頁不連 Supabase
- 日期與星期由 `formatEventDate()` 從 `startAt` 推導，不寫死——寫死過一次就錯過一次
  （曾把 8/20 標成星期三，實際是星期四）
- 時間換算固定用台北時間：epoch 加 8 小時後用 `getUTC*` 讀取，不可用 `getMonth()` /
  `getDay()` 等本地時區方法，否則使用者在別的時區會看到錯的日期
- 純函式 `countdownState` / `formatCountdown` / `formatEventDate` / `eventDialogText` /
  `eventDialogButtons` / `bannerCtaText` 有 jest 測試，渲染層靠瀏覽器驗證
- 背景是 `img/event-banner.jpg`（賽事插畫），上面壓一層半透明品牌色漸層當遮罩。
  遮罩不可拿掉：插畫高飽和高對比，白字直接疊上去會讀不清楚。`is-during` 只換遮罩
  顏色、保留插畫，所以用 `background-image` 而非 `background` 簡寫（後者會清掉 url）
- 下屆比賽只需改 `js/countdown.js` 的 `EVENT` 常數即可重啟；換插畫則替換
  `img/event-banner.jpg` 並 bump `sw.js` 的 `CACHE_NAME`

### 9. 賽程出賽選手（js/tournament.js `makeSide` / `renderSchedule`）
- 賽程每列為上下兩排：上排賽點與比分狀態，下排兩隊左右對稱、選手在自己隊名正下方
- 選手名用**暱稱**（試算表「總賽程表(含出賽選手)」），隊伍名冊 `players` 存本名但不上畫面
- 資料在 `tournament_matches.players_a` / `players_b`（jsonb），由
  `docs/tournament/lineup-2026-08-20.sql` 灌入，**該檔可安全重跑**——試算表改了重跑即同步
- 名單為空（`[]`）時該側只顯示隊名，版面退回加這功能之前的樣子。
  不要拿掉這條退路：SQL 沒跑或跑失敗時，當天頁面才不會空白
- 上排的比分與狀態靠 `.match-result` 的 flex 並排，**不要改子元素的 `display`**——
  `.state-label.action-needed` 是 inline-block 紅底標籤，改 display 會把它壓扁
- 純函式 `formatLineup`（`js/tournament-form.js`）有 jest 測試，渲染層靠瀏覽器驗證

### 10. Service Worker 只由 index.html 註冊
`tournament.html` 自己不註冊 SW，但 `sw.js` 的 scope 是整個 origin、fetch 攔截所有同源 GET。
所以：

- 掃 QR code **直接**進計分頁的人（多數選手）沒有 SW，永遠拿到最新版
- 開過排場主頁的人（主辦、自己）計分頁檔案會被 stale-while-revalidate 快取，
  改版後不 bump `CACHE_NAME` 就要重整兩次才生效

計分頁的檔案**不在** `PRECACHE_URLS` 裡，是靠 fetch 攔截順帶快取的。

**計分頁的本地 CSS／JS 網址帶 `?v=<版本>`，必須與 `CACHE_NAME` 的版本號一起 bump**（2026-11-17 起，
`tests/tournament-html-assets.test.js` 會擋）。為什麼：網址固定時，開過舊版計分頁的手機第一次打開新比賽
會拿到「新 HTML（新 token 網址不在快取）＋舊 JS（固定網址在快取）」，舊前端會用舊規則擋分數。
網址帶版本號後舊快取一定找不到，第一次載入就是新版。

**bump `CACHE_NAME` 之後仍然要重整兩次**（2026-08-10 線上實測）：第一次載入時舊 SW
還控制著頁面、供應的是舊檔，瀏覽器同時才在背景發現 `sw.js` 變了 → 新 SW install →
`skipWaiting` → `activate` 並刪掉舊 cache；**第二次**載入才由新 SW 控制、cache 已空、
從網路拿到新檔。
bump 的作用是保證舊快取被清乾淨（不必依賴 revalidate 成功），**不是**省掉第二次重整。
當天若要 hotfix，請預期重整兩次，而且務必自己先驗過畫面再宣布已修好。

## 重要實作細節

### 狀態管理 (1-22 行)
```javascript
players = []           // 所有註冊選手
readyPlayers = []      // 等待比賽的選手
restingPlayers = []    // 休息中的選手
courts = {}            // 各場地目前的比賽
historyMatches = []    // 比賽歷史
```

### 輪替追蹤變數
- `rotationOffsets`：防止固定模式
- `waitingRounds`：追蹤選手等待時間
- `dynamicQuotaIndex`：8 人情境變化

### 交叉選擇邏輯 (1354-1517 行)
當選手池較小時，用於打破固定輪替模式的特殊演算法。

### 動態配額系統 (1284-1341 行)
當恰好有 8 名準備選手時，交替使用不同的選手選擇比例。

## 開發指引

1. **無建置流程**：直接編輯檔案，無需編譯
2. **瀏覽器儲存**：頁面重新整理時所有資料會遺失（刻意設計）
3. **中文介面**：所有使用者介面文字均為繁體中文
4. **行動裝置優化**：在 iOS/Android 裝置上測試語音功能
5. **除錯**：整個程式碼都有廣泛的 console.log 陳述式

## 常見任務

- **修改 Google Sheets 整合**：更新 API 金鑰 (2175 行) 和試算表 ID (2178 行)
- **除錯選手輪替**：檢查控制台日誌中的詳細輪替資訊
- **測試語音播報**：使用介面中的「測試語音」按鈕
- **新增功能**：直接編輯 `js/script.js`
- **更新樣式**：使用現有 CSS 變數修改 `css/style.css`

## 測試方法

已安裝 jest（含 jest-environment-jsdom）。測試方法：
1. `npm test` 執行全部 jest 測試（純函式邏輯 + DOM 互動，現為 426 項跨 25 套件）
2. 純函式模組（`countdown.js` / `court-actions.js` / `dialog.js` / `player-state.js` / `pairing-logic.js` /
   `standings.js` / `tournament-form.js`）與 API 薄封裝（`tournament-api.js`）各有對應
   `tests/*.test.js`
3. `script.js` 本體（無模組匯出）與實際渲染仍靠瀏覽器控制台與手動測試
4. 在行動裝置上測試語音功能與比賽計分頁
5. `npm test` 會以 `TZ=America/Los_Angeles` 執行（設定在 package.json）。這是刻意的：
   若在 Asia/Taipei 執行，`formatEventDate` 誤用本地時區方法的錯誤實作也會通過測試，
   時區獨立性測試就失去鑑別力。

## 專案結構
```
/HanLinBadmintonScheduler/
├── .vscode/
│   └── settings.json        # Live Server 設定 (連接埠 5501)
├── css/
│   ├── style.css           # 使用 CSS 變數的樣式
│   ├── tournament.css      # 比賽計分頁專屬樣式
│   └── overlay.css         # 直播畫面疊加比分（透明背景、vmin 尺寸）
├── js/
│   ├── court-actions.js    # 場地數量調整與選手替換邏輯（純函式，jest 測試）
│   ├── countdown.js        # 主頁賽事倒數（純函式 + 渲染，jest 測試）
│   ├── dialog.js           # 自訂彈窗與 toast 通知（取代原生 alert/confirm，jest+jsdom 測試）
│                           #   openDialog 支援自訂 iconClass 與 href 型按鈕（渲染成新分頁連結）
│   ├── player-state.js     # 選手狀態轉換邏輯（純函式，jest 測試）
│   ├── pairing-logic.js    # 配對邏輯（純函式，jest 測試）
│   ├── script.js           # 主要應用程式邏輯 (2841 行)
│   ├── standings.js        # 比賽排名計算（純函式，jest 測試）
│   ├── tournament-form.js  # 比賽計分頁表單驗證/狀態機、formatLineup（純函式，jest 測試）
│   ├── team-points.js      # 比點計算、點次標籤、隊伍顏色（純函式，jest 測試）
│   ├── cheer.js            # 公司應援條：累積／裁切／控制器／火花層／泡泡層（jest）＋ 掛載（jsdom＋瀏覽器）
│   ├── live.js             # 觀賽頁 YouTube 直播框：網址取 ID（jest）＋ 掛載（jsdom＋瀏覽器）
│   ├── overlay.js          # 直播畫面疊加比分：兩行內容（jest）＋ 只認觀賽連結、每 10 秒重讀
│   ├── page-theme.js       # 計分頁顏色：輸分連結白色、觀賽連結黑色（在 <head> 執行，jsdom 測試）
│   ├── tournament-api.js   # 比賽計分頁 Supabase RPC 薄封裝（jest 測試）
│   └── tournament.js       # 比賽計分頁初始化、輪詢、渲染
├── tests/
│   ├── countdown.test.js           # 賽事倒數計算、格式化與日期推導測試
│   ├── court-actions.test.js       # 場地數量與選手替換測試
│   ├── dialog.test.js              # 彈窗與通知測試
│   ├── player-state.test.js        # 選手狀態測試
│   ├── pairing-logic.test.js       # 配對邏輯測試
│   ├── standings.test.js           # 比賽排名測試
│   ├── tournament-form.test.js     # 比賽計分頁表單驗證測試
│   ├── team-points.test.js         # 比點計算測試（友誼賽 15 場賽程）
│   ├── cheer.test.js               # 應援累積、裁切、控制器、火花增加量測試
│   ├── cheer-sparks.test.js        # 火花層（jsdom）：顆數、上限、移除
│   ├── cheer-bubbles.test.js       # 泡泡層（jsdom）：口號、每側上限、移除、建立失敗
│   ├── cheer-mount.test.js         # 應援條掛載（jsdom）：光點、首次不噴、方向、減少動態、背景分頁、泡泡、公布、唯讀
│   ├── live.test.js                # 直播框（jsdom）：網址取 ID、只掛一次、換影片、清空
│   ├── overlay.test.js             # 疊加比分（jsdom）：四種狀態、最新一場、左右順序、只認 ?t=、失敗保留
│   ├── tournament-render.test.js   # 計分頁渲染（jsdom）：應援／直播框出錯不影響賽程、直播框只在觀賽頁
│   ├── tournament-html-assets.test.js # 計分頁、疊加頁資源 ?v= 與 sw.js CACHE_NAME 一致；page-theme.js 在 <head>
│   ├── page-theme.test.js          # 頁面顏色（jsdom）：哪種連結用白色、<html> class、theme-color
│   ├── tournament-theme-css.test.js # 白色版配色：黑色原值不變、每個顏色變數都有白色版、寫死深色處有覆寫
│   └── tournament-api.test.js      # 比賽計分頁 API 薄封裝測試
├── img/
│   └── event-banner.jpg     # 主頁倒數區背景插畫（1400w JPEG，213K）
├── docs/tournament/         # 比賽計分頁：賽前作業清單、Supabase seed/bootstrap SQL
│                            #   lineup-schema-*.sql：出賽選手欄位與 RPC（跑一次）
│                            #   lineup-*.sql：隊名／名冊／30 場出賽選手（可重跑）
│                            #   friendly-*.sql：11/25 友誼賽 schema、自我測試、建賽、出賽選手、測試清理
├── scripts/generate-qr.sh   # 產生各隊隊長 QR code（第三屆五隊格式）
├── scripts/cheer-load-test.mjs # 應援負載實測（每支模擬手機一條 HTTP/2 連線）
├── index.html              # 單頁應用程式
├── tournament.html         # 比賽計分頁（觀賽 + 隊長輸分）
├── overlay.html            # 直播畫面疊加比分（給 PRISM 網頁小工具，只認觀賽連結）
└── CLAUDE.md               # 此檔案
```

## 排場規則摘要

系統根據準備區人數實作兩種主要情況：

**情況一 (1-4 人)**：優先使用剛下場的選手
**情況二 (5-8+ 人)**：優先從準備區選擇，考慮等待輪次和場次

詳細規則見上方「核心功能與實作」與「場地排程演算法」各節。