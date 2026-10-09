"use strict";
/* 线性 HTML/XML 扫描工具：与注释中的原正则逐项同义，但只做单向 indexOf/粘连匹配。
 * 来源响应最多 2 MiB；回溯正则在成串 "<"、"<!--"、未闭合的 <script>/<p> 或超长标签上是平方级耗时。 */

/** 替换 open…close 区间（同 /open[\s\S]*?close/g）；某个起点找不到结尾时，其后的起点也不可能匹配，直接结束。
 * @param {string} text @param {string} open @param {string} close @param {(inner:string)=>string} replace */
function replaceDelimited(text, open, close, replace) {
  let out = "", cursor = 0;
  for (let start = text.indexOf(open); start >= 0; start = text.indexOf(open, cursor)) {
    const end = text.indexOf(close, start + open.length);
    if (end < 0) break;
    out += text.slice(cursor, start) + replace(text.slice(start + open.length, end));
    cursor = end + close.length;
  }
  return out + text.slice(cursor);
}

/** 逐个找出 <name …>…</name> 区块，同 /<(a|b)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi；
 * anyClose 时结束标签可为任一名称（同 <\/(?:a|b)\s*>）。某名称找不到结束标签后，其后的同名开标签也不可能匹配。
 * @param {string} text @param {string[]} names @param {{anyClose?:boolean}} [options]
 * @returns {Generator<{index:number,end:number,attrs:string,inner:string}>} */
function* elements(text, names, options = {}) {
  const open = new RegExp("<(" + names.join("|") + ")\\b", "gi");
  const any = options.anyClose ? new RegExp("<\\/(?:" + names.join("|") + ")\\s*>", "gi") : null;
  const close = new Map(names.map((name) => [name.toLowerCase(), any || new RegExp("<\\/" + name + "\\s*>", "gi")]));
  const unclosed = new Set();
  let tagEnd = -1;
  for (let match; (match = open.exec(text));) {
    const name = match[1].toLowerCase(), key = any ? "" : name;
    if (unclosed.has(key)) continue;
    // 开标签止于其后第一个 >；起点单调递增，缓存的 > 仍在起点之后即可复用。
    if (tagEnd < open.lastIndex) tagEnd = text.indexOf(">", open.lastIndex);
    if (tagEnd < 0) return;
    const closing = /** @type {RegExp} */ (close.get(name));
    closing.lastIndex = tagEnd + 1;
    const end = closing.exec(text);
    if (!end) { unclosed.add(key); continue; }
    const after = end.index + end[0].length;
    yield { index: match.index, end: after, attrs: text.slice(open.lastIndex, tagEnd), inner: text.slice(tagEnd + 1, end.index) };
    open.lastIndex = after;
  }
}
/** 第一个匹配（同对应正则的 exec）。 @param {string} text @param {string[]} names @param {{anyClose?:boolean}} [options] */
function firstElement(text, names, options) {
  for (const element of elements(text, names, options)) return element;
  return null;
}
/** 移除区块（同 text.replace(/<(a|b)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")）；未闭合的开标签留给后续标签清理。
 * @param {string} text @param {string[]} names */
function stripElements(text, names) {
  let out = "", cursor = 0;
  for (const element of elements(text, names)) { out += text.slice(cursor, element.index) + " "; cursor = element.end; }
  return out + text.slice(cursor);
}

/** 引号感知地从 from 起找标签结尾 >（同 (?:[^>"']|"[^"]*"|'[^']*')*>），失败返回 -1。
 * 引号外经过的位置记入 dead：之后任何扫描在引号外到达这些位置都会走同一路径，结果相同，因此每个位置至多扫描一次。
 * @param {string} text @param {number} from @param {{dead:Uint8Array,last:Record<number,number>}} state */
function quotedTagEnd(text, from, state) {
  for (let index = from; index < text.length && !state.dead[index];) {
    state.dead[index] = 1;
    const code = text.charCodeAt(index);
    if (code === 62) return index;
    if (code === 34 || code === 39) {
      const close = index < state.last[code] ? text.indexOf(text[index], index + 1) : -1;
      if (close < 0) return -1;
      index = close + 1;
    } else index++;
  }
  return -1;
}
/** @param {string} text */
const scanState = (text) => ({ dead: new Uint8Array(text.length), last: { 34: text.lastIndexOf('"'), 39: text.lastIndexOf("'") } });
/** 逐个标签（同 text.matchAll(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g)）：引号内的 > 不结束标签，未闭合引号使该起点失败。
 * @param {string} text @returns {Generator<{index:number,text:string}>} */
function* quotedTags(text) {
  const state = scanState(text);
  for (let start = text.indexOf("<"); start >= 0;) {
    const end = quotedTagEnd(text, start + 1, state);
    if (end < 0) { start = text.indexOf("<", start + 1); continue; }
    yield { index: start, text: text.slice(start, end + 1) };
    start = text.indexOf("<", end + 1);
  }
}
/** 同 text.matchAll(/<name\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/name\s*>/gi)：开标签引号感知，内容到第一个结束标签。
 * @param {string} text @param {string} name @returns {Generator<{index:number,attrs:string,inner:string}>} */
function* quotedElements(text, name) {
  const open = new RegExp("<" + name + "\\b", "gi"), close = new RegExp("<\\/" + name + "\\s*>", "gi"), state = scanState(text);
  let lastClose = -1;
  for (let match; (match = close.exec(text));) lastClose = match.index;
  for (let match; (match = open.exec(text));) {
    const tagEnd = quotedTagEnd(text, open.lastIndex, state);
    // 结束标签之后再无闭合：后续从同一路径到达的起点同样失败，已由 dead 记录。
    if (tagEnd < 0 || tagEnd + 1 > lastClose) continue;
    close.lastIndex = tagEnd + 1;
    const end = /** @type {RegExpExecArray} */ (close.exec(text));
    yield { index: match.index, attrs: text.slice(open.lastIndex, tagEnd), inner: text.slice(tagEnd + 1, end.index) };
    open.lastIndex = end.index + end[0].length;
  }
}

module.exports = { replaceDelimited, elements, firstElement, stripElements, quotedTags, quotedElements };
