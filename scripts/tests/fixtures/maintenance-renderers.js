/* Test-only classic HTML rendering boundary. Data and business calculations come from current TypeScript runtime. */
function badgeHtml(p) {
    return planBadges(p).map((b) => `<span class="badge badge-${b.k}">${esc(b.t)}</span>`).join("");
}
function priceCheckHtml(p, kind = "plan") {
    const check = priceCheckOf(p, kind);
    const urls = priceCheckSources(p, kind);
    const links = urls.map((url, i) => `<a href="${safeHref(url)}" target="_blank" rel="noopener">核价来源${urls.length > 1 ? i + 1 : ""}</a>`).join(" · ");
    const explanation = check && check.status === "unverified" ? `<details class="price-check-details"><summary>核查说明</summary><p>${esc(displayPriceReason(check.reason))}</p></details>` : "";
    return `${links || "—"}<span class="sub">${esc(priceCheckLabel(p, kind))}${check ? " · " + esc(check.checkedAt) : ""}</span>${explanation}`;
}
function watchButtonHtml(p, extraClass = "") {
    if (!p || !p.id)
        return "";
    const on = isPlanFollowed(p.id);
    return `<button type="button" class="watch-plan ${esc(extraClass)}${on ? " on" : ""}" data-watch-plan="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? "取消关注" : "关注"} ${esc(planTitle(p))}">${on ? "已关注" : "关注"}</button>`;
}
/* 同步旧代码渲染的关注按钮（推荐卡、数据表、完整权益窗口）。Vue 组件里的按钮由组件按状态渲染，不能从外部改动它的节点。 */
function syncWatchButtons() {
    qsa("[data-watch-plan]").forEach((b) => {
        if (b.closest && b.closest("[data-v-app]"))
            return;
        const p = PLANS.find((plan) => plan.id === b.dataset.watchPlan);
        if (!p)
            return;
        const on = isPlanFollowed(p.id);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-label", `${on ? "取消关注" : "关注"} ${planTitle(p)}`);
        b.textContent = on ? "已关注" : "关注";
    });
}
function maintenanceSources(urls) {
    return maintenanceSourceUrls(urls).map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener" tabindex="0">官方证据${i + 1} ↗</a>`).join(" · ");
}
/* 完整权益窗口（旧代码渲染）里的历史；我的关注页的历史由组件渲染同样的内容。 */
function changeCardHtml(change, unread = false) {
    const fields = changeFields(change).map((f) => `<li><strong>${esc(f.label)}</strong>：${esc(f.before)} → ${esc(f.after)}</li>`).join("");
    return `<li class="change-card"><div><strong>${esc(change.vendor + " · " + change.name)}</strong>${unread ? '<span class="change-unread">未读</span>' : ""}</div><p class="maintenance-meta">确认于 ${esc(change.checkedAt)} · ${esc(changeKindLabel(change.kind))}</p><ul class="change-fields">${fields}</ul><p>${maintenanceSources(change.sourceUrls)}</p></li>`;
}
function planHistoryParts(id) {
    if (!optionalDataLoaded("maintenance"))
        return { summary: planHistorySummary(id), body: "<p>展开后加载本档的已确认变更。</p>" };
    const changes = planChanges(id);
    return { summary: planHistorySummary(id),
        body: changes.length ? `<ul class="change-list">${changes.map((c) => changeCardHtml(c)).join("")}</ul>` : `<p>${PLAN_HISTORY_EMPTY}</p>` };
}
function planHistoryHtml(id) {
    const parts = planHistoryParts(id);
    return `<details class="method-box plan-history" data-plan-history="${esc(id)}"><summary>${esc(parts.summary)}</summary><div class="plan-history-body">${parts.body}</div></details>`;
}
/* 只更新摘要文字和正文容器，保留可能正获得焦点的 summary 节点，键盘与读屏位置不丢失。 */
function fillPlanHistory(details, parts) {
    const summary = details.querySelector("summary"), body = details.querySelector(".plan-history-body");
    if (summary && parts.summary != null && summary.textContent !== parts.summary)
        summary.textContent = parts.summary;
    if (body)
        body.innerHTML = parts.body;
}
/* 完整权益窗口里的历史按需加载；我的关注页的历史由组件自己处理。 */
function onPlanHistoryToggle(event) {
    const details = evtTarget(event);
    if (!details || !details.open || !details.dataset || !details.dataset.planHistory || optionalDataLoaded("maintenance"))
        return;
    fillPlanHistory(details, { summary: null, body: "<p>正在加载历史数据…</p>" });
    ensureOptionalData("maintenance").then(() => {
        refreshOptionalViews("maintenance");
    }, () => {
        fillPlanHistory(details, { summary: null, body: "<p>历史数据加载失败，请关闭后重新展开。</p>" });
    });
}
function bindMaintenanceEvents() {
    loadFollowState();
    syncWatchButtons();
    document.addEventListener("click", (e) => {
        const target = evtTarget(e);
        if (!target || !target.closest)
            return;
        const plan = target.closest("[data-benchmark-plan]");
        if (plan && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && (e.button == null || e.button === 0)) {
            e.preventDefault();
            showPlanDetails(plan.dataset.benchmarkPlan, plan);
        }
        const watch = target.closest("[data-watch-plan]");
        if (watch)
            toggleFollowPlan(watch.dataset.watchPlan);
    });
    document.addEventListener("toggle", onPlanHistoryToggle, true);
}

/* The VM keeps a classic DOM boundary while production mutations stay shared. */
const toggleFollowPlanData = toggleFollowPlan;
toggleFollowPlan = function (id) { const result = toggleFollowPlanData(id); syncWatchButtons(); return result; };
const applyFollowImportData = applyFollowImport;
applyFollowImport = function (merge) { applyFollowImportData(merge); syncWatchButtons(); };
const refreshOptionalViewsData = refreshOptionalViews;
refreshOptionalViews = function (kind) {
  refreshOptionalViewsData(kind);
  if (kind === 'maintenance') {
    syncWatchButtons();
    qsa('[data-plan-history]').forEach(details => fillPlanHistory(details, planHistoryParts(details.dataset.planHistory)));
  }
};
const followFeedbackData = followFeedback;
followFeedback = function (text) { followFeedbackData(text); const dialog = byId('planFollowFeedback'); if (dialog) dialog.textContent = followView.feedback; };

/* Optional status rendering and retry delegation are a classic DOM test boundary. */
function loadViewData(kind) {
    const statuses = [byId(kind + "DataStatus"), kind === "benchmark" ? byId("contributionDataStatus") : null].filter(Boolean);
    statuses.forEach((status) => { status.textContent = optionalDataLoaded(kind) ? "" : "正在加载本标签的数据…"; });
    return ensureOptionalData(kind).then(() => {
        statuses.forEach((status) => { status.textContent = ""; });
        refreshOptionalViews(kind);
    }, (err) => {
        statuses.forEach((status) => { status.innerHTML = `${esc(err.message)}。<button type="button" class="chip" data-retry-data="${esc(kind)}">重新加载数据</button>`; });
    });
}
document.addEventListener("click", (event) => {
    const target = evtTarget(event);
    const retryData = target && target.closest ? target.closest("[data-retry-data]") : null;
    if (retryData) loadViewData(retryData.dataset.retryData);
});
