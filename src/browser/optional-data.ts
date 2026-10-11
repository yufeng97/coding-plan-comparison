import { byId } from './dom';

/* 辅助视图的数据脚本在访问时下载。它们是生成的经典脚本（构建时按内容哈希另存），维护脚本直接读取同一文件。 */
export type { OptionalDataKind, OptionalViewKind } from '../domain/optional-data-types';
import type { OptionalDataKind } from '../domain/optional-data-types';

export const optionalDataLoads: Partial<Record<OptionalDataKind, Promise<void>>> = {};

export function optionalDataLoaded(kind: OptionalDataKind) {
    return kind === "maintenance" ? typeof MAINTENANCE !== "undefined" && MAINTENANCE.schemaVersion === 1
        : kind === "benchmark" && typeof BENCHMARKS !== "undefined" && BENCHMARKS.schemaVersion === 1;
}

export function ensureOptionalData(kind: OptionalDataKind): Promise<void> {
    if (optionalDataLoaded(kind))
        return Promise.resolve();
    const loading = optionalDataLoads[kind];
    if (loading)
        return loading;
    const descriptor = byId(kind + "DataSource");
    if (!descriptor)
        return Promise.reject(new Error("缺少数据入口"));
    const pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.dataset.optionalData = kind;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (error: Error | null) => {
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
                script.remove();
                delete optionalDataLoads[kind];
                reject(error);
            }
            else
                resolve();
        };
        script.onload = () => finish(optionalDataLoaded(kind) ? null : new Error("数据文件内容不完整"));
        script.onerror = () => finish(new Error("数据文件下载失败"));
        script.src = descriptor.getAttribute("src") ?? "";
        timer = setTimeout(() => finish(new Error("数据下载超时，请重试")), 15000);
        document.head.appendChild(script);
    });
    optionalDataLoads[kind] = pending;
    return pending;
}


