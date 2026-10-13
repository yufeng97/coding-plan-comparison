import { API_PRICES, isPriceConfirmed } from '../../generated/catalog';
import { shortVendor, displayModelName, RATE, safeHref, esc, trunc } from '../../domain/core';
import { deferChartRender, makeChart, chartRowHeight, tipStyle, PAL, axisStyle, chartAxisLabel } from './host';
import { byId, describeChart } from '../dom';
import { chartHeight, chartLogAxis, bindChartLegend } from './common';

/* ---------- API 按量价格与 $10 购买力 ---------- */

/* 系列名与图例颜色：Vue 图例直接用 CSS 变量，画布在 refreshPalette 后读取同一组 --chart-* 颜色。 */
export const API_INPUT_SERIES = "输入 / 1M tokens";
export const API_OUTPUT_SERIES = "输出 / 1M tokens";
export const POWER_INTL_SERIES = "国际模型";
export const POWER_CN_SERIES = "国内模型";
export const API_LEGEND = [{ name: API_INPUT_SERIES, color: "var(--chart-input)" }, { name: API_OUTPUT_SERIES, color: "var(--chart-output)" }];
export const POWER_LEGEND = [{ name: POWER_INTL_SERIES, color: "var(--chart-intl)" }, { name: POWER_CN_SERIES, color: "var(--chart-cn)" }];

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

/** API 图与明细表的一行：单价统一折成美元。 */
export type ApiChartRow = ApiPrice & { inUSD: number; outUSD: number };

/** 明细表与图表共用的单价行：人民币条目按页面汇率折美元，缺价（NaN）的条目不列，按输出价升序。
 *  明细表保留待核实的条目（来源栏标明状态），图表只画已核实的。 */
export function apiPriceRows(): ApiChartRow[] {
    return API_PRICES.map((a) => ({ ...a,
        inUSD: a.cur === "CNY" ? (a.inCNY ?? NaN) / RATE : Number(a.inUSD),
        outUSD: a.cur === "CNY" ? (a.outCNY ?? NaN) / RATE : Number(a.outUSD),
    })).filter((a) => Number.isFinite(a.inUSD) && Number.isFinite(a.outUSD)).sort((x, y) => x.outUSD - y.outUSD);
}

type PowerItem = { value: number; a: ApiChartRow } | null;

export function renderApiChart() {
    if (deferChartRender("chartApi", renderApiChart))
        return;
    const apiEl = byId("chartApi")!;
    const chart = makeChart("chartApi");
    const rows = apiPriceRows().filter((a) => isPriceConfirmed(a, "api"));
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
        legend: { data: [API_INPUT_SERIES, API_OUTPUT_SERIES], show: false },
        xAxis: chartLogAxis(rows.flatMap((a) => [a.inUSD, a.outUSD]), "USD / 百万 tokens"),
        yAxis: {
            type: "category", data: cats, inverse: true, ...axisStyle(),
            axisLabel: chartAxisLabel(apiEl, 11),
        },
        series: [
            { name: API_INPUT_SERIES, type: "bar", data: rows.map((a) => a.inUSD), barWidth: 7, itemStyle: { color: PAL.chartInput, borderRadius: [0, 3, 3, 0] } },
            { name: API_OUTPUT_SERIES, type: "bar", data: rows.map((a) => a.outUSD), barWidth: 7, itemStyle: { color: PAL.chartOutput, borderRadius: [0, 3, 3, 0] } },
        ],
    }, true);
    chart.resize();
    bindChartLegend(chart, "apiLegend", [API_INPUT_SERIES, API_OUTPUT_SERIES]);
    /* 购买力：$10 按输出价可购 token 量。按地区拆双系列（barGap -100% 重叠），
       图例可点击过滤国际/国内；axis 触发 + 阴影指示器与左图一致。 */
    const chart2 = makeChart("chartPower");
    const el2 = byId("chartPower")!;
    el2.style.height = chartHeight(rows.length, chartRowHeight(el2, 26), 120, 420) + "px";
    const power = rows.filter((a) => a.outUSD > 0).map((a) => ({ name: apiChartLabel(a), m: 10 / a.outUSD, a }));
    power.sort((x, y) => y.m - x.m);
    const POWER_COLORS = { intl: PAL.chartIntl, cn: PAL.chartCn };
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
        legend: { data: [POWER_INTL_SERIES, POWER_CN_SERIES], show: false },
        grid: { left: 12, right: 56, top: 36, bottom: 44, containLabel: true },
        xAxis: chartLogAxis(power.map((p) => p.m), "百万输出 tokens"),
        yAxis: { type: "category", inverse: true, data: power.map((p) => p.name), ...axisStyle(), axisLabel: chartAxisLabel(el2, 11) },
        series: [
            { name: POWER_INTL_SERIES, type: "bar", barWidth: 12, barGap: "-100%",
                data: powerSeriesData.map((d) => d[0]),
                itemStyle: { color: POWER_COLORS.intl, borderRadius: [0, 4, 4, 0] },
                label: powerLabel },
            { name: POWER_CN_SERIES, type: "bar", barWidth: 12, barGap: "-100%",
                data: powerSeriesData.map((d) => d[1]),
                itemStyle: { color: POWER_COLORS.cn, borderRadius: [0, 4, 4, 0] },
                label: powerLabel },
        ],
    }, true);
    chart2.resize();
    bindChartLegend(chart2, "powerLegend", [POWER_INTL_SERIES, POWER_CN_SERIES]);
    describeChart("chartApi", "API 按量单价对比 " + rows.length + " 款模型（左图）；$10 预算输出 token 购买力 " + power.length + " 行（右图）。两图采用对数刻度，相邻主刻度为十倍，完整价格见提示和下方明细。");
    describeChart("chartPower", "$10 预算输出 token 购买力 " + power.length + " 行；采用对数刻度，相邻主刻度为十倍。使用图例按钮筛选国内或国际模型，完整数值见下方明细。");
}
