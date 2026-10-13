/* 首帧脚本（独立构建、不能引用应用模块）自带一份「会改变首屏的地址参数」名单：
 * 只有这些参数出现时才在 Vue 接管前隐藏预渲染正文。名单必须与 URL_KEYS（加关注同步 follow）一致。 */
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

afterEach(() => { document.documentElement.classList.remove("has-query", "js-pending"); });

test("首帧脚本的页面状态参数与 URL_KEYS 及 follow 一致", async () => {
  const { PAGE_STATE_PARAMS } = await import("../entries/theme-init");
  const { URL_KEYS } = await import("../browser/url-state");
  assert.deepEqual([...PAGE_STATE_PARAMS].sort(), [...Object.keys(URL_KEYS), "follow"].sort());
});

test.each([
  ["?budget=500#table", true],
  ["?follow=plan-0002#updates", true],
  ["?from=singlemessage&isappinstalled=0", false],
  ["?utm_source=x&utm_medium=y", false],
  ["", false],
])("地址 %s 是否在接管前隐藏正文：%s", async (search, hidden) => {
  window.history.replaceState(null, "", "/index.html" + search);
  const { vi } = await import("vitest");
  vi.resetModules();
  await import("../entries/theme-init");
  assert.equal(document.documentElement.classList.contains("has-query"), hidden);
  assert.equal(document.documentElement.classList.contains("js-pending"), true, "脚本接管前挡住预渲染控件");
  window.history.replaceState(null, "", "/index.html");
});
