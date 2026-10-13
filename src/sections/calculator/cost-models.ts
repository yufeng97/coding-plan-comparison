import { API_PRICES } from '@generated/catalog';
import { displayModelName, METRICS_ALL, planTitle } from "@domain/core";
import { computeMetrics, TOKENS_PER_REQ } from "@domain/metrics";
import { metricForRole, metricMatchesPlan } from "@domain/picker/profile";
import { tokSpan } from "@domain/picker/text";
import { provenance } from "@domain/provenance";
import { costModelKey, fmtCalcCNY, quotaUsesRequestTokenAssumption } from "@domain/workload";
import { calcState, pickerState } from "@state/app";
import { currentPickerSelection, pickerPaymentQuote } from "@state/picker";

/** Browser control ids for the workload calculator. Calculation rules only use field names. */
export const COST_CONTROLS = {
    model: 'costModel', requests: 'costRequests', tokens: 'costTokens', days: 'costDays',
    input: 'costInput', cache: 'costCache', cachePrice: 'costCachePrice', budget: 'costBudget',
} as const;

export function costQuotaParagraphs(api: typeof API_PRICES[number], monthlyM: number) {
  const main = currentPickerSelection().main;
  if (!main) return [];
  const taskRole = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
  const confidence: Record<string, number> = { "高": 3, "中": 2, "低": 1 };
  const specific = METRICS_ALL.filter((metric) => metricMatchesPlan(metric, main.p)
    && costModelKey(metric.model) === costModelKey(api.model))
    .flatMap((metric) => {
      const result = computeMetrics(metric);
      return result ? [{ m: metric, c: result, conf: provenance(metric).conf }] : [];
    }).sort((a, b) => confidence[b.conf] - confidence[a.conf])[0];
  const metric = specific || metricForRole(main.p, taskRole), paragraphs: string[] = [];
  if (metric && metric.c.moLow != null) {
    const result = metric.c;
    const low = metric.c.moLow, high = metric.c.moHigh ?? low;
    const usesRequest = quotaUsesRequestTokenAssumption(metric.m);
    const baseline = Number(calcState.input) === 80 && Number(calcState.cache) === 95
      && (!usesRequest || Number(calcState.tokens) === TOKENS_PER_REQ);
    const condition = specific && baseline ? "按相同基准，你的总量"
      + (monthlyM <= low ? "低于参考区间下限" : monthlyM > high ? "高于参考区间上限" : "落在参考区间内") + "；这不能保证实际额度够用。" : "";
    const context = !specific ? "所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用。"
      : !baseline ? "你修改了折算假设，参考月量不能直接用于判断是否够用。" : "";
    paragraphs.push(`当前推荐 ${planTitle(main.p)} · ${displayModelName(metric.m.model)}：参考月量 ${tokSpan(result, "moLow", "moHigh")}（置信${metric.conf}；表内基准：80% 输入、95% 输入缓存${usesRequest ? "、请求折算 20K tokens/次" : ""}）。${condition}${context}跨模型 token 不代表等效产出；仍需核对窗口、共享池与工具费用。`);
  } else paragraphs.push(`当前推荐 ${planTitle(main.p)} 未公开可对照的月 tokens，无法据此保证额度够用。`);
  const quote = pickerPaymentQuote(main.p);
  if (quote.available && Number.isFinite(quote.monthlyCNY)) paragraphs.push(`订阅价格参照：${quote.label || "当前支付方式"}月均 ${fmtCalcCNY(quote.monthlyCNY)}。API 账单与订阅分别计费，年付还需核对全年一次支付金额。`);
  return paragraphs;
}
