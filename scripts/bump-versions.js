#!/usr/bin/env node
"use strict";
const path = require("node:path");
const { createAssetPlan, writeAssetPlan } = require("./lib/public-assets");

function main(args = process.argv.slice(2), workspace = path.resolve(__dirname, "..")) {
  if (args.some((arg) => arg !== "--check")) throw new Error("用法：node scripts/bump-versions.js [--check]");
  const plan = createAssetPlan(workspace);
  if (args.includes("--check")) {
    if (plan.changes.length) throw new Error("缓存版本号过期，请运行 npm run bump：" + plan.changes.map(([file]) => path.relative(plan.root, file)).join("、"));
    console.log("✅ " + (plan.assets.size - 1) + " 个公共资源及 CSS 依赖的缓存版本号一致");
  } else {
    writeAssetPlan(plan);
    console.log("✅ 校验 " + (plan.assets.size - 1) + " 个公共资源，更新 " + plan.changes.length + " 个文件");
  }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
