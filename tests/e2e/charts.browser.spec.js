"use strict";

const { test, expect } = require("@playwright/test");
const { chartOf } = require("./helpers");

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

test("发布产物加载真实图表并可筛选，控制台无报错", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/index.html#s1");
  await expect(page.locator("#showAllPersonal")).toBeVisible();
  await expect(page.locator("#chartPersonal canvas")).toHaveCount(1);
  await page.locator("#chartSearch").fill("Claude");
  await expect.poll(() => page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBeGreaterThan(20);
  await expect(page.locator("#chartSearch")).toHaveValue("Claude");
  await expect(page.locator("#tableBody tr")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("空白和被忽略的符号保持20档，展开与收起仍可操作", async ({ page }) => {
  const errors = trackErrors(page);
  await openPersonal(page);
  for (const value of [" ", "---", " . / _ · "]) {
    await page.locator("#chartSearch").fill(value);
    /* Vue 保留按钮节点；等待防抖搜索提交及图表稳定，再核对默认条数与焦点。 */
    await expect.poll(() => new URL(page.url()).searchParams.get("pq")).toBe(value);
    await expect.poll(() => page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
    await expect(page.locator("#chartSearch")).toBeFocused();
    await expect(page.locator("#showAllPersonal")).toBeVisible();
    expect(await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
    await expect(page.locator("#notePersonal")).not.toContainText("同名模型还有");
  }
  await page.locator("#showAllPersonal").click();
  await expect(page.locator("#showAllPersonal")).toContainText("收起为 20 档");
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBeGreaterThan(20);
  await page.locator("#showAllPersonal").click();
  await expect(page.locator("#showAllPersonal")).toContainText("显示全部");
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
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
  const filtered = () => page.evaluate(`(() => { const model = ${chartOf("chartTokens")}.getModel(); return model.getSeries().map(series => model.isSeriesFiltered(series)); })()`);
  await expect.poll(filtered).toEqual([true, true, true, true]);
  await page.locator("#themeBtn").click();
  await expect.poll(filtered).toEqual([true, true, true, true]);
  await page.setViewportSize({ width: 375, height: 900 });
  /* 上方区块在窄屏重排可能把图表移出视口；离屏尺寸在再次阅读时补齐。 */
  await page.locator("#chartTokens").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(`${chartOf("chartTokens")}.getWidth() === document.getElementById('chartTokens').clientWidth`)).toBe(true);
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
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getWidth()`)).toBeGreaterThan(100);
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getHeight()`)).toBeGreaterThan(400);
  expect(errors).toEqual([]);
});

test("手机空结果分享链接首屏和空态不加载图表，清除搜索后仍首次绘图", async ({ page }) => {
  const errors = trackErrors(page);
  /** @type {string[]} */
  const chartRequests = [];
  page.on("request", request => { if (/\/libs\/echarts(?:[.-]|\.js)/.test(request.url())) chartRequests.push(request.url()); });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/?pq=__不匹配任何计划__");
  await expect(page.locator("#chartSearch")).toHaveValue("__不匹配任何计划__");
  await page.waitForTimeout(900); // Cover the first periodic lazy fallback, beyond initial startup.
  expect(chartRequests).toEqual([]);
  expect(await page.evaluate("typeof echarts")).toBe("undefined");
  await page.locator("#chartPersonalEmpty").scrollIntoViewIfNeeded();
  await expect(page.locator("#chartPersonalEmpty")).toBeVisible();
  await page.waitForTimeout(200);
  expect(chartRequests).toEqual([]);
  await page.locator("#personalResetBtn").click();
  await expect(page.locator("#chartSearch")).toBeFocused();
  await expect(page.locator("#chartPersonal canvas")).toHaveCount(1);
  await expect.poll(() => page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
  expect(chartRequests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("图表在其他视图中切换主题和屏宽后，返回套餐视图恢复实际尺寸", async ({ page }) => {
  const errors = trackErrors(page);
  await openPersonal(page);
  const main = page.getByRole("navigation", { name:"主要内容" });
  await main.getByRole("link", { name:"模型评测" }).click();
  await expect(page.locator("#s1")).toBeHidden();
  await page.locator("#themeBtn").click();
  await page.setViewportSize({ width:375, height:900 });
  await main.getByRole("link", { name:"选套餐" }).click();
  await page.locator("#chartPersonal").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(`${chartOf("chartPersonal")}.getWidth() === document.getElementById('chartPersonal').clientWidth`)).toBe(true);
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getWidth()`)).toBeGreaterThan(100);
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.length`)).toBe(20);
  expect(errors).toEqual([]);
});

test("年付图表的读屏摘要报告当前人民币价格", async ({ page }) => {
  await page.goto("/?pq=CursorPro&pbilling=Y#s1");
  const summary = await page.locator("#chartPersonal").getAttribute("aria-label");
  expect(summary).toContain("年付折月，人民币/月");
  const rows = await page.evaluate(`${chartOf("chartPersonal")}.getOption().series[0].data.map(row => ({ plan: row._p.plan, value: row.value }))`);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(summary).toContain(row.plan + " ¥" + row.value);
  expect(summary).not.toMatch(/\$20|\$60/);
});

test("回到顶部在页首不能取得隐形键盘焦点，滚动后恢复操作", async ({ page }) => {
  await page.goto("/");
  const top = page.locator("#toTop");
  await expect(top).toBeHidden();
  await top.evaluate((element) => element.focus());
  await expect(top).not.toBeFocused();
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.locator('.topnav a[href="#s1"]').click();
  await expect(top).toBeVisible();
  await top.focus();
  await expect(top).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(top).toBeHidden();
  await expect(page.locator(".hero h1")).toBeFocused();
});

test("resize跳过同尺寸和离屏画布，滚入后更新尺寸且图例保持选择", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#s4");
  await page.evaluate(() => {
    const counts = window["reviewResizeCounts"] = {};
    /* ECharts 在已初始化的容器上标记 _echarts_instance_。 */
    for (const element of document.querySelectorAll("[_echarts_instance_]")) {
      const chart = window["echarts"].getInstanceByDom(element);
      const setOption = chart.setOption.bind(chart);
      chart.setOption = (...args) => {
        counts[element.id] = (counts[element.id] || 0) + 1;
        return setOption(...args);
      };
    }
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(220);
  expect(await page.evaluate("window.reviewResizeCounts")).toEqual({});
  await page.locator('#apiLegend [data-series="输入 / 1M tokens"]').click();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator("#chartApi").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(`${chartOf("chartApi")}.getWidth() === document.getElementById('chartApi').clientWidth`)).toBe(true);
  expect(await page.evaluate("window.reviewResizeCounts.chartPersonal || 0")).toBe(0);
  expect(await page.evaluate(`${chartOf("chartPersonal")}.getWidth() > document.getElementById('chartPersonal').clientWidth`)).toBe(true);
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.locator('.topnav a[href="#s1"]').click();
  await expect.poll(() => page.evaluate(`${chartOf("chartPersonal")}.getWidth() === document.getElementById('chartPersonal').clientWidth`)).toBe(true);
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.locator('.topnav a[href="#s4"]').click();
  await expect(page.locator('#apiLegend [data-series="输入 / 1M tokens"]')).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(`${chartOf("chartApi")}.getModel().isSeriesFiltered(${chartOf("chartApi")}.getModel().getSeries()[0])`)).toBe(true);
  expect(errors).toEqual([]);
});

for (const width of [375, 768, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}画布可见，手机卡片价格可读与桌面表格滚动均不溢出`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript("localStorage.setItem('cp-theme', " + JSON.stringify(theme) + ");");
      await page.goto("/index.html#s4");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect.poll(() => page.evaluate("echarts.version")).toBe("6.1.0");
      await expect(page.locator("#apiDetailBody tr")).toHaveCount(36);
      for (const id of ["chartPersonal", "chartTokens", "chartApi", "chartPower"]) {
        // 库和画布节点出现后，异步锚点布局/resize 仍可能正在完成。
        await expect.poll(() => page.locator("#" + id + " canvas").count()).toBeGreaterThan(0);
        const readSize = () => page.evaluate((id) => {
          const element = document.getElementById(id), chart = window["echarts"].getInstanceByDom(element);
          return { width: chart.getWidth(), height: chart.getHeight(), containerWidth: element.clientWidth };
        }, id);
        await expect.poll(async () => {
          const size = await readSize();
          return size.width > 100 && size.height > 400 && Math.abs(size.width - size.containerWidth) <= 1;
        }, { message: id + " 完成真实画布布局" }).toBe(true);
        const size = await readSize();
        expect(size.width).toBeGreaterThan(100);
        expect(size.height).toBeGreaterThan(400);
        expect(Math.abs(size.width - size.containerWidth)).toBeLessThanOrEqual(1);
      }
      const viewport = await page.evaluate("({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth })");
      expect(viewport.document).toBeLessThanOrEqual(viewport.viewport + 1);
      expect(viewport.body).toBeLessThanOrEqual(viewport.viewport + 1);
      await page.locator("details:has(.api-detail-wrap) > summary").click();
      for (const selector of [".api-detail-wrap", "#table .table-wrap", ".metrics-wrap"]) {
        const wrapper = page.locator(selector);
        // 离屏表格使用 content-visibility，进入阅读区后才有真实滚动宽度。
        await wrapper.scrollIntoViewIfNeeded();
        const mobileCards = width < 768 && selector !== ".api-detail-wrap";
        const needsHorizontalScroll = (width < 768 && selector === ".api-detail-wrap") || (width === 768 && selector !== ".api-detail-wrap");
        if (needsHorizontalScroll) await expect.poll(() => wrapper.evaluate(el => el.scrollWidth > el.clientWidth), { message: selector + " 可见后完成表格布局" }).toBe(true);
        const before = await wrapper.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, left: el.scrollLeft }));
        expect(before.width).toBeGreaterThan(100);
        if (mobileCards) {
          expect(before.scrollWidth).toBeLessThanOrEqual(before.width + 1);
          const price = selector === ".metrics-wrap"
            ? wrapper.locator('td[data-column="cpm"]').first()
            : wrapper.locator('td[data-column="priceM"]').filter({ has: page.locator(".sub") }).first();
          await price.scrollIntoViewIfNeeded();
          await expect(price).toBeVisible();
          await expect(price).toContainText(/[¥$₹]/);
          const bounds = await price.evaluate((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, viewport: window.innerWidth }));
          expect(bounds.left).toBeGreaterThanOrEqual(-1);
          expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
          expect(await wrapper.evaluate(el => el.scrollLeft)).toBe(0);
        } else if (needsHorizontalScroll) {
          expect(before.scrollWidth).toBeGreaterThan(before.width);
          await wrapper.evaluate(el => { el.scrollLeft = el.scrollWidth; });
          await expect.poll(() => wrapper.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
