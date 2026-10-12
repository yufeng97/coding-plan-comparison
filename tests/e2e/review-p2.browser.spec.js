"use strict";
const { test, expect } = require("@playwright/test");
const { waitForApp } = require("./helpers");

/** 焦点必须位于表格实际可见区域，不能只在 DOM 中被聚焦。
 * @param {import("@playwright/test").Page} page */
async function focusIsVisibleInTable(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const wrap = active?.closest(".table-wrap");
    if (!active || !wrap) return false;
    const box = active.getBoundingClientRect(), bounds = wrap.getBoundingClientRect();
    const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
    return box.top >= Math.max(bounds.top, headerBottom, 0) - 1
      && box.bottom <= Math.min(bounds.bottom, innerHeight) + 1
      && box.left >= Math.max(bounds.left, 0) - 1
      && box.right <= Math.min(bounds.right, innerWidth) + 1;
  });
}

for (const view of [
  { section: "table", more: "tableMoreBtn", target: "#tableBody .cmp-add" },
  { section: "s3b", more: "metricsMoreBtn", target: "#metricsBody tr" },
]) {
  test(`桌面 ${view.section} 分页后新记录的焦点滚入表格视口`, async ({ page }) => {
    await page.goto(`/#${view.section}`);
    await waitForApp(page);
    await page.locator(`#${view.more}`).click();
    await expect(page.locator(view.target).nth(20)).toBeFocused();
    await expect.poll(() => focusIsVisibleInTable(page)).toBe(true);
  });
}

for (const control of [".watch-plan", 'td[data-column="url"] a']) {
  test(`数据表 ${control} 在响应式分页和筛掉记录后保留可继续操作的焦点`, async ({ page }) => {
    await page.goto("/#table");
    await waitForApp(page);
    const selected = page.locator("#tableBody tr").nth(8).locator(control).first();
    const id = await selected.locator("xpath=ancestor::tr").getAttribute("data-plan-id");
    await selected.focus();
    await page.setViewportSize({ width: 375, height: 900 });
    const replacement = page.locator(`#tableBody tr[data-plan-id="${id}"]`).locator(control).first();
    await expect(page.locator("#tableBody tr")).toHaveCount(10);
    await expect(replacement).toBeFocused();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#searchInput").fill("Anthropic");
    const anthropic = page.locator('#tableBody tr[data-plan-id="plan-0002"]').locator(control).first();
    await expect(anthropic).toBeAttached();
    await page.evaluate(selector => {
      const search = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
      search.value = "Cursor";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const target = /** @type {HTMLElement} */ (document.querySelector(`#tableBody tr[data-plan-id="plan-0002"] ${selector}`));
      target.focus();
    }, control);
    await expect(anthropic).toHaveCount(0);
    await expect(page.locator("#searchInput")).toBeFocused();
  });
}

test("完整权益在全部原生 dialog API 缺失时可以关闭、重开并还原背景", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined, configurable: true });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { value: undefined, configurable: true });
    Object.defineProperty(HTMLDialogElement.prototype, "open", { get: () => undefined, configurable: true });
  });
  await page.goto("/");
  await waitForApp(page);
  await page.evaluate(() => {
    const existing = document.createElement("aside");
    existing.id = "existingBackgroundState";
    existing.setAttribute("inert", "existing"); existing.setAttribute("aria-hidden", "false");
    document.body.append(existing);
  });
  const trigger = page.locator("#quickGrid > .quick-card [data-view-plan]").first();
  const dialog = page.locator("#planDetailsModal");
  for (const closeWith of ["button", "escape", "backdrop"]) {
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator("#planDetailsCloseBtn")).toBeFocused();
    await expect(page.locator("main")).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(".plan-history > summary")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#planDetailsCloseBtn")).toBeFocused();
    if (closeWith === "button") await page.locator("#planDetailsCloseBtn").click();
    else if (closeWith === "escape") await page.keyboard.press("Escape");
    else await page.locator("#planDetailsBackdrop").click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(page.locator("#planDetailsBackdrop")).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.locator("main").getAttribute("inert")).toBeNull();
    await expect(page.locator("#existingBackgroundState")).toHaveAttribute("inert", "existing");
    await expect(page.locator("#existingBackgroundState")).toHaveAttribute("aria-hidden", "false");
    expect(await page.locator("body").evaluate(body => body.classList.contains("has-plan-details"))).toBe(false);
  }
});
