import type { EChartsType } from 'echarts/core';
import { API_PRICES, findPlanReference, hasIncludedModelQuota, isPersonalMonthly, isPriceConfirmed, isRelay, isRetiredPlan, META, PLAN_TOKENS, PLANS, resolvedField } from './catalog';
import { computeMetrics, fmtTok, isFlagshipModelName, toCNY } from './metrics';
import type { MetricsResult } from './model-types';
import { appState, axisStyle, byId, CAT_COLOR, chartAxisLabel, chartRowHeight, cnyOf, cpmTier, currencySymbol, deferChartRender, describeChart, displayModelName, esc, fmtCNY, foldSearch, makeChart, metricOfferOk, METRICS_ALL, PAL, planLabel, planSearchBlob, priceOf, priceText, queryHit, RATE, RELAY_COLOR, resolvePlan, safeHref, shortVendor, tipStyle, trunc, type MetricRow } from './core';
import { APP_DEFAULTS, personalState, pickerState, rankState } from './state';
import { fullUseCostRangeText, matchesPickerPurchase, PICKER_BILLING_LABELS, pickerFirstPaymentText, pickerMetricInput, pickerMonthlyCNY, pickerPaymentQuote, pickerPlanForMetric, priceLine } from './picker';
import { provenance } from './tables';

/* ============ Coding Plan 比价中心 — 图表渲染 ============ */

/* 图高随行数增长：n 行 × 每行 per px + 标题/轴留白 base，但不低于 min（空数据也要装下坐标轴） */
export function chartHeight(n: number, per: number, base: number, min: number) {
    return Math.max(min, n * per + base);
}
/* 相差多个数量级的数值用真正的对数轴；留出低于最小值的刻度，让最低项也有可点击柱形。
   柱长不代表线性比例，轴标题、读屏摘要及精确 tooltip 均明确这一点。 */
export function chartLogAxis(values: number[], name: string) {
    const positive = values.filter((v) => Number.isFinite(v) && v > 0);
    const lowest = positive.length ? Math.min(...positive) : 1;
    const min = Math.pow(10, Math.floor(Math.log10(lowest) - 0.01));
    return {
        type: "log", logBase: 10,
        min, startValue: min,
        name: name + "（对数刻度）", nameLocation: "middle", nameGap: 30,
        nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => Number(v.toPrecision(5)).toLocaleString("zh-CN", { maximumFractionDigits: 6 }) },
    };
}
export function weeklyTokenRange(low: number, high: number) {
    const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("zh-CN");
    return fmt(low) + (low === high ? "" : "–" + fmt(high)) + "M";
}
/* 套餐身份和名称取自主表，额度行只追加模型名称；不再为图表单独缩写套餐名。 */
export function metricChartLabel(m: MetricRow) {
    const p = resolvePlan(m) || m;
    return planLabel(p) + " · " + displayModelName(m.model);
}
/* ---------- 个人订阅价格全景 ---------- */
/** 价格图的人民币月价（已应用选购条件时按所选付款方式）；没有价格时按 0 排在最前。 */
export function personalChartPrice(p: Plan) { return (personalState.fromPicker ? pickerMonthlyCNY(p) : cnyOf(p, personalState.billing)) ?? 0; }
export function resetPersonalFilters() {
    Object.assign(personalState, APP_DEFAULTS.personal);
    renderPersonalChart();
}
/* Vue components own chart controls and service dialogs; ECharts owns only the canvas. */
export const chartLegendSelections = appState<Record<string, Record<string, boolean>>>({});
/* 个人价格图的搜索防抖由组件登记：历史恢复时取消待执行的搜索并判断是否仍有未生效的输入。 */
export const personalViewHooks: { cancelSearch?: () => void; hasPendingSearch?: () => boolean } = {};
export function cancelPersonalSearch() { personalViewHooks.cancelSearch?.(); }
/* DOM 图例可用键盘操作；同一名称的区间基柱和上限段一起切换。 */
export function bindChartLegend(chart: EChartsType, id: string, colors: Record<string, string>) {
    const selections = chartLegendSelections[id] || (chartLegendSelections[id] = {});
    for (const name of Object.keys(colors)) {
        if (selections[name] === false)
            chart.dispatchAction({ type: "legendUnSelect", name });
    }
    if (typeof chart.off === "function" && typeof chart.on === "function") {
        chart.off("legendselectchanged");
        chart.on("legendselectchanged", (event) => {
            Object.assign(selections, (event as { selected: Record<string, boolean> }).selected);
        });
    }
}
export function personalTooltip(p: Plan) {
    const quote = personalState.fromPicker ? pickerPaymentQuote(p) : null;
    const billing = quote ? quote.mode : personalState.billing;
    const y = p.priceY != null ? `年付：${priceText(p, "priceY")}/月（年付折算）` : "年付：未列公开价";
    const unified = quote ? quote.monthlyNative : priceOf(p, billing);
    const unifiedCNY = quote ? quote.monthlyCNY : cnyOf(p, billing);
    const uni = unified != null ? `${currencySymbol(p.cur) + Number(unified.toFixed(2))} ≈ ${fmtCNY(unifiedCNY ?? 0)}` : "—";
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
/** 价格柱：图表数据项保留套餐对象，提示框与测试据此读取。 */
type PlanBar = { value: number; itemStyle: Record<string, unknown>; _p: Plan };
export function renderPersonalChart() {
    if (deferChartRender("chartPersonal", renderPersonalChart))
        return;
    /* 图中的档位都有所选口径的价格；缺价时按 0 处理，与原先的数值运算一致。 */
    const price = personalChartPrice;
    const q1 = foldSearch(personalState.q) ? personalState.q.trim() : "";
    const annualMode = !personalState.fromPicker && personalState.billing === "Y";
    const rows = PLANS.filter((p) => isPriceConfirmed(p) && isPersonalMonthly(p) &&
        (!annualMode || (p.priceY ?? 0) > 0) &&
        (personalState.cat === "all" || p.cat === personalState.cat) &&
        (personalState.region === "all" || p.region === personalState.region) &&
        (!personalState.fromPicker || matchesPickerPurchase(p)) &&
        (!q1 || queryHit(planSearchBlob(p), q1))).sort((a, b) => price(a) - price(b));
    // 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开
    const noFilter = !personalState.fromPicker && personalState.cat === "all" && personalState.region === "all" && !q1;
    const limit = noFilter ? personalState.limit : null;
    const shown = limit ? rows.slice(0, limit) : rows;
    const el = byId("chartPersonal")!;
    /* 初始化/缩放时需要真实容器宽度，空态在完成配置后再隐藏 canvas。 */
    el.hidden = false;
    el.style.height = chartHeight(shown.length, chartRowHeight(el, 30), 130, 420) + "px";
    const chart = makeChart("chartPersonal");
    const labels = shown.map((p) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "·国内" : ""));
    const data: PlanBar[] = shown.map((p) => ({
        value: Math.round(price(p) * 10) / 10,
        itemStyle: { color: isRelay(p) ? RELAY_COLOR : CAT_COLOR[p.cat], borderRadius: [0, 4, 4, 0] },
        _p: p,
    }));
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "item", ...tipStyle(el), formatter: (d: { data: PlanBar }) => personalTooltip(d.data._p) },
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
                label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: { value: number }) => "¥" + d.value.toLocaleString("zh-CN") },
            },
        ],
    }, true);
    chart.resize();
    el.hidden = shown.length === 0;
    const billingLabel = personalState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : personalState.billing === "Y" ? "年付折月" : "月付";
    /* 应用选购条件时金额来自帮我选的付款口径，说明也按同一口径写。 */
    const priceBasis = (p: Plan) => personalState.fromPicker
        ? (pickerPaymentQuote(p).inferred ? "（未单列自动续费价，按标价）" : "")
        : "";
    describeChart("chartPersonal", "个人订阅价格全景（" + billingLabel + "，人民币/月）" + shown.length + " 档，最低三档：" + shown.slice(0, 3).map((p) => shortVendor(p.vendor) + " " + p.plan + " " + fmtCNY(price(p)) + priceBasis(p)).join("、"));
}
/* ---------- 团队 / 企业 / 云厂商（席位价 + 整包价） ---------- */
export function renderTeamChart() {
    if (deferChartRender("chartTeam", renderTeamChart))
        return;
    /* 只取有正月费的档位，人民币月价一定存在。 */
    const monthlyCNY = (p: Plan) => cnyOf(p, "M") ?? 0;
    const rows = PLANS.filter((p) => isPriceConfirmed(p) && !isRetiredPlan(p) && (p.cat === "team" || p.seat) && p.priceM != null && p.priceM > 0).sort((a, b) => Number(!a.seat) - Number(!b.seat) || monthlyCNY(a) - monthlyCNY(b));
    const el = byId("chartTeam")!;
    el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 130, 380) + "px";
    const chart = makeChart("chartTeam");
    const data: PlanBar[] = rows.map((p) => ({
        value: Math.round(monthlyCNY(p) * 10) / 10,
        itemStyle: { color: p.seat ? CAT_COLOR.team : PAL.info, borderRadius: [0, 4, 4, 0] },
        _p: p,
    }));
    chart.setOption({
        backgroundColor: "transparent",
        /* 数据被筛空时给出占位标题，而不是一块空白画布 */
        ...(rows.length ? {} : { title: { text: "暂无可对比的团队/企业档", left: "center", top: "middle", textStyle: { color: PAL.dim, fontSize: 13, fontWeight: 500 } } }),
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: { data: PlanBar }) => {
                const p = d.data._p;
                const href = safeHref(p.url);
                return `<b style="font-size:13.5px">${esc(p.vendor)} · ${esc(p.plan)}</b><br/>
            ${p.seat ? "每席位/用户/月" : "整包价/月"}：${esc(priceText(p, "priceM"))} ≈ ${fmtCNY(monthlyCNY(p))}${p.priceY != null ? `（年付 ${esc(priceText(p, "priceY"))}/月）` : ""}<br/>
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
        series: [{ type: "bar", data, barWidth: 16, label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: { value: number }) => "¥" + d.value.toLocaleString("zh-CN") } }],
    }, true);
    chart.resize();
    describeChart("chartTeam", "团队/企业档 " + rows.length + " 项，先列每席月价，再列整包月价，各组内按价格升序。价格采用对数刻度，相邻主刻度为十倍；不同计价单位不作排名比较。");
}
/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */
export const TOKEN_OFFICIAL_COLOR = "#34d399";
export const TOKEN_EST_COLOR = "#fbbf24";
export const TOKEN_OFFICIAL_SERIES = "官方额度折算";
export const TOKEN_EST_SERIES = "折算 / 社区推算";
/** 每周 tokens 图的一行：官方公布档或带每周口径的额度行。 */
export interface TokenChartSource { label: string; model: string; lowM: number; highM: number; priceCNY: number; isOfficial: boolean; url: string; note?: string; method?: string; conf?: string; vendorLowM?: number; vendorHighM?: number; }
export type TokenRow = TokenChartSource & { midM: number };
type TokenBar = { value: number; _r: TokenRow } | null;
export function renderTokensChart() {
    if (deferChartRender("chartTokens", renderTokensChart))
        return;
    const chart = makeChart("chartTokens");
    const el = byId("chartTokens")!;
    const official: TokenChartSource[] = PLAN_TOKENS.flatMap((t) => {
        const p = findPlanReference(t.ref);
        if (!p) {
            console.warn("[data] PLAN_TOKENS ref 未解析，已跳过:", t.ref);
            return [];
        }
        if (!isPriceConfirmed(p) || isRetiredPlan(p))
            return [];
        return [{
                label: planLabel(p) + " · " + displayModelName(t.model),
                model: t.model,
                lowM: t.lowM, highM: t.highM, vendorLowM: t.vendorLowM, vendorHighM: t.vendorHighM,
                priceCNY: toCNY(p.priceM ?? 0, p.cur),
                isOfficial: true, url: t.url, note: t.note, conf: "中",
            }];
    });
    /* 已在 PLAN_TOKENS 里的档不重复。智谱国内 V3 与 Z.ai 每周额度相同，也不再画一遍。
       PLAN_TOKENS 是公布每周额度上限的档位，按官方积分系数与统一假设折算；小米 / 腾讯是月度积分池，
       摊到周并非真实周额度，不进本图。其余带每周 tokens 的行按出处着色：
       高置信且非估算视为官方额度，新厂商不会被默认涂成低置信社区估算。
       官方条数区间按结构化公式折算，其余请求数制只在额度深度对比表里呈现。 */
    const coveredPlan = new Set(PLAN_TOKENS.map((t) => findPlanReference(t.ref)?.id).filter(Boolean));
    const weeklyExtra: TokenChartSource[] = METRICS_ALL.filter((m) => {
        const p = findPlanReference(m.ref);
        if (p && (!isPriceConfirmed(p) || isRetiredPlan(p)))
            return false;
        if (m.wkLowM == null && m.reqLowPer5h == null)
            return false;
        if (m.note && m.note.includes("系数折算"))
            return false;
        /* data.js 用 weeklyChart:false 标注与 PLAN_TOKENS 档位同额度的重复行（如智谱国内版） */
        if (m.weeklyChart === false)
            return false;
        if (coveredPlan.has(findPlanReference(m.ref)?.id))
            return false;
        return true;
    }).flatMap((e) => {
        const current = resolvePlan(e) || e;
        const computed = computeMetrics(current);
        if (!computed || computed.wkLowM == null || computed.wkHighM == null)
            return [];
        const prov = provenance(e);
        return [{
                label: metricChartLabel(e),
                model: e.model,
                lowM: computed.wkLowM, highM: computed.wkHighM,
                priceCNY: toCNY(current.priceM ?? 0, current.cur),
                isOfficial: !e.isEst && prov.conf === "高",
                url: e.source, note: e.note,
                method: e.method || prov.text,
                conf: e.confidence || prov.conf,
            }];
    });
    const community = weeklyExtra.filter((r) => !r.isOfficial);
    const officialBars = official.concat(weeklyExtra.filter((r) => r.isOfficial));
    const rows: TokenRow[] = [...officialBars, ...community].map((r) => ({ ...r, midM: (r.lowM + r.highM) / 2 }));
    rows.sort((a, b) => b.midM - a.midM);
    el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 150, 420) + "px";
    const cats = rows.map((r) => r.label);
    /* 对数轴不堆叠 high-low（差值不能当作单独的 log 值）。先画到上限的淡色柱，
       再叠到下限的实色柱；每段直接使用真实端点，定额的 high=low 也能显示标签。 */
    const series = [true, false].flatMap((isOfficial) => {
        const name = isOfficial ? TOKEN_OFFICIAL_SERIES : TOKEN_EST_SERIES;
        const color = isOfficial ? TOKEN_OFFICIAL_COLOR : TOKEN_EST_COLOR;
        const data = (upper: boolean): TokenBar[] => rows.map((r) => r.isOfficial === isOfficial && (upper ? r.highM : r.lowM) > 0
            ? { value: upper ? r.highM : r.lowM, _r: r } : null);
        return [
            { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(true),
                itemStyle: { color, opacity: 0.32, borderRadius: [0, 4, 4, 0] },
                label: { show: true, position: "right", opacity: 1, color: PAL.catLabel, fontSize: 11,
                    formatter: (d: { data: TokenBar }) => d.data && d.data._r ? weeklyTokenRange(d.data._r.lowM, d.data._r.highM) : "" } },
            { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(false),
                itemStyle: { color, borderRadius: [0, 4, 4, 0] } },
        ];
    });
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: { data: TokenBar }) => {
                const r = d.data && d.data._r;
                if (!r)
                    return "";
                const prov = r.isOfficial
                    ? '<span class="conf conf-hi">官方额度折算</span>'
                    : `<span class="conf conf-${r.conf === "低" ? "lo" : "mid"}">折算/推算·${esc(r.conf || "低")}</span>`;
                const per100 = r.priceCNY > 0 ? (r.midM / r.priceCNY * 100).toFixed(1) : "—";
                const vendor = r.vendorLowM != null && r.vendorHighM != null ? `厂商按自身用量假设另给出 ${weeklyTokenRange(r.vendorLowM, r.vendorHighM)}/周，未用于比较<br/>` : "";
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
    }, true);
    chart.resize();
    bindChartLegend(chart, "tokensLegend", { [TOKEN_OFFICIAL_SERIES]: TOKEN_OFFICIAL_COLOR, [TOKEN_EST_SERIES]: TOKEN_EST_COLOR });
    describeChart("chartTokens", "每周可用 tokens 对比 " + rows.length + " 行：官方额度折算 " + officialBars.length + " 行、折算或社区推算 " + community.length + " 行。采用对数刻度，相邻主刻度为十倍，淡色段表示区间上限，数值见柱尾和提示。");
}
/* ---------- API 按量价格 ---------- */
/* 图表纵轴与明细表共用「厂商 · 模型」：label 里的平台后缀（(Z.ai) / [硅基] 等）由厂商前缀承担，
   厂商名与模型名重复时（DeepSeek · DeepSeek V4-Pro）去掉重复的厂商词。 */
export function apiChartLabel(a: Pick<ApiPrice, "vendor" | "label" | "model">) {
    const vendor = shortVendor(a.vendor);
    let model = displayModelName(String(a.label || a.model).replace(/\s*[(（\[【].*$/, "").trim());
    if (model.toLowerCase().startsWith(vendor.toLowerCase() + " "))
        model = model.slice(vendor.length + 1);
    return vendor + " · " + model;
}
/** API 图的一行：单价统一折成美元。 */
type ApiChartRow = ApiPrice & { inUSD: number; outUSD: number };
type PowerItem = { value: number; a: ApiChartRow } | null;
export function renderApiChart() {
    if (deferChartRender("chartApi", renderApiChart))
        return;
    const apiEl = byId("chartApi")!;
    const chart = makeChart("chartApi");
    /* 人民币条目缺单价时得到 NaN，与美元条目缺价一样不进图。 */
    const detailRows = API_PRICES.map((a) => {
        const inU = a.cur === "CNY" ? (a.inCNY ?? NaN) / RATE : a.inUSD;
        const outU = a.cur === "CNY" ? (a.outCNY ?? NaN) / RATE : a.outUSD;
        return { ...a, inUSD: inU, outUSD: outU };
    })
        .filter((a): a is ApiChartRow => a.inUSD != null && a.outUSD != null)
        .sort((x, y) => x.outUSD - y.outUSD);
    const rows = detailRows.filter((a) => isPriceConfirmed(a, "api"));
    const cats = rows.map(apiChartLabel);
    apiEl.style.height = chartHeight(rows.length, chartRowHeight(apiEl, 28), 72, 640) + "px";
    const fmtPrice = (a: ApiChartRow) => a.cur === "CNY"
        ? `输入：¥${a.inCNY}/1M（≈$${a.inUSD.toFixed(2)}） ｜ 输出：¥${a.outCNY}/1M（≈$${a.outUSD.toFixed(2)}）`
        : `输入：$${a.inUSD}/1M ｜ 输出：$${a.outUSD}/1M`;
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "axis", ...tipStyle(apiEl), axisPointer: { type: "shadow" },
            formatter: (ps: { dataIndex: number }[]) => {
                const a = rows[ps[0]!.dataIndex]!;
                const href = safeHref(a.url);
                const shown = displayModelName(a.label || a.model);
                const idLine = a.model && displayModelName(a.model) !== shown ? `<span style="color:${PAL.dim}">计费 ID：${esc(a.model)}</span><br/>` : "";
                return `<b>${esc(apiChartLabel(a))}</b>${a.region === "cn" ? " · 国内" : ""}<br/>${idLine}
            ${fmtPrice(a)}<br/>
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
    }, true);
    chart.resize();
    bindChartLegend(chart, "apiLegend", { "输入 / 1M tokens": "#6366f1", "输出 / 1M tokens": "#f472b6" });
    /* 购买力：$10 按输出价可购 token 量。按地区拆双系列（barGap -100% 重叠），
       图例可点击过滤国际/国内；axis 触发 + 阴影指示器与左图一致。 */
    const chart2 = makeChart("chartPower");
    const el2 = byId("chartPower")!;
    el2.style.height = chartHeight(rows.length, chartRowHeight(el2, 26), 120, 420) + "px";
    const power = rows.filter((a) => a.outUSD > 0).map((a) => ({ name: apiChartLabel(a), m: 10 / a.outUSD, a }));
    power.sort((x, y) => y.m - x.m);
    const POWER_COLORS = { intl: "#22d3ee", cn: "#34d399" };
    const powerSeriesData = power.map((p): [PowerItem, PowerItem] => {
        const item = { value: p.m, a: p.a };
        return p.a.region === "cn" ? [null, item] : [item, null];
    });
    const powerLabel = { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (d: { value: number | null }) => (d.value != null ? Number(d.value.toFixed(1)) + "M" : "") };
    chart2.setOption({
        backgroundColor: "transparent",
        title: { text: "$10 可购买的输出 tokens（M）", left: "center", top: 4, textStyle: { color: PAL.dim, fontSize: 12, fontWeight: 500 } },
        tooltip: {
            trigger: "axis", ...tipStyle(el2), axisPointer: { type: "shadow" },
            formatter: (ps: { dataIndex: number }[]) => {
                const p = power[ps[0]!.dataIndex];
                if (!p)
                    return "";
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
    }, true);
    chart2.resize();
    bindChartLegend(chart2, "powerLegend", { "国际模型": POWER_COLORS.intl, "国内模型": POWER_COLORS.cn });
    describeChart("chartApi", "API 按量单价对比 " + rows.length + " 款模型（左图）；$10 预算输出 token 购买力 " + power.length + " 行（右图）。两图采用对数刻度，相邻主刻度为十倍，完整价格见提示和下方明细。");
    describeChart("chartPower", "$10 预算输出 token 购买力 " + power.length + " 行；采用对数刻度，相邻主刻度为十倍。使用图例按钮筛选国内或国际模型，完整数值见下方明细。");
}
/* ---------- 免费入口 ---------- */
/* 免费入口按地区和类型筛选（本页内状态，不写入分享链接）；手机上 20 张卡不必整页滚完。 */
export const freeState = appState({ region: "all", kind: "all" });
export function freeKind(p: Plan) { return hasIncludedModelQuota(p) ? "included" : "byok"; }
/* ---------- 性价比排行图（每 M tokens 成本） ---------- */
/** 排行的一行：额度行（可能已按选购付款方式改价）与折算出的每百万 tokens 成本。 */
export interface RankRow { m: MetricRow; c: MetricsResult & { costPerM: number }; }
/* scope: credits=官方口径折算（积分系数/credits 面值/官方区间，中置信及以上）；all=含全部估算（低置信）。
   目前没有厂商直接公布可跨家比较的每周 tokens，旧的 official 口径并入 credits。 */
export function rankScopeOk(m: QuotaRow) {
    /* 无牌价的 credits 面值只能按假设单价折算，说明里承诺不进入排行，任何口径都排除。 */
    if ((m.creditCNY != null || m.creditUSD != null) && typeof m.apiIn !== "number")
        return false;
    if (rankState.scope === "all")
        return true;
    return provenance(m).conf !== "低";
}
/* 实心柱：依据官方额度规则（中置信及以上）；斜纹柱与 ≈：第三方或请求次数估算。 */
export function rankIsEstimate(m: QuotaRow) { return provenance(m).conf === "低"; }
const RANK_VENDOR_LABELS: Record<string, string> = { Anthropic: "Claude（Anthropic）", OpenAI: "ChatGPT（OpenAI）", "月之暗面 Kimi": "Kimi（月之暗面）" };
export function rankVendorLabel(vendor: string) {
    return RANK_VENDOR_LABELS[vendor] || shortVendor(vendor);
}
/* 名称和价格每次从主表解析；额度成本按原始指标行缓存，价格或币种变化时重算，
   避免每次重绘对同一行重复计算。中转站不和官方订阅比单价（个人价格图与帮我选同一规则）。 */
export const rankCostCache = new WeakMap<MetricRow, { key: string; c: MetricsResult | null }>();
export function rankPaymentLabel() { return rankState.fromPicker ? PICKER_BILLING_LABELS[pickerState.billing] + "月均" : "目录月付标价"; }
export function rankRowPaymentLabel(m: MetricRow) {
    const p = rankState.fromPicker ? pickerPlanForMetric(m) : null;
    return rankPaymentLabel() + (p && pickerPaymentQuote(p).inferred ? "（未单列续费价，按标价）" : "");
}
export function rankCandidateRows(usePicker: boolean = rankState.fromPicker): RankRow[] {
    return METRICS_ALL.flatMap((raw) => {
        const plan = findPlanReference(raw.ref);
        if (plan && isRelay(plan))
            return [];
        const listed = resolvePlan(raw);
        const m = listed && usePicker ? pickerMetricInput(listed) : listed;
        if (!m || !metricOfferOk(m))
            return [];
        const key = m.priceM + "|" + m.cur;
        let hit = rankCostCache.get(raw);
        if (!hit || hit.key !== key) {
            hit = { key, c: computeMetrics(m) };
            rankCostCache.set(raw, hit);
        }
        return hasCost(hit.c) ? [{ m, c: hit.c }] : [];
    });
}
function hasCost(c: MetricsResult | null): c is RankRow["c"] { return !!c && c.costPerM != null; }
/* 先按官方额度规则折算的档位排，再排第三方或请求次数估算；低置信估算不会排在可靠数据之前。 */
export function rankRows(vendor: string = rankState.vendor || "all") {
    return rankCandidateRows()
        .filter((r) => vendor === "all" || r.m.vendor === vendor)
        .filter((r) => rankScopeOk(r.m))
        .filter((r) => rankState.tier !== "flagship" || isFlagshipModelName(r.m.model))
        .sort((a, b) => Number(rankIsEstimate(a.m)) - Number(rankIsEstimate(b.m)) || a.c.costPerM - b.c.costPerM);
}
/* 图高有限：两组都有时至少给估算 8 个位置，Claude、ChatGPT 等只有估算的厂商仍能在图上看到。 */
export const RANK_CHART_LIMIT = 20;
export function rankChartRows(all: RankRow[]) {
    const official = all.filter((r) => !rankIsEstimate(r.m));
    const estimates = all.filter((r) => rankIsEstimate(r.m));
    if (!official.length || !estimates.length)
        return all.slice(0, RANK_CHART_LIMIT);
    const estimateSlots = Math.min(estimates.length, Math.max(RANK_CHART_LIMIT - official.length, 8));
    return official.slice(0, RANK_CHART_LIMIT - estimateSlots).concat(estimates.slice(0, estimateSlots));
}
export const RANK_ESTIMATE_DIVIDER = "以下为第三方或请求次数估算（置信低）";
type RankBar = { value: number | null; itemStyle?: Record<string, unknown>; _r?: RankRow };
export function renderRankChart() {
    if (deferChartRender("chartRank", renderRankChart))
        return;
    const all = rankRows();
    const rows = rankChartRows(all);
    describeChart("chartRank", "每百万 tokens 成本排行（" + rankPaymentLabel() + " ÷ 参考月量区间中点，¥，越低越划算）前三：" +
        rows.slice(0, 3).map((r) => planLabel(r.m) + " ¥" + r.c.costPerM.toFixed(3)).join("、") + "。先列依据官方额度规则折算的档位（实色柱），再列第三方或请求次数估算（斜纹柱），不确定区间见提示及完整明细。");
    const el = byId("chartRank")!;
    /* 两组之间插入一行分隔标签，柱值为空。 */
    const firstEstimate = rows.findIndex((r) => rankIsEstimate(r.m));
    const items: (RankRow | null)[] = firstEstimate > 0 ? [...rows.slice(0, firstEstimate), null, ...rows.slice(firstEstimate)] : rows;
    el.style.height = chartHeight(items.length, chartRowHeight(el, 30), 130, 420) + "px";
    const chart = makeChart("chartRank");
    const labels = items.map((r) => r ? (rankIsEstimate(r.m) ? "≈" : "") + metricChartLabel(r.m) : "— " + RANK_ESTIMATE_DIVIDER + " —");
    const data: RankBar[] = items.map((r) => {
        if (!r)
            return { value: null };
        const cp = r.c.costPerM;
        const tier = cpmTier(cp);
        const color = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
        const approx = rankIsEstimate(r.m);
        return { value: cp, itemStyle: { color, borderRadius: [0, 4, 4, 0],
                ...(approx ? { decal: { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4,
                        color: "rgba(255,255,255,.65)", backgroundColor: "transparent" } } : {}) }, _r: r };
    });
    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
            trigger: "item", ...tipStyle(el),
            formatter: (d: { data: RankBar }) => {
                const r = d.data && d.data._r;
                if (!r)
                    return "";
                const prov = provenance(r.m);
                const cp = r.c.costPerM;
                const tier = cpmTier(cp);
                const cpColor = tier === "lo" ? PAL.green : tier === "mid" ? PAL.gold : PAL.red;
                const mo = r.c.moLow == null
                    ? "—"
                    : `约 ${fmtTok(r.c.moLow)}${r.c.moHigh != null && r.c.moHigh > r.c.moLow ? "–" + fmtTok(r.c.moHigh) : ""}`;
                const rate = r.c.rmo == null ? "—" : `${r.c.rmo.toFixed(1)}×`;
                const range = fullUseCostRangeText(r.c);
                return `<b>${esc(planLabel(r.m))}</b>（${esc(displayModelName(r.m.model))}）<br/>
            💵每 M tokens：<b style="color:${cpColor}">¥${cp.toFixed(3)}</b><br/>
            ${range ? esc(range) + "（用尽对应额度）<br/>" : ""}
            ${esc(rankRowPaymentLabel(r.m))}：${fmtCNY(r.c.priceCNY)} ｜ 月倍率：<b>${rate}</b><br/>
            月 tokens：${mo}<br/>
            <span style="color:${PAL.dim}">依据：${esc(prov.text)} · 置信${esc(prov.conf)}${prov.conf !== "高" ? "（tokens 为折算/估算值）" : ""}</span>
            ${r.m.vendorWkLowM != null && r.m.vendorWkHighM != null ? `<br/><span style="color:${PAL.dim}">厂商按自身用量假设另给出 ${weeklyTokenRange(r.m.vendorWkLowM, r.m.vendorWkHighM)}/周，未用于排行</span>` : ""}`;
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
                label: { show: true, position: "right", color: PAL.text, fontSize: 12, formatter: (d: { value: number | null }) => typeof d.value === "number" ? "¥" + d.value.toFixed(3) : "" },
            }],
    }, true);
    chart.resize();
}
