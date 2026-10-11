/// <reference path="../js/globals.d.ts" />
/* 应用专用的全局声明。套餐、额度行、核价与评测等数据结构与审计数据共用 js/globals.d.ts。 */

/** 按需数据经典脚本（js/maintenance-data.js、js/benchmark-data.js）声明的全局常量；下载完成前不存在。 */
declare const MAINTENANCE: MaintenanceSnapshot | undefined;
declare const BENCHMARKS: BenchmarkSnapshot | undefined;
/** ECharts 精简包（src/charts/echarts.ts 构建的经典脚本）挂到全局的 echarts/core；按需下载完成前不存在。 */
declare const echarts: typeof import("echarts/core") | undefined;

interface Window {
  reportLoadFailure?: (message: string) => void;
  codingPlanReady?: boolean;
}
