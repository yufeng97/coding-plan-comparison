"use strict";
const { test, expect } = require("@playwright/test");
const { chartOf, waitForApp, waitForData } = require("./helpers");

test("公开评测在桌面缩放及手机横竖屏切换后保留专用型号标签", async ({ page }) => {
  await page.goto("/#benchmarks");
  await waitForApp(page);
  await waitForData(page, "benchmark");
  const chart = page.locator("#chartPublicBenchmark");
  await expect(chart.locator("canvas")).toHaveCount(1);
  await chart.scrollIntoViewIfNeeded();
  const label = () => page.evaluate(`(() => {
    const axis = ${chartOf("chartPublicBenchmark")}.getOption().yAxis[0];
    return axis.axisLabel.formatter("#12 Claude Opus 4.6 · high / Agent");
  })()`);
  await expect.poll(label).toBe("#12 Opus 4.6 · high / Agent");
  for (const width of [375, 812, 375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await chart.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(`Math.abs(${chartOf("chartPublicBenchmark")}.getWidth() - document.getElementById("chartPublicBenchmark").clientWidth)`)).toBeLessThan(1);
    await expect.poll(label).toBe(width === 375 ? "#12 Opus\n4.6" : "#12 Opus 4.6 · high / Agent");
  }
});
