"use strict";
const { test, expect } = require("@playwright/test");

test("手机首屏展示主推荐，首屏和帮我选无需下载图表库", async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  const charts = [];
  page.on("request", (request) => { if (request.url().includes("echarts.min.js")) charts.push(request.url()); });
  await page.goto("/", { waitUntil:"networkidle" });
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
  const top = await page.locator("#quickGrid").evaluate((e) => e.getBoundingClientRect().top);
  expect(top).toBeLessThan(812);
  expect(charts).toEqual([]);
  await page.locator(".hero-start").click();
  expect(charts).toEqual([]);
  await page.getByRole("navigation", { name:"页面章节" }).getByRole("link", { name:"性价比排行", exact:true }).click();
  await expect(page.locator("#chartRank canvas")).toHaveCount(1);
  expect(charts).toHaveLength(1);
});

test("主数据加载失败可见提示，重试可恢复推荐", async ({ page }) => {
  let fail = true;
  await page.route("**/js/data.js*", async (route) => { if (fail) await route.abort(); else await route.continue(); });
  await page.goto("/", { waitUntil:"domcontentloaded" });
  await expect(page.locator("#loadFailure")).toBeVisible();
  await expect(page.locator("#loadFailureText")).not.toBeEmpty();
  fail = false;
  await page.locator("#reloadPageBtn").click();
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
  await expect(page.locator("#loadFailure")).not.toBeVisible();
});

test("图表加载失败保留文字数据，重试只重新加载图表", async ({ page }) => {
  let fail = true;
  await page.route("**/echarts.min.js*", async (route) => { if (fail) await route.abort(); else await route.continue(); });
  await page.goto("/#s4");
  await expect(page.locator("#chartApi [data-retry-chart]")).toBeVisible();
  await expect(page.locator("#apiDetailBody tr")).toHaveCount(await page.evaluate("API_PRICES.length"));
  await expect(page.locator("#rankDetailBody tr")).not.toHaveCount(0);
  fail = false;
  await page.locator("#chartApi [data-retry-chart]").click();
  await expect(page.locator("#chartApi canvas")).toHaveCount(1);
  await expect(page.locator("#chartPower canvas")).toHaveCount(1);
  await expect(page.locator("#chartApi .render-error, #chartPower .render-error")).toHaveCount(0);
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
});

test("费用公式、预算临界点和分享URL刷新一致", async ({ page }) => {
  await page.goto("/?crequests=100&ctokens=20000&cdays=22&cinput=80&ccache=50&ccacheprice=0.2&cbudget=100#s4");
  await page.locator("#costCalculator summary").click();
  /* 默认模型Sonnet 5.5：44M总量，80%输入；半数缓存0.2，其余输入2、输出10。 */
  await expect(page.locator("#costResult")).toContainText("$126.72");
  await expect(page.locator("#costResult")).toContainText("超出月预算");
  await page.locator("#costInput").fill("0");
  await expect(page.locator("#costResult")).toContainText("$440");
  await expect(page).toHaveURL(/cinput=0/);
  await page.reload();
  await page.locator("#costCalculator summary").click();
  await expect(page.locator("#costInput")).toHaveValue("0");
  await expect(page.locator("#costResult")).toContainText("$440");
  await page.locator("#costTokens").fill("0");
  await expect(page.locator("#costResult")).toContainText("有效数字");
  await page.locator("#costDays").fill("20");
  await expect(page.locator("#costResult")).toContainText("有效数字");
  await expect(page.locator("#costResult")).not.toContainText("预计月费");
  await page.locator("#costResetBtn").click();
  await expect(page.locator("#costTokens")).toHaveValue("20000");
  await expect(page).not.toHaveURL(/ccacheprice=/);
});

test("恢复常用条件留在当前操作区，不跳回旧的地址锚点", async ({ page }) => {
  await page.goto("/?budget=100#table");
  await page.locator("#savePresetBtn").click();
  await page.locator('#picker [data-pick="budget"] [data-value="500"]').click();
  await page.locator("#loadPresetBtn").click();
  await expect(page.locator('#picker [data-pick="budget"] [data-value="100"]')).toHaveAttribute("aria-pressed","true");
  expect(await page.locator("#loadPresetBtn").evaluate((e) => e.getBoundingClientRect().top)).toBeLessThan(900);
  await expect(page).toHaveURL(/#table$/);
});

test("图表仍在下载时回到顶部，加载完成不重新跳回分享章节", async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/echarts.min.js*", async (route) => { requested = true; await gate; await route.continue(); });
  try {
    await page.goto("/#s4", { waitUntil:"domcontentloaded" });
    await expect.poll(() => requested).toBe(true);
    await page.locator("#toTop").click();
    await expect(page.locator(".hero h1")).toBeFocused();
    release();
    await expect.poll(() => page.evaluate("chartLibraryReady()" )).toBe(true);
    await expect.poll(() => page.evaluate("scrollY")).toBeLessThan(10);
    await expect(page.locator(".hero h1")).toBeFocused();
  } finally { release(); }
});

test("保存与恢复常用条件、复制当前状态和删除预设", async ({ page }) => {
  await page.addInitScript(() => { window["clipboardTexts"] = []; Object.defineProperty(navigator,"clipboard",{ value:{ writeText: async (text) => { window["clipboardTexts"].push(text); } },configurable:true }); });
  await page.goto("/?budget=100&ccache=50&cbudget=88");
  await page.locator("#savePresetBtn").click();
  await expect(page.locator("#loadPresetBtn")).toBeEnabled();
  await page.locator('#picker [data-pick="budget"] [data-value="500"]').click();
  await page.locator("#loadPresetBtn").click();
  await expect(page.locator('#picker [data-pick="budget"] [data-value="100"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#costCache")).toHaveValue("50");
  await expect(page.locator("#costBudget")).toHaveValue("88");
  await page.locator("#shareResultsBtn").click();
  await expect(page.locator("#serviceFeedback")).toContainText("已复制");
  const url = await page.evaluate(() => window["clipboardTexts"].at(-1));
  expect(url).toContain("budget=100"); expect(url).toContain("ccache=50"); expect(url).toContain("cbudget=88");
  await page.reload();
  await expect(page.locator("#loadPresetBtn")).toBeEnabled();
  await page.locator("#clearPresetBtn").click();
  await expect(page.locator("#loadPresetBtn")).toBeDisabled();
});

test("完整权益保留年付实际金额，关闭后恢复入口焦点", async ({ page }) => {
  await page.goto("/?budget=200&region=intl&tool=claude");
  const card = page.locator("#quickGrid .quick-card").filter({ has:page.locator('[data-view-plan="plan-0002"]') }).first();
  await card.locator(".qc-details > summary").click();
  const button = card.locator("[data-view-plan]");
  await button.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#planDetailsModal")).toBeVisible();
  await expect(page.locator("#planDetailsBody")).toContainText("$200/年");
  await page.keyboard.press("Escape");
  await expect(page.locator("#planDetailsModal")).not.toBeVisible();
  await expect(button).toBeFocused();
});

test("无原生dialog时完整权益可循环焦点并还原背景", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype,"showModal",{ value:undefined,configurable:true });
    Object.defineProperty(HTMLDialogElement.prototype,"close",{ value:undefined,configurable:true });
  });
  await page.goto("/");
  await page.locator("#quickGrid > .quick-card").first().locator(".qc-details > summary").click();
  const button = page.locator("#quickGrid [data-view-plan]").first();
  await button.click();
  const dialog = page.locator("#planDetailsModal");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#planDetailsCloseBtn")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link",{name:"官网购买与权益规则 ↗"})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#planDetailsCloseBtn")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
  expect(await page.locator("main").getAttribute("inert")).toBeNull();
});

test("排行明细包含当前口径全部行，并同步口径切换", async ({ page }) => {
  await page.goto("/#rank");
  await expect.poll(() => page.locator("#rankDetailBody tr").count()).toBe(await page.evaluate("rankRows().length"));
  await page.locator('#chipRScope [data-rscope="all"]').click();
  await expect.poll(() => page.locator("#rankDetailBody tr").count()).toBe(await page.evaluate("rankRows().length"));
  expect(await page.locator("#rankDetailBody tr").count()).toBeGreaterThan(20);
});
