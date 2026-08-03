# 比賽計分頁 F1 風格改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把比賽計分頁從排場系統的藍色系改成 F1 賽事計時板風格（深色底、髮絲線、等寬數字、克制的紅色點綴）。

**Architecture:** 改寫 `css/tournament.css`，在檔案開頭自建一組 `--f1-*` 變數（**不再引用 `style.css` 的 `:root` 變數**，兩套配色不相容）。`tournament.html` 加字體連結，`js/tournament.js` 加隊伍色圓點的渲染。互動行為與文案完全不變。

**Tech Stack:** 原生 CSS（無框架、無建置流程）、Google Fonts（Titillium Web + Noto Sans TC）、既有 jest 167 項。

**Spec:** `docs/superpowers/specs/2026-08-03-tournament-f1-theme-design.md`

## Global Constraints

- 只改 `css/tournament.css`、`tournament.html`、`js/tournament.js` 三個檔案
- **不動** `index.html`、`js/script.js`、`css/style.css`、`js/dialog.js`、`js/standings.js`、`js/tournament-form.js`、`js/tournament-api.js`
- 互動行為、DOM 結構語意、所有使用者可見文案一律不變（只換視覺）
- 既有 167 項 jest 測試必須維持全綠
- 介面文字繁體中文；commit 訊息繁中、慣例前綴
- 實測色值（來自 formula1.com computed style，須逐字使用）：
  頁面底 `#26262B`、表格區 `#000000`、分隔線 `#303037`、品牌紅 `#E10600`、
  衝突紅 `#E8002D`、次要文字 `#AAAAAA`、表頭 14px/600/uppercase、資料列 16px/600
- 轉場一律 `0.28s cubic-bezier(0.4, 0, 0.2, 1)`（F1 官網量到 0.5s，但那是導覽列大面積轉場；
  本頁多為小元件，0.28s 同曲線可維持同樣的沉穩感又不遲鈍）
- 所有數字（名次、勝敗、得分、比分）必須 `font-variant-numeric: tabular-nums`
- 對比度全部達 WCAG AA 4.5:1
- 必須支援 `prefers-reduced-motion: reduce`

## 現況（實作前的事實）

- `css/tournament.css` 245 行，目前引用 19 個 `style.css` 的變數（`--primary` 等），本次全數移除
- `tournament.html` 61 行，`<head>` 已載入 Font Awesome CDN 與 `css/style.css`、`css/tournament.css`
- `js/tournament.js` 300 行；`renderStandings` 的表格列由 `cells` 陣列生成、
  `renderSchedule` 的每列含 `.event-chip`、`.match-teams`、`.match-result`
- `style.css` 仍會被 `tournament.html` 載入（提供 `js/dialog.js` 的 toast 樣式），
  因此新變數必須自成一套、不可與既有變數同名

---

### Task 1: 設計 token 與基礎版面

**Files:**
- Modify: `css/tournament.css`（整檔改寫）
- Modify: `tournament.html`（`<head>` 加字體連結）

**Interfaces:**
- Consumes: 無
- Produces: `--f1-*` CSS 變數供後續 task 使用，名稱固定為：
  `--f1-bg`、`--f1-panel`、`--f1-line`、`--f1-fg`、`--f1-fg-muted`、`--f1-fg-faint`、
  `--f1-red`、`--f1-conflict`、`--f1-win`、`--f1-wait`、`--f1-ease`、`--f1-radius`

- [ ] **Step 1: `tournament.html` 的 `<head>` 在 `css/style.css` 之前加入字體**

在既有的 Font Awesome `<link>` 之後、`css/style.css` 之前插入：

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: 把 `css/tournament.css` 開頭換成 token 與基礎版面**

刪除檔案開頭到 `.tournament-main h2 { ... }` 規則結束為止的內容，換成：

```css
/* 比賽計分頁：F1 賽事計時板風格
   色值與排版取自 2026-08-03 formula1.com 的 computed style（見 spec）。
   本檔自成一套 --f1-* 變數，不使用 style.css 的 :root 變數（兩套配色不相容）。 */
:root {
  --f1-bg: #26262b;
  --f1-panel: #000000;
  --f1-line: #303037;
  --f1-fg: #ffffff;
  --f1-fg-muted: #aaaaaa;
  --f1-fg-faint: #6a6a74;
  --f1-red: #e10600;
  --f1-conflict: #e8002d;
  --f1-win: #37c871;
  --f1-wait: #e6a417;
  --f1-ease: 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  --f1-radius: 4px;
}

.tournament-page {
  background: var(--f1-bg);
  color: var(--f1-fg);
  font-family: 'Titillium Web', 'Noto Sans TC', 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* 頂端紅線：品牌識別（比照 F1 導覽列的紅色底線語彙） */
.tournament-page::before {
  content: '';
  position: fixed;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--f1-red);
  z-index: 50;
}

.tournament-header {
  background: var(--f1-panel);
  border-bottom: 1px solid var(--f1-line);
  padding: 1.1rem 0.8rem 0.9rem;
  text-align: center;
  margin-bottom: 1rem;
}

.tournament-header h1 {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--f1-fg);
}

.tournament-header h1 i {
  color: var(--f1-red);
  margin-right: 0.3rem;
}

.finished-badge {
  display: inline-block;
  margin-top: 0.45rem;
  padding: 0.18rem 0.7rem;
  background: transparent;
  border: 1px solid var(--f1-line);
  color: var(--f1-fg-muted);
  border-radius: var(--f1-radius);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}

.finished-badge[hidden] { display: none; }

.tournament-main {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 0.8rem 3rem;
}

.tournament-main h2 {
  margin: 1.4rem 0 0.6rem;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--f1-fg-muted);
}

.tournament-main h2 i {
  color: var(--f1-red);
  margin-right: 0.35rem;
}
```

- [ ] **Step 3: 語法與載入驗證**

Run: `npx http-server -p 8000 &` 然後 `curl -s http://localhost:8000/tournament.html | grep -c 'Titillium'`
Expected: 輸出 `1`（字體連結存在）

Run: `npm test`
Expected: 167 passed（樣式改動不影響測試）

- [ ] **Step 4: Commit**

```bash
git add css/tournament.css tournament.html
git commit -m "style: 比賽頁 F1 設計 token 與基礎版面"
```

---

### Task 2: 排名表與冠亞軍橫幅

**Files:**
- Modify: `css/tournament.css`（`.standings-table`、`.champion-banner` 相關規則）

**Interfaces:**
- Consumes: Task 1 的 `--f1-*` 變數
- Produces: `.standings-table` 的視覺；Task 4 的隊伍色圓點會插入 `.team-name` 儲存格內

- [ ] **Step 1: 取代排名表與橫幅的現有規則**

把 `.standings-table`、`.standings-table th`、`.standings-table td`、
`.standings-table td.team-name`、`.standings-table tr.my-team`、`.champion-banner`
這幾條規則整段換成：

```css
/* 排名表：比照 F1 standings —— 純黑底、髮絲線、表頭大寫灰字、數字右對齊 */
.standings-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--f1-panel);
  border: 1px solid var(--f1-line);
  border-radius: var(--f1-radius);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}

.standings-table th {
  padding: 0.7rem 0.4rem;
  background: transparent;
  border-bottom: 1px solid var(--f1-line);
  color: var(--f1-fg-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: right;
}

.standings-table th:nth-child(1),
.standings-table th:nth-child(2) { text-align: left; }

.standings-table td {
  padding: 0.85rem 0.4rem;
  border-bottom: 1px solid var(--f1-line);
  color: var(--f1-fg);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: right;
}

.standings-table tbody tr:last-child td { border-bottom: none; }

/* 名次與隊名靠左（比照 F1 的 POS. / DRIVER 欄） */
.standings-table td:nth-child(1) {
  text-align: left;
  padding-left: 0.9rem;
  color: var(--f1-fg-muted);
}

.standings-table td.team-name {
  text-align: left;
  font-weight: 700;
}

/* 自己隊伍：左緣紅條，不用整列變色（保持資料區安靜） */
.standings-table tr.my-team td:first-child {
  box-shadow: inset 3px 0 0 var(--f1-red);
}

.standings-table tr.my-team td { background: rgba(225, 6, 0, 0.06); }

/* 冠亞軍：全部完賽後才出現 */
.champion-banner {
  margin-bottom: 0.6rem;
  padding: 0.9rem;
  background: var(--f1-panel);
  border: 1px solid var(--f1-red);
  border-radius: var(--f1-radius);
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--f1-fg);
}
```

- [ ] **Step 2: 視覺驗證**

Run: `npx http-server -p 8000`，瀏覽器開
`http://localhost:8000/tournament.html?t=4478488eb60c20146ae9639634944336`
Expected: 排名表為純黑底、髮絲線分隔、表頭大寫灰字、名次與隊名靠左、數字欄右對齊。
截圖存檔備查。

- [ ] **Step 3: 對比度檢查**

用以下 node 腳本驗證（貼進終端執行）：

```bash
node -e '
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lum=c=>{const s=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2]};
const ratio=(a,b)=>{const l1=lum(hex(a)),l2=lum(hex(b));const[x,y]=l1>l2?[l1,l2]:[l2,l1];return((x+0.05)/(y+0.05)).toFixed(2)};
console.log("表頭灰字 on 黑:", ratio("#aaaaaa","#000000"));
console.log("主要白字 on 黑:", ratio("#ffffff","#000000"));
console.log("次要灰字 on 頁面底:", ratio("#aaaaaa","#26262b"));
'
```

Expected: 三個數值皆 ≥ 4.5。若任一未達，把 `--f1-fg-muted` 調亮到 `#b4b4b4` 再重測並記錄。

- [ ] **Step 4: Commit**

```bash
git add css/tournament.css
git commit -m "style: 排名表與冠亞軍橫幅改為 F1 計時板樣式"
```

---

### Task 3: 賽程列、狀態標籤與輸分彈窗

**Files:**
- Modify: `css/tournament.css`（`.round-card` 起至檔尾）

**Interfaces:**
- Consumes: Task 1 的 `--f1-*` 變數
- Produces: `.match-row`、`.state-label` 各狀態的視覺；`.event-chip` 保留 `男雙/女雙/混雙` 三個修飾類別

- [ ] **Step 1: 取代賽程與彈窗的現有規則**

把 `.round-card` 之後到檔尾（含 `.offline-box`、`.error-box`、`.report-overlay` 等）整段換成：

```css
/* 提示區塊 */
.offline-box,
.error-box {
  margin: 0.8rem 0;
  padding: 0.8rem;
  border-radius: var(--f1-radius);
  text-align: center;
  font-size: 0.9rem;
}

.offline-box {
  background: rgba(230, 164, 23, 0.12);
  border: 1px solid var(--f1-wait);
  color: var(--f1-wait);
}

.error-box {
  background: var(--f1-panel);
  border: 1px solid var(--f1-conflict);
  color: var(--f1-fg);
  padding: 2rem 1rem;
  font-size: 1.05rem;
}

/* 賽程：一輪一張卡 */
.round-card {
  background: var(--f1-panel);
  border: 1px solid var(--f1-line);
  border-radius: var(--f1-radius);
  margin-bottom: 0.7rem;
  overflow: hidden;
}

.round-title {
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid var(--f1-line);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--f1-fg-muted);
  font-variant-numeric: tabular-nums;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 0.9rem;
  border-top: 1px solid var(--f1-line);
  transition: background-color var(--f1-ease);
}

.round-card .match-row:first-of-type { border-top: none; }

/* 自己隊伍的場次：左緣紅條 */
.match-row.match-mine {
  box-shadow: inset 3px 0 0 var(--f1-red);
  background: rgba(225, 6, 0, 0.05);
}

.match-row.can-report { cursor: pointer; }
.match-row.can-report:active { background: rgba(225, 6, 0, 0.12); }

/* 賽點標籤：外框式，不用實心色塊（維持深色底的沉穩） */
.event-chip {
  flex: none;
  padding: 0.15rem 0.45rem;
  border: 1px solid var(--f1-line);
  border-radius: var(--f1-radius);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--f1-fg-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.event-chip.男雙 { border-color: #3d6fb4; color: #7ea8e0; }
.event-chip.女雙 { border-color: #b43d6f; color: #e08cb0; }
.event-chip.混雙 { border-color: #3da882; color: #6fd0ac; }

.match-teams {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--f1-fg);
}

.match-result {
  flex: none;
  text-align: right;
  font-size: 0.78rem;
}

.match-score {
  display: block;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--f1-fg);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.state-label {
  display: block;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.state-label.confirmed { color: var(--f1-win); }
.state-label.pending { color: var(--f1-fg-faint); }
.state-label.waiting { color: var(--f1-wait); }
.state-label.conflict { color: var(--f1-conflict); }
.state-label.action-needed { color: var(--f1-red); }

/* 剛確認的場次：短暫亮綠再淡出 */
@keyframes f1-confirm-flash {
  0% { background-color: rgba(55, 200, 113, 0.25); }
  100% { background-color: transparent; }
}

.match-row.just-confirmed { animation: f1-confirm-flash 1.6s ease-out; }

/* 輸分彈窗 */
.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.report-overlay[hidden] { display: none; }

.report-modal {
  background: #131316;
  border: 1px solid var(--f1-line);
  border-top: 3px solid var(--f1-red);
  border-radius: var(--f1-radius);
  padding: 1.2rem;
  width: min(92vw, 360px);
}

.report-modal h3 {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--f1-fg);
}

.report-subtitle {
  color: var(--f1-fg-muted);
  font-size: 0.85rem;
  margin: 0.3rem 0 0.9rem;
  font-variant-numeric: tabular-nums;
}

.score-inputs {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  justify-content: center;
}

.score-inputs label {
  flex: 1;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--f1-fg-muted);
}

.score-inputs input {
  width: 100%;
  margin-top: 0.3rem;
  padding: 0.6rem;
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  background: #0b0b0d;
  border: 1px solid var(--f1-line);
  border-radius: var(--f1-radius);
  color: var(--f1-fg);
  font-variant-numeric: tabular-nums;
  transition: border-color var(--f1-ease);
}

.score-inputs input:focus {
  outline: none;
  border-color: var(--f1-red);
}

.score-colon {
  font-size: 1.3rem;
  color: var(--f1-fg-muted);
  padding-bottom: 0.7rem;
}

.report-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1.1rem;
}

.report-actions button {
  flex: 1;
  padding: 0.68rem;
  border: 1px solid var(--f1-line);
  border-radius: var(--f1-radius);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background-color var(--f1-ease), border-color var(--f1-ease);
}

.btn-cancel {
  background: transparent;
  color: var(--f1-fg-muted);
}

.btn-submit {
  background: var(--f1-red);
  border-color: var(--f1-red);
  color: #ffffff;
}

.btn-submit:disabled { opacity: 0.5; }

/* 尊重系統的減少動態設定 */
@media (prefers-reduced-motion: reduce) {
  .match-row,
  .score-inputs input,
  .report-actions button { transition: none; }
  .match-row.just-confirmed { animation: none; }
}
```

- [ ] **Step 2: 視覺驗證四種狀態**

Run: `npx http-server -p 8000`，開隊長連結
`http://localhost:8000/tournament.html?c=bb7942df416612b769e1ee7d67a60af5`
Expected: 未完成灰、等待琥珀、不一致洋紅、已確認綠；自己場次左緣有紅條；
點開彈窗為深色、送出鈕紅底、輸入框聚焦時邊框轉紅。截圖存檔。

- [ ] **Step 3: 手機寬度檢查**

用瀏覽器開發者工具切到 375px 寬。
Expected: 排名表與賽程列不出現橫向捲軸，賽點標籤不換行擠壓。

- [ ] **Step 4: `npm test`**

Run: `npm test`
Expected: 167 passed

- [ ] **Step 5: Commit**

```bash
git add css/tournament.css
git commit -m "style: 賽程列、狀態標籤與輸分彈窗改為 F1 深色樣式"
```

---

### Task 4: 隊伍代表色圓點

**Files:**
- Modify: `js/tournament.js`（`renderStandings` 與 `renderSchedule`）
- Modify: `css/tournament.css`（新增 `.team-dot`）

**Interfaces:**
- Consumes: Task 1 的 `--f1-*` 變數；`view.teams`（陣列，元素含 `id`、`name`）
- Produces: `teamColorById(view)` → `{ [teamId]: string }`，值為 CSS 色碼字串

- [ ] **Step 1: 在 `js/tournament.js` 的 `teamNameById` 之後加入色彩對應函式**

```js
// 隊伍代表色：依 view.teams 的固定順序配色（比照 F1 車隊色，供快速辨識）
const TEAM_COLORS = ['#e10600', '#00a19c', '#ff8000', '#9b5de5', '#f5c518'];

function teamColorById(view) {
  const map = {};
  view.teams.forEach((t, i) => { map[t.id] = TEAM_COLORS[i % TEAM_COLORS.length]; });
  return map;
}

function makeTeamDot(color) {
  const dot = document.createElement('span');
  dot.className = 'team-dot';
  dot.style.backgroundColor = color;
  return dot;
}
```

- [ ] **Step 2: 在 `renderStandings` 的隊名儲存格前插入圓點**

找到 `cells.forEach((value, i) => {` 迴圈中設定 `td.className = 'team-name'` 的分支，
把該分支改成先加圓點再加文字：

```js
    const colors = teamColorById(view);
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 1) {
        td.className = 'team-name';
        td.appendChild(makeTeamDot(colors[r.teamId]));
        const label = document.createElement('span');
        label.textContent = value;
        td.appendChild(label);
      } else {
        td.textContent = value;
      }
      tr.appendChild(td);
    });
```

（`const colors = teamColorById(view);` 放在 `rows.forEach((r) => {` 之前，只算一次。）

- [ ] **Step 3: 在 `renderSchedule` 的隊伍名稱前插入雙色圓點**

找到 `teams.textContent = ...` 那一行，改成：

```js
      const colors = teamColorById(view);
      const teams = document.createElement('span');
      teams.className = 'match-teams';
      teams.appendChild(makeTeamDot(colors[match.teamAId]));
      const vsLabel = document.createElement('span');
      vsLabel.textContent = `${names[match.teamAId]} vs ${names[match.teamBId]}`;
      teams.appendChild(vsLabel);
      teams.appendChild(makeTeamDot(colors[match.teamBId]));
      row.appendChild(teams);
```

（`const colors = teamColorById(view);` 提到 `[...byRound.keys()].sort(...)` 迴圈之前，只算一次。）

- [ ] **Step 4: 在 `css/tournament.css` 加入圓點樣式**

加在 `.match-teams` 規則之後：

```css
.team-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
  flex: none;
}

.match-teams .team-dot:last-child {
  margin-right: 0;
  margin-left: 0.4rem;
}

.match-teams {
  display: flex;
  align-items: center;
}
```

- [ ] **Step 5: 驗證**

Run: `node --check js/tournament.js`
Expected: 無輸出（語法正確）

Run: `npm test`
Expected: 167 passed

瀏覽器開觀賽連結，Expected: 排名表每隊名前有一個彩色圓點、五隊顏色互異；
賽程每列兩隊名稱前後各有對應顏色圓點。截圖存檔。

- [ ] **Step 6: Commit**

```bash
git add js/tournament.js css/tournament.css
git commit -m "feat: 排名表與賽程加入隊伍代表色圓點"
```

---

### Task 5: 確認閃爍動畫接線與收尾驗證

**Files:**
- Modify: `js/tournament.js`（`renderSchedule` 掛 `just-confirmed` 類別）

**Interfaces:**
- Consumes: Task 3 的 `.match-row.just-confirmed` 動畫、Task 4 的圓點渲染
- Produces: 無（終端行為）

- [ ] **Step 1: 在 `js/tournament.js` 頂部的全域宣告區加入已見過的確認場次集合**

加在 `let pollTimer = null;` 之後：

```js
// 記錄已呈現過確認狀態的場次，讓新確認的場次只閃一次
const seenConfirmed = new Set();
let firstRenderDone = false;
```

- [ ] **Step 2: 在 `renderSchedule` 的每列建立處判斷是否新確認**

在 `if (state.canReport) row.classList.add('can-report');` 之後加入：

```js
      if (match.status === 'confirmed') {
        if (firstRenderDone && !seenConfirmed.has(match.id)) {
          row.classList.add('just-confirmed');
        }
        seenConfirmed.add(match.id);
      }
```

- [ ] **Step 3: 在 `renderSchedule` 結尾標記首次渲染完成**

在 `document.getElementById('scheduleSection').hidden = false;` 之後加入：

```js
  firstRenderDone = true;
```

- [ ] **Step 4: 驗證閃爍只在新確認時出現**

Run: `node --check js/tournament.js` → 無輸出
Run: `npm test` → 167 passed

瀏覽器實測：開兩個視窗（A 隊與 B 隊隊長連結），對同一場輸入一致比分。
Expected: 送出後該列短暫亮綠再淡出；重新整理頁面時**不會**再閃（首次渲染不觸發）。

- [ ] **Step 5: 全頁對比度與手機寬度最終檢查**

375px 寬下逐項確認：排名表、賽程、彈窗皆無橫向捲軸；
四種狀態文字在深色底上皆清晰可辨。截圖存檔。

- [ ] **Step 6: Commit**

```bash
git add js/tournament.js
git commit -m "feat: 比分確認時該列短暫亮綠提示"
```

---

## Self-Review 紀錄

- **Spec coverage**：色彩（Task 1/2/3）、狀態顏色與品牌紅區隔（Task 3）、字體與 tabular-nums（Task 1/2/3）、
  隊伍代表色（Task 4）、動效與 reduced-motion（Task 3/5）、保留版面與行為（全部 task 皆只改樣式）、
  範圍限制（Global Constraints）、驗收的手機寬度與對比度（Task 2 Step 3、Task 3 Step 3、Task 5 Step 5）。
- **Placeholder scan**：無 TBD／TODO；所有樣式與 JS 片段均為完整可貼上的內容。
  對比度未達標時的處置有具體指示（調亮到 `#b4b4b4` 並重測記錄）。
- **Type consistency**：`teamColorById(view)` 與 `makeTeamDot(color)` 在 Task 4 定義、Task 4 內使用；
  `.team-dot`、`.just-confirmed`、`--f1-*` 變數名稱跨 task 一致；
  `seenConfirmed`／`firstRenderDone` 在 Task 5 內定義與使用。
- **已知取捨**：轉場時間用 0.28s 而非官網量到的 0.5s，理由已寫入 Global Constraints。
