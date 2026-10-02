/* ============ Coding Plan 比价中心 — 数据表 / 额度表 / 绑定 ============ */
"use strict";

/* ---------- 数据表 ---------- */
const tableState = { search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1 };

/* 筛选 + 排序集中在这里：渲染与 CSV/Markdown 导出共用同一份结果 */
function computeTableRows() {
  const q = tableState.search.trim().toLowerCase();
  const onSale = PLANS.filter(isOnSalePlan);
  const rows = onSale.filter((p) =>
    (tableState.cat === "all" || p.cat === tableState.cat) &&
    (tableState.region === "all" || p.region === tableState.region) &&
    (!q || queryHit(planSearchBlob(p), q))
  );
  const k = tableState.sortKey;
  const sortVal = (p) => (p[k] == null ? NaN : p.cur === "USD" ? p[k] * RATE : p[k]);
  return rows.slice().sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b);
    const aN = Number.isNaN(va), bN = Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 「定制」（无公开价）恒排末尾 */
    return (va - vb) * tableState.sortDir;
  });
}

function renderTable() {
  const rows = computeTableRows();
  const onSale = PLANS.filter(isOnSalePlan);
  const k = tableState.sortKey;
  document.getElementById("tableCount").textContent = `${rows.length} / ${onSale.length} 档`;
  document.querySelectorAll("#planTable thead th.sortable").forEach((th) => {
    th.classList.toggle("sort-active", th.dataset.sort === k);
    const arrow = th.dataset.sort === k ? (tableState.sortDir === 1 ? " ↑" : " ↓") : "";
    const span = th.querySelector("span");
    if (span) span.textContent = (th.dataset.sort === "priceM" ? "月付" : "年付折月") + arrow;
    th.setAttribute("aria-sort", th.dataset.sort === k ? (tableState.sortDir === 1 ? "ascending" : "descending") : "none");
  });
  document.getElementById("tableBody").innerHTML = rows
    .map((p) => {
      const pm = priceText(p, "priceM");
      const pmSub = p.priceM > 0 ? `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "M"))}</span>` : "";
      const py = p.priceY == null ? (p.priceM != null && p.priceM > 0 ? '<span class="sub">仅月付</span>' : "—") : priceText(p, "priceY") + `<br/><span class="sub">≈${fmtCNY(cnyOf(p, "Y"))}</span>`;
      const href = safeHref(p.url);
      const cmpOn = cmpState.items.some((x) => x.vendor === p.vendor && x.plan === p.plan);
      return `<tr>
        <td class="td-vendor">${esc(p.vendor)}</td>
        <td class="td-plan"><span class="plan-name">${esc(p.plan)}</span><div class="badge-row">${badgeHtml(p)}</div><button type="button" class="cmp-add${cmpOn ? " on" : ""}" data-vendor="${esc(p.vendor)}" data-plan="${esc(p.plan)}" aria-pressed="${cmpOn}">${cmpOn ? "✓ 对比中" : "＋对比"}</button></td>
        <td><span class="tag tag-${esc(p.cat)}">${esc(CAT_LABEL[p.cat] || p.cat)}</span></td>
        <td class="region-${esc(p.region)}">${esc(REGION_LABEL[p.region] || "")}</td>
        <td class="td-price">${pm}${pmSub}</td>
        <td class="td-price">${py}</td>
        <td class="td-quota">${esc(p.quota)}</td>
        <td class="td-models col-opt">${esc(p.models)}</td>
        <td class="col-opt">${esc(p.tools)}</td>
        <td class="td-note col-opt">${esc(p.note || "—")}</td>
        <td class="td-trust">${href ? `<a href="${href}" target="_blank" rel="noopener">官网</a>` : "—"}<span class="sub">在售 · 核对 ${esc(META.updated)}</span></td>
      </tr>`;
    })
    .join("");
  syncUrl();
}

/* ---------- 导出：当前筛选 + 排序结果 ---------- */
function tableExportName(ext) {
  const desc = [tableState.search.trim(), tableState.cat, tableState.region].filter((x) => x && x !== "all").join("-");
  const safe = (desc || "all").replace(/[\\/:*?"<>|]+/g, "");
  const d = new Date();
  const day = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  return `coding-plans-${safe}-${day}.${ext}`;
}
function exportTableCsv() {
  const rows = computeTableRows();
  const head = ["厂商", "计划", "类别", "地区", "月付", "年付折月", "额度（官方口径）", "模型", "支持工具", "备注", "来源"];
  const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [head.map(cell).join(",")].concat(rows.map((p) => [
    p.vendor, p.plan, CAT_LABEL[p.cat] || p.cat, REGION_LABEL[p.region] || "",
    priceText(p, "priceM"), p.priceY == null ? "" : priceText(p, "priceY"),
    p.quota, p.models, p.tools, p.note || "", p.url || "",
  ].map(cell).join(",")));
  /* \uFEFF 让 Excel 正确识别 UTF-8 */
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = tableExportName("csv");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  flashBtn("exportCsvBtn", `✓ 已导出 ${rows.length} 档`);
}
function tableRowsMarkdown(rows) {
  const escMd = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head = "| 厂商 | 计划 | 类别 | 地区 | 月付 | 年付折月 | 额度（官方口径） | 来源 |";
  const sep = "|---|---|---|---|---|---|---|---|";
  const body = rows.map((p) =>
    `| ${escMd(p.vendor)} | ${escMd(p.plan)} | ${escMd(CAT_LABEL[p.cat] || p.cat)} | ${escMd(REGION_LABEL[p.region] || "")} | ${escMd(priceText(p, "priceM"))} | ${escMd(p.priceY == null ? "—" : priceText(p, "priceY"))} | ${escMd(p.quota)} | ${p.url || ""} |`);
  return [head, sep].concat(body).join("\n");
}
async function copyTableMarkdown() {
  const rows = computeTableRows();
  const md = tableRowsMarkdown(rows);
  let ok = false;
  try { await navigator.clipboard.writeText(md); ok = true; }
  catch (e) {
    /* file:// 或旧浏览器降级：隐藏 textarea + execCommand */
    const ta = document.createElement("textarea");
    ta.value = md;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
  }
  flashBtn("copyMdBtn", ok ? `✓ 已复制 ${rows.length} 档` : "复制受限，请改用 ⬇ CSV");
}
function flashBtn(id, text) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => { btn.textContent = btn.dataset.orig; }, 1800);
}

/* ---------- 并排对比：数据表内勾选 2–4 档，URL（cmp=）可分享 ---------- */
const cmpState = { items: [] }; /* 元素为 PLANS 条目，顺序即加入顺序 */
const CMP_MAX = 4;

function cmpAdd(vendor, plan) {
  if (cmpState.items.some((x) => x.vendor === vendor && x.plan === plan)) return;
  const p = PLANS.find((x) => x.vendor === vendor && x.plan === plan);
  if (!p) return;
  if (cmpState.items.length >= CMP_MAX) { flashBtn("cmpOpenBtn", `最多对比 ${CMP_MAX} 档`); return; }
  cmpState.items.push(p);
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
}
function cmpRemove(vendor, plan) {
  cmpState.items = cmpState.items.filter((x) => !(x.vendor === vendor && x.plan === plan));
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
}
function cmpClear() {
  if (!cmpState.items.length) return;
  cmpState.items = [];
  renderCmpBar();
  syncTableCmpButtons();
  syncUrl();
  const dlg = document.getElementById("cmpModal");
  if (dlg && dlg.open) dlg.close();
}
function renderCmpBar() {
  const bar = document.getElementById("cmpBar");
  if (!bar) return;
  bar.hidden = cmpState.items.length === 0;
  document.getElementById("cmpBarText").textContent =
    `已选 ${cmpState.items.length}/${CMP_MAX} 档` +
    (cmpState.items.length ? "：" + cmpState.items.map((p) => shortVendor(p.vendor) + " " + p.plan).join("、") : "");
  document.getElementById("cmpOpenBtn").disabled = cmpState.items.length < 2;
}
function syncTableCmpButtons() {
  document.querySelectorAll("#tableBody .cmp-add").forEach((btn) => {
    const on = cmpState.items.some((x) => x.vendor === btn.dataset.vendor && x.plan === btn.dataset.plan);
    btn.textContent = on ? "✓ 对比中" : "＋对比";
    btn.classList.toggle("on", on);
  });
}
function renderCmpModal() {
  const items = cmpState.items;
  const row = (label, cells) => `<tr><th scope="row">${label}</th>${cells}</tr>`;
  const priceCell = (p) => {
    const pm = priceText(p, "priceM");
    const sub = p.priceM > 0 ? `<span class="sub">≈${fmtCNY(cnyOf(p, "M"))}/月</span>` : "";
    const py = p.priceY != null ? `<span class="sub"> · 年付 ${priceText(p, "priceY")}/月</span>` : "";
    return `${pm}<br>${sub}${py}`;
  };
  const rows = [
    row("厂商 · 计划", items.map((p) => `<td><b>${esc(p.vendor)}</b><br>${esc(p.plan)}</td>`).join("")),
    row("定位", items.map((p) => `<td><span class="tag tag-${esc(p.cat)}">${esc(CAT_LABEL[p.cat] || p.cat)}</span> ${esc(REGION_LABEL[p.region] || "")}${badgeHtml(p) ? `<div class="badge-row">${badgeHtml(p)}</div>` : ""}</td>`).join("")),
    row("价格", items.map((p) => `<td>${priceCell(p)}</td>`).join("")),
    row("额度（官方口径）", items.map((p) => `<td>${esc(p.quota)}</td>`).join("")),
    row("模型", items.map((p) => `<td>${esc(p.models)}</td>`).join("")),
    row("支持工具", items.map((p) => `<td>${esc(p.tools)}</td>`).join("")),
    row("备注", items.map((p) => `<td>${esc(p.note || "—")}</td>`).join("")),
    row("来源", items.map((p) => { const href = safeHref(p.url); return `<td>${href ? `<a href="${href}" target="_blank" rel="noopener">官网 ↗</a>` : "—"}</td>`; }).join("")),
  ];
  document.getElementById("cmpTable").innerHTML = rows.join("");
}
function openCmpModal() {
  if (cmpState.items.length < 2) return;
  renderCmpModal();
  const dlg = document.getElementById("cmpModal");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", ""); /* 老浏览器无 dialog：退化为置顶块 */
}

/* ---------- 动态 / 来源 / 说明 ---------- */
function dynItem(d) {
  const href = safeHref(d.url);
  const link = href ? ` <a class="dyn-src" href="${href}" target="_blank" rel="noopener" title="打开来源：${esc(d.url)}">${esc(d.source || "来源")} ↗</a>` : "";
  const when = d.checked ? "核实 " + d.date : d.date;
  const tip = d.checked ? "本站这一天核对到该状态，不是厂商公告日" : "来源写明的发生日期";
  return `<li><span class="dyn-date${d.checked ? " is-checked" : ""}" title="${tip}">${esc(when)}</span><div class="dyn-body">${esc(d.text)}${link}</div></li>`;
}
function renderMisc() {
  const sorted = DYNAMICS.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  document.getElementById("dynamicsList").innerHTML = sorted.filter((d) => !d.checked).map(dynItem).join("");
  const checkList = document.getElementById("checkList");
  if (checkList) checkList.innerHTML = sorted.filter((d) => d.checked).map(dynItem).join("");
  document.getElementById("sourceList").innerHTML =
    `<h3>📖 全部来源（官方定价页 / 权威报道）</h3>` +
    SOURCES.map(
      (g) => `<div class="source-group"><b>${esc(g.group)}</b><ul>${g.urls.map((u) => {
        const href = safeHref(u);
        return href ? `<li><a href="${href}" target="_blank" rel="noopener">${esc(u)}</a></li>` : "";
      }).join("")}</ul></div>`
    ).join("");
  document.getElementById("uncertainList").innerHTML = UNCERTAIN.map((u) => `<li>${esc(u)}</li>`).join("");
  const uncertainSummary = document.querySelector("#uncertainWrap summary");
  if (uncertainSummary) uncertainSummary.textContent = `展开全部不确定性说明（共 ${UNCERTAIN.length} 条，点击查看）`;
  document.getElementById("rateText").textContent = RATE;
  document.getElementById("rateText2").textContent = RATE;
  document.getElementById("footDate").textContent = META.updated;
  const heroDate = document.getElementById("heroDate");
  if (heroDate) heroDate.textContent = META.updated;
}

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  document.querySelectorAll("#planTable thead th, #metricsTable thead th").forEach((th) => (th.scope = "col"));
  document.querySelectorAll("#chipCat .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipCat .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.cat = c.dataset.cat;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  document.querySelectorAll("#chipRegion .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipRegion .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.region = c.dataset.region;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  document.querySelectorAll("#chipBilling .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#chipBilling .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      state1.billing = c.dataset.billing;
      state1.limit = 40;
      renderPersonalChart();
    })
  );
  let searchTimer;
  document.getElementById("chartSearch").addEventListener("input", (e) => {
    state1.q = e.target.value;
    state1.limit = 40; /* 搜索后清空关键词仍回到默认前 40 档，避免停留在「显示全部」状态 */
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderPersonalChart, 150);
  });
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "showAllPersonal") { state1.limit = null; renderPersonalChart(); }
    const addBtn = e.target.closest ? e.target.closest(".cmp-add") : null;
    if (addBtn) {
      const on = addBtn.classList.contains("on");
      if (on) cmpRemove(addBtn.dataset.vendor, addBtn.dataset.plan);
      else cmpAdd(addBtn.dataset.vendor, addBtn.dataset.plan);
      return;
    }
    if (e.target && e.target.id === "showExcludedInTable") {
      const q = state1.q;
      tableState.search = q;
      const input = document.getElementById("searchInput");
      if (input) input.value = q;
      renderTable();
      location.hash = "table";
      document.getElementById("table")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const rel = e.target.closest ? e.target.closest("[data-set-picker]") : null;
    if (rel) {
      const eq = rel.dataset.setPicker.indexOf("=");
      if (eq > 0) setPicker(rel.dataset.setPicker.slice(0, eq), rel.dataset.setPicker.slice(eq + 1));
    }
  });
  let tableSearchTimer;
  document.getElementById("searchInput").addEventListener("input", (e) => {
    tableState.search = e.target.value;
    clearTimeout(tableSearchTimer);
    tableSearchTimer = setTimeout(renderTable, 150); /* 与图表搜索同一防抖节奏 */
  });
  document.getElementById("selectCat").addEventListener("change", (e) => { tableState.cat = e.target.value; renderTable(); });
  document.getElementById("selectRegion").addEventListener("change", (e) => { tableState.region = e.target.value; renderTable(); });
  /* 数据表导出与列开关 */
  const csvBtn = document.getElementById("exportCsvBtn");
  if (csvBtn) csvBtn.addEventListener("click", exportTableCsv);
  const mdBtn = document.getElementById("copyMdBtn");
  if (mdBtn) mdBtn.addEventListener("click", copyTableMarkdown);
  const colsBtn = document.getElementById("tableColsToggle");
  if (colsBtn) colsBtn.addEventListener("click", () => {
    const showAll = document.getElementById("planTable").classList.toggle("show-all-cols");
    colsBtn.textContent = showAll ? "精简列" : "全部列";
    colsBtn.classList.toggle("active", showAll);
  });
  /* 并排对比 */
  const cmpOpenBtn = document.getElementById("cmpOpenBtn");
  if (cmpOpenBtn) cmpOpenBtn.addEventListener("click", openCmpModal);
  const cmpClearBtn = document.getElementById("cmpClearBtn");
  if (cmpClearBtn) cmpClearBtn.addEventListener("click", cmpClear);
  const cmpClearInModal = document.getElementById("cmpClearInModal");
  if (cmpClearInModal) cmpClearInModal.addEventListener("click", cmpClear);
  const cmpCloseBtn = document.getElementById("cmpCloseBtn");
  if (cmpCloseBtn) cmpCloseBtn.addEventListener("click", () => document.getElementById("cmpModal").close());
  const cmpModal = document.getElementById("cmpModal");
  if (cmpModal) cmpModal.addEventListener("click", (e) => { if (e.target === cmpModal) cmpModal.close(); }); /* 点击遮罩关闭 */
  /* 排序表头：键盘可达（Tab 聚焦后 Enter/Space 触发，与点击同一处理器） */
  document.querySelectorAll("#planTable thead th.sortable").forEach((th) => {
    th.tabIndex = 0;
    const sort = () => {
      if (tableState.sortKey === th.dataset.sort) tableState.sortDir *= -1;
      else { tableState.sortKey = th.dataset.sort; tableState.sortDir = 1; }
      renderTable();
    };
    th.addEventListener("click", sort);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
  });
  document.querySelectorAll("#picker .picker-row").forEach((row) => {
    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        row.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
        chip.classList.add("active");
        pickerState[row.dataset.pick] = chip.dataset.value;
        renderPicker();
      });
    });
  });
  document.querySelectorAll("#chipRank .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#chipRank .chip").forEach((x) => x.classList.remove("active"));
      chip.classList.add("active");
      rankState.tier = chip.dataset.rank;
      renderRankChart();
    });
  });
}

/* ---------- 额度深度对比表 ---------- */
const metricsState = { model: "all", ver: "all", sortKey: "cpm", sortDir: 1 };
/* 额度换算的常量与纯函数（WEEKS_PER_MONTH、blendPrice、computeMetrics 等）在 js/metrics.js */

/* 表的 16 列在这里集中定义：表头（含排序键与紧凑模式折叠类）、排序取值、单元格渲染同源。
   加列只改这个数组；.col-more 控制该列在紧凑模式下是否隐藏。 */
const METRICS_COLUMNS = [
  { id: "plan", label: "厂商·计划", cls: "sticky-col",
    cell: ({ m }) => `${m.isEst ? '<span class="est-badge" title="社区/推算估算值，非官方数字">≈估</span> ' : ""}${esc(m.vendor)}<br><span style="color:var(--text-dim);font-size:11px">${esc(m.plan)}</span>` },
  { id: "ver", label: "版本", cls: "col-more",
    cell: ({ m }) => `<span class="ver-tag ${m.ver === "V3" ? "ver-v3" : m.ver === "V2" ? "ver-v2" : "ver-na"}">${esc(m.ver)}</span>` },
  { id: "model", label: "模型", cls: "model-cell",
    cell: ({ m }) => `${esc(displayModelName(m.model))}${(m.note || "").startsWith("对照") ? '<br><span style="color:var(--text-faint);font-size:10px">套餐列表未列 · 牌价对照</span>' : ""}${listPriceHint(m)}` },
  { id: "price", label: "月费", sortKey: "price", asc: true, cls: "td-price",
    cell: ({ c, isPayg }) => (isPayg ? "按量" : fmtCNY(c.priceCNY)) },
  { id: "tps", label: "TPS", cls: "col-more tps-cell",
    cell: ({ m }) => esc(m.tps || "—") },
  { id: "cpm", label: "💵每M tokens", sortKey: "cpm", asc: true,
    cell: ({ c, isPayg }) => {
      const title = isPayg
        ? "官方牌价按 80% 输入 / 20% 输出、95% 缓存命中折成每百万人民币。有峰谷的取低峰。不是套餐月费除以额度。"
        : "每百万 tokens 实际成本（统一折算人民币）";
      return `<span style="font-weight:800;color:${cpmColor(c.costPerM)}" title="${esc(title)}">${fmtCpm(c.costPerM)}</span>`;
    } },
  { id: "t5h", label: "Tokens/5h", sortKey: "t5h", cls: "col-more tok-cell",
    cell: ({ c, isPayg }) => (isPayg ? "—" : fTokCell(c.fLow, c.fHigh)) },
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
    cell: ({ c, isPayg }) => (isPayg ? '<span style="color:var(--text-faint)">无套餐额度</span>' : fTokCell(c.moLow, c.moHigh)) },
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
  const tr = document.querySelector("#metricsTable thead tr");
  if (!tr) return;
  tr.innerHTML = METRICS_COLUMNS.map((c) =>
    c.sortKey
      ? `<th class="${c.cls || ""} sortable" data-sort="${c.sortKey}"><span>${c.label}</span></th>`
      : `<th class="${c.cls || ""}">${c.label}</th>`
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

/* 无额度（credits 制无牌价）的时段显示占位 */
function fTokCell(lo, hi) {
  return lo == null
    ? '<span style="color:var(--text-faint)">credits制</span>'
    : `${fmtTok(lo)}${hi > lo ? "–" + fmtTok(hi) : ""}`;
}
function fmtRate(v) { return v == null ? "—" : `${v.toFixed(1)}×`; }

function fmtVal(v, cur) {
  if (cur === "CNY") return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
  return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}
function rateClass(r) { return r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }
function fmtCpm(v) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }
function fmtUnit(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10);
  if (n >= 1) return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 10000) / 10000);
}
function listPriceHint(m) {
  if (typeof m.apiIn !== "number") return "";
  const sym = m.cur === "USD" ? "$" : "¥";
  return `<br><span style="color:var(--text-faint);font-size:10.5px" title="模型牌价：输入 / 输出 / 缓存命中，每百万 tokens">${sym}${fmtUnit(m.apiIn)} / ${sym}${fmtUnit(m.apiOut)} / 缓存 ${sym}${fmtUnit(m.apiCache)}</span>`;
}
function cpmColor(v) { return v == null ? "var(--text-faint)" : v <= 0.3 ? "var(--green)" : v <= 1 ? "var(--gold)" : "var(--red)"; }

/* 数据来源标注：每行额度的出处与置信度 */
function provenance(m) {
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

function isRankMetric(m) {
  return !m.isEst && m.wkLowM != null && metricOfferOk(m) && provenance(m).conf === "高";
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

function renderMetricsTable() {
  let rows = METRICS_ALL.map((m) => ({ m, c: computeMetrics(m) })).filter((r) => r.c);
  if (metricsState.model !== "all") rows = rows.filter((r) => r.m.model === metricsState.model);
  if (metricsState.ver !== "all") rows = rows.filter((r) => r.m.ver === metricsState.ver);
  const payg = metricsState.ver === "all"
    ? paygReferenceRows().filter((r) => metricsState.model === "all" || r.m.model === metricsState.model)
    : [];

  const shownRows = payg.concat(rows);
  const sv = METRICS_SORT_GET[metricsState.sortKey];
  shownRows.sort((a, b) => {
    const va = sv ? sv(a) : 0, vb = sv ? sv(b) : 0;
    const aN = va == null || Number.isNaN(va), bN = vb == null || Number.isNaN(vb);
    if (aN || bN) { if (aN && bN) return 0; return aN ? 1 : -1; } /* 无对应额度（按量无月费、credits 制等）恒排末尾 */
    return (va - vb) * metricsState.sortDir;
  });
  document.getElementById("metricsCount").textContent = `${shownRows.length} 行`;
  document.getElementById("metricsBody").innerHTML = shownRows.map((r) => {
    const m = r.m, c = r.c, isPayg = !!r.payg;
    const prov = isPayg ? { text: "官方按量", conf: "高" } : provenance(m);
    const ctx = { m, c, isPayg, cur: m.cur, prov };
    const tds = METRICS_COLUMNS.map((col) => {
      const cls = (col.cls || "") + (col.tdClass ? col.tdClass(ctx) : "");
      const title = col.title ? ` title="${esc(col.title(ctx))}"` : "";
      return `<td class="${cls}"${title}>${col.cell(ctx)}</td>`;
    }).join("");
    return `<tr class="${m.isEst ? "est-row" : ""}${isPayg ? " payg-row" : ""}">${tds}</tr>`;
  }).join("");

  document.querySelectorAll("#metricsTable th.sortable").forEach((th) => {
    const isActive = th.dataset.sort === metricsState.sortKey;
    th.classList.toggle("sort-active", isActive);
    const arrow = isActive ? (metricsState.sortDir === 1 ? " ↑" : " ↓") : "";
    const span = th.querySelector("span");
    if (span) span.textContent = span.textContent.replace(/[ ↑↓]+$/, "") + arrow;
    th.setAttribute("aria-sort", isActive ? (metricsState.sortDir === 1 ? "ascending" : "descending") : "none");
  });

  document.getElementById("metricsNote").innerHTML =
    `<b>💵每M tokens</b> = 月费÷月 tokens 中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色&gt;¥1）。标「官方 API 按量」的行没有月费，这一列用同一套 80/20、95% 缓存假设把低峰牌价折成人民币，所以能和套餐排在一起；模型名下方仍是原始输入 / 输出 / 缓存命中。套餐行模型名下方的牌价也不是套餐的每 M 成本。同一请求额度下，牌价更高的模型「额度价值 / 倍率」更高，每 M 成本不变。带牌价的 credits 按这套单价把面值折成 tokens；没有逐模型牌价的美元 credits 仍按假设均价 ¥10/M，且不进入「真实单价」排行。标「官方系数」的行用厂商公布的积分系数、按同一套假设摊成 tokens，置信度为中，不进入每周 tokens 图。<br>` +
    `计算假设：输入/输出=80/20、缓存命中率 95%、每周 5 个 5h 窗口、每月 4.33 周。官方周 tokens：Tokens/5h=周÷5，Tokens/月=周×4.33。⏫额度倍率 = 该时段额度价值 ÷ 该时段分摊月费（5h=月费/21.65，周=月费/4.33，月=月费）。<b>「依据」列</b>标注出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间/牌价折算 · <span class="conf conf-lo">低</span>毛利/第三方/请求折算）。当前 ${shownRows.length} 行（含 <b>${payg.length}</b> 行官方按量、<b>${rows.filter((r) => r.m.isEst).length}</b> 行「≈估」），默认按每百万成本从低到高。`;
  syncUrl();
}

/* 模型筛选下拉：从全部数据源动态填充 */
function populateModelFilter() {
  const sel = document.getElementById("metricsModel");
  const models = [...new Set([...METRICS_ALL.map((m) => m.model), ...paygReferenceRows().map((r) => r.m.model)])].sort((a, b) => displayModelName(a).localeCompare(displayModelName(b), "zh"));
  sel.innerHTML = '<option value="all">全部模型</option>' + models.map((x) => `<option value="${esc(x)}">${esc(displayModelName(x))}</option>`).join("");
  /* URL 恢复的模型选择在选项就绪后回设；选项里没有则重置，避免静默空表 */
  if (metricsState.model !== "all") {
    if ([...sel.options].some((o) => o.value === metricsState.model)) sel.value = metricsState.model;
    else metricsState.model = "all";
  }
}

function bindMetricsEvents() {
  document.getElementById("metricsModel").addEventListener("change", (e) => { metricsState.model = e.target.value; renderMetricsTable(); });
  document.getElementById("metricsVer").addEventListener("change", (e) => { metricsState.ver = e.target.value; renderMetricsTable(); });
  document.querySelectorAll("#metricsTable th.sortable").forEach((th) => {
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
    th.addEventListener("click", sort);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
  });
  const metricsToggle = document.getElementById("metricsToggle");
  if (metricsToggle) {
    metricsToggle.addEventListener("click", () => {
      const table = document.getElementById("metricsTable");
      const compact = table.classList.toggle("is-compact");
      metricsToggle.textContent = compact ? "展开 5 小时 / 每周明细" : "收起明细";
      metricsToggle.classList.toggle("active", !compact);
    });
  }
}

