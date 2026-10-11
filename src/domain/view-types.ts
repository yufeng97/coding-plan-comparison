import type { WorkloadState } from './service-types';

/* 各区块的可分享筛选状态。取值都是经 URL_VALID 白名单校验的字符串，与表单控件直接绑定。 */
export interface PersonalState { cat: string; region: string; billing: string; q: string; limit: number | null; fromPicker: boolean; }

export interface RankState { tier: string; scope: string; vendor: string; fromPicker: boolean; }

export interface PickerState { budget: string; region: string; tool: string; task: string; billing: string; priority: string; }

export interface TableState { search: string; cat: string; region: string; sortKey: string; sortDir: number; fromPicker: boolean; extra: boolean; }

export interface MetricsState { model: string; ver: string; tier: string; offer: string; sortKey: string; sortDir: number; fromPicker: boolean; }

export interface CompareState { items: Plan[]; }

/** 费用计算器：输入保留字符串，校验通过才进入共享状态。 */
export type CalcState = Required<WorkloadState>;

/** 对象中取值为字符串的字段名。 */
export type StringField<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

export type ThemeMode = "dark" | "light" | "system";
