# 主頁賽事倒數改為彈窗 — 設計 spec

日期：2026-08-07
狀態：已實作、已驗證

## 目的

倒數橫幅原本整塊是連結（`<a href="tournament.html?t=...">`），點下去同頁跳到比賽計分頁。
排場資料只存在記憶體、頁面一離開就全部消失（見 CLAUDE.md「瀏覽器儲存」），
所以羽球課進行中只要有人誤觸橫幅，當下的場地、選手、輪次全部歸零。

改成：點橫幅只開彈窗，要看賽程從彈窗裡開新分頁，排場頁永遠留在原地。

## 範圍

**做**：橫幅的點擊行為、一個賽事資訊彈窗、`dialog.js` 支援彈窗需要的兩項設定。

**不做**：

- 不改橫幅的視覺（插畫、漸層、倒數字級、三狀態顏色全部照舊）
- 不改 `tournament.html`
- 彈窗裡的倒數不逐秒更新（要看跳動的倒數，關掉彈窗看橫幅即可）
- 不做「本次不再提醒」之類的記憶功能（沒有這個需求）

## 設計

### 1. 橫幅由 `<a>` 改為 `<button type="button">`

只攔 click 不夠：`<a href>` 還有中鍵、長按選單、拖曳等繞過 click handler 的導航路徑。
拿掉 href，導航就從根本上不存在。

CSS 相對補上按鈕的外觀重置（`width:100%`、`border:none`、`font:inherit`、`cursor:pointer`、
`appearance:none`），其餘 `.event-countdown` 樣式原封不動。

### 2. 彈窗內容

```
🏆 第三屆翰林匹克羽球運動會
   還有 13 天 09 : 07 : 59
   8/20 (四) 18:10 開打
              [關閉] [前往賽程]
```

- 內文由純函式 `eventDialogText(state, event)` 產生，兩行以 `\n` 相接
  （`.app-dialog-message` 本來就有 `white-space: pre-line`）
- `phase === 'during'` 時主文字換成「比賽進行中」、按鈕換成「進入即時計分板」
- `phase === 'ended'` 回傳 `null`，呼叫端不開窗——此時橫幅本來就已隱藏
- 內容是開窗當下的快照

### 3. 「前往賽程」是真的連結，不是 `window.open()`

`window.open()` 只能在彈窗按鈕的 Promise resolve 之後才呼叫，iOS Safari 有機會
判定為非使用者觸發而擋掉。改讓 `dialog.js` 的按鈕設定支援 `href`：有 href 就渲染成
`<a target="_blank" rel="noopener noreferrer">`，導航交給瀏覽器原生處理，零封鎖風險，
且排場頁分頁完全不受影響。

### 4. `dialog.js` 的兩項擴充（皆向後相容）

- `openDialog` 新增選用 `iconClass`，省略時仍用 `DIALOG_ICONS[type]`
  （賽事彈窗要獎盃圖示，它不是四種狀態色之一，另加 `.dialog-icon-trophy` 金色）
- 按鈕設定新增選用 `href`（見上）
- `openDialog` 加入 module.exports，供 `countdown.js` 與測試使用；
  `showAlertDialog` / `showConfirmDialog` 行為完全未變

## 測試

- `tests/countdown.test.js`：`eventDialogText` 四案（開打前含天/不含天、比賽期間、結束後 null）
- `tests/dialog.test.js`：`iconClass` 覆寫與省略、href 按鈕的 DOM 屬性、點連結後關窗並 resolve
- `npm test`：14 套件 192 項全綠

瀏覽器實測（本機 5501）：批量加入 8 位選手 → 點橫幅 → 彈窗出現、網址未變 →
點「前往賽程」→ 新分頁載入 `tournament.html`、`window.opener === null`、
原分頁 8 位選手與 3 個場地原封不動。

## 已知限制

- `phase === 'during'` 的按鈕文字（「進入即時計分板」）只有純函式層測到，
  瀏覽器實測是在 `before` 狀態下做的——賽事時間寫死在 `EVENT` 常數，無法從外部改。
- 已經開著排場頁的裝置不會自動拿到新版：service worker 要重整過才會換
  （`sw.js` 的 `CACHE_NAME` 已 bump 到 v11）。
