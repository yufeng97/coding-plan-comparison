# 贡献与维护

网站提供“新增厂商 / 纠错 / 测评”模板，可复制或下载，也可使用 `.github/ISSUE_TEMPLATE/` 表单；项目的真实 Issue 根地址配置在 `js/project-data.js` 的 `githubIssuesBase`。

## 发现与审核

运行 `npm run news:collect`，查看 `audit/news/latest.json`、`health.json` 与持久 `inbox.json`。`npm run news:review -- list --status pending` 列出队列；`triage --output audit/news/triage.json` 导出审核材料。pending 待审、accepted 值得继续核实、rejected 驳回、deferred 暂缓；每次决定需理由，候选内容变化需再次复核。

接受已知产品时提供 `--evidence https://官方证据 --plan-id plan-xxxx`。未知厂商可不关联已有计划，人工确认官方身份后提供 `--official-domain example.com` 与该域名官方证据。官网声明是审核者判断，脚本不会证明域名身份。accepted 不等于已核价或已发布。

模型发布优先核对厂商官方博客：确认模型版本、真实发布日期、预览/正式状态及可用入口。即使套餐没有调价，也可将影响编程选择的模型公告写入 `DYNAMICS` 和 `CHANGES.md`；价格、额度、各套餐权益仍按各自官方文档核验。日期缺失的文章继续待核，不将抓取日当发布日。新增博客源使用 `kind: "blog"` 与锚定的 `articlePaths`；先真实采集核对标题、发布日期、错误与截断，再接入日常巡检。

每日查看 triage 顶层 `awaitingPublication` 与 `needsReReview`，它们不会被默认 pending 筛选隐藏。前者必须继续完成正式动态收录、验证和部署，后者须先重新审核当前内容。`publication: "published"` 仅表示来源 URL 已出现在正式非 checked 动态，不能证明线上已更新；确认部署后再登记巡检完成。媒体候选与官方来源 URL 不同时，利用 `evidencePublicationMatches` 人工核对，不能因通用定价证据相同就关闭不同模型的事件。

第三方新闻、论坛与搜索摘要只作为线索。访问官方定价/购买页，记录原币、月付或年付总额、折月、续费、促销、税费、计价单位、地区与购买资格、可用模型/工具、额度重置与共享。未知保留未知；询价为 null，免费为 0，工具免费但 BYOK 推理收费需明确区分。

## 增量核价

输入放在 `audit/` 内。下面是模板，占位日期与 ID 必须替换，不能直接发布：

```json
{
  "sources": [{"id":"official-vendor-YYYYMMDD","url":"https://官方域名/pricing","evidence":"核实到的官网原文或浏览器观察与计价说明"}],
  "records": [{
    "kind":"plan",
    "id":"plan-实际永久ID",
    "vendor":"与PLANS完全一致的厂商名",
    "name":"套餐名称",
    "status":"verified",
    "checkedAt":"YYYY-MM-DD",
    "sourceIds":["official-vendor-YYYYMMDD"],
    "reason":"本次实际核实的内容与结论",
    "patch":{}
  }]
}
```

`status` 为 verified / changed / unverified / custom / retired。无需改价也可用空 patch 记录实际核查；unverified 不允许修改事实。若有变更，提交 allowed 字段的 patch，并为每个实际改值的字段在 `old` 中提供当前值；新增可选字段用 `old: {"字段名": null}`，缺少基值或基值不匹配会拒绝同步，避免同日旧审计覆盖新值。价格 Y 表示年付折月；来源 ID 不可用来覆盖另一份证据，新核查分配新来源 ID。已有记录 ID、vendor、类别和地区不通过 patch 变更。记录、来源与全量批次核查日期不得晚于北京时间当日加 1 天。

可选 `singleMonthPrice` 是无需连续续费的单月购买价，须不低于目录月价；`availability: "sold-out"` 表示售罄候补，保留公开标价但退出可购买推荐；恢复销售可将该字段设为 null。`sameAs` 用永久计划 ID 指向同一订阅的主条目，保留原记录与核价历史，默认价格表、推荐、价格图和免费入口只展示主条目；主条目不能再指向另一条记录，目录月价与币种须一致。这些字段可通过增量 patch 或完整 new 一并核入，实际变更会保留历史。

可选 `autoRenewMonthly` 表示有官方证据的连续包月／自动续费原币月价，须为正数，并在 `note` 或该套餐关联的官方核价证据中写明续费方式与资格；未知时省略，不用月付价自动填补。它与 `priceM` 的目录月价、`priceY` 的年付折月价分别维护。首购限时优惠不得当作长期续费金额。已有注释中的价格结构化不代表重新核价，不能据此推进核查日期。

```bash
npm run pricing:sync -- --incremental --input audit/incremental.json
npm run maintenance:build
npm run benchmark:build
npm run check
npm run typecheck
npm run validate
npm test
npm run bump
npm run cache:check
npm run build:site
```

同步器拒绝遗漏行日期、日期倒退、无来源、证据冲突及不合法数据；未核查行保留原日期。数据、JSON/CSV 台账、真实差异历史一起原子提交，失败回滚。核查通过但值未变不会产生调价事件。全量模式 `npm run pricing:sync` 仅用于完成全库核实的四份分组审计，不要通过更新整批日期冒充全库复核。

## 新套餐

查阅 `js/data.js` 同类记录和 `validate-data.js` 完整 schema。给新套餐分配从未使用过的永久 `plan-*` ID，增量记录使用 `new` 提交完整 Plan（含 id/vendor/plan/cat/region/cur/priceM/priceY/seat/quota/url 等字段），其值和身份必须与记录一致。禁止复用已发布或历史记录的 ID；没有证据的额度或价格不要推算为官方数据。

另补来源目录、动态（如有事件）、官方监测 URL，以及有证据的模型/工具资格；只有有依据的额度才添加 METRICS_RAW/ESTIMATES。增量同步只处理价格与套餐事实，不会代填这些目录。执行校验、相关浏览器测试后再发布。

## 变更、关注与测评

`data/change-history.json` 是正式变化历史。旧审计种子只记录可重建的真实字段差异；不是所有 changed 状态都代表可重建的调价。新增历史保留永久记录身份和稳定 changeId，关注已读使用 changeId。不要清空历史或改 ID。`config/review-calendar.json` 仅记录有来源的复核日期，不自行断言到期后的价格。

公开模型评测先运行 `npm run benchmark:collect`，核对 `audit/benchmark-sources/latest.json`、`diff.json` 和 `health.json`。逐榜访问官方页面，核对协议版本、模型精确名称、推理档位、Agent/工具、实际样本数、费用单位和源更新日期。确认后执行 `benchmark:publish -- --input ... --reviewer ... --reason ...`；脚本必须找到下载哈希一致的原始证据。运行 validate/build/check、相关回归和缓存版本检查后再提交部署。来源失败不刷新正式日期；新增/撤回条目与同 ID 的实际成绩变化需要复核。

公开成绩的粒度是评测协议 + 准确模型 + 推理档位 + Agent。禁止把 HLE 原版、Diamond、工具/无工具、纯文本/多模态混用，也不把 OSWorld 各版本、步数、样本分母和完整/部分指标混排。新模型不依赖已有 Coding Plan 厂商白名单；不要仅根据模型名推断某个订阅的可用资格。新增来源在 `scripts/benchmarks/sources/` 提供 adapter，登记第一方固定域名/仓库路径，补离线格式变更与异常输入测试；不执行网页 JS，不用第三方聚合站填数。

费用采用官方评测每任务/rollout 口径，注明实际记录或官网价格折算；不等同 API 每百万 token 价或订阅月费。总费用缺乏重复次数/样本分母时不换算为每任务；缺值为 null，合法零分/零成本只有官方明确时才是 0。真实采集时间与官方更新日分开，原始来源哈希留在正式快照，下载缓存不进入公共部署。

贡献者固定任务和验收见 `benchmarks/`，命令见 README。记录真实提示词、环境、解答与账单公开证据。区分模型生成与验收时间；至少 3 次同一解答验收不是独立模型成功率。发布前人工核对证据，使用 `benchmark:import --input ... --solution ... --reviewer ...`，导入时核对实际解答哈希并重新验收，再运行 validate/build；当前本机贡献者记录为空，不应补随机或模拟成绩。它与官方模型公开榜单分开，页面中的贡献者工具默认折叠。

## 发布与巡检

页面交互变更执行 `npm run test:browser`，覆盖桌面/手机及键盘操作。公共构建只发布首页、公开 JS/CSS/字体与 changes.xml，不发布 audit、脚本或待审队列。`npm run deploy -- --dry-run` 检查发布清单，`npm run deploy -- --prod` 更新已有 Vercel 生产项目；线上复核首页、核心交互和 RSS。

每日看来源连续失败和待复核事件，每周做不限厂商的中文/英文搜索并处理积压，每月补实际任务样本与检查推荐假设。Codex 自动化在当前聊天管理；GitHub 手动采集工作流需远程仓库可用。报告与缓存默认忽略，审核后及时备份重要队列；CI 缓存不应充当唯一档案。
