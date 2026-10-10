# 数据维护手册

核价、资讯巡检、新厂商收录、模型评测与贡献者验收的操作流程。站点使用说明见 [README](../README.md)，代码结构与发布见 [架构与发布](architecture.md)，提交格式见 [贡献指南](../CONTRIBUTING.md)。

## 逐条价格核查

2026-10-04 对全部 **258 条**价格记录逐条核查，共记录 **105 个官方来源**。结果为：179 条价格一致、40 条记录校正（价格、币种、周期或计费说明）、8 条需询价、7 条确认停售、24 条仍待核实。官网未公开金额、访问失败、现行与历史套餐无法对应或官网口径冲突时，保留历史值与具体原因；不以搜索摘要或第三方榜单填补现行官网报价。

已校正 Cursor 印度档 ₹649 原币、Google AI Plus 美国价格、Z.ai V3 月价及年付、Cursor Teams/Lovable/Bolt/智谱/TRAE 年付、CodeBuddy 企业公开席位价和 SiliconFlow 模型牌价。首购促销、连续包月、年付折月、税费及处理费分开注明。Kiro 个人每用户订阅保留个人资格；不会因写有「per user」而归作团队档。

- `js/data.js` 的 `PRICE_CHECKS` 使用永久计划 ID、API/PAYG 的厂商及模型标识，记录状态、日期、来源和说明。页面来源列与页脚、比较及 CSV/Markdown 导出显示这些信息。
- 待核实历史价退出推荐、免费入口和价格/性价比图；公开标价表默认收起待核价格与中转站，打开「含中转站与待核价格」后仍可查看和导出。未列年付价的套餐不进入年付价格图。
- 完整旧值、新值、官网观察、修正与原因见 [JSON 台账](../audit/pricing-verification-2026-10-04.json) 和 [CSV 台账](../audit/pricing-verification-2026-10-04.csv)。`pricing-inventory.json` 保留本轮核查前库存；四份厂商分组 JSON 是同步输入。
- 完成整批价格复核并修改核查输入后，运行 `node scripts/build/sync-pricing-audit.js`，再运行 `npm run validate`、`npm test` 和 `npm run bump`；日常增量维护见下文。同步器不联网；候选源码在内存中通过完整数据校验后，才暂存并提交 `data.js` 与 JSON/CSV 台账。任一文件写入或替换失败会回滚整组输出，回滚受限时保留原文件备份并报告路径。核查日期只推进整份数据的版本日期，不会覆盖较新的巡检版本；重复同步没有变化时不写入。校验器拒绝遗漏、重复、无来源、无效日期、非法价格和模型继承环。
- 参考汇率用 `npm run rates:update`（可加 `--date YYYY-MM-DD`、`--dry-run`）从 Frankfurter 取欧洲央行参考汇率，只改 `js/data.js` 的汇率常量、`META.rateAsOf`/`rateSource` 与 `index.html` 的静态汇率；候选数据先通过校验再原子写入，与核价同步共用 `audit/.pricing.lock`，拒绝早于当前日期的汇率和明显异常的值。更新后依次运行 `npm run maintenance:build`、`npm run validate`、`npm test` 与 `npm run bump`；汇率变化会改变所有人民币折算结果，需要随数据巡检一起复核。

## 最新资讯如何更新

页面是静态站点：浏览器展示 `js/data.js` 中的 `DYNAMICS`，不会替访客实时抓取互联网。此前的巡检流程是维护者或执行巡检的代理查找新闻、访问官网定价/额度/更新日志、判断是否影响购买，再修改数据和 `CHANGES.md`。动态中的 `checked: true` 表示本站核对记录，`date` 是核对日；普通事件的 `date` 应是已确认的事件日期。`SOURCES` 是阅读与核查来源，`PRICE_CHECKS` 是逐条价格核查台账，包含已核实、待核实、停售及询价状态；它们本身都不是爬虫。`sync-pricing-audit.js` 只把准备好的审计输入同步入库。

现已增加 [资讯采集脚本](../scripts/news/collect-news.js)，把发现线索这一步脚本化。它使用 Node.js 22+ 原生 `fetch`，无需新增依赖或搜索 API 密钥。流程如下：

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

默认来源配置在 [config/news-sources.json](../config/news-sources.json)：23 个来源。模型发布入口包括 OpenAI、Mistral、Google 官方 RSS，以及 Anthropic、MiniMax、Kimi、DeepSeek、Z.ai 官方博客；保留产品页面、GitHub 更新日志、三个 Hacker News 搜索和中文发现源。`authority: "official"` 表示来源渠道是官网，仍需核对具体事实；`"discovery"` 表示发现线索，不能替代官网报价。支持 `rss`、`atom`、`blog`、`page`、`hn-search`，使用 `keywords` 扩展关键词；默认识别常见模型系列与版本，无需新闻包含套餐或价格字样。

`blog` 从目录逐篇读取同源文章，不再仅记录整页哈希变化。`articlePaths` 是首尾锚定的 URL 路径正则数组，默认最多 20 篇（可设 `maxArticles`，上限 40）；首次采集也读取已有文章，再按真实发布日期筛选窗口。文章使用 JSON-LD 的 `datePublished`、发布元数据或正文 `time`；没有发布日期的候选保留 `dateStatus: "missing"`，来源报告单列 `missingPublicationDates`，不能用采集日或修改日补齐。未来时间单列 `futurePublicationDates`，不当作已发生事件；文章发表日也不自动等于模型首次发布日。目录或文章解析失败显式记录，部分文章失败仍保存成功候选，截断标记说明覆盖上限。xAI 直接抓取当前返回 403，Qwen 新博客尚无已验证的稳定入口，仍需周期性官方搜索补充。

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

已配置北京时间每日 08:30 在 Codex 当前聊天自动巡检（任务名：Coding Plan 每日资讯与数据巡检），保存待审报告与来源健康；无可行动变化时保持安静，发现值得复核的产品、连续来源失败或到期事件才通知。需电脑开机、应用运行且项目可访问；自动化状态和时间在 Codex 中管理（[官方说明](https://learn.chatgpt.com/docs/automations?surface=app)）。仓库另提供可手动触发的 [GitHub Actions 采集工作流](../.github/workflows/news-collect.yml)：恢复队列/基线缓存、上传报告 artifact，部分失败仍保留报告并标记失败。代码仓库为 [yufeng97/coding-plan-comparison](https://github.com/yufeng97/coding-plan-comparison)，网站纠错模板连接该仓库的 Issues。CI 缓存与本机队列是各自工作副本，不自动双向同步；选定一个审核主副本，下载 artifact 后在该副本审核并保持后续采集使用同一队列。缓存可能被平台清除，重要待审决策须自行备份。

## 如何让新厂商进来

资讯 Actions 缓存按完整分支引用的 SHA-256 命名；旧键仅用于迁移已有队列。采集事务成功且状态结构有效后才保存新缓存，来源部分失败仍可保存已验证的候选。损坏 inbox 直接失败，损坏 state 保留原字节且不保存新缓存，两者均保留 artifact 供人工排查；请先备份和修复审核主副本，再删除对应坏缓存并重新采集，不要以清空队列代替恢复审核历史。

没有有限来源和关键词规则能保证全网零遗漏。应把“监测已收录厂商”和“发现新厂商”作为两条持续维护的入口。当前脚本不会以厂商列表过滤候选；`needsVendorReview` 只是关联提示，域名或名称匹配也可能把一个新产品关联到旧厂商，所有候选仍要检查产品身份。Hacker News 偏英文技术社区，中文新品覆盖有限；建议每周用「编程套餐 / 编程订阅 / Coding Plan / Token Plan / AI 编程助手 / coding agent」做一轮不限厂商的中文和英文搜索，并将结果导入脚本。已加入中文发现订阅源和网站的“新增厂商 / 纠错 / 提交测评”模板入口，可复制或下载，也可使用预填模板的 GitHub Issues 链接提交。来源清单可继续扩展，但不能承诺全网零遗漏。

新产品收录按以下流程执行：

1. 确认官方域名、产品是否提供编程工具入口或可接入编程 Agent 的模型调用；区分订阅、API 按量、纯工具 BYOK、免费模型和企业询价。社区提及仅作发现证据。
2. 为每个订阅档位分配未使用过的永久 `plan-*` ID，写入 `PLANS`；补全 `vendor/plan/cat/region/cur/priceM/quota/url` 等必需字段。`priceY` 是**年付折月价格**，不是年付总额；明确全年金额使用 `annualTotal`，校验要求折月误差不超过 0.02 原币。未知价格用 `null`，免费用 `0`，首购促销不能代替长期续费价。
3. 按证据填写编程入口、是否包含模型费用、BYOK/按量、自家客户端、支持模型与工具、重置周期、额度共享和购买国家。新模型未知时先保留未知，需要参与任务推荐时再补有依据的 `MODEL_ROLES`；不要因为厂商有名就推断所有产品权益相同。
4. 添加官网证据和对应 `PRICE_CHECKS.rows["plan:" + id]`；API 与按量记录按 `vendor|model` 身份同步维护。加入 `SOURCES`，有值得告知用户的事件时更新 `DYNAMICS`，随后把官方监测网址加入采集配置。只有额度依据足够时才补 `METRICS_RAW`/`ESTIMATES`，标清官方值、折算或估算。
5. 更新版本日期与 `CHANGES.md`，执行 `npm run check`、`npm run typecheck`、`npm run validate`、`npm test`、`npm run bump`、`npm run cache:check`。修改页面交互或推荐逻辑时再执行相关浏览器回归；检查构建产物后发布。

**全量与增量分开运行**：默认同步仍要求四份全量审计输入日期一致、覆盖全部记录。日常使用增量模式，只更新此次有新证据的行，保留其他行的核查日期；拒绝日期倒退、旧 patch 覆盖新值、来源 ID 的证据冲突及无证据修改。新增套餐通过 record.new 提交完整 Plan，并分配从未使用过的永久 ID。同步会原子更新数据、审计台账与变更历史，失败整组回滚；不会更新动态、来源目录或额度指标。输入字段及完整步骤见 [贡献指南](../CONTRIBUTING.md)。

核价同步与维护摘要构建共用 `audit/.pricing.lock`，互斥覆盖读取、校验、历史合并到提交全过程，维护一致性检查也参与这把锁。释放时核对唯一所有者；运行期间不得人工删除或替换锁文件。异常退出后先检查其中的主机、PID 与时间，确认没有核价或维护进程后再人工清理；脚本不会按死 PID 自动删锁。

资讯采集／复核和评测采集／发布／贡献者导入／公共构建也使用互斥锁。异常退出留下 `audit/news/.news.lock` 或 `audit/benchmark-sources/.benchmark.lock` 时，先确认没有对应操作进程后再人工清理。文件锁协调合作进程，不能抵抗运行期间外部删除或替换锁路径。

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

`list` / `triage` 独立列出 `awaitingPublication`（已接受、无需再次复核、尚未收录正式动态）和 `needsReReview`，默认 pending 筛选不会隐藏这些积压。`publication` 仅按候选 URL 与非 `checked` 的 `DYNAMICS` 来源 URL 归一后精确匹配，表示正式数据已收录；仍需验证并部署后才算线上更新。`evidencePublicationMatches` 仅供人工核对，不会因为共用定价页而误判同一事件已发布。厂商发布新的编程模型本身可以成为重要动态，无需等待套餐调价；发布消息不自动证明每个订阅档的可用模型或权益。每天巡检都须处理待收录项目，不因已接受或已通知而视为完成。

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

## 模型公开评测如何更新

[模型公开评测](https://coding-plan-comparison-tau.vercel.app/#benchmarks) 展示评测发布方的实际公开成绩。默认展示 DeepSWE，在当前协议内可选每个准确模型已公布的最佳配置或全部配置，再搜索模型/推理档位/Agent。最佳配置只指该榜已测配置中的最高分，不保证适合所有任务；不把不同评测平均成综合排名，也不据此保证某个 Coding Plan 包含该版本模型。

DeepSWE v1.1 / v1 可独立切换；分数柱状图与表格共用当前协议、配置模式和搜索结果，保留协议内原名次。排名图按模型系列稳定配色并带图例，明暗主题分别适配；前 10、前 20 或全部匹配只影响图表，导出仍保留全部筛选记录。每任务成本视图按分数名次排列，跳过未公布费用。推荐卡每类编程评测只展示最新有匹配主力任务模型成绩的协议，不借用其他日常模型的分数；标明实际版本，仍不参与推荐排序。

| 指标 | 第一方入口 | 本站保留的口径 |
|---|---|---|
| DeepSWE v1.1 / v1 | [Datacurve](https://deepswe.datacurve.ai/) | 113 个长程编程任务、pass@1、mini-swe-agent、各推理档位与置信区间；v1.1 调整隔离验收与报告，各版本独立排名；这里是评测名，不是同名开源模型 |
| CursorBench 4.0 / 3.0 发布节选 | [Cursor 官方评测](https://cursor.com/evals)、[Composer 2 发布表](https://cursor.com/blog/composer-2) | 4.0 为默认；3.0 仅含 Composer 2 / 1.5 / 1 的发布成绩，费用等未知保留 null。3.1 / 3.2 旧榜已被替换，未找到可完整核验的数据；不能补成完整历史榜或声称可复现内部评测 |
| OSWorld | [Verified](https://osworld-v1.xlang.ai/)、[2.0](https://osworld-v2.xlang.ai/) | 桌面操作任务；版本、实际样本数、步数、工具、单次/多次尝试分表，2.0 完整完成与部分得分分别展示 |
| Humanity's Last Exam | [CAIS](https://lastexam.ai/)、[Diamond](https://lastexam.ai/blog/hle-diamond) | 专家知识与推理；原版/Diamond、纯文本/多模态、high/max、无工具/web+code 分表 |
| SWE-bench Verified | [官方 Bash Only 榜](https://www.swebench.com/) | 500 个 issue 修复任务；仅 mini-SWE-agent、单次尝试及官方团队运行/核验行，小版本逐行标注 |

HLE 原版目前采用 CAIS 官网页面上的历史量化表，试题更新日为 2025-04-03；这不是最新全模型 HLE 榜。Diamond 是另一套题，不能用它的分数替代原版。Scale 的 HLE 页面对脚本返回访问限制时，不用缓存搜索摘要冒充最新成绩。OSWorld 衡量电脑操作，HLE 衡量综合知识/推理；选编程模型时优先查看 DeepSWE、CursorBench 与 SWE-bench，并结合模型在套餐中的可用资格。

采集脚本见 [scripts/benchmarks/public-scores.js](../scripts/benchmarks/public-scores.js)。它从固定的第一方页面发现同源 JSON/JS 数据块，DeepSWE 用公开 JSON 与官方价格修正表，CursorBench 安全读取 TypeScript AST 中的数据字面量，OSWorld Verified 在内存中读取受限 XLSX，其他榜单读取官方 JSON/SSR 数据。不会执行远程脚本，也不调用收费模型 API。新模型只要出现在这些官方榜单中，就会被抓取，不受订阅厂商列表限制；新增评测来源或未知协议需要扩展 adapter、官方域名登记和回归测试。

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

`collect` 只写忽略目录 `audit/benchmark-sources/`，保留原始下载 SHA-256、完整历史候选和来源连续失败；变化比较按协议/精确模型/推理/Agent 的稳定 ID，日期刷新不会冒充成绩变化。任何必需来源失败或格式改变均返回非零码，保留正式数据与上一份完整候选。`publish` 要求审核者、理由及哈希匹配的原始证据，然后原子替换 `benchmarks/public-results.json`；`benchmark:build` 生成浏览器可离线读取的 `BENCHMARKS.public`（按需加载），并从中派生首屏加载的 `js/benchmark-summary.js`：仅编程协议的每模型最佳配置与本协议名次，供「帮我选」卡片显示本档明确包含的模型成绩，只作参考、不参与推荐排序；`benchmark:check` 在 CI 只读核对两份产物。采集不直接提交或部署；可从 [手动采集工作流](../.github/workflows/benchmark-collect.yml) 下载待审材料。

核查日期是本站本次下载/核对时间，官方更新日另记；未公布的运行日、工具、费用或样本数保留未知。费用列属于评测任务或 rollout 的官方成本，DeepSWE 的部分模型按官网当前价格修正表折算，CursorBench 4.0 按公布的 token 价格计算，3.0 历史发布节选的费用未公布；不把原始费用、折算费用或未知费用混为真实账单，不等同订阅月费。不跨模型/协议推断未公布的成绩，也不把空值补成零。

## 贡献者如何跑本机任务验收

可信 checker 在解答进程之外执行断言；解答 worker 只接收函数调用参数，完成口令由 checker 在全部断言完成后输出。导入要求实际 `--solution`，重新核对哈希并验收，不能仅凭贡献者提交的 JSON 宣称通过。独立进程隔离用于保障检查流程，仍只运行维护者主动选择的可信解答，不是恶意代码安全沙箱。

固定任务在 benchmarks/tasks.json，起始代码与验收在 benchmarks/fixtures/。先把某项任务的 solution.cjs 复制到单独目录，记录相同提示词、模型/工具版本和实际生成过程，由选定模型修复，再执行：

```bash
npm run benchmark:run -- --task cached-cost --solution /你的/解答目录 --model 实际模型 --tool 实际工具 --generation-seconds 42 --cost-basis api-receipt --cost 0.12 --currency CNY --evidence https://公开的复现记录
# 人工检查解答、费用和证据后，导入脚本输出的记录
npm run benchmark:import -- --input audit/benchmarks/run-实际ID.json --solution /你的/解答目录 --reviewer 维护者
npm run benchmark:validate
npm run benchmark:build
```

示例费用仅演示参数，不能当作测评结果。命令只验收本机可信解答，不联网调用模型；导入至少需要 3 次验收、任务/解答哈希、环境、公开 HTTPS 证据和维护者审核。生成耗时由贡献者记录；同一解答重复验收的平均运行时间单独显示，不能算独立模型尝试或模型成功率。API 使用生成该解答的真实账单；订阅内/未知费用用 costBasis=included-subscription/unknown，cost 为 null，不当作免费。当前本机贡献者记录仍为空，入口折叠在公开评测下方；公开榜单中的成绩来自评测发布方，不是本站运行。验收执行解答代码，仅使用主动选择的可信本机目录。

## 中国大陆可用性登记

`js/data.js` 的 `MAINLAND_ACCESS` 只登记查到官方支持地区说明的厂商或档位：`unsupported` 表示官方支持地区不含中国大陆，`restricted` 表示服务可用但部分模型受模型供应商的地区限制。每条需要 HTTPS 官方来源、核查日期和一句官方说明摘要；`planIds` 省略时适用该厂商全部档位。未登记的国际档在页面与导出中显示「未核实官方支持地区」，不按厂商名推测，也不写绕过限制的方法。国内档（region 为 cn）显示为国内服务。校验器检查字段、日期、来源、档位归属和重复覆盖。

## 变更订阅与关注同步

`npm run maintenance:build` 除 `changes.xml` 外，还为每个在库厂商生成 `feeds/<slug>.xml`：slug 由厂商名的 ASCII 片段加 SHA-256 前 8 位组成，映射写入维护摘要的 `feeds` 字段，页面「我的关注」只为已关注套餐的厂商列出订阅链接。条目描述使用中文字段名，链接打开数据表并搜索该档（含中转站与待核价格）。厂商改名或移除后，检查模式报告多余文件，生成模式在写入成功后清理。

同一命令还生成首屏摘要 `js/maintenance-summary.js`（复查间隔与套餐变更 ID，约 1.5 KB），导航「我的关注」据此显示已关注套餐的未读变更数，价格表核查日期据此标出超过复查间隔的记录，都不必下载完整维护数据。

关注与已读记录仍只存在浏览器本机。「复制关注同步链接」生成 `?follow=plan-…#updates`，只包含永久套餐 ID；在另一台设备打开后由用户确认合并，启动时地址栏会去掉该参数。
