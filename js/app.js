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

function computeMetrics(m) {
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
  /* 官方 API 刊例，用来和套餐的「月费 ÷ 额度」放在同一列。
     每M = 低峰牌价按 95% 缓存、80/20 折成人民币。不进套餐倍率，也不进排行图。 */
  const specs = [
    { vendor: "DeepSeek", model: "deepseek-v4.1-flash", cur: "USD", apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
      note: "官方低峰价。高峰（UTC 工作日 01:00–04:00、06:00–10:00）输入 $0.30 / 输出 $1.20 / 缓存 $0.006。无订阅计划。",
      source: "api-docs.deepseek.com", url: "https://api-docs.deepseek.com/quick_start/pricing" },
    { vendor: "DeepSeek", model: "deepseek-v4-pro", cur: "USD", apiIn: 0.66, apiOut: 1.98, apiCache: 0.022,
      note: "官方低峰价。高峰输入 $1.32 / 输出 $3.96 / 缓存 $0.044。无订阅计划。",
      source: "api-docs.deepseek.com", url: "https://api-docs.deepseek.com/quick_start/pricing" },
    { vendor: "Z.ai", model: "GLM-5.3", cur: "USD", apiIn: 1.4, apiOut: 4.4, apiCache: 0.26,
      note: "Z.ai 国际站 API 刊例。同一模型另有 GLM Coding Plan 订阅。",
      source: "docs.z.ai", url: "https://docs.z.ai/guides/overview/pricing.md" },
    { vendor: "Z.ai", model: "GLM-5.3-Flash", cur: "USD", apiIn: 0.15, apiOut: 0.5, apiCache: 0.03,
      note: "Z.ai 国际站 API 刊例。缓存输入 $0.03。",
      source: "docs.z.ai", url: "https://docs.z.ai/guides/overview/pricing.md" },
    { vendor: "智谱 BigModel", model: "GLM-5.3", cur: "CNY", apiIn: 8, apiOut: 28, apiCache: 2,
      note: "智谱开放平台 API 刊例。同一模型另有 GLM Coding Plan。",
      source: "docs.bigmodel.cn", url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
    { vendor: "智谱 BigModel", model: "GLM-5.3-Flash", cur: "CNY", apiIn: 0.8, apiOut: 2.8, apiCache: 0.23,
      note: "智谱开放平台 API 刊例。缓存命中 ¥0.23。",
      source: "docs.bigmodel.cn", url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
    { vendor: "月之暗面 Kimi", model: "Kimi K3", cur: "CNY", apiIn: 20, apiOut: 100, apiCache: 2,
      note: "开放平台按量。缓存写入另计 ¥20（5 分钟）。另有 Kimi Code Plan，额度未公布。",
      source: "platform.kimi.com", url: "https://platform.kimi.com/docs/pricing/chat.md" },
    { vendor: "月之暗面 Kimi", model: "Kimi K2.7-Code", cur: "CNY", apiIn: 6.5, apiOut: 27, apiCache: 1.3,
      note: "开放平台编程模型按量。高速版约为两倍：输入 ¥13 / 输出 ¥54 / 缓存 ¥2.6。",
      source: "platform.kimi.com", url: "https://platform.kimi.com/" },
    { vendor: "MiniMax", model: "MiniMax-M3", cur: "CNY", apiIn: 2.1, apiOut: 8.4, apiCache: 0.42,
      note: "≤512K 输入档、永久五折后的价（划线 ¥4.20 / ¥16.80 / 缓存 ¥0.84）。超过 512K 为 ¥4.20 / ¥16.80。另有 Token Plan。",
      source: "platform.minimax.cn", url: "https://platform.minimax.cn/docs/guides/pricing-paygo.md" },
    { vendor: "阿里云百炼", model: "qwen3-coder-plus", cur: "CNY", apiIn: 4, apiOut: 16, apiCache: 0.8,
      note: "≤32K 档、隐式缓存。32K–128K 为 ¥6 / ¥24 / 缓存 ¥1.2；256K–1M 输出 ¥200。另有百炼 Coding Plan。",
      source: "help.aliyun.com", url: "https://help.aliyun.com/zh/model-studio/qwen3-coder-plus" },
  ];
  return specs.map((s) => {
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
const pickerState = { budget: "200", region: "cn", tool: "any", tier: "flagship" };
const PICK_ACCENT = ["#34d399", "#f59e0b", "#6366f1"];

function metricMatchesPlan(m, p) {
  if (Array.isArray(m.ref)) return m.ref[0] === p.vendor && m.ref[1] === p.plan;
  return m.vendor === p.vendor && m.plan === p.plan;
}
function bestMetric(p) {
  const usable = METRICS_ALL
    .filter((m) => metricMatchesPlan(m, p))
    .map((m) => ({ m, c: computeMetrics(m) }))
    .filter((r) => r.c && r.c.costPerM != null && r.c.moLow != null && !r.m.isEst && provenance(r.m).conf !== "低");
  let pool = usable.filter((r) => isFlagshipModelName(r.m.model));
  if (pickerState.tier !== "flagship" && !pool.length) pool = usable;
  const high = pool.filter((r) => provenance(r.m).conf === "高");
  const use = high.length ? high : pool;
  use.sort((a, b) => a.c.costPerM - b.c.costPerM);
  return use[0] || null;
}
function hasCodingSurface(p) {
  const tools = resolvedField(p, "tools");
  if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) return true;
  return /IDE|客户端|桌面|VS Code|插件|编辑器/.test(tools) && !/协议|框架|端点|兼容/.test(tools);
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
function priceLine(p) {
  if (p.priceM === 0) return "免费";
  if (p.cur === "CNY") return priceText(p, "priceM") + "/月";
  return priceText(p, "priceM") + "/月，约 " + fmtCNY(cnyOf(p, "M"));
}
function whyText(p, met) {
  const model = trunc(resolvedField(p, "models"), 56);
  if (p.priceM === 0) return `不花钱就能上手。模型：${model}。额度：${trunc(p.quota, 72)}`;
  if (met && met.c.moLow != null && provenance(met.m).conf === "高") {
    const span = met.c.moHigh > met.c.moLow ? fmtTok(met.c.moLow) + "–" + fmtTok(met.c.moHigh) : fmtTok(met.c.moLow);
    return `月费 ${priceLine(p)}，按 ${met.m.model} 计算每月大约 ${span} tokens，每百万约 ${fmtCpm(met.c.costPerM)}（官方口径）。`;
  }
  if (met && met.c.moLow != null) {
    const span = met.c.moHigh > met.c.moLow ? fmtTok(met.c.moLow) + "–" + fmtTok(met.c.moHigh) : fmtTok(met.c.moLow);
    return `月费 ${priceLine(p)}，模型 ${met.m.model}。官方没有公布每周 tokens；按${provenance(met.m).text}大约 ${span} tokens/月，这个数不能和官方周额度直接比。`;
  }
  return `月费 ${priceLine(p)}。模型：${model}。额度按官方原文：${trunc(p.quota, 72)}`;
}
function avoidText(p, met) {
  const bits = [];
  const models = resolvedField(p, "models");
  const blob = planBlob(p);
  if (/flash|haiku|luna/i.test(models) && isFlagshipModelName(models)) bits.push("套餐里同时有轻量模型，复杂任务要手动选旗舰");
  else if (!isFlagshipModelName(models)) bits.push("这档主要是轻量模型，不适合拿来做复杂重构");
  if (/5\s*小时|\/5h/i.test(p.quota || "")) bits.push("长时间连续跑 agent 时，5 小时窗口用完会停");
  if (p.region === "intl") bits.push("需要外币或国际账号支付");
  if (/BYOK|自备\s*API|自带\s*API/i.test(blob)) bits.push("要自备 API Key，订阅本身不含模型额度");
  if (!met) bits.push("官方没有公布可折算的每月 tokens，买之前要自己看额度够不够");
  else if (met.m.isEst) bits.push("每月 tokens 是社区估算，不是官方数字");
  if (!bits.length) bits.push("额度口径和别家不同，不能只看月费");
  return bits.slice(0, 2).join("。") + "。";
}
function pickCandidates() {
  const budget = pickerState.budget;
  return PLANS.filter((p) => {
    if (isRelay(p) || isRetiredPlan(p)) return false;
    if (budget === "0") {
      if (!isFreeCodingEntry(p)) return false;
    } else if (!isPersonalMonthly(p)) return false;
    else if (budget !== "any" && cnyOf(p, "M") > Number(budget)) return false;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return false;
    if (!matchesTool(p, pickerState.tool)) return false;
    if (pickerState.tier === "flagship" && !isFlagshipModelName(resolvedField(p, "models"))) return false;
    return true;
  });
}
function renderPicker() {
  const matched = pickCandidates();
  const scored = matched.map((p) => {
    const met = bestMetric(p);
    const price = cnyOf(p, "M") || 0;
    const coding = hasCodingSurface(p);
    const conf = met ? provenance(met.m).conf : "";
    let score = 300 + price / 100000;
    if (coding && conf === "高") score = met.c.costPerM;
    else if (coding && conf === "中") score = 20 + price / 100000;
    else if (coding) score = 40 + price / 100000;
    return { p, met, score };
  });
  const bestByVendor = new Map();
  scored.forEach((row) => {
    const prev = bestByVendor.get(row.p.vendor);
    if (!prev || row.score < prev.score) bestByVendor.set(row.p.vendor, row);
  });
  const top = [...bestByVendor.values()].sort((a, b) => a.score - b.score).slice(0, 3);
  const grid = document.getElementById("quickGrid");
  const note = document.getElementById("pickerNote");
  if (!top.length) {
    grid.innerHTML = `<div class="picker-empty">这组条件没有能下单的个人档。可以把预算放开，或把模型改成「含轻量」。</div>`;
    note.textContent = "中转站不参与推荐。价格全景里中转站是单独的红色。";
    return;
  }
  grid.innerHTML = top.map((row, i) => {
    const p = row.p;
    const href = safeHref(p.url);
    const value = p.priceM === 0 ? "<em>免费</em>" : `<em>${esc(p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM)}</em>/月`;
    return `<div class="quick-card" style="--qc-accent:${PICK_ACCENT[i] || PICK_ACCENT[0]}">
      <div class="qc-title">推荐 ${i + 1} · ${esc(REGION_LABEL[p.region] || "")}</div>
      <div class="qc-value">${value}</div>
      <div class="qc-sub"><b>${esc(p.vendor)} ${esc(p.plan)}</b><div class="badge-row">${badgeHtml(p)}</div>
        <div class="qc-why">${esc(whyText(p, row.met))}</div>
        <div class="qc-avoid">不适合：${esc(avoidText(p, row.met))}</div>
      </div>
      ${href ? `<a class="qc-tag" href="${href}" target="_blank" rel="noopener">官网 ↗</a>` : ""}
    </div>`;
  }).join("");
  note.textContent = `符合条件 ${matched.length} 档，按厂商各留一档，取出前 ${top.length} 个。能接到 Claude Code、Codex、Cursor 或自家编程客户端的优先。只有官方每周 tokens 才按每百万成本排序，其余不拿折算 token 数比谁更便宜。中转站不参与。`;
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

  const labels = rows.map((r) => shortVendor(r.m.vendor) + " · " + r.m.plan.replace(/GLM Coding /, "") + " · " + (r.m.model.includes("Flash") ? "Flash" : r.m.model.split("-")[0]));
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
boot("quick", renderPicker);
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
