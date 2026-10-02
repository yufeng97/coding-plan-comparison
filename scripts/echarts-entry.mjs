/* ECharts 按需精简构建入口（页面只用柱状图，见 README「开发与架构约定」）。
 * 重建步骤：
 *   1. 临时目录执行：npm i echarts@5.5.1 esbuild
 *   2. npx esbuild scripts/echarts-entry.mjs --bundle --minify --format=iife --outfile=libs/echarts.min.js
 *   3. npm run bump
 * 完整版（含全部图表类型）可从 echarts@5.5.1 的 dist/echarts.min.js 取回。
 */
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent, CanvasRenderer]);
globalThis.echarts = echarts;
