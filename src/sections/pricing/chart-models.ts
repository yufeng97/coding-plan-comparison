import { isOneTimePlan, isRenewalOnly, isFourWeekPlan, isPersonalMonthly, isPriceConfirmed } from '@generated/catalog';
import { planTitle } from "@domain/core";
import { rankChartRows, rankIsEstimate, rankVendorLabel } from "@domain/rank";
import { rankState } from "@state/app";
import { rankCandidateRows, rankPaymentLabel, rankRows } from "@state/rank";
import { weeklyTokenRows } from "@browser/charts/tokens";

/* 图表与无障碍文字视图共用 browser/charts 里的同一份数据（personalView、weeklyTokenRows、apiPriceRows），这里只补文字说明与排序。 */

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
  return plans.slice(0, 6).map((p) => `${planTitle(p)}（${reason(p)}）`).join("、")
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
    ? "口径：只统计按官方额度规则折算的档位（积分系数、credits 面值 ÷ 牌价混合价或官方区间，按 80/20 与 95% 缓存假设，置信中）。第三方估算、请求次数折算与模拟对照不在此列。"
    : "口径：在官方口径折算之外，再纳入估算档位（≈标记，置信低：第三方毛利反推、请求次数按 20K tokens/次折算、未经确认的整池或跨模型模拟对照），仅供量级参考。";
  const total = rankRows("all").length;
  const count = state.vendor !== "all" ? `当前口径全厂商共 ${total} 档，${rankVendorLabel(state.vendor)} ${all.length} 档` : `共 ${all.length} 档`;
  const mixed = rows.findIndex((r: ReturnType<typeof rankRows>[number]) => rankIsEstimate(r.m)) > 0 ? "先列官方口径折算，再列估算；估算组单独排序，不与上方直接比较名次。" : "";
  return `${count}${all.length > rows.length ? `，图中显示 ${rows.length} 档` : ""}。可按厂商查看 Claude、ChatGPT、Kimi 等套餐。${tier}${scope}${excluded}${mixed}实色柱：依据官方额度规则折算；斜纹柱：第三方、请求次数估算或模拟对照。绿色 ≤¥0.30 · 黄色 ≤¥1 · 红色 >¥1。`;
}

/** 每周 tokens 旁的性价比列表：与图表同一份数据，按每 ¥100/月 可得的每周 tokens 排序。 */
export function weeklyRows() {
  return weeklyTokenRows().sort((a, b) => (b.priceCNY > 0 ? b.midM / b.priceCNY : -1) - (a.priceCNY > 0 ? a.midM / a.priceCNY : -1));
}
