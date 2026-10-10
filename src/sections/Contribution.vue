<script setup>
/* 帮助补全与纠错：按贡献类型生成证据模板，复制、下载或预填到项目 Issues。不自动上传任何内容。
 * 模板随「我的关注」里选中的套餐和贡献者工具里选中的任务更新。 */
import { computed, ref } from "vue";
import * as legacy from "virtual:legacy-lib";
import { targetValue } from "./dom.js";

const TYPES = [["correction", "套餐纠错与更新"], ["vendor", "收录新厂商 / 套餐"], ["benchmark", "真实任务测评"]];
const type = ref("correction");
const template = computed(() => {
  void legacy.dataRevision.benchmark;
  return legacy.contributionTemplate(type.value);
});
const issueUrl = computed(() => legacy.contributionIssueUrl(type.value, template.value));
const feedback = ref("");
const preview = ref(null);

function chooseType(value) {
  if (!TYPES.some(([id]) => id === value)) return;
  type.value = value;
  /* 测评模板要用评测任务，数据按需下载，状态与重试显示在下方状态行 */
  if (value === "benchmark") legacy.loadViewData("benchmark");
}
async function copyTemplate() {
  const ok = await legacy.copyTextToClipboard(template.value);
  feedback.value = ok ? "证据模板已复制；请补全真实来源后提交。" : "未能访问剪贴板，请选择下面的模板手动复制，或下载文件。";
  if (!ok && preview.value) { preview.value.focus(); preview.value.select(); }
}
function downloadTemplate() {
  legacy.downloadTextFile(template.value, `coding-plan-${type.value}-evidence.md`, "text/markdown;charset=utf-8");
  feedback.value = "已生成本地证据模板文件；请补全后交给维护者，文件没有上传。";
}
</script>

<template>
  <label class="maintenance-select" for="contributionType">贡献类型<select id="contributionType" :value="type" @change="chooseType(targetValue($event))">
    <option v-for="[value, label] in TYPES" :key="value" :value="value">{{ label }}</option>
  </select></label>
  <!-- 加载状态与重试按钮由按需数据加载器（loadViewData）写入 -->
  <p id="contributionDataStatus" class="table-feedback optional-data-status" role="status" aria-live="polite" :hidden="type !== 'benchmark'"></p>
  <p id="contributionProjectNote">{{ issueUrl ? "可复制证据模板后，到项目 Issues 提交；模板中请只包含可公开资料。" : "当前未配置公开仓库提交地址。可复制或下载证据模板，交给项目维护者；本站不会自动发送或上传。" }}</p>
  <div class="maintenance-toolbar">
    <button id="copyContributionBtn" type="button" class="chip" @click="copyTemplate">复制证据模板</button>
    <button id="downloadContributionBtn" type="button" class="chip" @click="downloadTemplate">下载模板</button>
    <a id="contributionIssueLink" class="chip" target="_blank" rel="noopener" :hidden="!issueUrl" :href="issueUrl || undefined">前往项目 Issues ↗</a>
  </div>
  <p id="contributionFeedback" class="table-feedback" role="status" aria-live="polite">{{ feedback }}</p>
  <label class="contribution-preview" for="contributionTemplate">证据模板（选中后可手动复制）<textarea id="contributionTemplate" ref="preview" rows="12" readonly spellcheck="false" :value="template"></textarea></label>
</template>
