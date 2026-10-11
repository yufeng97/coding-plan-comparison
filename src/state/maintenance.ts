import { appState } from './reactive';
import type { FollowState } from '../domain/model-types';
import type { OptionalViewKind } from '../domain/optional-data-types';

/* 我的关注、维护记录、贡献者测评、帮助补全与公开评测由 Vue 组件渲染（src/sections/）。本文件只声明它们的共享响应式状态，
   组件读写共享状态，按需数据是经典脚本定义的全局常量，
   不在响应式系统里，数据到达时递增 dataRevision，组件据此重新读取。 */
export const followState = appState<FollowState>({ version: 1, planIds: [], readChangeIds: [] });

/* importIds：待用户确认的关注同步；storageMessage：本机存储不可用时的说明；feedback：最近一次关注操作的提示。 */
export const followView = appState({ importIds: [] as string[], storageMessage: "", feedback: "" });

export const maintenanceView = appState({ planId: "", recordFilter: "all", publicDataFeedback: "" });

export const benchmarkFilter = appState({ task: "all", tool: "all", model: "all" });

export const dataRevision = appState({ maintenance: 0, benchmark: 0 });

export const publicBenchmarkState = appState({ id: "deepswe-v1-1", family: "", search: "", mode: "best" });

export const publicBenchmarkChartState = appState({ metric: "score", limit: "20" });

export const optionalViewState = appState<Record<OptionalViewKind, { message: string; failed: boolean; loading: boolean }>>({
    maintenance: { message: "", failed: false, loading: false },
    benchmark: { message: "", failed: false, loading: false },
});
