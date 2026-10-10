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
| `index.html` | 页面结构 |
| `css/style.css` | 样式（亮色默认；支持暗色与跟随系统；`--cat-*` 类别色变量是图表/图例/标签的单一色源） |
| `js/data.js` | 全部数据与共享资格函数（订阅计划使用永久 ID；额度数据经 `ref` 引用 `PLANS` 的名称、币种和价格，改价只改一处） |
| `js/metrics.js` | 额度换算纯计算（`computeMetrics`、`blendPrice`、旗舰判定等；无 DOM，测试与校验器共用）。排行「旗舰」复用 `data.js` 的 `MODEL_ROLES` 正则，只另登记 Sonnet、Kimi K2.x、GPT-5.x 为非轻量主力 |
| `js/app-loader.js` | 主数据与功能脚本加载失败提示、重新加载入口 |
| `js/app-core.js` | 常量、工具、主题、统计卡、内联 SVG 图标、ECharts 按需加载及图表错误恢复 |
| `js/app-charts.js` | 五组 ECharts 渲染（API 组含两个画布）、排行/API 文字明细与免费入口卡 |
| `js/app-picker.js` | 「帮我选」推荐引擎与卡片 |
| `js/app-tables.js` | 数据表、导出与并排对比；`PLAN_COLUMNS` 共用数据表/CSV/Markdown 取值，`METRICS_COLUMNS` 共用额度表头/排序/渲染 |
| `js/app-service.js` | 方案分享、本机常用条件、完整权益窗口与工作量费用计算 |
| `js/app-init.js` | 启动、图表懒加载（IntersectionObserver）、`?debug=1` 自检 |
| `js/app-state.js` | 各区块默认状态与 URL 编解码，状态更新后统一同步网址 |
| `js/app-events.js` | 页面控件事件绑定，初始化时显式注册 |
| `libs/echarts.min.js` | ECharts 6.1.0 按需精简构建（仅柱状图 + Grid/Tooltip/Legend/Title/AxisPointer，约 519KiB） |
| `libs/fonts/` | Manrope、IBM Plex Mono 本地子集；39 个字体声明共用 21 份内容去重资产 |
| `scripts/lib/public-assets.js` | 从 HTML/CSS 发现公共资源，校验路径、生成内容哈希与原子替换 |
| `scripts/lib/paths.js` / `atomic-swap.js` | 共享的「路径是否在根内 / 封锁段」判断与目录级原子交换（暂存→备份→切换→回滚） |
| `scripts/build/` | 构建与校验工具：bump-versions、vendor-fonts、rebuild-echarts、stage-site、prerender、deploy-site、check-syntax、validate-data、sync-pricing-audit |
| `scripts/lib/page-vm.js` | 页面虚拟 DOM：按 index.html 真实顺序运行页面脚本，回归测试与构建期预渲染共用 |
| `img/` | 分享卡片图（og:image），由 build:site 随站发布 |
| `feeds/` | `npm run maintenance:build` 生成的分厂商变更 RSS |
| `scripts/server/serve.js` | 本地预览静态服务器（只监听 127.0.0.1，只读项目根内文件并拒绝隐藏路径） |
| `scripts/news/collect-news.js` | 联网采集资讯候选与页面变化；保留缓存和来源错误，不改正式数据 |
| `config/news-sources.json` / `review-calendar.json` | 官方监测、开放发现与有来源的复核日历 |
| `js/app-maintenance.js` / `*-data.js` | 时效、变更、关注、贡献和测评服务及生成的公共数据（按需加载；`benchmark-summary.js` 为首屏评测摘要） |
| `scripts/maintenance/` / `data/` | 维护摘要、真实变更历史、RSS 构建与回归 |
| `scripts/benchmarks/` / `benchmarks/` | 官方公开评测 adapter、带哈希证据的采集/审核、public-results.json 快照、固定任务验收与公共测评构建 |
| `scripts/tests/` | Node 回归套件：metrics / data-regressions / app-{history,picker,charts,tables,service} / server / tools / pricing / pricing-sync / news / runners；共享页面替身在 app-harness.js（`lazyData` 模式经页面加载器按需载入数据，可分别推进下载完成、失败与超时）；Chromium、Firefox、WebKit 用例在 scripts/tests/browser/ |
| `audit/` | 258 条价格的原始库存、分组官网证据与 JSON/CSV 合并台账；不复制到公共部署产物 |

## 开发与架构约定

- **零构建、双击可用**：页面使用按序加载的经典脚本，保留 `file://` 直开。body 中的页面脚本均带 `defer`（`theme-init.js` 仍在 head 同步执行）：页面的 `<meta http-equiv="Content-Security-Policy">` 会关闭 Chromium 的预加载扫描，同步脚本只能逐个串行下载；改为 `defer` 后线上实测首屏可交互时间约从 4.6 秒降到 2.5 秒。再加 head 预加载只能多省约 0.09 秒，单独打包收益有限，因此不引入发布专用的打包步骤。`app-loader → data.js →（maintenance/benchmark 按需数据入口）→ benchmark-summary → project-data → metrics.js → app-core → app-state → app-charts → app-picker → app-tables → app-service → app-maintenance → app-events → app-init`，以 `index.html` 实际顺序为准；服务和控件监听显式注册，初始化由 `app-init.js` 驱动。
- **图表库按需加载**：ECharts 地址保留在 `index.html` 的 inert template 中，公共资产工具仍会发现、版本化和发布它；首屏不执行该脚本。所有首次图表请求共用加载 Promise，重绘使用最新状态；文字明细独立渲染。章节导航等待库和已有待渲染图表，再确定滚动位置；较新的导航和回到顶部动作取消旧请求。API 两个画布按同组处理错误和重试。
- **永久套餐 ID**：每条 `PLANS` 的 `id` 一经发布便不可变、不可复用；改名称、改价、调整顺序时保留原 ID，新计划使用新 ID。额度行的 `ref` 使用此 ID，名称、币种和价格统一由引用计划引入；周期优先保留额度行的明确口径，否则沿用计划。旧 `[vendor, plan]` 引用仍可解析，仅用于兼容。`weeklyChart: false` 标记与 `PLAN_TOKENS` 档位同额度的重复行（如智谱国内版），每周 tokens 图据此排除，不靠厂商名硬编码。
- **厂商名规范**：同一厂商在 `PLANS`、`API_PRICES`、`PAYG_REFERENCES`、指标行中使用同一 `vendor` 字符串（同一厂商的不同产品线各用专名，如 腾讯云 CodeBuddy / 腾讯云 TokenHub / 腾讯云（LKEAP 知识引擎））；图表缩写由 `VENDOR_SHORT` 承担，校验器会对同厂商同型号的牌价做币种与数值交叉校验。
- **单一数据源**：类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；数据表正文、CSV 与 Markdown 共享 `PLAN_COLUMNS`，各渠道按配置选列；额度表的列定义只在 `METRICS_COLUMNS` 一处。已有继承权益均通过 `fieldRefs` 的永久 ID 明确目标，新增继承也填写目标 ID，追加权益保留且循环引用安全中止。解析器保留旧文本名称及「同上」相邻位置的兼容能力，不用它们建立新数据引用。
- **推荐元数据**：`windowPeriod` 与 `quotaSharing` 分别描述重置周期与模型额度是否共享，缺省表示未知；`codingSurface`、`includedModelQuota`、`modelAccess` 与 `purchaseCountries` 分别描述编程入口、是否包含推理、自备模型和国家限定资格。`modelBaseRef` 通过计划引用继承模型，`modelIncludes`/`modelExcludes` 显式补充和排除模型，`ownClient` 明确自家编程入口；校验器检查字段类型、引用及混合继承环。填有依据的事实，未知情况不靠条数或文案猜测。月 credits 及无 5h 上限的套餐不生成虚假的 5h 额度，官方与估算的重复周额度按稳定引用去重。
- **缓存版本号**：`npm run bump` 自动发现 HTML 本地资源和 CSS 的字体/导入依赖；先给依赖生成内容哈希，再更新 CSS 与 HTML 的 `?v=`。全部资源验证后才写入，替换中途失败会回滚。缺文件、越界、私有/隐藏目录（包括链接的真实目标）、非法编码或循环 CSS 引用会失败。`npm run cache:check` 只读验证，CI 不修改仓库；`.gitattributes` 固定文本检出为 LF，避免 Windows/Linux 的换行差异改变资源哈希。
- **开发环境与校验**：Node.js 22+，首次运行 `npm ci`。开发依赖固定版本并提交 lockfile。`npm run typecheck` 分别使用浏览器 `jsconfig.json` 与工具/测试 `jsconfig.node.json`；新增页面脚本自动纳入，不需手改命令。`npm run validate` 检查数据结构、引用、有限数字、日期和价格区间；同一套规则可校验内存候选源码。`npm run test` 执行 25 个 Node 套件，包含额度公式、真实数据、VM 用户流程、HTTP 服务、审计无效输入/幂等/失败回滚、资讯采集解析/新厂商/缓存/失败处理、字体去重/失败回滚、缓存与公共产物回归。`npm run test:browser` 对 Chromium、Firefox、WebKit 运行同一批真实浏览器用例，覆盖图表、历史导航、服务功能及桌面/手机布局。CI 在 Linux 与 Windows 安装三种浏览器并执行各项检查，浏览器缓存键包含 lockfile 哈希；失败保留截图；CI 首次重试才录制 trace，避免正常回归的全页快照开销（[Playwright 官方建议](https://playwright.dev/docs/trace-viewer#tracing-on-ci)）。本地需要追踪时显式加 --trace on。
- **重建精简版 ECharts**（一般不需要）：

  ```bash
  npm ci
  npm run vendor:echarts
  npm run bump
  ```
- **第三方产物出处**：`libs/README.md` 记录版本与来源。`npm run vendor:fonts` 将所有字体下载到暂存目录，检查 WOFF2 后按 SHA-256 内容去重并整组替换；失败保留或恢复旧目录。相同字节只存一份，CSS 保留各字重和 unicode-range 映射；成功替换时清理旧子集，之后运行 `npm run bump`。当前字体离线去重由 39 个文件降为 21 个，452,796 → 227,880 字节，减少约 49.7%。
- **目录交换失败**：对临时占用错误 `EPERM/EBUSY/EACCES`，每次目录改名最多尝试 5 次，等待合计不超过 375ms；其他错误直接失败。切换与恢复都失败时保留旧目录备份并报告路径，不在调用方清理中删除恢复依据。
- **调试**：给 URL 加 `?debug=1` 会在控制台跑「帮我选」的 headline 断言（`auditProfiles`），正常访问不执行。

## 生成产物与部署

`npm run build:site` 从已校验的资源图生成 `.site-build/`，只包含入口、实际引用的 `css/js/libs` 文件、已确认变化 RSS `changes.xml`、分享卡片图 `img/`、分厂商 RSS `feeds/` 与 `vercel.json`。正式构建会在页面虚拟 DOM 中运行页面脚本，把默认条件下的推荐、价格表、免费入口、动态和 API 明细预渲染进发布用 `index.html`（容器标记 `data-prerendered`）：搜索引擎、链接预览和脚本执行前的访问者可直接阅读；带筛选参数的链接在脚本按链接条件重绘前隐藏这些默认内容，启动完成后移除标记。工具、依赖、项目凭据及历史 `.vercel/output` 都不会复制。每次从源码重新生成，缓存版本不一致时拒绝生成。仓库根目录的 `.vercelignore` 是 CLI 部署路径的兜底白名单：即使有人直接用 `vercel` 命令部署（`outputDirectory: "."`），`scripts/`、README 等仓库文件也不会被公开。

```bash
npm run bump
npm run cache:check
npm run build:site
npm run deploy -- --dry-run
```

实际部署使用 Node 原生 `fetch` 调用 [Vercel REST API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)，不需要将 Vercel CLI 的框架依赖带进项目。项目关联读取根目录 `.vercel/project.json`；认证优先级依次为环境变量 `VERCEL_TOKEN`、部署函数调用者的临时 `options.token`、Windows 标准路径 `%APPDATA%/com.vercel.cli/Data/auth.json` 中的现有 CLI 登录 token。回退只读取这一个明确位置，不递归搜索其他凭据；`--dry-run` 无需关联项目，不读取认证或请求网络。凭据只用于授权头，响应或错误中回显的 token 会脱敏，不写入产物或日志。`npm run deploy` 创建预览部署，`npm run deploy -- --prod` 发布生产；仅在部署达到 READY 后报告成功。

此部署脚本读取现有 token，不自动刷新 CLI 的 OAuth 登录会话。返回 401/403 时先检查账号的项目权限和凭据有效期；必要时使用[官方 CLI 登录](https://vercel.com/docs/cli/login)（`npx vercel login`）更新会话，或在运行环境提供有效 `VERCEL_TOKEN` 后重试。不要把 token 写进仓库、README 或公开产物。发布后访问正式域名，核对资源版本和桌面/手机核心操作；Vercel 的部署专属网址可能受登录保护。

GitHub Pages 作为第二个公开部署入口：[coding-plan-comparison](https://yufeng97.github.io/coding-plan-comparison/)。Source 使用 **GitHub Actions**。[Pages 工作流](../.github/workflows/pages.yml) 等待 `main` 推送的 CI 必需检查成功（含 Linux／Windows 三种浏览器），明确检出该次 CI 通过的 `head_sha`，再检查和构建 `.site-build/`。依赖审计为独立非阻断作业，公告或 registry 故障会在该作业报告，不影响其他检查与 Pages 发布。手动发布也要求同一提交已有成功的 CI；PR、失败或取消的 CI 不发布。构建作业只读代码、CI 状态与 Pages 配置，安装依赖时禁用安装脚本，并在上传前移除 Vercel 专用配置。发布作业使用 `pages: write` / `id-token: write`，无需个人 token 或 Vercel 凭据。Actions 固定到完整 SHA，由 Dependabot 每周检查更新。

两个站点共用页面中的 CSP（禁止内联脚本）与 Referrer Policy；主题引导使用外链脚本。Vercel 额外通过响应头提供 `frame-ancestors`、X-Frame-Options、nosniff 和 Permissions-Policy。原生 GitHub Pages 不解释 `vercel.json`，meta CSP 也不支持 `frame-ancestors`，因此这些响应头仍是部署平台差异；若要求完全对齐，应使用可配置响应头的代理或统一托管平台。

页面资源、字体、按需数据和站内链接使用相对路径，支持 `/coding-plan-comparison/` 项目子目录。Vercel 继续作为主站，公开项目配置与 RSS 内的正式地址保持其现有域名。Pages 的 `github-pages` 环境链接指向该次实际发布地址；在仓库 Actions 中确认工作流成功后，再核对 Pages 首页、模型评测按需下载和手机价格卡片。

浏览器测试首次使用前运行 `npx playwright install chromium firefox webkit`；Linux 若缺系统依赖，可使用 `npx playwright install --with-deps chromium firefox webkit`。CI 自动安装三种浏览器和所需依赖。仅检查一个引擎可运行 `npm run test:browser -- --project=chromium`（也可指定 `firefox` 或 `webkit`）。生成的站点、Playwright 报告和测试截图均已加入 `.gitignore`。
