"use strict";
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const maintenance = vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../../js/maintenance-data.js"), "utf8") + "; MAINTENANCE;");
const followed = maintenance.changes.find((change) => change.kind === "plan");
const readIds = maintenance.changes.filter((change) => change.id === followed.id).map((change) => change.changeId);
const tab = (page, name) => page.getByRole("link", { name, exact:true });

test("首页按标签延迟加载资料，历史返回和回首页保留视图且不重复下载", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    const match = new URL(request.url()).pathname.match(/\/(benchmark|maintenance)-data\.js$/);
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
  await page.waitForFunction(() => window["optionalDataLoaded"]("maintenance"));
  await expect(page.locator("#maintenanceSummary")).not.toBeEmpty();
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
    await page.route(`**/js/${kind}-data.js*`, async (route) => {
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
    await page.waitForFunction(kind => window["optionalDataLoaded"](kind), kind);
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
  await page.route("**/js/maintenance-data.js*", async (route) => { requested = true; await route.continue(); });
  await page.addInitScript(({ planId, readChangeIds }) => {
    localStorage.setItem("cp-followed-plans-v1", JSON.stringify({ version:1, planIds:[planId], readChangeIds }));
  }, { planId:followed.id, readChangeIds:readIds });
  await page.goto("/", { waitUntil:"networkidle" });
  expect(requested).toBe(false);
  expect(await page.evaluate("followState.readChangeIds")).toEqual(readIds);
  const watch = page.locator("#quickGrid > .quick-card").first().locator("[data-watch-plan]");
  const planId = await watch.getAttribute("data-watch-plan");
  const previous = await watch.getAttribute("aria-pressed");
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", previous === "true" ? "false" : "true");
  expect(await page.evaluate("JSON.parse(localStorage.getItem(FOLLOW_KEY)).readChangeIds")).toEqual(readIds);
  // 还原当前主卡的关注状态，让维护页只检验预置套餐的已读历史。
  await watch.click();
  expect(requested).toBe(false);
  await tab(page, "我的关注").click();
  await page.waitForFunction(() => window["optionalDataLoaded"]("maintenance"));
  await expect(page.locator("#followedChanges")).toContainText("没有未读");
  await expect(page.locator("#markFollowReadBtn")).toBeDisabled();
  expect(await page.evaluate("followState.readChangeIds")).toEqual(readIds);
  expect(await page.evaluate("JSON.parse(localStorage.getItem(FOLLOW_KEY)).readChangeIds")).toEqual(readIds);
  expect(planId).toMatch(/^plan-/);
});

test("测评贡献下载失败可在当前标签重试，任务筛选返回后仍与结果一致", async ({ page }) => {
  let fail = true;
  await page.route("**/js/benchmark-data.js*", async (route) => {
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
  page.on("request", (request) => { if (/(benchmark|maintenance)-data\.js/.test(request.url())) requests.push(request.url()); });
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

test("评测显示合理精度和来源区间，套餐匹配不把5.5误当5", async ({ page }) => {
  await page.goto("/#benchmarks");
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  const snapshot = await page.evaluate("(() => { const row = publicBenchmarkRows()[0]; return { score:Number(row.score.toFixed(1)) + selectedPublicBenchmark().unit, cost:row.costUSD == null ? '未公布' : '$' + Number(row.costUSD.toFixed(2)), uncertainty:row.uncertainty }; })()");
  const first = page.locator("#publicBenchmarkBody tr").first();
  expect(await first.locator(".public-score-value").evaluate((cell) => cell.childNodes[0].textContent)).toBe(snapshot.score);
  await expect(first.locator("td").nth(2)).toHaveText(snapshot.cost);
  const uncertainty = first.locator(".public-score-uncertainty");
  await expect(uncertainty).toBeVisible();
  await expect(uncertainty).toContainText("来源区间");
  await expect(uncertainty).toHaveAttribute("title", snapshot.uncertainty);
  expect(await page.locator("#publicBenchmarkBody").innerText()).not.toMatch(/74\.115|4\.4291/);
  await page.evaluate(`(() => {
    const row = publicBenchmarkData().scores.find(r => !r.uncertainty);
    const protocol = publicBenchmarkData().benchmarks.find(b => b.id === row.benchmarkId);
    publicBenchmarkState.id = protocol.id; publicBenchmarkState.family = protocol.family;
    publicBenchmarkState.search = row.model; publicBenchmarkState.mode = "all";
    syncPublicBenchmarkChoices(); renderPublicBenchmarks();
  })()`);
  await expect(page.locator(".public-score-uncertainty").filter({ hasText:"置信区间未公布" }).first()).toBeVisible();
  const versions = await page.evaluate(`(() => {
    const plan = PLANS.find(p => p.id === "plan-0002"), original = plan.models;
    try {
      plan.models = "Claude Opus 5.5";
      const wrong = publicModelPlans("claude-opus-5").some(p => p === plan);
      const exact = publicModelPlans("claude-opus-5-5").some(p => p === plan);
      plan.models = "Claude Sonnet 5.5（不含 Claude Opus 5.5）";
      const excluded = publicModelPlans("claude-opus-5-5").some(p => p === plan);
      return { wrong, exact, excluded };
    } finally { plan.models = original; }
  })()`);
  expect(versions).toEqual({ wrong:false, exact:true, excluded:false });
  expect(await page.evaluate("publicModelPlans('glm-5.3').some(p=>['plan-0174','plan-0175','plan-0176','plan-0177','plan-0039'].includes(p.id))")).toBe(false);
  expect(await page.evaluate("publicModelPlans('glm-5.3-flash').some(p=>p.id==='plan-0174')")).toBe(true);
  expect(await page.evaluate("publicModelPlans('claude-fable-5.1').filter(p=>p.vendor==='Anthropic').map(p=>p.id)")).toEqual(["plan-0003", "plan-0006", "plan-0004"]);
  expect(await page.evaluate("publicModelPlans('GPT-6.1 Sol').filter(p=>p.vendor==='OpenAI').map(p=>p.id)")).toEqual(["plan-0010", "plan-0011", "plan-0012", "plan-0013"]);
  expect(await page.evaluate("publicModelPlans('GPT-6.2 Sol').some(p=>p.vendor==='OpenAI')")).toBe(false);
  expect(await page.evaluate("publicModelPlans('GPT-6 Luna').some(p=>p.id==='plan-0010')")).toBe(true);
  expect(await page.evaluate("publicModelIncluded(PLANS.find(p=>p.id==='plan-0001'), 'Claude Haiku 4.5')")).toBe(true);
  expect(await page.evaluate("publicModelPlans('claude-opus-5').map(p=>p.id)")).toEqual(await page.evaluate("publicModelPlans('Opus 5').map(p=>p.id)"));
});

test("评测套餐链接按永久ID打开付费与免费权益，关闭后返回原链接", async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  await page.goto("/#benchmarks");
  await expect(page.locator("#publicBenchmarkBody tr").first()).toBeVisible();
  const freeId = await page.evaluate("PLANS.find(p=>p.vendor.includes('GitHub') && p.priceM===0).id");
  for (const id of ["plan-0075", freeId]) {
    const target = await page.evaluate(`((planId) => {
      const row = publicBenchmarkData().scores.find((score) => publicModelPlans(score.model).some((plan) => plan.id === planId));
      const protocol = publicBenchmarkData().benchmarks.find((item) => item.id === row.benchmarkId);
      publicBenchmarkState.id = protocol.id; publicBenchmarkState.family = protocol.family;
      publicBenchmarkState.search = row.model; publicBenchmarkState.mode = "best";
      syncPublicBenchmarkChoices(); renderPublicBenchmarks();
      const plan = PLANS.find((item) => item.id === planId);
      return { title:planTitle(plan), search:plan.vendor + " " + plan.plan, free:isFreeCodingEntry(plan) };
    })(${JSON.stringify(id)})`);
    const link = page.locator(`[data-benchmark-plan="${id}"]`).first();
    if (!await link.isVisible()) await link.locator("xpath=ancestor::details[1]").locator("summary").click();
    const fallback = new URL(await link.getAttribute("href"), page.url());
    expect(fallback.searchParams.get("q")).toBe(target.search);
    expect(fallback.hash).toBe(target.free ? "#free" : "#table");
    await link.click();
    await expect(page.locator("#planDetailsModal")).toBeVisible();
    await expect(page.locator("#planDetailsTitle")).toHaveText(target.title);
    await expect(page).toHaveURL(/#benchmarks$/);
    await expect(page.locator("#planDetailsBody a[href^='https://']").first()).toBeVisible();
    await page.locator("#planDetailsCloseBtn").click();
    await expect(page.locator("#planDetailsModal")).toBeHidden();
    await expect(link).toBeFocused();
  }
});
