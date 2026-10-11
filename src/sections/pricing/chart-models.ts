import { isRetiredPlan, isOneTimePlan, isRenewalOnly, isFourWeekPlan, isPersonalMonthly, isOnSalePlan, findPlanReference, PLANS, API_PRICES, PLAN_TOKENS, isPriceConfirmed } from '@generated/catalog';
import { displayModelName, foldSearch, METRICS_ALL, planLabel, planSearchBlob, queryHit, RATE, resolvePlan, shortVendor } from "@domain/core";
import { computeMetrics, toCNY } from "@domain/metrics";
import { provenance } from "@domain/provenance";
import { rankChartRows, rankIsEstimate, rankVendorLabel } from "@domain/rank";
import { personalState, rankState } from "@state/app";
import { matchesPickerPurchase } from "@state/picker";
import { rankCandidateRows, rankPaymentLabel, rankRows } from "@state/rank";
import { personalChartPrice } from "@browser/charts/personal";
import { metricChartLabel } from "@browser/charts/tokens";

/** Chart data and the accessible text/table views share the same purchase filters. */
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
  const noFilter = !state.fromPicker && state.cat === "all" && state.region === "all" && !query;
  const shown = noFilter && state.limit ? rows.slice(0, state.limit) : rows;
  const excluded = query ? PLANS.filter((p) => !isRetiredPlan(p) && queryHit(planSearchBlob(p), query)
    && (!isPersonalMonthly(p) || !isPriceConfirmed(p) || (annual && !(p.priceY != null && p.priceY > 0)))) : [];
  const inTable = excluded.filter(isOnSalePlan);
  const free = excluded.filter((p) => p.priceM === 0);
  const quote = excluded.filter((p) => !inTable.includes(p) && !free.includes(p));
  return { rows, shown, annual, noFilter, excluded, inTable, free, quote };
}

export function excludedList(plans: Plan[], annual: boolean) {
  function reason(p: Plan) {
    if (!isPriceConfirmed(p)) return "价格待核实";
    if (annual && !(p.priceY != null && p.priceY > 0) && isPersonalMonthly(p)) return "未列公开年付价";
    if (p.cat === "team" || p.seat) return "团队/企业档";
    if (isRenewalOnly(p)) return "仅老用户续费";
    if (isOneTimePlan(p)) return "一次性预付";
    if (isFourWeekPlan(p)) return "每4周计费";
    if (p.priceM === 0) return "免费档";
    return "按量或定制";
  }
  return plans.slice(0, 6).map((p) => `${shortVendor(p.vendor)} ${p.plan}（${reason(p)}）`).join("、")
    + (plans.length > 6 ? ` 等 ${plans.length} 档` : "");
}

export function rankVendors() {
  const priority = ["Anthropic", "OpenAI", "月之暗面 Kimi"];
  return [...new Set(rankCandidateRows(false).map((r) => r.m.vendor))].sort((a, b) => {
    const ai = priority.indexOf(a), bi = priority.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || rankVendorLabel(a).localeCompare(rankVendorLabel(b), "zh-CN");
  });
}

export function rankNote() {
  const state = rankState, all = rankRows(), rows = rankChartRows(all);
  const tier = "支付口径：" + rankPaymentLabel() + "；成本以参考月量区间中点计算，推荐卡按区间下限保守比较，两者都不保证实际额度。"
    + (state.tier === "flagship" ? "当前只看旗舰模型。" : "当前含轻量模型，Flash、Haiku 会因为 token 便宜靠前。");
  const excluded = "价格待核实、已停售、已下架、一次性预付、仅老用户续费和中转站不在此列。";
  const scope = state.scope === "credits"
    ? "口径：只统计按官方额度规则折算的档位（积分系数、credits 面值 ÷ 牌价混合价或官方区间，按 80/20 与 95% 缓存假设，置信中）。第三方估算与请求次数折算不在此列。"
    : "口径：在官方口径折算之外，再纳入估算档位（≈标记，置信低：第三方毛利反推、请求次数按 20K tokens/次折算等），仅供量级参考。";
  const total = rankRows("all").length;
  const count = state.vendor !== "all" ? `当前口径全厂商共 ${total} 档，${rankVendorLabel(state.vendor)} ${all.length} 档` : `共 ${all.length} 档`;
  const mixed = rows.findIndex((r: ReturnType<typeof rankRows>[number]) => rankIsEstimate(r.m)) > 0 ? "先列官方口径折算，再列估算；估算组单独排序，不与上方直接比较名次。" : "";
  return `${count}${all.length > rows.length ? `，图中显示 ${rows.length} 档` : ""}。可按厂商查看 Claude、ChatGPT、Kimi 等套餐。${tier}${scope}${excluded}${mixed}实色柱：依据官方额度规则折算；斜纹柱：第三方或请求次数估算。绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。`;
}

export function apiRows() {
  return API_PRICES.map((api) => ({ ...api,
    input: api.cur === "CNY" ? Number(api.inCNY) / RATE : Number(api.inUSD),
    output: api.cur === "CNY" ? Number(api.outCNY) / RATE : Number(api.outUSD),
  })).filter((a) => Number.isFinite(a.input) && Number.isFinite(a.output)).sort((a, b) => a.output - b.output);
}

export function weeklyRows() {
  const official = PLAN_TOKENS.flatMap((t) => {
    const plan = findPlanReference(t.ref);
    return plan && isPriceConfirmed(plan) && !isRetiredPlan(plan)
      ? [{ label: planLabel(plan) + " · " + displayModelName(t.model), lowM: t.lowM, highM: t.highM,
        priceCNY: toCNY(plan.priceM ?? 0, plan.cur), isOfficial: true, conf: "中" }] : [];
  });
  const covered = new Set(PLAN_TOKENS.map((t) => findPlanReference(t.ref)?.id).filter(Boolean));
  const extra = METRICS_ALL.filter((metric) => {
    const plan = metric.ref != null ? findPlanReference(metric.ref) : null;
    return (!plan || (isPriceConfirmed(plan) && !isRetiredPlan(plan)))
      && (metric.wkLowM != null || metric.reqLowPer5h != null)
      && !metric.note?.includes("系数折算") && metric.weeklyChart !== false && (!plan || !covered.has(plan.id));
  }).flatMap((metric) => {
    const current = resolvePlan(metric) || metric, result = computeMetrics(current);
    if (!result || result.wkLowM == null || result.wkHighM == null) return [];
    const metricProvenance = provenance(metric);
    return [{ label: metricChartLabel(metric), lowM: result.wkLowM, highM: result.wkHighM,
      priceCNY: toCNY(current.priceM ?? 0, current.cur), isOfficial: !metric.isEst && metricProvenance.conf === "高", conf: metric.confidence || metricProvenance.conf }];
  });
  return [...official, ...extra].map((row) => ({ ...row, midM: (row.lowM + row.highM) / 2 }))
    .sort((a, b) => (b.priceCNY > 0 ? b.midM / b.priceCNY : -1) - (a.priceCNY > 0 ? a.midM / a.priceCNY : -1));
}
