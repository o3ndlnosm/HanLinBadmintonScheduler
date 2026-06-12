# 場地數量調整 + 場上選手替換 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「手動調整場地數量（1–6 面）」與手動模式下的「場上選手替換」（單人替換＋整組隨機替換 2 人），依據 spec `docs/superpowers/specs/2026-06-12-court-count-and-player-swap-design.md`。

**Architecture:** 純邏輯放在新模組 `js/court-actions.js`（純函式、可注入亂數、CommonJS 條件匯出供 jest 測試），由 `index.html` 以 `<script>` 載入；`js/script.js` 只加薄包裝函式（alert 防呆 + UI 更新 + 存檔）與按鈕模板。隨機補位**完全隨機**（含「剛下場」者），被換下者等待輪次 +1 且不計場次。

**Tech Stack:** 原生 JavaScript（無建置流程）、jest 30（已安裝，`npm test`）、瀏覽器手動驗證。

**背景知識（給沒看過此專案的人）：**
- 全域狀態在 `js/script.js` 頂部：`courts`（陣列的陣列，每面場地最多 4 名選手物件，前 2 人為隊伍一、後 2 人為隊伍二；陣列上掛有自訂屬性 `startTime`）、`readyPlayers`（預備區）、`restingPlayers`（休息區）。
- 選手物件欄位：`name`, `level`, `newLevel`, `waitingTurns`, `matches`, `justFinished`（剛下場標記）, `justJoinedReady`（剛加入標記）。
- 既有測試慣例：純邏輯抽到 `js/player-state.js` 這類模組，檔尾用 `if (typeof module !== 'undefined' && module.exports)` 條件匯出，jest 測試放 `tests/*.test.js`。
- UI 全部由 `script.js` 以模板字串 innerHTML 重繪；`isManualMode` 全域旗標控制手動模式。
- 介面文字一律繁體中文。

---

### Task 1: `changeCourtCountLogic` — 場地數量調整邏輯

**Files:**
- Create: `js/court-actions.js`
- Create: `tests/court-actions.test.js`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/court-actions.test.js`：

```javascript
const {
  changeCourtCountLogic,
  swapPlayerOnCourtLogic,
  swapCourtCombinationLogic
} = require('../js/court-actions');

// 工具函式：建立測試選手
function makePlayer(name, opts = {}) {
  return {
    name,
    newLevel: opts.newLevel || 'B',
    level: opts.level || 4,
    waitingTurns: opts.waitingTurns || 0,
    matches: opts.matches || 0,
    justFinished: opts.justFinished || false,
    justJoinedReady: opts.justJoinedReady || false
  };
}

// 工具函式：依序回傳指定亂數值的 rng
function makeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// ============================================================
// changeCourtCountLogic：場地數量調整
// ============================================================
describe('changeCourtCountLogic：場地數量調整', () => {

  test('增加一面場地：3 → 4，新場地為空陣列', () => {
    const courts = [[], [], []];
    const result = changeCourtCountLogic(courts, 1);
    expect(result.error).toBeUndefined();
    expect(result.courtCount).toBe(4);
    expect(courts.length).toBe(4);
    expect(courts[3]).toEqual([]);
  });

  test('減少一面空場地：3 → 2', () => {
    const courts = [[], [], []];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.courtCount).toBe(2);
    expect(courts.length).toBe(2);
  });

  test('最後一面場地有選手時不可減少，回傳錯誤且場地不變', () => {
    const courts = [[], [], [makePlayer('A')]];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(3);
    expect(courts[2].length).toBe(1);
  });

  test('上限 6 面：6 面時再增加回傳錯誤', () => {
    const courts = [[], [], [], [], [], []];
    const result = changeCourtCountLogic(courts, 1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(6);
  });

  test('下限 1 面：1 面時再減少回傳錯誤', () => {
    const courts = [[]];
    const result = changeCourtCountLogic(courts, -1);
    expect(result.error).toBeDefined();
    expect(courts.length).toBe(1);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: FAIL，錯誤為 `Cannot find module '../js/court-actions'`

- [ ] **Step 3: 建立模組並實作 `changeCourtCountLogic`**

建立 `js/court-actions.js`：

```javascript
/**
 * 場地操作模組
 * 純函式、可注入亂數，供 script.js 呼叫並可獨立測試
 */

const MIN_COURTS = 1;
const MAX_COURTS = 6;

/**
 * 調整場地數量（直接修改傳入的 courts 陣列）
 * - 增加：在尾端推入空場地
 * - 減少：移除最後一面場地；若該場地有選手則擋下
 *
 * @param {Array} courts - 場地陣列
 * @param {number} delta - 調整量（+1 或 -1）
 * @returns {Object} { courtCount } 或 { error }
 */
function changeCourtCountLogic(courts, delta) {
  const newCount = courts.length + delta;
  if (newCount < MIN_COURTS) {
    return { error: '至少需要 ' + MIN_COURTS + ' 面場地' };
  }
  if (newCount > MAX_COURTS) {
    return { error: '最多 ' + MAX_COURTS + ' 面場地' };
  }

  if (delta > 0) {
    for (let i = 0; i < delta; i++) {
      courts.push([]);
    }
  } else {
    for (let i = 0; i < -delta; i++) {
      const last = courts[courts.length - 1];
      if (last.length > 0) {
        return { error: '場地 ' + courts.length + ' 還有選手，請先清空該場地' };
      }
      courts.pop();
    }
  }

  return { courtCount: courts.length };
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    changeCourtCountLogic
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: changeCourtCountLogic 的 5 個測試 PASS（swap 相關 require 會因尚未匯出而 undefined，但本檔目前只呼叫 changeCourtCountLogic，不會報錯）

- [ ] **Step 5: Commit**

```bash
git add js/court-actions.js tests/court-actions.test.js
git commit -m "feat: 新增場地數量調整邏輯 changeCourtCountLogic"
```

---

### Task 2: `swapPlayerOnCourtLogic` — 單人替換邏輯

**Files:**
- Modify: `js/court-actions.js`
- Modify: `tests/court-actions.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/court-actions.test.js` 檔尾加入：

```javascript
// ============================================================
// swapPlayerOnCourtLogic：單人替換
// ============================================================
describe('swapPlayerOnCourtLogic：單人替換', () => {

  test('被換下者：等待輪次 +1、清除標記、回預備區、場次不變', () => {
    const c = makePlayer('C', { waitingTurns: 2, matches: 3 });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.error).toBeUndefined();
    expect(result.swappedOut.name).toBe('C');
    expect(result.swappedOut.waitingTurns).toBe(3); // 2 + 1
    expect(result.swappedOut.matches).toBe(3);       // 沒上場，場次不變
    expect(result.swappedOut.justFinished).toBe(false);
    expect(result.swappedOut.justJoinedReady).toBe(false);
    expect(readyPlayers.some((p) => p.name === 'C')).toBe(true);
  });

  test('換下「剛下場」者：標記清除，直接顯示等待輪次', () => {
    const c = makePlayer('C', { waitingTurns: 0, justFinished: true });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [makePlayer('E')];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedOut.waitingTurns).toBe(1);
    expect(result.swappedOut.justFinished).toBe(false);
  });

  test('補上者：移出預備區、等待歸零、清除標記、放入原位置（隊伍不變）', () => {
    const e = makePlayer('E', { waitingTurns: 4, justJoinedReady: true });
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [e];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.swappedIn.name).toBe('E');
    expect(result.swappedIn.waitingTurns).toBe(0);
    expect(result.swappedIn.justJoinedReady).toBe(false);
    expect(courts[0][2].name).toBe('E');             // C 原本在索引 2（隊伍二）
    expect(courts[0].length).toBe(4);
    expect(readyPlayers.some((p) => p.name === 'E')).toBe(false);
  });

  test('完全隨機：rng 決定補位人選（含剛下場者也可被抽中）', () => {
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [
      makePlayer('E'),
      makePlayer('F'),
      makePlayer('G', { justFinished: true })
    ];

    // rng = 0.99 → 抽中池中最後一位 G（剛下場者）
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0.99);
    expect(result.swappedIn.name).toBe('G');
  });

  test('excludeNames 會從抽樣池排除', () => {
    const courts = [[makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // 排除 F 後池中只剩 E，rng 0.99 也只能抽到 E
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C', 'F'], () => 0.99);
    expect(result.swappedIn.name).toBe('E');
  });

  test('預備區無人可補：回傳錯誤且狀態不變', () => {
    const c = makePlayer('C', { waitingTurns: 2 });
    const courts = [[makePlayer('A'), makePlayer('B'), c, makePlayer('D')]];
    const readyPlayers = [];

    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'C', ['C'], () => 0);

    expect(result.error).toBeDefined();
    expect(courts[0][2].name).toBe('C');
    expect(c.waitingTurns).toBe(2);
  });

  test('場上找不到選手：回傳錯誤', () => {
    const courts = [[makePlayer('A')]];
    const readyPlayers = [makePlayer('E')];
    const result = swapPlayerOnCourtLogic(courts, readyPlayers, 0, 'X', ['X'], () => 0);
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: 新增測試 FAIL，錯誤為 `swapPlayerOnCourtLogic is not a function`

- [ ] **Step 3: 實作 `swapPlayerOnCourtLogic`**

在 `js/court-actions.js` 的 `changeCourtCountLogic` 之後加入，並更新匯出：

```javascript
/**
 * 單人替換：場上選手回預備區（等待 +1、不計場次），
 * 從預備區完全隨機抽一人補入原位置（保持隊伍分組）
 *
 * @param {Array} courts - 場地陣列
 * @param {Array} readyPlayers - 預備區選手陣列
 * @param {number} courtIndex - 場地索引
 * @param {string} playerName - 被換下的選手名稱
 * @param {Array<string>} excludeNames - 不可被抽中補位的名單
 * @param {Function} rng - 亂數函式（預設 Math.random，測試時注入）
 * @returns {Object} { swappedOut, swappedIn } 或 { error }
 */
function swapPlayerOnCourtLogic(courts, readyPlayers, courtIndex, playerName, excludeNames, rng) {
  excludeNames = excludeNames || [];
  rng = rng || Math.random;

  const court = courts[courtIndex];
  if (!court) {
    return { error: '找不到場地 ' + (courtIndex + 1) };
  }

  const courtIdx = court.findIndex((p) => p.name === playerName);
  if (courtIdx === -1) {
    return { error: '場上找不到選手 ' + playerName };
  }

  const pool = readyPlayers.filter((p) => !excludeNames.includes(p.name));
  if (pool.length === 0) {
    return { error: '預備區沒有人可以補位' };
  }

  const replacement = pool[Math.floor(rng() * pool.length)];

  // 補上者：移出預備區、等待歸零、清除標記、放入原位置
  const readyIdx = readyPlayers.findIndex((p) => p.name === replacement.name);
  readyPlayers.splice(readyIdx, 1);
  replacement.waitingTurns = 0;
  replacement.justFinished = false;
  replacement.justJoinedReady = false;
  const swappedOut = court[courtIdx];
  court[courtIdx] = replacement;

  // 被換下者：這場沒上，等待 +1、清除標記、回預備區（不計場次）
  swappedOut.waitingTurns = (swappedOut.waitingTurns || 0) + 1;
  swappedOut.justFinished = false;
  swappedOut.justJoinedReady = false;
  readyPlayers.push(swappedOut);

  return { swappedOut: swappedOut, swappedIn: replacement };
}
```

匯出區塊改為：

```javascript
// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    changeCourtCountLogic,
    swapPlayerOnCourtLogic
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: 全部 PASS（5 + 7 個測試）

- [ ] **Step 5: Commit**

```bash
git add js/court-actions.js tests/court-actions.test.js
git commit -m "feat: 新增單人替換邏輯 swapPlayerOnCourtLogic"
```

---

### Task 3: `swapCourtCombinationLogic` — 整組隨機替換 2 人

**Files:**
- Modify: `js/court-actions.js`
- Modify: `tests/court-actions.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/court-actions.test.js` 檔尾加入：

```javascript
// ============================================================
// swapCourtCombinationLogic：整組隨機替換 2 人
// ============================================================
describe('swapCourtCombinationLogic：整組隨機替換 2 人', () => {

  function makeFullCourt() {
    return [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
  }

  test('恰好替換 2 人，補上 2 位不同的預備區選手', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E'), makePlayer('F'), makePlayer('G')];

    // rng 依序：抽第 1 目標(0→A)、抽第 2 目標(0→剩餘第一位 B)、補位抽樣、補位抽樣
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0, 0, 0, 0]));

    expect(result.error).toBeUndefined();
    expect(result.swaps.length).toBe(2);
    const onCourt = courts[0].map((p) => p.name);
    expect(onCourt.length).toBe(4);
    // 被換下的 2 人回到預備區
    expect(readyPlayers.length).toBe(3); // 3 - 2 補上 + 2 換下 = 3
    const swappedOutNames = result.swaps.map((s) => s.swappedOut.name);
    swappedOutNames.forEach((name) => {
      expect(onCourt.includes(name)).toBe(false);
      expect(readyPlayers.some((p) => p.name === name)).toBe(true);
    });
    // 補上的 2 人不同且都在場上
    const swappedInNames = result.swaps.map((s) => s.swappedIn.name);
    expect(new Set(swappedInNames).size).toBe(2);
    swappedInNames.forEach((name) => {
      expect(onCourt.includes(name)).toBe(true);
    });
  });

  test('被換下的人不會被抽回補位（預備區恰 2 人時，補位必為原本那 2 人）', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // rng 全取 0.99：若未排除被換下者，第二次補位會抽到剛換下的人
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0.99]));

    expect(result.error).toBeUndefined();
    const swappedInNames = result.swaps.map((s) => s.swappedIn.name).sort();
    expect(swappedInNames).toEqual(['E', 'F']);
  });

  test('被換下的 2 人各自等待輪次 +1', () => {
    const a = makePlayer('A', { waitingTurns: 1 });
    const b = makePlayer('B', { waitingTurns: 2 });
    const courts = [[a, b, makePlayer('C'), makePlayer('D')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];

    // 目標選取 rng=0,0 → A 與 B
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));

    expect(result.swaps[0].swappedOut.name).toBe('A');
    expect(result.swaps[1].swappedOut.name).toBe('B');
    expect(a.waitingTurns).toBe(2);
    expect(b.waitingTurns).toBe(3);
  });

  test('場地未滿 4 人：回傳錯誤', () => {
    const courts = [[makePlayer('A'), makePlayer('B')]];
    const readyPlayers = [makePlayer('E'), makePlayer('F')];
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));
    expect(result.error).toBeDefined();
  });

  test('預備區不足 2 人：回傳錯誤且狀態不變', () => {
    const courts = [makeFullCourt()];
    const readyPlayers = [makePlayer('E')];
    const result = swapCourtCombinationLogic(courts, readyPlayers, 0, makeRng([0]));
    expect(result.error).toBeDefined();
    expect(courts[0].map((p) => p.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(readyPlayers.length).toBe(1);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: 新增測試 FAIL，錯誤為 `swapCourtCombinationLogic is not a function`

- [ ] **Step 3: 實作 `swapCourtCombinationLogic`**

在 `js/court-actions.js` 的 `swapPlayerOnCourtLogic` 之後加入，並更新匯出：

```javascript
/**
 * 整組替換：從場上 4 人隨機抽 2 人，各自替換
 * 補位抽樣排除本次所有被換下者（換下後不會立刻被抽回）
 *
 * @param {Array} courts - 場地陣列
 * @param {Array} readyPlayers - 預備區選手陣列
 * @param {number} courtIndex - 場地索引
 * @param {Function} rng - 亂數函式（預設 Math.random，測試時注入）
 * @returns {Object} { swaps: [{ swappedOut, swappedIn }, ...] } 或 { error }
 */
function swapCourtCombinationLogic(courts, readyPlayers, courtIndex, rng) {
  rng = rng || Math.random;

  const court = courts[courtIndex];
  if (!court || court.length !== 4) {
    return { error: '場地必須有 4 位選手才能替換組合' };
  }
  if (readyPlayers.length < 2) {
    return { error: '預備區不足 2 人，無法替換組合' };
  }

  // 從場上 4 人隨機抽 2 個不同的人
  const firstIdx = Math.floor(rng() * 4);
  let secondIdx = Math.floor(rng() * 3);
  if (secondIdx >= firstIdx) secondIdx += 1;
  const targetNames = [court[firstIdx].name, court[secondIdx].name];

  // 補位抽樣排除兩位被換下者（第一位換下後已回預備區，必須排除）
  const excludeNames = targetNames.slice();
  const swaps = [];
  for (let i = 0; i < targetNames.length; i++) {
    const result = swapPlayerOnCourtLogic(
      courts, readyPlayers, courtIndex, targetNames[i], excludeNames, rng
    );
    if (result.error) {
      return result;
    }
    swaps.push(result);
  }

  return { swaps: swaps };
}
```

匯出區塊改為：

```javascript
// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    changeCourtCountLogic,
    swapPlayerOnCourtLogic,
    swapCourtCombinationLogic
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx jest tests/court-actions.test.js --verbose`
Expected: 全部 PASS（5 + 7 + 5 個測試）

- [ ] **Step 5: 跑完整測試套件確認沒弄壞其他測試**

Run: `npm test`
Expected: 所有測試檔 PASS

- [ ] **Step 6: Commit**

```bash
git add js/court-actions.js tests/court-actions.test.js
git commit -m "feat: 新增整組替換邏輯 swapCourtCombinationLogic"
```

---

### Task 4: 接線 — index.html 載入模組、場地數量 UI、script.js 包裝函式

**Files:**
- Modify: `index.html`（場地數量控制列 + script 標籤）
- Modify: `js/script.js`（三個包裝函式 + 數量顯示同步）
- Modify: `css/style.css`（控制列樣式）

- [ ] **Step 1: index.html 載入 court-actions.js**

在 `index.html` 第 200 行附近，`js/script.js` 的 script 標籤**之前**加入：

```html
    <script src="js/court-actions.js"></script>
    <script src="js/script.js"></script>
```

（原本只有 `<script src="js/script.js"></script>` 那行，在它上面插入 court-actions.js。）

- [ ] **Step 2: index.html 加入場地數量控制列**

在 `index.html` 第 75 行 `<div class="courts-container" id="courts">` **之前**加入：

```html
        <div class="court-count-control">
            <span class="court-count-label"><i class="fas fa-shuttlecock"></i> 場地數量</span>
            <button class="btn-adjust btn-adjust-minus" onclick="adjustCourtCount(-1)" title="減少場地">−</button>
            <span id="courtCountDisplay" class="court-count-value">3</span>
            <button class="btn-adjust btn-adjust-plus" onclick="adjustCourtCount(1)" title="增加場地">+</button>
        </div>
```

- [ ] **Step 3: css/style.css 加入控制列樣式**

在 `css/style.css` 檔尾（或 `.btn-adjust` 區塊附近，約 332 行後）加入：

```css
/* 場地數量控制列 */
.court-count-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0.75rem;
  font-weight: 600;
}

.court-count-value {
  min-width: 1.5em;
  text-align: center;
  font-weight: bold;
}
```

- [ ] **Step 4: script.js 加入 `adjustCourtCount` 包裝函式**

在 `js/script.js` 的 `manualEndMatch` 函式（約 2047 行）之前加入：

```javascript
// 手動調整場地數量（邏輯在 js/court-actions.js）
function adjustCourtCount(delta) {
  const result = changeCourtCountLogic(courts, delta);
  if (result.error) {
    alert(result.error);
    return;
  }

  console.log(`【場地數量】調整為 ${result.courtCount} 面`);
  updateLists();
  updateCourtsDisplay();
  updateNextMatchPrediction();
  saveGameState();
}
```

- [ ] **Step 5: script.js 同步數量顯示**

在 `updateCourtsDisplay`（約 681 行）的 `if (!updateTimesOnly) {` 內、`document.getElementById("courts").innerHTML = ...` 之前加入：

```javascript
    // 同步場地數量顯示（含從存檔恢復的情況）
    const countEl = document.getElementById("courtCountDisplay");
    if (countEl) countEl.textContent = courts.length;
```

- [ ] **Step 6: 瀏覽器快速驗證**

啟動靜態伺服器（`python -m http.server 8000`）開啟頁面，確認：
- 場地區上方顯示「場地數量 − 3 ＋」。
- 按 ＋ 變 4 面（多一面空場地）、連按到 6 後再按跳「最多 6 面場地」。
- 按 − 回到 3；按到 1 後再按跳「至少需要 1 面場地」。
- 排一場比賽到場地 3，按 − 跳「場地 3 還有選手，請先清空該場地」。
- 調成 4 面後重新整理 → 恢復狀態後仍顯示 4 面。

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/script.js
git commit -m "feat: 場地數量調整 UI（1-6 面，含存檔保留）"
```

---

### Task 5: 替換按鈕 UI — 單人「替換」與「替換組合」

**Files:**
- Modify: `js/script.js`（包裝函式 + updateCourtsDisplay 模板）
- Modify: `css/style.css`（場地標題按鈕群組樣式）

- [ ] **Step 1: script.js 加入兩個包裝函式**

在 `js/script.js` 的 `adjustCourtCount`（Task 4 加入）之後加入：

```javascript
// 手動替換場上單一選手（邏輯在 js/court-actions.js）
function swapPlayerOnCourt(courtIndex, playerName) {
  const result = swapPlayerOnCourtLogic(courts, readyPlayers, courtIndex, playerName, [playerName]);
  if (result.error) {
    alert(result.error);
    return;
  }

  console.log(
    `【替換】場地 ${courtIndex + 1}：${result.swappedOut.name} 回預備區（等待${result.swappedOut.waitingTurns}場），${result.swappedIn.name} 補上`
  );
  updateLists();
  updateCourtsDisplay();
  updateNextMatchPrediction();
  saveGameState();
}

// 手動替換組合：隨機換掉場上 2 人（邏輯在 js/court-actions.js）
function swapCourtCombination(courtIndex) {
  const result = swapCourtCombinationLogic(courts, readyPlayers, courtIndex);
  if (result.error) {
    alert(result.error);
    return;
  }

  const desc = result.swaps
    .map((s) => `${s.swappedOut.name} → ${s.swappedIn.name}`)
    .join("、");
  console.log(`【替換組合】場地 ${courtIndex + 1}：${desc}`);
  updateLists();
  updateCourtsDisplay();
  updateNextMatchPrediction();
  saveGameState();
}
```

- [ ] **Step 2: updateCourtsDisplay 加入單人「替換」按鈕**

`js/script.js` 約 710–738 行，`team1Html` 與 `team2Html` 兩個模板都要改。現況（兩段相同結構）：

```javascript
        <div class="player-item">
          <div class="player-info">
            <span class="player-name">${player.name}</span>
          </div>
          <button class="btn btn-neutral" onclick="restPlayerOnCourt(${i}, '${player.name}')" title="休息">
            休息
          </button>
        </div>
```

改為（在「休息」前加手動模式限定的「替換」）：

```javascript
        <div class="player-item">
          <div class="player-info">
            <span class="player-name">${player.name}</span>
          </div>
          <div class="court-player-actions">
            ${isManualMode ? `<button class="btn btn-secondary" onclick="swapPlayerOnCourt(${i}, '${player.name}')" title="替換：回預備區等待+1，隨機補位">替換</button>` : ""}
            <button class="btn btn-neutral" onclick="restPlayerOnCourt(${i}, '${player.name}')" title="休息">
              休息
            </button>
          </div>
        </div>
```

- [ ] **Step 3: updateCourtsDisplay 加入「替換組合」按鈕**

`js/script.js` 約 747–767 行的場地標題模板，現況：

```javascript
              <button class="btn btn-warning" onclick="${isManualMode ? `manualEndMatch(${i})` : `endMatch(${i})`}">
                <i class="fas fa-check-circle"></i> ${isManualMode ? '清空' : '下場'}
              </button>
```

改為（包進按鈕群組，手動模式多一顆「替換組合」）：

```javascript
              <div class="court-header-actions">
                ${isManualMode ? `<button class="btn btn-secondary" onclick="swapCourtCombination(${i})" title="隨機換掉 2 人，從預備區隨機補位"><i class="fas fa-random"></i> 替換組合</button>` : ""}
                <button class="btn btn-warning" onclick="${isManualMode ? `manualEndMatch(${i})` : `endMatch(${i})`}">
                  <i class="fas fa-check-circle"></i> ${isManualMode ? '清空' : '下場'}
                </button>
              </div>
```

- [ ] **Step 4: css/style.css 加入按鈕群組樣式**

在 Task 3 加入的 `.court-count-control` 區塊之後加入：

```css
/* 場地標題按鈕群組與場上選手操作按鈕 */
.court-header-actions {
  display: flex;
  gap: 6px;
}

.court-player-actions {
  display: flex;
  gap: 4px;
}
```

- [ ] **Step 5: 瀏覽器驗證（spec 測試清單第 2–5 項）**

開啟頁面，加入 6+ 名選手進預備區，勾選手動排場：
- 排 4 人上場後，場地標題出現「替換組合」、每位選手旁出現「替換」；取消手動模式則兩者都消失。
- 按「替換組合」：恰 2 人回預備區、顯示「等待 X 場」（原值 +1，不顯示「剛下場／剛加入」）、隨機 2 人補上、隊伍位置不亂、計時器不重置。
- 按單人「替換」：該人回預備區等待 +1，隨機 1 人補上且不是他自己。
- 預備區清到 0 人按「替換」→ alert「預備區沒有人可以補位」；1 人時按「替換組合」→ alert「預備區不足 2 人，無法替換組合」。
- 換下帶「剛下場」標記的人 → 預備區顯示「等待 1 場」。
- 替換後重新整理 → 恢復狀態正確。

- [ ] **Step 6: 跑完整測試套件**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add js/script.js css/style.css
git commit -m "feat: 手動模式新增單人替換與替換組合按鈕"
```

---

### Task 6: 收尾 — 文件更新

**Files:**
- Modify: `CLAUDE.md`（專案結構與功能說明補上 court-actions.js）

- [ ] **Step 1: 更新 CLAUDE.md**

- 「專案結構」的 `js/` 下補一行：`│   ├── court-actions.js     # 場地數量調整與選手替換邏輯（純函式，jest 測試）`
- 「核心功能與實作」加一小節（放在「手動比賽模式」之後）：

```markdown
### 6. 場地數量與選手替換
- 場地數量可手動調整 1-6 面（場地區上方 − / ＋ 控制）
- 手動模式下可「替換」單一場上選手或「替換組合」隨機換 2 人
- 被換下者回預備區且等待輪次 +1（不計場次），補位從預備區完全隨機抽出
- 邏輯位於 `js/court-actions.js`，測試位於 `tests/court-actions.test.js`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 補充場地數量與選手替換功能說明"
```
