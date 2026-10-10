import * as app from "@domain/runtime";

export function costQuotaParagraphs(api: typeof app.API_PRICES[number], monthlyM: number) {
  const main = app.chooseMain(app.eligibleProfiles());
  if (!main) return [];
  const taskRole = app.pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
  const confidence: Record<string, number> = { "高": 3, "中": 2, "低": 1 };
  const specific = app.METRICS_ALL.filter((metric) => app.metricMatchesPlan(metric, main.p)
    && app.costModelKey(metric.model) === app.costModelKey(api.model))
    .flatMap((metric) => {
      const result = app.computeMetrics(metric);
      return result ? [{ m: metric, c: result, conf: app.provenance(metric).conf }] : [];
    }).sort((a, b) => confidence[b.conf] - confidence[a.conf])[0];
  const metric = specific || app.metricForRole(main.p, taskRole), paragraphs: string[] = [];
  if (metric && metric.c.moLow != null) {
    const result = metric.c;
    const low = metric.c.moLow, high = metric.c.moHigh ?? low;
    const usesRequest = app.quotaUsesRequestTokenAssumption(metric.m);
    const baseline = Number(app.calcState.input) === 80 && Number(app.calcState.cache) === 95
      && (!usesRequest || Number(app.calcState.tokens) === app.TOKENS_PER_REQ);
    const condition = specific && baseline ? "按相同基准，你的总量"
      + (monthlyM <= low ? "低于参考区间下限" : monthlyM > high ? "高于参考区间上限" : "落在参考区间内") + "；这不能保证实际额度够用。" : "";
    const context = !specific ? "所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用。"
      : !baseline ? "你修改了折算假设，参考月量不能直接用于判断是否够用。" : "";
    paragraphs.push(`当前推荐 ${app.planTitle(main.p)} · ${app.displayModelName(metric.m.model)}：参考月量 ${app.tokSpan(result, "moLow", "moHigh")}（置信${metric.conf}；表内基准：80% 输入、95% 输入缓存${usesRequest ? "、请求折算 20K tokens/次" : ""}）。${condition}${context}跨模型 token 不代表等效产出；仍需核对窗口、共享池与工具费用。`);
  } else paragraphs.push(`当前推荐 ${app.planTitle(main.p)} 未公开可对照的月 tokens，无法据此保证额度够用。`);
  const quote = app.pickerPaymentQuote(main.p);
  if (quote.available && Number.isFinite(quote.monthlyCNY)) paragraphs.push(`订阅价格参照：${quote.label || "当前支付方式"}月均 ${app.fmtCalcCNY(quote.monthlyCNY)}。API 账单与订阅分别计费，年付还需核对全年一次支付金额。`);
  return paragraphs;
}
