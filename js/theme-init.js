/* Apply the saved theme before styles load. CSP permits external scripts only. */
try {
  const mode = localStorage.getItem("cp-theme") || "system";
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = mode === "system" ? (dark ? "dark" : "light") : mode;
} catch (_) { /* Storage can be unavailable in private or restricted contexts. */ }
