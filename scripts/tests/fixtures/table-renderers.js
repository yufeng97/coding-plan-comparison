/* Test-only classic rendering adapter. Production renders tables with Vue; calculations, data and exports come from the current TypeScript runtime. */
function tableFeedback(message) {
    if (tableViews.plan?.feedback) {
        tableViews.plan.feedback(message);
        return;
    }
    const el = byId("tableFeedback");
    if (el)
        el.textContent = message;
}
function syncSortHeader(th, label, key, dir, firstDir = 1) {
    const active = th.dataset.sort === key;
    const direction = (v) => v === 1 ? "从低到高" : "从高到低";
    th.classList.toggle("sort-active", active);
    const span = th.querySelector("span");
    if (span)
        span.textContent = label + (active ? (dir === 1 ? " ↑" : " ↓") : "");
    if (active)
        th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
    else
        th.removeAttribute("aria-sort");
    const next = direction(active ? -dir : firstDir);
    th.title = `点击或按 Enter / 空格，按${label}${next}排序`;
    th.setAttribute("aria-label", `${label}${active ? "，当前" + direction(dir) : ""}，激活后${next}排序`);
}
function planMonthlyPriceCell(p) {
    const sub = p.priceM > 0 ? `<br><span class="sub">≈${fmtCNY(cnyOf(p, "M"))}/${esc(priceUnit(p))}</span>` : "";
    const single = p.singleMonthPrice > 0 ? `<br><span class="sub">连续包月价；单月一次购买 ${esc(priceText({ ...p, priceM: p.singleMonthPrice }, "priceM"))}</span>` : "";
    const chosen = tableState.fromPicker ? `<br><span class="sub">选购口径：${esc(priceLine(p))}；首次 ${esc(pickerFirstPaymentText(p))}</span>` : "";
    return esc(planPriceLabel(p)) + sub + single + chosen;
}
function planAnnualPriceCell(p) {
    if (p.priceY == null)
        return isOneTimePlan(p) ? "—" : '<span class="sub">未列年付价</span>';
    return esc(planPriceLabel(p, "Y")) + `<br><span class="sub">≈${fmtCNY(cnyOf(p, "Y"))}/${p.seat ? "席位/月" : "月"}</span><br><span class="sub">${esc(annualPaymentText(p))}</span>`;
}
const fixturePLAN_COLUMNS = [
    { id: "vendor", label: "厂商", cls: "td-vendor", value: (p) => p.vendor },
    { id: "plan", label: "计划", cls: "td-plan", value: (p) => p.plan,
        cell: (p) => `<span class="plan-name">${esc(p.plan)}</span><div class="badge-row">${badgeHtml(p)}</div><button type="button" class="cmp-add" data-plan-id="${esc(p.id || "")}" data-vendor="${esc(p.vendor)}" data-plan="${esc(p.plan)}">＋对比</button>${typeof watchButtonHtml === "function" ? watchButtonHtml(p) : ""}` },
    { id: "cat", label: "类别", value: (p) => CAT_LABEL[p.cat] || p.cat,
        cell: (p) => `<span class="tag tag-${esc(p.cat)}">${esc(CAT_LABEL[p.cat] || p.cat)}</span>` },
    { id: "region", label: "地区", value: (p) => REGION_LABEL[p.region] || "", tdClass: (p) => "region-" + esc(p.region) },
    { id: "priceM", label: "价格 / 周期", cls: "td-price", value: (p) => planPriceLabel(p), cell: planMonthlyPriceCell },
    { id: "priceUnit", label: "计价单位", table: false, value: priceUnit },
    { id: "priceY", label: "年付折月", cls: "td-price", value: (p) => p.priceY == null ? "" : planPriceLabel(p, "Y"),
        markdownValue: (p) => p.priceY == null ? "—" : planPriceLabel(p, "Y"), cell: planAnnualPriceCell },
    { id: "annualTotal", label: "年付全年金额", table: false, value: annualPaymentText },
    { id: "selectedPayment", label: "选购支付口径", table: false, value: (p) => tableState.fromPicker ? priceLine(p) : "" },
    { id: "selectedFirstPayment", label: "选购首次付款", table: false, value: (p) => tableState.fromPicker ? pickerFirstPaymentText(p) : "" },
    { id: "quota", label: "额度（官方口径）", cls: "td-quota", value: (p) => resolvedField(p, "quota") },
    { id: "models", label: "模型", cls: "td-models col-opt", value: (p) => resolvedField(p, "models") },
    { id: "tools", label: "支持工具", cls: "col-opt", value: (p) => resolvedField(p, "tools") },
    { id: "note", label: "备注", cls: "td-note col-opt", value: (p) => resolvedField(p, "note"),
        markdownValue: (p) => resolvedField(p, "note") || "—", cell: (p) => esc(resolvedField(p, "note") || "—") },
    { id: "url", label: "来源", cls: "td-trust", value: (p) => p.url || "",
        cell: (p) => priceCheckHtml(p) },
    { id: "priceStatus", label: "价格核实状态", table: false, value: (p) => priceCheckLabel(p) },
    { id: "priceCheckedAt", label: "价格核查日期", table: false, value: (p) => (priceCheckOf(p) || {}).checkedAt || "" },
    { id: "priceSources", label: "价格核查来源", table: false, value: (p) => priceCheckSources(p).join(" ; ") },
    { id: "priceCheckReason", label: "价格核查说明", table: false, value: (p) => displayPriceReason((priceCheckOf(p) || {}).reason || "") },
    { id: "mainland", label: "中国大陆可用性", table: false, value: mainlandAccessText },
    { id: "updated", label: "数据更新日期", table: false, markdown: false, value: () => META.updated },
    { id: "rate", label: "参考汇率（USD/CNY）", table: false, markdown: false, value: () => RATE },
    { id: "rateInr", label: "参考汇率（INR/CNY）", table: false, markdown: false, value: () => RATE_INR_CNY },
    { id: "rateAsOf", label: "汇率日期", table: false, markdown: false, value: () => META.rateAsOf },
    { id: "rateSource", label: "汇率来源", table: false, markdown: false, value: () => META.rateSource || "" },
];
fixturePLAN_COLUMNS.forEach(column => { const current = PLAN_COLUMNS.find(item => item.id === column.id); if (current && column.cell)
    current.cell = column.cell; });
function syncTablePriceSort() {
    const control = byId("tablePriceSort");
    if (!control)
        return;
    control.value = tableState.sortKey + ":" + tableState.sortDir;
    for (const option of Array.from(control.querySelectorAll("option")))
        option.disabled = option.value.startsWith("selectedMonthly:") && !tableState.fromPicker;
}
function renderTable() {
    if (tableViews.plan?.render) {
        tableViews.plan.render();
        return;
    }
    if (!tableState.fromPicker && tableState.sortKey === "selectedMonthly") {
        tableState.sortKey = "priceM";
        tableState.sortDir = 1;
    }
    syncTablePriceSort();
    const focused = document.activeElement;
    const focusedPlanId = focused && byId("tableBody").contains(focused) && focused.classList.contains("cmp-add") ? focused.dataset.planId : "";
    const rows = computeTableRows();
    const pageSize = responsivePageSize();
    const fingerprint = tableFingerprint(pageSize);
    if (fingerprint !== tableViewFingerprint) {
        tableVisibleLimit = pageSize;
        tableViewFingerprint = fingerprint;
    }
    if (focusedPlanId) {
        const index = rows.findIndex((p) => p.id === focusedPlanId);
        if (index >= tableVisibleLimit)
            tableVisibleLimit = Math.ceil((index + 1) / pageSize) * pageSize;
    }
    const visibleRows = rows.slice(0, tableVisibleLimit);
    byId("planTable").classList.toggle("is-empty", rows.length === 0);
    const onSale = PLANS.filter(isOnSalePlan);
    const k = tableState.sortKey;
    const hiddenExtra = tableState.extra ? 0 : tableFilteredPlans().filter(tableExtraHidden).length;
    byId("tableCount").textContent = `已显示 ${visibleRows.length} / ${rows.length} 条匹配记录 · 共 ${onSale.length} 档` +
        (hiddenExtra ? ` · 另有 ${hiddenExtra} 档中转站或待核价格未显示` : "");
    syncTableExtraToggle(hiddenExtra);
    const more = byId("tableMoreBtn");
    if (more) {
        more.hidden = visibleRows.length >= rows.length;
        more.textContent = `显示更多记录（还有 ${rows.length - visibleRows.length} 条）`;
        more.setAttribute("aria-controls", "tableBody");
    }
    qsa("#planTable thead th.sortable").forEach((th) => {
        const col = PLAN_COLUMNS.find((c) => c.id === th.dataset.sort);
        if (col)
            syncSortHeader(th, col.label, k, tableState.sortDir);
    });
    const filters = [tableState.search.trim() ? `关键词「${tableState.search.trim()}」` : "",
        tableState.cat === "all" ? "" : CAT_LABEL[tableState.cat], tableState.region === "all" ? "" : REGION_LABEL[tableState.region],
        tableState.fromPicker ? "选购条件" : ""].filter(Boolean).join(" · ");
    const freeScope = tableState.fromPicker && pickerState.budget === "0";
    byId("tableBody").innerHTML = rows.length ? visibleRows.map((p) => `<tr>${PLAN_TABLE_COLUMNS.map((col) => {
        const cls = col.tdClass ? col.tdClass(p) : col.cls || "";
        return `<td data-column="${esc(col.id)}" data-label="${esc(col.label)}"${cls ? ` class="${cls}"` : ""}>${col.cell ? col.cell(p) : esc(col.value(p))}</td>`;
    }).join("")}</tr>`).join("") : freeScope
        ? `<tr><td colspan="${PLAN_TABLE_COLUMNS.length}" class="table-empty"><b>选购预算为「免费」，公开标价表不含免费档</b><p>免费档在<a href="#free">免费 Coding 入口</a>；取消选购条件可查看全部标价记录。</p><button type="button" class="chip" data-apply-picker="table">取消选购条件</button></td></tr>`
        : `<tr><td colspan="${PLAN_TABLE_COLUMNS.length}" class="table-empty"><b>没有匹配的公开标价记录</b><p>${esc(filters || "当前筛选")}没有结果${hiddenExtra ? `，另有 ${hiddenExtra} 档中转站或待核价格未显示` : ""}。可以${tableState.fromPicker ? "调整「帮我选」条件、" : ""}调整关键词或清除筛选。${cmpState.items.length ? "已选的对比方案仍保留。" : ""}</p>${hiddenExtra ? '<button type="button" class="chip" data-table-extra>显示中转站与待核价格</button> ' : ""}<button type="button" class="chip" id="tableEmptyResetBtn" data-reset-table>清除筛选</button></td></tr>`;
    ["exportCsvBtn", "copyMdBtn"].forEach((id) => {
        const btn = byId(id);
        if (!btn)
            return;
        btn.disabled = !rows.length;
        btn.title = rows.length ? (id === "exportCsvBtn" ? "下载当前筛选结果为 CSV（UTF-8）" : "复制当前筛选结果为 Markdown 表格") : "没有可导出的结果，请先调整筛选";
    });
    const reset = byId("tableResetBtn");
    if (reset)
        reset.disabled = !tableState.fromPicker && !tableState.extra && !tableState.search && tableState.cat === "all" && tableState.region === "all" && tableState.sortKey === "priceM" && tableState.sortDir === 1;
    if (typeof syncPickerScopeControls === "function")
        syncPickerScopeControls();
    tableFeedback("");
    syncTableCmpButtons();
    if (focusedPlanId && focused.isConnected === false) {
        const replacement = [...qsa("#tableBody .cmp-add")].find((btn) => btn.dataset.planId === focusedPlanId);
        if (!focusTableControl(replacement))
            focusTableControl(byId("searchInput"));
    }
}
function syncTableExtraToggle(hiddenExtra) {
    const toggle = byId("tableExtraToggle");
    if (!toggle)
        return;
    toggle.classList.toggle("active", tableState.extra);
    toggle.setAttribute("aria-pressed", tableState.extra ? "true" : "false");
    toggle.title = tableState.extra ? "隐藏中转站和价格待核实的历史记录" : `显示中转站和价格待核实的历史记录${hiddenExtra ? `（当前筛选下 ${hiddenExtra} 档）` : ""}`;
}
function showMoreTableRows() {
    if (tableViews.plan?.more) {
        tableViews.plan.more();
        return;
    }
    const previousCount = Math.min(tableVisibleLimit, computeTableRows().length);
    tableVisibleLimit += responsivePageSize();
    renderTable();
    const firstNew = [...qsa("#tableBody .cmp-add")][previousCount];
    if (focusTableControl(firstNew))
        return;
    const firstRow = [...qsa("#tableBody tr")][previousCount];
    if (firstRow) {
        firstRow.setAttribute("tabindex", "-1");
        if (focusTableControl(firstRow))
            return;
    }
    if (!focusTableControl(byId("tableMoreBtn")))
        focusTableControl(byId("searchInput"));
}
function revealTablePlan(planId) {
    if (tableViews.plan?.reveal)
        return tableViews.plan.reveal(planId);
    const index = computeTableRows().findIndex((plan) => plan.id === planId);
    if (index < 0)
        return false;
    if (index >= tableVisibleLimit) {
        const pageSize = responsivePageSize();
        tableVisibleLimit = Math.ceil((index + 1) / pageSize) * pageSize;
        tableViewFingerprint = tableFingerprint(pageSize);
        renderTable();
    }
    return true;
}
function resetTableFilters() {
    if (tableViews.plan?.reset) {
        tableViews.plan.reset();
        return;
    }
    Object.assign(tableState, { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
    byId("searchInput").value = "";
    byId("selectCat").value = "all";
    byId("selectRegion").value = "all";
    renderTable();
    focusTableControl(byId("searchInput"));
}
function flashBtn(id, text) {
    const mounted = Object.values(tableViews).find((view) => view.flash && view.buttons?.includes(id));
    if (mounted) {
        mounted.flash(id, text);
        return;
    }
    const btn = byId(id);
    if (!btn)
        return;
    if (!btn.dataset.orig)
        btn.dataset.orig = btn.textContent;
    btn.textContent = text;
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(() => { btn.textContent = btn.dataset.orig; }, 1800);
}
function renderCmpBar() {
    if (tableViews.compare?.render) {
        tableViews.compare.render();
        return;
    }
    const bar = byId("cmpBar");
    if (!bar)
        return;
    const n = cmpState.items.length;
    const show = n > 0;
    document.body.classList.toggle("has-compare", show);
    bar.hidden = !show;
    bar.classList.toggle("is-on", show);
    const hint = n === 1 ? "，再选 1 档可对比" : n >= CMP_MAX ? "，已满" : "";
    byId("cmpBarText").textContent =
        `已选 ${n}/${CMP_MAX} 档${hint}` +
            (n ? "：" + cmpState.items.map((p) => shortVendor(p.vendor) + " " + p.plan).join("、") : "");
    const openBtn = byId("cmpOpenBtn");
    openBtn.disabled = n < 2;
    openBtn.title = n < 2 ? "至少选择 2 档" : "并排查看已选档";
    byId("cmpBarText").title = n ? cmpState.items.map((p) => shortVendor(p.vendor) + " " + p.plan).join("、") : "";
    ["copyCmpMdBtn", "exportCmpCsvBtn"].forEach((id) => {
        const btn = byId(id);
        if (!btn)
            return;
        btn.disabled = n < 2;
        btn.title = n < 2 ? "至少选择 2 档后导出对比" : id === "copyCmpMdBtn" ? "复制已选方案的完整对比与核价元数据" : "下载已选方案的完整对比与核价元数据";
    });
    cmpFeedback("");
}
function syncTableCmpButtons(previousFocus = null) {
    const buttons = [...qsa(".cmp-add[data-plan-id]")];
    buttons.forEach((btn) => {
        if (btn.closest("[data-v-app]"))
            return;
        const scope = btn.closest("[id]");
        btn.dataset.cmpScope = scope ? scope.id : "";
        const on = cmpState.items.some((x) => x.id === btn.dataset.planId);
        btn.textContent = on ? "✓ 对比中" : "＋对比";
        const full = !on && cmpState.items.length >= CMP_MAX;
        if (full)
            btn.textContent = "对比已满";
        btn.disabled = full;
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        const action = on ? "移出并排对比" : full ? `已满 ${CMP_MAX} 档，请先移出一档` : "加入并排对比，选满 2 档后可比较";
        btn.title = action;
        btn.setAttribute("aria-label", `${shortVendor(btn.dataset.vendor)} ${btn.dataset.plan}，${action}`);
    });
    if (previousFocus && previousFocus.isConnected === false && previousFocus.classList.contains("cmp-add")) {
        const replacement = buttons.find((btn) => btn.dataset.planId === previousFocus.dataset.planId && btn.dataset.cmpScope === previousFocus.dataset.cmpScope);
        if (!focusTableControl(replacement)) {
            const nearby = buttons.find((btn) => btn.dataset.cmpScope === previousFocus.dataset.cmpScope && !btn.disabled);
            if (!focusTableControl(nearby))
                focusTableControl(byId("searchInput"));
        }
    }
}
function cmpFeedback(message) {
    if (tableViews.compare?.feedback) {
        tableViews.compare.feedback(message);
        return;
    }
    const el = byId("cmpFeedback");
    if (el)
        el.textContent = message;
}
function renderCmpModal() {
    if (tableViews.compare?.render) {
        tableViews.compare.render();
        return;
    }
    const items = cmpState.items;
    const row = (label, cells, values = [], scope = "row") => {
        const differs = values.length > 1 && new Set(values).size > 1;
        return `<tr${differs ? ' class="cmp-diff-row"' : ""}><th scope="${scope}">${label}${differs ? '<span class="cmp-diff-label">有差异</span>' : ""}</th>${cells}</tr>`;
    };
    const prices = items.map((p) => cnyOf(p, "M"));
    const sameUnit = new Set(items.map(priceUnit)).size === 1 && !items.some(isOneTimePlan);
    const comparable = sameUnit && items.every((p) => isPriceConfirmed(p)) && prices.every((p) => p != null && Number.isFinite(p) && p > 0) && new Set(prices).size > 1;
    const lowest = comparable ? Math.min(...prices) : null;
    const priceCell = (p) => {
        const pm = esc(planPriceLabel(p));
        const sub = p.priceM > 0 ? `<span class="sub">≈${fmtCNY(cnyOf(p, "M"))}/${esc(priceUnit(p))}</span>` : "";
        const py = p.priceY != null ? `<span class="sub"> · ${esc(planPriceLabel(p, "Y"))}</span>` : "";
        return `${pm}<br>${sub}${py}`;
    };
    const rows = [
        row("厂商 · 计划", items.map((p) => `<th scope="col"><b>${esc(p.vendor)}</b><br>${esc(p.plan)}<br><button type="button" class="chip cmp-remove" data-plan-id="${esc(p.id || "")}" data-vendor="${esc(p.vendor)}" data-plan="${esc(p.plan)}" aria-label="移出 ${esc(shortVendor(p.vendor))} ${esc(p.plan)}">移出对比</button></th>`).join(""), [], "col"),
        row("定位", items.map((p) => `<td><span class="tag tag-${esc(p.cat)}">${esc(CAT_LABEL[p.cat] || p.cat)}</span> ${esc(REGION_LABEL[p.region] || "")}${badgeHtml(p) ? `<div class="badge-row">${badgeHtml(p)}</div>` : ""}</td>`).join("")),
        row("价格", items.map((p) => {
            const best = lowest != null && cnyOf(p, "M") === lowest;
            return `<td${best ? ' class="cmp-best-price"' : ""}>${priceCell(p)}${best ? '<span class="cmp-price-label">同周期最低价</span>' : ""}</td>`;
        }).join(""), items.map((p) => planPriceLabel(p) + "|" + (p.priceY == null ? "" : planPriceLabel(p, "Y")))),
        row("年付全年金额", items.map((p) => `<td>${esc(annualPaymentText(p))}</td>`).join(""), items.map(annualPaymentText)),
        row("额度（官方口径）", items.map((p) => `<td>${esc(resolvedField(p, "quota"))}</td>`).join(""), items.map((p) => resolvedField(p, "quota"))),
        row("模型", items.map((p) => `<td>${esc(resolvedField(p, "models"))}</td>`).join(""), items.map((p) => resolvedField(p, "models"))),
        row("支持工具", items.map((p) => `<td>${esc(resolvedField(p, "tools"))}</td>`).join(""), items.map((p) => resolvedField(p, "tools"))),
        row("备注", items.map((p) => `<td>${esc(resolvedField(p, "note") || "—")}</td>`).join("")),
        row("价格核查", items.map((p) => `<td>${priceCheckHtml(p)}</td>`).join("")),
    ];
    byId("cmpTable").innerHTML = `<thead>${rows[0]}</thead><tbody>${rows.slice(1).join("")}</tbody>`;
}
function dynItem(d, today = chinaCalendarDay()) {
    const href = safeHref(d.url);
    const link = href ? ` <a class="dyn-src" href="${href}" target="_blank" rel="noopener" title="打开来源：${esc(d.url)}">${esc(d.source || "来源")} ↗</a>` : "";
    const when = d.checked ? "核实 " + d.date : d.date;
    const tip = d.checked ? "本站这一天核对到该状态，不是厂商公告日" : "来源写明的发生日期";
    const status = dynamicStatus(d, today);
    const badge = status.label ? `<span class="dyn-status dyn-${status.key}">${esc(status.label)}</span> ` : "";
    const text = status.key === "upcoming" ? String(d.text).replace(/于 (\d{4}-\d{2}-\d{2}) 退役/, "计划于 $1 退役") : d.text;
    return `<li${status.key ? ` class="dyn-${status.key}"` : ""}><span class="dyn-date${d.checked ? " is-checked" : ""}" title="${tip}">${esc(when)}</span><div class="dyn-body">${badge}${esc(text)}${link}</div></li>`;
}
function renderMisc() {
    const sorted = DYNAMICS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const today = chinaCalendarDay();
    byId("dynamicsList").innerHTML = sorted.filter((d) => !d.checked).map((d) => dynItem(d, today)).join("");
    const checkList = byId("checkList");
    if (checkList)
        checkList.innerHTML = sorted.filter((d) => d.checked).map((d) => dynItem(d, today)).join("");
    const priceSources = currentPriceSources();
    byId("sourceList").innerHTML =
        `<h3>📖 全部来源（官方定价页 / 权威报道）</h3>` +
            SOURCES.map((g) => `<details class="source-group"><summary>${esc(g.group)} <span class="sub">${g.urls.length} 个来源</span></summary><ul>${g.urls.map((u) => {
                const href = safeHref(u);
                return href ? `<li><a href="${href}" tabindex="0" target="_blank" rel="noopener">${esc(u)}</a></li>` : "";
            }).join("")}</ul></details>`).join("") + `<details class="method-box audit-sources"><summary>本次逐条核价来源（${priceSources.length} 页）</summary><ul>` +
            priceSources.map((s) => {
                const href = safeHref(s.url);
                return href ? `<li><a href="${href}" tabindex="0" target="_blank" rel="noopener">${esc(s.url)}</a> — ${esc(displayPriceReason(s.evidence))}</li>` : "";
            }).join("") + `</ul></details>`;
    const pendingPrices = [
        ...PLANS.map((p) => ({ p, kind: "plan" })),
        ...API_PRICES.map((p) => ({ p, kind: "api" })),
        ...PAYG_REFERENCES.map((p) => ({ p, kind: "payg" })),
    ].filter(({ p, kind }) => (priceCheckOf(p, kind) || {}).status === "unverified");
    byId("uncertainList").innerHTML = pendingPrices.map(({ p, kind }) => `<li><b>${esc(p.vendor)} · ${esc("plan" in p ? p.plan : p.model)}</b>：${esc(displayPriceReason(priceCheckOf(p, kind).reason))} ${priceCheckHtml(p, kind)}</li>`).join("") +
        UNCERTAIN.map((u) => `<li>${esc(u)}</li>`).join("");
    const uncertainSummary = qs("#uncertainWrap summary");
    if (uncertainSummary)
        uncertainSummary.textContent = `展开全部不确定性说明（${pendingPrices.length} 条价格待核实，另 ${UNCERTAIN.length} 条口径说明）`;
    byId("rateText").textContent = RATE;
    byId("rateText2").textContent = RATE;
    byId("footDate").textContent = META.updated;
    const heroDate = byId("heroDate");
    if (heroDate)
        heroDate.textContent = META.updated;
}
function resetMetricsFilters() {
    if (tableViews.metrics?.reset) {
        tableViews.metrics.reset();
        return;
    }
    Object.assign(metricsState, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });
    byId("metricsModel").value = "all";
    byId("metricsVer").value = "all";
    if (byId("metricsTier"))
        byId("metricsTier").value = "flagship";
    if (byId("metricsOffer"))
        byId("metricsOffer").value = "current";
    renderMetricsTable();
    focusTableControl(byId("metricsModel"));
}
const fixtureMETRICS_COLUMNS = [
    { id: "plan", label: "厂商·计划", cls: "sticky-col",
        cell: ({ m }) => `${m.isEst ? '<span class="est-badge" title="社区/推算估算值，非官方数字">≈估</span> ' : ""}<span class="metrics-vendor">${esc(m.vendor)}</span><span class="metrics-plan">${esc(m.plan)}</span>`,
        title: ({ m }) => m.vendor + " · " + m.plan },
    { id: "ver", label: "版本", cls: "col-more",
        cell: ({ m }) => `<span class="ver-tag ${m.ver === "V3" ? "ver-v3" : m.ver === "V2" ? "ver-v2" : "ver-na"}">${esc(m.ver)}</span>` },
    { id: "model", label: "模型", cls: "model-cell",
        cell: ({ m }) => `${esc(displayModelName(m.model))}${(m.note || "").startsWith("对照") ? '<br><span class="model-reference-note">套餐列表未列 · 牌价对照</span>' : ""}${listPriceHint(m)}` },
    { id: "price", label: "月费", sortKey: "price", asc: true, cls: "td-price",
        cell: ({ c, isPayg }) => (isPayg ? "按量" : fmtCNY(c.priceCNY)) },
    { id: "tps", label: "TPS", cls: "col-more tps-cell",
        cell: ({ m }) => esc(m.tps || "—") },
    { id: "cpm", label: "💵每M tokens", sortKey: "cpm", asc: true,
        cell: ({ c, isPayg }) => {
            const title = isPayg
                ? "官方牌价按 80% 输入 / 20% 输出、95% 缓存命中折成每百万人民币。有峰谷的取低峰。不是套餐月费除以额度。"
                : "用尽参考月额度时的每百万 tokens 折算成本；主值按额度区间中点排序（统一折算人民币）";
            const range = !isPayg && fullUseCostRangeText(c);
            return `<span style="font-weight:800;color:${cpmColor(c.costPerM)}" title="${esc(title)}">${fmtCpm(c.costPerM)}</span>${range ? `<br><span class="sub">${esc(range)}</span>` : ""}`;
        } },
    { id: "t5h", label: "Tokens/5h", sortKey: "t5h", cls: "col-more tok-cell",
        cell: ({ m, c, isPayg }) => (isPayg ? "—" : fTokCell(c.fLow, c.fHigh, m.windowPeriod === "none" ? "无5h上限" : m.windowPeriod === "month" ? "月度池；无5h额度" : "未公布")) },
    { id: "val5h", label: "💰价值/5h", cls: "col-more val-cell",
        cell: ({ c, isPayg, cur }) => (isPayg ? "—" : fmtVal(c.val5h, cur)) },
    { id: "r5h", label: "⏫倍率/5h", sortKey: "r5h", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.r5h)),
        cell: ({ c, isPayg }) => fmtRate(isPayg ? null : c.r5h) },
    { id: "twk", label: "Tokens/周", sortKey: "twk", cls: "col-more tok-cell",
        cell: ({ c, isPayg }) => (isPayg ? "—" : fTokCell(c.wkLowM, c.wkHighM)) },
    { id: "valWk", label: "💰价值/周", cls: "col-more val-cell",
        cell: ({ c, isPayg, cur }) => (isPayg ? "—" : fmtVal(c.valWk, cur)) },
    { id: "rwk", label: "⏫倍率/周", sortKey: "rwk", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.rwk)),
        cell: ({ c, isPayg }) => fmtRate(isPayg ? null : c.rwk) },
    { id: "tmo", label: "每月 tokens", sortKey: "tmo", cls: "tok-cell",
        cell: ({ c, isPayg }) => (isPayg ? '<span style="color:var(--faint)">无套餐额度</span>' : fTokCell(c.moLow, c.moHigh)) },
    { id: "valMo", label: "💰价值/月", cls: "col-more val-cell",
        cell: ({ c, isPayg, cur }) => (isPayg ? "—" : fmtVal(c.valMo, cur)) },
    { id: "rmo", label: "⏫倍率/月", sortKey: "rmo", cls: "col-more rate-cell",
        tdClass: ({ c, isPayg }) => (isPayg ? "" : " " + rateClass(c.rmo)),
        cell: ({ c, isPayg }) => fmtRate(isPayg ? null : c.rmo) },
    { id: "prov", label: "依据", cls: "prov-cell",
        cell: ({ prov }) => `<span class="conf ${prov.conf === "高" ? "conf-hi" : prov.conf === "中" ? "conf-mid" : "conf-lo"}">${esc(prov.conf)}</span>${esc(prov.text)}`,
        title: ({ m }) => [m.note, m.source].filter(Boolean).join(" · ") },
];
fixtureMETRICS_COLUMNS.forEach(column => { const current = METRICS_COLUMNS.find(item => item.id === column.id); if (current && column.cell)
    current.cell = column.cell; });
function renderMetricsHead() {
    if (tableViews.metrics)
        return;
    const tr = qs("#metricsTable thead tr");
    if (!tr)
        return;
    tr.innerHTML = METRICS_COLUMNS.map((c) => c.sortKey
        ? `<th scope="col" class="${c.cls || ""} sortable" data-sort="${c.sortKey}"><span>${c.label}</span></th>`
        : `<th scope="col" class="${c.cls || ""}">${c.label}</th>`).join("");
}
function fTokCell(lo, hi, emptyLabel = "credits制") {
    if (lo == null)
        return `<span style="color:var(--faint)">${esc(emptyLabel)}</span>`;
    const lowText = fmtTok(lo), highText = hi == null ? lowText : fmtTok(hi);
    if (hi == null || !(hi > lo * 1.05) || lowText === highText)
        return lowText;
    return `${lowText}–${highText}`;
}
function listPriceHint(m) {
    if (typeof m.apiIn !== "number")
        return "";
    const sym = m.cur === "USD" ? "$" : "¥";
    return `<span class="model-price" title="模型牌价，每百万 tokens"><span>输入 ${sym}${fmtUnit(m.apiIn)}</span> / <span>输出 ${sym}${fmtUnit(m.apiOut)}</span> / <span>缓存 ${sym}${fmtUnit(m.apiCache)}</span></span>`;
}
const fixtureMETRICS_NOTE_LEGEND = `<b>💵每M tokens</b> = 月费÷月 tokens 中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色&gt;¥1）。标「官方 API 按量」的行没有月费，这一列用同一套 80/20、95% 缓存假设把低峰牌价折成人民币，所以能和套餐排在一起；模型名下方仍是原始输入 / 输出 / 缓存命中。套餐行模型名下方的牌价也不是套餐的每 M 成本。同一请求额度下，牌价更高的模型「额度价值 / 倍率」更高，每 M 成本不变。带牌价的 credits 按这套单价把面值折成 tokens；没有逐模型牌价的美元 credits 仍按假设均价 ¥10/M，且不进入「真实单价」排行。标「官方系数」的行用厂商公布的积分系数、按同一套假设摊成 tokens，置信度为中，不进入每周 tokens 图。<br>` +
    `计算假设：输入/输出=80/20、缓存命中率 95%、每周 5 个 5h 窗口、每月 4.33 周。官方周 tokens：Tokens/5h=周÷5，Tokens/月=周×4.33。请求数制若同时写了每 5 小时、每周、每月上限，三列各自用该窗口的次数，不按「周÷5、周×4.33」互相换算，因此 Tokens/5h×5 可以不等于 Tokens/周。⏫额度倍率 = 该时段额度价值 ÷ 该时段分摊月费（5h=月费/21.65，周=月费/4.33，月=月费）。<b>「依据」列</b>标注出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间/牌价折算 · <span class="conf conf-lo">低</span>毛利/第三方/请求折算）。`;
function renderMetricsTable() {
    if (tableViews.metrics?.render) {
        tableViews.metrics.render();
        return;
    }
    const { rows, payg, shownRows } = metricsTableRows();
    const pageSize = responsivePageSize();
    const fingerprint = JSON.stringify([metricsState, pageSize, metricsState.fromPicker ? pickerState : null]);
    if (fingerprint !== metricsViewFingerprint) {
        metricsVisibleLimit = pageSize;
        metricsViewFingerprint = fingerprint;
    }
    const visibleRows = shownRows.slice(0, metricsVisibleLimit);
    byId("metricsTable").classList.toggle("is-empty", shownRows.length === 0);
    byId("metricsCount").textContent = visibleRows.length === shownRows.length ? `${shownRows.length} 行` : `已显示 ${visibleRows.length} / ${shownRows.length} 行`;
    const more = byId("metricsMoreBtn");
    if (more) {
        more.hidden = visibleRows.length >= shownRows.length;
        more.textContent = `显示更多额度记录（还有 ${shownRows.length - visibleRows.length} 行）`;
        more.setAttribute("aria-controls", "metricsBody");
    }
    byId("metricsBody").innerHTML = shownRows.length ? visibleRows.map((r) => {
        const m = r.m, c = r.c, isPayg = !!r.payg;
        const prov = isPayg ? (isPriceConfirmed(m, "payg") ? { text: "官方按量", conf: "高" } : { text: "历史牌价 · 待核实", conf: "低" }) : provenance(m);
        const ctx = { m, c, isPayg, cur: m.cur, prov };
        const tds = METRICS_COLUMNS.map((col) => {
            const cls = (col.cls || "") + (col.tdClass ? col.tdClass(ctx) : "");
            const title = col.title ? ` title="${esc(col.title(ctx))}"` : "";
            return `<td data-column="${esc(col.id)}" data-label="${esc(col.label)}" class="${cls}"${title}>${col.cell(ctx)}</td>`;
        }).join("");
        return `<tr class="${m.isEst ? "est-row" : ""}${isPayg ? " payg-row" : ""}">${tds}</tr>`;
    }).join("") : metricsState.fromPicker && pickerState.budget === "0"
        ? `<tr><td colspan="${METRICS_COLUMNS.length}" class="table-empty"><b>选购预算为「免费」，额度表只列付费套餐</b><p>免费档的额度见<a href="#free">免费 Coding 入口</a>；取消选购条件可查看全部额度。</p><button type="button" class="chip" data-apply-picker="metrics">取消选购条件</button></td></tr>`
        : `<tr><td colspan="${METRICS_COLUMNS.length}" class="table-empty"><b>当前模型与版本没有可展示的额度</b><p>可以${metricsState.fromPicker ? "调整「帮我选」条件、" : ""}调整模型、版本或购买范围；查看轻量模型时选择「全部模型档」。</p><button type="button" class="chip" id="metricsEmptyResetBtn" data-reset-metrics>清除筛选</button></td></tr>`;
    qsa("#metricsTable th.sortable").forEach((th) => {
        const col = METRICS_COLUMNS.find((c) => c.sortKey === th.dataset.sort);
        if (col)
            syncSortHeader(th, col.label, metricsState.sortKey, metricsState.sortDir, col.asc ? 1 : -1);
    });
    const reset = byId("metricsResetBtn");
    if (reset)
        reset.disabled = !metricsState.fromPicker && metricsState.model === "all" && metricsState.ver === "all" && metricsState.tier === "flagship" && metricsState.offer === "current" && metricsState.sortKey === "cpm" && metricsState.sortDir === 1;
    if (typeof syncPickerScopeControls === "function")
        syncPickerScopeControls();
    const sortColumn = METRICS_COLUMNS.find((c) => c.sortKey === metricsState.sortKey);
    const sortDescription = sortColumn ? `${esc(sortColumn.label)}${metricsState.sortDir === 1 ? "从低到高" : "从高到低"}` : "当前列";
    renderMetricsSortHint();
    byId("metricsNote").innerHTML =
        `<b>当前范围：</b>${metricsState.tier === "all" ? "含轻量模型" : "只看旗舰模型"}；${metricsState.offer === "all" ? "含历史与仅老用户续费档，购买前请核对来源" : "仅新用户当前可购买的套餐，与排行使用相同购买筛选"}。API 按量是参照行，不进入套餐排行。` +
            `当前 ${shownRows.length} 行（含 <b>${payg.length}</b> 行官方按量、<b>${rows.filter((r) => r.m.isEst).length}</b> 行「≈估」），按${sortDescription}排序。` +
            `<details class="metrics-legend"><summary>各列口径、计算假设与置信度说明</summary>${fixtureMETRICS_NOTE_LEGEND}</details>`;
}
function showMoreMetricsRows() {
    if (tableViews.metrics?.more) {
        tableViews.metrics.more();
        return;
    }
    const previousCount = Math.min(metricsVisibleLimit, metricsTableRows().shownRows.length);
    metricsVisibleLimit += responsivePageSize();
    renderMetricsTable();
    const firstNew = [...qsa("#metricsBody tr")][previousCount];
    if (firstNew) {
        firstNew.setAttribute("tabindex", "-1");
        focusTableControl(firstNew);
    }
    else
        focusTableControl(byId("metricsMoreBtn"));
}
function renderMetricsSortHint() {
    if (tableViews.metrics)
        return;
    const el = byId("metricsSortHint");
    const col = METRICS_COLUMNS.find((c) => c.sortKey === metricsState.sortKey);
    if (!el || !col)
        return;
    const hidden = byId("metricsTable").classList.contains("is-compact") && (col.cls || "").split(" ").includes("col-more");
    el.textContent = `排序：${col.label}${metricsState.sortDir === 1 ? "从低到高" : "从高到低"}${hidden ? "（明细列，展开查看）" : ""}`;
}
function populateModelFilter() {
    if (tableViews.metrics?.models) {
        tableViews.metrics.models();
        return;
    }
    const sel = byId("metricsModel");
    const models = [...new Set([...METRICS_ALL.map((m) => m.model), ...paygReferenceRows().map((r) => r.m.model)])].sort((a, b) => displayModelName(a).localeCompare(displayModelName(b), "zh"));
    sel.innerHTML = '<option value="all">全部模型</option>' + models.map((x) => `<option value="${esc(x)}">${esc(displayModelName(x))}</option>`).join("");
    if (metricsState.model !== "all") {
        if ([...sel.options].some((o) => o.value === metricsState.model))
            sel.value = metricsState.model;
        else
            metricsState.model = "all";
    }
}

/* These source/readme sections are now native Vue and have no production boot renderer. */
renderMisc();
