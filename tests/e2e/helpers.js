"use strict";
/* 浏览器回归共用：只经 DOM、地址栏、本机存储与 ECharts 的公共 API 读取页面，不依赖页面模块的内部名称。
 * 期望数据在 Node 里直接执行审计输入 data/sources/data.js 取得（与页面同一份源文件）。 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");

/** 在 Node 里执行页面使用的数据脚本，返回其中的顶层名称。 */
function readScript(file, names) {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(`${source}\n;globalThis.exported = { ${names.join(", ")} };`, context, { filename: file });
  return context.exported;
}

/** data/sources/data.js 的顶层数据与共享资格函数。 */
const catalog = readScript("data/sources/data.js", ["PLANS", "META", "API_PRICES", "PRICE_CHECKS", "isFreeCodingEntry", "hasIncludedModelQuota", "isOnSalePlan", "findPlanReference"]);
/** 按需加载的维护与评测数据。 */
const { MAINTENANCE } = readScript("data/generated/maintenance-data.js", ["MAINTENANCE"]);
const { BENCHMARKS } = readScript("data/generated/benchmark-data.js", ["BENCHMARKS"]);

/** 本机存储键：已发布的约定，改名会让访问者的关注和预设丢失。 */
const STORAGE_KEYS = { follow: "cp-followed-plans-v1", preset: "cp-filter-preset-v1", theme: "cp-theme" };

/** 某个图表容器上的 ECharts 实例，写在 page.evaluate 的表达式字符串里。 */
const chartOf = (id) => `echarts.getInstanceByDom(document.getElementById(${JSON.stringify(id)}))`;

/** 页面启动完成（启动代码最后设置的就绪标记，加载提示也依赖它）。 */
const waitForApp = (page) => page.waitForFunction(() => window["codingPlanReady"] === true);

/** 经「页面章节」菜单跳到某一章节，与用户点击同一入口。
 * @param {import("@playwright/test").Page} page @param {string} hash 如 "#s1" */
async function goToSection(page, hash) {
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.locator(`.topnav a[href="${hash}"]`).click();
}

/** 在新标签打开同一条件的数据表，读取首批显示的套餐 ID：防抖或历史恢复后的结果应与直接打开该链接一致。
 * @param {import("@playwright/test").Page} page @param {string} query */
async function freshTablePlanIds(page, query) {
  const reference = await page.context().newPage();
  try {
    await reference.setViewportSize(page.viewportSize() || { width: 1280, height: 900 });
    await reference.goto("/?q=" + encodeURIComponent(query) + "#table");
    await waitForApp(reference);
    return await reference.locator("#tableBody .cmp-add").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-plan-id")));
  } finally { await reference.close(); }
}

/** 数据表或额度表计数行里的「已显示 V / N」：返回 N（全部匹配条数）。 @param {string} text */
const matchedTotal = (text) => Number(String(text).match(/\/ (\d+) /)?.[1]);

/** 按需数据已到达并完成渲染：以只在数据到达后才出现的内容为准。
 * @param {import("@playwright/test").Page} page @param {"benchmark" | "maintenance"} kind */
async function waitForData(page, kind) {
  if (kind === "benchmark") await expect(page.locator("#publicBenchmarkBody tr").first()).toBeAttached();
  else await expect(page.locator("#maintenanceSummary")).toContainText("维护快照");
}

module.exports = { catalog, MAINTENANCE, BENCHMARKS, STORAGE_KEYS, chartOf, freshTablePlanIds, goToSection, matchedTotal, waitForApp, waitForData };
