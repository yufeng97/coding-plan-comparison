#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createAssetPlan } = require("./lib/public-assets");

function stageSite(workspace = path.resolve(__dirname, "..")) {
  const plan = createAssetPlan(workspace);
  if (plan.changes.length) throw new Error("公共资源缓存版本过期，请先运行 npm run bump");
  const config = path.join(plan.root, "vercel.json");
  const configPath = path.relative(plan.root, fs.realpathSync(config));
  if (configPath === ".." || configPath.startsWith(".." + path.sep) || path.isAbsolute(configPath)) throw new Error("Vercel 配置越出项目目录");
  JSON.parse(fs.readFileSync(config, "utf8"));
  const destination = path.join(plan.root, ".site-build");
  const stage = fs.mkdtempSync(path.join(plan.root, ".site-stage-"));
  const backup = fs.mkdtempSync(path.join(plan.root, ".site-backup-"));
  let previous = false, committed = false;
  const removeOwned = (dir, prefix) => {
    if (path.dirname(dir) !== plan.root || !path.basename(dir).startsWith(prefix)) throw new Error("拒绝清理未知网站暂存路径");
    fs.rmSync(dir, { recursive: true, force: true });
  };
  try {
    for (const [file, bytes] of plan.outputs) {
      const next = path.join(stage, path.relative(plan.root, file));
      fs.mkdirSync(path.dirname(next), { recursive: true });
      fs.writeFileSync(next, bytes);
    }
    fs.copyFileSync(config, path.join(stage, "vercel.json"));
    fs.rmdirSync(backup);
    if (fs.existsSync(destination)) { fs.renameSync(destination, backup); previous = true; }
    try { fs.renameSync(stage, destination); committed = true; }
    catch (error) { if (previous) { fs.renameSync(backup, destination); previous = false; } throw error; }
    return { directory: destination, files: [...plan.outputs.keys()].map((file) => path.relative(plan.root, file)).concat("vercel.json") };
  } finally {
    if (!committed) removeOwned(stage, ".site-stage-");
    if (!previous || committed) removeOwned(backup, ".site-backup-");
  }
}
if (require.main === module) {
  try { const result = stageSite(); console.log("✅ " + result.files.length + " 个公共文件已生成到 " + result.directory); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { stageSite };
