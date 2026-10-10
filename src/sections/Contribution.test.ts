/* 帮助补全与纠错：证据模板、Issues 链接、复制与下载。模板内容的口径另在 scripts/tests/test-app-maintenance.js 里测。 */
import { focusedId, loadBenchmarks, unloadOptionalData, useMount } from "../test/setup";
import { beforeEach, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as legacy from "@domain/runtime";
import Contribution from "./Contribution.vue";

const view = useMount(Contribution);

beforeEach(() => {
  Object.assign(legacy.maintenanceView, { planId: "" });
  Object.assign(legacy.benchmarkFilter, { task: "all", tool: "all", model: "all" });
  Object.assign(legacy.optionalViewState.benchmark, { message: "", failed: false, loading: false });
  loadBenchmarks();
});
const template = () => view.wrapper.get<HTMLTextAreaElement>("#contributionTemplate").element.value;
const issueUrl = () => new URL(view.wrapper.get("#contributionIssueLink").attributes("href") ?? "");

test("默认纠错模板随关注页选中的套餐更新，Issues 链接预填同一模板", async () => {
  await view.render();
  expect(template()).toContain("# 套餐纠错 / 更新证据");
  legacy.maintenanceView.planId = "plan-0002";
  await flushPromises();
  expect(template()).toContain("永久套餐 ID：plan-0002");
  expect(view.wrapper.get<HTMLAnchorElement>("#contributionIssueLink").element.hidden).toBe(false);
  const issue = issueUrl();
  expect(issue.href).toMatch(/^https:\/\/github\.com\/yufeng97\/coding-plan-comparison\/issues\/new\?/);
  expect(issue.searchParams.get("title")).toBe("套餐纠错与更新");
  expect(issue.searchParams.get("body")).toBe(template());
  expect(view.wrapper.get("#contributionProjectNote").text()).toContain("项目 Issues");
});

test("切换到测评模板时显示数据状态行，模板带上贡献者工具里选的任务", async () => {
  await view.render();
  const status = () => view.wrapper.get<HTMLElement>("#contributionDataStatus").element;
  expect(status().hidden).toBe(true);
  legacy.benchmarkFilter.task = "csv-export";
  await view.wrapper.get("#contributionType").setValue("benchmark");
  await flushPromises();
  expect(status().hidden).toBe(false);
  expect(template()).toContain("任务：csv-export");
  expect(issueUrl().searchParams.get("title")).toBe("真实任务测评");
});

test("测评数据下载失败时原生状态行可重试，成功后清除错误并更新模板", async () => {
  unloadOptionalData();
  delete (legacy.optionalDataLoads as Record<string, Promise<void>>).benchmark;
  const requests: HTMLScriptElement[] = [];
  vi.spyOn(document.head, "appendChild").mockImplementation(node => {
    if (node instanceof HTMLScriptElement) requests.push(node);
    return node;
  });
  await view.render();
  const descriptor = document.createElement("script");
  descriptor.id = "benchmarkDataSource";
  descriptor.type = "application/json";
  descriptor.src = "js/benchmark-data.js";
  document.body.appendChild(descriptor);

  await view.wrapper.get("#contributionType").setValue("benchmark");
  expect(view.wrapper.get("#contributionDataStatus").text()).toBe("正在加载本标签的数据…");
  expect(legacy.optionalViewState.benchmark.loading).toBe(true);
  expect(requests).toHaveLength(1);
  requests[0].dispatchEvent(new Event("error"));
  await flushPromises();
  expect(view.wrapper.get("#contributionDataStatus").text()).toContain("数据文件下载失败。");
  expect(legacy.optionalViewState.benchmark.failed).toBe(true);

  await view.wrapper.get("#contributionDataStatus [data-retry-data]").trigger("click");
  expect(requests).toHaveLength(2);
  expect(view.wrapper.find("#contributionDataStatus button").exists()).toBe(false);
  loadBenchmarks();
  requests[1].dispatchEvent(new Event("load"));
  await flushPromises();
  expect(view.wrapper.get("#contributionDataStatus").text()).toBe("");
  expect(legacy.optionalViewState.benchmark).toEqual({ message: "", failed: false, loading: false });
  expect(template()).toContain("任务：");
});

test("复制成功提示补全来源；剪贴板不可用时选中模板便于手动复制", async () => {
  await view.render();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await view.wrapper.get("#copyContributionBtn").trigger("click");
  await flushPromises();
  expect(writeText).toHaveBeenCalledWith(template());
  expect(view.wrapper.get("#contributionFeedback").text()).toContain("已复制");

  writeText.mockRejectedValue(new Error("denied"));
  document.execCommand = () => false;
  await view.wrapper.get("#copyContributionBtn").trigger("click");
  await flushPromises();
  expect(view.wrapper.get("#contributionFeedback").text()).toContain("手动复制");
  expect(focusedId()).toBe("contributionTemplate");
});

test("下载模板按贡献类型命名，只在本地生成文件", async () => {
  const names: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
  await view.render();
  await view.wrapper.get("#contributionType").setValue("vendor");
  await view.wrapper.get("#downloadContributionBtn").trigger("click");
  expect(names).toEqual(["coding-plan-vendor-evidence.md"]);
  expect(view.wrapper.get("#contributionFeedback").text()).toContain("没有上传");
});
