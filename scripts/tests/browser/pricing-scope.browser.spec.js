"use strict";
const { test, expect } = require("@playwright/test");

for (const width of [375, 1280]) {
  test(`${width}px 选购支付方式同步排行和价格表排序并可取消`, async ({page}) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({width,height:900});
    await page.goto("/?budget=any&region=all&billing=Y&rank=all&rapply=1&tapply=1&tsort=selectedMonthly:1#rank");
    await expect(page.locator("#rankScope")).toContainText("年付折月");
    const annual = await page.evaluate('rankRows().find(r=>r.m.ref==="plan-0157").c');
    expect(annual.priceCNY).toBeCloseTo(82.6,8);
    await page.locator('[data-pick="billing"] [data-value="A"]').click();
    await expect(page.locator("#rankScope")).toContainText("自动续费");
    const renewal = await page.evaluate('rankRows().find(r=>r.m.ref==="plan-0157").c');
    expect(renewal.priceCNY).toBeCloseTo(94.4,8);
    expect(renewal.moMidM).toBeCloseTo(annual.moMidM,8);
    await page.locator("#table").scrollIntoViewIfNeeded();
    const sort=page.locator("#tablePriceSort");
    await expect(sort).toHaveValue("selectedMonthly:1");
    await sort.selectOption("selectedMonthly:-1");
    const prices=await page.evaluate("computeTableRows().map(p=>pickerMonthlyCNY(p))");
    expect(prices.length).toBeGreaterThan(1);
    for(let i=1;i<prices.length;i++)expect(prices[i]).toBeLessThanOrEqual(prices[i-1]);
    await page.reload();
    await expect(sort).toHaveValue("selectedMonthly:-1");
    await page.locator('[data-apply-picker="table"]').click();
    await expect(sort).toHaveValue("priceM:1");
    await expect(sort.locator('option[value="selectedMonthly:1"]')).toBeDisabled();
    await page.locator('[data-apply-picker="rank"]').click();
    await expect(page.locator("#rankScope")).toContainText("尚未应用");
    expect(await page.evaluate('rankRows().find(r=>r.m.ref==="plan-0157").c.priceCNY')).toBe(118);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")).toBe(true);
    expect(errors).toEqual([]);
  });
}
