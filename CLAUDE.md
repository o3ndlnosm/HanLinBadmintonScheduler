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
- 後端借用 v2 badminton-scheduler 的 Supabase RPC，設定在 `js/tournament-api.js`
- 純函式：`js/standings.js`（排名）、`js/tournament-form.js`（驗證/狀態），各有 jest 測試
- 賽前作業與 seed 見 `docs/tournament/賽前作業.md`

### 8. 主頁賽事倒數（js/countdown.js）
- 主頁頂端顯示 8/20 比賽倒數，歸零後轉為即時計分板入口，21:00 後自動隱藏
  （非賽程表第 10 輪預定結束時間 19:50——留 70 分鐘延誤緩衝，賽後也讓人找得到戰績入口）
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
- 純函式 `countdownState` / `formatCountdown` / `formatEventDate` 有 jest 測試，
  渲染層靠瀏覽器驗證
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
1. `npm test` 執行全部 jest 測試（純函式邏輯 + DOM 互動，現為 201 項跨 14 套件）
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
│   └── tournament.css      # 比賽計分頁專屬樣式
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
│   └── tournament-api.test.js      # 比賽計分頁 API 薄封裝測試
├── img/
│   └── event-banner.jpg     # 主頁倒數區背景插畫（1400w JPEG，213K）
├── docs/tournament/         # 比賽計分頁：賽前作業清單、Supabase seed/bootstrap SQL
│                            #   lineup-schema-*.sql：出賽選手欄位與 RPC（跑一次）
│                            #   lineup-*.sql：隊名／名冊／30 場出賽選手（可重跑）
├── scripts/generate-qr.sh   # 產生各隊隊長 QR code
├── index.html              # 單頁應用程式
├── tournament.html         # 比賽計分頁（觀賽 + 隊長輸分）
└── CLAUDE.md               # 此檔案
```

## 排場規則摘要

系統根據準備區人數實作兩種主要情況：

**情況一 (1-4 人)**：優先使用剛下場的選手
**情況二 (5-8+ 人)**：優先從準備區選擇，考慮等待輪次和場次

詳細規則見上方「核心功能與實作」與「場地排程演算法」各節。