/* Test-only DOM renderer oracle; production UI is native Vue. Business helpers come from current TypeScript runtime. */


function renderStats() {
  const summary = byId("priceAuditSummary");
  if (summary) {
    const checks = Object.values(PRICE_CHECKS.rows);
    const pending = checks.filter((r) => r.status === "unverified").length;
    const retired = checks.filter((r) => r.status === "retired").length;
    summary.textContent = `价格逐条核查：${PRICE_CHECKS.checkedAt} · ${checks.length} 条记录，${checks.length - pending - retired} 条已确认（含询价），${pending} 条待核实，${retired} 条停售。待核实历史价仅保留作参考，不参与推荐与排行。`;
  }
  const vendors = new Set(PLANS.map((p) => p.vendor));
  const freeCnt = PLANS.filter(isFreeCodingEntry).length;
  const paid = PLANS.filter((p) => isPriceConfirmed(p) && isPersonalMonthly(p));
  const minCny = paid.length ? Math.min(...paid.map((p) => cnyOf(p, "M"))) : null;
  const maxCny = paid.length ? Math.max(...paid.map((p) => cnyOf(p, "M"))) : null;
  const minP = minCny == null ? null : paid.find((p) => cnyOf(p, "M") === minCny);
  const maxP = maxCny == null ? null : paid.find((p) => cnyOf(p, "M") === maxCny);
  const items = [
    { icon: "globe", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "stack", num: PLANS.filter(isOnSalePlan).length, lbl: "公开标价记录", sub: "含待核实历史价，见来源栏" },
    { icon: "gift", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "tag", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    minP && { icon: "arrow-down-circle", lbl: "最低月费", num: fmtCNY(minCny), sub: "/月 · " + planLabel(minP) },
    maxP && { icon: "arrow-up-circle", lbl: "最高月费", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ].filter(Boolean);
  byId("statsRow").innerHTML = items
    .map((i) => `<div><dt>${icon(i.icon)}${esc(i.lbl)}</dt><dd>${esc(i.num)}${i.sub ? `<small title="${esc(i.sub)}">${esc(i.sub)}</small>` : ""}</dd></div>`)
    .join("");
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
  el.style.height = chartHeight(shown.length, chartRowHeight(el, 30), 130, 420) + "px";
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

  el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 150, 420) + "px";

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

function renderRankDetails() {
  const body = byId("rankDetailBody");
  if (!body) return;
  const rows = rankRows();
  body.innerHTML = rows.length ? rows.map((r, i) => {
    const prov = provenance(r.m), c = r.c;
    const divider = rankIsEstimate(r.m) && i > 0 && !rankIsEstimate(rows[i - 1].m)
      ? `<tr class="rank-divider"><th scope="rowgroup" colspan="5">${esc(RANK_ESTIMATE_DIVIDER)}</th></tr>` : "";
    return divider + `<tr><th scope="row">${esc(planLabel(r.m))}<br>${esc(displayModelName(r.m.model))}</th>` +
      `<td class="td-price">${esc(fmtCNY(c.priceCNY))}/月<br><span class="sub">${esc(rankRowPaymentLabel(r.m))}</span></td><td><span class="cost-value" style="color:${cpmColor(c.costPerM)}">¥${c.costPerM.toFixed(3)}</span>${fullUseCostRangeText(c) ? `<br><span class="sub">${esc(fullUseCostRangeText(c))}</span>` : ""}</td><td class="tok-cell">${esc(tokSpan(c,"moLow","moHigh"))}</td><td class="prov-cell"><span class="conf ${prov.conf === "高" ? "conf-hi" : prov.conf === "中" ? "conf-mid" : "conf-lo"}">${esc(prov.conf)}</span>${esc(prov.text)}</td></tr>`;
  }).join("") : '<tr><td colspan="5" class="table-empty">当前口径没有可比较的套餐，请调整模型档或排行口径。</td></tr>';
}


/* 文字明细独立于 ECharts；图表库加载失败也能查完整牌价与核查来源。 */
function renderApiDetails() {
  const body = byId("apiDetailBody");
  if (!body) return;
  const rows = API_PRICES.map((a) => ({ ...a,
    input:a.cur === "CNY" ? a.inCNY / RATE : a.inUSD,
    output:a.cur === "CNY" ? a.outCNY / RATE : a.outUSD,
  })).filter((a) => Number.isFinite(a.input) && Number.isFinite(a.output)).sort((a,b) => a.output-b.output);
  body.innerHTML = rows.map((a) => `<tr><th scope="row">${esc(apiChartLabel(a))}</th><td>${esc(REGION_LABEL[a.region] || "—")}</td>` +
    `<td>$${Number(a.input.toFixed(4))}</td><td>$${Number(a.output.toFixed(4))}</td><td>${a.output > 0 ? Number((10/a.output).toFixed(1)) + "M" : "—"}</td><td>${priceCheckHtml(a,"api")}</td></tr>`).join("");
}

function syncServiceControls() {
  for (const [key,id] of Object.entries(COST_CONTROLS)) { const el = byId(id); if (el) el.value = calcState[key]; }
  const payment = byId("pickerPaymentSummary");
  if (payment) payment.textContent = "付款：" + PICKER_BILLING_LABELS[pickerState.billing] + (pickerState.billing === "Y" ? "（按折月预算）" : "");
  syncCostChips();
  syncPickerScopeControls();
}

function syncCostChips() {
  const visibleValue = (key) => {
    const control = COST_CONTROLS[key] && byId(COST_CONTROLS[key]);
    return control ? control.value : calcState[key];
  };
  setChipPressed(qsa("[data-cost-preset]"), (button) => {
    const preset = COST_PRESETS[button.dataset.costPreset];
    return preset && Object.entries(preset).every(([key,value]) => visibleValue(key) === value);
  });
  setChipPressed(qsa("[data-cost-scenario]"), (button) => {
    const scenario = COST_SCENARIOS[button.dataset.costScenario];
    return scenario && (calcState.scenario || "typical") === button.dataset.costScenario && visibleValue("input") === scenario.input && visibleValue("cache") === scenario.cache;
  });
}

function syncPickerScopeControls() {
  qsa("#chipBilling .chip").forEach((button) => {
    button.disabled = personalState.fromPicker;
    if (personalState.fromPicker) button.setAttribute("aria-describedby", "personalScope");
    else button.removeAttribute("aria-describedby");
  });
  for (const { name,state } of [{ name:"personal",state:personalState },{ name:"metrics",state:metricsState },{ name:"table",state:tableState },{ name:"rank",state:rankState }]) {
    const applied = !!state.fromPicker;
    /* 价格图、额度表和价格表只收付费档；选购预算为「免费」时不能应用，已应用的仍可取消。 */
    const freeBudget = pickerState.budget === "0";
    qsa(`[data-apply-picker="${name}"]`).forEach((button) => {
      button.textContent = applied ? "取消选购条件" : "应用当前选购条件";
      button.classList.toggle("active", applied);
      button.setAttribute("aria-pressed", applied ? "true" : "false");
      button.disabled = freeBudget && !applied;
      button.title = freeBudget && !applied ? "选购预算为「免费」：这里只列付费档，免费档见「免费 Coding 入口」" : "";
    });
    const scope = byId(name + "Scope");
    const pricing = {
      personal:"图中金额为所选支付方式的月均价。本区月付/年付暂不可切换；取消选购条件后恢复原支付选择。",
      metrics:"套餐按所选支付方式重算；取消选购条件可查看 API 参照。",
      table:"保留目录月付/年付价，并另标选购口径；可按所选支付月均排序。",
      rank:"按所选支付方式月均价重算满额成本，额度不因折扣放大；继续按参考月量区间中点计算。",
    }[name];
    if (scope) scope.textContent = applied
      ? "已应用选购条件：" + pickerScopeText() + "。" + pricing + "继续叠加本区筛选。"
      : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。";
  }
}

/* 缓存单价输入框标明原币，并提示留空时采用的官方价，避免把人民币价填进美元模型。 */
function syncCachePriceHint(api) {
  const unit = byId("costCacheUnit"), input = byId("costCachePrice");
  if (!api) return;
  if (unit) unit.textContent = api.cur === "CNY" ? "人民币" : api.cur === "USD" ? "美元" : api.cur;
  const official = officialCachePrice(api);
  if (input) input.placeholder = official != null ? `留空采用官方 ${currencySymbol(api.cur)}${official}` : "未录入官方价，留空按普通输入价";
}

function renderCostCalculator() {
  const el = byId("costResult");
  if (!el) return;
  const validInputs = Object.entries(COST_CONTROLS).every(([key,id]) => {
    const control = byId(id);
    return !control || validCalcValue(key,control.value);
  });
  if (!validInputs) { el.textContent = "请输入输入框范围内的有效数字。"; return; }
  const api = API_PRICES.find((a) => a.vendor + "|" + a.model === calcState.model && isPriceConfirmed(a, "api"));
  syncCachePriceHint(api);
  const result = calculateWorkload(calcState, api);
  if (!result) { el.textContent = "请输入有效的工作量和预算；缓存单价不能高于普通输入单价。"; return; }
  const currency = currencySymbol(api.cur);
  const cap = result.monthlyBudgetM == null ? "当前单价为零，预算不构成token上限" : "预算可覆盖约 " + fmtTok(result.monthlyBudgetM) + " 总 tokens/月";
  const noCache = "无缓存时约 " + fmtCalcCNY(result.noCacheCNY) + "/月。";
  const cache = result.cacheBasis === "official"
    ? `缓存命中按官方单价 ${currency}${result.cachePrice}/1M 计费（不含缓存写入或存储费），${noCache}可在输入框改填。`
    : result.cacheBasis === "custom" ? "缓存命中按所填单价计费，" + noCache
    : "该模型未录入官方缓存单价，缓存命中率暂不生效，按普通输入价估算；填写官网缓存价后可计算节省。";
  const check = priceCheckOf(api, "api");
  const main = chooseMain(eligibleProfiles());
  let quota = "";
  if (main) {
    const taskRole = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const specific = METRICS_ALL.filter((m) => metricMatchesPlan(m,main.p) && costModelKey(m.model) === costModelKey(api.model))
      .map((m) => ({ m,c:computeMetrics(m),conf:provenance(m).conf })).filter((m) => m.c)
      .sort((a,b) => ({"高":3,"中":2,"低":1}[b.conf] - {"高":3,"中":2,"低":1}[a.conf]))[0];
    const metric = specific || metricForRole(main.p,taskRole);
    if (metric && metric.c.moLow != null) {
      const c = metric.c;
      const baseline = Number(calcState.input) === 80 && Number(calcState.cache) === 95 &&
        (!quotaUsesRequestTokenAssumption(metric.m) || Number(calcState.tokens) === TOKENS_PER_REQ);
      const condition = specific && baseline
        ? "按相同基准，你的总量" + (result.monthlyM <= c.moLow ? "低于参考区间下限" : result.monthlyM > c.moHigh ? "高于参考区间上限" : "落在参考区间内") + "；这不能保证实际额度够用。"
        : "";
      const context = !specific ? "所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用。" : !baseline ? "你修改了折算假设，参考月量不能直接用于判断是否够用。" : "";
      quota = `<p>当前推荐 ${esc(planTitle(main.p))} · ${esc(displayModelName(metric.m.model))}：参考月量 ${esc(tokSpan(c,"moLow","moHigh"))}（置信${esc(metric.conf)}；表内基准：80% 输入、95% 输入缓存${quotaUsesRequestTokenAssumption(metric.m) ? "、请求折算 20K tokens/次" : ""}）。${condition}${context}跨模型 token 不代表等效产出；仍需核对窗口、共享池与工具费用。</p>`;
    } else quota = `<p>当前推荐 ${esc(planTitle(main.p))} 未公开可对照的月 tokens，无法据此保证额度够用。</p>`;
    const quote = typeof pickerPaymentQuote === "function" ? pickerPaymentQuote(main.p) : null;
    if (quote && quote.available && Number.isFinite(quote.monthlyCNY)) quota += `<p>订阅价格参照：${esc(quote.label || "当前支付方式")}月均 ${esc(fmtCalcCNY(quote.monthlyCNY))}。API 账单与订阅分别计费，年付还需核对全年一次支付金额。</p>`;
  }
  const scenarios = calculateCostScenarios(calcState,api);
  const scenarioTable = `<div class="cost-scenario-results"><table class="mini-table"><caption>三种示例计费情景（总工作量上下浮动 20%）</caption><thead><tr><th scope="col">情景与假设</th><th scope="col">基准月费</th><th scope="col">月费范围</th></tr></thead><tbody>` +
    scenarios.map((scenario) => `<tr data-cost-scenario-result="${esc(scenario.id)}"><th scope="row">${esc(scenario.label)}：输入 ${esc(scenario.input)}% / 输出 ${esc(100 - Number(scenario.input))}%，输入缓存 ${esc(scenario.cache)}%</th><td>${esc(fmtCalcCNY(scenario.costCNY))}</td><td>${esc(fmtCalcCNY(scenario.lowCNY))}–${esc(fmtCalcCNY(scenario.highCNY))}</td></tr>`).join("") + `</tbody></table></div>`;
  el.innerHTML = `<p><strong>预计月费 ${esc(currency + fmtCalcNative(result.costNative))} ≈ ${esc(fmtCalcCNY(result.costCNY))}</strong> · ${esc(fmtTok(result.monthlyM))} 总 tokens/月</p>` +
    `<p>${esc(cap)}。${result.costCNY > Number(calcState.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。"}</p><p>${esc(cache)}</p>` +
    `<p>按 ${esc(calcState.days)} 个工作日、每天 ${esc(calcState.requests)} 次请求，每个工作日约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days)))}${Number(calcState.requests) > 0 ? `，每次约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days) / Number(calcState.requests)))}` : ""}。${result.costCNY <= Number(calcState.budget) ? `月预算剩余约 ${esc(fmtCalcCNY(Number(calcState.budget) - result.costCNY))}` : `月预算需补约 ${esc(fmtCalcCNY(result.costCNY - Number(calcState.budget)))}`}。</p>` +
    `<p>工具与地区沿用「帮我选」：${esc(SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具")} · ${esc(REGION_LABEL[pickerState.region] || "不限地区")}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>` +
    `<p>上方费用按当前输入 ${esc(calcState.input)}% / 输出 ${esc(100 - Number(calcState.input))}%、输入缓存命中 ${esc(calcState.cache)}% 计算。工作量上下浮动 20% 时约 ${esc(fmtCalcCNY(result.costCNY * 0.8))}–${esc(fmtCalcCNY(result.costCNY * 1.2))}/月。</p>` + scenarioTable +
    `<p>轻度、日常、重度及三种情景都是可编辑的示例假设，不代表真实用户用量，也不是费用预测或套餐额度承诺。典型沿用页面的 80% 输入 / 95% 缓存基准；三个情景使用同一缓存单价，未填写且未录入官方缓存价时按普通输入价计费。范围只模拟总工作量 ±20%，不包含价格变动、动态限流、工具费和税费。牌价核查 ${esc(check ? check.checkedAt : "未核实")} · <a href="${safeHref(api.url)}" target="_blank" rel="noopener">官网计费规则</a></p>` + quota + usageCoverageHtml(result.monthlyM);
}

function closePlanDetails() {
  const dlg = byId("planDetailsModal");
  if (!dlg || !(dlg.open === true || dlg.getAttribute("open") != null)) return;
  if (typeof dlg.close === "function") dlg.close();
  else { dlg.removeAttribute("open"); finishPlanDetailsClose(); }
}

function finishPlanDetailsClose() {
  const dlg = byId("planDetailsModal");
  if (dlg) dlg.removeAttribute("aria-modal");
  const backdrop = byId("planDetailsBackdrop");
  if (backdrop) backdrop.hidden = true;
  planDetailsBackground.forEach(({el,inert,ariaHidden}) => {
    if (inert == null) el.removeAttribute("inert"); else el.setAttribute("inert", inert);
    if (ariaHidden == null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", ariaHidden);
  });
  planDetailsBackground = [];
  document.body.classList.remove("has-plan-details");
  if (planDetailsReturnFocus) {
    if (!focusTableControl(planDetailsReturnFocus)) focusTableControl(byId("shareResultsBtn"));
    planDetailsReturnFocus = null;
  }
}

function showPlanDetails(id, trigger = null) {
  const p = findPlanReference(id), dlg = byId("planDetailsModal");
  if (!p || !dlg) return;
  if (isCmpModalOpen()) closeCmpModal();
  planDetailsReturnFocus = trigger || document.activeElement;
  byId("planDetailsTitle").textContent = planTitle(p);
  byId("planDetailsBody").innerHTML = `<dl class="plan-detail-fields">` + PLAN_COLUMNS.filter((c) => c.markdown !== false).map((c) => `<div><dt>${esc(c.label)}</dt><dd>${esc(c.value(p) || "—")}</dd></div>`).join("") + `</dl>` +
    `<div class="maintenance-plan-actions">${typeof watchButtonHtml === "function" ? watchButtonHtml(p) : ""}<a href="${safeHref(p.url)}" target="_blank" rel="noopener">官网购买与权益规则 ↗</a></div>` +
    `<p id="planFollowFeedback" class="table-feedback" role="status" aria-live="polite">${esc(followView.storageMessage)}</p>` +
    (typeof planHistoryHtml === "function" ? planHistoryHtml(p.id) : "");
  dlg.setAttribute("aria-modal", "true");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else {
    dlg.classList.add("cmp-fallback"); dlg.setAttribute("open", "");
    const backdrop = byId("planDetailsBackdrop"); if (backdrop) backdrop.hidden = false;
    planDetailsBackground = Array.from(document.body.children).filter((el) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName))
      .map((el) => ({ el, inert:el.getAttribute("inert"), ariaHidden:el.getAttribute("aria-hidden") }));
    planDetailsBackground.forEach(({el}) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
  }
  document.body.classList.add("has-plan-details");
  focusTableControl(byId("planDetailsCloseBtn"));
}

function bindUsageImport() {
  const button = byId("usageImportBtn"), text = byId("usageImportText"), file = byId("usageImportFile");
  if (button && text) button.addEventListener("click", () => importUsageText(text.value));
  if (file) file.addEventListener("change", () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    const feedback = byId("usageImportFeedback");
    if (chosen.size > USAGE_IMPORT_MAX) { if (feedback) feedback.textContent = "文件超过 5MB，请只导出最近的按日用量。"; return; }
    chosen.text().then((content) => { if (text) text.value = content.slice(0, 20000); importUsageText(content); },
      () => { if (feedback) feedback.textContent = "无法读取这个文件，请改为粘贴 JSON。"; });
  });
}

function bindServiceEvents() {
  const payment = byId("pickerPayment");
  if (payment) payment.open = pickerState.billing !== "M";
  [["shareResultsBtn",shareCurrentResults],["copySummaryBtn",copyPickerSummary],["savePresetBtn",savePreset],["loadPresetBtn",restorePreset],["clearPresetBtn",clearPreset],["checkWorkloadBtn",openWorkloadCalculator]].forEach(([id,fn]) => { const b = byId(id); if (b) b.addEventListener("click", fn); });
  const select = byId("costModel");
  if (select) select.innerHTML = API_PRICES.filter((a) => isPriceConfirmed(a,"api")).map((a) => `<option value="${esc(a.vendor + "|" + a.model)}">${esc(a.vendor + " · " + displayModelName(a.label || a.model))}</option>`).join("");
  syncServiceControls(); syncPresetButtons(); renderCostCalculator(); bindUsageImport();
  for (const [key,id] of Object.entries(COST_CONTROLS)) {
    const input = byId(id); if (!input) continue;
    input.addEventListener(key === "model" ? "change" : "input", () => {
      if (!validCalcValue(key,input.value)) { byId("costResult").textContent = "请输入输入框范围内的有效数字。"; syncCostChips(); return; }
      updateAppState(() => {
        calcState[key] = input.value;
        if (key === "model") { calcState.cachePrice = ""; byId("costCachePrice").value = ""; }
        /* 手动改输入占比或缓存率后，只有仍与某个示例情景完全一致时才保留该情景；否则回到默认，分享链接不残留旧情景。 */
        if (key === "input" || key === "cache") {
          const match = Object.entries(COST_SCENARIOS).find(([, s]) => String(s.input) === String(calcState.input) && String(s.cache) === String(calcState.cache));
          calcState.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
        }
      }, () => { renderCostCalculator(); syncCostChips(); });
    });
  }
  const reset = byId("costResetBtn"); if (reset) reset.addEventListener("click", () => updateAppState(() => { Object.assign(calcState,APP_DEFAULTS.calc); syncServiceControls(); },renderCostCalculator));
  const form = byId("costForm"); if (form) form.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
    const scope = target.closest("[data-apply-picker]");
    if (scope) { applyPickerScope(scope.dataset.applyPicker); return; }
    const presetButton = target.closest("[data-cost-preset]");
    if (presetButton && COST_PRESETS[presetButton.dataset.costPreset]) {
      updateAppState(() => { setCostInputs(COST_PRESETS[presetButton.dataset.costPreset]); },renderCostCalculator);
      return;
    }
    const scenarioButton = target.closest("[data-cost-scenario]");
    if (scenarioButton && COST_SCENARIOS[scenarioButton.dataset.costScenario]) {
      const scenario = COST_SCENARIOS[scenarioButton.dataset.costScenario];
      updateAppState(() => { setCostInputs({ scenario:scenarioButton.dataset.costScenario,input:scenario.input,cache:scenario.cache }); },renderCostCalculator);
      return;
    }
    const details = target.closest("[data-view-plan]"); if (details) showPlanDetails(details.dataset.viewPlan,details);
    if (target.closest("#picker .chip") || target.closest("[data-set-picker]")) { syncServiceControls(); renderCostCalculator(); }
  });
  const dlg = byId("planDetailsModal");
  if (dlg) {
    dlg.addEventListener("close",finishPlanDetailsClose);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closePlanDetails(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closePlanDetails(); }
      if (e.key === "Tab" && dlg.classList.contains("cmp-fallback")) {
        const buttons = modalFocusableElements(dlg);
        const first = buttons[0], last = buttons[buttons.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusTableControl(last); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusTableControl(first); }
      }
    });
  }
  const close = byId("planDetailsCloseBtn"); if (close) close.addEventListener("click",closePlanDetails);
  const backdrop = byId("planDetailsBackdrop"); if (backdrop) backdrop.addEventListener("click",closePlanDetails);
}


/* ---------- 事件绑定 ---------- */
function bindEvents() {
  ["tableCount", "metricsCount", "cmpBarText"].forEach((id) => {
    const el = byId(id);
    if (el) { el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-atomic", "true"); }
  });
  /* 静态表头补 scope；额度表 thead 由 renderMetricsHead 生成时直接带 scope="col" */
  qsa("#planTable thead th").forEach((th) => (th.scope = "col"));
  qsa("[data-free-region]").forEach((chip) => chip.addEventListener("click", () => { freeState.region = chip.dataset.freeRegion; renderFree(); }));
  qsa("[data-free-kind]").forEach((chip) => chip.addEventListener("click", () => { freeState.kind = chip.dataset.freeKind; renderFree(); }));
  qsa("#chipCat .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipCat .chip"), (x) => x === c);
      personalState.cat = c.dataset.cat;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipRegion .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipRegion .chip"), (x) => x === c);
      personalState.region = c.dataset.region;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipBilling .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipBilling .chip"), (x) => x === c);
      personalState.billing = c.dataset.billing;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  onState(byId("chartSearch"), "input", (e) => {
    personalState.q = boundedSearch(e.target.value);
    e.target.value = personalState.q;
    personalState.limit = PERSONAL_DEFAULT_LIMIT; /* 搜索后清空关键词仍回到默认档数，避免停留在「显示全部」状态 */
    cancelPersonalSearch();
    personalSearchTimer = setTimeout(() => { personalSearchTimer = null; renderPersonalChart(); }, 150);
  });
  document.addEventListener("click", (e) => {
    const target = evtTarget(e);
    if (!target) return;
    const hit = (sel) => !!(target.closest && target.closest(sel));
    /* 委托统一走 closest：按钮内嵌套元素（图标/换行 span）也不会让点击落空 */
    if (hit("#showAllPersonal")) {
      const button = target.closest("#showAllPersonal");
      const restoreFocus = document.activeElement === button;
      updateAppState(() => {
        personalState.limit = personalState.limit == null ? PERSONAL_DEFAULT_LIMIT : null;
        renderPersonalChart();
        if (restoreFocus) focusTableControl(byId("showAllPersonal"));
      });
      return;
    }
    if (hit("#personalResetBtn")) { updateAppState(() => { cancelPersonalSearch(); resetPersonalFilters(); focusTableControl(byId("chartSearch")); }); return; }
    if (hit("[data-reset-table]")) { updateAppState(() => { cancelTableSearch(); resetTableFilters(); }); return; }
    if (hit("[data-reset-metrics]")) { updateAppState(resetMetricsFilters); return; }
    if (hit("[data-table-extra]")) { updateAppState(() => { tableState.extra = true; renderTable(); focusTableControl(byId("tableExtraToggle")); }); return; }
    const addBtn = target.closest ? target.closest(".cmp-add") : null;
    if (addBtn) {
      const on = addBtn.classList.contains("on");
      updateAppState(() => {
        if (on) cmpRemove(addBtn.dataset.planId);
        else cmpAdd(addBtn.dataset.planId);
      });
      return;
    }
    const removeBtn = target.closest ? target.closest(".cmp-remove") : null;
    if (removeBtn) { updateAppState(() => cmpRemove(removeBtn.dataset.planId)); return; }
    if (hit("#showExcludedInTable")) {
      updateAppState(() => {
        const q = personalState.q;
        tableState.search = q;
        tableState.cat = "all";
        tableState.region = "all";
        tableState.fromPicker = false;
        /* 图上排除的档位里有中转站和待核价格，跳转后一并显示，链接承诺的档位都能看到。 */
        tableState.extra = true;
        const input = byId("searchInput");
        if (input) input.value = q;
        const cat = byId("selectCat");
        const region = byId("selectRegion");
        if (cat) cat.value = "all";
        if (region) region.value = "all";
        renderTable();
        navigateToSection("#table");
      });
      return;
    }
    const rel = target.closest ? target.closest("[data-set-picker]") : null;
    if (rel) {
      const eq = rel.dataset.setPicker.indexOf("=");
      if (eq > 0) updateAppState(() => setPicker(rel.dataset.setPicker.slice(0, eq), rel.dataset.setPicker.slice(eq + 1)));
    }
  });
  onState(byId("searchInput"), "input", (e) => {
    tableState.search = boundedSearch(e.target.value);
    e.target.value = tableState.search;
    cancelTableSearch();
    tableSearchTimer = setTimeout(() => { tableSearchTimer = null; renderTable(); }, 150); /* 与图表搜索同一防抖节奏 */
  });
  onState(byId("selectCat"), "change", (e) => { tableState.cat = e.target.value; renderTable(); });
  onState(byId("selectRegion"), "change", (e) => { tableState.region = e.target.value; renderTable(); });
  const priceSort = byId("tablePriceSort");
  if (priceSort) onState(priceSort, "change", (e) => {
    const [key, dir] = e.target.value.split(":");
    if (!URL_VALID.tsortKeys.has(key) || (key === "selectedMonthly" && !tableState.fromPicker)) return;
    tableState.sortKey = key;
    tableState.sortDir = dir === "-1" ? -1 : 1;
    renderTable();
  });
  const resetBtn = byId("tableResetBtn");
  if (resetBtn) onState(resetBtn, "click", () => { cancelTableSearch(); resetTableFilters(); });
  const extraToggle = byId("tableExtraToggle");
  if (extraToggle) onState(extraToggle, "click", () => { tableState.extra = !tableState.extra; renderTable(); });
  /* 数据表导出与列开关 */
  const csvBtn = byId("exportCsvBtn");
  if (csvBtn) csvBtn.addEventListener("click", exportTableCsv);
  const mdBtn = byId("copyMdBtn");
  if (mdBtn) mdBtn.addEventListener("click", copyTableMarkdown);
  const colsBtn = byId("tableColsToggle");
  if (colsBtn) {
    const sync = () => {
      const showAll = byId("planTable").classList.contains("show-all-cols");
      colsBtn.textContent = showAll ? "收起详细列" : "展开详细列";
      colsBtn.title = showAll ? "隐藏模型、支持工具和备注列" : "显示模型、支持工具和备注列";
      colsBtn.classList.toggle("active", showAll);
      colsBtn.setAttribute("aria-expanded", String(showAll));
      colsBtn.setAttribute("aria-controls", "planTable");
    };
    sync();
    colsBtn.addEventListener("click", () => { byId("planTable").classList.toggle("show-all-cols"); sync(); });
  }
  /* 并排对比 */
  const cmpOpenBtn = byId("cmpOpenBtn");
  if (cmpOpenBtn) cmpOpenBtn.addEventListener("click", openCmpModal);
  const cmpClearBtn = byId("cmpClearBtn");
  if (cmpClearBtn) onState(cmpClearBtn, "click", cmpClear);
  const cmpClearInModal = byId("cmpClearInModal");
  if (cmpClearInModal) onState(cmpClearInModal, "click", cmpClear);
  const copyCmpBtn = byId("copyCmpMdBtn");
  if (copyCmpBtn) copyCmpBtn.addEventListener("click", copyCmpMarkdown);
  const exportCmpBtn = byId("exportCmpCsvBtn");
  if (exportCmpBtn) exportCmpBtn.addEventListener("click", exportCmpCsv);
  const cmpCloseBtn = byId("cmpCloseBtn");
  if (cmpCloseBtn) cmpCloseBtn.addEventListener("click", closeCmpModal);
  const cmpModal = byId("cmpModal");
  if (cmpModal) {
    cmpModal.addEventListener("close", finishCmpModalClose);
    cmpModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeCmpModal(); }
      else if (e.key === "Tab" && cmpModal.classList.contains("cmp-fallback") && isCmpModalOpen()) {
        const focusable = cmpFocusableElements();
        const first = focusable[0], last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!first) { e.preventDefault(); focusTableControl(cmpModal); }
        else if ((e.shiftKey && active === first) || (!e.shiftKey && active === last) || !focusable.includes(active)) {
          e.preventDefault(); focusTableControl(e.shiftKey ? last : first);
        }
      }
    });
    cmpModal.addEventListener("click", (e) => {
      if (e.target !== cmpModal) return;
      const r = cmpModal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeCmpModal();
    });
    document.addEventListener("focusin", (e) => {
      if (cmpModal.classList.contains("cmp-fallback") && isCmpModalOpen() && !cmpModal.contains(evtTarget(e))) {
        focusTableControl(byId("cmpCloseBtn"));
      }
    });
  }
  const cmpBackdrop = byId("cmpBackdrop");
  if (cmpBackdrop) cmpBackdrop.addEventListener("click", closeCmpModal);
  /* 排序表头：键盘可达（Tab 聚焦后 Enter/Space 触发，与点击同一处理器） */
  qsa("#planTable thead th.sortable").forEach((th) => bindSortableHeader(th, tableState, renderTable, 1));
  qsa("#picker .picker-row").forEach((row) => {
    row.querySelectorAll(".chip").forEach((chip) => {
      onState(chip, "click", () => {
        setChipPressed(row.querySelectorAll(".chip"), (x) => x === chip);
        pickerState[row.dataset.pick] = chip.dataset.value;
        renderPicker();
      });
    });
  });
  qsa("#chipRank .chip").forEach((chip) => {
    onState(chip, "click", () => {
      rankState.tier = chip.dataset.rank;
      syncRankChips();
      renderRankChart();
    });
  });
  /* 排行图口径：官方每周 tokens / 含官方折算 / 含全部估算 */
  qsa("#chipRScope .chip").forEach((chip) => {
    onState(chip, "click", () => {
      rankState.scope = chip.dataset.rscope;
      syncRankChips();
      renderRankChart();
    });
  });
}



function bindMetricsEvents() {
  onState(byId("metricsModel"), "change", (e) => { metricsState.model = e.target.value; renderMetricsTable(); });
  onState(byId("metricsVer"), "change", (e) => { metricsState.ver = e.target.value; renderMetricsTable(); });
  onState(byId("metricsTier"), "change", (e) => { metricsState.tier = e.target.value; renderMetricsTable(); });
  onState(byId("metricsOffer"), "change", (e) => { metricsState.offer = e.target.value; renderMetricsTable(); });
  onState(byId("rankVendor"), "change", (e) => { rankState.vendor = e.target.value; renderRankChart(); });
  byId("tableMoreBtn").addEventListener("click", () => showMoreTableRows());
  byId("metricsMoreBtn").addEventListener("click", () => showMoreMetricsRows());
  let mobileTables = window.innerWidth < 768;
  window.addEventListener("resize", () => {
    const mobile = window.innerWidth < 768;
    if (mobile === mobileTables) return;
    mobileTables = mobile;
    renderTable(); renderMetricsTable();
  }, { passive:true });
  const resetBtn = byId("metricsResetBtn");
  if (resetBtn) onState(resetBtn, "click", resetMetricsFilters);
  qsa("#metricsTable th.sortable").forEach((th) => {
    const col = METRICS_COLUMNS.find((x) => x.sortKey === th.dataset.sort);
    bindSortableHeader(th, metricsState, renderMetricsTable, col && col.asc ? 1 : -1);
  });
  const metricsToggle = byId("metricsToggle");
  if (metricsToggle) {
    const sync = () => {
      const compact = byId("metricsTable").classList.contains("is-compact");
      metricsToggle.textContent = compact ? "展开 5 小时 / 每周明细" : "收起明细";
      metricsToggle.classList.toggle("active", !compact);
      metricsToggle.setAttribute("aria-expanded", String(!compact));
      metricsToggle.setAttribute("aria-controls", "metricsTable");
      renderMetricsSortHint();
    };
    sync();
    metricsToggle.addEventListener("click", () => { byId("metricsTable").classList.toggle("is-compact"); sync(); });
  }
}


function resetPersonalFilters() {
  Object.assign(personalState, { cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker:false });
  byId("chartSearch").value = "";
  setChipPressed(qsa("#chipCat .chip"), (c) => c.dataset.cat === "all");
  setChipPressed(qsa("#chipRegion .chip"), (c) => c.dataset.region === "all");
  setChipPressed(qsa("#chipBilling .chip"), (c) => c.dataset.billing === "M");
  renderPersonalChart();
}

function renderRankChart() {
  if (typeof syncPickerScopeControls === "function") syncPickerScopeControls();
  /* 只更新标题里的支付口径，章节编号与「进阶」标记保持页面原样。 */
  const titleBasis = byId("rankTitleBasis");
  if (titleBasis) titleBasis.textContent = rankPaymentLabel();
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
  el.style.height = chartHeight(items.length, chartRowHeight(el, 30), 130, 420) + "px";
  const chart = makeChart("chartRank");

  const labels = items.map((r) => r ? (rankIsEstimate(r.m) ? "≈" : "") + metricChartLabel(r.m) : "— " + RANK_ESTIMATE_DIVIDER + " —");
  const data = items.map((r) => {
    if (!r) return { value: null };
    const cp = r.c.costPerM;
    const tier = cpmTier(cp);
    const color = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
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

function setCostInputs(values) {
  Object.assign(calcState,values);
  for (const [key,value] of Object.entries(values)) {
    const control = COST_CONTROLS[key] && byId(COST_CONTROLS[key]);
    if (control) control.value = value;
  }
  syncCostChips();
}

if (byId('statsRow')) renderStats();


function usageCoverageHtml(monthlyM, state = calcState) {
    const rows = usageCoverageRows(monthlyM, state);
    const basis = Number(state.input) === 80 && Number(state.cache) === 95 ? "" : "你修改了输入占比或缓存率；参考额度仍按页面 80% 输入、95% 缓存折算，只作量级参考。";
    if (!rows.length) {
        return `<div class="usage-coverage"><h4>能覆盖这个用量的套餐</h4><p>按当前地区与工具，没有套餐的参考月额度下限（官方或中置信折算）能覆盖约 ${esc(fmtTok(monthlyM))} tokens/月。可以减少用量假设，或按上方 API 按量费用估算。${esc(basis)}</p></div>`;
    }
    const body = rows.slice(0, 5).map((row) => {
        const saving = row.apiMonthlyCNY == null ? "—" : row.apiMonthlyCNY > row.quote.monthlyCNY
            ? `约 ${fmtCalcCNY(row.apiMonthlyCNY)}，订阅每月省约 ${fmtCalcCNY(row.apiMonthlyCNY - row.quote.monthlyCNY)}`
            : `约 ${fmtCalcCNY(row.apiMonthlyCNY)}，按量更省`;
        const breakEven = row.breakEvenM == null ? "—" : `超过约 ${fmtTok(row.breakEvenM)} tokens/月`;
        return `<tr><th scope="row" data-label="套餐">${esc(planTitle(row.p))}</th><td data-label="模型">${esc(displayModelName(row.m.model))}</td><td data-label="所选付款月均">${esc(priceLine(row.p))}</td><td data-label="参考月额度下限">${esc(fmtTok(row.c.moLow))}（置信${esc(row.conf)}）</td><td data-label="同模型按量">${esc(saving)}</td><td data-label="订阅回本点">${esc(breakEven)}</td></tr>`;
    }).join("");
    return `<div class="usage-coverage"><h4>能覆盖这个用量的套餐（${rows.length} 档，列前 5）</h4><div class="table-wrap" tabindex="0" role="region" aria-label="能覆盖用量的套餐，可横向滚动"><table class="mini-table usage-coverage-table"><caption class="sr-only">参考月额度下限不低于约 ${esc(fmtTok(monthlyM))} tokens/月的套餐</caption><thead><tr><th scope="col">套餐</th><th scope="col">模型</th><th scope="col">所选付款月均</th><th scope="col">参考月额度下限</th><th scope="col">同模型按量</th><th scope="col">订阅回本点</th></tr></thead><tbody>${body}</tbody></table></div>` +
        `<p class="maintenance-meta">沿用帮我选的地区、工具和付款方式；只统计官方或中置信折算的额度，第三方与请求次数估算不列入。不同模型的 token 不等价，参考额度不保证可用量。「订阅回本点」指同模型按量费用追平月费所需的用量。${esc(basis)}</p></div>`;
}

// Historical DOM boundary for theme and toolbar controls.
function applyTheme(mode) {
    mode = ["dark", "light", "system"].includes(mode) ? mode : "system";
    themeMode = mode;
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const eff = mode === "system" ? (sysDark ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = eff;
    document.documentElement.dataset.themeMode = mode;
    try {
        localStorage.setItem(THEME_KEY, mode);
    }
    catch (e) { /* 存储受限只影响回访记忆。 */ }
    refreshPalette();
    const browserColor = (getComputedStyle(document.documentElement).getPropertyValue("--paper") || "").trim()
        || (eff === "dark" ? "#131511" : "#fbfbf8");
    /* 两个带系统 media 的标签都写实际主题色，手动选择主题也能更新浏览器外观。 */
    qsa('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", browserColor));
    const btn = byId("themeBtn");
    if (btn) {
        btn.innerHTML = mode === "dark" ? icon("moon") : mode === "light" ? icon("sun") : icon("computer");
        const name = mode === "dark" ? "暗色" : mode === "light" ? "亮色" : "跟随系统";
        const nextName = mode === "dark" ? "亮色" : mode === "light" ? "跟随系统" : "暗色";
        const current = mode === "system" ? name + "（当前" + (eff === "dark" ? "暗色" : "亮色") + "）" : name;
        const label = "当前主题：" + current + "；点击切换为" + nextName;
        btn.title = label;
        btn.setAttribute("aria-label", label);
    }
}
function initTheme() {
    applyTheme(readThemeMode());
    initPageNavigation();
    const btn = byId("themeBtn");
    if (btn)
        btn.addEventListener("click", () => {
            const order = ["dark", "light", "system"];
            applyTheme(order[(order.indexOf(themeMode) + 1) % 3]);
            rerenderCharts();
        });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
        if (themeMode === "system") {
            applyTheme("system");
            rerenderCharts();
        }
    };
    /* 旧版 Safari（<14）只支持 addListener，此处做回退 */
    if (mq.addEventListener)
        mq.addEventListener("change", onSchemeChange);
    else if (mq.addListener)
        mq.addListener(onSchemeChange);
}
function serviceFeedback(message) {
    const el = byId("serviceFeedback");
    if (el)
        el.textContent = message;
}
function syncPresetButtons() {
    const saved = !!readPreset();
    ["loadPresetBtn", "clearPresetBtn"].forEach((id) => {
        const b = byId(id);
        if (b)
            b.disabled = !saved;
    });
}

// Historical control synchronization boundary for VM assertions.
/* 恢复 URL 状态后，把输入框/下拉/chip 的显示值同步到状态 */
function syncControlsFromState() {
    syncPickerChips(); /* renderPicker 渲染时也会自愈同步，这里先跑一次避免首帧高亮错档 */
    setChipPressed(qsa("#chipCat .chip"), (chip) => chip.dataset.cat === personalState.cat);
    setChipPressed(qsa("#chipRegion .chip"), (chip) => chip.dataset.region === personalState.region);
    setChipPressed(qsa("#chipBilling .chip"), (chip) => chip.dataset.billing === personalState.billing);
    const setVal = (id, v) => {
        const el = byId(id);
        if (el)
            el.value = v;
    };
    setVal("chartSearch", personalState.q);
    setVal("searchInput", tableState.search);
    setVal("selectCat", tableState.cat);
    setVal("selectRegion", tableState.region);
    setVal("metricsModel", metricsState.model);
    setVal("metricsVer", metricsState.ver); /* 模型下拉在 populateModelFilter 填充后再设值 */
    setVal("metricsTier", metricsState.tier);
    setVal("metricsOffer", metricsState.offer);
    syncRankChips();
    setVal("rankVendor", rankState.vendor);
    if (typeof syncServiceControls === "function")
        syncServiceControls();
}


function importUsageText(text) {
  const feedback = byId("usageImportFeedback");
  try {
    const usage = parseUsageExport(text);
    const values = usageToCalculator(usage);
    updateAppState(() => {
      setCostInputs(values);
      const match = Object.entries(COST_SCENARIOS).find(([, s]) => s.input === values.input && s.cache === values.cache);
      calcState.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
    }, () => { renderCostCalculator(); syncCostChips(); });
    const period = usage.activeDays ? `${usage.activeDays} 个有用量的日子` : usage.months ? `${usage.months} 个月` : "导入的记录";
    if (feedback) feedback.textContent = `已导入 ${period}：共 ${fmtTok(usage.total / 1e6)} tokens，输入占比 ${values.input}%，缓存命中 ${values.cache}%` +
      `${usage.cacheWrite ? `（另有缓存写入 ${fmtTok(usage.cacheWrite / 1e6)}，计入输入、未单独计价）` : ""}。已换算为每天 ${values.requests} 次 × ${values.tokens} tokens × ${values.days} 天。`;
  } catch (err) {
    if (feedback) feedback.textContent = err instanceof Error ? err.message : String(err);
  }
}
