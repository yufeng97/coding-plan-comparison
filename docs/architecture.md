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
9. **API 按量计费**：模型单价与 $10 购买力图；工作量计算器按官方缓存命中价计费，可从 ccusage 导入真实用量，并反查参考额度能覆盖该用量的套餐及订阅回本点
10. **重要动态**：已核对的行业与套餐消息
11. **模型公开评测**：DeepSWE、CursorBench、OSWorld、HLE 与 SWE-bench 的官方成绩，按版本与协议筛选、图表及导出
12. **我的关注与套餐变更**：核查时效、复核日历、历史变化、本机关注、按厂商订阅 RSS 与关注同步链接
13. **帮助补全与纠错**：纠错、新厂商和测评模板
14. **数据来源与说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | HTML 外壳、`#app` 挂载点与 Vite 入口（`src/main.ts`）；主题引导、加载提示、按需数据与 ECharts 保留逻辑入口地址 |
| `src/main.ts` / `src/App.vue` | 恢复 URL 与本机状态 → 挂载整页 Vue 组件 → 启动导航、按需加载及共享服务；App 模板供浏览器与 Vue SSR 共用 |
| `src/sections/` | 全部原生 Vue 区块：推荐与控件、价格及额度图、免费入口、数据表、并排对比、完整权益、费用计算、评测、关注、贡献和来源；共用按钮及单元格组件保留原 ID、class、ARIA。`*.test.ts` 用 Vitest + happy-dom，`src/test/setup.ts` 提供真实按需数据 |
| `src/domain/runtime.ts` / `startup.ts` | TypeScript 共享状态、推荐、费用计算、URL 编解码、导出、关注、按需数据、ECharts 加载与页面启动；通过显式 ES 模块导出，组件从 `@domain/runtime` 导入 |
| `src/domain/metrics.ts` / `model-types.ts` | 额度换算纯计算与业务类型（`computeMetrics`、`blendPrice`、旗舰判定等）；无 DOM，测试与校验器共用。排行「旗舰」复用目录中的 `MODEL_ROLES` |
| `src/domain/catalog.ts` / `scripts/build/catalog-types.mjs` | 从审计数据、首屏评测摘要与公开项目配置确定性生成的类型化目录；生成文件提交，`catalog:check` 发现输入漂移时失败 |
| `src/types.d.ts` / `tsconfig.domain.json` | 数据与外部浏览器 API 类型，以及保留原空值推断语义的业务模块检查；生成 `.domain-types/`，严格 UI 检查经 `@domain/*` 读取声明，Vite 同名别名解析到实际 TS 源文件 |
| `src/browser/theme.ts` / `loader.ts` | 首帧主题与主入口加载失败提示；构建为先于应用入口执行的经典脚本，保留失败重试与 CSP 外链约定 |
| `css/style.css` | 样式（亮色默认；支持暗色与跟随系统；`--cat-*` 类别色变量是图表/图例/标签的单一色源） |
| `js/data.js` / `benchmark-summary.js` / `project-data.js` | 刻意保留的审计及维护输入；订阅永久 ID、引用权益、首屏评测摘要和公开项目配置在此维护，生成 TS 目录后进入应用 |
| `src/charts/echarts.ts` | ECharts 按需精简包入口（仅柱状图 + Grid/Tooltip/Legend/Title/AxisPointer）；构建时由 npm 包生成 `libs/echarts-<hash>.js`，版本跟随 package.json |
| `libs/fonts/` | Manrope、IBM Plex Mono 本地子集；39 个字体声明共用 21 份内容去重资产 |
| `scripts/lib/paths.js` / `atomic-swap.js` | 共享的「路径是否在根内 / 封锁段」判断、目录级原子交换（暂存→备份→切换→回滚）与逐文件替换回滚 |
| `scripts/build/` | 构建与校验工具：vite-assets（公共源白名单、经典资源哈希与 ECharts 生成）、catalog-types、vendor-fonts、stage-site、prerender、render-vue、deploy-site、check-syntax、validate-data、sync-pricing-audit |
| `src/regression/` / `src/test/page.ts` | 公式及数据直接导入 TS 模块；用户流程挂载真实 `App.vue` 并按生产顺序启动。测试只替换浏览器边界：历史、计时器、ECharts、存储、剪贴板、下载及按需数据；无旧页面外壳或渲染器 |
| `img/` | 分享卡片图（og:image），由 build:site 随站发布 |
| `feeds/` | `npm run maintenance:build` 生成的分厂商变更 RSS |
| `scripts/server/serve.js` | 发布产物预览服务器（`serve.js .site-build`；只监听 127.0.0.1，只读站点目录内的白名单文件并拒绝隐藏路径） |
| `scripts/news/collect-news.js` | 联网采集资讯候选与页面变化；保留缓存和来源错误，不改正式数据 |
| `config/news-sources.json` / `review-calendar.json` | 官方监测、开放发现与有来源的复核日历 |
| `js/maintenance-data.js` / `benchmark-data.js` | 维护和评测生成的公共数据，按需加载；状态与计算在 TS 业务模块，展示在 Vue 组件 |
| `scripts/maintenance/` / `data/` | 维护摘要、真实变更历史、RSS 构建与回归 |
| `scripts/benchmarks/` / `benchmarks/` | 官方公开评测 adapter、带哈希证据的采集/审核、public-results.json 快照、固定任务验收与公共测评构建 |
| `scripts/tests/` | 13 个 Node 工具套件：HTTP 服务、文件锁、构建、核价同步、资讯、维护及评测。Chromium、Firefox、WebKit 用例在 `scripts/tests/browser/`，通过 DOM、地址、存储和 ECharts 公共 API 检查发布产物；TypeScript 公式、数据、整页与组件测试在 `src/**/*.test.ts`，由 `npm test` 一并运行 |
| `audit/` | 258 条价格的原始库存、分组官网证据与 JSON/CSV 合并台账；不复制到公共部署产物 |

## 前端结构与迁移

经典页面逻辑到 Vue 3 + Vite + TypeScript 的迁移已经完成。整页由单一 `App.vue` 组织，各区块使用原生 Vue 模板，不用 `v-html` 包装原渲染器。经典业务脚本、合并清单、虚拟模块与 `src/legacy.d.ts` 已移除；审计数据和维护工具保留原有编辑格式。

- **模块与启动**：共享逻辑从 `@domain/runtime` 导入，只导入模块不会执行页面启动。`main.ts` 先恢复 URL、关注等本机状态，再挂载组件并调用 `startApplication`。启动与业务之间的导航回调用显式钩子连接，不依赖经典脚本全局作用域。
- **共享状态**：业务模块直接使用 Vue `reactive`；保存目录对象引用的 `cmpState` 用 `shallowReactive`，替换选择数组时保持原套餐对象身份。推荐、表格、关注与完整权益窗口读取同一份状态，Vue 拥有这些容器的 DOM。
- **按需数据与图表**：维护和评测仍按经典数据资产下载。`refreshOptionalViews` 递增 `dataRevision.maintenance` / `dataRevision.benchmark`，组件据此重算；图表加载、主题与尺寸变化通过组件登记的重绘钩子处理，卸载时释放图表资源。
- **类型边界**：组件、模板、视图模型和组件测试使用严格 TypeScript。原业务计算已经是显式 TS 模块，但 `tsconfig.domain.json` 保留原非严格推断及空值语义并执行类型检查；生成的 `.domain-types/` 供严格 UI 检查使用。生产源未用 `@ts-nocheck` 跳过检查，也不把这一阶段描述为全仓严格化。
- **审计目录**：`catalog:build` 从 `js/data.js`、`benchmark-summary.js`、`project-data.js` 确定性生成 `catalog.ts`，保留正则、资格函数、永久 ID 与明确的 `Plan[]`、核查及评测类型。生成文件应随维护输入一同提交；`catalog:check` 只检查漂移，不改仓库。维护输入变化后先重建目录再提交。
- **关注与对比按钮**：推荐、数据表、完整权益和关注列表复用 Vue 按钮组件，直接从共享状态计算选中、禁用与 ARIA；统一服务处理套餐身份与关注变更。旧同步函数不改写 Vue 所有的节点。
- **静态首屏**：`render-vue.mjs` 在隔离进程里通过 Vite 加载同一个 App，调用 Vue `renderToString`；happy-dom 仅提供浏览器 API 边界。SSR 不运行启动、图表下载或用户存储恢复。浏览器按 URL 与本机状态重新挂载；静态输出不插入关闭窗口的 Teleport 节点，避免重复 ID。
- **回归边界**：Vitest 直接导入 TS 计算；整页测试重新载入业务模块、挂载真实 App 并启动，不维护另一套 HTML。每次结束卸载组件并清理事件、计时器与浏览器替身。真实浏览器负责布局、焦点时序、滚动与 ECharts 绘制；断言只经 DOM、地址、存储及第三方公共 API 观察页面。业务全局 getter、TS 转经典脚本适配器和旧 HTML 渲染夹具已删除。
- **不再支持 `file://` 直开**：入口是 ES 模块，浏览器不允许从 `file://` 加载。本地用 `npm run dev` 开发，`npm run serve` 预览发布产物。

迁移完成项：

- [x] 整页 Vue 组件、共享按钮、表格与图表区块。
- [x] TypeScript 入口、业务模块、额度计算、浏览器预启动脚本与组件测试。
- [x] 显式 ES 模块与审计目录生成检查，删除经典业务脚本合并及虚拟声明设施。
- [x] Vue SSR 默认首屏与公共产物白名单。
- [x] TS 直接导入、真实 Vue 整页回归、三种浏览器测试，删除旧 VM 与全局调试桥接。

本轮完整验证结果见[变更日志](../CHANGES.md)。

## 开发与架构约定

- **脚本加载顺序**：`src/browser/theme.ts` 生成的经典脚本在 head 同步执行，首帧前应用主题；`loader.ts` 生成的加载提示脚本在 head 中 `defer`，入口下载失败或启动中断时显示重新加载提示。两者沿用 HTML 的逻辑资源地址并在发布时按哈希改写。业务入口是 `src/main.ts`，Vite 处理其显式模块依赖；Vue 控件事件在模板声明，共享服务及导航由 `startup.ts` 显式初始化。
- **图表库按需加载**：ECharts 地址保留在 `index.html` 的 inert template 中，构建时按内容哈希另存并改写地址；首屏不执行该脚本。所有首次图表请求共用加载 Promise，重绘使用最新状态；文字明细独立渲染。章节导航等待库和已有待渲染图表，再确定滚动位置；较新的导航和回到顶部动作取消旧请求。API 两个画布按同组处理错误和重试。
- **永久套餐 ID**：每条 `PLANS` 的 `id` 一经发布便不可变、不可复用；改名称、改价、调整顺序时保留原 ID，新计划使用新 ID。额度行的 `ref` 使用此 ID，名称、币种和价格统一由引用计划引入；周期优先保留额度行的明确口径，否则沿用计划。旧 `[vendor, plan]` 引用仍可解析，仅用于兼容。`weeklyChart: false` 标记与 `PLAN_TOKENS` 档位同额度的重复行（如智谱国内版），每周 tokens 图据此排除，不靠厂商名硬编码。
- **厂商名规范**：同一厂商在 `PLANS`、`API_PRICES`、`PAYG_REFERENCES`、指标行中使用同一 `vendor` 字符串（同一厂商的不同产品线各用专名，如 腾讯云 CodeBuddy / 腾讯云 TokenHub / 腾讯云（LKEAP 知识引擎））；图表缩写由 `VENDOR_SHORT` 承担，校验器会对同厂商同型号的牌价做币种与数值交叉校验。
- **单一数据源**：类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；数据表正文、CSV 与 Markdown 共享 `PLAN_COLUMNS`，各渠道按配置选列；额度表的列定义只在 `METRICS_COLUMNS` 一处。已有继承权益均通过 `fieldRefs` 的永久 ID 明确目标，新增继承也填写目标 ID，追加权益保留且循环引用安全中止。解析器保留旧文本名称及「同上」相邻位置的兼容能力，不用它们建立新数据引用。
- **推荐元数据**：`windowPeriod` 与 `quotaSharing` 分别描述重置周期与模型额度是否共享，缺省表示未知；`codingSurface`、`includedModelQuota`、`modelAccess` 与 `purchaseCountries` 分别描述编程入口、是否包含推理、自备模型和国家限定资格。`modelBaseRef` 通过计划引用继承模型，`modelIncludes`/`modelExcludes` 显式补充和排除模型，`ownClient` 明确自家编程入口；校验器检查字段类型、引用及混合继承环。填有依据的事实，未知情况不靠条数或文案猜测。月 credits 及无 5h 上限的套餐不生成虚假的 5h 额度，官方与估算的重复周额度按稳定引用去重。
- **资源版本与发布范围**：Vite 按内容哈希命名入口、样式与字体；仍按经典脚本加载的主题引导、加载提示、按需数据和 ECharts 由 `classic-scripts` 插件同样按内容哈希另存，不再需要 `?v=` 版本号。构建只读入 `index.html`、`src/`、`js/`、`css/`、`libs/`、`img/` 与 `node_modules/` 内的文件，词法路径和真实路径（展开 junction、符号链接后）都要满足，私有或隐藏目录不会经链接进入产物。`.gitattributes` 固定文本检出为 LF。
- **开发环境与校验**：Node.js 22.12+（Vite 8 的要求），首次运行 `npm ci`。开发依赖固定版本并提交 lockfile。`npm run typecheck` 先检查生成目录与审计输入一致，再检查 TS 业务模块并生成 `.domain-types/`，随后检查 Vue 组件及模板（`tsconfig.app.json`，严格模式且不含 Node 类型）、TS 公式、数据、整页与组件测试（`tsconfig.vitest.json`）和数据/工具脚本（checkJs）。业务模块使用单独的非严格配置保留已有推断语义；这仍是类型检查，不是跳过检查。公式测试直接导入生产模块；整页回归使用真实 Vue 渲染，测试文件同样纳入严格类型检查。`npm run validate` 检查数据结构、引用、有限数字、日期和价格区间；同一套规则可校验内存候选源码。`npm test` 执行 13 个 Node 工具套件和 TS / Vue 回归，包含额度公式、真实数据、真实 Vue 用户流程、HTTP 服务、审计无效输入/幂等/失败回滚、资讯与字体工具、目录生成漂移、Vue SSR 和公共产物回归。`npm run test:browser` 先生成发布产物，再对 Chromium、Firefox、WebKit 运行真实浏览器用例，覆盖图表、历史导航、服务功能及桌面/手机布局。CI 在 Linux 与 Windows 安装三种浏览器并执行各项检查，浏览器缓存键包含 lockfile 哈希；失败保留截图，首次重试才录制 trace（[Playwright 官方建议](https://playwright.dev/docs/trace-viewer#tracing-on-ci)）。本地需要追踪时显式加 `--trace on`。
- **ECharts 精简包**：入口 `src/charts/echarts.ts` 只注册页面用到的图表与组件，构建时用 esbuild 打成经典脚本；新增图表类型或组件时在入口里注册。仍按经典脚本加载是为了失败可重试：Chromium 会缓存失败的动态 `import()`，同一地址重试不会再请求。
- **第三方产物出处**：`libs/README.md` 记录版本与来源。`npm run vendor:fonts` 将所有字体下载到暂存目录，检查 WOFF2 后按 SHA-256 内容去重并整组替换；失败保留或恢复旧目录。相同字节只存一份，CSS 保留各字重和 unicode-range 映射；成功替换时清理旧子集；构建时 Vite 按内容哈希重新命名。当前字体离线去重由 39 个文件降为 21 个，452,796 → 227,880 字节，减少约 49.7%。
- **目录交换失败**：对临时占用错误 `EPERM/EBUSY/EACCES`，每次目录改名最多尝试 5 次，等待合计不超过 375ms；其他错误直接失败。切换与恢复都失败时保留旧目录备份并报告路径，不在调用方清理中删除恢复依据。
- **调试**：给 URL 加 `?debug=1` 会在控制台跑「帮我选」的 headline 断言（`auditProfiles`），正常访问不执行。

## 生成产物与部署

`npm run build:site` 先从审计输入同步类型化目录，用 Vite 将 TS/Vue 应用构建到暂存目录，再用 Vue 服务端渲染同一个 `App.vue`，把默认条件下的推荐、价格表、免费入口、动态和 API 明细写入发布用 `index.html` 的 `#app`（标记 `data-prerendered`）。搜索引擎、链接预览和脚本执行前的访问者可直接阅读；浏览器先恢复当前 URL 与本机状态，再挂载 Vue 接管页面并移除静态标记。带筛选参数的链接在接管前隐藏默认首屏，避免先展示不匹配的推荐。SSR 使用隔离进程和浏览器边界替身，不执行图表加载或页面启动。随后附带已确认变化 RSS `changes.xml`、分享卡片图 `img/`、分厂商 RSS `feeds/` 与 `vercel.json`，最后整目录原子替换 `.site-build/`；任一步失败都保留原来的产物。产物只允许公共白名单内的文件，测试夹具、`.domain-types/`、工具、依赖、项目凭据及历史 `.vercel/output` 都不会进入。直接用 `vercel` 命令部署仓库根目录得到的是未构建的源码，页面无法运行，请用下面的 `npm run deploy`；`.vercelignore` 仍保证工具与说明文档不会被公开。

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
