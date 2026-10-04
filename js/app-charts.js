/* ============ Coding Plan 比价中心 — 图表渲染 ============ */
"use strict";

/* 图高随行数增长：n 行 × 每行 per px + 标题/轴留白 base，但不低于 min（空数据也要装下坐标轴） */
function chartHeight(n, per, base, min) {
  return Math.max(min, n * per + base);
}

/* ---------- 个人订阅价格全景 ---------- */
function resetPersonalFilters() {
  Object.assign(personalState, { cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT });
  byId("chartSearch").value = "";
  setChipPressed(qsa("#chipCat .chip"), (c) => c.dataset.cat === "all");
  setChipPressed(qsa("#chipRegion .chip"), (c) => c.dataset.region === "all");
  setChipPressed(qsa("#chipBilling .chip"), (c) => c.dataset.billing === "M");
  renderPersonalChart();
}

/* DOM 图例可用键盘操作；同一名称的区间基柱和上限段一起切换。 */
function bindChartLegend(chart, id) {
  const chips = qsa("#" + id + " [data-series]");
  setChipPressed(chips, (chip) => chip.getAttribute("aria-pressed") !== "false");
  chips.forEach((chip) => {
    if (chip.getAttribute("aria-pressed") === "false") chart.dispatchAction({ type: "legendUnSelect", name: chip.dataset.series });
  });
  chips.forEach((chip) => {
    chip.onclick = () => chart.dispatchAction({ type: "legendToggleSelect", name: chip.dataset.series });
  });
  if (typeof chart.off === "function" && typeof chart.on === "function") {
    chart.off("legendselectchanged");
    chart.on("legendselectchanged", (event) => setChipPressed(chips, (chip) => event.selected[chip.dataset.series] !== false));
  }
}

/* 图例色块与图表 itemStyle 同源（都读 refreshCategoryColors 取到的 --cat-* 变量） */
function renderLegend() {
  const el = byId("chartLegend");
  if (!el) return;
  const items = [["official", "模型官方订阅"], ["tool", "第三方工具订阅"], ["cloud", "云厂商/API 套餐"]];
  el.innerHTML = items.map(([k, lbl]) => `<span><i style="background:${esc(CAT_COLOR[k] || "")}"></i>${lbl}</span>`).join("") +
    `<span><i style="background:${esc(RELAY_COLOR)}"></i>中转站</span>`;
}

function personalTooltip(p) {
  const y = p.priceY != null ? `年付：${priceText(p, "priceY")}/月（年付折算）` : "年付：未列公开价（按月付展示）";
  const unified = priceOf(p, personalState.billing);
  const uni = unified != null ? `${currencySymbol(p.cur) + Number(unified.toFixed(2))} ≈ ${fmtCNY(cnyOf(p, personalState.billing))}` : "—";
  const href = safeHref(p.url);
  return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
    ${personalState.billing === "Y" ? `折算价：${esc(uni)}<br/>` : ""}
    月付：${p.priceM != null ? esc(priceText(p, "priceM")) : "—"} ｜ ${esc(y)}<br/>
    <span style="color:${PAL.gold}">额度：</span>${esc(trunc(resolvedField(p, "quota"), 120))}<br/>
    <span style="color:${PAL.info}">模型：</span>${esc(trunc(resolvedField(p, "models"), 120))}<br/>
    ${isRelay(p) ? `<span style="color:${RELAY_COLOR}">中转站，不和官方订阅比单价</span><br/>` : ""}
    ${p.note ? `<span style="color:${PAL.dim}">备注：${esc(trunc(p.note, 60))}</span><br/>` : ""}
    ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href} · 数据截至 ${esc(META.updated)}</span>` : ""}`;
}

function renderPersonalChart() {
  renderLegend();
  const q1 = foldSearch(personalState.q);
  const rows = PLANS.filter(
    (p) => isPriceConfirmed(p) && isPersonalMonthly(p) &&
      (personalState.cat === "all" || p.cat === personalState.cat) &&
      (personalState.region === "all" || p.region === personalState.region) &&
      (!q1 || queryHit(planSearchBlob(p), q1))
  ).sort((a, b) => cnyOf(a, personalState.billing) - cnyOf(b, personalState.billing));

  // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
  const noFilter = personalState.cat === "all" && personalState.region === "all" && !q1;
  const limit = noFilter ? personalState.limit : null;
  const shown = limit ? rows.slice(0, limit) : rows;

  const el = byId("chartPersonal");
  byId("chartPersonalEmpty").hidden = shown.length > 0;
  /* 初始化/缩放时需要真实容器宽度，空态在完成配置后再隐藏 canvas。 */
  el.hidden = false;
  el.style.height = chartHeight(shown.length, 30, 130, 420) + "px";
  const chart = makeChart("chartPersonal");

  const labels = shown.map((p) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
  const data = shown.map((p) => ({
    value: Math.round(cnyOf(p, personalState.billing) * 10) / 10,
    itemStyle: { color: isRelay(p) ? RELAY_COLOR : CAT_COLOR[p.cat], borderRadius: [0, 4, 4, 0] },
    _p: p,
  }));

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: { trigger: "item", ...tipStyle(el), formatter: (d) => personalTooltip(d.data._p) },
      grid: { left: 12, right: 64, top: 24, bottom: 44, containLabel: true },
      xAxis: { type: "value", name: "人民币（元/月）", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
      yAxis: {
        type: "category", data: labels, inverse: true, ...axisStyle(),
        axisLabel: chartAxisLabel(el),
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
  el.hidden = shown.length === 0;

  const billingLabel = personalState.billing === "Y" ? "年付折月" : "月付";
  describeChart("chartPersonal", "个人订阅价格全景（" + billingLabel + "，人民币/月）" + shown.length + " 档，最低三档：" + shown.slice(0, 3).map((p) =>
    shortVendor(p.vendor) + " " + p.plan + " " + fmtCNY(cnyOf(p, personalState.billing)) +
    (personalState.billing === "Y" && p.priceY == null ? "（未列年付价，按月付）" : "")
  ).join("、"));
  const hidden = rows.length - shown.length;
  const excluded = q1 ? PLANS.filter((p) => {
    if (!queryHit(planSearchBlob(p), q1)) return false;
    if (isRetiredPlan(p)) return false;
    return !isPersonalMonthly(p) || !isPriceConfirmed(p);
  }) : [];
  const reasonOf = (p) => {
    if (!isPriceConfirmed(p)) return "价格待核实";
    if (p.cat === "team" || p.seat) return "团队/企业档";
    if (isRenewalOnly(p)) return "仅老用户续费";
    if (isOneTimePlan(p)) return "一次性预付";
    if (isFourWeekPlan(p)) return "每4周计费";
    if (p.priceM === 0) return "免费档";
    return "按量或定制";
  };
  const excludedHtml = excluded.length
    ? `<br>这张图只画已核实价格的个人月付。同名模型还有 ${excluded.length} 档不在图上：` +
      excluded.slice(0, 8).map((p) => `${esc(shortVendor(p.vendor))} ${esc(p.plan)}（${reasonOf(p)}）`).join("、") +
      (excluded.length > 8 ? ` 等 ${excluded.length} 档` : "") +
      `。<button type="button" id="showExcludedInTable" class="linkish">在完整表里看</button>`
    : "";
  byId("notePersonal").innerHTML =
    `当前筛选：${rows.length} 个档位（显示 ${shown.length}） ｜ 汇率 1 USD ≈ ${RATE} CNY，1 INR ≈ ${Number(RATE_INR_CNY.toFixed(6))} CNY（${META.rateAsOf}，<a href="${safeHref(META.rateSource)}" target="_blank" rel="noopener">汇率来源</a>） ｜ 红色是中转站，不和官方订阅、工具订阅放在同一类颜色里 ｜ 搜索会忽略大小写、空格和连字符，并展开「同某档」` +
    (hidden > 0 ? ` ｜ <button type="button" id="showAllPersonal" class="linkish">显示全部 ${rows.length} 档</button>` :
      noFilter && rows.length > PERSONAL_DEFAULT_LIMIT ? ` ｜ <button type="button" id="showAllPersonal" class="linkish">收起为 ${PERSONAL_DEFAULT_LIMIT} 档</button>` : "") +
    excludedHtml;
}

/* ---------- 团队 / 企业 / 云厂商（席位价 + 整包价） ---------- */
function renderTeamChart() {
  const rows = PLANS.filter(
    (p) => isPriceConfirmed(p) && !isRetiredPlan(p) && (p.cat === "team" || p.seat) && p.priceM != null && p.priceM > 0
  ).sort((a, b) => cnyOf(a, "M") - cnyOf(b, "M"));
  const el = byId("chartTeam");
  el.style.height = chartHeight(rows.length, 30, 130, 380) + "px";
  const chart = makeChart("chartTeam");

  const data = rows.map((p) => ({
    value: Math.round(cnyOf(p, "M") * 10) / 10,
    itemStyle: { color: CAT_COLOR.team, borderRadius: [0, 4, 4, 0] },
    _p: p,
  }));
  chart.setOption(
    {
      backgroundColor: "transparent",
      /* 数据被筛空时给出占位标题，而不是一块空白画布 */
      ...(rows.length ? {} : { title: { text: "暂无可对比的团队/企业档", left: "center", top: "middle", textStyle: { color: PAL.dim, fontSize: 13, fontWeight: 500 } } }),
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const p = d.data._p;
          const href = safeHref(p.url);
          return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
            ${p.seat ? "每席位/用户/月" : "整包价/月"}：${esc(priceText(p, "priceM"))} ≈ ${fmtCNY(cnyOf(p, "M"))}${p.priceY != null ? `（年付 ${esc(priceText(p, "priceY"))}/月）` : ""}<br/>
            <span style="color:${PAL.gold}">额度：</span>${esc(trunc(resolvedField(p, "quota"), 120))}<br/>
            ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href}</span>` : ""}`;
        },
      },
      grid: { left: 12, right: 64, top: 20, bottom: 44, containLabel: true },
      xAxis: { type: "value", name: "人民币（元/月）", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
      yAxis: {
        type: "category", inverse: true,
        data: rows.map((p) => shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : "") + (!p.seat ? "·整包" : "")),
        ...axisStyle(), axisLabel: chartAxisLabel(el),
        axisLine: { lineStyle: { color: PAL.axisLine } },
      },
      series: [{ type: "bar", data, barWidth: 16, label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => "¥" + d.value.toLocaleString("zh-CN") } }],
    },
    true
  );
  chart.resize();
  describeChart("chartTeam", "团队/企业档席位价与整包价 " + rows.length + " 项，按折算人民币月费从低到高。");
}

/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */
const TOKEN_OFFICIAL_COLOR = "#34d399";
const TOKEN_EST_COLOR = "#fbbf24";

function renderTokensChart() {
  const chart = makeChart("chartTokens");
  const el = byId("chartTokens");

  const modelShort = (m) =>
    m.includes("Flash") ? "Flash" :
    m.includes("GLM-5.3") ? "GLM-5.3" :
    m.includes("MiniMax") ? "M3" :
    m.includes("Sonnet") ? "Sonnet 5" :
    m.includes("GPT-6.1") ? "GPT-6.1 Sol" :
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
    const p = findPlanReference(t.ref);
    if (!p) {
      console.warn("[data] PLAN_TOKENS ref 未解析，已跳过:", t.ref);
      return [];
    }
    if (!isPriceConfirmed(p) || isRetiredPlan(p)) return [];
    return [{
      label: t.plan + "·" + modelShort(t.model),
      model: t.model,
      lowM: t.lowM, highM: t.highM,
      priceCNY: toCNY(p.priceM, p.cur),
      isOfficial: true, url: t.url,
    }];
  });
  /* 已在 PLAN_TOKENS 里的档不重复。智谱国内 V3 与 Z.ai 每周额度相同，也不再画一遍。
     系数折算（小米 / 腾讯积分）不进本图。其余带每周 tokens 的行按出处着色：
     高置信且非估算视为官方公布，新厂商不会被默认涂成低置信社区估算。
     官方条数区间按结构化公式折算，其余请求数制只在额度深度对比表里呈现。 */
  const coveredPlan = new Set(PLAN_TOKENS.map((t) => findPlanReference(t.ref)?.id).filter(Boolean));
  const weeklyExtra = METRICS_ALL.filter((m) => {
    const p = m.ref != null ? findPlanReference(m.ref) : null;
    if (p && (!isPriceConfirmed(p) || isRetiredPlan(p))) return false;
    if (m.wkLowM == null && m.reqLowPer5h == null) return false;
    if (m.note && m.note.includes("系数折算")) return false;
    /* data.js 用 weeklyChart:false 标注与 PLAN_TOKENS 档位同额度的重复行（如智谱国内版） */
    if (m.weeklyChart === false) return false;
    if (coveredPlan.has(findPlanReference(m.ref)?.id)) return false;
    return true;
  }).flatMap((e) => {
    const computed = computeMetrics(e);
    if (!computed || computed.wkLowM == null || computed.wkHighM == null) return [];
    const prov = provenance(e);
    return [{
      label: tokPlanLabel(e.vendor, e.plan) + "·" + modelShort(e.model),
      model: e.model,
      lowM: computed.wkLowM, highM: computed.wkHighM,
      priceCNY: toCNY(e.priceM, e.cur),
      isOfficial: !e.isEst && prov.conf === "高",
      url: e.source, note: e.note,
      method: e.method || prov.text,
      conf: e.confidence || prov.conf,
    }];
  });
  const community = weeklyExtra.filter((r) => !r.isOfficial);
  const officialBars = official.concat(weeklyExtra.filter((r) => r.isOfficial));
  /** @typedef {{label: string, model: string, lowM: number, highM: number, midM: number, priceCNY: number, isOfficial: boolean, url: string, note?: string, method?: string, conf?: string}} TokenRow */
  const rows = /** @type {TokenRow[]} */ ([...officialBars, ...community].map((r) => ({ ...r, midM: (r.lowM + r.highM) / 2 })));
  rows.sort((a, b) => b.midM - a.midM);

  el.style.height = chartHeight(rows.length, 30, 150, 420) + "px";

  const cats = rows.map((r) => r.label);
  const series = [
    { name: "官方公布", type: "bar", stack: "o", barWidth: 14,
      data: rows.map((r) => r.isOfficial ? { value: r.lowM, _r: r } : null),
      itemStyle: { color: TOKEN_OFFICIAL_COLOR } },
    { name: "官方公布", type: "bar", stack: "o", barWidth: 14,
      data: rows.map((r) => r.isOfficial ? { value: r.highM - r.lowM, _r: r } : null),
      itemStyle: { color: "rgba(52,211,153,.32)", borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: PAL.catLabel, fontSize: 11,
        formatter: (d) => (d.data && d.data._r ? d.data._r.lowM + "–" + d.data._r.highM + "M" : "") } },
    { name: "折算 / 社区推算", type: "bar", stack: "c", barWidth: 14,
      data: rows.map((r) => !r.isOfficial ? { value: r.lowM, _r: r } : null),
      itemStyle: { color: TOKEN_EST_COLOR } },
    { name: "折算 / 社区推算", type: "bar", stack: "c", barWidth: 14,
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
            : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">折算/推算·${esc(r.conf || "低")}</span>`;
          const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
          return `<b>${esc(r.label)}</b> ${prov}<br/>
            每周可用：${r.lowM}–${r.highM}M tokens（${esc(r.model)}）<br/>
            月费：${fmtCNY(r.priceCNY)} ｜ 每 ¥100/月 ≈ <b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周<br/>
            ${r.note ? `<span style="color:${PAL.dim}">${esc(trunc(r.note, 120))}</span><br/>` : ""}
            ${safeHref(r.url) ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${safeHref(r.url)}</span>` : ""}`;
        },
      },
      grid: { left: 12, right: 88, top: 20, bottom: 44, containLabel: true },
      legend: { data: ["官方公布", "折算 / 社区推算"], show: false },
      xAxis: { type: "value", name: "tokens / 周（百万）", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
      yAxis: { type: "category", data: cats, inverse: true, ...axisStyle(),
        axisLabel: chartAxisLabel(el, 11.5),
        axisLine: { lineStyle: { color: PAL.axisLine } } },
      series,
    },
    true
  );
  chart.resize();
  bindChartLegend(chart, "tokensLegend");
  describeChart("chartTokens", "每周可用 tokens 对比 " + rows.length + " 行：官方公布 " + officialBars.length + " 行、社区推算 " + community.length + " 行。");

  /* 洞察卡：全厂商性价比排行（厂商中立） */
  const valueOf = (r) => (r.priceCNY > 0 ? r.midM / r.priceCNY : -1);
  const byValue = rows.slice().sort((a, b) => valueOf(b) - valueOf(a));
  byId("tokenInsight").innerHTML = `
    <div style="max-height:600px;overflow:auto">
    <h3>💡 性价比：每 ¥100/月 能买到多少每周 tokens（全部厂商）</h3>
    <table class="mini-table">
      ${byValue.map((r) => {
        const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
        return `
        <tr>
          <td>${esc(r.label)}<br><span style="color:${PAL.dim};font-size:11px">${fmtCNY(r.priceCNY)}/月 · ${r.isOfficial
            ? '<span class="conf conf-hi">官方公布</span>'
            : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">估算·${esc(r.conf || "低")}</span>`}</span></td>
          <td><b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周</td>
        </tr>`;
      }).join("")}
    </table>
    </div>
    <p>公平比较提示：不同模型的 token 数不能代表产出质量。<span class="text-green">绿色柱</span>为官方公布的每周 tokens 区间，<span class="text-gold">黄色柱</span>为折算或社区推算。估算受单次用量、缓存率和动态限流影响，仅供量级参考；完整方法与置信度见「额度深度对比」。</p>`;
}

/* ---------- API 按量价格 ---------- */
function renderApiChart() {
  const apiEl = byId("chartApi");
  const chart = makeChart("chartApi");
  const detailRows = API_PRICES.map((a) => {
    const inU = a.cur === "CNY" ? a.inCNY / RATE : a.inUSD;
    const outU = a.cur === "CNY" ? a.outCNY / RATE : a.outUSD;
    return { ...a, inUSD: inU, outUSD: outU };
  })
    .filter((a) => a.inUSD != null && a.outUSD != null)
    .sort((x, y) => x.outUSD - y.outUSD);
  const rows = detailRows.filter((a) => isPriceConfirmed(a, "api"));
  /* 统一纵轴标签：厂商 · 模型。label 里的平台后缀（(Z.ai) / [硅基] 等）由厂商前缀承担，
     厂商名与模型名重复时（DeepSeek · DeepSeek V4-Pro）去掉重复的厂商词。 */
  const apiLabel = (a) => {
    const vendor = shortVendor(a.vendor);
    let model = displayModelName(String(a.label || a.model).replace(/\s*[(（\[【].*$/, "").trim());
    if (model.toLowerCase().startsWith(vendor.toLowerCase() + " ")) model = model.slice(vendor.length + 1);
    return vendor + " · " + model;
  };
  const cats = rows.map(apiLabel);
  apiEl.style.height = chartHeight(rows.length, 28, 72, 640) + "px";

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
          return `<b>${esc(apiLabel(a))}</b>${a.region === "cn" ? " · 国内" : ""}<br/>${idLine}
            ${fmtPrice(a, a.inUSD, a.outUSD)}<br/>
            ${a.note ? `<span style="color:${PAL.dim}">${esc(trunc(a.note, 120))}</span><br/>` : ""}
            ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href}</span>` : ""}`;
        },
      },
      grid: { left: 8, right: 28, top: 20, bottom: 44, containLabel: true },
      legend: { data: ["输入 / 1M tokens", "输出 / 1M tokens"], show: false },
      xAxis: { type: "value", name: "USD / 1M tokens", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
      yAxis: {
        type: "category", data: cats, inverse: true, ...axisStyle(),
        axisLabel: chartAxisLabel(apiEl, 11),
      },
      series: [
        { name: "输入 / 1M tokens", type: "bar", data: rows.map((a) => a.inUSD), barWidth: 7, itemStyle: { color: "#6366f1", borderRadius: [0, 3, 3, 0] } },
        { name: "输出 / 1M tokens", type: "bar", data: rows.map((a) => a.outUSD), barWidth: 7, itemStyle: { color: "#f472b6", borderRadius: [0, 3, 3, 0] } },
      ],
    },
    true
  );
  chart.resize();
  bindChartLegend(chart, "apiLegend");

  /* 购买力：$10 按输出价可购 token 量。按地区拆双系列（barGap -100% 重叠），
     图例可点击过滤国际/国内；axis 触发 + 阴影指示器与左图一致。 */
  const chart2 = makeChart("chartPower");
  const el2 = byId("chartPower");
  el2.style.height = chartHeight(rows.length, 26, 120, 420) + "px";
  const power = rows.filter((a) => a.outUSD > 0).map((a) => ({ name: apiLabel(a), m: 10 / a.outUSD, a }));
  power.sort((x, y) => y.m - x.m);
  const POWER_COLORS = { intl: "#22d3ee", cn: "#34d399" };
  const powerSeriesData = power.map((p) => {
    const item = { value: Math.round(p.m * 10) / 10, a: p.a };
    return p.a.region === "cn" ? [null, item] : [item, null];
  });
  const powerLabel = { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (d) => (d.value != null ? d.value + "M" : "") };
  chart2.setOption(
    {
      backgroundColor: "transparent",
      title: { text: "$10 可购买的输出 tokens（M）", left: "center", top: 4, textStyle: { color: PAL.dim, fontSize: 12, fontWeight: 500 } },
      tooltip: {
        trigger: "axis", ...tipStyle(el2), axisPointer: { type: "shadow" },
        formatter: (ps) => {
          const p = power[ps[0].dataIndex];
          if (!p) return "";
          const price = p.a.cur === "CNY" ? "¥" + p.a.outCNY : "$" + p.a.outUSD;
          return `<b>${esc(p.name)}</b><br/>$10 ≈ <b>${Number(p.m).toFixed(1)}M</b> 输出 tokens<br/>（${price}/1M 输出）`;
        },
      },
      legend: { data: ["国际模型", "国内模型"], show: false },
      grid: { left: 12, right: 56, top: 36, bottom: 24, containLabel: true },
      xAxis: { type: "value", ...axisStyle() },
      yAxis: { type: "category", inverse: true, data: power.map((p) => p.name), ...axisStyle(), axisLabel: chartAxisLabel(el2, 11) },
      series: [
        { name: "国际模型", type: "bar", barWidth: 12, barGap: "-100%",
          data: powerSeriesData.map((d) => d[0]),
          itemStyle: { color: POWER_COLORS.intl, borderRadius: [0, 4, 4, 0] },
          label: powerLabel },
        { name: "国内模型", type: "bar", barWidth: 12, barGap: "-100%",
          data: powerSeriesData.map((d) => d[1]),
          itemStyle: { color: POWER_COLORS.cn, borderRadius: [0, 4, 4, 0] },
          label: powerLabel },
      ],
    },
    true
  );
  chart2.resize();
  bindChartLegend(chart2, "powerLegend");
  byId("apiDetailBody").innerHTML = detailRows.map((a) => {
    const usd = (n) => "$" + Number(n.toFixed(4));
    return `<tr><th scope="row">${esc(apiLabel(a))}</th><td>${esc(REGION_LABEL[a.region] || "—")}</td>` +
      `<td>${usd(a.inUSD)}</td><td>${usd(a.outUSD)}</td>` +
      `<td>${a.outUSD > 0 ? Number((10 / a.outUSD).toFixed(1)) + "M" : "—"}</td>` +
      `<td>${priceCheckHtml(a, "api")}</td></tr>`;
  }).join("");
  describeChart("chartApi", "API 按量单价对比 " + rows.length + " 款模型（左图）；$10 预算输出 token 购买力 " + power.length + " 行（右图）。");
  describeChart("chartPower", "$10 预算输出 token 购买力 " + power.length + " 行；使用图例按钮筛选国内或国际模型，完整数值见下方明细。");
}

/* ---------- 免费入口 ---------- */
function renderFree() {
  const rows = PLANS.filter(isFreeCodingEntry);
  byId("freeGrid").innerHTML = rows
    .map((p) => {
      const href = safeHref(p.url);
      return `
      <div class="free-card">
        <div class="fc-head">
          <span class="fc-vendor">${esc(p.vendor)}</span>
          <span class="fc-region">${esc(REGION_LABEL[p.region] || "")}</span>
        </div>
        <div class="fc-plan">${esc(p.plan)}</div>
        <div class="fc-cost">${esc(planPriceLabel(p))}</div>
        <div class="fc-quota"><b>✓</b> ${esc(resolvedField(p, "quota"))}</div>
        <div class="fc-tools">支持：${esc(trunc(resolvedField(p, "tools"), 100))}</div>
        <div class="fc-footer">${href ? `<a class="fc-link" href="${href}" target="_blank" rel="noopener">官网来源 ↗</a>` : ""}<small class="checked-date">数据截至 ${esc(META.updated)}</small></div>
      </div>`;
    })
    .join("");
}


/* ---------- 性价比排行图（每 M tokens 成本） ---------- */
/* scope: official=官方公布每周 tokens（高置信）；credits=再加官方口径折算（credits 面值/系数/官方区间，中置信）；all=含全部估算（低置信） */
function rankScopeOk(m) {
  if (rankState.scope === "all") return true;
  const conf = provenance(m).conf;
  /* credits：高置信官方每周 tokens，再加中置信的官方折算（credits 面值/系数/官方区间，含 ESTIMATES 中置信行）；低置信只在 all */
  if (rankState.scope === "credits") return conf !== "低";
  /* official：非估算、有官方每周 tokens、高置信。无牌价的「官方 credits」置信度也是高，但不能进默认排行 */
  return !m.isEst && m.wkLowM != null && conf === "高";
}
/* 排行两组 chip 的高亮与 aria-pressed 以 rankState 为准（URL 恢复与点击共用） */
function syncRankChips() {
  qsa("#chipRank .chip").forEach((chip) => {
    const on = chip.dataset.rank === rankState.tier;
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
  qsa("#chipRScope .chip").forEach((chip) => {
    const on = chip.dataset.rscope === rankState.scope;
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function renderRankChart() {
  const all = METRICS_ALL
    .filter(rankScopeOk)
    .filter(metricOfferOk)
    .map((m) => ({ m, c: computeMetrics(m) }))
    .filter((r) => r.c && r.c.costPerM != null)
    .filter((r) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
    .sort((a, b) => a.c.costPerM - b.c.costPerM);
  const rows = all.slice(0, 20); /* 图高有限，最多展示前 20 档 */
  describeChart("chartRank", "每百万 tokens 成本排行（¥，越低越划算）前三：" +
    rows.slice(0, 3).map((r) => shortVendor(r.m.vendor) + " " + r.m.plan + " ¥" + r.c.costPerM.toFixed(3)).join("、"));

  const el = byId("chartRank");
  el.style.height = chartHeight(rows.length, 30, 130, 420) + "px";
  const chart = makeChart("chartRank");

  const labels = rows.map((r) => {
    const plan = r.m.plan.replace(/GLM Coding V\d+ /, "Coding ");
    const model = r.m.model.includes("Flash") ? "Flash" : displayModelName(r.m.model);
    /* 非「官方每周 tokens」口径的行加 ≈ 前缀，提示 tokens 为折算/估算值 */
    const approx = provenance(r.m).conf !== "高" || r.m.isEst;
    return (approx ? "≈" : "") + shortVendor(r.m.vendor) + " · " + plan + " · " + model;
  });
  const data = rows.map((r) => {
    const cp = r.c.costPerM;
    const tier = cpmTier(cp);
    const color = tier === "lo" ? "#34d399" : tier === "mid" ? "#f59e0b" : "#f87171";
    return { value: Math.round(cp * 1000) / 1000, itemStyle: { color, borderRadius: [0, 4, 4, 0] }, _r: r };
  });

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const r = d.data._r;
          const prov = provenance(r.m);
          const cp = r.c.costPerM;
          const tier = cpmTier(cp);
          const cpColor = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
          const mo = r.c.moLow == null
            ? "—"
            : `约 ${fmtTok(r.c.moLow)}${r.c.moHigh > r.c.moLow ? "–" + fmtTok(r.c.moHigh) : ""}`;
          const rate = r.c.rmo == null ? "—" : `${r.c.rmo.toFixed(1)}×`;
          return `<b>${esc(r.m.vendor)} · ${esc(r.m.plan)}</b>（${esc(displayModelName(r.m.model))}）<br/>
            💵每 M tokens：<b style="color:${cpColor}">¥${cp.toFixed(3)}</b><br/>
            月费：${fmtCNY(r.c.priceCNY)} ｜ 月倍率：<b>${rate}</b><br/>
            月 tokens：${mo}<br/>
            <span style="color:${PAL.dim}">依据：${esc(prov.text)} · 置信${esc(prov.conf)}${prov.conf !== "高" ? "（tokens 为折算/估算值）" : ""}</span>`;
        },
      },
      grid: { left: 12, right: 76, top: 20, bottom: 44, containLabel: true },
      xAxis: { type: "value", name: "¥ / 百万 tokens", nameLocation: "middle", nameGap: 30, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
      yAxis: {
        type: "category", data: labels, inverse: true, ...axisStyle(),
        axisLabel: chartAxisLabel(el, 11.5),
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
  const excluded = "价格待核实、已停售、已下架、一次性预付和仅老用户续费不在此列。";
  const scopeText = {
    official: "口径：只统计官方公布每周 tokens、且新用户当前可购买的计划（高置信，非估算）。请求折算与第三方估算不在此列。" + excluded,
    credits: "口径：在官方每周 tokens 之外，纳入按官方 credits 面值/系数/官方区间折算的档位（≈标记，置信中：tokens = 面值 ÷ 牌价混合价，按 80/20 与 95% 缓存假设）。" + excluded,
    all: "口径：含全部估算档位（≈标记，置信低：第三方毛利反推、请求次数按 20K tokens/次折算等），仅供量级参考。" + excluded,
  }[rankState.scope];
  byId("rankNote").textContent =
    `共 ${all.length} 档${all.length > rows.length ? `，此处显示前 ${rows.length} 档` : ""}。${tierText}${scopeText}绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。`;
  syncRankChips();
}
