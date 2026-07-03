# 自訂彈窗與通知系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以自訂 toast 通知與置中彈窗取代 `js/script.js` 全部 34 處原生 `alert()`／`confirm()`。

**Architecture:** 新增 `js/dialog.js`（頂層函式＋CommonJS export 防護，與 `court-actions.js` 同慣例）提供 `showToast`／`showAlertDialog`／`showConfirmDialog` 三個全域函式；彈窗重用既有 `.modal` CSS 家族，toast 新增頂部置中堆疊樣式。34 處呼叫點依 spec 分類逐一替換：2 處 confirm → 確認彈窗（async/await）、16 處 alert → 通知彈窗、16 處 alert → toast。

**Tech Stack:** 原生 JavaScript（無建置流程）、jest 30 + jest-environment-jsdom（僅 dialog 測試用 jsdom，其餘測試維持 node 環境）。

**Spec:** `docs/superpowers/specs/2026-07-03-custom-dialog-design.md`

**注意：** 下文提及的 `script.js` 行號皆為改動前的參考位置；實際編輯一律以「唯一字串比對」定位，不依賴行號。

---

## File Structure

- Create: `js/dialog.js` — toast＋彈窗模組（唯一職責：訊息呈現 UI）
- Create: `tests/dialog.test.js` — jsdom 環境的 dialog 模組測試
- Modify: `css/style.css` — 檔尾新增 toast 與彈窗補充樣式
- Modify: `index.html` — 加入 dialog.js script 標籤
- Modify: `sw.js` — 預快取清單＋cache 版本
- Modify: `js/script.js` — 34 處呼叫點替換
- Modify: `CLAUDE.md` — 專案結構補充
- Modify: `package.json` / `package-lock.json` — devDependency

---

### Task 1: 安裝 jsdom 測試環境

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安裝 jest-environment-jsdom**

Run: `npm install --save-dev jest-environment-jsdom`

- [ ] **Step 2: 確認既有測試不受影響**

Run: `npx jest`
Expected: 既有測試全數 PASS（目前 10 個測試檔）

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 安裝 jest-environment-jsdom（dialog 模組測試用）"
```

---

### Task 2: showToast（TDD）

**Files:**
- Create: `tests/dialog.test.js`
- Create: `js/dialog.js`

- [ ] **Step 1: 撰寫失敗測試**

建立 `tests/dialog.test.js`：

```js
/**
 * @jest-environment jsdom
 */
const { showToast, showAlertDialog, showConfirmDialog } = require("../js/dialog");

describe("showToast", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("依類型加上對應樣式並顯示訊息", () => {
    showToast("已成功導入 12 位選手", "success");
    const toast = document.querySelector(".app-toast");
    expect(toast).not.toBeNull();
    expect(toast.classList.contains("app-toast-success")).toBe(true);
    expect(toast.textContent).toContain("已成功導入 12 位選手");
  });

  test("success 3 秒後自動移除", () => {
    showToast("完成", "success");
    expect(document.querySelectorAll(".app-toast").length).toBe(1);
    jest.advanceTimersByTime(3000 + 300);
    expect(document.querySelectorAll(".app-toast").length).toBe(0);
  });

  test("warning 預設顯示較久（4 秒）", () => {
    showToast("警告", "warning");
    jest.advanceTimersByTime(3300);
    expect(document.querySelectorAll(".app-toast").length).toBe(1);
    jest.advanceTimersByTime(1000);
    expect(document.querySelectorAll(".app-toast").length).toBe(0);
  });

  test("多則同時堆疊在同一容器", () => {
    showToast("一", "success");
    showToast("二", "warning");
    expect(document.querySelectorAll("#toastStack .app-toast").length).toBe(2);
  });

  test("點擊可提前關閉", () => {
    showToast("點我關閉", "info");
    document.querySelector(".app-toast").click();
    jest.advanceTimersByTime(300);
    expect(document.querySelectorAll(".app-toast").length).toBe(0);
  });

  test("訊息含 HTML 時以純文字呈現（防注入）", () => {
    showToast('<img src=x onerror="window.hacked=1">', "info");
    expect(document.querySelector(".app-toast img")).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx jest tests/dialog.test.js`
Expected: FAIL — `Cannot find module '../js/dialog'`

- [ ] **Step 3: 實作 showToast**

建立 `js/dialog.js`：

```js
/**
 * 自訂彈窗與通知模組：取代原生 alert()/confirm()
 * - showToast(message, type, duration)：頂部置中通知，自動消失，不阻塞
 * - showAlertDialog(message, options)：置中彈窗，單一「確定」，回傳 Promise<void>
 * - showConfirmDialog(message, options)：置中彈窗，取消/確認，回傳 Promise<boolean>
 * 訊息一律以 textContent 寫入（選手名含引號或 HTML 也不會被解析）
 */

const TOAST_ICONS = {
  success: "fa-circle-check",
  warning: "fa-triangle-exclamation",
  error: "fa-circle-xmark",
  info: "fa-circle-info",
};

function getToastStack() {
  let stack = document.getElementById("toastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toastStack";
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, type = "success", duration = null) {
  if (duration == null) {
    duration = type === "success" || type === "info" ? 3000 : 4000;
  }

  const toast = document.createElement("div");
  toast.className = "app-toast app-toast-" + type;

  const icon = document.createElement("i");
  icon.className = "fas " + (TOAST_ICONS[type] || TOAST_ICONS.info);
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(text);

  const remove = () => {
    if (!toast.parentNode) return;
    toast.classList.add("app-toast-hide");
    setTimeout(() => toast.remove(), 300);
  };
  toast.addEventListener("click", remove);
  getToastStack().appendChild(toast);
  setTimeout(remove, duration);
  return toast;
}

// CommonJS export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { showToast };
}
```

（`showAlertDialog`／`showConfirmDialog` 於 Task 3、4 加入；本步驟測試檔頂部的解構會取得 `undefined`，不影響 showToast 測試。）

- [ ] **Step 4: 執行確認通過**

Run: `npx jest tests/dialog.test.js`
Expected: showToast 6 個測試 PASS

- [ ] **Step 5: Commit**

```bash
git add js/dialog.js tests/dialog.test.js
git commit -m "feat: showToast 頂部通知（自動消失、堆疊、防注入）"
```

---

### Task 3: showAlertDialog（TDD）

**Files:**
- Modify: `tests/dialog.test.js`
- Modify: `js/dialog.js`

- [ ] **Step 1: 撰寫失敗測試**

在 `tests/dialog.test.js` 檔尾加入：

```js
describe("showAlertDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("顯示標題、訊息與確定鈕，按下後 resolve 並關閉", async () => {
    const p = showAlertDialog("無法載入資料", { type: "error", title: "發生錯誤" });
    const dialog = document.getElementById("appDialog");
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("發生錯誤");
    expect(dialog.textContent).toContain("無法載入資料");
    const buttons = dialog.querySelectorAll(".modal-footer .btn");
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe("確定");
    buttons[0].click();
    await p;
    expect(document.getElementById("appDialog")).toBeNull();
  });

  test("未指定標題時依類型給預設標題", () => {
    showAlertDialog("訊息", { type: "error" });
    expect(document.getElementById("appDialog").textContent).toContain("發生錯誤");
    document.querySelector("#appDialog .modal-footer .btn").click();
  });

  test("訊息含 HTML 時以純文字呈現（防注入）", () => {
    showAlertDialog('<img src=x onerror="window.hacked=1">');
    expect(document.querySelector("#appDialog img")).toBeNull();
    document.querySelector("#appDialog .modal-footer .btn").click();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx jest tests/dialog.test.js`
Expected: FAIL — `showAlertDialog is not a function`

- [ ] **Step 3: 實作彈窗核心與 showAlertDialog**

在 `js/dialog.js` 的 `showToast` 之後、CommonJS export 之前加入：

```js
const DIALOG_ICONS = {
  success: "fa-circle-check dialog-icon-success",
  warning: "fa-triangle-exclamation dialog-icon-warning",
  error: "fa-circle-xmark dialog-icon-error",
  info: "fa-circle-info dialog-icon-info",
};

const DEFAULT_ALERT_TITLES = {
  success: "完成",
  warning: "注意",
  error: "發生錯誤",
  info: "提示",
};

let dialogOpen = false;
const dialogQueue = [];

// config: { title, message, type, dismissValue, buttons: [{ text, value, className, primary }] }
function openDialog(config) {
  return new Promise((resolve) => {
    dialogQueue.push({ config, resolve });
    processDialogQueue();
  });
}

function processDialogQueue() {
  if (dialogOpen || dialogQueue.length === 0) return;
  dialogOpen = true;
  const { config, resolve } = dialogQueue.shift();

  const overlay = document.createElement("div");
  overlay.className = "modal app-dialog";
  overlay.id = "appDialog";

  const content = document.createElement("div");
  content.className = "modal-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  const heading = document.createElement("h3");
  const icon = document.createElement("i");
  icon.className = "fas " + (DIALOG_ICONS[config.type] || DIALOG_ICONS.info);
  heading.appendChild(icon);
  heading.appendChild(document.createTextNode(" " + config.title));
  header.appendChild(heading);

  const body = document.createElement("div");
  body.className = "modal-body app-dialog-message";
  body.textContent = config.message;

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const onKeydown = (event) => {
    if (event.key === "Escape") close(config.dismissValue);
  };

  const close = (value) => {
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    dialogOpen = false;
    resolve(value);
    processDialogQueue();
  };

  config.buttons.forEach((btn) => {
    const el = document.createElement("button");
    el.className = "btn " + btn.className;
    el.textContent = btn.text;
    el.addEventListener("click", () => close(btn.value));
    footer.appendChild(el);
    if (btn.primary) setTimeout(() => el.focus(), 0);
  });

  document.addEventListener("keydown", onKeydown);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close(config.dismissValue);
  });

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

function showAlertDialog(message, options = {}) {
  const type = options.type || "info";
  return openDialog({
    title: options.title || DEFAULT_ALERT_TITLES[type],
    message: message,
    type: type,
    dismissValue: undefined,
    buttons: [
      { text: "確定", value: undefined, className: "btn-primary", primary: true },
    ],
  });
}
```

並將檔尾 export 改為：

```js
// CommonJS export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { showToast, showAlertDialog };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npx jest tests/dialog.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add js/dialog.js tests/dialog.test.js
git commit -m "feat: showAlertDialog 通知彈窗（三段式、類型圖示、佇列核心）"
```

---

### Task 4: showConfirmDialog 與佇列（TDD）

**Files:**
- Modify: `tests/dialog.test.js`
- Modify: `js/dialog.js`

- [ ] **Step 1: 撰寫失敗測試**

在 `tests/dialog.test.js` 檔尾加入：

```js
describe("showConfirmDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("按確認 resolve true", async () => {
    const p = showConfirmDialog("確認 場地1 下場？");
    const buttons = document.querySelectorAll("#appDialog .modal-footer .btn");
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe("取消");
    expect(buttons[1].textContent).toBe("確認");
    buttons[1].click();
    await expect(p).resolves.toBe(true);
    expect(document.getElementById("appDialog")).toBeNull();
  });

  test("按取消 resolve false", async () => {
    const p = showConfirmDialog("確認？");
    document.querySelectorAll("#appDialog .modal-footer .btn")[0].click();
    await expect(p).resolves.toBe(false);
  });

  test("ESC 等同取消", async () => {
    const p = showConfirmDialog("確認？");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect(p).resolves.toBe(false);
  });

  test("點遮罩等同取消", async () => {
    const p = showConfirmDialog("確認？");
    document.getElementById("appDialog").click();
    await expect(p).resolves.toBe(false);
  });

  test("可自訂按鈕文字，danger 時確認鈕為紅色", async () => {
    const p = showConfirmDialog("確認清空場地1？", {
      title: "清空場地",
      confirmText: "確認清空",
      danger: true,
    });
    const buttons = document.querySelectorAll("#appDialog .modal-footer .btn");
    expect(buttons[1].textContent).toBe("確認清空");
    expect(buttons[1].classList.contains("btn-danger")).toBe(true);
    buttons[0].click();
    await p;
  });
});

describe("彈窗佇列", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("同時只顯示一個，關閉後自動顯示下一個", async () => {
    const p1 = showAlertDialog("第一個");
    const p2 = showAlertDialog("第二個");
    expect(document.querySelectorAll(".app-dialog").length).toBe(1);
    expect(document.getElementById("appDialog").textContent).toContain("第一個");

    document.querySelector("#appDialog .modal-footer .btn").click();
    await p1;
    expect(document.getElementById("appDialog").textContent).toContain("第二個");

    document.querySelector("#appDialog .modal-footer .btn").click();
    await p2;
    expect(document.getElementById("appDialog")).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx jest tests/dialog.test.js`
Expected: FAIL — `showConfirmDialog is not a function`

- [ ] **Step 3: 實作 showConfirmDialog**

在 `js/dialog.js` 的 `showAlertDialog` 之後加入：

```js
function showConfirmDialog(message, options = {}) {
  return openDialog({
    title: options.title || "確認",
    message: message,
    type: "warning",
    dismissValue: false,
    buttons: [
      {
        text: options.cancelText || "取消",
        value: false,
        className: "btn-secondary",
      },
      {
        text: options.confirmText || "確認",
        value: true,
        className: options.danger ? "btn-danger" : "btn-primary",
        primary: true,
      },
    ],
  });
}
```

並將檔尾 export 改為：

```js
// CommonJS export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { showToast, showAlertDialog, showConfirmDialog };
}
```

- [ ] **Step 4: 執行確認全部通過（含既有測試）**

Run: `npx jest`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add js/dialog.js tests/dialog.test.js
git commit -m "feat: showConfirmDialog 確認彈窗（ESC/遮罩=取消、danger 紅鈕、佇列）"
```

---

### Task 5: CSS 樣式

**Files:**
- Modify: `css/style.css`（檔尾附加）

- [ ] **Step 1: 檔尾加入樣式**

```css
/* ===== 自訂通知（toast）與彈窗（js/dialog.js） ===== */
.toast-stack {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.app-toast {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: white;
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  border-left: 4px solid var(--secondary);
  padding: 0.7rem 1.1rem;
  max-width: min(90vw, 420px);
  font-size: 0.95rem;
  color: var(--text-dark);
  pointer-events: auto;
  cursor: pointer;
  animation: appToastIn 0.25s ease-out;
}

.app-toast i {
  font-size: 1rem;
}

.app-toast-success { border-left-color: var(--secondary); }
.app-toast-success i { color: var(--secondary); }
.app-toast-warning { border-left-color: var(--warning); }
.app-toast-warning i { color: var(--warning); }
.app-toast-error { border-left-color: var(--danger); }
.app-toast-error i { color: var(--danger); }
.app-toast-info { border-left-color: var(--info); }
.app-toast-info i { color: var(--info); }

.app-toast-hide {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.3s, transform 0.3s;
}

@keyframes appToastIn {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 彈窗補充（重用 .modal 家族） */
.app-dialog .modal-content {
  max-width: 420px;
}

.app-dialog-message {
  white-space: pre-line;
}

.dialog-icon-success { color: var(--secondary); }
.dialog-icon-warning { color: var(--warning); }
.dialog-icon-error { color: var(--danger); }
.dialog-icon-info { color: var(--info); }
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "style: toast 堆疊與自訂彈窗樣式（沿用既有 CSS 變數與 modal 家族）"
```

---

### Task 6: index.html 與 sw.js 接線

**Files:**
- Modify: `index.html`
- Modify: `sw.js`

- [ ] **Step 1: index.html 加入 script 標籤**

找到：

```html
    <script src="js/court-actions.js"></script>
    <script src="js/script.js"></script>
```

改為：

```html
    <script src="js/court-actions.js"></script>
    <script src="js/dialog.js"></script>
    <script src="js/script.js"></script>
```

- [ ] **Step 2: sw.js 預快取與版本**

`const CACHE_NAME = 'hanlin-badminton-v1';` 改為 `const CACHE_NAME = 'hanlin-badminton-v2';`

`PRECACHE_URLS` 陣列中 `'js/court-actions.js',` 之後加入一行 `'js/dialog.js',`。

- [ ] **Step 3: 本機煙霧測試**

Run: `python3 -m http.server 8000 --directory /Users/kenzy/HanLinBadmintonScheduler`（背景執行）
瀏覽器開 `http://localhost:8000`，在 console 執行：
`showToast("測試", "success"); showConfirmDialog("測試確認？")`
Expected: 頂部出現綠邊條 toast；置中出現取消/確認彈窗，樣式與現有 modal 一致。驗完停掉 server。

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js
git commit -m "chore: 接線 dialog.js（script 載入順序、SW 預快取、cache 升版 v2）"
```

---

### Task 7: 轉換 2 處 confirm

**Files:**
- Modify: `js/script.js`（原 1603、2114 行附近）

- [ ] **Step 1: endMatch（已是 async）**

找到：

```js
async function endMatch(courtIndex) {
  if (!confirm("確認 場地" + (courtIndex + 1) + " 下場？")) {
    return;
  }
```

改為：

```js
async function endMatch(courtIndex) {
  const ok = await showConfirmDialog(
    "確認 場地" + (courtIndex + 1) + " 下場？",
    { title: "場地下場", confirmText: "確認下場" }
  );
  if (!ok) {
    return;
  }
```

- [ ] **Step 2: manualEndMatch（改為 async）**

找到：

```js
function manualEndMatch(courtIndex) {
  if (!confirm("確認清空場地" + (courtIndex + 1) + "？")) {
    return;
  }
```

改為：

```js
async function manualEndMatch(courtIndex) {
  const ok = await showConfirmDialog(
    "確認清空場地" + (courtIndex + 1) + "？",
    { title: "清空場地", confirmText: "確認清空", danger: true }
  );
  if (!ok) {
    return;
  }
```

（`manualEndMatch` 僅由產生的 onclick 屬性呼叫、無人取用回傳值，改 async 安全。）

- [ ] **Step 3: 驗證已無 confirm 且測試通過**

Run: `grep -n "confirm(" js/script.js | grep -v showConfirmDialog`
Expected: 無輸出
Run: `npx jest`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add js/script.js
git commit -m "feat: 下場/清空場地確認改用自訂確認彈窗"
```

---

### Task 8: 轉換 16 處 alert → showAlertDialog

**Files:**
- Modify: `js/script.js`

- [ ] **Step 1: 逐一替換（依下表，以唯一字串定位）**

| 原（1 行） | 新 |
|---|---|
| `alert("您的瀏覽器不支援語音合成功能");` | `showAlertDialog("您的瀏覽器不支援語音合成功能", { type: "error", title: "語音功能" });` |
| `alert("找不到可用的語音，請確認您的裝置支援語音合成。");` | `showAlertDialog("找不到可用的語音，請確認您的裝置支援語音合成。", { type: "error", title: "語音功能" });` |
| `alert("語音播放發生錯誤：" + event.error);` | `showAlertDialog("語音播放發生錯誤：" + event.error, { type: "error", title: "語音功能" });` |
| `alert("嘗試播放語音時出現異常: " + error.message);` | `showAlertDialog("嘗試播放語音時出現異常: " + error.message, { type: "error", title: "語音功能" });` |
| `alert("未找到任何標記為出席的選手");` | `showAlertDialog("未找到任何標記為出席的選手", { type: "warning", title: "Google Sheets 匯入" });` |
| `` alert(`無法從 Google Sheets 載入資料: ${error.message}`); `` | `` showAlertDialog(`無法從 Google Sheets 載入資料: ${error.message}`, { type: "error", title: "Google Sheets 匯入" }); `` |
| `` alert(`已複製 ${allRecords.length} 筆比賽紀錄到剪貼簿！\n\n請到 Google Sheets 貼上數據：\n1. 開啟您的 Google Sheets\n2. 選擇「比賽紀錄」工作表\n3. 點擊 A1 儲存格\n4. 按 Ctrl+V (或 Cmd+V) 貼上`); ``（原 2302 行，無「提示」尾句的那處） | `` showAlertDialog(`已複製 ${allRecords.length} 筆比賽紀錄到剪貼簿！\n\n請到 Google Sheets 貼上數據：\n1. 開啟您的 Google Sheets\n2. 選擇「比賽紀錄」工作表\n3. 點擊 A1 儲存格\n4. 按 Ctrl+V (或 Cmd+V) 貼上`, { type: "info", title: "已複製到剪貼簿" }); `` |
| 同上但結尾多 `\n\n提示：您也可以登入 Google 帳號以啟用直接寫入功能。`（原 2631 行） | 同左改為 `showAlertDialog(...同原文案..., { type: "info", title: "已複製到剪貼簿" });`（保留原完整文案） |
| `alert('自動複製失敗，請手動複製控制台中的 CSV 數據。');`（共 2 處，原 2305、2634 行，逐處替換） | `showAlertDialog("自動複製失敗，請手動複製控制台中的 CSV 數據。", { type: "error", title: "同步失敗" });` |
| `alert('同步過程中發生錯誤，請查看控制台了解詳情。');`（共 2 處，原 2316、2643 行，逐處替換） | `showAlertDialog("同步過程中發生錯誤，請查看控制台了解詳情。", { type: "error", title: "同步失敗" });` |
| `alert('登入失敗，請重試。');` | `showAlertDialog("登入失敗，請重試。", { type: "error", title: "Google 登入" });` |
| `alert('登入功能初始化失敗，請重新整理頁面後再試。');` | `showAlertDialog("登入功能初始化失敗，請重新整理頁面後再試。", { type: "error", title: "Google 登入" });` |
| `alert('請先登入 Google 帳號以啟用寫入功能');` | `showAlertDialog("請先登入 Google 帳號以啟用寫入功能", { type: "info", title: "尚未登入" });` |
| `alert('寫入失敗：' + (error.result?.error?.message \|\| error.message));` | `showAlertDialog("寫入失敗：" + (error.result?.error?.message \|\| error.message), { type: "error", title: "同步失敗" });` |

- [ ] **Step 2: 驗證與 Commit**

Run: `npx jest`
Expected: 全部 PASS

```bash
git add js/script.js
git commit -m "feat: 外部錯誤與長訊息類 alert 改用自訂通知彈窗（16 處）"
```

---

### Task 9: 轉換 16 處 alert → showToast

**Files:**
- Modify: `js/script.js`

- [ ] **Step 1: 逐一替換（依下表）**

| 原（1 行） | 新 |
|---|---|
| `alert("請貼上選手資料！");` | `showToast("請貼上選手資料！", "warning");` |
| `alert('即將單次放寬組合標準以利進行組隊');` | `showToast("即將單次放寬組合標準以利進行組隊", "info");` |
| `alert("預備區至少需要4人才可開始排場！");` | `showToast("預備區至少需要4人才可開始排場！", "warning");` |
| `` alert(`已成功導入 ${newPlayers.length} 位出席選手`); `` | `` showToast(`已成功導入 ${newPlayers.length} 位出席選手`, "success"); `` |
| `alert(result.error);`（共 3 處，原 2067、2082、2099 行，逐處替換） | `showToast(result.error, "warning");` |
| `alert("所有場地都已滿，無法上場");` | `showToast("所有場地都已滿，無法上場", "warning");` |
| `alert("找不到選手");` | `showToast("找不到選手", "warning");` |
| `alert('目前沒有比賽紀錄可以同步');`（共 2 處，原 2242、2566 行，逐處替換） | `showToast("目前沒有比賽紀錄可以同步", "warning");` |
| `` alert(`登入成功！歡迎 ${userInfo.email}\n\n比賽紀錄將自動同步到 Google Sheets。`); `` | `` showToast(`登入成功！歡迎 ${userInfo.email}`, "success"); ``（toast 精簡為單行） |
| `alert('登入成功！比賽紀錄將自動同步到 Google Sheets。');`（共 2 處，原 2432、2439 行，逐處替換） | `showToast("登入成功！比賽紀錄將自動同步到 Google Sheets。", "success");` |
| `alert('已登出 Google 帳號');` | `showToast("已登出 Google 帳號", "info");` |
| `alert('恢復狀態失敗，將重新開始');` | `showToast("恢復狀態失敗，將重新開始", "warning");` |

備註：原 1099 行的放寬標準訊息由「阻塞式 alert」變為不阻塞 toast，排場流程將直接繼續——此為 spec 明訂的刻意行為改變。

- [ ] **Step 2: 驗證已無原生 alert/confirm**

Run: `grep -nE "\balert\(|\bconfirm\(" js/script.js js/court-actions.js js/player-state.js js/pairing-logic.js js/dialog.js`
Expected: 無輸出

Run: `npx jest`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add js/script.js
git commit -m "feat: 即時回饋類 alert 改用 toast 通知（16 處），原生對話框全數移除"
```

---

### Task 10: 文件更新與端到端驗證

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md 專案結構補充**

`js/` 區塊 `court-actions.js` 之後加一行：

```
│   ├── dialog.js           # 自訂彈窗與 toast 通知（取代原生 alert/confirm，jest+jsdom 測試）
```

`tests/` 區塊加一行：

```
│   ├── dialog.test.js              # 彈窗與通知測試
```

- [ ] **Step 2: 端到端手動驗證（本機 server + 瀏覽器）**

Run: `python3 -m http.server 8000 --directory /Users/kenzy/HanLinBadmintonScheduler`（背景）

逐項操作驗證：
1. 批量輸入留空按「批量新增選手」→ 黃色 toast「請貼上選手資料！」
2. 批量新增 3 人後按「開始排場」→ 黃色 toast「預備區至少需要4人…」
3. 新增至 8 人排場，按場地「下場」→ 置中確認彈窗，取消不動作、確認正常下場
4. 手動排場模式清空場地 → 紅色確認鈕彈窗
5. 未登入按「同步到 Sheets」→（無紀錄時）黃色 toast；有紀錄時出現「已複製到剪貼簿」多行教學彈窗，`\n` 正常換行
6. 確認右上角「下輪預告」toast 不受影響

Expected: 全部符合、console 無錯誤。驗完停掉 server。

- [ ] **Step 3: 全測試最終確認與 Commit**

Run: `npx jest`
Expected: 全部 PASS

```bash
git add CLAUDE.md
git commit -m "docs: 專案結構補充 dialog.js 與測試"
```

---

## Self-Review 紀錄

- **Spec coverage**：混合式分類（Task 8/9 對照表）、三段式彈窗與佇列（Task 3/4）、toast 位置與樣式（Task 5）、SW 快取（Task 6）、confirm async 化（Task 7）、防注入（Task 2/3 測試）、文件（Task 10）——spec 各節皆有對應任務。34 處清點：2＋16＋16 ✓
- **Placeholder scan**：無 TBD/TODO；所有程式碼步驟皆含完整程式碼 ✓
- **Type consistency**：`showToast(message, type, duration)`、`showAlertDialog(message, {title, type})`、`showConfirmDialog(message, {title, confirmText, cancelText, danger})` 在 Task 2–4 定義與 Task 7–9 呼叫一致；CSS class 名稱（`.app-toast-*`、`.dialog-icon-*`、`.app-dialog-message`）在 Task 2–5 一致 ✓
