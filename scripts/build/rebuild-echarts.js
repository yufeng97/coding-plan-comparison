#!/usr/bin/env node
"use strict";
const path = require("node:path");
const { build } = require("esbuild");
const { replaceFiles } = require("../lib/atomic-swap");

async function rebuild() {
  const root = path.resolve(__dirname, "..", "..");
  const file = path.join(root, "libs", "echarts.min.js");
  const result = await build({
    entryPoints: [path.join(__dirname, "echarts-entry.mjs")],
    bundle: true, minify: true, format: "iife", legalComments: "eof",
    outfile: file, write: false,
  });
  const output = result.outputFiles.find((item) => path.resolve(item.path) === file);
  if (!output) throw new Error("ECharts 构建未生成指定产物");
  replaceFiles([[file, Buffer.from(output.contents)]]);
  console.log("✅ 已用 lockfile 中的 ECharts / esbuild 重建精简包；构建时 Vite 会按内容哈希重新命名");
}
if (require.main === module) rebuild().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { rebuild };
