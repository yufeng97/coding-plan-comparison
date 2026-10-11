import { PLANS, isPriceConfirmed, isRetiredPlan, resolvedField } from '../../generated/catalog';
import { deferChartRender, chartRowHeight, makeChart, CAT_COLOR, PAL, tipStyle, axisStyle, chartAxisLabel } from './host';
import { cnyOf, safeHref, esc, priceText, fmtCNY, trunc, planLabel } from '../../domain/core';
import { byId, describeChart } from '../dom';
import { chartHeight, chartLogAxis } from './common';
import type { PlanBar } from './personal';

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
