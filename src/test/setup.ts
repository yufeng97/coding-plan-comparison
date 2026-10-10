/* 组件测试的公共准备：真实按需数据与挂载工具。测试文件第一行导入本文件。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { afterEach, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { Component } from "vue";
import * as legacy from "@domain/runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** 读取生成的按需数据经典脚本，返回其中的常量（经 JSON 转成当前环境的普通对象）。 */
function readClassicData<T>(file: string, name: string): T {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return JSON.parse(JSON.stringify(vm.runInNewContext(`${source}\n;${name};`)));
}
export const MAINTENANCE_DATA = readClassicData<MaintenanceSnapshot>("js/maintenance-data.js", "MAINTENANCE");
export const BENCHMARK_DATA = readClassicData<BenchmarkSnapshot>("js/benchmark-data.js", "BENCHMARKS");

/** 页面里经典脚本声明的全局（按需数据、ECharts）；测试直接放到全局对象上。 */
export const pageGlobals = globalThis as unknown as { MAINTENANCE?: MaintenanceSnapshot; BENCHMARKS?: BenchmarkSnapshot; echarts?: unknown };

/* 与页面加载器一致：数据到达后调用 refreshOptionalViews 通知组件。 */
export function loadMaintenance(data: MaintenanceSnapshot = MAINTENANCE_DATA) {
  pageGlobals.MAINTENANCE = structuredClone(data);
  legacy.refreshOptionalViews("maintenance");
}
export function loadBenchmarks(data: BenchmarkSnapshot = BENCHMARK_DATA) {
  pageGlobals.BENCHMARKS = structuredClone(data);
  legacy.refreshOptionalViews("benchmark");
}
export function unloadOptionalData() {
  delete pageGlobals.MAINTENANCE;
  delete pageGlobals.BENCHMARKS;
  legacy.dataRevision.maintenance++;
  legacy.dataRevision.benchmark++;
}
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 当前获得焦点的元素 id；没有焦点时为空串。 */
export const focusedId = () => document.activeElement?.id ?? "";

/** 每个测试挂载一个组件；测试结束后卸载、清空页面并还原 mock。 */
export function useMount(component: Component, host: () => Element = () => document.body) {
  let current: VueWrapper | undefined;
  afterEach(() => {
    current?.unmount();
    current = undefined;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });
  return {
    async render() {
      current = mount(component, { attachTo: host() });
      await flushPromises();
      return current;
    },
    get wrapper(): VueWrapper {
      if (!current) throw new Error("组件尚未挂载");
      return current;
    },
    unmount() {
      current?.unmount();
      current = undefined;
    },
  };
}
