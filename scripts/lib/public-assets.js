"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const hash = (bytes) => crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 7);
const slash = (file) => file.split(path.sep).join("/");
const remote = (url) => /^(?:https?:|data:|blob:|\/\/|#)/i.test(url);

/** Resolve a local resource, checking lexical and real paths before reading it. */
function localAsset(root, owner, raw) {
  const url = raw.replace(/&amp;/g, "&").trim();
  if (!url || remote(url)) return null;
  const pathname = url.split(/[?#]/)[0];
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { throw new Error(`资源路径编码非法：${raw}`); }
  if (!decoded || /[\\\0]/.test(decoded) || /^[a-z][a-z\d+.-]*:/i.test(decoded)) throw new Error(`资源路径不安全：${raw}`);
  const absolute = path.resolve(decoded.startsWith("/") ? root : path.dirname(owner), decoded.replace(/^\/+/, ""));
  const within = (target) => {
    const rel = path.relative(root, target);
    return rel && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
  };
  if (!within(absolute)) throw new Error(`资源越出项目目录：${raw}`);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`资源不存在或不是文件：${raw}`);
  const real = fs.realpathSync(absolute);
  if (!within(real)) throw new Error(`资源链接越出项目目录：${raw}`);
  const assertPublic = (target) => {
    const rel = slash(path.relative(root, target));
    if (rel !== "index.html" && !/^(?:css|js|libs)\//.test(rel)) throw new Error(`资源不在公共目录白名单：${rel}`);
    if (rel.split("/").some((part) => part.startsWith("."))) throw new Error(`资源包含隐藏目录：${rel}`);
  };
  assertPublic(absolute);
  assertPublic(real); // Public aliases must not expose private or hidden files inside the root.
  return absolute;
}

/** @typedef {{start:number,end:number,raw:string,file:string,html:boolean}} AssetRef */
/** @returns {AssetRef[]} */
function references(root, file, source) {
  const refs = [];
  const add = (start, raw, html) => {
    const target = localAsset(root, file, raw);
    if (target) refs.push({ start, end: start + raw.length, raw, file: target, html });
  };
  if (path.extname(file) === ".html") {
    const html = source.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
    for (const tag of html.matchAll(/<(script|link|img|source|video|audio)\b[^>]*>/gi)) {
      for (const attr of tag[0].matchAll(/\b(src|href|poster)\s*=\s*(?:(["'])(.*?)\2|([^\s>]+))/gi)) {
        if (attr[1].toLowerCase() === "href" && tag[1].toLowerCase() !== "link") continue;
        const suffix = attr[0].slice(attr[0].indexOf("=") + 1);
        const start = tag.index + attr.index + attr[0].length - suffix.trimStart().length + (attr[2] ? 1 : 0);
        add(start, attr[3] ?? attr[4], true);
      }
    }
  } else if (path.extname(file) === ".css") {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
      const raw = match.slice(1).find((value) => value !== undefined) || "";
      add(match.index + match[0].lastIndexOf(raw), raw, false);
    }
  }
  return refs;
}

function versioned(raw, version, html) {
  const decoded = raw.replace(/&amp;/g, "&");
  const hashAt = decoded.indexOf("#");
  const fragment = hashAt < 0 ? "" : decoded.slice(hashAt);
  const base = hashAt < 0 ? decoded : decoded.slice(0, hashAt);
  const queryAt = base.indexOf("?");
  const pathname = queryAt < 0 ? base : base.slice(0, queryAt);
  const query = new URLSearchParams(queryAt < 0 ? "" : base.slice(queryAt + 1));
  query.set("v", version);
  const result = pathname + "?" + query.toString() + fragment;
  return html ? result.replace(/&/g, "&amp;") : result;
}

/** Discover HTML resources and CSS dependencies, then calculate all edits before any write. */
function createAssetPlan(workspace) {
  const root = fs.realpathSync(path.resolve(workspace));
  const entry = path.join(root, "index.html");
  localAsset(root, entry, "index.html");
  /** @type {Map<string,{bytes:Buffer,refs:AssetRef[]}>} */
  const assets = new Map();
  const read = (file) => {
    if (assets.has(file)) return;
    const bytes = fs.readFileSync(file);
    const refs = references(root, file, bytes.toString("utf8"));
    assets.set(file, { bytes, refs });
    refs.forEach((ref) => read(ref.file));
  };
  read(entry);
  /** @type {Map<string,Buffer>} */
  const outputs = new Map();
  const visiting = new Set();
  const transform = (file) => {
    if (outputs.has(file)) return outputs.get(file);
    if (visiting.has(file)) throw new Error(`CSS 资源引用存在循环：${slash(path.relative(root, file))}`);
    visiting.add(file);
    const asset = assets.get(file);
    let bytes = asset.bytes;
    if (asset.refs.length) {
      let source = bytes.toString("utf8");
      for (const ref of [...asset.refs].sort((a, b) => b.start - a.start)) {
        const next = versioned(ref.raw, hash(transform(ref.file)), ref.html);
        source = source.slice(0, ref.start) + next + source.slice(ref.end);
      }
      bytes = Buffer.from(source);
    }
    visiting.delete(file);
    outputs.set(file, bytes);
    return bytes;
  };
  transform(entry);
  const changes = [...outputs].filter(([file, bytes]) => !bytes.equals(assets.get(file).bytes));
  return { root, entry, assets, outputs, changes };
}

/** Stage every replacement first and roll back already replaced files if a rename fails. */
function writeAssetPlan(plan, rename = fs.renameSync) {
  const staged = [];
  const applied = [];
  const recovery = new Set();
  try {
    for (const [file, bytes] of plan.changes) {
      const dir = fs.mkdtempSync(path.join(path.dirname(file), ".asset-update-"));
      const next = path.join(dir, "next"), original = path.join(dir, "original");
      staged.push({ file, dir, next, original });
      fs.writeFileSync(next, bytes);
      fs.writeFileSync(original, plan.assets.get(file).bytes);
    }
    for (const item of staged) { rename(item.next, item.file); applied.push(item); }
  } catch (error) {
    const failures = [];
    for (const item of applied.reverse()) {
      try { rename(item.original, item.file); }
      catch (restoreError) { recovery.add(item.dir); failures.push(restoreError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "回滚受文件系统限制，原文件备份保留在：" + [...recovery].join("、"));
    throw error;
  } finally {
    for (const item of staged) {
      if (path.dirname(item.dir) !== path.dirname(item.file) || !path.basename(item.dir).startsWith(".asset-update-")) throw new Error("拒绝清理未知暂存路径");
      if (!recovery.has(item.dir)) fs.rmSync(item.dir, { recursive: true, force: true });
    }
  }
}

module.exports = { createAssetPlan, writeAssetPlan, localAsset };
