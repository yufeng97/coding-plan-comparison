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

/** @param {any} maintenance @param {string} site */
function rssOf(maintenance, site) {
  const items = maintenance.changes.map((change) => {
    const details = change.fields.map((field) => field + "：" + JSON.stringify(change.before[field]) + " → " + JSON.stringify(change.after[field])).join("；");
    const description = "核查日期 " + change.checkedAt + "。" + details + "。来源：" + change.sourceUrls.join("；");
    return "<item><title>" + xml(change.vendor + " · " + change.name + " 价格/权益更新") + "</title><link>" + xml(new URL("#table", site).href) + "</link><guid isPermaLink=\"false\">" + xml(change.changeId) + "</guid><pubDate>" + new Date(change.checkedAt + "T00:00:00Z").toUTCString() + "</pubDate><description>" + xml(description) + "</description></item>";
  });
  // No build timestamp: rerunning on the same facts does not create RSS updates.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Coding Plan 已确认价格与权益变更</title><link>' + xml(site) + '</link><description>仅记录有来源证据的实际变化；核查日不代表厂商公告日。</description><language>zh-CN</language>' + items.join("") + "</channel></rss>\n";
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
  const maintenance = {
    schemaVersion: 1, generatedAt: asOf, checkedThrough: data.PRICE_CHECKS.checkedAt, staleAfterDays: staleDays, rssSite: site,
    inputHashes: {
      data: crypto.createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex"),
      history: crypto.createHash("sha256").update(canonical(history)).digest("hex"),
      calendar: crypto.createHash("sha256").update(canonical(fs.existsSync(path.join(root, calendarFile)) ? JSON.parse(fs.readFileSync(path.join(root, calendarFile), "utf8")) : null)).digest("hex"),
    },
    summary: { total: records.length, verified: records.filter((record) => ["verified", "changed"].includes(record.status)).length, unverified: records.filter((record) => record.status === "unverified").length, stale: records.filter((record) => record.stale).length },
    records, reviews: readReviews(root, data, asOf), changes: history.changes,
  };
  const outputs = new Map([
    [path.join(root, "data/change-history.json"), Buffer.from(JSON.stringify(history, null, 2) + "\n")],
    [path.join(root, "data/maintenance.json"), Buffer.from(JSON.stringify(maintenance, null, 2) + "\n")],
    [path.join(root, "js/maintenance-data.js"), Buffer.from("/* Generated by scripts/maintenance/build-maintenance.js; verification facts remain in data.js. */\nconst MAINTENANCE = " + JSON.stringify(maintenance, null, 2) + ";\n")],
    [path.join(root, "changes.xml"), Buffer.from(rssOf(maintenance, site))],
  ]);
  if (options.check) {
    const stale = [...outputs].filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes)).map(([file]) => path.relative(root, file).split(path.sep).join("/"));
    if (stale.length) throw new Error("维护产物过期或缺失：" + stale.join("、") + "；请重新生成维护摘要");
    return { maintenance, filesChanged: 0, checked: true };
  }
  const filesChanged = commitOutputs(outputs, options);
  return { maintenance, filesChanged, checked: false };
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
module.exports = { buildMaintenance, rssOf, readReviews, today, parseArgs };
