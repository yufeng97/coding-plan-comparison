/* ECharts 按需精简构建入口（页面只用柱状图，见 README「开发与架构约定」）。
 * 重建步骤：
 *   1. 项目根目录执行：npm ci
 *   2. npm run vendor:echarts（固定 ECharts 6.1.0 和 esbuild，见 package-lock.json）
 *   3. npm run bump
 * 完整版（含全部图表类型）可从 echarts@6.1.0 的 dist/echarts.min.js 取回。
 */
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent, CanvasRenderer]);
/** @type {any} */ (globalThis).echarts = echarts;
