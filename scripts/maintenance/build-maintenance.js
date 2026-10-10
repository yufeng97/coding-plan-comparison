#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { isISODate, validateData } = require("../build/validate-data");
const { commitOutputs } = require("../build/sync-pricing-audit");
const { loadData, canonical, readHistory, mergeHistory, seededHistory } = require("./history");
const { withFileLockSync } = require("../lib/file-lock");

const DAY = 86400000;
const SITE = "https://coding-plan-comparison-tau.vercel.app/";
const STALE_DAYS = 14;
const calendarFile = "config/review-calendar.json";
const dateTime = (date) => new Date(date + "T00:00:00Z").getTime();
const xml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** @param {string} root @param {any} data @param {string} asOf */
function readReviews(root, data, asOf) {
  const file = path.join(root, calendarFile);
  if (!fs.existsSync(file)) return [];
  const calendar = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!calendar || calendar.schemaVersion !== 1 || !Array.isArray(calendar.events)) throw new Error("复查日历 schema 非法");
  const seen = new Set();
  return calendar.events.map((event) => {
    if (!event || typeof event.id !== "string" || !event.id.trim() || seen.has(event.id) || typeof event.title !== "string" || !event.title.trim() || !isISODate(event.reviewOn) || typeof event.source !== "string" || !/^https:\/\//.test(event.source) || (event.note != null && typeof event.note !== "string")) throw new Error("复查日历事件字段非法");
    seen.add(event.id);
    if (event.planIds != null && (!Array.isArray(event.planIds) || event.planIds.some((id) => !data.PLANS.some((plan) => plan.id === id)))) throw new Error("复查日历引用不存在的永久计划 ID");
    if (event.vendor != null && (typeof event.vendor !== "string" || !event.vendor.trim())) throw new Error("复查日历厂商非法");
    if (event.vendor != null && ![...data.PLANS, ...data.API_PRICES, ...data.PAYG_REFERENCES].some((record) => record.vendor === event.vendor)) throw new Error("复查日历厂商未匹配规范名称：" + event.vendor);
    const daysUntil = Math.round((dateTime(event.reviewOn) - dateTime(asOf)) / DAY);
    return { ...event, planIds: event.planIds || data.PLANS.filter((plan) => plan.vendor === event.vendor).map((plan) => plan.id), daysUntil, overdue: daysUntil < 0, due: daysUntil <= 0 };
  }).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn) || a.id.localeCompare(b.id));
}

/* RSS 描述里用读者能懂的字段名；未登记的字段保留原名。 */
const FIELD_LABELS = {
  priceM: "月付价", priceY: "年付折月价", annualTotal: "年付全年金额", autoRenewMonthly: "连续包月价", singleMonthPrice: "单月购买价",
  cur: "币种", seat: "按席位计费", plan: "套餐名", model: "模型名", label: "显示名", quota: "额度", models: "模型", tools: "工具",
  note: "备注", url: "官网链接", status: "核查状态", availability: "销售状态", accessUnstable: "访问异常",
  inUSD: "输入 USD/M", outUSD: "输出 USD/M", inCNY: "输入 CNY/M", outCNY: "输出 CNY/M", apiIn: "输入单价", apiOut: "输出单价", apiCache: "缓存命中单价",
};
/* 分厂商订阅：路径由厂商名确定性生成（ASCII 片段便于识别，哈希保证唯一），页面从维护摘要读取映射。 */
function vendorFeedSlug(vendor) {
  const ascii = String(vendor).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
  return (ascii || "vendor") + "-" + crypto.createHash("sha256").update(String(vendor)).digest("hex").slice(0, 8);
}
/** 条目链接打开数据表并搜索该档（含中转站与待核价格），读者可直接核对当前值。
 * @param {any} maintenance @param {string} site @param {{vendor:string}|null} [feed] 只输出该厂商的变更 */
function rssOf(maintenance, site, feed = null) {
  const changes = feed ? maintenance.changes.filter((change) => change.vendor === feed.vendor) : maintenance.changes;
  const tableLink = (query) => new URL("?q=" + encodeURIComponent(query) + "&tall=1#table", site).href;
  const items = changes.map((change) => {
    const details = change.fields.map((field) => (FIELD_LABELS[field] || field) + "：" + JSON.stringify(change.before[field]) + " → " + JSON.stringify(change.after[field])).join("；");
    const description = "核查日期 " + change.checkedAt + "。" + details + "。来源：" + change.sourceUrls.join("；");
    return "<item><title>" + xml(change.vendor + " · " + change.name + " 价格/权益更新") + "</title><link>" + xml(tableLink(change.vendor + " " + change.name)) + "</link><guid isPermaLink=\"false\">" + xml(change.changeId) + "</guid><pubDate>" + new Date(change.checkedAt + "T00:00:00Z").toUTCString() + "</pubDate><description>" + xml(description) + "</description></item>";
  });
  const title = feed ? "Coding Plan · " + feed.vendor + " 已确认价格与权益变更" : "Coding Plan 已确认价格与权益变更";
  // No build timestamp: rerunning on the same facts does not create RSS updates.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>' + xml(title) + '</title><link>' + xml(feed ? tableLink(feed.vendor) : site) + '</link><description>仅记录有来源证据的实际变化；核查日不代表厂商公告日。</description><language>zh-CN</language>' + items.join("") + "</channel></rss>\n";
}

/** Build read-only freshness facts; never upgrade verification or change prices.
 * @param {string} workspace
 * @param {{check?:boolean,asOf?:string,staleDays?:number,site?:string,rename?:(from:string,to:string)=>void,writeBytes?:(file:string,bytes:Buffer)=>void}} options */
function buildMaintenance(workspace = path.join(__dirname, "../.."), options = {}) {
  const root = path.resolve(workspace);
  return withFileLockSync(path.join(root, "audit/.pricing.lock"), () => buildMaintenanceUnlocked(root, options), {
    busyMessage: "核价正在同步或维护摘要正在构建，或存在遗留锁（audit/.pricing.lock）",
  });
}
function buildMaintenanceUnlocked(workspace, options = {}) {
  const root = path.resolve(workspace);
  const savedFile = path.join(root, "data/maintenance.json");
  if (options.check && !fs.existsSync(savedFile)) throw new Error("维护产物缺失：data/maintenance.json，请先生成");
  const saved = options.check ? JSON.parse(fs.readFileSync(savedFile, "utf8")) : null;
  // CI checks the saved snapshot date; the passing of a day alone is not drift.
  const asOf = options.asOf || (saved ? saved.generatedAt : today());
  const staleDays = options.staleDays ?? saved?.staleAfterDays ?? STALE_DAYS;
  if (!isISODate(asOf) || !Number.isInteger(staleDays) || staleDays < 1 || staleDays > 365) throw new Error("维护摘要日期或新鲜度阈值非法");
  const site = options.site || saved?.rssSite || SITE;
  if (!/^https:\/\//.test(site)) throw new Error("RSS 网站地址必须使用 HTTPS");
  const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
  const validation = validateData({ workspace: root, source });
  if (validation.errors.length) throw new Error("维护摘要数据校验失败：\n" + validation.errors.join("\n"));
  const data = loadData(source);
  const history = mergeHistory(readHistory(root), seededHistory(root).changes);
  if (data.PRICE_CHECKS.checkedAt > asOf || history.changes.some((change) => change.checkedAt > asOf)) throw new Error("维护摘要日期早于已有核查事实");
  const records = [];
  for (const [kind, entries] of [["plan", data.PLANS], ["api", data.API_PRICES], ["payg", data.PAYG_REFERENCES]]) {
    for (const item of entries) {
      const id = kind === "plan" ? item.id : item.vendor + "|" + item.model;
      const check = data.PRICE_CHECKS.rows[kind + ":" + id];
      const ageDays = Math.round((dateTime(asOf) - dateTime(check.checkedAt)) / DAY);
      records.push({ id, kind, vendor: item.vendor, name: item.plan || item.model, checkedAt: check.checkedAt, status: check.status, sourceUrls: [...new Set(check.sourceIds.map((sourceId) => data.PRICE_CHECKS.sources[sourceId].url))].sort(), ageDays, stale: ageDays >= staleDays });
    }
  }
  /* 每个在库厂商都有订阅地址，尚无变更时也可先订阅；按码点排序，不受运行环境的区域设置影响。 */
  const vendors = [...new Set([...data.PLANS, ...data.API_PRICES, ...data.PAYG_REFERENCES].map((record) => record.vendor))].sort();
  const feeds = vendors.map((vendor) => ({ vendor, path: "feeds/" + vendorFeedSlug(vendor) + ".xml", changes: history.changes.filter((change) => change.vendor === vendor).length }));
  if (new Set(feeds.map((feed) => feed.path)).size !== feeds.length) throw new Error("厂商订阅路径冲突，请调整 vendorFeedSlug");
  const maintenance = {
    schemaVersion: 1, generatedAt: asOf, checkedThrough: data.PRICE_CHECKS.checkedAt, staleAfterDays: staleDays, rssSite: site,
    inputHashes: {
      data: crypto.createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex"),
      history: crypto.createHash("sha256").update(canonical(history)).digest("hex"),
      calendar: crypto.createHash("sha256").update(canonical(fs.existsSync(path.join(root, calendarFile)) ? JSON.parse(fs.readFileSync(path.join(root, calendarFile), "utf8")) : null)).digest("hex"),
    },
    summary: { total: records.length, verified: records.filter((record) => ["verified", "changed"].includes(record.status)).length, unverified: records.filter((record) => record.status === "unverified").length, stale: records.filter((record) => record.stale).length },
    records, reviews: readReviews(root, data, asOf), changes: history.changes, feeds,
  };
  const outputs = new Map([
    [path.join(root, "data/change-history.json"), Buffer.from(JSON.stringify(history, null, 2) + "\n")],
    [path.join(root, "data/maintenance.json"), Buffer.from(JSON.stringify(maintenance, null, 2) + "\n")],
    [path.join(root, "js/maintenance-data.js"), Buffer.from("/* Generated by scripts/maintenance/build-maintenance.js; verification facts remain in data.js.\n   On-demand data uses var: a late request from before a retry may still execute, and running twice only reassigns the same data. */\nvar MAINTENANCE = " + JSON.stringify(maintenance, null, 2) + ";\n")],
    /* 首屏摘要只含复查间隔与套餐变更 ID：导航「我的关注」的未读数和核查日期的超期提示不必等完整维护数据下载。 */
    [path.join(root, "js/maintenance-summary.js"), Buffer.from("/* 自动生成：npm run maintenance:build。导航「我的关注」未读提醒用的套餐变更 ID 与复查间隔；完整变更见 maintenance-data.js（按需加载）。 */\n/** @type {MaintenanceSummary} */\nconst MAINTENANCE_SUMMARY = " + JSON.stringify({ schemaVersion: 1, staleAfterDays: staleDays, changes: history.changes.filter((change) => change.kind === "plan").map((change) => ({ id: change.id, changeId: change.changeId })) }) + ";\n")],
    [path.join(root, "changes.xml"), Buffer.from(rssOf(maintenance, site))],
    ...feeds.map((feed) => /** @type {[string, Buffer]} */ ([path.join(root, feed.path), Buffer.from(rssOf(maintenance, site, feed))])),
  ]);
  /* 厂商改名或移除后，旧订阅文件不再生成；检查模式报告，生成模式在写入成功后清理。 */
  const feedDir = path.join(root, "feeds");
  const expectedFeeds = new Set(feeds.map((feed) => path.join(root, feed.path)));
  const staleFeeds = fs.existsSync(feedDir) ? fs.readdirSync(feedDir).filter((name) => name.endsWith(".xml")).map((name) => path.join(feedDir, name)).filter((target) => !expectedFeeds.has(target)) : [];
  if (options.check) {
    const stale = [...outputs].filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)).map(([file]) => path.relative(root, file).split(path.sep).join("/"))
      .concat(staleFeeds.map((file) => path.relative(root, file).split(path.sep).join("/") + "（多余）"));
    if (stale.length) throw new Error("维护产物过期或缺失：" + stale.join("、") + "；请重新生成维护摘要");
    return { maintenance, filesChanged: 0, checked: true };
  }
  const filesChanged = commitOutputs(outputs, options);
  for (const file of staleFeeds) fs.unlinkSync(file);
  return { maintenance, filesChanged: filesChanged + staleFeeds.length, checked: false };
}

/** @param {string[]} args */
function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--check") { options.check = true; continue; }
    if (!["--as-of", "--stale-days", "--site"].includes(flag) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("未知或缺值参数：" + flag);
    const value = args[++i];
    if (flag === "--as-of") options.asOf = value;
    if (flag === "--stale-days") options.staleDays = Number(value);
    if (flag === "--site") options.site = value;
  }
  return options;
}

if (require.main === module) {
  try {
    const { maintenance, filesChanged, checked } = buildMaintenance(undefined, parseArgs(process.argv.slice(2)));
    console.log(`维护摘要 ${maintenance.generatedAt}：${maintenance.summary.total} 条核查、${maintenance.summary.unverified} 条待核、${maintenance.changes.length} 次已确认变化；${checked ? "产物一致性检查通过" : "更新 " + filesChanged + " 个文件"}。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildMaintenance, rssOf, vendorFeedSlug, readReviews, today, parseArgs };
