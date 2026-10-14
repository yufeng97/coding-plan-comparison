#!/usr/bin/env node
"use strict";
/* README 中英文版本里的数据统计由此生成：数字取自 data/sources/data.js 与 data/benchmarks/public-results.json，
 * 只改写 <!-- readme-stats:名称 --> 与 <!-- /readme-stats:名称 --> 之间的段落，其余文字保持手写。
 * --check 只核对不写文件（CI 与每日自动更新使用），数据变化后漏跑 readme:build 会在这里失败。 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { commitOutputs } = require("./sync-pricing-audit");

const READMES = /** @type {const} */ ([{ file: "README.md", lang: "zh" }, { file: "README.en.md", lang: "en" }]);
const BLOCKS = ["coverage", "benchmarks", "rates"];
/* 评测协议名里的中文说明在英文版中替换为对应说法；未登记的说明原样保留。 */
const EN_LABELS = { "（历史发布节选）": " (historical launch excerpt)" };

/** @param {string} iso */
function beijingDate(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) throw new Error("公开评测核查时间无效：" + iso);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
}

/**
 * 每类评测按首次出现顺序汇总；同一类有多个协议且每个版本恰好一个协议时（如 DeepSWE v1.1 / v1）逐版本列出，
 * 否则（OSWorld 的步数、样本与指标分表，或只有一个协议）只给该类总数。
 * @param {{benchmarks:{id:string,family:string,name:string,version:string}[],scores:{benchmarkId:string}[]}} results
 */
function benchmarkGroups(results) {
  const families = new Map();
  for (const board of results.benchmarks) {
    if (!families.has(board.family)) families.set(board.family, []);
    families.get(board.family).push(board);
  }
  const count = (/** @type {string} */ id) => results.scores.filter((row) => row.benchmarkId === id).length;
  return [...families.values()].map((boards) => {
    const label = boards[0].name.split(" ")[0];
    const versions = new Set(boards.map((board) => board.version));
    const split = boards.length > 1 && versions.size === boards.length;
    return {
      label,
      total: boards.reduce((sum, board) => sum + count(board.id), 0),
      parts: split ? boards.map((board) => ({ label: board.name.startsWith(label + " ") ? board.name.slice(label.length + 1) : board.name, scores: count(board.id) })) : [],
    };
  });
}

/** @param {string} root */
function readmeStats(root) {
  const source = fs.readFileSync(path.join(root, "data/sources/data.js"), "utf8");
  const box = {};
  vm.createContext(box);
  vm.runInContext(source + "\n;globalThis.stats = { META, PLANS, API_PRICES, PAYG_REFERENCES, quotaRows: METRICS_RAW.length + ESTIMATES.length, " +
    "freeCoding: PLANS.filter((plan) => isFreeCodingEntry(plan)).length, RATE_USD_CNY, RATE_INR_CNY };", box, { timeout: 2000 });
  const data = /** @type {any} */ (box).stats;
  const results = JSON.parse(fs.readFileSync(path.join(root, "data/benchmarks/public-results.json"), "utf8"));
  if (!results || !Array.isArray(results.benchmarks) || !Array.isArray(results.scores) || !results.benchmarks.length) throw new Error("公开评测快照缺少榜单或成绩");
  return {
    dataVersion: data.META.updated,
    vendors: new Set(data.PLANS.map((/** @type {{vendor:string}} */ plan) => plan.vendor)).size,
    plans: data.PLANS.length,
    freePlans: data.PLANS.filter((/** @type {{priceM:number|null}} */ plan) => plan.priceM === 0).length,
    freeCoding: data.freeCoding,
    quotaRows: data.quotaRows,
    apiRows: data.API_PRICES.length,
    apiModels: new Set(data.API_PRICES.map((/** @type {{model:string}} */ row) => row.model)).size,
    paygRows: data.PAYG_REFERENCES.length,
    usdCny: String(data.RATE_USD_CNY),
    inrCny: Number(data.RATE_INR_CNY).toFixed(6),
    rateAsOf: data.META.rateAsOf,
    benchmarks: {
      checkedOn: beijingDate(results.checkedAt),
      families: new Set(results.benchmarks.map((/** @type {{family:string}} */ board) => board.family)).size,
      protocols: results.benchmarks.length,
      scores: results.scores.length,
      groups: benchmarkGroups(results),
    },
  };
}

/** @param {string} text */
function englishLabel(text) {
  let result = text;
  for (const [zh, en] of Object.entries(EN_LABELS)) result = result.split(zh).join(en);
  return result.replace(/（/g, " (").replace(/）/g, ")");
}

/** @param {ReturnType<typeof readmeStats>} stats @param {"zh"|"en"} lang @returns {Record<string, string>} */
function renderBlocks(stats, lang) {
  const b = stats.benchmarks;
  if (lang === "zh") {
    const breakdown = b.groups.map((group) => group.parts.length
      ? group.label + " " + group.parts.map((part) => part.label + " " + part.scores).join("、")
      : group.label + " " + group.total).join("；");
    return {
      coverage: `数据版本：**${stats.dataVersion}**；覆盖 ${stats.vendors} 家厂商、${stats.plans} 档订阅计划、${stats.freePlans} 个免费档（去掉已停售和同一订阅的重复入口后，${stats.freeCoding} 个是可用的编程工具免费档或免费模型入口）、${stats.quotaRows} 行套餐额度深度对比（官方数据 + 标注置信度的估算）、${stats.apiRows} 行 API 定价（${stats.apiModels} 款模型），另有 ${stats.paygRows} 行 API 按量对照。免费入口可按国内／国际和是否含免费推理组合筛选；BYOK/按量推理的费用会单独注明。页面与导出的更新日期指整份数据的版本日期；每条价格另记官网核查日期和结果。`,
      benchmarks: `模型公开评测独立于价格版本：**${b.checkedOn} 核查**，${b.families} 类评测、${b.protocols} 个独立协议、${b.scores} 条成绩（${breakdown}）。同一模型的多个配置和 OSWorld 的完整/部分得分均各算一条，不表示 ${b.scores} 个模型；版本、样本分母、工具与步骤预算不同不混排。历史节选仅覆盖官方表格中的模型，不是完整历史排行。`,
      rates: `各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ ${stats.usdCny} CNY，印度卢比按 1 INR ≈ ${stats.inrCny} CNY（同为 ${stats.rateAsOf} 欧洲央行参考汇率）折算，仅用于图表对比。导出保留两种汇率的数值、日期和来源；价格随官方调整，购买前以官网为准。`,
    };
  }
  const breakdown = b.groups.map((group) => group.parts.length
    ? group.label + " " + group.parts.map((part) => englishLabel(part.label) + " " + part.scores).join(", ")
    : group.label + " " + group.total).join("; ");
  return {
    coverage: `Data version: **${stats.dataVersion}**. The catalog covers ${stats.vendors} vendors and ${stats.plans} subscription plans, including ${stats.freePlans} free tiers (after removing discontinued tiers and duplicate listings of the same subscription, ${stats.freeCoding} are usable free coding tools or free model entry points), ${stats.quotaRows} rows of in-depth plan quota comparison (official figures plus estimates labeled with a confidence level), ${stats.apiRows} API price rows (${stats.apiModels} models) and ${stats.paygRows} pay-as-you-go API reference rows. Free entry points can be filtered by domestic or international availability and by whether free inference is included; BYOK and metered inference costs are called out separately. The update date on the page and in exports is the version date of the whole dataset; every price also records its own official-site check date and result.`,
    benchmarks: `Public model benchmarks are versioned separately from prices: **checked ${b.checkedOn}**, ${b.families} benchmark families, ${b.protocols} distinct protocols and ${b.scores} scores (${breakdown}). Each configuration of the same model, and OSWorld's full-completion and partial scores, count as separate entries, so this does not mean ${b.scores} models; results that differ in version, sample denominator, tools or step budget are never ranked together. Historical excerpts cover only the models in the official tables and are not complete historical leaderboards.`,
    rates: `Quota units differ between vendors (prompts per 5 hours, tokens per week, requests per day, credits), so they cannot be compared directly; the tables keep the official wording. US dollar prices are converted at 1 USD ≈ ${stats.usdCny} CNY and Indian rupee prices at 1 INR ≈ ${stats.inrCny} CNY (both from the ${stats.rateAsOf} European Central Bank reference rates), for chart comparison only. Exports keep both rates with their values, dates and source. Prices follow the vendors' changes; check the official site before buying.`,
  };
}

/** 替换每个统计段；标记缺失或重复时报错，不猜测插入位置。
 * @param {string} text @param {Record<string, string>} blocks @param {string} file */
function applyBlocks(text, blocks, file) {
  let next = text.replace(/\r\n/g, "\n");
  for (const name of BLOCKS) {
    const start = `<!-- readme-stats:${name} -->\n`, end = `\n<!-- /readme-stats:${name} -->`;
    const from = next.indexOf(start), to = next.indexOf(end, from + start.length);
    if (from < 0 || to < 0 || next.indexOf(start, from + 1) >= 0) throw new Error(`${file} 须恰好包含一组 readme-stats:${name} 标记`);
    next = next.slice(0, from + start.length) + blocks[name] + next.slice(to);
  }
  return next;
}

/** @param {string} workspace @param {{check?:boolean, rename?:(from:string,to:string)=>void, writeBytes?:(file:string,bytes:Buffer)=>void}} [options] */
function buildReadmes(workspace = path.resolve(__dirname, "..", ".."), options = {}) {
  const root = path.resolve(workspace);
  const stats = readmeStats(root);
  const outputs = new Map(READMES.map(({ file, lang }) => {
    const target = path.join(root, file);
    return [target, Buffer.from(applyBlocks(fs.readFileSync(target, "utf8"), renderBlocks(stats, lang), file))];
  }));
  if (options.check) {
    const stale = [...outputs].filter(([file, bytes]) => !fs.readFileSync(file).equals(bytes)).map(([file]) => path.relative(root, file));
    if (stale.length) throw new Error("README 数据统计已过期：" + stale.join("、") + "；请运行 npm run readme:build");
    return { stats, filesChanged: 0, checked: true };
  }
  return { stats, filesChanged: commitOutputs(outputs, options), checked: false };
}

/** @param {string[]} args */
function parseArgs(args) {
  if (args.some((arg) => arg !== "--check")) throw new Error("用法：node scripts/build/readme-stats.js [--check]");
  return { check: args.includes("--check") };
}

if (require.main === module) {
  try {
    const { stats, filesChanged, checked } = buildReadmes(undefined, parseArgs(process.argv.slice(2)));
    console.log(`README 统计：数据 ${stats.dataVersion}、${stats.plans} 档、评测 ${stats.benchmarks.checkedOn}、汇率 ${stats.rateAsOf}；` +
      (checked ? "中英文版本一致" : filesChanged ? `更新 ${filesChanged} 个文件` : "无需更新"));
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
module.exports = { READMES, BLOCKS, readmeStats, benchmarkGroups, renderBlocks, applyBlocks, buildReadmes, parseArgs };
