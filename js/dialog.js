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

// CommonJS export for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { showToast, showAlertDialog };
}
