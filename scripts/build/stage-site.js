#!/usr/bin/env node
/* 生成发布产物 .site-build/：Vite 构建到暂存目录 → 预渲染默认首屏 → 附带 RSS、分享卡片图与 Vercel 配置 → 整目录原子替换。
 * 任一步失败都保留原来的 .site-build/。产物里只允许公共白名单内的文件。 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot, publicSiteFile, hiddenSegment } = require("../lib/paths");
const { swapDirectory } = require("../lib/atomic-swap");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const slash = (file) => file.split(path.sep).join("/");

/** 公共白名单与隐藏段检查，词法路径与真实路径（链接、短名展开后）都要满足。 */
function assertPublicFile(root, file) {
  const real = fs.realpathSync.native(file);
  for (const target of [file, real]) {
    const rel = slash(path.relative(root, target));
    if (!insideRoot(root, target)) throw new Error(`公共文件越出项目目录：${rel}`);
    if (!publicSiteFile(rel)) throw new Error(`公共文件不在白名单：${rel}`);
    if (hiddenSegment(rel)) throw new Error(`公共文件包含隐藏目录：${rel}`);
  }
}

/* 不经 Vite 引用、但要随站发布的文件：变更 RSS、分享卡片图（og:image）与分厂商变更 RSS。隐藏文件与子目录不发布。 */
const EXTRA_FILES = ["changes.xml"];
const EXTRA_DIRS = ["img", "feeds"];
function publicExtras(root) {
  const extras = [];
  for (const rel of EXTRA_FILES) {
    const file = path.join(root, rel);
    if (fs.existsSync(file)) { assertPublicFile(root, file); extras.push(file); }
  }
  for (const dir of EXTRA_DIRS) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const file = path.join(base, entry.name);
      if (!fs.statSync(file).isFile()) continue;
      assertPublicFile(root, file);
      extras.push(file);
    }
  }
  return extras;
}

/** @param {string} dir @param {string} [base] @returns {string[]} */
function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(file, base) : [slash(path.relative(base, file))];
  }).sort();
}

/** @param {string} outDir @param {string} root */
async function viteBuild(outDir, root) {
  const { build } = await import("vite");
  await build({ root, configFile: path.join(root, "vite.config.mjs"), logLevel: "warn", build: { outDir, emptyOutDir: true } });
}

/** @param {string} [workspace] @param {{ build?: (outDir: string, root: string) => Promise<void>, prerender?: (html: string) => string | Promise<string> }} [options]
 * build 默认是 Vite 构建（测试可替换）；prerender 只在发布本仓库时注入首屏静态内容。
 * @returns {Promise<{ directory: string, files: string[] }>} */
async function stageSite(workspace = repositoryRoot, options = {}) {
  const root = fs.realpathSync.native(path.resolve(workspace));
  const config = path.join(root, "vercel.json");
  if (!insideRoot(root, fs.realpathSync.native(config))) throw new Error("Vercel 配置越出项目目录");
  JSON.parse(fs.readFileSync(config, "utf8"));
  const extras = publicExtras(root);
  const destination = path.join(root, ".site-build");
  const stage = fs.mkdtempSync(path.join(root, ".site-stage-"));
  const backup = fs.mkdtempSync(path.join(root, ".site-backup-"));
  const removeOwned = (dir) => {
    if (path.dirname(dir) !== root || !path.basename(dir).startsWith(".site-")) throw new Error("拒绝清理未知网站暂存路径");
    fs.rmSync(dir, { recursive: true, force: true });
  };
  let swapStarted = false;
  try {
    await (options.build || viteBuild)(stage, root);
    const entry = path.join(stage, "index.html");
    if (options.prerender) fs.writeFileSync(entry, await options.prerender(fs.readFileSync(entry, "utf8")));
    for (const rel of listFiles(stage)) {
      if (!publicSiteFile(rel) || hiddenSegment(rel)) throw new Error(`构建产物不在公共白名单：${rel}`);
    }
    for (const file of extras) {
      const next = path.join(stage, path.relative(root, file));
      fs.mkdirSync(path.dirname(next), { recursive: true });
      fs.copyFileSync(file, next);
    }
    fs.copyFileSync(config, path.join(stage, "vercel.json"));
    const files = listFiles(stage);
    swapStarted = true;
    swapDirectory({ stage, backup, destination, removeOwned });
    return { directory: destination, files };
  } finally {
    /* 进入交换后由 swapDirectory 清理；恢复失败的 backup 必须保留。 */
    if (!swapStarted) { removeOwned(stage); removeOwned(backup); }
  }
}

if (require.main === module) {
  const { prerenderIndex } = require("./prerender");
  stageSite(undefined, { prerender: prerenderIndex })
    .then((result) => console.log("✅ " + result.files.length + " 个公共文件已生成到 " + result.directory))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { stageSite, publicExtras };
