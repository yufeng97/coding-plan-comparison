"use strict";
/* 会话日志导入、导航关注未读数与手机价格表（厂商筛选、一次展开全部）的真实浏览器回归。 */
const { test, expect } = require("@playwright/test");

const noPageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test("同时选择 Claude Code 与 Codex 会话日志后合并填好计算器，并换成主要模型的 API 牌价", async ({ page }) => {
  await page.goto("/#s4");
  await page.waitForFunction(() => window["codingPlanReady"] === true);
  await page.locator("#costCalculator > summary").click();
  await page.locator("#usageImport > summary").click();
  const claude = [];
  for (let day = 1; day <= 7; day++) for (let i = 0; i < 20; i++) {
    const line = JSON.stringify({ type: "assistant", timestamp: `2026-09-0${day}T10:${String(i).padStart(2, "0")}:00Z`, requestId: `r${day}-${i}`,
      message: { id: `m${day}-${i}`, model: "claude-opus-5-5", usage: { input_tokens: 300, output_tokens: 900, cache_creation_input_tokens: 2000, cache_read_input_tokens: 40000 } } });
    claude.push(line, line); /* 流式片段重复写入，只计一次 */
  }
  const codex = [
    JSON.stringify({ timestamp: "2026-09-03T10:00:00Z", type: "turn_context", payload: { model: "gpt-codex-test" } }),
    JSON.stringify({ timestamp: "2026-09-03T10:01:00Z", type: "event_msg", payload: { type: "token_count", info: {
      total_token_usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 300 }, last_token_usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 300 } } } }),
  ];
  await page.locator("#usageImportFile").setInputFiles([
    { name: "claude.jsonl", mimeType: "application/json", buffer: Buffer.from(claude.join("\n")) },
    { name: "codex.jsonl", mimeType: "application/json", buffer: Buffer.from(codex.join("\n")) },
  ]);
  const feedback = page.locator("#usageImportFeedback");
  await expect(feedback).toContainText("已导入 7 个有用量的日子");
  await expect(feedback).toContainText("主要模型 claude-opus-5-5 已对应 Anthropic · Claude Opus 5.5 的 API 牌价");
  await expect(page.locator("#costModel")).toHaveValue("Anthropic|Claude Opus 5.5");
  await expect(page.locator("#costDays")).toHaveValue("30");
  await expect(page.locator("#usageImportText")).toHaveValue("");
  await expect(page.locator("#costResult")).toContainText("能覆盖这个用量的套餐");
  expect(await page.evaluate(() => location.href.includes("m1-0") || location.href.includes("claude-opus-5-5"))).toBe(false);
});

test("375px 关注套餐的未读变更显示在导航，价格表可按厂商筛选并一次展开全部", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.addInitScript(() => localStorage.setItem("cp-followed-plans-v1", JSON.stringify({ planIds: ["plan-0101"], readChangeIds: [] })));
  await page.goto("/#table");
  await page.waitForFunction(() => window["codingPlanReady"] === true);
  const badge = page.locator("#followNavBadge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/\d+/);
  expect(await page.evaluate(() => window["optionalDataLoaded"]("maintenance"))).toBe(false);
  const all = page.locator("#tableAllBtn");
  await expect(all).toBeVisible();
  const total = await page.evaluate(() => window["computeTableRows"]().length);
  await all.click();
  await expect(page.locator("#tableBody tr")).toHaveCount(total);
  await page.locator("#selectVendor").selectOption("Cursor");
  await expect(page).toHaveURL(/tvendor=Cursor/);
  const vendors = await page.locator("#tableBody .td-vendor").allTextContents();
  expect(vendors.length).toBeGreaterThan(0);
  expect(vendors.every((text) => text.trim() === "Cursor")).toBe(true);
  expect(await noPageOverflow(page)).toBe(true);
  await page.locator('[data-site-view="updates"]').click();
  await page.waitForFunction(() => window["optionalDataLoaded"]("maintenance"));
  await page.locator("#markFollowReadBtn").click();
  await expect(badge).toBeHidden();
});
