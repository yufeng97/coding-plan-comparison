/* Test-only picker DOM oracle. Production recommendations and controls are native Vue; calculations come from current TypeScript runtime. */

function pickerPaymentSummaryHtml(p, { compact = false } = {}) {
  const quote = pickerPaymentQuote(p);
  if (!quote.available) return `<p class="qc-payment-summary">未列公开${esc(quote.label)}价格；此卡仅供对照。</p>`;
  if (quote.monthlyNative === 0) return "";
  const period = quote.periodMonths === 12 ? "年" : "月";
  const approx = quote.annualApprox ? "约 " : "";
  if (compact) {
    const basis = quote.inferred ? "（按标价估算）" : "";
    const annual = quote.mode === "Y" ? "，一次支付全年" + (quote.annualApprox ? "（折月价×12估算）" : "") : "";
    return `<p class="qc-payment-summary">首次 ${approx}${esc(pickerMoney(quote.firstNative, quote.cur))}${annual}；按当前价续期 ${approx}${esc(pickerMoney(quote.renewalNative, quote.cur))}/${period}${basis}。</p>`;
  }
  const basis = quote.inferred ? "未单列连续包月价，按月付标价计（已核价的连续包月价都不高于标价）；" : "";
  return `<p class="qc-payment-summary">${esc(quote.label)} · ${basis}首次 ${approx}${esc(pickerMoney(quote.firstNative, quote.cur))}；按当前价续期 ${approx}${esc(pickerMoney(quote.renewalNative, quote.cur))}/${period}。<br>按当前价连续使用 12 个月 ${approx}${esc(pickerMoney(quote.annualNative, quote.cur))}${quote.mode === "Y" ? "，一次支付全年" + (quote.annualApprox ? "（折月价×12估算）" : "") : "（费用情景）"}；续费与优惠资格以结算页为准。</p>`;
}


/* ---------- 帮我选 ---------- */
const PICK_ACCENT = ["#34d399", "#f59e0b", "#6366f1", "#f472b6"];

const OWN_VENDOR_NOTE = {
  Cursor: "Cursor 各档的模型池和额外按量费用不同；请对照具体套餐的总费用、支持工具和额度规则。",
  Anthropic: "Claude 官方订阅用的是 Claude Code 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
  OpenAI: "ChatGPT 官方订阅用 Codex 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
};

function moneyHtml(p) {
  if (!p) return "<em>—</em>";
  if (p.priceM === 0) return "<em>免费</em>";
  const quote = pickerPaymentQuote(p);
  if (!quote.available) return `<em>未列公开${esc(quote.label)}价</em>`;
  return `<em>${esc(pickerMoney(quote.monthlyNative, p.cur))}</em>/月${quote.mode === "Y" ? "（年付折月）" : ""}${p.cur !== "CNY" ? `<small class="qc-converted">约 ${esc(fmtCNY(quote.monthlyCNY))}/月</small>` : ""}`;
}

function lineHtml(k, text) {
  return `<div class="qc-line"><span class="k">${esc(k)}</span>${esc(text)}</div>`;
}

/* 主计划与排在其后的两档并排：月费、主力模型、可折算额度和编程评测一眼可比，不必展开每张卡。 */
function pickerCompareHtml(rows) {
  if (rows.length < 2) return "";
  const cells = (x, i) => {
    const role = candidateRole(x);
    return [
      ["套餐", `${esc(planTitle(x.p))}${i === 0 ? '<span class="qc-compare-tag">主计划</span>' : ""}`],
      ["所选付款月均", esc(priceLine(x.p))],
      ["主力模型", esc(role ? roleDisplayName(x.p, role) : "—")],
      ["月额度参考下限", esc(quotaEvidenceText(x))],
      ["DeepSWE v1.1", esc(abilityText(x))],
      ["对比", `<button type="button" class="qc-action cmp-add" data-plan-id="${esc(x.p.id)}" data-vendor="${esc(x.p.vendor)}" data-plan="${esc(x.p.plan)}">＋对比</button>`],
    ];
  };
  const head = cells(rows[0], 0).map(([label]) => `<th scope="col">${label}</th>`).join("");
  const body = rows.map((x, i) => `<tr${i === 0 ? ' class="is-current"' : ""}>` + cells(x, i).map(([label, value], j) =>
    j === 0 ? `<th scope="row" data-label="${label}">${value}</th>` : `<td data-label="${label}">${value}</td>`).join("") + "</tr>").join("");
  return `<div class="picker-compare table-wrap" tabindex="0" role="region" aria-label="候选对比，可横向滚动"><table class="qc-compare"><caption>前 ${rows.length} 档对比 · ${esc(PICKER_PRIORITY_LABELS[pickerPriority()])}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function pickerPaymentHtml(p) {
  if (!p || !(p.priceM > 0)) return "";
  const bits = [lineHtml("月付原价", `${priceText(p, "priceM")}/月${p.seat ? "，每席位" : ""}；按原币支付。`)];
  if (p.priceY > 0) {
    bits.push(lineHtml("年付全年", annualPaymentText(p)));
  }
  if (/首购|新购|活动|优惠|续费|连续包|试用|折|限时|原价/.test(p.note || "")) {
    bits.push(`<details class="qc-payment-note"><summary>优惠与续费原文</summary><p>${esc(p.note)}</p></details>`);
  }
  return bits.join("");
}

function pickerVerificationHtml(p) {
  const check = priceCheckOf(p);
  if (!check) return lineHtml("本档核查", "暂无逐条核查记录，请在官网核对价格与权益。");
  const sources = check.sourceIds.map((id) => PRICE_CHECKS.sources[id]).filter(Boolean);
  const date = lineHtml("本档核查", `${check.checkedAt} · ${priceCheckLabel(p)}${check.reason ? "。" + displayPriceReason(check.reason) : ""}`);
  const evidence = sources.map((s) => `<li>${esc(displayPriceReason(s.evidence) || "来源页面记录")} ${safeHref(s.url) ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener">核查来源 ↗</a>` : ""}</li>`).join("");
  return date + (evidence ? `<details class="qc-verification"><summary>查看核查依据（${sources.length} 项）</summary><ul>${evidence}</ul></details>` : "");
}

function pickerPlanActions(p) {
  if (!p) return "";
  return `<div class="qc-actions"><button type="button" class="qc-action cmp-add" data-plan-id="${esc(p.id)}" data-vendor="${esc(p.vendor)}" data-plan="${esc(p.plan)}">＋对比</button><button type="button" class="qc-action" data-view-plan="${esc(p.id)}" aria-label="查看 ${esc(planTitle(p))} 完整权益">完整权益</button></div>`;
}

/* renderPicker 每轮重建前清空；quickCard 记下已出卡的永久 ID，「其他候选」据此去重，不再从生成的 HTML 反查。 */
let pickerCardPlanIds = new Set();

function quickCard(accent, title, value, reasons, plan, body = "", extra = "") {
  if (plan) pickerCardPlanIds.add(plan.id);
  const href = plan ? safeHref(plan.url) : "";
  const name = plan ? `<b class="qc-plan">${esc(planTitle(plan))}</b>` : "";
  const details = body + extra + (plan ? pickerPaymentSummaryHtml(plan) + `<div class="badge-row">${badgeHtml(plan)}</div>` + pickerPaymentHtml(plan) : "");
  return `<div class="quick-card" style="--qc-accent:${accent}">
    <div class="qc-title"><span class="qc-title-label">${esc(title)}</span>${typeof watchButtonHtml === "function" ? watchButtonHtml(plan, "qc-watch") : ""}</div>
    ${name}
    <div class="qc-value">${value}</div>
    ${plan ? pickerPaymentSummaryHtml(plan, { compact:true }) : ""}
    <ul class="qc-reasons">${reasons.slice(0, 3).map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>
    ${plan ? pickerPlanActions(plan) : ""}
    ${href ? `<a class="qc-action qc-primary" href="${href}" target="_blank" rel="noopener">去官网 <span class="qc-action-icon" aria-hidden="true">↗</span></a>` : ""}
    ${details ? `<details class="qc-details"><summary>价格、额度${extra ? "、评测" : ""}与核查详情</summary><div class="qc-sub">${details}</div></details>` : ""}
  </div>`;
}

/* 国际档的提醒：登记了官方支持地区说明时直接写明中国大陆是否在服务范围内。 */
function intlAvoidHtml(p) {
  const access = mainlandAccessOf(p);
  const lead = access ? (access.status === "unsupported" ? "官方支持地区不含中国大陆；" : "在中国大陆部分模型不可用；") : "";
  return `<div class="qc-avoid">${esc(lead)}需要外币或国际账号支付。</div>`;
}

function pickerUsageGuide(p) {
  const qualification = p.purchaseCountries && p.purchaseCountries.length
    ? `仅限 ${p.purchaseCountries.join("、")}，购买前核对账号与支付资格。`
    : p.region === "intl" ? `国际档需自行核对所在地、账号和支付资格；地区筛选不保证每个国家可购买。中国大陆：${mainlandAccessText(p)}` : "国内档仍需核对购买账号、活动资格与续费条件。";
  const window = p.windowPeriod === "unknown" || !p.windowPeriod ? "重置窗口尚未确认，不能按固定时间估计恢复。" : `公开窗口：${resolvedField(p, "quota")}；实际恢复以账户页面和官方规则为准。`;
  return `<details class="qc-usage-guide"><summary>模型、工具与额度用完后的做法</summary>${lineHtml("支持模型", resolvedField(p, "models"))}${lineHtml("支持工具", resolvedField(p, "tools"))}${lineHtml("购买资格", qualification)}${lineHtml("打满后", `${window} 先暂停可延后任务并查看剩余额度；使用其他已确认套餐时先核对共享池与费用。自备 Key、工具订阅或按量加购可能另收费，未知推理费用不计作免费。`)}</details>`;
}

function mainCard(main, pool) {
  const p = main.p;
  const dailyLead = pickerState.task === "daily" && main.loose.length;
  const role = dailyLead || !main.headline ? main.loose[0] : main.headline;
  const compatible = TOOL_OWN_VENDOR[pickerState.tool] && p.vendor !== TOOL_OWN_VENDOR[pickerState.tool];
  const tool = { claude:"Claude Code", codex:"Codex", cursor:"Cursor" }[pickerState.tool];
  const reasons = [role ? `${compatible ? `${tool} 兼容接入 · ` : ""}${roleDisplayName(p, role)} 适合${dailyLead || !main.headline ? "日常编码" : "复杂编码任务"}` : "附赠编程推理额度"];
  const evidence = tokenEvidence(p, role);
  reasons.push(evidence ? `按官方额度规则折算，保守参考下限约 ${fmtTok(evidence.tokens)} tokens/月（统一假设，置信${evidence.conf}）`
    : priceDecidedMain(main, pool) ? "同档候选的额度都无法折算，按月费较低选出；可展开其他候选对照模型与评测" : "可用 token 总量未公开，购买前核对额度规则");
  if (dailyLead && main.headline) reasons.push(`同档已包含 ${roleDisplayName(p, main.headline)}，可用于复杂任务`);
  else if (!dailyLead && main.headline && main.loose.length) reasons.push(`日常已包含 ${main.loose.map((r) => roleDisplayName(p, r)).join("、")}；${main.shared || main.sharing === "shared" ? "共用额度池" : main.sharing === "separate" ? "模型额度分池" : "共享关系未公开"}`);
  else if (pickerState.task === "both" && !main.headline) reasons.push("当前条件仅匹配日常模型，复杂任务需另找方案");
  else if (pickerState.task === "both" && !main.loose.length) reasons.push("本档未匹配日常模型，日常入口需单独确认");
  else reasons.push("满足当前预算、地区与工具条件");
  const bits = [lineHtml("选取理由", pickerChoiceReason(main))];
  const relationship = pickerToolRelationship(p);
  if (relationship) bits.push(lineHtml("工具与模型", relationship));
  if (dailyLead) {
    const names = main.loose.map((r) => roleDisplayName(p, r)).join("、");
    bits.push(lineHtml("日常", `${names}。${roleUseText(main.loose[0])}。`));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.loose[0])));
    if (main.headline) bits.push(lineHtml("同档还有", `${roleDisplayName(p, main.headline)}。${windowNoteShort(main)}`));
  } else if (main.headline) {
    const ceiling = main.ceilings.find((r) => r.id !== main.headline.id);
    let hard = `${roleDisplayName(p, main.headline)}。${roleUseText(main.headline)}。`;
    if (ceiling) hard += `${roleDisplayName(p, ceiling)} 也能开，${roleUseText(ceiling)}。`;
    bits.push(lineHtml("复杂任务", hard));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.headline)));
  } else {
    bits.push(lineHtml("日常", `${main.loose.map((r) => roleDisplayName(p, r)).join("、")}。${roleUseText(main.loose[0])}。`));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.loose[0])));
  }
  const meter = meteredText(main);
  if (meter) bits.push(lineHtml("另一池", meter));
  else if (!dailyLead && !main.headline) bits.push(lineHtml("复杂任务", "这组条件里没有能单独拿来做复杂任务的模型，这档先覆盖日常。"));
  const peer = !dailyLead && main.headline ? peerNote(main, pool) : "";
  if (peer) bits.push(lineHtml("同预算", peer));
  const cheaper = cheaperTiers(main);
  if (cheaper.length) {
    const list = cheaper.slice(0, 2).map((x) => `${x.p.plan}（${priceLine(x.p)}）`).join("、");
    bits.push(lineHtml("省钱档", `同一模型系列还有更便宜的 ${list}，具体版本与额度差请核对官网。`));
  }
  bits.push(pickerVerificationHtml(p));
  bits.push(pickerUsageGuide(p));
  if (p.region === "intl" && pickerState.region !== "cn") bits.push(intlAvoidHtml(p));
  const title = dailyLead || !main.headline ? "主计划 · 日常" : "主计划 · 复杂任务";
  return quickCard(PICK_ACCENT[0], title, moneyHtml(p), reasons, p, bits.join(""), pickerBenchmarkHtml(p, role) + tierComparisonHtml(main, role));
}

function pickerBenchmarkHtml(p, role) {
  const hits = typeof planCodingBenchmarks === "function" ? planCodingBenchmarks(p, role) : [];
  if (!hits.length) return "";
  const items = hits.map(({ protocol, row }) => `<li><b>${esc(protocol.name)}</b> 第 ${row.rank}/${protocol.total} 名 · ${esc(publicModelDisplayName(row.model))} ${esc(publicScoreText(row.score, protocol.unit))}</li>`).join("");
  return `<div class="qc-bench"><p class="qc-bench-title">公开编程评测<span>${role ? "本档当前任务系列内的已测型号" : "本档所含模型"}的最佳名次，${benchmarkRankingNote()}</span></p><ul>${items}</ul><p class="qc-bench-note">只对应成绩行标明的具体型号、推理与 Agent 配置，不套用于同系列其他版本；套餐内未必能用同样配置。<a href="#benchmarks">查看评测</a></p></div>`;
}

/* 同厂商、同一主力模型的各档位并排列出，预算不限时也能看到更便宜的档位与额度差。 */
function tierComparisonHtml(main, role, { reference = false, ignoreRegion = false } = {}) {
  if (!role) return "";
  const tiers = PLANS.filter((p) => p.vendor === main.p.vendor && isPersonalMonthly(p) && recommendablePlan(p) &&
    (ignoreRegion || pickerState.region === "all" || p.region === pickerState.region) && matchesTool(p, pickerState.tool) &&
    pickerPaymentQuote(p).available).map(planProfile)
    .filter((x) => (x.headline && x.headline.id === role.id) || x.loose.some((r) => r.id === role.id))
    /* 与升级参考同一上限：有限预算只对照到下一预算档，不限预算列出全部档位。 */
    .filter((x) => x.p === main.p || pickerMonthlyCNY(x.p) <= upgradeBudgetCeiling() + BUDGET_EPS)
    .sort((a, b) => pickerMonthlyCNY(a.p) - pickerMonthlyCNY(b.p));
  if (tiers.length < 2) return "";
  const cap = pickerState.budget === "any" ? Infinity : Number(pickerState.budget);
  const rows = tiers.map((x) => {
    const evidence = tokenEvidence(x.p, role);
    const price = pickerMonthlyCNY(x.p);
    const state = x.p === main.p ? reference ? "当前参考" : "当前推荐" : price > cap + BUDGET_EPS ? "超出预算"
      : pickerState.region !== "all" && x.p.region !== pickerState.region ? "地区外参考" : "预算内";
    const quota = evidence ? "下限约 " + fmtTok(evidence.tokens) + "/月" : trunc(resolvedField(x.p, "quota"), 80) || "未公开";
    return `<tr${x.p === main.p ? ' class="is-current"' : ""}><th scope="row">${esc(x.p.plan)}</th><td class="qc-tier-price" data-cny="${price.toFixed(2)}">${esc(priceLine(x.p))}</td><td>${esc(quota)}</td><td>${state}</td></tr>`;
  }).join("");
  return `<table class="qc-tiers"><caption>${esc(shortVendor(main.p.vendor))} 各档（${esc(roleDisplayName(main.p, role))} 所在系列）</caption><thead><tr><th scope="col">档位</th><th scope="col">月费</th><th scope="col">额度依据</th><th scope="col">条件</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* 已包含的覆盖写在主卡中；只为实际可选的另一份订阅出卡，且合计不超预算。 */
function dailyCard(main, pool) {
  if (pickerState.task !== "both" || main.internalDaily.length) return "";
  /* 已有日常模型时，仅明确的共享 5h 窗口才考虑补充；未知共享关系不能成为加购依据。 */
  if (main.loose.length && !main.shared) return "";
  const shared = main.headline ? sameWindowText(main) : "";
  const sup = pickSupplement(main, pool);
  if (!sup.chosen) return "";
  const p = sup.chosen.p;
  const roles = sup.chosen.internalDaily.length ? sup.chosen.internalDaily : sup.chosen.loose;
  const total = (pickerMonthlyCNY(main.p) || 0) + (pickerMonthlyCNY(p) || 0);
  const free = isFreeCodingEntry(p);
  const reasons = [
    `日常可用 ${roles.map((r) => roleDisplayName(p, r)).join("、")}`,
    free ? "独立免费入口，无需额外月费" : "可选的另一份订阅，用量不占主计划额度",
    `两档合计约 ${fmtCNY(total)}/月，在当前预算内`,
  ];
  const body = (shared ? lineHtml("主计划额度", shared) : "") +
    (main.loose.length ? lineHtml("不用另买", "主计划已包含日常模型；仅在需要另一份额度时考虑这个可选入口。") : "") +
    lineHtml("两档合计月费", `约 ${fmtCNY(total)}（按页面汇率折算）`) + pickerVerificationHtml(p) + pickerUsageGuide(p);
  return quickCard(PICK_ACCENT[1], "可选日常补充", moneyHtml(p), reasons, p, body);
}

function upgradeCard(main) {
  const next = nextTier(main);
  if (!next) return "";
  const over = pickerState.budget !== "any" && (pickerMonthlyCNY(next.p) || 0) > Number(pickerState.budget) + BUDGET_EPS;
  const cap = upgradeBudgetCeiling();
  const role = pickerState.task === "daily" || !main.headline ? next.loose[0] : next.headline;
  const reasons = [
    over ? `高于当前预算${Number.isFinite(cap) ? `，在下一档 ≤${fmtCNY(cap)} 内` : ""}` : "月费仍在当前预算内",
    role ? `可使用 ${roleDisplayName(next.p, role)}，主要比较额度差异` : "同厂商更高档位，可对照额度规则",
    "这是升级替代方案，无需与主计划同时购买",
  ];
  return quickCard(PICK_ACCENT[2], "同厂商升级参考", moneyHtml(next.p), reasons, next.p,
    lineHtml("多出来的是", unlockText(main, next)) + pickerVerificationHtml(next.p) + pickerUsageGuide(next.p));
}

function ownVendorCard(main) {
  const vendor = TOOL_OWN_VENDOR[pickerState.tool];
  if (!vendor) return null;
  if (main && main.p.vendor === vendor) return null;
  const picked = ownVendorPlan(vendor);
  if (!picked) return null;
  const { plan, regionMiss } = picked;
  const prof = planProfile(plan);
  const quote = pickerPaymentQuote(plan);
  const bits = [lineHtml("工具与模型", pickerToolRelationship(plan))];
  const role = pickerState.task === "daily" ? prof.loose[0] || prof.headline : prof.headline || prof.loose[0];
  const taskMiss = pickerState.task === "daily" ? !prof.loose.length : !prof.headline;
  const meteredTask = pickerState.task !== "daily" && !prof.headline && prof.metered.some((r) => r.task === "hard");
  if (meteredTask) bits.push(lineHtml("复杂任务", "复杂任务模型在按量池，按模型牌价扣用量；请核对本档附赠额度、超额费用与任务总成本。"));
  if (role) {
    const use = role.task === "hard" ? "复杂任务" : "日常";
    bits.push(lineHtml(use, `${roleDisplayName(plan, role)}。${roleUseText(role)}。`));
  } else {
    bits.push(lineHtml("额度", trunc(resolvedField(plan, "quota"), 80)));
  }
  if (prof.loose.length && prof.headline) bits.push(lineHtml("日常", `${prof.loose.map((r) => roleDisplayName(plan, r)).join("、")}。${windowNoteShort(prof)}`));
  /* 价格未知时不能判断是否超预算，只提示切换到有公开价的付款方式。 */
  const overBudget = quote.available && pickerState.budget !== "any" &&
    quote.monthlyCNY > (pickerState.budget === "0" ? 0 : Number(pickerState.budget) + BUDGET_EPS);
  const selection = meteredTask ? "复杂任务模型使用按量池，额度和费用不能与独立主力模型额度直接比较；此卡按公开月费展示参考。" : taskMiss ? "该厂商个人档未明确列出匹配所选任务的模型，仅按公开月费展示参考，任务能力需另行核对。" : picked.withinBudget ? pickerState.budget === "any"
    ? "预算不限，与主计划采用相同规则，按所选任务和公开额度优先选档；额度打平时选月费较低的档位。"
    : "与主计划采用相同规则，先满足当前预算，再按所选任务和公开额度选档。"
    : quote.available ? "当前预算放不下任务适配档，展示月费最低的一档作参考。" : "任务适配档未列所选付款方式价格，仅展示套餐权益作参考。";
  bits.push(lineHtml("选档依据", selection));
  if (!quote.available) {
    bits.push(`<div class="qc-miss">所选付款方式（${esc(quote.label)}）未列公开价格，无法按预算比较。<button type="button" class="linkish" data-set-picker="billing=M">改看月付标价</button></div>`);
  } else if (overBudget) {
    const cap = pickerState.budget === "0" ? "（筛选为免费）" : " " + fmtCNY(Number(pickerState.budget));
    bits.push(`<div class="qc-miss">高于当前预算${cap}。<button type="button" class="linkish" data-set-picker="budget=any">把预算放开</button></div>`);
  } else if (main && !regionMiss) bits.push(lineHtml("和主计划", `它没有赢下这组条件的主计划（见第一张卡）。${OWN_VENDOR_NOTE[vendor] || ""}`));
  if (regionMiss) bits.push(`<div class="qc-avoid">${esc(vendor)} 只有国际档，当前地区筛选把它排除了。<button type="button" class="linkish" data-set-picker="region=all">把地区改成「不限」再看</button></div>`);
  else if (plan.region === "intl") bits.push(intlAvoidHtml(plan));
  const reasons = [
    meteredTask ? "复杂任务模型在按量池，需核对额度与费用" : taskMiss ? `${shortVendor(vendor)} 个人档都没有匹配所选任务的模型，仅供对照` : `所选工具的原生订阅${role ? ` · ${roleDisplayName(plan, role)}` : ""}`,
    meteredTask ? "套餐月费不等于所有复杂任务的总费用" : taskMiss ? "任务能力需另行核对；此卡仅供参考" : picked.withinBudget ? pickerState.budget === "any" ? "预算不限，按任务与公开额度优先选档" : "预算内按任务与公开额度优先选档"
      : quote.available ? "预算内没有任务适配档，展示最低月费参考" : "所选付款方式未列公开价，无法按预算选档",
    regionMiss ? "当前地区不符合；此卡仅供参考" : !quote.available ? "所选付款方式未列价格；此卡仅供参考" : overBudget ? "高于当前预算；此卡仅供参考" : "价格符合预算，比较模型与额度后再选",
  ];
  return quickCard(PICK_ACCENT[3], `${shortVendor(vendor)} ${regionMiss ? "国际参考" : "自家订阅"}`, moneyHtml(plan), reasons, plan,
    bits.join("") + pickerVerificationHtml(plan) + pickerUsageGuide(plan), (meteredTask || taskMiss ? "" : pickerBenchmarkHtml(plan, role)) + tierComparisonHtml(prof, role, { reference:true, ignoreRegion:regionMiss }));
}

/* 帮我选四行 chips 的高亮以 pickerState 为准（渲染时自愈，程序化改状态也不会脱钩） */
function syncPickerChips() {
  qsa("#picker .picker-row").forEach((row) => {
    setChipPressed(row.querySelectorAll(".chip"), (chip) => chip.dataset.value === pickerState[row.dataset.pick]);
  });
}

function alternativeCards(main, pool, shownIds) {
  const alternatives = alternativeProfiles(pool, main, shownIds);
  if (!alternatives.length) return "";
  const mainPrice = pickerMonthlyCNY(main.p) || 0;
  const cards = alternatives.map((x) => {
    const difference = mainPrice - (pickerMonthlyCNY(x.p) || 0);
    const tradeoff = difference > BUDGET_EPS ? `每月比主计划少 ${fmtCNY(difference)}；请同时比较模型与额度。`
      : x.p.vendor !== main.p.vendor ? "来自另一厂商，可以比较模型、服务权益与额度规则。" : "同厂商另一档位，可比较月费和额度规则。";
    const role = pickerState.task === "daily" ? x.loose[0] : x.headline || x.loose[0];
    const reasons = [tradeoff, `${roleDisplayName(x.p, role)} 适合当前任务`, "满足当前预算、地区与工具条件"];
    const body = lineHtml("模型与额度", `${roleDisplayName(x.p, role)}。${windowSentence(x.p, role)}`) + pickerVerificationHtml(x.p) + pickerUsageGuide(x.p);
    return quickCard(PICK_ACCENT[3], "预算内候选", moneyHtml(x.p), reasons, x.p, body, pickerBenchmarkHtml(x.p, role));
  }).join("");
  return `<details class="picker-alternatives method-box"><summary>其他候选（${alternatives.length} 档，均在预算内）</summary><div class="picker-alternatives-grid">${cards}</div></details>`;
}

function renderPicker() {
  const previousFocus = document.activeElement;
  const focusedPlanId = previousFocus && byId("quickGrid").contains(previousFocus) ? previousFocus.getAttribute("data-plan-id") || previousFocus.getAttribute("data-view-plan") : "";
  syncPickerChips();
  pickerCardPlanIds = new Set();
  pickerAbilityCache = new Map();
  const pool = eligibleProfiles();
  const grid = byId("quickGrid");
  const note = byId("pickerNote");
  const main = chooseMain(pool);
  const policy = byId("pickerPolicy");
  if (policy) {
    const basis = pickerState.task === "daily"
      ? "在当前条件内，日常优先独立额度池，再比较可折算额度和月费。"
      : "在当前条件内，复杂任务按模型用途分组，再比较可折算额度、倍率与套餐类别。";
    const priority = pickerPriority() === "ability"
      ? "当前为「模型能力优先」：先比较主力模型在 DeepSWE v1.1 的已公布成绩，未上榜的排在后面，再按上述规则比较；不同评测不合成总分。"
      : pickerPriority() === "price" ? "当前为「价格优先」：在满足任务与条件的档位中先选所选付款方式月均价最低的，再按上述规则比较。" : "";
    policy.textContent = basis + (pickerState.budget === "any"
      ? "预算不限会优先较大额度档；省钱档与公开评测见详情。"
      : "公开评测仅供能力参考；额度未知时结合套餐类别与月费选择。") + priority;
  }
  const rulesNote = byId("pickerRulesNote");
  if (rulesNote) rulesNote.textContent = `已包含的日常覆盖写在主卡中；可选补充列出合计月费。升级参考最多跨到下一预算档，其他候选和自家订阅供对照，无需同时购买。模型用途按 ${MODEL_ROLES_ASOF} 归类；未公开额度与共享规则请核对官网。中转站与国家限定套餐不参与通用推荐。`;
  const billingNote = byId("pickerBillingNote");
  if (billingNote) billingNote.textContent = pickerState.billing === "Y"
    ? "预算按年付月均比较；首次一次支付全年，金额见卡片。"
    : pickerState.billing === "A" ? "有单列连续包月价时按该价比较；未单列的普通月订阅按标价计作为上限。购买资格与续费规则见卡片。"
    : "按公开月价比较；部分月价附有连续包月或优惠条件，购买前请核对。";
  const own = ownVendorCard(main);
  if (!main) {
    grid.dataset.cardCount = own ? "1" : "0";
    grid.innerHTML = `<div class="picker-empty">${esc(pickerEmptyReason(pool))}</div>` + (own || "");
    note.textContent = own
      ? "上面是所选工具的自家订阅，供参考；请结合预算、地区和所选任务查看，参考卡不等于当前条件下的推荐。中转站不参与。"
      : "平台免费但推理另付费的工具不作为免费模型套餐推荐；国家限定套餐保留在完整数据表，不参与通用推荐。中转站不参与。";
    syncTableCmpButtons(previousFocus);
    if (typeof syncServiceControls === "function") syncServiceControls();
    refreshPickerScopes();
    return;
  }
  const cards = [mainCard(main, pool), dailyCard(main, pool), upgradeCard(main), own].filter(Boolean);
  const shownIds = new Set(pickerCardPlanIds);
  grid.dataset.cardCount = String(cards.length);
  grid.innerHTML = cards.join("") + pickerCompareHtml(rankedCandidates(pool, main)) + alternativeCards(main, pool, shownIds);
  /* 对比按钮重绘后要恢复到可见入口；仅恢复仍存在的同套餐折叠区。 */
  if (focusedPlanId) {
    const replacement = Array.from(grid.querySelectorAll("[data-plan-id], [data-view-plan]")).find((el) => el.getAttribute("data-plan-id") === focusedPlanId || el.getAttribute("data-view-plan") === focusedPlanId);
    const details = replacement && replacement.closest(".qc-details");
    if (details) details.setAttribute("open", "");
    const alternatives = replacement && replacement.closest(".picker-alternatives");
    if (alternatives) alternatives.setAttribute("open", "");
  }
  note.textContent = `符合条件 ${pool.length} 档 · ${PICKER_PRIORITY_LABELS[pickerPriority()]}。规则与口径见下方「推荐规则与口径」。`;
  syncTableCmpButtons(previousFocus);
  if (typeof syncServiceControls === "function") syncServiceControls();
  refreshPickerScopes();
}
