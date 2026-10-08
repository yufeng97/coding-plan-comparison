const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

test("个人图展开和收起后键盘焦点留在操作按钮", async ({ page }) => {
  await page.goto("/#s1");
  const button = page.locator("#showAllPersonal");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(button).toHaveText("收起为 20 档");
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(button).toContainText("显示全部");
});

test("清空比较条后键盘继续操作当前数据表", async ({ page }) => {
  await page.goto("/?q=Anthropic#table");
  await page.locator('#tableBody .cmp-add[data-plan-id="plan-0002"]').click();
  await page.locator("#cmpClearBtn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#cmpBar")).not.toBeVisible();
  await expect(page.locator("#searchInput")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#selectCat")).toBeFocused();
});

test("推荐卡直接加入对比并与数据表同身份按钮同步", async ({ page }) => {
  await page.goto("/");
  await page.locator("#quickGrid > .quick-card").first().locator(".qc-details > summary").click();
  const recommendation = page.locator("#quickGrid .cmp-add").first();
  await expect(recommendation).toBeVisible();
  const id = await recommendation.getAttribute("data-plan-id");
  await recommendation.focus();
  await page.keyboard.press("Enter");
  await expect(recommendation).toHaveAttribute("aria-pressed", "true");
  await expect(recommendation).toBeFocused();
  const planName = await page.evaluate("PLANS.find(p => p.id === " + JSON.stringify(id) + ").plan");
  await page.locator("#searchInput").fill(planName);
  await expect(page.locator(`#tableBody .cmp-add[data-plan-id="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  await recommendation.focus();
  await page.keyboard.press("Enter");
  await expect(recommendation).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#cmpBar")).not.toBeVisible();
});

test("独立对比复制和CSV保持选择顺序及计价、核价元数据", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  else await page.addInitScript(() => {
    /* Firefox/WebKit 不开放 Playwright 的剪贴板权限；仍验证应用交给浏览器的完整文本。 */
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window["testComparisonCopy"] = text; } } });
  });
  await page.goto("/?q=Cursor&cmp=plan-0002;plan-0003#table");
  const csv = await page.evaluate("tableRowsCsv(cmpState.items)");
  const markdown = await page.evaluate("'并排对比（2 档方案）\\n\\n' + tableRowsMarkdown(cmpState.items)");
  await page.locator("#copyCmpMdBtn").click();
  await expect.poll(async () => {
    const text = browserName === "chromium" ? await page.evaluate(() => navigator.clipboard.readText()) : await page.evaluate(() => window["testComparisonCopy"]);
    return String(text).replace(/\r\n/g, "\n"); /* Windows 系统剪贴板使用 CRLF。 */
  }).toBe(markdown);
  await expect(page.locator("#cmpFeedback")).toContainText("2 档");
  const pending = page.waitForEvent("download");
  await page.locator("#exportCmpCsvBtn").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^coding-plans-compare-\d{8}\.csv$/);
  const content = await fs.readFile(await download.path(), "utf8");
  expect(content).toBe("\uFEFF" + csv);
  expect(content).toContain("价格核查来源");
  expect(content).toContain("参考汇率");
});

test("剪贴板降级在对比窗口内选择文本，完成后仍可关闭窗口", async ({ page }) => {
  await page.goto("/?cmp=plan-0002;plan-0003#table");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true });
    document.execCommand = () => {
      const textarea = document.querySelector("#cmpModal textarea");
      const selected = textarea instanceof HTMLTextAreaElement && textarea.value.includes("Claude Pro");
      document.documentElement.dataset["copyFallback"] = selected ? "inside-dialog" : "missing";
      return selected;
    };
  });
  const copy = page.locator("#copyCmpMdBtn");
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-copy-fallback", "inside-dialog");
  await expect(copy).toBeFocused();
  await expect(page.locator("#cmpFeedback")).toContainText("已复制");
  await page.keyboard.press("Escape");
  await expect(page.locator("#cmpModal")).not.toBeVisible();
});
