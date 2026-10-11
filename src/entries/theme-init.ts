/* Apply the saved theme before styles load. Built as an independent CSP-safe classic script. */
try {
  const mode = localStorage.getItem('cp-theme') || 'system';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = mode === 'system' ? (dark ? 'dark' : 'light') : mode;
} catch { /* Storage can be unavailable in private or restricted contexts. */ }
/* Shared links hide the prerendered defaults until Vue renders the linked state. */
if (location.search) document.documentElement.classList.add('has-query');
