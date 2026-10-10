/* 按需数据（维护记录、评测）是经典脚本定义的全局常量，不在响应式系统里。
 * 数据到达时加载器递增 dataRevision，依赖它的计算值随之重新读取。 */
import { computed, type ComputedRef } from "vue";
import * as legacy from "@domain/runtime";

export type OptionalDataKind = "maintenance" | "benchmark";

export function fromData<T>(kind: OptionalDataKind, read: () => T): ComputedRef<T> {
  return computed(() => {
    void legacy.dataRevision[kind];
    return read();
  });
}
