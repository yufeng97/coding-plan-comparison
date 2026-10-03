/* ============ Coding Plan 比价中心 — 启动与懒加载 ============ */
"use strict";
const DEBUG_MODE = new URLSearchParams(location.search).has("debug");

/* ---------- 初始化：单块失败不阻断其余区块 ---------- */
function boot(name, fn) {
  try { fn(); return true; }
  catch (err) {
    console.error("[render] " + name, err);
    return false;
  }
}

/* ---------- URL 状态化：筛选/排序可分享、刷新可恢复 ----------
 * 各区块的 render 函数是状态变更的唯一汇聚点，末尾统一调 syncUrl()；
 * 这里在首次渲染前读 URL 恢复状态（带白名单校验，非法参数忽略）。
 * file:// 直开时 history 不可写，降级为仅当前页生效。 */
const URL_KEYS = {
  /* 「帮我选」（最常被分享的一组） */
  budget: () => pickerState.budget,
  region: () => pickerState.region,
  tool: () => pickerState.tool,
  task: () => pickerState.task,
  /* 个人订阅价格全景 */
  pcat: () => state1.cat,
  pregion: () => state1.region,
  pbilling: () => state1.billing,
  pq: () => state1.q,
  plimit: () => state1.limit == null ? "all" : String(state1.limit),
  /* 性价比排行 */
  rank: () => rankState.tier,
  rscope: () => rankState.scope,
  /* 数据表 */
  q: () => tableState.search,
  tcat: () => tableState.cat,
  tregion: () => tableState.region,
  tsort: () => tableState.sortKey + ":" + tableState.sortDir,
  /* 额度深度对比表 */
  mmodel: () => metricsState.model,
  mver: () => metricsState.ver,
  msort: () => metricsState.sortKey + ":" + metricsState.sortDir,
  /* 并排对比（数据表勾选；空集不写入） */
  cmp: () => cmpState.items.map((p) => p.vendor + "|" + p.plan).join(";"),
};
const URL_DEFAULTS = {};
const URL_VALID = {
  budget: new Set(["0", "100", "200", "500", "any"]),
  region: new Set(["all", "cn", "intl"]),
  tool: new Set(["any", "claude", "codex", "cursor", "own"]),
  task: new Set(["hard", "both", "daily"]),
  pcat: new Set(["all", "official", "tool", "cloud"]),
  pregion: new Set(["all", "cn", "intl"]),
  pbilling: new Set(["M", "Y"]),
  plimit: new Set([String(PERSONAL_DEFAULT_LIMIT), "all"]),
  rank: new Set(["flagship", "all"]),
  rscope: new Set(["official", "credits", "all"]),
  tcat: new Set(["all", "official", "tool", "cloud", "team"]),
  tregion: new Set(["all", "cn", "intl"]),
  tsortKeys: new Set(["priceM", "priceY"]),
  mver: new Set(["all", "V3", "V2"]),
  msortKeys: new Set(["price", "cpm", "t5h", "r5h", "twk", "rwk", "tmo", "rmo"]),
};

let URL_SNAPSHOTTED = false;
function applyUrlState() {
  /* 默认值只快照一次：重复调用会以"非默认"状态为基线，污染 syncUrl 的判断 */
  if (!URL_SNAPSHOTTED) {
    for (const k of Object.keys(URL_KEYS)) URL_DEFAULTS[k] = URL_KEYS[k]();
    URL_SNAPSHOTTED = true;
  }
  const p = new URLSearchParams(location.search);
  const pick = (k, valid, target, key) => {
    const v = p.get(k);
    if (v != null && (!valid || valid.has(v))) target[key] = v;
  };
  pick("budget", URL_VALID.budget, pickerState, "budget");
  pick("region", URL_VALID.region, pickerState, "region");
  pick("tool", URL_VALID.tool, pickerState, "tool");
  pick("task", URL_VALID.task, pickerState, "task");
  pick("pcat", URL_VALID.pcat, state1, "cat");
  pick("pregion", URL_VALID.pregion, state1, "region");
  pick("pbilling", URL_VALID.pbilling, state1, "billing");
  if (p.get("pq") != null) state1.q = p.get("pq");
  if (URL_VALID.plimit.has(p.get("plimit"))) state1.limit = p.get("plimit") === "all" ? null : PERSONAL_DEFAULT_LIMIT;
  pick("rank", URL_VALID.rank, rankState, "tier");
  pick("rscope", URL_VALID.rscope, rankState, "scope");
  if (p.get("q") != null) tableState.search = p.get("q");
  pick("tcat", URL_VALID.tcat, tableState, "cat");
  pick("tregion", URL_VALID.tregion, tableState, "region");
  const ts = p.get("tsort");
  if (ts) {
    const [key, dir] = ts.split(":");
    if (URL_VALID.tsortKeys.has(key)) { tableState.sortKey = key; tableState.sortDir = dir === "-1" ? -1 : 1; }
  }
  if (p.get("mmodel") != null) metricsState.model = p.get("mmodel");
  pick("mver", URL_VALID.mver, metricsState, "ver");
  const ms = p.get("msort");
  if (ms) {
    const [key, dir] = ms.split(":");
    if (URL_VALID.msortKeys.has(key)) { metricsState.sortKey = key; metricsState.sortDir = dir === "-1" ? -1 : 1; }
  }
  const cmp = p.get("cmp");
  if (cmp != null) {
    /* 只保留能在 PLANS 里找到的档位，超上限截断；解析失败整体清空 */
    cmpState.items = cmp.split(";").map((s) => {
      const [vendor, plan] = s.split("|");
      return PLANS.find((x) => x.vendor === vendor && x.plan === plan);
    }).filter((x, i, all) => x && all.indexOf(x) === i).slice(0, CMP_MAX);
  }
}

function syncUrl() {
  /* 仅写入仍受支持的状态，旧链接中的 country 等退役参数会在首次渲染时清除。 */
  const p = new URLSearchParams();
  if (DEBUG_MODE) p.set("debug", "1");
  for (const [k, get] of Object.entries(URL_KEYS)) {
    const v = String(get());
    if (v !== String(URL_DEFAULTS[k]) && v !== "") p.set(k, v);
  }
  const qs = p.toString();
  const hash = location.hash || "";
  try { history.replaceState(null, "", (qs ? "?" + qs : location.pathname) + hash); }
  catch (e) { /* file:// 直开时地址栏不可写，状态仅在当前页生效 */ }
}

/* 恢复 URL 状态后，把输入框/下拉/chip 的显示值同步到状态 */
function syncControlsFromState() {
  syncPickerChips(); /* renderPicker 渲染时也会自愈同步，这里先跑一次避免首帧高亮错档 */
  setChipPressed(qsa("#chipCat .chip"), (chip) => chip.dataset.cat === state1.cat);
  setChipPressed(qsa("#chipRegion .chip"), (chip) => chip.dataset.region === state1.region);
  setChipPressed(qsa("#chipBilling .chip"), (chip) => chip.dataset.billing === state1.billing);
  const setVal = (id, v) => { const el = byId(id); if (el) el.value = v; };
  setVal("chartSearch", state1.q);
  setVal("searchInput", tableState.search);
  setVal("selectCat", tableState.cat);
  setVal("selectRegion", tableState.region);
  setVal("metricsVer", metricsState.ver); /* 模型下拉在 populateModelFilter 填充后再设值 */
  syncRankChips();
}

applyUrlState();
syncControlsFromState();
renderCmpBar();
/* 分享的对比链接：≥2 档时自动弹出对比视图 */
if (cmpState.items.length >= 2) boot("cmpModal", openCmpModal);

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
const LAZY_DONE = new Set();
function bootLazy(item) {
  if (LAZY_DONE.has(item.el)) return;
  LAZY_DONE.add(item.el);
  if (!boot(item.name, item.fn)) {
    const el = byId(item.el);
    if (el) el.innerHTML = `<p class="render-error" role="alert">图表暂时无法显示。<button type="button" class="chip" data-retry-chart="${esc(item.el)}">重试</button></p>`;
  }
}

/* 锚点跳转前完成目标前方图表的布局；滚动期间不再被懒加载增高顶偏。 */
function prepareSection(hash) {
  let id;
  try { id = decodeURIComponent(String(hash || "").replace(/^#/, "")); }
  catch (e) { return null; }
  const target = byId(id);
  if (!target) return null;
  LAZY_CHARTS.forEach((item) => {
    const chart = byId(item.el);
    if (chart && (target.contains(chart) || (chart.compareDocumentPosition(target) & 4))) bootLazy(item);
  });
  return target;
}
function navigateToSection(hash, updateHistory = true) {
  const target = prepareSection(hash);
  if (!target) return;
  if (updateHistory && location.hash !== hash) {
    try { history.pushState(null, "", location.pathname + location.search + hash); }
    catch (e) { location.hash = hash; }
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}
document.addEventListener("click", (e) => {
  const target = evtTarget(e);
  const link = target && target.closest ? target.closest('a[href^="#"]') : null;
  if (link && !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    const hash = link.getAttribute("href");
    if (!byId(hash.slice(1))) return;
    e.preventDefault();
    navigateToSection(hash);
  }
  const retry = target && target.closest ? target.closest("[data-retry-chart]") : null;
  if (retry) {
    const id = retry.dataset.retryChart;
    const item = LAZY_CHARTS.find((x) => x.el === id);
    if (item) {
      if (chartCache[id]) { chartCache[id].dispose(); delete chartCache[id]; }
      byId(id).innerHTML = "";
      LAZY_DONE.delete(id);
      bootLazy(item);
    }
  }
});
window.addEventListener("hashchange", () => navigateToSection(location.hash, false));
if (typeof IntersectionObserver === "function") {
  const lazyIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        lazyIo.unobserve(e.target);
        const item = LAZY_CHARTS.find((x) => byId(x.el) === e.target);
        if (item) bootLazy(item);
      });
    },
    { rootMargin: "200px 0px" }
  );
  LAZY_CHARTS.forEach((x) => {
    const el = byId(x.el);
    if (el) lazyIo.observe(el);
  });
}
/* 兜底：后台标签页等环境里 IO 可能不产生帧，滚动/缩放时按位置补渲染（LAZY_DONE 防重复） */
function renderLazyIfNeeded() {
  LAZY_CHARTS.forEach((item) => {
    if (LAZY_DONE.has(item.el)) return;
    const el = byId(item.el);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight + 200 && r.bottom > -200) bootLazy(item);
  });
}
window.addEventListener("scroll", renderLazyIfNeeded, { passive: true });
window.addEventListener("resize", renderLazyIfNeeded, { passive: true });
renderLazyIfNeeded();
/* 再兜一层：隐藏标签页不派发 scroll 事件、IO 不产帧，用短轮询保证最终一定渲染；
   全部画完后自清理。后台标签下浏览器会把间隔节流到 ≥1s，无碍。 */
const lazyTimer = setInterval(() => {
  renderLazyIfNeeded();
  if (LAZY_DONE.size >= LAZY_CHARTS.length) clearInterval(lazyTimer);
}, 800);

/* picker 的 headline 断言只在调试时跑：?debug=1 */
if (DEBUG_MODE) {
  boot("audit", auditProfiles);
}

/* ---------- 滚动进度条 ---------- */
(function () {
  const bar = byId("scrollBar");
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
  const btn = byId("toTop");
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
/* 直接打开分享锚点时也先铺好上方布局。 */
if (location.hash) navigateToSection(location.hash, false);
