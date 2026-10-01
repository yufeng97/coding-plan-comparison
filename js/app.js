/* ============ Coding Plan 比价中心 渲染逻辑 ============ */
"use strict";

const CAT_LABEL = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };
const REGION_LABEL = { cn: "国内", intl: "国际" };
const CAT_COLOR = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };

const VENDOR_SHORT = {
  "Cognition Devin Desktop（原 Windsurf）": "Devin Desktop",
  "Cognition Devin Desktop": "Devin Desktop",
  "Cognition Devin（云 agent）": "Devin 云",
  "Roo Code（Roomote）": "Roomote",
  "智谱 BigModel": "BigModel",
  "月之暗面 Kimi": "月之暗面 Kimi",
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
  "阿里云（通义灵码 / Qoder CN）": "阿里云灵码",
  "Factory (Droid)": "Droid",
  "讯飞星辰 MaaS": "讯飞 Astron",
  "Canopy Wave": "Canopy",
};

const RATE = RATE_USD_CNY;
/* 「帮我选」模型角色表的归类日期，取自 data.js 的 MODEL_ROLES.asOf */
const MODEL_ROLES_ASOF = (MODEL_ROLES.find((r) => r.asOf) || {}).asOf || META.updated;

/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
const PLAN_INDEX = new Map(PLANS.map((p) => [p.vendor + "|" + p.plan, p]));
function resolvePlan(m) {
  /* ref 可解析时以 PLANS 价格为准（单一数据源）；解析失败时回退到条目自身价格，避免整页崩溃 */
  if (Array.isArray(m.ref)) {
    const p = PLAN_INDEX.get(m.ref[0] + "|" + m.ref[1]);
    if (p) return { ...m, priceM: p.priceM, cur: p.cur };
    console.warn("[data] ref 未解析，使用条目自身价格:", m.ref.join(" | "));
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
/* 计划分类判定（isRetiredPlan / isOneTimePlan / isRenewalOnly / isPersonalMonthly /
   isFreeCodingEntry / isOnSalePlan）已下沉到 js/data.js，页面与校验器共用同一份，避免逻辑漂移。 */
/* 号池 / API 转售。和官方订阅、Cursor 这类工具订阅分开上色，不进「帮我选」。 */
const RELAY_VENDORS = new Set([
  "R4 Coder（r4.codes）",
  "PackyCode/PackyAPI",
  "PackyCode (Codex 站)",
  "AICodeMirror",
  "88code",
  "DuckCoding",
  "AIGoCode",
  "DevPass",
  "Chutes (chutes.ai)",
]);
const RELAY_COLOR = "#d4534a";
function isRelay(p) {
  if (!p) return false;
  if (RELAY_VENDORS.has(p.vendor)) return true;
  return /仅提供中转|号池|中转站/.test((p.note || "") + (p.plan || ""));
}
/* 「同 Lite 档」沿同一厂商往前找到原文 */
function resolvedField(p, key) {
  const raw = String((p && p[key]) || "");
  if (!p || !/^同/.test(raw)) return raw;
  const idx = PLANS.indexOf(p);
  for (let i = idx - 1; i >= 0; i--) {
    if (PLANS[i].vendor !== p.vendor) break;
    const v = PLANS[i][key];
    if (v && !/^同/.test(v)) return v;
  }
  return raw;
}
function isFlagshipModelName(name) {
  return String(name || "").split(/[、,，/|；;]+/).some((part) => {
    const t = part.trim();
    if (!t || /flash|haiku|luna|nano/i.test(t)) return false;
    return /opus|fable|sonnet|gpt-6 sol|gpt-5|kimi\s*k[23]|\bk3\b|deepseek[\w.\s-]*pro|minimax-m3|mimo[\w.-]*pro|qwen3(?:\.\d+)?-max|qwen3-coder-(?:plus|next)|doubao-seed-[\d.]+-(?:pro|code)|glm-?\s*5|step-5|hy[34]/i.test(t);
  });
}
function planBlob(p) {
  return [p.tools, p.note, p.plan, p.quota].filter(Boolean).join(" ");
}
function planBadges(p) {
  const badges = [];
  const blob = planBlob(p);
  const tools = resolvedField(p, "tools");
  if (isRelay(p)) badges.push({ t: "中转", k: "risk" });
  if (/BYOK|自备\s*API|自带\s*API|自备 Key/i.test(blob)) badges.push({ t: "要自备 Key", k: "risk" });
  if (isRenewalOnly(p)) badges.push({ t: "仅老用户", k: "risk" });
  if (isOneTimePlan(p)) badges.push({ t: "一次性", k: "risk" });
  if (/不稳定|403|连接失败|无法访问/.test(blob)) badges.push({ t: "访问不稳", k: "risk" });
  if (/Claude Code/i.test(tools)) badges.push({ t: "Claude Code", k: "agent" });
  if (/Codex/i.test(tools)) badges.push({ t: "Codex", k: "agent" });
  if (p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) badges.push({ t: "Cursor", k: "agent" });
  const ownClient = /IDE|客户端|桌面|网页|VS Code|插件|编辑器/.test(tools) && !/协议|框架|端点|兼容/.test(tools);
  if (!badges.some((b) => b.k === "agent") && !isRelay(p) && ownClient) badges.push({ t: "自家客户端", k: "agent" });
  return badges;
}
function badgeHtml(p) {
  return planBadges(p).map((b) => `<span class="badge badge-${b.k}">${esc(b.t)}</span>`).join("");
}
function metricOfferOk(m) {
  if (/已停售|已下架|老用户|一次性|预付/.test(m.plan || "")) return false;
  if (Array.isArray(m.ref)) {
    const p = PLAN_INDEX.get(m.ref[0] + "|" + m.ref[1]);
    if (p && (isRetiredPlan(p) || isOneTimePlan(p) || isRenewalOnly(p))) return false;
  }
  return true;
}
const METRICS_ALL = [
  ...METRICS_RAW.map((m) => ({ ...resolvePlan(m), isEst: false })),
  ...ESTIMATES.map((m) => ({ ...resolvePlan(m), isEst: true })),
];

/* ---------- 工具函数 ---------- */
const shortVendor = (v) => VENDOR_SHORT[v] || v;
const fmtCNY = (n) => "¥" + (Math.round(n * 10) / 10).toLocaleString("zh-CN");
const trunc = (s, n) => (!s ? "—" : (s.length > n ? s.slice(0, n) + "…" : s));

function priceOf(p, billing) {
  if (billing === "Y" && p.priceY != null) return p.priceY;
  return p.priceM;
}
function cnyOf(p, billing) {
  const v = priceOf(p, billing);
  if (v == null) return null;
  return p.cur === "USD" ? v * RATE : v;
}
function priceText(p, key) {
  const v = p[key];
  if (v == null) return "按量/定制";
  if (v === 0) return "免费";
  return (p.cur === "USD" ? "$" + v : "¥" + v);
}

const chartCache = {};
function makeChart(id) {
  if (!chartCache[id]) {
    chartCache[id] = echarts.init(document.getElementById(id), null, { renderer: "canvas" });
  }
  return chartCache[id];
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => Object.values(chartCache).forEach((c) => c.resize()), 150);
});

/* ---------- 主题（暗/亮/跟随系统）与图表调色板 ---------- */
let PAL = {};
function refreshPalette() {
  const L = document.documentElement.dataset.theme === "light";
  PAL = L ? {
    text: "#10110f", dim: "#6f726b", catLabel: "#3a3d38", faint: "#8a8d85",
    axisLine: "rgba(16,17,15,.22)", splitLine: "rgba(16,17,15,.07)",
    tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(16,17,15,.18)", tipText: "#10110f",
  } : {
    text: "#eceee8", dim: "#9fa39a", catLabel: "#c8ccc2", faint: "#74786f",
    axisLine: "rgba(236,238,232,.2)", splitLine: "rgba(236,238,232,.08)",
    tipBg: "rgba(22,24,21,.97)", tipBorder: "rgba(236,238,232,.16)", tipText: "#eceee8",
  };
}
function axisStyle() {
  return {
    axisLine: { lineStyle: { color: PAL.axisLine } },
    axisLabel: { color: PAL.dim, fontSize: 12 },
    splitLine: { lineStyle: { color: PAL.splitLine } },
  };
}
function tipStyle(hostEl) {
  return {
    backgroundColor: PAL.tipBg,
    borderColor: PAL.tipBorder,
    borderWidth: 1,
    textStyle: { color: PAL.tipText, fontSize: 12.5 },
    appendToBody: true,
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
      return [x - box.left, y - box.top];
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
function planSearchBlob(p) {
  return foldSearch([p.vendor, p.plan, resolvedField(p, "models"), resolvedField(p, "tools"), p.quota, p.note].join(" "));
}
function queryHit(blob, q) {
  const fq = foldSearch(q);
  return !fq || blob.includes(fq);
}

/* ---------- 明暗主题切换（暗 → 亮 → 跟随系统 循环） ---------- */
const THEME_KEY = "cp-theme";
function applyTheme(mode) {
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const eff = mode === "system" ? (sysDark ? "dark" : "light") : mode;
  document.documentElement.dataset.theme = eff;
  document.documentElement.dataset.themeMode = mode;
  localStorage.setItem(THEME_KEY, mode);
  refreshPalette();
  const btn = document.getElementById("themeBtn");
  if (btn) {
    btn.innerHTML = mode === "dark" ? '<i class="ri-moon-line"></i>' : mode === "light" ? '<i class="ri-sun-line"></i>' : '<i class="ri-computer-line"></i>';
    const name = mode === "dark" ? "暗色" : mode === "light" ? "亮色" : "跟随系统";
    btn.title = "主题：" + name + "（点击切换 暗色 → 亮色 → 跟随系统）";
  }
}
function rerenderCharts() {
  renderPersonalChart(); renderTeamChart(); renderTokensChart(); renderApiChart(); renderRankChart();
}
function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "system");
  document.getElementById("themeBtn").addEventListener("click", () => {
    const order = ["dark", "light", "system"];
    applyTheme(order[(order.indexOf(localStorage.getItem(THEME_KEY) || "system") + 1) % 3]);
    rerenderCharts();
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") { applyTheme("system"); rerenderCharts(); }
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

function renderStats() {
  const vendors = new Set(PLANS.map((p) => p.vendor));
  const freeCnt = PLANS.filter(isFreeCodingEntry).length;
  const paid = PLANS.filter(isPersonalMonthly);
  const minCny = paid.length ? Math.min(...paid.map((p) => cnyOf(p, "M"))) : null;
  const maxCny = paid.length ? Math.max(...paid.map((p) => cnyOf(p, "M"))) : null;
  const minP = minCny == null ? null : paid.find((p) => cnyOf(p, "M") === minCny);
  const maxP = maxCny == null ? null : paid.find((p) => cnyOf(p, "M") === maxCny);
  const items = [
    { icon: "ri-global-line", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "ri-stack-line", num: PLANS.filter(isOnSalePlan).length, lbl: "在售订阅计划", sub: "有标价且未下架" },
    { icon: "ri-gift-line", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "ri-price-tag-3-line", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    minP && { icon: "ri-arrow-down-circle-line", lbl: "最低月费", num: fmtCNY(minCny), sub: "/月 · " + planLabel(minP) },
    maxP && { icon: "ri-arrow-up-circle-line", lbl: "最高月费", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ].filter(Boolean);
  document.getElementById("statsRow").innerHTML = items
    .map((i) => `<div><dt><i class="${esc(i.icon)}"></i>${esc(i.lbl)}</dt><dd>${esc(i.num)}${i.sub ? `<small title="${esc(i.sub)}">${esc(i.sub)}</small>` : ""}</dd></div>`)
    .join("");
}

/* ---------- 个人订阅价格全景 ---------- */
const state1 = { cat: "all", region: "all", billing: "M", q: "", limit: 40 };

function personalTooltip(p) {
  const y = p.priceY != null ? `年付：${p.cur === "USD" ? "$" + p.priceY : "¥" + p.priceY}/月（年付折算）` : "年付：—（仅月付）";
  const unified = priceOf(p, state1.billing);
  const uni = unified != null ? `${p.cur === "USD" ? "$" + unified : "¥" + unified} ≈ ${fmtCNY(cnyOf(p, state1.billing))}` : "—";
  const href = safeHref(p.url);
  return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
    ${state1.billing === "Y" ? `折算价：${esc(uni)}<br/>` : ""}
    月付：${p.priceM != null ? esc(p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM) : "—"} ｜ ${esc(y)}<br/>
    <span style="color:#fcd34d">额度：</span>${esc(trunc(p.quota, 90))}<br/>
    <span style="color:#a5b4fc">模型：</span>${esc(trunc(p.models, 80))}<br/>
    ${isRelay(p) ? `<span style="color:#d4534a">中转站，不和官方订阅比单价</span><br/>` : ""}
    ${p.note ? `<span style="color:${PAL.dim}">备注：${esc(trunc(p.note, 60))}</span><br/>` : ""}
    ${href ? `<span style="color:#6b7893;font-size:11.5px">来源：${href}</span>` : ""}`;
}

function renderPersonalChart() {
  const q1 = state1.q.trim().toLowerCase();
  const rows = PLANS.filter(
    (p) => p.cat !== "team" && !p.seat && p.priceM != null && p.priceM > 0 &&
      !isRetiredPlan(p) && !isOneTimePlan(p) &&
      (state1.cat === "all" || p.cat === state1.cat) &&
      (state1.region === "all" || p.region === state1.region) &&
      (!q1 || queryHit(planSearchBlob(p), q1))
  ).sort((a, b) => cnyOf(a, state1.billing) - cnyOf(b, state1.billing));

  // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
  const noFilter = state1.cat === "all" && state1.region === "all" && !state1.q;
  const limit = noFilter ? state1.limit : null;
  const shown = limit ? rows.slice(0, limit) : rows;

  const el = document.getElementById("chartPersonal");
  el.style.height = Math.max(420, shown.length * 30 + 130) + "px";
  const chart = makeChart("chartPersonal");

  const labels = shown.map((p) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
  const data = shown.map((p) => ({
    value: Math.round(cnyOf(p, state1.billing) * 10) / 10,
    itemStyle: { color: isRelay(p) ? RELAY_COLOR : CAT_COLOR[p.cat], borderRadius: [0, 4, 4, 0] },
    _p: p,
  }));

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", ...tipStyle(el), formatter: (d) => personalTooltip(d.data._p) },
      grid: { left: 16, right: 70, top: 30, bottom: 20, containLabel: true },
      xAxis: { type: "value", name: "统一折算人民币（元/月）", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      yAxis: {
        type: "category", data: labels, inverse: true, ...axisStyle(),
        axisLabel: { color: PAL.catLabel, fontSize: 12.5 },
        axisLine: { lineStyle: { color: PAL.axisLine } },
      },
      series: [
        {
          type: "bar", data, barWidth: 16,
          label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => "¥" + d.value.toLocaleString("zh-CN") },
        },
      ],
    },
    true
  );
  chart.resize();

  const hidden = rows.length - shown.length;
  const excluded = q1 ? PLANS.filter((p) => {
    if (!queryHit(planSearchBlob(p), q1)) return false;
    if (isRetiredPlan(p)) return false;
    const onChart = p.cat !== "team" && !p.seat && p.priceM != null && p.priceM > 0 && !isOneTimePlan(p);
    return !onChart;
  }) : [];
  const reasonOf = (p) => {
    if (p.cat === "team" || p.seat) return "团队/企业档";
    if (isOneTimePlan(p)) return "一次性预付";
    if (p.priceM === 0) return "免费档";
    return "按量或定制";
  };
  const excludedHtml = excluded.length
    ? `<br>这张图只画个人月付。同名模型还有 ${excluded.length} 档不在图上：` +
      excluded.slice(0, 8).map((p) => `${esc(shortVendor(p.vendor))} ${esc(p.plan)}（${reasonOf(p)}）`).join("、") +
      (excluded.length > 8 ? ` 等 ${excluded.length} 档` : "") +
      `。<button type="button" id="showExcludedInTable" class="linkish">在完整表里看</button>`
    : "";
  document.getElementById("notePersonal").innerHTML =
    `当前筛选：${rows.length} 个档位（显示 ${shown.length}） ｜ 汇率 1 USD ≈ ${RATE} CNY（2026-09-23 实测） ｜ 红色是中转站，不和官方订阅、工具订阅放在同一类颜色里 ｜ 搜索会忽略大小写、空格和连字符，并展开「同某档」` +
    (hidden > 0 ? ` ｜ <button type="button" id="showAllPersonal" class="linkish">显示全部 ${rows.length} 档</button>` : "") +
    excludedHtml;
}

/* ---------- 团队 / 企业 / 云厂商（席位价 + 整包价） ---------- */
function renderTeamChart() {
  const rows = PLANS.filter(
    (p) => (p.cat === "team" || (p.cat === "cloud" && p.seat)) && p.priceM != null && p.priceM > 0
  ).sort((a, b) => cnyOf(a, "M") - cnyOf(b, "M"));
  const el = document.getElementById("chartTeam");
  el.style.height = Math.max(380, rows.length * 30 + 130) + "px";
  const chart = makeChart("chartTeam");

  const data = rows.map((p) => ({
    value: Math.round(cnyOf(p, "M") * 10) / 10,
    itemStyle: { color: CAT_COLOR.team, borderRadius: [0, 4, 4, 0] },
    _p: p,
  }));
  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const p = d.data._p;
          const href = safeHref(p.url);
          return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
            ${p.seat ? "每席位/用户/月" : "整包价/月"}：${esc(p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM)} ≈ ${fmtCNY(cnyOf(p, "M"))}${p.priceY != null ? `（年付 ${esc(p.cur === "USD" ? "$" + p.priceY : "¥" + p.priceY)}/月）` : ""}<br/>
            <span style="color:#fcd34d">额度：</span>${esc(trunc(p.quota, 90))}<br/>
            ${href ? `<span style="color:#6b7893;font-size:11.5px">来源：${href}</span>` : ""}`;
        },
      },
      grid: { left: 16, right: 70, top: 20, bottom: 20, containLabel: true },
      xAxis: { type: "value", name: "折算人民币（元/月）", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      yAxis: {
        type: "category", inverse: true,
        data: rows.map((p) => shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : "") + (!p.seat ? "·整包" : "")),
        ...axisStyle(), axisLabel: { color: PAL.catLabel, fontSize: 12.5 },
        axisLine: { lineStyle: { color: PAL.axisLine } },
      },
      series: [{ type: "bar", data, barWidth: 16, label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => "¥" + d.value.toLocaleString("zh-CN") } }],
    },
    true
  );
  chart.resize();
}

/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */
const TOKEN_OFFICIAL_COLOR = "#34d399";
const TOKEN_EST_COLOR = "#fbbf24";

function renderTokensChart() {
  const chart = makeChart("chartTokens");
  const el = document.getElementById("chartTokens");

  const modelShort = (m) =>
    m.includes("Flash") ? "Flash" :
    m.includes("GLM-5.3") ? "GLM-5.3" :
    m.includes("MiniMax") ? "M3" :
    m.includes("Sonnet") ? "Sonnet 5" :
    m.includes("GPT-6") ? "GPT-6 Sol" :
    m.includes("K3") ? "K3" :
    m.includes("Gemini") ? "Gemini" :
    m.includes("hy4") ? "Hy4" :
    m.includes("hy3") ? "Hy3" :
    (m.length > 14 ? m.slice(0, 14) : m);

  const tokPlanLabel = (v, p) => {
    let s = p.replace("Kimi Code Plan ", "Kimi ").replace(/[（）]/g, " ").replace(/\s+/g, " ").trim();
    const vendor = shortVendor(v);
    const tokens = vendor.split(/[\s（(]/).filter((w) => w.length >= 2);
    const named = tokens.some((w) => s.toLowerCase().includes(w.toLowerCase()));
    if (!named) s = vendor + " " + s;
    return s;
  };

  const official = PLAN_TOKENS.flatMap((t) => {
    const p = PLAN_INDEX.get(t.ref[0] + "|" + t.ref[1]);
    if (!p) {
      console.warn("[data] PLAN_TOKENS ref 未解析，已跳过:", t.ref.join(" | "));
      return [];
    }
    return [{
      label: t.plan + "·" + modelShort(t.model),
      model: t.model,
      lowM: t.lowM, highM: t.highM,
      priceCNY: toCNY(p.priceM, p.cur),
      isOfficial: true, url: t.url,
    }];
  });
  /* 社区推算来源：ESTIMATES（≈估行）全部 + METRICS_RAW 中有每周 token 估算、且不是 Z.ai / 智谱 BigModel 的条目（如 MiniMax 第三方估算）
   * （Z.ai 各档已由 PLAN_TOKENS 官方数据代表；智谱 BigModel 国内档额度相同，不重复入图。
   *  LKEAP / 百炼 / 讯飞 / Canopy 为请求数制（tokens 按 ~20K/请求假设折算，误差过大），不入本图，仅在额度深度对比表中呈现） */
  /* 系数折算行（小米 Credits、腾讯积分）有每周 token，但是按假设摊出来的，不进本图 */
  const communitySrc = METRICS_ALL.filter((m) => m.isEst || (m.wkLowM != null && m.vendor !== "Z.ai" && m.vendor !== "智谱 BigModel" && !(m.note && m.note.includes("系数折算"))));
  const community = communitySrc.filter((e) => e.wkLowM != null).map((e) => ({
    label: tokPlanLabel(e.vendor, e.plan) + "·" + modelShort(e.model),
    model: e.model,
    lowM: e.wkLowM, highM: e.wkHighM,
    priceCNY: toCNY(e.priceM, e.cur),
    isOfficial: false, url: e.source, note: e.note, method: e.method || "第三方估算", conf: e.confidence || "低",
  }));
  const rows = [...official, ...community].map((r) => ({ ...r, midM: (r.lowM + r.highM) / 2 }));
  rows.sort((a, b) => b.midM - a.midM);

  el.style.height = Math.max(420, rows.length * 30 + 150) + "px";

  const cats = rows.map((r) => r.label);
  const series = [
    { name: "官方公布", type: "bar", stack: "o", barWidth: 14,
      data: rows.map((r) => r.isOfficial ? { value: r.lowM, _r: r } : null),
      itemStyle: { color: TOKEN_OFFICIAL_COLOR } },
    { name: "官方区间", type: "bar", stack: "o", barWidth: 14,
      data: rows.map((r) => r.isOfficial ? { value: r.highM - r.lowM, _r: r } : null),
      itemStyle: { color: "rgba(52,211,153,.32)", borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: PAL.catLabel, fontSize: 11,
        formatter: (d) => (d.data && d.data._r ? d.data._r.lowM + "–" + d.data._r.highM + "M" : "") } },
    { name: "社区推算", type: "bar", stack: "c", barWidth: 14,
      data: rows.map((r) => !r.isOfficial ? { value: r.lowM, _r: r } : null),
      itemStyle: { color: TOKEN_EST_COLOR } },
    { name: "社区区间", type: "bar", stack: "c", barWidth: 14,
      data: rows.map((r) => !r.isOfficial ? { value: r.highM - r.lowM, _r: r } : null),
      itemStyle: { color: "rgba(251,191,36,.30)", borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: PAL.catLabel, fontSize: 11,
        formatter: (d) => (d.data && d.data._r ? d.data._r.lowM + "–" + d.data._r.highM + "M" : "") } },
  ];

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const r = d.data && d.data._r;
          if (!r) return "";
          const prov = r.isOfficial
            ? '<span class="conf conf-hi">官方公布</span>'
            : `<span class="conf conf-lo">社区推算·${esc(r.conf || "低")}</span>`;
          const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
          return `<b>${esc(r.label)}</b> ${prov}<br/>
            每周可用：${r.lowM}–${r.highM}M tokens（${esc(r.model)}）<br/>
            月费：${fmtCNY(r.priceCNY)} ｜ 每 ¥100/月 ≈ <b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周<br/>
            ${r.note ? `<span style="color:${PAL.dim}">${esc(trunc(r.note, 120))}</span><br/>` : ""}
            ${safeHref(r.url) ? `<span style="color:#8b98b8;font-size:11.5px">来源：${safeHref(r.url)}</span>` : ""}`;
        },
      },
      grid: { left: 16, right: 95, top: 40, bottom: 10, containLabel: true },
      legend: { data: ["官方公布", "社区推算"], textStyle: { color: PAL.dim, fontSize: 12.5 }, top: 4 },
      xAxis: { type: "value", name: "tokens / 周（百万）", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      yAxis: { type: "category", data: cats, inverse: true, ...axisStyle(),
        axisLabel: { color: PAL.catLabel, fontSize: 11.5 },
        axisLine: { lineStyle: { color: PAL.axisLine } } },
      series,
    },
    true
  );
  chart.resize();

  /* 洞察卡：全厂商性价比排行（厂商中立） */
  const valueOf = (r) => (r.priceCNY > 0 ? r.midM / r.priceCNY : -1);
  const byValue = rows.slice().sort((a, b) => valueOf(b) - valueOf(a));
  document.getElementById("tokenInsight").innerHTML = `
    <div style="max-height:600px;overflow:auto">
    <h3>💡 性价比：每 ¥100/月 能买到多少每周 tokens（全部厂商）</h3>
    <table class="mini-table">
      ${byValue.map((r) => {
        const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
        return `
        <tr>
          <td>${esc(r.label)}<br><span style="color:#8b98b8;font-size:11px">${fmtCNY(r.priceCNY)}/月 · ${r.isOfficial
            ? '<span class="conf conf-hi">官方公布</span>'
            : `<span class="conf conf-lo">估算·${esc(r.conf || "低")}</span>`}</span></td>
          <td><b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周</td>
        </tr>`;
      }).join("")}
    </table>
    </div>
    <p style="margin-top:12px;font-size:12.5px;color:#8b98b8">⚠️ 公平比较提示：不同模型产出质量不同——Flash/Haiku 类轻量模型 token 数高但质量低于旗舰；<span style="color:#34d399">绿色柱</span>为 Z.ai 官方公布的估算（目前唯一官方公布每周 tokens 的厂商），<span style="color:#fbbf24">黄色柱</span>为社区推算（受缓存率与动态限流影响，仅供量级参考；方法与置信度见「额度深度对比」表的「依据」列与「方法论」折叠块）。智谱 BigModel 国内 V3 各档积分额度与 Z.ai 相同（¥118/538/1,078 每月）。</p>`;
}

/* ---------- API 按量价格 ---------- */
function renderApiChart() {
  const apiEl = document.getElementById("chartApi");
  apiEl.style.height = "640px";
  const chart = makeChart("chartApi");
  const rows = API_PRICES.map((a) => {
    const inU = a.cur === "CNY" ? a.inCNY / RATE : a.inUSD;
    const outU = a.cur === "CNY" ? a.outCNY / RATE : a.outUSD;
    return { ...a, inUSD: inU, outUSD: outU };
  })
    .filter((a) => a.inUSD != null && a.outUSD != null)
    .sort((x, y) => x.outUSD - y.outUSD);
  const cats = rows.map((a) => displayModelName(a.label || a.model));
  apiEl.style.height = Math.max(640, rows.length * 28 + 72) + "px";

  const fmtPrice = (a, inU, outU) =>
    a.cur === "CNY"
      ? `输入：¥${a.inCNY}/1M（≈$${inU.toFixed(2)}） ｜ 输出：¥${a.outCNY}/1M（≈$${outU.toFixed(2)}）`
      : `输入：$${a.inUSD}/1M ｜ 输出：$${a.outUSD}/1M`;

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis", ...tipStyle(apiEl), axisPointer: { type: "shadow" },
        formatter: (ps) => {
          const a = rows[ps[0].dataIndex];
          const href = safeHref(a.url);
          const shown = displayModelName(a.label || a.model);
          const idLine = a.model && displayModelName(a.model) !== shown ? `<span style="color:${PAL.dim}">计费 ID：${esc(a.model)}</span><br/>` : "";
          return `<b>${esc(a.vendor)} · ${esc(shown)}</b>${a.region === "cn" ? " · 国内" : ""}<br/>${idLine}
            ${fmtPrice(a, a.inUSD, a.outUSD)}<br/>
            ${a.note ? `<span style="color:${PAL.dim}">${esc(trunc(a.note, 120))}</span><br/>` : ""}
            ${href ? `<span style="color:#6b7893;font-size:11.5px">来源：${href}</span>` : ""}`;
        },
      },
      grid: { left: 8, right: 28, top: 40, bottom: 28, containLabel: true },
      legend: { data: ["输入 / 1M tokens", "输出 / 1M tokens"], textStyle: { color: PAL.dim, fontSize: 12.5 }, top: 4 },
      xAxis: { type: "value", name: "USD / 1M", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      yAxis: {
        type: "category", data: cats, inverse: true, ...axisStyle(),
        axisLabel: { color: PAL.catLabel, fontSize: 11, width: 148, overflow: "truncate" },
      },
      series: [
        { name: "输入 / 1M tokens", type: "bar", data: rows.map((a) => a.inUSD), barWidth: 7, itemStyle: { color: "#6366f1", borderRadius: [0, 3, 3, 0] } },
        { name: "输出 / 1M tokens", type: "bar", data: rows.map((a) => a.outUSD), barWidth: 7, itemStyle: { color: "#f472b6", borderRadius: [0, 3, 3, 0] } },
      ],
    },
    true
  );
  chart.resize();

  /* 购买力：$10 按输出价可购 token 量 */
  const chart2 = makeChart("chartPower");
  const el2 = document.getElementById("chartPower");
  el2.style.height = Math.max(420, rows.length * 26 + 120) + "px";
  const power = rows.filter((a) => a.outUSD > 0).map((a) => ({ name: displayModelName(a.label || a.model) + (a.cur === "CNY" ? "·国内" : ""), m: 10 / a.outUSD, a }));
  power.sort((x, y) => y.m - x.m);
  chart2.setOption(
    {
      backgroundColor: "transparent",
      title: { text: "$10 预算的输出 token 购买力（M tokens）", left: "center", top: 6, textStyle: { color: PAL.dim, fontSize: 13, fontWeight: 500 } },
      tooltip: {
        trigger: "item", ...tipStyle(el2),
        formatter: (d) => {
          const row = d.data && d.data.a;
          if (!row) return "";
          const million = d.data.value != null ? d.data.value : d.data.m;
          const price = row.cur === "CNY" ? "¥" + row.outCNY : "$" + row.outUSD;
          return `<b>${esc(row.vendor)} · ${esc(displayModelName(row.label || row.model))}</b><br/>$10 ≈ <b>${Number(million).toFixed(1)}M</b> 输出 tokens<br/>（${price}/1M 输出）`;
        },
      },
      grid: { left: 16, right: 56, top: 42, bottom: 6, containLabel: true },
      xAxis: { type: "value", ...axisStyle() },
      yAxis: { type: "category", inverse: true, data: power.map((p) => p.name), ...axisStyle(), axisLabel: { color: PAL.catLabel, fontSize: 11 } },
      series: [{
        type: "bar", barWidth: 12,
        data: power.map((p) => ({ value: Math.round(p.m * 10) / 10, a: p.a, itemStyle: { color: p.a.cur === "CNY" ? "#34d399" : "#22d3ee", borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (d) => d.value + "M" },
      }],
    },
    true
  );
  chart2.resize();
}

/* ---------- 免费入口 ---------- */
function renderFree() {
  const rows = PLANS.filter(isFreeCodingEntry);
  document.getElementById("freeGrid").innerHTML = rows
    .map((p) => {
      const href = safeHref(p.url);
      return `
      <div class="free-card">
        <div class="fc-head">
          <span class="fc-vendor">${esc(p.vendor)}</span>
          <span class="fc-region">${esc(REGION_LABEL[p.region] || "")}</span>
        </div>
        <div class="fc-plan">${esc(p.plan)}</div>
        <div class="fc-quota"><b>✓</b> ${esc(p.quota)}</div>
        <div class="fc-tools">支持：${esc(trunc(p.tools, 60))}</div>
        ${href ? `<a class="fc-link" href="${href}" target="_blank" rel="noopener">来源 ↗</a>` : ""}
      </div>`;
    })
    .join("");
}

/* ---------- 数据表 ---------- */
const tableState = { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1 };

function renderTable() {
  const q = tableState.search.trim().toLowerCase();
  const onSale = PLANS.filter(isOnSalePlan);
  let rows = onSale.filter((p) =>
    (tableState.cat === "all" || p.cat === tableState.cat) &&
    (tableState.region === "all" || p.region === tableState.region) &&
    (!q || queryHit(planSearchBlob(p), q))
  );
  const k = tableState.sortKey;
  const sortVal = (p) => (p[k] == null ? NaN : p.cur === "USD" ? p[k] * RATE : p[k]);
  rows = rows.slice().sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b);
    const aN = Number.isNaN(va), bN = Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 「定制」（无公开价）恒排末尾 */
    return (va - vb) * tableState.sortDir;
  });
  document.getElementById("tableCount").textContent = `${rows.length} / ${onSale.length} 档`;
  document.querySelectorAll("#planTable thead th.sortable").forEach((th) => {
    th.classList.toggle("sort-active", th.dataset.sort === k);
    const arrow = th.dataset.sort === k ? (tableState.sortDir === 1 ? " ↑" : " ↓") : "";
    const span = th.querySelector("span");
    if (span) span.textContent = (th.dataset.sort === "priceM" ? "月付" : "年付折月") + arrow;
    th.setAttribute("aria-sort", th.dataset.sort === k ? (tableState.sortDir === 1 ? "ascending" : "descending") : "none");
  });
  document.getElementById("tableBody").innerHTML = rows
    .map((p) => {
      const pm = priceText(p, "priceM");
      const pmSub = p.priceM > 0 ? `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "M"))}</span>` : "";
      const py = p.priceY == null ? (p.priceM != null && p.priceM > 0 ? '<span class="sub">仅月付</span>' : "—") : priceText(p, "priceY") + `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "Y"))}</span>`;
      const href = safeHref(p.url);
      return `<tr>
        <td class="td-vendor">${esc(p.vendor)}</td>
        <td class="td-plan"><span class="plan-name">${esc(p.plan)}</span><div class="badge-row">${badgeHtml(p)}</div></td>
        <td><span class="tag tag-${esc(p.cat)}">${esc(CAT_LABEL[p.cat] || p.cat)}</span></td>
        <td class="region-${esc(p.region)}">${esc(REGION_LABEL[p.region] || "")}</td>
        <td class="td-price">${pm}${pmSub}</td>
        <td class="td-price">${py}</td>
        <td class="td-quota">${esc(p.quota)}</td>
        <td class="td-models">${esc(p.models)}</td>
        <td>${esc(p.tools)}</td>
        <td class="td-note">${esc(p.note || "—")}</td>
        <td class="td-trust">${href ? `<a href="${href}" target="_blank" rel="noopener">官网</a>` : "—"}<span class="sub">在售 · 核对 ${esc(META.updated)}</span></td>
      </tr>`;
    })
    .join("");
}

/* ---------- 动态 / 来源 / 说明 ---------- */
function dynItem(d) {
  const href = safeHref(d.url);
  const link = href ? ` <a class="dyn-src" href="${href}" target="_blank" rel="noopener" title="打开来源：${esc(d.url)}">${esc(d.source || "来源")} ↗</a>` : "";
  const when = d.checked ? "核实 " + d.date : d.date;
  const tip = d.checked ? "本站这一天核对到该状态，不是厂商公告日" : "来源写明的发生日期";
  return `<li><span class="dyn-date${d.checked ? " is-checked" : ""}" title="${tip}">${esc(when)}</span><div class="dyn-body">${esc(d.text)}${link}</div></li>`;
}
function renderMisc() {
  const sorted = DYNAMICS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  document.getElementById("dynamicsList").innerHTML = sorted.filter((d) => !d.checked).map(dynItem).join("");
  const checkList = document.getElementById("checkList");
  if (checkList) checkList.innerHTML = sorted.filter((d) => d.checked).map(dynItem).join("");
  document.getElementById("sourceList").innerHTML =
    `<h3>📖 全部来源（官方定价页 / 权威报道）</h3>` +
    SOURCES.map(
      (g) => `<div class="source-group"><b>${esc(g.group)}</b><ul>${g.urls.map((u) => {
        const href = safeHref(u);
        return href ? `<li><a href="${href}" target="_blank" rel="noopener">${esc(u)}</a></li>` : "";
      }).join("")}</ul></div>`
    ).join("");
  document.getElementById("uncertainList").innerHTML = UNCERTAIN.map((u) => `<li>${esc(u)}</li>`).join("");
  const uncertainSummary = document.querySelector("#uncertainWrap summary");
  if (uncertainSummary) uncertainSummary.textContent = `展开全部不确定性说明（共 ${UNCERTAIN.length} 条，点击查看）`;
  document.getElementById("rateText").textContent = RATE;
  document.getElementById("rateText2").textContent = RATE;
  document.getElementById("footDate").textContent = META.updated;
  const heroDate = document.getElementById("heroDate");
  if (heroDate) heroDate.textContent = META.updated;
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  document.querySelectorAll("#planTable thead th, #metricsTable thead th").forEach((th) => (th.scope = "col"));
  document.querySelectorAll("#chipCat .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipCat .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.cat = c.dataset.cat;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  document.querySelectorAll("#chipRegion .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipRegion .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.region = c.dataset.region;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  document.querySelectorAll("#chipBilling .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipBilling .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.billing = c.dataset.billing;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  let searchTimer;
  document.getElementById("chartSearch").addEventListener("input", (e) => {
    state1.q = e.target.value;
    state1.limit = 40; /* 搜索后清空关键词仍回到默认前 40 档，避免停留在「显示全部」状态 */
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderPersonalChart, 150);
  });
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "showAllPersonal") { state1.limit = null; renderPersonalChart(); }
    if (e.target && e.target.id === "showExcludedInTable") {
      const q = state1.q;
      tableState.search = q;
      const input = document.getElementById("searchInput");
      if (input) input.value = q;
      renderTable();
      location.hash = "table";
      document.getElementById("table")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const rel = e.target.closest ? e.target.closest("[data-set-picker]") : null;
    if (rel) {
      const eq = rel.dataset.setPicker.indexOf("=");
      if (eq > 0) setPicker(rel.dataset.setPicker.slice(0, eq), rel.dataset.setPicker.slice(eq + 1));
    }
  });
  document.getElementById("searchInput").addEventListener("input", (e) => { tableState.search = e.target.value; renderTable(); });
  document.getElementById("selectCat").addEventListener("change", (e) => { tableState.cat = e.target.value; renderTable(); });
  document.getElementById("selectRegion").addEventListener("change", (e) => { tableState.region = e.target.value; renderTable(); });
  document.querySelectorAll("#planTable thead th.sortable").forEach((th) =>
    th.addEventListener("click", () => {
      if (tableState.sortKey === th.dataset.sort) tableState.sortDir *= -1;
      else { tableState.sortKey = th.dataset.sort; tableState.sortDir = 1; }
      renderTable();
    })
  );
  document.querySelectorAll("#picker .picker-row").forEach((row) => {
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        row.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
        chip.classList.add("active");
        pickerState[row.dataset.pick] = chip.dataset.value;
        renderPicker();
      });
    });
  });
  document.querySelectorAll("#chipRank .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#chipRank .chip").forEach((x) => x.classList.remove("active"));
      chip.classList.add("active");
      rankState.tier = chip.dataset.rank;
      renderRankChart();
    });
  });
}

/* ---------- 额度深度对比表 ---------- */
const metricsState = { model: "all", ver: "all", sortKey: "cpm", sortDir: 1 };
const WEEKS_PER_MONTH = 4.33;
const SLOTS_PER_WEEK = 5; // 5 个 5h 窗口/周
const API_MIX_IN = 0.8, API_MIX_OUT = 0.2;
const CACHE_HIT_RATE = 0.95;
const TOKENS_PER_REQ = 20000; // 请求数制计划：约 20K tokens/请求

function blendPrice(m) {
  const effIn = CACHE_HIT_RATE * m.apiCache + (1 - CACHE_HIT_RATE) * m.apiIn;
  return API_MIX_IN * effIn + API_MIX_OUT * m.apiOut;
}
function toCNY(v, cur) { return cur === "USD" ? v * RATE : v; }
function fmtTok(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + "B";
  const digits = m < 1 ? 2 : m < 10 ? 1 : 0;
  return Number(m.toFixed(digits)) + "M";
}
function fmtVal(v, cur) {
  if (cur === "CNY") return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
  return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
function rateClass(r) { return r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
function fmtCpm(v) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
function fmtUnit(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10);
  if (n >= 1) return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 10000) / 10000);
}
function listPriceHint(m) {
  if (typeof m.apiIn !== "number") return "";
  const sym = m.cur === "USD" ? "$" : "¥";
  return `<br><span style="color:var(--text-faint);font-size:10.5px" title="模型牌价：输入 / 输出 / 缓存命中，每百万 tokens">${sym}${fmtUnit(m.apiIn)} / ${sym}${fmtUnit(m.apiOut)} / 缓存 ${sym}${fmtUnit(m.apiCache)}</span>`;
}
function cpmColor(v) { return v == null ? "var(--text-faint)" : v <= 0.3 ? "var(--green)" : v <= 1 ? "var(--gold)" : "var(--red)"; }

function periodRates(val5hCNY, valWkCNY, valMoCNY, priceCNY) {
  /* 分母是该时段分摊到的月费：5h = 月费/(4.33×5)，周 = 月费/4.33，月 = 月费 */
  const slots = WEEKS_PER_MONTH * SLOTS_PER_WEEK;
  if (!(priceCNY > 0)) return null;
  return {
    r5h: val5hCNY / (priceCNY / slots),
    rwk: valWkCNY / (priceCNY / WEEKS_PER_MONTH),
    rmo: valMoCNY / priceCNY,
  };
}

function windowTokens(m) {
  if (m.wkLowM != null) {
    const wkLowM = m.wkLowM;
    const wkHighM = m.wkHighM ?? m.wkLowM;
    return {
      fLow: wkLowM / SLOTS_PER_WEEK, fHigh: wkHighM / SLOTS_PER_WEEK,
      wkLowM, wkHighM,
      moLow: wkLowM * WEEKS_PER_MONTH, moHigh: wkHighM * WEEKS_PER_MONTH,
    };
  }
  if (m.reqPerWk == null && m.reqPerMo == null && m.reqPer5h == null) return null;
  const toM = (n) => (n * TOKENS_PER_REQ) / 1e6;
  const wk = m.reqPerWk != null ? toM(m.reqPerWk) : null;
  const moCap = m.reqPerMo != null ? toM(m.reqPerMo) : null;
  const hCap = m.reqPer5h != null ? toM(m.reqPer5h) : null;
  const wkM = wk != null ? wk : moCap != null ? moCap / WEEKS_PER_MONTH : hCap * SLOTS_PER_WEEK;
  const f = hCap != null ? hCap : wkM / SLOTS_PER_WEEK;
  const mo = moCap != null ? moCap : wkM * WEEKS_PER_MONTH;
  return { fLow: f, fHigh: f, wkLowM: wkM, wkHighM: wkM, moLow: mo, moHigh: mo };
}

/* computeMetrics 是纯函数且在排行图/额度表/帮我选里被反复调用，按入参对象做一层缓存 */
const METRICS_COMPUTED = new WeakMap();
function computeMetrics(m) {
  if (METRICS_COMPUTED.has(m)) return METRICS_COMPUTED.get(m);
  const result = computeMetricsUncached(m);
  METRICS_COMPUTED.set(m, result);
  return result;
}
function computeMetricsUncached(m) {
  /* Credits 月池制：额度价值按官方锚点（美元 credits 或 1M Credit=¥1）。
     倍率 = 该时段额度价值 ÷ 该时段分摊月费。写了模型牌价时再把面值折成 tokens。 */
  if (m.creditUSD != null || m.creditCNY != null) {
    if (!(m.priceM > 0)) return null;
    const isUSD = m.creditUSD != null;
    const creditCur = isUSD ? "USD" : "CNY";
    const priceCNY = toCNY(m.priceM, m.cur);
    const valMo = isUSD ? m.creditUSD : m.creditCNY;
    const valWk = valMo / WEEKS_PER_MONTH;
    const val5h = valWk / SLOTS_PER_WEEK;
    const rates = periodRates(toCNY(val5h, creditCur), toCNY(valWk, creditCur), toCNY(valMo, creditCur), priceCNY);
    if (!rates) return null;
    /* 有逐模型牌价时，把 credits 面值折成 tokens（与请求数制同一套 80/20、95% 缓存假设）。
       没有牌价的美元 credits 仍用 ¥10/M 假设，只出每 M 成本、不出 token 列。 */
    if (typeof m.apiIn === "number" && typeof m.apiOut === "number" && typeof m.apiCache === "number") {
      const blend = blendPrice(m);
      if (blend > 0) {
        const moMidM = valMo / blend;
        const wk = moMidM / WEEKS_PER_MONTH;
        const f = wk / SLOTS_PER_WEEK;
        return {
          fLow: f, fHigh: f, wkLowM: wk, wkHighM: wk, moLow: moMidM, moHigh: moMidM,
          moMidM, blend, priceCNY, costPerM: priceCNY / moMidM,
          val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
          r5h: rates.r5h, r5hHi: rates.r5h, rwk: rates.rwk, rwkHi: rates.rwk, rmo: rates.rmo, rmoHi: rates.rmo,
        };
      }
    }
    const costPerM = isUSD && m.creditUSD > 0 ? (priceCNY * 10) / (m.creditUSD * RATE) : null;
    return {
      fLow: null, fHigh: null, wkLowM: null, wkHighM: null,
      moLow: null, moHigh: null, moMidM: null, blend: null, priceCNY, costPerM,
      val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
      r5h: rates.r5h, r5hHi: rates.r5h, rwk: rates.rwk, rwkHi: rates.rwk, rmo: rates.rmo, rmoHi: rates.rmo,
    };
  }

  const w = windowTokens(m);
  if (!w) return null;
  const blend = blendPrice(m);
  if (!(blend > 0) || !(m.priceM > 0)) return null;
  const priceCNY = toCNY(m.priceM, m.cur);
  const val5h = w.fLow * blend, val5hHi = w.fHigh * blend;
  const valWk = w.wkLowM * blend, valWkHi = w.wkHighM * blend;
  const valMo = w.moLow * blend, valMoHi = w.moHigh * blend;
  const rates = periodRates(toCNY(val5h, m.cur), toCNY(valWk, m.cur), toCNY(valMo, m.cur), priceCNY);
  if (!rates) return null;
  const moMidM = (w.moLow + w.moHigh) / 2;
  const costPerM = moMidM > 0 ? priceCNY / moMidM : null;
  const hi = periodRates(toCNY(val5hHi, m.cur), toCNY(valWkHi, m.cur), toCNY(valMoHi, m.cur), priceCNY);
  return {
    ...w, moMidM, blend, priceCNY, costPerM,
    val5h, val5hHi, valWk, valWkHi, valMo, valMoHi,
    r5h: rates.r5h, rwk: rates.rwk, rmo: rates.rmo,
    r5hHi: hi.r5h, rwkHi: hi.rwk, rmoHi: hi.rmo,
  };
}

/* 数据来源标注：每行额度的出处与置信度 */
function provenance(m) {
  if (m.isEst) return { text: m.method, conf: m.confidence };
  if (m.creditCNY != null || m.creditUSD != null) {
    if (typeof m.apiIn === "number") return { text: "牌价折算", conf: "中" };
    return { text: "官方credits", conf: "高" };
  }
  if (m.note && m.note.includes("系数折算")) return { text: "官方系数", conf: "中" };
  if ((m.note && m.note.includes("第三方")) || (m.source && m.source.includes("第三方"))) return { text: "第三方估算", conf: "低" };
  if (m.reqPerWk != null || m.reqPerMo != null || m.reqPer5h != null) return { text: "请求折算", conf: "低" };
  return { text: "官方估算", conf: "高" };
}

function isRankMetric(m) {
  return !m.isEst && m.wkLowM != null && metricOfferOk(m) && provenance(m).conf === "高";
}

function paygReferenceRows() {
  /* 刊例在 data.js 的 PAYG_REFERENCES。每M = 低峰牌价按 95% 缓存、80/20 折成人民币。不进套餐倍率，也不进排行图。 */
  return PAYG_REFERENCES.map((s) => {
    const m = {
      vendor: s.vendor, plan: "官方 API 按量", ver: "—", model: s.model, cur: s.cur,
      apiIn: s.apiIn, apiOut: s.apiOut, apiCache: s.apiCache, tps: "—",
      note: s.note, source: s.source, isEst: false, payg: true, url: s.url,
    };
    return {
      payg: true, m,
      c: {
        priceCNY: null, costPerM: toCNY(blendPrice(m), s.cur),
        fLow: null, moLow: null, r5h: null, rwk: null, rmo: null,
        val5h: null, valWk: null, valMo: null, wkLowM: null,
      },
    };
  });
}

function renderMetricsTable() {
  let rows = METRICS_ALL.map((m) => ({ m, c: computeMetrics(m) })).filter((r) => r.c);
  if (metricsState.model !== "all") rows = rows.filter((r) => r.m.model === metricsState.model);
  if (metricsState.ver !== "all") rows = rows.filter((r) => r.m.ver === metricsState.ver);
  const payg = metricsState.ver === "all"
    ? paygReferenceRows().filter((r) => metricsState.model === "all" || r.m.model === metricsState.model)
    : [];

  const shownRows = payg.concat(rows);
  const k = metricsState.sortKey;
  const sv = (r) => {
    if (k === "price") return r.c.priceCNY;
    if (k === "cpm") return r.c.costPerM ?? NaN;
    if (k === "t5h") return r.c.fLow;
    if (k === "r5h") return r.c.r5h;
    if (k === "twk") return r.c.wkLowM;
    if (k === "rwk") return r.c.rwk;
    if (k === "tmo") return r.c.moLow;
    if (k === "rmo") return r.c.rmo;
    return 0;
  };
  shownRows.sort((a, b) => {
    const va = sv(a), vb = sv(b);
    const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 无对应额度（按量无月费、credits 制等）恒排末尾 */
    return (va - vb) * metricsState.sortDir;
  });
  document.getElementById("metricsCount").textContent = `${shownRows.length} 行`;
  const body = document.getElementById("metricsBody");
  body.innerHTML = shownRows.map(({ m, c, payg: isPayg }) => {
    const cur = m.cur;
    const verCls = m.ver === "V3" ? "ver-v3" : m.ver === "V2" ? "ver-v2" : "ver-na";
    const fTok = (lo, hi) => lo == null ? '<span style="color:var(--text-faint)">credits制</span>' : `${fmtTok(lo)}${hi > lo ? "–" + fmtTok(hi) : ""}`;
    const prov = isPayg ? { text: "官方按量", conf: "高" } : provenance(m);
    const confCls = prov.conf === "高" ? "conf-hi" : prov.conf === "中" ? "conf-mid" : "conf-lo";
    const modelCell = `${esc(displayModelName(m.model))}${(m.note || "").startsWith("对照") ? '<br><span style="color:var(--text-faint);font-size:10px">套餐列表未列 · 牌价对照</span>' : ""}${listPriceHint(m)}`;
    const priceCell = isPayg ? "按量" : fmtCNY(c.priceCNY);
    const cpmCell = fmtCpm(c.costPerM);
    const cpmTitle = isPayg
      ? "官方牌价按 80% 输入 / 20% 输出、95% 缓存命中折成每百万人民币。有峰谷的取低峰。不是套餐月费除以额度。"
      : "每百万 tokens 实际成本（统一折算人民币）";
    const moCell = isPayg ? '<span style="color:var(--text-faint)">无套餐额度</span>' : fTok(c.moLow, c.moHigh);
    const rate = (v) => v == null ? "—" : `${v.toFixed(1)}×`;
    return `<tr class="${m.isEst ? "est-row" : ""}${isPayg ? " payg-row" : ""}">
      <td>${m.isEst ? '<span class="est-badge" title="社区/推算估算值，非官方数字">≈估</span> ' : ""}${esc(m.vendor)}<br><span style="color:var(--text-dim);font-size:11px">${esc(m.plan)}</span></td>
      <td class="col-more"><span class="ver-tag ${verCls}">${esc(m.ver)}</span></td>
      <td style="color:var(--accent-2);font-size:11.5px">${modelCell}</td>
      <td class="td-price">${priceCell}</td>
      <td class="col-more tps-cell">${esc(m.tps || "—")}</td>
      <td style="font-weight:800;color:${cpmColor(c.costPerM)}" title="${esc(cpmTitle)}">${cpmCell}</td>
      <td class="col-more tok-cell">${isPayg ? "—" : fTok(c.fLow, c.fHigh)}</td>
      <td class="col-more val-cell">${isPayg ? "—" : fmtVal(c.val5h, cur)}</td>
      <td class="col-more rate-cell ${isPayg ? "" : rateClass(c.r5h)}">${rate(c.r5h)}</td>
      <td class="col-more tok-cell">${isPayg ? "—" : fTok(c.wkLowM, c.wkHighM)}</td>
      <td class="col-more val-cell">${isPayg ? "—" : fmtVal(c.valWk, cur)}</td>
      <td class="col-more rate-cell ${isPayg ? "" : rateClass(c.rwk)}">${rate(c.rwk)}</td>
      <td class="tok-cell">${moCell}</td>
      <td class="col-more val-cell">${isPayg ? "—" : fmtVal(c.valMo, cur)}</td>
      <td class="col-more rate-cell ${isPayg ? "" : rateClass(c.rmo)}">${rate(c.rmo)}</td>
      <td class="prov-cell" title="${esc([m.note, m.source].filter(Boolean).join(" · "))}"><span class="conf ${confCls}">${esc(prov.conf)}</span>${esc(prov.text)}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#metricsTable th.sortable").forEach((th) => {
    const isActive = th.dataset.sort === metricsState.sortKey;
    th.classList.toggle("sort-active", isActive);
    const arrow = isActive ? (metricsState.sortDir === 1 ? " ↑" : " ↓") : "";
    const span = th.querySelector("span");
    if (span) span.textContent = span.textContent.replace(/[ ↑↓]+$/, "") + arrow;
    th.setAttribute("aria-sort", isActive ? (metricsState.sortDir === 1 ? "ascending" : "descending") : "none");
  });

  document.getElementById("metricsNote").innerHTML =
    `<b>💵每M tokens</b> = 月费÷月 tokens 中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色&gt;¥1）。标「官方 API 按量」的行没有月费，这一列用同一套 80/20、95% 缓存假设把低峰牌价折成人民币，所以能和套餐排在一起；模型名下方仍是原始输入 / 输出 / 缓存命中。套餐行模型名下方的牌价也不是套餐的每 M 成本。同一请求额度下，牌价更高的模型「额度价值 / 倍率」更高，每 M 成本不变。带牌价的 credits 按这套单价把面值折成 tokens；没有逐模型牌价的美元 credits 仍按假设均价 ¥10/M，且不进入「真实单价」排行。标「官方系数」的行用厂商公布的积分系数、按同一套假设摊成 tokens，置信度为中，不进入每周 tokens 图。<br>` +
    `计算假设：输入/输出=80/20、缓存命中率 95%、每周 5 个 5h 窗口、每月 4.33 周。官方周 tokens：Tokens/5h=周÷5，Tokens/月=周×4.33。⏫额度倍率 = 该时段额度价值 ÷ 该时段分摊月费（5h=月费/21.65，周=月费/4.33，月=月费）。<b>「依据」列</b>标注出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间/牌价折算 · <span class="conf conf-lo">低</span>毛利/第三方/请求折算）。当前 ${shownRows.length} 行（含 <b>${payg.length}</b> 行官方按量、<b>${rows.filter((r) => r.m.isEst).length}</b> 行「≈估」），默认按每百万成本从低到高。`;
}

/* 模型筛选下拉：从全部数据源动态填充 */
function populateModelFilter() {
  const sel = document.getElementById("metricsModel");
  const models = [...new Set([...METRICS_ALL.map((m) => m.model), ...paygReferenceRows().map((r) => r.m.model)])].sort((a, b) => displayModelName(a).localeCompare(displayModelName(b), "zh"));
  sel.innerHTML = '<option value="all">全部模型</option>' + models.map((x) => `<option value="${esc(x)}">${esc(displayModelName(x))}</option>`).join("");
}

function bindMetricsEvents() {
  document.getElementById("metricsModel").addEventListener("change", (e) => { metricsState.model = e.target.value; renderMetricsTable(); });
  document.getElementById("metricsVer").addEventListener("change", (e) => { metricsState.ver = e.target.value; renderMetricsTable(); });
  document.querySelectorAll("#metricsTable th.sortable").forEach((th) =>
    th.addEventListener("click", () => {
      if (metricsState.sortKey === th.dataset.sort) metricsState.sortDir *= -1;
      else { metricsState.sortKey = th.dataset.sort; metricsState.sortDir = th.dataset.sort === "cpm" || th.dataset.sort === "price" ? 1 : -1; }
      renderMetricsTable();
    })
  );
  const metricsToggle = document.getElementById("metricsToggle");
  if (metricsToggle) {
    metricsToggle.addEventListener("click", () => {
      const table = document.getElementById("metricsTable");
      const compact = table.classList.toggle("is-compact");
      metricsToggle.textContent = compact ? "展开 5 小时 / 每周明细" : "收起明细";
      metricsToggle.classList.toggle("active", !compact);
    });
  }
}

/* ---------- 帮我选 ---------- */
const pickerState = { budget: "200", region: "cn", tool: "any", task: "both" };
const PICK_ACCENT = ["#34d399", "#f59e0b", "#6366f1", "#f472b6"];
/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
const TOOL_OWN_VENDOR = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
const OWN_VENDOR_NOTE = {
  Cursor: "Cursor 的旗舰模型（Opus、GPT-6 等）走按量池另计费，额度池以 Grok、Composer 为主，所以没拿下复杂任务主计划；适合想把 IDE 和订阅绑在一家的情况。",
  Anthropic: "Claude 官方订阅用的是 Claude Code 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
  OpenAI: "ChatGPT 官方订阅用 Codex 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
};

function metricMatchesPlan(m, p) {
  if (Array.isArray(m.ref)) return m.ref[0] === p.vendor && m.ref[1] === p.plan;
  return m.vendor === p.vendor && m.plan === p.plan;
}
function hasCodingSurface(p) {
  const tools = resolvedField(p, "tools");
  if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) return true;
  return /IDE|客户端|桌面|网页|VS Code|插件|编辑器/.test(tools) && !/协议|框架|端点|兼容/.test(tools);
}
function matchesTool(p, tool) {
  if (tool === "any") return true;
  const tools = resolvedField(p, "tools");
  if (tool === "claude") return /Claude Code/i.test(tools);
  if (tool === "codex") return /Codex/i.test(tools);
  if (tool === "cursor") return p.vendor === "Cursor" || /\bCursor\b/i.test(tools);
  if (tool === "own") return !/Claude Code/i.test(tools) && !/Codex/i.test(tools) && p.vendor !== "Cursor" && !/\bCursor\b/i.test(tools);
  return true;
}
function planTitle(p) {
  const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && String(p.plan || "").startsWith(last)) return parts.slice(0, -1).concat(p.plan).join(" ");
  return `${p.vendor} ${p.plan}`;
}
function priceLine(p) {
  if (p.priceM === 0) return "免费";
  if (p.cur === "CNY") return priceText(p, "priceM") + "/月";
  return priceText(p, "priceM") + "/月，约 " + fmtCNY(cnyOf(p, "M"));
}
function moneyHtml(p) {
  if (!p) return "<em>—</em>";
  if (p.priceM === 0) return "<em>免费</em>";
  const raw = p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM;
  return `<em>${esc(raw)}</em>/月`;
}
function lineHtml(k, text) {
  return `<div class="qc-line"><span class="k">${esc(k)}</span>${esc(text)}</div>`;
}
function bandRank(band) { return band === "A" ? 3 : band === "B" ? 2 : 1; }
function catRank(p) { return p.cat === "official" ? 3 : p.cat === "tool" ? 2 : p.cat === "cloud" ? 1 : 0; }
/* 计划名里的 5x / 20x 优先（× 和 x 都算）。额度原文里的「5× Pro」也算加窗；「5× Free」只是入门档基线。 */
function multiplier(p) {
  const fromPlan = String(p.plan || "").match(/(\d+)\s*[x×]/i);
  if (fromPlan) return Number(fromPlan[1]);
  const q = p.quota || "";
  const named = q.match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
  if (named) return Number(named[1]);
  if (/(\d+)\s*×\s*Free/i.test(q)) return 1;
  return 0;
}
function splitModelAccess(text) {
  const parts = String(text || "").split(/[；;]/);
  if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1])) {
    return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1] };
  }
  return { included: String(text || ""), metered: "" };
}
function modelTextForRoles(p) {
  const own = resolvedField(p, "models");
  if (matchModelRoles(own).length) return own;
  if (!/旗舰|同级|全模型|全系/.test(own)) return own;
  const idx = PLANS.indexOf(p);
  for (let i = idx - 1; i >= 0; i--) {
    if (PLANS[i].vendor !== p.vendor) break;
    const prev = resolvedField(PLANS[i], "models");
    if (matchModelRoles(prev).some((r) => r.task === "hard")) return prev;
  }
  return own;
}
/* 同一 5 小时窗口。双池、或官方按模型分开写条数的，日常模型才算另一池。
   官方逐模型条数（如 Sol 15–160、Luna 350–3,000）是最具体的窗口信号，优先于泛泛的「共享」措辞
   （例：ChatGPT 的「Work 与 Codex 用量共享」说的是跨端共享，不是模型共用窗口）。 */
function oneSharedWindow(p) {
  const q = `${p.quota || ""} ${p.note || ""}`;
  if (/双池|按模型\s*5\s*h|按模型 5h/i.test(q)) return false;
  const named = q.match(/(?:Sol|Luna|Astra|Opus|Haiku|Sonnet)\s*[^。；]{0,24}\d/gi);
  if (named && named.length >= 2) return false;
  if (/共享/.test(q)) return true;
  return true;
}
function metricForRole(p, role) {
  if (!role) return null;
  const rows = METRICS_ALL
    .filter((m) => metricMatchesPlan(m, p) && role.re.test(m.model || ""))
    .map((m) => ({ m, c: computeMetrics(m), conf: provenance(m).conf }))
    .filter((r) => r.c);
  const rank = { "高": 3, "中": 2, "低": 1 };
  rows.sort((a, b) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || ((a.m.isEst ? 1 : 0) - (b.m.isEst ? 1 : 0)));
  return rows[0] || null;
}
function knownTokens(p, role) {
  const met = metricForRole(p, role);
  if (!met || met.conf !== "高" || met.c.moLow == null) return 0;
  return met.c.moLow;
}
function planProfile(p) {
  const access = splitModelAccess(modelTextForRoles(p));
  const included = matchModelRoles(access.included);
  const metered = matchModelRoles(access.metered);
  const hard = included.filter((r) => r.task === "hard" && !r.ceiling);
  const ceilings = included.filter((r) => r.task === "hard" && r.ceiling);
  hard.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  ceilings.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  const headline = hard[0] || ceilings[0] || null;
  const loose = included.filter((r) => r.task === "daily" && r.burn === "slow");
  const shared = oneSharedWindow(p);
  return { p, included, metered, headline, ceilings, loose, shared, internalDaily: shared ? [] : loose };
}
function windowStats(x) {
  const role = x.headline || x.loose[0];
  return { tokens: knownTokens(x.p, role), mult: multiplier(x.p), price: cnyOf(x.p, "M") || 0 };
}
function betterWindow(a, b) {
  const A = windowStats(a);
  const B = windowStats(b);
  if (A.tokens !== B.tokens) return A.tokens > B.tokens;
  if (A.mult !== B.mult) return A.mult > B.mult;
  return A.price > B.price;
}
function tokSpan(c, keyLow, keyHigh) {
  const lo = c[keyLow];
  const hi = c[keyHigh];
  if (hi > lo * 1.05) return fmtTok(lo) + "–" + fmtTok(hi);
  return fmtTok(lo);
}
function windowSentence(p, role) {
  const met = metricForRole(p, role);
  if (met && met.conf === "高" && met.c.fLow != null) {
    return `5 小时窗口按官方每周额度折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens。`;
  }
  const q = String(p.quota || "").replace(/\s+/g, " ");
  const bit = dailyRoleBit(role);
  if (new RegExp(escRe(bit), "i").test(q) && /5\s*小时|\/5h/i.test(q)) {
    return `5 小时窗口按官方原文：${trunc(q, 96)}`;
  }
  if (met && met.conf === "中" && met.c.fLow != null) {
    return `5 小时窗口按${met.m.method || provenance(met.m).text}大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
  }
  if (/5\s*小时|\/5h/i.test(q)) return `官方没有公布这个模型的 5 小时 token 数。原文：${trunc(q, 80)}`;
  return `官方没有公布 5 小时窗口。额度原文：${trunc(q, 72)}`;
}
function offerable(p) {
  /* 「限量抢购/限量释放」不算可直接下单；官方文案里的「不限量」是否定用法，不排除 */
  const blob = (p.plan || "") + (p.note || "");
  if (/抢购/.test(blob)) return false;
  return !/(?:^|[^不])限量/.test(blob);
}
function withinBudget(p) {
  if (isRelay(p) || isRetiredPlan(p) || !offerable(p)) return false;
  if (pickerState.region !== "all" && p.region !== pickerState.region) return false;
  if (!matchesTool(p, pickerState.tool)) return false;
  if (pickerState.budget === "0") return isFreeCodingEntry(p);
  if (!isPersonalMonthly(p)) return false;
  if (pickerState.budget === "any") return true;
  return (cnyOf(p, "M") || 0) <= Number(pickerState.budget) + 0.05;
}
function eligibleProfiles() {
  return PLANS.filter(withinBudget).map(planProfile);
}
function representatives(list, keyOf, better) {
  const pick = better || betterWindow;
  const best = new Map();
  list.forEach((x) => {
    const key = keyOf(x);
    const prev = best.get(key);
    if (!prev || pick(x, prev)) best.set(key, x);
  });
  return [...best.values()];
}
function betterDailyTier(a, b) {
  const sa = hasSeparateDaily(a) ? 1 : 0;
  const sb = hasSeparateDaily(b) ? 1 : 0;
  if (sa !== sb) return sa > sb;
  const ta = knownTokens(a.p, a.loose[0]);
  const tb = knownTokens(b.p, b.loose[0]);
  if (ta !== tb) return ta > tb;
  const ma = multiplier(a.p);
  const mb = multiplier(b.p);
  if (ma !== mb) return ma > mb;
  return (cnyOf(a.p, "M") || 0) < (cnyOf(b.p, "M") || 0);
}
function chooseHardMain(pool) {
  const reps = representatives(pool.filter((x) => x.headline), (x) => x.p.vendor + "|" + x.headline.id);
  reps.sort((a, b) => {
    const band = bandRank(b.headline.band) - bandRank(a.headline.band);
    if (band) return band;
    const tok = knownTokens(b.p, b.headline) - knownTokens(a.p, a.headline);
    if (tok) return tok;
    const mult = multiplier(b.p) - multiplier(a.p);
    if (mult) return mult;
    const cat = catRank(b.p) - catRank(a.p);
    if (cat) return cat;
    const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
    if (coding) return coding;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  return reps[0] || null;
}
function chooseDailyMain(pool) {
  const reps = representatives(pool.filter((x) => x.loose.length), (x) => x.p.vendor + "|" + x.loose[0].id, betterDailyTier);
  reps.sort((a, b) => {
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep) return sep;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure) return pure;
    const tok = knownTokens(b.p, b.loose[0]) - knownTokens(a.p, a.loose[0]);
    if (tok) return tok;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  return reps[0] || null;
}
function chooseMain(pool) {
  if (pickerState.task === "daily") return chooseDailyMain(pool);
  return chooseHardMain(pool) || (pickerState.task === "both" ? chooseDailyMain(pool) : null);
}
/* 同厂商、同一主力模型、更便宜的个人档。主计划按「窗口最大」选档时会跳过中档（如不限预算直接选 Max），
   这里把被跳过的档（如 GLM Coding V3 Pro）补回可见，不然用户会以为厂商只有这一档。 */
function cheaperTiers(main) {
  if (!main.headline) return [];
  const roleId = main.headline.id;
  const mainPrice = cnyOf(main.p, "M") || 0;
  const rows = [];
  PLANS.forEach((p) => {
    if (p.vendor !== main.p.vendor || !isPersonalMonthly(p) || !offerable(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    if ((cnyOf(p, "M") || 0) >= mainPrice - 0.05) return;
    const prof = planProfile(p);
    if (prof.headline && prof.headline.id === roleId) rows.push(prof);
  });
  rows.sort((a, b) => (cnyOf(b.p, "M") || 0) - (cnyOf(a.p, "M") || 0));
  return rows;
}
function peerNote(main, pool) {
  if (!main.headline || knownTokens(main.p, main.headline) <= 0) return "";
  const peers = representatives(
    pool.filter((x) => x.headline && x.p.vendor !== main.p.vendor && x.headline.band === main.headline.band),
    (x) => x.p.vendor
  );
  const quiet = peers.filter((x) => knownTokens(x.p, x.headline) <= 0);
  quiet.sort((a, b) => {
    const code = (/code/i.test(b.p.plan) ? 1 : 0) - (/code/i.test(a.p.plan) ? 1 : 0);
    if (code) return code;
    const cat = catRank(b.p) - catRank(a.p);
    if (cat) return cat;
    return (cnyOf(b.p, "M") || 0) - (cnyOf(a.p, "M") || 0) || a.p.vendor.localeCompare(b.p.vendor, "zh");
  });
  const top = quiet[0];
  if (!top) return "";
  return `同预算还能买 ${planTitle(top.p)}（${top.headline.name}）。官方没有给出高置信的 5 小时 token 数，所以主计划用了能看清窗口的这一档。`;
}
function nextTier(current) {
  const roleId = current.headline && current.headline.id;
  let best = null;
  PLANS.forEach((p) => {
    if (p.vendor !== current.p.vendor || isRelay(p) || !isPersonalMonthly(p) || !offerable(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    const price = cnyOf(p, "M") || 0;
    if (price <= (cnyOf(current.p, "M") || 0) + 0.05) return;
    const prof = planProfile(p);
    if (roleId) {
      if (!prof.headline || prof.headline.id !== roleId) return;
    } else if (!prof.loose.length) return;
    if (!best || price < (cnyOf(best.p, "M") || 0)) best = prof;
  });
  return best;
}
function unlockText(cur, next) {
  const sameHard = cur.headline && next.headline && cur.headline.id === next.headline.id;
  const sameDaily = !cur.headline && !next.headline && cur.loose[0] && next.loose[0] && cur.loose[0].id === next.loose[0].id;
  if (sameHard || sameDaily) {
    const role = cur.headline || cur.loose[0];
    const nextRole = next.headline || next.loose[0];
    const a = metricForRole(cur.p, role);
    const b = metricForRole(next.p, nextRole);
    if (a && b && a.conf === "高" && b.conf === "高" && a.c.fLow != null && b.c.fLow != null) {
      return `模型仍是 ${role.name}。5 小时窗口从大约 ${tokSpan(a.c, "fLow", "fHigh")} tokens 提到 ${tokSpan(b.c, "fLow", "fHigh")} tokens，加的钱换来更大的窗口。`;
    }
    const mult = (next.p.quota || "").match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
    if (mult) return `模型仍是 ${role.name}。官方额度是 ${mult[1]}× ${mult[2]}，加的钱换来更大的窗口。`;
    return `模型仍是 ${role.name}。额度原文：${trunc(next.p.quota, 72)}`;
  }
  if (next.headline && (!cur.headline || bandRank(next.headline.band) > bandRank(cur.headline.band))) {
    return `这档才能把复杂任务模型换成 ${next.headline.name}。${next.headline.reason}。`;
  }
  if (next.loose.length) return `这档带慢烧模型 ${next.loose.map((r) => r.name).join("、")}。${next.loose[0].reason}。`;
  return `额度原文：${trunc(next.p.quota, 80)}`;
}
function dailyEntries(pool, main) {
  return pool.filter((x) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
}
/* 官方在额度原文里给日常模型点名条数的（如 Luna 350–3,000 条/5h），折成每 5h 的 M tokens 作排序信号 */
function dailyRoleBit(role) {
  const words = String(role.name).split(/\s+/);
  const last = words[words.length - 1];
  return /^[A-Za-z][A-Za-z0-9.-]{2,}$/.test(last) ? last : role.name;
}
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function dailyQuotaSignal(p, role) {
  if (!role) return 0;
  const q = String(p.quota || "").replace(/\s+/g, " ");
  const bit = escRe(dailyRoleBit(role));
  const range = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*[–—-]\\s*(\\d[\\d,]*)\\s*条", "i"));
  if (range) return (Number(range[2].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  const single = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*条", "i"));
  if (single) return (Number(single[1].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  return 0;
}
/* 有「独立日常池」的才算硬覆盖：双池计划，或档内慢烧模型单独计额度（如 ChatGPT Plus 的 Luna 独立条数） */
function hasSeparateDaily(x) {
  return x.internalDaily.length > 0 || /双池/.test(x.p.quota || "");
}
function pickSupplement(main, pool) {
  const list = dailyEntries(pool, main).slice().sort((a, b) => {
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep) return sep;
    const sig = dailyQuotaSignal(b.p, b.loose[0]) - dailyQuotaSignal(a.p, a.loose[0]);
    if (sig) return sig;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure) return pure;
    const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
    if (coding) return coding;
    const ta = knownTokens(a.p, a.loose[0]), tb = knownTokens(b.p, b.loose[0]);
    if (ta !== tb) return tb - ta;
    const ma = multiplier(a.p), mb = multiplier(b.p);
    if (ma !== mb) return mb - ma;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
  const remain = cap - (cnyOf(main.p, "M") || 0);
  const fit = list.filter((x) => (cnyOf(x.p, "M") || 0) <= remain + 0.05);
  const dreamed = list.find((x) => hasSeparateDaily(x));
  return { chosen: fit[0] || null, dreamed: dreamed && fit[0] !== dreamed ? dreamed : null, remain };
}
function sameWindowText(profile) {
  const names = profile.included.filter((r) => r.task === "daily").map((r) => r.name);
  if (!profile.headline) return "";
  if (!names.length) return `${profile.headline.name} 这档没有另外的慢烧模型。`;
  return `${names.join("、")} 和 ${profile.headline.name} 共用同一个 5 小时窗口。拿它们做日常，用的还是这一格额度。`;
}
function meteredText(profile) {
  if (!profile.metered.some((r) => r.id === "claude-opus")) return "";
  return "Claude Opus 在另一池，按百万 tokens 计价，不在这档送的慢烧额度里。";
}
function quickCard(accent, title, value, body, plan) {
  const href = plan ? safeHref(plan.url) : "";
  return `<div class="quick-card" style="--qc-accent:${accent}">
    <div class="qc-title">${esc(title)}</div>
    <div class="qc-value">${value}</div>
    <div class="qc-sub">${body}</div>
    ${href ? `<a class="qc-tag" href="${href}" target="_blank" rel="noopener">官网 ↗</a>` : ""}
  </div>`;
}
function mainCard(main, pool) {
  const p = main.p;
  const dailyLead = pickerState.task === "daily" && main.loose.length;
  const bits = [`<b>${esc(planTitle(p))}</b><div class="badge-row">${badgeHtml(p)}</div>`];
  if (dailyLead) {
    const names = main.loose.map((r) => r.name).join("、");
    bits.push(lineHtml("日常", `${names}。${main.loose[0].reason}。`));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.loose[0])));
    if (main.headline) bits.push(lineHtml("同档还有", `${main.headline.name}。${main.shared ? "和慢烧模型共用同一个窗口。" : main.headline.reason + "。"}`));
  } else if (main.headline) {
    const ceiling = main.ceilings.find((r) => r.id !== main.headline.id);
    let hard = `${main.headline.name}。${main.headline.reason}。`;
    if (ceiling) hard += `${ceiling.name} 也能开，${ceiling.reason}。`;
    bits.push(lineHtml("复杂任务", hard));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.headline)));
  } else {
    bits.push(lineHtml("日常", `${main.loose.map((r) => r.name).join("、")}。${main.loose[0].reason}。`));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.loose[0])));
  }
  const meter = meteredText(main);
  if (meter) bits.push(lineHtml("另一池", meter));
  else if (!dailyLead && !main.headline) bits.push(lineHtml("复杂任务", "这组条件里没有能单独拿来做复杂任务的模型，这档先覆盖日常。"));
  const peer = !dailyLead && main.headline ? peerNote(main, pool) : "";
  if (peer) bits.push(lineHtml("同预算", peer));
  const cheaper = cheaperTiers(main);
  if (cheaper.length) {
    const list = cheaper.slice(0, 2).map((x) => `${esc(x.p.plan)}（${esc(priceLine(x.p))}）`).join("、");
    bits.push(lineHtml("省钱档", `同一个 ${esc(main.headline.name)} 还有更便宜的 ${list}，窗口更小。`));
  }
  if (p.region === "intl" && pickerState.region !== "cn") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  const title = dailyLead || !main.headline ? "主计划 · 日常" : "主计划 · 复杂任务";
  return quickCard(PICK_ACCENT[0], title, moneyHtml(p), bits.join(""), p);
}
/* 中间卡的三条底线：能不花钱覆盖就不推荐第二档；要另买时写清差多少；实在没有才留空值 */
function dailyCard(main, pool) {
  const dailyNames = main.loose.map((r) => r.name).join("、");
  const windowNote = main.shared
    ? "和复杂任务模型共用同一个 5 小时窗口，日常用多了会挤占复杂任务额度。"
    : "额度与复杂任务模型分开。";
  if (pickerState.task === "hard") {
    if (main.loose.length) {
      return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("顺手覆盖", `筛选以复杂任务为主，日常可以用同一档里的 ${esc(dailyNames)}，不用另买。${windowNote}`)}`, main.p);
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>",
      lineHtml("这次不配", "筛选以复杂任务为主，这一档也没有能日常慢烧的模型。"), null);
  }
  if (pickerState.task === "daily") {
    const meter = meteredText(main);
    if (meter) {
      return quickCard(PICK_ACCENT[1], "复杂任务", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("另一池", meter)}`, main.p);
    }
    if (main.headline) {
      return quickCard(PICK_ACCENT[1], "复杂任务", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", `${main.headline.name} 也在这档里。${main.shared ? "和慢烧模型共用同一个窗口，偶尔的复杂任务直接用它顶。" : "额度分开，复杂任务直接用。"}`)}`, main.p);
    }
    return quickCard(PICK_ACCENT[1], "复杂任务", "<em>—</em>",
      lineHtml("这档不包含", "这档没有能单独拿来做复杂任务的模型。复杂任务要另买带 Claude Opus 一类模型的订阅。"), null);
  }
  if (main.internalDaily.length) {
    const text = `用 ${dailyNames}。${main.internalDaily[0].reason}。和复杂任务模型分开计算额度，不用再买第二档。`;
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p), `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", text)}`, main.p);
  }
  const shared = main.headline ? sameWindowText(main) : "";
  const sup = pickSupplement(main, pool);
  if (sup.chosen) {
    const roles = sup.chosen.internalDaily.length ? sup.chosen.internalDaily : sup.chosen.loose;
    const sepNote = hasSeparateDaily(sup.chosen) ? "这一档的日常额度是独立池，不占主计划窗口。" : "";
    let text = `日常用 ${roles.map((r) => r.name).join("、")}，${priceLine(sup.chosen.p)}。${roles[0].reason}。${sepNote}`;
    if (sup.dreamed) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(sup.dreamed.p, "M") || 0);
      text += `若要 ${planTitle(sup.dreamed.p)} 里更大的独立池，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(sup.chosen.p),
      `<b>${esc(planTitle(sup.chosen.p))}</b><div class="badge-row">${badgeHtml(sup.chosen.p)}</div>${shared ? lineHtml("同一窗口", shared) : ""}${lineHtml("另开一档", text)}`, sup.chosen.p);
  }
  if (main.loose.length) {
    /* 主计划里的慢烧模型和复杂任务共用窗口，预算内没有更合适的独立慢烧档：日常就在本档覆盖 */
    let text = `用 ${esc(dailyNames)} 做日常。${esc(main.loose[0].reason)}。${esc(windowNote)}`;
    const dream = sup.dreamed || dailyEntries(pool, main)[0];
    if (dream) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
      text += `想要分开的慢烧额度：${esc(planTitle(dream.p))} 月费 ${esc(priceLine(dream.p))}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    } else {
      text += "当前条件下没有带独立慢烧池的另一档。";
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p),
      `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", text)}`, main.p);
  }
  const dream = sup.dreamed || dailyEntries(pool, main)[0];
  if (dream) {
    const names = dream.loose.map((r) => r.name).join("、");
    const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
    const text = `当前预算还剩 ${fmtCNY(Math.max(0, sup.remain))}。它的 ${names} 是独立的慢烧额度，月费 ${priceLine(dream.p)}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(dream.p),
      `<b>${esc(planTitle(dream.p))}</b><div class="badge-row">${badgeHtml(dream.p)}</div><div class="qc-miss">当前预算放不下第二档。</div>${lineHtml("差多少", text)}`, dream.p);
  }
  return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>", lineHtml("没有第二档", "没有找到符合地区和工具、且带慢烧模型的另一档。"), null);
}
function upgradeCard(main) {
  const next = nextTier(main);
  if (!next) {
    return quickCard(PICK_ACCENT[2], "预算再往上", "<em>已最高</em>", lineHtml("这档到顶", "这已经是该厂商在售个人档里，这个模型窗口最大的一档。"), main.p);
  }
  const over = pickerState.budget !== "any" && pickerState.budget !== "0" && (cnyOf(next.p, "M") || 0) > Number(pickerState.budget) + 0.05;
  const flag = over ? `<div class="qc-miss">高于当前预算。</div>` : "";
  return quickCard(PICK_ACCENT[2], "预算再往上", moneyHtml(next.p), `${flag}<b>${esc(planTitle(next.p))}</b>${lineHtml("多出来的是", unlockText(main, next))}`, next.p);
}
/* 工具自家厂商的入门个人档（忽略预算，但尊重地区筛选；地区内没有时回退到国际档并提示） */
function ownVendorCard(main) {
  const vendor = TOOL_OWN_VENDOR[pickerState.tool];
  if (!vendor) return null;
  if (main && main.p.vendor === vendor) return null;
  const all = PLANS.filter((p) => p.vendor === vendor && isPersonalMonthly(p) && offerable(p))
    .sort((a, b) => (cnyOf(a, "M") || 0) - (cnyOf(b, "M") || 0));
  if (!all.length) return null;
  const inRegion = all.filter((p) => pickerState.region === "all" || p.region === pickerState.region);
  const plan = inRegion[0] || all[0];
  const regionMiss = !inRegion.length;
  const prof = planProfile(plan);
  const bits = [`<b>${esc(planTitle(plan))}</b><div class="badge-row">${badgeHtml(plan)}</div>`];
  const role = prof.headline || prof.loose[0];
  if (role) {
    const use = prof.headline ? "复杂任务" : "日常";
    bits.push(lineHtml(use, `${role.name}。${role.reason}。`));
  } else {
    bits.push(lineHtml("额度", trunc(resolvedField(plan, "quota"), 80)));
  }
  if (prof.loose.length && prof.headline) bits.push(lineHtml("日常", `${prof.loose.map((r) => r.name).join("、")}。${windowNoteShort(prof)}`));
  const overBudget = pickerState.budget !== "any" &&
    (cnyOf(plan, "M") || 0) > (pickerState.budget === "0" ? 0 : Number(pickerState.budget) + 0.05);
  if (overBudget) {
    const cap = pickerState.budget === "0" ? "（筛选为免费）" : " " + fmtCNY(Number(pickerState.budget));
    bits.push(`<div class="qc-miss">高于当前预算${cap}。<button type="button" class="linkish" data-set-picker="budget=any">把预算放开</button></div>`);
  } else if (main) bits.push(lineHtml("和主计划", `它没有赢下这组条件的主计划（见第一张卡）。${OWN_VENDOR_NOTE[vendor] || ""}`));
  if (regionMiss) bits.push(`<div class="qc-avoid">${esc(vendor)} 只有国际档，当前地区筛选把它排除了。<button type="button" class="linkish" data-set-picker="region=all">把地区改成「不限」再看</button></div>`);
  else if (plan.region === "intl") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  return quickCard(PICK_ACCENT[3], `${shortVendor(vendor)} 自家订阅`, moneyHtml(plan), bits.join(""), plan);
}
function windowNoteShort(prof) {
  return prof.shared ? "和复杂任务模型共用同一个窗口。" : "额度与复杂任务模型分开。";
}
/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
function setPicker(rowKey, value) {
  const row = document.querySelector(`#picker .picker-row[data-pick="${rowKey}"]`);
  if (row) row.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x.dataset.value === value));
  pickerState[rowKey] = value;
  renderPicker();
}
function renderPicker() {
  const pool = eligibleProfiles();
  const grid = document.getElementById("quickGrid");
  const note = document.getElementById("pickerNote");
  const main = chooseMain(pool);
  const own = ownVendorCard(main);
  if (!main) {
    grid.innerHTML = `<div class="picker-empty">这组条件没有能下单的个人档。可以把预算放开，或把地区改成不限。</div>` + (own || "");
    note.textContent = own
      ? "上面是所选工具的自家订阅，供参考；它不满足当前的预算或地区筛选，所以没进推荐。中转站不参与。"
      : "中转站不参与。模型只分成复杂任务和日常，不使用跑分。";
    return;
  }
  grid.innerHTML = [mainCard(main, pool), dailyCard(main, pool), upgradeCard(main), own].filter(Boolean).join("");
  note.textContent = `符合条件 ${pool.length} 档。${own ? "最后一张是所选工具的自家订阅，供对照，不参与主计划排序。" : "三张卡是一套用法："}复杂任务看最强模型和它的 5 小时窗口，日常只把分开的慢烧额度算作覆盖。预算再往上可以高于当前筛选。模型角色按 ${MODEL_ROLES_ASOF} 的用法归类，不是跑分。中转站不参与。每百万 tokens 排行仍然只比价格。`;
}
function auditProfiles() {
  const by = (vendor, plan) => PLANS.find((p) => p.vendor === vendor && p.plan === plan);
  const idOf = (p) => { const h = planProfile(p).headline; return h ? h.id : ""; };
  const expect = (vendor, plan, id) => {
    const got = idOf(by(vendor, plan));
    if (got !== id) console.error("[picker]", vendor, plan, "headline", got || "(none)", "expected", id || "(none)");
  };
  expect("Anthropic", "Claude Pro", "claude-opus");
  expect("Anthropic", "Claude Free", "");
  expect("Anthropic", "Claude Max 5x", "claude-opus");
  expect("Cursor", "Pro", "");
  expect("OpenAI", "ChatGPT Plus", "gpt-sol");
  expect("智谱 BigModel", "GLM Coding V3 Lite", "glm-5");
  expect("智谱 BigModel", "GLM Coding V3 Pro", "glm-5");
  expect("智谱 BigModel", "GLM Coding V3 Max", "glm-5");
  /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
  const maxProfile = planProfile(by("智谱 BigModel", "GLM Coding V3 Max"));
  if (!cheaperTiers(maxProfile).some((x) => x.p.plan === "GLM Coding V3 Pro")) {
    console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
  }
  const cursor = planProfile(by("Cursor", "Pro"));
  if (!cursor.internalDaily.some((r) => r.id === "grok")) console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
  if (cursor.metered.every((r) => r.id !== "claude-opus")) console.error("[picker] Cursor Pro 的 Opus 应在按量池");
}

/* ---------- 性价比排行图（每 M tokens 成本） ---------- */
const rankState = { tier: "flagship" };
function renderRankChart() {
  const all = METRICS_ALL.filter(isRankMetric).map((m) => ({ m, c: computeMetrics(m) }))
    .filter((r) => r.c && r.c.costPerM != null)
    .filter((r) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
    .sort((a, b) => a.c.costPerM - b.c.costPerM);
  const rows = all.slice(0, 20); /* 图高有限，最多展示前 20 档 */

  const el = document.getElementById("chartRank");
  el.style.height = Math.max(420, rows.length * 30 + 130) + "px";
  const chart = makeChart("chartRank");

  const labels = rows.map((r) => {
    const plan = r.m.plan.replace(/GLM Coding V\d+ /, "Coding ");
    const model = r.m.model.includes("Flash") ? "Flash" : displayModelName(r.m.model);
    return shortVendor(r.m.vendor) + " · " + plan + " · " + model;
  });
  const data = rows.map((r) => {
    const cp = r.c.costPerM;
    const color = cp <= 0.3 ? "#34d399" : cp <= 1 ? "#f59e0b" : "#f87171";
    return { value: Math.round(cp * 1000) / 1000, itemStyle: { color, borderRadius: [0, 4, 4, 0] }, _r: r };
  });

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const r = d.data._r;
          return `<b>${esc(r.m.vendor)} · ${esc(r.m.plan)}</b>（${esc(displayModelName(r.m.model))}）<br/>
            💵每 M tokens：<b style="color:#34d399">¥${r.c.costPerM.toFixed(3)}</b><br/>
            月费：${fmtCNY(r.c.priceCNY)} ｜ 月倍率：<b>${r.c.rmo.toFixed(1)}×</b><br/>
            月 tokens：约 ${fmtTok(r.c.moLow)}${r.c.moHigh > r.c.moLow ? "–" + fmtTok(r.c.moHigh) : ""}`;
        },
      },
      grid: { left: 16, right: 80, top: 20, bottom: 20, containLabel: true },
      xAxis: { type: "value", name: "¥ / 百万 tokens（越低越便宜）", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      yAxis: {
        type: "category", data: labels, inverse: true, ...axisStyle(),
        axisLabel: { color: PAL.catLabel, fontSize: 11.5 },
        axisLine: { lineStyle: { color: PAL.axisLine } },
      },
      series: [{
        type: "bar", data, barWidth: 18,
        label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => "¥" + d.value.toFixed(3) },
      }],
    },
    true
  );
  chart.resize();

  const tierText = rankState.tier === "flagship" ? "当前只看旗舰模型。" : "当前含轻量模型，Flash、Haiku 会因为 token 便宜靠前。";
  document.getElementById("rankNote").textContent =
    `共 ${all.length} 档${all.length > rows.length ? `，此处显示前 ${rows.length} 档` : ""}。${tierText}只统计官方公布每周 tokens、且新用户当前可购买的计划。请求折算、第三方估算、已停售、已下架、一次性预付和仅老用户续费不在此列。绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。`;
}

/* ---------- 初始化：单块失败不阻断其余区块 ---------- */
function boot(name, fn) {
  try { fn(); }
  catch (err) { console.error("[render] " + name, err); }
}
boot("theme", initTheme);
boot("stats", renderStats);
boot("quick", () => { auditProfiles(); renderPicker(); });
boot("rank", renderRankChart);
boot("personal", renderPersonalChart);
boot("team", renderTeamChart);
boot("tokens", renderTokensChart);
boot("api", renderApiChart);
boot("free", renderFree);
boot("table", renderTable);
boot("modelFilter", populateModelFilter);
boot("metrics", renderMetricsTable);
boot("misc", renderMisc);

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
