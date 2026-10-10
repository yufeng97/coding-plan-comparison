#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createAssetPlan, localAsset } = require("../lib/public-assets");
const { insideRoot } = require("../lib/paths");
const { swapDirectory } = require("../lib/atomic-swap");

/* HTML 不直接引用、但要随站发布的公共文件：分享卡片图（og:image）与分厂商变更 RSS。
   逐个经公共白名单与真实路径校验；隐藏文件和子目录不发布。 */
const EXTRA_DIRS = ["img", "feeds"];
function publicExtras(root) {
  const owner = path.join(root, "index.html");
  const extras = [];
  for (const dir of EXTRA_DIRS) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || !entry.isFile()) continue;
      const file = localAsset(root, owner, dir + "/" + entry.name);
      if (file) extras.push(file);
    }
  }
  return extras;
}

/** @param {string} [workspace] @param {{prerender?:(html:string, root:string)=>string}} [options] prerender 只在正式构建时注入首屏静态内容。 */
function stageSite(workspace = path.resolve(__dirname, "..", ".."), options = {}) {
  const plan = createAssetPlan(workspace);
  if (plan.changes.length) throw new Error("公共资源缓存版本过期，请先运行 npm run bump");
  const config = path.join(plan.root, "vercel.json");
  if (!insideRoot(plan.root, fs.realpathSync(config))) throw new Error("Vercel 配置越出项目目录");
  JSON.parse(fs.readFileSync(config, "utf8"));
  const extras = publicExtras(plan.root);
  const destination = path.join(plan.root, ".site-build");
  const stage = fs.mkdtempSync(path.join(plan.root, ".site-stage-"));
  const backup = fs.mkdtempSync(path.join(plan.root, ".site-backup-"));
  const removeOwned = (dir) => {
    if (path.dirname(dir) !== plan.root || !path.basename(dir).startsWith(".site-")) throw new Error("拒绝清理未知网站暂存路径");
    fs.rmSync(dir, { recursive: true, force: true });
  };
  let swapStarted = false;
  try {
    for (const [file, bytes] of plan.outputs) {
      const next = path.join(stage, path.relative(plan.root, file));
      fs.mkdirSync(path.dirname(next), { recursive: true });
      const output = file === plan.entry && options.prerender ? Buffer.from(options.prerender(bytes.toString("utf8"), plan.root)) : bytes;
      fs.writeFileSync(next, output);
    }
    for (const file of extras) {
      const next = path.join(stage, path.relative(plan.root, file));
      fs.mkdirSync(path.dirname(next), { recursive: true });
      fs.copyFileSync(file, next);
    }
    fs.copyFileSync(config, path.join(stage, "vercel.json"));
    swapStarted = true;
    swapDirectory({ stage, backup, destination, removeOwned });
    return { directory: destination, files: [...plan.outputs.keys(), ...extras].map((file) => path.relative(plan.root, file)).concat("vercel.json") };
  } finally {
    /* 进入交换后由 swapDirectory 清理；恢复失败的 backup 必须保留。 */
    if (!swapStarted) { removeOwned(stage); removeOwned(backup); }
  }
}
if (require.main === module) {
  try {
    const { prerenderIndex } = require("./prerender");
    const result = stageSite(undefined, { prerender: prerenderIndex });
    console.log("✅ " + result.files.length + " 个公共文件已生成到 " + result.directory);
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { stageSite, publicExtras };
