<script setup lang="ts">
/* 模型公开评测：筛选、协议说明、排名图表、成绩表与导出。
 * 状态（publicBenchmarkState / publicBenchmarkChartState）在 state/maintenance，筛选与导出在 application/maintenance，模型匹配在 domain/benchmarks，
 * 与推荐区共享计算；本组件负责渲染与交互。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { publicBenchmarkConfiguration, publicBenchmarkDate, publicChartAxisName, publicChartFamily, publicCostText, publicModelDisplayName, publicModelPlans, publicNewerVersion, publicScoreText, publicUncertaintyLabel } from "@domain/benchmarks";
import { esc } from "@domain/core";
import { publicBenchmarkChartState, publicBenchmarkState } from "@state/maintenance";
import { axisStyle, chartAxisLabel, chartCache, deferChartRender, makeChart, markChartsForResize, PAL, tipStyle } from "@browser/charts/host";
import { downloadCsvText, downloadTextFile, focusTableControl } from "@browser/interaction";
import { publicBenchmarkData } from "@browser/maintenance-data";
import { optionalDataLoaded } from "@browser/optional-data";
import { resizeVisibleCharts } from "@app/chart-lifecycle";
import { optionalPendingText, publicBenchmarkChartRows, publicBenchmarkCsv, publicBenchmarkFamilies, publicBenchmarkFamilyLabel, publicBenchmarkHooks, publicBenchmarkLabels, publicBenchmarkRows, publicChartColors, renderPublicBenchmarkChart, selectedPublicBenchmark } from "@app/maintenance";
import { targetValue } from "@browser/dom";
import { fromData } from "../../composables/optional-data";
import PlanLinks from "../../components/PlanLinks.vue";
import SourceLink from "../../components/SourceLink.vue";
import ChipRadioGroup from "../../components/ChipRadioGroup.vue";
import { useChartLifecycle } from "../../composables/chart-lifecycle";
useChartLifecycle("chartPublicBenchmark");

const state = publicBenchmarkState;
const chartState = publicBenchmarkChartState;
const CHART_METRICS = [["score", "排名分数"], ["cost", "每任务成本"]] as const;
const CHART_LIMITS = ["10", "20", "all"];
const SEARCH_DELAY = 150;

const loaded = fromData("benchmark", () => optionalDataLoaded("benchmark"));
const protocols = fromData("benchmark", () => publicBenchmarkData().benchmarks);
const families = fromData("benchmark", () => publicBenchmarkFamilies());
const familyProtocols = fromData("benchmark", () => publicBenchmarkLabels(protocols.value.filter((b) => b.family === state.family)));
const selected = fromData("benchmark", () => selectedPublicBenchmark());
const rows = fromData("benchmark", () => publicBenchmarkRows());
const chartRows = fromData("benchmark", () => publicBenchmarkChartRows());

/* 协议不在当前用途下时 selectedPublicBenchmark 会回退到该用途的默认协议；写回状态，下拉框与导出保持一致。 */
watch(selected, (benchmark) => {
  if (benchmark) { state.id = benchmark.id; state.family = benchmark.family; }
}, { immediate: true });

const tableRows = computed(() => rows.value.map((r) => {
  const plans = publicModelPlans(r.model);
  const unit = selected.value ? selected.value.unit : "";
  return {
    ...r,
    name: publicModelDisplayName(r.model),
    configSummary: [r.reasoning ? "推理：" + r.reasoning : "推理未公布", r.agent ? "Agent：" + r.agent : "Agent 未公布"].join(" · "),
    configuration: publicBenchmarkConfiguration(r),
    plans,
    newer: publicNewerVersion(r.model, plans),
    scoreText: publicScoreText(r.score, unit),
    uncertaintyLabel: publicUncertaintyLabel(r),
    costText: publicCostText(r.costUSD),
    checkedDate: publicBenchmarkDate(r.checkedAt),
  };
}));
const countText = computed(() => selected.value
  ? `${rows.value.length} 条匹配记录 · ${state.mode === "all" ? "全部已公布配置" : "每模型最佳已公布配置"} · 本协议分数降序`
  : loaded.value ? "暂无公开记录" : "");
const modeNote = computed(() => state.mode === "all"
  ? "分别列出各推理与 Agent 配置；名次仅适用于当前协议，搜索保留原名次。"
  : "每模型取本协议已公布的最高分配置；名次仅适用于当前记录，搜索保留原名次。");

/* ---------- 筛选 ---------- */
function chooseFamily(value: string) {
  if (!protocols.value.some((b) => b.family === value)) return;
  state.family = value;
  state.id = "";
}
function chooseProtocol(value: string) {
  if (protocols.value.some((b) => b.id === value)) state.id = value;
}
const searchInput = ref<HTMLInputElement | null>(null);
const searchText = ref(state.search);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
/* 与数据表搜索一致：输入停顿后再筛选。 */
function onSearchInput(value: string) {
  searchText.value = value.slice(0, 200);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { searchTimer = undefined; state.search = searchText.value; }, SEARCH_DELAY);
}
function clearSearch() {
  clearTimeout(searchTimer);
  searchTimer = undefined;
  searchText.value = "";
  state.search = "";
  focusTableControl(searchInput.value);
}

/* ---------- 图表 ---------- */
const chartHost = ref<HTMLElement | null>(null);
const hasCost = computed(() => rows.value.some((r) => r.costUSD != null));
/* 当前协议没有成本数据时只能按分数作图。 */
watch(hasCost, (value) => { if (!value) chartState.metric = "score"; }, { immediate: true });
const costMetric = computed(() => chartState.metric === "cost");
const chartFamilies = computed(() => chartRows.value.map((r) => publicChartFamily(r.model)));
const legendFamilies = computed(() => [...new Set(chartFamilies.value)]);
/* 颜色来自 CSS 变量，切换主题后由 renderChart 重读 */
const familyColors = ref(publicChartColors());
const chartHeight = computed(() => Math.max(240, chartRows.value.length * 34 + 74));
const chartNote = computed(() => {
  const benchmark = selected.value;
  if (!benchmark) return "";
  return `${benchmark.name} · ${chartRows.value.length} / ${rows.value.length} 条匹配配置 · ` + (costMetric.value
    ? "每任务成本（USD），按本协议分数名次排列；费用未公布的配置不绘制。"
    : `${benchmark.metric}（${benchmark.unit}），按本协议分数降序。`);
});
/* 图表画在 canvas 上，读屏读这段文字摘要 */
const chartDescription = computed(() => {
  const benchmark = selected.value;
  if (!benchmark) return "模型评测排名";
  const items = chartRows.value.map((r) => `第 ${r.rank} 名 ${publicModelDisplayName(r.model)}：${costMetric.value ? publicCostText(r.costUSD) : publicScoreText(r.score, benchmark.unit)}`);
  return `${benchmark.name}，${costMetric.value ? "评测每任务成本" : benchmark.metric}。${items.join("；")}`.slice(0, 240);
});
function chooseChartLimit(value: string) {
  if (CHART_LIMITS.includes(value)) chartState.limit = value;
}

/** ECharts 回调参数里本组件用到的字段 */
type ChartItem = { dataIndex: number; value: number };

async function renderChart() {
  await nextTick(); /* 先让容器的显隐与高度跟上最新状态，ECharts 再按实际尺寸绘制 */
  const host = chartHost.value, benchmark = selected.value;
  if (!host || !benchmark || !rows.value.length) return;
  familyColors.value = publicChartColors();
  const section = host.closest<HTMLElement>(".section");
  if (section && section.hidden) return;
  if (deferChartRender("chartPublicBenchmark", renderPublicBenchmarkChart)) return;
  const shown = chartRows.value, cost = costMetric.value, families = chartFamilies.value, colors = familyColors.value;
  const labels = shown.map((r) => `#${r.rank} ${publicModelDisplayName(r.model)}${state.mode === "all" ? " · " + [r.reasoning, r.agent].filter(Boolean).join(" / ") : ""}`);
  makeChart("chartPublicBenchmark").setOption({
    animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    grid: { left: 8, right: cost ? 78 : 64, top: 12, bottom: 46, containLabel: true },
    // Fixed positioning keeps wrapped tooltips out of WebKit's chart scroll extent.
    tooltip: { ...tipStyle(host, true), extraCssText: "position: fixed; max-width: min(420px, calc(100vw - 24px)); box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; z-index: 2000;", trigger: "item", formatter: (item: ChartItem) => {
      const r = shown[item.dataIndex]; if (!r) return "";
      return `<b>#${r.rank} ${esc(publicModelDisplayName(r.model))}</b><br/>${esc(benchmark.name)} · ${esc(benchmark.metric)}：${esc(publicScoreText(r.score, benchmark.unit))}<br/>${esc(publicBenchmarkConfiguration(r))}<br/>每任务成本：${esc(publicCostText(r.costUSD))}<br/>${esc(r.uncertainty || "置信区间未公布")}`;
    } },
    xAxis: { type: "value", min: 0, ...(!cost && benchmark.unit === "%" ? { max: 100 } : {}), name: cost ? "USD / 任务" : benchmark.metric + "（" + benchmark.unit + "）", nameLocation: "middle", nameGap: 28, nameTextStyle: { color: PAL.dim, fontSize: 11 }, ...axisStyle() },
    yAxis: { type: "category", inverse: true, data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: PAL.axisLine } }, axisLabel: { ...chartAxisLabel(host, 12), lineHeight: 14, formatter: (label: string) => publicChartAxisName(label, host.getBoundingClientRect().width < 480) } },
    series: [{ type: "bar", data: shown.map((r) => cost ? r.costUSD : r.score), barWidth: 17,
      itemStyle: { color: cost ? PAL.gold : (item: ChartItem) => colors[families[item.dataIndex].id], borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: "right", color: PAL.text, fontSize: 11, formatter: (item: ChartItem) => cost ? publicCostText(item.value) : publicScoreText(item.value, benchmark.unit) } }],
  }, true);
  markChartsForResize(["chartPublicBenchmark"]);
  resizeVisibleCharts();
}
/* 导航、主题和尺寸变化通过共享绘图入口通知组件。 */
watch([chartRows, costMetric, () => state.mode], renderChart);
function hideTooltip() {
  const chart = chartCache.chartPublicBenchmark;
  if (chart) chart.dispatchAction({ type: "hideTip" });
}
onMounted(() => {
  publicBenchmarkHooks.renderChart = renderChart;
  window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
  window.addEventListener("resize", hideTooltip, { passive: true });
});
onBeforeUnmount(() => {
  publicBenchmarkHooks.renderChart = null;
  window.removeEventListener("scroll", hideTooltip, { capture: true });
  window.removeEventListener("resize", hideTooltip);
  clearTimeout(searchTimer);
});

/* ---------- 导出 ---------- */
const feedback = ref("");
function downloadCsv() {
  const benchmark = selected.value;
  if (!benchmark || !rows.value.length) return;
  downloadCsvText(publicBenchmarkCsv(), `coding-plan-benchmark-${benchmark.id}.csv`);
  feedback.value = `已导出当前协议的 ${rows.value.length} 条筛选结果，配置、来源与费用口径已保留。`;
}
function downloadJson() {
  const data = publicBenchmarkData();
  if (!data.benchmarks.length) return;
  downloadTextFile(JSON.stringify(data, null, 2) + "\n", "coding-plan-public-benchmarks.json", "application/json;charset=utf-8");
  feedback.value = "已导出全部公开评测协议与原始成绩；未包含本机关注或投稿资料。";
}
</script>

<template>
  <div class="public-benchmark-controls">
    <label class="maintenance-select" for="publicBenchmarkFamily">评测用途<select id="publicBenchmarkFamily" :value="state.family" @change="chooseFamily(targetValue($event))">
      <option v-for="family in families" :key="family" :value="family">{{ publicBenchmarkFamilyLabel(family) }}</option>
    </select></label>
    <label class="maintenance-select" for="publicBenchmarkSelect">版本与评测协议<select id="publicBenchmarkSelect" :value="selected?.id" @change="chooseProtocol(targetValue($event))">
      <optgroup :label="publicBenchmarkFamilyLabel(state.family || '评测协议')">
        <option v-for="[protocol, label] in familyProtocols" :key="protocol.id" :value="protocol.id">{{ label }}</option>
      </optgroup>
    </select></label>
    <label class="maintenance-select" for="publicBenchmarkMode">配置展示<select id="publicBenchmarkMode" :value="state.mode" @change="state.mode = targetValue($event) === 'all' ? 'all' : 'best'">
      <option value="best">每模型最佳配置</option>
      <option value="all">全部配置</option>
    </select></label>
    <label class="maintenance-select" for="publicModelSearch">模型或配置关键词<input id="publicModelSearch" ref="searchInput" type="search" class="search-input" maxlength="200" placeholder="例如模型名、推理档位或 Agent" :value="searchText" @input="onSearchInput(targetValue($event))"></label>
    <button id="publicModelClearBtn" type="button" class="chip" :disabled="!state.search" @click="clearSearch">清除搜索</button>
  </div>

  <div id="publicBenchmarkMeta">
    <template v-if="selected">
      <h2>{{ selected.name }}</h2>
      <p class="maintenance-meta">{{ selected.metric }}（{{ selected.unit }}） · {{ selected.scope }}</p>
      <!-- 按协议区分：换协议时收起，同一协议内筛选或搜索保持展开 -->
      <details :key="selected.id" class="public-protocol-details" :data-benchmark-id="selected.id">
        <summary>协议配置、范围与来源</summary>
        <p>{{ selected.description }}</p>
        <dl class="public-benchmark-meta">
          <div><dt>版本与协议</dt><dd>{{ selected.version }} · <code>{{ selected.id }}</code></dd></div>
          <div><dt>评测配置</dt><dd>{{ selected.configuration }}</dd></div>
          <div><dt>官方标注日期与核查</dt><dd>官方标注 {{ publicBenchmarkDate(selected.sourceUpdatedAt) }} · 本站核查 {{ publicBenchmarkDate(selected.checkedAt) }} · <SourceLink :url="selected.sourceUrl" label="原始评测" /></dd></div>
        </dl>
      </details>
    </template>
    <p v-else>{{ loaded ? "公开评测数据暂不可用。" : optionalPendingText("公开评测协议与成绩") }}</p>
  </div>
  <p id="publicBenchmarkModeNote" class="maintenance-meta">{{ modeNote }}</p>
  <p id="publicBenchmarkCount" class="maintenance-meta" role="status" aria-live="polite">{{ countText }}</p>

  <div id="publicBenchmarkChartWrap" class="public-benchmark-chart" :hidden="!selected || !rows.length">
    <div class="public-chart-toolbar">
      <ChipRadioGroup class="chip-group" label="评测图表指标" data-key="public-chart" :options="CHART_METRICS" :model-value="chartState.metric" :disabled-options="hasCost ? [] : ['cost']" @select="chartState.metric = $event" />
      <label class="public-chart-limit" for="publicBenchmarkChartLimit">图表条数<select id="publicBenchmarkChartLimit" class="select" :value="chartState.limit" @change="chooseChartLimit(targetValue($event))">
        <option value="10">前 10 条</option>
        <option value="20">前 20 条</option>
        <option value="all">全部匹配</option>
      </select></label>
    </div>
    <p id="publicBenchmarkChartNote" class="maintenance-meta">{{ chartNote }}</p>
    <div id="publicBenchmarkChartLegend" class="public-chart-legend" aria-label="模型系列配色" :hidden="costMetric">
      <span v-for="family in legendFamilies" :key="family.id"><i aria-hidden="true" :style="{ background: familyColors[family.id] }"></i>{{ family.label }}</span>
    </div>
    <div class="public-chart-plot" role="region" aria-label="当前评测协议的模型排名图表">
      <!-- 画布由 ECharts 管理，Vue 只维护尺寸与文字摘要 -->
      <div id="chartPublicBenchmark" ref="chartHost" class="chart" role="img" :aria-label="chartDescription" :style="{ height: chartHeight + 'px' }"></div>
    </div>
  </div>

  <p id="publicBenchmarkEmpty" class="benchmark-empty" :hidden="rows.length > 0 || !loaded">{{ selected ? "当前协议没有匹配的模型或配置。请调整关键词，或清除搜索。" : "公开数据暂不可用；本站不会用本地验收示例填充模型分数。" }}</p>
  <div id="publicBenchmarkWrap" class="table-wrap public-benchmark-wrap" tabindex="0" role="region" aria-label="公开模型评测成绩" :hidden="!rows.length">
    <table id="publicBenchmarkTable">
      <caption id="publicBenchmarkCaption">{{ selected ? `${selected.name} · ${selected.metric} · ${selected.scope}` : "公开模型评测" }}</caption>
      <!-- 行标题只放模型名与配置摘要（读屏在每格前朗读它）；适用套餐、评测说明单列一格。 -->
      <thead><tr><th scope="col">本协议名次</th><th scope="col">模型与配置</th><th scope="col">分数</th><th scope="col">评测每任务成本</th><th scope="col">适用套餐与说明</th><th scope="col">来源与核查</th></tr></thead>
      <tbody id="publicBenchmarkBody">
        <tr v-for="row in tableRows" :key="row.id">
          <td class="public-score-rank" data-label="本协议名次">{{ row.rank }}</td>
          <th scope="row">
            <strong>{{ row.name }}</strong>
            <span class="public-score-config">{{ row.configSummary }}</span>
          </th>
          <td class="public-score-value" data-label="分数">{{ row.scoreText }}<span class="public-score-uncertainty" :title="row.uncertainty || undefined">{{ row.uncertaintyLabel }}</span></td>
          <td class="public-score-cost" data-label="评测每任务成本">{{ row.costText }}</td>
          <td class="public-model-plans-cell" data-label="适用套餐与说明">
            <div v-if="row.plans.length" class="public-model-plans">可用套餐：<PlanLinks :plans="row.plans.slice(0, 3)" />
              <details v-if="row.plans.length > 3"><summary>另外 {{ row.plans.length - 3 }} 档</summary><PlanLinks :plans="row.plans.slice(3)" /></details>
            </div>
            <p v-else class="public-model-plans">在售套餐未明确列出此评测版本。</p>
            <p v-if="row.newer" class="public-model-plans">同系列较新的 {{ row.newer.family }} {{ row.newer.version }} 在 <PlanLinks :plans="row.newer.plans" section="table" /> 等官方套餐中，不是本评测版本，成绩不能直接套用。</p>
            <details class="public-score-more">
              <summary>配置与评测说明</summary>
              <p>来源模型 ID：<code>{{ row.model }}</code></p>
              <p>{{ row.configuration }}</p>
              <p v-if="row.uncertainty">区间 / 不确定性：{{ row.uncertainty }}</p>
              <p>{{ row.costNote || "评测每任务成本；来源未提供其他费用说明。未公布费用不能记作零，也不能换算为订阅月费。" }}</p>
            </details>
          </td>
          <td class="public-score-source" data-label="来源与核查"><SourceLink :url="row.sourceUrl" label="成绩来源" /><span class="public-score-config" :title="row.checkedAt">核查 {{ row.checkedDate }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="maintenance-toolbar">
    <button id="downloadPublicBenchmarkCsvBtn" type="button" class="chip" :disabled="!rows.length" @click="downloadCsv">下载当前榜 CSV</button>
    <button id="downloadPublicBenchmarkJsonBtn" type="button" class="chip" :disabled="!protocols.length" @click="downloadJson">下载全部评测 JSON</button>
  </div>
  <p id="publicBenchmarkFeedback" class="table-feedback" role="status" aria-live="polite">{{ feedback }}</p>
</template>
