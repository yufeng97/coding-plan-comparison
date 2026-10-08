const { test, expect } = require("@playwright/test");

test("关注永久套餐跨刷新保留，已确认历史与已读记录一致", async ({ page }) => {
  await page.goto("/#updates");
  await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.waitForFunction("typeof MAINTENANCE !== 'undefined'");
  await expect(page.locator('[data-site-view="updates"]')).toHaveAttribute("aria-current", "page");
  const id = await page.evaluate("MAINTENANCE.changes.find(c => c.kind === 'plan').id");
  await page.locator("#maintenancePlan").selectOption(id);
  const watch = page.locator("#maintenanceHistory [data-watch-plan]");
  await watch.focus(); await page.keyboard.press("Enter");
  await expect(watch).toBeFocused();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#followedChanges .change-unread").first()).toBeVisible();
  await page.reload(); await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.waitForFunction("typeof MAINTENANCE !== 'undefined'");
  await expect(page.locator(`#followedPlans [data-watch-plan="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  await page.locator("#markFollowReadBtn").click();
  await expect(page.locator("#markFollowReadBtn")).toBeDisabled();
  await expect(page.locator("#followedChanges")).toContainText("没有未读");
  await page.reload(); await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.waitForFunction("typeof MAINTENANCE !== 'undefined'");
  await expect(page.locator("#followedChanges")).toContainText("没有未读");
  await page.locator("#maintenancePlan").selectOption(id);
  await page.locator("#maintenanceHistory .plan-history summary").click();
  await expect(page.locator("#maintenanceHistory .change-fields").first()).toContainText("→");
});

test("手机关注按钮同步完整权益，官网入口与详情中的两个等宽动作可用", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/"); await page.waitForFunction(() => window["codingPlanReady"] === true);
  const card = page.locator("#quickGrid .quick-card").first();
  const watch = card.locator("[data-watch-plan]");
  await watch.click(); await expect(watch).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".qc-primary")).toBeVisible();
  await card.locator(".qc-details > summary").click();
  const dimensions = await card.locator(".qc-actions .qc-action").evaluateAll((els) => els.map((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, top: el.getBoundingClientRect().top })));
  expect(dimensions).toHaveLength(2);
  for (const d of dimensions) { expect(Math.abs(d.width - dimensions[0].width)).toBeLessThan(1); expect(d.height).toBe(dimensions[0].height); expect(d.top).toBe(dimensions[0].top); }
  await card.locator("[data-view-plan]").click();
  const detailsWatch = page.locator("#planDetailsBody [data-watch-plan]");
  await expect(detailsWatch).toHaveAttribute("aria-pressed", "true");
  await detailsWatch.focus(); await page.keyboard.press("Enter");
  await expect(detailsWatch).toBeFocused();
  await expect(page.locator("#planFollowFeedback")).toContainText("取消关注");
  await page.keyboard.press("Escape");
  await expect(card.locator("[data-view-plan]")).toBeFocused();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("存储不可用提示、跨标签贡献者规范、真实Issues与模板下载可用", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("unavailable"); } }); });
  await page.goto("/#updates"); await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.waitForFunction("typeof MAINTENANCE !== 'undefined'");
  await expect(page.locator("#followStorageNote")).toContainText("不会保留");
  await page.locator('[data-site-view="benchmarks"]').click();
  await expect(page.locator('[data-site-view="benchmarks"]')).toHaveAttribute("aria-current", "page");
  await page.waitForFunction("typeof BENCHMARKS !== 'undefined'");
  await page.locator("#contributorBenchmarkTools > summary").click();
  await expect(page.locator("#benchmarkResults")).toContainText("尚未收录贡献者任务记录");
  await expect(page.locator("#benchmarkTasks details")).toHaveCount(3);
  await page.locator("#benchmarkTask").selectOption("csv-export");
  await expect(page.locator("#benchmarkTasks details")).toHaveCount(1);
  await page.locator('[data-site-view="contribute"]').click();
  await expect(page.locator('[data-site-view="contribute"]')).toHaveAttribute("aria-current", "page");
  await page.locator("#contributionType").selectOption("benchmark");
  await expect(page.locator("#contributionTemplate")).toHaveValue(/任务：csv-export/);
  await expect(page.locator("#contributionIssueLink")).toBeVisible();
  await expect(page.locator("#contributionIssueLink")).toHaveAttribute("href", /^https:\/\/github\.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  const pending = page.waitForEvent("download"); await page.locator("#downloadContributionBtn").click();
  const file = await pending; expect(file.suggestedFilename()).toBe("coding-plan-benchmark-evidence.md");
});
