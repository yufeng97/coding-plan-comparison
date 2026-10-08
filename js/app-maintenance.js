/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */
"use strict";

const FOLLOW_KEY = "cp-followed-plans-v1";
let followState = { version: 1, planIds: [], readChangeIds: [] };
let followStorageAvailable = true;
let followStorageMessage = "";
let maintenancePlanId = "";
let maintenanceRecordFilter = "all";
let benchmarkFilter = { task: "all", tool: "all", model: "all" };
let publicBenchmarkState = { id: "deepswe-v1-1", family: "", search: "", mode: "best" };

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
/** @returns {PublicBenchmarkSnapshot} */
function publicBenchmarkData() {
  const data = benchmarkData().public;
  return data && data.schemaVersion === 1 ? data : { schemaVersion: 1, checkedAt: "", benchmarks: [], scores: [] };
}
function selectedPublicBenchmark() {
  const all = publicBenchmarkData().benchmarks;
  const rows = publicBenchmarkState.family ? all.filter((b) => b.family === publicBenchmarkState.family) : all;
  return rows.find((b) => b.id === publicBenchmarkState.id) || defaultPublicBenchmarkForFamily(publicBenchmarkState.family, rows);
}
function defaultPublicBenchmarkForFamily(family, rows) {
  const preferred = { osworld: "osworld-2-25443e96866dc9ce", hle: "hle-diamond-2026-high-closed-book-multimodal", deepswe: "deepswe-v1-1" }[String(family || "deepswe").toLowerCase()];
  return rows.find((b) => b.id === preferred) || rows[0] || null;
}
function publicBenchmarkFamilyLabel(family) {
  return { deepswe: "DeepSWE · 编程", cursorbench: "CursorBench · 编程", "swe-bench": "SWE-bench · 编程", osworld: "OSWorld · GUI 操作", hle: "HLE · 综合学术" }[family.toLowerCase()] || family;
}
function syncPublicBenchmarkChoices() {
  const protocols = publicBenchmarkData().benchmarks, selected = selectedPublicBenchmark();
  if (selected) { publicBenchmarkState.id = selected.id; publicBenchmarkState.family = selected.family; }
  const family = byId("publicBenchmarkFamily");
  if (family) {
    const order = ["deepswe", "cursorbench", "swe-bench", "osworld", "hle"];
    family.innerHTML = [...new Set(protocols.map((b) => b.family))].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase())).map((f) => `<option value="${esc(f)}">${esc(publicBenchmarkFamilyLabel(f))}</option>`).join("");
    family.value = publicBenchmarkState.family;
  }
  const select = byId("publicBenchmarkSelect");
  if (select) {
    select.innerHTML = `<optgroup label="${esc(publicBenchmarkFamilyLabel(publicBenchmarkState.family || "评测协议"))}">` + protocols.filter((b) => b.family === publicBenchmarkState.family).map((b) => `<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.version)}</option>`).join("") + `</optgroup>`;
    if (selected) select.value = selected.id;
  }
}
function publicBenchmarkRows() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark) return [];
  /* 同一评测协议中的名次固定；搜索只筛行，不把第十名显示成第一名。 */
  let sorted = publicBenchmarkData().scores.filter((r) => r.benchmarkId === benchmark.id && typeof r.score === "number" && Number.isFinite(r.score))
    .slice().sort((a, b) => b.score - a.score || a.model.localeCompare(b.model));
  if (publicBenchmarkState.mode !== "all") {
    const seen = new Set();
    sorted = sorted.filter((r) => { if (seen.has(r.model)) return false; seen.add(r.model); return true; });
  }
  let rank = 0, previousScore = null;
  const ranked = sorted.map((r, i) => { if (previousScore !== r.score) rank = i + 1; previousScore = r.score; return { ...r, rank }; });
  const q = publicBenchmarkState.search.trim();
  return q ? ranked.filter((r) => queryHit(foldSearch([r.model, r.reasoning, r.agent].filter(Boolean).join(" ")), q)) : ranked;
}
function publicBenchmarkSource(url, label) {
  const href = typeof url === "string" && /^https:\/\//i.test(url) ? safeHref(url) : "";
  return href ? `<a href="${href}" target="_blank" rel="noopener" tabindex="0">${esc(label)} ↗</a>` : "来源未公布";
}
function publicScoreText(score, unit) { return Number(score.toFixed(3)) + unit; }
function publicBenchmarkDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value || "未公布";
}
function publicBenchmarkConfiguration(row) {
  return [row.reasoning ? "推理：" + row.reasoning : "推理配置未公布", row.agent ? "Agent：" + row.agent : "Agent 配置未公布", "Tokens：" + (row.tokens == null ? "未公布" : row.tokens), "Steps：" + (row.steps == null ? "未公布" : row.steps)].join("；");
}
function renderPublicBenchmarks() {
  const meta = byId("publicBenchmarkMeta"), body = byId("publicBenchmarkBody"), empty = byId("publicBenchmarkEmpty"), table = byId("publicBenchmarkWrap");
  if (!meta || !body || !empty || !table) return;
  const benchmark = selectedPublicBenchmark(), rows = publicBenchmarkRows();
  const select = byId("publicBenchmarkSelect");
  if (benchmark) { publicBenchmarkState.id = benchmark.id; publicBenchmarkState.family = benchmark.family; if (select) select.value = benchmark.id; }
  meta.innerHTML = benchmark ? `<h3>${esc(benchmark.name)}</h3><p>${esc(benchmark.description)}</p><dl class="public-benchmark-meta"><div><dt>版本与协议</dt><dd>${esc(benchmark.version)} · <code>${esc(benchmark.id)}</code></dd></div><div><dt>指标与范围</dt><dd>${esc(benchmark.metric)}（${esc(benchmark.unit)}） · ${esc(benchmark.scope)}</dd></div><div><dt>评测配置</dt><dd>${esc(benchmark.configuration)}</dd></div><div><dt>官方标注日期与核查</dt><dd>官方标注 ${esc(publicBenchmarkDate(benchmark.sourceUpdatedAt))} · 本站核查 ${esc(publicBenchmarkDate(benchmark.checkedAt))} · ${publicBenchmarkSource(benchmark.sourceUrl, "原始评测")}</dd></div></dl>` : "<p>公开评测数据暂未加载，请刷新重试。</p>";
  const count = byId("publicBenchmarkCount");
  if (count) count.textContent = benchmark ? `${rows.length} 条匹配记录 · ${publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置"} · 本协议分数降序` : "暂无公开记录";
  const modeNote = byId("publicBenchmarkModeNote");
  if (modeNote) modeNote.textContent = publicBenchmarkState.mode === "all" ? "同一模型的不同推理与 Agent 配置分别列出；名次仅适用于当前协议，搜索不改变原名次。" : "每个准确模型名称取当前协议已公布配置中的最高分；同分保留来源首项。名次在本协议这些配置中计算，搜索不改变原名次；切换「全部配置」可查看其他配置。";
  const caption = byId("publicBenchmarkCaption"); if (caption) caption.textContent = benchmark ? `${benchmark.name} · ${benchmark.metric} · ${benchmark.scope}` : "公开模型评测";
  body.innerHTML = rows.map((r) => `<tr><td class="public-score-rank">${r.rank}</td><th scope="row"><strong>${esc(r.model)}</strong><span class="public-score-config">${esc([r.reasoning ? "推理：" + r.reasoning : "推理未公布", r.agent ? "Agent：" + r.agent : "Agent 未公布"].join(" · "))}</span><details class="public-score-more"><summary>配置与评测说明</summary><p>${esc(publicBenchmarkConfiguration(r))}</p>${r.uncertainty ? `<p>区间 / 不确定性：${esc(r.uncertainty)}</p>` : ""}<p>${esc(r.costNote || "评测每任务成本；来源未提供其他费用说明。未公布费用不能记作零，也不能换算为订阅月费。")}</p></details></th><td class="public-score-value">${esc(publicScoreText(r.score, benchmark.unit))}</td><td>${r.costUSD == null ? "未公布" : "$" + esc(Number(r.costUSD.toFixed(4)))}</td><td>${publicBenchmarkSource(r.sourceUrl, "成绩来源")}<span class="public-score-config" title="${esc(r.checkedAt)}">核查 ${esc(publicBenchmarkDate(r.checkedAt))}</span></td></tr>`).join("");
  empty.hidden = rows.length > 0; table.hidden = !rows.length;
  empty.textContent = benchmark ? "当前协议没有匹配的模型或配置。请调整关键词，或清除搜索。" : "公开数据暂不可用；本站不会用本地验收示例填充模型分数。";
  const reset = byId("publicModelClearBtn"); if (reset) reset.disabled = !publicBenchmarkState.search;
  const csv = byId("downloadPublicBenchmarkCsvBtn"); if (csv) csv.disabled = !rows.length;
  const json = byId("downloadPublicBenchmarkJsonBtn"); if (json) json.disabled = !publicBenchmarkData().benchmarks.length;
}
function publicBenchmarkCsv() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark) return "";
  const columns = ["协议 ID", "评测", "版本", "范围", "协议配置", "展示模式", "名次", "模型", "推理配置", "Agent", "分数", "单位", "官方评测每任务成本 USD", "成本说明", "不确定性", "Tokens", "Steps", "成绩来源", "核查日期", "协议来源", "官方标注日期"];
  const cell = (value) => { let s = String(value ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  return [columns.map(cell).join(","), ...publicBenchmarkRows().map((r) => [benchmark.id, benchmark.name, benchmark.version, benchmark.scope, benchmark.configuration, publicBenchmarkState.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置", r.rank, r.model, r.reasoning, r.agent, r.score, benchmark.unit, r.costUSD, r.costNote, r.uncertainty, r.tokens, r.steps, r.sourceUrl, r.checkedAt, benchmark.sourceUrl, benchmark.sourceUpdatedAt].map(cell).join(","))].join("\r\n");
}
function downloadPublicBenchmarkCsv() {
  const benchmark = selectedPublicBenchmark(); if (!benchmark || !publicBenchmarkRows().length) return;
  downloadCsvText(publicBenchmarkCsv(), `coding-plan-benchmark-${benchmark.id}.csv`);
  const feedback = byId("publicBenchmarkFeedback"); if (feedback) feedback.textContent = `已导出当前协议的 ${publicBenchmarkRows().length} 条筛选结果，配置、来源与费用口径已保留。`;
}
function downloadPublicBenchmarkJson() {
  const data = publicBenchmarkData(); if (!data.benchmarks.length) return;
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", "coding-plan-public-benchmarks.json", "application/json;charset=utf-8");
  const feedback = byId("publicBenchmarkFeedback"); if (feedback) feedback.textContent = "已导出全部公开评测协议与原始成绩；未包含本机关注或投稿资料。";
}
function bindPublicBenchmarkEvents() {
  const select = byId("publicBenchmarkSelect"), search = byId("publicModelSearch");
  syncPublicBenchmarkChoices();
  const family = byId("publicBenchmarkFamily"); if (family) family.addEventListener("change", () => {
    if (!publicBenchmarkData().benchmarks.some((b) => b.family === family.value)) return;
    publicBenchmarkState.family = family.value; publicBenchmarkState.id = "";
    syncPublicBenchmarkChoices(); renderPublicBenchmarks();
  });
  if (select) {
    select.addEventListener("change", () => { if (publicBenchmarkData().benchmarks.some((b) => b.id === select.value)) publicBenchmarkState.id = select.value; renderPublicBenchmarks(); });
  }
  if (search) search.addEventListener("input", () => { publicBenchmarkState.search = search.value.slice(0, 200); renderPublicBenchmarks(); });
  const mode = byId("publicBenchmarkMode"); if (mode) mode.addEventListener("change", () => { publicBenchmarkState.mode = mode.value === "all" ? "all" : "best"; renderPublicBenchmarks(); });
  const clear = byId("publicModelClearBtn"); if (clear) clear.addEventListener("click", () => { publicBenchmarkState.search = ""; if (search) search.value = ""; renderPublicBenchmarks(); focusTableControl(search); });
  [["downloadPublicBenchmarkCsvBtn", downloadPublicBenchmarkCsv], ["downloadPublicBenchmarkJsonBtn", downloadPublicBenchmarkJson]].forEach(([id, handler]) => { const button = byId(id); if (button) button.addEventListener("click", handler); });
  renderPublicBenchmarks();
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
  el.innerHTML = rows.length ? `<p>符合条件 ${rows.length} 条贡献者解答记录。不同任务、环境与币种分别展示，不合并成成功率或性能排名。</p><ul class="benchmark-runs">${rows.map(benchmarkRunHtml).join("")}</ul>` : `<p class="benchmark-empty">${data.runs.length ? "当前筛选没有贡献者记录。" : "尚未收录贡献者任务记录。这里的验收工具用于复现提交的单份解答，未测量的数据不填充分数。"}</p>`;
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
  bindPublicBenchmarkEvents(); renderBenchmarks(); renderContribution();
}
