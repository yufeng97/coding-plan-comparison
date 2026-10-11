import type { FollowState } from '../domain/model-types';

/* ============ 数据可信、关注变更、真实任务测评与贡献 ============ */

export const FOLLOW_KEY = "cp-followed-plans-v1";

/* 关注同步链接 ?follow=plan-0002,plan-0031：只在打开页面时读取一次（启动后地址栏会规范化去掉该参数），
   由用户确认后才合并进本机关注；链接不含已读记录。 */
export function readFollowImport() {
    try {
        const raw = new URLSearchParams(location.search).get("follow") || "";
        return [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => /^plan-[a-z0-9-]{1,40}$/.test(id)))].slice(0, 500);
    }
    catch (e) {
        return [];
    }
}

export function maintenanceData(): MaintenanceSnapshot {
    return typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
        ? MAINTENANCE : { schemaVersion: 1, generatedAt: "", checkedThrough: "", summary: { total: 0, verified: 0, unverified: 0, stale: 0 }, records: [], reviews: [], changes: [] };
}

export function benchmarkData(): BenchmarkSnapshot {
    return typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1
        ? BENCHMARKS : { schemaVersion: 1, generatedAt: "", tasks: [], runs: [], methodology: "" };
}

export function publicBenchmarkData(): PublicBenchmarkSnapshot {
    const data = benchmarkData().public;
    return data && data.schemaVersion === 1 ? data : { schemaVersion: 1, checkedAt: "", benchmarks: [], scores: [] };
}

export function readStoredFollowState(): unknown {
    try {
        const raw = localStorage.getItem(FOLLOW_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch (e) {
        throw new Error("本机关注存储不可用或已损坏；本页仍可关注，关闭后不会保留。");
    }
}

export function writeStoredFollowState(value: FollowState) {
    try {
        localStorage.setItem(FOLLOW_KEY, JSON.stringify(value));
    }
    catch (e) {
        throw new Error("本机关注存储不可用；本页操作已生效，关闭后不会保留。");
    }
}
