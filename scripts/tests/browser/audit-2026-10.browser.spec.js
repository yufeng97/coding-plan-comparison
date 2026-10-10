// @ts-check
/* 2026-10 全面审查修复：手机表单字号、推荐对比表、窄屏图表标签、预渲染发布页与分享卡片。 */
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { prerenderIndex } = require("../../build/prerender");

const root = path.resolve(__dirname, "..", "..", "..");

test("手机上输入框与下拉字号不小于 16px，避免 iOS 聚焦时放大页面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#s4");
  await page.locator("#costCalculator > summary").click();
  await page.locator("#usageImport > summary").click();
  const sizes = await page.evaluate(() => ["#searchInput", "#chartSearch", "#selectCat", "#metricsModel", "#costRequests", "#costModel", "#usageImportText"]
    .map((selector) => [selector, parseFloat(getComputedStyle(/** @type {Element} */ (document.querySelector(selector))).fontSize)]));
  for (const [selector, size] of sizes) expect(size, String(selector)).toBeGreaterThanOrEqual(16);
});

test("推荐区前三档对比在手机上是卡片，不产生横向滚动；桌面为表格", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?budget=200&region=cn&task=hard");
  const compare = page.locator("#quickGrid .qc-compare");
  await expect(compare.locator("tbody tr")).toHaveCount(3);
  await expect(compare.locator("thead")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await compare.locator("tbody tr").first().boundingBox();
  expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(compare.locator("thead")).toBeVisible();
});

test("窄屏图表把套餐名放在柱子上方，宽屏恢复左侧标签，缩放后整图重绘", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#rank");
  await page.waitForFunction("typeof chartCache !== 'undefined' && !!chartCache.chartRank && !!chartCache.chartRank.getOption()");
  expect(await page.evaluate("chartCache.chartRank.getOption().yAxis[0].axisLabel.inside")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollBy(0, 1));
  await expect.poll(() => page.evaluate("chartCache.chartRank.getOption().yAxis[0].axisLabel.inside")).toBe(false);
});

test("预渲染发布页在脚本执行前即可阅读，启动后按链接条件重绘并移除标记", async ({ browser, baseURL }) => {
  const html = prerenderIndex(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(String(baseURL) + "/", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
    await page.route(String(baseURL) + "/?budget=500", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
    if (!javaScriptEnabled) {
      await page.goto("/");
      await expect(page.locator("#quickGrid .quick-card").first()).toBeVisible();
      expect(await page.locator("#tableBody tr").count()).toBeGreaterThan(5);
      await expect(page.locator("#freeGrid .free-card").first()).toBeAttached();
    } else {
      await page.goto("/?budget=500");
      await page.waitForFunction(() => window["codingPlanReady"] === true);
      expect(await page.locator("[data-prerendered]").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.classList.contains("has-query"))).toBe(false);
      await expect(page.locator('#picker [data-pick="budget"] [data-value="500"]')).toHaveAttribute("aria-pressed", "true");
      expect(errors).toEqual([]);
    }
    await context.close();
  }
});

test("分享卡片图与 canonical 指向主站，图片文件随站发布", async ({ page, request }) => {
  await page.goto("/");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toMatch(/^https:\/\/[^/]+\/img\/og-card\.png$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/[^/]+\/$/);
  const response = await request.get("/img/og-card.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});
