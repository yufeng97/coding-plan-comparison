"use strict";
const { test, expect } = require("@playwright/test");

test("共享 CSP 阻止内联脚本，外链主题和页面仍正常启动", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cp-theme", "dark"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#heroDate")).not.toHaveText("");
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = 'document.documentElement.dataset.inlineProof="executed"';
    document.head.appendChild(script);
  });
  expect(await page.locator("html").getAttribute("data-inline-proof")).toBeNull();
});
