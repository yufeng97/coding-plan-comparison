<script setup lang="ts">
/* 帮助补全与纠错：按贡献类型生成证据模板，复制、下载或预填到项目 Issues。不自动上传任何内容。
 * 模板随「我的关注」里选中的套餐和贡献者工具里选中的任务更新。 */
import { computed, ref } from "vue";
import { dataRevision } from "@state/maintenance";
import { copyTextToClipboard, downloadTextFile } from "@browser/interaction";
import { contributionIssueUrl, contributionTemplate, loadViewData } from "@app/maintenance";
import { targetValue } from "@browser/dom";
import OptionalDataStatus from "../../components/OptionalDataStatus.vue";

const TYPES = [["correction", "套餐纠错与更新"], ["vendor", "收录新厂商 / 套餐"], ["benchmark", "真实任务测评"]] as const;
type ContributionType = (typeof TYPES)[number][0];
const type = ref<ContributionType>("correction");
const template = computed(() => {
  void dataRevision.benchmark;
  return contributionTemplate(type.value);
});
const issueUrl = computed(() => contributionIssueUrl(type.value, template.value));
const feedback = ref("");
const preview = ref<HTMLTextAreaElement | null>(null);

function chooseType(value: string) {
  const known = TYPES.find(([id]) => id === value);
  if (!known) return;
  type.value = known[0];
  /* 测评模板要用评测任务，数据按需下载，状态与重试显示在下方状态行 */
  if (value === "benchmark") loadViewData("benchmark");
}
async function copyTemplate() {
  const ok = await copyTextToClipboard(template.value);
  feedback.value = ok ? "证据模板已复制；请补全真实来源后提交。" : "未能访问剪贴板，请选择下面的模板手动复制，或下载文件。";
  if (!ok && preview.value) { preview.value.focus(); preview.value.select(); }
}
function downloadTemplate() {
  downloadTextFile(template.value, `coding-plan-${type.value}-evidence.md`, "text/markdown;charset=utf-8");
  feedback.value = "已生成本地证据模板文件；请补全后交给维护者，文件没有上传。";
}
</script>

<template>
  <label class="maintenance-select" for="contributionType">贡献类型<select id="contributionType" :value="type" @change="chooseType(targetValue($event))">
    <option v-for="[value, label] in TYPES" :key="value" :value="value">{{ label }}</option>
  </select></label>
  <OptionalDataStatus id="contributionDataStatus" kind="benchmark" :hidden="type !== 'benchmark'" />
  <p id="contributionProjectNote">{{ issueUrl ? "可复制证据模板后，到项目 Issues 提交；模板中请只包含可公开资料。" : "当前未配置公开仓库提交地址。可复制或下载证据模板，交给项目维护者；本站不会自动发送或上传。" }}</p>
  <div class="maintenance-toolbar">
    <button id="copyContributionBtn" type="button" class="chip" @click="copyTemplate">复制证据模板</button>
    <button id="downloadContributionBtn" type="button" class="chip" @click="downloadTemplate">下载模板</button>
    <a id="contributionIssueLink" class="chip" target="_blank" rel="noopener" :hidden="!issueUrl" :href="issueUrl || undefined">前往项目 Issues ↗</a>
  </div>
  <p id="contributionFeedback" class="table-feedback" role="status" aria-live="polite">{{ feedback }}</p>
  <label class="contribution-preview" for="contributionTemplate">证据模板（选中后可手动复制）<textarea id="contributionTemplate" ref="preview" rows="12" readonly spellcheck="false" :value="template"></textarea></label>
</template>
