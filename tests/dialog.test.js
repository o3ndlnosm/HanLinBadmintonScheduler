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
