#!/usr/bin/env node
/* ============================================================
 * 数据校验：node scripts/build/validate-data.js
 * 校验 js/data.js 的结构、类型与引用一致性。
 * 退出码：0 = 通过（可有警告）；1 = 存在错误。
 * 每日巡检任务在修改 data.js 后必须运行本脚本，
 * 失败时应从 js/data.js.bak 恢复。
 * ============================================================ */
const vm = require("vm");
const fs = require("fs");
const path = require("path");

function isISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 校验内存中的候选源码；调用者可在所有输出落盘前使用同一套规则。
 * @param {{workspace?:string, source?:string, now?:string|number|Date}} options  now 仅供测试注入「今天」 */
function validateData(options = {}) {
  const root = path.resolve(options.workspace || path.join(__dirname, "..", ".."));

  const errors = [];
  const warns = [];
  const notes = [];
  const check = (cond, msg) => { if (!cond) errors.push(msg); };
  const warn = (cond, msg) => { if (!cond) warns.push(msg); };
  /* note 用于"设计内状态"的说明（如按量/定制无标价、Flash 只写在按量对照），
     不计入警告——警告留给巡检真正需要人工确认的问题。 */
  const note = (msg) => notes.push(msg);
  const finiteNonnegative = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const finitePositive = (v) => finiteNonnegative(v) && v > 0;

  /* 载入数据（data.js 为纯常量声明，无 DOM 依赖） */
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    (options.source ?? fs.readFileSync(path.join(root, "js/data.js"), "utf8")) +
      "\n;globalThis.__D={RATE_USD_CNY,RATE_INR_CNY,META,PRICE_CHECKS,PLANS,METRICS_RAW,ESTIMATES,PLAN_TOKENS,DYNAMICS,API_PRICES,PAYG_REFERENCES,SOURCES,UNCERTAIN,MODEL_ROLES,matchModelRoles,isRetiredPlan,isFreeCodingEntry,isOnSalePlan,isPersonalMonthly,resolvedField,hasOwnClient,offerable,findPlanReference,displayPriceReason,INTERNAL_TEXT_RE};",
    sandbox,
    { filename: "js/data.js" }
  );
  const { RATE_USD_CNY, RATE_INR_CNY, META, PRICE_CHECKS, PLANS, METRICS_RAW, ESTIMATES, PLAN_TOKENS, DYNAMICS, API_PRICES, PAYG_REFERENCES, SOURCES, UNCERTAIN, MODEL_ROLES, matchModelRoles, isRetiredPlan, isFreeCodingEntry, isOnSalePlan, isPersonalMonthly, resolvedField, hasOwnClient, offerable, findPlanReference, displayPriceReason, INTERNAL_TEXT_RE } = sandbox.__D;

  const CATS = ["official", "tool", "cloud", "team"];
  const REGIONS = ["cn", "intl"];
  check(finitePositive(RATE_USD_CNY), "RATE_USD_CNY 必须为有限正数");
  check(finitePositive(RATE_INR_CNY), "RATE_INR_CNY 必须为有限正数");
  check(META && isISODate(META.updated), "META.updated 缺失或日期非法");
  check(META && isISODate(META.rateAsOf), "META.rateAsOf 缺失或日期非法（页面汇率说明引用该字段）");
  check(META && /^https:\/\//.test(META.rateSource || ""), "META.rateSource 缺失或格式非法");

  /* ---- 每条价格的核查状态与来源 ---- */
  const priceKeys = [
    ...PLANS.map((p) => "plan:" + p.id),
    ...API_PRICES.map((p) => "api:" + p.vendor + "|" + p.model),
    ...PAYG_REFERENCES.map((p) => "payg:" + p.vendor + "|" + p.model),
  ];
  check(PRICE_CHECKS && isISODate(PRICE_CHECKS.checkedAt), "PRICE_CHECKS.checkedAt 缺失或日期非法");
  check(PRICE_CHECKS.checkedAt <= META.updated, "核价日期不能晚于数据版本日期");
  check(Object.keys(PRICE_CHECKS.rows).length === priceKeys.length, "价格核查记录数与库存不一致");
  for (const key of priceKeys) {
    const row = PRICE_CHECKS.rows[key];
    check(!!row, "缺少价格核查记录: " + key);
    if (!row) continue;
    check(["verified", "changed", "unverified", "retired", "custom"].includes(row.status), "核价状态非法: " + key);
    check(isISODate(row.checkedAt) && row.checkedAt <= PRICE_CHECKS.checkedAt, "核价日期非法: " + key);
    check(typeof row.reason === "string" && !!row.reason.trim(), "缺少核价说明: " + key);
    check(Array.isArray(row.sourceIds) && !!row.sourceIds.length, "缺少核价来源: " + key);
    for (const id of row.sourceIds || []) check(!!PRICE_CHECKS.sources[id], "核价来源无法解析: " + key + " / " + id);
  }
  for (const key of Object.keys(PRICE_CHECKS.rows)) check(priceKeys.includes(key), "残留核价记录: " + key);
  for (const [id, source] of Object.entries(PRICE_CHECKS.sources)) {
    check(/^https:\/\//.test(source.url || ""), "核价来源 URL 非法: " + id);
    check(typeof source.evidence === "string" && !!source.evidence.trim(), "核价来源缺少证据: " + id);
  }

  /* ---- PLANS ---- */
  const planKeys = new Set();
  const planIds = new Set();
  for (const p of PLANS) {
    const key = (p.vendor || "?") + "|" + (p.plan || "?");
    check(!planKeys.has(key), `PLANS 重复条目: ${key}`);
    planKeys.add(key);
    check(typeof p.id === "string" && /^plan-[a-z0-9-]+$/.test(p.id), `PLANS 缺有效永久 id: ${key}`);
    check(!planIds.has(p.id), `PLANS 重复 id: ${p.id}`);
    planIds.add(p.id);
    check(typeof p.vendor === "string" && !!p.vendor, `PLANS 缺 vendor: ${key}`);
    check(typeof p.plan === "string" && !!p.plan, `PLANS 缺 plan: ${key}`);
    check(CATS.includes(p.cat), `PLANS cat 非法(${p.cat}): ${key}`);
    check(REGIONS.includes(p.region), `PLANS region 非法(${p.region}): ${key}`);
    check(["USD", "CNY", "INR"].includes(p.cur), `PLANS cur 非法(${p.cur}): ${key}`);
    check(p.priceM == null || finiteNonnegative(p.priceM), `PLANS priceM 必须为有限非负数或 null: ${key}`);
    check(p.priceY == null || finiteNonnegative(p.priceY), `PLANS priceY 必须为有限非负数或 null: ${key}`);
    if (p.annualTotal != null) {
      check(finitePositive(p.annualTotal) && finitePositive(p.priceY), `PLANS annualTotal 必须为有年付价的有限正全年金额: ${key}`);
      check(Math.abs(p.annualTotal / 12 - p.priceY) <= 0.02, `PLANS annualTotal 与年付折月价不一致: ${key}`);
    }
    /* 续费条款可记录在本套餐关联的核价来源中，不要求展示备注重复整段官方条款。 */
    const renewalSources = PRICE_CHECKS.rows["plan:" + p.id]?.sourceIds;
    const renewalExplanation = [p.note || "", ...(Array.isArray(renewalSources) ? renewalSources.map(id => PRICE_CHECKS.sources[id]?.evidence || "") : [])]
      .some(text => /连续包月|自动(?:续费|月续订|按月续订)/.test(text));
    check(p.autoRenewMonthly == null || (finitePositive(p.autoRenewMonthly) && p.priceM > 0 && renewalExplanation), `PLANS autoRenewMonthly 必须为有明确续费说明的有限正数: ${key}`);
    check(p.priceM !== undefined, `PLANS 缺 priceM 字段(应为数字或 null): ${key}`);
    check(typeof p.quota === "string" && p.quota.length > 4, `PLANS quota 缺失/过短: ${key}`);
    check(typeof p.url === "string" && p.url.startsWith("http"), `PLANS url 非法: ${key}`);
    check(p.windowPeriod == null || ["5h", "month", "none", "unknown"].includes(p.windowPeriod), `PLANS windowPeriod 非法: ${key}`);
    check(p.quotaSharing == null || ["shared", "separate", "unknown"].includes(p.quotaSharing), `PLANS quotaSharing 非法: ${key}`);
    check(p.codingSurface == null || typeof p.codingSurface === "boolean", `PLANS codingSurface 非法: ${key}`);
    check(p.includedModelQuota == null || typeof p.includedModelQuota === "boolean", `PLANS includedModelQuota 非法: ${key}`);
    check(p.modelAccess == null || ["included", "byok", "metered"].includes(p.modelAccess), `PLANS modelAccess 非法: ${key}`);
    check(p.ownClient == null || typeof p.ownClient === "boolean", `PLANS ownClient 非法: ${key}`);
    check(p.modelBaseRef == null || !!findPlanReference(p.modelBaseRef), `PLANS modelBaseRef 必须指向有效计划引用: ${key}`);
    for (const field of ["modelIncludes", "modelExcludes"]) {
      check(p[field] == null || (Array.isArray(p[field]) && p[field].every((value) => typeof value === "string" && !!value.trim())), `PLANS ${field} 必须为字符串数组: ${key}`);
    }
    check(p.purchaseCountries == null || (Array.isArray(p.purchaseCountries) && p.purchaseCountries.length > 0 && p.purchaseCountries.every((c) => /^[A-Z]{2}$/.test(c))), `PLANS purchaseCountries 必须为非空 ISO 国别数组: ${key}`);
    check(p.availability == null || p.availability === "sold-out", `PLANS availability 只能是 sold-out: ${key}`);
    /* 单月价是不连续续费的购买价，不应低于作为主标价的连续包月价。 */
    check(p.singleMonthPrice == null || (finitePositive(p.singleMonthPrice) && p.priceM > 0 && p.singleMonthPrice >= p.priceM), `PLANS singleMonthPrice 必须为不低于月付标价的有限正数: ${key}`);
    if (p.sameAs != null) {
      const target = PLANS.find((x) => x.id === p.sameAs);
      check(!!target && target !== p && target.sameAs == null, `PLANS sameAs 必须指向另一条非重复的主条目: ${key}`);
      check(!!target && target.cur === p.cur && target.priceM === p.priceM, `PLANS sameAs 的主条目价格与币种必须相同: ${key}`);
    }
    if (p.priceM != null && p.priceM > 0 && p.priceY != null) warn(p.priceY <= p.priceM, `PLANS 年付折月高于月付: ${key}`);
    /* 定制档不应只填年付价（复制残留的典型信号）。plan-0007 的年付席位费在 quota 里有官方依据，显式豁免。 */
    check(p.priceM != null || p.priceY == null || p.id === "plan-0007",
      `PLANS 无月付价却有年付折月价（如为定制报价请改 priceY: null）: ${key}`);
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
    /* 排除逻辑单源：data.js 的 isFreeCodingEntry 必须已经排除这些档（而不是靠校验器自己复制一份名单） */
    check(p.priceM === 0 && (isRetiredPlan(p) || noted) && !isFreeCodingEntry(p),
      `不能当 Coding Agent 的免费档须标明不列入（或已下架）且被 isFreeCodingEntry 排除: ${vendor}|${plan}`);
  }
  const freeCoding = PLANS.filter(isFreeCodingEntry);
  check(!PLANS.some((p) => isOnSalePlan(p) && !(p.priceM > 0)), "无月费的档不应计入在售有标价");
  check(PLANS.filter((p) => /老用户/.test(p.plan || "")).every((p) => !isPersonalMonthly(p)), "老用户续费档不应算个人在售月付");
  for (const p of PLANS) {
    for (const key of ["models", "tools", "quota"]) {
      if (!/^同/.test(String(p[key] || ""))) continue;
      const got = resolvedField(p, key);
      check(!!got && !/^同/.test(got), `「同」字段未能解析到原文: ${p.vendor}|${p.plan} ${key}`);
    }
  }
  const goPlus = PLANS.find((p) => p.plan === "OpenCode Go Plus");
  check(goPlus && /Claude Code/i.test(resolvedField(goPlus, "tools")), "OpenCode Go Plus 的工具应解析到 Go（含 Claude Code）");
  const droid = PLANS.find((p) => p.plan === "Droid Pro");
  check(droid && hasOwnClient(droid), "Droid Pro 应识别为自家客户端");
  const hub = PLANS.find((p) => p.plan === "通用 Token Plan Lite");
  check(hub && !hasOwnClient(hub), "TokenHub API 套餐不应算自家客户端");
  const arkLite = PLANS.find((p) => p.plan === "方舟 Coding Plan Lite");
  check(arkLite && offerable(arkLite), "备注里的限量补货不应取消可购买");
  const flashSale = PLANS.find((p) => /限量抢购/.test(p.plan || ""));
  check(flashSale && !offerable(flashSale), "计划名中的限量抢购不应直接推荐");

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
  for (const p of PLANS) {
    for (const [field, ref] of Object.entries(p.fieldRefs || {})) {
      check(["models", "tools", "quota"].includes(field), `fieldRefs 字段非法: ${p.vendor}|${p.plan} ${field}`);
      check(!!findPlanReference(ref), `fieldRefs 无法解析: ${p.vendor}|${p.plan} ${field}`);
    }
    const seen = new Set();
    let inherited = p;
    while (inherited) {
      if (seen.has(inherited.id)) {
        check(false, `模型继承存在循环: ${p.vendor}|${p.plan}`);
        break;
      }
      seen.add(inherited.id);
      const ref = inherited.modelBaseRef ?? inherited.fieldRefs?.models;
      inherited = ref == null ? null : findPlanReference(ref);
    }
  }
  const allMetrics = [
    ...METRICS_RAW.map((m) => ({ ...m, isEst: false, arr: "METRICS_RAW" })),
    ...ESTIMATES.map((m) => ({ ...m, isEst: true, arr: "ESTIMATES" })),
  ];
  const metricKeys = new Set();
  for (const m of allMetrics) {
    const key = (m.vendor || "?") + "|" + (m.plan || "?") + "|" + (m.model || "?");
    check(!metricKeys.has(key), `${m.arr} 重复条目: ${key}`);
    metricKeys.add(key);
    const hasReq = m.reqPerWk != null || m.reqPerMo != null || m.reqPer5h != null;
    const hasReqRange = m.reqLowPer5h != null || m.reqHighPer5h != null || m.tokensLowPerReq != null || m.tokensHighPerReq != null;
    const kinds = [m.wkLowM != null, hasReq, hasReqRange, m.creditUSD != null, m.creditCNY != null].filter(Boolean).length;
    check(kinds === 1, `额度口径必须且只能有一种(周tokens/请求数/条数区间/creditsUSD/creditsCNY): ${key}`);
    if (m.wkLowM != null) {
      check(finitePositive(m.wkLowM), `wkLowM 非法: ${key}`);
      check(m.wkHighM == null || (finitePositive(m.wkHighM) && m.wkHighM >= m.wkLowM), `wkHighM 非法或 < wkLowM: ${key}`);
    }
    /* 厂商按自身用量假设给出的估算只作对照，必须与统一口径的周额度同时存在。 */
    if (m.vendorWkLowM != null || m.vendorWkHighM != null) {
      check(m.wkLowM != null && finitePositive(m.vendorWkLowM) && finitePositive(m.vendorWkHighM) && m.vendorWkHighM >= m.vendorWkLowM, `vendorWkLowM/vendorWkHighM 必须成对、为正且不颠倒: ${key}`);
    }
    for (const field of ["reqPerWk", "reqPerMo", "reqPer5h", "creditUSD", "creditCNY"]) {
      if (m[field] != null) check(finitePositive(m[field]), `${field} 必须为有限正数: ${key}`);
    }
    if (hasReqRange) {
      for (const field of ["reqLowPer5h", "reqHighPer5h", "tokensLowPerReq", "tokensHighPerReq"]) check(finitePositive(m[field]), `条数区间缺有效 ${field}: ${key}`);
      check(m.reqHighPer5h >= m.reqLowPer5h && m.tokensHighPerReq >= m.tokensLowPerReq, `条数/tokens 区间上下限颠倒: ${key}`);
    }
    if (m.wkLowM != null || hasReq || hasReqRange || [m.apiIn, m.apiOut, m.apiCache].some((v) => v != null)) {
      check(finiteNonnegative(m.apiIn) && finitePositive(m.apiOut) && finiteNonnegative(m.apiCache) && m.apiCache <= m.apiIn,
        `缺完整有限牌价，或缓存价不在输入价范围内: ${key}`);
    }
    if (m.ref != null) {
      const p = findPlanReference(m.ref);
      check(!!p, `ref 无法解析(PLANS 中不存在): ${JSON.stringify(m.ref)}`);
      if (p) check(finitePositive(p.priceM), `ref 必须指向有有效正月费的计划: ${key}`);
      /* 指向已停售档通常意味着该更新到现售档；V2 老用户等有意引用需人工确认，故为警告 */
      if (p && isRetiredPlan(p)) warn(false, `ref 指向已停售/已下架计划（若为有意引用请忽略）: ${key} → ${JSON.stringify(m.ref)}`);
      if (p && typeof m.priceM === "number" && typeof p.priceM === "number") {
        warn(Math.abs(m.priceM - p.priceM) < 0.01, `ref 已解析但价格与 PLANS 不一致(条目 ${m.priceM} vs ${p.priceM}): ${key}`);
      }
    } else {
      check(finitePositive(m.priceM), `无 ref 且缺有效正 priceM: ${key}`);
      check(["USD", "CNY", "INR"].includes(m.cur), `无 ref 条目缺有效币种: ${key}`);
    }
    check(m.apiCur == null || ["USD", "CNY", "INR"].includes(m.apiCur), `指标行 API 牌价币种无效: ${key}`);
    if (m.isEst) check(!!m.method && ["高", "中", "低"].includes(m.confidence), `估算条目缺 method 或有效 confidence: ${key}`);
    warn(!/多模型|混合|全系|全模型/.test(m.model || ""), `模型名仍含糊（多模型/混合/全系/全模型）: ${key}`);
  }
  /* ref 覆盖率（提醒：指标条目应尽量通过 ref 指向 PLANS 单一价格源） */
  const noRef = allMetrics.filter((m) => m.ref == null).length;
  if (noRef > 0) note(`${noRef} 个指标条目未设 ref（价格未与 PLANS 单一数据源对齐）`);

  /* 币种锚点交叉校验：同厂商、同型号的牌价在 API_PRICES 里有正式条目时，指标行的牌价必须同币种
     （metrics.js 的 blendPrice 假定 apiIn/apiOut 与 ref 计划同币种，填错币种会静默算出错误成本）。
     跨厂商引用（如 DevPass 按官方/挂牌价折算）与 API_PRICES 未单列的型号不在此检查范围。 */
  const foldModel = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9.]+/g, "");
  for (const m of allMetrics) {
    /* 与浏览器 resolvePlan 一致：ref 可解析时，币种和厂商来自计划单一数据源。 */
    const p = m.ref != null ? findPlanReference(m.ref) : null;
    const cur = m.apiCur || (p ? p.cur : m.cur);
    const vendor = p ? p.vendor : m.vendor;
    const key = (vendor || "?") + "|" + (m.model || "?");
    const sameVendor = API_PRICES.filter((a) => a.vendor === vendor &&
      (foldModel(a.model) === foldModel(m.model) || foldModel(a.label) === foldModel(m.model)));
    if (!sameVendor.length) continue;
    check(sameVendor.some((a) => a.cur === cur),
      `指标行牌价币种与 API_PRICES 同厂商同型号条目不一致（解析币种=${cur}）: ${key}`);
    const sameCur = sameVendor.filter((a) => a.cur === cur);
    const priceOfA = (a) => a.cur === "USD" ? [a.inUSD, a.outUSD] : [a.inCNY, a.outCNY];
    if (sameCur.length && m.apiIn != null && m.apiOut != null) {
      const matched = sameCur.some((a) => {
        const [pin, pout] = priceOfA(a);
        return Math.abs(pin - m.apiIn) < 1e-9 && Math.abs(pout - m.apiOut) < 1e-9;
      });
      warn(matched, `指标行牌价与 API_PRICES 同厂商同型号条目数值不同（如档位/促销差异请人工确认）: ${key}`);
    }
  }

  /* ---- API_PRICES ---- */
  const apiPriceKeys = new Set();
  for (const a of API_PRICES) {
    const key = (a.vendor || "?") + " " + (a.model || "?");
    /* 同厂商同型号不重复上架；聚合平台后缀（[硅基]）属于 label，不影响此判定 */
    const dedupKey = (a.vendor || "?") + "|" + String(a.model || "").toLowerCase().replace(/\s+/g, "");
    check(!apiPriceKeys.has(dedupKey), `API_PRICES 重复条目: ${key}`);
    apiPriceKeys.add(dedupKey);
    check(a.cur === "USD" || a.cur === "CNY", `API_PRICES cur 非法: ${key}`);
    if (a.cur === "USD") check(finiteNonnegative(a.inUSD) && finitePositive(a.outUSD), `缺有限非负 inUSD/正 outUSD: ${key}`);
    if (a.cur === "CNY") check(finiteNonnegative(a.inCNY) && finitePositive(a.outCNY), `缺有限非负 inCNY/正 outCNY: ${key}`);
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
    check(finiteNonnegative(s.apiIn), `PAYG apiIn 非法: ${key}`);
    check(finitePositive(s.apiOut), `PAYG apiOut 非法: ${key}`);
    check(finiteNonnegative(s.apiCache) && s.apiCache <= s.apiIn, `PAYG 缓存价应介于 0 与输入价之间: ${key}`);
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
    check(finitePositive(t.lowM), `lowM 非法: ${key}`);
    check(finitePositive(t.highM) && t.highM >= t.lowM, `highM 非法: ${key}`);
    let priceCNY = t.priceCNY != null ? t.priceCNY : t.priceUSD != null ? t.priceUSD * RATE_USD_CNY : null;
    if (t.ref != null) {
      const p = findPlanReference(t.ref);
      check(!!p, `PLAN_TOKENS ref 无法解析: ${JSON.stringify(t.ref)}`);
      if (p) priceCNY = p.cur === "USD" ? p.priceM * RATE_USD_CNY : p.priceM;
    }
    check(finitePositive(priceCNY), `缺有效正价格(且无有效 ref): ${key}`);
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

  /* ---- 用户可见文字：不出现内部字段名与开发用语；核查说明与来源证据按页面同一改写规则检查 ---- */
  const leaks = [];
  const lint = (where, text) => { if (text && INTERNAL_TEXT_RE.test(String(text))) leaks.push(where + "「" + String(text).slice(0, 48) + "」"); };
  for (const p of PLANS) for (const field of ["plan", "quota", "models", "tools", "note"]) lint(`${p.id}.${field}`, p[field]);
  for (const [rowKey, row] of Object.entries(PRICE_CHECKS.rows)) lint(`核查 ${rowKey}`, displayPriceReason(row.reason));
  for (const [id, source] of Object.entries(PRICE_CHECKS.sources)) lint(`来源 ${id}`, displayPriceReason(source.evidence));
  for (const d of DYNAMICS) lint(`动态 ${d.date}`, d.text);
  for (const item of UNCERTAIN) lint("不确定性说明", typeof item === "string" ? item : item && item.text);
  check(!leaks.length, `用户可见文字含内部字段名或开发用语（${leaks.length} 处），请改写数据或 displayPriceReason：${leaks.slice(0, 4).join("；")}`);

  /* ---- 日期不得晚于今天（北京时间，容差 1 天）：2062 之类的误输入会让之后所有正确核查被判为「日期倒退」 ---- */
  const nowMs = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  check(Number.isFinite(nowMs), "校验时间无效");
  const latestAllowed = Number.isFinite(nowMs) ? new Date(nowMs + (8 + 24) * 3600000).toISOString().slice(0, 10) : "";
  check(!META.updated || META.updated <= latestAllowed, `META.updated ${META.updated} 晚于今天，疑似误输入`);
  check(!PRICE_CHECKS.checkedAt || PRICE_CHECKS.checkedAt <= latestAllowed, `PRICE_CHECKS.checkedAt ${PRICE_CHECKS.checkedAt} 晚于今天，疑似误输入`);
  const futureRows = Object.entries(PRICE_CHECKS.rows).filter(([, row]) => row.checkedAt > latestAllowed).map(([rowKey, row]) => `${rowKey}（${row.checkedAt}）`);
  check(!futureRows.length, `核查日期晚于今天：${futureRows.slice(0, 5).join("、")}`);
  const futureSources = Object.entries(PRICE_CHECKS.sources).filter(([, source]) => source.checkedAt && source.checkedAt > latestAllowed).map(([id]) => id);
  check(!futureSources.length, `来源核查日期晚于今天：${futureSources.slice(0, 5).join("、")}`);
  const scheduled = DYNAMICS.filter((d) => !d.checked && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && d.date > META.updated);
  if (scheduled.length) note(`${scheduled.length} 条动态日期晚于数据版本，页面按日期标为计划中：${scheduled.map((d) => d.date).join("、")}`);

  /* ---- 套餐额度或备注中已结束的限时活动（MM-DD~MM-DD、至 YYYY-MM-DD），应移除或改写 ---- */
  const versionYear = Number(String(META.updated).slice(0, 4));
  const expiredPromos = [];
  for (const p of PLANS) {
    const text = [p.quota, p.note].filter(Boolean).join("；");
    for (const m of text.matchAll(/(?:(\d{4})-)?(\d{1,2})-(\d{1,2})\s*[~～]\s*(?:(\d{4})-)?(\d{1,2})-(\d{1,2})/g)) {
      const end = `${m[4] || m[1] || versionYear}-${m[5].padStart(2, "0")}-${m[6].padStart(2, "0")}`;
      if (isISODate(end) && end < META.updated) expiredPromos.push(`${p.id}（${m[0]}）`);
    }
    /* 「截至」是时点说明，不是活动截止。 */
    for (const m of text.matchAll(/(?<!截)至\s*(\d{4}-\d{2}-\d{2})/g)) if (m[1] < META.updated) expiredPromos.push(`${p.id}（至 ${m[1]}）`);
  }
  warn(!expiredPromos.length, `套餐额度或备注含已结束的限时活动日期，请移除或改写：${expiredPromos.slice(0, 6).join("、")}`);

  /* ---- 不同档位复用同一组周额度却有不同的额度原文：常见于复制粘贴（如老用户档沿用新版额度） ---- */
  const byWeeklyQuota = new Map();
  for (const m of METRICS_RAW) {
    if (m.wkLowM == null || m.ref == null || m.weeklyChart === false) continue;
    const quotaKey = `${m.model}|${m.wkLowM}|${m.wkHighM}`;
    byWeeklyQuota.set(quotaKey, [...(byWeeklyQuota.get(quotaKey) || []), m.ref]);
  }
  for (const refs of byWeeklyQuota.values()) {
    const plans = [...new Set(refs)].map((ref) => findPlanReference(ref)).filter(Boolean);
    const texts = new Set(plans.map((p) => String(resolvedField(p, "quota")).replace(/\s+/g, "")));
    warn(plans.length < 2 || texts.size === 1, `不同档位使用相同周额度但额度原文不同，请确认不是复制残留：${plans.map((p) => p.id).join("、")}`);
  }

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
  /* 静态日期占位在无脚本或抓取预览时可见；核价同步推进版本后需同步更新（只警告，不阻断同步）。 */
  for (const id of ["heroDate", "footDate"]) {
    const literal = html.match(new RegExp(`id="${id}">([^<]*)<`));
    warn(!literal || literal[1] === META.updated, `index.html #${id} 的静态日期 ${literal && literal[1]} 与 META.updated ${META.updated} 不一致`);
  }

  return { errors, warns, notes,
    summary: `规模：PLANS ${PLANS.length} · 指标 ${allMetrics.length} · API ${API_PRICES.length} · 按量对照 ${PAYG_REFERENCES.length} · 免费档 ${PLANS.filter((p) => p.priceM === 0).length} · 可用 Coding 入口 ${freeCoding.length} · 动态 ${DYNAMICS.length} · 来源组 ${SOURCES.length}` };
}

function printReport({ errors, warns, notes, summary }) {
  console.log(summary);
  if (errors.length) {
    console.error(`\n❌ 校验失败（${errors.length} 项错误）:`);
    errors.forEach((e) => console.error("  ✗ " + e));
    if (warns.length) { console.warn(`\n⚠️ 另有 ${warns.length} 项警告:`); warns.forEach((w) => console.warn("  ⚠ " + w)); }
    if (notes.length) { console.log(`\nℹ️ ${notes.length} 条说明（设计内状态）:`); notes.forEach((n) => console.log("  ℹ " + n)); }
    return false;
  }
  if (warns.length) { console.warn(`⚠️ ${warns.length} 项警告:`); warns.forEach((w) => console.warn("  ⚠ " + w)); }
  if (notes.length) console.log(`ℹ️ ${notes.length} 条说明（设计内状态，无需处理）`);
  console.log("✅ 数据校验通过");
  return true;
}

if (require.main === module) {
  try { if (!printReport(validateData())) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateData, isISODate };
