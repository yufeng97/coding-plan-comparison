/* 独立加载提示：主数据或后续脚本失败时，这个模块仍能向用户解释并提供恢复入口。 */
"use strict";
(function () {
  const report = (message) => {
    const box = document.getElementById("loadFailure");
    const text = document.getElementById("loadFailureText");
    if (text) text.textContent = message;
    if (box) box.hidden = false;
  };
  window["reportLoadFailure"] = report;
  const reload = document.getElementById("reloadPageBtn");
  if (reload) reload.addEventListener("click", () => location.reload());
  window.addEventListener("error", (event) => {
    const script = /** @type {HTMLScriptElement | null} */ (event.target);
    if (script && script.tagName === "SCRIPT" && /\/js\//.test(script.src || "")) {
      report("页面数据或功能未能加载。请检查连接后重新加载；当前显示的日期和内容可能不完整。");
    }
  }, true);
  window.addEventListener("DOMContentLoaded", () => {
    if (!window["codingPlanReady"]) report("页面初始化未完成。请重新加载；如果问题持续，可以稍后重试。");
  });
})();
