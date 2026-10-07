"use strict";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", copy: "©" };
function decodeEntities(text) {
  return String(text || "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}
function plainText(text) {
  return decodeEntities(String(text || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ").trim();
}
function attributes(tag) {
  /** @type {Record<string,string>} */
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) result[match[1].toLowerCase()] = decodeEntities(match[3]);
  return result;
}
/** @typedef {{name:string,attrs:Record<string,string>,base:string,children:Array<XMLNode|string>}} XMLNode */
/** Minimal structural XML parser: CDATA is text, direct child fields retain their meaning, and malformed tags fail closed.
 * @returns {XMLNode} */
function parseXML(xml, baseURL) {
  /** @type {XMLNode} */
  const container = { name: "", attrs: {}, base: baseURL, children: [] };
  const stack = [container];
  let cursor = 0, count = 0;
  while (cursor < xml.length) {
    const parent = stack.at(-1);
    if (xml[cursor] !== "<") {
      const next = xml.indexOf("<", cursor), end = next < 0 ? xml.length : next;
      parent.children.push(xml.slice(cursor, end)); cursor = end; continue;
    }
    if (xml.startsWith("<![CDATA[", cursor)) {
      const end = xml.indexOf("]]>", cursor + 9);
      if (end < 0) throw new Error("Feed CDATA 不完整");
      parent.children.push(xml.slice(cursor + 9, end)); cursor = end + 3; continue;
    }
    if (xml.startsWith("<!--", cursor) || xml.startsWith("<?", cursor)) {
      const comment = xml.startsWith("<!--", cursor), close = comment ? "-->" : "?>";
      const end = xml.indexOf(close, cursor + (comment ? 4 : 2));
      if (end < 0) throw new Error("Feed 注释或声明不完整");
      cursor = end + close.length; continue;
    }
    if (xml.startsWith("<!", cursor)) throw new Error("Feed 不支持 DTD 或自定义实体");
    let end = cursor + 1, quote = "";
    for (; end < xml.length; end++) {
      const ch = xml[end];
      if (quote) { if (ch === quote) quote = ""; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
    }
    if (end === xml.length) throw new Error("Feed 标签不完整");
    const tag = xml.slice(cursor, end + 1), closing = /^<\//.test(tag), name = /^<\/?([\w:.-]+)/.exec(tag)?.[1];
    if (!name) throw new Error("Feed 标签无效");
    if (closing) {
      if (!/^<\/[\w:.-]+\s*>$/.test(tag) || stack.length === 1 || parent.name !== name) throw new Error("Feed 标签不匹配");
      stack.pop();
    } else {
      if (++count > 50000 || stack.length > 64) throw new Error("Feed 元素数量或深度超限");
      const attrs = attributes(tag), base = attrs["xml:base"] ? new URL(attrs["xml:base"], parent.base).href : parent.base;
      const node = { name, attrs, base, children: [] };
      parent.children.push(node);
      if (!/\/\s*>$/.test(tag)) stack.push(node);
    }
    cursor = end + 1;
  }
  const roots = container.children.filter((child) => typeof child !== "string");
  if (stack.length !== 1 || roots.length !== 1 || container.children.some((child) => typeof child === "string" && child.replace(/^\uFEFF/, "").trim())) throw new Error("Feed 根元素不完整");
  return roots[0];
}
const localName = (node) => node.name.split(":").at(-1).toLowerCase();
/** @param {XMLNode} node @returns {XMLNode[]} */
function childNodes(node) { return node.children.filter((child) => typeof child !== "string"); }
/** @param {XMLNode} node @returns {string} */
function nodeText(node) { return node.children.map((child) => typeof child === "string" ? child : nodeText(child)).join(" "); }
function valueOf(node, names) { for (const name of names) { const child = childNodes(node).find((value) => localName(value) === name); if (child) return plainText(nodeText(child)); } return ""; }
function feedLink(node) {
  const links = childNodes(node).filter((value) => localName(value) === "link");
  for (const link of links) {
    const raw = plainText(nodeText(link));
    if (raw) return new URL(raw, link.base).href;
  }
  const link = links.find((value) => value.attrs.href && (!value.attrs.rel || value.attrs.rel === "alternate") && (!value.attrs.type || value.attrs.type === "text/html"));
  return link ? new URL(link.attrs.href, link.base).href : "";
}

/** @typedef {{title:string,url:string,summary:string,publishedAt?:string,dateMeaning?:string,kind:string,observedAt?:string,previousHash?:string,currentHash?:string}} NewsItem */

/** A restricted feed reader; no entity expansion, script execution, or remote XML resolution.
 * @returns {NewsItem[]} */
function parseFeed(xml, baseURL, kind) {
  const root = parseXML(xml, baseURL), name = localName(root);
  if (!(kind === "atom" ? name === "feed" : ["rss", "rdf"].includes(name))) throw new Error("Feed 根元素缺失");
  const container = name === "rss" ? childNodes(root).find((value) => localName(value) === "channel") : root;
  if (!container) throw new Error("RSS channel 缺失");
  const blocks = childNodes(container).filter((value) => localName(value) === (kind === "atom" ? "entry" : "item"));
  const items = [];
  for (const block of blocks) {
    const title = valueOf(block, ["title"]).slice(0, 500);
    let link;
    try { link = feedLink(block); } catch { continue; }
    if (!title || !link) continue;
    let url;
    try { url = new URL(link, baseURL).href; } catch { continue; }
    const published = valueOf(block, ["published", "pubdate", "date"]);
    const updated = valueOf(block, ["updated"]);
    // Avoid content:encoded, which can contain the complete article.
    const summary = valueOf(block, ["summary", "description"]).slice(0, 360);
    items.push({ title, url, summary, kind: "feed", ...(published || updated ? { publishedAt: published || updated } : {}),
      dateMeaning: published ? "feed-publication" : updated ? "feed-update" : "unknown" });
  }
  if (blocks.length && !items.length) throw new Error("Feed 存在条目但未解析到有效标题及链接");
  return items;
}

/** @returns {{items:NewsItem[],truncated:boolean}} */
function parseHN(json) {
  if (!json || !Array.isArray(json.hits)) throw new Error("HN 响应缺少 hits 数组");
  const items = json.hits.filter((hit) => hit && typeof hit.title === "string" && hit.title.trim()).map((hit) => ({
    title: plainText(hit.title).slice(0, 500), url: hit.url || (hit.objectID ? "https://news.ycombinator.com/item?id=" + encodeURIComponent(hit.objectID) : ""),
    summary: plainText(hit.story_text).slice(0, 360), publishedAt: hit.created_at || undefined,
    kind: "hn-story", dateMeaning: "hn-post-created",
  })).filter((item) => item.url);
  if (json.hits.length && !items.length) throw new Error("HN 存在条目但未解析到有效标题及链接");
  return { items, truncated: Number(json.nbPages) > 1 };
}

module.exports = { plainText, parseFeed, parseHN };
