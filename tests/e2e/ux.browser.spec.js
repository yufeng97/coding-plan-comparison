"use strict";
const { test, expect } = require("@playwright/test");
const { BENCHMARKS, MAINTENANCE, STORAGE_KEYS, catalog, waitForData } = require("./helpers");

const followed = MAINTENANCE.changes.find((change) => change.kind === "plan");
const readIds = MAINTENANCE.changes.filter((change) => change.id === followed.id).map((change) => change.changeId);
/** @param {import("@playwright/test").Page} page */
const storedFollow = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), STORAGE_KEYS.follow);
const tab = (page, name) => page.getByRole("link", { name, exact:true });

test("首页按标签延迟加载资料，历史返回和回首页保留视图且不重复下载", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(/\/(benchmark|maintenance)-data(?:-\w+)?\.js$/);
    if (match) requests.push(match[1]);
  });
  await page.goto("/", { waitUntil:"networkidle" });
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
  await expect(tab(page, "选套餐")).toHaveAttribute("aria-current", "page");
  expect(requests).toEqual([]);
  await expect(page.locator("#benchmarks")).toBeHidden();
  await expect(page.locator("#updates")).toBeHidden();

  await tab(page, "模型评测").click();
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  await expect(page.locator("#quick")).toBeHidden();
  await expect(tab(page, "模型评测")).toHaveAttribute("aria-current", "page");
  expect(requests).toEqual(["benchmark"]);

  await tab(page, "我的关注").click();
  await waitForData(page, "maintenance");
  await expect(page.locator("#benchmarks")).toBeHidden();
  expect(requests).toEqual(["benchmark", "maintenance"]);

  await page.goBack();
  await expect(tab(page, "模型评测")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  await expect(page.locator("#updates")).toBeHidden();
  await tab(page, "选套餐").click();
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
  await expect(page.locator(".hero")).toBeVisible();
  await expect(page.locator("#benchmarks")).toBeHidden();
  expect(requests).toEqual(["benchmark", "maintenance"]);
});

for (const [kind, label] of [["benchmark", "模型评测"], ["maintenance", "我的关注"]]) {
  test(`${label}下载失败显示局部重试，恢复数据后首页仍可使用`, async ({ page }) => {
    let fail = true;
    let attempts = 0;
    await page.route(`**/js/${kind}-data*.js`, async (route) => {
      attempts++;
      if (fail) await route.abort(); else await route.continue();
    });
    await page.goto("/", { waitUntil:"networkidle" });
    expect(attempts).toBe(0);
    await tab(page, label).click();
    const status = page.locator(`#${kind}DataStatus`);
    const retry = status.locator(`[data-retry-data="${kind}"]`);
    await expect(retry).toBeVisible();
    await expect(status).toContainText("数据文件下载失败");
    expect(attempts).toBe(1);
    fail = false;
    await retry.click();
    await waitForData(page, /** @type {"benchmark" | "maintenance"} */ (kind));
    await expect(status).toBeEmpty();
    expect(attempts).toBe(2);
    if (kind === "benchmark") await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
    else await expect(page.locator("#maintenanceSummary")).not.toBeEmpty();
    await tab(page, "选套餐").click();
    await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
    await expect(page.locator("#loadFailure")).toBeHidden();
  });
}

test("历史数据尚未下载时关注操作保留已读ID，打开维护页后不会重新报未读", async ({ page }) => {
  let requested = false;
  await page.route("**/js/maintenance-data*.js", async (route) => { requested = true; await route.continue(); });
  await page.addInitScript(({ planId, readChangeIds }) => {
    localStorage.setItem("cp-followed-plans-v1", JSON.stringify({ version:1, planIds:[planId], readChangeIds }));
  }, { planId:followed.id, readChangeIds:readIds });
  await page.goto("/", { waitUntil:"networkidle" });
  expect(requested).toBe(false);
  const watch = page.locator("#quickGrid > .quick-card").first().locator("[data-watch-plan]");
  const planId = await watch.getAttribute("data-watch-plan");
  const previous = await watch.getAttribute("aria-pressed");
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", previous === "true" ? "false" : "true");
  expect((await storedFollow(page)).readChangeIds).toEqual(readIds);
  // 还原当前主卡的关注状态，让维护页只检验预置套餐的已读历史。
  await watch.click();
  expect(requested).toBe(false);
  await tab(page, "我的关注").click();
  await waitForData(page, "maintenance");
  await expect(page.locator("#followedChanges")).toContainText("没有未读");
  await expect(page.locator("#markFollowReadBtn")).toBeDisabled();
  expect((await storedFollow(page)).readChangeIds).toEqual(readIds);
  expect(planId).toMatch(/^plan-/);
});

test("测评贡献下载失败可在当前标签重试，任务筛选返回后仍与结果一致", async ({ page }) => {
  let fail = true;
  await page.route("**/js/benchmark-data*.js", async (route) => {
    if (fail) await route.abort(); else await route.continue();
  });
  await page.goto("/#contribute", { waitUntil:"networkidle" });
  await page.locator("#contributionType").selectOption("benchmark");
  const status = page.locator("#contributionDataStatus");
  await expect(status).toContainText("数据文件下载失败");
  const retry = status.locator("[data-retry-data='benchmark']");
  await expect(retry).toBeVisible();
  fail = false;
  await retry.click();
  await expect(status).toBeEmpty();
  await expect(page.locator("#contributionTemplate")).toHaveValue(/任务：[^\n]+/);
  await tab(page, "模型评测").click();
  await page.locator("#contributorBenchmarkTools > summary").click();
  await page.locator("#benchmarkTask").selectOption("csv-export");
  await expect(page.locator("#benchmarkTasks details")).toHaveCount(1);
  await tab(page, "选套餐").click();
  await tab(page, "模型评测").click();
  await expect(page.locator("#benchmarkTask")).toHaveValue("csv-export");
  await expect(page.locator("#benchmarkTasks details")).toHaveCount(1);
});

test("纠错链接预填真实项目与所选证据模板，来源组默认折叠", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => { if (/(benchmark|maintenance)-data[-\w]*\.js/.test(request.url())) requests.push(request.url()); });
  await page.goto("/#contribute", { waitUntil:"networkidle" });
  const link = page.locator("#contributionIssueLink");
  await expect(link).toBeVisible();
  const correction = new URL(await link.getAttribute("href"));
  expect(correction.origin + correction.pathname).toBe("https://github.com/yufeng97/coding-plan-comparison/issues/new");
  expect(correction.searchParams.get("title")).toBe("套餐纠错与更新");
  expect(correction.searchParams.get("body")).toBe(await page.locator("#contributionTemplate").inputValue());
  await page.locator("#contributionType").selectOption("vendor");
  const vendor = new URL(await link.getAttribute("href"));
  expect(vendor.searchParams.get("title")).toBe("收录新厂商 / 套餐");
  expect(vendor.searchParams.get("body")).toBe(await page.locator("#contributionTemplate").inputValue());
  expect(vendor.searchParams.get("body")).toContain("申请收录新厂商");
  expect(requests).toEqual([]);

  await tab(page, "来源说明").click();
  const groups = page.locator("#sourceList .source-group");
  expect(await groups.count()).toBeGreaterThan(5);
  expect(await groups.evaluateAll((elements) => elements.every((element) => !element.hasAttribute("open")))).toBe(true);
  await expect(groups.first().locator("a").first()).toBeHidden();
  await groups.first().locator("summary").click();
  await expect(groups.first().locator("a").first()).toBeVisible();
  expect(requests).toEqual([]);
});

/** 当前协议的成绩里分数最高的配置（「每模型最佳配置」的首行）。 @param {string} protocolId */
function topScore(protocolId) {
  return BENCHMARKS.public.scores.filter((score) => score.benchmarkId === protocolId)
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))[0];
}

test("评测显示合理精度和来源区间，未公布区间单独说明", async ({ page }) => {
  await page.goto("/#benchmarks");
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  const protocolId = await page.locator("#publicBenchmarkSelect").inputValue();
  const protocol = BENCHMARKS.public.benchmarks.find((benchmark) => benchmark.id === protocolId);
  const top = topScore(protocolId);
  const first = page.locator("#publicBenchmarkBody tr").first();
  expect(await first.locator(".public-score-value").evaluate((cell) => cell.childNodes[0].textContent)).toBe(Number(top.score.toFixed(1)) + protocol.unit);
  await expect(first.locator("td").nth(2)).toHaveText(top.costUSD == null ? "未公布" : "$" + Number(top.costUSD.toFixed(2)));
  const uncertainty = first.locator(".public-score-uncertainty");
  await expect(uncertainty).toBeVisible();
  await expect(uncertainty).toContainText("来源区间");
  await expect(uncertainty).toHaveAttribute("title", top.uncertainty);
  expect(await page.locator("#publicBenchmarkBody").innerText()).not.toMatch(/74\.115|4\.4291/);
  /* 来源没有公布区间的成绩：经页面筛选到该行 */
  const plain = BENCHMARKS.public.scores.find((score) => !score.uncertainty);
  const plainProtocol = BENCHMARKS.public.benchmarks.find((benchmark) => benchmark.id === plain.benchmarkId);
  await page.locator("#publicBenchmarkFamily").selectOption(plainProtocol.family);
  await page.locator("#publicBenchmarkSelect").selectOption(plainProtocol.id);
  await page.locator("#publicBenchmarkMode").selectOption("all");
  await page.locator("#publicModelSearch").fill(plain.model);
  await expect(page.locator(".public-score-uncertainty").filter({ hasText:"置信区间未公布" }).first()).toBeVisible();
});

/** 在各评测协议的完整榜单中找到指向某档套餐的链接（逐个切换评测用途与协议）。
 * @param {import("@playwright/test").Page} page @param {string} planId */
async function benchmarkPlanLink(page, planId) {
  const family = page.locator("#publicBenchmarkFamily"), protocol = page.locator("#publicBenchmarkSelect");
  const link = page.locator(`#publicBenchmarkBody [data-benchmark-plan="${planId}"]`).first();
  const values = (select) => select.locator("option").evaluateAll((options) => options.map((option) => option.getAttribute("value")));
  for (const familyValue of await values(family)) {
    await family.selectOption(familyValue);
    for (const protocolValue of await values(protocol)) {
      await protocol.selectOption(protocolValue);
      if (await link.count()) return link;
    }
  }
  throw new Error("没有评测成绩链接到 " + planId);
}

test("评测套餐链接按永久ID打开付费与免费权益，关闭后返回原链接", async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  await page.goto("/#benchmarks");
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  await page.locator("#publicBenchmarkMode").selectOption("all");
  const freeId = catalog.PLANS.find((p) => p.vendor.includes("GitHub") && p.priceM === 0).id;
  for (const id of ["plan-0075", freeId]) {
    const plan = catalog.findPlanReference(id);
    const link = await benchmarkPlanLink(page, id);
    if (!await link.isVisible()) await link.locator("xpath=ancestor::details[1]").locator("summary").click();
    const fallback = new URL(await link.getAttribute("href"), page.url());
    expect(fallback.searchParams.get("q")).toBe(plan.vendor + " " + plan.plan);
    expect(fallback.hash).toBe(catalog.isFreeCodingEntry(plan) ? "#free" : "#table");
    const title = (await link.textContent()).trim();
    await link.click();
    await expect(page.locator("#planDetailsModal")).toBeVisible();
    await expect(page.locator("#planDetailsTitle")).toHaveText(title);
    await expect(page).toHaveURL(/#benchmarks$/);
    await expect(page.locator("#planDetailsBody a[href^='https://']").first()).toBeVisible();
    await page.locator("#planDetailsCloseBtn").click();
    await expect(page.locator("#planDetailsModal")).toBeHidden();
    await expect(link).toBeFocused();
  }
});
