import { PAYG_REFERENCES, METRICS_RAW, ESTIMATES } from '../generated/catalog';
import { reactive, shallowReactive } from 'vue';
import type { PickerCriteria } from '../domain/picker/rules';
import { CALC_DEFAULT_MODEL, type CalcState } from '../domain/workload';

/* 各区块的可分享筛选状态。取值都是经 URL_VALID 白名单校验的字符串，与表单控件直接绑定。 */
export interface PersonalState { cat: string; region: string; billing: string; q: string; limit: number | null; fromPicker: boolean; }
export interface RankState { tier: string; scope: string; vendor: string; fromPicker: boolean; }
export type PickerState = PickerCriteria;
export interface TableState { search: string; cat: string; region: string; vendor: string; sortKey: string; sortDir: number; fromPicker: boolean; extra: boolean; }
export interface MetricsState { model: string; ver: string; tier: string; offer: string; sortKey: string; sortDir: number; fromPicker: boolean; }
export interface CompareState { items: Plan[]; }
export type ThemeMode = "dark" | "light" | "system";

export const PERSONAL_DEFAULT_LIMIT = 20;

export const SEARCH_MAX_LENGTH = 200;

export function boundedSearch(value: unknown) { return String(value ?? "").slice(0, SEARCH_MAX_LENGTH); }

export const CMP_MAX = 4;

export const personalState = reactive<PersonalState>({ cat: "all", region: "all", billing: "M", q: "", limit: PERSONAL_DEFAULT_LIMIT, fromPicker: false });

export const rankState = reactive<RankState>({ tier: "flagship", scope: "all", vendor: "all", fromPicker: false });

export const pickerState = reactive<PickerState>({ budget: "200", region: "cn", tool: "any", task: "both", billing: "M", priority: "quota" });

export const tableState = reactive<TableState>({ search: "", cat: "all", region: "all", vendor: "all", sortKey: "priceM", sortDir: 1, fromPicker: false, extra: false });

/* 对比保存的是目录里的套餐对象，只追踪数组替换，不把套餐对象本身变成响应式代理。 */
export const cmpState = shallowReactive<CompareState>({ items: [] });

export const metricsState = reactive<MetricsState>({ model: "all", ver: "all", tier: "flagship", offer: "current", sortKey: "cpm", sortDir: 1, fromPicker: false });

export const calcState = reactive<CalcState>({ model: CALC_DEFAULT_MODEL, requests: "100", tokens: "20000", days: "22", input: "80", cache: "95", cachePrice: "", budget: "200", scenario: "typical" });

export const APP_DEFAULTS = { personal: { ...personalState }, rank: { ...rankState }, picker: { ...pickerState }, table: { ...tableState }, metrics: { ...metricsState }, calc: { ...calcState } };

/* 主题按钮显示当前模式与实际生效的明暗。 */
export const themeView = reactive<{ mode: ThemeMode; effective: 'dark' | 'light' }>({ mode: 'system', effective: 'light' });

/* 分享、复制推荐摘要与常用条件的操作栏：最近一次提示与是否已保存常用条件。 */
export const serviceUiState = reactive({ feedback: '', presetSaved: false });

/* 额度表模型筛选的合法取值（与额度表模型下拉的数据源一致），供 URL 白名单校验 */
export const MODEL_FILTER_VALUES = new Set([
    ...METRICS_RAW.map((m) => m.model),
    ...ESTIMATES.map((m) => m.model),
    ...PAYG_REFERENCES.map((s) => s.model),
]);
