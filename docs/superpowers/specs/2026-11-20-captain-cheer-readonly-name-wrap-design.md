# 輸分頁應援條唯讀＋選手名只在人與人之間折行（v23）

2026-11-20，友誼賽（11/25）前的兩個小改動，使用者選「兩件一起做」，一起換版 v23。

## 1. 輸分頁（`?c=`）的應援條沒有加油按鈕

**為什麼**：孟娜 11-20 10:21 許願——輸分頁只要顯示應援狀況、不用按鈕；場邊的人看的、有空按應援的都是黑色的觀賽頁。
輸分頁是負責輸比分的人在用，不需要加油按鈕。

**做法**：應援條本來就有唯讀模式（比賽 finished 後用：沒有按鈕、不送應援、總數照常輪詢）。
`tournament.js` 掛應援條時，唯讀條件從 `finished` 改成 `finished || auth.mode === 'captain'`，`setCheerReadOnly` 同步。

- 輸分頁仍看得到：拔河比例、別人按應援時的火花與口號泡泡（輪詢到總數增加就會噴，與自己有沒有按無關）。
- 應援數字照原規則：15 場全部確認或 finished 才公布，輸分頁也一樣。
- 觀賽頁（`?t=`）不變，仍有兩個加油按鈕。
- 只有比點模式才有應援條，實際上只影響友誼賽。
- 後端不動：輸分通行碼仍可呼叫應援 RPC，只是頁面上不再提供按鈕（不是權限控管，只是介面）。

## 2. 選手名只在人與人之間折行

**為什麼**：11-20 名單改成「中文全名＋英文名」，手機寬 375px 時有兩組名字
從一個人的「中文名｜英文名」中間斷開（中文字之間都是合法折點）。手機寬約 406px 以上才全部一行，標準款 iPhone（390／393）也會折。

**做法**：賽程列的 `.side-players` 不再是一整段文字，改成每位選手一個 `<span class="side-player">`，
分隔號 `・` 放在前一位名字的 span 結尾（折行時 `・` 留在行尾，不會出現在下一行開頭）；`textContent` 不變（仍是「A・B」）。
CSS：`.side-player { display: inline-block; max-width: 100%; }`——inline-block 在排版上是一整塊，放不下就整塊換到下一行；
單一名字本身比欄位還寬時，inline-block 會縮到欄寬、在塊內照常折行；`max-width: 100%` 只是保險（Chromium 實測拿掉版面不變）。

- class 名稱不能用 `.player-name`：計分頁也載入排場主頁的 `css/style.css`，那裡的 `.player-name` 會把字放大成 1.4rem、加粗（第一版撞到，瀏覽器實看才發現；測試已釘住不得撞名）。
- 名單格式化抽成 `lineupNames(players)`（回傳去空白、略過空值的名字陣列），`formatLineup` 改成 `lineupNames(...).join('・')`，行為不變。
- 輸分彈窗的「本場我方：…」維持純文字（彈窗較寬，不在這次範圍）。
- 疊加頁不顯示選手名，不受影響。

## 換版

`?v=22` → `?v=23`、`sw.js` 的 `CACHE_NAME` → `hanlin-badminton-v23`（測試會檢查一致）。

## 不做

- 不改觀賽頁的應援按鈕、不改後端權限。
- 不改名單資料本身（不加空格、不縮寫）。

## 測試

- `tournament-render.test.js`：輸分模式掛應援條帶 `readOnly: true`、`setCheerReadOnly(true)`；觀賽模式比賽中仍是 `readOnly: false`。
  （原本「比賽中：可以加油」那條是在輸分模式下跑的，改成觀賽模式，並新增輸分模式那條。）
- `tournament-render.test.js`：賽程列每位選手一個 `.side-player`、分隔號在前一位結尾、`textContent` 仍是「A・B」；名單空時不加 `.side-players`。
- `tournament-form.test.js`：`lineupNames` 的空值、去空白、非陣列。
- `tournament-theme-css.test.js`（或新檔）：`.side-player` 有 `display: inline-block` 與 `max-width: 100%`，且 class 不出現在 `css/style.css`。
- 版面靠瀏覽器實看：375px 下兩隊名字只在 `・` 後折行、沒有水平捲動。
