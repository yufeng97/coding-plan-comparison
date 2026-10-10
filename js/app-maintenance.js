/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */
"use strict";

const FOLLOW_KEY = "cp-followed-plans-v1";
let followState = { version: 1, planIds: [], readChangeIds: [] };
let followStorageAvailable = true;
let followStorageMessage = "";
let maintenancePlanId = "";
let maintenanceRecordFilter = "all";
let benchmarkFilter = { task: "all", tool: "all", model: "all" };
let publicBenchmarkState = { id: "deepswe-v1-1", family: "", search: "", mode: "best" };
const publicBenchmarkChartState = { metric: "score", limit: "20" };

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
function syncPublicBenchmarkChoices() {
  const protocols = publicBenchmarkData().benchmarks, selected = selectedPublicBenchmark();
  if (selected) { publicBenchmarkState.id = selected.id; publicBenchmarkState.family = selected.family; }
  const family = byId("publicBenchmarkFamily");
  if (family) {
    const order = ["deepswe", "cursorbench", "swe-bench", "osworld", "hle"];
    family.innerHTML = [...new Set(protocols.map((b) => b.family))].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase())).map((f) => `<option value="${esc(f)}">${esc(publicBenchmarkFamilyLabel(f))}</option>`).join("");
    family.value = publicBenchmarkState.family;
  }
  const select = byId("publicBenchmarkSelect");
  if (select) {
    const labels = publicBenchmarkLabels(protocols.filter((b) => b.family === publicBenchmarkState.family));
    select.innerHTML = `<optgroup label="${esc(publicBenchmarkFamilyLabel(publicBenchmarkState.family || "评测协议"))}">` + labels.map(([b, label]) => `<option value="${esc(b.id)}">${esc(label)}</option>`).join("") + `</optgroup>`;
    if (selected) select.value = selected.id;
  }
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
function publicBenchmarkSource(url, label) {
  const href = typeof url === "string" && /^https:\/\//i.test(url) ? safeHref(url) : "";
  return href ? `<a href="${href}" target="_blank" rel="noopener" tabindex="0">${esc(label)} ↗</a>` : "来源未公布";
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
function publicNewerVersionHint(model, plans) {
  const name = publicModelDisplayName(model), makers = publicModelMakers(name);
  if (!makers.length || plans.some((p) => makers.includes(p.vendor))) return "";
  const m = name.match(/^(.*?)[\s-]*(\d+(?:\.\d+)?)$/);
  if (!m) return "";
  const family = m[1].replace(/^Claude\s+/i, ""), current = Number(m[2]);
  const re = new RegExp("(?:^|[^a-z0-9])" + family.split(/[\s-]+/).map(escRe).join("[\\s-]*") + "[\\s-]*(\\d+(?:\\.\\d+)?)(?![\\d.])", "gi");
  const newer = PLANS.filter((p) => makers.includes(p.vendor) && publicPlanEligible(p)).map((p) => {
    /* 与精确匹配同一条款判断：被否定或「需 usage credits / 按量」的版本不算包含。 */
    const versions = splitModelAccess(resolvedField(p, "models")).included.split(/[/、；;]/).flatMap((part) =>
      [...part.matchAll(re)].map((x) => Number(x[1]))
        .filter((v) => v > current && Math.floor(v) === Math.floor(current) && publicModelClauseIncludes(part, `${family} ${v}`)));
    return versions.length ? { p, version: Math.max(...versions) } : null;
  }).filter(Boolean);
  if (!newer.length) return "";
  const version = Math.max(...newer.map((x) => x.version));
  const names = newer.filter((x) => x.version === version).slice(0, 3).map((x) => `<a href="?q=${encodeURIComponent(x.p.vendor + " " + x.p.plan)}#table" data-benchmark-plan="${esc(x.p.id)}">${esc(planTitle(x.p))}</a>`);
  return `<p class="public-model-plans">同系列较新的 ${esc(family)} ${esc(String(version))} 在 ${names.join(" · ")} 等官方套餐中，不是本评测版本，成绩不能直接套用。</p>`;
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
function publicModelPlansHtml(model) {
  const plans = publicModelPlans(model);
  const links = plans.map((p) => `<a href="?q=${encodeURIComponent(p.vendor + " " + p.plan)}#${isFreeCodingEntry(p) ? "free" : "table"}" data-benchmark-plan="${esc(p.id)}">${esc(planTitle(p))}</a>`);
  const hint = publicNewerVersionHint(model, plans);
  return (plans.length ? `<div class="public-model-plans">可用套餐：${links.slice(0, 3).join(" · ")}${plans.length > 3 ? `<details><summary>另外 ${plans.length - 3} 档</summary>${links.slice(3).join(" · ")}</details>` : ""}</div>`
    : `<p class="public-model-plans">在售套餐未明确列出此评测版本。</p>`) + hint;
}
function publicUncertaintyHtml(row) {
  if (!row.uncertainty) return `<span class="public-score-uncertainty">置信区间未公布</span>`;
  const range = String(row.uncertainty).match(/([\d.]+)%?\s*[–—-]\s*([\d.]+)%/);
  return `<span class="public-score-uncertainty" title="${esc(row.uncertainty)}">${range ? `来源区间 ${Number(Number(range[1]).toFixed(1))}–${Number(Number(range[2]).toFixed(1))}%` : esc(row.uncertainty)}</span>`;
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
function renderPublicBenchmarkChart() {
  const host = byId("chartPublicBenchmark"), wrap = byId("publicBenchmarkChartWrap");
  if (!host || !wrap) return;
  const benchmark = selectedPublicBenchmark(), all = publicBenchmarkRows();
  wrap.hidden = !benchmark || !all.length;
  if (wrap.hidden) return;
  const hasCost = all.some((r) => r.costUSD != null);
  if (!hasCost) publicBenchmarkChartState.metric = "score";
  qsa("[data-public-chart]").forEach((button) => {
    const active = button.dataset.publicChart === publicBenchmarkChartState.metric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = button.dataset.publicChart === "cost" && !hasCost;
  });
  const rows = publicBenchmarkChartRows(), cost = publicBenchmarkChartState.metric === "cost";
  const colors = publicChartColors(), families = rows.map((r) => publicChartFamily(r.model));
  const legend = byId("publicBenchmarkChartLegend");
  if (legend) {
    legend.hidden = cost;
    legend.innerHTML = [...new Set(families)].map((family) => `<span><i aria-hidden="true" style="background:${colors[family.id]}"></i>${esc(family.label)}</span>`).join("");
  }
  const limit = byId("publicBenchmarkChartLimit"); if (limit) limit.value = publicBenchmarkChartState.limit;
  const note = byId("publicBenchmarkChartNote");
  if (note) note.textContent = `${benchmark.name} · ${rows.length} / ${all.length} 条匹配配置 · ${cost ? "每任务成本（USD），按本协议分数名次排列；费用未公布的配置不绘制。" : benchmark.metric + "（" + benchmark.unit + "），按本协议分数降序。"}`;
  host.style.height = Math.max(240, rows.length * 34 + 74) + "px";
  describeChart("chartPublicBenchmark", `${benchmark.name}，${cost ? "评测每任务成本" : benchmark.metric}。` + rows.map((r) => `第 ${r.rank} 名 ${publicModelDisplayName(r.model)}：${cost ? publicCostText(r.costUSD) : publicScoreText(r.score, benchmark.unit)}`).join("；"));
  const section = host.closest(".section");
  if (section && section.hidden) return;
  if (deferChartRender("chartPublicBenchmark", renderPublicBenchmarkChart)) return;
  const labels = rows.map((r) => `#${r.rank} ${publicModelDisplayName(r.model)}${publicBenchmarkState.mode === "all" ? " · " + [r.reasoning, r.agent].filter(Boolean).join(" / ") : ""}`);
  const chart = makeChart("chartPublicBenchmark");
  chart.setOption({
    animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    grid: { left: 8, right: cost ? 78 : 64, top: 12, bottom: 46, containLabel: true },
    // Fixed positioning keeps wrapped tooltips out of WebKit's chart scroll extent.
    tooltip: { ...tipStyle(host, true), extraCssText: "position: fixed; max-width: min(420px, calc(100vw - 24px)); box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; z-index: 2000;", trigger: "item", formatter: (item) => {
      const r = rows[item.dataIndex]; if (!r) return "";
      return `<b>#${r.rank} ${esc(publicModelDisplayName(r.model))}</b><br/>${esc(benchmark.name)} · ${esc(benchmark.metric)}：${esc(publicScoreText(r.score, benchmark.unit))}<br/>${esc(publicBenchmarkConfiguration(r))}<br/>每任务成本：${esc(publicCostText(r.costUSD))}<br/>${esc(r.uncertainty || "置信区间未公布")}`;
    } },
    xAxis: { type: "value", min: 0, ...(!cost && benchmark.unit === "%" ? { max: 100 } : {}), name: cost ? "USD / 任务" : benchmark.metric + "（" + benchmark.unit + "）", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
    yAxis: { type: "category", inverse: true, data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: PAL.axisLine } }, axisLabel: { ...chartAxisLabel(host, 12), lineHeight: 14, formatter: (label) => publicChartAxisName(label, host.getBoundingClientRect().width < 480) } },
    series: [{ type: "bar", data: rows.map((r) => cost ? r.costUSD : r.score), barWidth: 17,
      itemStyle: { color: cost ? PAL.gold : (item) => colors[families[item.dataIndex].id], borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (item) => cost ? publicCostText(item.value) : publicScoreText(item.value, benchmark.unit) } }],
  }, true);
  markChartsForResize(["chartPublicBenchmark"]);
  resizeVisibleCharts();
}
function renderPublicBenchmarks() {
  const meta = byId("publicBenchmarkMeta"), body = byId("publicBenchmarkBody"), empty = byId("publicBenchmarkEmpty"), table = byId("publicBenchmarkWrap");
  if (!meta || !body || !empty || !table) return;
  const benchmark = selectedPublicBenchmark(), rows = publicBenchmarkRows(), loaded = optionalDataLoaded("benchmark");
  const select = byId("publicBenchmarkSelect");
  if (benchmark) { publicBenchmarkState.id = benchmark.id; publicBenchmarkState.family = benchmark.family; if (select) select.value = benchmark.id; }
  const previousDetails = meta.querySelector("details");
  const keepDetailsOpen = benchmark && previousDetails && previousDetails.open && previousDetails.dataset.benchmarkId === benchmark.id;
  meta.innerHTML = benchmark ? `<h3>${esc(benchmark.name)}</h3><p class="maintenance-meta">${esc(benchmark.metric)}（${esc(benchmark.unit)}） · ${esc(benchmark.scope)}</p><details class="public-protocol-details" data-benchmark-id="${esc(benchmark.id)}"${keepDetailsOpen ? " open" : ""}><summary>协议配置、范围与来源</summary><p>${esc(benchmark.description)}</p><dl class="public-benchmark-meta"><div><dt>版本与协议</dt><dd>${esc(benchmark.version)} · <code>${esc(benchmark.id)}</code></dd></div><div><dt>评测配置</dt><dd>${esc(benchmark.configuration)}</dd></div><div><dt>官方标注日期与核查</dt><dd>官方标注 ${esc(publicBenchmarkDate(benchmark.sourceUpdatedAt))} · 本站核查 ${esc(publicBenchmarkDate(benchmark.checkedAt))} · ${publicBenchmarkSource(benchmark.sourceUrl, "原始评测")}</dd></div></dl></details>` : `<p>${loaded ? "公开评测数据暂不可用。" : optionalPendingText("公开评测协议与成绩")}</p>`;
  const count = byId("publicBenchmarkCount");
  if (count) count.textContent = benchmark ? `${rows.length} 条匹配记录 · ${publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置"} · 本协议分数降序` : loaded ? "暂无公开记录" : "";
  const modeNote = byId("publicBenchmarkModeNote");
  if (modeNote) modeNote.textContent = publicBenchmarkState.mode === "all" ? "分别列出各推理与 Agent 配置；名次仅适用于当前协议，搜索保留原名次。" : "每模型取本协议已公布的最高分配置；名次仅适用于当前记录，搜索保留原名次。";
  const caption = byId("publicBenchmarkCaption"); if (caption) caption.textContent = benchmark ? `${benchmark.name} · ${benchmark.metric} · ${benchmark.scope}` : "公开模型评测";
  body.innerHTML = rows.map((r) => `<tr><td class="public-score-rank">${r.rank}</td><th scope="row"><strong>${esc(publicModelDisplayName(r.model))}</strong><span class="public-score-config">${esc([r.reasoning ? "推理：" + r.reasoning : "推理未公布", r.agent ? "Agent：" + r.agent : "Agent 未公布"].join(" · "))}</span>${publicModelPlansHtml(r.model)}<details class="public-score-more"><summary>配置与评测说明</summary><p>来源模型 ID：<code>${esc(r.model)}</code></p><p>${esc(publicBenchmarkConfiguration(r))}</p>${r.uncertainty ? `<p>区间 / 不确定性：${esc(r.uncertainty)}</p>` : ""}<p>${esc(r.costNote || "评测每任务成本；来源未提供其他费用说明。未公布费用不能记作零，也不能换算为订阅月费。")}</p></details></th><td class="public-score-value">${esc(publicScoreText(r.score, benchmark.unit))}${publicUncertaintyHtml(r)}</td><td>${esc(publicCostText(r.costUSD))}</td><td>${publicBenchmarkSource(r.sourceUrl, "成绩来源")}<span class="public-score-config" title="${esc(r.checkedAt)}">核查 ${esc(publicBenchmarkDate(r.checkedAt))}</span></td></tr>`).join("");
  empty.hidden = rows.length > 0 || !loaded; table.hidden = !rows.length;
  empty.textContent = benchmark ? "当前协议没有匹配的模型或配置。请调整关键词，或清除搜索。" : "公开数据暂不可用；本站不会用本地验收示例填充模型分数。";
  const reset = byId("publicModelClearBtn"); if (reset) reset.disabled = !publicBenchmarkState.search;
  const csv = byId("downloadPublicBenchmarkCsvBtn"); if (csv) csv.disabled = !rows.length;
  const json = byId("downloadPublicBenchmarkJsonBtn"); if (json) json.disabled = !publicBenchmarkData().benchmarks.length;
  renderPublicBenchmarkChart();
}
function publicBenchmarkCsv() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark) return "";
  const columns = ["协议 ID", "评测", "版本", "范围", "协议配置", "展示模式", "名次", "模型", "推理配置", "Agent", "分数", "单位", "官方评测每任务成本 USD", "成本说明", "不确定性", "Tokens", "Steps", "成绩来源", "核查日期", "协议来源", "官方标注日期"];
  const cell = (value) => { let s = String(value ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  return [columns.map(cell).join(","), ...publicBenchmarkRows().map((r) => [benchmark.id, benchmark.name, benchmark.version, benchmark.scope, benchmark.configuration, publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置", r.rank, r.model, r.reasoning, r.agent, r.score, benchmark.unit, r.costUSD, r.costNote, r.uncertainty, r.tokens, r.steps, r.sourceUrl, r.checkedAt, benchmark.sourceUrl, benchmark.sourceUpdatedAt].map(cell).join(","))].join("\r\n");
}
function downloadPublicBenchmarkCsv() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark || !publicBenchmarkRows().length) return;
  downloadCsvText(publicBenchmarkCsv(), `coding-plan-benchmark-${benchmark.id}.csv`);
  const feedback = byId("publicBenchmarkFeedback"); if (feedback) feedback.textContent = `已导出当前协议的 ${publicBenchmarkRows().length} 条筛选结果，配置、来源与费用口径已保留。`;
}
function downloadPublicBenchmarkJson() {
  const data = publicBenchmarkData(); if (!data.benchmarks.length) return;
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", "coding-plan-public-benchmarks.json", "application/json;charset=utf-8");
  const feedback = byId("publicBenchmarkFeedback"); if (feedback) feedback.textContent = "已导出全部公开评测协议与原始成绩；未包含本机关注或投稿资料。";
}
function bindPublicBenchmarkEvents() {
  const select = byId("publicBenchmarkSelect"), search = byId("publicModelSearch");
  const hideTooltip = () => { const chart = chartCache.chartPublicBenchmark; if (chart) chart.dispatchAction({ type: "hideTip" }); };
  window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
  window.addEventListener("resize", hideTooltip, { passive: true });
  syncPublicBenchmarkChoices();
  const family = byId("publicBenchmarkFamily"); if (family) family.addEventListener("change", () => {
    if (!publicBenchmarkData().benchmarks.some((b) => b.family === family.value)) return;
    publicBenchmarkState.family = family.value; publicBenchmarkState.id = "";
    syncPublicBenchmarkChoices(); renderPublicBenchmarks();
  });
  if (select) {
    select.addEventListener("change", () => { if (publicBenchmarkData().benchmarks.some((b) => b.id === select.value)) publicBenchmarkState.id = select.value; renderPublicBenchmarks(); });
  }
  /* 与数据表搜索一致：输入停顿 150ms 再重绘。 */
  let searchTimer = null;
  if (search) search.addEventListener("input", () => {
    publicBenchmarkState.search = search.value.slice(0, 200);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTimer = null; renderPublicBenchmarks(); }, 150);
  });
  const mode = byId("publicBenchmarkMode"); if (mode) mode.addEventListener("change", () => { publicBenchmarkState.mode = mode.value === "all" ? "all" : "best"; renderPublicBenchmarks(); });
  qsa("[data-public-chart]").forEach((button) => button.addEventListener("click", () => { publicBenchmarkChartState.metric = button.dataset.publicChart === "cost" ? "cost" : "score"; renderPublicBenchmarkChart(); }));
  const chartLimit = byId("publicBenchmarkChartLimit");
  if (chartLimit) chartLimit.addEventListener("change", () => { if (["10", "20", "all"].includes(chartLimit.value)) publicBenchmarkChartState.limit = chartLimit.value; renderPublicBenchmarkChart(); });
  const clear = byId("publicModelClearBtn"); if (clear) clear.addEventListener("click", () => { clearTimeout(searchTimer); searchTimer = null; publicBenchmarkState.search = ""; if (search) search.value = ""; renderPublicBenchmarks(); focusTableControl(search); });
  [["downloadPublicBenchmarkCsvBtn", downloadPublicBenchmarkCsv], ["downloadPublicBenchmarkJsonBtn", downloadPublicBenchmarkJson]].forEach(([id, handler]) => { const button = byId(id); if (button) button.addEventListener("click", handler); });
  renderPublicBenchmarks();
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
    followState = cleanFollowState(raw ? JSON.parse(raw) : null);
  } catch (e) {
    followStorageAvailable = false;
    followStorageMessage = "本机关注存储不可用或已损坏；本页仍可关注，关闭后不会保留。";
  }
}
function persistFollowState() {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(followState));
    followStorageAvailable = true; followStorageMessage = "";
  } catch (e) {
    followStorageAvailable = false;
    followStorageMessage = "本机关注存储不可用；本页操作已生效，关闭后不会保留。";
  }
}
function isPlanFollowed(id) { return followState.planIds.includes(id); }
function watchButtonHtml(p, extraClass = "") {
  if (!p || !p.id) return "";
  const on = isPlanFollowed(p.id);
  return `<button type="button" class="watch-plan ${esc(extraClass)}${on ? " on" : ""}" data-watch-plan="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? "取消关注" : "关注"} ${esc(planTitle(p))}">${on ? "已关注" : "关注"}</button>`;
}
function syncWatchButtons() {
  qsa("[data-watch-plan]").forEach((b) => {
    const p = PLANS.find((plan) => plan.id === b.dataset.watchPlan);
    if (!p) return;
    const on = isPlanFollowed(p.id);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "取消关注" : "关注"} ${planTitle(p)}`);
    b.textContent = on ? "已关注" : "关注";
  });
}
function followedChanges() {
  return maintenanceData().changes.filter((c) => followState.planIds.includes(c.id));
}
function unreadFollowedChanges() {
  return followedChanges().filter((c) => !followState.readChangeIds.includes(c.changeId));
}
function followFeedback(text) {
  const el = byId("followFeedback");
  if (el) el.textContent = text + (followStorageMessage ? " " + followStorageMessage : "");
  const dialog = byId("planFollowFeedback");
  if (dialog) dialog.textContent = text + (followStorageMessage ? " " + followStorageMessage : "");
}
function toggleFollowPlan(id) {
  const p = PLANS.find((plan) => plan.id === id);
  if (!p) return false;
  const focus = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusId = focus && focus.dataset ? focus.dataset.watchPlan : "";
  const fromUpdates = focus && byId("updates") && byId("updates").contains(focus);
  const on = isPlanFollowed(id);
  followState.planIds = on ? followState.planIds.filter((v) => v !== id) : [...followState.planIds, id];
  persistFollowState(); syncWatchButtons(); renderFollowedChanges();
  followFeedback(`${on ? "已取消关注" : "已关注"} ${planTitle(p)}。关注与已读记录仅保存在本机，不上传，也不包含在分享链接中。`);
  if (fromUpdates && focusId && focus.isConnected === false) {
    const replacement = byId("followedPlans").querySelector(`[data-watch-plan="${focusId}"]`);
    if (!focusTableControl(replacement)) focusTableControl(byId("maintenancePlan"));
  }
  return true;
}
function markFollowedChangesRead() {
  followState.readChangeIds = [...new Set([...followState.readChangeIds, ...followedChanges().map((c) => c.changeId)])];
  persistFollowState(); renderFollowedChanges();
  followFeedback("已将当前关注套餐的已确认变更标为已读；之后新收录的变更仍会提示。");
  focusTableControl(byId("maintenancePlan"));
}
function maintenanceSources(urls) {
  return (urls || []).filter((url) => /^https:\/\//i.test(url) && safeHref(url)).map((url, i) =>
    `<a href="${safeHref(url)}" target="_blank" rel="noopener" tabindex="0">官方证据${i + 1} ↗</a>`).join(" · ");
}
function changeValue(value) {
  if (value == null) return "未记录";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function changeFieldsHtml(change) {
  const labels = { priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", quota: "额度", models: "模型", tools: "工具", note: "备注", status: "核查状态", inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", cacheUSD: "缓存 USD/M", cacheCNY: "缓存 CNY/M" };
  return `<ul class="change-fields">` + change.fields.map((field) => `<li><strong>${esc(labels[field] || field)}</strong>：${esc(changeValue(change.before[field]))} → ${esc(changeValue(change.after[field]))}</li>`).join("") + `</ul>`;
}
function changeCardHtml(change, unread = false) {
  return `<li class="change-card"><div><strong>${esc(change.vendor + " · " + change.name)}</strong>${unread ? '<span class="change-unread">未读</span>' : ""}</div><p class="maintenance-meta">确认于 ${esc(change.checkedAt)} · ${esc(change.kind === "plan" ? "套餐" : change.kind === "api" ? "API" : "按量参考")}</p>${changeFieldsHtml(change)}<p>${maintenanceSources(change.sourceUrls)}</p></li>`;
}
function planHistoryParts(id) {
  if (!optionalDataLoaded("maintenance")) return { summary: "已确认价格与权益历史", body: "<p>展开后加载本档的已确认变更。</p>" };
  const changes = maintenanceData().changes.filter((c) => c.id === id);
  return { summary: `已确认价格与权益历史（${changes.length} 条）`,
    body: changes.length ? `<ul class="change-list">${changes.map((c) => changeCardHtml(c)).join("")}</ul>` : `<p>尚未收录本档的已确认变更；当前值与核查日期见完整权益。首次收录是基线，不代表曾经涨价或降价。</p>` };
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
function renderFollowedChanges() {
  const list = byId("followedPlans"), changes = byId("followedChanges"), count = byId("followUnreadCount"), read = byId("markFollowReadBtn");
  if (!list || !changes || !count || !read) return;
  const plans = followState.planIds.map((id) => PLANS.find((p) => p.id === id)).filter(Boolean);
  list.innerHTML = plans.length ? plans.map((p) => `<div class="followed-plan"><button type="button" class="chip" data-view-plan="${esc(p.id)}">${esc(planTitle(p))}</button>${watchButtonHtml(p)}</div>`).join("") : `<p>还没有关注的套餐。<a href="#quick">选择套餐并关注</a></p>`;
  const unread = unreadFollowedChanges(), loaded = optionalDataLoaded("maintenance");
  count.textContent = `${plans.length} 档关注` + (loaded ? ` · ${unread.length} 条未读变更` : "");
  read.disabled = !unread.length;
  changes.innerHTML = unread.length ? `<ul class="change-list">${unread.map((c) => changeCardHtml(c, true)).join("")}</ul>` : `<p>${!plans.length ? "关注后会展示本站收录的已确认变更。" : loaded ? "当前关注套餐没有未读的已确认变更。" : optionalPendingText("关注套餐的已确认变更")}</p>`;
  const storage = byId("followStorageNote");
  if (storage) storage.textContent = followStorageMessage || "只在当前浏览器保存关注与已读记录；不上传，不跨设备同步，清理浏览器数据后会消失。";
}
function renderMaintenanceHistory() {
  const el = byId("maintenanceHistory"), select = byId("maintenancePlan");
  if (!el || !select) return;
  const p = PLANS.find((plan) => plan.id === maintenancePlanId);
  select.value = maintenancePlanId;
  if (!p) { el.innerHTML = "<p>选择套餐，查看当前核查状态与已确认变更。</p>"; return; }
  const record = maintenanceData().records.find((r) => r.id === p.id);
  const status = esc(record ? `核查 ${record.checkedAt || "日期未记录"} · ${maintenanceStatusLabel(record.status)}${record.stale ? " · 已超过复查间隔" : ""}。日期为本站核查日。`
    : optionalDataLoaded("maintenance") ? "暂无逐条维护记录。" : optionalPendingText("核查日期与状态"));
  /* 同一套餐重绘（如展开历史后数据才加载完）时原地更新，保留展开状态和 summary 焦点。 */
  const statusLine = el.querySelector(".maintenance-plan-status"), history = el.querySelector("[data-plan-history]");
  if (statusLine && history && history.dataset.planHistory === p.id) {
    statusLine.innerHTML = status;
    fillPlanHistory(history, planHistoryParts(p.id));
    return;
  }
  el.innerHTML = `<div class="maintenance-plan-actions">${watchButtonHtml(p)}<button type="button" class="chip" data-view-plan="${esc(p.id)}">完整权益</button></div>` +
    `<p class="maintenance-plan-status">${status}</p>${planHistoryHtml(p.id)}`;
}
function maintenanceStatusLabel(status) {
  return { verified: "已核实", changed: "核价信息已校正", unverified: "待核实", custom: "定制询价", retired: "已停售" }[status] || status || "待核实";
}
function renderMaintenanceRecords() {
  const el = byId("maintenanceRecords"); if (!el) return;
  const rows = maintenanceData().records.filter((r) => maintenanceRecordFilter === "all" || (maintenanceRecordFilter === "stale" ? r.stale : r.status === "unverified"));
  el.innerHTML = rows.length ? `<ul class="maintenance-records">${rows.map((r) => `<li><strong>${esc(r.vendor + " · " + r.name)}</strong><span>${esc(maintenanceStatusLabel(r.status))}${r.stale ? " · 超期" : ""} · ${esc(r.checkedAt || "未核查")}</span>${maintenanceSources(r.sourceUrls)}</li>`).join("")}</ul>` : `<p>${optionalDataLoaded("maintenance") ? "当前条件没有记录。" : optionalPendingText("逐条维护状态")}</p>`;
}
function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function renderMaintenance() {
  const data = maintenanceData(), el = byId("maintenanceSummary"); if (!el) return;
  const s = data.summary, loaded = optionalDataLoaded("maintenance");
  el.innerHTML = data.generatedAt ? `<p>维护快照 ${esc(data.generatedAt)} · 核查覆盖至 ${esc(data.checkedThrough || "未记录")}。快照按 ${esc(data.staleAfterDays || 14)} 天复查间隔标记超期。</p><dl class="trust-counts"><div><dt>覆盖记录</dt><dd>${s.total}</dd></div><div><dt>已核实</dt><dd>${s.verified}</dd></div><div><dt>待核实</dt><dd>${s.unverified}</dd></div><div><dt>需复查</dt><dd>${s.stale}</dd></div></dl>` : `<p>${loaded ? "维护快照暂未生成，请在完整数据表核对逐条来源。" : optionalPendingText("维护快照与核查统计")}</p>`;
  const select = byId("maintenancePlan");
  if (select) select.innerHTML = '<option value="">选择套餐</option>' + PLANS.map((p) => `<option value="${esc(p.id)}">${esc(planTitle(p))}</option>`).join("");
  const due = data.reviews.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn) && r.reviewOn <= todayLocalIso());
  const reviews = byId("maintenanceReviews");
  if (reviews) reviews.innerHTML = due.length ? `<ul class="review-list">${due.map((r) => `<li><strong>${esc(r.title)}</strong> · 复查日 ${esc(r.reviewOn)}${r.reviewOn < todayLocalIso() ? "（已到期）" : "（今天到期）"}<p>${esc(r.note || "到期需人工复查，不能据此认定价格或权益已变化。")}</p>${maintenanceSources([r.source])}</li>`).join("")}</ul>` : `<p>${loaded ? "当前没有已到期的复查安排。复查提示按本机日期计算，不代表已重新核验。" : optionalPendingText("到期复查提示")}</p>`;
  renderMaintenanceHistory(); renderMaintenanceRecords(); renderFollowedChanges();
}
function benchmarkFilterOptions(key) {
  return [...new Set(benchmarkData().runs.map((r) => r[key]).filter((v) => typeof v === "string" && v))].sort();
}
function benchmarkText(value) { return Array.isArray(value) ? value.join("；") : String(value || ""); }
function benchmarkRunHtml(run) {
  const task = benchmarkData().tasks.find((t) => t.id === run.taskId);
  const cost = run.costBasis === "api-receipt" && typeof run.cost === "number" && Number.isFinite(run.cost) && run.cost >= 0 ? `${run.currency} ${run.cost}` : run.costBasis === "included-subscription" ? "订阅内使用，未分摊单次费用" : "费用未记录";
  const duration = typeof run.durationSeconds === "number" && Number.isFinite(run.durationSeconds) ? `${run.durationSeconds} 秒` : "未记录";
  const generation = typeof run.generationSeconds === "number" && Number.isFinite(run.generationSeconds) ? `${run.generationSeconds} 秒` : "未记录";
  const evidence = /^https:\/\//i.test(run.evidence || "") && safeHref(run.evidence) ? `<a href="${safeHref(run.evidence)}" target="_blank" rel="noopener" tabindex="0">复现证据 ↗</a>` : "复现证据未记录";
  return `<li class="benchmark-run"><h3>${esc(task ? task.title : run.taskId)} · ${esc(run.model)}</h3><p>${esc(run.tool)} · ${esc(run.measuredAt)} · ${run.passed === true ? "全部验收通过" : run.passed === false ? "验收未全部通过" : "验收状态未记录"}</p><dl class="benchmark-values"><div><dt>生成费用</dt><dd>${esc(cost)}</dd></div><div><dt>生成时间</dt><dd>${esc(generation)}</dd></div><div><dt>平均验收运行时间</dt><dd>${esc(duration)}</dd></div><div><dt>同一解答验收次数</dt><dd>${esc(run.repeats)}</dd></div></dl><p>环境：${esc(run.environment || "未记录")}</p><p>${evidence}</p></li>`;
}
function renderBenchmarks() {
  const el = byId("benchmarkResults"); if (!el) return;
  const data = benchmarkData();
  const rows = data.runs.filter((r) => (benchmarkFilter.task === "all" || r.taskId === benchmarkFilter.task) && (benchmarkFilter.tool === "all" || r.tool === benchmarkFilter.tool) && (benchmarkFilter.model === "all" || r.model === benchmarkFilter.model));
  el.innerHTML = rows.length ? `<p>符合条件 ${rows.length} 条贡献者解答记录。不同任务、环境与币种分别展示，不合并成成功率或性能排名。</p><ul class="benchmark-runs">${rows.map(benchmarkRunHtml).join("")}</ul>` : `<p class="benchmark-empty">${!optionalDataLoaded("benchmark") ? optionalPendingText("贡献者任务与记录") : data.runs.length ? "当前筛选没有贡献者记录。" : "尚未收录贡献者任务记录。这里的验收工具用于复现提交的单份解答，未测量的数据不填充分数。"}</p>`;
  const tasks = byId("benchmarkTasks");
  if (tasks) tasks.innerHTML = data.tasks.filter((t) => benchmarkFilter.task === "all" || t.id === benchmarkFilter.task).map((t) => `<details class="method-box"><summary>${esc(t.title)}</summary><p>${esc(t.description)}</p><p><strong>验收条件：</strong>${esc(benchmarkText(t.acceptance))}</p><p>任务标识：<code>${esc(t.id)}</code></p></details>`).join("");
  const method = byId("benchmarkMethodology"); if (method) method.textContent = benchmarkText(data.methodology);
}
function contributionTemplate(type) {
  const p = PLANS.find((plan) => plan.id === maintenancePlanId);
  const common = `\n\n## 官方证据\n- HTTPS 来源链接：\n- 核对日期（YYYY-MM-DD）：\n- 官方原文/截图链接：\n- 适用国家、账号资格与活动限制：\n\n## 变更内容\n- 当前页面显示：\n- 应修正/补充为：\n- 价格币种、计费周期与全年总额：\n- 模型、工具、共享额度与重置窗口：\n\n不要填写账号、API Key、付款隐私或未获许可的内容。\n`;
  if (type === "benchmark") {
    const taskId = benchmarkFilter.task === "all" ? (benchmarkData().tasks[0] || {}).id || "" : benchmarkFilter.task;
    return `# 提交可复现真实任务测评\n\n任务：${taskId}\n模型及精确版本：\n工具及版本：\n生成日期（YYYY-MM-DD）：\n实际生成时间 generationSeconds（秒，未记录填 null）：\n实际 API 账单 cost / currency：\n费用依据 costBasis（api-receipt / included-subscription / unknown）：\n同一解答重复验收次数 repeats：\n平均验收运行时间 durationSeconds（秒）：\n该解答是否全部验收通过 passed：\n操作系统、运行时与环境 environment：\nHTTPS 可公开证据 evidence：\n\n请附原始提示、模型原始解答、验收输出与费用凭证。订阅内使用或费用未知时 cost=null；repeats 是同一解答验收次数，不是模型独立尝试次数。durationSeconds 不能作为模型生成时间。不要上传 API Key 或付费账号信息。\n`;
  }
  return `# ${type === "vendor" ? "申请收录新厂商 / 套餐" : "套餐纠错 / 更新证据"}\n\n厂商：${p ? p.vendor : ""}\n套餐：${p ? p.plan : ""}\n永久套餐 ID：${p ? p.id : ""}${common}`;
}
function renderContribution() {
  const select = byId("contributionType"), preview = byId("contributionTemplate"); if (!select || !preview) return;
  const dataStatus = byId("contributionDataStatus"); if (dataStatus) dataStatus.hidden = select.value !== "benchmark";
  preview.value = contributionTemplate(select.value);
  const issue = byId("contributionIssueLink"), status = byId("contributionProjectNote");
  const base = typeof PUBLIC_PROJECT !== "undefined" ? PUBLIC_PROJECT.githubIssuesBase : null;
  const href = typeof base === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/?$/.test(base)
    ? base.replace(/\/$/, "") + "/new?title=" + encodeURIComponent({ correction:"套餐纠错与更新", vendor:"收录新厂商 / 套餐", benchmark:"真实任务测评" }[select.value] || "套餐反馈") + "&body=" + encodeURIComponent(preview.value) : "";
  if (issue) { issue.hidden = !href; if (href) issue.setAttribute("href", href); }
  if (status) status.textContent = href ? "可复制证据模板后，到项目 Issues 提交；模板中请只包含可公开资料。" : "当前未配置公开仓库提交地址。可复制或下载证据模板，交给项目维护者；本站不会自动发送或上传。";
}
async function copyContributionTemplate() {
  const preview = byId("contributionTemplate"), feedback = byId("contributionFeedback"); if (!preview || !feedback) return;
  const ok = await copyTextToClipboard(preview.value);
  feedback.textContent = ok ? "证据模板已复制；请补全真实来源后提交。" : "未能访问剪贴板，请选择下面的模板手动复制，或下载文件。";
  if (!ok) { preview.focus(); if (typeof preview.select === "function") preview.select(); }
}
function downloadContributionTemplate() {
  const select = byId("contributionType"), preview = byId("contributionTemplate"); if (!select || !preview) return;
  downloadTextFile(preview.value, `coding-plan-${select.value}-evidence.md`, "text/markdown;charset=utf-8");
  const feedback = byId("contributionFeedback"); if (feedback) feedback.textContent = "已生成本地证据模板文件；请补全后交给维护者，文件没有上传。";
}
function downloadPublicData() {
  if (!optionalDataLoaded("maintenance") || !optionalDataLoaded("benchmark")) {
    const feedback = byId("publicDataFeedback"); if (feedback) feedback.textContent = "正在加载完整公开数据…";
    Promise.all([ensureOptionalData("maintenance"), ensureOptionalData("benchmark")]).then(downloadPublicData, () => {
      if (feedback) feedback.textContent = "公开数据加载失败，请重试下载。";
    });
    return;
  }
  const data = { schemaVersion: 1, meta: META, plans: PLANS, apiPrices: API_PRICES, paygReferences: PAYG_REFERENCES, priceChecks: PRICE_CHECKS, maintenance: maintenanceData(), benchmarks: benchmarkData() };
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", `coding-plan-public-data-${META.updated}.json`, "application/json;charset=utf-8");
  const feedback = byId("publicDataFeedback"); if (feedback) feedback.textContent = "已生成公开数据 JSON；不含本机关注、已读记录或待审队列。";
}
function refreshBenchmarkTaskChoices() {
  const data = benchmarkData();
  const task = byId("benchmarkTask"); if (task) task.innerHTML = '<option value="all">全部任务</option>' + data.tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("");
  if (!data.tasks.some((t) => t.id === benchmarkFilter.task)) benchmarkFilter.task = "all";
  if (task) task.value = benchmarkFilter.task;
  for (const key of ["tool", "model"]) {
    const select = byId(key === "tool" ? "benchmarkTool" : "benchmarkModel");
    const choices = benchmarkFilterOptions(key);
    if (!choices.includes(benchmarkFilter[key])) benchmarkFilter[key] = "all";
    if (select) {
      select.innerHTML = `<option value="all">${key === "tool" ? "全部工具" : "全部模型"}</option>` + choices.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      select.value = benchmarkFilter[key];
    }
  }
}
function refreshOptionalViews(kind) {
  if (kind === "maintenance") {
    followState = cleanFollowState(followState);
    renderMaintenance(); syncWatchButtons();
    /* 加载期间可能已收起；成功后也填充关闭的正文，避免再次展开仍停留在加载提示。 */
    qsa("[data-plan-history]").forEach((details) => fillPlanHistory(details, planHistoryParts(details.dataset.planHistory)));
  } else {
    refreshBenchmarkTaskChoices(); syncPublicBenchmarkChoices(); renderPublicBenchmarks(); renderBenchmarks(); renderContribution();
  }
}
function bindMaintenanceEvents() {
  loadFollowState(); renderMaintenance(); syncWatchButtons();
  [["maintenancePlan", () => { maintenancePlanId = byId("maintenancePlan").value; renderMaintenanceHistory(); renderContribution(); }], ["maintenanceRecordFilter", () => { maintenanceRecordFilter = byId("maintenanceRecordFilter").value; renderMaintenanceRecords(); }], ["contributionType", () => {
    renderContribution();
    if (byId("contributionType").value === "benchmark") loadViewData("benchmark");
  }]].forEach(([id, handler]) => { const el = byId(id); if (el) el.addEventListener("change", handler); });
  refreshBenchmarkTaskChoices();
  for (const [key, id] of Object.entries({ task: "benchmarkTask", tool: "benchmarkTool", model: "benchmarkModel" })) {
    const select = byId(id); if (select) select.addEventListener("change", () => {
      const allowed = key === "task" ? benchmarkData().tasks.map((t) => t.id) : benchmarkFilterOptions(key);
      benchmarkFilter[key] = allowed.includes(select.value) ? select.value : "all";
      renderBenchmarks(); renderContribution();
    });
  }
  [["markFollowReadBtn", markFollowedChangesRead], ["copyContributionBtn", copyContributionTemplate], ["downloadContributionBtn", downloadContributionTemplate], ["downloadPublicDataBtn", downloadPublicData]].forEach(([id, handler]) => { const b = byId(id); if (b) b.addEventListener("click", handler); });
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
    const plan = target.closest("[data-benchmark-plan]");
    if (plan && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (e.button == null || e.button === 0)) {
      e.preventDefault(); showPlanDetails(plan.dataset.benchmarkPlan, plan);
    }
    const watch = target.closest("[data-watch-plan]"); if (watch) toggleFollowPlan(watch.dataset.watchPlan);
  });
  document.addEventListener("toggle", (event) => {
    const details = evtTarget(event);
    if (!details || !details.open || !details.dataset.planHistory || optionalDataLoaded("maintenance")) return;
    fillPlanHistory(details, { summary: null, body: "<p>正在加载历史数据…</p>" });
    ensureOptionalData("maintenance").then(() => {
      refreshOptionalViews("maintenance");
    }, () => {
      fillPlanHistory(details, { summary: null, body: "<p>历史数据加载失败，请关闭后重新展开。</p>" });
    });
  }, true);
  bindPublicBenchmarkEvents(); renderBenchmarks(); renderContribution();
}
