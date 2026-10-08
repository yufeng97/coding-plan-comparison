"use strict";

const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

for (const width of [375, 1280]) {
  test(`${width}px file直开核价来源可键盘展开且长网址不撑宽页面`, async ({ page }) => {
    /** @type {string[]} */
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    const url = pathToFileURL(path.resolve(__dirname, "..", "..", "..", "index.html")).href;
    await page.goto(url + "#sources");
    const updated = await page.evaluate("META.updated");
    await expect(page.locator("#heroDate")).toHaveText(updated);
    await expect(page.locator("#footDate")).toHaveText(updated);

    const details = page.locator("#sourceList > details.audit-sources");
    const summary = details.locator("summary");
    const count = await page.evaluate("Object.keys(PRICE_CHECKS.sources).length");
    await expect(summary).toContainText(count + " 页");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator("a")).toHaveCount(count);
    await page.keyboard.press("Tab");
    await expect(details.locator("a").first()).toBeFocused();

    const pending = page.locator("#uncertainWrap");
    const pendingCount = await page.evaluate("Object.values(PRICE_CHECKS.rows).filter(row => row.status === 'unverified').length");
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
