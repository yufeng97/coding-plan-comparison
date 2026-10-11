import { API_PRICES, isPriceConfirmed } from '../../generated/catalog';
import { shortVendor, displayModelName, RATE, safeHref, esc, trunc } from '../../domain/core';
import { deferChartRender, makeChart, chartRowHeight, tipStyle, PAL, axisStyle, chartAxisLabel } from './host';
import { byId, describeChart } from '../dom';
import { chartHeight, chartLogAxis, bindChartLegend } from './common';

/* ---------- API 按量价格与 $10 购买力 ---------- */

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
