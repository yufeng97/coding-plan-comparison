/* Keep load recovery available even when the Vue entry cannot execute. */
(() => {
  const report = (message: string) => {
    const box = document.getElementById('loadFailure');
    const text = document.getElementById('loadFailureText');
    if (text) text.textContent = message;
    if (box) box.hidden = false;
  };
  window.reportLoadFailure = report;
  document.getElementById('reloadPageBtn')?.addEventListener('click', () => location.reload());
  window.addEventListener('error', (event) => {
    const script = event.target as HTMLScriptElement | null;
    if (script?.tagName === 'SCRIPT' && !script.dataset.optionalData && /\/js\//.test(script.src || '')) {
      report('页面数据或功能未能加载。请检查连接后重新加载；当前显示的日期和内容可能不完整。');
    }
  }, true);
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.codingPlanReady) report('页面初始化未完成。请重新加载；如果问题持续，可以稍后重试。');
  });
})();
