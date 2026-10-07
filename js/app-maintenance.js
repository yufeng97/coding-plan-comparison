/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */
"use strict";

const FOLLOW_KEY = "cp-followed-plans-v1";
let followState = { version: 1, planIds: [], readChangeIds: [] };
let followStorageAvailable = true;
let followStorageMessage = "";
let maintenancePlanId = "";
let maintenanceRecordFilter = "all";
let benchmarkFilter = { task: "all", tool: "all", model: "all" };

/** @returns {MaintenanceSnapshot} */
function maintenanceData() {
  return typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
    ? /** @type {MaintenanceSnapshot} */ (MAINTENANCE)
    : { schemaVersion: 1, generatedAt: "", checkedThrough: "", summary: { total: 0, verified: 0, unverified: 0, stale: 0 }, records: [], reviews: [], changes: [] };
}
/** @returns {BenchmarkSnapshot} */
function benchmarkData() {
  return typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1
    ? /** @type {BenchmarkSnapshot} */ (BENCHMARKS)
    : { schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "" };
}
function cleanFollowState(value) {
  const planIds = new Set(PLANS.map((p) => p.id));
  const changeIds = new Set(maintenanceData().changes.map((c) => c.changeId));
  const clean = (values, allowed, max) => Array.isArray(values)
    ? [...new Set(values.filter((v) => typeof v === "string" && allowed.has(v)))].slice(0, max) : [];
  return { version: 1, planIds: clean(value && value.planIds, planIds, 500), readChangeIds: clean(value && value.readChangeIds, changeIds, 10000) };
}
function loadFollowState() {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    followState = cleanFollowState(raw ? JSON.parse(raw) : null);
  } catch (e) {
    followStorageAvailable = false;
    followStorageMessage = "本机关注存储不可用或已损坏；本页仍可关注，关闭后不会保留。";
  }
}
function persistFollowState() {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(followState));
    followStorageAvailable = true; followStorageMessage = "";
  } catch (e) {
    followStorageAvailable = false;
    followStorageMessage = "本机关注存储不可用；本页操作已生效，关闭后不会保留。";
  }
}
function isPlanFollowed(id) { return followState.planIds.includes(id); }
function watchButtonHtml(p, extraClass = "") {
  if (!p || !p.id) return "";
  const on = isPlanFollowed(p.id);
  return `<button type="button" class="watch-plan ${esc(extraClass)}${on ? " on" : ""}" data-watch-plan="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? "取消关注" : "关注"} ${esc(planTitle(p))}">${on ? "已关注" : "关注"}</button>`;
}
function syncWatchButtons() {
  qsa("[data-watch-plan]").forEach((b) => {
    const p = PLANS.find((plan) => plan.id === b.dataset.watchPlan);
    if (!p) return;
    const on = isPlanFollowed(p.id);
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "取消关注" : "关注"} ${planTitle(p)}`);
    b.textContent = on ? "已关注" : "关注";
  });
}
function followedChanges() {
  return maintenanceData().changes.filter((c) => followState.planIds.includes(c.id));
}
function unreadFollowedChanges() {
  return followedChanges().filter((c) => !followState.readChangeIds.includes(c.changeId));
}
function followFeedback(text) {
  const el = byId("followFeedback");
  if (el) el.textContent = text + (followStorageMessage ? " " + followStorageMessage : "");
  const dialog = byId("planFollowFeedback");
  if (dialog) dialog.textContent = text + (followStorageMessage ? " " + followStorageMessage : "");
}
function toggleFollowPlan(id) {
  const p = PLANS.find((plan) => plan.id === id);
  if (!p) return false;
  const focus = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusId = focus && focus.dataset ? focus.dataset.watchPlan : "";
  const fromUpdates = focus && byId("updates") && byId("updates").contains(focus);
  const on = isPlanFollowed(id);
  followState.planIds = on ? followState.planIds.filter((v) => v !== id) : [...followState.planIds, id];
  persistFollowState(); syncWatchButtons(); renderFollowedChanges();
  followFeedback(`${on ? "已取消关注" : "已关注"} ${planTitle(p)}。关注与已读记录仅保存在本机，不上传，也不包含在分享链接中。`);
  if (fromUpdates && focusId && focus.isConnected === false) {
    const replacement = byId("followedPlans").querySelector(`[data-watch-plan="${focusId}"]`);
    if (!focusTableControl(replacement)) focusTableControl(byId("maintenancePlan"));
  }
  return true;
}
function markFollowedChangesRead() {
  followState.readChangeIds = [...new Set([...followState.readChangeIds, ...followedChanges().map((c) => c.changeId)])];
  persistFollowState(); renderFollowedChanges();
  followFeedback("已将当前关注套餐的已确认变更标为已读；之后新收录的变更仍会提示。");
  focusTableControl(byId("maintenancePlan"));
}
function maintenanceSources(urls) {
  return (urls || []).filter((url) => /^https:\/\//i.test(url) && safeHref(url)).map((url, i) =>
    `<a href="${safeHref(url)}" target="_blank" rel="noopener" tabindex="0">官方证据${i + 1} ↗</a>`).join(" · ");
}
function changeValue(value) {
  if (value == null) return "未记录";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function changeFieldsHtml(change) {
  const labels = { priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", quota: "额度", models: "模型", tools: "工具", note: "备注", status: "核查状态", inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", cacheUSD: "缓存 USD/M", cacheCNY: "缓存 CNY/M" };
  return `<ul class="change-fields">` + change.fields.map((field) => `<li><strong>${esc(labels[field] || field)}</strong>：${esc(changeValue(change.before[field]))} → ${esc(changeValue(change.after[field]))}</li>`).join("") + `</ul>`;
}
function changeCardHtml(change, unread = false) {
  return `<li class="change-card"><div><strong>${esc(change.vendor + " · " + change.name)}</strong>${unread ? '<span class="change-unread">未读</span>' : ""}</div><p class="maintenance-meta">确认于 ${esc(change.checkedAt)} · ${esc(change.kind === "plan" ? "套餐" : change.kind === "api" ? "API" : "按量参考")}</p>${changeFieldsHtml(change)}<p>${maintenanceSources(change.sourceUrls)}</p></li>`;
}
function planHistoryHtml(id) {
  const changes = maintenanceData().changes.filter((c) => c.id === id);
  return `<details class="method-box plan-history"><summary>已确认价格与权益历史（${changes.length} 条）</summary>` +
    (changes.length ? `<ul class="change-list">${changes.map((c) => changeCardHtml(c)).join("")}</ul>` : `<p>尚未收录本档的已确认变更；当前值与核查日期见完整权益。首次收录是基线，不代表曾经涨价或降价。</p>`) + `</details>`;
}
function renderFollowedChanges() {
  const list = byId("followedPlans"), changes = byId("followedChanges"), count = byId("followUnreadCount"), read = byId("markFollowReadBtn");
  if (!list || !changes || !count || !read) return;
  const plans = followState.planIds.map((id) => PLANS.find((p) => p.id === id)).filter(Boolean);
  list.innerHTML = plans.length ? plans.map((p) => `<div class="followed-plan"><button type="button" class="chip" data-view-plan="${esc(p.id)}">${esc(planTitle(p))}</button>${watchButtonHtml(p)}</div>`).join("") : `<p>在推荐卡、数据表或完整权益里点击「关注」，下次访问即可查看这些套餐的变更。</p>`;
  const unread = unreadFollowedChanges();
  count.textContent = `${plans.length} 档关注 · ${unread.length} 条未读变更`;
  read.disabled = !unread.length;
  changes.innerHTML = unread.length ? `<ul class="change-list">${unread.map((c) => changeCardHtml(c, true)).join("")}</ul>` : `<p>${plans.length ? "当前关注套餐没有未读的已确认变更。" : "关注后会展示本站收录的已确认变更。"}</p>`;
  const storage = byId("followStorageNote");
  if (storage) storage.textContent = followStorageMessage || "只在当前浏览器保存关注与已读记录；不上传，不跨设备同步，清理浏览器数据后会消失。";
}
function renderMaintenanceHistory() {
  const el = byId("maintenanceHistory"), select = byId("maintenancePlan");
  if (!el || !select) return;
  const p = PLANS.find((plan) => plan.id === maintenancePlanId);
  select.value = maintenancePlanId;
  if (!p) { el.innerHTML = "<p>选择套餐，查看当前核查状态与已确认变更。</p>"; return; }
  const record = maintenanceData().records.find((r) => r.id === p.id);
  el.innerHTML = `<div class="maintenance-plan-actions">${watchButtonHtml(p)}<button type="button" class="chip" data-view-plan="${esc(p.id)}">完整权益</button></div>` +
    `<p>${esc(record ? `核查 ${record.checkedAt || "日期未记录"} · ${maintenanceStatusLabel(record.status)}${record.stale ? " · 已超过复查间隔" : ""}` : "暂无逐条维护记录")}。日期为本站核查日。</p>${planHistoryHtml(p.id)}`;
}
function maintenanceStatusLabel(status) {
  return { verified: "已核实", changed: "核价信息已校正", unverified: "待核实", custom: "定制询价", retired: "已停售" }[status] || status || "待核实";
}
function renderMaintenanceRecords() {
  const el = byId("maintenanceRecords"); if (!el) return;
  const rows = maintenanceData().records.filter((r) => maintenanceRecordFilter === "all" || (maintenanceRecordFilter === "stale" ? r.stale : r.status === "unverified"));
  el.innerHTML = rows.length ? `<ul class="maintenance-records">${rows.map((r) => `<li><strong>${esc(r.vendor + " · " + r.name)}</strong><span>${esc(maintenanceStatusLabel(r.status))}${r.stale ? " · 超期" : ""} · ${esc(r.checkedAt || "未核查")}</span>${maintenanceSources(r.sourceUrls)}</li>`).join("")}</ul>` : "<p>当前条件没有记录。</p>";
}
function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function renderMaintenance() {
  const data = maintenanceData(), el = byId("maintenanceSummary"); if (!el) return;
  const s = data.summary;
  el.innerHTML = data.generatedAt ? `<p>维护快照 ${esc(data.generatedAt)} · 核查覆盖至 ${esc(data.checkedThrough || "未记录")}。快照按 ${esc(data.staleAfterDays || 14)} 天复查间隔标记超期。</p><dl class="trust-counts"><div><dt>覆盖记录</dt><dd>${s.total}</dd></div><div><dt>已核实</dt><dd>${s.verified}</dd></div><div><dt>待核实</dt><dd>${s.unverified}</dd></div><div><dt>需复查</dt><dd>${s.stale}</dd></div></dl>` : "<p>维护快照暂未生成，请在完整数据表核对逐条来源。</p>";
  const select = byId("maintenancePlan");
  if (select) select.innerHTML = '<option value="">选择套餐</option>' + PLANS.map((p) => `<option value="${esc(p.id)}">${esc(planTitle(p))}</option>`).join("");
  const due = data.reviews.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn) && r.reviewOn <= todayLocalIso());
  const reviews = byId("maintenanceReviews");
  if (reviews) reviews.innerHTML = due.length ? `<ul class="review-list">${due.map((r) => `<li><strong>${esc(r.title)}</strong> · 复查日 ${esc(r.reviewOn)}${r.reviewOn < todayLocalIso() ? "（已到期）" : "（今天到期）"}<p>${esc(r.note || "到期需人工复查，不能据此认定价格或权益已变化。")}</p>${maintenanceSources([r.source])}</li>`).join("")}</ul>` : "<p>当前没有已到期的复查安排。复查提示按本机日期计算，不代表已重新核验。</p>";
  renderMaintenanceHistory(); renderMaintenanceRecords(); renderFollowedChanges();
}
function benchmarkFilterOptions(key) {
  return [...new Set(benchmarkData().runs.map((r) => r[key]).filter((v) => typeof v === "string" && v))].sort();
}
function benchmarkText(value) { return Array.isArray(value) ? value.join("；") : String(value || ""); }
function benchmarkRunHtml(run) {
  const task = benchmarkData().tasks.find((t) => t.id === run.taskId);
  const cost = run.costBasis === "api-receipt" && typeof run.cost === "number" && Number.isFinite(run.cost) && run.cost >= 0 ? `${run.currency} ${run.cost}` : run.costBasis === "included-subscription" ? "订阅内使用，未分摊单次费用" : "费用未记录";
  const duration = typeof run.durationSeconds === "number" && Number.isFinite(run.durationSeconds) ? `${run.durationSeconds} 秒` : "未记录";
  const generation = typeof run.generationSeconds === "number" && Number.isFinite(run.generationSeconds) ? `${run.generationSeconds} 秒` : "未记录";
  const evidence = /^https:\/\//i.test(run.evidence || "") && safeHref(run.evidence) ? `<a href="${safeHref(run.evidence)}" target="_blank" rel="noopener" tabindex="0">复现证据 ↗</a>` : "复现证据未记录";
  return `<li class="benchmark-run"><h3>${esc(task ? task.title : run.taskId)} · ${esc(run.model)}</h3><p>${esc(run.tool)} · ${esc(run.measuredAt)} · ${run.passed === true ? "全部验收通过" : run.passed === false ? "验收未全部通过" : "验收状态未记录"}</p><dl class="benchmark-values"><div><dt>生成费用</dt><dd>${esc(cost)}</dd></div><div><dt>生成时间</dt><dd>${esc(generation)}</dd></div><div><dt>平均验收运行时间</dt><dd>${esc(duration)}</dd></div><div><dt>同一解答验收次数</dt><dd>${esc(run.repeats)}</dd></div></dl><p>环境：${esc(run.environment || "未记录")}</p><p>${evidence}</p></li>`;
}
function renderBenchmarks() {
  const el = byId("benchmarkResults"); if (!el) return;
  const data = benchmarkData();
  const rows = data.runs.filter((r) => (benchmarkFilter.task === "all" || r.taskId === benchmarkFilter.task) && (benchmarkFilter.tool === "all" || r.tool === benchmarkFilter.tool) && (benchmarkFilter.model === "all" || r.model === benchmarkFilter.model));
  el.innerHTML = rows.length ? `<p>符合条件 ${rows.length} 条解答记录。不同任务、环境与币种分别展示，不合并成成功率或性能排名。</p><ul class="benchmark-runs">${rows.map(benchmarkRunHtml).join("")}</ul>` : `<p class="benchmark-empty">${data.runs.length ? "当前筛选没有测评记录。" : "尚未公布真实模型测评结果。下面提供可复现任务与验收规范；未测量的费用、时间和结果不填充为分数。"}</p>`;
  const tasks = byId("benchmarkTasks");
  if (tasks) tasks.innerHTML = data.tasks.filter((t) => benchmarkFilter.task === "all" || t.id === benchmarkFilter.task).map((t) => `<details class="method-box"><summary>${esc(t.title)}</summary><p>${esc(t.description)}</p><p><strong>验收条件：</strong>${esc(benchmarkText(t.acceptance))}</p><p>任务标识：<code>${esc(t.id)}</code></p></details>`).join("");
  const method = byId("benchmarkMethodology"); if (method) method.textContent = benchmarkText(data.methodology);
}
function contributionTemplate(type) {
  const p = PLANS.find((plan) => plan.id === maintenancePlanId);
  const common = `\n\n## 官方证据\n- HTTPS 来源链接：\n- 核对日期（YYYY-MM-DD）：\n- 官方原文/截图链接：\n- 适用国家、账号资格与活动限制：\n\n## 变更内容\n- 当前页面显示：\n- 应修正/补充为：\n- 价格币种、计费周期与全年总额：\n- 模型、工具、共享额度与重置窗口：\n\n不要填写账号、API Key、付款隐私或未获许可的内容。\n`;
  if (type === "benchmark") {
    const taskId = benchmarkFilter.task === "all" ? (benchmarkData().tasks[0] || {}).id || "" : benchmarkFilter.task;
    return `# 提交可复现真实任务测评\n\n任务：${taskId}\n模型及精确版本：\n工具及版本：\n生成日期（YYYY-MM-DD）：\n实际生成时间 generationSeconds（秒，未记录填 null）：\n实际 API 账单 cost / currency：\n费用依据 costBasis（api-receipt / included-subscription / unknown）：\n同一解答重复验收次数 repeats：\n平均验收运行时间 durationSeconds（秒）：\n该解答是否全部验收通过 passed：\n操作系统、运行时与环境 environment：\nHTTPS 可公开证据 evidence：\n\n请附原始提示、模型原始解答、验收输出与费用凭证。订阅内使用或费用未知时 cost=null；repeats 是同一解答验收次数，不是模型独立尝试次数。durationSeconds 不能作为模型生成时间。不要上传 API Key 或付费账号信息。\n`;
  }
  return `# ${type === "vendor" ? "申请收录新厂商 / 套餐" : "套餐纠错 / 更新证据"}\n\n厂商：${p ? p.vendor : ""}\n套餐：${p ? p.plan : ""}\n永久套餐 ID：${p ? p.id : ""}${common}`;
}
function renderContribution() {
  const select = byId("contributionType"), preview = byId("contributionTemplate"); if (!select || !preview) return;
  preview.value = contributionTemplate(select.value);
  const issue = byId("contributionIssueLink"), status = byId("contributionProjectNote");
  const base = typeof PUBLIC_PROJECT !== "undefined" ? PUBLIC_PROJECT.githubIssuesBase : null;
  const href = typeof base === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/?$/.test(base) ? safeHref(base) : "";
  if (issue) { issue.hidden = !href; if (href) issue.setAttribute("href", href); }
  if (status) status.textContent = href ? "可复制证据模板后，到项目 Issues 提交；模板中请只包含可公开资料。" : "当前未配置公开仓库提交地址。可复制或下载证据模板，交给项目维护者；本站不会自动发送或上传。";
}
async function copyContributionTemplate() {
  const preview = byId("contributionTemplate"), feedback = byId("contributionFeedback"); if (!preview || !feedback) return;
  const ok = await copyTextToClipboard(preview.value);
  feedback.textContent = ok ? "证据模板已复制；请补全真实来源后提交。" : "未能访问剪贴板，请选择下面的模板手动复制，或下载文件。";
  if (!ok) { preview.focus(); if (typeof preview.select === "function") preview.select(); }
}
function downloadContributionTemplate() {
  const select = byId("contributionType"), preview = byId("contributionTemplate"); if (!select || !preview) return;
  downloadTextFile(preview.value, `coding-plan-${select.value}-evidence.md`, "text/markdown;charset=utf-8");
  const feedback = byId("contributionFeedback"); if (feedback) feedback.textContent = "已生成本地证据模板文件；请补全后交给维护者，文件没有上传。";
}
function downloadPublicData() {
  const data = { schemaVersion: 1, meta: META, plans: PLANS, apiPrices: API_PRICES, paygReferences: PAYG_REFERENCES, priceChecks: PRICE_CHECKS, maintenance: maintenanceData(), benchmarks: benchmarkData() };
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", `coding-plan-public-data-${META.updated}.json`, "application/json;charset=utf-8");
  const feedback = byId("publicDataFeedback"); if (feedback) feedback.textContent = "已生成公开数据 JSON；不含本机关注、已读记录或待审队列。";
}
function bindMaintenanceEvents() {
  loadFollowState(); renderMaintenance(); syncWatchButtons();
  [["maintenancePlan", () => { maintenancePlanId = byId("maintenancePlan").value; renderMaintenanceHistory(); renderContribution(); }], ["maintenanceRecordFilter", () => { maintenanceRecordFilter = byId("maintenanceRecordFilter").value; renderMaintenanceRecords(); }], ["contributionType", renderContribution]].forEach(([id, handler]) => { const el = byId(id); if (el) el.addEventListener("change", handler); });
  const data = benchmarkData();
  const task = byId("benchmarkTask"); if (task) task.innerHTML = '<option value="all">全部任务</option>' + data.tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("");
  for (const key of ["tool", "model"]) {
    const select = byId(key === "tool" ? "benchmarkTool" : "benchmarkModel");
    if (select) select.innerHTML = `<option value="all">${key === "tool" ? "全部工具" : "全部模型"}</option>` + benchmarkFilterOptions(key).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  }
  for (const [key, id] of Object.entries({ task: "benchmarkTask", tool: "benchmarkTool", model: "benchmarkModel" })) {
    const select = byId(id); if (select) select.addEventListener("change", () => {
      const allowed = key === "task" ? data.tasks.map((t) => t.id) : benchmarkFilterOptions(key);
      benchmarkFilter[key] = allowed.includes(select.value) ? select.value : "all";
      renderBenchmarks(); renderContribution();
    });
  }
  [["markFollowReadBtn", markFollowedChangesRead], ["copyContributionBtn", copyContributionTemplate], ["downloadContributionBtn", downloadContributionTemplate], ["downloadPublicDataBtn", downloadPublicData]].forEach(([id, handler]) => { const b = byId(id); if (b) b.addEventListener("click", handler); });
  document.addEventListener("click", (e) => {
    const target = evtTarget(e); if (!target || !target.closest) return;
    const watch = target.closest("[data-watch-plan]"); if (watch) toggleFollowPlan(watch.dataset.watchPlan);
  });
  renderBenchmarks(); renderContribution();
}
