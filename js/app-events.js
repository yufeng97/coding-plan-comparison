/* ============ Coding Plan 比价中心 — 用户操作 ============ */
"use strict";
let personalSearchTimer = null, tableSearchTimer = null;
function cancelPersonalSearch() { clearTimeout(personalSearchTimer); personalSearchTimer = null; }
function cancelTableSearch() { clearTimeout(tableSearchTimer); tableSearchTimer = null; }
/* 用户操作持久化一次；图表重绘不写 URL。 */
function onState(target, type, handler) {
  target.addEventListener(type, (event) => updateAppState(() => handler(event)));
}

/* 排序表头共用绑定：点击/键盘翻转同列方向，换列时按 firstDir 起排（数据表从低到高，额度表按列定义） */
function bindSortableHeader(th, state, render, firstDir = 1) {
  th.tabIndex = 0;
  const sort = () => {
    if (state.sortKey === th.dataset.sort) state.sortDir *= -1;
    else { state.sortKey = th.dataset.sort; state.sortDir = firstDir; }
    render();
  };
  onState(th, "click", sort);
  onState(th, "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  ["tableCount", "metricsCount", "cmpBarText"].forEach((id) => {
    const el = byId(id);
    if (el) { el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-atomic", "true"); }
  });
  /* 静态表头补 scope；额度表 thead 由 renderMetricsHead 生成时直接带 scope="col" */
  qsa("#planTable thead th").forEach((th) => (th.scope = "col"));
  qsa("[data-free-region]").forEach((chip) => chip.addEventListener("click", () => { freeState.region = chip.dataset.freeRegion; renderFree(); }));
  qsa("[data-free-kind]").forEach((chip) => chip.addEventListener("click", () => { freeState.kind = chip.dataset.freeKind; renderFree(); }));
  qsa("#chipCat .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipCat .chip"), (x) => x === c);
      personalState.cat = c.dataset.cat;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipRegion .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipRegion .chip"), (x) => x === c);
      personalState.region = c.dataset.region;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipBilling .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipBilling .chip"), (x) => x === c);
      personalState.billing = c.dataset.billing;
      personalState.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  onState(byId("chartSearch"), "input", (e) => {
    personalState.q = boundedSearch(e.target.value);
    e.target.value = personalState.q;
    personalState.limit = PERSONAL_DEFAULT_LIMIT; /* 搜索后清空关键词仍回到默认档数，避免停留在「显示全部」状态 */
    cancelPersonalSearch();
    personalSearchTimer = setTimeout(() => { personalSearchTimer = null; renderPersonalChart(); }, 150);
  });
  document.addEventListener("click", (e) => {
    const target = evtTarget(e);
    if (!target) return;
    const hit = (sel) => !!(target.closest && target.closest(sel));
    /* 委托统一走 closest：按钮内嵌套元素（图标/换行 span）也不会让点击落空 */
    if (hit("#showAllPersonal")) {
      const button = target.closest("#showAllPersonal");
      const restoreFocus = document.activeElement === button;
      updateAppState(() => {
        personalState.limit = personalState.limit == null ? PERSONAL_DEFAULT_LIMIT : null;
        renderPersonalChart();
        if (restoreFocus) focusTableControl(byId("showAllPersonal"));
      });
      return;
    }
    if (hit("#personalResetBtn")) { updateAppState(() => { cancelPersonalSearch(); resetPersonalFilters(); focusTableControl(byId("chartSearch")); }); return; }
    if (hit("[data-reset-table]")) { updateAppState(() => { cancelTableSearch(); resetTableFilters(); }); return; }
    if (hit("[data-reset-metrics]")) { updateAppState(resetMetricsFilters); return; }
    if (hit("[data-table-extra]")) { updateAppState(() => { tableState.extra = true; renderTable(); focusTableControl(byId("tableExtraToggle")); }); return; }
    const addBtn = target.closest ? target.closest(".cmp-add") : null;
    if (addBtn) {
      const on = addBtn.classList.contains("on");
      updateAppState(() => {
        if (on) cmpRemove(addBtn.dataset.planId);
        else cmpAdd(addBtn.dataset.planId);
      });
      return;
    }
    const removeBtn = target.closest ? target.closest(".cmp-remove") : null;
    if (removeBtn) { updateAppState(() => cmpRemove(removeBtn.dataset.planId)); return; }
    if (hit("#showExcludedInTable")) {
      updateAppState(() => {
        const q = personalState.q;
        tableState.search = q;
        tableState.cat = "all";
        tableState.region = "all";
        tableState.vendor = "all";
        tableState.fromPicker = false;
        /* 图上排除的档位里有中转站和待核价格，跳转后一并显示，链接承诺的档位都能看到。 */
        tableState.extra = true;
        const input = byId("searchInput");
        if (input) input.value = q;
        const cat = byId("selectCat");
        const region = byId("selectRegion");
        if (cat) cat.value = "all";
        if (region) region.value = "all";
        const vendor = byId("selectVendor");
        if (vendor) vendor.value = "all";
        renderTable();
        navigateToSection("#table");
      });
      return;
    }
    const rel = target.closest ? target.closest("[data-set-picker]") : null;
    if (rel) {
      const eq = rel.dataset.setPicker.indexOf("=");
      if (eq > 0) updateAppState(() => setPicker(rel.dataset.setPicker.slice(0, eq), rel.dataset.setPicker.slice(eq + 1)));
    }
  });
  onState(byId("searchInput"), "input", (e) => {
    tableState.search = boundedSearch(e.target.value);
    e.target.value = tableState.search;
    cancelTableSearch();
    tableSearchTimer = setTimeout(() => { tableSearchTimer = null; renderTable(); }, 150); /* 与图表搜索同一防抖节奏 */
  });
  onState(byId("selectCat"), "change", (e) => { tableState.cat = e.target.value; renderTable(); });
  onState(byId("selectRegion"), "change", (e) => { tableState.region = e.target.value; renderTable(); });
  const vendorSelect = byId("selectVendor");
  if (vendorSelect) onState(vendorSelect, "change", (e) => { tableState.vendor = e.target.value; renderTable(); });
  const priceSort = byId("tablePriceSort");
  if (priceSort) onState(priceSort, "change", (e) => {
    const [key, dir] = e.target.value.split(":");
    if (!URL_VALID.tsortKeys.has(key) || (key === "selectedMonthly" && !tableState.fromPicker)) return;
    tableState.sortKey = key;
    tableState.sortDir = dir === "-1" ? -1 : 1;
    renderTable();
  });
  const resetBtn = byId("tableResetBtn");
  if (resetBtn) onState(resetBtn, "click", () => { cancelTableSearch(); resetTableFilters(); });
  const extraToggle = byId("tableExtraToggle");
  if (extraToggle) onState(extraToggle, "click", () => { tableState.extra = !tableState.extra; renderTable(); });
  /* 数据表导出与列开关 */
  const csvBtn = byId("exportCsvBtn");
  if (csvBtn) csvBtn.addEventListener("click", exportTableCsv);
  const mdBtn = byId("copyMdBtn");
  if (mdBtn) mdBtn.addEventListener("click", copyTableMarkdown);
  const colsBtn = byId("tableColsToggle");
  if (colsBtn) {
    const sync = () => {
      const showAll = byId("planTable").classList.contains("show-all-cols");
      colsBtn.textContent = showAll ? "收起详细列" : "展开详细列";
      colsBtn.title = showAll ? "隐藏模型、支持工具和备注列" : "显示模型、支持工具和备注列";
      colsBtn.classList.toggle("active", showAll);
      colsBtn.setAttribute("aria-expanded", String(showAll));
      colsBtn.setAttribute("aria-controls", "planTable");
    };
    sync();
    colsBtn.addEventListener("click", () => { byId("planTable").classList.toggle("show-all-cols"); sync(); });
  }
  /* 并排对比 */
  const cmpOpenBtn = byId("cmpOpenBtn");
  if (cmpOpenBtn) cmpOpenBtn.addEventListener("click", openCmpModal);
  const cmpClearBtn = byId("cmpClearBtn");
  if (cmpClearBtn) onState(cmpClearBtn, "click", cmpClear);
  const cmpClearInModal = byId("cmpClearInModal");
  if (cmpClearInModal) onState(cmpClearInModal, "click", cmpClear);
  const copyCmpBtn = byId("copyCmpMdBtn");
  if (copyCmpBtn) copyCmpBtn.addEventListener("click", copyCmpMarkdown);
  const exportCmpBtn = byId("exportCmpCsvBtn");
  if (exportCmpBtn) exportCmpBtn.addEventListener("click", exportCmpCsv);
  const cmpCloseBtn = byId("cmpCloseBtn");
  if (cmpCloseBtn) cmpCloseBtn.addEventListener("click", closeCmpModal);
  const cmpModal = byId("cmpModal");
  if (cmpModal) {
    cmpModal.addEventListener("close", finishCmpModalClose);
    cmpModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeCmpModal(); }
      else if (e.key === "Tab" && cmpModal.classList.contains("cmp-fallback") && isCmpModalOpen()) {
        const focusable = cmpFocusableElements();
        const first = focusable[0], last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!first) { e.preventDefault(); focusTableControl(cmpModal); }
        else if ((e.shiftKey && active === first) || (!e.shiftKey && active === last) || !focusable.includes(active)) {
          e.preventDefault(); focusTableControl(e.shiftKey ? last : first);
        }
      }
    });
    cmpModal.addEventListener("click", (e) => {
      if (e.target !== cmpModal) return;
      const r = cmpModal.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeCmpModal();
    });
    document.addEventListener("focusin", (e) => {
      if (cmpModal.classList.contains("cmp-fallback") && isCmpModalOpen() && !cmpModal.contains(evtTarget(e))) {
        focusTableControl(byId("cmpCloseBtn"));
      }
    });
  }
  const cmpBackdrop = byId("cmpBackdrop");
  if (cmpBackdrop) cmpBackdrop.addEventListener("click", closeCmpModal);
  /* 排序表头：键盘可达（Tab 聚焦后 Enter/Space 触发，与点击同一处理器） */
  qsa("#planTable thead th.sortable").forEach((th) => bindSortableHeader(th, tableState, renderTable, 1));
  qsa("#picker .picker-row").forEach((row) => {
    row.querySelectorAll(".chip").forEach((chip) => {
      onState(chip, "click", () => {
        setChipPressed(row.querySelectorAll(".chip"), (x) => x === chip);
        pickerState[row.dataset.pick] = chip.dataset.value;
        renderPicker();
      });
    });
  });
  qsa("#chipRank .chip").forEach((chip) => {
    onState(chip, "click", () => {
      rankState.tier = chip.dataset.rank;
      syncRankChips();
      renderRankChart();
    });
  });
  /* 排行图口径：官方每周 tokens / 含官方折算 / 含全部估算 */
  qsa("#chipRScope .chip").forEach((chip) => {
    onState(chip, "click", () => {
      rankState.scope = chip.dataset.rscope;
      syncRankChips();
      renderRankChart();
    });
  });
}


function bindMetricsEvents() {
  onState(byId("metricsModel"), "change", (e) => { metricsState.model = e.target.value; renderMetricsTable(); });
  onState(byId("metricsVer"), "change", (e) => { metricsState.ver = e.target.value; renderMetricsTable(); });
  onState(byId("metricsTier"), "change", (e) => { metricsState.tier = e.target.value; renderMetricsTable(); });
  onState(byId("metricsOffer"), "change", (e) => { metricsState.offer = e.target.value; renderMetricsTable(); });
  onState(byId("rankVendor"), "change", (e) => { rankState.vendor = e.target.value; renderRankChart(); });
  byId("tableMoreBtn").addEventListener("click", () => showMoreTableRows());
  byId("metricsMoreBtn").addEventListener("click", () => showMoreMetricsRows());
  const tableAll = byId("tableAllBtn"); if (tableAll) tableAll.addEventListener("click", () => showMoreTableRows(true));
  const metricsAll = byId("metricsAllBtn"); if (metricsAll) metricsAll.addEventListener("click", () => showMoreMetricsRows(true));
  let mobileTables = window.innerWidth < 768;
  window.addEventListener("resize", () => {
    const mobile = window.innerWidth < 768;
    if (mobile === mobileTables) return;
    mobileTables = mobile;
    renderTable(); renderMetricsTable();
  }, { passive:true });
  const resetBtn = byId("metricsResetBtn");
  if (resetBtn) onState(resetBtn, "click", resetMetricsFilters);
  qsa("#metricsTable th.sortable").forEach((th) => {
    const col = METRICS_COLUMNS.find((x) => x.sortKey === th.dataset.sort);
    bindSortableHeader(th, metricsState, renderMetricsTable, col && col.asc ? 1 : -1);
  });
  const metricsToggle = byId("metricsToggle");
  if (metricsToggle) {
    const sync = () => {
      const compact = byId("metricsTable").classList.contains("is-compact");
      metricsToggle.textContent = compact ? "展开 5 小时 / 每周明细" : "收起明细";
      metricsToggle.classList.toggle("active", !compact);
      metricsToggle.setAttribute("aria-expanded", String(!compact));
      metricsToggle.setAttribute("aria-controls", "metricsTable");
      renderMetricsSortHint();
    };
    sync();
    metricsToggle.addEventListener("click", () => { byId("metricsTable").classList.toggle("is-compact"); sync(); });
  }
}
