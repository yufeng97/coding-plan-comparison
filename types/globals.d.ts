/// <reference path="./catalog.d.ts" />
/* 应用（浏览器程序）专用的全局声明，只由 tsconfig.app / tsconfig.vitest 引入；数据文件的 checkJs 只用 catalog.d.ts，避免与按需数据脚本里的同名常量冲突。 */

/** 按需数据经典脚本（js/maintenance-data.js、js/benchmark-data.js）声明的全局数据（用 var，迟到的旧请求与重试都执行时只覆盖同一份数据）；下载完成前不存在。 */
declare const MAINTENANCE: MaintenanceSnapshot | undefined;
declare const BENCHMARKS: BenchmarkSnapshot | undefined;
/** ECharts 精简包（src/entries/echarts.ts 构建的经典脚本）挂到全局的 echarts/core；按需下载完成前不存在。 */
declare const echarts: typeof import("echarts/core") | undefined;

interface Window {
  reportLoadFailure?: (message: string) => void;
  codingPlanReady?: boolean;
}
