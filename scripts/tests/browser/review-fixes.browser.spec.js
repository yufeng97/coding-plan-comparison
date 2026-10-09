"use strict";
const { test, expect } = require("@playwright/test");

for (const width of [701, 750, 767, 768, 1280]) {
  test(`${width}px 数据表详细字段始终有可见入口`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto("/?q=OpenAI%20Plus#table");
    const fields = page.locator("#tableBody tr").first().locator("td.col-opt");
    await expect(fields).toHaveCount(3);
    const toggle = page.locator("#tableColsToggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    for (const field of await fields.all()) await expect(field).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const field of await fields.all()) await expect(field).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    for (const field of await fields.all()) await expect(field).toBeHidden();
  });
}

test("价格表与价格图都支持多词和产品别名，并保留分享搜索词", async ({ page }) => {
  await page.goto("/#table");
  await page.locator("#searchInput").fill("Plus OpenAI");
  await expect(page.locator('#tableBody .cmp-add[data-plan-id="plan-0010"]')).toBeVisible();
  await page.locator("#searchInput").fill("克劳德 Pro");
  await expect(page.locator('#tableBody .cmp-add[data-plan-id="plan-0002"]')).toBeVisible();
  await page.locator("#chartSearch").fill("OpenAI Plus");
  await page.evaluate("navigateToSection('#s1')");
  await expect(page.locator("#chartPersonalEmpty")).toBeHidden();
  await expect.poll(() => page.evaluate("chartCache.chartPersonal.getOption().series[0].data.some(row => row._p.id === 'plan-0010')")).toBe(true);
  await expect(page).toHaveURL(/pq=OpenAI\+Plus/);
  await page.reload();
  await expect(page.locator("#chartSearch")).toHaveValue("OpenAI Plus");
  await page.locator("#chartSearch").fill(" _-./· ");
  await expect(page.locator("#chartPersonalEmpty")).toBeHidden();
});

test("降级对比窗口允许逐条键盘核对来源，收起详情不占焦点顺序", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype,"showModal",{value:undefined,configurable:true});
    Object.defineProperty(HTMLDialogElement.prototype,"close",{value:undefined,configurable:true});
  });
  await page.goto("/?cmp=plan-0024;plan-0027#table");
  const summaries = page.locator("#cmpTable details.price-check-details summary");
  await expect(summaries).toHaveCount(2);
  await summaries.first().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#copyCmpMdBtn")).not.toBeFocused();
  const nextSource = summaries.last().locator("..").locator("..").getByRole("link",{ name:"核价来源",exact:true });
  await expect(nextSource).toHaveCount(1);
  /* 原生 Tab 是否包含链接取决于平台策略；只接受下一档来源或下一条核查 summary。 */
  if (!await summaries.last().evaluate((summary) => summary === document.activeElement)) {
    await expect(nextSource).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(summaries.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#copyCmpMdBtn")).toBeFocused();
  await page.evaluate(() => {
    document.getElementById("cmpFeedback").innerHTML = '<details><summary>额外核查</summary><a id="closedSourceLink" href="https://example.com">证据</a></details>';
  });
  expect(await page.evaluate("cmpFocusableElements().some(el => el.id === 'closedSourceLink')")).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator("#cmpModal")).toBeHidden();
});

test("主要导航仅保留三个任务入口，更多章节展开且旧分享锚点可达", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("navigation",{name:"主要内容"});
  await expect(main.getByRole("link")).toHaveText(["选套餐","模型评测","我的关注"]);
  await expect(page.locator("#sectionMenu")).not.toHaveAttribute("open");
  await main.getByRole("link",{name:"模型评测"}).click();
  await expect(page.locator("#quick")).toBeHidden();
  await main.getByRole("link",{name:"我的关注"}).click();
  await expect(page.locator("#updates")).toBeVisible();
  await main.getByRole("link",{name:"选套餐"}).click();
  await page.locator("#sectionMenu > summary").click();
  await page.getByRole("navigation",{name:"页面章节"}).getByRole("link",{name:"数据表",exact:true}).click();
  await expect(page).toHaveURL(/#table$/);
  await expect(page.locator("#table")).toBeFocused();
  await page.goto("/#s3b");
  await expect(page.locator("#s3b")).toBeVisible();
  await expect(main.getByRole("link",{name:"选套餐"})).toHaveAttribute("aria-current","page");
});
