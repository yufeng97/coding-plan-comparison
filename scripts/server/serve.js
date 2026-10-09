#!/usr/bin/env node
/* 本地静态服务器：只监听 127.0.0.1，只读项目根目录内的公共站点文件（入口、RSS 与 css/js/libs），
 * 并只接受指向本机监听端口的 Host，防止 DNS 重绑定页面借浏览器读取审计、凭据等项目文件。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { insideRoot, blockedSegment, publicSiteFile, hiddenSegment } = require("../lib/paths");

const root = path.resolve(__dirname, "..", "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT) || 8123;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/rss+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/* 与 build:site 相同的公共白名单；隐藏段（.git、.vercel 等）一律拒绝。 */
function servable(relToRoot) {
  return publicSiteFile(relToRoot) && !hiddenSegment(relToRoot) && !blockedSegment(relToRoot);
}

function fileFromUrl(urlPath, base = root) {
  let rel;
  try { rel = decodeURIComponent(String(urlPath || "/").split("?")[0]); }
  catch (e) { return null; }
  /* NTFS 的目录流别名（如 .git::$INDEX_ALLOCATION）不会被 realpath 还原。
   * 网站路径无需冒号，统一拒绝原样和 URL 编码后的流名称。 */
  if (rel.includes("\0") || rel.includes(":")) return null;
  if (rel === "/") rel = "/index.html";
  const stripped = rel.replace(/^[/\\]+/, "");
  if (!stripped || path.isAbsolute(stripped) || /^[a-zA-Z]:/.test(stripped)) return null;
  const resolved = path.resolve(base, stripped);
  const relToRoot = path.relative(base, resolved);
  if (!insideRoot(base, resolved) || !servable(relToRoot)) return null;
  return resolved;
}
/* 规范路径须仍在根内且仍属白名单。realpath.native 会展开链接、NTFS 8.3 短名（GIT~1）和大小写，
 * 词法检查之后对规范结果重新判断，避免短名或链接别名绕过封锁段。 */
function canonicalBlocked(baseReal, real) {
  return !insideRoot(baseReal, real) || !servable(path.relative(baseReal, real));
}
/* 只接受本服务实际端口上的 127.0.0.1 / localhost；重绑定到 127.0.0.1 的外部域名 Host 不同，一律拒绝。 */
function allowedHost(value, localPort) {
  const match = /^(?:127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/i.exec(String(value || ""));
  return !!match && Number(match[1] || 80) === localPort;
}

function deny(r, status = 403) {
  r.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  r.end(String(status));
}

/** @param {{root?:string}} [options] root 仅供测试使用临时站点目录。 */
function createServer(options = {}) {
  const base = path.resolve(options.root || root);
  const baseReal = fs.realpathSync.native(base);
  return http.createServer((q, r) => {
    if (!allowedHost(q.headers.host, q.socket.localPort)) { deny(r); return; }
    const file = fileFromUrl(q.url, base);
    if (!file) { deny(r); return; }
    fs.realpath.native(file, (realErr, real) => {
      if (realErr) { deny(r, realErr.code === "ENOENT" ? 404 : 403); return; }
      if (canonicalBlocked(baseReal, real)) { deny(r); return; }
      fs.readFile(real, (err, data) => {
        if (err) { deny(r, err.code === "ENOENT" ? 404 : 403); return; }
        const ext = path.extname(real).toLowerCase();
        /* no-cache 需要校验器才能完成条件请求：按内容发 ETag，命中则 304 */
        const etag = '"' + crypto.createHash("md5").update(data).digest("hex").slice(0, 16) + '"';
        if (q.headers["if-none-match"] === etag) {
          r.writeHead(304, { ETag: etag });
          r.end();
          return;
        }
        r.writeHead(200, {
          "Content-Type": types[ext] || "application/octet-stream",
          "Cache-Control": "no-cache",
          ETag: etag,
          "X-Content-Type-Options": "nosniff",
        });
        r.end(data);
      });
    });
  });
}

if (require.main === module) {
  createServer().listen(port, host, () => {
    console.log("http://" + host + ":" + port);
  });
}

module.exports = { fileFromUrl, createServer, allowedHost, root };
