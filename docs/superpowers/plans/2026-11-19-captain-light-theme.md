# 輸分頁改白色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 輸分連結（`?c=`）打開是白色版，觀賽連結（`?t=`）維持黑色版，一打開就是對的顏色。

**Architecture:** `<head>` 先載 `tournament-form.js`（已有的 `parseTokenFromUrl`）再載新的 `page-theme.js`，在 body 畫出來之前替 `<html>` 加 `theme-light` class、改 theme-color。`css/tournament.css` 尾端加 `:root.theme-light` 變數組與 `.theme-light` 底下的深色寫死處覆寫；原有規則不動。

**Tech Stack:** Vanilla JS（無建置）、Jest＋jsdom、GitHub Pages、Service Worker 快取。

**Spec:** `docs/superpowers/specs/2026-11-19-captain-light-theme-design.md`

## Global Constraints

- 網址不能改（已發出的 QR code）；判斷規則只用 `parseTokenFromUrl(search).mode === 'captain'`，不另寫網址規則。
- 觀賽頁外觀不變：`css/tournament.css` 既有規則一字不動，只在檔尾新增。
- 白色版色值：`--f1-bg: #f2f2f5`、`--f1-panel: #ffffff`、`--f1-line: #dcdce2`、`--f1-fg: #15151e`、`--f1-fg-muted: #5c5c66`、`--f1-fg-faint: #767680`、`--f1-conflict: #c8102e`、`--f1-win: #1a8a4a`、`--f1-wait: #a86b00`；`--f1-red` 維持 `#e10600`。
- 項目標籤字色（白色版）：男雙 `#2f5f9e`、女雙 `#a0325f`、混雙 `#1f7a5a`（框色沿用原值）。
- theme-color：白色版 `#ffffff`、黑色版 `#000000`。
- 換版：所有 `?v=` 與 `sw.js` 的 `CACHE_NAME` 一起從 20 換成 21。
- Node export guard：`if (typeof module !== 'undefined' && module.exports)`；瀏覽器才執行的啟動碼用 `if (typeof module === 'undefined')`。

## Review Focus

1. 連結同時帶 `?t=` 與 `?c=`：`parseTokenFromUrl` 以隊長優先，應是白色（Task 1 測試釘住）。
2. `?c=`（空值）＋`?t=xxx`：是觀賽，應是黑色（Task 1 測試釘住）。
3. 頁面沒有 theme-color meta 時套色不能拋錯（Task 1 測試釘住）。
4. 之後有人在 `:root` 新增顏色變數卻沒給白色版 → 白底上出現黑底色塊（Task 2 的對照測試會擋）。
5. 觀賽頁的 `:root` 原值被改到（Task 2 的特性測試釘住 `--f1-bg: #26262b` 等原值）。

---

### Task 1: 依網址決定頁面顏色（page-theme.js＋head 載入）

**Files:**
- Create: `js/page-theme.js`
- Modify: `tournament.html`（`<head>` 加兩支 script；body 拿掉 `tournament-form.js`）
- Test: `tests/page-theme.test.js`（新）、`tests/tournament-html-assets.test.js`（加載入順序測試）

**Interfaces:**
- Consumes: 全域 `parseTokenFromUrl(search) -> { mode: 'captain'|'public'|null, token }`（`js/tournament-form.js`）
- Produces: `pageThemeFor(search: string) -> 'light'|'dark'`、`applyPageTheme(doc: Document, theme: 'light'|'dark') -> void`；`<html>` 上的 class `theme-light`（Task 2 的 CSS 依賴它）

- [ ] **Step 1: 寫失敗的測試** `tests/page-theme.test.js`（`@jest-environment jsdom`；`Object.assign(global, require('../js/tournament-form'))` 後 require `../js/page-theme`）

```js
test.each([
  ['?c=cap123', 'light'],
  ['?t=pub123', 'dark'],
  ['', 'dark'],
  ['?c=&t=pub123', 'dark'],
  ['?t=pub123&c=cap123', 'light'],
])('pageThemeFor(%s) → %s', (search, theme) => {
  expect(pageThemeFor(search)).toBe(theme);
});

test('applyPageTheme light：<html> 加 theme-light、theme-color 改白', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  applyPageTheme(document, 'light');
  expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#ffffff');
});

test('applyPageTheme dark：拿掉 theme-light、theme-color 回黑', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  document.documentElement.classList.add('theme-light');
  applyPageTheme(document, 'dark');
  expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#000000');
});

test('沒有 theme-color meta 時不拋錯，class 照樣加上', () => {
  document.head.innerHTML = '';
  expect(() => applyPageTheme(document, 'light')).not.toThrow();
  expect(document.documentElement.classList.contains('theme-light')).toBe(true);
});
```

在 `tests/tournament-html-assets.test.js` 加：

```js
test('page-theme.js 在 <head>、排在 tournament-form.js 之後；body 不再重複載 tournament-form.js', () => {
  const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  const formAt = head.indexOf('js/tournament-form.js');
  const themeAt = head.indexOf('js/page-theme.js');
  expect(formAt).toBeGreaterThan(-1);
  expect(themeAt).toBeGreaterThan(formAt);
  expect(body).not.toContain('js/tournament-form.js');
  expect(body).toContain('js/tournament.js');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/page-theme.test.js tests/tournament-html-assets.test.js`
Expected: FAIL（`Cannot find module '../js/page-theme'`；head 測試 `formAt` 為 -1）

- [ ] **Step 3: 實作 `js/page-theme.js`，改 `tournament.html`**

`pageThemeFor` 只呼叫 `parseTokenFromUrl`；`applyPageTheme` 用 `classList.toggle('theme-light', …)`、meta 不存在就略過。檔尾 export guard 匯出兩個函式；`if (typeof module === 'undefined') applyPageTheme(document, pageThemeFor(location.search));`。
檔頭註解寫明：為什麼在 head（body 畫出來前就決定顏色，不先黑一下）、spec 路徑。
`tournament.html`：在兩個 stylesheet 之後加 `<script src="js/tournament-form.js?v=20"></script>`、`<script src="js/page-theme.js?v=20"></script>`；body 的 `tournament-form.js` 那行刪掉。

- [ ] **Step 4: 跑全部測試確認通過**

Run: `npm test`
Expected: 23 → 24 套件全綠，測試數 388 + 9

- [ ] **Step 5: Commit**

```bash
git add js/page-theme.js tournament.html tests/page-theme.test.js tests/tournament-html-assets.test.js
git commit -m "feat: 輸分連結在 head 就標記白色版（page-theme.js）"
```

### Task 2: 白色版配色＋換版＋文件

**Files:**
- Modify: `css/tournament.css`（檔尾新增，既有規則不動）、`tournament.html`、`overlay.html`、`sw.js`（v21）、`CLAUDE.md`、`docs/tournament/賽前作業.md`
- Test: `tests/tournament-theme-css.test.js`（新）

**Interfaces:**
- Consumes: Task 1 的 `<html class="theme-light">`
- Produces: 無（最末任務）

- [ ] **Step 1: 寫失敗的測試** `tests/tournament-theme-css.test.js`（node 環境，讀 `css/tournament.css` 文字）

```js
// 取 `:root {` 與 `:root.theme-light {` 兩個區塊的 --f1-* 宣告成物件
test('觀賽頁（黑色版）原值不變', () => {
  expect(dark['--f1-bg']).toBe('#26262b');
  expect(dark['--f1-panel']).toBe('#000000');
  expect(dark['--f1-fg']).toBe('#ffffff');
  expect(dark['--f1-win']).toBe('#37c871');
});

test('黑色版每個顏色變數，白色版都有自己的值（--f1-red 除外，兩版同色）', () => {
  const colorVars = Object.keys(dark).filter((k) => /^#|^rgb/.test(dark[k]) && k !== '--f1-red');
  colorVars.forEach((k) => expect(light[k]).toBeDefined());
});

test('白色版色值照 spec', () => {
  expect(light).toMatchObject({
    '--f1-bg': '#f2f2f5', '--f1-panel': '#ffffff', '--f1-line': '#dcdce2',
    '--f1-fg': '#15151e', '--f1-fg-muted': '#5c5c66', '--f1-fg-faint': '#767680',
    '--f1-conflict': '#c8102e', '--f1-win': '#1a8a4a', '--f1-wait': '#a86b00',
  });
});

test.each([
  '.theme-light .report-modal',
  '.theme-light .score-inputs input',
  '.theme-light .tournament-page .app-toast',
  '.theme-light .report-overlay',
  '.theme-light .cheer-btn:active',
  '.theme-light .event-chip.男雙',
  '.theme-light .event-chip.女雙',
  '.theme-light .event-chip.混雙',
])('寫死深色的地方有白色版覆寫：%s', (selector) => {
  expect(css).toContain(`${selector} {`);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest tests/tournament-theme-css.test.js`
Expected: FAIL（`light` 為空物件；覆寫選擇器找不到）。第一個「原值不變」測試應是綠的（特性測試）。

- [ ] **Step 3: 在 `css/tournament.css` 檔尾加白色版**

`:root.theme-light { … }` 照 Global Constraints 的色值；覆寫：彈窗與提示背景用 `var(--f1-panel)`、輸入框 `#f7f7f9`、遮罩 `rgba(21, 21, 30, 0.45)`、提示陰影 `0 8px 24px rgba(0, 0, 0, 0.15)`、按下應援 `rgba(0, 0, 0, 0.05)`、項目標籤字色照 Global Constraints。區塊前加註解：孟娜 11-19 許願、spec 路徑、為什麼只新增不改原規則。

- [ ] **Step 4: 換版 v20 → v21**

`tournament.html`、`overlay.html` 所有 `?v=20` → `?v=21`；`sw.js` `CACHE_NAME = 'hanlin-badminton-v21'`。

- [ ] **Step 5: 文件**

`CLAUDE.md`：檔案樹加 `js/page-theme.js`、說明輸分連結白色／觀賽連結黑色、測試數更新。`docs/tournament/賽前作業.md`：加一行「輸分連結打開是白色、觀賽連結是黑色；拿到黑色畫面卻要輸分，就是拿錯連結」。

- [ ] **Step 6: 跑全部測試確認通過**

Run: `npm test`
Expected: 25 套件全綠

- [ ] **Step 7: Commit**

```bash
git add css/tournament.css tournament.html overlay.html sw.js CLAUDE.md docs/tournament/賽前作業.md tests/tournament-theme-css.test.js
git commit -m "feat: 輸分頁白色版配色（觀賽頁不變），換版 v21"
```

### 驗收（合併前，不算任務）

本機起靜態伺服器跑 worktree，用 Claude in Chrome 以正式資料開友誼賽的觀賽連結與貿聯輸分連結（只看、不輸分、不按應援），並排截圖：
桌機與 375px 寬各一張；輸分彈窗打開一次（不送出）。送給使用者過目後才交合併。
