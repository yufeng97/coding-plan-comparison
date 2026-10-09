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
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
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

for (const failed of [false,true]) test(`显式导航下载期间主动转到其它控件，${failed ? "失败" : "完成"}后保留用户焦点`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/echarts.min.js*", async (route) => { requested = true; await gate; if (failed) await route.abort(); else await route.continue(); });
  try {
    await page.goto("/", { waitUntil:"domcontentloaded" });
    await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
    const link = page.getByRole("navigation",{ name:"页面章节" }).getByRole("link",{ name:"数据表",exact:true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => requested).toBe(true);
    const budget = page.locator('#picker [data-pick="budget"] [data-value="100"]');
    await budget.focus();
    release();
    if (failed) await expect.poll(() => page.evaluate("chartLibraryPromise === null")).toBe(true);
    else await expect.poll(() => page.evaluate("chartLibraryReady()")).toBe(true);
    await expect(budget).toBeFocused();
    await expect(page.locator("#table")).not.toBeFocused();
    expect(await page.locator("#table").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(900);
  } finally { release(); }
});

for (const action of ["滚轮","PageUp"]) test(`显式导航下载期间通过${action}继续阅读，完成后不抢回目标章节`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/echarts.min.js*", async (route) => { requested = true; await gate; await route.continue(); });
  try {
    await page.goto("/", { waitUntil:"domcontentloaded" });
    await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
    const link = page.getByRole("navigation",{ name:"页面章节" }).getByRole("link",{ name:"数据表",exact:true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => requested).toBe(true);
    await expect.poll(() => page.evaluate("scrollY")).toBeGreaterThan(100);
    const position = await page.evaluate("scrollY");
    if (action === "滚轮") await page.mouse.wheel(0,-320);
    else await page.keyboard.press("PageUp");
    await expect.poll(() => page.evaluate("scrollY")).toBeLessThan(position - 2);
    release();
    await expect.poll(() => page.evaluate("chartLibraryReady()")).toBe(true);
    await expect(link).toBeFocused();
    await expect(page.locator("#table")).not.toBeFocused();
    expect(await page.locator("#table").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(900);
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
  await expect(dialog.locator(".plan-history > summary")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#planDetailsCloseBtn")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(button).toBeFocused();
  expect(await page.locator("main").getAttribute("inert")).toBeNull();
});

test("排行明细包含当前口径全部行，并同步口径切换", async ({ page }) => {
  await page.goto("/?rscope=credits#rank");
  const dataRows = page.locator("#rankDetailBody tr:not(.rank-divider)");
  await expect(dataRows).toHaveCount(await page.evaluate("rankRows().length"));
  await expect(page.locator('#chipRScope [data-rscope="credits"]')).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate("rankRows().every(r => !rankIsEstimate(r.m))")).toBe(true);
  await expect(page.locator("#rankDetailBody .rank-divider")).toHaveCount(0);
  const officialCount = await dataRows.count();
  await page.locator('#chipRScope [data-rscope="all"]').click();
  await expect(dataRows).toHaveCount(await page.evaluate("rankRows().length"));
  await expect(page.locator('#chipRScope [data-rscope="all"]')).toHaveAttribute("aria-pressed","true");
  expect(await dataRows.count()).toBeGreaterThan(officialCount);
  expect(await dataRows.count()).toBeGreaterThan(20);
  expect(await page.evaluate("rankRows().some(r => rankIsEstimate(r.m))")).toBe(true);
  await expect(page.locator("#rankDetailBody .rank-divider")).toHaveCount(1);
  await expect(page.locator("#rankDetailBody .rank-divider")).toContainText("以下为第三方或请求次数估算");
});

test("选购用量入口打开计算器并带入精确模型，示例预设和三情景可编辑且可分享", async ({ page }) => {
  await page.goto("/?budget=200&region=cn&task=hard");
  const recommendedPlanId = await page.locator("#quickGrid > .quick-card").first().locator(".cmp-add").getAttribute("data-plan-id");
  const expectedModel = await page.evaluate("(() => { const api = recommendedApi(planProfile(findPlanReference(" + JSON.stringify(recommendedPlanId) + "))); return api ? api.vendor + '|' + api.model : null; })()");
  expect(expectedModel).not.toBeNull();
  await page.locator("#checkWorkloadBtn").click();
  await expect(page).toHaveURL(/#s4$/);
  await expect(page.locator("#costCalculator")).toHaveAttribute("open","");
  await expect(page.locator("#costBudget")).toHaveValue("200");
  await expect(page.locator("#costModel")).toHaveValue(expectedModel);
  await expect(page.locator("[data-cost-scenario-result]")).toHaveCount(3);
  await expect(page.locator("#costResult")).toContainText("不代表真实用户用量");
  await page.locator('[data-cost-preset="light"]').click();
  await expect(page.locator("#costRequests")).toHaveValue("20");
  await expect(page.locator("#costTokens")).toHaveValue("5000");
  await page.locator('[data-cost-scenario="conservative"]').click();
  await expect(page.locator("#costInput")).toHaveValue("60");
  await expect(page.locator("#costCache")).toHaveValue("50");
  await expect(page.locator('[data-cost-scenario="conservative"]')).toHaveAttribute("aria-pressed","true");
  await expect(page).toHaveURL(/cscenario=conservative/);
  await page.reload();
  await page.locator("#costCalculator > summary").click();
  await expect(page.locator("#costInput")).toHaveValue("60");
  await expect(page.locator("#costRequests")).toHaveValue("20");
  await page.locator("#costInput").fill("75");
  await expect(page.locator('[data-cost-scenario="conservative"]')).toHaveAttribute("aria-pressed","false");
  await expect(page).not.toHaveURL(/cscenario=conservative/);
  await page.locator("#costTokens").fill("0");
  await page.locator("#costDays").fill("21");
  await expect(page.locator("#costTokens")).toHaveValue("0");
  await expect(page.locator("#costResult")).toContainText("有效数字");
  await expect(page.locator("[data-cost-scenario-result]")).toHaveCount(0);
});

test("表格应用选购条件叠加搜索，自动续费预算可包含优惠档并在刷新后还原", async ({ page }) => {
  await page.goto("/?budget=100&region=cn&tool=claude&billing=A&q=GLM#table");
  const apply = page.locator('[data-apply-picker="table"]');
  await apply.click();
  await expect(apply).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#tableScope")).toContainText("自动续费");
  await expect(page.locator("#tableScope")).toContainText("叠加");
  await expect(page.locator("#tableBody")).toContainText("GLM Coding V3 Lite");
  await expect(page).toHaveURL(/tapply=1/);
  await page.reload();
  await expect(apply).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate("tableState.search")).toBe("GLM");
  await apply.click();
  await expect(page.locator("#tableScope")).toContainText("尚未应用选购条件");
  expect(await page.evaluate("tableState.search")).toBe("GLM");
});

test("个人图应用选购支付方式时停用本区切换，取消、清除与后退恢复一致", async ({ page }) => {
  await page.goto("/?region=intl&billing=M&pbilling=Y#s1");
  const monthly = page.locator('#chipBilling [data-billing="M"]');
  const annual = page.locator('#chipBilling [data-billing="Y"]');
  const apply = page.locator('[data-apply-picker="personal"]');
  await expect(annual).toBeEnabled();
  await expect(annual).toHaveAttribute("aria-pressed","true");
  await apply.click();
  await expect(monthly).toBeDisabled();
  await expect(annual).toBeDisabled();
  await expect(annual).toHaveAttribute("aria-describedby","personalScope");
  await expect(page.locator("#personalScope")).toContainText("暂不可切换");
  expect(await page.evaluate("personalTooltip(findPlanReference('plan-0002'))")).not.toContain("折算价：");
  await page.reload();
  await expect(annual).toBeDisabled();
  await apply.click();
  await expect(annual).toBeEnabled();
  await expect(annual).toHaveAttribute("aria-pressed","true");
  await apply.click();
  await page.evaluate("navigateToSection('#rank')");
  await apply.click();
  await expect(annual).toBeEnabled();
  await page.goBack();
  await expect(annual).toBeDisabled();
  await page.locator("#personalResetBtn").click();
  await expect(annual).toBeEnabled();
  await expect(monthly).toHaveAttribute("aria-pressed","true");
});
