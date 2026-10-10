/* ============ Coding Plan 比价中心 — 数据表 / 额度表 / 并排对比 ============ */
"use strict";

/* ---------- 数据表 ---------- */

function focusTableControl(el) {
  if (!el || el.isConnected === false || el.disabled || typeof el.focus !== "function") return false;
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}
function tableFeedback(message) {
  const el = byId("tableFeedback");
  if (el) el.textContent = message;
}
function syncSortHeader(th, label, key, dir, firstDir = 1) {
  const active = th.dataset.sort === key;
  const direction = (v) => v === 1 ? "从低到高" : "从高到低";
  th.classList.toggle("sort-active", active);
  const span = th.querySelector("span");
  if (span) span.textContent = label + (active ? (dir === 1 ? " ↑" : " ↓") : "");
  if (active) th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
  else th.removeAttribute("aria-sort");
  const next = direction(active ? -dir : firstDir);
  th.title = `点击或按 Enter / 空格，按${label}${next}排序`;
  th.setAttribute("aria-label", `${label}${active ? "，当前" + direction(dir) : ""}，激活后${next}排序`);
}

function planMonthlyPriceCell(p) {
  const sub = p.priceM > 0 ? `<br><span class="sub">≈${fmtCNY(cnyOf(p, "M"))}/${esc(priceUnit(p))}</span>` : "";
  /* 主标价为连续包月价的档位，另列不续费的单月价，便于和以单月价为标价的套餐对照。 */
  const single = p.singleMonthPrice > 0 ? `<br><span class="sub">连续包月价；单月一次购买 ${esc(priceText({ ...p, priceM:p.singleMonthPrice }, "priceM"))}</span>` : "";
  const chosen = tableState.fromPicker ? `<br><span class="sub">选购口径：${esc(priceLine(p))}；首次 ${esc(pickerFirstPaymentText(p))}</span>` : "";
  return esc(planPriceLabel(p)) + sub + single + chosen;
}
function planAnnualPriceCell(p) {
  if (p.priceY == null) return isOneTimePlan(p) ? "—" : '<span class="sub">未列年付价</span>';
  return esc(planPriceLabel(p, "Y")) + `<br><span class="sub">≈${fmtCNY(cnyOf(p, "Y"))}/${p.seat ? "席位/月" : "月"}</span><br><span class="sub">${esc(annualPaymentText(p))}</span>`;
}

/* 数据表与两种导出的列定义同源；单位及更新元数据只在导出里单列。 */
const PLAN_COLUMNS = [
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
  /* pickerOnly：仅在应用选购条件后有值；完整权益窗口跳过空值行，导出保留固定列。 */
  { id: "selectedPayment", label: "选购支付口径", table:false, pickerOnly:true, value:(p) => tableState.fromPicker ? priceLine(p) : "" },
  { id: "selectedFirstPayment", label: "选购首次付款", table:false, pickerOnly:true, value:(p) => tableState.fromPicker ? pickerFirstPaymentText(p) : "" },
  { id: "quota", label: "额度（官方口径）", cls: "td-quota", value: (p) => resolvedField(p, "quota") },
  { id: "models", label: "模型", cls: "td-models col-opt", value: (p) => resolvedField(p, "models") },
  { id: "tools", label: "支持工具", cls: "col-opt", value: (p) => resolvedField(p, "tools") },
  { id: "note", label: "备注", cls: "td-note col-opt", value: (p) => resolvedField(p, "note"),
    markdownValue: (p) => resolvedField(p, "note") || "—", cell: (p) => esc(resolvedField(p, "note") || "—") },
  { id: "url", label: "来源", cls: "td-trust", value: (p) => p.url || "",
    cell: (p) => priceCheckHtml(p), detailCell: (p) => linkListHtml([p.url], "官网页面") },
  { id: "priceStatus", label: "价格核实状态", table: false, value: (p) => priceCheckLabel(p) },
  { id: "priceCheckedAt", label: "价格核查日期", table: false, value: (p) => (priceCheckOf(p) || {}).checkedAt || "" },
  { id: "priceSources", label: "价格核查来源", table: false, value: (p) => priceCheckSources(p).join(" ; "),
    detailCell: (p) => linkListHtml(priceCheckSources(p), "核价来源") },
  { id: "priceCheckReason", label: "价格核查说明", table: false, value: (p) => displayPriceReason((priceCheckOf(p) || {}).reason || "") },
  { id: "mainland", label: "中国大陆可用性", table: false, value: mainlandAccessText },
  { id: "updated", label: "数据更新日期", table: false, markdown: false, value: () => META.updated },
  { id: "rate", label: "参考汇率（USD/CNY）", table: false, markdown: false, value: () => RATE },
  { id: "rateInr", label: "参考汇率（INR/CNY）", table: false, markdown: false, value: () => RATE_INR_CNY },
  { id: "rateAsOf", label: "汇率日期", table: false, markdown: false, value: () => META.rateAsOf },
  { id: "rateSource", label: "汇率来源", table: false, markdown: false, value: () => META.rateSource || "" },
];
const PLAN_TABLE_COLUMNS = PLAN_COLUMNS.filter((c) => c.table !== false);
/* 完整权益窗口里的网址列显示为可点击链接；非 http(s) 地址不生成链接。 */
function linkListHtml(urls, label) {
  const links = urls.filter((url) => safeHref(url));
  return links.length ? links.map((url, i) => `<a href="${safeHref(url)}" target="_blank" rel="noopener">${esc(label)}${links.length > 1 ? i + 1 : ""} ↗</a>`).join(" · ") : "—";
}
function responsivePageSize() { return window.innerWidth < 768 ? 5 : 20; }
let tableVisibleLimit = responsivePageSize();
let tableViewFingerprint = "";

/* 中转站和价格待核实的历史价默认不显示，打开「含中转站与待核价格」后与其他筛选叠加；导出与当前显示一致。 */
function tableExtraHidden(p) { return isRelay(p) || !isPriceConfirmed(p); }
function tableFilteredPlans() {
  const q = tableState.search.trim().toLowerCase();
  return PLANS.filter(isOnSalePlan).filter((p) =>
    (tableState.cat === "all" || p.cat === tableState.cat) &&
    (tableState.region === "all" || p.region === tableState.region) &&
    (tableState.vendor === "all" || p.vendor === tableState.vendor) &&
    (!tableState.fromPicker || matchesPickerPurchase(p)) &&
    (!q || queryHit(planSearchBlob(p), q))
  );
}
/* 筛选 + 排序集中在这里：渲染与 CSV/Markdown 导出共用同一份结果 */
function computeTableRows() {
  const rows = tableFilteredPlans().filter((p) => tableState.extra || !tableExtraHidden(p));
  const k = tableState.sortKey;
  const sortVal = (p) => k === "selectedMonthly" && tableState.fromPicker ? pickerMonthlyCNY(p) : (p[k] == null ? NaN : toCNY(p[k], p.cur));
  return rows.slice().sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b);
    const aN = Number.isNaN(va), bN = Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 「定制」（无公开价）恒排末尾 */
    return (va - vb) * tableState.sortDir;
  });
}

function tableFingerprint(pageSize = responsivePageSize()) {
  return JSON.stringify([tableState, pageSize, tableState.fromPicker ? pickerState : null]);
}
function syncTablePriceSort() {
  const control = /** @type {HTMLSelectElement | null} */ (byId("tablePriceSort"));
  if (!control) return;
  control.value = tableState.sortKey + ":" + tableState.sortDir;
  for (const option of Array.from(control.querySelectorAll("option"))) option.disabled = option.value.startsWith("selectedMonthly:") && !tableState.fromPicker;
}

function renderTable() {
  if (!tableState.fromPicker && tableState.sortKey === "selectedMonthly") { tableState.sortKey = "priceM"; tableState.sortDir = 1; }
  syncTablePriceSort();
  const focused = /** @type {HTMLElement | null} */ (document.activeElement);
  const focusedPlanId = focused && byId("tableBody").contains(focused) && focused.classList.contains("cmp-add") ? focused.dataset.planId : "";
  const rows = computeTableRows();
  const pageSize = responsivePageSize();
  const fingerprint = tableFingerprint(pageSize);
  if (fingerprint !== tableViewFingerprint) {
    tableVisibleLimit = pageSize;
    tableViewFingerprint = fingerprint;
  }
  /* 筛选/历史恢复仍包含当前键盘操作项时，展开到它所在页，保持稳定 ID 的焦点恢复。 */
  if (focusedPlanId) {
    const index = rows.findIndex((p) => p.id === focusedPlanId);
    if (index >= tableVisibleLimit) tableVisibleLimit = Math.ceil((index + 1) / pageSize) * pageSize;
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
  /* 剩余记录多于一批时提供一次展开全部，手机每批 5 条也不必反复点按。 */
  const all = byId("tableAllBtn");
  if (all) {
    all.hidden = rows.length - visibleRows.length <= pageSize;
    all.textContent = `显示全部 ${rows.length} 条`;
    all.setAttribute("aria-controls", "tableBody");
  }
  qsa("#planTable thead th.sortable").forEach((th) => {
    const col = PLAN_COLUMNS.find((c) => c.id === th.dataset.sort);
    if (col) syncSortHeader(th, col.label, k, tableState.sortDir);
  });
  const filters = [tableState.search.trim() ? `关键词「${tableState.search.trim()}」` : "",
    tableState.cat === "all" ? "" : CAT_LABEL[tableState.cat], tableState.region === "all" ? "" : REGION_LABEL[tableState.region],
    tableState.vendor === "all" ? "" : tableState.vendor,
    tableState.fromPicker ? "选购条件" : ""].filter(Boolean).join(" · ");
  /* 价格表只收有公开标价的付费档；选购条件为「免费」时说明去处，而不是让用户改关键词。 */
  const freeScope = tableState.fromPicker && pickerState.budget === "0";
  byId("tableBody").innerHTML = rows.length ? visibleRows.map((p) => `<tr>${PLAN_TABLE_COLUMNS.map((col) => {
    const cls = col.tdClass ? col.tdClass(p) : col.cls || "";
    return `<td data-column="${esc(col.id)}" data-label="${esc(col.label)}"${cls ? ` class="${cls}"` : ""}>${col.cell ? col.cell(p) : esc(col.value(p))}</td>`;
  }).join("")}</tr>`).join("") : freeScope
    ? `<tr><td colspan="${PLAN_TABLE_COLUMNS.length}" class="table-empty"><b>选购预算为「免费」，公开标价表不含免费档</b><p>免费档在<a href="#free">免费 Coding 入口</a>；取消选购条件可查看全部标价记录。</p><button type="button" class="chip" data-apply-picker="table">取消选购条件</button></td></tr>`
    : `<tr><td colspan="${PLAN_TABLE_COLUMNS.length}" class="table-empty"><b>没有匹配的公开标价记录</b><p>${esc(filters || "当前筛选")}没有结果${hiddenExtra ? `，另有 ${hiddenExtra} 档中转站或待核价格未显示` : ""}。可以${tableState.fromPicker ? "调整「帮我选」条件、" : ""}调整关键词或清除筛选。${cmpState.items.length ? "已选的对比方案仍保留。" : ""}</p>${hiddenExtra ? '<button type="button" class="chip" data-table-extra>显示中转站与待核价格</button> ' : ""}<button type="button" class="chip" id="tableEmptyResetBtn" data-reset-table>清除筛选</button></td></tr>`;
  ["exportCsvBtn", "copyMdBtn"].forEach((id) => {
    const btn = byId(id);
    if (!btn) return;
    btn.disabled = !rows.length;
    btn.title = rows.length ? (id === "exportCsvBtn" ? "下载当前筛选结果为 CSV（UTF-8）" : "复制当前筛选结果为 Markdown 表格") : "没有可导出的结果，请先调整筛选";
  });
  const reset = byId("tableResetBtn");
  if (reset) reset.disabled = !tableState.fromPicker && !tableState.extra && !tableState.search && tableState.cat === "all" && tableState.region === "all" && tableState.vendor === "all" && tableState.sortKey === "priceM" && tableState.sortDir === 1;
  if (typeof syncPickerScopeControls === "function") syncPickerScopeControls();
  tableFeedback("");
  syncTableCmpButtons();
  /* 防抖搜索期间用户可能已 Tab 到方案按钮；按身份找回重绘后的同一操作。 */
  if (focusedPlanId && focused.isConnected === false) {
    const replacement = [...qsa("#tableBody .cmp-add")].find((btn) => btn.dataset.planId === focusedPlanId);
    if (!focusTableControl(replacement)) focusTableControl(byId("searchInput"));
  }
}

function syncTableExtraToggle(hiddenExtra) {
  const toggle = byId("tableExtraToggle");
  if (!toggle) return;
  toggle.classList.toggle("active", tableState.extra);
  toggle.setAttribute("aria-pressed", tableState.extra ? "true" : "false");
  toggle.title = tableState.extra ? "隐藏中转站和价格待核实的历史记录" : `显示中转站和价格待核实的历史记录${hiddenExtra ? `（当前筛选下 ${hiddenExtra} 档）` : ""}`;
}
/* 厂商下拉只列价格表里确有记录的厂商，按中文名排序；选项已就绪时不重建。 */
function populateTableVendors() {
  const select = byId("selectVendor");
  if (!select || select.options.length > 1) return;
  const vendors = [...new Set(PLANS.filter(isOnSalePlan).map((p) => p.vendor))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  select.innerHTML = '<option value="all">全部厂商</option>' + vendors.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  select.value = tableState.vendor;
}
function showMoreTableRows(all = false) {
  const total = computeTableRows().length;
  const previousCount = Math.min(tableVisibleLimit, total);
  tableVisibleLimit = all ? Math.max(total, tableVisibleLimit) : tableVisibleLimit + responsivePageSize();
  renderTable();
  /* 新增记录的第一项是继续浏览的位置；对比已满时按钮禁用、最后一页「显示更多」也已隐藏，
     依次回退到新增行本身和搜索框，焦点不丢到页面顶部。 */
  const firstNew = [...qsa("#tableBody .cmp-add")][previousCount];
  if (focusTableControl(firstNew)) return;
  const firstRow = [...qsa("#tableBody tr")][previousCount];
  if (firstRow) { firstRow.setAttribute("tabindex", "-1"); if (focusTableControl(firstRow)) return; }
  if (!focusTableControl(byId("tableMoreBtn"))) focusTableControl(byId("searchInput"));
}

function revealTablePlan(planId) {
  const index = computeTableRows().findIndex((plan) => plan.id === planId);
  if (index < 0) return false;
  if (index >= tableVisibleLimit) {
    const pageSize = responsivePageSize();
    tableVisibleLimit = Math.ceil((index + 1) / pageSize) * pageSize;
    tableViewFingerprint = tableFingerprint(pageSize);
    renderTable();
  }
  return true;
}

function resetTableFilters() {
  Object.assign(tableState, { search: "", cat: "all", region: "all", vendor: "all", sortKey: "priceM", sortDir: 1, fromPicker:false, extra:false });
  byId("searchInput").value = "";
  byId("selectCat").value = "all";
  byId("selectRegion").value = "all";
  if (byId("selectVendor")) byId("selectVendor").value = "all";
  renderTable();
  focusTableControl(byId("searchInput"));
}

/* ---------- 导出：当前筛选 + 排序结果 ---------- */
function tableExportName(ext, description = null) {
  const desc = description == null ? [tableState.search.trim(), tableState.cat, tableState.region].filter((x) => x && x !== "all").join("-") : description;
  const safe = (desc || "all").replace(/[\\/:*?"<>|]+/g, "");
  const d = new Date();
  const day = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return `coding-plans-${safe}-${day}.${ext}`;
}
/* 引号 doubling 之外，还要防 CSV 公式注入：以 = + - @ 开头的单元格加 ' 前缀，Excel 不会当公式执行。所有 CSV 导出共用。 */
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function tableRowsCsv(rows) {
  const lines = [PLAN_COLUMNS.map((c) => csvCell(c.label)).join(",")]
    .concat(rows.map((p) => PLAN_COLUMNS.map((c) => csvCell(c.value(p))).join(",")));
  return lines.join("\r\n");
}
function downloadCsvText(csv, filename) {
  /* \uFEFF 让 Excel 正确识别 UTF-8 */
  downloadTextFile("\uFEFF" + csv, filename, "text/csv;charset=utf-8");
}
function downloadTextFile(text, filename, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function exportTableCsv() {
  const rows = computeTableRows();
  if (!rows.length) { tableFeedback("没有可导出的方案，请先调整筛选。"); return; }
  downloadCsvText(tableRowsCsv(rows), tableExportName("csv"));
  flashBtn("exportCsvBtn", `✓ 已导出 ${rows.length} 档`);
  tableFeedback(`已生成包含 ${rows.length} 档方案的 CSV，计价单位、数据日期和汇率已保留。`);
}
function tableRowsMarkdown(rows) {
  const escMd = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const columns = PLAN_COLUMNS.filter((c) => c.markdown !== false);
  const head = "| " + columns.map((c) => c.label).join(" | ") + " |";
  const sep = "|" + columns.map(() => "---").join("|") + "|";
  const body = rows.map((p) => "| " + columns.map((c) => escMd(c.markdownValue ? c.markdownValue(p) : c.value(p))).join(" | ") + " |");
  const meta = `数据更新日期：${META.updated}；参考汇率：1 USD ≈ ${RATE} CNY，1 INR ≈ ${RATE_INR_CNY} CNY（${META.rateAsOf}；来源：${META.rateSource || "未提供"}）。金额包含计价单位；一次性、席位及每 4 周价格不能直接视为个人月费。`;
  return [meta, "", head, sep].concat(body).join("\n");
}
async function copyTextToClipboard(text) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch (e) {
    /* file:// 或旧浏览器降级：隐藏 textarea + execCommand */
    const previousFocus = document.activeElement;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    /* 原生模态窗口会让 body 内其它节点 inert；权益和比较窗口都在当前窗口内选择文本。 */
    const dialogs = [...qsa("dialog")].filter((dlg) => dlg.open === true || dlg.getAttribute("open") != null);
    const focusedDialog = previousFocus && previousFocus.closest ? previousFocus.closest("dialog") : null;
    const host = dialogs.includes(focusedDialog) ? focusedDialog : dialogs[dialogs.length - 1] || document.body;
    host.appendChild(ta);
    ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
    focusTableControl(previousFocus);
  }
  return ok;
}
async function copyTableMarkdown() {
  const rows = computeTableRows();
  if (!rows.length) { tableFeedback("没有可复制的方案，请先调整筛选。"); return; }
  const ok = await copyTextToClipboard(tableRowsMarkdown(rows));
  flashBtn("copyMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
  tableFeedback(ok ? `已复制 ${rows.length} 档方案的 Markdown 表格。` : "浏览器限制了剪贴板访问，可以使用 CSV 下载当前结果。");
}
function flashBtn(id, text) {
  const btn = byId(id);
  if (!btn) return;
  if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => { btn.textContent = btn.dataset.orig; }, 1800);
}

/* ---------- 并排对比：数据表内勾选 2–4 档，URL（cmp=）可分享 ---------- */
let cmpReturnFocus = null;
let cmpNeedsFocusRestore = false;
let cmpBackgroundState = [];

function isCmpModalOpen() {
  const dlg = byId("cmpModal");
  return !!dlg && (dlg.open === true || dlg.getAttribute("open") != null);
}
function cmpFocusableElements() {
  const dlg = byId("cmpModal");
  return modalFocusableElements(dlg);
}
function modalFocusableElements(dlg) {
  if (!dlg) return [];
  return [...dlg.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")].filter((el) => {
    if (el.disabled || el.hidden || el.tabIndex < 0 || el.closest("[hidden], [inert]")) return false;
    for (let parent = el.parentNode; parent && parent !== dlg; parent = parent.parentNode) {
      if (parent.tagName === "DETAILS" && !parent.open) {
        const summary = parent.querySelector("summary");
        if (!summary || (el !== summary && !summary.contains(el))) return false;
      }
    }
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && el.getClientRects().length > 0;
  });
}
function setCmpBackgroundInert(on) {
  if (on) {
    if (cmpBackgroundState.length) return;
    const dlg = byId("cmpModal"), backdrop = byId("cmpBackdrop");
    cmpBackgroundState = Array.from(document.body.children).filter((el) => el !== dlg && el !== backdrop && !/^(SCRIPT|STYLE)$/.test(el.tagName))
      .map((el) => ({ el, inert: el.getAttribute("inert"), ariaHidden: el.getAttribute("aria-hidden") }));
    cmpBackgroundState.forEach(({ el }) => { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); });
  } else {
    cmpBackgroundState.forEach(({ el, inert, ariaHidden }) => {
      if (inert == null) el.removeAttribute("inert"); else el.setAttribute("inert", inert);
      if (ariaHidden == null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", ariaHidden);
    });
    cmpBackgroundState = [];
  }
}
function finishCmpModalClose() {
  const backdrop = byId("cmpBackdrop");
  if (backdrop) backdrop.hidden = true;
  const dlg = byId("cmpModal");
  if (dlg) dlg.removeAttribute("aria-modal");
  document.body.classList.remove("has-cmp-modal");
  setCmpBackgroundInert(false);
  restoreCmpFocus();
}

function restoreCmpFocus() {
  if (!cmpNeedsFocusRestore) return;
  cmpNeedsFocusRestore = false;
  const previous = cmpReturnFocus;
  cmpReturnFocus = null;
  if (!focusTableControl(previous) && !focusTableControl(byId("cmpOpenBtn"))) focusTableControl(byId("searchInput"));
}

function cmpAdd(vendor, plan) {
  const p = findPlanReference(plan == null ? vendor : [vendor, plan]);
  if (!p) return;
  if (cmpState.items.some((x) => x.id === p.id)) return;
  if (cmpState.items.length >= CMP_MAX) {
    flashBtn("cmpOpenBtn", `最多对比 ${CMP_MAX} 档`);
    tableFeedback(`最多对比 ${CMP_MAX} 档，请先移出一档再添加。`);
    return;
  }
  cmpState.items.push(p);
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
  tableFeedback(`已加入 ${shortVendor(p.vendor)} ${p.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档${cmpState.items.length === 1 ? "，再选一档即可比较" : ""}。`);
}
function cmpRemove(vendor, plan) {
  const index = cmpState.items.findIndex((x) => plan == null ? x.id === vendor : x.vendor === vendor && x.plan === plan);
  if (index < 0) return;
  const removed = cmpState.items[index];
  const modalOpen = isCmpModalOpen();
  cmpState.items = cmpState.items.filter((x) => x.id !== removed.id);
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
  tableFeedback(`已移出 ${shortVendor(removed.vendor)} ${removed.plan}。当前选择 ${cmpState.items.length}/${CMP_MAX} 档。`);
  if (modalOpen) {
    if (cmpState.items.length < 2) closeCmpModal();
    else {
      renderCmpModal();
      const remaining = qsa("#cmpTable .cmp-remove");
      if (!focusTableControl(remaining[Math.min(index, remaining.length - 1)])) focusTableControl(byId("cmpCloseBtn"));
    }
  }
}
function cmpClear() {
  if (!cmpState.items.length) return;
  const focused = document.activeElement;
  const focusInBar = focused && byId("cmpBar").contains(focused);
  cmpState.items = [];
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
  closeCmpModal();
  /* 比较条清空后消失；弹窗未打开时也要给键盘用户保留一个可继续操作的位置。 */
  if (focusInBar) focusTableControl(byId("searchInput"));
  tableFeedback("已清空对比选择。");
}
function renderCmpBar() {
  const bar = byId("cmpBar");
  if (!bar) return;
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
    if (!btn) return;
    btn.disabled = n < 2;
    btn.title = n < 2 ? "至少选择 2 档后导出对比" : id === "copyCmpMdBtn" ? "复制已选方案的完整对比与核价元数据" : "下载已选方案的完整对比与核价元数据";
  });
  cmpFeedback("");
}
function syncTableCmpButtons(previousFocus = null) {
  const buttons = [...qsa(".cmp-add[data-plan-id]")];
  buttons.forEach((btn) => {
    const scope = btn.closest("[id]");
    btn.dataset.cmpScope = scope ? scope.id : "";
    const on = cmpState.items.some((x) => x.id === btn.dataset.planId);
    btn.textContent = on ? "✓ 对比中" : "＋对比";
    const full = !on && cmpState.items.length >= CMP_MAX;
    if (full) btn.textContent = "对比已满";
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
      if (!focusTableControl(nearby)) focusTableControl(byId("searchInput"));
    }
  }
}
function cmpFeedback(message) {
  const el = byId("cmpFeedback");
  if (el) el.textContent = message;
}
function exportCmpCsv() {
  const rows = cmpState.items.slice();
  if (rows.length < 2) { cmpFeedback("请至少选择 2 档方案后导出对比。"); return; }
  downloadCsvText(tableRowsCsv(rows), tableExportName("csv", "compare"));
  flashBtn("exportCmpCsvBtn", `✓ 已导出 ${rows.length} 档`);
  cmpFeedback(`已导出 ${rows.length} 档对比方案，完整权益、计价单位、核价来源、数据日期和汇率已保留。`);
}
async function copyCmpMarkdown() {
  const rows = cmpState.items.slice();
  if (rows.length < 2) { cmpFeedback("请至少选择 2 档方案后复制对比。"); return; }
  const ok = await copyTextToClipboard(`并排对比（${rows.length} 档方案）\n\n` + tableRowsMarkdown(rows));
  flashBtn("copyCmpMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制失败");
  cmpFeedback(ok ? `已复制 ${rows.length} 档方案的完整对比与核价元数据。` : "浏览器限制了剪贴板访问，可以导出对比 CSV。");
}
function renderCmpModal() {
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
function openCmpModal() {
  if (cmpState.items.length < 2) return;
  const dlg = byId("cmpModal");
  if (!dlg) return;
  renderCmpModal();
  if (isCmpModalOpen()) return;
  const active = document.activeElement;
  cmpReturnFocus = active && active !== document.body && !dlg.contains(active) ? active : null;
  cmpNeedsFocusRestore = true;
  const fallback = typeof dlg.showModal !== "function";
  dlg.classList.toggle("cmp-fallback", fallback);
  dlg.setAttribute("aria-modal", "true");
  document.body.classList.add("has-cmp-modal");
  if (!fallback) dlg.showModal();
  else {
    dlg.setAttribute("open", "");
    const backdrop = byId("cmpBackdrop");
    if (backdrop) backdrop.hidden = false;
    setCmpBackgroundInert(true);
  }
  focusTableControl(byId("cmpCloseBtn"));
}
function closeCmpModal() {
  const dlg = byId("cmpModal");
  if (!dlg || !isCmpModalOpen()) return;
  if (!dlg.classList.contains("cmp-fallback") && typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
  finishCmpModalClose();
}

/* ---------- 动态 / 来源 / 说明 ---------- */
/* 来源证据只增不改：记录改用新来源后，旧证据留在台账里，但不再作为当前依据展示。 */
function currentPriceSources() {
  const used = new Set(Object.values(PRICE_CHECKS.rows).flatMap((row) => row.sourceIds || []));
  return Object.entries(PRICE_CHECKS.sources).filter(([id]) => used.has(id)).map(([, source]) => source);
}
function dynamicEndDate(d) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.endDate || "")) return d.endDate;
  /* 旧记录只有文字范围；仅识别活动期限，核对日志保持其当日原文。 */
  if (d.checked || !/活动|促销|畅用/.test(d.text || "")) return "";
  const range = String(d.text || "").match(/(\d{2})-(\d{2})\s*[~～–—]\s*(\d{2})-(\d{2})/);
  if (!range || !/^\d{4}-/.test(d.date || "")) return "";
  const year = Number(d.date.slice(0, 4)) + (range[3] + range[4] < range[1] + range[2] ? 1 : 0);
  return `${year}-${range[3]}-${range[4]}`;
}
function dynamicStatus(d, today = chinaCalendarDay()) {
  if (!d.checked && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && d.date > today) return { key: "upcoming", label: "计划中 · 尚未发生" };
  const endDate = dynamicEndDate(d);
  if (endDate && endDate < today) return { key: "ended", label: "已结束 · " + endDate };
  return { key: "", label: "" };
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
  if (checkList) checkList.innerHTML = sorted.filter((d) => d.checked).map((d) => dynItem(d, today)).join("");
  const priceSources = currentPriceSources();
  byId("sourceList").innerHTML =
    `<h3>📖 全部来源（官方定价页 / 权威报道）</h3>` +
    SOURCES.map(
      (g) => `<details class="source-group"><summary>${esc(g.group)} <span class="sub">${g.urls.length} 个来源</span></summary><ul>${g.urls.map((u) => {
        const href = safeHref(u);
        return href ? `<li><a href="${href}" tabindex="0" target="_blank" rel="noopener">${esc(u)}</a></li>` : "";
      }).join("")}</ul></details>`
    ).join("") + `<details class="method-box audit-sources"><summary>本次逐条核价来源（${priceSources.length} 页）</summary><ul>` +
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
  if (uncertainSummary) uncertainSummary.textContent = `展开全部不确定性说明（${pendingPrices.length} 条价格待核实，另 ${UNCERTAIN.length} 条口径说明）`;
  byId("rateText").textContent = RATE;
  byId("rateText2").textContent = RATE;
  byId("footDate").textContent = META.updated;
  const heroDate = byId("heroDate");
  if (heroDate) heroDate.textContent = META.updated;
}

/* ---------- 额度深度对比表 ---------- */
/* 额度换算的常量与纯函数（WEEKS_PER_MONTH、blendPrice、computeMetrics 等）在 js/metrics.js */

function resetMetricsFilters() {
  Object.assign(metricsState, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker:false });
  byId("metricsModel").value = "all";
  byId("metricsVer").value = "all";
  if (byId("metricsTier")) byId("metricsTier").value = "flagship";
  if (byId("metricsOffer")) byId("metricsOffer").value = "current";
  renderMetricsTable();
  focusTableControl(byId("metricsModel"));
}

/* 表的 16 列在这里集中定义：表头（含排序键与紧凑模式折叠类）、排序取值、单元格渲染同源。
   加列只改这个数组；.col-more 控制该列在紧凑模式下是否隐藏。 */
const METRICS_COLUMNS = [
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
    cell: ({ m, c, isPayg }) => (isPayg ? "—" : fTokCell(c.fLow, c.fHigh,
      m.windowPeriod === "none" ? "无5h上限" : m.windowPeriod === "month" ? "月度池；无5h额度" : "未公布")) },
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

/* 表头由列配置生成（boot 时跑一次，先于 renderMetricsTable） */
function renderMetricsHead() {
  const tr = qs("#metricsTable thead tr");
  if (!tr) return;
  tr.innerHTML = METRICS_COLUMNS.map((c) =>
    c.sortKey
      ? `<th scope="col" class="${c.cls || ""} sortable" data-sort="${c.sortKey}"><span>${c.label}</span></th>`
      : `<th scope="col" class="${c.cls || ""}">${c.label}</th>`
  ).join("");
}

/* 排序键 → 行取值。null/NaN 恒排末尾（按量无月费、credits 制等）。 */
const METRICS_SORT_GET = {
  price: (r) => r.c.priceCNY,
  cpm: (r) => r.c.costPerM ?? NaN,
  t5h: (r) => r.c.fLow,
  r5h: (r) => r.c.r5h,
  twk: (r) => r.c.wkLowM,
  rwk: (r) => r.c.rwk,
  tmo: (r) => r.c.moLow,
  rmo: (r) => r.c.rmo,
};

/* 无额度（credits 制无牌价）的时段显示占位。与 windowSentence 的 tokSpan 同一规则：
   上下限差 ≤5% 时只显上限值，避免「100–103M」这类噪音区间。 */
function fTokCell(lo, hi, emptyLabel = "credits制") {
  if (lo == null) return `<span style="color:var(--faint)">${esc(emptyLabel)}</span>`;
  const lowText = fmtTok(lo), highText = hi == null ? lowText : fmtTok(hi);
  if (hi == null || !(hi > lo * 1.05) || lowText === highText) return lowText;
  return `${lowText}–${highText}`;
}
function fmtRate(v) { return v == null ? "—" : `${v.toFixed(1)}×`; }

function fmtVal(v, cur) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (cur === "CNY") return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
  return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
function rateClass(r) { return r == null || !Number.isFinite(r) ? "" : r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
function fmtCpm(v) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
function fmtUnit(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10);
  if (n >= 1) return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 10000) / 10000);
}
function listPriceHint(m) {
  if (typeof m.apiIn !== "number") return "";
  const sym = m.cur === "USD" ? "$" : "¥";
  return `<span class="model-price" title="模型牌价，每百万 tokens"><span>输入 ${sym}${fmtUnit(m.apiIn)}</span> / <span>输出 ${sym}${fmtUnit(m.apiOut)}</span> / <span>缓存 ${sym}${fmtUnit(m.apiCache)}</span></span>`;
}
function cpmColor(v) {
  const tier = cpmTier(v);
  return tier === "na" ? "var(--faint)" : tier === "lo" ? "var(--green)" : tier === "mid" ? "var(--gold)" : "var(--red)";
}

/* 数据来源标注：每行额度的出处与置信度 */
function provenance(m) {
  const plan = m.ref != null ? findPlanReference(m.ref) : null;
  if (plan && !isPriceConfirmed(plan)) return { text: "历史价折算 · 价格待核", conf: "低" };
  if (m.isEst) return { text: m.method, conf: m.confidence };
  if (m.creditCNY != null || m.creditUSD != null) {
    if (typeof m.apiIn === "number") return { text: "牌价折算", conf: "中" };
    return { text: "官方credits", conf: "高" };
  }
  if (m.note && m.note.includes("系数折算")) return { text: "官方系数", conf: "中" };
  if ((m.note && m.note.includes("第三方")) || (m.source && m.source.includes("第三方"))) return { text: "第三方估算", conf: "低" };
  if (m.reqPerWk != null || m.reqPerMo != null || m.reqPer5h != null) return { text: "请求折算", conf: "低" };
  return { text: "官方估算", conf: "高" };
}

function paygReferenceRows() {
  /* 刊例在 data.js 的 PAYG_REFERENCES。每M = 低峰牌价按 95% 缓存、80/20 折成人民币。不进套餐倍率，也不进排行图。 */
  return PAYG_REFERENCES.map((s) => {
    const m = {
      vendor: s.vendor, plan: "官方 API 按量", ver: "—", model: s.model, cur: s.cur,
      apiIn: s.apiIn, apiOut: s.apiOut, apiCache: s.apiCache, tps: "—",
      note: s.note, source: s.source, isEst: false, payg: true, url: s.url,
    };
    return {
      payg: true, m,
      c: {
        priceCNY: null, costPerM: toCNY(blendPrice(m), s.cur),
        fLow: null, moLow: null, r5h: null, rwk: null, rmo: null,
        val5h: null, valWk: null, valMo: null, wkLowM: null,
      },
    };
  });
}

/* 额度表脚注的固定说明：口径、假设与置信度图例变更时只改这里；行数与排序描述在渲染时拼接 */
const METRICS_NOTE_LEGEND =
  `<b>💵每M tokens</b> = 月费÷月 tokens 中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色&gt;¥1）。标「官方 API 按量」的行没有月费，这一列用同一套 80/20、95% 缓存假设把低峰牌价折成人民币，所以能和套餐排在一起；模型名下方仍是原始输入 / 输出 / 缓存命中。套餐行模型名下方的牌价也不是套餐的每 M 成本。同一请求额度下，牌价更高的模型「额度价值 / 倍率」更高，每 M 成本不变。带牌价的 credits 按这套单价把面值折成 tokens；没有逐模型牌价的美元 credits 仍按假设均价 ¥10/M，且不进入「真实单价」排行。标「官方系数」的行用厂商公布的积分系数、按同一套假设摊成 tokens，置信度为中，不进入每周 tokens 图。<br>` +
  `计算假设：输入/输出=80/20、缓存命中率 95%、每周 5 个 5h 窗口、每月 4.33 周。官方周 tokens：Tokens/5h=周÷5，Tokens/月=周×4.33。请求数制若同时写了每 5 小时、每周、每月上限，三列各自用该窗口的次数，不按「周÷5、周×4.33」互相换算，因此 Tokens/5h×5 可以不等于 Tokens/周。⏫额度倍率 = 该时段额度价值 ÷ 该时段分摊月费（5h=月费/21.65，周=月费/4.33，月=月费）。<b>「依据」列</b>标注出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间/牌价折算 · <span class="conf conf-lo">低</span>毛利/第三方/请求折算）。`;

function metricsTierOk(m) {
  return metricsState.tier === "all" || isFlagshipModelName(m.model);
}
let metricsVisibleLimit = responsivePageSize();
let metricsViewFingerprint = "";
function metricsTableRows() {
  let rows = METRICS_ALL.map((original) => {
    const m = metricsState.fromPicker ? pickerMetricInput(original) : original;
    return { m:m || original, c:m ? computeMetrics(m) : null, payg:false };
  }).filter((r) => r.c);
  rows = rows.filter((r) => metricsTierOk(r.m) && (metricsState.offer === "all" || metricOfferOk(r.m)));
  if (metricsState.model !== "all") rows = rows.filter((r) => r.m.model === metricsState.model);
  if (metricsState.ver !== "all") rows = rows.filter((r) => r.m.ver === metricsState.ver);
  const payg = metricsState.ver === "all" && !metricsState.fromPicker
    ? paygReferenceRows().filter((r) => metricsTierOk(r.m) && (metricsState.offer === "all" || isPriceConfirmed(r.m, "payg")) && (metricsState.model === "all" || r.m.model === metricsState.model))
    : [];
  const shownRows = [...payg, ...rows];
  const sv = METRICS_SORT_GET[metricsState.sortKey];
  shownRows.sort((a, b) => {
    const va = sv ? sv(a) : 0, vb = sv ? sv(b) : 0;
    const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 无对应额度（按量无月费、credits 制等）恒排末尾 */
    return (va - vb) * metricsState.sortDir;
  });
  return { rows, payg, shownRows };
}
function renderMetricsTable() {
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
  const all = byId("metricsAllBtn");
  if (all) {
    all.hidden = shownRows.length - visibleRows.length <= pageSize;
    all.textContent = `显示全部 ${shownRows.length} 行`;
    all.setAttribute("aria-controls", "metricsBody");
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
    : `<tr><td colspan="${METRICS_COLUMNS.length}" class="table-empty"><b>当前模型与版本没有可展示的额度</b><p>可以${metricsState.fromPicker ? "调整「帮我选」条件、" : ""}调整模型、版本或购买范围；查看轻量模型时把模型档改为「含轻量模型」。</p><button type="button" class="chip" id="metricsEmptyResetBtn" data-reset-metrics>清除筛选</button></td></tr>`;

  qsa("#metricsTable th.sortable").forEach((th) => {
    const col = METRICS_COLUMNS.find((c) => c.sortKey === th.dataset.sort);
    if (col) syncSortHeader(th, col.label, metricsState.sortKey, metricsState.sortDir, col.asc ? 1 : -1);
  });
  const reset = byId("metricsResetBtn");
  if (reset) reset.disabled = !metricsState.fromPicker && metricsState.model === "all" && metricsState.ver === "all" && metricsState.tier === "flagship" && metricsState.offer === "current" && metricsState.sortKey === "cpm" && metricsState.sortDir === 1;
  if (typeof syncPickerScopeControls === "function") syncPickerScopeControls();
  const sortColumn = METRICS_COLUMNS.find((c) => c.sortKey === metricsState.sortKey);
  const sortDescription = sortColumn ? `${esc(sortColumn.label)}${metricsState.sortDir === 1 ? "从低到高" : "从高到低"}` : "当前列";
  renderMetricsSortHint();

  byId("metricsNote").innerHTML =
    `<b>当前范围：</b>${metricsState.tier === "all" ? "含轻量模型" : "只看旗舰模型"}；${metricsState.offer === "all" ? "含历史与仅老用户续费档，购买前请核对来源" : "仅新用户当前可购买的套餐，与排行使用相同购买筛选"}。API 按量是参照行，不进入套餐排行。` +
    `当前 ${shownRows.length} 行（含 <b>${payg.length}</b> 行官方按量、<b>${rows.filter((r) => r.m.isEst).length}</b> 行「≈估」），按${sortDescription}排序。` +
    /* 各列口径与置信度说明较长，默认收起，避免表格下方出现整屏文字。 */
    `<details class="metrics-legend"><summary>各列口径、计算假设与置信度说明</summary>${METRICS_NOTE_LEGEND}</details>`;
}

function showMoreMetricsRows(all = false) {
  const total = metricsTableRows().shownRows.length;
  const previousCount = Math.min(metricsVisibleLimit, total);
  metricsVisibleLimit = all ? Math.max(total, metricsVisibleLimit) : metricsVisibleLimit + responsivePageSize();
  renderMetricsTable();
  const firstNew = [...qsa("#metricsBody tr")][previousCount];
  if (firstNew) {
    firstNew.setAttribute("tabindex", "-1");
    focusTableControl(firstNew);
  } else focusTableControl(byId("metricsMoreBtn"));
}

function renderMetricsSortHint() {
  const el = byId("metricsSortHint");
  const col = METRICS_COLUMNS.find((c) => c.sortKey === metricsState.sortKey);
  if (!el || !col) return;
  const hidden = byId("metricsTable").classList.contains("is-compact") && (col.cls || "").split(" ").includes("col-more");
  el.textContent = `排序：${col.label}${metricsState.sortDir === 1 ? "从低到高" : "从高到低"}${hidden ? "（明细列，展开查看）" : ""}`;
}

/* 模型筛选下拉：从全部数据源动态填充 */
function populateModelFilter() {
  const sel = byId("metricsModel");
  const models = [...new Set([...METRICS_ALL.map((m) => m.model), ...paygReferenceRows().map((r) => r.m.model)])].sort((a, b) => displayModelName(a).localeCompare(displayModelName(b), "zh"));
  sel.innerHTML = '<option value="all">全部模型</option>' + models.map((x) => `<option value="${esc(x)}">${esc(displayModelName(x))}</option>`).join("");
  /* URL 恢复的模型选择在选项就绪后回设；选项里没有则重置，避免静默空表 */
  if (metricsState.model !== "all") {
    if ([...sel.options].some((o) => o.value === metricsState.model)) sel.value = metricsState.model;
    else metricsState.model = "all";
  }
}
