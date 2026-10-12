# 架构与发布

页面结构、文件职责、开发约定、构建与部署。维护流程见 [数据维护手册](maintenance.md)。

## 页面结构

1. **帮我选**：按预算 / 地区 / 工具 / 任务 / 付款方式筛选，并可选择「额度 / 模型能力 / 价格」优先。给出主计划、日常覆盖、同厂商升级参考，以及前 3 档并排对比表（月费、主力模型、额度参考下限、DeepSWE v1.1 名次）；「模型能力优先」只按 DeepSWE v1.1 已公布成绩排序，不跨评测合成分数。可「复制推荐摘要」为纯文本。额度周期与共享关系未公开时保留未知，不据此建议加购
2. **个人订阅价格全景**：个人档月费横向条形图（无筛选默认 20 档，可展开全部；按类别/地区筛选，月付/年付切换，统一折算人民币）。手机上套餐名显示在价格柱上方
3. **免费 Coding 入口**：可用的编程 Agent / 编程工具免费档与免费模型额度卡片，支持地区与推理费用筛选
4. **数据表（公开标价记录）**：支持搜索/筛选/排序及核查来源。默认收起中转站与价格待核实的历史价，「含中转站与待核价格」开关可显示全部并写入分享链接（`tall=1`）
5. **满额使用折算成本（进阶）**：按参考月额度中点的每百万 tokens 折算成本排序，「官方口径折算」与「含全部估算」两档可切换，可局部应用选购条件
6. **额度深度对比（进阶）**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率，附推算方法论
7. **每周可用 tokens 对比（进阶）**：官方额度折算与其他估算并列，支持图例筛选
8. **团队/企业/云厂商**：席位价与整包价对比（对数刻度）
9. **API 按量计费**：模型单价与 $10 购买力图；工作量计算器按官方缓存命中价计费，可从 ccusage 或 Claude Code / Codex 会话日志导入真实用量，并反查参考额度能覆盖该用量的套餐及订阅回本点
10. **重要动态**：已核对的行业与套餐消息
11. **模型公开评测**：DeepSWE、CursorBench、OSWorld、HLE 与 SWE-bench 的官方成绩，按版本与协议筛选、图表及导出
12. **我的关注与套餐变更**：核查时效、复核日历、历史变化、本机关注、按厂商订阅 RSS 与关注同步链接
13. **帮助补全与纠错**：纠错、新厂商和测评模板
14. **数据来源与说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | HTML 外壳、`#app` 挂载点与 Vite 入口（`src/main.ts`）；主题引导、加载提示、按需数据与 ECharts 保留逻辑入口地址 |
| `src/main.ts` / `src/App.vue` | 恢复 URL 与本机状态 → 挂载整页组件 → 启动导航、按需加载及共享服务；`App.vue` 只排列页头、各章节、对话框与页脚，模板供浏览器与 Vue SSR 共用 |
| `src/layouts/` | 页头（滚动进度、主要视图导航、主题按钮）与页脚（辅助资料入口、数据日期与备用地址） |
| `src/sections/` | 按功能分组的页面区块：`picker`（帮我选与操作栏）、`pricing`（价格图、数据表、额度表与方法论、完整权益）、`compare`（并排对比）、`calculator`（费用计算与用量反查）、`benchmarks`、`follow`、`contribution` 与 `site`（首屏、统计与来源）；组件测试就近放置，保留原 ID、class、ARIA |
| `src/components/` | 跨区块复用的组件：链接、按钮、徽章、价格与额度单元、图例、排序表头与可选数据状态 |
| `src/composables/` | 组件共用的组合式函数：按需数据到达后重新读取（`fromData`）、卸载时释放图表实例（`useChartLifecycle`） |
| `src/domain/` | 不依赖浏览器、共享状态或应用协调的业务规则，类型与实现放在一起：目录索引与格式化（`core`）、额度换算（`metrics`）、「帮我选」（`picker/`：付款口径、套餐画像、文字说明、能力评分，以及依赖选购条件的 `rules`）、排行规则（`rank`）、评测模型匹配、置信度、费用计算与表格格式 |
| `src/state/` | Vue 共享状态（各区块筛选条件、对比、主题、操作栏、关注与评测视图）及绑定状态的选择器：`picker` 把推荐规则绑定到选购条件，`rank` 绑定排行口径 |
| `src/browser/` | 浏览器适配：DOM、URL 状态、本机存储、剪贴板与下载、按需数据、主题与章节高亮；`charts/` 按图表分文件，`host` 管理 ECharts 实例、配色与尺寸 |
| `src/application/` | 跨功能动作与页面启动：数据表、额度表与对比，推荐范围，费用计算，操作栏（复制链接与常用条件），关注与评测，完整权益入口；启动拆为 `startup`、`section-navigation`、`history-restore`、`lazy-charts` 与 `page-widgets` |
| `src/entries/` | 单独打包的经典脚本入口：首帧主题（`theme-init`）、主入口加载失败提示（`app-loader`）与 ECharts 精简包（`echarts`，仅柱状图 + Grid/Tooltip/Legend/Title/AxisPointer，构建时由 npm 包生成 `libs/echarts-<hash>.js`）；保留失败重试与 CSP 外链约定 |
| `src/generated/catalog.ts` / `scripts/build/catalog-types.mjs` | 从审计数据、首屏评测与维护摘要和公开项目配置确定性生成的类型化目录；生成文件提交，`catalog:check` 发现输入漂移时失败 |
| `types/catalog.d.ts` / `globals.d.ts` | 审计数据的结构类型（套餐、额度行、核价、评测与维护快照），数据文件的 checkJs 与应用共用同一份；`globals.d.ts` 只供应用程序：按需数据常量与 ECharts 精简包（下载前为 `undefined`）及 `window` 扩展 |
| `src/styles/index.css` | 按层叠顺序导入：主题变量（`theme`）→ 元素基础（`base`）→ 页面骨架（`layout`：页头、导航、章节、页脚、加载失败提示）→ 跨区块组件（`components`：筛选控件、数据表外框与表头、分类标签、方法论折叠、对比与关注按钮、状态提示）→ 各功能（`features/`：图表、帮我选、价格与数据表、费用计算、对比、站点说明、关注、评测）→ 需要压过功能样式的窄屏调整（`responsive`）；`--cat-*` 是图表/图例/标签的单一色源 |
| `src/assets/fonts/` | Manrope、IBM Plex Mono 本地子集；39 个字体声明共用 21 份内容去重资产 |
| `src/test/` / `src/regression/` | 测试支撑与整页回归：`test/runtime.ts` 汇总业务模块供测试读取状态、调用函数（生产代码禁止引用）；`test/page.ts` 挂载真实 `App.vue` 并按生产顺序启动，只替换浏览器边界（历史、计时器、ECharts、存储、剪贴板、下载及按需数据），可在启动前准备数据（`prepare`）或按模块替换导出（`mock`） |
| `data/sources/data.js` / `project-data.js` | 人工维护的审计数据与公开项目配置；订阅永久 ID、引用权益与项目入口在此维护，生成 TS 目录后进入应用 |
| `data/generated/` | 维护与评测脚本生成、随源数据提交的文件（`.gitattributes` 标为生成文件）：按需加载的 `maintenance-data.js` / `benchmark-data.js`、首屏评测摘要 `benchmark-summary.js`、首屏维护摘要 `maintenance-summary.js`（导航未读提醒与核查日期超期提示用的套餐变更 ID 与复查间隔）、维护快照 `maintenance.json`，以及全站与分厂商变更 RSS `changes.xml` / `feeds/`（发布 URL 保持 `changes.xml` 与 `feeds/`） |
| `data/audit/` | 258 条价格的原始库存、分组官网证据、JSON/CSV 合并台账与已确认变更历史 `change-history.json`；资讯、评测采集与截图的本地工作目录也在此（不纳入版本库）；不复制到公共部署产物 |
| `data/config/news-sources.json` / `review-calendar.json` | 官方监测、开放发现与有来源的复核日历 |
| `scripts/benchmarks/` / `data/benchmarks/` | 官方公开评测 adapter、带哈希证据的采集/审核、public-results.json 快照、固定任务验收与公共测评构建 |
| `public/` | 只放手写静态资源：分享卡片图 `img/og-card.png`（og:image）。由 `build:site` 与开发中间件按白名单发布，发布 URL 保持 `img/` |
| `tsconfig.json` / `tsconfig.*.json` | 根配置只引用子项目，编辑器据此为每个文件选用对应配置：`app`（业务模块与组件，不含 Node 类型）、`vitest`（测试）、`data`（数据文件 checkJs）、`node`（工具脚本、Node 回归、端到端测试与 Vite / Playwright 配置） |
| `scripts/lib/paths.js` / `atomic-swap.js` | 共享的「路径是否在根内 / 封锁段」判断、目录级原子交换（暂存→备份→切换→回滚）与逐文件替换回滚 |
| `scripts/build/` | 构建与校验工具：vite-assets（公共源白名单、经典资源哈希与 ECharts 生成）、catalog-types、vendor-fonts、stage-site、prerender、render-vue、deploy-site、check-syntax、check-architecture、validate-data、sync-pricing-audit、update-rates（参考汇率） |
| `scripts/server/serve.js` | 发布产物预览服务器（`serve.js .site-build`；只监听 127.0.0.1，只读站点目录内的白名单文件并拒绝隐藏路径） |
| `scripts/news/collect-news.js` | 联网采集资讯候选与页面变化；保留缓存和来源错误，不改正式数据 |
| `scripts/maintenance/` | 维护摘要与变更 RSS 构建：读写 `data/audit/change-history.json`，输出到 `data/generated/` |
| `tests/scripts/` | Node 工具、架构约束及维护回归，与被测的 `scripts/` 工具分开；`run.js` 依次执行 Node 套件，再运行 TS 公式、数据、整页与就近组件测试，统一入口为 `npm test` |
| `tests/e2e/` | Chromium、Firefox、WebKit 端到端用例（Playwright），通过 DOM、地址、存储和 ECharts 公共 API 检查发布产物 |

## 前端结构与迁移

经典页面逻辑到 Vue 3 + Vite + TypeScript 的迁移已经完成。整页由单一 `App.vue` 组织，各区块使用原生 Vue 模板，不用 `v-html` 包装原渲染器。经典业务脚本、合并清单、虚拟模块与 `src/legacy.d.ts` 已移除；审计数据和维护工具保留原有编辑格式。

- **依赖方向与启动**：依赖只能从上往下：业务规则（`domain`）→ 共享状态（`state`）→ 浏览器适配（`browser`）→ 应用协调（`application`）→ 组合式函数 → 通用组件 → 页面区块 → 布局，每层只依赖排在它前面的层；单独打包的入口（`entries`）不依赖应用模块，生产代码不得引用 `src/test/`。组件按需从具体模块导入（别名 `@domain`、`@state`、`@browser`、`@app`、`@generated`），没有汇总全部导出的统一出口。`check:architecture` 检查包括 Vue script 在内的生产模块，拒绝运行时循环依赖与越层导入。`main.ts` 显式初始化协调能力，恢复 URL 与关注，再挂载组件和启动导航；模块导入不读取浏览器 URL。
- **共享状态**：`src/state/` 集中使用 Vue `reactive`；保存目录对象引用的 `cmpState` 用 `shallowReactive`，替换选择数组时保持原套餐对象身份。推荐、表格、关注与完整权益窗口读取同一份状态，Vue 拥有这些容器的 DOM。
- **按需数据与图表**：维护和评测仍按经典数据资产下载。`refreshOptionalViews` 递增 `dataRevision.maintenance` / `dataRevision.benchmark`，组件据此重算；图表加载、主题与尺寸变化通过组件登记的重绘钩子处理，卸载时释放图表资源。
- **类型边界**：`src/` 全部代码在同一份严格配置下检查：`tsconfig.app.json` 覆盖业务模块、组件与模板（不含 Node 类型），`tsconfig.vitest.json` 继承它并加入测试与 Node 类型。数据结构只在 `types/catalog.d.ts` 声明一次，应用专用的全局声明在 `types/globals.d.ts`（数据文件的检查不引入它，避免与按需数据脚本里的同名常量冲突）；价格、额度等可缺省的值按 `number | null` 处理，付款报价按 `available` 区分有价与未列价两种形态，额度表行按 `payg` 区分套餐额度与按量参照。按需数据与 ECharts 全局在下载前不存在，类型为 `| undefined`，使用前先判断。生产源不使用 `any`、`@ts-nocheck` 或 `@ts-ignore`；测试替身 `FakeChart` 记录的 ECharts 配置是唯一保留 `any` 的地方，便于断言读取任意层级。
- **审计目录**：`catalog:build` 从 `data/sources/data.js`、`data/sources/project-data.js` 与生成的首屏评测摘要 `data/generated/benchmark-summary.js`、首屏维护摘要 `data/generated/maintenance-summary.js` 确定性生成 `catalog.ts`，保留正则、资格函数与永久 ID。类型只来自数据文件里的 JSDoc（`@type`、`@param`、`@returns`），如 `Plan[]`、`PriceChecks`、`BenchmarkSummary`；顶层函数的参数缺少注解时生成失败。生成文件应随维护输入一同提交；`catalog:check` 只检查漂移，不改仓库。维护输入变化后先重建目录再提交。
- **关注与对比按钮**：推荐、数据表、完整权益和关注列表复用 Vue 按钮组件，直接从共享状态计算选中、禁用与 ARIA；统一服务处理套餐身份与关注变更。旧同步函数不改写 Vue 所有的节点。
- **样式归属**：全局样式按 `src/styles/index.css` 的层叠顺序组织，功能样式只覆盖本功能的元素，多个区块共用的类（如 `.table-wrap`、`.method-box`、`.cmp-add`）放在 `components.css`。功能需要改共享组件的外观时写在功能文件里，它加载在组件之后；共享组件的窄屏尺寸若要压过功能样式（如推荐卡复用的对比按钮），放在最后加载的 `responsive.css`。新组件独用的样式写在组件的 `<style scoped>` 里：构建把它并入同一份样式表，预渲染与挂载后的元素都带 `data-v-*` 属性；作用域选择器多一个属性选择器，优先级高于同名的全局类。只有多个组件共用的类才放进全局样式表。
- **静态首屏**：`render-vue.mjs` 在隔离进程里通过 Vite 加载同一个 App，调用 Vue `renderToString`；happy-dom 仅提供浏览器 API 边界。SSR 不运行启动、图表下载或用户存储恢复。浏览器按 URL 与本机状态重新挂载；静态输出不插入关闭窗口的 Teleport 节点，避免重复 ID。
- **回归边界**：Vitest 直接导入 TS 计算；整页测试重新载入业务模块、挂载真实 App 并启动，不维护另一套 HTML。测试经 `src/test/runtime.ts` 读取全部业务导出；需要替换某个函数时按模块 `mock`（如 `@app/tables`），启动代码与组件经这些模块导入时看到替换值。每次结束卸载组件并清理事件、计时器与浏览器替身。真实浏览器负责布局、焦点时序、滚动与 ECharts 绘制；断言只经 DOM、地址、存储及第三方公共 API 观察页面。业务全局 getter、TS 转经典脚本适配器和旧 HTML 渲染夹具已删除。
- **不再支持 `file://` 直开**：入口是 ES 模块，浏览器不允许从 `file://` 加载。本地用 `npm run dev` 开发，`npm run serve` 预览发布产物。

迁移完成项：

- [x] 整页 Vue 组件、共享按钮、表格与图表区块。
- [x] TypeScript 入口、业务模块、额度计算、浏览器预启动脚本与组件测试。
- [x] 显式 ES 模块与审计目录生成检查，删除经典业务脚本合并及虚拟声明设施。
- [x] Vue SSR 默认首屏与公共产物白名单。
- [x] TS 直接导入、真实 Vue 整页回归、三种浏览器测试，删除旧 VM 与全局调试桥接。

本轮完整验证结果见[变更日志](../CHANGES.md)。

## 开发与架构约定

- **脚本加载顺序**：`src/entries/theme-init.ts` 生成的经典脚本在 head 同步执行，首帧前应用主题；`src/entries/app-loader.ts` 生成的加载提示脚本在 head 中 `defer`，入口下载失败或启动中断时显示重新加载提示。两者沿用 HTML 的逻辑资源地址并在发布时按哈希改写。业务入口是 `src/main.ts`，Vite 处理其显式模块依赖；Vue 控件事件在模板声明，共享服务及导航由 `startup.ts` 显式初始化。
- **图表库按需加载**：ECharts 地址保留在 `index.html` 的 inert template 中，构建时按内容哈希另存并改写地址；首屏不执行该脚本。所有首次图表请求共用加载 Promise，重绘使用最新状态；文字明细独立渲染。章节导航等待库和已有待渲染图表，再确定滚动位置；较新的导航和回到顶部动作取消旧请求。API 两个画布按同组处理错误和重试。
- **永久套餐 ID**：每条 `PLANS` 的 `id` 一经发布便不可变、不可复用；改名称、改价、调整顺序时保留原 ID，新计划使用新 ID。额度行的 `ref` 使用此 ID，名称、币种和价格统一由引用计划引入；周期优先保留额度行的明确口径，否则沿用计划。旧 `[vendor, plan]` 引用仍可解析，仅用于兼容。`weeklyChart: false` 标记与 `PLAN_TOKENS` 档位同额度的重复行（如智谱国内版），每周 tokens 图据此排除，不靠厂商名硬编码。
- **厂商名规范**：同一厂商在 `PLANS`、`API_PRICES`、`PAYG_REFERENCES`、指标行中使用同一 `vendor` 字符串（同一厂商的不同产品线各用专名，如 腾讯云 CodeBuddy / 腾讯云 TokenHub / 腾讯云（LKEAP 知识引擎））；图表缩写由 `VENDOR_SHORT` 承担，校验器会对同厂商同型号的牌价做币种与数值交叉校验。
- **单一数据源**：类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；数据表正文、CSV 与 Markdown 共享 `PLAN_COLUMNS`，各渠道按配置选列；额度表的列定义只在 `METRICS_COLUMNS` 一处。已有继承权益均通过 `fieldRefs` 的永久 ID 明确目标，新增继承也填写目标 ID，追加权益保留且循环引用安全中止。解析器保留旧文本名称及「同上」相邻位置的兼容能力，不用它们建立新数据引用。
- **推荐元数据**：`windowPeriod` 与 `quotaSharing` 分别描述重置周期与模型额度是否共享，缺省表示未知；`codingSurface`、`includedModelQuota`、`modelAccess` 与 `purchaseCountries` 分别描述编程入口、是否包含推理、自备模型和国家限定资格。`modelBaseRef` 通过计划引用继承模型，`modelIncludes`/`modelExcludes` 显式补充和排除模型，`ownClient` 明确自家编程入口；校验器检查字段类型、引用及混合继承环。填有依据的事实，未知情况不靠条数或文案猜测。月 credits 及无 5h 上限的套餐不生成虚假的 5h 额度，官方与估算的重复周额度按稳定引用去重。
- **资源版本与发布范围**：Vite 按内容哈希命名入口、样式与字体；主题引导、加载提示、按需数据和 ECharts 由经典资源插件按内容哈希另存。可进入构建的源文件仅限入口、应用源码、明确登记的公开数据文件、公共图片/RSS 与 npm 依赖，`data/` 中的维护台账不会因整目录放行而进入产物。词法路径和真实路径都须满足白名单。`publicDir` 保持关闭（Vite 会原样复制隐藏文件和经链接越界的内容），开发中间件与发布构建按白名单发布：分享图来自手写静态资源 `public/img/`，变更 RSS 来自生成目录 `data/generated/`，发布 URL 保持 `img/`、`feeds/` 和 `changes.xml`。`.gitattributes` 固定文本为 LF。
- **开发环境与校验**：Node.js 22.12+（Vite 8 的要求），首次运行 `npm ci`。开发依赖固定版本并提交 lockfile。`npm run typecheck` 先检查生成目录与审计输入一致及模块分层，再以 checkJs 检查数据与工具脚本，随后以严格模式检查业务模块、Vue 组件及模板（`tsconfig.app.json`，不含 Node 类型）和 TS 公式、数据、整页与组件测试（`tsconfig.vitest.json`）。公式测试直接导入生产模块；整页回归使用真实 Vue 渲染，测试文件同样纳入严格类型检查。`npm run validate` 检查数据结构、引用、有限数字、日期和价格区间；同一套规则可校验内存候选源码。`npm test` 执行 14 个 Node 工具套件（含架构约束）和 TS / Vue 回归，包含额度公式、真实数据、真实 Vue 用户流程、HTTP 服务、审计无效输入/幂等/失败回滚、资讯与字体工具、目录生成漂移、Vue SSR 和公共产物回归。`npm run test:browser` 先生成发布产物，再对 Chromium、Firefox、WebKit 运行真实浏览器用例，覆盖图表、历史导航、服务功能及桌面/手机布局。CI 在 Linux 与 Windows 安装三种浏览器并执行各项检查，浏览器缓存键包含 lockfile 哈希；失败保留截图，首次重试才录制 trace（[Playwright 官方建议](https://playwright.dev/docs/trace-viewer#tracing-on-ci)）。本地需要追踪时显式加 `--trace on`。
- **开发资源更新**：`predev` 显式生成类型化目录；开发插件监听已登记的数据输入并更新目录。经典脚本通过 esbuild 依赖信息和内容指纹检查缓存，入口或依赖变化后失效并刷新。加载 Vite/Vitest 配置不写生产源码；测试生命周期执行 `catalog:check`，数据变更须先运行 `catalog:build`。
- **ECharts 精简包**：入口 `src/entries/echarts.ts` 只注册页面用到的图表与组件，构建时用 esbuild 打成经典脚本；新增图表类型或组件时在入口里注册。仍按经典脚本加载是为了失败可重试：Chromium 会缓存失败的动态 `import()`，同一地址重试不会再请求。
- **第三方产物出处**：`src/assets/README.md` 记录版本与来源。`npm run vendor:fonts` 将所有字体下载到暂存目录，检查 WOFF2 后按 SHA-256 内容去重并整组替换；失败保留或恢复旧目录。相同字节只存一份，CSS 保留各字重和 unicode-range 映射；成功替换时清理旧子集；构建时 Vite 按内容哈希重新命名。当前字体离线去重由 39 个文件降为 21 个，452,796 → 227,880 字节，减少约 49.7%。
- **目录交换失败**：对临时占用错误 `EPERM/EBUSY/EACCES`，每次目录改名最多尝试 5 次，等待合计不超过 375ms；其他错误直接失败。切换与恢复都失败时保留旧目录备份并报告路径，不在调用方清理中删除恢复依据。
- **调试**：给 URL 加 `?debug=1` 会在控制台跑「帮我选」的 headline 断言（`auditProfiles`），正常访问不执行。

## 生成产物与部署

`npm run build:site` 先从审计输入同步类型化目录，用 Vite 将 TS/Vue 应用构建到暂存目录，再用 Vue 服务端渲染同一个 `App.vue`，把默认条件下的推荐、价格表、免费入口、动态和 API 明细写入发布用 `index.html` 的 `#app`（标记 `data-prerendered`）。搜索引擎、链接预览和脚本执行前的访问者可直接阅读；浏览器先恢复当前 URL 与本机状态，再挂载 Vue 接管页面并移除静态标记。带筛选参数的链接在接管前隐藏默认首屏，避免先展示不匹配的推荐。SSR 使用隔离进程和浏览器边界替身，不执行图表加载或页面启动。随后从 `public/` 附带已确认变化 RSS、分享卡片图与分厂商 RSS 与 `vercel.json`，最后整目录原子替换 `.site-build/`；任一步失败都保留原来的产物。产物只允许公共白名单内的文件，测试夹具、工具、依赖、项目凭据及历史 `.vercel/output` 都不会进入。直接用 `vercel` 命令部署仓库根目录得到的是未构建的源码，页面无法运行，请用下面的 `npm run deploy`；`.vercelignore` 仍保证工具与说明文档不会被公开。

```bash
npm run build:site
npm run deploy -- --dry-run
```

实际部署使用 Node 原生 `fetch` 调用 [Vercel REST API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)，不需要将 Vercel CLI 的框架依赖带进项目。项目关联读取根目录 `.vercel/project.json`；认证优先级依次为环境变量 `VERCEL_TOKEN`、部署函数调用者的临时 `options.token`、Windows 标准路径 `%APPDATA%/com.vercel.cli/Data/auth.json` 中的现有 CLI 登录 token。回退只读取这一个明确位置，不递归搜索其他凭据；`--dry-run` 无需关联项目，不读取认证或请求网络。凭据只用于授权头，响应或错误中回显的 token 会脱敏，不写入产物或日志。`npm run deploy` 创建预览部署，`npm run deploy -- --prod` 发布生产；仅在部署达到 READY 后报告成功。

此部署脚本读取现有 token，不自动刷新 CLI 的 OAuth 登录会话。返回 401/403 时先检查账号的项目权限和凭据有效期；必要时使用[官方 CLI 登录](https://vercel.com/docs/cli/login)（`npx vercel login`）更新会话，或在运行环境提供有效 `VERCEL_TOKEN` 后重试。不要把 token 写进仓库、README 或公开产物。发布后访问正式域名，核对资源版本和桌面/手机核心操作；Vercel 的部署专属网址可能受登录保护。

GitHub Pages 作为第二个公开部署入口：[coding-plan-comparison](https://yufeng97.github.io/coding-plan-comparison/)。Source 使用 **GitHub Actions**。[Pages 工作流](../.github/workflows/pages.yml) 等待 `main` 推送的 CI 必需检查成功（含 Linux／Windows 三种浏览器），明确检出该次 CI 通过的 `head_sha`，再检查和构建 `.site-build/`。依赖审计为独立非阻断作业，公告或 registry 故障会在该作业报告，不影响其他检查与 Pages 发布。手动发布也要求同一提交已有成功的 CI；PR、失败或取消的 CI 不发布。构建作业只读代码、CI 状态与 Pages 配置，安装依赖时禁用安装脚本，并在上传前移除 Vercel 专用配置。发布作业使用 `pages: write` / `id-token: write`，无需个人 token 或 Vercel 凭据。Actions 固定到完整 SHA，由 Dependabot 每周检查更新。

两个站点共用页面中的 CSP（禁止内联脚本）与 Referrer Policy；主题引导使用外链脚本。Vercel 额外通过响应头提供 `frame-ancestors`、X-Frame-Options、nosniff 和 Permissions-Policy。原生 GitHub Pages 不解释 `vercel.json`，meta CSP 也不支持 `frame-ancestors`，因此这些响应头仍是部署平台差异；若要求完全对齐，应使用可配置响应头的代理或统一托管平台。

页面资源、字体、按需数据和站内链接使用相对路径，支持 `/coding-plan-comparison/` 项目子目录。Vercel 继续作为主站，公开项目配置与 RSS 内的正式地址保持其现有域名。Pages 的 `github-pages` 环境链接指向该次实际发布地址；在仓库 Actions 中确认工作流成功后，再核对 Pages 首页、模型评测按需下载和手机价格卡片。

浏览器测试首次使用前运行 `npx playwright install chromium firefox webkit`；Linux 若缺系统依赖，可使用 `npx playwright install --with-deps chromium firefox webkit`。CI 自动安装三种浏览器和所需依赖。仅检查一个引擎可运行 `npm run test:browser -- --project=chromium`（也可指定 `firefox` 或 `webkit`）。生成的站点、Playwright 报告和测试截图均已加入 `.gitignore`。
