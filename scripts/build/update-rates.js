#!/usr/bin/env node
"use strict";
/* 更新参考汇率：从 Frankfurter（欧洲央行参考汇率）取 USD→CNY / INR，改写 data/sources/data.js 的 RATE_* 与 META 汇率字段，
 * 以及来源目录里的「汇率参考（日期）」分组。页面上的汇率由组件从这些常量渲染。候选源码先通过完整数据校验再原子写入；
 * 与核价同步、维护摘要共用 data/audit/.pricing.lock。不改任何原币价格，也不在构建或 CI 中运行；
 * 每日数据更新工作流用 --stale-days 调用：页面显示的汇率不变且当前汇率未满该天数时不写入，避免每天只改日期的提交。 */
const fs = require("node:fs");
const path = require("node:path");
const { validateData, isISODate } = require("./validate-data");
const { commitOutputs } = require("./sync-pricing-audit");
const { withFileLockSync } = require("../lib/file-lock");

const ENDPOINT = "https://api.frankfurter.dev/v1/";
const rateUrl = (date) => ENDPOINT + date + "?base=USD&symbols=CNY,INR";

/** @param {{date?:string, fetcher?:typeof fetch}} options */
async function fetchRates(options = {}) {
  const date = options.date || "latest";
  if (date !== "latest" && !isISODate(date)) throw new Error("--date 须为 YYYY-MM-DD");
  const response = await (options.fetcher || fetch)(rateUrl(date), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("汇率接口 HTTP " + response.status);
  const body = await response.json();
  const cny = body && body.rates && body.rates.CNY, inr = body && body.rates && body.rates.INR;
  if (!body || body.base !== "USD" || !isISODate(body.date)) throw new Error("汇率接口返回格式不符");
  /* 合理范围只用于拦截明显错误的响应，不代表预测。 */
  if (!(typeof cny === "number" && cny > 3 && cny < 15) || !(typeof inr === "number" && inr > 40 && inr < 250)) {
    throw new Error(`汇率超出合理范围，拒绝写入：CNY ${cny}，INR ${inr}`);
  }
  return { date: body.date, cny, inr, source: rateUrl(body.date) };
}

/** 每个位置必须恰好匹配一次，格式变化时宁可失败也不写错位置。 */
function replaceOnce(text, pattern, replacement, label) {
  const count = (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")) || []).length;
  if (count !== 1) throw new Error(`未能唯一定位${label}（匹配 ${count} 处），请检查文件格式`);
  return text.replace(pattern, replacement);
}

/** 纯函数：返回改写后的 data.js 源码。 @param {string} source @param {{date:string,cny:number,inr:number,source:string}} rates */
function applyRates(source, rates) {
  const usdCny = Math.round(rates.cny * 100) / 100;
  let next = source;
  next = replaceOnce(next, /const RATE_USD_CNY = [\d.]+;/, `const RATE_USD_CNY = ${usdCny};`, " RATE_USD_CNY");
  next = replaceOnce(next, /\/\* 同一汇率日期：Frankfurter USD\/INR=[\d.]+、USD\/CNY=[\d.]+；保留印度原价。 \*\/\nconst RATE_INR_CNY = [\d.]+ \/ [\d.]+;/,
    `/* 同一汇率日期：Frankfurter USD/INR=${rates.inr}、USD/CNY=${rates.cny}；保留印度原价。 */\nconst RATE_INR_CNY = ${rates.cny} / ${rates.inr};`, " RATE_INR_CNY");
  next = replaceOnce(next, /rateAsOf: "\d{4}-\d{2}-\d{2}",/, `rateAsOf: "${rates.date}",`, " META.rateAsOf");
  next = replaceOnce(next, /rateSource: "https:\/\/api\.frankfurter\.dev\/v1\/[^"]+",/, `rateSource: "${rates.source}",`, " META.rateSource");
  /* 文件头汇率说明是机器维护区：数字骨架（日期与实测值）必须存在，中间措辞可自由调整；改写时统一回规范说法。 */
  next = replaceOnce(next, /汇率: 1 USD ≈ [\d.]+ CNY（\d{4}-\d{2}-\d{2}[^，\n]*?[\d.]+，/, `汇率: 1 USD ≈ ${usdCny} CNY（${rates.date} frankfurter 实测 ${rates.cny}，`, "文件头汇率说明");
  /* 来源目录的汇率分组随汇率日期一起更新，否则页脚会继续列出旧日期的接口地址。 */
  next = replaceOnce(next, /\{ group: "汇率参考（\d{4}-\d{2}-\d{2}）", urls: \[\n(\s*)"https:\/\/api\.frankfurter\.dev\/v1\/[^"]+",/,
    `{ group: "汇率参考（${rates.date}）", urls: [\n$1"${rates.source}",`, " SOURCES 汇率参考分组");
  return { source: next, usdCny };
}

/** @typedef {{date:string, cny:number, inr:number, source:string, usdCny:number, changed:boolean, written:number, skipped?:boolean, ageDays?:number}} RateUpdate */
/** @param {string} workspace @param {{date?:string, dryRun?:boolean, staleDays?:number, fetcher?:typeof fetch, rename?:(from:string,to:string)=>void}} options
 *   staleDays：页面显示的 USD/CNY（两位小数）不变时，当前汇率日期距新汇率不满这些天就保留原数据。
 * @returns {Promise<RateUpdate>} */
async function updateRates(workspace = path.resolve(__dirname, "..", ".."), options = {}) {
  const root = path.resolve(workspace);
  const rates = await fetchRates(options);
  fs.mkdirSync(path.join(root, "data/audit"), { recursive: true });
  return withFileLockSync(path.join(root, "data/audit/.pricing.lock"), () => {
    const dataFile = path.join(root, "data/sources/data.js");
    const source = fs.readFileSync(dataFile, "utf8");
    const current = /rateAsOf: "(\d{4}-\d{2}-\d{2})"/.exec(source);
    if (current && rates.date < current[1]) throw new Error(`汇率日期 ${rates.date} 早于当前 ${current[1]}，拒绝回退`);
    const next = applyRates(source, rates);
    if (options.staleDays && current) {
      const shown = /const RATE_USD_CNY = ([\d.]+);/.exec(source);
      const ageDays = Math.round((Date.parse(rates.date) - Date.parse(current[1])) / 86400000);
      if (shown && Number(shown[1]) === next.usdCny && ageDays < options.staleDays) {
        return { ...rates, usdCny: next.usdCny, changed: false, skipped: true, ageDays, written: 0 };
      }
    }
    const changed = next.source !== source;
    if (!changed || options.dryRun) return { ...rates, usdCny: next.usdCny, changed, written: 0 };
    const validation = validateData({ workspace: root, source: next.source });
    if (validation.errors.length) throw new Error("汇率更新后的数据校验失败：\n" + validation.errors.join("\n"));
    const written = commitOutputs(new Map([[dataFile, Buffer.from(next.source)]]), options);
    return { ...rates, usdCny: next.usdCny, changed, written };
  }, { busyMessage: "核价正在同步或维护摘要正在构建，或存在遗留锁（data/audit/.pricing.lock）" });
}

/** @param {string[]} args */
function parseArgs(args) {
  /** @type {{dryRun:boolean, date:string, staleDays?:number}} */
  const options = { dryRun: false, date: "" };
  const usage = "用法：npm run rates:update -- [--date YYYY-MM-DD] [--dry-run] [--stale-days 1–365]";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") options.dryRun = true;
    else if (args[i] === "--date" && args[i + 1] && !args[i + 1].startsWith("--")) options.date = args[++i];
    else if (args[i] === "--stale-days" && /^\d+$/.test(args[i + 1] || "") && Number(args[i + 1]) >= 1 && Number(args[i + 1]) <= 365) options.staleDays = Number(args[++i]);
    else throw new Error(usage);
  }
  return options;
}

if (require.main === module) {
  (async () => {
    const result = await updateRates(undefined, parseArgs(process.argv.slice(2)));
    console.log(`Frankfurter ${result.date}：1 USD = ${result.cny} CNY / ${result.inr} INR（页面取 ${result.usdCny}）。` +
      (result.skipped ? `页面汇率不变，当前汇率仅相差 ${result.ageDays} 天，保留原数据。` :
        !result.changed ? "与当前数据一致，未写入。" : result.written ? `已更新 ${result.written} 个文件；接着运行 npm run maintenance:build、npm run catalog:build、npm run readme:build、npm run validate 与 npm test。` : "仅预览，未写入。"));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { fetchRates, applyRates, updateRates, parseArgs };
