#!/usr/bin/env node
/* ============================================================
 * 缓存版本号回写：node scripts/bump-versions.js
 * 对 index.html 引用的本地资产，按文件内容 SHA1 前 7 位回写 ?v=。
 * 内容没变的文件版本号保持不变（改哪个文件只有它自己的 ?v= 变）。
 * 建议在每次改动 css/js/libs 后运行（或让巡检/CI 自动跑）。
 * ============================================================ */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "index.html");

const ASSETS = [
  "libs/fonts/fonts.css",
  "css/style.css",
  "libs/echarts.min.js",
  "js/data.js",
  "js/metrics.js",
  "js/app-core.js",
  "js/app-charts.js",
  "js/app-picker.js",
  "js/app-tables.js",
  "js/app-init.js",
];

let html = fs.readFileSync(htmlPath, "utf8");
let changed = 0;
for (const rel of ASSETS) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) { console.error("  ✗ 缺文件，跳过: " + rel); continue; }
  const hash = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex").slice(0, 7);
  const escRel = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(" + escRel + ")\\?v=[0-9a-f]*");
  if (re.test(html)) {
    html = html.replace(re, (m, p1) => (m.endsWith("v=" + hash) ? m : p1 + "?v=" + hash));
  } else if (html.includes(rel)) {
    html = html.replace(new RegExp("(" + escRel + ")(?!\\?)"), "$1?v=" + hash);
  } else {
    console.error("  ✗ index.html 未引用: " + rel);
    continue;
  }
  changed++;
}
fs.writeFileSync(htmlPath, html);
console.log(`✅ 已回写 ${changed}/${ASSETS.length} 个资产的 ?v=（内容哈希）`);
