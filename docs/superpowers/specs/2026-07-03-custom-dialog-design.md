# 自訂彈窗與通知系統（取代原生 alert/confirm）設計文件

日期：2026-07-03
狀態：已定案（使用者授權由 Claude 決定細節；通知採混合式為使用者於瀏覽器 mockup 選定）

## 目標

移除專案中全部 34 處原生 `alert()`／`confirm()`（皆在 `js/script.js`），改為與 app 視覺一致的自訂 UI。原生對話框外觀不佳且無法自訂，是本次唯一動機；不新增其他功能。

## 決策摘要

1. **混合式呈現**（使用者選定）：
   - 成功／一般提示 → 頂部置中 toast 通知，自動消失，不阻塞操作
   - 現場操作提醒（場地已滿等）→ 黃色 toast，稍長顯示
   - 外部錯誤／需閱讀的長訊息 → 置中彈窗，單一「確定」按鈕
   - 確認動作（下場、清空場地）→ 置中彈窗，「取消」＋「確認」雙按鈕
2. **彈窗風格**：經典三段式（標題列＋內文＋按鈕列），沿用現有 `.modal` 家族樣式（與「恢復比賽狀態」視窗一致），標題圖示顏色依訊息類型變化（成功綠／警告黃／錯誤紅／資訊藍，使用既有 CSS 變數）。
3. **toast 位置**：頂部置中、向下堆疊。刻意與現有右上角「下輪預告」`#toastNotification` 錯開，兩者互不影響；既有下輪預告元件不改動。

## 架構

### 新檔案 `js/dialog.js`

自訂 UI 模組，掛在 `window` 上供內聯 onclick 與 script.js 呼叫（與專案現有全域函式風格一致）：

```js
showToast(message, type = "success", duration = 3000)
// type: "success" | "warning" | "info" | "error" → 決定左邊條顏色與圖示
// 建立 toast 元素加入 #toastStack，時間到淡出移除；點擊可提前關閉

showAlertDialog(message, { title = "提示", type = "info" } = {})
// 回傳 Promise<void>，按「確定」後 resolve
// type 決定標題圖示與顏色；message 支援 \n 換行

showConfirmDialog(message, { title = "確認", confirmText = "確認",
                             cancelText = "取消", danger = false } = {})
// 回傳 Promise<boolean>：確認 true；取消／ESC／點遮罩 false
// danger: true 時確認鈕用紅色（.btn-danger 風格）
```

實作要點：

- **DOM 由 dialog.js 動態建立**（toast 容器 `#toastStack`、彈窗 `#appDialog`），`index.html` 不加標記，只在 `js/script.js` 之前加 `<script src="js/dialog.js"></script>`。
- **彈窗佇列**：同時只顯示一個彈窗；已開啟時後續請求進 FIFO 佇列，前一個關閉後再顯示（Google 登入 callback 等流程可能連續跳訊息）。
- **注入安全**：訊息與標題一律用 `textContent` 設定（不用 innerHTML），配 `white-space: pre-line` 支援 `\n`。選手名含引號／HTML 也不會出事（呼應 known-issues #2）。
- **鍵盤**：ESC 等同取消（confirm）／關閉（alert）。彈窗開啟時焦點移到主要按鈕。

### CSS（`css/style.css`）

- 彈窗重用既有 `.modal`、`.modal-content`、`.modal-header`、`.modal-body`、`.modal-footer`、`.btn` 系列 class，新增 `.dialog-icon-success/-warning/-error/-info` 圖示顏色與少量間距調整。
- 新增 `.toast-stack`（fixed、top 置中、z-index 10000）與 `.app-toast`（白底、彩色左邊條、陰影、淡入淡出動畫），顏色一律用既有 CSS 變數。
- 行動裝置：toast 寬度 `min(90vw, 420px)`；彈窗沿用既有 `.modal-content` 的 90% 寬度規則。

### 呼叫點轉換（`js/script.js`，共 34 處）

**confirm → showConfirmDialog（2 處）**

| 行 | 現況 | 改為 |
|---|---|---|
| 1603 `endMatch` | `if (!confirm(...))` | 函式已是 async：`if (!(await showConfirmDialog("確認讓 場地N 的比賽結束下場嗎？", { title: "場地N 下場" })))` |
| 2115 `manualEndMatch` | 同步 confirm | 函式改為 `async`（onclick 呼叫、無人 await，安全）＋ `await showConfirmDialog(..., { danger: true })` |

**alert → 彈窗（showAlertDialog，16 處）**：外部錯誤與需閱讀的訊息

- 168、277、294、305（語音功能錯誤，type: error）
- 2002（Sheets 無出席選手，warning）、2029（Sheets 載入失敗，error）
- 2302、2631（已複製＋多行教學步驟，info，title「已複製到剪貼簿」）
- 2305、2634（自動複製失敗，error）、2316、2643（同步錯誤，error）
- 2449（登入失敗，error）、2457（登入初始化失敗，error）、2483（請先登入，info）、2557（寫入失敗，error）

（2302/2631 等長訊息維持原文案，僅拆出標題。）

**alert → toast（16 處）**：即時回饋

- success（4）：2015（導入成功）、2427、2432、2439（登入成功）
- warning（10）：527（請貼上選手資料）、1468（預備區不足 4 人）、2067、2082、2099（替換操作錯誤）、2142（場地已滿）、2149（找不到選手）、2242、2566（無紀錄可同步）、2692（恢復狀態失敗）
- info（2）：1099（單次放寬組合標準）、2477（已登出）

合計：confirm 2 ＋ 彈窗 16 ＋ toast 16 ＝ 34 處，全數涵蓋。

**刻意的行為改變**（原 alert 同步阻塞，toast 不阻塞）：

- 1099：原本排場流程會停住等使用者按確定，改 toast 後排場直接繼續 —— 這是改善。
- 其餘 toast 化的訊息原本也只是「按確定關閉」，無流程分支，不阻塞無風險。

### 其他檔案

- `index.html`：加 `<script src="js/dialog.js"></script>`（於 script.js 前）。
- `sw.js`：`PRECACHE_URLS` 加入 `js/dialog.js`；`CACHE_NAME` 升為 `hanlin-badminton-v2` 使舊快取失效。
- `CLAUDE.md`：專案結構補 `js/dialog.js` 與 `tests/dialog.test.js`。

## 錯誤處理

- dialog.js 未載入（極端情況）：不做 fallback —— dialog.js 與 script.js 同源同快取策略，載入失敗時整個 app 本來就不可用。
- 彈窗佇列在 Promise resolve 後才處理下一筆，不會互相蓋掉。
- toast 數量不設上限（實務上同時最多 2-3 則）；每則獨立計時自我移除。

## 測試

- 新增 devDependency `jest-environment-jsdom`，`tests/dialog.test.js` 以 `@jest-environment jsdom` 執行：
  - confirm：按確認 → resolve true；按取消／ESC／點遮罩 → resolve false
  - alert：按確定 → resolve；`\n` 以 pre-line 呈現
  - 佇列：連續兩個彈窗依序顯示
  - toast：type 對應正確 class；fake timers 驗證自動移除；多則堆疊
  - 注入安全：訊息含 `<img onerror>` 時以純文字呈現（無元素被建立）
- 手動驗證（本機 server）：批量輸入留空、預備區不足 4 人排場、下場確認、清空場地確認、Sheets 匯入成功、同步未登入提示。
- 既有 jest 測試全數維持通過（純函式模組不受影響）。

## 範圍外

- 右上角「下輪預告」toast（`#toastNotification`）維持原樣。
- `restoreStateModal`（恢復比賽狀態）已是自訂 modal，維持原樣。
- 不改任何排場邏輯、不處理 known-issues 其他項目（API 金鑰、FA icon）。
