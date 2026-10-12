import { type RankRow, rankChartRows, rankIsEstimate, RANK_ESTIMATE_DIVIDER } from '../../domain/rank';
import { deferChartRender, chartRowHeight, makeChart, PAL, tipStyle, axisStyle, chartAxisLabel } from './host';
import { rankRows, rankPaymentLabel, rankRowPaymentLabel } from '../../state/rank';
import { describeChart, byId } from '../dom';
import { planLabel, cpmTier, esc, displayModelName, fmtCNY } from '../../domain/core';
import { chartHeight } from './common';
import { metricChartLabel, weeklyTokenRange } from './tokens';
import { provenance } from '../../domain/provenance';
import { fmtTok } from '../../domain/metrics';
import { fullUseCostRangeText } from '../../domain/picker/text';

/* ---------- 性价比排行图（每 M tokens 成本） ---------- */

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
