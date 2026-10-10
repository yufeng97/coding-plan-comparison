/* 组件测试的公共准备：先注入状态工厂（旧脚本的 appState() 才返回响应式对象），再提供真实的按需数据。
 * 测试文件第一行导入本文件。 */
import "../bootstrap.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as legacy from "virtual:legacy-lib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** 读取生成的按需数据经典脚本，返回其中的常量（经 JSON 转成当前环境的普通对象）。 */
function readClassicData(file, name) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return JSON.parse(JSON.stringify(vm.runInNewContext(`${source}\n;${name};`)));
}
export const MAINTENANCE_DATA = readClassicData("js/maintenance-data.js", "MAINTENANCE");
export const BENCHMARK_DATA = readClassicData("js/benchmark-data.js", "BENCHMARKS");

/* 与页面加载器一致：数据是全局常量，到达后调用 refreshOptionalViews 通知组件。 */
export function loadMaintenance(data = MAINTENANCE_DATA) {
  globalThis.MAINTENANCE = structuredClone(data);
  legacy.refreshOptionalViews("maintenance");
}
export function loadBenchmarks(data = BENCHMARK_DATA) {
  globalThis.BENCHMARKS = structuredClone(data);
  legacy.refreshOptionalViews("benchmark");
}
export function unloadOptionalData() {
  delete globalThis.MAINTENANCE;
  delete globalThis.BENCHMARKS;
  legacy.dataRevision.maintenance++;
  legacy.dataRevision.benchmark++;
}
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
