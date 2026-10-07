#!/usr/bin/env node
/* 本地静态服务器：只监听 127.0.0.1，且只读项目根目录内的文件。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { insideRoot, blockedSegment } = require("../lib/paths");

const root = path.resolve(__dirname, "..", "..");
const rootReal = fs.realpathSync(root);
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

function fileFromUrl(urlPath) {
  let rel;
  try { rel = decodeURIComponent(String(urlPath || "/").split("?")[0]); }
  catch (e) { return null; }
  /* NTFS 的目录流别名（如 .git::$INDEX_ALLOCATION）不会被 realpath 还原。
   * 网站路径无需冒号，统一拒绝原样和 URL 编码后的流名称。 */
  if (rel.includes("\0") || rel.includes(":")) return null;
  if (rel === "/") rel = "/index.html";
  const stripped = rel.replace(/^[/\\]+/, "");
  if (!stripped || path.isAbsolute(stripped) || /^[a-zA-Z]:/.test(stripped)) return null;
  const resolved = path.resolve(root, stripped);
  const relToRoot = path.relative(root, resolved);
  if (!insideRoot(root, resolved) || blockedSegment(relToRoot)) return null;
  return resolved;
}
/* Windows 不区分路径大小写，realpath 也可能保留请求的大小写。两次检查均按段折叠。 */
function pathBlocked(relToRoot) {
  return !insideRoot(rootReal, path.resolve(root, relToRoot)) || blockedSegment(relToRoot);
}

function createServer() {
  return http.createServer((q, r) => {
    const file = fileFromUrl(q.url);
    if (!file) {
      r.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      r.end("403");
      return;
    }
    fs.realpath(file, (realErr, real) => {
      if (realErr) {
        const missing = realErr.code === "ENOENT";
        r.writeHead(missing ? 404 : 403, { "Content-Type": "text/plain; charset=utf-8" });
        r.end(missing ? "404" : "403");
        return;
      }
      if (pathBlocked(path.relative(rootReal, real))) {
        r.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        r.end("403");
        return;
      }
      fs.readFile(real, (err, data) => {
        if (err) {
          r.writeHead(err.code === "ENOENT" ? 404 : 403, { "Content-Type": "text/plain; charset=utf-8" });
          r.end(err.code === "ENOENT" ? "404" : "403");
          return;
        }
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

module.exports = { fileFromUrl, createServer, root };
