"use strict";

const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** @param {import('@playwright/test').Page} page */
function trackErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.type() + ": " + message.text());
  });
  return errors;
}

/** @param {import('@playwright/test').Page} page */
async function openPersonal(page) {
  await page.goto("/index.html#s1");
  await expect(page.locator("#showAllPersonal")).toBeVisible();
  await expect.poll(() => page.evaluate("echarts.version")).toBe("6.1.0");
}

test("file直开保留本地脚本、真实图表与筛选操作", async ({ page }) => {
  const errors = trackErrors(page);
  const url = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href + "#s1";
  await page.goto(url);
  await expect(page.locator("#showAllPersonal")).toBeVisible();
  await expect(page.locator("#chartPersonal canvas")).toHaveCount(1);
  await page.locator("#chartSearch").fill("Claude");
  await expect.poll(() => page.evaluate("chartCache.chartPersonal.getOption().series[0].data.length")).toBeGreaterThan(20);
  await expect(page.locator("#chartSearch")).toHaveValue("Claude");
  await expect(page.locator("#tableBody tr")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("空白和被忽略的符号保持20档，展开与收起仍可操作", async ({ page }) => {
  const errors = trackErrors(page);
  await openPersonal(page);
  for (const value of [" ", "---", " . / _ · "]) {
    const oldToggle = await page.locator("#showAllPersonal").elementHandle();
    expect(oldToggle).not.toBeNull();
    await page.locator("#chartSearch").fill(value);
    /* 等待真实防抖渲染替换旧按钮，避免默认20档让断言在渲染前就通过。 */
    await oldToggle.waitForElementState("hidden");
    await oldToggle.dispose();
    await expect(page.locator("#showAllPersonal")).toBeVisible();
    expect(await page.evaluate("chartCache.chartPersonal.getOption().series[0].data.length")).toBe(20);
    await expect(page.locator("#notePersonal")).not.toContainText("同名模型还有");
  }
  await page.locator("#showAllPersonal").click();
  await expect(page.locator("#showAllPersonal")).toContainText("收起为 20 档");
  expect(await page.evaluate("chartCache.chartPersonal.getOption().series[0].data.length")).toBeGreaterThan(20);
  await page.locator("#showAllPersonal").click();
  await expect(page.locator("#showAllPersonal")).toContainText("显示全部");
  expect(await page.evaluate("chartCache.chartPersonal.getOption().series[0].data.length")).toBe(20);
  expect(errors).toEqual([]);
});

test("真实ECharts同时隐藏两组区间，主题和resize重绘保留选择及aria", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/index.html#s3");
  await expect.poll(() => page.evaluate("echarts.version")).toBe("6.1.0");
  const chips = page.locator("#tokensLegend button[data-series]");
  await expect(chips).toHaveCount(2);
  for (const chip of await chips.all()) {
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  }
  const filtered = () => page.evaluate("(() => { const model = chartCache.chartTokens.getModel(); return model.getSeries().map(series => model.isSeriesFiltered(series)); })()");
  await expect.poll(filtered).toEqual([true, true, true, true]);
  await page.locator("#themeBtn").click();
  await expect.poll(filtered).toEqual([true, true, true, true]);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect.poll(() => page.evaluate("chartCache.chartTokens.getWidth() === document.getElementById('chartTokens').clientWidth")).toBe(true);
  await expect.poll(filtered).toEqual([true, true, true, true]);
  for (const chip of await chips.all()) await expect(chip).toHaveAttribute("aria-pressed", "false");
  for (const chip of await chips.all()) await chip.click();
  await expect.poll(filtered).toEqual([false, false, false, false]);
  expect(errors).toEqual([]);
});

test("个人图表空态清除后恢复20档和真实画布", async ({ page }) => {
  const errors = trackErrors(page);
  await openPersonal(page);
  await page.locator("#chartSearch").fill("__不匹配任何计划__");
  await expect(page.locator("#chartPersonalEmpty")).toBeVisible();
  await expect(page.locator("#chartPersonal")).toBeHidden();
  await page.locator("#personalResetBtn").click();
  await expect(page.locator("#chartSearch")).toBeFocused();
  await expect(page.locator("#chartPersonalEmpty")).toBeHidden();
  await expect(page.locator("#chartPersonal")).toBeVisible();
  await expect(page.locator("#showAllPersonal")).toBeVisible();
  expect(await page.evaluate("chartCache.chartPersonal.getOption().series[0].data.length")).toBe(20);
  expect(await page.evaluate("chartCache.chartPersonal.getWidth()")).toBeGreaterThan(100);
  expect(await page.evaluate("chartCache.chartPersonal.getHeight()")).toBeGreaterThan(400);
  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}画布可见，表格在容器内横滚且页面不溢出`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript("localStorage.setItem('cp-theme', " + JSON.stringify(theme) + ");");
      await page.goto("/index.html#s4");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect.poll(() => page.evaluate("echarts.version")).toBe("6.1.0");
      await expect(page.locator("#apiDetailBody tr")).toHaveCount(36);
      for (const id of ["chartPersonal", "chartTokens", "chartApi", "chartPower"]) {
        expect(await page.locator("#" + id + " canvas").count()).toBeGreaterThan(0);
        const size = await page.evaluate("({ width: chartCache." + id + ".getWidth(), height: chartCache." + id + ".getHeight(), containerWidth: document.getElementById(" + JSON.stringify(id) + ").clientWidth })");
        expect(size.width).toBeGreaterThan(100);
        expect(size.height).toBeGreaterThan(400);
        expect(Math.abs(size.width - size.containerWidth)).toBeLessThanOrEqual(1);
      }
      const viewport = await page.evaluate("({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth })");
      expect(viewport.document).toBeLessThanOrEqual(viewport.viewport + 1);
      expect(viewport.body).toBeLessThanOrEqual(viewport.viewport + 1);
      for (const selector of [".api-detail-wrap", "#table .table-wrap"]) {
        const wrapper = page.locator(selector);
        const before = await wrapper.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, left: el.scrollLeft }));
        expect(before.width).toBeGreaterThan(100);
        if (width < 768) {
          expect(before.scrollWidth).toBeGreaterThan(before.width);
          await wrapper.evaluate(el => { el.scrollLeft = el.scrollWidth; });
          expect(await wrapper.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
