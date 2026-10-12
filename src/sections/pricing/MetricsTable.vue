<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { displayModelName, METRICS_ALL } from "@domain/core";
import { metricsState, pickerState } from "@state/app";
import { focusTableControl } from "@browser/interaction";
import { updateAppState } from "@browser/url-state";
import { applyPickerScope, pickerScopeText } from "@app/picker";
import { METRICS_COLUMNS, type MetricsCellContext, type MetricsTableRow, metricsTableRows, paygReferenceRows, registerTableView } from "@app/tables";
import { targetValue } from "@browser/dom";
import MetricsCell from "../../components/MetricsCell.vue";
import SortHeader from "../../components/SortHeader.vue";
const state = metricsState;
const modelSelect = ref<HTMLSelectElement | null>(null);
const pageSize = ref(typeof window === "undefined" || window.innerWidth >= 768 ? 20 : 5);
const visibleLimit = ref(pageSize.value);
const compact = ref(true);
const revision = ref(0);
const columns = METRICS_COLUMNS;
const results = computed(() => { revision.value; return metricsTableRows(); });
const rows = computed(() => results.value.shownRows);
const visibleRows = computed(() => rows.value.slice(0, visibleLimit.value));
const models = [...new Set<string>([...METRICS_ALL.map((model: { model: string }) => model.model), ...paygReferenceRows().map((row: { m: { model: string } }) => row.m.model)])].sort((a, b) => displayModelName(a).localeCompare(displayModelName(b), "zh"));
const sortColumn = computed(() => columns.find((column: { sortKey?: string }) => column.sortKey === state.sortKey));
const sortDescription = computed(() => `${sortColumn.value?.label || '当前列'}${state.sortDir === 1 ? '从低到高' : '从高到低'}`);
const sortHint = computed(() => `排序：${sortDescription.value}${compact.value && sortColumn.value?.cls?.split(' ').includes('col-more') ? '（明细列，展开查看）' : ''}`);
const isDefault = computed(() => !state.fromPicker && state.model === "all" && state.ver === "all" && state.tier === "flagship" && state.offer === "current" && state.sortKey === "cpm" && state.sortDir === 1);
const scopeText = computed(() => state.fromPicker ? `已应用选购条件：${pickerScopeText()}。套餐按所选支付方式重算；取消选购条件可查看 API 参照。继续叠加本区筛选。` : "当前仅使用本区筛选，尚未应用选购条件。应用后会叠加预算、地区、工具与支付方式。");
watch(() => JSON.stringify([state, pageSize.value, state.fromPicker ? pickerState : null]), () => { visibleLimit.value = pageSize.value; }, { flush: "sync" });
function change(action: () => void) { updateAppState(action); }
function sort(key: string, direction = 1) { change(() => { state.sortDir = state.sortKey === key ? -state.sortDir : direction; state.sortKey = key; }); }
function reset() { Object.assign(state, { model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false }); focusTableControl(modelSelect.value); }
function populateModels() { if (state.model !== "all" && !models.includes(state.model)) state.model = "all"; }
async function more(all = false) {
  const previous = visibleRows.value.length;
  visibleLimit.value = all ? Math.max(rows.value.length, visibleLimit.value) : visibleLimit.value + pageSize.value;
  await nextTick();
  const row = document.querySelectorAll<HTMLElement>("#metricsBody tr")[previous];
  if (row) { row.tabIndex = -1; focusTableControl(row); } else focusTableControl(document.getElementById("metricsMoreBtn"));
}
/* 列配置的 title / tdClass 只读额度行、换算结果与是否按量。 */
function context(row: MetricsTableRow): MetricsCellContext {
  return { m: row.m, c: row.c, isPayg: row.payg };
}
const release = registerTableView("metrics", { render: () => { revision.value++; }, more, reset, models: populateModels });
const resize = () => { pageSize.value = window.innerWidth < 768 ? 5 : 20; };
onMounted(() => { populateModels(); window.addEventListener("resize", resize, { passive: true }); });
onBeforeUnmount(() => { release(); window.removeEventListener("resize", resize); });
</script>

<template>
  <div class="controls controls-table">
    <select id="metricsModel" ref="modelSelect" class="select" aria-label="按模型筛选额度表" :value="state.model" @change.stop="change(() => { state.model = targetValue($event); })"><option value="all">全部模型</option><option v-for="model in models" :key="model" :value="model">{{ displayModelName(model) }}</option></select>
    <select id="metricsVer" class="select" aria-label="按版本筛选额度表" :value="state.ver" @change.stop="change(() => { state.ver = targetValue($event); })"><option value="all">全部版本</option><option value="V3">V3（新版积分制）</option><option value="V2">V2（老用户续费）</option></select>
    <select id="metricsTier" class="select" aria-label="额度表模型档" :value="state.tier" @change.stop="change(() => { state.tier = targetValue($event); })"><option value="flagship">只看旗舰</option><option value="all">含轻量模型</option></select>
    <select id="metricsOffer" class="select" aria-label="额度表购买资格" :value="state.offer" @change.stop="change(() => { state.offer = targetValue($event); })"><option value="current">新用户可购买</option><option value="all">含历史与续费档</option></select>
    <span id="metricsCount" class="table-count" role="status" aria-live="polite" aria-atomic="true">{{ visibleRows.length === rows.length ? `${rows.length} 行` : `已显示 ${visibleRows.length} / ${rows.length} 行` }}</span>
    <span id="metricsSortHint" class="table-sort-hint" role="status" aria-live="polite">{{ sortHint }}</span>
    <button id="metricsResetBtn" type="button" class="chip" :disabled="isDefault" @click.stop="change(reset)">清除筛选</button>
    <button id="metricsToggle" type="button" class="chip" :class="{ active: !compact }" :aria-expanded="!compact" aria-controls="metricsTable" @click.stop="compact = !compact">{{ compact ? "展开 5 小时 / 每周明细" : "收起明细" }}</button>
    <button type="button" class="chip" data-apply-picker="metrics" :class="{ active: state.fromPicker }" :aria-pressed="state.fromPicker" :disabled="pickerState.budget === '0' && !state.fromPicker" :title="pickerState.budget === '0' && !state.fromPicker ? '选购预算为「免费」：这里只列付费档，免费档见「免费 Coding 入口」' : ''" @click.stop="applyPickerScope('metrics')">{{ state.fromPicker ? "取消选购条件" : "应用当前选购条件" }}</button>
  </div>
  <p id="metricsScope" class="maintenance-meta">{{ scopeText }}</p>
  <div class="table-wrap metrics-wrap" tabindex="0" role="region" aria-label="额度对比表，可横向滚动">
    <table id="metricsTable" role="table" :class="{ 'is-compact': compact, 'is-empty': !rows.length }">
      <thead><tr><template v-for="column in columns" :key="column.id"><SortHeader v-if="column.sortKey" :class="column.cls" :label="column.label" :sort-key="column.sortKey" :current-key="state.sortKey" :direction="state.sortDir" :first-direction="column.asc ? 1 : -1" @sort="sort" /><th v-else scope="col" :class="column.cls">{{ column.label }}</th></template></tr></thead>
      <tbody id="metricsBody">
        <tr v-for="(row, index) in visibleRows" :key="`${row.m.vendor}|${row.m.plan}|${row.m.model}|${row.m.ver}|${row.payg}|${index}`" :class="{ 'est-row': row.m.isEst, 'payg-row': row.payg }"><td v-for="column in columns" :key="column.id" :data-column="column.id" :data-label="column.label" :class="`${column.cls || ''}${column.tdClass ? column.tdClass(context(row)) : ''}`" :title="column.title ? column.title(context(row)) : undefined"><MetricsCell :column="column.id" :row="row" /></td></tr>
        <tr v-if="!rows.length"><td :colspan="columns.length" class="table-empty"><template v-if="state.fromPicker && pickerState.budget === '0'"><b>选购预算为「免费」，额度表只列付费套餐</b><p>免费档的额度见<a href="#free">免费 Coding 入口</a>；取消选购条件可查看全部额度。</p><button type="button" class="chip" data-apply-picker="metrics" @click.stop="applyPickerScope('metrics')">取消选购条件</button></template><template v-else><b>当前模型与版本没有可展示的额度</b><p>可以{{ state.fromPicker ? "调整「帮我选」条件、" : "" }}调整模型、版本或购买范围；查看轻量模型时把模型档改为「含轻量模型」。</p><button id="metricsEmptyResetBtn" type="button" class="chip" data-reset-metrics @click.stop="change(reset)">清除筛选</button></template></td></tr>
      </tbody>
    </table>
  </div>
  <div class="table-more-actions">
    <button id="metricsMoreBtn" type="button" class="chip" :hidden="visibleRows.length >= rows.length" aria-controls="metricsBody" @click.stop="more()">显示更多额度记录（还有 {{ rows.length - visibleRows.length }} 行）</button>
    <button id="metricsAllBtn" type="button" class="chip" :hidden="rows.length - visibleRows.length <= pageSize" aria-controls="metricsBody" @click.stop="more(true)">显示全部 {{ rows.length }} 行</button>
  </div>
  <div id="metricsNote" class="chart-note">
    <b>当前范围：</b>{{ state.tier === "all" ? "含轻量模型" : "只看旗舰模型" }}；{{ state.offer === "all" ? "含历史与仅老用户续费档，购买前请核对来源" : "仅新用户当前可购买的套餐，与排行使用相同购买筛选" }}。API 按量是参照行，不进入套餐排行。当前 {{ rows.length }} 行（含 <b>{{ results.payg.length }}</b> 行官方按量、<b>{{ results.rows.filter((row) => row.m.isEst).length }}</b> 行「≈估」），按{{ sortDescription }}排序。
    <details class="metrics-legend"><summary>各列口径、计算假设与置信度说明</summary><b>💵每M tokens</b> = 月费÷月 tokens 中值（统一折算¥，越低越便宜；绿色≤¥0.30、黄色≤¥1、红色&gt;¥1）。标「官方 API 按量」的行没有月费，这一列用同一套 80/20、95% 缓存假设把低峰牌价折成人民币，所以能和套餐排在一起；模型名下方仍是原始输入 / 输出 / 缓存命中。套餐行模型名下方的牌价也不是套餐的每 M 成本。同一请求额度下，牌价更高的模型「额度价值 / 倍率」更高，每 M 成本不变。带牌价的 credits 按这套单价把面值折成 tokens；没有逐模型牌价的美元 credits 仍按假设均价 ¥10/M，且不进入「真实单价」排行。标「官方系数」的行用厂商公布的积分系数、按同一套假设摊成 tokens，置信度为中，不进入每周 tokens 图。<br>计算假设：输入/输出=80/20、缓存命中率 95%、每周 5 个 5h 窗口、每月 4.33 周。官方周 tokens：Tokens/5h=周÷5，Tokens/月=周×4.33。请求数制若同时写了每 5 小时、每周、每月上限，三列各自用该窗口的次数，不按「周÷5、周×4.33」互相换算，因此 Tokens/5h×5 可以不等于 Tokens/周。⏫额度倍率 = 该时段额度价值 ÷ 该时段分摊月费（5h=月费/21.65，周=月费/4.33，月=月费）。<b>「依据」列</b>标注出处与置信度（<span class="conf conf-hi">高</span>官方/credits · <span class="conf conf-mid">中</span>实测/区间/牌价折算 · <span class="conf conf-lo">低</span>毛利/第三方/请求折算）。</details>
  </div>
</template>
