# Coding Plan 全球比价中心

国内外在售 AI Coding Plan（编程订阅计划）的价格与 token 额度可视化对比页面。

正式网站：[Coding Plan 全球比价中心](https://coding-plan-comparison-tau.vercel.app/)。面向用户提供预算推荐、完整权益、并排对比、免费入口、API 工作量费用估算及有来源的模型公开评测；面向维护者保留逐条核价证据和回归检查。

## 数据覆盖

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI Grok、Mistral、智谱 BigModel 与 Z.ai 的 GLM Coding Plan（V1/V2/V3）、月之暗面 Kimi、MiniMax、小米 MiMo、阶跃 Step Plan 等
- **第三方工具与中转站**：GitHub Copilot、Cursor、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、AWS Kiro、Factory Droid、Canopy Wave、OpenCode、Command Code、腾讯 CodeBuddy、字节 Trae、百度文心快码，以及 R4 Coder、ZenMux、PackyCode、AICodeMirror、88code、DuckCoding、AIGoCode、DevPass、Chutes 等 API 中转站
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts、讯飞星辰 Astron Coding Plan 等
- **API 按量计费**：36 款主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

数据版本：**2026-10-06**；覆盖 57 家厂商、212 档订阅计划、27 个免费档（其中 20 个是编程工具免费档或免费模型入口）、84 行套餐额度深度对比（官方数据 + 标注置信度的估算）、36 行 API 定价，另有 10 行 API 按量对照。工具免费档中，BYOK/按量推理的费用会单独注明。页面与导出的更新日期指整份数据的版本日期；每条价格另记官网核查日期和结果。

模型公开评测独立于价格版本：**2026-10-08 核查**，5 类评测、85 个独立协议、438 条成绩（DeepSWE 70、CursorBench 68、OSWorld 224、HLE 46、SWE-bench 30）。同一模型的多个配置和 OSWorld 的完整/部分得分均各算一条，不表示 438 个模型；版本、样本分母、工具与步骤预算不同不混排。

## 逐条价格核查

2026-10-04 对全部 **258 条**价格记录逐条核查，共记录 **105 个官方来源**。结果为：179 条价格一致、40 条记录校正（价格、币种、周期或计费说明）、8 条需询价、7 条确认停售、24 条仍待核实。官网未公开金额、访问失败、现行与历史套餐无法对应或官网口径冲突时，保留历史值与具体原因；不以搜索摘要或第三方榜单填补现行官网报价。

已校正 Cursor 印度档 ₹649 原币、Google AI Plus 美国价格、Z.ai V3 月价及年付、Cursor Teams/Lovable/Bolt/智谱/TRAE 年付、CodeBuddy 企业公开席位价和 SiliconFlow 模型牌价。首购促销、连续包月、年付折月、税费及处理费分开注明。Kiro 个人每用户订阅保留个人资格；不会因写有「per user」而归作团队档。

- `js/data.js` 的 `PRICE_CHECKS` 使用永久计划 ID、API/PAYG 的厂商及模型标识，记录状态、日期、来源和说明。页面来源列与页脚、比较及 CSV/Markdown 导出显示这些信息。
- 待核实历史价退出推荐、免费入口和价格/性价比图；公开标价表仍可查看和导出。年付价未列时明确说明按月付展示。
- 完整旧值、新值、官网观察、修正与原因见 [JSON 台账](audit/pricing-verification-2026-10-04.json) 和 [CSV 台账](audit/pricing-verification-2026-10-04.csv)。`pricing-inventory.json` 保留本轮核查前库存；四份厂商分组 JSON 是同步输入。
- 完成整批价格复核并修改核查输入后，运行 `node scripts/build/sync-pricing-audit.js`，再运行 `npm run validate`、`npm test` 和 `npm run bump`；日常增量维护见下文。同步器不联网；候选源码在内存中通过完整数据校验后，才暂存并提交 `data.js` 与 JSON/CSV 台账。任一文件写入或替换失败会回滚整组输出，回滚受限时保留原文件备份并报告路径。核查日期只推进整份数据的版本日期，不会覆盖较新的巡检版本；重复同步没有变化时不写入。校验器拒绝遗漏、重复、无来源、无效日期、非法价格和模型继承环。

## 最新资讯如何更新

页面是静态站点：浏览器展示 `js/data.js` 中的 `DYNAMICS`，不会替访客实时抓取互联网。此前的巡检流程是维护者或执行巡检的代理查找新闻、访问官网定价/额度/更新日志、判断是否影响购买，再修改数据和 `CHANGES.md`。动态中的 `checked: true` 表示本站核对记录，`date` 是核对日；普通事件的 `date` 应是已确认的事件日期。`SOURCES` 是阅读与核查来源，`PRICE_CHECKS` 是逐条价格核查台账，包含已核实、待核实、停售及询价状态；它们本身都不是爬虫。`sync-pricing-audit.js` 只把准备好的审计输入同步入库。

现已增加 [资讯采集脚本](scripts/news/collect-news.js)，把发现线索这一步脚本化。它使用 Node.js 20+ 原生 `fetch`，无需新增依赖或搜索 API 密钥。流程如下：

1. **已知产品监测**：读取官方 RSS/Atom；对没有订阅源的官网产品、定价或更新日志页面，比较去除 script/style 等内容后的文本哈希。第一次访问建立基线，以后的文本变化生成待核查线索。
2. **开放发现**：按 Coding Plan、Coding Agent、Code Assistant 等产品关键词查询 Hacker News，搜索范围不限制为当前厂商。也可以导入中文搜索结果、社区反馈或人工发现的链接。
3. **归一化与筛选**：按时间窗口和关键词保留候选，规范网址、去除常见跟踪参数后去重，记录来源、日期及可能关联的已有厂商。未匹配已有厂商的候选保留并标记 `needsVendorReview`。
4. **人工核实与发布**：检查候选的官网、计价单位、编程入口、资格和额度，确定变更后更新数据，执行校验与测试，再提交、部署。采集器输出的是待审材料，不会直接改价格、推荐或线上内容。

### 运行脚本

```bash
# 首次安装开发依赖
npm ci

# 默认抓取最近 14 天；页面监测第一次建立基线
npm run news:collect

# 调整时间窗口或使用自己的来源配置
npm run news:collect -- --days 30 --config config/news-sources.json

# 合并人工发现/外部搜索的候选链接
npm run news:collect -- --import audit/news/manual.json

# 只运行采集器的离线回归测试
npm run test:news
```

默认来源配置在 [config/news-sources.json](config/news-sources.json)：17 个来源，包括 GitHub 与 Google 的官方 RSS、Cursor/Anthropic/智谱/Z.ai/MiniMax/Kimi/Kiro 的页面、三个 Hacker News 关键词搜索，以及少数派、InfoQ、开源中国中文发现源。`authority: "official"` 表示来源渠道是官网，仍需核对具体事实；`"discovery"` 表示发现线索，不能替代官网报价。可按相同结构增加 `rss`、`atom`、`page` 或 `hn-search` 来源，使用 `keywords` 扩展关键词。

默认报告为 `audit/news/latest.json`，同目录的 `state.json` 保留页面基线、已解析条目和条件请求缓存；`--output` 只允许写入项目 `audit/news/` 内的 JSON 报告，例如 `--output audit/news/2026-10-07.json` 保存当次报告，不能覆盖代码、配置或导入文件。`latest.json` 为滚动报告，`inbox.json` 为持久待审队列：pending / accepted / rejected / deferred，保留审核理由、官方证据、关联计划与历史决策。候选超出窗口或来源失败不会删除；内容变化会标记 needsReReview，不重复推送完全相同的内容。`health.json` 记录逐源最后成功、连续失败与缓存状态。此目录已忽略，不进入 Git 或公开部署产物。请保存状态文件：删除后页面监测会重新建立基线；CI 的临时工作目录也需要单独恢复状态。RSS/Atom 和搜索结果有窗口与条数限制，报告中需查看来源的错误和截断标记；一次执行不能当作全网检索。候选统计中的厂商待识别数量是条目数，不是确认新增的厂商数。

导入文件是 JSON 数组，字段为 `title`、`url`，可选 `publishedAt`、`summary`。例如下面是格式示例，不代表已核实产品：

```json
[
  {
    "title": "示例厂商推出 Coding Plan",
    "url": "https://example.com/coding-plan",
    "summary": "待访问官网核对的编程订阅线索"
  }
]
```

采集时间、来源提供的文章/帖子时间和官网核查时间各有含义：没有发布日期的条目会保留并标注，不用采集时间冒充发布日期；Hacker News 的时间是帖子发布时刻，可能晚于原文。网页变化只说明发现差异，不代表新增套餐或调价，动态渲染/登录后才能看到的价格仍要用真实浏览器核对。官方公告中的未来生效事件在人工核实时另外登记，当前时间窗口不会把未来条目当作已发生新闻。

单个来源超时、访问失败或解析失败不会影响其他来源，旧缓存会保留，报告记录错误且命令返回非零退出码。条件请求命中 304 时会复用条目再按当前窗口筛选。抓取采用限并发、超时和响应大小限制；遇到访问限制应登记失败、使用可访问的官方渠道或人工核对。

来源和重定向目标须为公开 HTTPS 地址。系统代理 DNS 若只返回 `198.18.0.0/15` 的 Fake-IP，采集器通过固定的 [Cloudflare DNS over HTTPS 接口](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)复核域名的公网地址，只发送待抓取域名，实际抓取仍走本机网络；复核失败会记录错误。这里做的是 DNS 预检，未将 DNS 结果固定到实际连接，不应当作面向任意不可信来源的网络隔离服务。

已配置北京时间每日 08:30 在 Codex 当前聊天自动巡检（任务名：Coding Plan 每日资讯与数据巡检），保存待审报告与来源健康；无可行动变化时保持安静，发现值得复核的产品、连续来源失败或到期事件才通知。需电脑开机、应用运行且项目可访问；自动化状态和时间在 Codex 中管理（[官方说明](https://learn.chatgpt.com/docs/automations?surface=app)）。仓库另提供可手动触发的 [GitHub Actions 采集工作流](.github/workflows/news-collect.yml)：恢复队列/基线缓存、上传报告 artifact，部分失败仍保留报告并标记失败。当前没有 Git 远程地址，因此 GitHub 工作流与 Issue 表单需推送到仓库后才能启用；本机命令可直接运行。CI 缓存与本机队列是各自工作副本，不自动双向同步；选定一个审核主副本，下载 artifact 后在该副本审核并保持后续采集使用同一队列。缓存可能被平台清除，重要待审决策须自行备份。

### 如何让新厂商进来

没有有限来源和关键词规则能保证全网零遗漏。应把“监测已收录厂商”和“发现新厂商”作为两条持续维护的入口。当前脚本不会以厂商列表过滤候选；`needsVendorReview` 只是关联提示，域名或名称匹配也可能把一个新产品关联到旧厂商，所有候选仍要检查产品身份。Hacker News 偏英文技术社区，中文新品覆盖有限；建议每周用「编程套餐 / 编程订阅 / Coding Plan / Token Plan / AI 编程助手 / coding agent」做一轮不限厂商的中文和英文搜索，并将结果导入脚本。已加入中文发现订阅源和网站的“新增厂商 / 纠错 / 提交测评”模板入口；未配置远程仓库时可复制或下载，接入 GitHub 后可切换 Issue 入口。来源清单可继续扩展，但不能承诺全网零遗漏。

新产品收录按以下流程执行：

1. 确认官方域名、产品是否提供编程工具入口或可接入编程 Agent 的模型调用；区分订阅、API 按量、纯工具 BYOK、免费模型和企业询价。社区提及仅作发现证据。
2. 为每个订阅档位分配未使用过的永久 `plan-*` ID，写入 `PLANS`；补全 `vendor/plan/cat/region/cur/priceM/quota/url` 等必需字段。`priceY` 是**年付折月价格**，不是年付总额；未知价格用 `null`，免费用 `0`，首购促销不能代替长期续费价。
3. 按证据填写编程入口、是否包含模型费用、BYOK/按量、自家客户端、支持模型与工具、重置周期、额度共享和购买国家。新模型未知时先保留未知，需要参与任务推荐时再补有依据的 `MODEL_ROLES`；不要因为厂商有名就推断所有产品权益相同。
4. 添加官网证据和对应 `PRICE_CHECKS.rows["plan:" + id]`；API 与按量记录按 `vendor|model` 身份同步维护。加入 `SOURCES`，有值得告知用户的事件时更新 `DYNAMICS`，随后把官方监测网址加入采集配置。只有额度依据足够时才补 `METRICS_RAW`/`ESTIMATES`，标清官方值、折算或估算。
5. 更新版本日期与 `CHANGES.md`，执行 `npm run check`、`npm run typecheck`、`npm run validate`、`npm test`、`npm run bump`、`npm run cache:check`。修改页面交互或推荐逻辑时再执行相关浏览器回归；检查构建产物后发布。

**全量与增量分开运行**：默认同步仍要求四份全量审计输入日期一致、覆盖全部记录。日常使用增量模式，只更新此次有新证据的行，保留其他行的核查日期；拒绝日期倒退、旧 patch 覆盖新值、来源 ID 的证据冲突及无证据修改。新增套餐通过 record.new 提交完整 Plan，并分配从未使用过的永久 ID。同步会原子更新数据、审计台账与变更历史，失败整组回滚；不会更新动态、来源目录或额度指标。输入字段及完整步骤见 [贡献指南](CONTRIBUTING.md)。

```bash
# 列出持久待审队列；accepted 只表示值得继续核实，并非自动收录
npm run news:review -- list --status pending
npm run news:review -- triage --output audit/news/triage.json

# 候选需理由；接受还需官方证据，新厂商需人工声明官网域名
npm run news:review -- review --id 候选SHA256 --status accepted --reason "官网有编程订阅，进入核价" --evidence https://厂商官网/pricing --official-domain 厂商官网

# 访问官网并准备逐条证据后，执行增量同步
npm run pricing:sync -- --incremental --input audit/incremental.json
npm run maintenance:build -- --as-of 2026-10-08
npm run benchmark:build
npm run validate
npm test
npm run bump
```

维护摘要在 data/maintenance.json，变更历史在 data/change-history.json；通过经典脚本同步到页面，保留 file:// 直开。页面显示核查时效、待核条目、复核日历和已确认变化，可下载 schemaVersion 1 的公开套餐/API/核价/历史/测评 JSON（不含本机关注和待审材料）；过期提醒不会自行改价。[changes.xml](https://coding-plan-comparison-tau.vercel.app/changes.xml) 是可订阅的已确认变更 RSS，重复构建不会产生新事件。套餐关注和已读状态保存在当前浏览器，不跨设备；RSS 阅读器可独立订阅。

## 持续维护的方向

本轮将维护方向落实为五项服务：

| 方向 | 已实现 | 持续维护重点 |
|---|---|---|
| 数据可信 | 增量核价、真实差异历史、复核日历、来源健康与持久审核队列 | 核心套餐核查时效、连续失败、待审积压和纠错时长 |
| 选购决策 | 推荐理由、工具与资格说明、预算耗尽建议及工作量费用计算 | 用用户的真实工作量检查解释是否有用，未知权益继续标未知 |
| 新品协作 | 中英文开放发现、未知厂商保留、贡献与纠错模板 | 每周做一次不限厂商的搜索，及时核实新产品身份和官方价格 |
| 模型评测 | 官方公开榜单抓取、协议分表、准确模型与推理配置、来源日期、CSV/JSON 导出；保留贡献者任务验收 | 每周检查公开榜单更新与来源故障；有真实生成证据后补本机任务记录 |
| 回访服务 | 本机关注套餐、未读变更摘要、已读操作、变更 RSS | 只提供有意义的变更，避免重复“无变化”通知 |

保持静态前端与现有校验器，把采集状态、待审材料和正式数据分别保存；多人协作和历史查询确有需求后再考虑数据库。推荐规则与估算口径公开，推广或赞助应披露，不能暗改排序。

### 模型公开评测如何更新

[模型公开评测](https://coding-plan-comparison-tau.vercel.app/#benchmarks) 展示评测发布方的实际公开成绩。默认展示 DeepSWE，在当前协议内可选每个准确模型已公布的最佳配置或全部配置，再搜索模型/推理档位/Agent。最佳配置只指该榜已测配置中的最高分，不保证适合所有任务；不把不同评测平均成综合排名，也不据此保证某个 Coding Plan 包含该版本模型。

| 指标 | 第一方入口 | 本站保留的口径 |
|---|---|---|
| DeepSWE v1.1 | [Datacurve](https://deepswe.datacurve.ai/) | 113 个长程编程任务、pass@1、mini-swe-agent、各推理档位与置信区间；这里是评测名，不是同名开源模型 |
| CursorBench | [Cursor 官方评测](https://cursor.com/evals) | 当前 4.0 任务正确性、各推理档位；内部任务/Agent 配置未完全公开，不能声称本站可复现其运行 |
| OSWorld | [Verified](https://osworld-v1.xlang.ai/)、[2.0](https://osworld-v2.xlang.ai/) | 桌面操作任务；版本、实际样本数、步数、工具、单次/多次尝试分表，2.0 完整完成与部分得分分别展示 |
| Humanity's Last Exam | [CAIS](https://lastexam.ai/)、[Diamond](https://lastexam.ai/blog/hle-diamond) | 专家知识与推理；原版/Diamond、纯文本/多模态、high/max、无工具/web+code 分表 |
| SWE-bench Verified | [官方 Bash Only 榜](https://www.swebench.com/) | 500 个 issue 修复任务；仅 mini-SWE-agent、单次尝试及官方团队运行/核验行，小版本逐行标注 |

HLE 原版目前采用 CAIS 官网页面上的历史量化表，试题更新日为 2025-04-03；这不是最新全模型 HLE 榜。Diamond 是另一套题，不能用它的分数替代原版。Scale 的 HLE 页面对脚本返回访问限制时，不用缓存搜索摘要冒充最新成绩。OSWorld 衡量电脑操作，HLE 衡量综合知识/推理；选编程模型时优先查看 DeepSWE、CursorBench 与 SWE-bench，并结合模型在套餐中的可用资格。

采集脚本见 [scripts/benchmarks/public-scores.js](scripts/benchmarks/public-scores.js)。它从固定的第一方页面发现同源 JSON/JS 数据块，DeepSWE 用公开 JSON 与官方价格修正表，CursorBench 安全读取 TypeScript AST 中的数据字面量，OSWorld Verified 在内存中读取受限 XLSX，其他榜单读取官方 JSON/SSR 数据。不会执行远程脚本，也不调用收费模型 API。新模型只要出现在这些官方榜单中，就会被抓取，不受订阅厂商列表限制；新增评测来源或未知协议需要扩展 adapter、官方域名登记和回归测试。

```bash
npm run benchmark:collect
# 查看 latest.json 的成绩、diff.json 的新增/变化/撤回和 health.json 的失败
# 访问原始官方榜单核对版本、配置、费用口径与真实数字，再登记审核
npm run benchmark:publish -- --input audit/benchmark-sources/latest.json --reviewer 维护者 --reason "已逐榜核对官方成绩、配置及来源日期"
npm run benchmark:validate
npm run benchmark:build
npm test
npm run bump
npm run cache:check
```

`collect` 只写忽略目录 `audit/benchmark-sources/`，保留原始下载 SHA-256、完整历史候选和来源连续失败；变化比较按协议/精确模型/推理/Agent 的稳定 ID，日期刷新不会冒充成绩变化。任何必需来源失败或格式改变均返回非零码，保留正式数据与上一份完整候选。`publish` 要求审核者、理由及哈希匹配的原始证据，然后原子替换 `benchmarks/public-results.json`；`benchmark:build` 生成浏览器可离线读取的 `BENCHMARKS.public`，`benchmark:check` 在 CI 只读核对产物。采集不直接提交或部署；[手动采集工作流](.github/workflows/benchmark-collect.yml) 可在配置远程仓库后下载待审材料。

核查日期是本站本次下载/核对时间，官方更新日另记；未公布的运行日、工具、费用或样本数保留未知。费用列属于评测任务或 rollout 的官方成本，DeepSWE 的部分模型按官网当前价格修正表折算，CursorBench 按公布的 token 价格计算；不把原始费用、折算费用或未知费用混为真实账单，不等同订阅月费。不跨模型/协议推断未公布的成绩，也不把空值补成零。

### 贡献者如何跑本机任务验收

固定任务在 benchmarks/tasks.json，起始代码与验收在 benchmarks/fixtures/。先把某项任务的 solution.cjs 复制到单独目录，记录相同提示词、模型/工具版本和实际生成过程，由选定模型修复，再执行：

```bash
npm run benchmark:run -- --task cached-cost --solution /你的/解答目录 --model 实际模型 --tool 实际工具 --generation-seconds 42 --cost-basis api-receipt --cost 0.12 --currency CNY --evidence https://公开的复现记录
# 人工检查解答、费用和证据后，导入脚本输出的记录
npm run benchmark:import -- --input audit/benchmarks/run-实际ID.json --reviewer 维护者
npm run benchmark:validate
npm run benchmark:build
```

示例费用仅演示参数，不能当作测评结果。命令只验收本机可信解答，不联网调用模型；导入至少需要 3 次验收、任务/解答哈希、环境、公开 HTTPS 证据和维护者审核。生成耗时由贡献者记录；同一解答重复验收的平均运行时间单独显示，不能算独立模型尝试或模型成功率。API 使用生成该解答的真实账单；订阅内/未知费用用 costBasis=included-subscription/unknown，cost 为 null，不当作免费。当前本机贡献者记录仍为空，入口折叠在公开评测下方；公开榜单中的成绩来自评测发布方，不是本站运行。验收执行解答代码，仅使用主动选择的可信本机目录。

## 使用方式

无需构建。字体已放在 `libs/fonts/`（图标为内联 SVG，无字体文件），用浏览器打开 [index.html](index.html) 即可。

**分享与回访**：筛选/排序状态（帮我选的预算、地区、工具、任务，数据表搜索，额度表筛选，以及个人价格图的显示全部状态）、对比选择和工作量计算条件实时写入地址栏参数，点击「复制方案链接」即可分享同一套结果；刷新不丢状态。「保存常用条件」在本机保存一套条件，可恢复或删除；浏览器限制存储时提供操作反馈。国家限定套餐不参与通用推荐，在完整数据表中标注适用国家；旧链接的 `country` 参数会自动清理。`file://` 直开时地址栏不可写，功能降级为当前页操作和本机条件恢复。

**对比与完整权益**：推荐卡和数据表均可加入 2–4 档**并排对比**（只选 1 档时提示继续选择），逐档移出或清空后键盘焦点回到可用控件。对比窗口支持独立复制 Markdown、导出 CSV，保留选择顺序；筛选表也可导出 CSV / 复制 Markdown。两种导出均保留计价单位、数据更新日期、汇率、核价来源和完整继承权益。点击「完整权益」查看未截断的套餐资料；窗口支持键盘关闭、焦点恢复及无原生 dialog 环境的降级。差异字段与相同计价单位下的最低价会标出；空筛选结果禁用导出并提供恢复入口。

**按工作量估算**：在 API 区展开计算器，填写每天请求数、每次输入加输出的总 tokens、使用天数、输入占比、输入缓存命中率和人民币月预算，查看预计月费、预算可覆盖总量及工作量上下浮动 20% 的情景范围。缓存单价选填，未填时按普通输入价计算；模型、币种和核价来源沿用同一份价格数据。套餐参考月量会说明模型是否匹配及折算假设；跨模型或假设不同的 token 数不用于保证额度够用。所有计算在本页完成，保存条件使用本地存储，不上传用户输入。

**加载与阅读**：手机默认收起长介绍和进阶筛选，优先显示预算与地区；进阶摘要显示当前工具和任务条件。价格数据、推荐、表格及文字明细先显示，ECharts 在接近图表或跳转图表章节时加载。图表失败可局部重试，主脚本失败显示重新加载入口。

本地预览请用项目自带的静态服务器（只监听 127.0.0.1，且不能读到项目目录以外的文件）：

```bash
npm run serve
```

## 页面结构

1. **帮我选**：按预算 / 地区 / 工具 / 任务结构（复杂、日常或两者都有），给出主计划、日常覆盖，以及预算再往上一档会解开什么。同套餐包含的日常模型标「已包含」；加购时列合计月费并遵守预算。额度周期与共享关系未公开时明确保留未知，不据此建议加购
2. **性价比排行**：按每百万 tokens 实际成本排序，三档口径可切换——默认「官方每周 tokens」（高置信，非估算，且有官方每周 tokens；不含请求折算、第三方估算）；「含官方折算」纳入 credits 面值/系数/官方区间折算的档位（中置信，≈标记）；「含全部估算」再纳入低置信估算仅供量级参考。三档都不含已停售、已下架、一次性预付和仅老用户续费。悬停标注每行的依据与置信度
3. **额度深度对比**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率（含 Command Code / 阶跃 credits 制与智谱 V1/V2/V3 各版本，附推算方法论）
4. **个人订阅价格全景**：个人档月费横向条形图（无筛选默认 20 档，可展开全部和收起；可按类别/地区筛选，月付/年付切换，统一折算人民币；一次性与每 4 周档只在数据表显示，窄屏标签缩略，点按价格柱查看完整信息；无结果时显示提示并可清除筛选）
5. **团队/企业/云厂商**：席位价与整包价对比
6. **每周可用 tokens 对比**：并列展示官方公布的周额度与明确标注的社区推算，支持地区/厂商筛选，悬停查看模型、范围与依据
7. **API 按量计费**：36 款模型每百万 tokens 输入/输出单价 + $10 购买力对比，地区颜色按模型地区分类。图例支持键盘切换，完整数值和来源可在下方明细表查看；附按工作量计算月费、预算购买力和套餐参考月量的计算器
8. **免费 Coding 入口**：20 个编程 Agent / 编程工具免费档与免费模型额度卡片，平台免费、推理另计会明确标注
9. **数据表**：公开标价记录（164 档，含明确标注的待核历史价），支持搜索/筛选/排序及核查来源
10. **重要动态**：已核对的行业与套餐消息
11. **核查与变更服务**：核查时效、复核日历、历史变化、本机关注与 RSS
12. **模型公开评测**：DeepSWE、CursorBench、OSWorld、HLE 与 SWE-bench 的官方成绩，按协议筛选及导出；附折叠的贡献者本机验收工具
13. **贡献入口**：纠错、新厂商和测评模板
14. **数据来源 + 不确定性说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 页面结构 |
| `css/style.css` | 样式（亮色默认；支持暗色与跟随系统；`--cat-*` 类别色变量是图表/图例/标签的单一色源） |
| `js/data.js` | 全部数据与共享资格函数（订阅计划使用永久 ID；额度数据经 `ref` 引用 `PLANS` 的名称、币种和价格，改价只改一处） |
| `js/metrics.js` | 额度换算纯计算（`computeMetrics`、`blendPrice`、旗舰判定等；无 DOM，测试与校验器共用） |
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
| `scripts/build/` | 构建与校验工具：bump-versions、vendor-fonts、rebuild-echarts、stage-site、deploy-site、check-syntax、validate-data、sync-pricing-audit |
| `scripts/server/serve.js` | 本地预览静态服务器（只监听 127.0.0.1，只读项目根内文件） |
| `scripts/news/collect-news.js` | 联网采集资讯候选与页面变化；保留缓存和来源错误，不改正式数据 |
| `config/news-sources.json` / `review-calendar.json` | 官方监测、开放发现与有来源的复核日历 |
| `js/app-maintenance.js` / `*-data.js` | 时效、变更、关注、贡献和测评服务及生成的公共数据 |
| `scripts/maintenance/` / `data/` | 维护摘要、真实变更历史、RSS 构建与回归 |
| `scripts/benchmarks/` / `benchmarks/` | 官方公开评测 adapter、带哈希证据的采集/审核、public-results.json 快照、固定任务验收与公共测评构建 |
| `scripts/tests/` | Node 回归套件：metrics / data-regressions / app-{history,picker,charts,tables,service} / server / tools / pricing / pricing-sync / news / runners；共享页面替身在 app-harness.js；Chromium、Firefox、WebKit 用例在 scripts/tests/browser/ |
| `audit/` | 258 条价格的原始库存、分组官网证据与 JSON/CSV 合并台账；不复制到公共部署产物 |

## 开发与架构约定

- **零构建、双击可用**：页面使用按序加载的经典脚本，保留 `file://` 直开。`app-loader → data.js → maintenance/benchmark/project-data → metrics.js → app-core → app-state → app-charts → app-picker → app-tables → app-service → app-maintenance → app-events → app-init`，以 `index.html` 实际顺序为准；服务和控件监听显式注册，初始化由 `app-init.js` 驱动。
- **图表库按需加载**：ECharts 地址保留在 `index.html` 的 inert template 中，公共资产工具仍会发现、版本化和发布它；首屏不执行该脚本。所有首次图表请求共用加载 Promise，重绘使用最新状态；文字明细独立渲染。章节导航等待库和已有待渲染图表，再确定滚动位置；较新的导航和回到顶部动作取消旧请求。API 两个画布按同组处理错误和重试。
- **永久套餐 ID**：每条 `PLANS` 的 `id` 一经发布便不可变、不可复用；改名称、改价、调整顺序时保留原 ID，新计划使用新 ID。额度行的 `ref` 使用此 ID，名称、币种和价格统一由引用计划引入；周期优先保留额度行的明确口径，否则沿用计划。旧 `[vendor, plan]` 引用仍可解析，仅用于兼容。`weeklyChart: false` 标记与 `PLAN_TOKENS` 档位同额度的重复行（如智谱国内版），每周 tokens 图据此排除，不靠厂商名硬编码。
- **厂商名规范**：同一厂商在 `PLANS`、`API_PRICES`、`PAYG_REFERENCES`、指标行中使用同一 `vendor` 字符串（同一厂商的不同产品线各用专名，如 腾讯云 CodeBuddy / 腾讯云 TokenHub / 腾讯云（LKEAP 知识引擎））；图表缩写由 `VENDOR_SHORT` 承担，校验器会对同厂商同型号的牌价做币种与数值交叉校验。
- **单一数据源**：类别色走 CSS 变量 `--cat-*`（JS 的 `refreshCategoryColors()` 在主题切换时重读）；数据表正文、CSV 与 Markdown 共享 `PLAN_COLUMNS`，各渠道按配置选列；额度表的列定义只在 `METRICS_COLUMNS` 一处。已有继承权益均通过 `fieldRefs` 的永久 ID 明确目标，新增继承也填写目标 ID，追加权益保留且循环引用安全中止。解析器保留旧文本名称及「同上」相邻位置的兼容能力，不用它们建立新数据引用。
- **推荐元数据**：`windowPeriod` 与 `quotaSharing` 分别描述重置周期与模型额度是否共享，缺省表示未知；`codingSurface`、`includedModelQuota`、`modelAccess` 与 `purchaseCountries` 分别描述编程入口、是否包含推理、自备模型和国家限定资格。`modelBaseRef` 通过计划引用继承模型，`modelIncludes`/`modelExcludes` 显式补充和排除模型，`ownClient` 明确自家编程入口；校验器检查字段类型、引用及混合继承环。填有依据的事实，未知情况不靠条数或文案猜测。月 credits 及无 5h 上限的套餐不生成虚假的 5h 额度，官方与估算的重复周额度按稳定引用去重。
- **缓存版本号**：`npm run bump` 自动发现 HTML 本地资源和 CSS 的字体/导入依赖；先给依赖生成内容哈希，再更新 CSS 与 HTML 的 `?v=`。全部资源验证后才写入，替换中途失败会回滚。缺文件、越界、私有/隐藏目录（包括链接的真实目标）、非法编码或循环 CSS 引用会失败。`npm run cache:check` 只读验证，CI 不修改仓库；`.gitattributes` 固定文本检出为 LF，避免 Windows/Linux 的换行差异改变资源哈希。
- **开发环境与校验**：Node.js 20+，首次运行 `npm ci`。开发依赖固定版本并提交 lockfile。`npm run typecheck` 分别使用浏览器 `jsconfig.json` 与工具/测试 `jsconfig.node.json`；新增页面脚本自动纳入，不需手改命令。`npm run validate` 检查数据结构、引用、有限数字、日期和价格区间；同一套规则可校验内存候选源码。`npm run test` 执行 19 个 Node 套件，包含额度公式、真实数据、VM 用户流程、HTTP 服务、审计无效输入/幂等/失败回滚、资讯采集解析/新厂商/缓存/失败处理、字体去重/失败回滚、缓存与公共产物回归。`npm run test:browser` 对 Chromium、Firefox、WebKit 运行同一批真实浏览器用例，覆盖图表、历史导航、服务功能及桌面/手机布局。CI 在 Linux 与 Windows 安装三种浏览器并执行各项检查，浏览器缓存键包含 lockfile 哈希；失败保留截图；CI 首次重试才录制 trace，避免正常回归的全页快照开销（[Playwright 官方建议](https://playwright.dev/docs/trace-viewer#tracing-on-ci)）。本地需要追踪时显式加 --trace on。
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

`npm run build:site` 从已校验的资源图生成 `.site-build/`，只包含入口、实际引用的 `css/js/libs` 文件、已确认变化 RSS `changes.xml` 与 `vercel.json`。工具、依赖、项目凭据及历史 `.vercel/output` 都不会复制。每次从源码重新生成，缓存版本不一致时拒绝生成。仓库根目录的 `.vercelignore` 是 CLI 部署路径的兜底白名单：即使有人直接用 `vercel` 命令部署（`outputDirectory: "."`），`scripts/`、README 等仓库文件也不会被公开。

```bash
npm run bump
npm run cache:check
npm run build:site
npm run deploy -- --dry-run
```

实际部署使用 Node 原生 `fetch` 调用 [Vercel REST API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment)，不需要将 Vercel CLI 的框架依赖带进项目。项目关联读取根目录 `.vercel/project.json`；认证优先级依次为环境变量 `VERCEL_TOKEN`、部署函数调用者的临时 `options.token`、Windows 标准路径 `%APPDATA%/com.vercel.cli/Data/auth.json` 中的现有 CLI 登录 token。回退只读取这一个明确位置，不递归搜索其他凭据；`--dry-run` 不读取认证或请求网络。凭据只用于授权头，响应或错误中回显的 token 会脱敏，不写入产物或日志。`npm run deploy` 创建预览部署，`npm run deploy -- --prod` 发布生产；仅在部署达到 READY 后报告成功。

此部署脚本读取现有 token，不自动刷新 CLI 的 OAuth 登录会话。返回 401/403 时先检查账号的项目权限和凭据有效期；必要时使用[官方 CLI 登录](https://vercel.com/docs/cli/login)（`npx vercel login`）更新会话，或在运行环境提供有效 `VERCEL_TOKEN` 后重试。不要把 token 写进仓库、README 或公开产物。发布后访问正式域名，核对资源版本和桌面/手机核心操作；Vercel 的部署专属网址可能受登录保护。

浏览器测试首次使用前运行 `npx playwright install chromium firefox webkit`；Linux 若缺系统依赖，可使用 `npx playwright install --with-deps chromium firefox webkit`。CI 自动安装三种浏览器和所需依赖。仅检查一个引擎可运行 `npm run test:browser -- --project=chromium`（也可指定 `firefox` 或 `webkit`）。生成的站点、Playwright 报告和测试截图均已加入 `.gitignore`。

## 免责声明

各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.71 CNY，印度卢比按 1 INR ≈ 0.070058 CNY（同为 2026-09-23 汇率）折算，仅用于图表对比。导出保留两种汇率的数值、日期和来源；价格随官方调整，购买前以官网为准。
