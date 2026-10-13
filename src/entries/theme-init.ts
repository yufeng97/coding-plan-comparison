/* Apply the saved theme before styles load. Built as an independent CSP-safe classic script. */
try {
  const mode = localStorage.getItem('cp-theme') || 'system';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = mode === 'system' ? (dark ? 'dark' : 'light') : mode;
} catch { /* Storage can be unavailable in private or restricted contexts. */ }

/** 会改变首屏内容的地址参数：与 src/browser/url-state.ts 的 URL_KEYS 加关注同步 follow 一致（测试校验两边相同）。
 *  入口单独构建、不依赖应用模块，所以这里保留一份名单。微信等渠道追加的 from、utm_* 之类参数不在其中。 */
export const PAGE_STATE_PARAMS = [
  'budget', 'region', 'tool', 'task', 'billing', 'priority', 'papply', 'tapply', 'mapply', 'rapply',
  'pcat', 'pregion', 'pbilling', 'pq', 'plimit', 'rank', 'rscope', 'rvendor',
  'q', 'tcat', 'tregion', 'tvendor', 'tsort', 'tall', 'mmodel', 'mver', 'mtier', 'moffer', 'msort',
  'cmp', 'cmodel', 'crequests', 'ctokens', 'cdays', 'cinput', 'ccache', 'ccacheprice', 'cbudget', 'cscenario', 'follow',
] as const;

const root = document.documentElement;
/* 脚本接管前，预渲染的按钮与输入还不能响应：先挡住无效点击（startup 结束时移除）。 */
root.classList.add('js-pending');
/* 只有带页面状态参数的分享链接才在 Vue 按链接条件重绘前隐藏正文，避免先闪出默认推荐；其他参数不影响首屏。 */
try {
  const params = new URLSearchParams(location.search);
  if (PAGE_STATE_PARAMS.some((name) => params.has(name))) root.classList.add('has-query');
} catch { /* 地址无法解析时按无参数处理。 */ }
