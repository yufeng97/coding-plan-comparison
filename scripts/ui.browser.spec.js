const { test, expect } = require("@playwright/test");

test("预算后退/前进同步按钮、推荐及分享URL", async ({ page }) => {
  await page.goto("/?budget=100");
  const budget = page.locator('#picker [data-pick="budget"]');
  await expect(budget.getByRole("button", { name: "≤ ¥100", exact: true })).toHaveAttribute("aria-pressed", "true");
  const first = await page.locator("#quickGrid").innerText();
  await page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name: "性价比排行", exact: true }).click();
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
  const link = page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name: "数据表", exact: true });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#table")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#searchInput")).toBeFocused();
});

for (const width of [375, 768]) {
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
  await page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name: "数据表", exact: true }).click();
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
    if (fallback) await page.addInitScript(() => {
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined, configurable: true });
      Object.defineProperty(HTMLDialogElement.prototype, "close", { value: undefined, configurable: true });
      Object.defineProperty(HTMLDialogElement.prototype, "open", { get: () => undefined, configurable: true });
    });
    await page.goto("/?cmp=plan-0002;plan-0003;plan-0004#table");
    const dialog = page.locator("#cmpModal"), close = page.locator("#cmpCloseBtn");
    const remove = (id) => dialog.locator('.cmp-remove[data-plan-id="' + id + '"]');
    await close.click();
    await page.getByRole("navigation", { name: "页面章节" }).getByRole("link", { name: "API 按量", exact: true }).click();
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
