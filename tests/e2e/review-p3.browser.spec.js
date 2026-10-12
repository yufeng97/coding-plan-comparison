"use strict";
const { test, expect } = require("@playwright/test");
const { waitForApp, waitForData } = require("./helpers");

/** Contrast against the rendered ancestor backgrounds, including transparent row highlights.
 * @param {import("@playwright/test").Locator} locator */
async function textContrast(locator) {
  return locator.evaluateAll(elements => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is required to resolve CSS colors");
    const rgba = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    };
    const blend = (foreground, background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]));
    const luminance = color => color.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    return elements.map(element => {
      const ancestors = [];
      for (let current = element; current; current = current.parentElement) ancestors.push(current);
      let background = [255, 255, 255];
      for (const ancestor of ancestors.reverse()) background = blend(rgba(getComputedStyle(ancestor).backgroundColor), background);
      const foreground = blend(rgba(getComputedStyle(element).color), background);
      const front = luminance(foreground), back = luminance(background);
      return { text: element.textContent.trim().slice(0, 60), ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) };
    });
  });
}

for (const colorScheme of /** @type {("light"|"dark")[]} */ (["light", "dark"])) {
  test(`${colorScheme} 推荐主动作在普通和悬停状态保持实心、高对比，与次要动作区分`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await waitForApp(page);
    const primary = page.locator("#quickGrid > .quick-card .qc-primary").first();
    const secondary = page.locator("#quickGrid > .quick-card [data-view-plan]").first();
    for (const hover of [false, true]) {
      if (hover) await primary.hover();
      expect(await primary.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      expect((await textContrast(primary))[0].ratio).toBeGreaterThanOrEqual(4.5);
      await expect(primary).toHaveCSS("text-decoration-line", "none");
    }
    expect(await secondary.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  });

  test(`${colorScheme} 筛选按钮、表头、主计划标签与工具标签文字达到普通文本对比度`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await waitForApp(page);
    const controls = page.locator(".picker .chip:not(:disabled), .picker-label, #planTable thead th, .qc-compare thead th, .qc-compare-tag, #tableBody .tag-tool");
    expect(await controls.count()).toBeGreaterThan(20);
    const failed = (await textContrast(controls)).filter(result => result.ratio < 4.5);
    expect(failed).toEqual([]);
    await page.locator('.primary-nav [data-site-view="benchmarks"]').click();
    await waitForData(page, "benchmark");
    const headings = page.locator("#publicBenchmarkTable thead th");
    expect(await headings.count()).toBeGreaterThan(0);
    expect((await textContrast(headings)).filter(result => result.ratio < 4.5)).toEqual([]);
  });

  test(`${colorScheme} 正文来源链接持续带下划线，导航按钮保留控件外观`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await waitForApp(page);
    const links = page.locator(".chart-note a, .footer-mirror a");
    expect(await links.count()).toBeGreaterThanOrEqual(4);
    for (const link of await links.all()) await expect(link).toHaveCSS("text-decoration-line", /underline/);
    await expect(page.locator(".primary-nav a").first()).toHaveCSS("text-decoration-line", "none");
    await expect(page.locator(".brand")).toHaveCSS("text-decoration-line", "none");
  });
}

for (const width of [375, 1280]) {
  test(`${width}px 推荐、用量与分享的键盘顺序和屏幕阅读顺序一致`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await waitForApp(page);
    await page.locator("#pickerPaymentSummary").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#quickGrid > .quick-card .watch-plan").first()).toBeFocused();
    const order = await page.evaluate(() => {
      const ids = ["picker", "quickGrid", "checkWorkloadBtn", "shareResultsBtn", "pickerRules"];
      return ids.map(id => document.getElementById(id).getBoundingClientRect().top + scrollY);
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await page.locator("#checkWorkloadBtn").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#shareResultsBtn")).toBeFocused();
  });

  test(`${width}px 每个主视图拥有唯一可见一级标题，辅助标题样式与章节一致`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await waitForApp(page);
    const size = await page.locator("#quick .section-head h2").evaluate(element => getComputedStyle(element).fontSize);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coding Plan 比价中心");
    for (const [id, title] of [["benchmarks", "模型公开评测"], ["updates", "我的关注与套餐变更"], ["sources", "数据来源与说明"], ["contribute", "帮助补全与纠错"]]) {
      await page.locator(`[data-site-view="${id}"]`).click();
      if (id === "benchmarks") await waitForData(page, "benchmark");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
      await expect(page.locator(`#${id} .section-head h1`)).toHaveCSS("font-size", size);
      const childHeadings = page.locator(`#${id} h2`);
      if (id !== "contribute") expect(await childHeadings.count()).toBeGreaterThan(0);
    }
  });
}

test("辅助视图回到顶部后聚焦一级标题，计算器的额度标题不跳级", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 });
  await page.goto("/");
  await waitForApp(page);
  for (const id of ["benchmarks", "updates", "sources", "contribute"]) {
    await page.locator(`[data-site-view="${id}"]`).click();
    await page.locator(`#${id}`).evaluate(section => { /** @type {HTMLElement} */ (section).style.minHeight = "1800px"; });
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
    await expect(page.locator("#toTop")).toBeVisible();
    await page.locator("#toTop").click();
    await expect(page.locator(`#${id} .section-head h1`)).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  }
  await page.locator('.primary-nav [data-site-view="compare"]').click();
  await page.locator("#sectionMenu").evaluate(menu => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.locator('.topnav a[href="#s4"]').click();
  await page.locator("#costCalculator > summary").click();
  await expect(page.locator(".usage-coverage h3")).toBeVisible();
  await expect(page.locator(".usage-coverage h3")).toHaveCSS("font-size", "14px");
});
