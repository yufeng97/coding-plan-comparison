/* ============ Coding Plan 比价中心 — 启动与懒加载 ============ */
"use strict";

/* ---------- 初始化：单块失败不阻断其余区块 ---------- */
function boot(name, fn) {
  try { fn(); }
  catch (err) { console.error("[render] " + name, err); }
}

/* 首屏只画「帮我选」以上的内容；图表在滚动接近时再初始化（见 LAZY_CHARTS） */
boot("theme", initTheme);
boot("stats", renderStats);
boot("legend", renderLegend); /* 图例在区块头里，不随图表懒加载，避免滚达前空着 */
boot("quick", renderPicker);
boot("free", renderFree);
boot("table", renderTable);
boot("modelFilter", populateModelFilter);
boot("metricsHead", renderMetricsHead);
boot("metrics", renderMetricsTable);
boot("misc", renderMisc);

/* 首屏以下的图表进入视口再画，缩短首屏主线程占用；rootMargin 提前 200px 预热 */
const LAZY_CHARTS = [
  { name: "rank", el: "chartRank", fn: renderRankChart },
  { name: "personal", el: "chartPersonal", fn: renderPersonalChart },
  { name: "team", el: "chartTeam", fn: renderTeamChart },
  { name: "tokens", el: "chartTokens", fn: renderTokensChart },
  { name: "api", el: "chartApi", fn: renderApiChart },
];
if (typeof IntersectionObserver === "function") {
  const lazyIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        lazyIo.unobserve(e.target);
        const item = LAZY_CHARTS.find((x) => document.getElementById(x.el) === e.target);
        if (item) boot(item.name, item.fn);
      });
    },
    { rootMargin: "200px 0px" }
  );
  LAZY_CHARTS.forEach((x) => {
    const el = document.getElementById(x.el);
    if (el) lazyIo.observe(el);
  });
} else {
  /* 老浏览器无 IntersectionObserver：退回一次性全画 */
  LAZY_CHARTS.forEach((x) => boot(x.name, x.fn));
}

/* picker 的 headline 断言只在调试时跑：?debug=1 */
if (new URLSearchParams(location.search).has("debug")) {
  boot("audit", auditProfiles);
}

/* ---------- 滚动进度条 ---------- */
(function () {
  const bar = document.getElementById("scrollBar");
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
})();

/* ---------- 回到顶部（贴在右侧滚动条旁） ---------- */
(function () {
  const btn = document.getElementById("toTop");
  if (!btn) return;
  const toggle = () => btn.classList.toggle("is-on", window.scrollY > 480);
  btn.addEventListener("click", () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });
  window.addEventListener("scroll", toggle, { passive: true });
  toggle();
})();

bindEvents();
bindMetricsEvents();
