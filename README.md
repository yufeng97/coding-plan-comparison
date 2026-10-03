# Coding Plan 全球比价中心

国内外在售 AI Coding Plan（编程订阅计划）的价格与 token 额度可视化对比页面。

## 数据覆盖

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI Grok、Mistral、智谱 BigModel 与 Z.ai 的 GLM Coding Plan（V1/V2/V3）、月之暗面 Kimi、MiniMax、小米 MiMo、阶跃 Step Plan 等
- **第三方工具与中转站**：GitHub Copilot、Cursor、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、AWS Kiro、Factory Droid、Canopy Wave、OpenCode、Command Code、腾讯 CodeBuddy、字节 Trae、百度文心快码，以及 R4 Coder、ZenMux、PackyCode、AICodeMirror、88code、DuckCoding、AIGoCode、DevPass、Chutes 等 API 中转站
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts、讯飞星辰 Astron Coding Plan 等
- **API 按量计费**：36 款主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

数据调研与核实日期：**2026-09-23～2026-10-03**；全部来自官方定价页或权威报道（页脚附来源链接）；覆盖 59 家厂商、212 档订阅计划、27 个免费档（其中 20 个是编程工具免费档或免费模型入口）、84 行套餐额度深度对比（官方数据 + 标注置信度的社区估算），另有 10 行 API 按量对照。工具免费档中，BYOK/按量推理的费用会单独注明。页面与导出的更新日期指整份数据的版本日期，不表示当天逐条重新核对所有套餐。

## 使用方式

无需构建。字体已放在 `libs/fonts/`（图标为内联 SVG，无字体文件），用浏览器打开 [index.html](index.html) 即可。

**分享与回访**：筛选/排序状态（帮我选的预算、地区、工具、任务，数据表搜索，额度表筛选，以及个人价格图的显示全部状态）实时写入地址栏参数，复制网址即可分享同一套结果；刷新不丢状态。国家限定套餐不参与通用推荐，在完整数据表中标注适用国家；旧链接的 `country` 参数会自动清理。`file://` 直开时地址栏不可写，功能降级为仅当前页生效。数据表「计划」列点「＋对比」可勾选 2–4 档**并排对比**（只选 1 档时提示继续选择），可逐档移出；差异字段与相同计价单位下的最低价会标出。筛选结果可一键导出 CSV / 复制 Markdown，保留计价单位、数据更新日期、汇率和完整继承权益；「清除筛选」可恢复默认，空结果禁用导出并提供恢复入口。

本地预览请用项目自带的静态服务器（只监听 127.0.0.1，且不能读到项目目录以外的文件）：

```bash
npm run serve
```

## 页面结构

1. **帮我选**：按预算 / 地区 / 工具 / 任务结构（复杂、日常或两者都有），给出主计划、日常覆盖，以及预算再往上一档会解开什么。同套餐包含的日常模型标「已包含」；加购时列合计月费并遵守预算。额度周期与共享关系未公开时明确保留未知，不据此建议加购
2. **性价比排行**：按每百万 tokens 实际成本排序，三档口径可切换——默认「官方每周 tokens」（高置信，非估算，且有官方每周 tokens；不含请求折算、第三方估算）；「含官方折算」纳入 credits 面值/系数/官方区间折算的档位（中置信，≈标记）；「含全部估算」再纳入低置信估算仅供量级参考。三档都不含已停售、已下架、一次性预付和仅老用户续费。悬停标注每行的依据与置信度
3. **个人订阅价格全景**：个人档月费横向条形图（无筛选默认 20 档，可展开全部和收起；可按类别/地区筛选，月付/年付切换，统一折算人民币；一次性与每 4 周档只在数据表显示，窄屏标签缩略，点按价格柱查看完整信息；无结果时显示提示并可清除筛选）
4. **团队/企业/云厂商**：席位价与整包价对比
5. **每周可用 tokens 对比**：并列展示官方公布的周额度与明确标注的社区推算，支持地区/厂商筛选，悬停查看模型、范围与依据
6. **额度深度对比**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率（含 Command Code / 阶跃 credits 制与智谱 V1/V2/V3 各版本，附推算方法论）
7. **API 按量计费**：36 款模型每百万 tokens 输入/输出单价 + $10 购买力对比，地区颜色按模型地区分类。图例支持键盘切换，完整数值和来源可在下方明细表查看
8. **免费 Coding 入口**：20 个编程 Agent / 编程工具免费档与免费模型额度卡片，平台免费、推理另计会明确标注
9. **数据表**：在售且有标价的计划（约 164 档），支持搜索/筛选/排序
10. **行业动态 + 数据来源 + 不确定性说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 页面结构 |
| `css/style.css` | 样式（亮色默认；支持暗色与跟随系统；`--cat-*` 类别色变量是图表/图例/标签的单一色源） |
| `js/data.js` | 全部数据与共享资格函数（订阅计划使用永久 ID；额度数据经 `ref` 引用 `PLANS` 的名称、币种和价格，改价只改一处） |
| `js/metrics.js` | 额度换算纯计算（`computeMetrics`、`blendPrice`、旗舰判定等；无 DOM，测试与校验器共用） |
| `js/app-core.js` | 常量、工具、主题、统计卡、内联 SVG 图标 |
| `js/app-charts.js` | 五个 ECharts 图表渲染 + 免费入口卡 |
| `js/app-picker.js` | 「帮我选」推荐引擎与卡片 |
| `js/app-tables.js` | 数据表、导出与并排对比；`PLAN_COLUMNS` 共用数据表/CSV/Markdown 取值，`METRICS_COLUMNS` 共用额度表头/排序/渲染 |
| `js/app-init.js` | 启动、图表懒加载（IntersectionObserver）、`?debug=1` 自检 |
| `js/app-state.js` | 各区块默认状态与 URL 编解码，状态更新后统一同步网址 |
| `js/app-events.js` | 页面控件事件绑定，初始化时显式注册 |
| `libs/echarts.min.js` | ECharts 6.1.0 按需精简构建（仅柱状图 + Grid/Tooltip/Legend/Title/AxisPointer，约 519KiB） |
| `libs/fonts/` | Manrope、IBM Plex Mono 子集（本地化） |
| `scripts/lib/public-assets.js` | 从 HTML/CSS 发现公共资源，校验路径、生成内容哈希与原子替换 |
| `scripts/stage-site.js` / `deploy-site.js` | 生成独立公共目录，通过 Vercel REST 部署；不复用旧 `.vercel/output` |

## 开发与架构约定

- **零构建、双击可用**：页面使用按序加载的经典脚本，保留 `file://` 直开。`data.js → metrics.js → app-core → app-state → app-charts → app-picker → app-tables → app-events → app-init`，以 `index.html` 实际顺序为准；控件监听集中到事件模块，初始化由 `app-init.js` 驱动。
- **永久套餐 ID**：每条 `PLANS` 的 `id` 一经发布便不可变、不可复用；改名称、改价、调整顺序时保留原 ID，新计划使用新 ID。额度行的 `ref` 使用此 ID，名称、币种和价格统一由引用计划引入；周期优先保留额度行的明确口径，否则沿用计划。旧 `[vendor, plan]` 引用仍可解析，仅用于兼容。
- **单一数据源**：类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；数据表正文、CSV 与 Markdown 共享 `PLAN_COLUMNS`，各渠道按配置选列；额度表的列定义只在 `METRICS_COLUMNS` 一处。已有继承权益均通过 `fieldRefs` 的永久 ID 明确目标，新增继承也填写目标 ID，追加权益保留且循环引用安全中止。解析器保留旧文本名称及「同上」相邻位置的兼容能力，不用它们建立新数据引用。
- **推荐元数据**：`windowPeriod` 与 `quotaSharing` 分别描述重置周期与模型额度是否共享，缺省表示未知；`codingSurface`、`includedModelQuota`、`modelAccess` 与 `purchaseCountries` 分别描述编程入口、是否包含推理、自备模型和国家限定资格。填有依据的事实，未知情况不靠条数或文案猜测。月 credits 及无 5h 上限的套餐不生成虚假的 5h 额度。
- **缓存版本号**：`npm run bump` 自动发现 HTML 本地资源和 CSS 的字体/导入依赖；先给依赖生成内容哈希，再更新 CSS 与 HTML 的 `?v=`。全部资源验证后才写入，替换中途失败会回滚。缺文件、越界、私有/隐藏目录（包括链接的真实目标）、非法编码或循环 CSS 引用会失败。`npm run cache:check` 只读验证，CI 不修改仓库；`.gitattributes` 固定文本检出为 LF，避免 Windows/Linux 的换行差异改变资源哈希。
- **开发环境与校验**：Node.js 20+，首次运行 `npm ci`。开发依赖固定版本并提交 lockfile。`npm run typecheck` 分别使用浏览器 `jsconfig.json` 与工具/测试 `jsconfig.node.json`；新增页面脚本自动纳入，不需手改命令。`npm run validate` 检查数据结构、引用、有限数字和价格区间；`npm run test` 包含额度公式、真实数据、VM 用户流程、HTTP 服务以及字体失败回滚、缓存与公共产物回归。`npm run test:browser` 使用真实 Chromium 检查图表、历史导航及桌面/手机布局。CI 在 Linux 与 Windows 用 `npm ci` 安装，执行语法、类型、数据、回归、只读缓存检查、Chromium 验收、公共产物及依赖安全检查。
- **重建精简版 ECharts**（一般不需要）：

  ```bash
  npm ci
  npm run vendor:echarts
  npm run bump
  ```
- **第三方产物出处**：`libs/README.md` 记录版本与来源。`npm run vendor:fonts` 将所有字体下载到暂存目录，检查 WOFF2 后整组替换；失败保留或恢复旧目录。新字体名含内容哈希，成功替换时清理旧子集；之后运行 `npm run bump`。
- **调试**：给 URL 加 `?debug=1` 会在控制台跑「帮我选」的 headline 断言（`auditProfiles`），正常访问不执行。

## 生成产物与部署

`npm run build:site` 从已校验的资源图生成 `.site-build/`，只包含入口、实际引用的 `css/js/libs` 文件与 `vercel.json`。工具、依赖、项目凭据及历史 `.vercel/output` 都不会复制。每次从源码重新生成，缓存版本不一致时拒绝生成。

```bash
npm run bump
npm run cache:check
npm run build:site
npm run deploy -- --dry-run
```

实际部署使用 Node 原生 `fetch` 调用 [Vercel REST API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)，不需要将 Vercel CLI 的框架依赖带进项目。项目关联读取根目录 `.vercel/project.json`；认证优先级依次为环境变量 `VERCEL_TOKEN`、部署函数调用者的临时 `options.token`、Windows 标准路径 `%APPDATA%/com.vercel.cli/Data/auth.json` 中的现有 CLI 登录 token。回退只读取这一个明确位置，不递归搜索其他凭据；`--dry-run` 不读取认证或请求网络。凭据只用于授权头，响应或错误中回显的 token 会脱敏，不写入产物或日志。`npm run deploy` 创建预览部署，`npm run deploy -- --prod` 发布生产；仅在部署达到 READY 后报告成功。

浏览器测试首次使用前运行 `npx playwright install chromium`；CI 会安装所需系统依赖。生成的站点、Playwright 报告和测试截图均已加入 `.gitignore`。

## 免责声明

各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.71 CNY（2026-09-23 实测汇率）折算仅用于图表对比；价格随官方随时调整，购买前请以官网为准。
