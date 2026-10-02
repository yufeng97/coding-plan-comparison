#!/usr/bin/env node
/* ============================================================
 * 数据校验：node scripts/validate-data.js
 * 校验 js/data.js 的结构、类型与引用一致性。
 * 退出码：0 = 通过（可有警告）；1 = 存在错误。
 * 每日巡检任务在修改 data.js 后必须运行本脚本，
 * 失败时应从 js/data.js.bak 恢复。
 * ============================================================ */
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const errors = [];
const warns = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const warn = (cond, msg) => { if (!cond) warns.push(msg); };
const note = (msg) => warns.push(msg);

/* 载入数据（data.js 为纯常量声明，无 DOM 依赖） */
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "js/data.js"), "utf8") +
    "\n;globalThis.__D={RATE_USD_CNY,PLANS,METRICS_RAW,ESTIMATES,PLAN_TOKENS,DYNAMICS,API_PRICES,PAYG_REFERENCES,SOURCES,MODEL_ROLES,matchModelRoles,isRetiredPlan,isFreeCodingEntry};",
  sandbox,
  { filename: "js/data.js" }
);
const { RATE_USD_CNY, PLANS, METRICS_RAW, ESTIMATES, PLAN_TOKENS, DYNAMICS, API_PRICES, PAYG_REFERENCES, SOURCES, MODEL_ROLES, matchModelRoles, isRetiredPlan, isFreeCodingEntry } = sandbox.__D;

const CATS = ["official", "tool", "cloud", "team"];
const REGIONS = ["cn", "intl"];

/* ---- PLANS ---- */
const planKeys = new Set();
for (const p of PLANS) {
  const key = (p.vendor || "?") + "|" + (p.plan || "?");
  check(!planKeys.has(key), `PLANS 重复条目: ${key}`);
  planKeys.add(key);
  check(typeof p.vendor === "string" && !!p.vendor, `PLANS 缺 vendor: ${key}`);
  check(typeof p.plan === "string" && !!p.plan, `PLANS 缺 plan: ${key}`);
  check(CATS.includes(p.cat), `PLANS cat 非法(${p.cat}): ${key}`);
  check(REGIONS.includes(p.region), `PLANS region 非法(${p.region}): ${key}`);
  check(p.cur === "USD" || p.cur === "CNY", `PLANS cur 非法(${p.cur}): ${key}`);
  check(p.priceM == null || typeof p.priceM === "number", `PLANS priceM 类型错误: ${key}`);
  check(p.priceY == null || typeof p.priceY === "number", `PLANS priceY 类型错误: ${key}`);
  check(p.priceM !== undefined, `PLANS 缺 priceM 字段(应为数字或 null): ${key}`);
  check(typeof p.quota === "string" && p.quota.length > 4, `PLANS quota 缺失/过短: ${key}`);
  check(typeof p.url === "string" && p.url.startsWith("http"), `PLANS url 非法: ${key}`);
  if (p.priceM != null && p.priceM > 0 && p.priceY != null) warn(p.priceY <= p.priceM, `PLANS 年付折月高于月付: ${key}`);
  if (p.priceM == null) note(`PLANS 无标价（按量/定制）: ${key}`);
  if (!isRetiredPlan(p) && typeof p.url === "string" && /web\.archive\.org/i.test(p.url)) {
    errors.push(`在售计划来源不能用网页存档: ${key}`);
  }
}

/* isRetiredPlan / isFreeCodingEntry 定义在 js/data.js 中（同一份代码，VM 沙箱直接复用）。
   每日巡检改完 data.js 后必须跑本脚本。 */
const NOT_CODING_FREE = [
  ["Lovable", "Free"],
  ["Bolt.new", "Free"],
  ["Anthropic", "Claude Free"],
  ["xAI", "Grok Free"],
  ["ZenMux", "Free"],
];
for (const [vendor, plan] of NOT_CODING_FREE) {
  const p = PLANS.find((x) => x.vendor === vendor && x.plan === plan);
  if (!p) continue;
  const noted = (p.note || "").includes("不列入");
  check(p.priceM === 0 && (isRetiredPlan(p) || noted), `不能当 Coding Agent 的免费档须标明不列入或已下架: ${vendor}|${plan}`);
}
const freeCoding = PLANS.filter(isFreeCodingEntry);

/* ---- 模型用法（帮我选，不是跑分）---- */
check(Array.isArray(MODEL_ROLES) && MODEL_ROLES.length >= 8, "缺少 MODEL_ROLES");
const roleIds = new Set();
for (const r of MODEL_ROLES || []) {
  check(!roleIds.has(r.id), `MODEL_ROLES 重复 id: ${r.id}`);
  roleIds.add(r.id);
  check(r.re && typeof r.re.test === "function" && typeof r.re.source === "string", `MODEL_ROLES re 不是正则: ${r.id}`);
  check(r.task === "hard" || r.task === "daily", `MODEL_ROLES task 非法: ${r.id}`);
  check(r.burn === "fast" || r.burn === "slow" || r.burn === "same", `MODEL_ROLES burn 非法: ${r.id}`);
  check(r.band === "A" || r.band === "B" || r.band === "C", `MODEL_ROLES band 非法: ${r.id}`);
  check(typeof r.name === "string" && r.name.length > 1, `MODEL_ROLES 缺 name: ${r.id}`);
  check(typeof r.reason === "string" && r.reason.length > 8, `MODEL_ROLES reason 过短: ${r.id}`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(r.asOf || ""), `MODEL_ROLES asOf 非法: ${r.id}`);
}
const idsOf = (text) => matchModelRoles(text).map((r) => r.id);
const flashOnly = idsOf("GLM-5.3-Flash");
check(flashOnly.includes("flash") && !flashOnly.includes("glm-5"), "仅 Flash 的写法不应匹配 GLM-5.3 复杂任务角色");
const glmBoth = idsOf("GLM-5.3、GLM-5.3-Flash");
check(glmBoth.includes("glm-5") && glmBoth.includes("flash"), "GLM-5.3 与 Flash 应能同时匹配");
const claudeFree = idsOf("Claude Sonnet 5 / Haiku 4.5（不含 Opus）");
check(!claudeFree.includes("claude-opus") && claudeFree.includes("sonnet"), "不含 Opus 的套餐不应匹配 Opus");
const claudePro = idsOf("Claude Opus 5.5 / Sonnet 5 / Haiku 4.5（Fable 5.1 需 usage credits）");
check(claudePro.includes("claude-opus") && !claudePro.includes("claude-fable"), "需另购 credits 的 Fable 不应算进套餐");
check(idsOf("Grok 4.5–4.7、Composer 2.5").includes("grok"), "Cursor 的 Grok 4.5–4.7 应匹配日常角色");
const opusRole = MODEL_ROLES.find((r) => r.id === "claude-opus");
const grokRole = MODEL_ROLES.find((r) => r.id === "grok");
check(opusRole && opusRole.task === "hard" && opusRole.burn === "fast", "Claude Opus 应为复杂任务、消耗快");
check(grokRole && grokRole.task === "daily" && grokRole.burn === "slow", "Grok 应为日常、消耗慢");

/* ---- 指标条目（METRICS_RAW + ESTIMATES）---- */
const idx = new Map(PLANS.map((p) => [p.vendor + "|" + p.plan, p]));
const allMetrics = [
  ...METRICS_RAW.map((m) => ({ ...m, isEst: false, arr: "METRICS_RAW" })),
  ...ESTIMATES.map((m) => ({ ...m, isEst: true, arr: "ESTIMATES" })),
];
const metricKeys = new Set();
for (const m of allMetrics) {
  const key = (m.vendor || "?") + "|" + (m.plan || "?") + "|" + (m.model || "?");
  check(!metricKeys.has(key), `${m.arr} 重复条目: ${key}`);
  metricKeys.add(key);
  const kinds = [m.wkLowM != null, m.reqPerWk != null, m.creditUSD != null, m.creditCNY != null].filter(Boolean).length;
  check(kinds === 1, `额度口径必须且只能有一种(周tokens/请求数/creditsUSD/creditsCNY): ${key}`);
  if (m.wkLowM != null) {
    check(typeof m.wkLowM === "number" && m.wkLowM > 0, `wkLowM 非法: ${key}`);
    check(m.wkHighM == null || (typeof m.wkHighM === "number" && m.wkHighM >= m.wkLowM), `wkHighM < wkLowM: ${key}`);
    check(typeof m.apiIn === "number" && typeof m.apiOut === "number" && typeof m.apiCache === "number",
      `周tokens 制缺 apiIn/apiOut/apiCache: ${key}`);
  }
  if (m.reqPerWk != null) check(typeof m.reqPerWk === "number" && m.reqPerWk > 0, `reqPerWk 非法: ${key}`);
  if (m.creditUSD != null) check(typeof m.creditUSD === "number" && m.creditUSD > 0, `creditUSD 非法: ${key}`);
  if (m.creditCNY != null) check(typeof m.creditCNY === "number" && m.creditCNY > 0, `creditCNY 非法: ${key}`);
  if (Array.isArray(m.ref)) {
    const p = idx.get(m.ref[0] + "|" + m.ref[1]);
    check(!!p, `ref 无法解析(PLANS 中不存在): ${m.ref.join("|")}`);
    if (p && typeof m.priceM === "number" && typeof p.priceM === "number") {
      warn(Math.abs(m.priceM - p.priceM) < 0.01, `ref 已解析但价格与 PLANS 不一致(条目 ${m.priceM} vs ${p.priceM}): ${key}`);
    }
  } else {
    check(typeof m.priceM === "number", `无 ref 且缺 priceM: ${key}`);
  }
  if (m.isEst) check(!!m.method && !!m.confidence, `估算条目缺 method/confidence: ${key}`);
  warn(!/多模型|混合|全系|全模型/.test(m.model || ""), `模型名仍含糊（多模型/混合/全系/全模型）: ${key}`);
}
/* ref 覆盖率（提醒：指标条目应尽量通过 ref 指向 PLANS 单一价格源） */
const noRef = allMetrics.filter((m) => !Array.isArray(m.ref)).length;
if (noRef > 0) note(`${noRef} 个指标条目未设 ref（价格未与 PLANS 单一数据源对齐）`);

/* ---- API_PRICES ---- */
for (const a of API_PRICES) {
  const key = (a.vendor || "?") + " " + (a.model || "?");
  check(a.cur === "USD" || a.cur === "CNY", `API_PRICES cur 非法: ${key}`);
  if (a.cur === "USD") check(typeof a.inUSD === "number" && typeof a.outUSD === "number", `缺 inUSD/outUSD: ${key}`);
  if (a.cur === "CNY") check(typeof a.inCNY === "number" && typeof a.outCNY === "number", `缺 inCNY/outCNY: ${key}`);
  check(typeof a.label === "string", `缺 label: ${key}`);
  check(typeof a.url === "string" && a.url.startsWith("http"), `url 非法: ${key}`);
}

/* ---- 额度表官方按量对照 ---- */
check(Array.isArray(PAYG_REFERENCES) && PAYG_REFERENCES.length > 0, "缺少 PAYG_REFERENCES");
const paygKeys = new Set();
for (const s of PAYG_REFERENCES || []) {
  const key = (s.vendor || "?") + "|" + (s.model || "?");
  check(!paygKeys.has(key), `PAYG_REFERENCES 重复: ${key}`);
  paygKeys.add(key);
  check(s.cur === "USD" || s.cur === "CNY", `PAYG cur 非法: ${key}`);
  check(typeof s.apiIn === "number" && s.apiIn >= 0, `PAYG apiIn 非法: ${key}`);
  check(typeof s.apiOut === "number" && s.apiOut > 0, `PAYG apiOut 非法: ${key}`);
  check(typeof s.apiCache === "number" && s.apiCache >= 0 && s.apiCache <= s.apiIn, `PAYG 缓存价应介于 0 与输入价之间: ${key}`);
  check(typeof s.note === "string" && s.note.length > 8, `PAYG note 过短: ${key}`);
  check(typeof s.source === "string" && s.source, `PAYG 缺 source: ${key}`);
  check(typeof s.url === "string" && s.url.startsWith("http"), `PAYG url 非法: ${key}`);
  const fold = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
  const want = fold(s.model);
  const priceOf = (a) => a.cur === "USD" ? [a.inUSD, a.outUSD] : [a.inCNY, a.outCNY];
  const candidates = API_PRICES.filter((a) => fold(a.model) === want || fold(a.label) === want);
  let named = candidates.find((a) => a.vendor === s.vendor) || null;
  if (!named) {
    const official = candidates.filter((a) => !/\[|硅基/.test((a.label || "") + (a.vendor || "")));
    if (official.length === 1) named = official[0];
  }
  if (!named) {
    const priced = API_PRICES.filter((a) => a.vendor === s.vendor && a.cur === s.cur && priceOf(a)[0] === s.apiIn && priceOf(a)[1] === s.apiOut);
    if (priced.length === 1) named = priced[0];
  }
  if (named) {
    const [namedIn, namedOut] = priceOf(named);
    check(named.cur === s.cur && namedIn === s.apiIn && namedOut === s.apiOut, `PAYG 与 API_PRICES 同型号价格不一致: ${key}`);
  } else note(`PAYG 未在 API_PRICES 单列同价行（Flash 等可只写在按量对照）: ${key}`);
}

/* ---- PLAN_TOKENS ---- */
for (const t of PLAN_TOKENS) {
  const key = t.plan + "·" + (t.model || "?");
  check(typeof t.lowM === "number" && t.lowM > 0, `lowM 非法: ${key}`);
  check(typeof t.highM === "number" && t.highM >= t.lowM, `highM 非法: ${key}`);
  let priceCNY = t.priceCNY != null ? t.priceCNY : t.priceUSD != null ? t.priceUSD * RATE_USD_CNY : null;
  if (Array.isArray(t.ref)) {
    const p = idx.get(t.ref[0] + "|" + t.ref[1]);
    check(!!p, `PLAN_TOKENS ref 无法解析: ${t.ref.join("|")}`);
    if (p) priceCNY = p.cur === "USD" ? p.priceM * RATE_USD_CNY : p.priceM;
  }
  check(priceCNY != null, `缺价格(且无有效 ref): ${key}`);
  check(typeof t.url === "string" && t.url.startsWith("http"), `url 非法: ${key}`);
}

/* ---- DYNAMICS ---- */
const dates = [];
for (const d of DYNAMICS) {
  check(/^\d{4}-\d{2}(-\d{2})?$/.test(d.date || ""), `动态日期格式非法(${d.date}): ${trunc(d.text)}`);
  check(typeof d.text === "string" && d.text.length > 8, `动态 text 缺失/过短`);
  check(typeof d.source === "string" && !!d.source, `动态缺 source`);
  check(typeof d.url === "string" && d.url.startsWith("http"), `动态缺 url`);
  if (d.date) dates.push(d.date);
}
const ym = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
warn(dates.length === 0 || dates.some((x) => x.startsWith(ym)), `动态中缺少本月(${ym})条目`);
function trunc(s) { return (s || "").slice(0, 30); }

/* ---- SOURCES ---- */
for (const g of SOURCES) {
  check(typeof g.group === "string" && Array.isArray(g.urls) && g.urls.length > 0, `SOURCES 分组异常: ${g.group || "?"}`);
  for (const u of g.urls) check(u.startsWith("http"), `SOURCES url 非法: ${u}`);
}

/* ---- index.html 引用与文件存在性 ---- */
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const f of ["js/data.js", "js/metrics.js", "js/app-core.js", "js/app-charts.js", "js/app-picker.js", "js/app-tables.js", "js/app-init.js", "css/style.css", "libs/echarts.min.js", "libs/fonts/fonts.css"]) {
  check(html.includes(f), `index.html 未引用: ${f}`);
  check(fs.existsSync(path.join(root, f)), `文件不存在: ${f}`);
}
check(html.includes("chartPersonal") && html.includes("metricsBody") && html.includes("dynamicsList"),
  "index.html 缺少关键 DOM 容器");
check(html.includes("cmpBar") && html.includes("cmpModal") && html.includes("cmpTable"),
  "index.html 缺少并排对比容器");

/* ---- 报告 ---- */
console.log(`规模：PLANS ${PLANS.length} · 指标 ${allMetrics.length} · API ${API_PRICES.length} · 按量对照 ${PAYG_REFERENCES.length} · 免费档 ${PLANS.filter((p) => p.priceM === 0).length} · 可用 Coding 入口 ${freeCoding.length} · 动态 ${DYNAMICS.length} · 来源组 ${SOURCES.length}`);
if (errors.length) {
  console.error(`\n❌ 校验失败（${errors.length} 项错误）:`);
  errors.forEach((e) => console.error("  ✗ " + e));
  if (warns.length) { console.warn(`\n⚠️ 另有 ${warns.length} 项警告:`); warns.forEach((w) => console.warn("  ⚠ " + w)); }
  process.exit(1);
}
if (warns.length) { console.warn(`⚠️ ${warns.length} 项警告:`); warns.forEach((w) => console.warn("  ⚠ " + w)); }
console.log("✅ 数据校验通过");
