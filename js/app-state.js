/* ============ Coding Plan 比价中心 — 状态与 URL ============ */
"use strict";
const DEBUG_MODE = new URLSearchParams(location.search).has("debug");
const PERSONAL_DEFAULT_LIMIT = 20;
const CMP_MAX = 4;
/** @type {{cat:string, region:string, billing:string, q:string, limit:number|null}} */
const personalState = { cat:"all", region:"all", billing:"M", q:"", limit:PERSONAL_DEFAULT_LIMIT };
const rankState = { tier:"flagship", scope:"official" };
const pickerState = { budget:"200", region:"cn", tool:"any", task:"both" };
const tableState = { search:"", cat:"all", region:"all", sortKey:"priceM", sortDir:1 };
/** @type {{items: typeof PLANS}} */
const cmpState = { items:[] };
const metricsState = { model:"all", ver:"all", sortKey:"cpm", sortDir:1 };
const APP_DEFAULTS = { personal:{...personalState}, rank:{...rankState}, picker:{...pickerState}, table:{...tableState}, metrics:{...metricsState} };
/* 额度表模型筛选的合法取值（与 populateModelFilter 的数据源一致），供 URL 白名单校验 */
const MODEL_FILTER_VALUES = new Set([
  ...METRICS_RAW.map((m) => m.model),
  ...ESTIMATES.map((m) => m.model),
  ...PAYG_REFERENCES.map((s) => s.model),
]);
let URL_RESTORING = false;
let stateUpdateDepth = 0;

/* 用户操作提交状态并持久化；渲染、主题和窗口缩放不写历史条目。 */
function updateAppState(change, render) {
  stateUpdateDepth++;
  try { change(); if (render) render(); }
  finally {
    stateUpdateDepth--;
    if (stateUpdateDepth === 0) syncUrl();
  }
}

/* ---------- URL 状态化：筛选/排序可分享、刷新可恢复 ----------
 * 用户操作通过 updateAppState 写入 URL，渲染函数保持无历史副作用。
 * 每次解析先恢复默认值，再应用带白名单校验的参数。
 * file:// 直开时 history 不可写，降级为仅当前页生效。 */
const URL_KEYS = {
  /* 「帮我选」（最常被分享的一组） */
  budget: () => pickerState.budget,
  region: () => pickerState.region,
  tool: () => pickerState.tool,
  task: () => pickerState.task,
  /* 个人订阅价格全景 */
  pcat: () => personalState.cat,
  pregion: () => personalState.region,
  pbilling: () => personalState.billing,
  pq: () => personalState.q,
  plimit: () => personalState.limit == null ? "all" : String(personalState.limit),
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
  cmp: () => cmpState.items.map((p) => p.id).join(";"),
};
const URL_DEFAULTS = Object.fromEntries(Object.entries(URL_KEYS).map(([k,get])=>[k,get()]));
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

function applyUrlState() {
  Object.assign(personalState, APP_DEFAULTS.personal);
  Object.assign(rankState, APP_DEFAULTS.rank);
  Object.assign(pickerState, APP_DEFAULTS.picker);
  Object.assign(tableState, APP_DEFAULTS.table);
  Object.assign(metricsState, APP_DEFAULTS.metrics);
  cmpState.items = [];
  const p = new URLSearchParams(location.search);
  const pick = (k, valid, target, key) => {
    const v = p.get(k);
    if (v != null && (!valid || valid.has(v))) target[key] = v;
  };
  pick("budget", URL_VALID.budget, pickerState, "budget");
  pick("region", URL_VALID.region, pickerState, "region");
  pick("tool", URL_VALID.tool, pickerState, "tool");
  pick("task", URL_VALID.task, pickerState, "task");
  pick("pcat", URL_VALID.pcat, personalState, "cat");
  pick("pregion", URL_VALID.pregion, personalState, "region");
  pick("pbilling", URL_VALID.pbilling, personalState, "billing");
  if (p.get("pq") != null) personalState.q = p.get("pq");
  if (URL_VALID.plimit.has(p.get("plimit"))) personalState.limit = p.get("plimit") === "all" ? null : PERSONAL_DEFAULT_LIMIT;
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
  if (p.get("mmodel") != null) {
    /* 与其他参数一样过白名单：URL 里的垃圾模型值不入库，也就不会经 syncUrl 写回地址栏 */
    const v = p.get("mmodel");
    if (MODEL_FILTER_VALUES.has(v)) metricsState.model = v;
  }
  pick("mver", URL_VALID.mver, metricsState, "ver");
  const ms = p.get("msort");
  if (ms) {
    const [key, dir] = ms.split(":");
    if (URL_VALID.msortKeys.has(key)) { metricsState.sortKey = key; metricsState.sortDir = dir === "-1" ? -1 : 1; }
  }
  const cmp = p.get("cmp");
  if (cmp != null) {
    /* 仅保留可解析的档位，去重后按上限截断；支持旧的厂商|计划链接。 */
    cmpState.items = cmp.split(";").map((s) => {
      const [vendor, plan] = s.split("|");
      return findPlanReference(plan == null ? s : [vendor, plan]);
    }).filter((x, i, all) => x && all.indexOf(x) === i).slice(0, CMP_MAX);
  }
}

function syncUrl() {
  if (URL_RESTORING) return;
  /* 仅写入仍受支持的状态，旧链接中的 country 等退役参数会在首次渲染时清除。 */
  const p = new URLSearchParams();
  if (DEBUG_MODE) p.set("debug", "1");
  for (const [k, get] of Object.entries(URL_KEYS)) {
    const v = String(get());
    if (v !== String(URL_DEFAULTS[k]) && v !== "") p.set(k, v);
  }
  const qs = p.toString();
  const hash = location.hash || "";
  const next = location.pathname + (qs ? "?" + qs : "") + hash;
  if (next === location.pathname + location.search + hash) return;
  try { history.replaceState(null, "", next); }
  catch (e) { /* file:// 直开时地址栏不可写，状态仅在当前页生效 */ }
}

/* 恢复 URL 状态后，把输入框/下拉/chip 的显示值同步到状态 */
function syncControlsFromState() {
  syncPickerChips(); /* renderPicker 渲染时也会自愈同步，这里先跑一次避免首帧高亮错档 */
  setChipPressed(qsa("#chipCat .chip"), (chip) => chip.dataset.cat === personalState.cat);
  setChipPressed(qsa("#chipRegion .chip"), (chip) => chip.dataset.region === personalState.region);
  setChipPressed(qsa("#chipBilling .chip"), (chip) => chip.dataset.billing === personalState.billing);
  const setVal = (id, v) => { const el = byId(id); if (el) el.value = v; };
  setVal("chartSearch", personalState.q);
  setVal("searchInput", tableState.search);
  setVal("selectCat", tableState.cat);
  setVal("selectRegion", tableState.region);
  setVal("metricsModel", metricsState.model);
  setVal("metricsVer", metricsState.ver); /* 模型下拉在 populateModelFilter 填充后再设值 */
  syncRankChips();
}
