const { test, expect } = require("@playwright/test");
async function openChapters(page) { await page.locator("#sectionMenu").evaluate((menu) => { /** @type {HTMLDetailsElement} */ (menu).open = true; }); }
async function clickChapter(page, name) {
  await openChapters(page);
  await page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name, exact: true }).click();
}

test("搜索防抖未执行时的同查询串后退仍更新表格", async ({ page }) => {
  await page.goto("/index.html#table");
  await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
    input.value = "Cursor";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    window["navigateToSection"]("#s1");
    history.back();
  });
  await expect(page).toHaveURL(/q=Cursor#table$/);
  await expect.poll(() => page.evaluate(() => document.querySelectorAll("#tableBody tr").length)).toBe(
    await page.evaluate("Math.min(responsivePageSize(), computeTableRows().length)"));
  await expect(page.locator("#searchInput")).toHaveValue("Cursor");
});

test("预算后退/前进同步按钮、推荐及分享URL", async ({ page }) => {
  await page.goto("/?budget=100");
  const budget = page.locator('#picker [data-pick="budget"]');
  await expect(budget.getByRole("button", { name: "≤ ¥100", exact: true })).toHaveAttribute("aria-pressed", "true");
  const first = await page.locator("#quickGrid").innerText();
  await clickChapter(page, "性价比排行");
  await budget.getByRole("button", { name: "≤ ¥500", exact: true }).click();
  await expect(page).toHaveURL(/budget=500/);
  const changed = await page.locator("#quickGrid").innerText();
  await page.goBack();
  await expect(page).toHaveURL(/\?budget=100$/);
  await expect(budget.getByRole("button", { name: "≤ ¥100", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#quickGrid")).toHaveText(first, { useInnerText: true });
  await page.goForward();
  await expect(page).toHaveURL(/budget=500.*#rank$/);
  await expect(budget.getByRole("button", { name: "≤ ¥500", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#quickGrid")).toHaveText(changed, { useInnerText: true });
  await page.reload();
  await expect(page.locator("#quickGrid")).toHaveText(changed, { useInnerText: true });
});

test("键盘锚点后下一次Tab进入目标章节的筛选控件", async ({ page }) => {
  await page.goto("/");
  await openChapters(page);
  const link = page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name: "数据表", exact: true });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#table")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#searchInput")).toBeFocused();
});

for (const width of [375, 1280]) {
  test(`${width}px分享额度锚点和章节留白内的滚动均高亮本节，手动导航持续更新`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#s3b");
    await page.evaluate(() => document.fonts.ready);
    const current = page.locator('.topnav a[aria-current="location"]');
    await expect(current).toHaveAttribute("href", "#s3b");
    const padding = await page.locator("#s3b").evaluate((element) => parseFloat(getComputedStyle(element).paddingTop));
    await page.mouse.wheel(0, -padding / 2);
    await expect.poll(() => page.locator("#s3b").evaluate((element) => element.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))).toBeGreaterThan(0);
    await expect(current).toHaveAttribute("href", "#s3b");
    const visible = await page.locator("#s3b .section-head h2").evaluate((element) => ({ top: element.getBoundingClientRect().top, header: document.querySelector(".topbar").getBoundingClientRect().bottom }));
    expect(visible.top).toBeGreaterThan(visible.header);
    await page.evaluate(() => {
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      window.scrollTo({ top: window.scrollY + document.getElementById("rank").getBoundingClientRect().top - padding, behavior: "instant" });
    });
    await expect(current).toHaveAttribute("href", "#rank");
    await expect(page).toHaveURL(/#s3b$/);
    await clickChapter(page, "订阅价格");
    await expect(current).toHaveAttribute("href", "#s1");
    await expect(page).toHaveURL(/#s1$/);
  });
}

test("字体晚载和resize仅刷新手动滚动后的章节，不重新跳回分享锚点", async ({ page }) => {
  let releaseFonts = () => {};
  let blockedFontRequests = 0;
  const fontsGate = new Promise((resolve) => { releaseFonts = () => resolve(null); });
  await page.route(/\.woff2(?:\?|$)/, async (route) => { blockedFontRequests++; await fontsGate; await route.continue(); });
  try {
    await page.goto("/#s3b", { waitUntil: "domcontentloaded" });
    await expect.poll(() => blockedFontRequests).toBeGreaterThan(0);
    // 保持字体阻塞，先完成初始图表锚点；此用例独立验证后续字体/resize。
    await expect(page.locator("#chartRank canvas")).toHaveCount(1);
    await expect.poll(() => page.locator("#s3b").evaluate(el => Math.abs(el.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    const tracker = await page.evaluateHandle(() => {
      const state = { calls: 0 };
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function (options) { state.calls++; original.call(this, options); };
      const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      window.scrollTo({ top: window.scrollY + document.getElementById("rank").getBoundingClientRect().top - padding, behavior: "instant" });
      return state;
    });
    const current = page.locator('.topnav a[aria-current="location"]');
    await expect(current).toHaveAttribute("href", "#rank");
    releaseFonts();
    await page.waitForLoadState("load");
    await page.evaluate(() => document.fonts.ready);
    await expect(current).toHaveAttribute("href", "#rank");
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(current).toHaveAttribute("href", "#rank");
    expect(await tracker.evaluate((state) => state.calls)).toBe(0);
    await expect(page).toHaveURL(/#s3b$/);
    await tracker.dispose();
  } finally { releaseFonts(); }
});

for (const colorScheme of /** @type {("light"|"dark")[]} */ (["light", "dark"])) {
  test(`375px ${colorScheme} 手机卡片直接展示套餐价格和每百万成本`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/?q=Claude+Pro#table");
    await page.evaluate("revealTablePlan('plan-0002')");
    const row = page.locator('#tableBody tr:has(.cmp-add[data-plan-id="plan-0002"])');
    const price = row.locator('[data-column="priceM"]');
    await expect(price).toBeVisible();
    await expect(price).toHaveAttribute("data-label", "价格 / 周期");
    await expect(price).toContainText("$20/月");
    for (const field of [price, row.locator('[data-column="plan"]')]) {
      const bounds = await field.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    }
    expect(await page.locator("#planTable").evaluate(el => getComputedStyle(el).display)).toBe("block");
    expect(await page.locator("#planTable").evaluate(el => el.closest(".table-wrap").scrollWidth <= el.closest(".table-wrap").clientWidth)).toBe(true);
    await page.goto("/?mmodel=deepseek-v4-pro#s3b");
    await expect(page.locator("#metricsCount")).toHaveText("1 行");
    const cpm = page.locator('#metricsBody tr [data-column="cpm"]');
    await expect(cpm).toBeVisible();
    await expect(cpm).toHaveAttribute("data-label", "💵每M tokens");
    const bounds = await cpm.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    const rates = page.locator('#metricsBody tr [data-column="model"]');
    await expect(rates).toContainText("输入");
    await expect(rates).toContainText("输出");
    await expect(rates).toContainText("缓存");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [768]) {
  for (const colorScheme of /** @type {("light"|"dark")[]} */ (["light", "dark"])) {
    test(`${width}px ${colorScheme} 冻结表头与悬停身份列不遮挡或透底`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/?mmodel=deepseek-v4-pro#s3b");
      const wrap = page.locator(".metrics-wrap");
      await expect(page.locator("#metricsCount")).toHaveText("1 行");
      await wrap.scrollIntoViewIfNeeded();
      await wrap.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      await expect.poll(() => wrap.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      const corner = page.locator("#metricsTable thead .sticky-col");
      const topmost = await corner.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(box.right - 8, box.top + box.height / 2)?.closest("th")?.classList.contains("sticky-col");
      });
      expect(topmost).toBe(true);
      const identity = page.locator("#metricsBody tr.payg-row td:first-child");
      await identity.hover();
      const painted = await identity.evaluate((element) => {
        const style = getComputedStyle(element);
        const row = element.getBoundingClientRect();
        const region = element.closest(".table-wrap").getBoundingClientRect();
        return { color: style.backgroundColor, image: style.backgroundImage, left: row.left, region: region.left };
      });
      expect(painted.color).toMatch(/^rgb\([^)]*\)$/);
      expect(Math.abs(painted.left - painted.region)).toBeLessThan(2);
      expect(painted.image).toContain("linear-gradient");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(identity).toHaveAttribute("title", /DeepSeek.*官方 API/);
    });
  }
}

test("隐藏明细的当前排序在工具栏可见", async ({ page }) => {
  await page.goto("/?msort=t5h:-1#s3b");
  const hint = page.locator("#metricsSortHint");
  await expect(hint).toContainText("Tokens/5h");
  await expect(hint).toContainText("展开查看");
  await page.locator("#metricsToggle").click();
  await expect(hint).not.toContainText("展开查看");
  await page.locator("#metricsToggle").click();
  await expect(hint).toContainText("展开查看");
});

test("手机价格表分批展开并保持完整导出，排序后回到首批记录", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/#table");
  await expect(page.locator("#tableBody tr")).toHaveCount(5);
  const total = await page.evaluate("computeTableRows().length");
  const more = page.locator("#tableMoreBtn");
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator("#tableBody tr")).toHaveCount(10);
  await expect(page.locator("#tableBody .cmp-add").nth(5)).toBeFocused();
  await expect(page.locator("#tableCount")).toContainText(`已显示 10 / ${total}`);
  expect(await page.evaluate('tableRowsCsv(computeTableRows()).split("\\r\\n").length')).toBe(total + 1);
  await page.locator('#planTable thead [data-sort="priceM"]').click();
  await expect(page.locator("#tableBody tr")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const geometry = await page.locator("#tableBody tr").last().evaluate(el => ({ card: el.getBoundingClientRect().bottom, wrap: el.closest(".table-wrap").getBoundingClientRect().bottom, next: document.getElementById("tableMoreBtn").getBoundingClientRect().top }));
  expect(geometry.card).toBeLessThanOrEqual(geometry.wrap + 1);
  expect(geometry.card).toBeLessThanOrEqual(geometry.next + 1);
});

test("手机额度表分批卡片被容器完整包住，后续章节不会盖住额度记录", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/#s3b");
  await expect(page.locator("#metricsBody tr")).toHaveCount(5);
  const total = await page.evaluate("metricsTableRows().shownRows.length");
  await expect(page.locator("#metricsCount")).toHaveText(`已显示 5 / ${total} 行`);
  await page.locator("#metricsMoreBtn").click();
  await expect(page.locator("#metricsBody tr")).toHaveCount(10);
  const geometry = await page.locator("#metricsBody tr").last().evaluate(el => ({ card: el.getBoundingClientRect().bottom, wrap: el.closest(".table-wrap").getBoundingClientRect().bottom, next: document.getElementById("s1").getBoundingClientRect().top }));
  expect(geometry.card).toBeLessThanOrEqual(geometry.wrap + 1);
  expect(geometry.card).toBeLessThanOrEqual(geometry.next + 1);
  await page.locator('#metricsTable thead [data-sort="price"]').click();
  await expect(page.locator("#metricsBody tr")).toHaveCount(5);
  expect(await page.evaluate("metricsTableRows().shownRows.length")).toBe(total);
});

test("稳定ID链接和无原生dialog降级可关闭、循环焦点和移出", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined, configurable: true });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { value: undefined, configurable: true });
    Object.defineProperty(HTMLDialogElement.prototype, "open", { get: () => undefined, configurable: true });
  });
  await page.goto("/?cmp=plan-0002;plan-0003;plan-0004#table");
  const dialog = page.locator("#cmpModal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#cmpCloseBtn")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#cmpOpenBtn")).toBeFocused();
  await page.locator("#cmpOpenBtn").click();
  await dialog.locator(".cmp-remove").first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".cmp-remove")).toHaveCount(2);
  await dialog.locator(".cmp-remove").first().click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#cmpBackdrop")).not.toBeVisible();
  expect(await page.locator("main").getAttribute("inert")).toBeNull();
  await expect(page).toHaveURL(/cmp=plan-0004/);
});

test("历史恢复重新聚焦同一方案的表格按钮，筛选隐藏时回到搜索框", async ({ page }) => {
  await page.goto("/");
  await clickChapter(page, "数据表");
  const search = page.locator("#searchInput");
  await search.fill("Anthropic");
  await expect(page).toHaveURL(/q=Anthropic/);
  const add = page.locator('#tableBody .cmp-add[data-plan-id="plan-0002"]');
  await add.focus();
  await page.goBack();
  await expect(add).toBeFocused();
  await page.goForward();
  await expect(add).toBeFocused();
  await page.evaluate(() => history.pushState(null, "", "?q=Cursor#table"));
  await page.goBack();
  await add.focus();
  await page.goForward();
  await expect(add).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("搜索延迟重绘时保留快速进入的对比按钮，筛掉方案则返回搜索", async ({ page }) => {
  await page.goto("/?q=Anthropic#table");
  const add = page.locator('#tableBody .cmp-add[data-plan-id="plan-0002"]');
  for (const query of ["Claude", "Cursor"]) {
    const previous = await page.evaluateHandle((query) => {
      const search = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
      search.value = query;
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const button = /** @type {HTMLElement} */ (document.querySelector('#tableBody .cmp-add[data-plan-id="plan-0002"]'));
      button.focus();
      return button;
    }, query);
    await expect.poll(() => previous.evaluate((element) => element.isConnected)).toBe(false);
    if (query === "Claude") await expect(add).toBeFocused();
    else {
      await expect(add).toHaveCount(0);
      await expect(page.locator("#searchInput")).toBeFocused();
    }
    await previous.dispose();
  }
});

for (const fallback of [false, true]) {
  const kind = fallback ? "降级dialog" : "原生dialog";
  test(`${kind}历史重绘保留方案移出焦点，缺失项和关闭后可安全继续操作`, async ({ page }) => {
    /* 多次历史往返的完整场景需容纳 Windows WebKit 绘制时间；单步断言仍限 10 秒。 */
    test.setTimeout(90000);
    if (fallback) await page.addInitScript(() => {
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined, configurable: true });
      Object.defineProperty(HTMLDialogElement.prototype, "close", { value: undefined, configurable: true });
      Object.defineProperty(HTMLDialogElement.prototype, "open", { get: () => undefined, configurable: true });
    });
    await page.goto("/?cmp=plan-0002;plan-0003;plan-0004#table");
    const dialog = page.locator("#cmpModal"), close = page.locator("#cmpCloseBtn");
    const remove = (id) => dialog.locator('.cmp-remove[data-plan-id="' + id + '"]');
    await close.click();
    await clickChapter(page, "API 按量");
    await page.locator("#cmpOpenBtn").click();
    await remove("plan-0003").focus();
    await page.goBack();
    await expect(remove("plan-0003")).toBeFocused();
    await page.goForward();
    await expect(remove("plan-0003")).toBeFocused();
    const legacy = "?cmp=Anthropic%7CClaude+Pro%3BAnthropic%7CClaude+Max+5x%3BAnthropic%7CClaude+Max+20x&budget=invalid&fixture=keep#s4";
    await page.evaluate((url) => {
      history.pushState({ marker: "preserve" }, "", url);
      history.pushState(null, "", "?cmp=plan-0002;plan-0003;plan-0004#s4");
    }, legacy);
    await remove("plan-0003").focus();
    await page.goBack();
    await expect(remove("plan-0003")).toBeFocused();
    expect(await page.evaluate(() => location.search + location.hash)).toBe(legacy);
    expect(await page.evaluate(() => history.state.marker)).toBe("preserve");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.locator("#cmpOpenBtn").click();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => location.search + location.hash)).toBe(legacy);
    expect(await page.evaluate(() => history.state.marker)).toBe("preserve");
    await page.goForward();
    await page.evaluate(() => history.pushState(null, "", "?cmp=plan-0002;plan-0004#s4"));
    await page.goBack();
    await remove("plan-0003").focus();
    await page.goForward();
    await expect(remove("plan-0003")).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await page.evaluate(() => history.pushState(null, "", "?cmp=plan-0004#s4"));
    await page.goBack();
    await remove("plan-0002").focus();
    await page.goForward();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("#searchInput")).toBeFocused();
  });

  test(`${kind}初次load的修复帧保留已经移入弹窗的焦点`, async ({ page }) => {
    await page.addInitScript(({ fallback }) => {
      if (fallback) {
        Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined, configurable: true });
        Object.defineProperty(HTMLDialogElement.prototype, "close", { value: undefined, configurable: true });
        Object.defineProperty(HTMLDialogElement.prototype, "open", { get: () => undefined, configurable: true });
      }
      /* 在应用load监听器之前注册，让用户焦点先进入同一修复帧。 */
      window.addEventListener("load", () => requestAnimationFrame(() => {
        const control = document.querySelector('#cmpTable .cmp-remove[data-plan-id="plan-0003"]');
        if (control instanceof HTMLElement) control.focus();
      }), { once: true });
    }, { fallback });
    await page.goto("/?cmp=plan-0002;plan-0003#table");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
    await expect(page.locator('#cmpTable .cmp-remove[data-plan-id="plan-0003"]')).toBeFocused();
  });
}
