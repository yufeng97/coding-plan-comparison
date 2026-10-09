#!/usr/bin/env node
"use strict";
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { swapDirectory } = require("../lib/atomic-swap");
const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
/* 只接受 Google Fonts 的 HTTPS 地址：CSS 来自 fonts.googleapis.com，字体文件只能来自 fonts.gstatic.com；
 * 请求、重定向与 CSS 中解析出的地址都校验主机，构建脚本不走代理场景下的任意重定向。 */
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const FONT_FILE_HOST = "fonts.gstatic.com";
const MAX_FONT_BYTES = 4 * 1024 * 1024;

/** @param {URL} url @param {Set<string>|string[]} hosts */
function googleFontsURL(url, hosts) {
  return url.protocol === "https:" && !url.username && !url.password && !url.port && [...hosts].includes(url.hostname);
}

/** @returns {Promise<Buffer>} */
function get(url, headers = {}, redirects = 0) {
  let target;
  try { target = new URL(url); } catch { return Promise.reject(new Error("字体下载地址无效：" + url)); }
  if (!googleFontsURL(target, FONT_HOSTS)) return Promise.reject(new Error("字体下载只允许 Google Fonts HTTPS 地址：" + url));
  return new Promise((resolve, reject) => {
    const req = https.get(target, { headers }, (response) => {
      response.on("error", reject);
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error("字体下载重定向过多")); return; }
        const next = new URL(response.headers.location, target);
        if (!googleFontsURL(next, FONT_HOSTS)) { reject(new Error("字体下载重定向到非 Google Fonts HTTPS 地址：" + next.href)); return; }
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
    /* 下载任何字体前先校验 CSS 中的全部引用：只能是 fonts.gstatic.com 的 HTTPS 地址，也不允许 @import 外部样式。 */
    if (/@import\b/i.test(css)) throw new Error("Google Fonts CSS 含 @import，拒绝引入外部样式");
    const refs = [...css.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map((match) => match[2].trim());
    for (const ref of refs) {
      let parsed = null;
      try { parsed = new URL(ref); } catch {}
      if (!parsed || !googleFontsURL(parsed, [FONT_FILE_HOST])) throw new Error("字体 CSS 只允许 fonts.gstatic.com 的 HTTPS 字体地址：" + ref);
    }
    const urls = [...new Set(refs)];
    if (!urls.length) throw new Error("Google Fonts 响应不含字体文件");
    const byDigest = new Map();
    for (const url of urls) {
      const bytes = await fetcher(url);
      if (bytes.subarray(0, 4).toString() !== "wOF2") throw new Error("字体响应不是 WOFF2：" + url);
      const digest = crypto.createHash("sha256").update(bytes).digest("hex");
      const name = "gf-" + digest + ".woff2";
      if (!byDigest.has(digest)) {
        byDigest.set(digest, name);
        fs.writeFileSync(path.join(stage, name), bytes);
      }
      css = css.split(url).join(name);
    }
    fs.writeFileSync(path.join(stage, "fonts.css"), css);
    swapStarted = true;
    swapDirectory({ stage, backup, destination: dir, rename: options.rename, removeOwned });
    return { count: byDigest.size, sources: urls.length, dir };
  } finally {
    /* 交换失败且无法恢复时保留唯一旧备份，交由报错中的路径手动恢复。 */
    if (!swapStarted) { removeOwned(stage); removeOwned(backup); }
  }
}
if (require.main === module) updateFonts().then((result) => console.log("✅ " + result.count + " 个字体已整组更新：" + result.dir))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { updateFonts, get };
