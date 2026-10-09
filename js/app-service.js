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
  const tasks = { hard:"复杂任务为主", daily:"日常为主", both:"复杂和日常都有" };
  const summary = byId("pickerAdvancedSummary");
  if (summary) summary.textContent = "工具与任务：" + SERVICE_TOOL_LABELS[pickerState.tool] + " · " + tasks[pickerState.task];
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
  for (const { name,state } of [{ name:"personal",state:personalState },{ name:"metrics",state:metricsState },{ name:"table",state:tableState }]) {
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
      table:"保留目录月付/年付价，并另标选购口径。",
    }[name];
    if (scope) scope.textContent = applied
      ? "已应用选购条件：" + pickerScopeText() + "。" + pricing + "继续叠加本区筛选。"
      : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。";
  }
}
function applyPickerScope(name) {
  const scopes = { personal: { state:personalState,render:renderPersonalChart }, metrics: { state:metricsState,render:renderMetricsTable }, table: { state:tableState,render:renderTable } };
  const scope = scopes[name];
  if (!scope) return;
  updateAppState(() => { scope.state.fromPicker = !scope.state.fromPicker; }, () => {
    scope.render();
    syncPickerScopeControls();
  });
}
function costModelKey(text) { return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
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

/* 使用总tokens（输入+输出），缓存率只作用于输入；未给缓存价时按普通输入计费。 */
function calculateWorkload(state, api) {
  if (!api || !Object.keys(COST_CONTROLS).every((key) => validCalcValue(key, state[key]))) return null;
  const inputPrice = api.cur === "CNY" ? api.inCNY : api.inUSD;
  const outputPrice = api.cur === "CNY" ? api.outCNY : api.outUSD;
  const cachePrice = state.cachePrice === "" ? inputPrice : Number(state.cachePrice);
  if (![inputPrice,outputPrice,cachePrice].every((v) => Number.isFinite(v) && v >= 0) || cachePrice > inputPrice) return null;
  const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
  const blended = inputShare * (cacheShare * cachePrice + (1-cacheShare) * inputPrice) + (1-inputShare) * outputPrice;
  const monthlyM = Number(state.requests) * Number(state.tokens) * Number(state.days) / 1e6;
  const costNative = monthlyM * blended, costCNY = toCNY(costNative, api.cur);
  const noCacheCNY = toCNY(monthlyM * (inputShare * inputPrice + (1-inputShare) * outputPrice), api.cur);
  const monthlyBudgetM = blended > 0 ? Number(state.budget) / toCNY(blended, api.cur) : null;
  return { monthlyM, blended, costNative, costCNY, noCacheCNY, monthlyBudgetM };
}
function calculateCostScenarios(state, api) {
  return Object.entries(COST_SCENARIOS).map(([id,scenario]) => {
    const result = calculateWorkload({ ...state,input:scenario.input,cache:scenario.cache },api);
    return result ? { id,...scenario,...result,lowCNY:result.costCNY * 0.8,highCNY:result.costCNY * 1.2 } : null;
  }).filter(Boolean);
}
/* 计算器的小额（如每次请求）保留两位有效数字，避免把 ¥0.032 显示成 ¥0；常规金额沿用页面精度。 */
function fmtCalcCNY(n) {
  if (!Number.isFinite(n)) return "—";
  return n > 0 && n < 1 ? "¥" + Number(n.toPrecision(2)) : fmtCNY(n);
}
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
  const result = calculateWorkload(calcState, api);
  if (!result) { el.textContent = "请输入有效的工作量和预算；缓存单价不能高于普通输入单价。"; return; }
  const currency = currencySymbol(api.cur);
  const cap = result.monthlyBudgetM == null ? "当前单价为零，预算不构成token上限" : "预算可覆盖约 " + fmtTok(result.monthlyBudgetM) + " 总 tokens/月";
  const cache = calcState.cachePrice === "" ? "未填写缓存单价，按普通输入价估算；填写官网缓存价后可计算节省。" : "缓存按所填命中率计费，无缓存时约 " + fmtCalcCNY(result.noCacheCNY) + "/月。";
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
      const baseline = Number(calcState.input) === 80 && Number(calcState.cache) === 95 && Number(calcState.tokens) === 20000;
      const condition = specific && baseline
        ? "按相同基准，你的总量" + (result.monthlyM <= c.moLow ? "低于参考区间下限" : result.monthlyM > c.moHigh ? "高于参考区间上限" : "落在参考区间内") + "；这不能保证实际额度够用。"
        : "";
      const context = !specific ? "所选 API 模型未匹配到该套餐的逐模型额度，无法判断是否够用。" : !baseline ? "你修改了折算假设，参考月量不能直接用于判断是否够用。" : "";
      quota = `<p>当前推荐 ${esc(planTitle(main.p))} · ${esc(displayModelName(metric.m.model))}：参考月量 ${esc(tokSpan(c,"moLow","moHigh"))}（置信${esc(metric.conf)}；表内基准：80% 输入、95% 输入缓存、请求折算 20K tokens/次）。${condition}${context}跨模型 token 不代表等效产出；仍需核对窗口、共享池与工具费用。</p>`;
    } else quota = `<p>当前推荐 ${esc(planTitle(main.p))} 未公开可对照的月 tokens，无法据此保证额度够用。</p>`;
    const quote = typeof pickerPaymentQuote === "function" ? pickerPaymentQuote(main.p) : null;
    if (quote && quote.available && Number.isFinite(quote.monthlyCNY)) quota += `<p>订阅价格参照：${esc(quote.label || "当前支付方式")}月均 ${esc(fmtCalcCNY(quote.monthlyCNY))}。API 账单与订阅分别计费，年付还需核对全年一次支付金额。</p>`;
  }
  const scenarios = calculateCostScenarios(calcState,api);
  const scenarioTable = `<div class="cost-scenario-results"><table class="mini-table"><caption>三种示例计费情景（总工作量上下浮动 20%）</caption><thead><tr><th scope="col">情景与假设</th><th scope="col">基准月费</th><th scope="col">月费范围</th></tr></thead><tbody>` +
    scenarios.map((scenario) => `<tr data-cost-scenario-result="${esc(scenario.id)}"><th scope="row">${esc(scenario.label)}：输入 ${esc(scenario.input)}% / 输出 ${esc(100 - Number(scenario.input))}%，输入缓存 ${esc(scenario.cache)}%</th><td>${esc(fmtCalcCNY(scenario.costCNY))}</td><td>${esc(fmtCalcCNY(scenario.lowCNY))}–${esc(fmtCalcCNY(scenario.highCNY))}</td></tr>`).join("") + `</tbody></table></div>`;
  el.innerHTML = `<p><strong>预计月费 ${esc(currency + fmtCalcNative(result.costNative))} ≈ ${esc(fmtCalcCNY(result.costCNY))}</strong> · ${esc(fmtTok(result.monthlyM))} 总 tokens/月</p>` +
    `<p>${esc(cap)}。${result.costCNY > Number(calcState.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。"}</p><p>${esc(cache)}</p>` +
    `<p>按 ${esc(calcState.days)} 个工作日、每天 ${esc(calcState.requests)} 次请求，每个工作日约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days)))}${Number(calcState.requests) > 0 ? `，每次约 ${esc(fmtCalcCNY(result.costCNY / Number(calcState.days) / Number(calcState.requests)))}` : ""}。${result.costCNY <= Number(calcState.budget) ? `月预算剩余约 ${esc(fmtCalcCNY(Number(calcState.budget) - result.costCNY))}` : `月预算需补约 ${esc(fmtCalcCNY(result.costCNY - Number(calcState.budget)))}`}。</p>` +
    `<p>工具与地区沿用「帮我选」：${esc(SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具")} · ${esc(REGION_LABEL[pickerState.region] || "不限地区")}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>` +
    `<p>上方费用按当前输入 ${esc(calcState.input)}% / 输出 ${esc(100 - Number(calcState.input))}%、输入缓存命中 ${esc(calcState.cache)}% 计算。工作量上下浮动 20% 时约 ${esc(fmtCalcCNY(result.costCNY * 0.8))}–${esc(fmtCalcCNY(result.costCNY * 1.2))}/月。</p>` + scenarioTable +
    `<p>轻度、日常、重度及三种情景都是可编辑的示例假设，不代表真实用户用量，也不是费用预测或套餐额度承诺。典型沿用页面的 80% 输入 / 95% 缓存基准；缓存单价未填写时，三个情景均按普通输入价计费。范围只模拟总工作量 ±20%，不包含价格变动、动态限流、工具费和税费。牌价核查 ${esc(check ? check.checkedAt : "未核实")} · <a href="${safeHref(api.url)}" target="_blank" rel="noopener">官网计费规则</a></p>` + quota;
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
function bindServiceEvents() {
  const hero = byId("heroDetails"), advanced = byId("pickerAdvanced");
  if (hero) hero.open = window.innerWidth > 700;
  if (advanced) advanced.open = window.innerWidth > 700 || pickerState.tool !== "any" || pickerState.task !== "both";
  [["shareResultsBtn",shareCurrentResults],["savePresetBtn",savePreset],["loadPresetBtn",restorePreset],["clearPresetBtn",clearPreset],["checkWorkloadBtn",openWorkloadCalculator]].forEach(([id,fn]) => { const b = byId(id); if (b) b.addEventListener("click", fn); });
  const select = byId("costModel");
  if (select) select.innerHTML = API_PRICES.filter((a) => isPriceConfirmed(a,"api")).map((a) => `<option value="${esc(a.vendor + "|" + a.model)}">${esc(a.vendor + " · " + displayModelName(a.label || a.model))}</option>`).join("");
  syncServiceControls(); syncPresetButtons(); renderCostCalculator();
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
