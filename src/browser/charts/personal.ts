import { resolvedField, isRelay, META, PLANS, isPriceConfirmed, isPersonalMonthly, isRetiredPlan, isOnSalePlan } from '../../generated/catalog';
import { personalState, pickerState } from '../../state/app';
import { pickerMonthlyCNY, pickerPaymentQuote, priceLine, pickerFirstPaymentText, matchesPickerPurchase } from '../../state/picker';
import { cnyOf, priceText, priceOf, currencySymbol, fmtCNY, safeHref, esc, trunc, foldSearch, queryHit, planSearchBlob, shortVendor } from '../../domain/core';
import { PAL, RELAY_COLOR, deferChartRender, chartRowHeight, makeChart, CAT_COLOR, tipStyle, axisStyle, chartAxisLabel } from './host';
import { byId, describeChart } from '../dom';
import { chartHeight } from './common';
import { PICKER_BILLING_LABELS } from '../../domain/picker/payment';

/* ---------- 个人订阅价格全景 ---------- */

/** 价格图的人民币月价（已应用选购条件时按所选付款方式）；没有价格时按 0 排在最前。 */
export function personalChartPrice(p: Plan) { return (personalState.fromPicker ? pickerMonthlyCNY(p) : cnyOf(p, personalState.billing)) ?? 0; }

/** 价格图与旁边的文字说明共用的筛选结果：图上画 shown，说明列出 excluded 中价格表、免费入口与询价档的去向。 */
export function personalView(search: string = personalState.q) {
    const state = personalState;
    const query = foldSearch(search) ? search.trim() : "";
    const annual = !state.fromPicker && state.billing === "Y";
    const rows = PLANS.filter((p) => isPriceConfirmed(p) && isPersonalMonthly(p)
        && (!annual || (p.priceY != null && p.priceY > 0))
        && (state.cat === "all" || p.cat === state.cat)
        && (state.region === "all" || p.region === state.region)
        && (!state.fromPicker || matchesPickerPurchase(p))
        && (!query || queryHit(planSearchBlob(p), query)))
        .sort((a, b) => personalChartPrice(a) - personalChartPrice(b));
    /* 无筛选时默认只展示最便宜的前 N 档，避免图表过长；可点「显示全部」展开 */
    const noFilter = !state.fromPicker && state.cat === "all" && state.region === "all" && !query;
    const shown = noFilter && state.limit ? rows.slice(0, state.limit) : rows;
    const excluded = query ? PLANS.filter((p) => !isRetiredPlan(p) && queryHit(planSearchBlob(p), query)
        && (!isPersonalMonthly(p) || !isPriceConfirmed(p) || (annual && !(p.priceY != null && p.priceY > 0)))) : [];
    const inTable = excluded.filter(isOnSalePlan);
    const free = excluded.filter((p) => p.priceM === 0);
    const quote = excluded.filter((p) => !inTable.includes(p) && !free.includes(p));
    return { rows, shown, annual, noFilter, excluded, inTable, free, quote };
}

/* 个人价格图的搜索防抖由组件登记：历史恢复时取消待执行的搜索并判断是否仍有未生效的输入。 */
export const personalViewHooks: { cancelSearch?: () => void; hasPendingSearch?: () => boolean } = {};

export function cancelPersonalSearch() { personalViewHooks.cancelSearch?.(); }

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
export type PlanBar = { value: number; itemStyle: Record<string, unknown>; _p: Plan };

export function renderPersonalChart() {
    if (deferChartRender("chartPersonal", renderPersonalChart))
        return;
    /* 图中的档位都有所选口径的价格；缺价时按 0 处理，与原先的数值运算一致。 */
    const price = personalChartPrice;
    const { shown } = personalView();
    const el = byId("chartPersonal")!;
    /* 初始化/缩放时需要真实容器宽度，空态在完成配置后再隐藏 canvas。 */
    el.hidden = false;
    el.style.height = chartHeight(shown.length, chartRowHeight(el, 30), 130, 420) + "px";
    const chart = makeChart("chartPersonal");
    /* 地区写在括号里，标签只用「 · 」分隔厂商与套餐；超宽时轴标签先截厂商名，保留套餐名。 */
    const labels = shown.map((p) => (isRelay(p) ? "中转 · " : "") + shortVendor(p.vendor) + " · " + p.plan + (p.region === "cn" ? "（国内）" : ""));
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
