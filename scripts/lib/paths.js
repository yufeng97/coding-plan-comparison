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

module.exports = { insideRoot, blockedSegment };
