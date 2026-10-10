#!/usr/bin/env node
/* 静态服务器的真实 HTTP 回归：随机空闲端口，不占用默认预览端口。 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { createServer, fileFromUrl, allowedHost, root } = require("../server/serve");
const { blockedSegment } = require("../lib/paths");

function request(port, urlPath, headers = {}, method = "GET", setHost = true) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers, setHost }, (res) => {
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

/** @param {http.Server} server @returns {Promise<number>} */
async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}

/** NTFS 8.3 短名（如 GIT~1）只在启用短名的卷上存在；返回指向 target 的短名，否则 null。 */
function shortAlias(dir, stem, extension, target) {
  for (let index = 1; index <= 4; index++) {
    const alias = path.join(dir, stem + "~" + index + extension);
    try { if (fs.realpathSync.native(alias) === fs.realpathSync.native(target)) return path.basename(alias); }
    catch {}
  }
  return null;
}

async function main() {
  const server = createServer();
  const port = await listen(server);
  const temporary = [], links = [];
  let fixtureServer = null;
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
    assert.equal((await request(port, "/js/missing-server-test-file.js")).status, 404);
    for (const urlPath of ["/index.html", "/changes.xml", "/js/data.js", "/libs/fonts/fonts.css"]) assert.equal((await request(port, urlPath)).status, 200, urlPath);
    console.log("  ✓ 资源类型、查询参数与缺失文件");

    for (const value of ["evil.example:" + port, "evil.example", "127.0.0.1", "127.0.0.1:" + (port === 65535 ? 1 : port + 1), "[::1]:" + port, "localhost.:" + port, "127.0.0.1:" + port + ".evil.example", "127.0.0.1:" + port + "@evil.example"]) {
      assert.equal((await request(port, "/", { Host: value })).status, 403, value);
    }
    assert.ok([400, 403].includes((await request(port, "/", {}, "GET", false)).status), "缺少 Host（Node 默认先回 400）");
    for (const value of ["localhost:" + port, "LOCALHOST:" + port, "127.0.0.1:" + port]) assert.equal((await request(port, "/", { Host: value })).status, 200, value);
    assert.equal(allowedHost("127.0.0.1", 80), true);
    assert.equal(allowedHost("localhost", 8123), false);
    console.log("  ✓ Host 只接受本端口的 127.0.0.1/localhost，拒绝 DNS 重绑定域名与缺失 Host");

    for (const urlPath of ["/audit/pricing-root.json", "/.vercel/project.json", "/node_modules/typescript/package.json", "/test-results/screenshot.png", "/playwright-report/index.html",
      "/package.json", "/README.md", "/scripts/server/serve.js", "/config/news-sources.json", "/data/change-history.json", "/benchmarks/public-results.json", "/.github/workflows/ci.yml", "/js/.hidden.js", "/JS/data.js"]) {
      assert.equal(fileFromUrl(urlPath), null, urlPath);
      assert.equal((await request(port, urlPath)).status, 403, urlPath);
    }
    assert.equal(blockedSegment(".github/workflows/ci.yml"), false, ".git 封锁仍按整段匹配");
    const feed = fs.readdirSync(path.join(root, "feeds")).find((name) => name.endsWith(".xml"));
    const feedResponse = await request(port, "/feeds/" + feed);
    assert.equal(feedResponse.status, 200, "厂商 RSS 属于公共站点");
    assert.match(feedResponse.headers["content-type"], /rss\+xml/);
    for (const urlPath of ["/feeds/notes.txt", "/feeds/sub/x.xml", "/feeds/../package.json", "/feeds/.hidden.xml", "/feeds/UPPER.xml"]) assert.equal(fileFromUrl(urlPath), null, urlPath);
    console.log("  ✓ 只提供公共站点白名单：审计、Vercel 凭据、依赖、测试产物、脚本与数据源均 403");

    for (const urlPath of ["/.git/config", "/.GIT/config", "/.GiT/HEAD", "/%2eg%49t/config", "/js/../.GIT/config", "/.env", "/.vercel/project.json", "/js/.secret", "/%2eenv"]) {
      assert.equal(fileFromUrl(urlPath), null, urlPath);
      assert.equal((await request(port, urlPath)).status, 403, urlPath);
    }
    console.log("  ✓ .git 与点文件的大小写、编码与路径归一化拦截");

    for (const urlPath of ["/.git::$INDEX_ALLOCATION/HEAD", "/.git:$I30:$INDEX_ALLOCATION/HEAD", "/.git%3A%3A%24INDEX_ALLOCATION/HEAD", "/index.html::$DATA"]) {
      assert.equal(fileFromUrl(urlPath), null, urlPath);
      assert.equal((await request(port, urlPath, {}, "HEAD")).status, 403, urlPath);
    }
    console.log("  ✓ NTFS 目录别名与备用数据流原样/编码路径拦截");

    for (const urlPath of ["/%2e%2e/package.json", "/%2e%2e%2fpackage.json", "/C:/Windows/win.ini", "/bad%00path", "/%E0%A4%A"]) {
      assert.equal((await request(port, urlPath)).status, 403, urlPath);
    }
    console.log("  ✓ 路径越界、绝对路径、NUL 与错误编码拦截");

    /* 临时站点：公共目录内的链接与 8.3 短名必须按规范路径重新判断。 */
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-server-test-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-server-test-"));
    temporary.push(fixture, outside);
    const write = (rel, text) => { const file = path.join(fixture, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
    write("index.html", "<!doctype html>");
    write("js/app.js", '"use strict";');
    write("js/.git/config", "[core] private");
    write("js/.hidden-secret.txt", "PRIVATE_SECRET_MARKER");
    write("audit/secret.json", "{}");
    write(".git/config", "[core] private");
    fs.writeFileSync(path.join(outside, "outside.txt"), "outside project fixture");
    fixtureServer = createServer({ root: fixture });
    const fixturePort = await listen(fixtureServer);
    assert.equal((await request(fixturePort, "/js/app.js")).status, 200);
    try {
      for (const [name, target, file] of [["outside-link", outside, "outside.txt"], ["audit-link", path.join(fixture, "audit"), "secret.json"], ["git-link", path.join(fixture, ".git"), "config"]]) {
        const link = path.join(fixture, "js", name);
        fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
        links.push(link);
        assert.equal((await request(fixturePort, "/js/" + name + "/" + file)).status, 403, name);
      }
      console.log("  ✓ 公共目录内的链接不能读取项目外、私有目录或 .git 文件");
    } catch (err) {
      if (links.length || !["EPERM", "EACCES", "ENOTSUP"].includes(err.code)) throw err;
      console.log("  ↷ 当前系统不允许创建符号链接，跳过该项");
    }
    const gitAlias = shortAlias(path.join(fixture, "js"), "GIT", "", path.join(fixture, "js", ".git"));
    const hiddenAlias = shortAlias(path.join(fixture, "js"), "HIDDEN", ".TXT", path.join(fixture, "js", ".hidden-secret.txt"));
    if (gitAlias && hiddenAlias) {
      for (const urlPath of ["/js/" + gitAlias + "/config", "/js/" + hiddenAlias]) {
        assert.ok(fileFromUrl(urlPath, fixture), "短名在词法检查时看不出隐藏段：" + urlPath);
        const response = await request(fixturePort, urlPath);
        assert.equal(response.status, 403, urlPath);
        assert.ok(!response.body.toString().includes("PRIVATE"), urlPath);
      }
      console.log("  ✓ NTFS 8.3 短名（" + gitAlias + "）按 realpath.native 规范路径拦截");
    } else console.log("  ↷ 临时目录所在卷未启用 NTFS 8.3 短名，跳过短名请求（规范路径检查仍执行）");
  } finally {
    /* 先移除已创建的链接，再按已知前缀清理临时目录，避免递归删除跟随链接。 */
    for (const link of links) fs.unlinkSync(link);
    for (const dir of temporary) {
      if (path.dirname(dir) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith("coding-plan-server-test-")) throw new Error("拒绝清理未知服务器测试目录");
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (fixtureServer) await new Promise((resolve) => fixtureServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("服务器 HTTP 回归全部通过");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
