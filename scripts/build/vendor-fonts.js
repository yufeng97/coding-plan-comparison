#!/usr/bin/env node
"use strict";
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { swapDirectory } = require("../lib/atomic-swap");
const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
/* 只接受 Google Fonts 的响应域；构建脚本不走代理场景下的任意重定向 */
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const MAX_FONT_BYTES = 4 * 1024 * 1024;

/** @returns {Promise<Buffer>} */
function get(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (response) => {
      response.on("error", reject);
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error("字体下载重定向过多")); return; }
        const next = new URL(response.headers.location, url);
        if (!FONT_HOSTS.has(next.hostname)) { reject(new Error("字体下载重定向到非 Google Fonts 域：" + next.hostname)); return; }
        get(next.href, headers, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) { response.resume(); reject(new Error(status + " " + url)); return; }
      const declared = Number(response.headers["content-length"]) || 0;
      if (declared > MAX_FONT_BYTES) { response.resume(); reject(new Error("字体响应超过大小上限：" + url)); return; }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_FONT_BYTES) { req.destroy(new Error("字体响应超过大小上限：" + url)); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(15000, () => req.destroy(new Error("字体下载超时：" + url)));
    req.on("error", reject);
  });
}

/** @param {{dir?:string,fetcher?:typeof get,rename?:typeof fs.renameSync}} options */
async function updateFonts(options = {}) {
  const dir = path.resolve(options.dir || path.join(__dirname, "..", "..", "libs", "fonts"));
  const parent = path.dirname(dir);
  if (dir === parent || !path.basename(dir)) throw new Error("字体目录不能是磁盘根目录");
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, ".fonts-stage-"));
  const backup = fs.mkdtempSync(path.join(parent, ".fonts-backup-"));
  const removeOwned = (target) => {
    if (path.dirname(target) !== parent || !path.basename(target).startsWith(".fonts-")) throw new Error("拒绝清理未知字体暂存路径");
    fs.rmSync(target, { recursive: true, force: true });
  };
  let swapStarted = false;
  try {
    const fetcher = options.fetcher || get;
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" };
    let css = (await fetcher(FONT_CSS_URL, headers)).toString("utf8");
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((match) => match[1]))];
    if (!urls.length) throw new Error("Google Fonts 响应不含字体文件");
    let index = 0;
    for (const url of urls) {
      const bytes = await fetcher(url);
      if (bytes.subarray(0, 4).toString() !== "wOF2") throw new Error("字体响应不是 WOFF2：" + url);
      const digest = crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 10);
      const name = "gf-" + index++ + "-" + digest + ".woff2";
      fs.writeFileSync(path.join(stage, name), bytes);
      css = css.split(url).join(name);
    }
    fs.writeFileSync(path.join(stage, "fonts.css"), css);
    swapStarted = true;
    swapDirectory({ stage, backup, destination: dir, rename: options.rename, removeOwned });
    return { count: urls.length, dir };
  } finally {
    /* 交换失败且无法恢复时保留唯一旧备份，交由报错中的路径手动恢复。 */
    if (!swapStarted) { removeOwned(stage); removeOwned(backup); }
  }
}
if (require.main === module) updateFonts().then((result) => console.log("✅ " + result.count + " 个字体已整组更新：" + result.dir))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { updateFonts, get };
