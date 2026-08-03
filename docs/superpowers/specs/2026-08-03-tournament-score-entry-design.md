# 比賽計分頁（隊長輸分＋即時排名）設計 — 8/20 第三屆羽球賽

日期：2026-08-03
狀態：已與使用者逐節確認定案

## 背景與目標

8/20 第三屆社內羽球賽（5 隊完全循環、30 場）。本功能讓各隊隊長在**自己手機**上輸入比分，系統判定勝負、即時排名與最終冠亞軍，並提供公開計分板。

做在 v1（本 repo，純前端、GitHub Pages），**後端借用 v2 `badminton-scheduler` 已部署的 Supabase**（資料表、RLS、token RPC 與雙方確認狀態機皆已完成並有測試）。此為使用者在「沿用 v2 / 做在 v1」二選一後的明確決定，並選定「借 v2 Supabase」方案。

## 已確認需求

1. 隊長各自用手機輸入比分（多裝置、需共享儲存）
2. 純循環賽，無淘汰階段；「晉級」= 即時排名與最終冠亞軍
3. **雙方確認制**：兩隊隊長各自輸入，一致才確認成績；不一致標記衝突請重送
4. 排名規則沿用去年：先比勝場數，同勝場比總得分；兩者皆同則並列
5. 公開計分板供所有人觀看即時賽果

## 架構

新增獨立頁面，**完全不碰現有排場系統**（`index.html` / `js/script.js` 不動）：

| 檔案 | 職責 |
|---|---|
| `tournament.html` | 比賽頁（觀賽/隊長共用一頁） |
| `js/tournament-api.js` | 呼叫 Supabase RPC 的薄封裝（原生 `fetch`，無相依套件） |
| `js/standings.js` | 排名純函式（自 v2 `src/tournament/standings.js` 移植為 vanilla JS） |
| `js/tournament.js` | 頁面邏輯：輪詢、渲染、輸分表單 |
| `tests/standings.test.js` | 排名 jest 測試（含去年實際比分快照測資） |
| `tests/tournament-form.test.js` | 輸分驗證純函式 jest 測試 |

**身份判別走網址參數**（免登入）：

- `tournament.html?t=<public_token>` → 觀賽模式（唯讀）
- `tournament.html?c=<captain_token>` → 隊長模式（觀賽＋自己隊輸分入口）
- 兩參數皆無或 token 無效 → 顯示「找不到比賽」

## 後端介面（v2 Supabase，已存在，不需開發）

以 `fetch` 呼叫 `POST <SUPABASE_URL>/rest/v1/rpc/<fn>`，header 帶 `apikey` 與 `Authorization: Bearer <anon_key>`：

- `tournament_public_view(p_token)` → 賽程、隊伍、confirmed 比分等排名所需資料
- `tournament_captain_view(p_token)` → 同上＋該隊可回報場次與回報狀態
- `tournament_report_score(p_token, p_match, p_score_self, p_score_opp)` → 寫入該隊回報並原子執行確認狀態機

狀態機（後端已實作）：單方回報 `pending`；雙方一致 `confirmed`（寫入正式比分、計入排名）；不一致 `conflict`（任一方重送覆蓋自己那份後重判）；`confirmed` 鎖定僅管理者可改；tournament `finished` 後 RPC 拒絕隊長輸入。

Supabase URL 與 anon key 以常數寫在 `js/tournament-api.js`（anon key 本為公開值，安全由 RLS 與 security definer RPC 把關；與 v1 現行寫死 Google API key 同模式）。**待使用者提供**：v2 專案的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。

## 頁面與 UX（手機優先）

沿用 v1 現有 `css/style.css` CSS 變數與元件風格、`js/dialog.js` 的彈窗/toast，不另創視覺系統。頁面由上而下：

1. **排名表**：名次、隊伍、勝場、總得分、完賽數；30 場全部 confirmed 後標示冠亞軍
2. **賽程表**：10 輪 × 3 場地；每格顯示時間、賽點（男雙/女雙/混雙）、兩隊、比分與狀態（未賽／等待對方確認／比分不一致／已確認）
3. **隊長模式**：自己隊的場次高亮；點開輸入「我方/對方」比分送出；`pending` 顯示「等待對方確認」、`conflict` 顯示「比分不一致，請與對方隊長重新確認後再送一次」（可重送）；`confirmed` 鎖定不可再改

更新機制：每 10 秒輪詢；`visibilitychange` 回前景時立即刷新一次。不用 Supabase Realtime（YAGNI，與 v2 相同決策）。

## 排名邏輯

`js/standings.js` 純函式。輸入 confirmed matches，輸出各隊 { 勝、敗、總得分、完賽數、名次 }；排序：勝場 desc → 總得分 desc → 並列同名次。conflict/pending 場次不計入。測資沿用 v2 快照（去年計分板實際數字）：

- 勝場：紅鯉魚6／明明4／字典4／羽你4／羽出2
- 總得分：紅鯉魚150／明明144／字典134／羽你132／羽出126

## 賽制資料（seed 依據，轉自比賽試算表）

隊伍（試算表分隊 1–5；A–E 對應由賽前抽籤決定，抽完改隊名即可）：

| 隊 | 成員 |
|---|---|
| 1 | 邱奕鈞、陳奕廷、高新翰、陳怡伶、劉凡瑀、洪蘭萍 |
| 2 | 曾偉哲、吳萬萊、陳彥文、劉杰妮、林玉珠、湯庭禎 |
| 3 | 賴忠男、林丞輊、李俊寬、楊皓婷、柳雨彤、吳玉婷 |
| 4 | 傅敬軒、郭彥呈、廖宏彬、呂孟娜、蔡依玲 |
| 5 | 廖翊凱、陳威任、黃迺芸、洪于婷、謝郁嫺 |

賽程 30 場（輪次 × 3 場地；場地1=女雙、場地2=男雙、場地3=混雙的配置如下表）：

| 輪 | 時間 | 場地1 女雙 | 場地2 男雙 | 場地3 混雙 |
|---|---|---|---|---|
| 1 | 18:10-18:20 | C–D | A–E | A–B |
| 2 | 18:20-18:30 | A–B | B–C | D–E |
| 3 | 18:30-18:40 | C–E | A–D | B–C |
| 4 | 18:40-18:50 | B–D | C–D | A–E |
| 5 | 18:50-19:00 | A–E | B–E | C–D |
| 6 | 19:00-19:10 | A–D | A–C | B–E |
| 7 | 19:10-19:20 | B–E | B–D | A–C |
| 8 | 19:20-19:30 | A–C | C–E | B–D |
| 9 | 19:30-19:40 | D–E | A–B | C–E |
| 10 | 19:40-19:50 | B–C | D–E | A–D |

（已驗證：10 組隊伍配對 × 男雙/女雙/混雙各 1 = 30 場，完全循環無缺漏。）

## 資料準備（一次性、賽前作業）

1. 我方產出 **seed SQL**（1 筆 tournament＋5 隊含選手名單＋30 場賽程），使用者貼到 Supabase SQL editor 執行一次
2. 抽籤結果出來後改隊名（一句 SQL 或 v2 管理頁）
3. seed 後取得 5 個 captain_token 與 public_token，我方產生 5 張隊長 QR code 圖檔＋1 個公開連結供印出/分發
4. 管理者補登/改判走 v2 現成管理頁（不在 v1 重做）

## 邊界清單（實作與測試照表操課）

1. 無效/過期 token → 顯示「找不到比賽」
2. 網路失敗 → 顯示離線提示，下次輪詢自動恢復
3. 比分格式錯誤：非整數、超出 0–30、平手 → 前端擋（後端亦驗）
4. 雙方不一致 → conflict → 任一方重送覆蓋 → 重判
5. confirmed 後隊長不可再改（後端擋、前端鎖 UI）
6. tournament `finished` 後全面鎖定輸入（後端擋、前端顯示已結束）
7. 兩隊長同時送出 → 後端原子處理，前端以回傳結果為準
8. 同隊長重複快速點擊送出 → 送出中鎖按鈕
9. conflict/pending 場次不計入排名

## 測試

- jest：`standings.js`（含快照測資）、輸分驗證純函式、conflict/pending 不計入排名
- 手動：真機手機操作（iOS/Android）、QR 掃碼動線、10 秒輪詢與背景喚醒刷新、雙隊長雙裝置實測一致/不一致流程

## 不做的事（Non-goals）

- 不做報名、分隊、出賽表（每場選手 1/2）管理——賽前作業照舊留在試算表
- 不做自動排賽程——賽程固定照試算表 seed
- 不在 v1 做管理者介面——補登/改判用 v2 現成管理頁
- 不用 Supabase Realtime——10 秒輪詢即可
- 不動現有排場系統任何檔案
