/* ============ Coding Plan 比价中心 渲染逻辑 ============ */
"use strict";

const CAT_LABEL = { official: "模型官方订阅", tool: "第三方工具订阅", cloud: "云厂商/API 套餐", team: "团队 / 企业档" };
const REGION_LABEL = { cn: "国内", intl: "国际" };
const CAT_COLOR = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };

const VENDOR_SHORT = {
  "Cognition Devin Desktop（原 Windsurf）": "Devin Desktop",
  "Cognition Devin Desktop": "Devin Desktop",
  "Cognition Devin（云 agent）": "Devin 云",
  "智谱 Z.ai（国际版）": "智谱 Z.ai",
  "Roo Code（Roomote）": "Roomote",
  "智谱 AI（国内版）": "智谱(国内)",
  "月之暗面 Kimi": "月之暗面 Kimi",
  "阿里云 Qoder CN（原通义灵码）": "Qoder CN（灵码）",
  "腾讯云 CodeBuddy": "腾讯 CodeBuddy",
  "腾讯云（LKEAP 知识引擎）": "腾讯云 LKEAP",
  "字节跳动 Trae（国内版）": "字节 Trae(国内)",
  "字节跳动 Trae（国际版）": "字节 Trae(国际)",
  "百度文心快码 Comate": "百度 Comate",
  "火山引擎方舟（字节）": "火山方舟",
  "阿里云（通义灵码 / Qoder CN）": "阿里云灵码",
  "Factory (Droid)": "Droid",
  "讯飞星辰 MaaS": "讯飞 Astron",
  "Canopy Wave": "Canopy",
};

const RATE = RATE_USD_CNY;

/* ---------- 计划主索引：METRICS_RAW / ESTIMATES / PLAN_TOKENS 经 ref 引用 PLANS 的价格（单一数据源） ---------- */
const PLAN_INDEX = new Map(PLANS.map((p) => [p.vendor + "|" + p.plan, p]));
function resolvePlan(m) {
  /* ref 可解析时以 PLANS 价格为准（单一数据源）；解析失败时优雅回退到条目自身价格，避免整页崩溃 */
  if (Array.isArray(m.ref)) {
    const p = PLAN_INDEX.get(m.ref[0] + "|" + m.ref[1]);
    if (p) return { ...m, priceM: p.priceM, cur: p.cur };
    console.warn("[data] ref 未解析，使用条目自身价格:", m.ref.join(" | "));
  }
  return m;
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
function tipStyle() {
  return {
    backgroundColor: PAL.tipBg,
    borderColor: PAL.tipBorder,
    borderWidth: 1,
    textStyle: { color: PAL.tipText, fontSize: 12.5 },
    extraCssText: "max-width: 520px; white-space: normal;",
  };
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
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") { applyTheme("system"); rerenderCharts(); }
  });
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
  const freeCnt = PLANS.filter((p) => p.priceM === 0).length;
  const paid = PLANS.filter((p) => p.priceM > 0);
  const minCny = Math.min(...paid.map((p) => cnyOf(p, "M")));
  const maxCny = Math.max(...paid.map((p) => cnyOf(p, "M")));
  const minP = paid.find((p) => cnyOf(p, "M") === minCny);
  const maxP = paid.find((p) => cnyOf(p, "M") === maxCny);
  const items = [
    { icon: "ri-global-line", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "ri-stack-line", num: PLANS.length, lbl: "在售订阅计划", sub: "官方 / 工具 / 中转站" },
    { icon: "ri-gift-line", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "ri-price-tag-3-line", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    { icon: "ri-arrow-down-circle-line", lbl: "最低付费档", num: fmtCNY(minCny), sub: "/月起 · " + planLabel(minP) },
    { icon: "ri-arrow-up-circle-line", lbl: "最高付费档", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ];
  document.getElementById("statsRow").innerHTML = items
    .map((i) => `<div><dt><i class="${i.icon}"></i>${i.lbl}</dt><dd>${i.num}${i.sub ? `<small>${i.sub}</small>` : ""}</dd></div>`)
    .join("");
}

/* ---------- 个人订阅价格全景 ---------- */
const state1 = { cat: "all", region: "all", billing: "M", q: "", limit: 40 };

function personalTooltip(p) {
  const y = p.priceY != null ? `年付：${p.cur === "USD" ? "$" + p.priceY : "¥" + p.priceY}/月（年付折算）` : "年付：—（仅月付）";
  const unified = priceOf(p, state1.billing);
  const uni = unified != null ? `${p.cur === "USD" ? "$" + unified : "¥" + unified} ≈ ${fmtCNY(cnyOf(p, state1.billing))}` : "—";
  return `<b style="font-size:13.5px">${p.vendor} · ${p.plan}</b><br/>
    ${state1.billing === "Y" ? `折算价：${uni}<br/>` : ""}
    月付：${p.priceM != null ? (p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM) : "—"} ｜ ${y}<br/>
    <span style="color:#fcd34d">额度：</span>${trunc(p.quota, 90)}<br/>
    <span style="color:#a5b4fc">模型：</span>${trunc(p.models, 80)}<br/>
    ${p.note ? `<span style="color:${PAL.dim}">备注：${trunc(p.note, 60)}</span><br/>` : ""}
    <span style="color:#6b7893;font-size:11.5px">来源：${p.url}</span>`;
}

function renderPersonalChart() {
  const rows = PLANS.filter(
    (p) => p.cat !== "team" && !p.seat && p.priceM != null && p.priceM > 0 &&
      (state1.cat === "all" || p.cat === state1.cat) &&
      (state1.region === "all" || p.region === state1.region) &&
      (!state1.q || (p.vendor + " " + p.plan + " " + p.models).toLowerCase().includes(state1.q))
  ).sort((a, b) => cnyOf(a, state1.billing) - cnyOf(b, state1.billing));

  // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
  const noFilter = state1.cat === "all" && state1.region === "all" && !state1.q;
  const limit = noFilter ? state1.limit : null;
  const shown = limit ? rows.slice(0, limit) : rows;

  const el = document.getElementById("chartPersonal");
  el.style.height = Math.max(420, shown.length * 30 + 130) + "px";
  const chart = makeChart("chartPersonal");

  const labels = shown.map((p) => shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
  const data = shown.map((p, i) => ({
    value: Math.round(cnyOf(p, state1.billing) * 10) / 10,
    itemStyle: { color: CAT_COLOR[p.cat], borderRadius: [0, 4, 4, 0] },
    _p: p,
  }));

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", ...tipStyle(), formatter: (d) => personalTooltip(d.data._p) },
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
      dataZoom: [{ type: "slider", yAxisIndex: 0, startValue: 0, endValue: shown.length, width: 14, right: 8, borderColor: "rgba(154,167,194,.25)", fillerColor: "rgba(99,102,241,.18)", handleStyle: { color: "#6366f1" }, textStyle: { color: PAL.faint } }],
    },
    true
  );
  chart.resize();

  const hidden = rows.length - shown.length;
  document.getElementById("notePersonal").innerHTML =
    `当前筛选：${rows.length} 个档位（显示 ${shown.length}） ｜ 汇率 1 USD ≈ ${RATE} CNY（2026-09-23 实测） ｜ 无年付价的计划在「年付」视图下仍按月付价显示 ｜ 免费档见「免费入口」区` +
    (hidden > 0 ? ` ｜ <a href="javascript:void(0)" id="showAllPersonal" style="color:var(--accent-2)">📋 显示全部 ${rows.length} 档</a>` : "");
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
        trigger: "item", ...tipStyle(),
        formatter: (d) => {
          const p = d.data._p;
          return `<b style="font-size:13.5px">${p.vendor} · ${p.plan}</b><br/>
            ${p.seat ? "每席位/用户/月" : "整包价/月"}：${p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM} ≈ ${fmtCNY(cnyOf(p, "M"))}${p.priceY != null ? `（年付 ${p.cur === "USD" ? "$" + p.priceY : "¥" + p.priceY}/月）` : ""}<br/>
            <span style="color:#fcd34d">额度：</span>${trunc(p.quota, 90)}<br/>
            <span style="color:#6b7893;font-size:11.5px">来源：${p.url}</span>`;
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
    m.includes("Sonnet") ? "Sonnet 5" :
    m.includes("GPT-6") ? "GPT-6 Sol" :
    m.includes("K3") ? "K3" :
    m.includes("Gemini") ? "Gemini" : "混合";

  const tokPlanLabel = (v, p) => {
    let s = p.replace("Kimi Code Plan ", "Kimi ").replace(/[（）]/g, " ").replace(/\s+/g, " ").trim();
    if (/^(Pro|Max|Free|Go)$/i.test(s)) s = shortVendor(v) + " " + s;
    return s;
  };

  const official = PLAN_TOKENS.map((t) => {
    const p = PLAN_INDEX.get(t.ref[0] + "|" + t.ref[1]);
    if (!p) throw new Error("[data] PLAN_TOKENS ref 无法解析: " + t.ref.join(" | "));
    return {
      label: t.plan + "·" + modelShort(t.model),
      model: t.model,
      lowM: t.lowM, highM: t.highM,
      priceCNY: toCNY(p.priceM, p.cur),
      isOfficial: true, url: t.url,
    };
  });
  /* 社区推算来源：ESTIMATES（≈估行）全部 + METRICS_RAW 中非智谱的有每周 token 估算者（如 MiniMax 第三方估算）
   * （智谱 GLM 各档已由 PLAN_TOKENS 官方数据代表，避免重复；
   *  LKEAP / 百炼 / 讯飞 / Canopy 为请求数制（tokens 按 ~20K/请求假设折算，误差过大），不入本图，仅在额度深度对比表中呈现） */
  const communitySrc = METRICS_ALL.filter((m) => m.isEst || (m.wkLowM != null && !m.vendor.includes("智谱")));
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
        trigger: "item", ...tipStyle(),
        formatter: (d) => {
          const r = d.data && d.data._r;
          if (!r) return "";
          const prov = r.isOfficial
            ? '<span class="conf conf-hi">官方公布</span>'
            : `<span class="conf conf-lo">社区推算·${r.conf || "低"}</span>`;
          return `<b>${r.label}</b> ${prov}<br/>
            每周可用：${r.lowM}–${r.highM}M tokens（${r.model}）<br/>
            月费：${fmtCNY(r.priceCNY)} ｜ 每 ¥100/月 ≈ <b>${(r.midM / r.priceCNY * 100).toFixed(1)}M</b> tokens/周<br/>
            ${r.note ? `<span style="color:${PAL.dim}">${trunc(r.note, 120)}</span><br/>` : ""}
            <span style="color:#8b98b8;font-size:11.5px">来源：${r.url}</span>`;
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
  const byValue = rows.slice().sort((a, b) => b.midM / b.priceCNY - a.midM / a.priceCNY);
  document.getElementById("tokenInsight").innerHTML = `
    <div style="max-height:600px;overflow:auto">
    <h3>💡 性价比：每 ¥100/月 能买到多少每周 tokens（全部厂商）</h3>
    <table class="mini-table">
      ${byValue.map((r) => `
        <tr>
          <td>${r.label}<br><span style="color:#8b98b8;font-size:11px">${fmtCNY(r.priceCNY)}/月 · ${r.isOfficial
            ? '<span class="conf conf-hi">官方公布</span>'
            : `<span class="conf conf-lo">估算·${r.conf || "低"}</span>`}</span></td>
          <td><b>${(r.midM / r.priceCNY * 100).toFixed(1)}M</b> tokens/周</td>
        </tr>`).join("")}
    </table>
    </div>
    <p style="margin-top:12px;font-size:12.5px;color:#8b98b8">⚠️ 公平比较提示：不同模型产出质量不同——Flash/Haiku 类轻量模型 token 数高但质量低于旗舰；<span style="color:#34d399">绿色柱</span>为智谱官方公布的估算（目前唯一官方公布每周 tokens 的厂商），<span style="color:#fbbf24">黄色柱</span>为社区推算（受缓存率与动态限流影响，仅供量级参考；方法与置信度见「额度深度对比」表的「依据」列与「方法论」折叠块）。智谱国内 V3 各档积分额度与 Z.ai 相同（¥118/538/1,078 每月）。</p>`;
}

/* ---------- API 按量价格 ---------- */
function renderApiChart() {
  const chart = makeChart("chartApi");
  const rows = API_PRICES.map((a) => {
    const inU = a.cur === "CNY" ? a.inCNY / RATE : a.inUSD;
    const outU = a.cur === "CNY" ? a.outCNY / RATE : a.outUSD;
    return { ...a, inUSD: inU, outUSD: outU };
  })
    .filter((a) => a.inUSD != null && a.outUSD != null)
    .sort((x, y) => x.outUSD - y.outUSD);
  const cats = rows.map((a) => a.label + (a.cur === "CNY" ? "·国内" : ""));

  const fmtPrice = (a, inU, outU) =>
    a.cur === "CNY"
      ? `输入：¥${a.inCNY}/1M（≈$${inU.toFixed(2)}） ｜ 输出：¥${a.outCNY}/1M（≈$${outU.toFixed(2)}）`
      : `输入：$${a.inUSD}/1M ｜ 输出：$${a.outUSD}/1M`;

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis", ...tipStyle(), axisPointer: { type: "shadow" },
        formatter: (ps) => {
          const a = rows[ps[0].dataIndex];
          return `<b>${a.vendor} · ${a.model}</b><br/>
            ${fmtPrice(a, a.inUSD, a.outUSD)}<br/>
            ${a.note ? `<span style="color:${PAL.dim}">${trunc(a.note, 120)}</span><br/>` : ""}
            <span style="color:#6b7893;font-size:11.5px">来源：${a.url}</span>`;
        },
      },
      grid: { left: 56, right: 20, top: 46, bottom: 6, containLabel: true },
      legend: { data: ["输入 / 1M tokens", "输出 / 1M tokens"], textStyle: { color: PAL.dim, fontSize: 12.5 }, top: 4 },
      xAxis: { type: "category", data: cats, ...axisStyle(), axisLabel: { color: PAL.catLabel, fontSize: 10.5, interval: 0, rotate: 42 } },
      yAxis: { type: "value", name: "USD / 1M tokens", nameTextStyle: { color: PAL.faint }, ...axisStyle() },
      series: [
        { name: "输入 / 1M tokens", type: "bar", data: rows.map((a) => a.inUSD), itemStyle: { color: "#6366f1", borderRadius: [3, 3, 0, 0] } },
        { name: "输出 / 1M tokens", type: "bar", data: rows.map((a) => a.outUSD), itemStyle: { color: "#f472b6", borderRadius: [3, 3, 0, 0] } },
      ],
    },
    true
  );

  /* 购买力：$10 按输出价可购 token 量 */
  const chart2 = makeChart("chartPower");
  const el2 = document.getElementById("chartPower");
  el2.style.height = Math.max(420, rows.length * 26 + 120) + "px";
  const power = rows.map((a) => ({ name: a.label + (a.cur === "CNY" ? "·国内" : ""), m: 10 / a.outUSD, a }));
  power.sort((x, y) => y.m - x.m);
  chart2.setOption(
    {
      backgroundColor: "transparent",
      title: { text: "$10 预算的输出 token 购买力（M tokens）", left: "center", top: 6, textStyle: { color: PAL.dim, fontSize: 13, fontWeight: 500 } },
      tooltip: {
        trigger: "item", ...tipStyle(),
        formatter: (d) => `<b>${d.data.a.vendor} · ${d.data.a.model}</b><br/>$10 ≈ <b>${d.data.m.toFixed(1)}M</b> 输出 tokens<br/>（${d.data.a.cur === "CNY" ? "¥" + d.data.a.outCNY : "$" + d.data.a.outUSD}/1M 输出）`,
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
  const rows = PLANS.filter((p) => p.priceM === 0);
  document.getElementById("freeGrid").innerHTML = rows
    .map((p) => `
      <div class="free-card">
        <div class="fc-head">
          <span class="fc-vendor">${p.vendor}</span>
          <span class="fc-region">${REGION_LABEL[p.region]}</span>
        </div>
        <div class="fc-plan">${p.plan}</div>
        <div class="fc-quota"><b>✓</b> ${p.quota}</div>
        <div class="fc-tools">支持：${trunc(p.tools, 60)}</div>
        <a class="fc-link" href="${p.url}" target="_blank" rel="noopener">来源 ↗</a>
      </div>`)
    .join("");
}

/* ---------- 数据表 ---------- */
const tableState = { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1 };

function renderTable() {
  const q = tableState.search.trim().toLowerCase();
  let rows = PLANS.filter((p) =>
    (tableState.cat === "all" || p.cat === tableState.cat) &&
    (tableState.region === "all" || p.region === tableState.region) &&
    (!q || (p.vendor + p.plan + p.models + p.tools + p.quota).toLowerCase().includes(q))
  );
  const k = tableState.sortKey;
  const sortVal = (p) => (p[k] == null ? NaN : p.cur === "USD" ? p[k] * RATE : p[k]);
  rows = rows.slice().sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b);
    const aN = Number.isNaN(va), bN = Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 「定制」（无公开价）恒排末尾 */
    return (va - vb) * tableState.sortDir;
  });
  document.getElementById("tableCount").textContent = `${rows.length} / ${PLANS.length} 档`;
  document.querySelectorAll("#planTable thead th.sortable").forEach((th) => {
    th.classList.toggle("sort-active", th.dataset.sort === k);
    const arrow = th.dataset.sort === k ? (tableState.sortDir === 1 ? " ↑" : " ↓") : "";
    th.childNodes[0].nodeValue = (th.dataset.sort === "priceM" ? "月付" : "年付折月") + arrow;
    th.setAttribute("aria-sort", th.dataset.sort === k ? (tableState.sortDir === 1 ? "ascending" : "descending") : "none");
  });
  document.getElementById("tableBody").innerHTML = rows
    .map((p) => {
      const pm = priceText(p, "priceM");
      const pmSub = p.priceM > 0 ? `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "M"))}</span>` : "";
      const py = p.priceY == null ? (p.priceM != null && p.priceM > 0 ? '<span class="sub">仅月付</span>' : "—") : priceText(p, "priceY") + `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "Y"))}</span>`;
      return `<tr>
        <td class="td-vendor">${p.vendor}</td>
        <td class="td-plan">${p.plan}</td>
        <td><span class="tag tag-${p.cat}">${CAT_LABEL[p.cat]}</span></td>
        <td class="region-${p.region}">${REGION_LABEL[p.region]}</td>
        <td class="td-price">${pm}${pmSub}</td>
        <td class="td-price">${py}</td>
        <td class="td-quota">${p.quota}</td>
        <td class="td-models">${p.models}</td>
        <td>${p.tools}</td>
        <td class="td-note">${p.note || "—"}</td>
        <td><a href="${p.url}" target="_blank" rel="noopener">↗</a></td>
      </tr>`;
    })
    .join("");
}

/* ---------- 动态 / 来源 / 说明 ---------- */
function renderMisc() {
  document.getElementById("dynamicsList").innerHTML = DYNAMICS.slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((d) => `<li><span class="dyn-date">${d.date}</span><div class="dyn-body">${d.text}${d.url ? ` <a class="dyn-src" href="${d.url}" target="_blank" rel="noopener" title="打开来源：${d.url}">${d.source || "来源"} ↗</a>` : ""}</div></li>`)
    .join("");
  document.getElementById("sourceList").innerHTML =
    `<h3>📖 全部来源（官方定价页 / 权威报道）</h3>` +
    SOURCES.map(
      (g) => `<div class="source-group"><b>${g.group}</b><ul>${g.urls.map((u) => `<li><a href="${u}" target="_blank" rel="noopener">${u}</a></li>`).join("")}</ul></div>`
    ).join("");
  document.getElementById("uncertainList").innerHTML = UNCERTAIN.map((u) => `<li>${u}</li>`).join("");
  document.getElementById("rateText").textContent = RATE;
  document.getElementById("rateText2").textContent = RATE;
  document.getElementById("footDate").textContent = META.updated;
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
  document.getElementById("chartSearch").addEventListener("input", (e) => { state1.q = e.target.value; renderPersonalChart(); });
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "showAllPersonal") { state1.limit = null; renderPersonalChart(); }
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
}

/* ---------- 额度深度对比表 ---------- */
const metricsState = { model: "all", ver: "all", sortKey: "rmo", sortDir: -1 };
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
function fmtTok(m) { return m >= 1000 ? (m / 1000).toFixed(1) + "B" : m.toFixed(0) + "M"; }
function fmtVal(v, cur) {
  if (cur === "CNY") return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
  return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
function rateClass(r) { return r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
function fmtCpm(v) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
function cpmColor(v) { return v == null ? "var(--text-faint)" : v <= 0.3 ? "var(--green)" : v <= 1 ? "var(--gold)" : "var(--red)"; }

function computeMetrics(m) {
  /* Credits 月池制（Command Code 美元 credits / 阶跃 Step 人民币 Credit）：
     额度价值直接按官方锚点计（$X credits 或 1M Credit=¥1），倍率 = 额度价值 ÷ 月费（同币种） */
  if (m.creditUSD != null || m.creditCNY != null) {
    const isUSD = m.creditUSD != null;
    const priceCNY = toCNY(m.priceM, m.cur);
    const valMo = isUSD ? m.creditUSD : m.creditCNY;   // 计划币种
    const valWk = valMo / WEEKS_PER_MONTH;
    const val5h = valWk / SLOTS_PER_WEEK;
    // 每 M tokens 实际成本：美元 credits 按假设混合模型均价 ¥10/M 折算；人民币 Credit 因模型系数未公布，不折算
    const costPerM = isUSD ? (priceCNY * 10) / (m.creditUSD * RATE) : null;
    return {
      fLow: null, fHigh: null, wkLowM: null, wkHighM: null,
      moLow: null, moHigh: null, moMidM: null, blend: null, priceCNY, costPerM,
      val5h, val5hHi: val5h, valWk, valWkHi: valWk, valMo, valMoHi: valMo,
      r5h: val5h / m.priceM,
      rwk: valWk / m.priceM,
      rmo: valMo / m.priceM,
    };
  }

  let wkLowM, wkHighM;
  if (m.wkLowM != null) { wkLowM = m.wkLowM; wkHighM = m.wkHighM ?? m.wkLowM; }
  else if (m.reqPerWk != null) {
    wkLowM = wkHighM = (m.reqPerWk * TOKENS_PER_REQ) / 1e6;
  } else return null;

  const fLow = wkLowM / SLOTS_PER_WEEK, fHigh = wkHighM / SLOTS_PER_WEEK;
  const moLow = wkLowM * WEEKS_PER_MONTH, moHigh = wkHighM * WEEKS_PER_MONTH;
  const blend = blendPrice(m);
  const priceCNY = toCNY(m.priceM, m.cur);

  // 额度价值（按计划币种展示）
  const val5h = fLow * blend; const val5hHi = fHigh * blend;
  const valWk = wkLowM * blend; const valWkHi = wkHighM * blend;
  const valMo = moLow * blend; const valMoHi = moHigh * blend;
  // 倍率统一折 CNY 再除以月费（修复：USD 计划此前 USD价值/CNY月费 混算，被低估 6.71 倍）
  const val5hCNY = toCNY(val5h, m.cur), valWkCNY = toCNY(valWk, m.cur), valMoCNY = toCNY(valMo, m.cur);

  // 每M tokens 实际成本 = 月费(CNY) ÷ 月tokens中值(M)
  let costPerM = null;
  const moMidM = (moLow + moHigh) / 2;
  if (moMidM > 0) costPerM = priceCNY / moMidM;

  // 额度倍率：统一以月费为分母
  return {
    fLow, fHigh, wkLowM, wkHighM, moLow, moHigh, moMidM, blend, priceCNY, costPerM,
    val5h, val5hHi, valWk, valWkHi, valMo, valMoHi,
    r5h: val5hCNY / priceCNY, r5hHi: toCNY(val5hHi, m.cur) / priceCNY,
    rwk: valWkCNY / priceCNY, rwkHi: toCNY(valWkHi, m.cur) / priceCNY,
    rmo: valMoCNY / priceCNY, rmoHi: toCNY(valMoHi, m.cur) / priceCNY,
  };
}

/* 数据来源标注：每行额度的出处与置信度 */
function provenance(m) {
  if (m.isEst) return { text: m.method, conf: m.confidence };
  if (m.creditCNY != null || m.creditUSD != null) return { text: "官方credits", conf: "高" };
  if ((m.note && m.note.includes("第三方")) || (m.source && m.source.includes("第三方"))) return { text: "第三方估算", conf: "低" };
  if (m.reqPerWk != null) return { text: "请求折算", conf: "低" };
  return { text: "官方估算", conf: "高" };
}

function renderMetricsTable() {
  let rows = METRICS_ALL.map((m) => ({ m, c: computeMetrics(m) })).filter((r) => r.c);
  if (metricsState.model !== "all") rows = rows.filter((r) => r.m.model === metricsState.model);
  if (metricsState.ver !== "all") rows = rows.filter((r) => r.m.ver === metricsState.ver);

  const k = metricsState.sortKey;
  const sv = (r) => {
    if (k === "cpm") return r.c.costPerM ?? NaN;
    if (k === "t5h") return r.c.fLow;
    if (k === "r5h") return r.c.r5h;
    if (k === "twk") return r.c.wkLowM;
    if (k === "rwk") return r.c.rwk;
    if (k === "tmo") return r.c.moLow;
    if (k === "rmo") return r.c.rmo;
    return 0;
  };
  rows.sort((a, b) => {
    const va = sv(a), vb = sv(b);
    const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 无对应额度（credits 制等）恒排末尾 */
    return (va - vb) * metricsState.sortDir;
  });

  document.getElementById("metricsCount").textContent = `${rows.length} 行`;
  const body = document.getElementById("metricsBody");
  body.innerHTML = rows.map(({ m, c }) => {
    const cur = m.cur;
    const verCls = m.ver === "V3" ? "ver-v3" : m.ver === "V2" ? "ver-v2" : "ver-na";
    const fTok = (lo, hi) => lo == null ? '<span style="color:var(--text-faint)">credits制</span>' : `${fmtTok(lo)}${hi > lo ? "–" + fmtTok(hi) : ""}`;
    const prov = provenance(m);
    const confCls = prov.conf === "高" ? "conf-hi" : prov.conf === "中" ? "conf-mid" : "conf-lo";
    return `<tr class="${m.isEst ? "est-row" : ""}">
      <td>${m.isEst ? '<span class="est-badge" title="社区/推算估算值，非官方数字">≈估</span> ' : ""}${m.vendor}<br><span style="color:var(--text-dim);font-size:11px">${m.plan}</span></td>
      <td><span class="ver-tag ${verCls}">${m.ver}</span></td>
      <td style="color:var(--accent-2);font-size:11.5px">${m.model}</td>
      <td class="tps-cell">${m.tps || "—"}</td>
      <td style="font-weight:800;color:${cpmColor(c.costPerM)}" title="每百万 tokens 实际成本（统一折算人民币）">${fmtCpm(c.costPerM)}</td>
      <td class="tok-cell">${fTok(c.fLow, c.fHigh)}</td>
      <td class="val-cell">${fmtVal(c.val5h, cur)}</td>
      <td class="rate-cell ${rateClass(c.r5h)}">${c.r5h.toFixed(1)}×</td>
      <td class="tok-cell">${fTok(c.wkLowM, c.wkHighM)}</td>
      <td class="val-cell">${fmtVal(c.valWk, cur)}</td>
      <td class="rate-cell ${rateClass(c.rwk)}">${c.rwk.toFixed(1)}×</td>
      <td class="tok-cell">${fTok(c.moLow, c.moHigh)}</td>
      <td class="val-cell">${fmtVal(c.valMo, cur)}</td>
      <td class="rate-cell ${rateClass(c.rmo)}">${c.rmo.toFixed(1)}×</td>
      <td class="prov-cell" title="${m.isEst ? (m.note || "") : ""}"><span class="conf ${confCls}">${prov.conf}</span>${prov.text}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#metricsTable th.sortable").forEach((th) => {
    const isActive = th.dataset.sort === metricsState.sortKey;
    th.classList.toggle("sort-active", isActive);
    const arrow = isActive ? (metricsState.sortDir === 1 ? " ↑" : " ↓") : "";
    const base = th.textContent.replace(/[ ↑↓]+$/, "");
    th.childNodes[th.childNodes.length - 1].nodeValue = base + arrow;
    th.setAttribute("aria-sort", isActive ? (metricsState.sortDir === 1 ? "ascending" : "descending") : "none");
  });

  document.getElementById("metricsNote").innerHTML =
    `<b>💵每M tokens</b> = 月费÷月tokens中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色>¥1）。Credits 制计划按假设模型均价 ¥10/M（≈$1.5/M）折算，实际取决于所用模型。<br>` +
    `计算假设：输入/输出=80/20、缓存命中率95%、每周5个5h窗口、每月4.33周。Tokens/5h=周÷5，Tokens/月=周×4.33。💰额度价值=tokens(M)×API均价(含缓存折算)。⏫额度倍率=该时段额度价值÷月费。<b>「依据」列</b>标注每行数据出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间折算 · <span class="conf conf-lo">低</span>毛利/第三方估算）。当前 ${rows.length} 行（含 <b>${rows.filter((r) => r.m.isEst).length}</b> 行「≈估」社区推算），默认按月倍率降序。`;
}

/* 模型筛选下拉：从全部数据源动态填充 */
function populateModelFilter() {
  const sel = document.getElementById("metricsModel");
  const models = [...new Set(METRICS_ALL.map((m) => m.model))];
  sel.innerHTML = '<option value="all">全部模型</option>' + models.map((x) => `<option value="${x}">${x}</option>`).join("");
}

function bindMetricsEvents() {
  document.getElementById("metricsModel").addEventListener("change", (e) => { metricsState.model = e.target.value; renderMetricsTable(); });
  document.getElementById("metricsVer").addEventListener("change", (e) => { metricsState.ver = e.target.value; renderMetricsTable(); });
  document.querySelectorAll("#metricsTable th.sortable").forEach((th) =>
    th.addEventListener("click", () => {
      if (metricsState.sortKey === th.dataset.sort) metricsState.sortDir *= -1;
      else { metricsState.sortKey = th.dataset.sort; metricsState.sortDir = -1; }
      renderMetricsTable();
    })
  );
}

/* ---------- 快速决策卡 ---------- */
function renderQuickCards() {
  // 1. 性价比首选：GLM-5.3 模型下最低每M成本（token估算计划）
  const tokenPlans = METRICS_ALL.filter((m) => !m.isEst && m.wkLowM != null && m.model === "GLM-5.3")
    .map((m) => ({ m, c: computeMetrics(m) }))
    .filter((r) => r.c && r.c.costPerM != null)
    .sort((a, b) => a.c.costPerM - b.c.costPerM);
  const best = tokenPlans[0];

  // 2. 国内最便宜付费档（排除已停售）
  const cnPaid = PLANS.filter((p) => p.region === "cn" && p.priceM > 0 && !p.seat && !p.plan.includes("已停售"))
    .sort((a, b) => cnyOf(a, "M") - cnyOf(b, "M"))[0];

  // 3. 最佳免费（取 Gemini CLI）
  const gemini = PLANS.find((p) => p.vendor === "Google" && p.plan.includes("个人免费"));

  // 4. 国际旗舰（Claude Pro）
  const flagship = PLANS.find((p) => p.vendor === "Anthropic" && p.plan === "Claude Pro");

  const cards = [];
  if (best) {
    cards.push({
      icon: "🏆", accent: "#34d399", title: "性价比首选（每 M tokens 成本最低）",
      value: `<em>${fmtCpm(best.c.costPerM)}</em> / M tokens`,
      sub: `<b>${best.m.vendor} ${best.m.plan}</b>（${best.m.model}）<br>月费 ${fmtCNY(best.c.priceCNY)} · 月倍率 <b>${best.c.rmo.toFixed(1)}×</b> · 每月约 ${fmtTok(best.c.moLow)}–${fmtTok(best.c.moHigh)} tokens`,
      tag: `额度价值是月费的 ${best.c.rmo.toFixed(0)} 倍`,
    });
  }
  if (cnPaid) {
    cards.push({
      icon: "💵", accent: "#f59e0b", title: "国内付费最便宜",
      value: `<em>${priceText(cnPaid, "priceM")}</em>/月`,
      sub: `<b>${cnPaid.vendor} ${cnPaid.plan}</b><br>${trunc(cnPaid.quota, 80)}`,
      tag: "国内最低付费档",
    });
  }
  if (gemini) {
    cards.push({
      icon: "🆓", accent: "#22d3ee", title: "零成本上手（推荐）",
      value: "<em>免费</em>",
      sub: `<b>${gemini.vendor} ${gemini.plan}</b><br>${trunc(gemini.quota, 90)}`,
      tag: "免费入口共 " + PLANS.filter((p) => p.priceM === 0).length + " 个，见下方",
    });
  }
  if (flagship) {
    cards.push({
      icon: "🌟", accent: "#6366f1", title: "国际旗舰体验",
      value: `<em>$${flagship.priceM}</em>/月`,
      sub: `<b>${flagship.vendor} ${flagship.plan}</b><br>${trunc(flagship.quota, 80)}`,
      tag: "Claude Code + 全模型",
    });
  }

  document.getElementById("quickGrid").innerHTML = cards
    .map((c) => `
      <div class="quick-card" style="--qc-accent:${c.accent}">
        <div class="qc-icon">${c.icon}</div>
        <div class="qc-title">${c.title}</div>
        <div class="qc-value">${c.value}</div>
        <div class="qc-sub">${c.sub}</div>
        <div class="qc-tag">${c.tag}</div>
      </div>`)
    .join("");
}

/* ---------- 性价比排行图（每 M tokens 成本） ---------- */
function renderRankChart() {
  const rows = METRICS_ALL.filter((m) => !m.isEst).map((m) => ({ m, c: computeMetrics(m) }))
    .filter((r) => r.c && r.c.costPerM != null)
    .sort((a, b) => a.c.costPerM - b.c.costPerM)
    .slice(0, 20);

  const el = document.getElementById("chartRank");
  el.style.height = Math.max(420, rows.length * 30 + 130) + "px";
  const chart = makeChart("chartRank");

  const labels = rows.map((r) => r.m.vendor.replace(/（.*）/, "").trim() + " · " + r.m.plan.replace(/GLM Coding /, "") + " · " + (r.m.model.includes("Flash") ? "Flash" : r.m.model.split("-")[0]));
  const data = rows.map((r) => {
    const cp = r.c.costPerM;
    const color = cp <= 0.3 ? "#34d399" : cp <= 1 ? "#f59e0b" : "#f87171";
    return { value: Math.round(cp * 1000) / 1000, itemStyle: { color, borderRadius: [0, 4, 4, 0] }, _r: r };
  });

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(),
        formatter: (d) => {
          const r = d.data._r;
          return `<b>${r.m.vendor} · ${r.m.plan}</b>（${r.m.model}）<br/>
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

  document.getElementById("rankNote").textContent =
    `Top ${rows.length} 最低每 M tokens 成本（统一折算人民币）。绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。GLM-5.3-Flash 虽然每 M 更便宜但为轻量模型，产出质量与旗舰不同。`;
}

/* ---------- 初始化 ---------- */
initTheme();
renderStats();
renderQuickCards();
renderRankChart();
renderPersonalChart();
renderTeamChart();
renderTokensChart();
renderApiChart();
renderFree();
renderTable();
populateModelFilter();
renderMetricsTable();
renderMisc();

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
bindEvents();
bindMetricsEvents();
