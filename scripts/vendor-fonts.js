#!/usr/bin/env node
/* 更新 libs/fonts 下的 Google Fonts 子集（Manrope + IBM Plex Mono）：
 *   node scripts/vendor-fonts.js
 * 按 fonts.googleapis.com 当前切片重新下载 gf-*.woff2 并回写 fonts.css 的本地映射。
 * 图标已改为内联 SVG（js/app-core.js 的 ICON_SVG），不再需要图标字体。
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "libs", "fonts");
fs.mkdirSync(dir, { recursive: true });

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: headers || {} }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        get(r.headers.location, headers).then(resolve, reject);
        return;
      }
      if (r.statusCode !== 200) {
        reject(new Error(r.statusCode + " " + url));
        return;
      }
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

(async () => {
  /* Google Fonts 要求浏览器 UA 才下发 woff2 切片 */
  const ua = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  let gcss = (await get(
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
    ua
  )).toString("utf8");
  const urls = [...gcss.matchAll(/url\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
  let i = 0;
  for (const u of urls) {
    const buf = await get(u);
    const name = "gf-" + (i++) + ".woff2";
    fs.writeFileSync(path.join(dir, name), buf);
    gcss = gcss.replace(u, name);
  }
  fs.writeFileSync(path.join(dir, "fonts.css"), gcss);
  console.log("webfonts", urls.length, "->", dir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
