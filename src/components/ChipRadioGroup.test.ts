import { mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import ChipRadioGroup from "./ChipRadioGroup.vue";

const options = [["a", "甲"], ["b", "乙"], ["c", "丙"]] as const;

test("单选标签用 radio 语义：只有选中项可 Tab，方向键与 Home/End 在组内选中并跳过不可用项", async () => {
  const wrapper = mount(ChipRadioGroup, { props: { label: "测试组", options, modelValue: "a", disabledOptions: ["b"], dataKey: "pick" }, attachTo: document.body });
  const radios = () => wrapper.findAll('[role="radio"]');
  expect(wrapper.attributes("role")).toBe("radiogroup");
  expect(wrapper.attributes("aria-label")).toBe("测试组");
  expect(radios().map((radio) => radio.attributes("aria-checked"))).toEqual(["true", "false", "false"]);
  expect(radios().map((radio) => radio.attributes("tabindex"))).toEqual(["0", "-1", "-1"]);
  expect(radios()[1]!.attributes("disabled")).toBeDefined();
  expect(radios()[2]!.attributes("data-pick")).toBe("c");

  await radios()[0]!.trigger("keydown", { key: "ArrowRight" });
  expect(wrapper.emitted("select")).toEqual([["c"]]);
  await wrapper.setProps({ modelValue: "c" });
  await radios()[2]!.trigger("keydown", { key: "ArrowRight" });
  expect(wrapper.emitted("select")!.at(-1)).toEqual(["a"]);
  await radios()[0]!.trigger("keydown", { key: "End" });
  expect(wrapper.emitted("select")!.at(-1)).toEqual(["c"]);
  await radios()[2]!.trigger("click");
  expect(wrapper.emitted("select")!.at(-1)).toEqual(["c"]);
  wrapper.unmount();
});

test("当前值不在可用选项里时，第一个可用选项保留在 Tab 顺序中", () => {
  const wrapper = mount(ChipRadioGroup, { props: { label: "测试组", options, modelValue: "z", disabledOptions: ["a"] } });
  expect(wrapper.findAll('[role="radio"]').map((radio) => radio.attributes("tabindex"))).toEqual(["-1", "0", "-1"]);
  wrapper.unmount();
});
