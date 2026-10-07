# 贡献与维护

网站提供“新增厂商 / 纠错 / 测评”模板，可复制或下载。仓库配置 GitHub 后可使用 `.github/ISSUE_TEMPLATE/` 表单；把真实 Issue 根地址写入 `js/project-data.js` 的 `githubIssuesBase`。当前无远程仓库，未提供虚构的提交地址。

## 发现与审核

运行 `npm run news:collect`，查看 `audit/news/latest.json`、`health.json` 与持久 `inbox.json`。`npm run news:review -- list --status pending` 列出队列；`triage --output audit/news/triage.json` 导出审核材料。pending 待审、accepted 值得继续核实、rejected 驳回、deferred 暂缓；每次决定需理由，候选内容变化需再次复核。

接受已知产品时提供 `--evidence https://官方证据 --plan-id plan-xxxx`。未知厂商可不关联已有计划，人工确认官方身份后提供 `--official-domain example.com` 与该域名官方证据。官网声明是审核者判断，脚本不会证明域名身份。accepted 不等于已核价或已发布。

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

`status` 为 verified / changed / unverified / custom / retired。无需改价也可用空 patch 记录实际核查；unverified 不允许修改事实。若有变更，提交 allowed 字段的 patch，建议附 `old` 明确旧值，防止旧审计覆盖新值。价格 Y 表示年付折月；来源 ID 不可用来覆盖另一份证据，新核查分配新来源 ID。已有记录 ID、vendor、类别和地区不通过 patch 变更。

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

测评固定任务和验收见 `benchmarks/`，命令见 README。记录真实提示词、环境、解答与账单公开证据。区分模型生成与验收时间；至少 3 次同一解答验收不是独立模型成功率。发布前人工核对证据，使用 `benchmark:import --input ... --reviewer ...` 并运行 validate/build；当前空记录是没有实测数据，不应补随机或模拟成绩。

## 发布与巡检

页面交互变更执行 `npm run test:browser`，覆盖桌面/手机及键盘操作。公共构建只发布首页、公开 JS/CSS/字体与 changes.xml，不发布 audit、脚本或待审队列。`npm run deploy -- --dry-run` 检查发布清单，`npm run deploy -- --prod` 更新已有 Vercel 生产项目；线上复核首页、核心交互和 RSS。

每日看来源连续失败和待复核事件，每周做不限厂商的中文/英文搜索并处理积压，每月补实际任务样本与检查推荐假设。Codex 自动化在当前聊天管理；GitHub 手动采集工作流需远程仓库可用。报告与缓存默认忽略，审核后及时备份重要队列；CI 缓存不应充当唯一档案。
