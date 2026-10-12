<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { META, RATE_INR_CNY } from "@generated/catalog";
import { RATE, safeLink } from "@domain/core";
import { APP_DEFAULTS, boundedSearch, PERSONAL_DEFAULT_LIMIT, personalState, pickerState, tableState } from "@state/app";
import { chartCache, queuedChartRenders } from "@browser/charts/host";
import { personalViewHooks, renderPersonalChart } from "@browser/charts/personal";
import { updateAppState } from "@browser/url-state";
import { navigateToSection } from "@app/navigation";
import { applyPickerScope } from "@app/picker";
import { renderTable } from "@app/tables";
import { targetValue } from "@browser/dom";
import { excludedList, personalView } from "./chart-models";
import PickerScope from "../../components/PickerScope.vue";
import { useChartLifecycle } from "../../composables/chart-lifecycle";
useChartLifecycle("chartPersonal");
const state = personalState;
const categories = [["all", "全部类别"], ["official", "模型官方订阅"], ["tool", "第三方工具订阅"], ["cloud", "云厂商/API 套餐"]];
const regions = [["all", "全部地区"], ["cn", "国内"], ["intl", "国际"]];
const billings = [["M", "月付"], ["Y", "年付（折月）"]];
const searchText = ref(state.q), searchInput = ref<HTMLInputElement | null>(null);
const displayedSearch = ref(state.q);
const model = computed(() => personalView(displayedSearch.value));
let timer: ReturnType<typeof setTimeout> | undefined;
function cancelSearch() { clearTimeout(timer); timer = undefined; searchText.value = state.q; displayedSearch.value = state.q; }
watch(() => state.q, (value) => { searchText.value = value; if (timer === undefined) displayedSearch.value = value; });
watch([() => state.cat, () => state.region, () => state.billing, () => state.fromPicker], cancelSearch);
function search(value: string) {
  searchText.value = boundedSearch(value);
  clearTimeout(timer);
  timer = setTimeout(() => { timer = undefined; displayedSearch.value = state.q; }, 150);
  updateAppState(() => { state.q = searchText.value; });
}
function reset() {
  cancelSearch();
  updateAppState(() => { Object.assign(state, APP_DEFAULTS.personal); });
  searchInput.value?.focus();
}
async function draw() {
  if (!chartCache.chartPersonal && !queuedChartRenders.has("chartPersonal")) return;
  await nextTick(); renderPersonalChart();
}
watch([model, () => pickerState.billing], draw);
onMounted(() => { personalViewHooks.cancelSearch = cancelSearch; personalViewHooks.hasPendingSearch = () => timer !== undefined; });
onBeforeUnmount(() => { clearTimeout(timer); personalViewHooks.cancelSearch = undefined; personalViewHooks.hasPendingSearch = undefined; });
function change(key: "cat" | "region" | "billing", value: string) { updateAppState(() => { state[key] = value; }); }
function toggleAll() { updateAppState(() => { state.limit = state.limit == null ? PERSONAL_DEFAULT_LIMIT : null; }); }
function showExcluded() {
  updateAppState(() => { Object.assign(tableState, { search: state.q, cat: "all", region: "all", vendor: "all", fromPicker: false, extra: true }); }, renderTable);
  navigateToSection("#table");
}
</script>
<template>
  <div class="controls">
    <input type="search" id="chartSearch" ref="searchInput" class="search-input" maxlength="200" placeholder="搜索厂商 / 计划 / 模型…" aria-label="搜索个人订阅图表" :value="searchText" @input="search(targetValue($event))">
    <div class="chip-group" id="chipCat" role="group" aria-label="类别"><button v-for="[id, label] in categories" :key="id" type="button" class="chip" :class="{ active: state.cat === id }" :data-cat="id" :aria-pressed="state.cat === id" @click="change('cat', id)">{{ label }}</button></div>
    <div class="chip-group" id="chipRegion" role="group" aria-label="地区"><button v-for="[id, label] in regions" :key="id" type="button" class="chip" :class="{ active: state.region === id }" :data-region="id" :aria-pressed="state.region === id" @click="change('region', id)">{{ label }}</button></div>
    <div class="chip-group" id="chipBilling" role="group" aria-label="计费周期"><button v-for="[id, label] in billings" :key="id" type="button" class="chip" :class="{ active: state.billing === id }" :data-billing="id" :aria-pressed="state.billing === id" :disabled="state.fromPicker" :aria-describedby="state.fromPicker ? 'personalScope' : undefined" @click="change('billing', id)">{{ label }}</button></div>
    <button type="button" class="chip" id="personalResetBtn" @click.stop="reset">清除筛选</button>
    <div class="legend-inline" id="chartLegend"><span v-for="[id, label] in categories.slice(1)" :key="id"><i :style="{ background: `var(--cat-${id})` }"></i>{{ label }}</span><span><i style="background: var(--cat-relay)"></i>中转站</span></div>
    <PickerScope name="personal" />
  </div>
  <PickerScope name="personal" paragraph />
  <div class="chart-card">
    <div id="chartPersonalEmpty" class="chart-empty" :hidden="model.shown.length > 0" role="status">
      <template v-if="state.fromPicker && pickerState.budget === '0'">选购预算为「免费」，这张图只画付费月付档。免费档见<a href="#free">免费 Coding 入口</a>。<button type="button" class="linkish" data-apply-picker="personal" @click.stop="applyPickerScope('personal')">取消选购条件</button></template>
      <template v-else>{{ model.annual ? "没有匹配的公开年付套餐；未列年付价的档位已排除。请更换关键词或清除筛选。" : "没有匹配的个人月付套餐。请更换关键词或清除筛选。" }}</template>
    </div>
    <div id="chartPersonal" class="chart" :hidden="!model.shown.length"></div>
  </div>
  <p class="chart-note" id="notePersonal">当前筛选：{{ model.rows.length }} 个档位（显示 {{ model.shown.length }}） ｜ 汇率 1 USD ≈ {{ RATE }} CNY，1 INR ≈ {{ Number(RATE_INR_CNY.toFixed(6)) }} CNY（{{ META.rateAsOf }}，<a :href="safeLink(META.rateSource)" target="_blank" rel="noopener">汇率来源</a>） ｜ 红色是中转站，不和官方订阅、工具订阅放在同一类颜色里 ｜ 搜索按空格分词，各词均须匹配；词内忽略大小写与连字符，支持产品别名并展开「同某档」
    <template v-if="model.noFilter && model.rows.length > PERSONAL_DEFAULT_LIMIT"> ｜ <button type="button" id="showAllPersonal" class="linkish" @click.stop="toggleAll">{{ model.shown.length < model.rows.length ? `显示全部 ${model.rows.length} 档` : `收起为 ${PERSONAL_DEFAULT_LIMIT} 档` }}</button></template>
    <template v-if="model.annual"> ｜ 未列公开年付价的档位已排除</template>
    <template v-if="model.excluded.length"><br>这张图只画已核实价格的个人{{ model.annual ? "年付" : "月付" }}。同名模型还有 {{ model.excluded.length }} 档不在图上<template v-if="model.inTable.length">；价格表里有 {{ model.inTable.length }} 档：{{ excludedList(model.inTable, model.annual) }}，<button type="button" id="showExcludedInTable" class="linkish" @click.stop="showExcluded">在完整表里看</button></template><template v-if="model.free.length">；免费档见<a href="#free">免费入口</a>：{{ excludedList(model.free, model.annual) }}</template><template v-if="model.quote.length">；无公开价、需按量或询价：{{ excludedList(model.quote, model.annual) }}</template>。</template>
  </p>
  <p class="chart-note">手机上套餐名显示在价格柱上方；点按价格柱查看完整套餐信息，或到<a href="#table">数据表</a>搜索并勾选对比。</p>
</template>
