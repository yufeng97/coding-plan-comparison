/* ============ Coding Plan 比价中心 渲染逻辑 ============ */
"use strict";

const CAT_LABEL = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };
const REGION_LABEL = { cn: "国内", intl: "国际" };
/* 类别色值以 css/style.css 的 --cat-* 变量为单一数据源：图表、HTML 图例、类别标签共用。
   主题切换时 refreshPalette() 会重读变量（暗色取更亮的一组），图例与图表同步。 */
let CAT_COLOR = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };
let RELAY_COLOR = "#d4534a";
function refreshCategoryColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => (cs.getPropertyValue(n) || "").trim();
  CAT_COLOR = {
    official: v("--cat-official") || CAT_COLOR.official,
    tool: v("--cat-tool") || CAT_COLOR.tool,
    cloud: v("--cat-cloud") || CAT_COLOR.cloud,
    team: v("--cat-team") || CAT_COLOR.team,
  };
  RELAY_COLOR = v("--cat-relay") || RELAY_COLOR;
}

const VENDOR_SHORT = {
  "Cognition Devin Desktop（原 Windsurf）": "Devin Desktop",
  "Cognition Devin Desktop": "Devin Desktop",
  "Cognition Devin（云 agent）": "Devin 云",
  "Roo Code（Roomote）": "Roomote",
  "智谱 BigModel": "BigModel",
  "月之暗面 Kimi": "月之暗面",
  "阿里云 Qoder CN（原通义灵码）": "Qoder CN（灵码）",
  "腾讯云 CodeBuddy": "腾讯 CodeBuddy",
  "腾讯云（LKEAP 知识引擎）": "腾讯云 LKEAP",
  "字节跳动 Trae（国内版）": "字节 Trae(国内)",
  "字节跳动 Trae（国际版）": "字节 Trae(国际)",
  "百度文心快码 Comate": "百度 Comate",
  "火山引擎方舟（字节）": "火山方舟",
  "小米 MiMo": "小米 MiMo",
  "腾讯云 TokenHub": "腾讯 TokenHub",
  "百度千帆": "百度千帆",
  "七牛云": "七牛云",
  "Factory (Droid)": "Droid",
  "讯飞星辰 MaaS": "讯飞 Astron",
  "Canopy Wave": "Canopy",
  /* API 按量图里的厂商短名 */
  "阿里云百炼": "百炼",
  "火山引擎（豆包/方舟）": "火山方舟",
  "硅基流动 SiliconFlow": "硅基流动",
  "阶跃星辰 StepFun": "阶跃",
};

/* 经典脚本各自独立求值：data.js 缺失或中途出错时给出单一明确报错，
   而不是让后续每个顶层常量各自抛 ReferenceError。 */
if (typeof RATE_USD_CNY !== "number" || typeof PLANS === "undefined" ||
    typeof METRICS_RAW === "undefined" || typeof ESTIMATES === "undefined" ||
    typeof MODEL_ROLES === "undefined" || typeof META === "undefined") {
  throw new Error("js/data.js 未加载或缺少必需的全局数据（RATE_USD_CNY/PLANS/METRICS_RAW/ESTIMATES/MODEL_ROLES/META）");
}

const RATE = RATE_USD_CNY;
/* 「帮我选」模型角色表的归类日期，取自 data.js 的 MODEL_ROLES.asOf */
const MODEL_ROLES_ASOF = (MODEL_ROLES.find((r) => r.asOf) || {}).asOf || META.updated;

/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
function resolvePlan(m) {
  /* ref 可解析时，身份、名称和价格统一取 PLANS；model 等额度口径仍由该行保留。 */
  if (m.ref != null) {
    const p = findPlanReference(m.ref);
    if (p) return { ...m, vendor: p.vendor, plan: p.plan, priceM: p.priceM, cur: p.cur, windowPeriod: m.windowPeriod || p.windowPeriod || "unknown" };
    console.warn("[data] ref 未解析，已跳过:", m.ref);
    return null;
  }
  return m;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}
function safeHref(u) {
  const s = String(u ?? "").trim();
  return /^https?:\/\//i.test(s) ? esc(s) : "";
}

/* 辅助视图的数据脚本在访问时下载；保留经典脚本以支持 file://。 */
const optionalDataLoads = {};
function optionalDataLoaded(kind) {
  return kind === "maintenance" ? typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
    : kind === "benchmark" && typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1;
}
function ensureOptionalData(kind) {
  if (optionalDataLoaded(kind)) return Promise.resolve();
  if (optionalDataLoads[kind]) return optionalDataLoads[kind];
  const descriptor = byId(kind + "DataSource");
  if (!descriptor) return Promise.reject(new Error("缺少数据入口"));
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.optionalData = kind;
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); delete optionalDataLoads[kind]; reject(error); }
      else resolve();
    };
    script.onload = () => finish(optionalDataLoaded(kind) ? null : new Error("数据文件内容不完整"));
    script.onerror = () => finish(new Error("数据文件下载失败"));
    script.src = descriptor.getAttribute("src");
    timer = setTimeout(() => finish(new Error("数据下载超时，请重试")), 15000);
    document.head.appendChild(script);
  });
  optionalDataLoads[kind] = pending;
  return pending;
}
/* 计划分类（含中转站名单 isRelay）、offerable、resolvedField、hasOwnClient 在 js/data.js，页面与校验器共用。 */
/* isFlagshipModelName 等额度/模型分类的纯计算函数在 js/metrics.js（校验器与测试共用） */
/* 风险标签只读结构化字段：备注里的「支持 BYOK」「季付 $403.2」等文字不能推断为必须自备 Key 或访问异常。 */
function planBadges(p) {
  const badges = [];
  const check = priceCheckOf(p);
  if (check && check.status === "unverified") badges.push({ t: "价格待核", k: "risk" });
  const tools = resolvedField(p, "tools");
  if (isRelay(p)) badges.push({ t: "中转", k: "risk" });
  if (p.modelAccess === "byok") badges.push({ t: "要自备 Key", k: "risk" });
  else if (p.modelAccess === "metered" || p.includedModelQuota === false) badges.push({ t: "推理另计", k: "risk" });
  if (isRenewalOnly(p)) badges.push({ t: "仅老用户", k: "risk" });
  if (isOneTimePlan(p)) badges.push({ t: "一次性", k: "risk" });
  if (isSoldOut(p)) badges.push({ t: "售罄 · 仅候补", k: "risk" });
  const mainland = mainlandAccessOf(p);
  if (mainland) badges.push({ t: mainland.status === "unsupported" ? "不服务中国大陆" : "部分模型限地区", k: "risk" });
  if (p.purchaseCountries && p.purchaseCountries.length) {
    const countries = { IN: "印度", CN: "中国", US: "美国" };
    badges.push({ t: "仅限" + p.purchaseCountries.map((c) => countries[c] || c).join("/"), k: "risk" });
  }
  if (p.accessUnstable) badges.push({ t: "访问不稳", k: "risk" });
  if (/Claude Code/i.test(tools)) badges.push({ t: "Claude Code", k: "agent" });
  if (/Codex/i.test(tools)) badges.push({ t: "Codex", k: "agent" });
  if (p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) badges.push({ t: "Cursor", k: "agent" });
  if (!badges.some((b) => b.k === "agent") && !isRelay(p) && hasOwnClient(p)) badges.push({ t: "自家客户端", k: "agent" });
  return badges;
}
/* 中国大陆可用性的展示文案：国内档为国内服务；国际档只在登记了官方说明时给结论，其余标未核实。 */
function mainlandAccessText(p) {
  const access = mainlandAccessOf(p);
  if (access) return `${access.status === "unsupported" ? "官方支持地区不含中国大陆" : "服务可用，部分模型受供应商地区限制"}（${access.checkedAt} 核查）：${access.evidence}`;
  return p && p.region === "cn" ? "国内服务" : "未核实官方支持地区";
}
function badgeHtml(p) {
  return planBadges(p).map((b) => `<span class="badge badge-${b.k}">${esc(b.t)}</span>`).join("");
}
/* 额度行经 ref 读取主表的结构化状态；未设 ref 的行无从判断购买资格，校验器会单列提示。 */
function metricOfferOk(m) {
  const p = m.ref != null ? findPlanReference(m.ref) : null;
  return !p || !(isRetiredPlan(p) || !isPriceConfirmed(p) || isOneTimePlan(p) || isRenewalOnly(p) || !offerable(p));
}
function adoptMetric(m, isEst) {
  const resolved = resolvePlan(m);
  return resolved ? { ...resolved, isEst } : null;
}
const METRICS_ALL = [
  ...METRICS_RAW.map((m) => adoptMetric(m, false)),
  ...ESTIMATES.map((m) => adoptMetric(m, true)),
].filter(Boolean);

/* ---------- 工具函数 ---------- */
const shortVendor = (v) => VENDOR_SHORT[v] || v;
const fmtCNY = (n) => "¥" + (Math.round(n * 10) / 10).toLocaleString("zh-CN");
const trunc = (s, n) => (!s ? "—" : (s.length > n ? s.slice(0, n) + "…" : s));

/* ---------- 内联 SVG 图标（替代 173KB 的 Remix Icon 字体；stroke 继承 currentColor） ---------- */
const ICON_SVG = {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  stack: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  gift: '<rect x="3.5" y="7.5" width="17" height="4.5" rx="1"/><path d="M5.5 12v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7M12 7.5V21"/><path d="M12 7.5C9 7.5 7.2 6.6 7.2 5.2 7.2 4 8.2 3 9.4 3c1.7 0 2.6 2 2.6 4.5C12 5 12.9 3 14.6 3c1.2 0 2.2 1 2.2 2.2 0 1.4-1.8 2.3-4.8 2.3Z"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="8" cy="8" r="1.7"/>',
  "arrow-down-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7v10m0 0 4-4m-4 4-4-4"/>',
  "arrow-up-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 17V7m0 0 4 4m-4-4-4 4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
  computer: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6m-3-4v4"/>',
  "arrow-up": '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
};
function icon(name) {
  return `<i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_SVG[name] || ""}</svg></i>`;
}
/* ---------- DOM 助手：checkJs 友好的元素类型断言，id↔元素对应关系由页面结构约定保证 ---------- */
function byId(id) { return /** @type {any} */ (document.getElementById(id)); }
function qsa(sel) { return /** @type {any} */ (document.querySelectorAll(sel)); }
function qs(sel) { return /** @type {any} */ (document.querySelector(sel)); }
function evtTarget(e) { return /** @type {any} */ (e && e.target); }
function setChipPressed(chips, isOn) {
  chips.forEach((chip) => {
    const on = !!isOn(chip);
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
/* 图表是 canvas，读屏不可见：渲染后写一句文字摘要进容器 */
function describeChart(id, text) {
  const el = byId(id);
  if (!el) return;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", String(text).slice(0, 240));
}

function priceOf(p, billing) {
  if (billing === "Y") return p.priceY ?? null;
  return p.priceM;
}
/* 币种折算统一走 metrics.js 的 toCNY（校验器与测试共用同一实现） */
function cnyOf(p, billing) {
  const v = priceOf(p, billing);
  return v == null ? null : toCNY(v, p.cur);
}
function priceText(p, key) {
  const v = p[key];
  if (v == null) return "按量/定制";
  if (v === 0) return "免费";
  return currencySymbol(p.cur) + Number(v.toFixed(2));
}
function currencySymbol(cur) { return cur === "USD" ? "$" : cur === "INR" ? "₹" : "¥"; }
function priceCheckLabel(p, kind = "plan") {
  const check = priceCheckOf(p, kind);
  if (!check) return "未核实";
  return { verified: "价格已核实", changed: "核价信息已校正", unverified: "历史价 · 待核实", retired: "已停售", custom: "需询价" }[check.status];
}
function priceCheckSources(p, kind = "plan") {
  const check = priceCheckOf(p, kind);
  return check ? check.sourceIds.map((id) => PRICE_CHECKS.sources[id] && PRICE_CHECKS.sources[id].url).filter(Boolean) : [];
}
/* 核查日期与「今天」都按北京时间的日历日比较。 */
function chinaCalendarDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
/** 距核查日的天数；日期无效或晚于今天（时区差）时返回 null。 */
function daysSince(date, today = chinaCalendarDay()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const diff = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}
/* 复查间隔与维护摘要一致（首屏摘要提供，缺省 14 天）。 */
function staleAfterDays() {
  return typeof MAINTENANCE_SUMMARY !== "undefined" && MAINTENANCE_SUMMARY.staleAfterDays > 0 ? MAINTENANCE_SUMMARY.staleAfterDays : 14;
}
/** 「（6 天前）」「（今天）」；超过复查间隔时注明。 */
function checkAgeText(date) {
  const age = daysSince(date);
  if (age == null) return "";
  return `（${age === 0 ? "今天" : age + " 天前"}${age >= staleAfterDays() ? "，超过复查间隔" : ""}）`;
}
function priceCheckHtml(p, kind = "plan") {
  const check = priceCheckOf(p, kind);
  const urls = priceCheckSources(p, kind);
  const links = urls.map((url, i) => `<a href="${safeHref(url)}" target="_blank" rel="noopener">核价来源${urls.length > 1 ? i + 1 : ""}</a>`).join(" · ");
  const explanation = check && check.status === "unverified" ? `<details class="price-check-details"><summary>核查说明</summary><p>${esc(displayPriceReason(check.reason))}</p></details>` : "";
  const age = check ? daysSince(check.checkedAt) : null;
  const stale = age != null && age >= staleAfterDays();
  return `${links || "—"}<span class="sub${stale ? " check-stale" : ""}">${esc(priceCheckLabel(p, kind))}${check ? " · " + esc(check.checkedAt) + esc(checkAgeText(check.checkedAt)) : ""}</span>${explanation}`;
}

/* 所有表格/对比/导出共用计价单位，不能把充值或席位费用当作个人月费。 */
function priceUnit(p) {
  if (isOneTimePlan(p)) return "一次性";
  if (isFourWeekPlan(p)) return p.seat ? "席位/4周" : "4周";
  return p.seat ? "席位/月" : "月";
}
function planPriceLabel(p, billing = "M") {
  const key = billing === "Y" ? "priceY" : "priceM";
  if (p[key] == null) return billing === "Y" ? "—" : "按量/定制";
  if (p[key] === 0) return p.includedModelQuota === false ? "平台免费；推理另计" : "免费";
  return priceText(p, key) + "/" + priceUnit(p) + (billing === "Y" ? "（年付折月）" : "");
}

/* 宽屏严格限制轴标签占宽，完整名称在 tooltip 和数据表中查看。
   窄屏改为把类别名放在柱子上方整行显示：截成「阶跃 Step Plan Flash…」后几行无法区分。
   公开评测图另有两行标签方案，保持原样。 */
const NARROW_CHART_WIDTH = 480;
const chartNarrowMode = new Map();
function chartHostWidth(hostEl, measuredWidth = 0) {
  return measuredWidth || hostEl.getBoundingClientRect().width || window.innerWidth - 72;
}
function isNarrowChart(hostEl, measuredWidth = 0) {
  return hostEl.id !== "chartPublicBenchmark" && chartHostWidth(hostEl, measuredWidth) < NARROW_CHART_WIDTH;
}
/* 名称放到柱子上方后，每行多留一行文字的高度。 */
function chartRowHeight(hostEl, per) { return isNarrowChart(hostEl) ? per + 16 : per; }
function chartAxisLabel(hostEl, fontSize = 12.5, measuredWidth = 0) {
  const width = chartHostWidth(hostEl, measuredWidth);
  const narrow = isNarrowChart(hostEl, width);
  chartNarrowMode.set(hostEl.id, narrow);
  if (narrow) {
    return { color: PAL.catLabel, fontSize: 11, inside: true, align: "left", verticalAlign: "bottom",
      padding: [0, 0, 11, 2], width: Math.max(120, width - 40), overflow: "truncate", margin: 0 };
  }
  return { color: PAL.catLabel, fontSize,
    width: Math.max(60, Math.min(width < NARROW_CHART_WIDTH ? 110 : 260, width * 0.34)),
    overflow: "truncate", margin: 8 };
}
/* 宽窄布局切换（如手机横竖屏）需要整图重绘：行高与标签位置都要变。 */
function chartRenderer(id) {
  return { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart, chartTokens: renderTokensChart,
    chartApi: renderApiChart, chartPower: renderApiChart, chartRank: renderRankChart }[id] || null;
}

const chartCache = {};
let chartLibraryPromise = null;
const queuedChartRenders = new Map();
function chartLibraryReady() { return typeof echarts !== "undefined" && typeof echarts.init === "function"; }
function ensureChartLibrary() {
  if (chartLibraryReady()) return Promise.resolve();
  if (chartLibraryPromise) return chartLibraryPromise;
  chartLibraryPromise = new Promise((resolve,reject) => {
    const template = byId("chartLibraryTemplate");
    const asset = template && template.content && template.content.querySelector("script[src]");
    if (!asset) { reject(new Error("图表资源地址缺失")); return; }
    const script = document.createElement("script");
    script.src = asset.getAttribute("src");
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true; clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("图表资源加载超时")),15000);
    script.onload = () => finish(chartLibraryReady() ? null : new Error("图表资源未正确初始化"));
    script.onerror = () => finish(new Error("图表资源加载失败"));
    document.body.appendChild(script);
  }).catch((err) => { chartLibraryPromise = null; throw err; });
  return chartLibraryPromise;
}
function showChartError(id, err) {
  const ids = id === "chartApi" ? [id,"chartPower"] : [id];
  ids.forEach((chartId) => {
    if (chartCache[chartId]) { chartCache[chartId].dispose(); delete chartCache[chartId]; }
    const el = byId(chartId);
    if (el) {
      el.removeAttribute("aria-busy");
      el.innerHTML = `<p class="render-error" role="alert">图表暂时无法显示，文字明细仍可查看。<button type="button" class="chip" data-retry-chart="${esc(id)}">重试</button></p>`;
    }
  });
  console.error("[chart] " + id,err);
}
function deferChartRender(id, render) {
  if (chartLibraryReady()) return false;
  const scheduled = queuedChartRenders.has(id);
  queuedChartRenders.set(id,render);
  const el = byId(id);
  if (el) { el.setAttribute("aria-busy","true"); el.innerHTML = '<p class="chart-loading" role="status">正在加载图表…</p>'; }
  if (!scheduled) ensureChartLibrary().then(() => {
    const latest = queuedChartRenders.get(id); queuedChartRenders.delete(id);
    if (el) { el.removeAttribute("aria-busy"); el.innerHTML = ""; }
    try { if (latest) latest(); markChartsForResize(); resizeVisibleCharts(); }
    catch (err) { showChartError(id,err); }
  }, (err) => { queuedChartRenders.delete(id); showChartError(id,err); });
  return true;
}
function makeChart(id) {
  if (!chartCache[id]) {
    const el = byId(id);
    el.innerHTML = "";
    el.removeAttribute("aria-busy");
    chartCache[id] = echarts.init(el, null, { renderer: "canvas" });
  }
  return chartCache[id];
}
let resizeTimer;
const pendingChartResizes = new Set();
const CHART_AXIS_FONT_SIZE = { chartPersonal: 12.5, chartTeam: 12.5, chartTokens: 11.5, chartApi: 11, chartPower: 11, chartRank: 11.5, chartPublicBenchmark: 12 };
/* 缩放只更新实际尺寸变化的可见画布，不重新筛数据或重建图例。
   离屏画布保留待处理标记，滚入阅读区时再补齐尺寸和轴标签宽度。 */
function resizeVisibleCharts() {
  pendingChartResizes.forEach((id) => {
    const chart = chartCache[id], el = byId(id);
    if (!chart || !el) { pendingChartResizes.delete(id); return; }
    if (el.hidden) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.width <= 0 || rect.height <= 0) return;
    pendingChartResizes.delete(id);
    if (Math.abs(chart.getWidth() - rect.width) < 1 && Math.abs(chart.getHeight() - rect.height) < 1) return;
    try {
      const render = chartRenderer(id);
      if (render && chartNarrowMode.has(id) && chartNarrowMode.get(id) !== isNarrowChart(el, rect.width)) {
        render();
        chart.resize();
        return;
      }
      chart.setOption({ yAxis: { axisLabel: chartAxisLabel(el, CHART_AXIS_FONT_SIZE[id], rect.width) } }, { lazyUpdate: true });
      chart.resize();
    } catch (err) {
      pendingChartResizes.add(id);
      console.error("[chart resize] " + id, err);
    }
  });
}
/* 隐藏视图里重绘的画布会按 100px 默认宽度绘制；重绘、视图切换和缩放后统一标记待测量，
   进入可视区时再按实际尺寸补齐，不依赖窗口缩放事件。 */
function markChartsForResize(ids = Object.keys(chartCache)) {
  ids.forEach((id) => { if (chartCache[id]) pendingChartResizes.add(id); });
}
function bindChartResize() {
  window.addEventListener("resize", () => {
    markChartsForResize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeVisibleCharts, 150);
  }, { passive: true });
  let scrollQueued = false;
  window.addEventListener("scroll", () => {
    if (scrollQueued || pendingChartResizes.size === 0) return;
    scrollQueued = true;
    const update = () => { scrollQueued = false; resizeVisibleCharts(); };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(update);
    else update();
  }, { passive: true });
}

/* ---------- 主题（暗/亮/跟随系统）与图表调色板 ---------- */
let PAL = {};
function refreshPalette() {
  const L = document.documentElement.dataset.theme === "light";
  const cs = getComputedStyle(document.documentElement);
  const color = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
  PAL = L ? {
    text: "#10110f", dim: "#6f726b", catLabel: "#3a3d38", faint: color("--faint", "#70746c"),
    gold: color("--gold", "#996100"), green: color("--green", "#287c3e"),
    red: color("--red", "#b52a25"), info: color("--info", "#2458ae"),
    axisLine: "rgba(16,17,15,.22)", splitLine: "rgba(16,17,15,.07)",
    tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(16,17,15,.18)", tipText: "#10110f",
  } : {
    text: "#eceee8", dim: "#9fa39a", catLabel: "#c8ccc2", faint: color("--faint", "#868a83"),
    gold: color("--gold", "#e9b117"), green: color("--green", "#4cbf6b"),
    red: color("--red", "#ef554f"), info: color("--info", "#6d9bff"),
    axisLine: "rgba(236,238,232,.2)", splitLine: "rgba(236,238,232,.08)",
    tipBg: "rgba(22,24,21,.97)", tipBorder: "rgba(236,238,232,.16)", tipText: "#eceee8",
  };
  refreshCategoryColors();
}
function axisStyle() {
  return {
    axisLine: { lineStyle: { color: PAL.axisLine } },
    axisLabel: { color: PAL.dim, fontSize: 12 },
    splitLine: { lineStyle: { color: PAL.splitLine } },
  };
}
function tipStyle(hostEl, viewportFixed = false) {
  return {
    backgroundColor: PAL.tipBg,
    borderColor: PAL.tipBorder,
    borderWidth: 1,
    textStyle: { color: PAL.tipText, fontSize: 12.5 },
    // 随图表所属标签收起，避免旧提示坐标撑高切换后的页面。
    appendToBody: false,
    extraCssText: "max-width: min(420px, calc(100vw - 24px)); white-space: normal; overflow-wrap: anywhere; z-index: 2000;",
    position(point, _params, _el, _rect, size) {
      const box = hostEl.getBoundingClientRect();
      const bw = Math.min(size.contentSize[0] || 280, window.innerWidth - 24);
      const bh = size.contentSize[1] || 72;
      let x = box.left + point[0] + 14;
      let y = box.top + point[1] + 12;
      if (x + bw > window.innerWidth - 8) x = box.left + point[0] - bw - 14;
      if (x < 8) x = 8;
      if (x + bw > window.innerWidth - 8) x = Math.max(8, window.innerWidth - bw - 8);
      if (y + bh > window.innerHeight - 8) y = box.top + point[1] - bh - 12;
      if (y < 8) y = 8;
      if (y + bh > window.innerHeight - 8) y = Math.max(8, window.innerHeight - bh - 8);
      return viewportFixed ? [x, y] : [x - box.left, y - box.top];
    },
  };
}
/* 轴上和表里的模型名统一成产品写法：qwen3-coder-next → Qwen3-Coder-Next。计费 ID 仍用原文。 */
function displayModelName(name) {
  const raw = String(name || "").trim();
  if (!raw) return raw;
  const tailMatch = raw.match(/\s*[\[（(].*$/);
  const head = tailMatch ? raw.slice(0, tailMatch.index) : raw;
  const tail = tailMatch ? tailMatch[0] : "";
  const brands = [
    [/^(gpt)(.*)$/i, "GPT"],
    [/^(glm)(.*)$/i, "GLM"],
    [/^(qwen)(.*)$/i, "Qwen"],
    [/^(deepseek)(.*)$/i, "DeepSeek"],
    [/^(kimi)(.*)$/i, "Kimi"],
    [/^(claude)(.*)$/i, "Claude"],
    [/^(gemini)(.*)$/i, "Gemini"],
    [/^(minimax)(.*)$/i, "MiniMax"],
    [/^(mimo)(.*)$/i, "MiMo"],
    [/^(doubao)(.*)$/i, "Doubao"],
    [/^(step)(.*)$/i, "Step"],
    [/^(grok)(.*)$/i, "Grok"],
    [/^(ernie)(.*)$/i, "ERNIE"],
    [/^(hy)(\d.*)$/i, "Hy"],
  ];
  const cap = (tok) => {
    for (const [re, brand] of brands) {
      const m = tok.match(re);
      if (m) return brand + (m[2] || "");
    }
    return /^[a-z]/.test(tok) ? tok.charAt(0).toUpperCase() + tok.slice(1) : tok;
  };
  return head.split("-").map(cap).join("-") + tail;
}
function foldSearch(s) {
  return String(s || "").toLowerCase().replace(/[\s_\-./·]+/g, "");
}
/* 正则转义（windowSentence 的模型名片段、测试与校验共用的小工具） */
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** @type {Array<[RegExp, string]>} */
const SEARCH_VENDOR_ALIASES = [
  [/OpenAI|ChatGPT/i, "OpenAI ChatGPT Codex GPT 聊天GPT"],
  [/Anthropic|Claude/i, "Anthropic Claude 克劳德"],
  [/智谱|BigModel|Z\.ai/i, "智谱 BigModel GLM Z.ai"],
  [/月之暗面|Kimi/i, "月之暗面 Kimi Moonshot"],
  [/DeepSeek|深度求索/i, "DeepSeek 深度求索"],
  [/阿里/i, "阿里 Alibaba"],
  [/Qwen|千问/i, "千问 Qwen"],
  [/字节/i, "字节 ByteDance"],
  [/豆包|Doubao/i, "豆包 Doubao"],
  [/GitHub|Copilot/i, "GitHub Copilot"],
  [/Google|Gemini|谷歌/i, "Google 谷歌 Gemini 双子座"],
  [/MiniMax|稀宇/i, "MiniMax 稀宇"],
  [/小米|MiMo/i, "小米 Xiaomi MiMo"],
];
function planSearchBlob(p) {
  const identity = [p.vendor, p.plan].join(" ");
  const aliases = SEARCH_VENDOR_ALIASES.filter(([pattern]) => pattern.test(identity)).map(([, words]) => words);
  return foldSearch([p.vendor, p.plan, resolvedField(p, "models"), resolvedField(p, "tools"), resolvedField(p, "quota"), resolvedField(p, "note"), ...aliases].join(" "));
}
function queryHit(blob, q) {
  const terms = String(q || "").trim().split(/\s+/).map(foldSearch).filter(Boolean);
  return terms.every((term) => blob.includes(term));
}

/* ---------- 明暗主题切换（暗 → 亮 → 跟随系统 循环） ---------- */
const THEME_KEY = "cp-theme";
let themeMode = "system";
function readThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return ["dark", "light", "system"].includes(saved) ? saved : "system";
  } catch (e) { return "system"; }
}
function applyTheme(mode) {
  mode = ["dark", "light", "system"].includes(mode) ? mode : "system";
  themeMode = mode;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const eff = mode === "system" ? (sysDark ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = eff;
  document.documentElement.dataset.themeMode = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* 存储受限只影响回访记忆。 */ }
  refreshPalette();
  const browserColor = (getComputedStyle(document.documentElement).getPropertyValue("--paper") || "").trim()
    || (eff === "dark" ? "#131511" : "#fbfbf8");
  /* 两个带系统 media 的标签都写实际主题色，手动选择主题也能更新浏览器外观。 */
  qsa('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", browserColor));
  const btn = byId("themeBtn");
  if (btn) {
    btn.innerHTML = mode === "dark" ? icon("moon") : mode === "light" ? icon("sun") : icon("computer");
    const name = mode === "dark" ? "暗色" : mode === "light" ? "亮色" : "跟随系统";
    const nextName = mode === "dark" ? "亮色" : mode === "light" ? "跟随系统" : "暗色";
    const current = mode === "system" ? name + "（当前" + (eff === "dark" ? "暗色" : "亮色") + "）" : name;
    const label = "当前主题：" + current + "；点击切换为" + nextName;
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
}
function rerenderCharts() {
  const renderers = { chartPersonal: renderPersonalChart, chartTeam: renderTeamChart,
    chartTokens: renderTokensChart, chartApi: renderApiChart, chartRank: renderRankChart, chartPublicBenchmark: renderPublicBenchmarkChart };
  Object.entries(renderers).forEach(([id, render]) => {
    if (!chartCache[id]) return;
    /* 单图失败不中断其余图的重绘（主题切换/历史恢复会一次重画全部） */
    try { render(); }
    catch (err) { console.error("[chart] " + id, err); }
  });
  markChartsForResize();
  resizeVisibleCharts();
}
/* 测量固定页头，供锚点间距和当前章节判断共用；不读取或渲染图表内容。 */
let headerHeight = 0;
let navigationInitialized = false;
function syncHeaderHeight() {
  const header = qs(".topbar");
  if (!header || typeof header.getBoundingClientRect !== "function") return;
  const height = Math.ceil(header.getBoundingClientRect().height);
  if (!Number.isFinite(height) || height <= 0) return;
  headerHeight = height;
  const style = document.documentElement.style;
  if (style && typeof style.setProperty === "function") style.setProperty("--header-height", height + "px");
}
function updateActiveNav() {
  const links = Array.from(qsa('.topnav a[href^="#"]'));
  const previous = links.find((link) => link.getAttribute("aria-current") === "location");
  const scrollPadding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top"));
  const readingTop = Number.isFinite(scrollPadding) ? scrollPadding : headerHeight;
  let active = null, closestTop = -Infinity;
  links.forEach((link) => {
    const target = byId((link.getAttribute("href") || "").slice(1));
    if (!target || target.hidden || typeof target.getBoundingClientRect !== "function") return;
    const top = target.getBoundingClientRect().top;
    /* 章节顶部的实际留白进入阅读区即属于本节，容纳字体加载后的轻微布局变化。 */
    const paddingTop = parseFloat(getComputedStyle(target).getPropertyValue("padding-top")) || 0;
    if (Number.isFinite(top) && top <= readingTop + paddingTop && top >= closestTop) {
      closestTop = top;
      active = link;
    }
  });
  links.forEach((link) => {
    const on = link === active;
    link.classList.toggle("active", on);
    if (on) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  /* 窄屏导航横向滚动时让当前章节露出来，只在章节变化时调整。 */
  const nav = qs(".topnav");
  if (active && active !== previous && nav && nav.scrollWidth > nav.clientWidth) {
    const box = /** @type {HTMLElement} */ (active).getBoundingClientRect(), bounds = nav.getBoundingClientRect();
    if (box.left < bounds.left + 8) nav.scrollLeft += box.left - bounds.left - 8;
    else if (box.right > bounds.right - 8) nav.scrollLeft += box.right - bounds.right + 8;
  }
}
function initPageNavigation() {
  if (navigationInitialized) return;
  navigationInitialized = true;
  let readingPosition = null;
  const rememberReadingPosition = () => {
    const active = qs('.topnav a[aria-current="location"]');
    const target = active && byId((active.getAttribute("href") || "").slice(1));
    const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
    readingPosition = target ? { target, offset:target.getBoundingClientRect().top - padding } : null;
  };
  const refreshHeader = () => { syncHeaderHeight(); updateActiveNav(); rememberReadingPosition(); };
  const refreshLayout = () => {
    const previous = readingPosition;
    syncHeaderHeight();
    if (previous && previous.target.isConnected !== false && window.scrollY > 0) {
      const padding = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("scroll-padding-top")) || headerHeight;
      const delta = previous.target.getBoundingClientRect().top - padding - previous.offset;
      if (Math.abs(delta) > 1) window.scrollTo({ top:window.scrollY + delta, behavior:"instant" });
    }
    updateActiveNav(); rememberReadingPosition();
  };
  refreshHeader();
  const header = qs(".topbar");
  if (header && typeof ResizeObserver === "function") new ResizeObserver(refreshLayout).observe(header);
  window.addEventListener("resize", refreshLayout, { passive: true });
  let pending = false;
  window.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    const update = () => { pending = false; updateActiveNav(); rememberReadingPosition(); };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(update);
    else update();
  }, { passive: true });
  window.addEventListener("hashchange", updateActiveNav);
  /* 加载完成后只更新当前位置；用户已滚动时不重新跳到原分享锚点。 */
  window.addEventListener("load", refreshHeader, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshLayout, refreshHeader);
}
function initTheme() {
  applyTheme(readThemeMode());
  initPageNavigation();
  const btn = byId("themeBtn");
  if (btn) btn.addEventListener("click", () => {
    const order = ["dark", "light", "system"];
    applyTheme(order[(order.indexOf(themeMode) + 1) % 3]);
    rerenderCharts();
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if (themeMode === "system") { applyTheme("system"); rerenderCharts(); }
  };
  /* 旧版 Safari（<14）只支持 addListener，此处做回退 */
  if (mq.addEventListener) mq.addEventListener("change", onSchemeChange);
  else if (mq.addListener) mq.addListener(onSchemeChange);
}

/* ---------- 统计卡 ---------- */
function planLabel(p) {
  const sv = shortVendor(p.vendor);
  const words = sv.split(/[\s（(]/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];
  const plan = p.plan;
  if (first && plan.toLowerCase().startsWith(first.toLowerCase())) return plan;
  if (last && plan.toLowerCase().startsWith(last.toLowerCase())) {
    return sv.slice(0, sv.lastIndexOf(last)).trim() + " " + plan;
  }
  return sv + " " + plan;
}

/* 每百万 tokens 成本的档位阈值：排行图配色、排行说明与额度表共用（≤0.3 低 / ≤1 中 / >1 高） */
function cpmTier(v) {
  return v == null ? "na" : v <= 0.3 ? "lo" : v <= 1 ? "mid" : "hi";
}

function renderStats() {
  const summary = byId("priceAuditSummary");
  if (summary) {
    const checks = Object.values(PRICE_CHECKS.rows);
    const pending = checks.filter((r) => r.status === "unverified").length;
    const retired = checks.filter((r) => r.status === "retired").length;
    summary.textContent = `价格逐条核查：${PRICE_CHECKS.checkedAt} · ${checks.length} 条记录，${checks.length - pending - retired} 条已确认（含询价），${pending} 条待核实，${retired} 条停售。待核实历史价仅保留作参考，不参与推荐与排行。`;
  }
  const vendors = new Set(PLANS.map((p) => p.vendor));
  const freeCnt = PLANS.filter(isFreeCodingEntry).length;
  const paid = PLANS.filter((p) => isPriceConfirmed(p) && isPersonalMonthly(p));
  const minCny = paid.length ? Math.min(...paid.map((p) => cnyOf(p, "M"))) : null;
  const maxCny = paid.length ? Math.max(...paid.map((p) => cnyOf(p, "M"))) : null;
  const minP = minCny == null ? null : paid.find((p) => cnyOf(p, "M") === minCny);
  const maxP = maxCny == null ? null : paid.find((p) => cnyOf(p, "M") === maxCny);
  const items = [
    { icon: "globe", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "stack", num: PLANS.filter(isOnSalePlan).length, lbl: "公开标价记录", sub: "含待核实历史价，见来源栏" },
    { icon: "gift", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "tag", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    minP && { icon: "arrow-down-circle", lbl: "最低月费", num: fmtCNY(minCny), sub: "/月 · " + planLabel(minP) },
    maxP && { icon: "arrow-up-circle", lbl: "最高月费", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ].filter(Boolean);
  byId("statsRow").innerHTML = items
    .map((i) => `<div><dt>${icon(i.icon)}${esc(i.lbl)}</dt><dd>${esc(i.num)}${i.sub ? `<small title="${esc(i.sub)}">${esc(i.sub)}</small>` : ""}</dd></div>`)
    .join("");
}
