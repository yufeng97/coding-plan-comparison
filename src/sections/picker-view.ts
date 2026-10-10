/* Recommendation view models contain text and data only. Vue owns the card DOM. */
import * as L from "@domain/runtime";

export type PickerRole = ReturnType<typeof L.matchModelRoles>[number];
export type PickerProfile = {
  p: Plan; included: PickerRole[]; metered: PickerRole[]; headline: PickerRole | null;
  ceilings: PickerRole[]; loose: PickerRole[]; shared: boolean; windowPeriod: string;
  sharing: string; internalDaily: PickerRole[];
};
export type PickerLine = { label: string; text: string };
export type PickerNotice = { kind: "miss" | "avoid"; text: string; action?: { key: keyof typeof L.pickerState; value: string; text: string } };
export type PickerCardModel = {
  accent: string; title: string; plan: Plan; reasons: string[]; lines: PickerLine[];
  role?: PickerRole; tiers?: PickerProfile; reference?: boolean; ignoreRegion?: boolean; notices: PickerNotice[];
};
const state = L.pickerState;
const accent = ["#34d399", "#f59e0b", "#6366f1", "#f472b6"];
const ownVendors: Record<string, string> = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
const tools: Record<string, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };
const ownNotes: Record<string, string> = {
  Cursor: "Cursor 各档的模型池和额外按量费用不同；请对照具体套餐的总费用、支持工具和额度规则。",
  Anthropic: "Claude 官方订阅用的是 Claude Code 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
  OpenAI: "ChatGPT 官方订阅用 Codex 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
};
const line = (label: string, text: string): PickerLine => ({ label, text });
const names = (p: Plan, roles: PickerRole[]) => roles.map((role) => L.roleDisplayName(p, role)).join("、");
function card(index: number, title: string, plan: Plan, reasons: string[], lines: PickerLine[]): PickerCardModel {
  return { accent: accent[index]!, title, plan, reasons, lines, notices: [] };
}
export function internationalNotice(p: Plan): PickerNotice {
  const access = L.mainlandAccessOf(p);
  const lead = access ? (access.status === "unsupported" ? "官方支持地区不含中国大陆；" : "在中国大陆部分模型不可用；") : "";
  return { kind: "avoid", text: lead + "需要外币或国际账号支付。" };
}
function mainCard(main: PickerProfile, pool: PickerProfile[]) {
  const p = main.p;
  const daily = state.task === "daily" && main.loose.length > 0;
  const role = daily || !main.headline ? main.loose[0] : main.headline;
  const compatible = ownVendors[state.tool] && p.vendor !== ownVendors[state.tool];
  const reasons = [role ? `${compatible ? `${tools[state.tool]} 兼容接入 · ` : ""}${L.roleDisplayName(p, role)} 适合${daily || !main.headline ? "日常编码" : "复杂编码任务"}` : "附赠编程推理额度"];
  const evidence = L.tokenEvidence(p, role);
  reasons.push(evidence ? `按官方额度规则折算，保守参考下限约 ${L.fmtTok(evidence.tokens)} tokens/月（统一假设，置信${evidence.conf}）`
    : L.priceDecidedMain(main, pool) ? "同档候选的额度都无法折算，按月费较低选出；可展开其他候选对照模型与评测" : "可用 token 总量未公开，购买前核对额度规则");
  if (daily && main.headline) reasons.push(`同档已包含 ${L.roleDisplayName(p, main.headline)}，可用于复杂任务`);
  else if (!daily && main.headline && main.loose.length) reasons.push(`日常已包含 ${names(p, main.loose)}；${main.shared || main.sharing === "shared" ? "共用额度池" : main.sharing === "separate" ? "模型额度分池" : "共享关系未公开"}`);
  else if (state.task === "both" && !main.headline) reasons.push("当前条件仅匹配日常模型，复杂任务需另找方案");
  else if (state.task === "both" && !main.loose.length) reasons.push("本档未匹配日常模型，日常入口需单独确认");
  else reasons.push("满足当前预算、地区与工具条件");
  const lines = [line("选取理由", L.pickerChoiceReason(main))];
  const relationship = L.pickerToolRelationship(p);
  if (relationship) lines.push(line("工具与模型", relationship));
  if (daily) {
    lines.push(line("日常", `${names(p, main.loose)}。${L.roleUseText(main.loose[0])}。`), line(L.quotaLabel(p), L.windowSentence(p, main.loose[0])));
    if (main.headline) lines.push(line("同档还有", `${L.roleDisplayName(p, main.headline)}。${L.windowNoteShort(main)}`));
  } else if (main.headline) {
    const ceiling = main.ceilings.find((r) => r.id !== main.headline!.id);
    let hard = `${L.roleDisplayName(p, main.headline)}。${L.roleUseText(main.headline)}。`;
    if (ceiling) hard += `${L.roleDisplayName(p, ceiling)} 也能开，${L.roleUseText(ceiling)}。`;
    lines.push(line("复杂任务", hard), line(L.quotaLabel(p), L.windowSentence(p, main.headline)));
  } else lines.push(line("日常", `${names(p, main.loose)}。${L.roleUseText(main.loose[0])}。`), line(L.quotaLabel(p), L.windowSentence(p, main.loose[0])));
  const meter = L.meteredText(main);
  if (meter) lines.push(line("另一池", meter));
  else if (!daily && !main.headline) lines.push(line("复杂任务", "这组条件里没有能单独拿来做复杂任务的模型，这档先覆盖日常。"));
  const peer = !daily && main.headline ? L.peerNote(main, pool) : "";
  if (peer) lines.push(line("同预算", peer));
  const cheaper = L.cheaperTiers(main);
  if (cheaper.length) lines.push(line("省钱档", `同一模型系列还有更便宜的 ${cheaper.slice(0, 2).map((x) => `${x.p.plan}（${L.priceLine(x.p)}）`).join("、")}，具体版本与额度差请核对官网。`));
  const result = card(0, daily || !main.headline ? "主计划 · 日常" : "主计划 · 复杂任务", p, reasons, lines);
  result.role = role;
  result.tiers = main;
  if (p.region === "intl" && state.region !== "cn") result.notices.push(internationalNotice(p));
  return result;
}
function dailyCard(main: PickerProfile, pool: PickerProfile[]) {
  if (state.task !== "both" || main.internalDaily.length || (main.loose.length && !main.shared)) return null;
  const supplement = L.pickSupplement(main, pool);
  if (!supplement.chosen) return null;
  const p = supplement.chosen.p;
  const roles = supplement.chosen.internalDaily.length ? supplement.chosen.internalDaily : supplement.chosen.loose;
  const total = L.pickerMonthlyCNY(main.p) + L.pickerMonthlyCNY(p);
  const lines: PickerLine[] = [];
  if (main.headline) lines.push(line("主计划额度", L.sameWindowText(main)));
  if (main.loose.length) lines.push(line("不用另买", "主计划已包含日常模型；仅在需要另一份额度时考虑这个可选入口。"));
  lines.push(line("两档合计月费", `约 ${L.fmtCNY(total)}（按页面汇率折算）`));
  return card(1, "可选日常补充", p, [`日常可用 ${names(p, roles)}`, L.isFreeCodingEntry(p) ? "独立免费入口，无需额外月费" : "可选的另一份订阅，用量不占主计划额度", `两档合计约 ${L.fmtCNY(total)}/月，在当前预算内`], lines);
}
function upgradeCard(main: PickerProfile) {
  const next = L.nextTier(main) as PickerProfile | null;
  if (!next) return null;
  const cap = L.upgradeBudgetCeiling();
  const over = state.budget !== "any" && L.pickerMonthlyCNY(next.p) > Number(state.budget) + L.BUDGET_EPS;
  const role = state.task === "daily" || !main.headline ? next.loose[0] : next.headline;
  return card(2, "同厂商升级参考", next.p, [over ? `高于当前预算${Number.isFinite(cap) ? `，在下一档 ≤${L.fmtCNY(cap)} 内` : ""}` : "月费仍在当前预算内", role ? `可使用 ${L.roleDisplayName(next.p, role)}，主要比较额度差异` : "同厂商更高档位，可对照额度规则", "这是升级替代方案，无需与主计划同时购买"], [line("多出来的是", L.unlockText(main, next))]);
}
function ownCard(main: PickerProfile | null) {
  const vendor = ownVendors[state.tool];
  if (!vendor || main?.p.vendor === vendor) return null;
  const picked = L.ownVendorPlan(vendor);
  if (!picked) return null;
  const { plan: p, regionMiss } = picked;
  const prof = L.planProfile(p) as PickerProfile;
  const quote = L.pickerPaymentQuote(p);
  const role = state.task === "daily" ? prof.loose[0] || prof.headline : prof.headline || prof.loose[0];
  const taskMiss = state.task === "daily" ? !prof.loose.length : !prof.headline;
  const metered = state.task !== "daily" && !prof.headline && prof.metered.some((r) => r.task === "hard");
  const lines = [line("工具与模型", L.pickerToolRelationship(p))];
  if (metered) lines.push(line("复杂任务", "复杂任务模型在按量池，按模型牌价扣用量；请核对本档附赠额度、超额费用与任务总成本。"));
  if (role) lines.push(line(role.task === "hard" ? "复杂任务" : "日常", `${L.roleDisplayName(p, role)}。${L.roleUseText(role)}。`));
  else lines.push(line("额度", L.trunc(L.resolvedField(p, "quota"), 80)));
  if (prof.loose.length && prof.headline) lines.push(line("日常", `${names(p, prof.loose)}。${L.windowNoteShort(prof)}`));
  const over = quote.available && state.budget !== "any" && quote.monthlyCNY! > (state.budget === "0" ? 0 : Number(state.budget) + L.BUDGET_EPS);
  const selection = metered ? "复杂任务模型使用按量池，额度和费用不能与独立主力模型额度直接比较；此卡按公开月费展示参考。" : taskMiss ? "该厂商个人档未明确列出匹配所选任务的模型，仅按公开月费展示参考，任务能力需另行核对。" : picked.withinBudget ? state.budget === "any" ? "预算不限，与主计划采用相同规则，按所选任务和公开额度优先选档；额度打平时选月费较低的档位。" : "与主计划采用相同规则，先满足当前预算，再按所选任务和公开额度选档。" : quote.available ? "当前预算放不下任务适配档，展示月费最低的一档作参考。" : "任务适配档未列所选付款方式价格，仅展示套餐权益作参考。";
  lines.push(line("选档依据", selection));
  if (main && !regionMiss && quote.available && !over) lines.push(line("和主计划", `它没有赢下这组条件的主计划（见第一张卡）。${ownNotes[vendor] || ""}`));
  const reasons = [metered ? "复杂任务模型在按量池，需核对额度与费用" : taskMiss ? `${L.shortVendor(vendor)} 个人档都没有匹配所选任务的模型，仅供对照` : `所选工具的原生订阅${role ? ` · ${L.roleDisplayName(p, role)}` : ""}`, metered ? "套餐月费不等于所有复杂任务的总费用" : taskMiss ? "任务能力需另行核对；此卡仅供参考" : picked.withinBudget ? state.budget === "any" ? "预算不限，按任务与公开额度优先选档" : "预算内按任务与公开额度优先选档" : quote.available ? "预算内没有任务适配档，展示最低月费参考" : "所选付款方式未列公开价，无法按预算选档", regionMiss ? "当前地区不符合；此卡仅供参考" : !quote.available ? "所选付款方式未列价格；此卡仅供参考" : over ? "高于当前预算；此卡仅供参考" : "价格符合预算，比较模型与额度后再选"];
  const result = card(3, `${L.shortVendor(vendor)} ${regionMiss ? "国际参考" : "自家订阅"}`, p, reasons, lines);
  if (!metered && !taskMiss) result.role = role ?? undefined;
  result.tiers = prof;
  result.reference = true;
  result.ignoreRegion = regionMiss;
  if (!quote.available) result.notices.push({ kind: "miss", text: `所选付款方式（${quote.label}）未列公开价格，无法按预算比较。`, action: { key: "billing", value: "M", text: "改看月付标价" } });
  else if (over) result.notices.push({ kind: "miss", text: `高于当前预算${state.budget === "0" ? "（筛选为免费）" : " " + L.fmtCNY(Number(state.budget))}。`, action: { key: "budget", value: "any", text: "把预算放开" } });
  if (regionMiss) result.notices.push({ kind: "avoid", text: `${vendor} 只有国际档，当前地区筛选把它排除了。`, action: { key: "region", value: "all", text: "把地区改成「不限」再看" } });
  else if (p.region === "intl") result.notices.push(internationalNotice(p));
  return result;
}
export function pickerView() {
  const pool = L.eligibleProfiles() as PickerProfile[];
  const main = L.chooseMain(pool) as PickerProfile | null;
  const own = ownCard(main);
  const cards = main ? [mainCard(main, pool), dailyCard(main, pool), upgradeCard(main), own].filter((value): value is PickerCardModel => value !== null) : own ? [own] : [];
  const shown = new Set(cards.map((x) => x.plan.id));
  const alternatives = main ? (L.alternativeProfiles(pool, main, shown) as PickerProfile[]).map((x) => {
    const difference = L.pickerMonthlyCNY(main.p) - L.pickerMonthlyCNY(x.p);
    const tradeoff = difference > L.BUDGET_EPS ? `每月比主计划少 ${L.fmtCNY(difference)}；请同时比较模型与额度。` : x.p.vendor !== main.p.vendor ? "来自另一厂商，可以比较模型、服务权益与额度规则。" : "同厂商另一档位，可比较月费和额度规则。";
    const role = state.task === "daily" ? x.loose[0] : x.headline || x.loose[0];
    const result = card(3, "预算内候选", x.p, [tradeoff, `${L.roleDisplayName(x.p, role)} 适合当前任务`, "满足当前预算、地区与工具条件"], [line("模型与额度", `${L.roleDisplayName(x.p, role)}。${L.windowSentence(x.p, role)}`)]);
    result.role = role;
    return result;
  }) : [];
  return { pool, main, cards, alternatives, ranked: main ? L.rankedCandidates(pool, main) as PickerProfile[] : [], empty: main ? "" : L.pickerEmptyReason(pool), note: main ? `符合条件 ${pool.length} 档 · ${priorityLabel()}。规则与口径见下方「推荐规则与口径」。` : own ? "上面是所选工具的自家订阅，供参考；请结合预算、地区和所选任务查看，参考卡不等于当前条件下的推荐。中转站不参与。" : "平台免费但推理另付费的工具不作为免费模型套餐推荐；国家限定套餐保留在完整数据表，不参与通用推荐。中转站不参与。" };
}
export function priorityLabel() { return L.PICKER_PRIORITY_LABELS[L.pickerPriority() as keyof typeof L.PICKER_PRIORITY_LABELS]; }
export function pickerPolicy() {
  const basis = state.task === "daily" ? "在当前条件内，日常优先独立额度池，再比较可折算额度和月费。" : "在当前条件内，复杂任务按模型用途分组，再比较可折算额度、倍率与套餐类别。";
  const priority = L.pickerPriority() === "ability" ? "当前为「模型能力优先」：先比较主力模型在 DeepSWE v1.1 的已公布成绩，未上榜的排在后面，再按上述规则比较；不同评测不合成总分。" : L.pickerPriority() === "price" ? "当前为「价格优先」：在满足任务与条件的档位中先选所选付款方式月均价最低的，再按上述规则比较。" : "";
  return basis + (state.budget === "any" ? "预算不限会优先较大额度档；省钱档与公开评测见详情。" : "公开评测仅供能力参考；额度未知时结合套餐类别与月费选择。") + priority;
}
export function paymentSummary(p: Plan, compact = false) {
  const q = L.pickerPaymentQuote(p);
  if (!q.available) return [`未列公开${q.label}价格；此卡仅供对照。`];
  if (q.monthlyNative === 0) return [];
  const period = q.periodMonths === 12 ? "年" : "月";
  const approx = q.annualApprox ? "约 " : "";
  if (compact) return [`首次 ${approx}${L.pickerMoney(q.firstNative, q.cur)}${q.mode === "Y" ? "，一次支付全年" + (q.annualApprox ? "（折月价×12估算）" : "") : ""}；按当前价续期 ${approx}${L.pickerMoney(q.renewalNative, q.cur)}/${period}${q.inferred ? "（按标价估算）" : ""}。`];
  return [`${q.label} · ${q.inferred ? "未单列连续包月价，按月付标价计（已核价的连续包月价都不高于标价）；" : ""}首次 ${approx}${L.pickerMoney(q.firstNative, q.cur)}；按当前价续期 ${approx}${L.pickerMoney(q.renewalNative, q.cur)}/${period}。`, `按当前价连续使用 12 个月 ${approx}${L.pickerMoney(q.annualNative, q.cur)}${q.mode === "Y" ? "，一次支付全年" + (q.annualApprox ? "（折月价×12估算）" : "") : "（费用情景）"}；续费与优惠资格以结算页为准。`];
}
export function usageLines(p: Plan): PickerLine[] {
  const qualification = p.purchaseCountries?.length ? `仅限 ${p.purchaseCountries.join("、")}，购买前核对账号与支付资格。` : p.region === "intl" ? `国际档需自行核对所在地、账号和支付资格；地区筛选不保证每个国家可购买。中国大陆：${L.mainlandAccessText(p)}` : "国内档仍需核对购买账号、活动资格与续费条件。";
  const window = p.windowPeriod === "unknown" || !p.windowPeriod ? "重置窗口尚未确认，不能按固定时间估计恢复。" : `公开窗口：${L.resolvedField(p, "quota")}；实际恢复以账户页面和官方规则为准。`;
  return [line("支持模型", L.resolvedField(p, "models")), line("支持工具", L.resolvedField(p, "tools")), line("购买资格", qualification), line("打满后", `${window} 先暂停可延后任务并查看剩余额度；使用其他已确认套餐时先核对共享池与费用。自备 Key、工具订阅或按量加购可能另收费，未知推理费用不计作免费。`)];
}
export function tierRows(model: PickerCardModel) {
  if (!model.tiers) return [];
  const main = model.tiers;
  const role = model.role || (state.task === "daily" ? main.loose[0] || main.headline : main.headline || main.loose[0]);
  if (!role) return [];
  const cap = state.budget === "any" ? Infinity : Number(state.budget);
  const profiles = L.PLANS.filter((p) => p.vendor === main.p.vendor && L.isPersonalMonthly(p) && L.recommendablePlan(p) && (model.ignoreRegion || state.region === "all" || p.region === state.region) && L.matchesTool(p, state.tool) && L.pickerPaymentQuote(p).available).map((p) => L.planProfile(p) as PickerProfile);
  const tiers = profiles.filter((x) => (x.headline && x.headline.id === role.id) || x.loose.some((r) => r.id === role.id)).filter((x) => x.p === main.p || L.pickerMonthlyCNY(x.p) <= L.upgradeBudgetCeiling() + L.BUDGET_EPS).sort((a, b) => L.pickerMonthlyCNY(a.p) - L.pickerMonthlyCNY(b.p));
  return tiers.length < 2 ? [] : tiers.map((x) => {
    const evidence = L.tokenEvidence(x.p, role);
    const price = L.pickerMonthlyCNY(x.p);
    return { plan: x.p, current: x.p === main.p, price, quota: evidence ? "下限约 " + L.fmtTok(evidence.tokens) + "/月" : L.trunc(L.resolvedField(x.p, "quota"), 80) || "未公开", status: x.p === main.p ? model.reference ? "当前参考" : "当前推荐" : price > cap + L.BUDGET_EPS ? "超出预算" : state.region !== "all" && x.p.region !== state.region ? "地区外参考" : "预算内" };
  });
}
