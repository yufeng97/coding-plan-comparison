<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from "vue";
import { API_PRICES, isPriceConfirmed, priceCheckOf } from "@generated/catalog";
import { currencySymbol, displayModelName, REGION_LABEL, safeLink } from "@domain/core";
import { fmtTok } from "@domain/metrics";
import { apiForUsageModel, CALC_LIMITS, calculateCostScenarios, calculateWorkload, COST_PRESETS, COST_SCENARIOS, fmtCalcCNY, fmtCalcNative, officialCachePrice, outputSharePct, USAGE_IMPORT_MAX, USAGE_IMPORT_TOO_LARGE, validCalcValue } from "@domain/workload";
import type { UsageSummary } from "@domain/usage-import";
import { APP_DEFAULTS, calcState, calcUiState, pickerState } from "@state/app";
import { updateAppState } from "@browser/url-state";
import { parseUsageInBackground } from "@browser/usage-parser";
import { calculatorView, usageToCalculator } from "@app/calculator";
import { PICKER_TOOL_LABELS } from "@app/picker";
import { targetValue } from "@browser/dom";
import { COST_CONTROLS, costQuotaParagraphs } from "./cost-models";
import UsageCoverage from "./UsageCoverage.vue";
type CostKey = keyof typeof COST_CONTROLS;
type NumberKey = Exclude<CostKey, "model">;
const state = calcState, draft = reactive({ ...state });
const usageText = ref(""), usageFeedback = ref("");
let importRun = 0;
/* 文件读取和后台解析共用同一序号；更新条件、重置或卸载后，旧导入不能再覆盖当前输入。 */
function cancelUsageImport() { importRun++; usageFeedback.value = ""; }
const regionLabel = computed(() => REGION_LABEL[pickerState.region as keyof typeof REGION_LABEL] || "不限地区");
/* 字段范围只来自 CALC_LIMITS（URL 校验同一份）；整数字段步长为 1。缓存单价单独渲染，因为标签与占位要写明币种。 */
const field = (key: NumberKey, label: string) => {
  const [min, max, integer] = CALC_LIMITS[key];
  return { key, label, min, max, integer, step: integer ? "1" : "any" };
};
const workloadFields = [field("requests", "每天请求数"), field("tokens", "每次总 tokens"), field("days", "每月使用天数"), field("input", "输入占比（%）"), field("cache", "输入缓存命中率（%）")];
const cacheField = field("cachePrice", "缓存命中单价");
const budgetField = field("budget", "月预算（人民币）");
const numberFields = [...workloadFields, cacheField, budgetField];
const presets = [["light", "轻度使用"], ["daily", "日常开发"], ["heavy", "高强度使用"]];
const models = computed(() => API_PRICES.filter((api) => isPriceConfirmed(api, "api")));
const selected = computed(() => models.value.find((api) => api.vendor + "|" + api.model === draft.model));
const officialCache = computed(() => officialCachePrice(selected.value));
const invalidKeys = computed(() => new Set(numberFields.filter((item) => !validCalcValue(item.key, draft[item.key])).map((item) => item.key)));
const valid = computed(() => invalidKeys.value.size === 0 && validCalcValue("model", draft.model));
const result = computed(() => valid.value ? calculateWorkload(draft, selected.value) : null);
/* 数字都合法但算不出结果，只剩一种情况：所填缓存单价高于普通输入单价。 */
const inputPrice = computed(() => selected.value ? (selected.value.cur === "CNY" ? selected.value.inCNY : selected.value.inUSD) : null);
const cacheTooHigh = computed(() => valid.value && !result.value && draft.cachePrice !== "" && inputPrice.value != null && Number(draft.cachePrice) > inputPrice.value);
const invalid = (key: NumberKey) => invalidKeys.value.has(key) || (key === "cachePrice" && cacheTooHigh.value);
const rangeText = (item: (typeof numberFields)[number]) => `${item.label}（${item.min}–${item.max}${item.integer ? " 的整数" : ""}）`;
const errorText = computed(() => {
  if (cacheTooHigh.value && selected.value) return `缓存命中单价不能高于普通输入单价 ${currencySymbol(selected.value.cur)}${inputPrice.value}/1M，请改小或留空。`;
  const wrong = numberFields.filter((item) => invalidKeys.value.has(item.key));
  return wrong.length ? `请输入有效数字：${wrong.map(rangeText).join("、")}。` : "请选择 API 模型并输入有效的工作量和预算。";
});
const quota = computed(() => selected.value && result.value ? costQuotaParagraphs(selected.value, result.value.monthlyM) : []);
const scenarios = computed(() => selected.value && result.value ? calculateCostScenarios(draft, selected.value) : []);
const cacheText = computed(() => {
  if (!result.value || !selected.value) return "";
  const r = result.value, noCache = "无缓存时约 " + fmtCalcCNY(r.noCacheCNY) + "/月。";
  return r.cacheBasis === "official" ? `缓存命中按官方单价 ${currencySymbol(selected.value.cur)}${r.cachePrice}/1M 计费（不含缓存写入或存储费），${noCache}可在输入框改填。`
    : r.cacheBasis === "custom" ? "缓存命中按所填单价计费，" + noCache
    : "该模型未录入官方缓存单价，缓存命中率暂不生效，按普通输入价估算；填写官网缓存价后可计算节省。";
});
/* 读屏只播报一句结论；完整明细在下方，不随每次按键整段朗读。 */
const liveSummary = computed(() => result.value && selected.value
  ? `预计月费约 ${fmtCalcCNY(result.value.costCNY)}，${result.value.costCNY > Number(draft.budget) ? "超出月预算" : "在月预算内"}。`
  : errorText.value);
watch(() => ({ ...state }), (current, previous) => {
  for (const key of Object.keys(current) as (keyof typeof state)[]) {
    if (current[key] !== previous[key]) draft[key] = current[key];
  }
});
function syncDraft() { cancelUsageImport(); Object.assign(draft, state); }
onMounted(() => { calculatorView.render = syncDraft; });
onBeforeUnmount(() => { cancelUsageImport(); calculatorView.render = undefined; });
function syncScenario() {
  const match = Object.entries(COST_SCENARIOS).find(([, scenario]) => scenario.input === state.input && scenario.cache === state.cache);
  state.scenario = match ? match[0] : APP_DEFAULTS.calc.scenario;
}
function input(key: CostKey, value: string) {
  cancelUsageImport();
  draft[key] = value;
  /* 用户开始改数后，「按我的用量核对」带入时的说明不再适用。 */
  calcUiState.feedback = "";
  if (!validCalcValue(key, value)) return;
  updateAppState(() => {
    state[key] = value;
    if (key === "model") state.cachePrice = draft.cachePrice = "";
    if (key === "input" || key === "cache") syncScenario();
  });
}
function choosePreset(id: string) { cancelUsageImport(); updateAppState(() => { Object.assign(state, COST_PRESETS[id]); Object.assign(draft, COST_PRESETS[id]); }); }
function chooseScenario(id: string) {
  cancelUsageImport();
  const scenario = COST_SCENARIOS[id];
  const values = { input: scenario.input, cache: scenario.cache, scenario: id };
  updateAppState(() => { Object.assign(state, values); Object.assign(draft, values); });
}
function presetActive(id: string) { return Object.entries(COST_PRESETS[id]).every(([key, value]) => draft[key as CostKey] === value); }
function scenarioActive(id: string) { const scenario = COST_SCENARIOS[id]; return state.scenario === id && draft.input === scenario.input && draft.cache === scenario.cache; }
function reset() { calcUiState.feedback = ""; updateAppState(() => { Object.assign(state, APP_DEFAULTS.calc); syncDraft(); }); }
function applyUsage(usage: UsageSummary) {
  const values = usageToCalculator(usage);
  /* 主要模型占七成以上才换成对应的 API 牌价；混用多个模型时保留计算器当前模型。 */
  const api = usage.modelShare >= 0.7 ? apiForUsageModel(usage.model, state.model) : null;
  const model = api ? api.vendor + "|" + api.model : "";
  updateAppState(() => {
    Object.assign(state, values); Object.assign(draft, values);
    if (model && state.model !== model) {
      Object.assign(state, { model, cachePrice: "" });
      Object.assign(draft, { model, cachePrice: "" });
    }
    syncScenario();
  });
  const period = usage.activeDays ? `${usage.activeDays} 个有用量的日子` : usage.months ? `${usage.months} 个月` : "导入的记录";
  const modelNote = !usage.model ? ""
    : api ? `主要模型 ${usage.model} 已对应 ${api.vendor} · ${displayModelName(api.label || api.model)} 的 API 牌价。`
    : usage.modelShare >= 0.7 ? `主要模型 ${usage.model} 没有精确匹配的 API 牌价，保留计算器当前模型。`
    : "记录里混用了多个模型，保留计算器当前模型。";
  usageFeedback.value = `已导入 ${period}：共 ${fmtTok(usage.total / 1e6)} tokens，输入占比 ${values.input}%，缓存命中 ${values.cache}%`
    + (usage.cacheWrite ? `（另有缓存写入 ${fmtTok(usage.cacheWrite / 1e6)}，计入输入、未单独计价）` : "")
    + `。已换算为每天 ${values.requests} 次 × ${values.tokens} tokens × ${values.days} 天。` + modelNote;
}
/* 大文件在 Worker 里解析，期间显示进度；较早的导入结果在新导入开始后丢弃。 */
async function importUsage(texts: string | string[], run = ++importRun) {
  if (run !== importRun) return;
  const list = typeof texts === "string" ? [texts] : texts;
  if (list.reduce((sum, text) => sum + text.length, 0) > 256 * 1024) usageFeedback.value = `正在解析 ${list.length} 份记录…`;
  let usage: UsageSummary;
  try { usage = await parseUsageInBackground(list); }
  catch (error) {
    if (run === importRun) usageFeedback.value = error instanceof Error ? error.message : String(error);
    return;
  }
  if (run === importRun) applyUsage(usage);
}
/* 文件与文件夹两种入口共用：文件夹里只读 .json / .jsonl（Claude Code 按项目、Codex 按日期分子目录保存日志）。 */
async function importFile(event: Event) {
  const run = ++importRun;
  const picker = event.target as HTMLInputElement;
  /* 文件选择框已按 accept 过滤；选整个文件夹时会带上其他文件，只保留 JSON / JSONL。 */
  const fromFolder = picker.hasAttribute("webkitdirectory");
  const chosen = Array.from(picker.files ?? []).filter((file) => !fromFolder || /\.jsonl?$/i.test(file.name || ""));
  /* 清空选择，同一个文件修改后再次选择也能触发导入。 */
  picker.value = "";
  if (!chosen.length) { usageFeedback.value = "所选位置没有 .json 或 .jsonl 文件。"; return; }
  if (chosen.reduce((n, file) => n + file.size, 0) > USAGE_IMPORT_MAX) { usageFeedback.value = USAGE_IMPORT_TOO_LARGE; return; }
  usageFeedback.value = `正在读取 ${chosen.length} 份记录…`;
  /* 多份日志合并统计；文本框只回显能完整放下的内容，避免再次点击时导入截断的数据。 */
  let contents: string[];
  try { contents = await Promise.all(chosen.map((file) => file.text())); }
  catch { if (run === importRun) usageFeedback.value = "无法读取这个文件，请改为粘贴内容。"; return; }
  if (run !== importRun) return;
  usageText.value = contents.length === 1 && contents[0]!.length <= 20000 ? contents[0]! : "";
  await importUsage(contents, run);
}
</script>
<template>
  <details class="method-box cost-calculator" id="costCalculator">
    <summary>按我的工作量计算 API 月费与套餐用量</summary>
    <p>填写每天的请求数和每次总 tokens，比较所选模型的按量费用与月预算。计算包括输入、输出和已知缓存单价；长上下文档位、工具费及税费仍按官网规则另计。</p>
    <p id="costFeedback" class="table-feedback" role="status" aria-live="polite">{{ calcUiState.feedback }}</p>
    <details class="usage-import" id="usageImport">
      <summary>从 ccusage 或会话日志导入真实用量（可选）</summary>
      <p class="maintenance-meta">在终端运行 <code>npx ccusage@latest daily --json</code>（Codex 用 <code>npx @ccusage/codex@latest daily --json</code>），把输出粘贴到下面或选择保存的 JSON 文件；也可以直接选择 Claude Code（<code>~/.claude/projects</code>）或 Codex（<code>~/.codex/sessions</code>）的 <code>.jsonl</code> 会话日志，可多选，或整个选择日志文件夹。只读取 token 计数、日期和模型名，数据在本页解析，不会上传。</p>
      <label class="usage-import-field">ccusage JSON 或会话日志<textarea id="usageImportText" rows="5" spellcheck="false" placeholder='{"daily":[{"date":"2026-10-01","inputTokens":…}]}' v-model="usageText" @input="cancelUsageImport"></textarea></label>
      <div class="service-actions">
        <label class="chip usage-import-file">选择文件（可多选）<input type="file" id="usageImportFile" accept=".json,.jsonl,application/json" multiple @change="importFile"></label>
        <label class="chip usage-import-file">选择日志文件夹<input type="file" id="usageImportFolder" webkitdirectory multiple @change="importFile"></label>
        <button type="button" class="chip" id="usageImportBtn" @click="importUsage(usageText)">导入并计算</button>
      </div>
      <p id="usageImportFeedback" class="table-feedback" role="status" aria-live="polite">{{ usageFeedback }}</p>
    </details>
    <div class="service-actions" id="costPresets" role="group" aria-label="工作量预设"><button v-for="[id, label] in presets" :key="id" type="button" class="chip" :class="{ active: presetActive(id) }" :data-cost-preset="id" :aria-pressed="presetActive(id)" @click.stop="choosePreset(id)">{{ label }}</button></div>
    <div class="service-actions" id="costScenarios" role="group" aria-label="费用情景"><button v-for="(scenario, id) in COST_SCENARIOS" :key="id" type="button" class="chip" :class="{ active: scenarioActive(id) }" :data-cost-scenario="id" :aria-pressed="scenarioActive(id)" @click.stop="chooseScenario(id)">{{ scenario.label }}情景</button></div>
    <form id="costForm" class="cost-form" @submit.prevent>
      <label class="cost-model">API 模型<select id="costModel" class="select" :value="draft.model" @change="input('model', targetValue($event))"><option v-for="api in models" :key="api.vendor + api.model" :value="api.vendor + '|' + api.model">{{ api.vendor }} · {{ displayModelName(api.label || api.model) }}</option></select></label>
      <label v-for="item in workloadFields" :key="item.key">{{ item.label }}<input :id="COST_CONTROLS[item.key]" type="number" :min="item.min" :max="item.max" :step="item.step" :value="draft[item.key]" :aria-invalid="invalid(item.key) ? 'true' : undefined" @input="input(item.key, targetValue($event))"></label>
      <label>{{ cacheField.label }}（<span id="costCacheUnit">{{ selected?.cur === 'CNY' ? "人民币" : selected?.cur === 'USD' ? "美元" : selected?.cur || "原币" }}</span> / 1M，选填）<input :id="COST_CONTROLS.cachePrice" type="number" :min="cacheField.min" :max="cacheField.max" :step="cacheField.step" :value="draft.cachePrice" :aria-invalid="invalid('cachePrice') ? 'true' : undefined" :placeholder="officialCache != null && selected ? `留空采用官方 ${currencySymbol(selected.cur)}${officialCache}` : '未录入官方价，留空按普通输入价'" @input="input('cachePrice', targetValue($event))"></label>
      <label>{{ budgetField.label }}<input :id="COST_CONTROLS.budget" type="number" :min="budgetField.min" :max="budgetField.max" :step="budgetField.step" :value="draft.budget" :aria-invalid="invalid('budget') ? 'true' : undefined" @input="input('budget', targetValue($event))"></label>
      <button type="button" class="chip" id="costResetBtn" @click="reset">恢复计算默认值</button>
    </form>
    <p id="costSummaryLive" class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveSummary }}</p>
    <div id="costResult" class="cost-result">
      <template v-if="result && selected">
        <p><strong>预计月费 {{ currencySymbol(selected.cur) + fmtCalcNative(result.costNative) }} ≈ {{ fmtCalcCNY(result.costCNY) }}</strong> · {{ fmtTok(result.monthlyM) }} 总 tokens/月</p>
        <p>{{ result.monthlyBudgetM == null ? "当前单价为零，预算不构成token上限" : `预算可覆盖约 ${fmtTok(result.monthlyBudgetM)} 总 tokens/月` }}。{{ result.costCNY > Number(draft.budget) ? "当前工作量超出月预算。" : "当前工作量在月预算内。" }}</p>
        <p>{{ cacheText }}</p>
        <p>按每月 {{ draft.days }} 个使用日、每天 {{ draft.requests }} 次请求，每个使用日约 {{ fmtCalcCNY(result.costCNY / Number(draft.days)) }}<template v-if="Number(draft.requests) > 0">，每次约 {{ fmtCalcCNY(result.costCNY / Number(draft.days) / Number(draft.requests)) }}</template>。{{ result.costCNY <= Number(draft.budget) ? `月预算剩余约 ${fmtCalcCNY(Number(draft.budget) - result.costCNY)}` : `月预算需补约 ${fmtCalcCNY(result.costCNY - Number(draft.budget))}` }}。</p>
        <p>工具与地区沿用「帮我选」：{{ PICKER_TOOL_LABELS[pickerState.tool] || "不限工具" }} · {{ regionLabel }}。这里估算所选模型的 API 推理账单，工具订阅、税费和支付手续费需另行核对；套餐内额度不能直接抵扣 API 账单。</p>
        <p>上方费用按当前输入 {{ draft.input }}% / 输出 {{ outputSharePct(draft.input) }}%、输入缓存命中 {{ draft.cache }}% 计算。工作量上下浮动 20% 时约 {{ fmtCalcCNY(result.costCNY * 0.8) }}–{{ fmtCalcCNY(result.costCNY * 1.2) }}/月。</p>
        <div class="cost-scenario-results">
          <table class="mini-table">
            <caption>三种示例计费情景（总工作量上下浮动 20%）</caption>
            <thead><tr><th scope="col">情景与假设</th><th scope="col">基准月费</th><th scope="col">月费范围</th></tr></thead>
            <tbody>
              <tr v-for="scenario in scenarios" :key="scenario.id" :data-cost-scenario-result="scenario.id">
                <th scope="row">{{ scenario.label }}：输入 {{ scenario.input }}% / 输出 {{ outputSharePct(scenario.input) }}%，输入缓存 {{ scenario.cache }}%</th>
                <td>{{ fmtCalcCNY(scenario.costCNY) }}</td>
                <td>{{ fmtCalcCNY(scenario.lowCNY) }}–{{ fmtCalcCNY(scenario.highCNY) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>轻度、日常、重度及三种情景都是可编辑的示例假设，不代表真实用户用量，也不是费用预测或套餐额度承诺。典型沿用页面的 80% 输入 / 95% 缓存基准；三个情景使用同一缓存单价，未填写且未录入官方缓存价时按普通输入价计费。范围只模拟总工作量 ±20%，不包含价格变动、动态限流、工具费和税费。牌价核查 {{ priceCheckOf(selected, 'api')?.checkedAt || "未核实" }} · <a :href="safeLink(selected.url)" target="_blank" rel="noopener">官网计费规则</a></p>
        <p v-for="paragraph in quota" :key="paragraph">{{ paragraph }}</p>
        <UsageCoverage :monthly-m="result.monthlyM" />
      </template>
      <p v-else class="cost-error">{{ errorText }}</p>
    </div>
  </details>
</template>
