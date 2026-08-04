# 主頁賽事倒數 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在排場系統主頁加一塊 8/20 賽事倒數，歸零後變成進入即時計分板的入口，19:50 後自動消失。

**Architecture:** 計算與渲染分離。`countdownState()` / `formatCountdown()` 為純函式（時間由參數傳入，jest 可測）；渲染層每秒呼叫一次並更新 DOM。賽事資訊寫死為常數，主頁不連 Supabase。

**Tech Stack:** 原生 JavaScript（無建置流程、無模組系統，靠 `<script>` 順序載入）、jest 30 + jsdom、PWA Service Worker。

設計依據：`docs/superpowers/specs/2026-08-04-index-countdown-design.md`（commit `cf9eded`）
分支：`index-countdown`

## Global Constraints

- 時間常數一律帶時區：`'2026-08-20T18:10:00+08:00'`。**不可**寫成 `'2026-08-20 18:10'`——後者會被當裝置本地時間解析，社員在別的時區會看到錯的倒數。
- 純函式模組結尾一律用專案既有匯出模式，讓同一份檔案能同時被 `<script>` 與 `require()` 使用：
  ```js
  // Node.js 環境下匯出（瀏覽器環境忽略）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { countdownState, formatCountdown };
  }
  ```
- **不使用** `tournament.css` 的 `--f1-*` 變數。主頁是淺色藍系（`--primary: #4a7dbc`），兩套配色不相容。
- 動任何 `index.html` / `css/style.css` / `js/*.js` 後，`sw.js` 的 `CACHE_NAME` 必須 bump。stale-while-revalidate 策略下不 bump 的話，既有使用者要重整兩次才吃得到新檔案。
- 賽事常數的唯一真相在 `js/countdown.js`，HTML 不重複寫死 URL。
- 專案無 `jest.config.js`，預設環境是 node。需要 DOM 的測試檔要在檔頭加 `/** @jest-environment jsdom */`。

---

### Task 1: 倒數計算純函式

**Files:**
- Create: `js/countdown.js`
- Test: `tests/countdown.test.js`

**Interfaces:**
- Consumes: 無（本任務為最底層）
- Produces:
  - `countdownState(nowMs: number, event: {startAt: string, endAt: string})`
    → `{phase: 'before', days: number, hours: number, minutes: number, seconds: number}`
    ｜ `{phase: 'during'}` ｜ `{phase: 'ended'}`
  - `formatCountdown(state)` → `string`，例：`'16 天 08 : 24 : 31'`、`'05 : 03 : 02'`

- [ ] **Step 1: 寫失敗的測試**

建立 `tests/countdown.test.js`：

```js
const { countdownState, formatCountdown } = require('../js/countdown');

const EVENT = {
  startAt: '2026-08-20T18:10:00+08:00',
  endAt: '2026-08-20T19:50:00+08:00',
};
const START = Date.parse(EVENT.startAt);
const END = Date.parse(EVENT.endAt);

// 用秒數往前推，避免手算 epoch 造成的魔術數字
const before = (d, h, m, s) => START - ((d * 86400 + h * 3600 + m * 60 + s) * 1000);

describe('時區', () => {
  test('常數帶 +08:00，解析結果等同對應的 UTC 時刻', () => {
    expect(START).toBe(Date.parse('2026-08-20T10:10:00Z'));
    expect(END).toBe(Date.parse('2026-08-20T11:50:00Z'));
  });
});

describe('countdownState 三個狀態', () => {
  test('開打前為 before，並拆出天時分秒', () => {
    expect(countdownState(before(16, 8, 24, 31), EVENT)).toEqual({
      phase: 'before', days: 16, hours: 8, minutes: 24, seconds: 31,
    });
  });

  test('剩不到一天時 days 為 0', () => {
    expect(countdownState(before(0, 5, 3, 2), EVENT)).toEqual({
      phase: 'before', days: 0, hours: 5, minutes: 3, seconds: 2,
    });
  });

  test('剩不到一分鐘', () => {
    expect(countdownState(before(0, 0, 0, 45), EVENT)).toEqual({
      phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 45,
    });
  });

  test('比賽期間為 during', () => {
    expect(countdownState(START + 30 * 60 * 1000, EVENT)).toEqual({ phase: 'during' });
  });

  test('結束後為 ended', () => {
    expect(countdownState(END + 1000, EVENT)).toEqual({ phase: 'ended' });
  });
});

describe('countdownState 邊界', () => {
  test('now 正好等於 startAt 即進入 during', () => {
    expect(countdownState(START, EVENT)).toEqual({ phase: 'during' });
  });

  test('startAt 前 1 毫秒仍是 before（不足一秒顯示 0 秒）', () => {
    expect(countdownState(START - 1, EVENT)).toEqual({
      phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 0,
    });
  });

  test('now 正好等於 endAt 即進入 ended', () => {
    expect(countdownState(END, EVENT)).toEqual({ phase: 'ended' });
  });

  test('endAt 前 1 毫秒仍是 during', () => {
    expect(countdownState(END - 1, EVENT)).toEqual({ phase: 'during' });
  });
});

describe('formatCountdown', () => {
  test('剩超過一天時帶「天」，時分秒補零', () => {
    expect(formatCountdown({ phase: 'before', days: 16, hours: 8, minutes: 24, seconds: 31 }))
      .toBe('16 天 08 : 24 : 31');
  });

  test('剩不到一天時不顯示「天」', () => {
    expect(formatCountdown({ phase: 'before', days: 0, hours: 5, minutes: 3, seconds: 2 }))
      .toBe('05 : 03 : 02');
  });

  test('全為個位數時補零', () => {
    expect(formatCountdown({ phase: 'before', days: 0, hours: 0, minutes: 0, seconds: 7 }))
      .toBe('00 : 00 : 07');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx jest tests/countdown.test.js`
Expected: FAIL — `Cannot find module '../js/countdown'`

- [ ] **Step 3: 寫最小實作**

建立 `js/countdown.js`：

```js
/**
 * 主頁賽事倒數：計算純函式
 * 設計見 docs/superpowers/specs/2026-08-04-index-countdown-design.md
 */

/**
 * 依當下時刻算出倒數狀態。
 * 時間全部由參數傳入，不讀系統時鐘，方便測試。
 */
function countdownState(nowMs, event) {
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);

  if (nowMs >= end) return { phase: 'ended' };
  if (nowMs >= start) return { phase: 'during' };

  // 不足一秒的餘數捨去，顯示上以秒為最小單位
  const totalSeconds = Math.floor((start - nowMs) / 1000);
  return {
    phase: 'before',
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 只有 phase === 'before' 的狀態需要格式化 */
function formatCountdown(state) {
  const hms = `${pad2(state.hours)} : ${pad2(state.minutes)} : ${pad2(state.seconds)}`;
  return state.days > 0 ? `${state.days} 天 ${hms}` : hms;
}

// Node.js 環境下匯出（瀏覽器環境忽略）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { countdownState, formatCountdown };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx jest tests/countdown.test.js`
Expected: PASS，13 個測試全過

- [ ] **Step 5: 執行全部測試，確認沒弄壞既有的**

Run: `npm test`
Expected: 27 個測試套件、347 個測試全過（原本 26 套件 / 334 測試，本任務 +1 套件 / +13 測試）

- [ ] **Step 6: Commit**

```bash
git add js/countdown.js tests/countdown.test.js
git commit -m "feat(countdown): 倒數計算與格式化純函式（含時區與邊界測試）"
```

---

### Task 2: 主頁版位與渲染

**Files:**
- Modify: `js/countdown.js`（在純函式之後、匯出之前加入常數與渲染層）
- Modify: `index.html` 兩處（容器、script 標籤）——**用錨點定位，不要用行號**：Step 1 插入後所有行號都會往下位移
- Modify: `css/style.css`（檔尾追加樣式）

**Interfaces:**
- Consumes: Task 1 的 `countdownState(nowMs, event)`、`formatCountdown(state)`
- Produces: `initCountdown()` — 由 `DOMContentLoaded` 觸發，無回傳值

- [ ] **Step 1: 在 index.html 加入版位**

在 `index.html` 的 `<div class="court-count-control">` 這一行**之前**插入。
`href` 由 JS 設定（常數的唯一真相在 `countdown.js`），初始 `hidden` 避免 JS 未載入時閃現空框：

```html
        <a id="eventCountdown" class="event-countdown" hidden>
            <span class="ec-title"><i class="fas fa-trophy"></i> <span id="ecName"></span></span>
            <span id="ecMain" class="ec-main"></span>
            <span id="ecSub" class="ec-sub"></span>
            <span id="ecCta" class="ec-cta"></span>
        </a>

```

- [ ] **Step 2: 在 index.html 載入 script**

在 `<script src="js/script.js"></script>` 這一行**之後**加一行（必須在它之後：`countdown.js` 不依賴 `script.js`，但維持既有的載入順序慣例）：

```html
    <script src="js/countdown.js"></script>
```

- [ ] **Step 3: 加入樣式**

追加到 `css/style.css` 檔尾：

```css
/* ── 賽事倒數：主頁頂端的比賽入口 ──────────────────────────
   沿用 .card 的圓角與陰影語彙；不使用 tournament.css 的 --f1-* 深色變數。 */
.event-countdown {
  display: block;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
  color: var(--text-light);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow);
  padding: 1rem 1.2rem;
  margin-bottom: 1rem;
  text-align: center;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

/* author 的 display 宣告會蓋掉瀏覽器內建的 [hidden]{display:none}，必須補這條 */
.event-countdown[hidden] { display: none; }

.event-countdown:hover,
.event-countdown:focus-visible {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.ec-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.95;
}

.ec-title i { margin-right: 0.3rem; }

.ec-main {
  display: block;
  margin-top: 0.4rem;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
  /* 等寬數字：秒數每秒變動時整塊寬度不會抖動 */
  font-variant-numeric: tabular-nums;
}

.ec-sub {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.85rem;
  opacity: 0.85;
}

.ec-sub:empty { display: none; }

.ec-cta {
  display: inline-block;
  margin-top: 0.6rem;
  padding: 0.25rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
}

/* 比賽進行中：整塊改為強調色，並在主要文字前加呼吸紅點 */
.event-countdown.is-during {
  background: linear-gradient(135deg, var(--danger) 0%, var(--danger-dark) 100%);
}

.event-countdown.is-during .ec-main::before {
  content: '';
  display: inline-block;
  width: 0.6em;
  height: 0.6em;
  margin-right: 0.4em;
  vertical-align: middle;
  border-radius: 50%;
  background: #fff;
  animation: ec-pulse 1.4s ease-in-out infinite;
}

@keyframes ec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}

/* 尊重使用者的減少動態偏好 */
@media (prefers-reduced-motion: reduce) {
  .event-countdown.is-during .ec-main::before { animation: none; }
  .event-countdown { transition: none; }
}

@media (max-width: 480px) {
  .ec-main { font-size: 1.4rem; }
}
```

- [ ] **Step 4: 加入常數與渲染層**

在 `js/countdown.js` 的 `formatCountdown` **之後**、`module.exports` **之前**插入：

```js
/**
 * 把賽事開始時刻格式化成「8/20 (四) 18:10 開打」。
 * 固定用台北時間解讀：先把 epoch 加 8 小時，再用 getUTC* 讀取，
 * 這樣不論使用者裝置在哪個時區，顯示的都是賽事當地的日期與星期。
 * 星期一律由日期推導，不寫死——寫死過一次就錯過一次（8/20 是四不是三）。
 */
const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function formatEventDate(isoString) {
  const d = new Date(Date.parse(isoString) + 8 * 3600 * 1000);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const w = WEEKDAY_ZH[d.getUTCDay()];
  return `${md} (${w}) ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} 開打`;
}

// ── 以下為瀏覽器渲染層（jest 只測上方純函式） ──────────────

const EVENT = {
  name: '第三屆翰林匹克羽球運動會',
  // 取自第 1 輪 timeSlot（18:10-18:20）與第 10 輪（19:40-19:50）
  startAt: '2026-08-20T18:10:00+08:00',
  endAt: '2026-08-20T19:50:00+08:00',
  // 公開觀賽 token，本來就要貼社團群組
  url: 'tournament.html?t=4478488eb60c20146ae9639634944336',
};

let countdownTimer = null;

function renderCountdown(state, els) {
  if (state.phase === 'ended') {
    els.root.hidden = true;
    return;
  }

  els.root.hidden = false;
  els.root.classList.toggle('is-during', state.phase === 'during');

  if (state.phase === 'during') {
    els.main.textContent = '比賽進行中';
    els.sub.textContent = '';
    els.cta.textContent = '進入即時計分板 ›';
  } else {
    els.main.textContent = formatCountdown(state);
    els.sub.textContent = formatEventDate(EVENT.startAt);
    els.cta.textContent = '查看賽程 ›';
  }
}

function initCountdown() {
  const root = document.getElementById('eventCountdown');
  if (!root) return;

  const els = {
    root,
    main: document.getElementById('ecMain'),
    sub: document.getElementById('ecSub'),
    cta: document.getElementById('ecCta'),
  };

  root.href = EVENT.url;
  document.getElementById('ecName').textContent = EVENT.name;

  const tick = () => {
    const state = countdownState(Date.now(), EVENT);
    renderCountdown(state, els);
    // 賽事結束後不必再跑
    if (state.phase === 'ended' && countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  tick();
  countdownTimer = setInterval(() => {
    // 分頁在背景時略過 DOM 更新，回前景時由 visibilitychange 立即補上
    if (document.hidden) return;
    tick();
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initCountdown);
}
```

- [ ] **Step 5: 確認純函式測試仍通過**

Run: `npm test`
Expected: 全部通過。渲染層被 `typeof document !== 'undefined'` 包住，node 環境下不執行。

- [ ] **Step 6: 瀏覽器驗證三個狀態**

啟動靜態伺服器：`python3 -m http.server 8000`，開 `http://localhost:8000/index.html`

驗證表：

| 驗證項 | 作法 | 預期 |
|---|---|---|
| `before` 顯示 | 直接開頁面 | 藍色橫幅在場地數量之上，顯示「N 天 HH : MM : SS」，秒數每秒遞減 |
| 數字不抖動 | 盯著秒數看 10 秒 | 整塊寬度不變（`tabular-nums` 生效） |
| 可點跳轉 | 點整塊 | 開啟比賽計分頁，看得到 5 隊 30 場 |
| 鍵盤可達 | 按 Tab | 焦點會落在橫幅上，Enter 可跳轉 |
| `during` | DevTools Console 執行 `renderCountdown({phase:'during'}, {root:eventCountdown, main:ecMain, sub:ecSub, cta:ecCta})` | 轉為紅色、白點呼吸、文字變「比賽進行中」與「進入即時計分板 ›」 |
| `ended` | Console 執行 `renderCountdown({phase:'ended'}, {root:eventCountdown, main:ecMain, sub:ecSub, cta:ecCta})` | 整塊消失，版面接回場地數量 |
| 手機寬度 | DevTools 切 375px | 字級縮小、不折行、不溢出 |
| 不影響排場 | 新增選手、開始排場 | 既有功能一切正常 |

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/countdown.js
git commit -m "feat(countdown): 主頁賽事倒數版位、樣式與渲染層"
```

---

### Task 3: PWA 快取與文件

**Files:**
- Modify: `sw.js:6`（`CACHE_NAME`）、`sw.js:8-19`（`PRECACHE_URLS`）
- Modify: `CLAUDE.md`（核心功能、專案結構、測試數）

**Interfaces:**
- Consumes: Task 2 產出的 `js/countdown.js`
- Produces: 無程式介面

- [ ] **Step 1: 更新 Service Worker**

`sw.js` 第 6 行：

```js
const CACHE_NAME = 'hanlin-badminton-v9';
```

`PRECACHE_URLS` 陣列中，在 `'js/dialog.js'` 之後加一行：

```js
  'js/countdown.js',
```

漏掉這行的話，離線開主頁會載不到倒數；不 bump `CACHE_NAME` 的話，既有使用者要重整兩次才看得到。

- [ ] **Step 2: 更新 CLAUDE.md**

「核心功能與實作」章節末尾新增一節：

```markdown
### 8. 主頁賽事倒數（js/countdown.js）
- 主頁頂端顯示 8/20 比賽倒數，歸零後轉為即時計分板入口，19:50 後自動隱藏
- 賽事時間寫死為常數（帶 +08:00 時區），主頁不連 Supabase
- 純函式 `countdownState` / `formatCountdown` 有 jest 測試，渲染層靠瀏覽器驗證
- 下屆比賽只需改 `js/countdown.js` 的 `EVENT` 常數即可重啟
```

「專案結構」的 `js/` 區塊加入：

```
│   ├── countdown.js        # 主頁賽事倒數（純函式 + 渲染，jest 測試）
```

「專案結構」的 `tests/` 區塊加入：

```
│   ├── countdown.test.js           # 賽事倒數計算與格式化測試
```

「測試方法」第 1 點的測試數由 `165` 改為 `347`（CLAUDE.md 上的數字早已過時：合併比賽計分頁後實際是 334，本功能再 +13）。

- [ ] **Step 3: 確認測試與快取版號**

Run: `npm test`
Expected: 全部通過

Run: `grep CACHE_NAME sw.js`
Expected: `hanlin-badminton-v9`

Run: `grep countdown sw.js`
Expected: 出現 `'js/countdown.js',`

- [ ] **Step 4: Commit**

```bash
git add sw.js CLAUDE.md
git commit -m "chore: countdown.js 納入 PWA 快取（v8→v9）並補專案文件"
```

---

## 完成後

三個 task 都完成後：

1. 確認 `npm test` 全綠
2. 推分支：`git push -u origin index-countdown`
3. 開 PR（比照既有 PR #1~#3 的作法）

**部署後務必驗證**：GitHub Pages 生效後，用手機開主頁確認倒數顯示正確。
若手機看到的還是舊版，重整第二次——這是 stale-while-revalidate 的預期行為。
