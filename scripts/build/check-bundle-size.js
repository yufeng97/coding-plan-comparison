#!/usr/bin/env node
/* 发布产物体积预算：按 brotli 压缩后的大小检查首屏 HTML、主入口脚本、样式与按需加载的 ECharts。
 * 超出预算时失败并列出各项，防止数据或依赖增长悄悄拖慢首屏；预算需要调整时改这里并在 CHANGES 说明原因。
 * 用法：node scripts/build/check-bundle-size.js [站点目录，默认 .site-build] */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

/** 预算（KiB，brotli）。pattern 匹配站点目录内的相对路径；required 表示必须恰好匹配一个文件。 */
const BUDGETS = [
  { name: "首屏 HTML（含预渲染内容）", pattern: /^index\.html$/, kib: 64 },
  { name: "主入口脚本", pattern: /^js\/index-[\w-]+\.js$/, kib: 170 },
  { name: "全站样式", pattern: /^css\/index-[\w-]+\.css$/, kib: 14 },
  { name: "ECharts 精简包（按需）", pattern: /^libs\/echarts-[\w-]+\.js$/, kib: 160 },
];

function listFiles(root, dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(root, file) : [path.relative(root, file).split(path.sep).join("/")];
  });
}

function brotliKiB(file) {
  const bytes = zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  return bytes.length / 1024;
}

/** @param {string} root @returns {{ name: string, file: string, kib: number, budget: number, ok: boolean }[]} */
function checkBundleSize(root) {
  const files = listFiles(root);
  return BUDGETS.map((budget) => {
    const matches = files.filter((file) => budget.pattern.test(file));
    if (matches.length !== 1) throw new Error(`${budget.name}应恰好有一个文件，实际 ${matches.length} 个：${matches.join(", ") || "无"}`);
    const kib = brotliKiB(path.join(root, matches[0]));
    return { name: budget.name, file: matches[0], kib, budget: budget.kib, ok: kib <= budget.kib };
  });
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, "../../.site-build"));
  if (!fs.existsSync(root)) {
    console.error(`找不到站点目录：${root}，请先运行 npm run build:site`);
    process.exit(1);
  }
  const rows = checkBundleSize(root);
  for (const row of rows) console.log(`${row.ok ? "✓" : "✗"} ${row.name} ${row.file}：${row.kib.toFixed(1)} KiB（预算 ${row.budget} KiB，brotli）`);
  if (rows.some((row) => !row.ok)) {
    console.error("产物体积超出预算；确认增长合理后再调整 scripts/build/check-bundle-size.js 的预算。");
    process.exitCode = 1;
  }
}

module.exports = { BUDGETS, checkBundleSize };
