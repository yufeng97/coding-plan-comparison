/* 分享、常用条件、完整权益与工作量计算；纯静态运行，不发送或上传用户输入。 */
"use strict";
const PRESET_KEY = "cp-filter-preset-v1";
const COST_CONTROLS = { model:"costModel", requests:"costRequests", tokens:"costTokens", days:"costDays", input:"costInput", cache:"costCache", cachePrice:"costCachePrice", budget:"costBudget" };
const SERVICE_TOOL_LABELS = { any:"不限工具", claude:"Claude Code", codex:"Codex", cursor:"Cursor", own:"自家客户端" };
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
  const cache = calcState.cachePrice === "" ? "未填写缓存单价，按普通输入价估算；填写官网缓存价后可计算节省。" : "缓存按所填命中率计费，无缓存时约 " + fmtCNY(result.noCacheCNY) + "/月。";
  const check = priceCheckOf(api, "api");
  const main = chooseMain(eligibleProfiles());
  let quota = "";
  if (main) {
    const taskRole = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const modelKey = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
    const specific = METRICS_ALL.filter((m) => metricMatchesPlan(m,main.p) && modelKey(m.model) === modelKey(api.model))
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
  }
  el.innerHTML = `<p><strong>预计月费 ${esc(currency + Number(result.costNative.toFixed(2)))} ≈ ${esc(fmtCNY(result.costCNY))}</strong> · ${esc(fmtTok(result.monthlyM))} 总 tokens/月</p>` +
    `<p>${esc(cap)}。${result.costCNY > Number(calcState.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。"}</p><p>${esc(cache)}</p>` +
    `<p>按 ${esc(calcState.days)} 个工作日、每天 ${esc(calcState.requests)} 次请求，每个工作日约 ${esc(fmtCNY(result.costCNY / Number(calcState.days)))}${Number(calcState.requests) > 0 ? `，每次约 ${esc(fmtCNY(result.costCNY / Number(calcState.days) / Number(calcState.requests)))}` : ""}。${result.costCNY <= Number(calcState.budget) ? `月预算剩余约 ${esc(fmtCNY(Number(calcState.budget) - result.costCNY))}` : `月预算需补约 ${esc(fmtCNY(result.costCNY - Number(calcState.budget)))}`}。</p>` +
    `<p>工具与地区沿用「帮我选」：${esc(SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具")} · ${esc(REGION_LABEL[pickerState.region] || "不限地区")}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>` +
    `<p>工作量上下浮动 20% 时约 ${esc(fmtCNY(result.costCNY * 0.8))}–${esc(fmtCNY(result.costCNY * 1.2))}/月（情景范围）。牌价核查 ${esc(check ? check.checkedAt : "未核实")} · <a href="${safeHref(api.url)}" target="_blank" rel="noopener">官网计费规则</a></p>` + quota;
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
  [["shareResultsBtn",shareCurrentResults],["savePresetBtn",savePreset],["loadPresetBtn",restorePreset],["clearPresetBtn",clearPreset]].forEach(([id,fn]) => { const b = byId(id); if (b) b.addEventListener("click", fn); });
  const select = byId("costModel");
  if (select) select.innerHTML = API_PRICES.filter((a) => isPriceConfirmed(a,"api")).map((a) => `<option value="${esc(a.vendor + "|" + a.model)}">${esc(a.vendor + " · " + displayModelName(a.label || a.model))}</option>`).join("");
  syncServiceControls(); syncPresetButtons(); renderCostCalculator();
  for (const [key,id] of Object.entries(COST_CONTROLS)) {
    const input = byId(id); if (!input) continue;
    input.addEventListener(key === "model" ? "change" : "input", () => {
      if (!validCalcValue(key,input.value)) { byId("costResult").textContent = "请输入输入框范围内的有效数字。"; return; }
      updateAppState(() => { calcState[key] = input.value; if (key === "model") { calcState.cachePrice = ""; byId("costCachePrice").value = ""; } },renderCostCalculator);
    });
  }
  const reset = byId("costResetBtn"); if (reset) reset.addEventListener("click", () => updateAppState(() => { Object.assign(calcState,APP_DEFAULTS.calc); syncServiceControls(); },renderCostCalculator));
  const form = byId("costForm"); if (form) form.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
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
        const buttons = [...dlg.querySelectorAll("button,a[href],[tabindex]")].filter((el) => !el.disabled && el.tabIndex !== -1);
        const first = buttons[0], last = buttons[buttons.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusTableControl(last); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusTableControl(first); }
      }
    });
  }
  const close = byId("planDetailsCloseBtn"); if (close) close.addEventListener("click",closePlanDetails);
  const backdrop = byId("planDetailsBackdrop"); if (backdrop) backdrop.addEventListener("click",closePlanDetails);
}
