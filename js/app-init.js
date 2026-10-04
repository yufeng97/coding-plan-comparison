/* ============ Coding Plan 比价中心 — 启动与懒加载 ============ */
"use strict";

/* ---------- 初始化：单块失败不阻断其余区块 ---------- */
function boot(name, fn) {
  try { fn(); return true; }
  catch (err) {
    console.error("[render] " + name, err);
    return false;
  }
}


applyUrlState();
syncControlsFromState();
renderCmpBar();
/* 分享的对比链接：≥2 档时自动弹出对比视图 */
if (cmpState.items.length >= 2) {
  boot("cmpModal", openCmpModal);
  /* 初次载入的原生 fragment 导航可能清空降级窗口焦点；载入完成后恢复一次。 */
  window.addEventListener("load", () => {
    const restore = () => {
      const dialog = byId("cmpModal");
      if (isCmpModalOpen() && dialog && !dialog.contains(document.activeElement)) focusTableControl(byId("cmpCloseBtn"));
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
    else restore();
  }, { once: true });
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
const LAZY_DONE = new Set();
function bootLazy(item) {
  if (LAZY_DONE.has(item.el)) return;
  LAZY_DONE.add(item.el);
  if (!boot(item.name, item.fn)) {
    /* 渲染失败可能发生在 echarts.init 之后：清掉 detached 实例，
       否则之后每轮 rerenderCharts 都在对已移除的 canvas setOption */
    if (chartCache[item.el]) { chartCache[item.el].dispose(); delete chartCache[item.el]; }
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
function navigateToSection(hash, updateHistory = true, moveFocus = true) {
  const target = prepareSection(hash);
  if (!target) return;
  if (updateHistory && location.hash !== hash) {
    try { history.pushState(null, "", location.pathname + location.search + hash); }
    catch (e) { location.hash = hash; }
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (moveFocus) {
    if (target.getAttribute("tabindex") == null) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
}
document.addEventListener("click", (e) => {
  const target = evtTarget(e);
  const link = target && target.closest ? target.closest('a[href^="#"]') : null;
  if (link && !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    const hash = link.getAttribute("href");
    /* 判定与导航都用解码后的锚点，非 ASCII 章节名才能命中懒加载预热与焦点管理 */
    let anchorId = hash.slice(1);
    try { anchorId = decodeURIComponent(anchorId); } catch (err) { /* 保留原值 */ }
    if (!byId(anchorId)) return;
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
/* Back/Forward 恢复整份状态。恢复期间视图不允许写回 URL。 */
let historyRestoreVersion = 0;
/* popstate 恢复已处理过的锚点；紧随其后的 hashchange（hash 前进/后退会先 popstate 再 hashchange）不再二次滚动/抢焦点 */
let restoredAnchorHash = null;
/* 六块可分享状态 + 对比选择的快照：纯锚点前进/后退时 URL 查询串不变，跳过全量重渲染 */
function shareableStateSignature() {
  return JSON.stringify([personalState, rankState, pickerState, tableState, metricsState, cmpState.items.map((p) => p.id)]);
}
function restoreHistoryState() {
  const restoreVersion = ++historyRestoreVersion;
  const focused = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusedClass = focused && (focused.classList.contains("cmp-remove") ? "cmp-remove" : focused.classList.contains("cmp-add") ? "cmp-add" : "");
  const focusedPlanId = focusedClass ? focused.dataset.planId : "";
  /* 状态已经写进 URL，但防抖视图可能还没有更新；不能把相同状态当作相同视图。 */
  const pendingSearch = personalSearchTimer != null || tableSearchTimer != null;
  cancelPersonalSearch();
  cancelTableSearch();
  URL_RESTORING = true;
  try {
    const before = shareableStateSignature();
    applyUrlState();
    if (pendingSearch || shareableStateSignature() !== before) {
      /* 状态真的变了才重绘；每步独立容错，一步失败不拖垮其余恢复 */
      boot("restoreModelFilter", populateModelFilter);
      boot("restoreControls", syncControlsFromState);
      boot("restorePicker", renderPicker);
      boot("restoreTable", renderTable);
      boot("restoreMetrics", renderMetricsTable);
      boot("restoreCmpBar", renderCmpBar);
      boot("restoreCharts", rerenderCharts);
    }
    if (isCmpModalOpen()) {
      if (cmpState.items.length < 2) closeCmpModal();
      else boot("restoreCmpModal", renderCmpModal);
    }
    if (location.hash) {
      navigateToSection(location.hash, false, false);
      restoredAnchorHash = location.hash;
    }
    /* 关闭窗口已找回可用入口时保留；仅修复被重绘或隐藏后丢失的方案按钮焦点。 */
    const currentFocus = document.activeElement;
    const modalClosed = focusedClass === "cmp-remove" && !isCmpModalOpen();
    const focusLost = modalClosed
      ? currentFocus === focused || currentFocus === document.body || !currentFocus || currentFocus.isConnected === false
      : focused && focused.isConnected === false;
    if (focusedClass && focusLost) {
      const selector = focusedClass === "cmp-add" ? "#tableBody .cmp-add" : isCmpModalOpen() ? "#cmpTable .cmp-remove" : "";
      const replacement = selector && focusedPlanId ? [...qsa(selector)].find((btn) => btn.dataset.planId === focusedPlanId) : null;
      if (!focusTableControl(replacement)) focusTableControl(byId(isCmpModalOpen() ? "cmpCloseBtn" : "searchInput"));
    }
    /* 原生历史锚点处理可能在 popstate 返回后再次清空焦点；只补回这一轮已恢复的位置。 */
    const restoredFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    if (focusedClass && restoredFocus && restoredFocus !== document.body && typeof requestAnimationFrame === "function") {
      const restoredUrl = location.href;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (restoreVersion !== historyRestoreVersion || location.href !== restoredUrl || (active && active !== document.body && active.isConnected !== false)) return;
        if (!focusTableControl(restoredFocus)) focusTableControl(byId(isCmpModalOpen() ? "cmpCloseBtn" : "searchInput"));
      });
    }
  } finally { URL_RESTORING = false; }
}
window.addEventListener("popstate", restoreHistoryState);
window.addEventListener("hashchange", () => {
  /* hash 前进/后退会先 popstate（已做过完整恢复）再 hashchange；只处理用户手改地址栏的情况 */
  if (restoredAnchorHash !== null) {
    const same = location.hash === restoredAnchorHash;
    restoredAnchorHash = null;
    if (same) return;
  }
  navigateToSection(location.hash, false, false);
});
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
const frameLazyCheck = onScrollFrame(renderLazyIfNeeded);
window.addEventListener("scroll", frameLazyCheck, { passive: true });
window.addEventListener("resize", renderLazyIfNeeded, { passive: true });
renderLazyIfNeeded();
/* 有限首屏兜底；恢复前台时再检查，不在首屏持续轮询。 */
let lazyAttempts = 0;
const lazyTimer = setInterval(() => {
  renderLazyIfNeeded();
  if (++lazyAttempts >= 5 || LAZY_DONE.size >= LAZY_CHARTS.length) clearInterval(lazyTimer);
}, 800);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderLazyIfNeeded();
});

/* picker 的 headline 断言只在调试时跑：?debug=1 */
if (DEBUG_MODE) {
  boot("audit", auditProfiles);
}

/* ---------- 滚动进度条 ---------- */
/* 三个滚动回调共用一帧调度：scroll 高频触发时每个回调每帧至多执行一次 */
function onScrollFrame(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    const run = () => { queued = false; fn(); };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  };
}

(function () {
  const bar = byId("scrollBar");
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  };
  const frameUpdate = onScrollFrame(update);
  window.addEventListener("scroll", frameUpdate, { passive: true });
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
    const title = qs(".hero h1");
    if (title) { title.setAttribute("tabindex", "-1"); title.focus({ preventScroll: true }); }
  });
  const frameToggle = onScrollFrame(toggle);
  window.addEventListener("scroll", frameToggle, { passive: true });
  toggle();
})();

boot("events", bindEvents);
boot("metricsEvents", bindMetricsEvents);
boot("chartResize", bindChartResize);
boot("syncUrl", syncUrl);
/* 直接打开分享锚点时也先铺好上方布局。 */
if (location.hash) navigateToSection(location.hash, false, false);
