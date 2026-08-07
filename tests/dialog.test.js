/**
 * @jest-environment jsdom
 */
const {
  showToast,
  showAlertDialog,
  showConfirmDialog,
  openDialog,
} = require("../js/dialog");

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

describe("openDialog 自訂圖示與連結按鈕", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const close = () => document.querySelector("#appDialog .modal-footer .btn").click();

  test("iconClass 可覆寫類型預設圖示", async () => {
    const p = openDialog({
      title: "第三屆翰林匹克羽球運動會",
      message: "還有 13 天",
      type: "info",
      iconClass: "fa-trophy dialog-icon-info",
      buttons: [{ text: "關閉", value: undefined, className: "btn-secondary" }],
    });
    const icon = document.querySelector("#appDialog .modal-header i");
    expect(icon.classList.contains("fa-trophy")).toBe(true);
    expect(icon.classList.contains("fa-circle-info")).toBe(false);
    close();
    await p;
  });

  test("未給 iconClass 時仍用類型預設圖示", async () => {
    const p = openDialog({
      title: "提示",
      message: "訊息",
      type: "info",
      buttons: [{ text: "關閉", value: undefined, className: "btn-secondary" }],
    });
    expect(
      document.querySelector("#appDialog .modal-header i").classList.contains("fa-circle-info")
    ).toBe(true);
    close();
    await p;
  });

  // 為什麼要有連結型按鈕：用 window.open() 得在 resolve 之後才呼叫，
  // iOS Safari 可能當成非使用者觸發而擋掉。原生連結沒有這個問題。
  test("按鈕帶 href 時渲染成開新分頁的連結", async () => {
    const p = openDialog({
      title: "賽事",
      message: "訊息",
      type: "info",
      buttons: [
        { text: "關閉", value: false, className: "btn-secondary" },
        { text: "前往賽程", value: true, href: "tournament.html?t=abc", className: "btn-primary" },
      ],
    });
    const link = document.querySelector("#appDialog .modal-footer a.btn");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("tournament.html?t=abc");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toBe("前往賽程");
    close();
    await p;
  });

  test("點連結按鈕會關閉彈窗並 resolve 其 value", async () => {
    const p = openDialog({
      title: "賽事",
      message: "訊息",
      type: "info",
      dismissValue: false,
      buttons: [
        { text: "關閉", value: false, className: "btn-secondary" },
        { text: "前往賽程", value: true, href: "tournament.html?t=abc", className: "btn-primary" },
      ],
    });
    const link = document.querySelector("#appDialog .modal-footer a.btn");
    // jsdom 不實作導航，攔下預設行為只驗我們自己的關閉邏輯
    link.addEventListener("click", (e) => e.preventDefault());
    link.click();
    await expect(p).resolves.toBe(true);
    expect(document.getElementById("appDialog")).toBeNull();
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
