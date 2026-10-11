"use strict";

const { test, expect } = require("@playwright/test");
const { catalog } = require("./helpers");

for (const width of [375, 1280]) {
  test(`${width}px 核价来源可键盘展开且长网址不撑宽页面`, async ({ page }) => {
    /** @type {string[]} */
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#sources");
    const updated = catalog.META.updated;
    await expect(page.locator("#heroDate")).toHaveText(updated);
    await expect(page.locator("#footDate")).toHaveText(updated);

    const details = page.locator("#sourceList > details.audit-sources");
    const summary = details.locator("summary");
    /* 只展示仍被当前记录引用的来源；被替换的旧证据留在台账。 */
    const count = new Set(Object.values(catalog.PRICE_CHECKS.rows).flatMap((row) => row.sourceIds)).size;
    await expect(summary).toContainText(count + " 页");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator("a")).toHaveCount(count);
    await page.keyboard.press("Tab");
    await expect(details.locator("a").first()).toBeFocused();

    const pending = page.locator("#uncertainWrap");
    const pendingCount = Object.values(catalog.PRICE_CHECKS.rows).filter((row) => row.status === "unverified").length;
    await expect(pending.locator("> summary")).toContainText(pendingCount + " 条价格待核实");
    await pending.locator("> summary").focus();
    await page.keyboard.press("Enter");
    await expect(pending).toHaveAttribute("open", "");
    await expect(page.locator("#uncertainList > li > b")).toHaveCount(pendingCount);
    const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth }));
    expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
    expect(size.body).toBeLessThanOrEqual(size.viewport + 1);
    expect(errors).toEqual([]);
  });
}
