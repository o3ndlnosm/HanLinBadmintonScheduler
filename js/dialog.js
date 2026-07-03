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
