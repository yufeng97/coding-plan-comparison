/* ECharts 按需精简包的入口：页面只用柱状图及网格、提示框、图例、标题与坐标轴指示器。
 * 构建时由 scripts/build/vite-assets.mjs 的 bundleEcharts 打成经典脚本（libs/echarts-<hash>.js），版本跟随 package.json 的 echarts；
 * 页面接近图表时才加载。新增图表类型或组件时在这里注册。 */
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent, CanvasRenderer]);
(globalThis as unknown as { echarts: typeof echarts }).echarts = echarts;
