import { PAYG_REFERENCES, METRICS_RAW, ESTIMATES } from '../generated/catalog';
import { reactive, shallowReactive } from 'vue';
import type { PersonalState, RankState, PickerState, TableState, CompareState, MetricsState, CalcState } from '../domain/view-types';
import { CALC_DEFAULT_MODEL } from '../domain/workload-settings';

export const PERSONAL_DEFAULT_LIMIT = 20;

export const SEARCH_MAX_LENGTH = 200;

export function boundedSearch(value: unknown) { return String(value ?? "").slice(0, SEARCH_MAX_LENGTH); }

export const CMP_MAX = 4;

export const personalState = reactive<PersonalState>({ cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker: false });

export const rankState = reactive<RankState>({ tier: "flagship", scope: "all", vendor: "all", fromPicker: false });

export const pickerState = reactive<PickerState>({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });

export const tableState = reactive<TableState>({ search: "", cat: "all", region: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });

/* 对比保存的是目录里的套餐对象，只追踪数组替换，不把套餐对象本身变成响应式代理。 */
export const cmpState = shallowReactive<CompareState>({ items: [] });

export const metricsState = reactive<MetricsState>({ model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });

export const calcState = reactive<CalcState>({ model: CALC_DEFAULT_MODEL, requests: "100", tokens: "20000", days: "22", input: "80", cache: "95", cachePrice: "", budget: "200", scenario: "typical" });

export const APP_DEFAULTS = { personal: { ...personalState }, rank: { ...rankState }, picker: { ...pickerState }, table: { ...tableState }, metrics: { ...metricsState }, calc: { ...calcState } };

/* 额度表模型筛选的合法取值（与额度表模型下拉的数据源一致），供 URL 白名单校验 */
export const MODEL_FILTER_VALUES = new Set([
    ...METRICS_RAW.map((m) => m.model),
    ...ESTIMATES.map((m) => m.model),
    ...PAYG_REFERENCES.map((s) => s.model),
]);
