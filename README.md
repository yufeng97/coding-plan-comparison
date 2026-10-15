# Coding Plan 全球比价中心

**简体中文** | [English](README.en.md)

国内外在售 AI Coding Plan（编程订阅计划）的价格、token 额度与公开评测对比页面。

- 主站：[coding-plan-comparison-tau.vercel.app](https://coding-plan-comparison-tau.vercel.app/)；备用：[GitHub Pages](https://yufeng97.github.io/coding-plan-comparison/)（内容相同，一处较慢时可换另一处）
- 纠错与收录：[项目 Issues](https://github.com/yufeng97/coding-plan-comparison/issues)，网站按贡献类型预填标题与证据模板

固定导航按「选套餐 / 模型评测 / 我的关注」三项任务浏览，页头的「章节」下拉在选套餐视图里随时跳到任一章节；来源说明与提交纠错在页脚。

每条价格附官网核查日期和来源；国际档标注有官方说明的中国大陆可用性（如官方支持地区不含中国大陆），没有官方说明的标「未核实」。

## 文档

| 文档 | 内容 |
|---|---|
| [架构与发布](docs/architecture.md) | 页面结构、文件职责、开发约定、构建与部署 |
| [数据维护手册](docs/maintenance.md) | 每日自动更新、逐条核价、资讯巡检、新厂商收录、模型评测、中国大陆可用性登记与变更订阅 |
| [贡献指南](CONTRIBUTING.md) | 增量核价输入格式、新套餐字段与提交流程 |
| [变更日志](CHANGES.md) | 数据核查与代码修复批次 |

## 数据覆盖

「帮我选」直接展示工具、任务与「额度 / 模型能力 / 价格」优先条件，付款方式用当前口径摘要并可展开修改。

推荐卡下方并排列出前 3 档的：

- 月费；
- 主力模型；
- 额度参考下限；
- DeepSWE v1.1 名次。

推荐规则收在「推荐规则与口径」里。卡片首层保留首次付款、续期简句、理由和操作；12 个月费用情景、评测与档位表合并在可展开详情中。具体 GLM / GPT Sol、Luna、Astra 版本以本档明确模型列表为准，Cursor 的复杂模型按量池另行提示总费用。

「我的关注」优先显示关注与变更，核查统计和公开 JSON 下载收在后方详情中。

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI The X Subscription（Grok + Cursor + X，2026-10-12 起取代 SuperGrok 与 Cursor 新购档）、Mistral、智谱 BigModel 与 Z.ai 的 GLM Coding Plan（V1/V2/V3）、月之暗面 Kimi、MiniMax、小米 MiMo、阶跃 Step Plan 等
- **第三方工具与中转站**：GitHub Copilot、Cursor（原个人与团队档现仅老用户续费）、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、AWS Kiro、Factory Droid、Canopy Wave、OpenCode、Command Code、腾讯 CodeBuddy、字节 Trae、百度文心快码、ZenMux（API 聚合平台），以及 R4 Coder、PackyCode、AICodeMirror、88code、DuckCoding、AIGoCode、DevPass、Chutes 等 API 中转站
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts、讯飞星辰 Astron Coding Plan 等
- **API 按量计费**：主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

<!-- readme-stats:coverage -->
数据版本：**2026-10-14**；覆盖 57 家厂商、220 档订阅计划、28 个免费档（去掉已停售和同一订阅的重复入口后，18 个是可用的编程工具免费档或免费模型入口）、84 行套餐额度深度对比（官方数据 + 标注置信度的估算）、38 行 API 定价（37 款模型），另有 10 行 API 按量对照。免费入口可按国内／国际和是否含免费推理组合筛选；BYOK/按量推理的费用会单独注明。页面与导出的更新日期指整份数据的版本日期；每条价格另记官网核查日期和结果。
<!-- /readme-stats:coverage -->

<!-- readme-stats:benchmarks -->
模型公开评测独立于价格版本：**2026-10-13 核查**，5 类评测、87 个独立协议、472 条成绩（DeepSWE v1.1 70、v1 29；CursorBench 4.0 68、3.0（历史发布节选） 3；OSWorld 224；HLE 48；SWE-bench 30）。同一模型的多个配置和 OSWorld 的完整/部分得分均各算一条，不表示 472 个模型；版本、样本分母、工具与步骤预算不同不混排。历史节选仅覆盖官方表格中的模型，不是完整历史排行。
<!-- /readme-stats:benchmarks -->

## 每日自动更新

数据更新与发布由 GitHub Actions 定时完成（北京时间）：

- **08:17 新闻候选采集**（[news-collect.yml](.github/workflows/news-collect.yml)）：
  - 无需 Claude 凭据，采集最近 14 天的新闻并保留队列、页面基线与来源健康；也可手动调整时间窗口。
  - 报告在运行的 artifact 中下载。采集不会修改正式数据或发布网站，核实后由维护者提交、审核并合并。
- **08:30 汇率与评测**（[daily-data.yml](.github/workflows/daily-data.yml)）：
  - 欧洲央行参考汇率有变化时，先在候选分支跑完整 CI（Linux／Windows、三种浏览器），通过后自动合入 `main` 并发布。
  - 公开评测从固定的官方榜单采集，成绩有新增、变化或撤回时开 PR，由维护者核对后合并。
- **09:00 价格与资讯**（[daily-inspection.yml](.github/workflows/daily-inspection.yml)，可选，需配置 Claude 凭据）：
  - Claude Code 采集资讯，逐条打开官网核实价格、套餐和模型发布，只改数据文件，然后开 PR。
  - 网页内容可能含提示注入，因此 PR 须由维护者核对官方链接后合并。
- **发布**：`main` 上通过完整 CI 的提交自动发布到 GitHub Pages；配置 Vercel 凭据后，主站同时发布。

价格要核对官网原文，所以不会未经复核直接上线。启用步骤、所需密钥和仓库设置见 [数据维护手册](docs/maintenance.md#每日自动更新)。

## 使用方式

直接访问[主站](https://coding-plan-comparison-tau.vercel.app/)即可。本地运行见下方[本地开发](#本地开发)：页面由 Vite 构建，不再支持双击 `index.html` 以 `file://` 打开。

### 分享与回访

以下内容实时写入地址栏参数：

- 筛选/排序状态：
  - 帮我选的预算、地区、工具、任务、支付方式与推荐优先；
  - 数据表是否显示中转站与待核价格；
  - 各区是否应用选购条件；
  - 数据表搜索与额度表筛选；
  - 个人价格图的显示全部状态；
- 对比选择；
- 工作量计算条件。

点击「复制方案链接」即可分享同一套结果，「复制推荐摘要」可得到能直接贴到聊天的纯文本；刷新不丢状态。

「保存常用条件」在本机保存一套条件，可恢复或删除；浏览器限制存储时提供操作反馈。

国家限定套餐不参与通用推荐，在完整数据表中标注适用国家；旧链接的 `country` 参数会自动清理。

### 支付与筛选

「帮我选」可选月付标价、自动续费或年付，以所选方式的月均费用匹配月预算，同时显示首次付款、按当前价续期及连续使用 12 个月的费用情景。

- **月付标价**沿用目录口径，其优惠条件仍须核对备注。
- **自动续费**采用有证据的 `autoRenewMonthly`；普通月订阅未单列续费价时，按标价作预算上限并标明估算。
- **年付**优先采用结构字段 `annualTotal` 的全年金额，校验要求其折月与 `priceY` 一致；只有折月价时标明总额为估算，并提醒一次支付全年。

个人价格图、满额成本排行、额度表、价格表均可应用／取消选购条件，与原有搜索、类别等条件叠加；任务偏好只影响推荐排序。

应用选购条件后：

- 价格图与套餐额度成本使用所选支付方式；
- 价格表保留目录列，并提供「所选支付月均」排序；
- 导出同步保留口径。

取消或清除后恢复各区独立筛选。年付图只显示已公布年付价的套餐。

搜索支持以空格分隔多个关键词，各词均匹配才保留记录，并支持常用中英文产品别名；搜索与分享参数最多 200 字符。

### 对比与完整权益

推荐卡和数据表均可加入 2–4 档**并排对比**（只选 1 档时提示继续选择），逐档移出或清空后键盘焦点回到可用控件。

对比窗口支持独立复制 Markdown、导出 CSV，保留选择顺序；筛选表也可导出 CSV / 复制 Markdown。两种导出均保留：

- 计价单位；
- 数据更新日期；
- 汇率；
- 核价来源；
- 完整继承权益。

点击「完整权益」查看未截断的套餐资料；窗口支持键盘关闭、焦点恢复及无原生 dialog 环境的降级。差异字段与相同计价单位下的最低价会标出；空筛选结果禁用导出并提供恢复入口。

### 按工作量估算

真实用量有两种导入方式：

- 从 ccusage 导入（`npx ccusage@latest daily --json`）；
- 直接选择 Claude Code / Codex 的 `.jsonl` 会话日志：可多选或整个选择日志文件夹，按消息或会话累计快照去重，只在本页解析，较大的内容在后台 Worker 中解析。

导入后自动换算输入占比、缓存命中率和每月使用天数。缓存单价留空时按官方缓存命中价计费（不含缓存写入与存储费），未录入官方缓存价的模型按普通输入价计算。

结果下方列出三项对照：

- 套餐额度对照；
- 同模型按量费用；
- 订阅回本点。

credits 月池按当前输入／缓存比例及官方 API 单价折算，其他套餐按页面基准参考下限筛选，并分别标明依据。

推荐旁的「按我的用量核对」带入预算及可精确匹配的模型，并展开 API 区计算器。

可以用轻度使用、日常开发、高强度使用预设起步，再修改：

- 每天请求数；
- 每次输入加输出的总 tokens；
- 使用天数；
- 输入占比；
- 输入缓存命中率；
- 人民币月预算。

保守／典型／乐观情景明确采用不同输入与缓存假设，各自展示预计月费及工作量上下浮动 20% 的范围；预设与情景是示例，手动编辑后相应高亮取消。

缓存单价选填并标明原币；模型、币种和核价来源沿用同一份价格数据。

套餐参考月量会说明模型是否匹配及折算假设；跨模型或假设不同的 token 数不用于保证额度够用。排行与额度表另外显示参考额度上下界对应的满额折算成本区间，主值仍按区间中点排序。

所有计算在本页完成，保存条件使用本地存储，不上传用户输入。

### 加载与阅读

发布页通过 Vue 服务端渲染生成默认推荐、价格表与免费入口，脚本执行前即可阅读；浏览器挂载同一套 Vue 组件，按当前链接和本机状态接管页面。TypeScript 入口由 Vite 打包为带内容哈希的模块。

手机默认收起长介绍，直接展示预算、地区、工具、任务与推荐优先条件；付款方式可展开。推荐卡、用量核对、分享与保存操作按同一阅读和键盘顺序排列。

价格数据、推荐、表格及文字明细先显示，ECharts 在接近图表或跳转图表章节时加载。图表失败可局部重试，主脚本失败显示重新加载入口。

## 本地开发

需要 Node.js 22.12+。首次运行 `npm ci`，之后：

```bash
npm run dev          # Vite 开发服务器（只监听 127.0.0.1，改动即时生效）
npm run serve        # 生成发布产物后用自带静态服务器预览（只监听 127.0.0.1，只提供 .site-build/ 内的文件）
npm run check        # 审计输入与生成数据脚本语法
npm run catalog:build # 修改审计数据后重新生成 src/generated/catalog.ts
npm run catalog:check # 只检查生成的目录与审计输入一致，不改文件
npm run readme:build # 数据变化后重新生成中英文 README 的统计段（readme:check 只核对）
npm run typecheck    # 数据目录一致性，严格检查全部 TS 业务模块、Vue/模板与测试，以及数据与工具脚本
npm run check:architecture # 检查前端模块循环依赖与分层边界
npm run validate     # 数据结构、引用、来源与日期
npm test             # tests/scripts/ 的 Node 工具、架构约束 + TypeScript / Vue 回归
npm run test:unit    # 公式、数据、真实 Vue 整页和组件测试（Vitest）
npm run test:browser # 构建后用 Chromium / Firefox / WebKit 运行 tests/e2e/ 的端到端回归
npm run build:site   # Vite + Vue SSR 生成发布产物 .site-build/
npm run size:check   # 检查发布产物的 brotli 体积预算（首屏 HTML、主入口、样式、ECharts）
```

### 前端结构

前端使用 Vue 3 + Vite + TypeScript：

- `src/App.vue` 排列整页，页头页脚在 `src/layouts/`。
- `src/sections/` 按帮我选、价格、对比、费用计算、评测、关注、贡献和站点说明分组。
- 跨区块复用的组件与组合式函数在 `src/components/`、`src/composables/`。
- `src/domain/` 保存无浏览器依赖的业务规则。
- `src/state/` 管共享状态与绑定状态的选择器。
- `src/browser/` 封装 DOM、URL、存储、图表与资源加载。
- `src/application/` 协调跨功能动作与页面启动。
- 单独打包的经典脚本入口在 `src/entries/`。

组件按需从具体模块导入，`check:architecture` 与 CI 检查分层方向、循环依赖和测试代码隔离。源码、Vue 模板与测试统一使用严格 TypeScript，审计数据的结构类型由 `types/catalog.d.ts` 共用。说明见 [架构与发布](docs/architecture.md#前端结构与迁移)。

### 数据与生成文件

`data/sources/` 是人工维护的审计数据。脚本生成的文件随源数据提交：

- 目录在 `src/generated/`；
- 按需数据、维护快照与 RSS 在 `data/generated/`。

`catalog:check` 防止两份内容漂移。

### 测试

- Node 工具与架构回归集中在 `tests/scripts/`，浏览器端到端用例在 `tests/e2e/`。
- TS 整页回归与测试支撑分别在 `src/regression/`、`src/test/`，组件测试继续就近放置。
- 公式和数据测试直接导入 TypeScript 模块，整页回归挂载真实 `App.vue`，浏览器回归使用真实发布产物。
- `npm test` 经 `tests/scripts/run.js` 依次执行 Node 套件，再运行 Vitest。

旧页面 VM、HTML 渲染夹具和浏览器业务全局 getter 已删除。

### 用量导入

用量文件可以合并导入；同一次导入须使用相同的日／月统计粒度，混合粒度会提示拆分导入并保留原计算条件。Claude Code 和 Codex 重复日志按消息或会话事件去重。套餐额度对照会区分当前工作量折算和页面基准参考，参考量级不作为保证可用额度。

### 修改数据后

按顺序运行三条命令（评测摘要变化后也需重新生成目录）。详细流程见 [数据维护手册](docs/maintenance.md)。

1. `npm run maintenance:build`：生成维护摘要、变更 RSS、分厂商订阅，以及导航未读提醒用的首屏摘要。
2. `npm run catalog:build`
3. `npm run readme:build`：README 中英文版本的统计段由它生成，CI 用 `readme:check` 核对。

### 样式与配置

`src/styles/index.css` 按层叠顺序导入主题、基础、页面骨架、跨区块组件、各功能与窄屏调整。其他位置：

- 组件独用的样式：各自的 `<style scoped>`；
- 字体：`src/assets/fonts/`；
- 固定 URL 的分享图：`public/`；
- 生成的 RSS：`data/generated/`。

编辑器经根目录 `tsconfig.json` 为业务代码、测试、数据与工具脚本选用各自的类型配置。

`npm run dev` 启动前显式生成目录，开发服务器监听审计输入与经典脚本依赖的变化，刷新时使用最新资源。测试命令只检查已提交目录是否一致；加载 Vite 配置不会修改源码。

## 免责声明

<!-- readme-stats:rates -->
各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.69 CNY，印度卢比按 1 INR ≈ 0.069877 CNY（同为 2026-10-12 欧洲央行参考汇率）折算，仅用于图表对比。导出保留两种汇率的数值、日期和来源；价格随官方调整，购买前以官网为准。
<!-- /readme-stats:rates -->
