"use strict";
/* 选购优先方式、候选对比、本地用量导入、关注提醒与手机表格的真实浏览器回归。 */
const { test, expect } = require("@playwright/test");

const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const width of [375, 1280]) {
  test(`${width}px 优先方式切换主计划并展示候选对比，不撑出横向滚动`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?budget=200&region=cn");
    await page.waitForFunction(() => window["codingPlanReady"] === true);
    const table = page.locator(".picker-compare-table");
    await expect(table).toBeVisible();
    await expect(table.locator("caption")).toContainText("额度优先");
    await page.locator('#picker [data-pick="priority"] [data-value="ability"]').click();
    await expect(table.locator("caption")).toContainText("能力优先");
    await expect(page.locator(".quick-card").first().locator(".qc-reasons")).toContainText(/能力优先：DeepSWE v1\.1 第 \d+\/\d+ 名/);
    await expect(page).toHaveURL(/priority=ability/);
    expect(await noPageOverflow(page)).toBe(true);
    await page.locator('#picker [data-pick="priority"] [data-value="price"]').click();
    await expect(table.locator("caption")).toContainText("省钱优先");
    await table.locator("[data-view-plan]").first().click();
    await expect(page.locator("#planDetailsModal")).toBeVisible();
    await page.locator("#planDetailsCloseBtn").click();
    expect(await noPageOverflow(page)).toBe(true);
  });
}

test("选择本地 Claude Code 日志后填好计算器并展开套餐用量对照", async ({ page }) => {
  await page.goto("/#s4");
  await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.locator("#costCalculator > summary").click();
  await page.locator("#usageImport > summary").click();
  const lines = [];
  for (let day = 1; day <= 7; day++) for (let i = 0; i < 20; i++) {
    lines.push(JSON.stringify({ type: "assistant", timestamp: `2026-09-0${day}T10:${String(i).padStart(2, "0")}:00Z`, requestId: `r${day}-${i}`,
      message: { id: `m${day}-${i}`, model: "claude-sonnet-5-5", usage: { input_tokens: 300, output_tokens: 900, cache_creation_input_tokens: 2000, cache_read_input_tokens: 40000 } } }));
  }
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#usageImportFileBtn").click();
  await (await chooser).setFiles({ name: "session.jsonl", mimeType: "application/json", buffer: Buffer.from(lines.join("\n")) });
  await expect(page.locator("#usageImportResult")).toContainText("已从文件 session.jsonl 导入 2026-09-01 至 2026-09-07（7 天，活跃 7 天）");
  await expect(page.locator("#usageImportResult")).toContainText("Anthropic · Claude Sonnet 5.5");
  await expect(page.locator("#costRequests")).toHaveValue("20");
  await expect(page.locator("#costInput")).toHaveValue("97.9");
  await expect(page.locator("#usageFit")).toHaveAttribute("open", "");
  await expect(page.locator("#usageFit summary")).toContainText(/按这个用量对照套餐参考额度（\d+ 档保守够用/);
  expect(await page.evaluate(() => location.href.includes("m1-0"))).toBe(false);
});

test("375px 关注套餐的未读变更显示在导航，价格表可按厂商筛选并一次展开全部", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.addInitScript(() => localStorage.setItem("cp-followed-plans-v1", JSON.stringify({ version: 1, planIds: ["plan-0101"], readChangeIds: [] })));
  await page.goto("/#table");
  await page.waitForFunction(() => window["codingPlanReady"] === true);
  const badge = page.locator("#followNavBadge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/\d+/);
  const all = page.locator("#tableAllBtn");
  await expect(all).toBeVisible();
  const total = await page.evaluate(() => window["computeTableRows"]().length);
  await all.click();
  await expect(page.locator("#tableBody tr")).toHaveCount(total);
  await page.locator("#selectVendor").selectOption("Cursor");
  await expect(page).toHaveURL(/tvendor=Cursor/);
  const vendors = await page.locator("#tableBody .td-vendor").allTextContents();
  expect(vendors.length).toBeGreaterThan(0);
  expect(vendors.every((text) => text.trim() === "Cursor")).toBe(true);
  expect(await noPageOverflow(page)).toBe(true);
  await page.locator('[data-site-view="updates"]').click();
  await page.waitForFunction(() => window["optionalDataLoaded"]("maintenance"));
  await page.locator("#markFollowReadBtn").click();
  await expect(badge).toBeHidden();
});
