"use strict";
const path = require("node:path");

/** 目标路径是否严格位于 root 之内（root 本身不算）。词法判断，不解析符号链接。 */
function insideRoot(root, target) {
  const rel = path.relative(root, target);
  return !!rel && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

/** 相对路径中是否包含被封锁的段（大小写不敏感；Windows 路径段不区分大小写）。默认只封 .git。 */
function blockedSegment(relToRoot, names = [".git"]) {
  const blocked = new Set(names.map((name) => name.toLowerCase()));
  return String(relToRoot || "").split(/[/\\]/).some((segment) => blocked.has(segment.toLowerCase()));
}

/** 公共站点白名单（build:site 与本地预览共用）：入口、RSS、分享预览图、厂商 RSS 与 css/js/libs 目录内的文件。路径段区分大小写。 */
function publicSiteFile(relToRoot) {
  const rel = String(relToRoot || "").split(/[/\\]/).join("/");
  return ["index.html", "changes.xml", "og-image.png"].includes(rel) || /^(?:css|js|libs)\//.test(rel) || /^feeds\/[a-z0-9-]+\.xml$/.test(rel);
}

/** 任一路径段以 . 开头（隐藏文件或目录，包括 .git、.vercel）。 */
function hiddenSegment(relToRoot) {
  return String(relToRoot || "").split(/[/\\]/).some((segment) => segment.startsWith("."));
}

module.exports = { insideRoot, blockedSegment, publicSiteFile, hiddenSegment };
