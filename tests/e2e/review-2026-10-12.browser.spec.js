"use strict";
/* 2026-10-12 全面审查修复：浮动控件互不遮挡、视口变窄后图表不撑宽页面、页头章节下拉、单选芯片组、
 * 手机评测卡片，以及脚本接管前后的首屏交接。逻辑层回归见 src/regression/review-2026-10-12.test.ts。 */
const { test, expect } = require("@playwright/test");
const { chartOf, waitForApp, waitForData } = require("./helpers");

/** 两个元素的可见矩形是否相交。 @param {import("@playwright/test").Locator} a @param {import("@playwright/test").Locator} b */
async function overlaps(a, b) {
  const [boxA, boxB] = [await a.boundingBox(), await b.boundingBox()];
  if (!boxA || !boxB) return false;
  return boxA.x < boxB.x + boxB.width && boxB.x < boxA.x + boxA.width && boxA.y < boxB.y + boxB.height && boxB.y < boxA.y + boxA.height;
}

/** 页面没有横向滚动。 @param {import("@playwright/test").Page} page */
const pageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** 挡住主入口脚本，模拟脚本到达前的预渲染首屏；返回放行函数。 @param {import("@playwright/test").Page} page */
async function holdEntryScript(page) {
  /** @type {() => void} */
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(undefined); });
  await page.route(/\/js\/index-[\w-]+\.js$/, async (route) => { await gate; await route.continue(); });
  return release;
}

for (const width of [375, 820, 1280]) {
  test(`${width}px 对比条、回到顶部与操作提示互不遮挡`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    /* 分享的对比链接会直接打开对比窗口；这里从数据表逐档加入，留在页面上。 */
    await page.goto("/#table");
    await waitForApp(page);
    const adds = page.locator("#tableBody .cmp-add");
    await adds.nth(0).click();
    await adds.nth(1).click();
    const bar = page.locator("#cmpBar");
    const toTop = page.locator("#toTop");
    const toast = page.locator("#cmpToast");
    await expect(bar).toBeVisible();
    await expect(toast).toContainText("当前选择 2/4 档");
    await expect(toTop).toHaveClass(/is-on/);
    await expect.poll(() => overlaps(bar, toTop)).toBe(false);
    await expect.poll(() => overlaps(toast, bar)).toBe(false);
    await expect.poll(() => overlaps(toast, toTop)).toBe(false);
    await expect(page.locator("#tableFeedback")).not.toContainText("已加入");
  });
}

test("视口变窄后屏幕外的图表按新宽度缩放，页面不出现横向滚动", async ({ page }) => {
  await page.goto("/#s4");
  await waitForApp(page);
  await page.waitForFunction(`!!${chartOf("chartTeam")}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => pageOverflow(page)).toBeLessThanOrEqual(0);
  await expect.poll(() => page.evaluate(`${chartOf("chartTeam")}.getWidth() <= document.getElementById("chartTeam").clientWidth + 1`)).toBe(true);
  /* 滚入阅读区后按窄屏重新布局，仍不超出容器。 */
  await page.locator("#chartTeam").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(`${chartOf("chartTeam")}.getWidth() <= document.getElementById("chartTeam").clientWidth + 1`)).toBe(true);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("页头章节下拉：跳转后收起，Esc 收起并回到按钮，其他视图不显示", async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  const jump = page.locator("#sectionJump");
  const summary = jump.locator("summary");
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(jump).toHaveAttribute("open", "");
  await jump.locator('.section-jump-list a[href="#table"]').click();
  await expect(page).toHaveURL(/#table$/);
  await expect(jump).not.toHaveAttribute("open", "");
  await summary.click();
  await expect(jump).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(jump).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await page.locator('.primary-nav a[href="#benchmarks"]').click();
  await expect(jump).toBeHidden();
});

test("375px 页头章节下拉不超出视口，展开后的列表可读", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await waitForApp(page);
  const summary = page.locator("#sectionJump summary");
  const box = await summary.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeGreaterThanOrEqual(40);
  await summary.click();
  const list = page.locator("#sectionJump .section-jump-list");
  await expect(list).toBeVisible();
  const listBox = await list.boundingBox();
  expect(listBox.x).toBeGreaterThanOrEqual(0);
  expect(listBox.x + listBox.width).toBeLessThanOrEqual(375);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("筛选芯片是单选组：只有选中项可用 Tab 进入，方向键移动并选中", async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  const group = page.getByRole("radiogroup", { name: "预算", exact: true });
  await expect(group.getByRole("radio")).toHaveCount(5);
  await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  const checked = group.locator('[role="radio"][aria-checked="true"]');
  await expect(checked).toHaveAttribute("tabindex", "0");
  const before = await checked.getAttribute("data-value");
  await checked.focus();
  await page.keyboard.press("ArrowRight");
  await expect(checked).not.toHaveAttribute("data-value", String(before));
  await expect(checked).toBeFocused();
  const after = await checked.getAttribute("data-value");
  await expect(page).toHaveURL(new RegExp("budget=" + after));
  await page.keyboard.press("Home");
  await expect(checked).toHaveAttribute("data-value", "0");
  await expect(checked).toBeFocused();
});

test("375px 帮我选各行统一标签在左、选项对齐，主推荐露出在首屏", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await waitForApp(page);
  const rows = await page.locator('#picker .picker-row:not([data-pick="billing"])').evaluateAll((elements) => elements.map((row) => ({
    label: row.querySelector(".picker-label").getBoundingClientRect(),
    chip: row.querySelector(".chip").getBoundingClientRect(),
  })).map(({ label, chip }) => ({ labelLeft: label.left, labelRight: label.right, labelTop: label.top, chipLeft: chip.left, chipTop: chip.top })));
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    expect(row.labelLeft).toBeCloseTo(rows[0].labelLeft, 0);
    expect(row.chipLeft).toBeCloseTo(rows[0].chipLeft, 0);
    expect(row.chipLeft).toBeGreaterThan(row.labelRight);
    /* 标签与第一行选项同一行，不是上下排列。 */
    expect(Math.abs(row.labelTop - row.chipTop)).toBeLessThan(16);
  }
  expect(await page.locator("#quickGrid").evaluate((grid) => grid.getBoundingClientRect().top)).toBeLessThan(812 - 60);
});

test("375px 公开评测成绩表显示为卡片，字段带列名且不撑宽页面", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/#benchmarks");
  await waitForApp(page);
  await waitForData(page, "benchmark");
  const row = page.locator("#publicBenchmarkBody tr").first();
  await expect(row).toBeVisible();
  expect(await row.evaluate((element) => getComputedStyle(element).display)).toBe("grid");
  expect(await row.locator("td").first().evaluate((cell) => getComputedStyle(cell, "::before").content)).not.toBe("none");
  const rowBox = await row.boundingBox();
  for (const cell of await row.locator("th, td").all()) {
    const box = await cell.boundingBox();
    if (!box) continue;
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

test("脚本接管前：预渲染控件暂不响应点按，渠道参数不隐藏正文，已展开的折叠、焦点与输入在接管后保留", async ({ page }) => {
  const release = await holdEntryScript(page);
  await page.goto("/?from=timeline", { waitUntil: "commit" });
  const html = page.locator("html");
  await expect(page.locator("#app[data-prerendered]")).toBeAttached();
  await expect(html).toHaveClass(/js-pending/);
  await expect(html).not.toHaveClass(/has-query/);
  await expect(page.locator("#quickGrid .quick-card").first()).toBeVisible();
  expect(await page.locator("#quickGrid .cmp-add").first().evaluate((button) => getComputedStyle(button).pointerEvents)).toBe("none");
  await page.locator("#pickerRules > summary").click();
  await expect(page.locator("#pickerRules")).toHaveAttribute("open", "");
  await page.locator("#searchInput").focus();
  await page.keyboard.type("OpenAI Plus");
  release();
  await waitForApp(page);
  await expect(page.locator("#app")).not.toHaveAttribute("data-prerendered", "");
  await expect(html).not.toHaveClass(/js-pending/);
  await expect(page.locator("#pickerRules")).toHaveAttribute("open", "");
  await expect(page.locator("#searchInput")).toBeFocused();
  /* 脚本到达前输入的搜索词写回并生效：表格按它筛选，分享链接带上它。 */
  await expect(page.locator("#searchInput")).toHaveValue("OpenAI Plus");
  await expect(page).toHaveURL(/[?&]q=OpenAI\+Plus/);
  await expect(page.locator('#tableBody .cmp-add[data-plan-id="plan-0010"]')).toBeAttached();
  expect(await page.locator("#quickGrid .cmp-add").first().evaluate((button) => getComputedStyle(button).pointerEvents)).not.toBe("none");
});

test("带页面状态参数的链接在接管前隐藏默认正文，接管后按链接条件显示", async ({ page }) => {
  const release = await holdEntryScript(page);
  await page.goto("/?tcat=cloud#table", { waitUntil: "commit" });
  const html = page.locator("html");
  await expect(page.locator("#app[data-prerendered]")).toBeAttached();
  await expect(html).toHaveClass(/has-query/);
  await expect(page.locator("#app main")).toBeHidden();
  release();
  await waitForApp(page);
  await expect(html).not.toHaveClass(/has-query/);
  await expect(page.locator("#app main")).toBeVisible();
  await expect(page.locator("#tableBody tr").first()).toBeVisible();
});
