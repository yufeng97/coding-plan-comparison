/* 帮助补全与纠错：证据模板、Issues 链接、复制与下载。模板内容的口径另在 scripts/tests/test-app-maintenance.js 里测。 */
import { loadBenchmarks } from "../test/setup.js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import * as legacy from "virtual:legacy-lib";
import Contribution from "./Contribution.vue";

let wrapper = null;
beforeEach(() => {
  Object.assign(legacy.maintenanceView, { planId: "" });
  Object.assign(legacy.benchmarkFilter, { task: "all", tool: "all", model: "all" });
  loadBenchmarks();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
async function render() {
  wrapper = mount(Contribution, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}
const template = () => wrapper.get("#contributionTemplate").element.value;

test("默认纠错模板随关注页选中的套餐更新，Issues 链接预填同一模板", async () => {
  await render();
  expect(template()).toContain("# 套餐纠错 / 更新证据");
  legacy.maintenanceView.planId = "plan-0002";
  await flushPromises();
  expect(template()).toContain("永久套餐 ID：plan-0002");
  const link = wrapper.get("#contributionIssueLink");
  expect(link.element.hidden).toBe(false);
  const issue = new URL(link.attributes("href"));
  expect(issue.href).toMatch(/^https:\/\/github\.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  expect(issue.searchParams.get("title")).toBe("套餐纠错与更新");
  expect(issue.searchParams.get("body")).toBe(template());
  expect(wrapper.get("#contributionProjectNote").text()).toContain("项目 Issues");
});

test("切换到测评模板时显示数据状态行，模板带上贡献者工具里选的任务", async () => {
  await render();
  expect(wrapper.get("#contributionDataStatus").element.hidden).toBe(true);
  legacy.benchmarkFilter.task = "csv-export";
  await wrapper.get("#contributionType").setValue("benchmark");
  await flushPromises();
  expect(wrapper.get("#contributionDataStatus").element.hidden).toBe(false);
  expect(template()).toContain("任务：csv-export");
  expect(new URL(wrapper.get("#contributionIssueLink").attributes("href")).searchParams.get("title")).toBe("真实任务测评");
});

test("复制成功提示补全来源；剪贴板不可用时选中模板便于手动复制", async () => {
  await render();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await wrapper.get("#copyContributionBtn").trigger("click");
  await flushPromises();
  expect(writeText).toHaveBeenCalledWith(template());
  expect(wrapper.get("#contributionFeedback").text()).toContain("已复制");

  writeText.mockRejectedValue(new Error("denied"));
  document.execCommand = () => false;
  await wrapper.get("#copyContributionBtn").trigger("click");
  await flushPromises();
  expect(wrapper.get("#contributionFeedback").text()).toContain("手动复制");
  expect(document.activeElement.id).toBe("contributionTemplate");
});

test("下载模板按贡献类型命名，只在本地生成文件", async () => {
  const names = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { names.push(this.download); });
  await render();
  await wrapper.get("#contributionType").setValue("vendor");
  await wrapper.get("#downloadContributionBtn").trigger("click");
  expect(names).toEqual(["coding-plan-vendor-evidence.md"]);
  expect(wrapper.get("#contributionFeedback").text()).toContain("没有上传");
});
