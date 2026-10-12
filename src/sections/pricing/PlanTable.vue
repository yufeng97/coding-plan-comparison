<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { isOnSalePlan, PLANS } from "@generated/catalog";
import { CAT_LABEL, REGION_LABEL, tableVendors } from "@domain/core";
import { boundedSearch, cmpState, pickerState, tableState } from "@state/app";
import { focusTableControl } from "@browser/interaction";
import { updateAppState, URL_VALID } from "@browser/url-state";
import { applyPickerScope, pickerScopeText } from "@app/picker";
import { computeTableRows, copyTableMarkdown, exportTableCsv, PLAN_TABLE_COLUMNS, registerTableView, tableExtraHidden, tableFilteredPlans } from "@app/tables";
import { targetValue } from "@browser/dom";
import CompareButton from "../../components/CompareButton.vue";
import PlanBadges from "../../components/PlanBadges.vue";
import PlanPrice from "../../components/PlanPrice.vue";
import PriceCheck from "../../components/PriceCheck.vue";
import SortHeader from "../../components/SortHeader.vue";
import WatchButton from "../../components/WatchButton.vue";

const state = tableState;
const searchInput = ref<HTMLInputElement | null>(null);
const searchText = ref(state.search);
const displayedSearch = ref(state.search);
const pageSize = ref(typeof window === "undefined" || window.innerWidth >= 768 ? 20 : 5);
const visibleLimit = ref(pageSize.value);
const showColumns = ref(false);
const feedback = ref("");
const revision = ref(0);
const labels = ref<Record<string, string>>({});
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const columns = PLAN_TABLE_COLUMNS;
const categoryLabels: Record<string, string> = CAT_LABEL;
const regionLabels: Record<string, string> = REGION_LABEL;
const displayState = computed(() => ({ ...state, search: displayedSearch.value }));
const rows = computed(() => { revision.value; return computeTableRows(displayState.value) as Plan[]; });
const visibleRows = computed(() => rows.value.slice(0, visibleLimit.value));
const hiddenExtra = computed(() => state.extra ? 0 : tableFilteredPlans(displayState.value).filter(tableExtraHidden).length);
const countText = computed(() => `已显示 ${visibleRows.value.length} / ${rows.value.length} 条匹配记录 · 共 ${PLANS.filter(isOnSalePlan).length} 档${hiddenExtra.value ? ` · 另有 ${hiddenExtra.value} 档中转站或待核价格未显示` : ""}`);
const isDefault = computed(() => !state.fromPicker && !state.extra && !state.search && state.cat === "all" && state.region === "all" && state.vendor === "all" && state.sortKey === "priceM" && state.sortDir === 1);
const freeScope = computed(() => state.fromPicker && pickerState.budget === "0");
const filterText = computed(() => [state.search.trim() ? `关键词「${state.search.trim()}」` : "", state.cat === "all" ? "" : categoryLabels[state.cat], state.region === "all" ? "" : regionLabels[state.region], state.vendor === "all" ? "" : state.vendor, state.fromPicker ? "选购条件" : ""].filter(Boolean).join(" · ") || "当前筛选");
const vendors = tableVendors();
const scopeText = computed(() => state.fromPicker
  ? `已应用选购条件：${pickerScopeText()}。保留目录月付/年付价，并另标选购口径；可按所选支付月均排序。继续叠加本区筛选。`
  : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。");
const priceSort = computed(() => `${state.sortKey}:${state.sortDir}`);

/* 在组件更新前捕获焦点；此时更新任务已入队，nextTick 才能等到行节点真正更新。 */
watch(() => JSON.stringify([displayState.value, pageSize.value, state.fromPicker ? pickerState : null]), () => {
  const active = document.activeElement as HTMLElement | null;
  const focusedId = active?.closest("#tableBody") && active.classList.contains("cmp-add") ? active.dataset.planId : "";
  visibleLimit.value = pageSize.value;
  if (focusedId) {
    const index = rows.value.findIndex((plan) => plan.id === focusedId);
    if (index >= visibleLimit.value) visibleLimit.value = Math.ceil((index + 1) / pageSize.value) * pageSize.value;
    void nextTick(() => {
      const current = document.activeElement;
      if (current === active || current && current !== document.body && current.isConnected !== false) return;
      const replacement = Array.from(document.querySelectorAll<HTMLButtonElement>("#tableBody .cmp-add")).find((button) => button.dataset.planId === focusedId);
      if (!focusTableControl(replacement)) focusTableControl(searchInput.value);
    });
  }
  feedback.value = "";
}, { flush: "pre" });
watch(() => state.search, (value) => { searchText.value = value; if (searchTimer === undefined) displayedSearch.value = value; });
watch(() => state.fromPicker, (applied) => {
  if (!applied && state.sortKey === "selectedMonthly") { state.sortKey = "priceM"; state.sortDir = 1; }
}, { immediate: true });

function change(action: () => void) { updateAppState(action); }
function onSearch(value: string) {
  searchText.value = boundedSearch(value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchTimer = undefined; displayedSearch.value = state.search; }, 150);
  change(() => { state.search = searchText.value; });
}
function cancelSearch() {
  clearTimeout(searchTimer); searchTimer = undefined;
  searchText.value = state.search; displayedSearch.value = state.search;
}
function reset() {
  clearTimeout(searchTimer); searchTimer = undefined;
  Object.assign(state, { search: "", cat: "all", region: "all", vendor: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });
  searchText.value = "";
  displayedSearch.value = "";
  focusTableControl(searchInput.value);
}
function sort(key: string, firstDirection = 1) {
  change(() => { state.sortDir = state.sortKey === key ? -state.sortDir : firstDirection; state.sortKey = key; });
}
function choosePriceSort(value: string) {
  const [key, direction] = value.split(":");
  if (!key || !URL_VALID.tsortKeys.has(key) || key === "selectedMonthly" && !state.fromPicker) return;
  change(() => { state.sortKey = key; state.sortDir = direction === "-1" ? -1 : 1; });
}
/* 显示下一批；all 为真时一次展开剩余全部（手机每批 5 条也不必反复点按）。焦点落在新显示的第一条。 */
async function more(all = false) {
  const previous = visibleRows.value.length;
  visibleLimit.value = all ? Math.max(rows.value.length, visibleLimit.value) : visibleLimit.value + pageSize.value;
  await nextTick();
  const first = document.querySelectorAll<HTMLButtonElement>("#tableBody .cmp-add")[previous];
  if (focusTableControl(first)) return;
  const row = document.querySelectorAll<HTMLElement>("#tableBody tr")[previous];
  if (row) { row.tabIndex = -1; if (focusTableControl(row)) return; }
  if (!focusTableControl(document.getElementById("tableMoreBtn"))) focusTableControl(searchInput.value);
}
function reveal(planId: string) {
  const index = rows.value.findIndex((plan) => plan.id === planId);
  if (index < 0) return false;
  if (index >= visibleLimit.value) visibleLimit.value = Math.ceil((index + 1) / pageSize.value) * pageSize.value;
  return true;
}
function flash(id: string, label: string) {
  labels.value[id] = label;
  clearTimeout(flashTimers.get(id));
  flashTimers.set(id, setTimeout(() => { delete labels.value[id]; flashTimers.delete(id); }, 1800));
}
const release = registerTableView("plan", { render: () => { cancelSearch(); revision.value++; }, cancelSearch, hasPendingSearch: () => searchTimer !== undefined, more, reveal, reset, feedback: (message: string) => { feedback.value = message; }, flash, buttons: ["exportCsvBtn", "copyMdBtn"] });
const resize = () => { pageSize.value = window.innerWidth < 768 ? 5 : 20; };
onMounted(() => window.addEventListener("resize", resize, { passive: true }));
onBeforeUnmount(() => { release(); clearTimeout(searchTimer); flashTimers.forEach(clearTimeout); window.removeEventListener("resize", resize); });
</script>

<template>
  <div class="controls controls-table">
    <input id="searchInput" ref="searchInput" type="search" class="search-input" maxlength="200" placeholder="搜索厂商 / 计划 / 模型…" aria-label="搜索数据表" :value="searchText" @input.stop="onSearch(targetValue($event))">
    <select id="selectCat" class="select" aria-label="按类别筛选数据表" :value="state.cat" @change.stop="change(() => { state.cat = targetValue($event); })">
      <option value="all">全部类别</option><option v-for="(label, category) in CAT_LABEL" :key="category" :value="category">{{ label }}</option>
    </select>
    <select id="selectRegion" class="select" aria-label="按地区筛选数据表" :value="state.region" @change.stop="change(() => { state.region = targetValue($event); })"><option value="all">全部地区</option><option value="cn">国内</option><option value="intl">国际</option></select>
    <select id="selectVendor" class="select" aria-label="按厂商筛选数据表" :value="state.vendor" @change.stop="change(() => { state.vendor = targetValue($event); })"><option value="all">全部厂商</option><option v-for="vendor in vendors" :key="vendor" :value="vendor">{{ vendor }}</option></select>
    <button id="tableExtraToggle" type="button" class="chip" :class="{ active: state.extra }" :aria-pressed="state.extra" :title="state.extra ? '隐藏中转站和价格待核实的历史记录' : `显示中转站和价格待核实的历史记录${hiddenExtra ? `（当前筛选下 ${hiddenExtra} 档）` : ''}`" @click.stop="change(() => { state.extra = !state.extra; })">含中转站与待核价格</button>
    <span id="tableCount" class="table-count" role="status" aria-live="polite" aria-atomic="true">{{ countText }}</span>
    <button id="tableResetBtn" type="button" class="chip" :disabled="isDefault" @click.stop="change(reset)">清除筛选</button>
    <button id="tableColsToggle" type="button" class="chip" :class="{ active: showColumns }" :aria-expanded="showColumns" aria-controls="planTable" :title="showColumns ? '隐藏模型、支持工具和备注列' : '显示模型、支持工具和备注列'" @click.stop="showColumns = !showColumns">{{ showColumns ? "收起详细列" : "展开详细列" }}</button>
    <button id="copyMdBtn" type="button" class="chip" :disabled="!rows.length" :title="rows.length ? '复制当前筛选结果为 Markdown 表格' : '没有可导出的结果，请先调整筛选'" @click.stop="copyTableMarkdown">{{ labels.copyMdBtn || "复制 Markdown" }}</button>
    <button id="exportCsvBtn" type="button" class="chip" :disabled="!rows.length" :title="rows.length ? '下载当前筛选结果为 CSV（UTF-8）' : '没有可导出的结果，请先调整筛选'" @click.stop="exportTableCsv">{{ labels.exportCsvBtn || "导出 CSV" }}</button>
    <button type="button" class="chip" data-apply-picker="table" :class="{ active: state.fromPicker }" :aria-pressed="state.fromPicker" :disabled="pickerState.budget === '0' && !state.fromPicker" :title="pickerState.budget === '0' && !state.fromPicker ? '选购预算为「免费」：这里只列付费档，免费档见「免费 Coding 入口」' : ''" @click.stop="applyPickerScope('table')">{{ state.fromPicker ? "取消选购条件" : "应用当前选购条件" }}</button>
    <select id="tablePriceSort" class="select" aria-label="价格表排序口径与方向" :value="priceSort" @change.stop="choosePriceSort(targetValue($event))">
      <option value="priceM:1">目录价格 / 周期：从低到高</option><option value="priceM:-1">目录价格 / 周期：从高到低</option><option value="priceY:1">目录年付折月：从低到高</option><option value="priceY:-1">目录年付折月：从高到低</option><option value="selectedMonthly:1" :disabled="!state.fromPicker">所选支付月均：从低到高</option><option value="selectedMonthly:-1" :disabled="!state.fromPicker">所选支付月均：从高到低</option>
    </select>
  </div>
  <p id="tableScope" class="maintenance-meta">{{ scopeText }}</p>
  <p id="tableFeedback" class="table-feedback" role="status" aria-live="polite">{{ feedback }}</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="计划数据表，可横向滚动">
    <table id="planTable" role="table" :class="{ 'is-empty': !rows.length, 'show-all-cols': showColumns }">
      <caption class="sr-only">公开标价记录、额度、模型与核价来源</caption>
      <thead><tr>
        <template v-for="column in columns" :key="column.id">
          <SortHeader v-if="column.id === 'priceM' || column.id === 'priceY'" :label="column.label" :sort-key="column.id" :current-key="state.sortKey" :direction="state.sortDir" @sort="sort" />
          <th v-else scope="col" :class="column.cls?.includes('col-opt') ? 'col-opt' : undefined">{{ column.label }}</th>
        </template>
      </tr></thead>
      <tbody id="tableBody">
        <tr v-for="plan in visibleRows" :key="plan.id">
          <td v-for="column in columns" :key="column.id" :data-column="column.id" :data-label="column.label" :class="column.tdClass ? column.tdClass(plan) : column.cls">
            <template v-if="column.id === 'plan'"><span class="plan-name">{{ plan.plan }}</span><div class="badge-row"><PlanBadges :plan="plan" /></div><CompareButton :plan="plan" /><WatchButton :plan="plan" /></template>
            <span v-else-if="column.id === 'cat'" class="tag" :class="`tag-${plan.cat}`">{{ CAT_LABEL[plan.cat] || plan.cat }}</span>
            <PlanPrice v-else-if="column.id === 'priceM'" :plan="plan" :selected="state.fromPicker" />
            <PlanPrice v-else-if="column.id === 'priceY'" :plan="plan" annual />
            <PriceCheck v-else-if="column.id === 'url'" :plan="plan" />
            <template v-else>{{ column.value(plan) || (column.id === "note" ? "—" : "") }}</template>
          </td>
        </tr>
        <tr v-if="!rows.length"><td :colspan="columns.length" class="table-empty">
          <template v-if="freeScope"><b>选购预算为「免费」，公开标价表不含免费档</b><p>免费档在<a href="#free">免费 Coding 入口</a>；取消选购条件可查看全部标价记录。</p><button type="button" class="chip" data-apply-picker="table" @click.stop="applyPickerScope('table')">取消选购条件</button></template>
          <template v-else><b>没有匹配的公开标价记录</b><p>{{ filterText }}没有结果{{ hiddenExtra ? `，另有 ${hiddenExtra} 档中转站或待核价格未显示` : "" }}。可以{{ state.fromPicker ? "调整「帮我选」条件、" : "" }}调整关键词或清除筛选。{{ cmpState.items.length ? "已选的对比方案仍保留。" : "" }}</p><button v-if="hiddenExtra" type="button" class="chip" data-table-extra @click.stop="change(() => { state.extra = true; })">显示中转站与待核价格</button> <button id="tableEmptyResetBtn" type="button" class="chip" data-reset-table @click.stop="change(reset)">清除筛选</button></template>
        </td></tr>
      </tbody>
    </table>
  </div>
  <div class="table-more-actions">
    <button id="tableMoreBtn" type="button" class="chip" :hidden="visibleRows.length >= rows.length" aria-controls="tableBody" @click.stop="more()">显示更多记录（还有 {{ rows.length - visibleRows.length }} 条）</button>
    <button id="tableAllBtn" type="button" class="chip" :hidden="rows.length - visibleRows.length <= pageSize" aria-controls="tableBody" @click.stop="more(true)">显示全部 {{ rows.length }} 条</button>
  </div>
</template>
