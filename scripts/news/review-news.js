#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { publicURL } = require("./network");
const { plainText } = require("./feed");
const { normalizeURL, readKnownVendors, readPlanReferences, resolveNewsPaths, withNewsLock, commitOutputs } = require("./collect-news");
const { STATUSES, validateInbox, summarizeInbox } = require("./inbox");

const SHARED_HOSTS = ["github.com", "github.io", "huggingface.co", "vercel.app", "netlify.app", "pages.dev", "gitlab.com", "gitlab.io", "blogspot.com"];
const SUFFIXES = ["co.uk", "com.cn", "net.cn", "org.cn", "com.au", "co.jp", "co.kr", "com.sg"];
/** @typedef {{id:string,status:string,reason:string,evidenceUrls?:string[],planIds?:string[],officialDomains?:string[]}} DecisionInput */
/** @typedef {{config:any,knownVendors:import('./collect-news').KnownVendor[],plans:Array<{id:string,vendor:string,url:string}>,now?:Date}} ReviewContext */

function officialDomain(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("官方域名不能为空");
  const host = raw.toLowerCase().trim(), parsed = publicURL("https://" + host + "/", true);
  if (parsed.hostname !== host || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || SHARED_HOSTS.includes(host) || SUFFIXES.includes(host)) throw new Error("官方域名必须是独立公开主机名；不能使用共享托管裸域或公共后缀");
  return host;
}
/* 官方证据只按完整主机名匹配（忽略 www.）：企业大域下的开发者社区、论坛等用户内容子域不随官网自动可信。
 * 其他官方子域须出现在计划/来源网址或已配置的官方采集来源中，或由复核者用 --official-domain 逐个声明。 */
function officialHostMatches(host, base) {
  return !SHARED_HOSTS.includes(base) && host === base;
}
/* 官方主机或其子域中的社区/用户内容栏目：即使复核者声明了主机，也只能当线索，不能作为官方证据。 */
const COMMUNITY_SECTIONS = [["developer.aliyun.com", "/"], ["bbs.huaweicloud.com", "/"], ["cloud.tencent.com", "/developer"]];
function communityEvidence(url) {
  const parsed = new URL(url), host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let pathname = parsed.pathname.toLowerCase();
  try { pathname = decodeURIComponent(pathname); } catch {}
  return COMMUNITY_SECTIONS.some(([section, prefix]) => host === section && (prefix === "/" || pathname === prefix || pathname.startsWith(prefix + "/")));
}
/** @param {import('./inbox').InboxItem} item @param {string[]} planIds @param {ReviewContext} context */
function trustedHosts(item, planIds, context) {
  const names = new Set([...item.vendorMatches.map((match) => match.vendor), ...context.plans.filter((plan) => planIds.includes(plan.id)).map((plan) => plan.vendor)]);
  const hosts = context.knownVendors.filter((vendor) => names.has(vendor.vendor)).flatMap((vendor) => vendor.domains);
  for (const ref of item.sources) {
    // Cached/imported labels alone cannot promote a discovery link to official evidence.
    const configured = context.config?.sources?.find((source) => source.id === ref.id && source.url === ref.url && source.authority === "official");
    if (ref.authority === "official" && configured) hosts.push(publicURL(configured.url, true).hostname.toLowerCase().replace(/^www\./, ""));
  }
  return [...new Set(hosts)];
}

/** Review decisions only mark suitability for a later manual data/audit change, never change prices.
 * @param {import('./inbox').Inbox} original @param {DecisionInput} input @param {ReviewContext} context
 * @returns {import('./inbox').Inbox} */
function applyReview(original, input, context) {
  const inbox = structuredClone(validateInbox(original)), item = inbox.items.find((value) => value.id === input.id);
  if (!item) throw new Error("找不到候选 ID：" + input.id);
  if (!STATUSES.includes(input.status)) throw new Error("复核状态必须为 pending/accepted/rejected/deferred");
  if (typeof input.reason !== "string" || !plainText(input.reason).trim() || input.reason.length > 2000) throw new Error("复核必须提供非空理由（最多2000字符）");
  const reason = plainText(input.reason), evidenceUrls = [...new Set((input.evidenceUrls || []).map((url) => { publicURL(url, true); return normalizeURL(url); }))].sort();
  const planIds = [...new Set(input.planIds || [])].sort();
  for (const id of planIds) if (!context.plans.some((plan) => typeof plan.id === "string" && plan.id === id)) throw new Error("未知计划 ID：" + id);
  const officialDomains = [...new Set((input.officialDomains || []).map(officialDomain))].sort();
  if (input.status === "accepted") {
    if (!evidenceUrls.length) throw new Error("accepted 必须提供 HTTPS 官方证据 URL");
    const trusted = [...trustedHosts(item, planIds, context), ...officialDomains];
    for (const url of evidenceUrls) {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (communityEvidence(url)) throw new Error("证据位于社区或用户内容栏目，不能作为官方证据：" + url);
      if (!trusted.some((domain) => officialHostMatches(host, domain.replace(/^www\./, "")))) throw new Error("证据主机未关联已知官方来源（按完整主机名匹配）；新厂商或其他官方子域须人工核对后用 --official-domain 声明该主机：" + url);
    }
  }
  const same = item.status === input.status && item.reason === reason && JSON.stringify(item.evidenceUrls) === JSON.stringify(evidenceUrls) &&
    JSON.stringify(item.planIds) === JSON.stringify(planIds) && JSON.stringify(item.officialDomains) === JSON.stringify(officialDomains) &&
    item.reviewedContentHash === item.contentHash && !item.needsReReview;
  if (same) return inbox;
  const now = context.now || new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("复核时间无效");
  const reviewedAt = now.toISOString();
  if (reviewedAt < inbox.updatedAt) throw new Error("复核时间不得早于队列最后更新时间");
  const decision = { reviewedAt, status: input.status, reason, evidenceUrls, planIds, officialDomains, contentHash: item.contentHash };
  item.reviewHistory.push(decision);
  Object.assign(item, { status: input.status, reason, evidenceUrls, planIds, officialDomains, reviewedAt, reviewedContentHash: item.contentHash, needsReReview: false });
  return summarizeInbox(inbox, reviewedAt);
}

const WORKFLOW = ["accepted 仅确认候选值得进入人工数据核验，不代表已核价或已写入正式数据。",
  "awaitingPublication 持续列出已 accepted、无需重新复核且尚未进入正式 DYNAMICS 的候选；不受 status 筛选隐藏。",
  "publication 仅按候选 URL 与正式非 checked 动态的来源 URL 归一后精确匹配；evidencePublicationMatches 只供人工核对，不据通用定价证据判定发布。",
  "needsReReview 候选始终单列待复核，先重新核对当前内容，再处理正式入库。",
  "已知计划填写现有 plan-id；新厂商允许 planIds 为空，人工建立计划和核价证据后再关联。",
  "新厂商官网须人工核对后用 official-domain 声明；该声明是复核者判断，脚本不保证站点身份。",
  "根据证据单独编辑正式数据与价格审计，运行数据验证/同步和回归；本命令不改价、不部署、不发消息。"];

/** @returns {Set<string>} */
function readPublishedURLs(workspace) {
  const source = fs.readFileSync(path.join(workspace, "js", "data.js"), "utf8");
  const dynamics = /** @type {Array<{url:string,checked?:boolean}>} */ (vm.runInNewContext(source + "\n;typeof DYNAMICS !== 'undefined' ? DYNAMICS : []", {}, { timeout: 2000 }));
  return new Set(dynamics.filter((item) => item && item.checked !== true && typeof item.url === "string").map((item) => normalizeURL(item.url)));
}

/** @param {import('./inbox').Inbox} inbox @param {{status?:string,id?:string,needsReReview?:boolean,publishedURLs?:Iterable<string>,now?:Date}} options */
function triageData(inbox, options = {}) {
  const checkedAt = (options.now || new Date()).toISOString(), summary = summarizeInbox(structuredClone(inbox), checkedAt);
  const publishedURLs = new Set(Array.from(options.publishedURLs || [], (url) => normalizeURL(url)));
  const scoped = summary.items.filter((item) => !options.id || item.id === options.id).map((item) => ({ ...item,
    publication: publishedURLs.has(normalizeURL(item.url)) ? "published" : "awaiting-publication",
    evidencePublicationMatches: item.evidenceUrls.filter((url) => publishedURLs.has(normalizeURL(url))) }));
  const candidates = scoped.filter((item) => (!options.status || options.status === "all" || item.status === options.status) &&
    (!options.needsReReview || item.needsReReview));
  if (options.id && !candidates.length) throw new Error("找不到符合筛选条件的候选 ID");
  const awaitingPublication = scoped.filter((item) => item.status === "accepted" && !item.needsReReview && item.publication === "awaiting-publication");
  const needsReReview = scoped.filter((item) => item.needsReReview);
  return { schemaVersion: 1, exportedAt: checkedAt, queueUpdatedAt: inbox.updatedAt, purpose: "manual-review-only", workflow: WORKFLOW,
    stats: summary.stats, candidates, awaitingPublication, needsReReview };
}

/** @param {{command:string,workspace?:string,inboxPath?:string,configPath?:string,id?:string,status?:string,reason?:string,evidenceUrls?:string[],planIds?:string[],officialDomains?:string[],needsReReview?:boolean,outputPath?:string,now?:Date,rename?:(from:string,to:string)=>void}} options */
async function runReview(options) {
  const root = options.workspace || path.join(__dirname, "..", ".."), inboxPath = options.inboxPath || "audit/news/inbox.json";
  if (path.basename(inboxPath).toLowerCase() !== "inbox.json") throw new Error("--inbox 必须指向 audit/news 内的 inbox.json");
  let files = resolveNewsPaths(root, path.join(path.dirname(inboxPath), "latest.json"), [options.configPath || "config/news-sources.json"]);
  function readInbox() { return validateInbox(JSON.parse(fs.readFileSync(files.inboxFile, "utf8"))); }
  if (options.command !== "review") {
    const inbox = readInbox();
    if (options.status && options.status !== "all" && !STATUSES.includes(options.status)) throw new Error("无效状态筛选");
    const data = triageData(inbox, { ...options, publishedURLs: readPublishedURLs(files.workspace) });
    if (options.outputPath) {
      if (options.command !== "triage") throw new Error("只有 triage 可以指定 --output");
      const target = resolveNewsPaths(files.workspace, options.outputPath, [options.configPath || "config/news-sources.json"]);
      if ([files.inboxFile, files.stateFile, files.healthFile, path.join(files.dir, inbox.reportFile || "latest.json")].some((file) => file.toLowerCase() === target.output.toLowerCase())) throw new Error("triage 输出不能覆盖采集报告或复核队列");
      commitOutputs(new Map([[target.output, Buffer.from(JSON.stringify(data, null, 2) + "\n")]]), options);
    }
    return data;
  }
  return withNewsLock(files.dir, async () => {
    const previous = readInbox();
    files = resolveNewsPaths(files.workspace, path.join(files.dir, previous.reportFile || "latest.json"), [options.configPath || "config/news-sources.json"]);
    const context = { config: JSON.parse(fs.readFileSync(path.resolve(files.workspace, options.configPath || "config/news-sources.json"), "utf8")),
      knownVendors: readKnownVendors(files.workspace), plans: readPlanReferences(files.workspace), now: options.now };
    const inbox = applyReview(previous, { id: options.id, status: options.status, reason: options.reason, evidenceUrls: options.evidenceUrls, planIds: options.planIds, officialDomains: options.officialDomains }, context);
    if (JSON.stringify(previous) === JSON.stringify(inbox)) return inbox;
    const outputs = new Map([[files.inboxFile, Buffer.from(JSON.stringify(inbox, null, 2) + "\n")]]);
    if (fs.existsSync(files.output)) {
      const report = JSON.parse(fs.readFileSync(files.output, "utf8"));
      report.queue = inbox.stats; report.lastReviewAt = inbox.updatedAt;
      outputs.set(files.output, Buffer.from(JSON.stringify(report, null, 2) + "\n"));
    }
    commitOutputs(outputs, options);
    return inbox;
  });
}

const HELP = `资讯候选人工复核（不修改正式价格、不发布、不发消息）
  node scripts/news/review-news.js list [--status pending|accepted|rejected|deferred|all] [--needs-re-review]
  node scripts/news/review-news.js review --id SHA256 --status STATUS --reason 理由
      [--evidence https://官网/证据] [--plan-id 永久计划ID] [--official-domain 新厂商官网]
  node scripts/news/review-news.js triage [--status STATUS] [--id SHA256] [--output audit/news/triage.json]
通用：--inbox audit/news/inbox.json --config config/news-sources.json --help
evidence/plan-id/official-domain 可重复。所有复核须理由；accepted 须官方HTTPS证据。
新厂商可不填plan-id，但必须人工确认官网并声明official-domain（已有官方来源除外）。
证据按完整主机名匹配官方来源；计划网址之外的官方子域也须用official-domain声明，社区/论坛栏目不能作证据。
accepted 仅确认值得人工入库，正式数据核验、审计、验证和发布须单独完成。`;
function parseArguments(args) {
  if (args.includes("--help")) return { command: "list", help: true };
  const command = args[0] || "list";
  if (!["list", "review", "triage"].includes(command)) throw new Error("命令必须为 list/review/triage");
  const options = { command, evidenceUrls: [], planIds: [], officialDomains: [] };
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--needs-re-review") { options.needsReReview = true; continue; }
    const key = { "--inbox": "inboxPath", "--config": "configPath", "--id": "id", "--status": "status", "--reason": "reason", "--evidence": "evidenceUrls", "--plan-id": "planIds", "--official-domain": "officialDomains", "--output": "outputPath" }[arg];
    if (!key || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("未知选项或缺少参数：" + arg);
    const value = args[++index];
    if (["evidenceUrls", "planIds", "officialDomains"].includes(key)) options[key].push(value); else if (options[key] !== undefined) throw new Error("选项不能重复：" + arg); else options[key] = value;
  }
  if (command === "review") {
    if (!options.id || !options.status || !options.reason) throw new Error("review 必须提供 --id --status --reason");
    if (options.outputPath || options.needsReReview) throw new Error("review 不接受输出/筛选选项");
  } else if (options.reason || options.evidenceUrls.length || options.planIds.length || options.officialDomains.length) throw new Error("复核理由/证据/计划/官网只能用于review命令");
  if (!options.status && command === "list") options.status = "pending";
  return options;
}
async function main(args = process.argv.slice(2), overrides = {}) {
  const parsed = parseArguments(args);
  if (parsed.help) { console.log(HELP); return 0; }
  const result = await runReview({ ...parsed, ...overrides });
  const output = parsed.command === "review" && "items" in result
    ? { schemaVersion: 1, updatedAt: result.updatedAt, stats: result.stats, candidate: result.items.find((item) => item.id === parsed.id), workflow: WORKFLOW }
    : result;
  console.log(JSON.stringify(output, null, 2));
  return 0;
}
if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { console.error("资讯复核失败：" + error.message); process.exitCode = 1; });
module.exports = { applyReview, triageData, runReview, parseArguments, main, officialDomain, WORKFLOW };
