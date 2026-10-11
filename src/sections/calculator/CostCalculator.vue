<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { API_PRICES, isPriceConfirmed, priceCheckOf } from "@generated/catalog";
import { currencySymbol, displayModelName, REGION_LABEL, safeLink } from "@domain/core";
import { fmtTok } from "@domain/metrics";
import { calculateCostScenarios, calculateWorkload, COST_PRESETS, COST_SCENARIOS, fmtCalcCNY, fmtCalcNative, officialCachePrice, parseUsageExport, USAGE_IMPORT_MAX, validCalcValue } from "@domain/workload";
import { APP_DEFAULTS, calcState, pickerState } from "@state/app";
import { updateAppState } from "@browser/url-state";
import { calculatorView, usageToCalculator } from "@app/calculator";
import { PICKER_TOOL_LABELS } from "@app/picker";
import { targetValue } from "@browser/dom";
import { COST_CONTROLS, costQuotaParagraphs } from "./cost-models";
import UsageCoverage from "./UsageCoverage.vue";
type CostKey = keyof typeof COST_CONTROLS;
const state = calcState, draft = reactive({ ...state });
const regionLabel = computed(() => REGION_LABEL[pickerState.region as keyof typeof REGION_LABEL] || "不限地区");
const fields: { key: Exclude<CostKey, "model" | "cachePrice">; label: string; min: number; max: number; step: string }[] = [
  { key: "requests", label: "每天请求数", min: 0, max: 100000, step: "1" },
  { key: "tokens", label: "每次总 tokens", min: 1, max: 10000000, step: "1" },
  { key: "days", label: "每月使用天数", min: 1, max: 31, step: "1" },
  { key: "input", label: "输入占比（%）", min: 0, max: 100, step: "any" },
  { key: "cache", label: "输入缓存命中率（%）", min: 0, max: 100, step: "any" },
  { key: "budget", label: "月预算（人民币）", min: 0, max: 1000000000, step: "any" },
];
const presets = [["light", "轻度使用"], ["daily", "日常开发"], ["heavy", "高强度使用"]];
const models = computed(() => API_PRICES.filter((api) => isPriceConfirmed(api, "api")));
const selected = computed(() => models.value.find((api) => api.vendor + "|" + api.model === draft.model));
const officialCache = computed(() => officialCachePrice(selected.value));
const valid = computed(() => Object.keys(COST_CONTROLS).every((key) => validCalcValue(key, draft[key as CostKey])));
const result = computed(() => valid.value ? calculateWorkload(draft, selected.value) : null);
const quota = computed(() => selected.value && result.value ? costQuotaParagraphs(selected.value, result.value.monthlyM) : []);
const scenarios = computed(() => selected.value && result.value ? calculateCostScenarios(draft, selected.value) : []);
const cacheText = computed(() => {
  if (!result.value || !selected.value) return "";
  const r = result.value, noCache = "无缓存时约 " + fmtCalcCNY(r.noCacheCNY) + "/月。";
  return r.cacheBasis === "official" ? `缓存命中按官方单价 ${currencySymbol(selected.value.cur)}${r.cachePrice}/1M 计费（不含缓存写入或存储费），${noCache}可在输入框改填。`
    : r.cacheBasis === "custom" ? "缓存命中按所填单价计费，" + noCache
    : "该模型未录入官方缓存单价，缓存命中率暂不生效，按普通输入价估算；填写官网缓存价后可计算节省。";
});
watch(() => ({ ...state }), (current, previous) => {
  for (const key of Object.keys(current) as (keyof typeof state)[]) {
    if (current[key] !== previous[key]) draft[key] = current[key];
  }
});
function syncDraft() { Object.assign(draft, state); }
onMounted(() => { calculatorView.render = syncDraft; calculatorView.importUsage = importUsage; });
onBeforeUnmount(() => { calculatorView.render = undefined; calculatorView.importUsage = undefined; });
function syncScenario() {
  const match = Object.entries(COST_SCENARIOS).find(([, scenario]) => scenario.input === state.input && scenario.cache === state.cache);
  state.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
}
function input(key: CostKey, value: string) {
  draft[key] = value;
  if (!validCalcValue(key, value)) return;
  updateAppState(() => {
    state[key] = value;
    if (key === "model") state.cachePrice = draft.cachePrice = "";
    if (key === "input" || key === "cache") syncScenario();
  });
}
function choosePreset(id: string) { updateAppState(() => { Object.assign(state, COST_PRESETS[id]); Object.assign(draft, COST_PRESETS[id]); }); }
function chooseScenario(id: string) {
  const scenario = COST_SCENARIOS[id];
  const values = { input: scenario.input, cache: scenario.cache, scenario: id };
  updateAppState(() => { Object.assign(state, values); Object.assign(draft, values); });
}
function presetActive(id: string) { return Object.entries(COST_PRESETS[id]).every(([key, value]) => draft[key as CostKey] === value); }
function scenarioActive(id: string) { const scenario = COST_SCENARIOS[id]; return state.scenario === id && draft.input === scenario.input && draft.cache === scenario.cache; }
function reset() { updateAppState(() => { Object.assign(state, APP_DEFAULTS.calc); syncDraft(); }); }
const usageText = ref(""), usageFeedback = ref("");
function importUsage(text: string) {
  try {
    const usage = parseUsageExport(text), values = usageToCalculator(usage);
    updateAppState(() => { Object.assign(state, values); Object.assign(draft, values); syncScenario(); });
    const period = usage.activeDays ? `${usage.activeDays} 个有用量的日子` : usage.months ? `${usage.months} 个月` : "导入的记录";
    usageFeedback.value = `已导入 ${period}：共 ${fmtTok(usage.total / 1e6)} tokens，输入占比 ${values.input}%，缓存命中 ${values.cache}%`
      + (usage.cacheWrite ? `（另有缓存写入 ${fmtTok(usage.cacheWrite / 1e6)}，计入输入、未单独计价）` : "")
      + `。已换算为每天 ${values.requests} 次 × ${values.tokens} tokens × ${values.days} 天。`;
  } catch (error) { usageFeedback.value = error instanceof Error ? error.message : String(error); }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > USAGE_IMPORT_MAX) { usageFeedback.value = "文件超过 5MB，请只导出最近的按日用量。"; return; }
  try { const text = await file.text(); usageText.value = text.slice(0, 20000); importUsage(text); }
  catch { usageFeedback.value = "无法读取这个文件，请改为粘贴 JSON。"; }
}
</script>
<template>
  <details class="method-box cost-calculator" id="costCalculator">
    <summary>按我的工作量计算 API 月费与套餐用量</summary>
    <p>填写每天的请求数和每次总 tokens，比较所选模型的按量费用与月预算。计算包括输入、输出和已知缓存单价；长上下文档位、工具费及税费仍按官网规则另计。</p>
    <details class="usage-import" id="usageImport">
      <summary>从 ccusage 导入真实用量（可选）</summary>
      <p class="maintenance-meta">在终端运行 <code>npx ccusage@latest daily --json</code>（Codex 用 <code>npx @ccusage/codex@latest daily --json</code>），把输出粘贴到下面或选择保存的 JSON 文件。只读取 token 计数和日期，数据在本页解析，不会上传。</p>
      <label class="usage-import-field">ccusage JSON<textarea id="usageImportText" rows="5" spellcheck="false" placeholder='{"daily":[{"date":"2026-10-01","inputTokens":…}]}' v-model="usageText"></textarea></label>
      <div class="service-actions"><label class="chip usage-import-file">选择 JSON 文件<input type="file" id="usageImportFile" accept=".json,application/json" @change="importFile"></label><button type="button" class="chip" id="usageImportBtn" @click="importUsage(usageText)">导入并计算</button></div>
      <p id="usageImportFeedback" class="table-feedback" role="status" aria-live="polite">{{ usageFeedback }}</p>
    </details>
    <div class="service-actions" id="costPresets" role="group" aria-label="工作量预设"><button v-for="[id, label] in presets" :key="id" type="button" class="chip" :class="{ active: presetActive(id) }" :data-cost-preset="id" :aria-pressed="presetActive(id)" @click.stop="choosePreset(id)">{{ label }}</button></div>
    <div class="service-actions" id="costScenarios" role="group" aria-label="费用情景"><button v-for="(scenario, id) in COST_SCENARIOS" :key="id" type="button" class="chip" :class="{ active: scenarioActive(id) }" :data-cost-scenario="id" :aria-pressed="scenarioActive(id)" @click.stop="chooseScenario(id)">{{ scenario.label }}情景</button></div>
    <form id="costForm" class="cost-form" @submit.prevent>
      <label class="cost-model">API 模型<select id="costModel" class="select" :value="draft.model" @change="input('model', targetValue($event))"><option v-for="api in models" :key="api.vendor + api.model" :value="api.vendor + '|' + api.model">{{ api.vendor }} · {{ displayModelName(api.label || api.model) }}</option></select></label>
      <label v-for="field in fields.slice(0, 5)" :key="field.key">{{ field.label }}<input :id="COST_CONTROLS[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step" :value="draft[field.key]" @input="input(field.key, targetValue($event))"></label>
      <label>缓存命中单价（<span id="costCacheUnit">{{ selected?.cur === 'CNY' ? "人民币" : selected?.cur === 'USD' ? "美元" : selected?.cur || "原币" }}</span> / 1M，选填）<input id="costCachePrice" type="number" min="0" max="1000000" step="any" :value="draft.cachePrice" :placeholder="officialCache != null && selected ? `留空采用官方 ${currencySymbol(selected.cur)}${officialCache}` : '未录入官方价，留空按普通输入价'" @input="input('cachePrice', targetValue($event))"></label>
      <label>月预算（人民币）<input id="costBudget" type="number" min="0" max="1000000000" step="any" :value="draft.budget" @input="input('budget', targetValue($event))"></label>
      <button type="button" class="chip" id="costResetBtn" @click="reset">恢复计算默认值</button>
    </form>
    <div id="costResult" class="cost-result" role="status" aria-live="polite" aria-atomic="true">
      <template v-if="result && selected">
        <p><strong>预计月费 {{ currencySymbol(selected.cur) + fmtCalcNative(result.costNative) }} ≈ {{ fmtCalcCNY(result.costCNY) }}</strong> · {{ fmtTok(result.monthlyM) }} 总 tokens/月</p>
        <p>{{ result.monthlyBudgetM == null ? "当前单价为零，预算不构成token上限" : `预算可覆盖约 ${fmtTok(result.monthlyBudgetM)} 总 tokens/月` }}。{{ result.costCNY > Number(draft.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。" }}</p><p>{{ cacheText }}</p>
        <p>按 {{ draft.days }} 个工作日、每天 {{ draft.requests }} 次请求，每个工作日约 {{ fmtCalcCNY(result.costCNY / Number(draft.days)) }}<template v-if="Number(draft.requests) > 0">，每次约 {{ fmtCalcCNY(result.costCNY / Number(draft.days) / Number(draft.requests)) }}</template>。{{ result.costCNY <= Number(draft.budget) ? `月预算剩余约 ${fmtCalcCNY(Number(draft.budget) - result.costCNY)}` : `月预算需补约 ${fmtCalcCNY(result.costCNY - Number(draft.budget))}` }}。</p>
        <p>工具与地区沿用「帮我选」：{{ PICKER_TOOL_LABELS[pickerState.tool] || "不限工具" }} · {{ regionLabel }}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>
        <p>上方费用按当前输入 {{ draft.input }}% / 输出 {{ 100 - Number(draft.input) }}%、输入缓存命中 {{ draft.cache }}% 计算。工作量上下浮动 20% 时约 {{ fmtCalcCNY(result.costCNY * 0.8) }}–{{ fmtCalcCNY(result.costCNY * 1.2) }}/月。</p>
        <div class="cost-scenario-results"><table class="mini-table"><caption>三种示例计费情景（总工作量上下浮动 20%）</caption><thead><tr><th scope="col">情景与假设</th><th scope="col">基准月费</th><th scope="col">月费范围</th></tr></thead><tbody><tr v-for="scenario in scenarios" :key="scenario.id" :data-cost-scenario-result="scenario.id"><th scope="row">{{ scenario.label }}：输入 {{ scenario.input }}% / 输出 {{ 100 - Number(scenario.input) }}%，输入缓存 {{ scenario.cache }}%</th><td>{{ fmtCalcCNY(scenario.costCNY) }}</td><td>{{ fmtCalcCNY(scenario.lowCNY) }}–{{ fmtCalcCNY(scenario.highCNY) }}</td></tr></tbody></table></div>
        <p>轻度、日常、重度及三种情景都是可编辑的示例假设，不代表真实用户用量，也不是费用预测或套餐额度承诺。典型沿用页面的 80% 输入 / 95% 缓存基准；三个情景使用同一缓存单价，未填写且未录入官方缓存价时按普通输入价计费。范围只模拟总工作量 ±20%，不包含价格变动、动态限流、工具费和税费。牌价核查 {{ priceCheckOf(selected, 'api')?.checkedAt || "未核实" }} · <a :href="safeLink(selected.url)" target="_blank" rel="noopener">官网计费规则</a></p>
        <p v-for="paragraph in quota" :key="paragraph">{{ paragraph }}</p><UsageCoverage :monthly-m="result.monthlyM" />
      </template>
      <template v-else>{{ valid ? "请输入有效的工作量和预算；缓存单价不能高于普通输入单价。" : "请输入输入框范围内的有效数字。" }}</template>
    </div>
  </details>
</template>
