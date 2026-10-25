"use strict";
const { test, expect } = require("@playwright/test");
const { catalog, goToSection } = require("./helpers");
/** ECharts 精简包已加载（库脚本定义的全局）。 */
const chartLibraryLoaded = () => typeof window["echarts"]?.init === "function";

test("手机首屏展示主推荐，首屏和帮我选无需下载图表库", async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  const charts = [];
  page.on("request", (request) => { if (/\/libs\/echarts[-\w]*\.js/.test(request.url())) charts.push(request.url()); });
  await page.goto("/", { waitUntil:"networkidle" });
  await expect(page.locator("#quickGrid > .quick-card").first()).toBeVisible();
  const top = await page.locator("#quickGrid").evaluate((e) => e.getBoundingClientRect().top);
  expect(top).toBeLessThan(812);
  await expect(page.locator('#picker [data-pick="tool"]')).toBeVisible();
  await expect(page.locator('#picker [data-pick="task"]')).toBeVisible();
  await expect(page.locator('#pickerPayment')).not.toHaveAttribute("open", "");
  expect(charts).toEqual([]);
  await page.getByRole("navigation", { name:"主要内容" }).getByRole("link", { name:"选套餐", exact:true }).click();
  expect(charts).toEqual([]);
  await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
  await page.getByRole("navigation", { name:"页面章节" }).getByRole("link", { name:"性价比排行", exact:true }).click();
  await expect(page.locator("#chartRank canvas")).toHaveCount(1);
  expect(charts).toHaveLength(1);
});

/* 主数据与页面脚本合并在入口模块里（js/index-<hash>.js）；入口下载失败时由先执行的加载提示脚本报告。 */
test("页面脚本（含主数据）加载失败可见提示，重试可恢复推荐", async ({ page }) => {
  let fail = true;
  await page.route("**/js/index-*.js", async (route) => { if (fail) await route.abort(); else await route.continue(); });
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
  await page.route("**/libs/echarts*.js", async (route) => { if (fail) await route.abort(); else await route.continue(); });
  await page.goto("/#s4");
  await expect(page.locator("#chartApi [data-retry-chart]")).toBeVisible();
  await expect(page.locator("#apiDetailBody tr")).toHaveCount(catalog.API_PRICES.length);
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
  await page.locator("#costCalculator > summary").click();
  /* 默认模型Sonnet 5.5：44M总量，80%输入；半数缓存0.2，其余输入2、输出10。 */
  await expect(page.locator("#costResult")).toContainText("$126.72");
  await expect(page.locator("#costResult")).toContainText("超出月预算");
  await page.locator("#costInput").fill("0");
  await expect(page.locator("#costResult")).toContainText("$440");
  await expect(page).toHaveURL(/cinput=0/);
  await page.reload();
  await page.locator("#costCalculator > summary").click();
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
  await expect(page.locator('#picker [data-pick="budget"] [data-value="100"]')).toHaveAttribute("aria-checked","true");
  expect(await page.locator("#loadPresetBtn").evaluate((e) => e.getBoundingClientRect().top)).toBeLessThan(900);
  await expect(page).toHaveURL(/#table$/);
});

test("图表仍在下载时回到顶部，加载完成不重新跳回分享章节", async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/libs/echarts*.js", async (route) => { requested = true; await gate; await route.continue(); });
  try {
    await page.goto("/#s4", { waitUntil:"domcontentloaded" });
    await expect.poll(() => requested).toBe(true);
    await page.locator("#toTop").click();
    await expect(page.locator(".hero h1")).toBeFocused();
    release();
    await expect.poll(() => page.evaluate(chartLibraryLoaded)).toBe(true);
    await expect.poll(() => page.evaluate("scrollY")).toBeLessThan(10);
    await expect(page.locator(".hero h1")).toBeFocused();
  } finally { release(); }
});

for (const failed of [false,true]) test(`显式导航下载期间主动转到其它控件，${failed ? "失败" : "完成"}后保留用户焦点`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/libs/echarts*.js", async (route) => { requested = true; await gate; if (failed) await route.abort(); else await route.continue(); });
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
    /* 失败时图表位置显示可重试的错误，成功时库已加载 */
    if (failed) await expect(page.locator("[data-retry-chart]").first()).toBeAttached();
    else await expect.poll(() => page.evaluate(chartLibraryLoaded)).toBe(true);
    await expect(budget).toBeFocused();
    await expect(page.locator("#table")).not.toBeFocused();
    expect(await page.locator("#table").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(900);
  } finally { release(); }
});

for (const action of ["滚轮","PageUp"]) test(`显式导航下载期间通过${action}继续阅读，完成后不抢回目标章节`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise((resolve) => { release = () => resolve(null); });
  let requested = false;
  await page.route("**/libs/echarts*.js", async (route) => { requested = true; await gate; await route.continue(); });
  /* 记录程序化 scrollIntoView：用户已继续阅读后，图表就绪不得再滚回目标章节。
     滚动锚定会随上方图表增高平移 scrollY，程序化滚动次数才是稳定的判断依据。 */
  await page.addInitScript(() => {
    window["programmaticScrolls"] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args) {
      window["programmaticScrolls"].push(this.id);
      return original.apply(this, args);
    };
  });
  try {
    await page.goto("/", { waitUntil:"domcontentloaded" });
    await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; });
    const link = page.getByRole("navigation",{ name:"页面章节" }).getByRole("link",{ name:"数据表",exact:true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => requested).toBe(true);
    await expect.poll(() => page.evaluate("scrollY")).toBeGreaterThan(100);
    /* 慢网下点击立即到位并聚焦目标章节，不等图表下载；与快网路径的焦点行为一致。 */
    await expect(page.locator("#table")).toBeFocused();
    const position = await page.evaluate("scrollY");
    if (action === "滚轮") await page.mouse.wheel(0,-2000);
    else await page.keyboard.press("PageUp");
    await expect.poll(() => page.evaluate("scrollY")).toBeLessThan(position - 2);
    const scrollsBeforeReady = await page.evaluate(() => window["programmaticScrolls"].filter((id) => id === "table").length);
    release();
    await expect.poll(() => page.evaluate(chartLibraryLoaded)).toBe(true);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window["programmaticScrolls"].filter((id) => id === "table").length)).toBe(scrollsBeforeReady);
    await expect(page.locator("#table")).toBeFocused();
  } finally { release(); }
});

test("保存与恢复常用条件、复制当前状态和删除预设", async ({ page }) => {
  await page.addInitScript(() => { window["clipboardTexts"] = []; Object.defineProperty(navigator,"clipboard",{ value:{ writeText: async (text) => { window["clipboardTexts"].push(text); } },configurable:true }); });
  await page.goto("/?budget=100&ccache=50&cbudget=88");
  await page.locator("#savePresetBtn").click();
  await expect(page.locator("#loadPresetBtn")).toBeEnabled();
  await page.locator('#picker [data-pick="budget"] [data-value="500"]').click();
  await page.locator("#loadPresetBtn").click();
  await expect(page.locator('#picker [data-pick="budget"] [data-value="100"]')).toHaveAttribute("aria-checked","true");
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
  const noted = async () => Number((await page.locator("#rankNote").textContent() || "").match(/共 (\d+) 档/)?.[1]);
  await expect(page.locator('#chipRScope [data-rscope="credits"]')).toHaveAttribute("aria-checked","true");
  await expect(dataRows).toHaveCount(await noted());
  await expect(page.locator("#rankDetailBody .conf-lo")).toHaveCount(0);
  await expect(page.locator("#rankDetailBody .rank-divider")).toHaveCount(0);
  const officialCount = await dataRows.count();
  await page.locator('#chipRScope [data-rscope="all"]').click();
  await expect(page.locator('#chipRScope [data-rscope="all"]')).toHaveAttribute("aria-checked","true");
  await expect(dataRows).toHaveCount(await noted());
  expect(await dataRows.count()).toBeGreaterThan(officialCount);
  expect(await dataRows.count()).toBeGreaterThan(20);
  expect(await page.locator("#rankDetailBody .conf-lo").count()).toBeGreaterThan(0);
  await expect(page.locator("#rankDetailBody .rank-divider")).toHaveCount(1);
  await expect(page.locator("#rankDetailBody .rank-divider")).toContainText("以下为第三方或请求次数估算");
});

test("选购用量入口打开计算器并带入精确模型，示例预设和三情景可编辑且可分享", async ({ page }) => {
  await page.goto("/?budget=200&region=cn&task=hard");
  await page.locator("#checkWorkloadBtn").click();
  await expect(page).toHaveURL(/#s4$/);
  await expect(page.locator("#costCalculator")).toHaveAttribute("open","");
  await expect(page.locator("#costBudget")).toHaveValue("200");
  await expect(page.locator("#costFeedback")).toContainText("同名的 API 模型");
  expect(await page.locator("#costModel").inputValue()).not.toBe("");
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
  await expect(page.locator("#searchInput")).toHaveValue("GLM");
  await apply.click();
  await expect(page.locator("#tableScope")).toContainText("尚未应用选购条件");
  await expect(page.locator("#searchInput")).toHaveValue("GLM");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("GLM");
});

test("个人图应用选购支付方式时停用本区切换，取消、清除与后退恢复一致", async ({ page }) => {
  await page.goto("/?region=intl&billing=M&pbilling=Y#s1");
  const monthly = page.locator('#chipBilling [data-billing="M"]');
  const annual = page.locator('#chipBilling [data-billing="Y"]');
  const apply = page.locator('[data-apply-picker="personal"]');
  await expect(annual).toBeEnabled();
  await expect(annual).toHaveAttribute("aria-checked","true");
  await apply.click();
  await expect(monthly).toBeDisabled();
  await expect(annual).toBeDisabled();
  await expect(annual).toHaveAttribute("aria-describedby","personalScope");
  await expect(page.locator("#personalScope")).toContainText("暂不可切换");
  await page.reload();
  await expect(annual).toBeDisabled();
  await apply.click();
  await expect(annual).toBeEnabled();
  await expect(annual).toHaveAttribute("aria-checked","true");
  await apply.click();
  await goToSection(page, "#rank");
  await apply.click();
  await expect(annual).toBeEnabled();
  await page.goBack();
  await expect(annual).toBeDisabled();
  await page.locator("#personalResetBtn").click();
  await expect(annual).toBeEnabled();
  await expect(monthly).toHaveAttribute("aria-checked","true");
});
