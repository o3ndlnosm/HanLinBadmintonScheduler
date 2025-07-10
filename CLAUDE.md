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

未安裝測試框架。測試方法：
1. 使用瀏覽器控制台進行除錯
2. 在瀏覽器中手動測試功能
3. 檢查控制台日誌 - 內建廣泛的除錯輸出
4. 在行動裝置上測試語音功能

## 專案結構
```
/HanLinBadmintonScheduler/
├── .vscode/
│   └── settings.json        # Live Server 設定 (連接埠 5501)
├── css/
│   └── style.css           # 使用 CSS 變數的樣式
├── js/
│   └── script.js           # 主要應用程式邏輯 (2841 行)
├── index.html              # 單頁應用程式
├── CLAUDE.md               # 此檔案
└── 排場規則說明.md          # 詳細系統規則和實作狀態
```

## 排場規則摘要

系統根據準備區人數實作兩種主要情況：

**情況一 (1-4 人)**：優先使用剛下場的選手
**情況二 (5-8+ 人)**：優先從準備區選擇，考慮等待輪次和場次

詳細規則請參考 `排場規則說明.md`。