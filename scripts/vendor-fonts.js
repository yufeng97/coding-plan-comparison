#!/usr/bin/env node
"use strict";
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

/** @returns {Promise<Buffer>} */
function get(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (response) => {
      response.on("error", reject);
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error("字体下载重定向过多")); return; }
        get(new URL(response.headers.location, url).href, headers, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) { response.resume(); reject(new Error(status + " " + url)); return; }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(15000, () => req.destroy(new Error("字体下载超时：" + url)));
    req.on("error", reject);
  });
}

/** @param {{dir?:string,fetcher?:typeof get,rename?:typeof fs.renameSync}} options */
async function updateFonts(options = {}) {
  const dir = path.resolve(options.dir || path.join(__dirname, "..", "libs", "fonts"));
  const parent = path.dirname(dir);
  if (dir === parent || !path.basename(dir)) throw new Error("字体目录不能是磁盘根目录");
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, ".fonts-stage-"));
  const backup = fs.mkdtempSync(path.join(parent, ".fonts-backup-"));
  const rename = options.rename || fs.renameSync;
  let oldMoved = false, committed = false;
  const removeOwned = (target, prefix) => {
    if (path.dirname(target) !== parent || !path.basename(target).startsWith(prefix)) throw new Error("拒绝清理未知字体暂存路径");
    fs.rmSync(target, { recursive: true, force: true });
  };
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
    fs.rmdirSync(backup);
    if (fs.existsSync(dir)) { rename(dir, backup); oldMoved = true; }
    try { rename(stage, dir); committed = true; }
    catch (error) { if (oldMoved) { rename(backup, dir); oldMoved = false; } throw error; }
    return { count: urls.length, dir };
  } finally {
    if (!committed) removeOwned(stage, ".fonts-stage-");
    if (!oldMoved || committed) removeOwned(backup, ".fonts-backup-");
  }
}
if (require.main === module) updateFonts().then((result) => console.log("✅ " + result.count + " 个字体已整组更新：" + result.dir))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { updateFonts, get };
