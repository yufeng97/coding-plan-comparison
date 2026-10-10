/* 分享、常用条件、完整权益与工作量计算；纯静态运行，不发送或上传用户输入。 */
"use strict";
const PRESET_KEY = "cp-filter-preset-v1";
const COST_CONTROLS = { model:"costModel", requests:"costRequests", tokens:"costTokens", days:"costDays", input:"costInput", cache:"costCache", cachePrice:"costCachePrice", budget:"costBudget" };
const SERVICE_TOOL_LABELS = { any:"不限工具", claude:"Claude Code", codex:"Codex", cursor:"Cursor", own:"自家客户端" };
const COST_PRESETS = {
  light: { requests:"20", tokens:"5000", days:"20" },
  daily: { requests:"100", tokens:"20000", days:"22" },
  heavy: { requests:"300", tokens:"40000", days:"26" },
};
/* 示例情景只改变可见的计费假设；没有缓存单价时仍按普通输入价收费。 */
const COST_SCENARIOS = {
  conservative: { label:"保守", input:"60", cache:"50" },
  typical: { label:"典型", input:"80", cache:"95" },
  optimistic: { label:"乐观", input:"90", cache:"100" },
};
function serviceFeedback(message) {
  const el = byId("serviceFeedback");
  if (el) el.textContent = message;
}
function readPreset() {
  try {
    const p = JSON.parse(localStorage.getItem(PRESET_KEY) || "null");
    return p && p.version === 1 && typeof p.query === "string" && p.query.length <= 16000 ? p : null;
  } catch (err) { return null; }
}
function syncPresetButtons() {
  const saved = !!readPreset();
  ["loadPresetBtn", "clearPresetBtn"].forEach((id) => { const b = byId(id); if (b) b.disabled = !saved; });
}
function syncServiceControls() {
  for (const [key,id] of Object.entries(COST_CONTROLS)) { const el = byId(id); if (el) el.value = calcState[key]; }
  const payment = byId("pickerPaymentSummary");
  if (payment) payment.textContent = "付款：" + PICKER_BILLING_LABELS[pickerState.billing] + (pickerState.billing === "Y" ? "（按折月预算）" : "");
  syncCostChips();
  syncPickerScopeControls();
}
function syncCostChips() {
  const visibleValue = (key) => {
    const control = COST_CONTROLS[key] && byId(COST_CONTROLS[key]);
    return control ? control.value : calcState[key];
  };
  setChipPressed(qsa("[data-cost-preset]"), (button) => {
    const preset = COST_PRESETS[button.dataset.costPreset];
    return preset && Object.entries(preset).every(([key,value]) => visibleValue(key) === value);
  });
  setChipPressed(qsa("[data-cost-scenario]"), (button) => {
    const scenario = COST_SCENARIOS[button.dataset.costScenario];
    return scenario && (calcState.scenario || "typical") === button.dataset.costScenario && visibleValue("input") === scenario.input && visibleValue("cache") === scenario.cache;
  });
}
function pickerScopeText() {
  const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "月均预算 ≤" + fmtCNY(Number(pickerState.budget));
  const billing = { M:"月付标价", A:"自动续费", Y:"年付折月" }[pickerState.billing] || "月付标价";
  return `${budget} · ${REGION_LABEL[pickerState.region] || "不限地区"} · ${SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具"} · ${billing}`;
}
function syncPickerScopeControls() {
  qsa("#chipBilling .chip").forEach((button) => {
    button.disabled = personalState.fromPicker;
    if (personalState.fromPicker) button.setAttribute("aria-describedby", "personalScope");
    else button.removeAttribute("aria-describedby");
  });
  for (const { name,state } of [{ name:"personal",state:personalState },{ name:"metrics",state:metricsState },{ name:"table",state:tableState },{ name:"rank",state:rankState }]) {
    const applied = !!state.fromPicker;
    /* 价格图、额度表和价格表只收付费档；选购预算为「免费」时不能应用，已应用的仍可取消。 */
    const freeBudget = pickerState.budget === "0";
    qsa(`[data-apply-picker="${name}"]`).forEach((button) => {
      button.textContent = applied ? "取消选购条件" : "应用当前选购条件";
      button.classList.toggle("active", applied);
      button.setAttribute("aria-pressed", applied ? "true" : "false");
      button.disabled = freeBudget && !applied;
      button.title = freeBudget && !applied ? "选购预算为「免费」：这里只列付费档，免费档见「免费 Coding 入口」" : "";
    });
    const scope = byId(name + "Scope");
    const pricing = {
      personal:"图中金额为所选支付方式的月均价。本区月付/年付暂不可切换；取消选购条件后恢复原支付选择。",
      metrics:"套餐按所选支付方式重算；取消选购条件可查看 API 参照。",
      table:"保留目录月付/年付价，并另标选购口径；可按所选支付月均排序。",
      rank:"按所选支付方式月均价重算满额成本，额度不因折扣放大；继续按参考月量区间中点计算。",
    }[name];
    if (scope) scope.textContent = applied
      ? "已应用选购条件：" + pickerScopeText() + "。" + pricing + "继续叠加本区筛选。"
      : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。";
  }
}
function applyPickerScope(name) {
  const scopes = { personal: { state:personalState,render:renderPersonalChart }, metrics: { state:metricsState,render:renderMetricsTable }, table: { state:tableState,render:renderTable }, rank: { state:rankState,render:renderRankChart } };
  const scope = scopes[name];
  if (!scope) return;
  updateAppState(() => {
    scope.state.fromPicker = !scope.state.fromPicker;
    if (name === "table") { tableState.sortKey = tableState.fromPicker ? "selectedMonthly" : "priceM"; tableState.sortDir = 1; }
  }, () => {
    scope.render();
    syncPickerScopeControls();
  });
}
function costModelKey(text) { return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
/* 官方积分系数区间和 credits 面值不使用请求折算的 20K/次假设。 */
function quotaUsesRequestTokenAssumption(m) {
  return !(m.creditCNY != null || m.creditUSD != null || (m.wkLowM != null && provenance(m).conf !== "低"));
}
function setCostInputs(values) {
  Object.assign(calcState,values);
  for (const [key,value] of Object.entries(values)) {
    const control = COST_CONTROLS[key] && byId(COST_CONTROLS[key]);
    if (control) control.value = value;
  }
  syncCostChips();
}
function recommendedApi(main) {
  if (!main) return null;
  const role = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
  const metric = metricForRole(main.p,role);
  const models = resolvedField(main.p,"models");
  const exact = API_PRICES.filter((api) => {
    if (!isPriceConfirmed(api,"api")) return false;
    if (metric && costModelKey(api.model) === costModelKey(metric.m.model)) return true;
    if (!role || !role.re.test(api.model)) return false;
    /* 没有逐模型额度也可按完整模型名匹配牌价；不把只有家族名称的记录推断成某一版本。 */
    const name = String(api.model).split(/[\s-]+/).map(escRe).join("[\\s-]*");
    return new RegExp("(^|[^\\w.-])" + name + "(?=$|[^\\w.-])","i").test(models);
  });
  return exact.find((api) => api.vendor === main.p.vendor) || exact.find((api) => api.region === main.p.region) || exact[0] || null;
}
function openWorkloadCalculator() {
  const main = chooseMain(eligibleProfiles()), api = recommendedApi(main);
  updateAppState(() => {
    if (pickerState.budget !== "any") setCostInputs({ budget:pickerState.budget });
    if (api && calcState.model !== api.vendor + "|" + api.model) {
      setCostInputs({ model:api.vendor + "|" + api.model,cachePrice:"" });
    }
  }, renderCostCalculator);
  const calculator = byId("costCalculator");
  if (calculator) calculator.setAttribute("open", "");
  serviceFeedback((pickerState.budget === "any" ? "选购预算不限，计算器保留你当前填写的月预算。" : "已带入当前月均预算。") +
    (api ? "已选择与推荐同名的 API 模型；缓存单价请按计费规则填写。" : "推荐模型没有可精确匹配的 API 报价，保留计算器当前模型；两者额度不能直接互相抵扣。"));
  navigateToSection("#s4");
}
/* 推荐摘要是纯文本，方便贴到聊天或文档；链接带上当前条件并回到「帮我选」。 */
async function copyPickerSummary() {
  const query = appQueryString();
  const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + "#quick";
  const ok = await copyTextToClipboard(pickerSummaryText(url));
  serviceFeedback(ok ? "已复制推荐摘要，可直接粘贴到聊天或文档；价格以官网为准。" : "复制失败，请改用「复制当前方案链接」。");
}
async function shareCurrentResults() {
  const query = appQueryString();
  const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + (location.hash || "");
  const ok = await copyTextToClipboard(url);
  serviceFeedback(ok ? "已复制当前方案链接，包含筛选、对比与费用计算条件。" : "复制失败，请从地址栏复制当前链接。");
}
function savePreset() {
  const query = appQueryString();
  if (query.length > 16000) { serviceFeedback("筛选条件过长，请缩短搜索词后再保存。"); return; }
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify({ version:1, query }));
    syncPresetButtons();
    serviceFeedback("已在本机保存当前筛选、对比和计算条件。");
  } catch (err) { serviceFeedback("浏览器无法保存本地条件，仍可复制方案链接。"); }
}
function restorePreset() {
  const preset = readPreset();
  if (!preset) { syncPresetButtons(); serviceFeedback("没有可恢复的条件，请先保存。"); return; }
  const query = preset.query ? "?" + preset.query : "";
  try { history.pushState(null, "", location.pathname + query + (location.hash || "")); }
  catch (err) { /* 文件直开仍能在本页恢复条件。 */ }
  restoreHistoryState(query,false);
  syncUrl();
  serviceFeedback("已恢复常用条件。");
}
function clearPreset() {
  try {
    /* 空值与删除等效，兼容受限存储和页面测试替身。 */
    localStorage.setItem(PRESET_KEY, "null");
    syncPresetButtons();
    serviceFeedback("已删除本机保存的条件。");
  } catch (err) { serviceFeedback("浏览器不允许修改本地保存的条件。"); }
}

/* 官方缓存命中单价（与牌价同币种）：只读结构化的 apiCache，未录入时返回 null，不从备注猜测。 */
function officialCachePrice(api) {
  return api && typeof api.apiCache === "number" && Number.isFinite(api.apiCache) ? api.apiCache : null;
}
/* 使用总tokens（输入+输出），缓存率只作用于输入。缓存价留空时采用官方缓存命中价；
   该模型未录入官方缓存价时按普通输入计费，不虚构折扣。缓存写入与存储费不在估算内。 */
function calculateWorkload(state, api) {
  if (!api || !Object.keys(COST_CONTROLS).every((key) => validCalcValue(key, state[key]))) return null;
  const inputPrice = api.cur === "CNY" ? api.inCNY : api.inUSD;
  const outputPrice = api.cur === "CNY" ? api.outCNY : api.outUSD;
  const official = officialCachePrice(api);
  const cacheBasis = state.cachePrice !== "" ? "custom" : official != null ? "official" : "none";
  const cachePrice = cacheBasis === "custom" ? Number(state.cachePrice) : official ?? inputPrice;
  if (![inputPrice,outputPrice,cachePrice].every((v) => Number.isFinite(v) && v >= 0) || cachePrice > inputPrice) return null;
  const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
  const blended = inputShare * (cacheShare * cachePrice + (1-cacheShare) * inputPrice) + (1-inputShare) * outputPrice;
  const monthlyM = Number(state.requests) * Number(state.tokens) * Number(state.days) / 1e6;
  const costNative = monthlyM * blended, costCNY = toCNY(costNative, api.cur);
  const noCacheCNY = toCNY(monthlyM * (inputShare * inputPrice + (1-inputShare) * outputPrice), api.cur);
  const monthlyBudgetM = blended > 0 ? Number(state.budget) / toCNY(blended, api.cur) : null;
  return { monthlyM, blended, costNative, costCNY, noCacheCNY, monthlyBudgetM, cachePrice, cacheBasis };
}
function calculateCostScenarios(state, api) {
  return Object.entries(COST_SCENARIOS).map(([id,scenario]) => {
    const result = calculateWorkload({ ...state,input:scenario.input,cache:scenario.cache },api);
    return result ? { id,...scenario,...result,lowCNY:result.costCNY * 0.8,highCNY:result.costCNY * 1.2 } : null;
  }).filter(Boolean);
}
/* 缓存单价输入框标明原币，并提示留空时采用的官方价，避免把人民币价填进美元模型。 */
function syncCachePriceHint(api) {
  const unit = byId("costCacheUnit"), input = byId("costCachePrice");
  if (!api) return;
  if (unit) unit.textContent = api.cur === "CNY" ? "人民币" : api.cur === "USD" ? "美元" : api.cur;
  const official = officialCachePrice(api);
  if (input) input.placeholder = official != null ? `留空采用官方 ${currencySymbol(api.cur)}${official}` : "未录入官方价，留空按普通输入价";
}
/* 计算器的小额（如每次请求）保留两位有效数字，避免把 ¥0.032 显示成 ¥0；常规金额沿用页面精度。 */
function fmtCalcCNY(n) {
  if (!Number.isFinite(n)) return "—";
  return n > 0 && n < 1 ? "¥" + Number(n.toPrecision(2)) : fmtCNY(n);
}
/* 输出占比 = 100 - 输入占比；输入可带小数，避免 100 - 97.9 显示成 2.0999999999999943。 */
function outputSharePct(input) { return String(Number((100 - Number(input)).toFixed(4))); }
function fmtCalcNative(n) { return n > 0 && n < 1 ? String(Number(n.toPrecision(2))) : String(Number(n.toFixed(2))); }
function renderCostCalculator() {
  const el = byId("costResult");
  if (!el) return;
  const validInputs = Object.entries(COST_CONTROLS).every(([key,id]) => {
    const control = byId(id);
    return !control || validCalcValue(key,control.value);
  });
  if (!validInputs) { el.textContent = "请输入输入框范围内的有效数字。"; return; }
  const api = API_PRICES.find((a) => a.vendor + "|" + a.model === calcState.model && isPriceConfirmed(a, "api"));
  syncCachePriceHint(api);
  const result = calculateWorkload(calcState, api);
  if (!result) { el.textContent = "请输入有效的工作量和预算；缓存单价不能高于普通输入单价。"; return; }
  const currency = currencySymbol(api.cur);
  const cap = result.monthlyBudgetM == null ? "当前单价为零，预算不构成token上限" : "预算可覆盖约 " + fmtTok(result.monthlyBudgetM) + " 总 tokens/月";
  const noCache = "无缓存时约 " + fmtCalcCNY(result.noCacheCNY) + "/月。";
  const cache = result.cacheBasis === "official"
    ? `缓存命中按官方单价 ${currency}${result.cachePrice}/1M 计费（不含缓存写入或存储费），${noCache}可在输入框改填。`
    : result.cacheBasis === "custom" ? "缓存命中按所填单价计费，" + noCache
    : "该模型未录入官方缓存单价，缓存命中率暂不生效，按普通输入价估算；填写官网缓存价后可计算节省。";
  const check = priceCheckOf(api, "api");
  const main = chooseMain(eligibleProfiles());
  let quota = "";
  if (main) {
    const taskRole = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const specific = METRICS_ALL.filter((m) => metricMatchesPlan(m,main.p) && costModelKey(m.model) === costModelKey(api.model))
      .map((m) => ({ m,c:computeMetrics(m),conf:provenance(m).conf })).filter((m) => m.c)
      .sort((a,b) => ({"高":3,"中":2,"低":1}[b.conf] - {"高":3,"中":2,"低":1}[a.conf]))[0];
    const metric = specific || metricForRole(main.p,taskRole);
    if (metric && metric.c.moLow != null) {
      const c = metric.c;
      const baseline = Number(calcState.input) === 80 && Number(calcState.cache) === 95 &&
        (!quotaUsesRequestTokenAssumption(metric.m) || Number(calcState.tokens) === TOKENS_PER_REQ);
      const condition = specific && baseline
        ? "按相同基准，你的总量" + (result.monthlyM <= c.moLow ? "低于参考区间下限" : result.monthlyM > c.moHigh ? "高于参考区间上限" : "落在参考区间内") + "；这不能保证实际额度够用。"
        : "";
      const context = !specific ? "所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用。" : !baseline ? "你修改了折算假设，参考月量不能直接用于判断是否够用。" : "";
      quota = `<p>当前推荐 ${esc(planTitle(main.p))} · ${esc(displayModelName(metric.m.model))}：参考月量 ${esc(tokSpan(c,"moLow","moHigh"))}（置信${esc(metric.conf)}；表内基准：80% 输入、95% 输入缓存${quotaUsesRequestTokenAssumption(metric.m) ? "、请求折算 20K tokens/次" : ""}）。${condition}${context}跨模型 token 不代表等效产出；仍需核对窗口、共享池与工具费用。</p>`;
    } else quota = `<p>当前推荐 ${esc(planTitle(main.p))} 未公开可对照的月 tokens，无法据此保证额度够用。</p>`;
    const quote = typeof pickerPaymentQuote === "function" ? pickerPaymentQuote(main.p) : null;
    if (quote && quote.available && Number.isFinite(quote.monthlyCNY)) quota += `<p>订阅价格参照：${esc(quote.label || "当前支付方式")}月均 ${esc(fmtCalcCNY(quote.monthlyCNY))}。API 账单与订阅分别计费，年付还需核对全年一次支付金额。</p>`;
  }
  const scenarios = calculateCostScenarios(calcState,api);
  const scenarioTable = `<div class="cost-scenario-results"><table class="mini-table"><caption>三种示例计费情景（总工作量上下浮动 20%）</caption><thead><tr><th scope="col">情景与假设</th><th scope="col">基准月费</th><th scope="col">月费范围</th></tr></thead><tbody>` +
    scenarios.map((scenario) => `<tr data-cost-scenario-result="${esc(scenario.id)}"><th scope="row">${esc(scenario.label)}：输入 ${esc(scenario.input)}% / 输出 ${esc(outputSharePct(scenario.input))}%，输入缓存 ${esc(scenario.cache)}%</th><td>${esc(fmtCalcCNY(scenario.costCNY))}</td><td>${esc(fmtCalcCNY(scenario.lowCNY))}–${esc(fmtCalcCNY(scenario.highCNY))}</td></tr>`).join("") + `</tbody></table></div>`;
  el.innerHTML = `<p><strong>预计月费 ${esc(currency + fmtCalcNative(result.costNative))} ≈ ${esc(fmtCalcCNY(result.costCNY))}</strong> · ${esc(fmtTok(result.monthlyM))} 总 tokens/月</p>` +
    `<p>${esc(cap)}。${result.costCNY > Number(calcState.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。"}</p><p>${esc(cache)}</p>` +
    `<p>按 ${esc(calcState.days)} 个工作日、每天 ${esc(calcState.requests)} 次请求，每个工作日约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days)))}${Number(calcState.requests) > 0 ? `，每次约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days) / Number(calcState.requests)))}` : ""}。${result.costCNY <= Number(calcState.budget) ? `月预算剩余约 ${esc(fmtCalcCNY(Number(calcState.budget) - result.costCNY))}` : `月预算需补约 ${esc(fmtCalcCNY(result.costCNY - Number(calcState.budget)))}`}。</p>` +
    `<p>工具与地区沿用「帮我选」：${esc(SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具")} · ${esc(REGION_LABEL[pickerState.region] || "不限地区")}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>` +
    `<p>上方费用按当前输入 ${esc(calcState.input)}% / 输出 ${esc(outputSharePct(calcState.input))}%、输入缓存命中 ${esc(calcState.cache)}% 计算。工作量上下浮动 20% 时约 ${esc(fmtCalcCNY(result.costCNY * 0.8))}–${esc(fmtCalcCNY(result.costCNY * 1.2))}/月。</p>` + scenarioTable +
    `<p>轻度、日常、重度及三种情景都是可编辑的示例假设，不代表真实用户用量，也不是费用预测或套餐额度承诺。典型沿用页面的 80% 输入 / 95% 缓存基准；三个情景使用同一缓存单价，未填写且未录入官方缓存价时按普通输入价计费。范围只模拟总工作量 ±20%，不包含价格变动、动态限流、工具费和税费。牌价核查 ${esc(check ? check.checkedAt : "未核实")} · <a href="${safeHref(api.url)}" target="_blank" rel="noopener">官网计费规则</a></p>` + quota + usageCoverageHtml(result.monthlyM);
}

let planDetailsReturnFocus = null;
let planDetailsBackground = [];
function closePlanDetails() {
  const dlg = byId("planDetailsModal");
  if (!dlg || !(dlg.open === true || dlg.getAttribute("open") != null)) return;
  if (typeof dlg.close === "function") dlg.close();
  else { dlg.removeAttribute("open"); finishPlanDetailsClose(); }
}
function finishPlanDetailsClose() {
  const dlg = byId("planDetailsModal");
  if (dlg) dlg.removeAttribute("aria-modal");
  const backdrop = byId("planDetailsBackdrop");
  if (backdrop) backdrop.hidden = true;
  planDetailsBackground.forEach(({el,inert,ariaHidden}) => {
    if (inert == null) el.removeAttribute("inert"); else el.setAttribute("inert", inert);
    if (ariaHidden == null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", ariaHidden);
  });
  planDetailsBackground = [];
  document.body.classList.remove("has-plan-details");
  if (planDetailsReturnFocus) {
    if (!focusTableControl(planDetailsReturnFocus)) focusTableControl(byId("shareResultsBtn"));
    planDetailsReturnFocus = null;
  }
}
function showPlanDetails(id, trigger = null) {
  const p = findPlanReference(id), dlg = byId("planDetailsModal");
  if (!p || !dlg) return;
  if (isCmpModalOpen()) closeCmpModal();
  planDetailsReturnFocus = trigger || document.activeElement;
  byId("planDetailsTitle").textContent = planTitle(p);
  byId("planDetailsBody").innerHTML = `<dl class="plan-detail-fields">` + PLAN_COLUMNS.filter((c) => c.markdown !== false).map((c) => `<div><dt>${esc(c.label)}</dt><dd>${esc(c.value(p) || "—")}</dd></div>`).join("") + `</dl>` +
    `<div class="maintenance-plan-actions">${typeof watchButtonHtml === "function" ? watchButtonHtml(p) : ""}<a href="${safeHref(p.url)}" target="_blank" rel="noopener">官网购买与权益规则 ↗</a></div>` +
    `<p id="planFollowFeedback" class="table-feedback" role="status" aria-live="polite">${typeof followStorageMessage === "string" ? esc(followStorageMessage) : ""}</p>` +
    (typeof planHistoryHtml === "function" ? planHistoryHtml(p.id) : "");
  dlg.setAttribute("aria-modal", "true");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else {
    dlg.classList.add("cmp-fallback"); dlg.setAttribute("open", "");
    const backdrop = byId("planDetailsBackdrop"); if (backdrop) backdrop.hidden = false;
    planDetailsBackground = Array.from(document.body.children).filter((el) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName))
      .map((el) => ({ el, inert:el.getAttribute("inert"), ariaHidden:el.getAttribute("aria-hidden") }));
    planDetailsBackground.forEach(({el}) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
  }
  document.body.classList.add("has-plan-details");
  focusTableControl(byId("planDetailsCloseBtn"));
}
/* ---------- 按用量反查套餐与订阅回本点 ---------- */
/* 同模型按量单价（每百万 tokens，换算人民币）：使用当前输入占比与缓存命中率，与计算器同一口径。 */
function metricApiCNYPerM(m, plan, state) {
  if (![m.apiIn, m.apiOut, m.apiCache].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
  const blended = inputShare * (cacheShare * m.apiCache + (1 - cacheShare) * m.apiIn) + (1 - inputShare) * m.apiOut;
  const value = toCNY(blended, m.apiCur || plan.cur);
  return Number.isFinite(value) && value > 0 ? value : null;
}
/* 参考月额度下限覆盖本月用量的套餐：只用官方或中置信折算（第三方与请求次数估算不作「够用」依据），
   沿用帮我选的地区、工具与付款方式，按月均价从低到高。每档只保留一行：优先能覆盖的主力模型。 */
function usageCoverageRows(monthlyM, state = calcState) {
  const byPlan = new Map();
  for (const m of METRICS_ALL) {
    const p = m.ref != null ? findPlanReference(m.ref) : null;
    if (!p || !metricOfferOk(m) || !recommendablePlan(p) || !isPersonalMonthly(p)) continue;
    if ((pickerState.region !== "all" && p.region !== pickerState.region) || !matchesTool(p, pickerState.tool)) continue;
    const quote = pickerPaymentQuote(p);
    const c = computeMetrics(m), conf = provenance(m).conf;
    if (!quote.available || !c || c.moLow == null || !(conf === "高" || conf === "中") || c.moLow < monthlyM) continue;
    const row = { p, m, c, conf, quote, flagship: isFlagshipModelName(m.model) };
    const previous = byPlan.get(p.id);
    if (!previous || (row.flagship && !previous.flagship) || (row.flagship === previous.flagship && row.c.moLow > previous.c.moLow)) byPlan.set(p.id, row);
  }
  return [...byPlan.values()].map((row) => {
    const apiPerM = metricApiCNYPerM(row.m, row.p, state);
    return { ...row, apiMonthlyCNY: apiPerM == null ? null : apiPerM * monthlyM, breakEvenM: apiPerM == null ? null : row.quote.monthlyCNY / apiPerM };
  }).sort((a, b) => a.quote.monthlyCNY - b.quote.monthlyCNY || b.c.moLow - a.c.moLow);
}
function usageCoverageHtml(monthlyM, state = calcState) {
  const rows = usageCoverageRows(monthlyM, state);
  const basis = Number(state.input) === 80 && Number(state.cache) === 95 ? "" : "你修改了输入占比或缓存率；参考额度仍按页面 80% 输入、95% 缓存折算，只作量级参考。";
  if (!rows.length) {
    return `<div class="usage-coverage"><h4>能覆盖这个用量的套餐</h4><p>按当前地区与工具，没有套餐的参考月额度下限（官方或中置信折算）能覆盖约 ${esc(fmtTok(monthlyM))} tokens/月。可以减少用量假设，或按上方 API 按量费用估算。${esc(basis)}</p></div>`;
  }
  const body = rows.slice(0, 5).map((row) => {
    const saving = row.apiMonthlyCNY == null ? "—" : row.apiMonthlyCNY > row.quote.monthlyCNY
      ? `约 ${fmtCalcCNY(row.apiMonthlyCNY)}，订阅每月省约 ${fmtCalcCNY(row.apiMonthlyCNY - row.quote.monthlyCNY)}`
      : `约 ${fmtCalcCNY(row.apiMonthlyCNY)}，按量更省`;
    const breakEven = row.breakEvenM == null ? "—" : `超过约 ${fmtTok(row.breakEvenM)} tokens/月`;
    return `<tr><th scope="row" data-label="套餐">${esc(planTitle(row.p))}</th><td data-label="模型">${esc(displayModelName(row.m.model))}</td><td data-label="所选付款月均">${esc(priceLine(row.p))}</td><td data-label="参考月额度下限">${esc(fmtTok(row.c.moLow))}（置信${esc(row.conf)}）</td><td data-label="同模型按量">${esc(saving)}</td><td data-label="订阅回本点">${esc(breakEven)}</td></tr>`;
  }).join("");
  return `<div class="usage-coverage"><h4>能覆盖这个用量的套餐（${rows.length} 档，列前 5）</h4><div class="table-wrap" tabindex="0" role="region" aria-label="能覆盖用量的套餐，可横向滚动"><table class="mini-table usage-coverage-table"><caption class="sr-only">参考月额度下限不低于约 ${esc(fmtTok(monthlyM))} tokens/月的套餐</caption><thead><tr><th scope="col">套餐</th><th scope="col">模型</th><th scope="col">所选付款月均</th><th scope="col">参考月额度下限</th><th scope="col">同模型按量</th><th scope="col">订阅回本点</th></tr></thead><tbody>${body}</tbody></table></div>` +
    `<p class="maintenance-meta">沿用帮我选的地区、工具和付款方式；只统计官方或中置信折算的额度，第三方与请求次数估算不列入。不同模型的 token 不等价，参考额度不保证可用量。「订阅回本点」指同模型按量费用追平月费所需的用量。${esc(basis)}</p></div>`;
}

/* ---------- 从 ccusage 导入用量 ---------- */
const USAGE_IMPORT_MAX = 5 * 1024 * 1024;
/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组。
   只读取 token 计数和日期 / 月份。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
function parseUsageExport(text) {
  if (String(text).length > USAGE_IMPORT_MAX) throw new Error("文件超过 5MB，请只导出最近的按日用量。");
  let json;
  try { json = JSON.parse(String(text)); } catch (err) { throw new Error("不是有效的 JSON，请粘贴 ccusage 的 --json 输出。"); }
  const rows = Array.isArray(json) ? json
    : !json || typeof json !== "object" ? []
    : Array.isArray(json.daily) ? json.daily
    : Array.isArray(json.monthly) ? json.monthly
    : Array.isArray(json.data) ? json.data
    : Array.isArray(json.sessions) ? json.sessions
    : json.projects && typeof json.projects === "object" ? Object.values(json.projects).filter(Array.isArray).flat() : [];
  const count = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  const days = new Set(), months = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rowInput = count(row.inputTokens), rowOutput = count(row.outputTokens);
    const read = count(row.cacheReadTokens), write = count(row.cacheCreationTokens), cached = count(row.cachedInputTokens);
    /* Codex 的 cachedInputTokens 是输入的子集；Claude 的缓存读写不含在 inputTokens 里。 */
    const codexCached = !row.cacheReadTokens && cached > 0 && cached <= rowInput;
    input += codexCached ? rowInput : rowInput + read + write + (cached > rowInput ? cached : 0);
    cacheRead += codexCached ? cached : read + (cached > rowInput ? cached : 0);
    cacheWrite += write;
    output += rowOutput;
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) days.add(date);
    const month = typeof row.month === "string" ? row.month.slice(0, 7) : "";
    if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
  }
  const total = input + output;
  if (!(total > 0)) throw new Error("没有读到 token 用量；请确认粘贴的是 ccusage daily 或 monthly 的 --json 输出。");
  const sortedDays = [...days].sort();
  const spanDays = sortedDays.length ? Math.round((Date.parse(sortedDays[sortedDays.length - 1] + "T00:00:00Z") - Date.parse(sortedDays[0] + "T00:00:00Z")) / 86400000) + 1 : 0;
  return { input, output, cacheRead, cacheWrite, total, activeDays: days.size, spanDays, months: months.size,
    inputShare: input / total * 100, cacheRate: input > 0 ? cacheRead / input * 100 : 0 };
}
/* 把导入结果折成计算器的「每天请求数 × 每次 tokens × 每月天数」：保留当前请求数，只换算每次 tokens。
   按日记录用有用量的天数占比推算每月使用天数（不足一周的记录沿用当前天数）；按月记录取月均。 */
function usageToCalculator(usage, state = calcState) {
  const round1 = (n) => String(Math.round(n * 10) / 10);
  let days = Math.max(1, Math.min(31, Number(state.days) || 22)), daily;
  if (usage.activeDays) {
    if (usage.spanDays >= 7) days = Math.max(1, Math.min(31, Math.round(usage.activeDays / usage.spanDays * 30.44)));
    daily = usage.total / usage.activeDays;
  } else daily = usage.total / Math.max(1, usage.months) / days;
  let requests = Math.max(1, Number(state.requests) || 100);
  if (daily / requests > 10000000) requests = Math.min(100000, Math.ceil(daily / 10000000));
  const tokens = Math.max(1, Math.min(10000000, Math.round(daily / requests)));
  return { requests: String(requests), tokens: String(tokens), days: String(days),
    input: round1(Math.min(100, usage.inputShare)), cache: round1(Math.min(100, usage.cacheRate)) };
}
function importUsageText(text) {
  const feedback = byId("usageImportFeedback");
  try {
    const usage = parseUsageExport(text);
    const values = usageToCalculator(usage);
    updateAppState(() => {
      setCostInputs(values);
      const match = Object.entries(COST_SCENARIOS).find(([, s]) => s.input === values.input && s.cache === values.cache);
      calcState.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
    }, () => { renderCostCalculator(); syncCostChips(); });
    const period = usage.activeDays ? `${usage.activeDays} 个有用量的日子` : usage.months ? `${usage.months} 个月` : "导入的记录";
    if (feedback) feedback.textContent = `已导入 ${period}：共 ${fmtTok(usage.total / 1e6)} tokens，输入占比 ${values.input}%，缓存命中 ${values.cache}%` +
      `${usage.cacheWrite ? `（另有缓存写入 ${fmtTok(usage.cacheWrite / 1e6)}，计入输入、未单独计价）` : ""}。已换算为每天 ${values.requests} 次 × ${values.tokens} tokens × ${values.days} 天。`;
  } catch (err) {
    if (feedback) feedback.textContent = err instanceof Error ? err.message : String(err);
  }
}
function bindUsageImport() {
  const button = byId("usageImportBtn"), text = byId("usageImportText"), file = byId("usageImportFile");
  if (button && text) button.addEventListener("click", () => importUsageText(text.value));
  if (file) file.addEventListener("change", () => {
    const chosen = file.files && file.files[0];
    if (!chosen) return;
    const feedback = byId("usageImportFeedback");
    if (chosen.size > USAGE_IMPORT_MAX) { if (feedback) feedback.textContent = "文件超过 5MB，请只导出最近的按日用量。"; return; }
    chosen.text().then((content) => { if (text) text.value = content.slice(0, 20000); importUsageText(content); },
      () => { if (feedback) feedback.textContent = "无法读取这个文件，请改为粘贴 JSON。"; });
  });
}
function bindServiceEvents() {
  const payment = byId("pickerPayment");
  if (payment) payment.open = pickerState.billing !== "M";
  [["shareResultsBtn",shareCurrentResults],["copySummaryBtn",copyPickerSummary],["savePresetBtn",savePreset],["loadPresetBtn",restorePreset],["clearPresetBtn",clearPreset],["checkWorkloadBtn",openWorkloadCalculator]].forEach(([id,fn]) => { const b = byId(id); if (b) b.addEventListener("click", fn); });
  const select = byId("costModel");
  if (select) select.innerHTML = API_PRICES.filter((a) => isPriceConfirmed(a,"api")).map((a) => `<option value="${esc(a.vendor + "|" + a.model)}">${esc(a.vendor + " · " + displayModelName(a.label || a.model))}</option>`).join("");
  syncServiceControls(); syncPresetButtons(); renderCostCalculator(); bindUsageImport();
  for (const [key,id] of Object.entries(COST_CONTROLS)) {
    const input = byId(id); if (!input) continue;
    input.addEventListener(key === "model" ? "change" : "input", () => {
      if (!validCalcValue(key,input.value)) { byId("costResult").textContent = "请输入输入框范围内的有效数字。"; syncCostChips(); return; }
      updateAppState(() => {
        calcState[key] = input.value;
        if (key === "model") { calcState.cachePrice = ""; byId("costCachePrice").value = ""; }
        /* 手动改输入占比或缓存率后，只有仍与某个示例情景完全一致时才保留该情景；否则回到默认，分享链接不残留旧情景。 */
        if (key === "input" || key === "cache") {
          const match = Object.entries(COST_SCENARIOS).find(([, s]) => String(s.input) === String(calcState.input) && String(s.cache) === String(calcState.cache));
          calcState.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
        }
      }, () => { renderCostCalculator(); syncCostChips(); });
    });
  }
  const reset = byId("costResetBtn"); if (reset) reset.addEventListener("click", () => updateAppState(() => { Object.assign(calcState,APP_DEFAULTS.calc); syncServiceControls(); },renderCostCalculator));
  const form = byId("costForm"); if (form) form.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
    const scope = target.closest("[data-apply-picker]");
    if (scope) { applyPickerScope(scope.dataset.applyPicker); return; }
    const presetButton = target.closest("[data-cost-preset]");
    if (presetButton && COST_PRESETS[presetButton.dataset.costPreset]) {
      updateAppState(() => { setCostInputs(COST_PRESETS[presetButton.dataset.costPreset]); },renderCostCalculator);
      return;
    }
    const scenarioButton = target.closest("[data-cost-scenario]");
    if (scenarioButton && COST_SCENARIOS[scenarioButton.dataset.costScenario]) {
      const scenario = COST_SCENARIOS[scenarioButton.dataset.costScenario];
      updateAppState(() => { setCostInputs({ scenario:scenarioButton.dataset.costScenario,input:scenario.input,cache:scenario.cache }); },renderCostCalculator);
      return;
    }
    const details = target.closest("[data-view-plan]"); if (details) showPlanDetails(details.dataset.viewPlan,details);
    if (target.closest("#picker .chip") || target.closest("[data-set-picker]")) { syncServiceControls(); renderCostCalculator(); }
  });
  const dlg = byId("planDetailsModal");
  if (dlg) {
    dlg.addEventListener("close",finishPlanDetailsClose);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closePlanDetails(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closePlanDetails(); }
      if (e.key === "Tab" && dlg.classList.contains("cmp-fallback")) {
        const buttons = modalFocusableElements(dlg);
        const first = buttons[0], last = buttons[buttons.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusTableControl(last); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusTableControl(first); }
      }
    });
  }
  const close = byId("planDetailsCloseBtn"); if (close) close.addEventListener("click",closePlanDetails);
  const backdrop = byId("planDetailsBackdrop"); if (backdrop) backdrop.addEventListener("click",closePlanDetails);
}
