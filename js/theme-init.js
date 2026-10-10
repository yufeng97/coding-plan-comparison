/* Apply the saved theme before styles load. CSP permits external scripts only. */
try {
  const mode = localStorage.getItem("cp-theme") || "system";
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = mode === "system" ? (dark ? "dark" : "light") : mode;
} catch (_) { /* Storage can be unavailable in private or restricted contexts. */ }
/* Shared links carry filters: hide build-time prerendered defaults until the app renders the linked state. */
if (location.search) document.documentElement.classList.add("has-query");
