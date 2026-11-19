# 排場主頁倒數改友誼賽（不放連結）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主頁倒數橫幅改成倒數 11/25 友誼賽，彈窗與提示字在沒有連結時改成「觀賽連結請看社團群組」。

**Architecture:** `js/countdown.js` 新增兩個純函式（彈窗按鈕、橫幅提示字），`eventDialogText` 在沒有 `url` 時多一行；渲染層改呼叫它們；`EVENT` 改成友誼賽且不帶 `url`。

**Tech Stack:** Vanilla JS、Jest、Service Worker 快取。

**Spec:** `docs/superpowers/specs/2026-11-19-countdown-friendly-design.md`

## Global Constraints

- 沒有連結時的文字一字不差：彈窗第三行 `觀賽連結請看社團群組`；提示字開打前 `比賽資訊 ›`、進行中 `觀賽連結請看社團群組`。
- 有連結時的行為與文字照舊：`查看賽程 ›`／`進入即時計分板 ›`；按鈕 `關閉`＋`前往賽程`／`進入即時計分板`（`href: event.url`）。
- `EVENT`：`name: '貿聯×翰林2026羽球聯合友誼賽'`、`startAt: '2026-11-25T18:15:00+08:00'`、`endAt: '2026-11-25T21:00:00+08:00'`，**不得有 `url`**。
- 換版：`sw.js` `CACHE_NAME = 'hanlin-badminton-v22'`；`tournament.html`、`overlay.html` 的 `?v=21` → `?v=22`。

## Review Focus

1. `url` 是空字串時要當成沒有連結（不能出現指向空網址的「前往賽程」）。
2. 結束後（`phase: 'ended'`）三個函式都不能拋錯（彈窗回 null、按鈕與提示字給空）。
3. 有連結的第三屆用法仍正確（下次社內比賽要能直接用）。
4. 友誼賽三組通行碼都不得出現在 repo（從 `~/Downloads/badminton-friendly-1125/連結.txt` 讀出完整通行碼再 `git grep`，應為 0；計劃與文件裡也不寫通行碼片段）。
5. 標題「貿聯×翰林2026羽球聯合友誼賽」比第三屆長兩個字，375px 寬不能撐破橫幅（瀏覽器驗收）。

---

### Task 1: 沒有連結時的彈窗與提示字（純函式＋渲染層）

**Files:**
- Modify: `js/countdown.js`（新增 `eventDialogButtons`、`bannerCtaText`；`eventDialogText` 加第三行；`renderCountdown`／`initCountdown` 改用它們；匯出）
- Test: `tests/countdown.test.js`

**Interfaces:**
- Produces: `eventDialogText(state, event) -> string|null`、`eventDialogButtons(state, event) -> Array<{text, value, className, href?, primary?}>`、`bannerCtaText(state, event) -> string`

- [ ] **Step 1: 寫失敗的測試**：既有測試用的 `EVENT` 固定值加上 `url: 'tournament.html?t=test'`（既有 4 條 `eventDialogText` 測試因此代表「有連結」），另加 `const NO_LINK = { startAt: EVENT.startAt, endAt: EVENT.endAt };`，新增：

```js
describe('沒有連結時（2026-11-19 友誼賽：觀賽連結不進公開 repo）', () => {
  test('彈窗開打前：多一行請看社團群組', () => {
    expect(eventDialogText(countdownState(before(16, 8, 24, 31), NO_LINK), NO_LINK))
      .toBe('還有 16 天 08 : 24 : 31\n8/20 (四) 18:10 開打\n觀賽連結請看社團群組');
  });
  test('彈窗進行中：多一行請看社團群組', () => {
    expect(eventDialogText(countdownState(START, NO_LINK), NO_LINK))
      .toBe('比賽進行中\n8/20 (四) 18:10 開打\n觀賽連結請看社團群組');
  });
  test('url 是空字串也當成沒有連結', () => {
    const blank = { ...NO_LINK, url: '' };
    expect(eventDialogButtons(countdownState(START, blank), blank)).toEqual([
      { text: '關閉', value: false, className: 'btn-primary', primary: true },
    ]);
  });
  test('按鈕只有關閉', () => {
    expect(eventDialogButtons(countdownState(START - 1000, NO_LINK), NO_LINK)).toEqual([
      { text: '關閉', value: false, className: 'btn-primary', primary: true },
    ]);
  });
  test('提示字：開打前「比賽資訊 ›」、進行中「觀賽連結請看社團群組」、結束後空字串', () => {
    expect(bannerCtaText(countdownState(START - 1000, NO_LINK), NO_LINK)).toBe('比賽資訊 ›');
    expect(bannerCtaText(countdownState(START, NO_LINK), NO_LINK)).toBe('觀賽連結請看社團群組');
    expect(bannerCtaText(countdownState(END, NO_LINK), NO_LINK)).toBe('');
  });
});

describe('有連結時照舊（第三屆用法）', () => {
  test('按鈕：關閉＋前往賽程／進入即時計分板', () => {
    expect(eventDialogButtons(countdownState(START - 1000, EVENT), EVENT)).toEqual([
      { text: '關閉', value: false, className: 'btn-secondary' },
      { text: '前往賽程', value: true, href: EVENT.url, className: 'btn-primary', primary: true },
    ]);
    expect(eventDialogButtons(countdownState(START, EVENT), EVENT)[1].text).toBe('進入即時計分板');
  });
  test('提示字：查看賽程 ›／進入即時計分板 ›', () => {
    expect(bannerCtaText(countdownState(START - 1000, EVENT), EVENT)).toBe('查看賽程 ›');
    expect(bannerCtaText(countdownState(START, EVENT), EVENT)).toBe('進入即時計分板 ›');
  });
  test('結束後按鈕為空陣列', () => {
    expect(eventDialogButtons(countdownState(END, EVENT), EVENT)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**
Run: `npx jest tests/countdown.test.js`
Expected: FAIL（`eventDialogButtons is not a function`、第三行不符）；既有 `eventDialogText` 4 條仍綠。

- [ ] **Step 3: 實作**：「有沒有連結」= `Boolean(event.url)`。`renderCountdown` 的 `els.cta.textContent` 改用 `bannerCtaText(state, EVENT)`；`initCountdown` 的 `openDialog({ buttons })` 改用 `eventDialogButtons(state, EVENT)`；`module.exports` 加兩個新函式。

- [ ] **Step 4: 跑全部測試**
Run: `npm test`
Expected: 全綠

- [ ] **Step 5: Commit** `feat(countdown): 沒有觀賽連結時，彈窗只留關閉、提示看社團群組`

### Task 2: EVENT 改成友誼賽＋換版＋文件

**Files:**
- Modify: `js/countdown.js`（`EVENT`、匯出 `EVENT`）、`sw.js`、`tournament.html`、`overlay.html`、`CLAUDE.md`（第 8 節）
- Test: `tests/countdown.test.js`

- [ ] **Step 1: 寫失敗的測試**

```js
describe('目前上線的 EVENT（2026-11-25 友誼賽）', () => {
  const { EVENT: LIVE } = require('../js/countdown');
  test('名稱與時間', () => {
    expect(LIVE.name).toBe('貿聯×翰林2026羽球聯合友誼賽');
    expect(formatEventDate(LIVE.startAt)).toBe('11/25 (三) 18:15 開打');
    expect(LIVE.endAt).toBe('2026-11-25T21:00:00+08:00');
  });
  test('不放觀賽連結（repo 公開，觀賽頁有貿聯同仁名字）', () => {
    expect(LIVE.url).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**　Run: `npx jest tests/countdown.test.js`　Expected: FAIL（`LIVE` undefined）
- [ ] **Step 3: 改 `EVENT`、匯出它**；註解寫明為什麼不放 `url`（spec 路徑）、`endAt` 緩衝理由（第 6 輪 19:30-19:45）。
- [ ] **Step 4: 換版 v22**（Global Constraints）
- [ ] **Step 5: 文件**：CLAUDE.md 第 8 節改成「目前倒數 11/25 友誼賽」、`url` 選填與不放連結的理由、測試數。
- [ ] **Step 6: 跑全部測試＋確認通行碼不在 repo**　Run: `npm test`，再對 `連結.txt` 的三組通行碼逐一 `git grep -l`　Expected: 全綠、三組都 0 個檔案
- [ ] **Step 7: Commit** `feat(countdown): 主頁倒數改為 11/25 友誼賽（不放觀賽連結），換版 v22`

### 驗收（合併前）
本機起靜態伺服器開 `index.html`（Claude in Chrome）：桌機與 375px 寬看橫幅（標題不撐破、倒數跳動）、點橫幅開彈窗（三行、只有關閉）、關閉後排場頁還在。截圖給使用者。
