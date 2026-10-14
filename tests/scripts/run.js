"use strict";
/* 依序执行全部 Node 回归（等价于原来的 && 链）：任一失败立即以非零码退出。 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const suite = [
  "test-architecture.js",
  "test-server.js",
  "test-file-lock.js",
  "test-tools.js",
  "test-readme.js",
  "test-workflows.js",
  "test-pricing-sync.js",
  "test-news.js",
  "test-news-blog.js",
  "test-news-blog-collection.js",
  "test-maintenance.js",
  "test-benchmarks.js",
  "test-public-benchmarks.js",
  "test-benchmark-deepswe-cursor.js",
  "test-benchmark-osworld-hle.js",
  "test-runners.js",
];

for (const file of suite) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    const reason = result.signal ? "（信号 " + result.signal + "）" : "（退出码 " + result.status + "）";
    console.error(`在 ${file} 处停止${reason}；修复后重新运行 npm run test`);
    break;
  }
}
if (!process.exitCode) {
  console.log("全部 Node 回归通过：" + suite.length + " 个套件");
  /* 直接导入 TypeScript 模块的公式/数据回归、真实 Vue 整页流程与组件测试。 */
  const cli = path.join(path.dirname(require.resolve("vitest/package.json")), require("vitest/package.json").bin.vitest);
  const vitest = spawnSync(process.execPath, [cli, "run"], { stdio: "inherit", cwd: path.resolve(__dirname, "..", "..") });
  if (vitest.error) throw vitest.error;
  if (vitest.status !== 0) {
    process.exitCode = vitest.status || 1;
    console.error("在 TypeScript / Vue 回归处停止；修复后重新运行 npm run test");
  }
}
