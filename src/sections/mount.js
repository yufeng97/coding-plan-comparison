/* 已迁移为 Vue 组件的区块挂到各自的容器上。在页面启动（app-init.js）之前执行，启动时的视图切换与锚点定位能找到组件渲染的元素。 */
import { createApp } from "vue";
import Contribution from "./Contribution.vue";
import ContributorBenchmarks from "./ContributorBenchmarks.vue";
import FollowUpdates from "./FollowUpdates.vue";
import PublicBenchmarks from "./PublicBenchmarks.vue";

const SECTIONS = [
  ["publicBenchmarkApp", PublicBenchmarks],
  ["contributorBenchmarksApp", ContributorBenchmarks],
  ["updatesApp", FollowUpdates],
  ["contributionApp", Contribution],
];
for (const [id, component] of SECTIONS) {
  const host = document.getElementById(id);
  if (host) createApp(component).mount(host);
}
