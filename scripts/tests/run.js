"use strict";
/* 依序执行全部 Node 回归（等价于原来的 && 链）：任一失败立即以非零码退出。 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const suite = [
  "test-metrics.js",
  "test-data-regressions.js",
  "test-app-history.js",
  "test-app-picker.js",
  "test-app-charts.js",
  "test-app-tables.js",
  "test-server.js",
  "test-tools.js",
  "test-pricing.js",
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
if (!process.exitCode) console.log("全部 Node 回归通过：" + suite.length + " 个套件");
