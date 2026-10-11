import { reactive } from 'vue';
import { API_PRICES, findPlanReference, isPersonalMonthly, isPriceConfirmed, resolvedField } from './catalog';
import { computeMetrics, isFlagshipModelName, toCNY } from './metrics';
import type { CostScenarioResult, UsageCalculatorValues, UsageSummary, WorkloadApi, WorkloadResult, WorkloadState } from './service-types';
import { byId, escRe, fmtCNY, metricOfferOk, METRICS_ALL, navigateToSection, REGION_LABEL, restoreHistoryState } from './core';
import { appQueryString, calcState, metricsState, personalState, pickerState, rankState, syncUrl, tableState, updateAppState, validCalcValue } from './state';
import { renderPersonalChart, renderRankChart } from './charts';
import { chooseMain, eligibleProfiles, matchesTool, metricForRole, pickerPaymentQuote, pickerSummaryText, recommendablePlan } from './picker';
import { copyTextToClipboard, provenance, renderMetricsTable, renderTable } from './tables';

/* 分享、常用条件、完整权益与工作量计算；纯静态运行，不发送或上传用户输入。 */

export const PRESET_KEY = "cp-filter-preset-v1";
export const COST_CONTROLS = { model: "costModel", requests: "costRequests", tokens: "costTokens", days: "costDays", input: "costInput", cache: "costCache", cachePrice: "costCachePrice", budget: "costBudget" };
export const SERVICE_TOOL_LABELS: Record<string, string> = { any: "不限工具", claude: "Claude Code", codex: "Codex", cursor: "Cursor", own: "自家客户端" };
export const COST_PRESETS: Record<string, { requests: string; tokens: string; days: string }> = {
    light: { requests: "20", tokens: "5000", days: "20" },
    daily: { requests: "100", tokens: "20000", days: "22" },
    heavy: { requests: "300", tokens: "40000", days: "26" },
};
/* 示例情景只改变可见的计费假设；没有缓存单价时仍按普通输入价收费。 */
export const COST_SCENARIOS: Record<string, { label: string; input: string; cache: string }> = {
    conservative: { label: "保守", input: "60", cache: "50" },
    typical: { label: "典型", input: "80", cache: "95" },
    optimistic: { label: "乐观", input: "90", cache: "100" },
};
export function serviceFeedback(message: any) {
    serviceUiState.feedback = String(message);
}
export function readPreset() {
    try {
        const p = JSON.parse(localStorage.getItem(PRESET_KEY) || "null");
        return p && p.version === 1 && typeof p.query === "string" && p.query.length <= 16000 ? p : null;
    }
    catch (err) {
        return null;
    }
}
export function syncPresetButtons() {
    serviceUiState.presetSaved = !!readPreset();
}
export function syncServiceControls() {
    serviceViewHooks.renderCost?.();
    syncPickerScopeControls();
}
export function syncCostChips() {
    // Text, controls and accessible tables are rendered by Vue.
}
export function pickerScopeText() {
    const budget = pickerState.budget === "any" ? "不限预算" : pickerState.budget === "0" ? "免费" : "月均预算 ≤" + fmtCNY(Number(pickerState.budget));
    const billing = { M: "月付标价", A: "自动续费", Y: "年付折月" }[pickerState.billing] || "月付标价";
    return `${budget} · ${REGION_LABEL[pickerState.region] || "不限地区"} · ${SERVICE_TOOL_LABELS[pickerState.tool] || "不限工具"} · ${billing}`;
}
export function syncPickerScopeControls() {
    // Vue reads scope state, billing constraints and budget availability directly.
}
export function applyPickerScope(name: any) {
    const scopes = { personal: { state: personalState, render: renderPersonalChart }, metrics: { state: metricsState, render: renderMetricsTable }, table: { state: tableState, render: renderTable }, rank: { state: rankState, render: renderRankChart } };
    const scope = scopes[name];
    if (!scope)
        return;
    updateAppState(() => {
        scope.state.fromPicker = !scope.state.fromPicker;
        if (name === "table") {
            tableState.sortKey = tableState.fromPicker ? "selectedMonthly" : "priceM";
            tableState.sortDir = 1;
        }
    }, () => {
        scope.render();
        syncPickerScopeControls();
    });
}
export function costModelKey(text: any) { return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
/* 官方积分系数区间和 credits 面值不使用请求折算的 20K/次假设。 */
export function quotaUsesRequestTokenAssumption(m: any) {
    return !(m.creditCNY != null || m.creditUSD != null || (m.wkLowM != null && provenance(m).conf !== "低"));
}
export function setCostInputs(values: any) {
    Object.assign(calcState, values);
}
export function recommendedApi(main: any) {
    if (!main)
        return null;
    const role = pickerState.task === "daily" ? main.loose[0] : main.headline || main.loose[0];
    const metric = metricForRole(main.p, role);
    const models = resolvedField(main.p, "models");
    const exact = API_PRICES.filter((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => {
        if (!isPriceConfirmed(api, "api"))
            return false;
        if (metric && costModelKey(api.model) === costModelKey(metric.m.model))
            return true;
        if (!role || !role.re.test(api.model))
            return false;
        /* 没有逐模型额度也可按完整模型名匹配牌价；不把只有家族名称的记录推断成某一版本。 */
        const name = String(api.model).split(/[\s-]+/).map(escRe).join("[\\s-]*");
        return new RegExp("(^|[^\\w.-])" + name + "(?=$|[^\\w.-])", "i").test(models);
    });
    return exact.find((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => api.vendor === main.p.vendor) || exact.find((api: { vendor: string; model: string; label: string; region: string; cur: string; inUSD: number; outUSD: number; apiCache: number; note: string; url: string; inCNY?: undefined; outCNY?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; apiCache: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; } | { vendor: string; model: string; label: string; region: string; cur: string; inCNY: number; outCNY: number; note: string; url: string; inUSD?: undefined; outUSD?: undefined; apiCache?: undefined; }) => api.region === main.p.region) || exact[0] || null;
}
export function openWorkloadCalculator() {
    const main = chooseMain(eligibleProfiles()), api = recommendedApi(main);
    updateAppState(() => {
        if (pickerState.budget !== "any")
            setCostInputs({ budget: pickerState.budget });
        if (api && calcState.model !== api.vendor + "|" + api.model) {
            setCostInputs({ model: api.vendor + "|" + api.model, cachePrice: "" });
        }
    }, renderCostCalculator);
    const calculator = byId("costCalculator");
    if (calculator)
        calculator.setAttribute("open", "");
    serviceFeedback((pickerState.budget === "any" ? "选购预算不限，计算器保留你当前填写的月预算。" : "已带入当前月均预算。") +
        (api ? "已选择与推荐同名的 API 模型；缓存单价请按计费规则填写。" : "推荐模型没有可精确匹配的 API 报价，保留计算器当前模型；两者额度不能直接互相抵扣。"));
    navigateToSection("#s4");
}
/* 推荐摘要是纯文本，方便贴到聊天或文档；链接带上当前条件并回到「帮我选」。 */
export async function copyPickerSummary() {
    const query = appQueryString();
    const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + "#quick";
    const ok = await copyTextToClipboard(pickerSummaryText(url));
    serviceFeedback(ok ? "已复制推荐摘要，可直接粘贴到聊天或文档；价格以官网为准。" : "复制失败，请改用「复制当前方案链接」。");
}
export async function shareCurrentResults() {
    const query = appQueryString();
    const url = location.href.split(/[?#]/)[0] + (query ? "?" + query : "") + (location.hash || "");
    const ok = await copyTextToClipboard(url);
    serviceFeedback(ok ? "已复制当前方案链接，包含筛选、对比与费用计算条件。" : "复制失败，请从地址栏复制当前链接。");
}
export function savePreset() {
    const query = appQueryString();
    if (query.length > 16000) {
        serviceFeedback("筛选条件过长，请缩短搜索词后再保存。");
        return;
    }
    try {
        localStorage.setItem(PRESET_KEY, JSON.stringify({ version: 1, query }));
        syncPresetButtons();
        serviceFeedback("已在本机保存当前筛选、对比和计算条件。");
    }
    catch (err) {
        serviceFeedback("浏览器无法保存本地条件，仍可复制方案链接。");
    }
}
export function restorePreset() {
    const preset = readPreset();
    if (!preset) {
        syncPresetButtons();
        serviceFeedback("没有可恢复的条件，请先保存。");
        return;
    }
    const query = preset.query ? "?" + preset.query : "";
    try {
        history.pushState(null, "", location.pathname + query + (location.hash || ""));
    }
    catch (err) { /* 文件直开仍能在本页恢复条件。 */ }
    restoreHistoryState(query, false);
    syncUrl();
    serviceFeedback("已恢复常用条件。");
}
export function clearPreset() {
    try {
        /* 空值与删除等效，兼容受限存储和页面测试替身。 */
        localStorage.setItem(PRESET_KEY, "null");
        syncPresetButtons();
        serviceFeedback("已删除本机保存的条件。");
    }
    catch (err) {
        serviceFeedback("浏览器不允许修改本地保存的条件。");
    }
}
/* 官方缓存命中单价（与牌价同币种）：只读结构化的 apiCache，未录入时返回 null，不从备注猜测。 */
export function officialCachePrice(api?: WorkloadApi | null): number | null {
    return api && typeof api.apiCache === "number" && Number.isFinite(api.apiCache) ? api.apiCache : null;
}
/* 使用总tokens（输入+输出），缓存率只作用于输入。缓存价留空时采用官方缓存命中价；
   该模型未录入官方缓存价时按普通输入计费，不虚构折扣。缓存写入与存储费不在估算内。 */
export function calculateWorkload(state: WorkloadState, api?: WorkloadApi | null): WorkloadResult | null {
    if (!api || !Object.keys(COST_CONTROLS).every((key: string) => validCalcValue(key, state[key])))
        return null;
    const inputPrice = api.cur === "CNY" ? api.inCNY : api.inUSD;
    const outputPrice = api.cur === "CNY" ? api.outCNY : api.outUSD;
    const official = officialCachePrice(api);
    const cacheBasis = state.cachePrice !== "" ? "custom" : official != null ? "official" : "none";
    const cachePrice = cacheBasis === "custom" ? Number(state.cachePrice) : official ?? inputPrice;
    if (![inputPrice, outputPrice, cachePrice].every((v: any) => Number.isFinite(v) && v >= 0) || cachePrice > inputPrice)
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * cachePrice + (1 - cacheShare) * inputPrice) + (1 - inputShare) * outputPrice;
    const monthlyM = Number(state.requests) * Number(state.tokens) * Number(state.days) / 1e6;
    const costNative = monthlyM * blended, costCNY = toCNY(costNative, api.cur);
    const noCacheCNY = toCNY(monthlyM * (inputShare * inputPrice + (1 - inputShare) * outputPrice), api.cur);
    const monthlyBudgetM = blended > 0 ? Number(state.budget) / toCNY(blended, api.cur) : null;
    return { monthlyM, blended, costNative, costCNY, noCacheCNY, monthlyBudgetM, cachePrice, cacheBasis };
}
export function calculateCostScenarios(state: WorkloadState, api?: WorkloadApi | null): CostScenarioResult[] {
    return Object.entries(COST_SCENARIOS).map(([id, scenario]: [string, { label: string; input: string; cache: string; } | { label: string; input: string; cache: string; } | { label: string; input: string; cache: string; }]) => {
        const result = calculateWorkload({ ...state, input: scenario.input, cache: scenario.cache }, api);
        return result ? { id, ...scenario, ...result, lowCNY: result.costCNY * 0.8, highCNY: result.costCNY * 1.2 } : null;
    }).filter(Boolean);
}
/* 缓存单价输入框标明原币，并提示留空时采用的官方价，避免把人民币价填进美元模型。 */
export function syncCachePriceHint(api: any) {
    // The cache unit and placeholder follow the selected API model in Vue.
}
/* 计算器的小额（如每次请求）保留两位有效数字，避免把 ¥0.032 显示成 ¥0；常规金额沿用页面精度。 */
export function fmtCalcCNY(n: any) {
    if (!Number.isFinite(n))
        return "—";
    return n > 0 && n < 1 ? "¥" + Number(n.toPrecision(2)) : fmtCNY(n);
}
export function fmtCalcNative(n: any) { return n > 0 && n < 1 ? String(Number(n.toPrecision(2))) : String(Number(n.toFixed(2))); }
export function renderCostCalculator() {
    serviceViewHooks.renderCost?.();
}
export let planDetailsReturnFocus = null;
export let planDetailsBackground = [];
export function closePlanDetails() {
    serviceViewHooks.closeDetails?.();
}
export function finishPlanDetailsClose() {
    serviceViewHooks.finishDetails?.();
}
export function showPlanDetails(id: any, trigger: any = null) {
    serviceViewHooks.showDetails?.(String(id), trigger);
}
/* ---------- 按用量反查套餐与订阅回本点 ---------- */
/* 同模型按量单价（每百万 tokens，换算人民币）：使用当前输入占比与缓存命中率，与计算器同一口径。 */
export function metricApiCNYPerM(m: any, plan: any, state: any) {
    if (![m.apiIn, m.apiOut, m.apiCache].every((v: any) => typeof v === "number" && Number.isFinite(v)))
        return null;
    const inputShare = Number(state.input) / 100, cacheShare = Number(state.cache) / 100;
    const blended = inputShare * (cacheShare * m.apiCache + (1 - cacheShare) * m.apiIn) + (1 - inputShare) * m.apiOut;
    const value = toCNY(blended, m.apiCur || plan.cur);
    return Number.isFinite(value) && value > 0 ? value : null;
}
/* 参考月额度下限覆盖本月用量的套餐：只用官方或中置信折算（第三方与请求次数估算不作「够用」依据），
   沿用帮我选的地区、工具与付款方式，按月均价从低到高。每档只保留一行：优先能覆盖的主力模型。 */
export function usageCoverageRows(monthlyM: any, state: { model: string; requests: string; tokens: string; days: string; input: string; cache: string; cachePrice: string; budget: string; scenario: string; } = calcState) {
    const byPlan = new Map();
    for (const m of METRICS_ALL) {
        const p = m.ref != null ? findPlanReference(m.ref) : null;
        if (!p || !metricOfferOk(m) || !recommendablePlan(p) || !isPersonalMonthly(p))
            continue;
        if ((pickerState.region !== "all" && p.region !== pickerState.region) || !matchesTool(p, pickerState.tool))
            continue;
        const quote = pickerPaymentQuote(p);
        const c = computeMetrics(m), conf = provenance(m).conf;
        if (!quote.available || !c || c.moLow == null || !(conf === "高" || conf === "中") || c.moLow < monthlyM)
            continue;
        const row = { p, m, c, conf, quote, flagship: isFlagshipModelName(m.model) };
        const previous = byPlan.get(p.id);
        if (!previous || (row.flagship && !previous.flagship) || (row.flagship === previous.flagship && row.c.moLow > previous.c.moLow))
            byPlan.set(p.id, row);
    }
    return [...byPlan.values()].map((row: any) => {
        const apiPerM = metricApiCNYPerM(row.m, row.p, state);
        return { ...row, apiMonthlyCNY: apiPerM == null ? null : apiPerM * monthlyM, breakEvenM: apiPerM == null ? null : row.quote.monthlyCNY / apiPerM };
    }).sort((a: any, b: any) => a.quote.monthlyCNY - b.quote.monthlyCNY || b.c.moLow - a.c.moLow);
}
/* ---------- 从 ccusage 导入用量 ---------- */
export const USAGE_IMPORT_MAX = 5 * 1024 * 1024;
/* 兼容 ccusage 不同版本与子命令的 JSON：{daily:[…]}、{monthly:[…]}、{type, data:[…]}、{projects:{名称:[…]}}、直接数组。
   只读取 token 计数和日期 / 月份。Claude 记录的缓存读写与输入分开计；Codex 的缓存输入计在输入之内。 */
export function parseUsageExport(text: string): UsageSummary {
    if (String(text).length > USAGE_IMPORT_MAX)
        throw new Error("文件超过 5MB，请只导出最近的按日用量。");
    let json;
    try {
        json = JSON.parse(String(text));
    }
    catch (err) {
        throw new Error("不是有效的 JSON，请粘贴 ccusage 的 --json 输出。");
    }
    const rows = Array.isArray(json) ? json
        : !json || typeof json !== "object" ? []
            : Array.isArray(json.daily) ? json.daily
                : Array.isArray(json.monthly) ? json.monthly
                    : Array.isArray(json.data) ? json.data
                        : Array.isArray(json.sessions) ? json.sessions
                            : json.projects && typeof json.projects === "object" ? Object.values(json.projects).filter(Array.isArray).flat() : [];
    const count = (v: any) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
    const days = new Set(), months = new Set();
    for (const row of rows) {
        if (!row || typeof row !== "object")
            continue;
        const rowInput = count(row.inputTokens), rowOutput = count(row.outputTokens);
        const read = count(row.cacheReadTokens), write = count(row.cacheCreationTokens), cached = count(row.cachedInputTokens);
        /* Codex 的 cachedInputTokens 是输入的子集；Claude 的缓存读写不含在 inputTokens 里。 */
        const codexCached = !row.cacheReadTokens && cached > 0 && cached <= rowInput;
        input += codexCached ? rowInput : rowInput + read + write + (cached > rowInput ? cached : 0);
        cacheRead += codexCached ? cached : read + (cached > rowInput ? cached : 0);
        cacheWrite += write;
        output += rowOutput;
        const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date))
            days.add(date);
        const month = typeof row.month === "string" ? row.month.slice(0, 7) : "";
        if (/^\d{4}-\d{2}$/.test(month))
            months.add(month);
    }
    const total = input + output;
    if (!(total > 0))
        throw new Error("没有读到 token 用量；请确认粘贴的是 ccusage daily 或 monthly 的 --json 输出。");
    const sortedDays = [...days].sort();
    const spanDays = sortedDays.length ? Math.round((Date.parse(sortedDays[sortedDays.length - 1] + "T00:00:00Z") - Date.parse(sortedDays[0] + "T00:00:00Z")) / 86400000) + 1 : 0;
    return { input, output, cacheRead, cacheWrite, total, activeDays: days.size, spanDays, months: months.size,
        inputShare: input / total * 100, cacheRate: input > 0 ? cacheRead / input * 100 : 0 };
}
/* 把导入结果折成计算器的「每天请求数 × 每次 tokens × 每月天数」：保留当前请求数，只换算每次 tokens。
   按日记录用有用量的天数占比推算每月使用天数（不足一周的记录沿用当前天数）；按月记录取月均。 */
export function usageToCalculator(usage: UsageSummary, state: WorkloadState = calcState): UsageCalculatorValues {
    const round1 = (n: any) => String(Math.round(n * 10) / 10);
    let days = Math.max(1, Math.min(31, Number(state.days) || 22)), daily;
    if (usage.activeDays) {
        if (usage.spanDays >= 7)
            days = Math.max(1, Math.min(31, Math.round(usage.activeDays / usage.spanDays * 30.44)));
        daily = usage.total / usage.activeDays;
    }
    else
        daily = usage.total / Math.max(1, usage.months) / days;
    let requests = Math.max(1, Number(state.requests) || 100);
    if (daily / requests > 10000000)
        requests = Math.min(100000, Math.ceil(daily / 10000000));
    const tokens = Math.max(1, Math.min(10000000, Math.round(daily / requests)));
    return { requests: String(requests), tokens: String(tokens), days: String(days),
        input: round1(Math.min(100, usage.inputShare)), cache: round1(Math.min(100, usage.cacheRate)) };
}
export function importUsageText(text: any) { serviceViewHooks.importUsage?.(String(text)); }
export function bindUsageImport() {
    // Text, controls and accessible tables are rendered by Vue.
}
export function bindServiceEvents() {
    syncServiceControls(); syncPresetButtons();
}
export const serviceUiState = reactive({ feedback: '', presetSaved: false });
export const serviceViewHooks: { renderCost?: () => void; importUsage?: (text: string) => void; showDetails?: (id: string, trigger?: HTMLElement | null) => void; closeDetails?: () => void; finishDetails?: () => void } = {};
