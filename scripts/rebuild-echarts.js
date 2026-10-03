#!/usr/bin/env node
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { build } = require("esbuild");
const { writeAssetPlan } = require("./lib/public-assets");

async function rebuild() {
  const root = path.resolve(__dirname, "..");
  const file = path.join(root, "libs", "echarts.min.js");
  const result = await build({
    entryPoints: [path.join(root, "scripts", "echarts-entry.mjs")],
    bundle: true, minify: true, format: "iife", legalComments: "eof",
    outfile: file, write: false,
  });
  const output = result.outputFiles.find((item) => path.resolve(item.path) === file);
  if (!output) throw new Error("ECharts 构建未生成指定产物");
  writeAssetPlan({ changes: [[file, Buffer.from(output.contents)]], assets: new Map([[file, { bytes: fs.readFileSync(file) }]]) });
  console.log("✅ 已用 lockfile 中的 ECharts / esbuild 重建精简包；请运行 npm run bump");
}
if (require.main === module) rebuild().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { rebuild };
