/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */
"use strict";

const FOLLOW_KEY = "cp-followed-plans-v1";
/* 我的关注、维护记录、贡献者测评、帮助补全与公开评测由 Vue 组件渲染（src/sections/）。本文件保留它们的状态、数据与计算，
   「帮我选」、数据表和完整权益窗口等旧代码也在用。组件读写的状态用 appState() 声明；按需数据是经典脚本定义的全局常量，
   不在响应式系统里，数据到达时递增 dataRevision，组件据此重新读取。 */
const followState = appState({ version: 1, planIds: [], readChangeIds: [] });
/* 关注同步链接 ?follow=plan-0002,plan-0031：只在打开页面时读取一次（启动后地址栏会规范化去掉该参数），
   由用户确认后才合并进本机关注；链接不含已读记录。 */
function readFollowImport() {
  try {
    const raw = new URLSearchParams(location.search).get("follow") || "";
    return [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => /^plan-[a-z0-9-]{1,40}$/.test(id)))].slice(0, 500);
  } catch (e) { return []; }
}
/* importIds：待用户确认的关注同步；storageMessage：本机存储不可用时的说明；feedback：最近一次关注操作的提示。 */
const followView = appState({ importIds: readFollowImport(), storageMessage: "", feedback: "" });
const maintenanceView = appState({ planId: "", recordFilter: "all", publicDataFeedback: "" });
const benchmarkFilter = appState({ task: "all", tool: "all", model: "all" });
const dataRevision = appState({ maintenance: 0, benchmark: 0 });
const publicBenchmarkState = appState({ id: "deepswe-v1-1", family: "", search: "", mode: "best" });
const publicBenchmarkChartState = appState({ metric: "score", limit: "20" });
/** @type {{ renderChart: (() => void) | null }} 公开评测组件挂载后登记图表重绘，供懒加载、主题与尺寸变化时调用 */
const publicBenchmarkHooks = { renderChart: null };
function renderPublicBenchmarks() { dataRevision.benchmark++; }
function renderPublicBenchmarkChart() { if (publicBenchmarkHooks.renderChart) publicBenchmarkHooks.renderChart(); }

/** @returns {MaintenanceSnapshot} */
function maintenanceData() {
  return typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
    ? /** @type {MaintenanceSnapshot} */ (MAINTENANCE)
    : { schemaVersion: 1, generatedAt: "", checkedThrough: "", summary: { total: 0, verified: 0, unverified: 0, stale: 0 }, records: [], reviews: [], changes: [] };
}
/** @returns {BenchmarkSnapshot} */
function benchmarkData() {
  return typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1
    ? /** @type {BenchmarkSnapshot} */ (BENCHMARKS)
    : { schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "" };
}
/* 按需数据未就绪（加载中或下载失败）时只说明待加载，不显示「没有记录」一类结论；进度与重试见标签顶部状态行。 */
function optionalPendingText(what) { return `${what}将在数据加载后显示。`; }
/** @returns {PublicBenchmarkSnapshot} */
function publicBenchmarkData() {
  const data = benchmarkData().public;
  return data && data.schemaVersion === 1 ? data : { schemaVersion: 1, checkedAt: "", benchmarks: [], scores: [] };
}
function selectedPublicBenchmark() {
  const all = publicBenchmarkData().benchmarks;
  const rows = publicBenchmarkState.family ? all.filter((b) => b.family === publicBenchmarkState.family) : all;
  return rows.find((b) => b.id === publicBenchmarkState.id) || defaultPublicBenchmarkForFamily(publicBenchmarkState.family, rows);
}
function defaultPublicBenchmarkForFamily(family, rows) {
  const preferred = { osworld: "osworld-2-25443e96866dc9ce", hle: "hle-diamond-2026-high-closed-book-multimodal", deepswe: "deepswe-v1-1" }[String(family || "deepswe").toLowerCase()];
  return rows.find((b) => b.id === preferred) || rows[0] || null;
}
function publicBenchmarkFamilyLabel(family) {
  return { deepswe: "DeepSWE · 编程", cursorbench: "CursorBench · 编程", "swe-bench": "SWE-bench · 编程", osworld: "OSWorld · GUI 操作", hle: "HLE · 综合学术" }[family.toLowerCase()] || family;
}
const PUBLIC_BENCHMARK_FAMILY_ORDER = ["deepswe", "cursorbench", "swe-bench", "osworld", "hle"];
function publicBenchmarkFamilies() {
  return [...new Set(publicBenchmarkData().benchmarks.map((b) => b.family))]
    .sort((a, b) => PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(a.toLowerCase()) - PUBLIC_BENCHMARK_FAMILY_ORDER.indexOf(b.toLowerCase()));
}
/* 名称与版本相同的协议补上各自不同的配置项（如 a11y、coding action），仍相同时加官方更新日期或序号。 */
function publicBenchmarkLabels(list) {
  const base = (b) => b.name.toLowerCase().includes(b.version.toLowerCase()) ? b.name : `${b.name} · ${b.version}`;
  const groups = new Map();
  list.forEach((b) => groups.set(base(b), [...(groups.get(base(b)) || []), b]));
  const labels = new Map();
  groups.forEach((group, key) => {
    if (group.length === 1) { labels.set(group[0], key); return; }
    const tokens = group.map((b) => String(b.configuration || "").split(/[；;]/).map((t) => t.trim()).filter(Boolean));
    const common = tokens[0].filter((t) => tokens.every((list) => list.includes(t)));
    group.forEach((b, i) => {
      const diff = tokens[i].filter((t) => !common.includes(t));
      labels.set(b, diff.length ? `${key} · ${diff.join(" · ")}` : key);
    });
    const seen = new Map();
    group.forEach((b) => seen.set(labels.get(b), (seen.get(labels.get(b)) || 0) + 1));
    group.forEach((b, i) => { if (seen.get(labels.get(b)) > 1) labels.set(b, `${labels.get(b)} · 官方更新 ${publicBenchmarkDate(b.sourceUpdatedAt)} · #${i + 1}`); });
  });
  return list.map((b) => [b, labels.get(b)]);
}
function publicBenchmarkRows() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark) return [];
  /* 同一评测协议中的名次固定；搜索只筛行，不把第十名显示成第一名。 */
  let sorted = publicBenchmarkData().scores.filter((r) => r.benchmarkId === benchmark.id && typeof r.score === "number" && Number.isFinite(r.score))
    .slice().sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
  if (publicBenchmarkState.mode !== "all") {
    const seen = new Set();
    sorted = sorted.filter((r) => { if (seen.has(r.model)) return false; seen.add(r.model); return true; });
  }
  let rank = 0, previousScore = null;
  const ranked = sorted.map((r, i) => { if (previousScore !== r.score) rank = i + 1; previousScore = r.score; return { ...r, rank }; });
  const q = publicBenchmarkState.search.trim();
  return q ? ranked.filter((r) => queryHit(foldSearch([r.model, r.reasoning, r.agent].filter(Boolean).join(" ")), q)) : ranked;
}
/** 只接受 https 来源链接；其他协议（含 javascript:）一律视为未公布。 */
function publicBenchmarkSourceUrl(url) {
  return typeof url === "string" && /^https:\/\//i.test(url.trim()) ? url.trim() : "";
}
function publicScoreText(score, unit) { return Number(score.toFixed(1)) + unit; }
function publicCostText(cost) {
  return cost == null ? "未公布" : cost > 0 && cost < 0.01 ? "小于 $0.01" : "$" + Number(cost.toFixed(2));
}
function publicModelDisplayName(model) {
  const name = displayModelName(String(model).replace(/(\d)-(\d)(?=-|$)/g, "$1.$2"));
  return name.replace(/^Claude-(Opus|Sonnet|Haiku|Fable)-/i, "Claude $1 ")
    .replace(/^(GPT|GLM|Gemini|Qwen|DeepSeek|MiniMax|MiMo|Grok)-([\d.]+)-/i, "$1-$2 ")
    .replace(/^(Opus|Sonnet|Haiku|Fable)[\s-]+(\d)/i, "Claude $1 $2");
}
/* 模式只取决于名称本身（无 g 标志、无 lastIndex 状态），可安全复用；搜索重绘不再逐行逐套餐重新编译正则。 */
const publicPatternCache = new Map();
function publicModelExactPattern(name) {
  let re = publicPatternCache.get(name);
  if (!re) {
    const pattern = name.split(/[\s-]+/).map(escRe).join("[\\s-]*");
    re = new RegExp("(^|[^a-z0-9])" + pattern + "(?![a-z0-9.-]|\\s+(?:pro|flash|lite|mini|nano|preview|exp|plus|ultra|max|fast|turbo|thinking)\\b)", "i");
    publicPatternCache.set(name, re);
  }
  return re;
}
function publicModelClauseIncludes(part, label) {
  const match = publicModelExactPattern(label).exec(part);
  if (!match) return false;
  /* 冒号不截断否定语境：「本档不支持：Kimi-K3」整句仍是否定。 */
  const prefix = part.slice(0, match.index + match[1].length).split(/[）)，,；;]/).pop();
  const suffix = part.slice(match.index + match[0].length);
  return !/不含|不支持|不可用/.test(prefix) &&
    !/^[\s（(]*(?:需\s*(?:usage\s*credits|按量|额外付费)|(?:不支持|不可用|未包含)(?=[）),，;；]|$))/i.test(suffix);
}
function publicModelIncluded(p, name) {
  /* 结构化排除优先于文本匹配。 */
  if (Array.isArray(p.modelExcludes) && p.modelExcludes.some((x) => publicModelExactPattern(name).test(String(x)) || publicModelExactPattern(String(x)).test(name))) return false;
  const included = splitModelAccess(resolvedField(p, "models")).included;
  const parts = included.split(/[/、；]/);
  const names = [name];
  /* Claude 的共享品牌前缀及官方 GPT 全系括号内的精确版本，均来自套餐明确列出的文本。 */
  if (/^Claude (?:Opus|Sonnet|Haiku|Fable)\b/i.test(name)) names.push(name.replace(/^Claude /i, ""));
  if (names.some((label) => parts.some((part) => publicModelClauseIncludes(part, label)))) return true;
  const gpt = name.match(/^GPT-(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (p.vendor === "OpenAI" && gpt) {
    const group = included.match(new RegExp("\\bGPT[\\s-]*" + escRe(gpt[1].split(".")[0]) + "(?![\\d.])\\s*全系[（(]([^）)]+)[）)]", "i"));
    const short = (gpt[1].includes(".") ? gpt[1] + " " : "") + gpt[2];
    if (group && !/不含|不支持|不可用/.test(included.split(/[、；]/).find((part) => part.includes(group[0])) || "") &&
      group[1].split("/").some((part) => part.trim().toLowerCase() === short.toLowerCase())) return true;
    /* 如 GPT-6 Sol / Luna / Astra，简称仅继承前一个明确模型的版本，遇到新系列即重置。 */
    return included.split(/[、；;]/).some((segment) => {
      if (/不含|不支持|不可用|需\s*(?:usage\s*credits|按量|额外付费)/i.test(segment)) return false;
      let version = "";
      return segment.split("/").some((part) => {
        const explicit = part.trim().match(/^GPT[\s-]*(\d+(?:\.\d+)?)[\s-]+(?:Astra|Sol|Luna)$/i);
        if (explicit) { version = explicit[1]; return false; }
        if (!/^(?:Astra|Sol|Luna)$/i.test(part.trim())) { version = ""; return false; }
        return version === gpt[1] && publicModelClauseIncludes(part, gpt[2]);
      });
    });
  }
  return false;
}
/* 模型出品方的官方订阅排在前面，再按月费；第三方工具与云厂商随后。 */
/** @type {[RegExp, string[]][]} */
const PUBLIC_MODEL_MAKERS = [
  [/^claude/i, ["Anthropic"]], [/^gpt/i, ["OpenAI"]], [/^gemini/i, ["Google"]], [/^glm/i, ["智谱 BigModel", "Z.ai"]],
  [/^kimi/i, ["月之暗面 Kimi"]], [/^minimax/i, ["MiniMax"]], [/^mimo/i, ["小米 MiMo"]], [/^qwen/i, ["阿里云百炼"]],
  [/^deepseek/i, ["DeepSeek"]], [/^grok/i, ["xAI"]], [/^step/i, ["阶跃星辰 StepFun"]],
];
function publicModelMakers(name) { return (PUBLIC_MODEL_MAKERS.find(([re]) => re.test(name)) || [null, []])[1]; }
function publicPlanEligible(p) {
  return metricOfferOk({ ref:p.id }) && !isRelay(p) && (p.priceM > 0 || isFreeCodingEntry(p)) && p.includedModelQuota !== false && p.modelAccess !== "byok" && p.modelAccess !== "metered";
}
function publicModelPlans(model) {
  const name = publicModelDisplayName(model), makers = publicModelMakers(name);
  return PLANS.filter((p) => publicPlanEligible(p) && publicModelIncluded(p, name))
    .sort((a, b) => Number(!makers.includes(a.vendor)) - Number(!makers.includes(b.vendor)) || (cnyOf(a, "M") || 0) - (cnyOf(b, "M") || 0));
}
/* 套餐只列出同系列较新版本时（如 Opus 5.5 之于 Opus 5），提示出品方官方套餐，避免误以为只有第三方能用该系列。 */
/** @returns {{ family: string, version: number, plans: Plan[] } | null} */
function publicNewerVersion(model, plans) {
  const name = publicModelDisplayName(model), makers = publicModelMakers(name);
  if (!makers.length || plans.some((p) => makers.includes(p.vendor))) return null;
  const m = name.match(/^(.*?)[\s-]*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const family = m[1].replace(/^Claude\s+/i, ""), current = Number(m[2]);
  const re = new RegExp("(?:^|[^a-z0-9])" + family.split(/[\s-]+/).map(escRe).join("[\\s-]*") + "[\\s-]*(\\d+(?:\\.\\d+)?)(?![\\d.])", "gi");
  const newer = PLANS.filter((p) => makers.includes(p.vendor) && publicPlanEligible(p)).map((p) => {
    /* 与精确匹配同一条款判断：被否定或「需 usage credits / 按量」的版本不算包含。 */
    const versions = splitModelAccess(resolvedField(p, "models")).included.split(/[/、；;]/).flatMap((part) =>
      [...part.matchAll(re)].map((x) => Number(x[1]))
        .filter((v) => v > current && Math.floor(v) === Math.floor(current) && publicModelClauseIncludes(part, `${family} ${v}`)));
    return versions.length ? { p, version: Math.max(...versions) } : null;
  }).filter(Boolean);
  if (!newer.length) return null;
  const version = Math.max(...newer.map((x) => x.version));
  return { family, version, plans: newer.filter((x) => x.version === version).slice(0, 3).map((x) => x.p) };
}
/** 评测行里的套餐链接：免费入口默认跳到免费区，其余跳到数据表。 */
function publicPlanLink(p, section = isFreeCodingEntry(p) ? "free" : "table") {
  return `?q=${encodeURIComponent(p.vendor + " " + p.plan)}#${section}`;
}
/* 帮我选卡片：本档明确列出的模型在各编程协议中的最佳名次，读首屏摘要，不依赖完整榜单。
   与「可用套餐」同一精确版本匹配；协议分别列出，不合成总分。摘要行已按分数降序，find 即本档最佳。 */
function planCodingBenchmarks(p, role = null) {
  if (typeof BENCHMARK_SUMMARY === "undefined" || BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p)) return [];
  const families = new Set();
  return BENCHMARK_SUMMARY.protocols.map((protocol) => {
    if (families.has(protocol.family)) return null;
    const row = protocol.rows.find((r) => {
      const name = publicModelDisplayName(r.model);
      return (!role || role.re.test(name)) && publicModelIncluded(p, name);
    });
    if (row) families.add(protocol.family);
    return row ? { protocol, row } : null;
  }).filter(Boolean);
}
/* 「模型能力优先」只读一个协议，避免把不同评测的分数混排；摘要行已按分数降序，find 即本档最佳。 */
const ABILITY_PROTOCOL_ID = "deepswe-v1-1";
function planProtocolScore(p, role = null, protocolId = ABILITY_PROTOCOL_ID) {
  if (typeof BENCHMARK_SUMMARY === "undefined" || BENCHMARK_SUMMARY.schemaVersion !== 1 || !p || !publicPlanEligible(p)) return null;
  const protocol = BENCHMARK_SUMMARY.protocols.find((x) => x.id === protocolId);
  if (!protocol) return null;
  const row = protocol.rows.find((r) => {
    const name = publicModelDisplayName(r.model);
    return (!role || role.re.test(name)) && publicModelIncluded(p, name);
  });
  return row ? { protocol, row } : null;
}
function publicUncertaintyLabel(row) {
  if (!row.uncertainty) return "置信区间未公布";
  const range = String(row.uncertainty).match(/([\d.]+)%?\s*[–—-]\s*([\d.]+)%/);
  return range ? `来源区间 ${Number(Number(range[1]).toFixed(1))}–${Number(Number(range[2]).toFixed(1))}%` : String(row.uncertainty);
}
function publicBenchmarkDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value || "未公布";
}
function publicBenchmarkConfiguration(row) {
  return [row.reasoning ? "推理：" + row.reasoning : "推理配置未公布", row.agent ? "Agent：" + row.agent : "Agent 配置未公布", "Tokens：" + (row.tokens == null ? "未公布" : row.tokens), "Steps：" + (row.steps == null ? "未公布" : row.steps)].join("；");
}
function publicBenchmarkChartRows() {
  const rows = publicBenchmarkRows();
  const ranked = publicBenchmarkChartState.metric === "cost" ? rows.filter((r) => r.costUSD != null) : rows;
  return publicBenchmarkChartState.limit === "all" ? ranked : ranked.slice(0, Number(publicBenchmarkChartState.limit));
}
const PUBLIC_CHART_FAMILIES = [
  { id: "gpt", label: "GPT / o 系列", re: /^(?:gpt|o[134](?:\b|-))/i },
  { id: "claude", label: "Claude", re: /^claude/i },
  { id: "gemini", label: "Gemini", re: /^gemini/i },
  { id: "glm", label: "GLM", re: /^glm/i },
  { id: "kimi", label: "Kimi", re: /^kimi/i },
  { id: "deepseek", label: "DeepSeek", re: /^deepseek/i },
  { id: "qwen", label: "Qwen", re: /^qwen/i },
  { id: "minimax", label: "MiniMax", re: /^minimax/i },
  { id: "grok", label: "Grok", re: /^grok/i },
  { id: "composer", label: "Composer", re: /^composer/i },
  { id: "mimo", label: "MiMo", re: /^mimo/i },
  { id: "other", label: "其他系列", re: /./ },
];
function publicChartFamily(model) {
  return PUBLIC_CHART_FAMILIES.find((family) => family.re.test(publicModelDisplayName(model))) || PUBLIC_CHART_FAMILIES[PUBLIC_CHART_FAMILIES.length - 1];
}
function publicChartColors() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(PUBLIC_CHART_FAMILIES.map((family) => [family.id, style.getPropertyValue("--bench-" + family.id).trim() || PAL.info]));
}
function publicChartAxisName(label, narrow) {
  const name = label.replace(/^(#\d+ )Claude /, "$1");
  if (!narrow) return name;
  return name.split(" · ")[0].replace(/^(#\d+ \S+) (.+)$/, "$1\n$2")
    .replace(/^(#\d+ Qwen[\d.]+)-(.+)$/, "$1\n$2")
    .replace(/^(#\d+ (?:DeepSeek|Muse-Spark|MiniMax|MiMo))-(.+)$/, "$1\n$2");
}
function publicBenchmarkCsv() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark) return "";
  const columns = ["协议 ID", "评测", "版本", "范围", "协议配置", "展示模式", "名次", "模型", "推理配置", "Agent", "分数", "单位", "官方评测每任务成本 USD", "成本说明", "不确定性", "Tokens", "Steps", "成绩来源", "核查日期", "协议来源", "官方标注日期"];
  return [columns.map(csvCell).join(","), ...publicBenchmarkRows().map((r) => [benchmark.id, benchmark.name, benchmark.version, benchmark.scope, benchmark.configuration, publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置", r.rank, r.model, r.reasoning, r.agent, r.score, benchmark.unit, r.costUSD, r.costNote, r.uncertainty, r.tokens, r.steps, r.sourceUrl, r.checkedAt, benchmark.sourceUrl, benchmark.sourceUpdatedAt].map(csvCell).join(","))].join("\r\n");
}
function cleanFollowState(value) {
  const planIds = new Set(PLANS.map((p) => p.id));
  /* 未下载历史时保留已读ID，避免首屏把上次访问的标记清空。 */
  const changeIds = optionalDataLoaded("maintenance") ? new Set(maintenanceData().changes.map((c) => c.changeId)) : null;
  const clean = (values, allowed, max) => Array.isArray(values)
    ? [...new Set(values.filter((v) => typeof v === "string" && (allowed ? allowed.has(v) : /^change-[\w-]{1,100}$/.test(v))))].slice(0, max) : [];
  return { version: 1, planIds: clean(value && value.planIds, planIds, 500), readChangeIds: clean(value && value.readChangeIds, changeIds, 10000) };
}
function loadFollowState() {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    Object.assign(followState, cleanFollowState(raw ? JSON.parse(raw) : null));
  } catch (e) {
    followView.storageMessage = "本机关注存储不可用或已损坏；本页仍可关注，关闭后不会保留。";
  }
}
function persistFollowState() {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(followState));
    followView.storageMessage = "";
  } catch (e) {
    followView.storageMessage = "本机关注存储不可用；本页操作已生效，关闭后不会保留。";
  }
}
function isPlanFollowed(id) { return followState.planIds.includes(id); }
function watchButtonHtml(p, extraClass = "") {
  if (!p || !p.id) return "";
  const on = isPlanFollowed(p.id);
  return `<button type="button" class="watch-plan ${esc(extraClass)}${on ? " on" : ""}" data-watch-plan="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? "取消关注" : "关注"} ${esc(planTitle(p))}">${on ? "已关注" : "关注"}</button>`;
}
/* 同步旧代码渲染的关注按钮（推荐卡、数据表、完整权益窗口）。Vue 组件里的按钮由组件按状态渲染，不能从外部改动它的节点。 */
function syncWatchButtons() {
  qsa("[data-watch-plan]").forEach((b) => {
    if (b.closest && b.closest("[data-v-app]")) return;
    const p = PLANS.find((plan) => plan.id === b.dataset.watchPlan);
    if (!p) return;
    const on = isPlanFollowed(p.id);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "取消关注" : "关注"} ${planTitle(p)}`);
    b.textContent = on ? "已关注" : "关注";
  });
}
function followedPlans() {
  return followState.planIds.map((id) => PLANS.find((p) => p.id === id)).filter(Boolean);
}
function followedChanges() {
  return maintenanceData().changes.filter((c) => followState.planIds.includes(c.id));
}
function unreadFollowedChanges() {
  return followedChanges().filter((c) => !followState.readChangeIds.includes(c.changeId));
}
function followFeedback(text) {
  const message = text + (followView.storageMessage ? " " + followView.storageMessage : "");
  followView.feedback = message;
  const dialog = byId("planFollowFeedback");
  if (dialog) dialog.textContent = message;
}
function toggleFollowPlan(id) {
  const p = PLANS.find((plan) => plan.id === id);
  if (!p) return false;
  const on = isPlanFollowed(id);
  followState.planIds = on ? followState.planIds.filter((v) => v !== id) : [...followState.planIds, id];
  persistFollowState(); syncWatchButtons();
  followFeedback(`${on ? "已取消关注" : "已关注"} ${planTitle(p)}。关注与已读记录仅保存在本机，不上传，也不包含在分享链接中。`);
  return true;
}
function markFollowedChangesRead() {
  followState.readChangeIds = [...new Set([...followState.readChangeIds, ...followedChanges().map((c) => c.changeId)])];
  persistFollowState();
  followFeedback("已将当前关注套餐的已确认变更标为已读；之后新收录的变更仍会提示。");
}
/** 只保留 https 证据链接。 */
function maintenanceSourceUrls(urls) {
  return (urls || []).filter((url) => typeof url === "string" && /^https:\/\//i.test(url.trim())).map((url) => url.trim());
}
function maintenanceSources(urls) {
  return maintenanceSourceUrls(urls).map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener" tabindex="0">官方证据${i + 1} ↗</a>`).join(" · ");
}
function changeValue(value) {
  if (value == null) return "未记录";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
const CHANGE_FIELD_LABELS = { priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", quota: "额度", models: "模型", tools: "工具", note: "备注", status: "核查状态", inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", cacheUSD: "缓存 USD/M", cacheCNY: "缓存 CNY/M" };
function changeKindLabel(kind) { return kind === "plan" ? "套餐" : kind === "api" ? "API" : "按量参考"; }
/** @returns {{ label: string, before: string, after: string }[]} */
function changeFields(change) {
  return change.fields.map((field) => ({ label: CHANGE_FIELD_LABELS[field] || field, before: changeValue(change.before[field]), after: changeValue(change.after[field]) }));
}
/* 完整权益窗口（旧代码渲染）里的历史；我的关注页的历史由组件渲染同样的内容。 */
function changeCardHtml(change, unread = false) {
  const fields = changeFields(change).map((f) => `<li><strong>${esc(f.label)}</strong>：${esc(f.before)} → ${esc(f.after)}</li>`).join("");
  return `<li class="change-card"><div><strong>${esc(change.vendor + " · " + change.name)}</strong>${unread ? '<span class="change-unread">未读</span>' : ""}</div><p class="maintenance-meta">确认于 ${esc(change.checkedAt)} · ${esc(changeKindLabel(change.kind))}</p><ul class="change-fields">${fields}</ul><p>${maintenanceSources(change.sourceUrls)}</p></li>`;
}
function planChanges(id) { return maintenanceData().changes.filter((c) => c.id === id); }
const PLAN_HISTORY_EMPTY = "尚未收录本档的已确认变更；当前值与核查日期见完整权益。首次收录是基线，不代表曾经涨价或降价。";
function planHistorySummary(id) {
  return optionalDataLoaded("maintenance") ? `已确认价格与权益历史（${planChanges(id).length} 条）` : "已确认价格与权益历史";
}
function planHistoryParts(id) {
  if (!optionalDataLoaded("maintenance")) return { summary: planHistorySummary(id), body: "<p>展开后加载本档的已确认变更。</p>" };
  const changes = planChanges(id);
  return { summary: planHistorySummary(id),
    body: changes.length ? `<ul class="change-list">${changes.map((c) => changeCardHtml(c)).join("")}</ul>` : `<p>${PLAN_HISTORY_EMPTY}</p>` };
}
function planHistoryHtml(id) {
  const parts = planHistoryParts(id);
  return `<details class="method-box plan-history" data-plan-history="${esc(id)}"><summary>${esc(parts.summary)}</summary><div class="plan-history-body">${parts.body}</div></details>`;
}
/* 只更新摘要文字和正文容器，保留可能正获得焦点的 summary 节点，键盘与读屏位置不丢失。 */
function fillPlanHistory(details, parts) {
  const summary = details.querySelector("summary"), body = details.querySelector(".plan-history-body");
  if (summary && parts.summary != null && summary.textContent !== parts.summary) summary.textContent = parts.summary;
  if (body) body.innerHTML = parts.body;
}
function followSyncUrl() {
  return location.href.split(/[?#]/)[0] + "?follow=" + followState.planIds.join(",") + "#updates";
}
async function copyFollowLink() {
  if (!followState.planIds.length) return;
  const ok = await copyTextToClipboard(followSyncUrl());
  followFeedback(ok ? "已复制关注同步链接。在另一台设备或浏览器打开后，选择「合并到本机关注」即可；链接只含套餐 ID，不含已读记录。"
    : "复制失败，请改用该设备手动关注。");
}
/** 链接带来的、尚未在本机关注的套餐。 */
function followImportPlans() {
  const plans = followView.importIds.map((id) => PLANS.find((p) => p.id === id)).filter(Boolean);
  return { plans, fresh: plans.filter((p) => !isPlanFollowed(p.id)) };
}
function applyFollowImport(merge) {
  const valid = followView.importIds.filter((id) => PLANS.some((p) => p.id === id));
  if (merge) {
    followState.planIds = [...new Set([...followState.planIds, ...valid])].slice(0, 500);
    persistFollowState(); syncWatchButtons();
  }
  followView.importIds = [];
  followFeedback(merge ? `已合并链接里的 ${valid.length} 档关注，本机现关注 ${followState.planIds.length} 档。` : "已忽略链接里的关注套餐。");
}
/* 只为关注的厂商列出订阅地址；路径来自维护摘要，格式固定为 feeds/<slug>.xml。 */
function followFeeds(plans) {
  if (!optionalDataLoaded("maintenance")) return [];
  return [...new Set(plans.map((p) => p.vendor))]
    .map((vendor) => (maintenanceData().feeds || []).find((feed) => feed.vendor === vendor))
    .filter((feed) => feed && /^feeds\/[a-z0-9-]+\.xml$/.test(feed.path))
    .map((feed) => ({ path: feed.path, label: shortVendor(feed.vendor) }));
}
function maintenanceStatusLabel(status) {
  return { verified: "已核实", changed: "核价信息已校正", unverified: "待核实", custom: "定制询价", retired: "已停售" }[status] || status || "待核实";
}
function maintenancePlanStatus(p) {
  const record = maintenanceData().records.find((r) => r.id === p.id);
  return record ? `核查 ${record.checkedAt || "日期未记录"} · ${maintenanceStatusLabel(record.status)}${record.stale ? " · 已超过复查间隔" : ""}。日期为本站核查日。`
    : optionalDataLoaded("maintenance") ? "暂无逐条维护记录。" : optionalPendingText("核查日期与状态");
}
function maintenanceRecords(filter = maintenanceView.recordFilter) {
  return maintenanceData().records.filter((r) => filter === "all" || (filter === "stale" ? r.stale : r.status === "unverified"));
}
function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/* 复查提示按本机日期计算，不代表已重新核验。 */
function dueReviews() {
  const today = todayLocalIso();
  return maintenanceData().reviews.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn) && r.reviewOn <= today)
    .map((r) => ({ ...r, overdue: r.reviewOn < today }));
}
function benchmarkFilterOptions(key) {
  return [...new Set(benchmarkData().runs.map((r) => r[key]).filter((v) => typeof v === "string" && v))].sort();
}
function benchmarkText(value) { return Array.isArray(value) ? value.join("；") : String(value || ""); }
/** 贡献者实测记录的展示值：真实账单、生成时间与验收运行时间分开，未知不补零。 */
function benchmarkRunView(run) {
  const task = benchmarkData().tasks.find((t) => t.id === run.taskId);
  const seconds = (value) => typeof value === "number" && Number.isFinite(value) ? `${value} 秒` : "未记录";
  return {
    title: `${task ? task.title : run.taskId} · ${run.model}`,
    meta: `${run.tool} · ${run.measuredAt} · ${run.passed === true ? "全部验收通过" : run.passed === false ? "验收未全部通过" : "验收状态未记录"}`,
    cost: run.costBasis === "api-receipt" && typeof run.cost === "number" && Number.isFinite(run.cost) && run.cost >= 0 ? `${run.currency} ${run.cost}`
      : run.costBasis === "included-subscription" ? "订阅内使用，未分摊单次费用" : "费用未记录",
    generation: seconds(run.generationSeconds),
    duration: seconds(run.durationSeconds),
    repeats: String(run.repeats),
    environment: run.environment || "未记录",
    evidenceUrl: maintenanceSourceUrls([run.evidence])[0] || "",
  };
}
function benchmarkRuns() {
  return benchmarkData().runs.filter((r) => (benchmarkFilter.task === "all" || r.taskId === benchmarkFilter.task)
    && (benchmarkFilter.tool === "all" || r.tool === benchmarkFilter.tool) && (benchmarkFilter.model === "all" || r.model === benchmarkFilter.model));
}
/* 数据更新后，筛选值不在新数据里时回到「全部」。 */
function normalizeBenchmarkFilter() {
  if (!benchmarkData().tasks.some((t) => t.id === benchmarkFilter.task)) benchmarkFilter.task = "all";
  for (const key of ["tool", "model"]) if (!benchmarkFilterOptions(key).includes(benchmarkFilter[key])) benchmarkFilter[key] = "all";
}
const CONTRIBUTION_TITLES = { correction: "套餐纠错与更新", vendor: "收录新厂商 / 套餐", benchmark: "真实任务测评" };
function contributionTemplate(type) {
  const p = PLANS.find((plan) => plan.id === maintenanceView.planId);
  const common = `\n\n## 官方证据\n- HTTPS 来源链接：\n- 核对日期（YYYY-MM-DD）：\n- 官方原文/截图链接：\n- 适用国家、账号资格与活动限制：\n\n## 变更内容\n- 当前页面显示：\n- 应修正/补充为：\n- 价格币种、计费周期与全年总额：\n- 模型、工具、共享额度与重置窗口：\n\n不要填写账号、API Key、付款隐私或未获许可的内容。\n`;
  if (type === "benchmark") {
    const taskId = benchmarkFilter.task === "all" ? (benchmarkData().tasks[0] || {}).id || "" : benchmarkFilter.task;
    return `# 提交可复现真实任务测评\n\n任务：${taskId}\n模型及精确版本：\n工具及版本：\n生成日期（YYYY-MM-DD）：\n实际生成时间 generationSeconds（秒，未记录填 null）：\n实际 API 账单 cost / currency：\n费用依据 costBasis（api-receipt / included-subscription / unknown）：\n同一解答重复验收次数 repeats：\n平均验收运行时间 durationSeconds（秒）：\n该解答是否全部验收通过 passed：\n操作系统、运行时与环境 environment：\nHTTPS 可公开证据 evidence：\n\n请附原始提示、模型原始解答、验收输出与费用凭证。订阅内使用或费用未知时 cost=null；repeats 是同一解答验收次数，不是模型独立尝试次数。durationSeconds 不能作为模型生成时间。不要上传 API Key 或付费账号信息。\n`;
  }
  return `# ${type === "vendor" ? "申请收录新厂商 / 套餐" : "套餐纠错 / 更新证据"}\n\n厂商：${p ? p.vendor : ""}\n套餐：${p ? p.plan : ""}\n永久套餐 ID：${p ? p.id : ""}${common}`;
}
/** 预填标题与证据模板的 Issues 地址；未配置公开仓库时为空。 */
function contributionIssueUrl(type, body) {
  const base = typeof PUBLIC_PROJECT !== "undefined" ? PUBLIC_PROJECT.githubIssuesBase : null;
  return typeof base === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/?$/.test(base)
    ? base.replace(/\/$/, "") + "/new?title=" + encodeURIComponent(CONTRIBUTION_TITLES[type] || "套餐反馈") + "&body=" + encodeURIComponent(body) : "";
}
function downloadPublicData() {
  if (!optionalDataLoaded("maintenance") || !optionalDataLoaded("benchmark")) {
    maintenanceView.publicDataFeedback = "正在加载完整公开数据…";
    Promise.all([ensureOptionalData("maintenance"), ensureOptionalData("benchmark")]).then(downloadPublicData, () => {
      maintenanceView.publicDataFeedback = "公开数据加载失败，请重试下载。";
    });
    return;
  }
  const data = { schemaVersion: 1, meta: META, plans: PLANS, apiPrices: API_PRICES, paygReferences: PAYG_REFERENCES, priceChecks: PRICE_CHECKS, maintenance: maintenanceData(), benchmarks: benchmarkData() };
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", `coding-plan-public-data-${META.updated}.json`, "application/json;charset=utf-8");
  maintenanceView.publicDataFeedback = "已生成公开数据 JSON；不含本机关注、已读记录或待审队列。";
}
/* 按需数据到达后：清理关注状态、规范筛选，并通知组件重新读取；完整权益窗口里已渲染的历史原地更新。 */
function refreshOptionalViews(kind) {
  if (kind === "maintenance") {
    Object.assign(followState, cleanFollowState(followState));
    dataRevision.maintenance++;
    syncWatchButtons();
    /* 加载期间可能已收起；成功后也填充关闭的正文，避免再次展开仍停留在加载提示。 */
    qsa("[data-plan-history]").forEach((details) => fillPlanHistory(details, planHistoryParts(details.dataset.planHistory)));
  } else {
    normalizeBenchmarkFilter();
    dataRevision.benchmark++;
  }
}
/* 打开辅助标签或需要按需数据时调用：状态行显示加载中、失败与重试入口（贡献页的测评模板也依赖评测数据）。 */
function loadViewData(kind) {
  const statuses = [byId(kind + "DataStatus"), kind === "benchmark" ? byId("contributionDataStatus") : null].filter(Boolean);
  statuses.forEach((status) => { status.textContent = optionalDataLoaded(kind) ? "" : "正在加载本标签的数据…"; });
  return ensureOptionalData(kind).then(() => {
    statuses.forEach((status) => { status.textContent = ""; });
    refreshOptionalViews(kind);
  }, (err) => {
    statuses.forEach((status) => { status.innerHTML = `${esc(err.message)}。<button type="button" class="chip" data-retry-data="${esc(kind)}">重新加载数据</button>`; });
  });
}
/* 完整权益窗口里的历史按需加载；我的关注页的历史由组件自己处理。 */
function onPlanHistoryToggle(event) {
  const details = evtTarget(event);
  if (!details || !details.open || !details.dataset || !details.dataset.planHistory || optionalDataLoaded("maintenance")) return;
  fillPlanHistory(details, { summary: null, body: "<p>正在加载历史数据…</p>" });
  ensureOptionalData("maintenance").then(() => {
    refreshOptionalViews("maintenance");
  }, () => {
    fillPlanHistory(details, { summary: null, body: "<p>历史数据加载失败，请关闭后重新展开。</p>" });
  });
}
function bindMaintenanceEvents() {
  loadFollowState(); syncWatchButtons();
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
    const plan = target.closest("[data-benchmark-plan]");
    if (plan && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (e.button == null || e.button === 0)) {
      e.preventDefault(); showPlanDetails(plan.dataset.benchmarkPlan, plan);
    }
    const watch = target.closest("[data-watch-plan]"); if (watch) toggleFollowPlan(watch.dataset.watchPlan);
  });
  document.addEventListener("toggle", onPlanHistoryToggle, true);
}
