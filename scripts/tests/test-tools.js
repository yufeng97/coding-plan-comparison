#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAssetPlan, writeAssetPlan } = require("../lib/public-assets");
const { updateFonts } = require("../build/vendor-fonts");
const { stageSite } = require("../build/stage-site");
const { deployment, deploySite, resolveDeploymentToken } = require("../build/deploy-site");
const { main: bump } = require("../build/bump-versions");

async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-tools-test-"));
  const write = (rel, content) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  write("index.html", '<link rel="stylesheet" href="libs/fonts/fonts.css"><script src="js/extra.js"></script>');
  write("libs/fonts/fonts.css", '@font-face {src:url("gf-0.woff2")}');
  write("libs/fonts/gf-0.woff2", "wOF2old0");
  write("js/extra.js", '"use strict";');
  write("vercel.json", '{"framework":null,"outputDirectory":"."}');
  write(".vercel/project.json", '{"projectId":"prj_fixture","orgId":"team_fixture","projectName":"fixture"}');
  try { await fn(root, write); }
  finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-tools-test-")) throw new Error("拒绝清理未知测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const snapshot = (dir) => Object.fromEntries(fs.readdirSync(dir).sort().map((file) => [file, fs.readFileSync(path.join(dir, file)).toString("base64")]));
const fontCss = Buffer.from('a{src:url(https://fonts.test/a)}b{src:url(https://fonts.test/b)}');
const fetchFonts = async (url) => url.includes("googleapis") ? fontCss : Buffer.from("wOF2" + url);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

async function main() {
  await test("RSS 进入部署且其他根目录文件仍被拒绝", () => fixture((root, write) => {
    write("changes.xml", '<rss version="2.0"><channel><title>Changes</title></channel></rss>');
    write("index.html", '<link rel="alternate" type="application/rss+xml" href="changes.xml">');
    const plan = createAssetPlan(root);
    assert.equal(plan.assets.size, 2);
    writeAssetPlan(plan);
    stageSite(root);
    assert.deepEqual(fs.readFileSync(path.join(root, ".site-build/changes.xml")), fs.readFileSync(path.join(root, "changes.xml")));
    write("private.xml", "PRIVATE");
    write("index.html", '<link href="private.xml">');
    assert.throws(() => createAssetPlan(root), /白名单/);
  }));
  await test("--check 缓存过期失败且完全只读，更新后可通过", () => fixture((root) => {
    const beforeHtml = fs.readFileSync(path.join(root, "index.html"));
    const beforeCss = fs.readFileSync(path.join(root, "libs/fonts/fonts.css"));
    assert.throws(() => bump(["--check"], root), /过期/);
    assert.deepEqual(fs.readFileSync(path.join(root, "index.html")), beforeHtml);
    assert.deepEqual(fs.readFileSync(path.join(root, "libs/fonts/fonts.css")), beforeCss);
    writeAssetPlan(createAssetPlan(root));
    assert.doesNotThrow(() => bump(["--check"], root));
  }));
  await test("自动发现新增 HTML 资产及 CSS 字体依赖，重复执行幂等", () => fixture((root, write) => {
    let plan = createAssetPlan(root);
    assert.equal(plan.assets.size, 4);
    writeAssetPlan(plan);
    assert.match(fs.readFileSync(path.join(root, "libs/fonts/fonts.css"), "utf8"), /gf-0\.woff2\?v=[a-f0-9]{7}/);
    assert.equal(createAssetPlan(root).changes.length, 0);
    write("libs/fonts/gf-0.woff2", "wOF2updated");
    plan = createAssetPlan(root);
    assert.deepEqual(plan.changes.map(([file]) => path.basename(file)).sort(), ["fonts.css", "index.html"]);
  }));
  await test("缺文件/越界/编码/私有路径失败前不改任何原文件", () => fixture((root, write) => {
    const css = fs.readFileSync(path.join(root, "libs/fonts/fonts.css"));
    for (const resource of ["js/missing.js", "../outside.js", "%2e%2e/outside.js", "file:///secret", "js/%00bad", "scripts/private.js"]) {
      write("scripts/private.js", "private");
      write("index.html", '<script src="' + resource + '"></script>');
      const before = fs.readFileSync(path.join(root, "index.html"));
      assert.throws(() => createAssetPlan(root));
      assert.deepEqual(fs.readFileSync(path.join(root, "index.html")), before);
      assert.deepEqual(fs.readFileSync(path.join(root, "libs/fonts/fonts.css")), css);
    }
  }));
  await test("中途替换失败回滚 HTML 与 CSS，清理暂存目录", () => fixture((root) => {
    const plan = createAssetPlan(root);
    const before = new Map(plan.changes.map(([file]) => [file, fs.readFileSync(file)]));
    let calls = 0;
    assert.throws(() => writeAssetPlan(plan, (from, to) => { if (++calls === 2) throw new Error("模拟替换失败"); fs.renameSync(from, to); }), /模拟替换失败/);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(file), bytes);
    assert.equal(fs.readdirSync(root).some((name) => name.startsWith(".asset-update-")), false);
  }));
  await test("根内私有/隐藏 junction 不得借公共路径进入资源清单", () => fixture((root, write) => {
    for (const rel of [".private", "scripts", "js/.hidden"]) {
      write(rel + "/secret.txt", "PRIVATE_SECRET_MARKER");
      const link = path.join(root, "js", "alias");
      fs.symlinkSync(path.join(root, rel), link, process.platform === "win32" ? "junction" : "dir");
      try {
        write("index.html", '<script src="js/alias/secret.txt"></script>');
        const before = fs.readFileSync(path.join(root, "index.html"));
        assert.throws(() => createAssetPlan(root), /白名单|隐藏目录/);
        assert.throws(() => stageSite(root), /白名单|隐藏目录/);
        assert.deepEqual(fs.readFileSync(path.join(root, "index.html")), before);
        assert.equal(fs.existsSync(path.join(root, ".site-build")), false);
      } finally { fs.unlinkSync(link); }
    }
  }));
  await test("根外 junction 被拒绝，公共目录内合法链接仍可发现", () => fixture(async (root, write) => {
    const link = path.join(root, "js", "alias");
    await fixture((otherRoot) => {
      fs.symlinkSync(path.join(otherRoot, "js"), link, process.platform === "win32" ? "junction" : "dir");
      try {
        write("index.html", '<script src="js/alias/extra.js"></script>');
        const before = fs.readFileSync(path.join(root, "index.html"));
        assert.throws(() => createAssetPlan(root), /越出项目目录/);
        assert.throws(() => stageSite(root), /越出项目目录/);
        assert.deepEqual(fs.readFileSync(path.join(root, "index.html")), before);
      } finally { fs.unlinkSync(link); }
    });
    write("libs/public/extra.js", "public");
    fs.symlinkSync(path.join(root, "libs/public"), link, process.platform === "win32" ? "junction" : "dir");
    try {
      write("index.html", '<script src="js/alias/extra.js"></script>');
      assert.equal(createAssetPlan(root).assets.size, 2);
    } finally { fs.unlinkSync(link); }
  }));
  await test("CSS 循环引用拒绝，外部/data/锚点不进入公共文件清单", () => fixture((root, write) => {
    write("index.html", '<link href="css/a.css"><script src="https://example.test/a.js"></script><img src="data:image/png;base64,AA"><a href="#table">table</a>');
    write("css/a.css", '@import "b.css";'); write("css/b.css", '@import "a.css";');
    assert.throws(() => createAssetPlan(root), /循环/);
    write("css/b.css", "body{color:red}");
    assert.equal(createAssetPlan(root).assets.size, 3);
  }));
  await test("HTML 注释不发现资源，未加引号的本地属性也能版本化", () => fixture((root, write) => {
    write("index.html", '<!-- <script src="js/missing.js"></script> --><script src=js/extra.js></script>');
    const plan = createAssetPlan(root);
    assert.equal(plan.assets.size, 2);
    writeAssetPlan(plan);
    assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /src=js\/extra.js\?v=[a-f0-9]{7}/);
    assert.equal(createAssetPlan(root).changes.length, 0);
  }));
  await test("字体第二个下载失败保留整组旧字体与 CSS", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts"), before = snapshot(dir);
    await assert.rejects(updateFonts({ dir, fetcher: async (url) => { if (url.endsWith("/b")) throw new Error("503 fixture"); return fetchFonts(url); } }), /503/);
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)), ["fonts"]);
  }));
  await test("字体成功整组替换、清理旧子集，并使用内容哈希名称", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts");
    const result = await updateFonts({ dir, fetcher: fetchFonts });
    assert.equal(result.count, 2);
    const files = fs.readdirSync(dir);
    assert.equal(files.includes("gf-0.woff2"), false);
    assert.equal(files.filter((file) => /^gf-[a-f0-9]{64}\.woff2$/.test(file)).length, 2);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, "fonts.css"), "utf8"), /https:/);
  }));
  await test("不同字体URL返回同一字节时只保存一份内容哈希资产", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts");
    const result = await updateFonts({ dir, fetcher: async (url) => url.includes("googleapis") ? fontCss : Buffer.from("wOF2same-font") });
    assert.equal(result.count, 1);
    assert.equal(result.sources, 2);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".woff2"));
    assert.equal(files.length, 1);
    const refs = [...fs.readFileSync(path.join(dir, "fonts.css"), "utf8").matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
    assert.deepEqual(refs, [files[0], files[0]]);
  }));
  await test("字体 CSS 为空或响应非 WOFF2 拒绝替换旧目录", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts"), before = snapshot(dir);
    await assert.rejects(updateFonts({ dir, fetcher: async () => Buffer.from("no fonts") }), /不含字体/);
    await assert.rejects(updateFonts({ dir, fetcher: async (url) => url.includes("googleapis") ? fontCss : Buffer.from("not a font") }), /不是 WOFF2/);
    assert.deepEqual(snapshot(dir), before);
  }));
  await test("字体目录切换失败回滚，不留半组新文件", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts"), before = snapshot(dir);
    let calls = 0;
    await assert.rejects(updateFonts({ dir, fetcher: fetchFonts, rename: (from, to) => { if (++calls === 2) throw new Error("swap fixture"); fs.renameSync(from, to); } }), /swap/);
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(fs.readdirSync(path.dirname(dir)), ["fonts"]);
  }));
  await test("字体切换和回滚均失败时保留完整旧备份并报告可恢复路径", () => fixture(async (root) => {
    const dir = path.join(root, "libs/fonts"), parent = path.dirname(dir), before = snapshot(dir);
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
    for (const failure of ["copy", "swap"]) await fixture((root, write) => {
      writeAssetPlan(createAssetPlan(root));
      const previous = stageSite(root);
      const before = new Map(previous.files.map((file) => [file, fs.readFileSync(path.join(previous.directory, file))]));
      write("js/new.js", "new fixture asset");
      write("index.html", fs.readFileSync(path.join(root, "index.html"), "utf8") + '<script src="js/new.js"></script>');
      writeAssetPlan(createAssetPlan(root));
      const originalCopy = fs.copyFileSync, originalRename = fs.renameSync;
      let calls = 0;
      try {
        if (failure === "copy") fs.copyFileSync = () => { calls++; throw new Error("copy fixture"); };
        else fs.renameSync = (from, to) => { if (++calls === 2) throw new Error("swap fixture"); originalRename(from, to); };
        assert.throws(() => stageSite(root), failure === "copy" ? /copy fixture/ : /swap fixture/);
      } finally { fs.copyFileSync = originalCopy; fs.renameSync = originalRename; }
      assert.equal(calls, failure === "copy" ? 1 : 3);
      for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
      assert.equal(fs.existsSync(path.join(previous.directory, "js/new.js")), false);
      assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
      const retry = stageSite(root);
      assert.equal(fs.readFileSync(path.join(retry.directory, "js/new.js"), "utf8"), "new fixture asset");
      assert.equal(fs.readdirSync(root).some((name) => /^\.site-(stage|backup)-/.test(name)), false);
    });
  });
  await test("网站切换和回滚均失败时保留完整旧产物备份且可手动恢复", () => fixture((root) => {
    writeAssetPlan(createAssetPlan(root));
    const previous = stageSite(root);
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
      assert.throws(() => stageSite(root), (error) => {
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
    for (const code of ["EPERM", "EBUSY", "EACCES"]) await fixture((root, write) => {
      writeAssetPlan(createAssetPlan(root));
      const previous = stageSite(root);
      write("js/extra.js", '"use strict"; /* retry success */');
      writeAssetPlan(createAssetPlan(root));
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
        const result = stageSite(root);
        assert.equal(result.directory, previous.directory);
      } finally { fs.renameSync = originalRename; }
      assert.equal(attempts, 5, code + " 应在有界重试的最后一次成功");
      assert.equal(backupMoves, 1);
      assert.equal(restores, 0, "提交成功不应执行回滚");
      assert.match(fs.readFileSync(path.join(previous.directory, "js/extra.js"), "utf8"), /retry success/);
      assert.equal(fs.readdirSync(root).some(name => /^\.site-(stage|backup)-/.test(name)), false);
    });
  });
  await test("目录切换与回滚临时错误均耗尽五次重试后保留唯一完整旧备份", () => fixture((root) => {
    writeAssetPlan(createAssetPlan(root));
    const previous = stageSite(root);
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
      assert.throws(() => stageSite(root), error => {
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
  await test("非临时 ENOENT 原错误不重试，回滚短暂占用恢复后完整保留旧产物", () => fixture((root) => {
    writeAssetPlan(createAssetPlan(root));
    const previous = stageSite(root);
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
      assert.throws(() => stageSite(root), error => error === missing);
    } finally { fs.renameSync = originalRename; }
    assert.equal(swapAttempts, 1, "ENOENT 不能被当作暂时占用重试");
    assert.equal(restoreAttempts, 3);
    for (const [file, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(previous.directory, file)), bytes);
    assert.equal(fs.readdirSync(root).some(name => /^\.site-(stage|backup)-/.test(name)), false);
  }));
  await test("部署轮询收到ERROR或CANCELED立即失败，不继续等待", () => fixture(async (root) => {
    writeAssetPlan(createAssetPlan(root));
    for (const state of ["ERROR", "CANCELED"]) {
      const urls = [], waits = [];
      await assert.rejects(deploySite(root, [], { token: "mock-token", wait: async (ms, value) => { waits.push(ms); return value; },
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
    writeAssetPlan(createAssetPlan(root));
    for (const failedRequest of [1, 2]) {
      let requests = 0, waits = 0;
      await assert.rejects(deploySite(root, [], { token: "mock-token", wait: async (_ms, value) => { waits++; return value; },
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
    writeAssetPlan(createAssetPlan(root));
    let requests = 0, waits = 0;
    const timeout = new Error("timeout fixture"); timeout.name = "TimeoutError";
    await assert.rejects(deploySite(root, [], { token: "mock-token", wait: async (_ms, value) => { waits++; return value; }, fetcher: async (_url, init) => {
      requests++;
      assert.ok(init.signal instanceof AbortSignal);
      throw timeout;
    } }), (error) => error === timeout);
    assert.equal(requests, 1); assert.equal(waits, 0);
  }));
  await test("部署到最后一次轮询仍BUILDING才超时，并保留部署ID供后续检查", () => fixture(async (root) => {
    writeAssetPlan(createAssetPlan(root));
    let requests = 0, waits = 0;
    await assert.rejects(deploySite(root, [], { token: "mock-token", wait: async (ms, value) => { assert.equal(ms, 2000); waits++; return value; },
      fetcher: async () => { requests++; return new Response(JSON.stringify({ id: "dpl_pending", readyState: "BUILDING" })); }
    }), /部署尚未 READY.*dpl_pending/);
    assert.equal(requests, 121); assert.equal(waits, 120);
  }));
  await test("最后一次状态查询的READY、ERROR、CANCELED仍须处理，不误报轮询超时", () => fixture(async (root) => {
    writeAssetPlan(createAssetPlan(root));
    for (const state of ["READY", "ERROR", "CANCELED"]) {
      let requests = 0, waits = 0;
      const result = deploySite(root, [], { token: "mock-token", wait: async (_ms, value) => { waits++; return value; }, fetcher: async () => {
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
    writeAssetPlan(createAssetPlan(root));
    const site = stageSite(root);
    assert.ok(site.files.includes("index.html") && site.files.includes("vercel.json"));
    assert.ok(site.files.every((file) => !file.startsWith("scripts") && !file.startsWith(".vercel")));
    const job = deployment(root, ["--prod"]);
    assert.equal(job.body.project, "prj_fixture");
    assert.equal(job.body.target, "production");
    assert.equal(job.body.files.some((file) => file.file.includes("old-secret")), false);
    let requests = 0;
    const dry = await deploySite(root, ["--dry-run"], { fetcher: async () => { requests++; throw new Error("不得请求网络"); } });
    assert.equal(dry.dryRun, true); assert.equal(requests, 0);
    const urls = [];
    const ready = await deploySite(root, [], { token: "mock-token", wait: async () => undefined,
      fetcher: async (url) => { urls.push(String(url)); return new Response(JSON.stringify(urls.length === 1 ? { id: "dpl_mock", readyState: "BUILDING" } : { id: "dpl_mock", readyState: "READY", url: "mock.vercel.app" })); } });
    assert.equal(ready.readyState, "READY"); assert.equal(urls.length, 2);
  }));
  await test("认证优先级 env/options/已知CLI auth，缺失或非法文件不扫描其他凭据", () => fixture((root, write) => {
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
    writeAssetPlan(createAssetPlan(root));
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
      await deploySite(root, ["--dry-run"], { fetcher: async () => { throw new Error("不得请求网络"); } });
      assert.equal(authReads, 0);
      for (const failure of ["http", "terminal", "transport"]) {
        await assert.rejects(deploySite(root, [], { fetcher: async (_url, init) => {
          assert.equal(new Headers(init.headers).get("Authorization"), "Bearer " + token);
          assert.equal(String(init.body || "").includes(token), false);
          if (failure === "transport") throw new Error("network fixture " + token);
          return new Response(JSON.stringify(failure === "http" ? { error: { message: "denied " + token } } :
            { id: "dpl_secret", readyState: "ERROR", errorMessage: "failed " + token }), { status: failure === "http" ? 403 : 200 });
        } }), (error) => error instanceof Error && error.message.includes("[redacted]") && !String(error.stack).includes(token));
      }
      const ready = await deploySite(root, [], { fetcher: async () => new Response(JSON.stringify({ id: "dpl_safe", readyState: "READY",
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
