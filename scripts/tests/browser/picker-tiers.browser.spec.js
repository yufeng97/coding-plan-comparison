const { test, expect } = require("@playwright/test");

for (const width of [375, 1280]) {
  test(`${width}px Claude Code native reference follows budget while compatible main stays domestic`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("/?budget=any&region=cn&tool=claude&task=hard");
    const main = page.locator("#quickGrid > .quick-card").first();
    await expect(main.locator(".qc-plan")).toContainText("GLM Coding V3 Max");
    await expect(main.locator(".qc-reasons")).toContainText("Claude Code 兼容接入");
    const own = page.locator('#quickGrid > .quick-card:has([data-plan-id="plan-0004"])');
    await expect(own.locator(".qc-title-label")).toHaveText("Anthropic 国际参考");
    await expect(own.locator(".qc-value")).toContainText("$200");
    await expect(own.locator(".qc-reasons")).toContainText("当前地区不符合");
    await expect(own.locator(".qc-tiers")).toBeHidden();
    await own.locator(".qc-details > summary").click();
    await expect(own.locator(".qc-tiers")).toBeVisible();
    await expect(own.locator(".qc-tiers tbody tr")).toHaveCount(3);
    await expect(own.locator(".qc-tiers tr.is-current")).toContainText("20× Pro");
    await expect(own.locator(".qc-tiers tr.is-current")).toContainText("当前参考");
    for (const element of [main.locator(".qc-reasons"), own.locator(".qc-reasons"), own.locator(".qc-tiers")]) {
      const bounds = await element.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const budget = page.locator('#picker [data-pick="budget"]');
    await budget.getByRole("button", { name:"≤ ¥500", exact:true }).click();
    const affordable = page.locator('#quickGrid > .quick-card:has([data-plan-id="plan-0002"])');
    await expect(affordable.locator(".qc-value")).toContainText("$20");
    await expect(affordable.locator(".qc-reasons")).toContainText("预算内按任务与公开额度");
    await expect(affordable.locator(".qc-title-label")).toHaveText("Anthropic 国际参考");
    await expect(page.locator('#quickGrid > .quick-card:has([data-plan-id="plan-0004"])')).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.searchParams.get("budget") === "500"
      && url.searchParams.get("tool") === "claude" && (url.searchParams.get("region") || "cn") === "cn");
    expect(await page.evaluate("pickerState.region")).toBe("cn");
    await page.reload();
    await expect(page.locator('#quickGrid > .quick-card:has([data-plan-id="plan-0002"]) .qc-value')).toContainText("$20");
  });

  test(`${width}px picker decisions precede optional evidence and Cursor explains metered complex tasks`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("/?budget=200&region=cn&tool=cursor&task=hard");
    const own = page.locator('#quickGrid > .quick-card:has([data-plan-id="plan-0098"])');
    await expect(own.locator(".qc-reasons")).toContainText("复杂任务模型在按量池");
    await expect(own.locator(".qc-reasons")).not.toContainText("没有匹配");
    await expect(own.locator(".qc-bench")).toHaveCount(0);
    await expect(own.locator(".qc-actions")).toBeVisible();
    await expect(own.locator(".qc-primary")).toBeVisible();
    const payment = own.locator(":scope > .qc-payment-summary");
    await expect(payment).toContainText("首次 $20");
    await expect(payment).not.toContainText("12 个月");
    await expect(own.locator(".qc-details .qc-payment-summary")).toBeHidden();
    await own.locator(".qc-details > summary").click();
    await expect(own.locator(".qc-details .qc-payment-summary")).toBeVisible();
    await expect(own.locator(".qc-details .qc-payment-summary")).toContainText("12 个月");
    const bounds = await payment.boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [375, 720]) {
  test(`${width}px table comparison and watch actions have consistent touch targets`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("/#table");
    const row = page.locator("#tableBody tr").first();
    await row.scrollIntoViewIfNeeded();
    for (const button of [row.locator(".cmp-add"), row.locator(".watch-plan")]) {
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(40);
    }
  });
}
