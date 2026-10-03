/* ============ Coding Plan 比价中心 — 用户操作 ============ */
"use strict";
let personalSearchTimer, tableSearchTimer;
/* 用户操作持久化一次；图表重绘不写 URL。 */
function onState(target, type, handler) {
  target.addEventListener(type, (event) => updateAppState(() => handler(event)));
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  ["tableCount", "metricsCount", "cmpBarText"].forEach((id) => {
    const el = byId(id);
    if (el) { el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.setAttribute("aria-atomic", "true"); }
  });
  qsa("#planTable thead th, #metricsTable thead th").forEach((th) => (th.scope = "col"));
  qsa("#chipCat .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipCat .chip"), (x) => x === c);
      state1.cat = c.dataset.cat;
      state1.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipRegion .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipRegion .chip"), (x) => x === c);
      state1.region = c.dataset.region;
      state1.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  qsa("#chipBilling .chip").forEach((c) =>
    onState(c, "click", () => {
      setChipPressed(qsa("#chipBilling .chip"), (x) => x === c);
      state1.billing = c.dataset.billing;
      state1.limit = PERSONAL_DEFAULT_LIMIT;
      renderPersonalChart();
    })
  );
  onState(byId("chartSearch"), "input", (e) => {
    state1.q = e.target.value;
    state1.limit = PERSONAL_DEFAULT_LIMIT; /* 搜索后清空关键词仍回到默认档数，避免停留在「显示全部」状态 */
    clearTimeout(personalSearchTimer);
    personalSearchTimer = setTimeout(renderPersonalChart, 150);
  });
  document.addEventListener("click", (e) => {
    const target = evtTarget(e);
    if (!target) return;
    if (target.id === "showAllPersonal") { updateAppState(() => { state1.limit = state1.limit == null ? PERSONAL_DEFAULT_LIMIT : null; renderPersonalChart(); }); return; }
    if (target.id === "personalResetBtn") { updateAppState(() => { clearTimeout(personalSearchTimer); resetPersonalFilters(); focusTableControl(byId("chartSearch")); }); return; }
    if (target.closest && target.closest("[data-reset-table]")) { updateAppState(() => { clearTimeout(tableSearchTimer); resetTableFilters(); }); return; }
    if (target.closest && target.closest("[data-reset-metrics]")) { updateAppState(resetMetricsFilters); return; }
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
    if (target && target.id === "showExcludedInTable") {
      updateAppState(() => {
        const q = state1.q;
        tableState.search = q;
        tableState.cat = "all";
        tableState.region = "all";
        const input = byId("searchInput");
        if (input) input.value = q;
        byId("selectCat").value = "all";
        byId("selectRegion").value = "all";
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
    tableState.search = e.target.value;
    clearTimeout(tableSearchTimer);
    tableSearchTimer = setTimeout(renderTable, 150); /* 与图表搜索同一防抖节奏 */
  });
  onState(byId("selectCat"), "change", (e) => { tableState.cat = e.target.value; renderTable(); });
  onState(byId("selectRegion"), "change", (e) => { tableState.region = e.target.value; renderTable(); });
  const resetBtn = byId("tableResetBtn");
  if (resetBtn) onState(resetBtn, "click", () => { clearTimeout(tableSearchTimer); resetTableFilters(); });
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
  qsa("#planTable thead th.sortable").forEach((th) => {
    th.tabIndex = 0;
    const sort = () => {
      if (tableState.sortKey === th.dataset.sort) tableState.sortDir *= -1;
      else { tableState.sortKey = th.dataset.sort; tableState.sortDir = 1; }
      renderTable();
    };
    onState(th, "click", sort);
    onState(th, "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
  });
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
  const resetBtn = byId("metricsResetBtn");
  if (resetBtn) onState(resetBtn, "click", resetMetricsFilters);
  qsa("#metricsTable th.sortable").forEach((th) => {
    th.tabIndex = 0;
    const sort = () => {
      if (metricsState.sortKey === th.dataset.sort) metricsState.sortDir *= -1;
      else {
        metricsState.sortKey = th.dataset.sort;
        const col = METRICS_COLUMNS.find((x) => x.sortKey === th.dataset.sort);
        metricsState.sortDir = col && col.asc ? 1 : -1;
      }
      renderMetricsTable();
    };
    onState(th, "click", sort);
    onState(th, "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
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
