"use strict";
const { inflateRawSync } = require("node:zlib");
const { createHash } = require("node:crypto");

/** @typedef {{text:string,url:string,hash:string,checkedAt:string,bytes?:Buffer}} Source */
/** @typedef {(url:string)=>Promise<Source>} Getter */
/** @typedef {{name:string,attrs:Record<string,string>,children:Array<XMLNode|string>}} XMLNode */
const V1 = "https://osworld-v1.xlang.ai/";
const V2 = "https://osworld-v2.xlang.ai/";
const HLE = "https://lastexam.ai/";
const DIAMOND = HLE + "blog/hle-diamond";
const GUIDE = "https://api.github.com/repos/centerforaisafety/hle/contents/docs/evaluation-with-tools.md";
const fail = message => { throw new Error("OSWorld / HLE 官方格式校验失败：" + message); };
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 16);

function number(value, label, maximum = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) fail(label);
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 1500) fail(label);
  return value.trim();
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail("日期");
  return value;
}
function entities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail("XML 字符实体");
      return String.fromCodePoint(code);
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[entity.toLowerCase()];
  });
}
function plain(value) { return entities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim(); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Restrained XML reader: no DTD, external entities, executable content or recovery. @param {string} xml */
function xmlNodes(xml) {
  if (xml.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) fail("不支持的 XML 声明或大小");
  /** @type {XMLNode} */
  const root = { name: "root", attrs: {}, children: [] };
  const stack = [root];
  let cursor = 0, count = 0;
  const tokens = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>/g;
  for (const match of xml.matchAll(tokens)) {
    const text = xml.slice(cursor, match.index);
    if (text.includes("<")) fail("损坏的 XML 文本");
    if (text) stack.at(-1).children.push(entities(text));
    const token = match[0]; cursor = match.index + token.length;
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("<![CDATA[")) { stack.at(-1).children.push(token.slice(9, -3)); continue; }
    if (token.startsWith("</")) {
      const name = /^<\/([\w:.-]+)\s*>$/.exec(token)?.[1]?.split(":").at(-1);
      if (!name || stack.length === 1 || stack.pop().name !== name) fail("XML 标签不配对");
      continue;
    }
    const open = /^<([\w:.-]+)([\s\S]*?)\/?\s*>$/.exec(token);
    if (!open) fail("XML 标签");
    /** @type {Record<string,string>} */
    const attrs = {};
    let tail = open[2].trim().replace(/\/$/, "").trim();
    while (tail) {
      const attribute = /^([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/.exec(tail);
      if (!attribute || Object.hasOwn(attrs, attribute[1])) fail("XML 属性");
      attrs[attribute[1]] = entities(attribute[2] ?? attribute[3]);
      tail = tail.slice(attribute[0].length);
    }
    /** @type {XMLNode} */
    const node = { name: open[1].split(":").at(-1), attrs, children: [] };
    if (++count > 150000 || stack.length > 32) fail("XML 结构超限");
    stack.at(-1).children.push(node);
    if (!/\/\s*>$/.test(token)) stack.push(node);
  }
  if (stack.length !== 1 || xml.slice(cursor).includes("<")) fail("XML 未闭合");
  if (xml.slice(cursor)) root.children.push(entities(xml.slice(cursor)));
  return root;
}
/** @param {XMLNode} node @param {string} name @returns {XMLNode[]} */
function children(node, name) { return node.children.filter(/** @returns {value is XMLNode} */ value => typeof value !== "string" && value.name === name); }
/** @param {XMLNode} node @returns {string} */
function xmlText(node) { return node.children.map(value => typeof value === "string" ? value : xmlText(value)).join(""); }

/** Read three whitelisted XML members in memory; never extract ZIP paths to disk. @param {Buffer} bytes */
function xlsxRows(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > 4 * 1024 * 1024) fail("XLSX 字节或大小");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail("XLSX ZIP 目录");
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (!count || count > 256 || start + size !== end || bytes.readUInt16LE(end + 8) !== count) fail("ZIP64 / ZIP 目录超限");
  const wanted = new Set(["xl/workbook.xml", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"]);
  const members = new Map(); let cursor = start, expanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail("ZIP 成员");
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), expectedCRC = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20), length = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42), name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString("utf8");
    if (cursor + 46 + nameSize + extra + comment > end || !/^[\w\[\]./ -]+$/.test(name) || name.startsWith("/") || name.split("/").includes("..")) fail("ZIP 成员路径");
    cursor += 46 + nameSize + extra + comment;
    if (!wanted.has(name)) continue;
    if (members.has(name) || flags & 1 || ![0, 8].includes(method) || length > 16 * 1024 * 1024 || (expanded += length) > 20 * 1024 * 1024 || offset + 30 > start || bytes.readUInt32LE(offset) !== 0x04034b50) fail("ZIP 压缩或大小");
    const localNameSize = bytes.readUInt16LE(offset + 26), localExtra = bytes.readUInt16LE(offset + 28);
    const localName = bytes.subarray(offset + 30, offset + 30 + localNameSize).toString("utf8");
    const begin = offset + 30 + localNameSize + localExtra;
    if (localName !== name || begin + compressed > start || bytes.readUInt16LE(offset + 8) !== method) fail("ZIP 本地成员");
    const data = bytes.subarray(begin, begin + compressed);
    const decoded = method === 8 ? inflateRawSync(data, { maxOutputLength: 16 * 1024 * 1024 }) : data;
    if (decoded.length !== length || crc32(decoded) !== expectedCRC) fail("ZIP 解压长度 / CRC");
    members.set(name, decoded.toString("utf8"));
  }
  if (cursor !== end || !members.has("xl/workbook.xml") || !members.has("xl/worksheets/sheet1.xml")) fail("XLSX 第一张表缺失");
  const workbook = children(xmlNodes(members.get("xl/workbook.xml")), "workbook")[0];
  const sheets = workbook && children(workbook, "sheets")[0];
  if (!sheets || children(sheets, "sheet").length !== 1) fail("XLSX 工作表结构改变");
  const strings = members.has("xl/sharedStrings.xml") ? children(children(xmlNodes(members.get("xl/sharedStrings.xml")), "sst")[0], "si").map(xmlText) : [];
  const worksheet = children(xmlNodes(members.get("xl/worksheets/sheet1.xml")), "worksheet")[0];
  const sheet = worksheet && children(worksheet, "sheetData")[0];
  if (!sheet) fail("XLSX sheetData");
  const rows = children(sheet, "row").map(row => {
    const values = {};
    for (const cell of children(row, "c")) {
      const ref = /^([A-Z]+)\d+$/.exec(cell.attrs.r || "");
      if (!ref || Object.hasOwn(values, ref[1])) fail("XLSX 单元格引用");
      const value = children(cell, "v")[0];
      const raw = value ? xmlText(value) : "";
      if (cell.attrs.t === "s") {
        if (!/^\d+$/.test(raw) || Number(raw) >= strings.length) fail("XLSX 共享字符串");
        values[ref[1]] = strings[Number(raw)];
      } else if (cell.attrs.t === "inlineStr") values[ref[1]] = children(cell, "is").map(xmlText).join("");
      else if (!raw) values[ref[1]] = null;
      else if (cell.attrs.t === "str") values[ref[1]] = raw;
      else if (!cell.attrs.t || cell.attrs.t === "n") { if (!Number.isFinite(Number(raw))) fail("XLSX 数值"); values[ref[1]] = Number(raw); }
      else fail("XLSX 单元格类型改变");
    }
    return values;
  });
  const headers = rows.shift();
  if (!headers || ["Model", "Max steps", "Success rate", "Success/Total", "Date"].some(name => !Object.values(headers).includes(name))) fail("Verified 列名改变");
  return rows.map(values => Object.fromEntries(Object.entries(headers).filter(([, name]) => typeof name === "string" && name).map(([column, name]) => [name, values[column] ?? null]))).filter(row => row.Model);
}

/** All score fields are explicit. @param {string} id @param {string} model @param {number} score @param {Source} source */
function scoreRow(id, model, score, source) {
  return { id: "", benchmarkId: id, model: string(model, "模型名"), reasoning: null, agent: null, score: number(score, "百分比", 100), costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: source.url, checkedAt: source.checkedAt };
}
function board(id, family, name, version, metric, description, configuration, scope, source, sourceUpdatedAt = null) {
  return { id, family, name, version, category: family === "OSWorld" ? "电脑操作" : "知识与推理", metric, unit: "%", description, configuration, scope, sourceUrl: source.url, sourceUpdatedAt, checkedAt: source.checkedAt };
}
function excelDate(value) {
  if (typeof value === "number") return date(new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10));
  return date(value);
}
function flag(value) { if (!["Yes", "No"].includes(value)) fail("Verified 工具标志"); return value; }

function verified(source, page) {
  if (!source.bytes || !page.text.includes("OSWorld-Verified")) fail("Verified 原始字节或官方说明");
  const rows = xlsxRows(source.bytes), groups = new Map();
  for (const row of rows) {
    if (["🚧", "-"].includes(row["Success rate"])) continue;
    number(row["Success rate"], "Verified 成绩", 100);
    const steps = number(row["Max steps"], "Verified 步数"), approach = string(row["Approach type"], "Verified 类型");
    if (!Number.isInteger(steps) || !["General model", "Specialized model", "Agentic framework"].includes(approach)) fail("Verified 步数 / 类型");
    const fraction = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*$/.exec(row["Success/Total"] || "");
    if (!fraction || Number(fraction[2]) <= 0 || Number(fraction[2]) > 369 || Number(fraction[1]) > Number(fraction[2])) fail("Verified 实际样本数");
    const denominator = Number(fraction[2]);
    row.ratioMismatch = Math.abs(row["Success rate"] - Number(fraction[1]) / denominator * 100) > 0.11;
    const config = [steps, approach, flag(row["Additional a11y tree used"]), flag(row["Additional coding-based action"]), flag(row["Multiple rollout"]), denominator];
    const model = string(row.Model, "Verified 模型");
    const key = JSON.stringify([config, model]);
    const entry = groups.get(key) || { config, model, rows: [] };
    entry.rows.push(row); groups.set(key, entry);
  }
  if (!groups.size) fail("Verified 无可用成绩");
  const boards = new Map(), scores = [];
  for (const group of groups.values()) {
    const [steps, approach, a11y, coding, rollout, count] = group.config;
    const id = "osworld-verified-" + hash(JSON.stringify(group.config));
    const dates = group.rows.map(row => excelDate(row.Date));
    const latest = dates.slice().sort().at(-1);
    if (!boards.has(id)) boards.set(id, board(id, "OSWorld", "OSWorld Verified · " + steps + " 步 · " + count + " 项 · " + approach, "Verified / 2025-07-28 upgrade", "任务成功率", "修订后的真实桌面任务；同配置与相同实际样本数的重复实跑取均值。", "最大步数 " + steps + "；" + approach + "；额外 a11y=" + a11y + "；coding action=" + coding + "；multiple rollout=" + rollout, "官方 Verified 文件；实际 " + count + "/369 项。不同样本数、步数与工具配置分表，Agent 成绩不是裸模型分数；不混入 self-reported 或原版 2024 结果。", { ...page, checkedAt: source.checkedAt }, latest));
    else if (latest > boards.get(id).sourceUpdatedAt) boards.get(id).sourceUpdatedAt = latest;
    const values = group.rows.map(row => row["Success rate"]), mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    const result = scoreRow(id, group.model, mean, { ...page, checkedAt: source.checkedAt });
    result.steps = steps; result.agent = approach;
    result.uncertainty = values.length + " 次实跑；总体标准差 " + sd.toFixed(2) + " 个百分点；官方 Date " + [...new Set(dates)].sort().join("、") + "（非明确评测时间）";
    if (group.rows.some(row => row.ratioMismatch)) result.uncertainty += "；原表 Success rate 与 Success/Total 有超过 0.11 个百分点差异，保留官方显示百分比，未自行重算。";
    scores.push(result);
  }
  return { benchmarks: [...boards.values()], scores };
}

function osworld2(source) {
  const data = JSON.parse(source.text);
  if (data.benchmarkVersion !== "OSWorld 2.0" || !Array.isArray(data.results) || !data.results.length || !Array.isArray(data.releaseVersions)) fail("OSWorld 2.0 JSON");
  const datasetSize = number(data.datasetSize, "2.0 全集样本数"), updated = date(data.updatedAt), boards = new Map(), scores = [];
  for (const row of data.results) {
    const release = row.releaseVersion ?? data.defaultResultReleaseVersion ?? data.taskVersion;
    const scope = row.datasetScope ?? data.defaultResultDatasetScope;
    const steps = number(row.stepBudget, "2.0 步数"), modelType = row.modelType;
    if (!data.releaseVersions.includes(release) || !["full", "offline"].includes(scope) || !["e2e", "agent"].includes(modelType) || !Number.isInteger(steps)) fail("2.0 版本 / 子集 / 类型");
    if (row.official !== true && modelType !== "agent") fail("2.0 官方记录标志");
    const tool = typeof row.toolSetting === "string" ? row.toolSetting : fail("2.0 工具配置");
    for (const metric of ["binaryAccuracy", "partialScore"]) {
      const config = [release, scope, steps, tool, modelType, metric], id = "osworld-2-" + hash(JSON.stringify(config));
      if (!boards.has(id)) boards.set(id, board(id, "OSWorld", "OSWorld 2.0 · " + release + " · " + scope + " · " + steps + " 步 · " + (metric === "binaryAccuracy" ? "完整完成" : "部分得分"), release, metric === "binaryAccuracy" ? "完整任务完成率" : "部分检查点得分", "长流程桌面操作；完整任务二元通过率与部分检查点得分分别统计。", "最大步数 " + steps + "；" + (tool || "工具设定未注明") + "；" + modelType + "；推理档位随每行显示", scope === "full" ? "官方全套 " + datasetSize + " 项；同版本与配置分表。Agent 条目为公开投稿，并附复现入口，不能视为官方团队独立实跑；官网未声明每条 trial 数。" : "官方 offline 子集；入口未公布该版本子集分母，不推定为 " + datasetSize + " 项。相同版本与配置分表，未注明 trial 数。", { ...source, url: V2 }, updated));
      const result = scoreRow(id, row.model, row[metric], { ...source, url: V2 });
      result.reasoning = string(row.reasoning, "2.0 reasoning"); result.steps = steps;
      result.agent = modelType === "agent" ? string(row.model, "2.0 Agent") + (row.basePlannerModel ? " / planner " + string(row.basePlannerModel, "planner") : "") : "官方 e2e / " + (tool || "unspecified");
      if (row.outputTokensPerTask !== undefined) result.tokens = number(row.outputTokensPerTask, "每任务输出 tokens");
      if (row.costPerTaskUsd !== undefined) { result.costUSD = number(row.costPerTaskUsd, "每任务费用"); result.costNote = "官方 costPerTaskUsd；实跑均值，不是订阅单价。"; }
      else if (row.estimatedCostUsd !== null && row.estimatedCostUsd !== undefined) {
        const total = number(row.estimatedCostUsd, "评测总费用");
        result.costNote = "官方 estimatedCostUsd 总额 $" + total + "；重复评测次数与费用分母未明确，不折算为每任务费用。";
      }
      if (modelType === "agent") result.uncertainty = "公开 Agent 投稿；复现链接与轨迹由提交方提供，未声明官方团队独立复核。";
      scores.push(result);
    }
  }
  return { benchmarks: [...boards.values()], scores };
}

function htmlTables(html) {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(table => [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(row => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => plain(cell[1]))));
}
function originalHLE(source) {
  const tables = htmlTables(source.text).filter(rows => rows[0]?.[0] === "Model" && rows[0][1]?.includes("Accuracy") && rows[0][2]?.includes("Calibration"));
  if (tables.length !== 1 || !source.text.includes("April 3rd, 2025") || !plain(source.text).includes("text-only subset")) fail("HLE CAIS 量化表与版本");
  const boards = new Map(), scores = [];
  for (const row of tables[0].slice(1)) {
    if (row.length !== 3 || !/^[\d.]+$/.test(row[1]) || !/^[\d.]+$/.test(row[2])) fail("HLE 表格行");
    const textOnly = row[0].endsWith("*"), id = textOnly ? "hle-cais-2025-text-only" : "hle-cais-2025-multimodal";
    if (!boards.has(id)) boards.set(id, board(id, "HLE", "HLE · CAIS 原始量化表 · " + (textOnly ? "纯文本" : "多模态"), "Finalized dataset / 2025-04-03", "正确率", "专家知识与推理的闭卷问答，o3-mini 判卷；仅该站现有量化示例，未声称覆盖最新全部模型。", "CAIS 公布量化表；无工具闭卷；模型精确 API ID、推理档位及 trials 未全部注明；显示值保留官网一位小数精度", textOnly ? "仅文本子集，不能与 2,500 项多模态全集横比；官网未在表中注明分母。2025-04-03 为试题版本日期，并非榜单更新时间。" : "2,500 项公开多模态题；不含私有保留集，不与 Preview、Rolling 或 Diamond 混合。2025-04-03 为试题更新日期，非每个模型运行日期或榜单更新时间。", source));
    const result = scoreRow(id, row[0], Number(row[1]), source);
    result.uncertainty = "官网显示为一位小数；RMS Calibration Error=" + number(Number(row[2]), "校准误差", 100) + "%（不是正确率的置信区间）；未提供日期与推理档位。";
    scores.push(result);
  }
  if (!scores.length) fail("HLE 量化表为空");
  return { benchmarks: [...boards.values()], scores };
}

/** Decode only quoted data literals. Never execute downloaded JavaScript. */
function jsString(raw) {
  return raw.replace(/\\(?:u([\da-f]{4})|x([\da-f]{2})|([\s\S]))/gi, (_, unicode, hex, char) => unicode ? String.fromCharCode(parseInt(unicode, 16)) : hex ? String.fromCharCode(parseInt(hex, 16)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" })[char] ?? char);
}
function flightTables(html) {
  const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)].map(match => JSON.parse(match[1])).join("");
  const found = [];
  const walk = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.headers) && Array.isArray(value.rows)) found.push(value);
    for (const item of Object.values(value)) walk(item);
  };
  for (const line of payload.split("\n")) {
    const item = /^[\da-f]+:(\[[\s\S]*|\{[\s\S]*)$/.exec(line);
    if (item) walk(JSON.parse(item[1]));
  }
  return found;
}
function percent(value) { if (typeof value !== "string" || !/^\d+(?:\.\d+)?%$/.test(value)) fail("Diamond 百分比"); return number(Number(value.slice(0, -1)), "Diamond 百分比", 100); }
function harnesses(source) {
  const document = JSON.parse(source.text);
  if (document.path !== "docs/evaluation-with-tools.md" || document.encoding !== "base64" || typeof document.content !== "string" || !/^[\da-f]{40}$/.test(document.sha)) fail("HLE 官方工具文档 API");
  const encoded = document.content.replace(/\s/g, "");
  if (!/^[A-Za-z\d+/]+={0,2}$/.test(encoded)) fail("HLE 文档 base64");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== document.size || bytes.toString("base64") !== encoded || bytes.length > 65536 || createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex") !== document.sha) fail("HLE 文档 Git blob 哈希");
  const lines = bytes.toString("utf8").split(/\r?\n/), start = lines.findIndex(line => /^\|\s*Model\s*\|\s*Harness\s*\|\s*Version\s*\|\s*$/.test(line));
  if (start < 0 || !/^\|[\s|:-]+\|$/.test(lines[start + 1] || "")) fail("HLE 官方工具 Harness 版本表");
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith("|"); i++) rows.push(lines[i].split("|").slice(1, -1).map(value => value.trim()));
  if (!rows.length) fail("HLE 工具 Harness 表为空");
  const map = new Map();
  for (const row of rows) {
    if (row.length !== 3 || !/^\d+\.\d+\.\d+$/.test(row[2])) fail("工具 Harness 行");
    for (const model of row[0].split(/,\s*/)) { if (map.has(model)) fail("重复工具 Harness"); map.set(model, row[1] + " " + row[2]); }
  }
  return map;
}

async function diamond(get, source) {
  const scripts = [...source.text.matchAll(/<script\b[^>]*src="([^\"]+)"/g)].map(match => match[1]).filter(url => /^\/_next\/static\/chunks\/app\/blog\/hle-diamond\/page-[\w-]+\.js$/.test(url));
  if (scripts.length !== 1 || !plain(source.text).includes("1,000 questions")) fail("Diamond 官方页面版本或数据块");
  const client = await get(new URL(scripts[0], HLE).href);
  const literals = [...client.text.matchAll(/JSON\.parse\('((?:\\.|[^'\\])*)'\)/g)].map(match => JSON.parse(jsString(match[1])));
  const highSets = literals.filter(value => value && !Array.isArray(value) && Object.values(value).length && Object.values(value).every(row => Array.isArray(row) && row.length === 3 && row.every(score => typeof score === "number")));
  const metadataSets = literals.filter(value => value && !Array.isArray(value) && Object.values(value).length && Object.values(value).every(row => row && typeof row === "object" && typeof row.logo === "string"));
  if (highSets.length !== 1 || metadataSets.length !== 1 || !/useState\)\("high"\)/.test(client.text) || !client.text.includes('"max"')) fail("Diamond high / max 数据绑定改变");
  const high = highSets[0], metadata = metadataSets[0], tables = flightTables(source.text);
  const maxTables = tables.filter(table => JSON.stringify(table.headers) === JSON.stringify(["Model", "Accuracy"]));
  const toolTables = tables.filter(table => JSON.stringify(table.headers) === JSON.stringify(["Model", "Without tools", "With tools"]));
  if (maxTables.length !== 1 || toolTables.length !== 1 || !maxTables[0].rows.length || !toolTables[0].rows.length) fail("Diamond 原始成绩表");
  const toolHarnesses = harnesses(await get(GUIDE));
  const boards = new Map(), scores = [];
  const add = (model, effort, tools, value) => {
    const info = metadata[model];
    if (!info) fail("Diamond 模型元数据缺失");
    const textOnly = info.textOnly === true, id = "hle-diamond-2026-" + effort + "-" + (tools ? "web-code" : "closed-book") + "-" + (textOnly ? "text" : "multimodal");
    if (!boards.has(id)) boards.set(id, board(id, "HLE", "HLE Diamond · " + effort + " · " + (tools ? "web+code" : "无工具") + " · " + (textOnly ? "纯文本" : "多模态"), "Diamond / release 2026-09-22", "正确率", "公开清洗题集，500 道推理题和 500 道知识题；high / max 和 web+code 独立协议。", "reasoning " + effort + "；" + (tools ? "web_search + web_fetch + Python；限制检索答案与沙箱网络；厂商 CLI/version 随行显示" : "closed-book；无工具；high 取客户端 JSON，max 取原始 SSR 的切换表") + "；官网未声明 pass@k / 重复 trials", textOnly ? "官方显式 textOnly 模型，仅文本子集，分母未注明；不能与 1,000 道多模态题横比。" : "1,000 道公开多模态题，不含私有保留集；不是 HLE 原版 2,500 题或 Rolling。费用未公布；官网 tokens 部分来自不同批次并含重试，未绑定为本表 tokens。发布日不是已知的成绩更新日。", source));
    const result = scoreRow(id, model, value, source); result.reasoning = effort;
    if (tools) { result.agent = toolHarnesses.get(model); if (!result.agent) fail("Diamond 模型工具 Harness 缺失"); }
    scores.push(result);
  };
  for (const [model, values] of Object.entries(high)) add(model, "high", false, values[0]);
  for (const row of maxTables[0].rows) { if (!Array.isArray(row) || row.length !== 2) fail("Diamond max 行"); add(row[0], "max", false, percent(row[1])); }
  for (const row of toolTables[0].rows) {
    if (!Array.isArray(row) || row.length !== 3 || !high[row[0]] || percent(row[1]) !== high[row[0]][0]) fail("Diamond tools / high 对照改变");
    add(row[0], "high", true, percent(row[2]));
  }
  return { benchmarks: [...boards.values()], scores };
}

/** Official publisher sources only. Malformed / unavailable required sources abort the refresh. @param {Getter} get */
async function collect(get) {
  const v1Page = await get(V1), v1Data = await get(V1 + "static/data/osworld_verified_results.xlsx");
  const v2 = await get(V2 + "static/data/leaderboard/official-results.json?v=leaderboard-sai-v4");
  const hle = await get(HLE), diamondPage = await get(DIAMOND);
  const batches = [verified(v1Data, v1Page), osworld2(v2), originalHLE(hle), await diamond(get, diamondPage)];
  const benchmarks = batches.flatMap(batch => batch.benchmarks), scores = batches.flatMap(batch => batch.scores);
  const ids = new Set();
  for (const row of scores) {
    const key = JSON.stringify([row.benchmarkId, row.model, row.reasoning, row.agent]);
    if (ids.has(key)) fail("重复模型 / 协议 / Agent"); ids.add(key);
  }
  return { benchmarks, scores };
}
module.exports = { collect };
