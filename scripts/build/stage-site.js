#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createAssetPlan } = require("../lib/public-assets");
const { insideRoot, publicSiteFile, hiddenSegment } = require("../lib/paths");
const { swapDirectory } = require("../lib/atomic-swap");

/* 厂商 RSS 的链接在维护摘要里由脚本生成，页面不静态引用；按白名单单独收录普通文件。 */
function feedFiles(root) {
  const dir = path.join(root, "feeds");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((file) => {
    const rel = path.relative(root, file);
    if (!publicSiteFile(rel) || hiddenSegment(rel)) return false;
    if (!fs.lstatSync(file).isFile() || !insideRoot(root, fs.realpathSync(file))) throw new Error("厂商订阅源必须是项目内的普通文件：" + rel);
    return true;
  });
}
function stageSite(workspace = path.resolve(__dirname, "..", "..")) {
  const plan = createAssetPlan(workspace);
  if (plan.changes.length) throw new Error("公共资源缓存版本过期，请先运行 npm run bump");
  const config = path.join(plan.root, "vercel.json");
  if (!insideRoot(plan.root, fs.realpathSync(config))) throw new Error("Vercel 配置越出项目目录");
  JSON.parse(fs.readFileSync(config, "utf8"));
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
      fs.writeFileSync(next, bytes);
    }
    const feeds = feedFiles(plan.root);
    for (const file of feeds) {
      const next = path.join(stage, path.relative(plan.root, file));
      fs.mkdirSync(path.dirname(next), { recursive: true });
      fs.copyFileSync(file, next);
    }
    fs.copyFileSync(config, path.join(stage, "vercel.json"));
    swapStarted = true;
    swapDirectory({ stage, backup, destination, removeOwned });
    return { directory: destination, files: [...plan.outputs.keys(), ...feeds].map((file) => path.relative(plan.root, file)).concat("vercel.json") };
  } finally {
    /* 进入交换后由 swapDirectory 清理；恢复失败的 backup 必须保留。 */
    if (!swapStarted) { removeOwned(stage); removeOwned(backup); }
  }
}
if (require.main === module) {
  try { const result = stageSite(); console.log("✅ " + result.files.length + " 个公共文件已生成到 " + result.directory); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { stageSite };
