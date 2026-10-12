import { PLAN_TOKENS, findPlanReference, isPriceConfirmed, isRetiredPlan } from '../../generated/catalog';
import { type MetricRow, resolvePlan, planLabel, displayModelName, METRICS_ALL, esc, fmtCNY, trunc, safeHref } from '../../domain/core';
import { deferChartRender, makeChart, chartRowHeight, PAL, tipStyle, axisStyle, chartAxisLabel, withAlpha } from './host';
import { byId, describeChart } from '../dom';
import { toCNY, computeMetrics } from '../../domain/metrics';
import { provenance } from '../../domain/provenance';
import { chartHeight, chartLogAxis, bindChartLegend } from './common';

/* ---------- 每周可用 tokens 对比（官方公布 + 社区推算，厂商中立） ---------- */

export function weeklyTokenRange(low: number, high: number) {
    const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("zh-CN");
    return fmt(low) + (low === high ? "" : "–" + fmt(high)) + "M";
}

/* 套餐身份和名称取自主表，额度行只追加模型名称；不再为图表单独缩写套餐名。 */
export function metricChartLabel(m: MetricRow) {
    const p = resolvePlan(m) || m;
    return planLabel(p) + " · " + displayModelName(m.model);
}

export const TOKEN_OFFICIAL_SERIES = "官方额度折算";

export const TOKEN_EST_SERIES = "折算 / 社区推算";

/* Vue 图例与画布同源：图例用 CSS 变量，画布在 refreshPalette 后读取同一组 --chart-* 颜色（与说明文字的绿色、金色一致）。 */
export const TOKEN_LEGEND = [{ name: TOKEN_OFFICIAL_SERIES, color: "var(--chart-official)" }, { name: TOKEN_EST_SERIES, color: "var(--chart-estimate)" }];

/** 每周 tokens 图的一行：官方公布档或带每周口径的额度行。 */
export interface TokenChartSource { label: string; model: string; lowM: number; highM: number; priceCNY: number; isOfficial: boolean; url: string; note?: string; method?: string; conf?: string; vendorLowM?: number; vendorHighM?: number; }

export type TokenRow = TokenChartSource & { midM: number };

type TokenBar = { value: number; _r: TokenRow } | null;

/* 已在 PLAN_TOKENS 里的档不重复。智谱国内 V3 与 Z.ai 每周额度相同，也不再画一遍。
   PLAN_TOKENS 是公布每周额度上限的档位，按官方积分系数与统一假设折算；小米 / 腾讯是月度积分池，
   摊到周并非真实周额度，不进本图。其余带每周 tokens 的行按出处着色：
   高置信且非估算视为官方额度，新厂商不会被默认涂成低置信社区估算。
   官方条数区间按结构化公式折算，其余请求数制只在额度深度对比表里呈现。
   图表与旁边的性价比列表共用这份结果，只是排序不同。 */
export function weeklyTokenRows(): TokenRow[] {
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
    return [...official, ...weeklyExtra].map((r) => ({ ...r, midM: (r.lowM + r.highM) / 2 }));
}

export function renderTokensChart() {
    if (deferChartRender("chartTokens", renderTokensChart))
        return;
    const chart = makeChart("chartTokens");
    const el = byId("chartTokens")!;
    const all = weeklyTokenRows();
    const officialBars = all.filter((r) => r.isOfficial);
    const community = all.filter((r) => !r.isOfficial);
    const rows: TokenRow[] = [...officialBars, ...community].sort((a, b) => b.midM - a.midM);
    el.style.height = chartHeight(rows.length, chartRowHeight(el, 30), 150, 420) + "px";
    const cats = rows.map((r) => r.label);
    /* 对数轴不堆叠 high-low（差值不能当作单独的 log 值）。先画到上限的淡色柱，
       再叠到下限的实色柱；每段直接使用真实端点，定额的 high=low 也能显示标签。 */
    const series = [true, false].flatMap((isOfficial) => {
        const name = isOfficial ? TOKEN_OFFICIAL_SERIES : TOKEN_EST_SERIES;
        const color = isOfficial ? PAL.chartOfficial : PAL.chartEstimate;
        const data = (upper: boolean): TokenBar[] => rows.map((r) => r.isOfficial === isOfficial && (upper ? r.highM : r.lowM) > 0
            ? { value: upper ? r.highM : r.lowM, _r: r } : null);
        return [
            { name, type: "bar", barWidth: 14, barGap: "-100%", data: data(true),
                /* 区间上限段：淡色填充加同色描边，描边与背景保持 3:1，浅色主题下也看得清边界。 */
                itemStyle: { color: withAlpha(color, 0.25), borderColor: color, borderWidth: 1, borderRadius: [0, 4, 4, 0] },
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
    bindChartLegend(chart, "tokensLegend", [TOKEN_OFFICIAL_SERIES, TOKEN_EST_SERIES]);
    describeChart("chartTokens", "每周可用 tokens 对比 " + rows.length + " 行：官方额度折算 " + officialBars.length + " 行、折算或社区推算 " + community.length + " 行。采用对数刻度，相邻主刻度为十倍，淡色段表示区间上限，数值见柱尾和提示。");
}
