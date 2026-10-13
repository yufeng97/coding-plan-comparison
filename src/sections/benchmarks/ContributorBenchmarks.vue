<script setup lang="ts">
/* 贡献者工具：本地任务框架的验收记录、任务说明与测评方法。公开模型榜单另见 PublicBenchmarks.vue。 */
import { computed } from "vue";
import { benchmarkFilter } from "@state/maintenance";
import { benchmarkData } from "@browser/maintenance-data";
import { optionalDataLoaded } from "@browser/optional-data";
import { benchmarkFilterOptions, benchmarkRuns, benchmarkRunView, benchmarkText, optionalPendingText } from "@app/maintenance";
import { targetValue } from "@browser/dom";
import { fromData } from "../../composables/optional-data";

const filter = benchmarkFilter;
const loaded = fromData("benchmark", () => optionalDataLoaded("benchmark"));
const data = fromData("benchmark", () => benchmarkData());
const choices = fromData("benchmark", () => ({ tool: benchmarkFilterOptions("tool"), model: benchmarkFilterOptions("model") }));
const runs = fromData("benchmark", () => benchmarkRuns().map((run) => ({ id: run.id, ...benchmarkRunView(run) })));
const tasks = computed(() => data.value.tasks.filter((task) => filter.task === "all" || task.id === filter.task));
const emptyText = computed(() => !loaded.value ? optionalPendingText("贡献者任务与记录")
  : data.value.runs.length ? "当前筛选没有贡献者记录。" : "尚未收录贡献者任务记录。这里的验收工具用于复现提交的单份解答，未测量的数据不填充分数。");

function choose(key: "task" | "tool" | "model", value: string) {
  const allowed = key === "task" ? data.value.tasks.map((task) => task.id) : choices.value[key];
  filter[key] = allowed.includes(value) ? value : "all";
}
</script>

<template>
  <div class="maintenance-panel">
    <div class="benchmark-filters">
      <label class="maintenance-select" for="benchmarkTask">任务<select id="benchmarkTask" :value="filter.task" @change="choose('task', targetValue($event))">
        <option value="all">全部任务</option>
        <option v-for="task in data.tasks" :key="task.id" :value="task.id">{{ task.title }}</option>
      </select></label>
      <label class="maintenance-select" for="benchmarkTool">工具<select id="benchmarkTool" :value="filter.tool" @change="choose('tool', targetValue($event))">
        <option value="all">全部工具</option>
        <option v-for="tool in choices.tool" :key="tool" :value="tool">{{ tool }}</option>
      </select></label>
      <label class="maintenance-select" for="benchmarkModel">模型<select id="benchmarkModel" :value="filter.model" @change="choose('model', targetValue($event))">
        <option value="all">全部模型</option>
        <option v-for="model in choices.model" :key="model" :value="model">{{ model }}</option>
      </select></label>
    </div>
    <!-- 只有结果说明是播报区：筛选变化时读出条数或空态，不把整份记录列表朗读一遍。 -->
    <div id="benchmarkResults">
      <p :class="{ 'benchmark-empty': !runs.length }" role="status" aria-live="polite">{{ runs.length ? `符合条件 ${runs.length} 条贡献者解答记录。不同任务、环境与币种分别展示，不合并成成功率或性能排名。` : emptyText }}</p>
      <template v-if="runs.length">
        <ul class="benchmark-runs">
          <li v-for="run in runs" :key="run.id" class="benchmark-run">
            <h3>{{ run.title }}</h3>
            <p>{{ run.meta }}</p>
            <dl class="benchmark-values">
              <div><dt>生成费用</dt><dd>{{ run.cost }}</dd></div>
              <div><dt>生成时间</dt><dd>{{ run.generation }}</dd></div>
              <div><dt>平均验收运行时间</dt><dd>{{ run.duration }}</dd></div>
              <div><dt>同一解答验收次数</dt><dd>{{ run.repeats }}</dd></div>
            </dl>
            <p>环境：{{ run.environment }}</p>
            <p><a v-if="run.evidenceUrl" :href="run.evidenceUrl" target="_blank" rel="noopener" tabindex="0">复现证据 ↗</a><template v-else>复现证据未记录</template></p>
          </li>
        </ul>
      </template>
    </div>
    <p class="maintenance-meta">生成费用取自真实 API 账单；订阅内使用不分摊单次费用。生成时间与验收运行时间分别记录；验收次数指同一解答的重复检查，不能当成模型独立尝试次数或成功率。</p>
  </div>
  <div id="benchmarkTasks">
    <details v-for="task in tasks" :key="task.id" class="method-box">
      <summary>{{ task.title }}</summary>
      <p>{{ task.description }}</p>
      <p><strong>验收条件：</strong>{{ benchmarkText(task.acceptance) }}</p>
      <p>任务标识：<code>{{ task.id }}</code></p>
    </details>
  </div>
  <details class="method-box"><summary>测评方法与记录导入说明</summary>
    <p id="benchmarkMethodology">{{ benchmarkText(data.methodology) }}</p>
    <p>贡献记录包含 taskId、model、tool、measuredAt、cost、currency、costBasis、generationSeconds、durationSeconds、passed、repeats、evidence 与 environment。evidence 须为可公开的 HTTPS 证据；costBasis 为 api-receipt 时填写实际账单，included-subscription 或 unknown 时 cost=null。</p>
    <p>请在本地任务框架运行同一解答的验收，保存原始提示、解答与日志，再将记录交由维护者核对导入。本站不会在浏览器上传文件或自动发布结果。</p>
    <a href="#contribute">复制或下载测评贡献模板 ↓</a>
  </details>
</template>
