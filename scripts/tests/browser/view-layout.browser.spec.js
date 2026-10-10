"use strict";
const { test, expect } = require("@playwright/test");

const sharedQuery = "?budget=any&tool=claude&task=hard&rscope=credits&cmp=plan-0159%3Bplan-0002&cmodel=%E6%99%BA%E8%B0%B1+BigModel%7CGLM-5.3";

for (const width of [375, 1280]) {
  for (const [chart, section] of [["chartRank", "rank"], ["chartApi", "s4"]]) {
    test(`${width}px ${chart} 悬浮后切换模型评测和关注，页脚后不残留滚动空白`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/" + sharedQuery + "#" + section);
      await page.waitForFunction(() => window["codingPlanReady"] === true);
      await page.locator("#cmpCloseBtn").click();
      await page.waitForFunction("typeof chartCache !== 'undefined' && !!chartCache." + chart);
      await page.evaluate("chartCache." + chart + ".dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })");
      await expect.poll(() => page.locator('div[style*="z-index: 2000"]').count()).toBeGreaterThan(0);

      for (const [view, data] of [["benchmarks", "benchmark"], ["updates", "maintenance"]]) {
        await page.locator(`[data-site-view="${view}"]`).click();
        await page.waitForFunction((kind) => window["optionalDataLoaded"](kind), data);
        await expect(page.locator(`#${view}`)).toBeVisible();
        await expect.poll(() => page.evaluate(() => {
          const footerBottom = document.querySelector("footer").getBoundingClientRect().bottom + window.scrollY;
          return document.documentElement.scrollHeight - Math.max(window.innerHeight, footerBottom);
        })).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
    });
  }
}

for (const width of [375, 1280]) {
  test(`${width}px 我的关注先展示关注内容，核查统计按需展开`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#updates");
    await page.waitForFunction(() => window["codingPlanReady"] === true && window["optionalDataLoaded"]("maintenance"));

    await expect(page.locator("#followedPlans")).toBeVisible();
    await expect(page.locator("#maintenanceSummary")).toBeHidden();
    await expect(page.locator("#downloadPublicDataBtn")).toBeHidden();
    expect(await page.locator("#updates").evaluate((section) => {
      const followed = section.querySelector("#followedPlans");
      const snapshot = section.querySelector("#maintenanceSnapshot");
      return Boolean(followed.compareDocumentPosition(snapshot) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    expect(await page.locator("#followedPlans").evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(650);

    await page.locator("#maintenanceSnapshot > summary").click();
    await expect(page.locator("#maintenanceSummary")).toBeVisible();
    await expect(page.locator("#downloadPublicDataBtn")).toBeVisible();

    const choose = page.locator('#followedPlans a[href="#quick"]');
    await expect(choose).toBeVisible();
    await choose.click();
    await expect(page.locator("#quick")).toBeVisible();
    await expect(page.locator('[data-site-view="compare"]')).toHaveAttribute("aria-current", "page");
  });
}
