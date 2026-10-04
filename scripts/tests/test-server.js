#!/usr/bin/env node
/* 静态服务器的真实 HTTP 回归：随机空闲端口，不占用默认预览端口。 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createServer, fileFromUrl, root } = require("../server/serve");

function request(port, urlPath, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("HTTP test timed out")));
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  let tempDir = null;
  let testLink = null;
  try {
    const page = await request(port, "/");
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"], /^text\/html/);
    assert.equal(page.headers["cache-control"], "no-cache");
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.ok(page.body.length > 0);
    console.log("  ✓ 首页及响应头");

    const notModified = await request(port, "/", { "If-None-Match": page.headers.etag });
    assert.equal(notModified.status, 304);
    assert.equal(notModified.body.length, 0);
    const head = await request(port, "/", {}, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    console.log("  ✓ ETag 条件请求与 HEAD");

    const css = await request(port, "/css/style.css?v=test");
    assert.equal(css.status, 200);
    assert.match(css.headers["content-type"], /^text\/css/);
    assert.equal((await request(port, "/missing-server-test-file.txt")).status, 404);
    assert.ok(fileFromUrl("/.github/workflows/ci.yml"));
    console.log("  ✓ 资源类型、查询参数与缺失文件");

    for (const urlPath of ["/.git/config", "/.GIT/config", "/.GiT/HEAD", "/%2eg%49t/config", "/js/../.GIT/config"]) {
      assert.equal(fileFromUrl(urlPath), null, urlPath);
      assert.equal((await request(port, urlPath)).status, 403, urlPath);
    }
    console.log("  ✓ .git 大小写、编码与路径归一化拦截");

    for (const urlPath of ["/.git::$INDEX_ALLOCATION/HEAD", "/.git:$I30:$INDEX_ALLOCATION/HEAD", "/.git%3A%3A%24INDEX_ALLOCATION/HEAD", "/index.html::$DATA"]) {
      assert.equal(fileFromUrl(urlPath), null, urlPath);
      assert.equal((await request(port, urlPath, {}, "HEAD")).status, 403, urlPath);
    }
    console.log("  ✓ NTFS 目录别名与备用数据流原样/编码路径拦截");

    for (const urlPath of ["/%2e%2e/package.json", "/%2e%2e%2fpackage.json", "/C:/Windows/win.ini", "/bad%00path", "/%E0%A4%A"]) {
      assert.equal((await request(port, urlPath)).status, 403, urlPath);
    }
    console.log("  ✓ 路径越界、绝对路径、NUL 与错误编码拦截");

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-server-test-"));
    fs.writeFileSync(path.join(tempDir, "outside.txt"), "outside project fixture");
    const linkName = ".server-test-link-" + process.pid + "-" + Date.now();
    const linkPath = path.join(root, linkName);
    try {
      fs.symlinkSync(tempDir, linkPath, process.platform === "win32" ? "junction" : "dir");
      testLink = linkPath;
      assert.equal((await request(port, "/" + linkName + "/outside.txt")).status, 403);
      console.log("  ✓ 项目内符号链接不能读取项目外文件");
    } catch (err) {
      if (testLink || !["EPERM", "EACCES", "ENOTSUP"].includes(err.code)) throw err;
      console.log("  ↷ 当前系统不允许创建符号链接，跳过该项");
    }
  } finally {
    /* 只清理已创建的链接和两个已知临时路径，不做递归删除。 */
    if (testLink) fs.unlinkSync(testLink);
    if (tempDir) {
      fs.unlinkSync(path.join(tempDir, "outside.txt"));
      fs.rmdirSync(tempDir);
    }
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("服务器 HTTP 回归全部通过");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
