#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { updateFonts, get: fontGet } = require("../build/vendor-fonts");
const { stageSite } = require("../build/stage-site");
const { deployment, deploySite, resolveDeploymentToken } = require("../build/deploy-site");

async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-tools-test-"));
  const write = (rel, content) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  write("index.html", '<link rel="stylesheet" href="src/assets/fonts/fonts.css"><script src="js/extra.js"></script>');
  write("src/assets/fonts/fonts.css", '@font-face {src:url("gf-0.woff2")}');
  write("src/assets/fonts/gf-0.woff2", "wOF2old0");
  write("js/extra.js", '"use strict";');
  write("src/browser/extra.js", '"use strict";');
  fs.mkdirSync(path.join(root, "data/sources"), { recursive: true });
  write("vercel.json", '{"framework":null,"outputDirectory":"."}');
  write(".vercel/project.json", '{"projectId":"prj_fixture","orgId":"team_fixture","projectName":"fixture"}');
  try { await fn(root, write); }
  finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-tools-test-")) throw new Error("拒绝清理未知测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}
/* 构建替身：把工作区的入口与 js/css/libs 原样放进产物目录，代替 Vite（真实构建由浏览器测试覆盖）。 */
async function fakeBuild(outDir, root) {
  const copy = (rel) => {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) return;
    if (fs.statSync(from).isDirectory()) { for (const name of fs.readdirSync(from)) copy(path.join(rel, name)); return; }
    fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(outDir, rel));
  };
  for (const rel of ["index.html", "js", "css", "libs"]) copy(rel);
}
const stage = (root) => stageSite(root, { build: fakeBuild });
/* 递归快照：发布产物含子目录 */
const tree = (dir, base = dir) => Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? Object.entries(tree(full, base)) : [[path.relative(base, full).split(path.sep).join("/"), fs.readFileSync(full).toString("base64")]];
}));
const snapshot = (dir) => Object.fromEntries(fs.readdirSync(dir).sort().map((file) => [file, fs.readFileSync(path.join(dir, file)).toString("base64")]));
const fontCss = Buffer.from('a{src:url(https://fonts.gstatic.com/s/a)}b{src:url(https://fonts.gstatic.com/s/b)}');
const fetchFonts = async (url) => url.includes("googleapis") ? fontCss : Buffer.from("wOF2" + url);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

async function main() {
  await test("RSS、分享图与分厂商订阅随站发布，隐藏文件与白名单外的构建产物被拒绝", () => fixture(async (root, write) => {
    write("public/changes.xml", '<rss version="2.0"><channel><title>Changes</title></channel></rss>');
    write("public/img/og-card.png", "png"); write("public/img/.DS_Store", "x"); write("public/feeds/vendor.xml", "<rss/>");
    const site = await stage(root);
    for (const rel of ["changes.xml", "img/og-card.png", "feeds/vendor.xml", "vercel.json", "index.html", "js/extra.js"]) assert.ok(site.files.includes(rel), rel);
    assert.equal(site.files.includes("img/.DS_Store"), false);
    const before = tree(path.join(root, ".site-build"));
    const leaky = async (outDir, from) => { await fakeBuild(outDir, from); fs.writeFileSync(path.join(outDir, "private.xml"), "PRIVATE"); };
    await assert.rejects(stageSite(root, { build: leaky }), /白名单：private\.xml/);
    assert.deepEqual(tree(path.join(root, ".site-build")), before);
    assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
  }));
  await test("附带目录里经链接指向私有或隐藏位置的内容不得发布", () => fixture(async (root, write) => {
    for (const rel of [".private", "scripts", "public/img/.hidden"]) {
      write(rel + "/secret.txt", "PRIVATE_SECRET_MARKER");
      /* 目录 junction（Windows 无需特权）：附带目录只发布直属文件，链接目录整体跳过 */
      const junction = path.join(root, "public/img", "alias");
      fs.mkdirSync(path.dirname(junction), { recursive: true });
      fs.symlinkSync(path.join(root, rel), junction, process.platform === "win32" ? "junction" : "dir");
      try {
        const site = await stage(root);
        assert.equal(site.files.some((file) => file.includes("alias") || file.includes("secret")), false);
      } finally { fs.unlinkSync(junction); }
      /* 文件符号链接：真实路径不在白名单时拒绝。Windows 未开启开发者模式时不能创建，跳过这一半 */
      const link = path.join(root, "public/img", "secret.txt");
      try { fs.symlinkSync(path.join(root, rel, "secret.txt"), link, "file"); }
      catch (error) { if (error && error.code === "EPERM") continue; throw error; }
      try { await assert.rejects(stage(root), /白名单|隐藏目录/); }
      finally { fs.rmSync(link, { force: true }); }
    }
  }));
  await test("构建失败时保留完整旧产物并清理暂存目录", () => fixture(async (root) => {
    const previous = await stage(root);
    const before = tree(previous.directory);
    await assert.rejects(stageSite(root, { build: async () => { throw new Error("vite fixture failed"); } }), /vite fixture failed/);
    assert.deepEqual(tree(previous.directory), before);
    assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
  }));
  await test("生产入口直接加载 Vue 与 TypeScript ES 模块，构建不再使用经典脚本合并插件", async () => {
    const root = path.resolve(__dirname, "..", "..");
    const main = fs.readFileSync(path.join(root, "src/main.ts"), "utf8");
    const config = fs.readFileSync(path.join(root, "vite.config.mjs"), "utf8");
    assert.match(main, /create(?:SSR)?App/);
    assert.match(main, /App\.vue/);
    assert.doesNotMatch(main + config, /virtual:legacy|legacyApp/);
    const { build } = await import("esbuild");
    const result = await build({ entryPoints: [path.join(root, "src/application/runtime.ts")], bundle: true, platform: "node", format: "cjs", external: ["vue"], write: false, logLevel: "silent" });
    const code = result.outputFiles[0].text;
    assert.doesNotMatch(code, /virtual:legacy/);
    const module = { exports: {} };
    require("node:vm").runInNewContext(code, { require, module, exports: module.exports, console, window: { innerWidth: 1280 }, location: new URL("https://example.com/"), URLSearchParams, setTimeout, clearTimeout });
    const runtime = module.exports;
    assert.equal(typeof runtime.chooseMain, "function");
    assert.equal(typeof runtime.calculateWorkload, "function");
    assert.ok(runtime.PLANS.length > 200);
    assert.ok(runtime.PLANS.every(plan => typeof plan.id === "string"));
    assert.equal(runtime.pickerState.billing, "M");
    for (const name of ["badgeHtml", "priceCheckHtml", "watchButtonHtml", "maintenanceSources", "changeCardHtml", "planHistoryParts", "planHistoryHtml", "fillPlanHistory", "usageCoverageHtml", "mainCard"]) {
      assert.equal(name in runtime, false, name + " 只属于测试渲染边界");
    }
    assert.doesNotMatch(code, /scripts[\\/]tests[\\/]fixtures|Test-only classic HTML rendering boundary/);
  });
  await test("构建只读入公共源目录，经 junction 指向私有目录的模块和资源被拒绝", () => fixture(async (root, write) => {
    const { assertPublicSource, publicSourcesOnly } = await import("../build/vite-assets.mjs");
    write("audit/secret.js", "PRIVATE_SECRET_MARKER");
    assert.doesNotThrow(() => assertPublicSource(root, path.join(root, "src/browser/extra.js")));
    assert.throws(() => assertPublicSource(root, path.join(root, "audit/secret.js")), /公共目录以外/);
    const link = path.join(root, "src/assets", "alias");
    fs.symlinkSync(path.join(root, "audit"), link, process.platform === "win32" ? "junction" : "dir");
    try {
      const guard = publicSourcesOnly({ root });
      assert.throws(() => guard.load(path.join(link, "secret.js") + "?import"), /公共目录以外.*audit/);
      assert.equal(guard.load("\0vite-generated-module"), null);
      const bundle = { font: { type: "asset", originalFileNames: ["src/assets/alias/secret.js"] }, ok: { type: "asset", originalFileNames: ["src/assets/fonts/gf-0.woff2"] } };
      assert.throws(() => guard.generateBundle({}, bundle), /公共目录以外/);
      delete bundle.font;
      assert.doesNotThrow(() => guard.generateBundle({}, bundle));
    } finally { fs.unlinkSync(link); }
  }));
  await test("ECharts 精简包由 npm 包构建：经典脚本执行后登记全局 echarts，版本与依赖一致", async () => {
    const { bundleEcharts } = await import("../build/vite-assets.mjs");
    const root = path.resolve(__dirname, "..", "..");
    const code = (await bundleEcharts(root, "src/charts/echarts.ts")).toString("utf8");
    assert.doesNotMatch(code, /^\s*(?:import|export)\s/m, "必须是经典脚本，页面按 <script> 插入");
    const sandbox = { console, setTimeout, clearTimeout, navigator: { userAgent: "node" } };
    sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
    require("node:vm").runInNewContext(code, sandbox);
    assert.equal(sandbox.echarts.version, require("echarts/package.json").version);
    assert.equal(typeof sandbox.echarts.init, "function");
  });
  await test("开发经典脚本缓存跟随入口及间接依赖内容更新，失败生成可在修复后重试", () => fixture(async (root, write) => {
    const { createServer } = await import("vite");
    const { classicScripts } = await import("../build/vite-assets.mjs");
    write("src/domain/message.ts", 'export const message = "one";');
    write("src/browser/entry.ts", 'import { message } from "../domain/message"; globalThis.fixtureMessage = message;');
    const plugin = classicScripts({ root, generated: { "js/theme-init.js": "src/browser/entry.ts" } });
    const server = await createServer({ root, configFile: false, plugins: [plugin], server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
    try {
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== "string");
      const url = `http://127.0.0.1:${address.port}/js/theme-init.js`;
      const load = async () => {
        const response = await fetch(url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const sandbox = {};
        require("node:vm").runInNewContext(await response.text(), sandbox);
        return sandbox;
      };
      assert.equal((await load()).fixtureMessage, "one");
      /* 保留相同长度与 mtime，仍须依据依赖内容而不是时间戳失效。 */
      const dependency = path.join(root, "src/domain/message.ts"), stamp = fs.statSync(dependency);
      write("src/domain/message.ts", 'export const message = "two";');
      fs.utimesSync(dependency, stamp.atime, stamp.mtime);
      assert.equal((await load()).fixtureMessage, "two");
      write("src/browser/entry.ts", 'import { message } from "../domain/message"; globalThis.fixtureMessage = message + "!";');
      assert.equal((await load()).fixtureMessage, "two!");
      write("src/domain/message.ts", "export const message = ;");
      assert.equal((await fetch(url)).status, 500);
      write("src/domain/message.ts", 'export const message = "fixed";');
      assert.equal((await load()).fixtureMessage, "fixed!");
    } finally { await server.close(); }
  }));
  await test("public 开发 URL 保持分享图及 RSS 地址，阻止私有链接与源码目录 URL", () => fixture(async (root, write) => {
    const { createServer } = await import("vite");
    const { publicAssets } = await import("../build/vite-assets.mjs");
    write("public/img/og-card.png", "public image");
    write("public/changes.xml", "<rss/>");
    write("audit/secret.txt", "PRIVATE_SECRET_MARKER");
    const server = await createServer({ root, configFile: false, publicDir: false, plugins: [publicAssets({ root })], server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
    try {
      await server.listen();
      const address = server.httpServer.address();
      assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal(await (await fetch(base + "/img/og-card.png")).text(), "public image");
      assert.equal(await (await fetch(base + "/changes.xml")).text(), "<rss/>");
      assert.equal((await fetch(base + "/public/img/og-card.png")).status, 403);
      assert.equal((await fetch(base + "/audit/secret.txt")).status, 403);
      assert.equal((await fetch(base + "/@fs/" + path.join(root, "audit/secret.txt").split(path.sep).join("/"))).status, 403);
      const alias = path.join(root, "public/img/alias");
      fs.symlinkSync(path.join(root, "audit"), alias, process.platform === "win32" ? "junction" : "dir");
      try { assert.equal((await fetch(base + "/img/alias/secret.txt")).status, 403); }
      finally { fs.unlinkSync(alias); }
    } finally { await server.close(); }
  }));
  await test("生成中的依赖变化不会把旧字节登记为新缓存，watcher 延迟时也重新生成", async () => {
    const { classicScripts } = await import("../build/vite-assets.mjs");
    const { EventEmitter } = require("node:events");
    const crypto = require("node:crypto");
    for (const emitChange of [true, false]) await fixture(async (root, write) => {
      write("src/browser/pending.ts", "before");
      const dependency = path.join(root, "src/browser/pending.ts");
      let startedResolve = () => {}, resumeResolve = () => {}, builds = 0, middleware;
      const started = new Promise((resolve) => { startedResolve = () => resolve(undefined); });
      const resume = new Promise((resolve) => { resumeResolve = () => resolve(undefined); });
      /* 可控构建屏障：先捕获实际输入，再由测试保存新内容，不依赖计时或文件监听到达顺序。 */
      const bundle = async () => {
        const bytes = fs.readFileSync(dependency);
        const digest = crypto.createHash("sha256").update(dependency).update(bytes).digest("hex");
        if (++builds === 1) { startedResolve(); await resume; }
        return { bytes, dependencies: [dependency], digest };
      };
      const watcher = Object.assign(new EventEmitter(), { add() {} });
      const plugin = classicScripts({ root, generated: { "js/pending.js": "src/browser/pending.ts" }, bundle });
      plugin.configureServer({ watcher, ws: { send() {} }, middlewares: { use(handler) { middleware = handler; } } });
      const request = () => new Promise((resolve, reject) => middleware({ url: "/js/pending.js" }, { setHeader() {}, end(bytes) { resolve(bytes.toString()); } }, reject));
      const result = request();
      await started;
      write("src/browser/pending.ts", "after");
      if (emitChange) watcher.emit("change", dependency);
      resumeResolve();
      assert.equal(await result, "after");
      assert.equal(await request(), "after");
      assert.equal(builds, 2, "必须丢弃生成期间过期的结果，稳定后复用缓存");
    });
  });
  await test("审计输入确定性生成类型化目录，保留永久 ID、正则、共享字段与评测摘要，顶层函数参数须写明类型", () => fixture(async (root, write) => {
    const { catalogSource, writeCatalog, CATALOG_FILE } = await import("../build/catalog-types.mjs");
    write("data/sources/data.js", 'const RATE_USD_CNY = 6.71;\n/** @type {Plan[]} */\nconst PLANS = [{id:"stable-id",plan:"fixture",quota:"shared"}];\n/** @type {ModelRole[]} */\nconst MODEL_ROLES = [{re:/glm-5/i}];\n/** @type {PriceChecks} */\nconst PRICE_CHECKS = {checkedAt:"2026-10-10",sources:{},rows:{}};\n/** @param {Plan} p @param {PlanTextField} key @param {Set<Plan>} [seen] @returns {string} */\nfunction resolvedField(p,key,seen) { return p[key]; }');
    write("data/sources/benchmark-summary.js", '/** @type {BenchmarkSummary} */\nconst BENCHMARK_SUMMARY = {schemaVersion:1,checkedAt:"2026-10-10",protocols:[]};');
    write("data/sources/project-data.js", 'const PUBLIC_PROJECT = Object.freeze({siteUrl:"https://example.com/"});');
    const source = catalogSource(root);
    assert.equal(source, catalogSource(root));
    assert.match(source, /PLANS: Plan\[\]/);
    assert.match(source, /BENCHMARK_SUMMARY: BenchmarkSummary/);
    assert.match(source, /MODEL_ROLES: ModelRole\[\]/);
    assert.match(source, /PRICE_CHECKS: PriceChecks/);
    assert.match(source, /function resolvedField\(p: Plan, key: PlanTextField, seen\?: Set<Plan>\): string/);
    assert.match(source, /export \{ RATE_USD_CNY, PLANS, MODEL_ROLES, PRICE_CHECKS, resolvedField, BENCHMARK_SUMMARY, PUBLIC_PROJECT \};/);
    const ts = require("typescript");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    require("node:vm").runInNewContext(code, { module, exports: module.exports });
    assert.equal(module.exports.PLANS[0].id, "stable-id");
    assert.ok(module.exports.MODEL_ROLES[0].re.test("GLM-5"));
    assert.equal(module.exports.resolvedField(module.exports.PLANS[0], "quota"), "shared");
    assert.equal(writeCatalog(root).changed, true);
    assert.equal(writeCatalog(root).changed, false);
    assert.equal(writeCatalog(root, { check: true }).changed, false);
    const file = path.join(root, CATALOG_FILE), before = fs.readFileSync(file, "utf8");
    write("data/sources/project-data.js", 'const PUBLIC_PROJECT = Object.freeze({siteUrl:"https://changed.example.com/"});');
    assert.throws(() => writeCatalog(root, { check: true }), /已过期/);
    assert.equal(fs.readFileSync(file, "utf8"), before, "检查模式不改仓库");
    write("data/sources/project-data.js", "const PLANS = [];");
    assert.throws(() => catalogSource(root), /PLANS.*重复声明/);
    write("data/sources/project-data.js", 'const PUBLIC_PROJECT = Object.freeze({siteUrl:"https://example.com/"});');
    write("data/sources/data.js", "const PLANS = []; function untyped(p) { return p; }");
    assert.throws(() => catalogSource(root), /data\/sources\/data\.js:1 函数 untyped 的参数 p 缺少 JSDoc 类型/);
    const real = path.resolve(__dirname, "..", "..");
    assert.equal(fs.readFileSync(path.join(real, CATALOG_FILE), "utf8"), catalogSource(real));
  }));
  await test("Vue SSR 首屏包含可读推荐、价格表与免费入口，并保留模块入口供浏览器接管", async () => {
    const root = path.resolve(__dirname, "..", "..");
    const { prerenderIndex } = require("../build/prerender");
    const html = await prerenderIndex(fs.readFileSync(path.join(root, "index.html"), "utf8"));
    assert.match(html, /class="quick-card"/);
    assert.match(html, /class="qc-plan"/);
    assert.match(html, /id="tableBody"[^>]*>[\s\S]*?<tr/);
    assert.match(html, /id="freeGrid"[^>]*>[\s\S]*?free-card/);
    assert.match(html, /type="module"[^>]*src="(?:\.?\/)?src\/main\.ts"/);
    assert.doesNotMatch(html, /virtual:legacy|src="js\/app-(?:core|picker|tables|init)\.js"/);
  });
  await test("目录生成不经公共路径链接读入私有审计内容", () => fixture(async (root, write) => {
    const { catalogSource } = await import("../build/catalog-types.mjs");
    write("audit/private/data.js", "const PRIVATE_SECRET_MARKER = 'must-not-publish';");
    const input = path.join(root, "data/sources"), backup = path.join(root, "data/sources-original");
    fs.renameSync(input, backup);
    fs.symlinkSync(path.join(root, "audit/private"), input, process.platform === "win32" ? "junction" : "dir");
    try { assert.throws(() => catalogSource(root), /公共目录以外.*audit/); }
    finally { fs.unlinkSync(input); fs.renameSync(backup, input); }
  }));
  await test("开发目录插件加载时不写源码，已登记输入热更新后重建类型目录", () => fixture(async (root, write) => {
    const { watchCatalog, writeCatalog, CATALOG_FILE } = await import("../build/catalog-types.mjs");
    write("data/sources/data.js", "const PLANS = [];");
    write("data/sources/benchmark-summary.js", "const BENCHMARK_SUMMARY = {};");
    write("data/sources/project-data.js", 'const PUBLIC_PROJECT = {siteUrl:"https://before.example.com/"};');
    const plugin = watchCatalog({ root });
    const generated = path.join(root, CATALOG_FILE);
    assert.equal(fs.existsSync(generated), false, "创建开发配置不应生成或改写已提交文件");
    writeCatalog(root);
    const before = fs.readFileSync(generated, "utf8");
    write("data/sources/project-data.js", 'const PUBLIC_PROJECT = {siteUrl:"https://after.example.com/"};');
    plugin.hotUpdate({ file: path.join(root, "src/App.vue") });
    assert.equal(fs.readFileSync(generated, "utf8"), before, "其他源文件不能触发目录重建");
    plugin.hotUpdate({ file: path.join(root, "data/sources/project-data.js") });
    assert.match(fs.readFileSync(generated, "utf8"), /https:\/\/after\.example\.com\//);
    assert.equal(writeCatalog(root, { check: true }).changed, false);
  }));
  await test("字体第二个下载失败保留整组旧字体与 CSS", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts"), before = snapshot(dir);
    await assert.rejects(updateFonts({ dir, fetcher: async (url) => { if (url.endsWith("/b")) throw new Error("503 fixture"); return fetchFonts(url); } }), /503/);
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)), ["fonts"]);
  }));
  await test("字体成功整组替换、清理旧子集，并使用内容哈希名称", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts");
    const result = await updateFonts({ dir, fetcher: fetchFonts });
    assert.equal(result.count, 2);
    const files = fs.readdirSync(dir);
    assert.equal(files.includes("gf-0.woff2"), false);
    assert.equal(files.filter((file) => /^gf-[a-f0-9]{64}\.woff2$/.test(file)).length, 2);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "fonts.css"), "utf8"), /https:/);
  }));
  await test("不同字体URL返回同一字节时只保存一份内容哈希资产", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts");
    const result = await updateFonts({ dir, fetcher: async (url) => url.includes("googleapis") ? fontCss : Buffer.from("wOF2same-font") });
    assert.equal(result.count, 1);
    assert.equal(result.sources, 2);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".woff2"));
    assert.equal(files.length, 1);
    const refs = [...fs.readFileSync(path.join(dir, "fonts.css"), "utf8").matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
    assert.deepEqual(refs, [files[0], files[0]]);
  }));
  await test("字体 CSS 只接受 fonts.gstatic.com 的 HTTPS 字体，外部主机/HTTP/@import 在下载前拒绝", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts"), before = snapshot(dir);
    for (const css of ["a{src:url(https://evil.example/a.woff2)}", 'a{src:url("http://fonts.gstatic.com/s/a")}', "a{src:url('https://fonts.gstatic.com.evil.example/a')}",
      "a{src:url(https://user@fonts.gstatic.com/s/a)}", "a{src:url(https://fonts.gstatic.com:8443/s/a)}", "a{src:url(/local/a.woff2)}",
      "@import url(https://fonts.gstatic.com/s/x.css);a{src:url(https://fonts.gstatic.com/s/a)}", "a{src:url(https://fonts.gstatic.com/s/a)}b{src:url(https://fonts.googleapis.com/s/b)}"]) {
      const requested = [];
      await assert.rejects(updateFonts({ dir, fetcher: async (url) => { requested.push(url); return url.includes("googleapis.com/css2") ? Buffer.from(css) : Buffer.from("wOF2font"); } }), /fonts\.gstatic\.com|@import/, css);
      assert.deepEqual(requested.filter((url) => !url.includes("googleapis.com/css2")), [], "拒绝前不得下载任何字体：" + css);
    }
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)), ["fonts"]);
    const quoted = await updateFonts({ dir, fetcher: async (url) => url.includes("googleapis.com/css2") ? Buffer.from('a{src:url("https://fonts.gstatic.com/s/a")}') : Buffer.from("wOF2quoted") });
    assert.equal(quoted.count, 1);
    assert.match(fs.readFileSync(path.join(dir, "fonts.css"), "utf8"), /url\("gf-[a-f0-9]{64}\.woff2"\)/);
    for (const url of ["https://evil.example/font.woff2", "http://fonts.gstatic.com/s/a", "https://fonts.gstatic.com.evil.example/s/a"]) await assert.rejects(fontGet(url), /Google Fonts/, url);
  }));
  await test("字体 CSS 为空或响应非 WOFF2 拒绝替换旧目录", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts"), before = snapshot(dir);
    await assert.rejects(updateFonts({ dir, fetcher: async () => Buffer.from("no fonts") }), /不含字体/);
    await assert.rejects(updateFonts({ dir, fetcher: async (url) => url.includes("googleapis") ? fontCss : Buffer.from("not a font") }), /不是 WOFF2/);
    assert.deepEqual(snapshot(dir), before);
  }));
  await test("字体目录切换失败回滚，不留半组新文件", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts"), before = snapshot(dir);
    let calls = 0;
    await assert.rejects(updateFonts({ dir, fetcher: fetchFonts, rename: (from, to) => { if (++calls === 2) throw new Error("swap fixture"); fs.renameSync(from, to); } }), /swap/);
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)), ["fonts"]);
  }));
  await test("字体切换和回滚均失败时保留完整旧备份并报告可恢复路径", () => fixture(async (root) => {
    const dir = path.join(root, "src/assets/fonts"), parent = path.dirname(dir), before = snapshot(dir);
    const swapError = new Error("font swap fixture"), restoreError = new Error("font restore fixture");
    let calls = 0;
    await assert.rejects(updateFonts({ dir, fetcher: fetchFonts, rename: (from, to) => {
      calls++;
      if (calls === 2) throw swapError;
      if (calls === 3) throw restoreError;
      fs.renameSync(from, to);
    } }), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [swapError, restoreError]);
      const backups = fs.readdirSync(parent).filter((name) => name.startsWith(".fonts-backup-"));
      assert.equal(backups.length, 1);
      assert.ok(error.message.includes(path.join(parent, backups[0])));
      return true;
    });
    assert.equal(calls, 3);
    assert.equal(fs.existsSync(dir), false);
    const entries = fs.readdirSync(parent);
    assert.equal(entries.length, 1);
    const backup = path.join(parent, entries[0]);
    assert.deepEqual(snapshot(backup), before);
    fs.renameSync(backup, dir);
    assert.deepEqual(snapshot(dir), before);
  }));
  await test("staging复制失败或目录切换失败保留完整旧产物，清理暂存后可重试", async () => {
    for (const failure of ["copy", "swap"]) await fixture(async (root, write) => {
      const previous = await stage(root);
      const before = new Map(previous.files.map((file) => [file, fs.readFileSync(path.join(previous.directory, file))]));
      write("js/new.js", "new fixture asset");
      write("index.html", fs.readFileSync(path.join(root, "index.html"), "utf8") + '<script src="js/new.js"></script>');
      const originalCopy = fs.copyFileSync, originalRename = fs.renameSync;
      let calls = 0;
      try {
        if (failure === "copy") fs.copyFileSync = () => { calls++; throw new Error("copy fixture"); };
        else fs.renameSync = (from, to) => { if (++calls === 2) throw new Error("swap fixture"); originalRename(from, to); };
        await assert.rejects(stage(root), failure === "copy" ? /copy fixture/ : /swap fixture/);
      } finally { fs.copyFileSync = originalCopy; fs.renameSync = originalRename; }
      assert.equal(calls, failure === "copy" ? 1 : 3);
      for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
      assert.equal(fs.existsSync(path.join(previous.directory, "js/new.js")), false);
      assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
      const retry = await stage(root);
      assert.equal(fs.readFileSync(path.join(retry.directory, "js/new.js"), "utf8"), "new fixture asset");
      assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
    });
  });
  await test("网站切换和回滚均失败时保留完整旧产物备份且可手动恢复", () => fixture(async (root) => {
    const previous = await stage(root);
    const before = new Map(previous.files.map((file) => [file, fs.readFileSync(path.join(previous.directory, file))]));
    const originalRename = fs.renameSync;
    const swapError = new Error("site swap fixture"), restoreError = new Error("site restore fixture");
    let calls = 0;
    try {
      fs.renameSync = (from, to) => {
        calls++;
        if (calls === 2) throw swapError;
        if (calls === 3) throw restoreError;
        originalRename(from, to);
      };
      await assert.rejects(stage(root), (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [swapError, restoreError]);
        const backups = fs.readdirSync(root).filter((name) => name.startsWith(".site-backup-"));
        assert.equal(backups.length, 1);
        assert.ok(error.message.includes(path.join(root, backups[0])));
        return true;
      });
    } finally { fs.renameSync = originalRename; }
    assert.equal(calls, 3);
    assert.equal(fs.existsSync(previous.directory), false);
    const leftovers = fs.readdirSync(root).filter((name) => /^\.site-(stage|backup)-/.test(name));
    assert.equal(leftovers.length, 1);
    const backup = path.join(root, leftovers[0]);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(backup, file)), bytes);
    fs.renameSync(backup, previous.directory);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
  }));
  await test("网站目录短暂 EPERM/EBUSY/EACCES 占用均在第五次改名成功，完整提交并清理备份", async () => {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) await fixture(async (root, write) => {
      const previous = await stage(root);
      write("js/extra.js", '"use strict"; /* retry success */');
      const originalRename = fs.renameSync;
      const busy = Object.assign(new Error("temporary rename fixture"), { code });
      let attempts = 0, backupMoves = 0, restores = 0;
      try {
        fs.renameSync = (from, to) => {
          const name = path.basename(String(from));
          if (name.startsWith(".site-stage-") && ++attempts < 5) throw busy;
          if (name === ".site-build") backupMoves++;
          if (name.startsWith(".site-backup-")) restores++;
          originalRename(from, to);
        };
        const result = await stage(root);
        assert.equal(result.directory, previous.directory);
      } finally { fs.renameSync = originalRename; }
      assert.equal(attempts, 5, code + " 应在有界重试的最后一次成功");
      assert.equal(backupMoves, 1);
      assert.equal(restores, 0, "提交成功不应执行回滚");
      assert.match(fs.readFileSync(path.join(previous.directory, "js/extra.js"), "utf8"), /retry success/);
      assert.equal(fs.readdirSync(root).some(name => /^\.site-(stage|backup)-/.test(name)), false);
    });
  });
  await test("目录切换与回滚临时错误均耗尽五次重试后保留唯一完整旧备份", () => fixture(async (root) => {
    const previous = await stage(root);
    const before = new Map(previous.files.map(file => [file, fs.readFileSync(path.join(previous.directory, file))]));
    const originalRename = fs.renameSync;
    const swapError = Object.assign(new Error("swap retries exhausted"), { code: "EACCES" });
    const restoreError = Object.assign(new Error("restore retries exhausted"), { code: "EBUSY" });
    let swapAttempts = 0, restoreAttempts = 0;
    try {
      fs.renameSync = (from, to) => {
        if (path.basename(String(from)).startsWith(".site-stage-")) { swapAttempts++; throw swapError; }
        if (path.basename(String(from)).startsWith(".site-backup-")) { restoreAttempts++; throw restoreError; }
        originalRename(from, to);
      };
      await assert.rejects(stage(root), error => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [swapError, restoreError]);
        const backup = fs.readdirSync(root).find(name => name.startsWith(".site-backup-"));
        assert.ok(backup && error.message.includes(path.join(root, backup)));
        return true;
      });
    } finally { fs.renameSync = originalRename; }
    assert.equal(swapAttempts, 5);
    assert.equal(restoreAttempts, 5);
    assert.equal(fs.existsSync(previous.directory), false);
    const leftovers = fs.readdirSync(root).filter(name => /^\.site-(stage|backup)-/.test(name));
    assert.equal(leftovers.length, 1);
    const backup = path.join(root, leftovers[0]);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(backup, file)), bytes);
    fs.renameSync(backup, previous.directory);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
  }));
  await test("非临时 ENOENT 原错误不重试，回滚短暂占用恢复后完整保留旧产物", () => fixture(async (root) => {
    const previous = await stage(root);
    const before = new Map(previous.files.map(file => [file, fs.readFileSync(path.join(previous.directory, file))]));
    const originalRename = fs.renameSync;
    const missing = Object.assign(new Error("non-retryable fixture"), { code: "ENOENT" });
    const busy = Object.assign(new Error("rollback temporary fixture"), { code: "EPERM" });
    let swapAttempts = 0, restoreAttempts = 0;
    try {
      fs.renameSync = (from, to) => {
        if (path.basename(String(from)).startsWith(".site-stage-")) { swapAttempts++; throw missing; }
        if (path.basename(String(from)).startsWith(".site-backup-") && ++restoreAttempts < 3) throw busy;
        originalRename(from, to);
      };
      await assert.rejects(stage(root), error => error === missing);
    } finally { fs.renameSync = originalRename; }
    assert.equal(swapAttempts, 1, "ENOENT 不能被当作暂时占用重试");
    assert.equal(restoreAttempts, 3);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
    assert.equal(fs.readdirSync(root).some(name => /^\.site-(stage|backup)-/.test(name)), false);
  }));
  await test("部署轮询收到ERROR或CANCELED立即失败，不继续等待", () => fixture(async (root) => {
    for (const state of ["ERROR", "CANCELED"]) {
      const urls = [], waits = [];
      await assert.rejects(deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async (ms, value) => { waits.push(ms); return value; },
        fetcher: async (url, init) => {
          urls.push([String(url), init?.method || "GET"]);
          return new Response(JSON.stringify({ id: "dpl_terminal", readyState: urls.length === 1 ? "BUILDING" : state,
            ...(state === "ERROR" ? { errorMessage: "build fixture failed" } : {}) }));
        } }), state === "ERROR" ? /部署未成功：build fixture failed/ : /部署未成功：CANCELED/);
      assert.deepEqual(urls, [["https://api.vercel.com/v13/deployments?teamId=team_fixture", "POST"],
        ["https://api.vercel.com/v13/deployments/dpl_terminal?teamId=team_fixture", "GET"]]);
      assert.deepEqual(waits, [2000]);
    }
  }));
  await test("部署创建与状态查询的HTTP失败传播服务端错误，不报告READY", () => fixture(async (root) => {
    for (const failedRequest of [1, 2]) {
      let requests = 0, waits = 0;
      await assert.rejects(deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async (_ms, value) => { waits++; return value; },
        fetcher: async () => {
          requests++;
          return requests === failedRequest ? new Response(JSON.stringify({ error: { message: "permission fixture denied" } }), { status: 403 }) :
            new Response(JSON.stringify({ id: "dpl_http", readyState: "BUILDING" }));
        } }), /Vercel 403：permission fixture denied/);
      assert.equal(requests, failedRequest);
      assert.equal(waits, failedRequest - 1);
    }
  }));
  await test("部署网络超时拒绝会向调用方失败，且不会启动轮询", () => fixture(async (root) => {
    let requests = 0, waits = 0;
    const timeout = new Error("timeout fixture"); timeout.name = "TimeoutError";
    await assert.rejects(deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async (_ms, value) => { waits++; return value; }, fetcher: async (_url, init) => {
      requests++;
      assert.ok(init.signal instanceof AbortSignal);
      throw timeout;
    } }), (error) => error === timeout);
    assert.equal(requests, 1); assert.equal(waits, 0);
  }));
  await test("部署到最后一次轮询仍BUILDING才超时，并保留部署ID供后续检查", () => fixture(async (root) => {
    let requests = 0, waits = 0;
    await assert.rejects(deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async (ms, value) => { assert.equal(ms, 2000); waits++; return value; },
      fetcher: async () => { requests++; return new Response(JSON.stringify({ id: "dpl_pending", readyState: "BUILDING" })); }
    }), /部署尚未 READY.*dpl_pending/);
    assert.equal(requests, 121); assert.equal(waits, 120);
  }));
  await test("最后一次状态查询的READY、ERROR、CANCELED仍须处理，不误报轮询超时", () => fixture(async (root) => {
    for (const state of ["READY", "ERROR", "CANCELED"]) {
      let requests = 0, waits = 0;
      const result = deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async (_ms, value) => { waits++; return value; }, fetcher: async () => {
        requests++;
        return new Response(JSON.stringify({ id: "dpl_last", readyState: requests === 121 ? state : "BUILDING", url: "last.vercel.app",
          ...(state === "ERROR" ? { errorMessage: "final build fixture failed" } : {}) }));
      } });
      if (state === "READY") {
        const ready = await result;
        assert.equal(ready.readyState, "READY"); assert.equal(ready.url, "last.vercel.app");
      } else await assert.rejects(result, state === "ERROR" ? /部署未成功：final build fixture failed/ : /部署未成功：CANCELED/);
      assert.equal(requests, 121); assert.equal(waits, 120);
    }
  }));
  await test("staging与部署清单只包含公共资产，不复用旧output或工具源码", () => fixture(async (root, write) => {
    write(".vercel/output/static/old-secret.js", "old"); write("scripts/private.js", "private");
    const site = await stage(root);
    assert.ok(site.files.includes("index.html") && site.files.includes("vercel.json"));
    assert.ok(site.files.every((file) => !file.startsWith("scripts") && !file.startsWith(".vercel")));
    const job = await deployment(root, ["--prod"], { build: fakeBuild });
    assert.equal(job.body.project, "prj_fixture");
    assert.equal(job.body.target, "production");
    assert.equal(job.body.files.some((file) => file.file.includes("old-secret")), false);
    let requests = 0;
    const dry = await deploySite(root, ["--dry-run"], { build: fakeBuild, fetcher: async () => { requests++; throw new Error("不得请求网络"); } });
    assert.equal(dry.dryRun, true); assert.equal(requests, 0);
    const urls = [];
    const ready = await deploySite(root, [], { build: fakeBuild, token: "mock-token", wait: async () => undefined,
      fetcher: async (url) => { urls.push(String(url)); return new Response(JSON.stringify(urls.length === 1 ? { id: "dpl_mock", readyState: "BUILDING" } : { id: "dpl_mock", readyState: "READY", url: "mock.vercel.app" })); } });
    assert.equal(ready.readyState, "READY"); assert.equal(urls.length, 2);
  }));
  await test("新克隆无项目关联也能dry-run，token不能代替项目ID", () => fixture(async (root) => {
    fs.unlinkSync(path.join(root, ".vercel/project.json"));
    const dry = await deploySite(root, ["--dry-run"], { build: fakeBuild, fetcher: async () => { throw new Error("不得联网"); } });
    assert.equal(dry.dryRun, true);
    assert.ok(dry.files.includes("index.html"));
    await assert.rejects(deploySite(root, ["--prod"], { build: fakeBuild, token:"fixture-token" }), /projectId\/orgId/);
    await assert.rejects(deploySite(root, ["--dry-run", "--bad"]), /用法/);
  }));
  await test("认证优先级 env/options/已知CLI auth，缺失或非法文件不扫描其他凭据", () => fixture(async (root, write) => {
    const appData = path.join(root, "roaming");
    const auth = "roaming/com.vercel.cli/Data/auth.json";
    write(auth, '{"token":"cli-fixture"}');
    assert.equal(resolveDeploymentToken({ token: "option-fixture" }, { APPDATA: appData, VERCEL_TOKEN: "env-fixture" }), "env-fixture");
    assert.equal(resolveDeploymentToken({ token: "option-fixture" }, { APPDATA: appData }), "option-fixture");
    assert.equal(resolveDeploymentToken({}, { APPDATA: appData }), "cli-fixture");
    write(auth, "malformed auth json");
    assert.equal(resolveDeploymentToken({}, { APPDATA: appData }), undefined);
    fs.unlinkSync(path.join(root, auth));
    write("roaming/com.vercel.cli/auth.json", '{"token":"must-not-read"}');
    assert.equal(resolveDeploymentToken({}, { APPDATA: appData }), undefined);
    assert.equal(resolveDeploymentToken({}, {}), undefined);
  }));
  await test("dry-run不读取认证，CLI回退仅用于授权头且响应/错误不会泄漏token", () => fixture(async (root, write) => {
    const token = "private-mock-credential";
    const auth = path.join(root, "roaming/com.vercel.cli/Data/auth.json");
    write("roaming/com.vercel.cli/Data/auth.json", JSON.stringify({ token }));
    const previousAppData = process.env.APPDATA, previousToken = process.env.VERCEL_TOKEN;
    const originalRead = fs.readFileSync;
    let authReads = 0;
    try {
      process.env.APPDATA = path.join(root, "roaming");
      delete process.env.VERCEL_TOKEN;
      fs.readFileSync = /** @type {typeof fs.readFileSync} */ ((file, options) => {
        if (String(file) === auth) authReads++;
        return originalRead(file, options);
      });
      await deploySite(root, ["--dry-run"], { build: fakeBuild, fetcher: async () => { throw new Error("不得请求网络"); } });
      assert.equal(authReads, 0);
      for (const failure of ["http", "terminal", "transport"]) {
        await assert.rejects(deploySite(root, [], { build: fakeBuild, fetcher: async (_url, init) => {
          assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + token);
          assert.equal(String(init.body || "").includes(token), false);
          if (failure === "transport") throw new Error("network fixture " + token);
          return new Response(JSON.stringify(failure === "http" ? { error: { message: "denied " + token } } :
            { id: "dpl_secret", readyState: "ERROR", errorMessage: "failed " + token }), { status: failure === "http" ? 403 : 200 });
        } }), (error) => error instanceof Error && error.message.includes("[redacted]") && !String(error.stack).includes(token));
      }
      const ready = await deploySite(root, [], { build: fakeBuild, fetcher: async () => new Response(JSON.stringify({ id: "dpl_safe", readyState: "READY",
        url: "mock.vercel.app", errorMessage: token })) });
      assert.equal(JSON.stringify(ready).includes(token), false);
      assert.equal(authReads, 4);
    } finally {
      fs.readFileSync = originalRead;
      if (previousAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = previousAppData;
      if (previousToken === undefined) delete process.env.VERCEL_TOKEN; else process.env.VERCEL_TOKEN = previousToken;
    }
  }));
  console.log("工具回归：" + passed + " 通过");
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
