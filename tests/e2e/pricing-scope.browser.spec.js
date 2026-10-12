"use strict";
const { test, expect } = require("@playwright/test");
const { catalog } = require("./helpers");

/** 排行明细里某档套餐的首行（与图表同序）：月费与月 tokens 区间。vendorLabel 为排行里显示的厂商简称。
 * @param {import("@playwright/test").Page} page @param {string} planId @param {string} vendorLabel */
async function rankRow(page, planId, vendorLabel) {
  const plan = catalog.findPlanReference(planId);
  await page.locator("#rankDetailsSummary").click();
  const row = page.locator("#rankDetailBody tr").filter({ hasText: plan.plan }).filter({ hasText: vendorLabel }).first();
  const value = { price: (await row.locator(".td-price").textContent() || "").trim(), tokens: (await row.locator(".tok-cell").textContent() || "").trim() };
  await page.locator("#rankDetailsSummary").click();
  return value;
}

for (const width of [375, 1280]) {
  test(`${width}px 选购支付方式同步排行和价格表排序并可取消`, async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({width,height:900});
    await page.goto("/?budget=any&region=all&billing=Y&rank=all&rapply=1&tapply=1&tsort=selectedMonthly:1#rank");
    await expect(page.locator("#rankScope")).toContainText("年付折月");
    /* 智谱 GLM Coding V3 Lite：年付折月 ¥82.6、自动续费 ¥94.4、目录月付 ¥118；额度不随付款方式变化 */
    const annual = await rankRow(page, "plan-0157", "BigModel");
    expect(annual.price).toMatch(/^¥82\.6\/月/);
    await page.locator('[data-pick="billing"] [data-value="A"]').click();
    await expect(page.locator("#rankScope")).toContainText("自动续费");
    const renewal = await rankRow(page, "plan-0157", "BigModel");
    expect(renewal.price).toMatch(/^¥94\.4\/月/);
    expect(renewal.tokens).toBe(annual.tokens);
    await page.locator("#table").scrollIntoViewIfNeeded();
    const sort=page.locator("#tablePriceSort");
    await expect(sort).toHaveValue("selectedMonthly:1");
    await sort.selectOption("selectedMonthly:-1");
    await expect.poll(() => new URL(page.url()).searchParams.get("tsort")).toBe("selectedMonthly:-1");
    await page.reload();
    await expect(sort).toHaveValue("selectedMonthly:-1");
    await page.locator('[data-apply-picker="table"]').click();
    await expect(sort).toHaveValue("priceM:1");
    await expect(sort.locator('option[value="selectedMonthly:1"]')).toBeDisabled();
    await page.locator('[data-apply-picker="rank"]').click();
    await expect(page.locator("#rankScope")).toContainText("尚未应用");
    expect((await rankRow(page, "plan-0157", "BigModel")).price).toMatch(/^¥118\/月/);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")).toBe(true);
    expect(errors).toEqual([]);
  });
}
