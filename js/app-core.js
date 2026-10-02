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
function isRelay(p) {
  if (!p) return false;
  if (RELAY_VENDORS.has(p.vendor)) return true;
  return /仅提供中转|号池|中转站/.test((p.note || "") + (p.plan || ""));
}
/* 自带 IDE/客户端/插件等编程入口（且只是兼容端点的不算），planBadges 与 hasCodingSurface 共用 */
const OWN_CLIENT_RE = /IDE|客户端|桌面|网页|VS Code|插件|编辑器/;
const OWN_CLIENT_EXCLUDE_RE = /协议|框架|端点|兼容/;
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
/* isFlagshipModelName 等额度/模型分类的纯计算函数在 js/metrics.js（校验器与测试共用） */
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
  const ownClient = OWN_CLIENT_RE.test(tools) && !OWN_CLIENT_EXCLUDE_RE.test(tools);
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
  refreshCategoryColors();
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
    btn.innerHTML = mode === "dark" ? icon("moon") : mode === "light" ? icon("sun") : icon("computer");
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
    { icon: "globe", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "stack", num: PLANS.filter(isOnSalePlan).length, lbl: "在售订阅计划", sub: "有标价且未下架" },
    { icon: "gift", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "tag", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    minP && { icon: "arrow-down-circle", lbl: "最低月费", num: fmtCNY(minCny), sub: "/月 · " + planLabel(minP) },
    maxP && { icon: "arrow-up-circle", lbl: "最高月费", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ].filter(Boolean);
  document.getElementById("statsRow").innerHTML = items
    .map((i) => `<div><dt>${icon(i.icon)}${esc(i.lbl)}</dt><dd>${esc(i.num)}${i.sub ? `<small title="${esc(i.sub)}">${esc(i.sub)}</small>` : ""}</dd></div>`)
    .join("");
}

