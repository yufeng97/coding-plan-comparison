#!/usr/bin/env node
"use strict";
/* 生成社交分享预览图 og-image.png（1200×630）：用 Playwright 的 Chromium 渲染一张静态卡片。
 * 卡片只写站点定位，不写会随数据变化的数字，改版时再重新生成并运行 npm run bump。
 * 本机 Chromium 不在默认位置时，用 CHROMIUM_PATH 指定可执行文件。 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..", "..");
const output = path.join(root, "og-image.png");

const page = (fontsHref) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="${fontsHref}">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { box-sizing: border-box; padding: 72px 80px; background: #fbfbf8; color: #10110f; font-family: Manrope, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 30px; font-weight: 700; }
  .mark { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 14px; background: #b9ff00; font: 700 28px "IBM Plex Mono", monospace; }
  h1 { margin: 0; font-size: 76px; line-height: 1.12; letter-spacing: -1px; }
  .lead { margin: 22px 0 0; font-size: 34px; line-height: 1.45; color: #3a3d38; }
  .chips { display: flex; gap: 14px; flex-wrap: wrap; }
  .chip { padding: 12px 22px; border: 2px solid #d9dbd3; border-radius: 999px; font-size: 26px; color: #2d302b; background: #fff; }
  .chip.on { background: #2f5f53; border-color: #2f5f53; color: #fff; }
</style></head><body>
  <div class="brand"><span class="mark">&lt;/&gt;</span>Coding Plan 比价中心</div>
  <div><h1>AI 编程订阅怎么买最划算</h1><p class="lead">国内外 Coding Plan 的价格、额度与公开评测，逐条核价，按预算、工具和真实用量挑选。</p></div>
  <div class="chips"><span class="chip on">帮我选</span><span class="chip">满额折算成本</span><span class="chip">模型评测</span><span class="chip">用量核对</span></div>
</body></html>`;

async function renderOgImage(file = output) {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const tab = await context.newPage();
    /* 从临时文件打开，file:// 页面才能加载本地字体样式（about:blank 不行）。 */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-og-"));
    let png;
    try {
      const html = path.join(dir, "og.html");
      fs.writeFileSync(html, page(pathToFileURL(path.join(root, "libs/fonts/fonts.css")).href));
      await tab.goto(pathToFileURL(html).href, { waitUntil: "load" });
      await tab.evaluate(() => document.fonts.ready);
      png = await tab.screenshot({ type: "png" });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    const temp = file + ".tmp-" + process.pid;
    fs.writeFileSync(temp, png);
    fs.renameSync(temp, file);
    return { file, bytes: png.length };
  } finally { await browser.close(); }
}

if (require.main === module) {
  renderOgImage().then(({ file, bytes }) => console.log(`✅ 已生成 ${path.relative(root, file)}（${bytes} 字节）；运行 npm run bump 更新缓存版本`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { renderOgImage };
