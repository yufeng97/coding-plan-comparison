import type { EChartsType } from 'echarts/core';
import { PAL, axisStyle } from './host';
import { chartLegendSelections } from '../../state/charts';

/* 各图表共用的尺寸、对数轴与 DOM 图例；画布由 ECharts 绘制，图例与说明由 Vue 渲染。 */

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

/* DOM 图例可用键盘操作；同一名称的区间基柱和上限段一起切换。 */
export function bindChartLegend(chart: EChartsType, id: string, names: readonly string[]) {
    const selections = chartLegendSelections[id] || (chartLegendSelections[id] = {});
    for (const name of names) {
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
