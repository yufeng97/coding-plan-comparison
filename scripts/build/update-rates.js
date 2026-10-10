#!/usr/bin/env node
"use strict";
/* 更新参考汇率：从 Frankfurter（欧洲央行参考汇率）取 USD→CNY / INR，改写 js/data.js 的 RATE_* 与 META 汇率字段，
 * 以及 index.html 无脚本时可见的静态汇率。候选源码先通过完整数据校验，再与 index.html 一并原子提交；
 * 与核价同步、维护摘要共用 audit/.pricing.lock。不改任何原币价格，也不在构建或 CI 中自动运行。 */
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

/** 纯函数：返回改写后的 data.js 与 index.html 源码。 @param {string} source @param {string} html @param {{date:string,cny:number,inr:number,source:string}} rates */
function applyRates(source, html, rates) {
  const usdCny = Math.round(rates.cny * 100) / 100;
  let next = source;
  next = replaceOnce(next, /const RATE_USD_CNY = [\d.]+;/, `const RATE_USD_CNY = ${usdCny};`, " RATE_USD_CNY");
  next = replaceOnce(next, /\/\* 同一汇率日期：Frankfurter USD\/INR=[\d.]+、USD\/CNY=[\d.]+；保留印度原价。 \*\/\nconst RATE_INR_CNY = [\d.]+ \/ [\d.]+;/,
    `/* 同一汇率日期：Frankfurter USD/INR=${rates.inr}、USD/CNY=${rates.cny}；保留印度原价。 */\nconst RATE_INR_CNY = ${rates.cny} / ${rates.inr};`, " RATE_INR_CNY");
  next = replaceOnce(next, /rateAsOf: "\d{4}-\d{2}-\d{2}",/, `rateAsOf: "${rates.date}",`, " META.rateAsOf");
  next = replaceOnce(next, /rateSource: "https:\/\/api\.frankfurter\.dev\/v1\/[^"]+",/, `rateSource: "${rates.source}",`, " META.rateSource");
  next = replaceOnce(next, /汇率: 1 USD ≈ [\d.]+ CNY（\d{4}-\d{2}-\d{2} frankfurter 实测 [\d.]+，/, `汇率: 1 USD ≈ ${usdCny} CNY（${rates.date} frankfurter 实测 ${rates.cny}，`, "文件头汇率说明");
  let page = html;
  for (const id of ["rateText", "rateText2"]) page = replaceOnce(page, new RegExp(`<span id="${id}">[\\d.]+</span>`), `<span id="${id}">${usdCny}</span>`, " index.html #" + id);
  return { source: next, html: page, usdCny };
}

/** @param {string} workspace @param {{date?:string, dryRun?:boolean, fetcher?:typeof fetch, rename?:(from:string,to:string)=>void}} options */
async function updateRates(workspace = path.resolve(__dirname, "..", ".."), options = {}) {
  const root = path.resolve(workspace);
  const rates = await fetchRates(options);
  fs.mkdirSync(path.join(root, "audit"), { recursive: true });
  return withFileLockSync(path.join(root, "audit/.pricing.lock"), () => {
    const dataFile = path.join(root, "js/data.js"), htmlFile = path.join(root, "index.html");
    const source = fs.readFileSync(dataFile, "utf8"), html = fs.readFileSync(htmlFile, "utf8");
    const current = /rateAsOf: "(\d{4}-\d{2}-\d{2})"/.exec(source);
    if (current && rates.date < current[1]) throw new Error(`汇率日期 ${rates.date} 早于当前 ${current[1]}，拒绝回退`);
    const next = applyRates(source, html, rates);
    const changed = next.source !== source || next.html !== html;
    if (!changed || options.dryRun) return { ...rates, usdCny: next.usdCny, changed, written: 0 };
    const validation = validateData({ workspace: root, source: next.source });
    if (validation.errors.length) throw new Error("汇率更新后的数据校验失败：\n" + validation.errors.join("\n"));
    const written = commitOutputs(new Map([[dataFile, Buffer.from(next.source)], [htmlFile, Buffer.from(next.html)]]), options);
    return { ...rates, usdCny: next.usdCny, changed, written };
  }, { busyMessage: "核价正在同步或维护摘要正在构建，或存在遗留锁（audit/.pricing.lock）" });
}

/** @param {string[]} args */
function parseArgs(args) {
  const options = { dryRun: false, date: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") options.dryRun = true;
    else if (args[i] === "--date" && args[i + 1] && !args[i + 1].startsWith("--")) options.date = args[++i];
    else throw new Error("用法：npm run rates:update -- [--date YYYY-MM-DD] [--dry-run]");
  }
  return options;
}

if (require.main === module) {
  (async () => {
    const result = await updateRates(undefined, parseArgs(process.argv.slice(2)));
    console.log(`Frankfurter ${result.date}：1 USD = ${result.cny} CNY / ${result.inr} INR（页面取 ${result.usdCny}）。` +
      (!result.changed ? "与当前数据一致，未写入。" : result.written ? `已更新 ${result.written} 个文件；接着运行 npm run maintenance:build、npm run validate、npm test 与 npm run bump。` : "仅预览，未写入。"));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { fetchRates, applyRates, updateRates, parseArgs };
