# Coding Plan 全球比价中心

国内外在售 AI Coding Plan（编程订阅计划）的价格与 token 额度可视化对比页面。

## 数据覆盖

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI Grok、Mistral、智谱 BigModel 与 Z.ai 的 GLM Coding Plan（V1/V2/V3）、月之暗面 Kimi、MiniMax、小米 MiMo、阶跃 Step Plan 等
- **第三方工具与中转站**：GitHub Copilot、Cursor、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、AWS Kiro、Factory Droid、Canopy Wave、OpenCode、Command Code、腾讯 CodeBuddy、字节 Trae、百度文心快码，以及 R4 Coder、ZenMux、PackyCode、AICodeMirror、88code、DuckCoding、AIGoCode、DevPass、Chutes 等 API 中转站
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts、讯飞星辰 Astron Coding Plan 等
- **API 按量计费**：34 款主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

数据调研与核实日期：**2026-09-23～30**；全部来自官方定价页或权威报道（页脚附来源链接）；覆盖 59 家厂商、210 档订阅计划、27 个免费档（其中 20 个可作免费 Coding 入口）、84 行额度深度对比（官方数据 + 标注置信度的社区估算）。

## 使用方式

无需构建。字体已放在 `libs/fonts/`（图标为内联 SVG，无字体文件），用浏览器打开 [index.html](index.html) 即可。

本地预览请用项目自带的静态服务器（只监听 127.0.0.1，且不能读到项目目录以外的文件）：

```bash
npm run serve
```

## 页面结构

1. **帮我选**：按预算 / 地区 / 工具 / 任务结构（复杂、日常或两者都有），给出主计划、日常覆盖，以及预算再往上一档会解开什么
2. **性价比排行**：有官方每周 token 数据、且新用户可购买的计划，按每百万 tokens 实际成本排序（不含请求折算、第三方估算、已停售/已下架、一次性预付、仅老用户续费）
3. **个人订阅价格全景**：全部个人档月费横向条形图（可按类别/地区筛选，月付/年付切换，统一折算人民币，悬停查看原币与额度）
4. **团队/企业/云厂商**：席位价与整包价对比
5. **GLM 官方每周 token 估算**：唯一官方公布可折算 token 总量的厂商，含性价比换算
6. **额度深度对比**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率（含 Command Code / 阶跃 credits 制与智谱 V1/V2/V3 各版本，附推算方法论）
7. **API 按量计费**：34 款模型每百万 tokens 输入/输出单价 + $10 购买力对比
8. **免费 Coding 入口**：20 个可作编程 Agent / 编程工具的零成本方案卡片
9. **数据表**：在售且有标价的计划（约 177 档），支持搜索/筛选/排序
10. **行业动态 + 数据来源 + 不确定性说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 页面结构 |
| `css/style.css` | 样式（亮色默认；支持暗色与跟随系统；`--cat-*` 类别色变量是图表/图例/标签的单一色源） |
| `js/data.js` | 全部数据（订阅计划、API 单价、动态、来源；额度对比数据经 `ref` 引用 `PLANS` 的价格，改价只改 `PLANS` 一处） |
| `js/metrics.js` | 额度换算纯计算（`computeMetrics`、`blendPrice`、旗舰判定等；无 DOM，测试与校验器共用） |
| `js/app-core.js` | 常量、工具、主题、统计卡、内联 SVG 图标 |
| `js/app-charts.js` | 五个 ECharts 图表渲染 + 免费入口卡 |
| `js/app-picker.js` | 「帮我选」推荐引擎与卡片 |
| `js/app-tables.js` | 数据表、额度深度对比表（列配置 `METRICS_COLUMNS` 是表头/排序/渲染的唯一来源）、事件绑定 |
| `js/app-init.js` | 启动、图表懒加载（IntersectionObserver）、`?debug=1` 自检 |
| `libs/echarts.min.js` | ECharts 5.5.1 按需精简构建（仅柱状图 + Grid/Tooltip/Legend/Title/AxisPointer，493KB） |
| `libs/fonts/` | Manrope、IBM Plex Mono 子集（本地化） |

## 开发与架构约定

- **零构建、双击可用**：页面是经典脚本按序加载，**不使用 ES Modules**——`file://` 直开会拦模块请求。加载顺序固定：`data.js → metrics.js → app-core → app-charts → app-picker → app-tables → app-init`。前面的文件只声明，顶层执行语句集中在 `app-init.js`。
- **单一数据源**：价格走 `ref` 指回 `PLANS`；类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；额度表的列定义只在 `METRICS_COLUMNS` 一处。
- **缓存版本号**：`index.html` 的 `?v=` 由内容哈希生成，改完资产跑 `npm run bump`（CI 会校验没跑会挂）。
- **测试与校验**：`npm run validate` 校验数据结构/引用一致性；`npm run test` 用手算基准锁定额度换算公式与模型分类正则（改 `metrics.js` 的假设或正则后必须跑）。CI（`.github/workflows/ci.yml`）在 push/PR 时跑全部三样。
- **重建精简版 ECharts**（一般不需要）：

  ```bash
  # 临时目录里：npm i echarts@5.5.1 esbuild
  # 入口（scripts/echarts-entry.mjs）：
  #   import * as echarts from "echarts/core";
  #   import { BarChart } from "echarts/charts";
  #   import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, AxisPointerComponent } from "echarts/components";
  #   import { CanvasRenderer } from "echarts/renderers";
  #   echarts.use([...]); globalThis.echarts = echarts;
  # 构建：npx esbuild scripts/echarts-entry.mjs --bundle --minify --format=iife --outfile=libs/echarts.min.js
  ```
- **调试**：给 URL 加 `?debug=1` 会在控制台跑「帮我选」的 headline 断言（`auditProfiles`），正常访问不执行。

## 免责声明

各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.71 CNY（2026-09-23 实测汇率）折算仅用于图表对比；价格随官方随时调整，购买前请以官网为准。
