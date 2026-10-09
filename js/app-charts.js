/* ============ Coding Plan 比价中心 — 图表渲染 ============ */
"use strict";

/* 图高随行数增长：n 行 × 每行 per px + 标题/轴留白 base，但不低于 min（空数据也要装下坐标轴） */
function chartHeight(n, per, base, min) {
  return Math.max(min, n * per + base);
}

/* 相差多个数量级的数值用真正的对数轴；留出低于最小值的刻度，让最低项也有可点击柱形。
   柱长不代表线性比例，轴标题、读屏摘要及精确 tooltip 均明确这一点。 */
function chartLogAxis(values, name) {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  const lowest = positive.length ? Math.min(...positive) : 1;
  const min = Math.pow(10, Math.floor(Math.log10(lowest) - 0.01));
  return {
    type: "log", logBase: 10,
    min, startValue: min,
    name: name + "（对数刻度）", nameLocation: "middle", nameGap: 30,
    nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle(),
    axisLabel: { ...axisStyle().axisLabel, formatter: (v) => Number(v.toPrecision(5)).toLocaleString("zh-CN", { maximumFractionDigits: 6 }) },
  };
}

function weeklyTokenRange(low, high) {
  const fmt = (n) => Number(n.toFixed(2)).toLocaleString("zh-CN");
  return fmt(low) + (low === high ? "" : "–" + fmt(high)) + "M";
}

/* 套餐身份和名称取自主表，额度行只追加模型名称；不再为图表单独缩写套餐名。 */
function metricChartLabel(m) {
  const p = resolvePlan(m) || m;
  return planLabel(p) + " · " + displayModelName(m.model);
}

/* ---------- 个人订阅价格全景 ---------- */
function personalChartPrice(p) { return personalState.fromPicker ? pickerMonthlyCNY(p) : cnyOf(p, personalState.billing); }
function resetPersonalFilters() {
  Object.assign(personalState, { cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker:false });
  byId("chartSearch").value = "";
  setChipPressed(qsa("#chipCat .chip"), (c) => c.dataset.cat === "all");
  setChipPressed(qsa("#chipRegion .chip"), (c) => c.dataset.region === "all");
  setChipPressed(qsa("#chipBilling .chip"), (c) => c.dataset.billing === "M");
  renderPersonalChart();
}

/* DOM 图例可用键盘操作；同一名称的区间基柱和上限段一起切换。 */
function bindChartLegend(chart, id, colors) {
  const chips = qsa("#" + id + " [data-series]");
  chips.forEach((chip) => {
    const color = colors[chip.dataset.series];
    if (!color) return;
    chip.innerHTML = `<i class="legend-swatch" style="background:${esc(color)}" aria-hidden="true"></i>${esc(chip.dataset.series)}`;
  });
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
  const quote = personalState.fromPicker ? pickerPaymentQuote(p) : null;
  const billing = quote ? quote.mode : personalState.billing;
  const y = p.priceY != null ? `年付：${priceText(p, "priceY")}/月（年付折算）` : "年付：未列公开价";
  const unified = quote ? quote.monthlyNative : priceOf(p, billing);
  const unifiedCNY = quote ? quote.monthlyCNY : cnyOf(p, billing);
  const uni = unified != null ? `${currencySymbol(p.cur) + Number(unified.toFixed(2))} ≈ ${fmtCNY(unifiedCNY)}` : "—";
  const href = safeHref(p.url);
  return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
    ${quote ? `选购口径：${esc(priceLine(p))}<br/>首次付款：${esc(pickerFirstPaymentText(p))}<br/>` : ""}
    ${billing === "Y" ? `折算价：${esc(uni)}<br/>` : ""}
    月付：${p.priceM != null ? esc(priceText(p, "priceM")) : "—"} ｜ ${esc(y)}<br/>
    <span style="color:${PAL.gold}">额度：</span>${esc(trunc(resolvedField(p, "quota"), 120))}<br/>
    <span style="color:${PAL.info}">模型：</span>${esc(trunc(resolvedField(p, "models"), 120))}<br/>
    ${isRelay(p) ? `<span style="color:${RELAY_COLOR}">中转站，不和官方订阅比单价</span><br/>` : ""}
    ${p.note ? `<span style="color:${PAL.dim}">备注：${esc(trunc(p.note, 60))}</span><br/>` : ""}
    ${href ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${href} · 数据截至 ${esc(META.updated)}</span>` : ""}`;
}

function renderPersonalChart() {
  if (typeof syncPickerScopeControls === "function") syncPickerScopeControls();
  if (deferChartRender("chartPersonal",renderPersonalChart)) return;
  renderLegend();
  const q1 = foldSearch(personalState.q) ? personalState.q.trim() : "";
  const annualMode = !personalState.fromPicker && personalState.billing === "Y";
  const rows = PLANS.filter(
    (p) => isPriceConfirmed(p) && isPersonalMonthly(p) &&
      (!annualMode || p.priceY > 0) &&
      (personalState.cat === "all" || p.cat === personalState.cat) &&
      (personalState.region === "all" || p.region === personalState.region) &&
      (!personalState.fromPicker || matchesPickerPurchase(p)) &&
      (!q1 || queryHit(planSearchBlob(p), q1))
  ).sort((a, b) => personalChartPrice(a) - personalChartPrice(b));

  // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
  const noFilter = !personalState.fromPicker && personalState.cat === "all" && personalState.region === "all" && !q1;
  const limit = noFilter ? personalState.limit : null;
  const shown = limit ? rows.slice(0, limit) : rows;

  const el = byId("chartPersonal");
  const emptyEl = byId("chartPersonalEmpty");
  emptyEl.hidden = shown.length > 0;
  emptyEl.innerHTML = personalState.fromPicker && pickerState.budget === "0"
    ? '选购预算为「免费」，这张图只画付费月付档。免费档见<a href="#free">免费 Coding 入口</a>。<button type="button" class="linkish" data-apply-picker="personal">取消选购条件</button>'
    : annualMode ? "没有匹配的公开年付套餐；未列年付价的档位已排除。请更换关键词或清除筛选。" : "没有匹配的个人月付套餐。请更换关键词或清除筛选。";
  /* 初始化/缩放时需要真实容器宽度，空态在完成配置后再隐藏 canvas。 */
  el.hidden = false;
  el.style.height = chartHeight(shown.length, 30, 130, 420) + "px";
  const chart = makeChart("chartPersonal");

  const labels = shown.map((p) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
  const data = shown.map((p) => ({
    value: Math.round(personalChartPrice(p) * 10) / 10,
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

  const billingLabel = personalState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : personalState.billing === "Y" ? "年付折月" : "月付";
  /* 应用选购条件时金额来自帮我选的付款口径，说明也按同一口径写。 */
  const priceBasis = (p) => personalState.fromPicker
    ? (pickerPaymentQuote(p).inferred ? "（未单列自动续费价，按标价）" : "")
    : "";
  describeChart("chartPersonal", "个人订阅价格全景（" + billingLabel + "，人民币/月）" + shown.length + " 档，最低三档：" + shown.slice(0, 3).map((p) =>
    shortVendor(p.vendor) + " " + p.plan + " " + fmtCNY(personalChartPrice(p)) + priceBasis(p)
  ).join("、"));
  const hidden = rows.length - shown.length;
  const excluded = q1 ? PLANS.filter((p) => {
    if (!queryHit(planSearchBlob(p), q1)) return false;
    if (isRetiredPlan(p)) return false;
    return !isPersonalMonthly(p) || !isPriceConfirmed(p) || (annualMode && !(p.priceY > 0));
  }) : [];
  const reasonOf = (p) => {
    if (!isPriceConfirmed(p)) return "价格待核实";
    if (annualMode && !(p.priceY > 0) && isPersonalMonthly(p)) return "未列公开年付价";
    if (p.cat === "team" || p.seat) return "团队/企业档";
    if (isRenewalOnly(p)) return "仅老用户续费";
    if (isOneTimePlan(p)) return "一次性预付";
    if (isFourWeekPlan(p)) return "每4周计费";
    if (p.priceM === 0) return "免费档";
    return "按量或定制";
  };
  /* 价格表只收有公开标价的记录：免费档在免费入口，按量或询价档没有可列的价格，链接只承诺表里确有的档位。 */
  const inTable = excluded.filter((p) => isOnSalePlan(p));
  const freeTiers = excluded.filter((p) => p.priceM === 0);
  const quoteOnly = excluded.filter((p) => !inTable.includes(p) && !freeTiers.includes(p));
  const listOf = (list) => list.slice(0, 6).map((p) => `${esc(shortVendor(p.vendor))} ${esc(p.plan)}（${reasonOf(p)}）`).join("、") + (list.length > 6 ? ` 等 ${list.length} 档` : "");
  const excludedHtml = excluded.length
    ? `<br>这张图只画已核实价格的个人${annualMode ? "年付" : "月付"}。同名模型还有 ${excluded.length} 档不在图上` +
      (inTable.length ? `；价格表里有 ${inTable.length} 档：${listOf(inTable)}，<button type="button" id="showExcludedInTable" class="linkish">在完整表里看</button>` : "") +
      (freeTiers.length ? `；免费档见<a href="#free">免费入口</a>：${listOf(freeTiers)}` : "") +
      (quoteOnly.length ? `；无公开价、需按量或询价：${listOf(quoteOnly)}` : "") + "。"
    : "";
  byId("notePersonal").innerHTML =
    `当前筛选：${rows.length} 个档位（显示 ${shown.length}） ｜ 汇率 1 USD ≈ ${RATE} CNY，1 INR ≈ ${Number(RATE_INR_CNY.toFixed(6))} CNY（${META.rateAsOf}，<a href="${safeHref(META.rateSource)}" target="_blank" rel="noopener">汇率来源</a>） ｜ 红色是中转站，不和官方订阅、工具订阅放在同一类颜色里 ｜ 搜索按空格分词，各词均须匹配；词内忽略大小写与连字符，支持产品别名并展开「同某档」` +
    (hidden > 0 ? ` ｜ <button type="button" id="showAllPersonal" class="linkish">显示全部 ${rows.length} 档</button>` :
      noFilter && rows.length > PERSONAL_DEFAULT_LIMIT ? ` ｜ <button type="button" id="showAllPersonal" class="linkish">收起为 ${PERSONAL_DEFAULT_LIMIT} 档</button>` : "") +
    (annualMode ? " ｜ 未列公开年付价的档位已排除" : "") + excludedHtml;
}

/* ---------- 团队 / 企业 / 云厂商（席位价 + 整包价） ---------- */
function renderTeamChart() {
  if (deferChartRender("chartTeam",renderTeamChart)) return;
  const rows = PLANS.filter(
    (p) => isPriceConfirmed(p) && !isRetiredPlan(p) && (p.cat === "team" || p.seat) && p.priceM != null && p.priceM > 0
  ).sort((a, b) => Number(!a.seat) - Number(!b.seat) || cnyOf(a, "M") - cnyOf(b, "M"));
  const el = byId("chartTeam");
  el.style.height = chartHeight(rows.length, 30, 130, 380) + "px";
  const chart = makeChart("chartTeam");

  const data = rows.map((p) => ({
    value: Math.round(cnyOf(p, "M") * 10) / 10,
    itemStyle: { color: p.seat ? CAT_COLOR.team : PAL.info, borderRadius: [0, 4, 4, 0] },
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
      xAxis: chartLogAxis(data.map((d) => d.value), "人民币 · 元/月"),
      yAxis: {
        type: "category", inverse: true,
        data: rows.map((p) => (p.seat ? "每席/月 · " : "整包/月 · ") + planLabel(p)),
        ...axisStyle(), axisLabel: chartAxisLabel(el),
        axisLine: { lineStyle: { color: PAL.axisLine } },
      },
      series: [{ type: "bar", data, barWidth: 16, label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => "¥" + d.value.toLocaleString("zh-CN") } }],
    },
    true
  );
  chart.resize();
  describeChart("chartTeam", "团队/企业档 " + rows.length + " 项，先列每席月价，再列整包月价，各组内按价格升序。价格采用对数刻度，相邻主刻度为十倍；不同计价单位不作排名比较。");
}

/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */
const TOKEN_OFFICIAL_COLOR = "#34d399";
const TOKEN_EST_COLOR = "#fbbf24";
const TOKEN_OFFICIAL_SERIES = "官方额度折算";
const TOKEN_EST_SERIES = "折算 / 社区推算";

function renderTokensChart() {
  if (deferChartRender("chartTokens",renderTokensChart)) return;
  const chart = makeChart("chartTokens");
  const el = byId("chartTokens");

  /** @typedef {{label: string, model: string, lowM: number, highM: number, priceCNY: number, isOfficial: boolean, url: string, note?: string, method?: string, conf?: string, vendorLowM?: number, vendorHighM?: number}} TokenChartSource */
  /** @type {TokenChartSource[]} */
  const official = PLAN_TOKENS.flatMap((t) => {
    const p = findPlanReference(t.ref);
    if (!p) {
      console.warn("[data] PLAN_TOKENS ref 未解析，已跳过:", t.ref);
      return [];
    }
    if (!isPriceConfirmed(p) || isRetiredPlan(p)) return [];
    return [{
      label: planLabel(p) + " · " + displayModelName(t.model),
      model: t.model,
      lowM: t.lowM, highM: t.highM, vendorLowM: t.vendorLowM, vendorHighM: t.vendorHighM,
      priceCNY: toCNY(p.priceM, p.cur),
      isOfficial: true, url: t.url, note: t.note, conf: "中",
    }];
  });
  /* 已在 PLAN_TOKENS 里的档不重复。智谱国内 V3 与 Z.ai 每周额度相同，也不再画一遍。
     PLAN_TOKENS 是公布每周额度上限的档位，按官方积分系数与统一假设折算；小米 / 腾讯是月度积分池，
     摊到周并非真实周额度，不进本图。其余带每周 tokens 的行按出处着色：
     高置信且非估算视为官方额度，新厂商不会被默认涂成低置信社区估算。
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
    const current = resolvePlan(e) || e;
    const computed = computeMetrics(current);
    if (!computed || computed.wkLowM == null || computed.wkHighM == null) return [];
    const prov = provenance(e);
    return [{
      label: metricChartLabel(e),
      model: e.model,
      lowM: computed.wkLowM, highM: computed.wkHighM,
      priceCNY: toCNY(current.priceM, current.cur),
      isOfficial: !e.isEst && prov.conf === "高",
      url: e.source, note: e.note,
      method: e.method || prov.text,
      conf: e.confidence || prov.conf,
    }];
  });
  const community = weeklyExtra.filter((r) => !r.isOfficial);
  const officialBars = official.concat(weeklyExtra.filter((r) => r.isOfficial));
  /** @typedef {TokenChartSource & {midM: number}} TokenRow */
  const rows = /** @type {TokenRow[]} */ ([...officialBars, ...community].map((r) => ({ ...r, midM: (r.lowM + r.highM) / 2 })));
  rows.sort((a, b) => b.midM - a.midM);

  el.style.height = chartHeight(rows.length, 30, 150, 420) + "px";

  const cats = rows.map((r) => r.label);
  /* 对数轴不堆叠 high-low（差值不能当作单独的 log 值）。先画到上限的淡色柱，
     再叠到下限的实色柱；每段直接使用真实端点，定额的 high=low 也能显示标签。 */
  const series = [true, false].flatMap((isOfficial) => {
    const name = isOfficial ? TOKEN_OFFICIAL_SERIES : TOKEN_EST_SERIES;
    const color = isOfficial ? TOKEN_OFFICIAL_COLOR : TOKEN_EST_COLOR;
    const data = (upper) => rows.map((r) => r.isOfficial === isOfficial && (upper ? r.highM : r.lowM) > 0
      ? { value: upper ? r.highM : r.lowM, _r: r } : null);
    return [
      { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(true),
        itemStyle: { color, opacity: 0.32, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", opacity: 1, color: PAL.catLabel, fontSize: 11,
          formatter: (d) => d.data && d.data._r ? weeklyTokenRange(d.data._r.lowM, d.data._r.highM) : "" } },
      { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(false),
        itemStyle: { color, borderRadius: [0, 4, 4, 0] } },
    ];
  });

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const r = d.data && d.data._r;
          if (!r) return "";
          const prov = r.isOfficial
            ? '<span class="conf conf-hi">官方额度折算</span>'
            : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">折算/推算·${esc(r.conf || "低")}</span>`;
          const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
          const vendor = r.vendorLowM != null ? `厂商按自身用量假设另给出 ${weeklyTokenRange(r.vendorLowM, r.vendorHighM)}/周，未用于比较<br/>` : "";
          return `<b>${esc(r.label)}</b> ${prov}<br/>
            每周可用：${weeklyTokenRange(r.lowM, r.highM)} tokens（${esc(displayModelName(r.model))}）<br/>
            ${vendor}月费：${fmtCNY(r.priceCNY)} ｜ 每 ¥100/月 ≈ <b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周<br/>
            ${r.note ? `<span style="color:${PAL.dim}">${esc(trunc(r.note, 120))}</span><br/>` : ""}
            ${safeHref(r.url) ? `<span style="color:${PAL.dim};font-size:11.5px">来源：${safeHref(r.url)}</span>` : ""}`;
        },
      },
      grid: { left: 12, right: 88, top: 20, bottom: 44, containLabel: true },
      legend: { data: [TOKEN_OFFICIAL_SERIES, TOKEN_EST_SERIES], show: false },
      xAxis: chartLogAxis(rows.flatMap((r) => [r.lowM, r.highM]), "百万 tokens/周"),
      yAxis: { type: "category", data: cats, inverse: true, ...axisStyle(),
        axisLabel: chartAxisLabel(el, 11.5),
        axisLine: { lineStyle: { color: PAL.axisLine } } },
      series,
    },
    true
  );
  chart.resize();
  bindChartLegend(chart, "tokensLegend", { [TOKEN_OFFICIAL_SERIES]: TOKEN_OFFICIAL_COLOR, [TOKEN_EST_SERIES]: TOKEN_EST_COLOR });
  describeChart("chartTokens", "每周可用 tokens 对比 " + rows.length + " 行：官方额度折算 " + officialBars.length + " 行、折算或社区推算 " + community.length + " 行。采用对数刻度，相邻主刻度为十倍，淡色段表示区间上限，数值见柱尾和提示。");

  /* 洞察卡：全厂商性价比排行（厂商中立） */
  const valueOf = (r) => (r.priceCNY > 0 ? r.midM / r.priceCNY : -1);
  const byValue = rows.slice().sort((a, b) => valueOf(b) - valueOf(a));
  byId("tokenInsight").innerHTML = `
    <div class="token-insight-list" tabindex="0" role="region" aria-label="全部厂商的每周 tokens 性价比明细">
    <h3>💡 性价比：每 ¥100/月 能买到多少每周 tokens（全部厂商）</h3>
    <p class="token-insight-count">共 ${byValue.length} 档，按性价比排序；列表可在框内滚动查看。</p>
    <table class="mini-table">
      ${byValue.map((r) => {
        const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
        return `
        <tr>
          <td>${esc(r.label)}<br><span style="color:${PAL.dim};font-size:11px">${fmtCNY(r.priceCNY)}/月 · ${r.isOfficial
            ? '<span class="conf conf-hi">官方额度折算</span>'
            : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">估算·${esc(r.conf || "低")}</span>`}</span></td>
          <td><b>${per100}${per100 === "—" ? "" : "M"}</b> tokens/周</td>
        </tr>`;
      }).join("")}
    </table>
    </div>
    <p class="token-insight-note">公平比较提示：不同模型的 token 数不能代表产出质量。<span class="text-green">绿色柱</span>为官方每周额度按官方积分系数折算（80/20、95% 缓存；上限含非高峰 5 折），<span class="text-gold">黄色柱</span>为其他折算或社区推算。厂商自己的估算另见提示。横轴为对数刻度，相邻主刻度为十倍。估算受单次用量、缓存率和动态限流影响，仅供量级参考；完整方法与置信度见「额度深度对比」。</p>`;
}

/* ---------- API 按量价格 ---------- */
function renderApiChart() {
  if (deferChartRender("chartApi",renderApiChart)) return;
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
      xAxis: chartLogAxis(rows.flatMap((a) => [a.inUSD, a.outUSD]), "USD / 百万 tokens"),
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
  bindChartLegend(chart, "apiLegend", { "输入 / 1M tokens": "#6366f1", "输出 / 1M tokens": "#f472b6" });

  /* 购买力：$10 按输出价可购 token 量。按地区拆双系列（barGap -100% 重叠），
     图例可点击过滤国际/国内；axis 触发 + 阴影指示器与左图一致。 */
  const chart2 = makeChart("chartPower");
  const el2 = byId("chartPower");
  el2.style.height = chartHeight(rows.length, 26, 120, 420) + "px";
  const power = rows.filter((a) => a.outUSD > 0).map((a) => ({ name: apiLabel(a), m: 10 / a.outUSD, a }));
  power.sort((x, y) => y.m - x.m);
  const POWER_COLORS = { intl: "#22d3ee", cn: "#34d399" };
  const powerSeriesData = power.map((p) => {
    const item = { value: p.m, a: p.a };
    return p.a.region === "cn" ? [null, item] : [item, null];
  });
  const powerLabel = { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (d) => (d.value != null ? Number(d.value.toFixed(1)) + "M" : "") };
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
      grid: { left: 12, right: 56, top: 36, bottom: 44, containLabel: true },
      xAxis: chartLogAxis(power.map((p) => p.m), "百万输出 tokens"),
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
  bindChartLegend(chart2, "powerLegend", { "国际模型": POWER_COLORS.intl, "国内模型": POWER_COLORS.cn });
  byId("apiDetailBody").innerHTML = detailRows.map((a) => {
    const usd = (n) => "$" + Number(n.toFixed(4));
    return `<tr><th scope="row">${esc(apiLabel(a))}</th><td>${esc(REGION_LABEL[a.region] || "—")}</td>` +
      `<td>${usd(a.inUSD)}</td><td>${usd(a.outUSD)}</td>` +
      `<td>${a.outUSD > 0 ? Number((10 / a.outUSD).toFixed(1)) + "M" : "—"}</td>` +
      `<td>${priceCheckHtml(a, "api")}</td></tr>`;
  }).join("");
  describeChart("chartApi", "API 按量单价对比 " + rows.length + " 款模型（左图）；$10 预算输出 token 购买力 " + power.length + " 行（右图）。两图采用对数刻度，相邻主刻度为十倍，完整价格见提示和下方明细。");
  describeChart("chartPower", "$10 预算输出 token 购买力 " + power.length + " 行；采用对数刻度，相邻主刻度为十倍。使用图例按钮筛选国内或国际模型，完整数值见下方明细。");
}

/* ---------- 免费入口 ---------- */
/* 免费入口按地区和类型筛选（本页内状态，不写入分享链接）；手机上 20 张卡不必整页滚完。 */
const freeState = { region: "all", kind: "all" };
function freeKind(p) { return hasIncludedModelQuota(p) ? "included" : "byok"; }
function renderFree() {
  const all = PLANS.filter(isFreeCodingEntry);
  const rows = all.filter((p) => (freeState.region === "all" || p.region === freeState.region) && (freeState.kind === "all" || freeKind(p) === freeState.kind));
  setChipPressed(qsa("[data-free-region]"), (chip) => chip.dataset.freeRegion === freeState.region);
  setChipPressed(qsa("[data-free-kind]"), (chip) => chip.dataset.freeKind === freeState.kind);
  const count = byId("freeCount");
  if (count) count.textContent = `显示 ${rows.length} / ${all.length} 个免费入口`;
  if (!rows.length) { byId("freeGrid").innerHTML = '<p class="chart-empty">没有符合条件的免费入口，可以切换地区或类型。</p>'; return; }
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
/* scope: credits=官方口径折算（积分系数/credits 面值/官方区间，中置信及以上）；all=含全部估算（低置信）。
   目前没有厂商直接公布可跨家比较的每周 tokens，旧的 official 口径并入 credits。 */
function rankScopeOk(m) {
  /* 无牌价的 credits 面值只能按假设单价折算，说明里承诺不进入排行，任何口径都排除。 */
  if ((m.creditCNY != null || m.creditUSD != null) && typeof m.apiIn !== "number") return false;
  if (rankState.scope === "all") return true;
  return provenance(m).conf !== "低";
}
/* 实心柱：依据官方额度规则（中置信及以上）；斜纹柱与 ≈：第三方或请求次数估算。 */
function rankIsEstimate(m) { return provenance(m).conf === "低"; }
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
function rankVendorLabel(vendor) {
  return { Anthropic: "Claude（Anthropic）", OpenAI: "ChatGPT（OpenAI）", "月之暗面 Kimi": "Kimi（月之暗面）" }[vendor] || shortVendor(vendor);
}
function populateRankVendor() {
  const select = byId("rankVendor");
  if (!select) return;
  const priority = ["Anthropic", "OpenAI", "月之暗面 Kimi"];
  /* 只列在任一口径下确有可排行档位的厂商；中转站、仅历史档的厂商不进下拉。 */
  const vendors = [...new Set(rankCandidateRows(false).map((r) => r.m.vendor))];
  vendors.sort((a, b) => {
    const ai = priority.indexOf(a), bi = priority.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || rankVendorLabel(a).localeCompare(rankVendorLabel(b), "zh-CN");
  });
  select.innerHTML = '<option value="all">全部厂商</option>' + vendors.map((v) => `<option value="${esc(v)}">${esc(rankVendorLabel(v))}</option>`).join("");
  select.value = rankState.vendor || "all";
}
/* 名称和价格每次从主表解析；额度成本按原始指标行缓存，价格或币种变化时重算，
   避免每次重绘对同一行重复计算。中转站不和官方订阅比单价（个人价格图与帮我选同一规则）。 */
const rankCostCache = new WeakMap();
function rankPaymentLabel() { return rankState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : "目录月付标价"; }
function rankRowPaymentLabel(m) {
  const p = rankState.fromPicker ? pickerPlanForMetric(m) : null;
  return rankPaymentLabel() + (p && pickerPaymentQuote(p).inferred ? "（未单列续费价，按标价）" : "");
}
function rankCandidateRows(usePicker = rankState.fromPicker) {
  return METRICS_ALL.flatMap((raw) => {
    const plan = raw.ref != null ? findPlanReference(raw.ref) : null;
    if (plan && isRelay(plan)) return [];
    const listed = resolvePlan(raw);
    const m = listed && usePicker ? pickerMetricInput(listed) : listed;
    if (!m || !metricOfferOk(m)) return [];
    const key = m.priceM + "|" + m.cur;
    let hit = rankCostCache.get(raw);
    if (!hit || hit.key !== key) { hit = { key, c: computeMetrics(m) }; rankCostCache.set(raw, hit); }
    return hit.c && hit.c.costPerM != null ? [{ m, c: hit.c }] : [];
  });
}
/* 先按官方额度规则折算的档位排，再排第三方或请求次数估算；低置信估算不会排在可靠数据之前。 */
function rankRows(vendor = rankState.vendor || "all") {
  return rankCandidateRows()
    .filter((r) => vendor === "all" || r.m.vendor === vendor)
    .filter((r) => rankScopeOk(r.m))
    .filter((r) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
    .sort((a, b) => Number(rankIsEstimate(a.m)) - Number(rankIsEstimate(b.m)) || a.c.costPerM - b.c.costPerM);
}
/* 图高有限：两组都有时至少给估算 8 个位置，Claude、ChatGPT 等只有估算的厂商仍能在图上看到。 */
const RANK_CHART_LIMIT = 20;
function rankChartRows(all) {
  const official = all.filter((r) => !rankIsEstimate(r.m));
  const estimates = all.filter((r) => rankIsEstimate(r.m));
  if (!official.length || !estimates.length) return all.slice(0, RANK_CHART_LIMIT);
  const estimateSlots = Math.min(estimates.length, Math.max(RANK_CHART_LIMIT - official.length, 8));
  return official.slice(0, RANK_CHART_LIMIT - estimateSlots).concat(estimates.slice(0, estimateSlots));
}
const RANK_ESTIMATE_DIVIDER = "以下为第三方或请求次数估算（置信低）";
function renderRankDetails() {
  const body = byId("rankDetailBody");
  if (!body) return;
  const rows = rankRows();
  body.innerHTML = rows.length ? rows.map((r, i) => {
    const prov = provenance(r.m), c = r.c;
    const divider = rankIsEstimate(r.m) && i > 0 && !rankIsEstimate(rows[i - 1].m)
      ? `<tr class="rank-divider"><th scope="rowgroup" colspan="5">${esc(RANK_ESTIMATE_DIVIDER)}</th></tr>` : "";
    return divider + `<tr><th scope="row">${esc(planLabel(r.m))}<br>${esc(displayModelName(r.m.model))}</th>` +
      `<td>${esc(fmtCNY(c.priceCNY))}/月<br><span class="sub">${esc(rankRowPaymentLabel(r.m))}</span></td><td>¥${c.costPerM.toFixed(3)}${fullUseCostRangeText(c) ? `<br><span class="sub">${esc(fullUseCostRangeText(c))}</span>` : ""}</td><td>${esc(tokSpan(c,"moLow","moHigh"))}</td><td>${esc(prov.text)} · 置信${esc(prov.conf)}</td></tr>`;
  }).join("") : '<tr><td colspan="5" class="table-empty">当前口径没有可比较的套餐，请调整模型档或排行口径。</td></tr>';
}
function renderRankChart() {
  if (typeof syncPickerScopeControls === "function") syncPickerScopeControls();
  const title = byId("rankTitle");
  if (title) title.innerHTML = '<span class="sec-no">02</span>每百万 tokens 满额使用折算成本（' + esc(rankPaymentLabel()) + '）';
  populateRankVendor();
  renderRankDetails();
  if (deferChartRender("chartRank",renderRankChart)) return;
  const all = rankRows();
  const rows = rankChartRows(all);
  describeChart("chartRank", "每百万 tokens 成本排行（" + rankPaymentLabel() + " ÷ 参考月量区间中点，¥，越低越划算）前三：" +
    rows.slice(0, 3).map((r) => planLabel(r.m) + " ¥" + r.c.costPerM.toFixed(3)).join("、") + "。先列依据官方额度规则折算的档位（实色柱），再列第三方或请求次数估算（斜纹柱），不确定区间见提示及完整明细。");

  const el = byId("chartRank");
  /* 两组之间插入一行分隔标签，柱值为空。 */
  const firstEstimate = rows.findIndex((r) => rankIsEstimate(r.m));
  const items = firstEstimate > 0 ? [...rows.slice(0, firstEstimate), null, ...rows.slice(firstEstimate)] : rows;
  el.style.height = chartHeight(items.length, 30, 130, 420) + "px";
  const chart = makeChart("chartRank");

  const labels = items.map((r) => r ? (rankIsEstimate(r.m) ? "≈" : "") + metricChartLabel(r.m) : "— " + RANK_ESTIMATE_DIVIDER + " —");
  const data = items.map((r) => {
    if (!r) return { value: null };
    const cp = r.c.costPerM;
    const tier = cpmTier(cp);
    const color = tier === "lo" ? "#34d399" : tier === "mid" ? "#f59e0b" : "#f87171";
    const approx = rankIsEstimate(r.m);
    return { value: cp, itemStyle: { color, borderRadius: [0, 4, 4, 0],
      ...(approx ? { decal: { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4,
        color: "rgba(255,255,255,.65)", backgroundColor: "transparent" } } : {}) }, _r: r };
  });

  chart.setOption(
    {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item", ...tipStyle(el),
        formatter: (d) => {
          const r = d.data && d.data._r;
          if (!r) return "";
          const prov = provenance(r.m);
          const cp = r.c.costPerM;
          const tier = cpmTier(cp);
          const cpColor = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
          const mo = r.c.moLow == null
            ? "—"
            : `约 ${fmtTok(r.c.moLow)}${r.c.moHigh > r.c.moLow ? "–" + fmtTok(r.c.moHigh) : ""}`;
          const rate = r.c.rmo == null ? "—" : `${r.c.rmo.toFixed(1)}×`;
          return `<b>${esc(planLabel(r.m))}</b>（${esc(displayModelName(r.m.model))}）<br/>
            💵每 M tokens：<b style="color:${cpColor}">¥${cp.toFixed(3)}</b><br/>
            ${fullUseCostRangeText(r.c) ? esc(fullUseCostRangeText(r.c)) + "（用尽对应额度）<br/>" : ""}
            ${esc(rankRowPaymentLabel(r.m))}：${fmtCNY(r.c.priceCNY)} ｜ 月倍率：<b>${rate}</b><br/>
            月 tokens：${mo}<br/>
            <span style="color:${PAL.dim}">依据：${esc(prov.text)} · 置信${esc(prov.conf)}${prov.conf !== "高" ? "（tokens 为折算/估算值）" : ""}</span>
            ${r.m.vendorWkLowM != null ? `<br/><span style="color:${PAL.dim}">厂商按自身用量假设另给出 ${weeklyTokenRange(r.m.vendorWkLowM, r.m.vendorWkHighM)}/周，未用于排行</span>` : ""}`;
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
        label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d) => typeof d.value === "number" ? "¥" + d.value.toFixed(3) : "" },
      }],
    },
    true
  );
  chart.resize();

  const tierText = "支付口径：" + rankPaymentLabel() + "；成本以参考月量区间中点计算，推荐卡按区间下限保守比较，两者都不保证实际额度。" + (rankState.tier === "flagship" ? "当前只看旗舰模型。" : "当前含轻量模型，Flash、Haiku 会因为 token 便宜靠前。");
  const excluded = "价格待核实、已停售、已下架、一次性预付、仅老用户续费和中转站不在此列。";
  const scopeText = {
    credits: "口径：只统计按官方额度规则折算的档位（积分系数、credits 面值 ÷ 牌价混合价或官方区间，按 80/20 与 95% 缓存假设，置信中）。第三方估算与请求次数折算不在此列。" + excluded,
    all: "口径：在官方口径折算之外，再纳入估算档位（≈标记，置信低：第三方毛利反推、请求次数按 20K tokens/次折算等），仅供量级参考。" + excluded,
  }[rankState.scope] || "";
  const total = rankRows("all").length;
  const countText = rankState.vendor && rankState.vendor !== "all"
    ? `当前口径全厂商共 ${total} 档，${rankVendorLabel(rankState.vendor)} ${all.length} 档`
    : `共 ${all.length} 档`;
  const mixed = firstEstimate > 0 ? "先列官方口径折算，再列估算；估算组单独排序，不与上方直接比较名次。" : "";
  const note = `${countText}${all.length > rows.length ? `，图中显示 ${rows.length} 档` : ""}。可按厂商查看 Claude、ChatGPT、Kimi 等套餐。${tierText}${scopeText}${mixed}实色柱：依据官方额度规则折算；斜纹柱：第三方或请求次数估算。绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。`;
  byId("rankNote").innerHTML = esc(note) + ' <button type="button" class="linkish" id="openRankDetails">查看完整排行明细</button>';
  byId("openRankDetails").onclick = () => {
    const details = /** @type {HTMLDetailsElement | null} */ (byId("rankDetails"));
    if (!details) return;
    details.open = true;
    details.querySelector("summary").focus();
    details.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  syncRankChips();
}

/* 文字明细独立于 ECharts；图表库加载失败也能查完整牌价与核查来源。 */
function renderApiDetails() {
  const body = byId("apiDetailBody");
  if (!body) return;
  const rows = API_PRICES.map((a) => ({ ...a,
    input:a.cur === "CNY" ? a.inCNY / RATE : a.inUSD,
    output:a.cur === "CNY" ? a.outCNY / RATE : a.outUSD,
  })).filter((a) => Number.isFinite(a.input) && Number.isFinite(a.output)).sort((a,b) => a.output-b.output);
  body.innerHTML = rows.map((a) => `<tr><th scope="row">${esc(shortVendor(a.vendor) + " · " + displayModelName(a.label || a.model))}</th><td>${esc(REGION_LABEL[a.region] || "—")}</td>` +
    `<td>$${Number(a.input.toFixed(4))}</td><td>$${Number(a.output.toFixed(4))}</td><td>${a.output > 0 ? Number((10/a.output).toFixed(1)) + "M" : "—"}</td><td>${priceCheckHtml(a,"api")}</td></tr>`).join("");
}
