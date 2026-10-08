#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fetchSource, publicURL } = require("../news/network");
const root = path.resolve(__dirname, "../..");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
const hosts = new Set(["deepswe.datacurve.ai", "cursor.com", "www.cursor.com", "osworld-v1.xlang.ai", "osworld-v2.xlang.ai", "lastexam.ai", "www.lastexam.ai", "labs.scale.com", "www.swebench.com", "swebench.com", "github.com", "api.github.com"]);
function officialURL(value) {
  const url = publicURL(value, true);
  if (!hosts.has(url.hostname) || url.port) throw new Error("未登记的评测官方来源：" + url.hostname);
  if (url.hostname === "github.com" && url.pathname !== "/centerforaisafety/hle/blob/main/docs/evaluation-with-tools.md") throw new Error("未登记的评测官方仓库路径");
  if (url.hostname === "api.github.com" && url.pathname !== "/repos/centerforaisafety/hle/contents/docs/evaluation-with-tools.md") throw new Error("未登记的评测官方仓库 API 路径");
  return url.href;
}
function text(value, label, max = 3000) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008]/.test(value)) throw new Error(label + " 无效");
}
function iso(value, label, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value || Date.parse(value) > now + 60000) throw new Error(label + " 必须是实际 UTC ISO 核查时间");
}
function date(value, label, now = Date.now()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || Date.parse(value) > now + 86400000) throw new Error(label + " 日期无效");
}
function rowId(row) { return "score-" + digest(JSON.stringify([row.benchmarkId, row.model, row.reasoning, row.agent])).slice(0, 24); }
/** Public rows have one grain: protocol + exact model + reasoning + agent. */
function validatePublic(data, now = Date.now()) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.benchmarks) || !data.benchmarks.length || !Array.isArray(data.scores) || !data.scores.length || !Array.isArray(data.artifacts) || !data.artifacts.length) throw new Error("公开评测快照缺少榜单、成绩或原始来源");
  iso(data.checkedAt, "快照核查时间", now);
  const boards = new Map(), ids = new Set();
  for (const board of data.benchmarks) {
    if (!/^[a-z0-9-]+$/.test(board.id) || boards.has(board.id)) throw new Error("重复或无效的评测协议 ID");
    for (const key of ["family", "name", "version", "category", "metric", "description", "configuration", "scope"]) text(board[key], key);
    if (board.unit !== "%") throw new Error("当前仅支持百分比指标，禁止静默转换新口径");
    officialURL(board.sourceUrl); iso(board.checkedAt, "榜单核查时间", now);
    if (Date.parse(board.checkedAt) > Date.parse(data.checkedAt)) throw new Error("榜单核查时间晚于快照");
    if (board.sourceUpdatedAt !== null) date(board.sourceUpdatedAt, "官方更新", now);
    boards.set(board.id, board);
  }
  for (const row of data.scores) {
    const board = boards.get(row.benchmarkId);
    if (!board) throw new Error("成绩引用了未知评测协议");
    text(row.model, "精确模型名", 500);
    for (const key of ["reasoning", "agent", "costNote", "uncertainty"]) if (row[key] !== null) text(row[key], key, 2000);
    if (row.id !== rowId(row) || ids.has(row.id)) throw new Error("成绩身份重复或不稳定");
    ids.add(row.id);
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 100) throw new Error("成绩必须为 0–100 的有限百分比，缺失不能补零");
    for (const key of ["costUSD", "tokens", "steps"]) if (row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0)) throw new Error(key + " 必须是非负实数或 null");
    if (row.costUSD !== null && row.costNote === null) throw new Error("公开费用必须说明口径");
    officialURL(row.sourceUrl); iso(row.checkedAt, "成绩核查时间", now);
    if (row.checkedAt !== board.checkedAt) throw new Error("成绩与协议核查时间不一致");
  }
  for (const board of data.benchmarks) if (!data.scores.some(row => row.benchmarkId === board.id)) throw new Error("不得发布空榜单：" + board.id);
  const artifacts = new Set();
  for (const item of data.artifacts) {
    officialURL(item.url); iso(item.checkedAt, "来源核查时间", now);
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || artifacts.has(item.url)) throw new Error("原始来源哈希缺失或重复");
    if (Date.parse(item.checkedAt) > Date.parse(data.checkedAt)) throw new Error("原始来源核查时间晚于快照");
    artifacts.add(item.url);
  }
  for (const board of data.benchmarks) if (!data.artifacts.some(item => new URL(item.url).hostname === new URL(board.sourceUrl).hostname)) throw new Error("评测协议缺少对应发布方的下载证据");
  return data;
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  try { fs.writeFileSync(tmp, content); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function acquireLock(workspace) {
  const dir = path.join(workspace, "audit/benchmark-sources"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, ".benchmark.lock");
  try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let abandoned = false;
    try {
      const previous = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error("无效锁");
      try { process.kill(previous.pid, 0); } catch (failure) { if (failure.code === "ESRCH") abandoned = true; }
    } catch { /* A corrupt or live lock requires inspection, never unconditional deletion. */ }
    if (!abandoned) throw new Error("公开评测正在采集或审核，请稍后重试（.benchmark.lock）");
    fs.unlinkSync(file); fs.writeFileSync(file, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  }
  return () => fs.unlinkSync(file);
}
function compareScores(previous, next) {
  const old = new Map(previous.scores.map(row => [row.id, row]));
  const current = new Map(next.scores.map(row => [row.id, row]));
  const facts = ({ checkedAt, ...row }) => canonical(row);
  return {
    added: next.scores.filter(row => !old.has(row.id)).map(row => row.id),
    changed: next.scores.filter(row => old.has(row.id) && facts(old.get(row.id)) !== facts(row)).map(row => ({ id: row.id, before: old.get(row.id), after: row })),
    removed: previous.scores.filter(row => !current.has(row.id)).map(row => row.id),
  };
}
function compareProtocols(previous, next) {
  const old = new Map(previous.benchmarks.map(board => [board.id, board]));
  const current = new Map(next.benchmarks.map(board => [board.id, board]));
  const facts = ({ checkedAt, sourceUpdatedAt, ...board }) => canonical(board);
  return {
    added: next.benchmarks.filter(board => !old.has(board.id)).map(board => board.id),
    changed: next.benchmarks.filter(board => old.has(board.id) && facts(old.get(board.id)) !== facts(board)).map(board => ({ id: board.id, before: old.get(board.id), after: board })),
    removed: previous.benchmarks.filter(board => !current.has(board.id)).map(board => board.id),
  };
}
function readPublic(workspace = root) {
  const data = validatePublic(JSON.parse(fs.readFileSync(path.join(workspace, "benchmarks/public-results.json"), "utf8")));
  const { review, ...candidate } = data;
  if (!review) throw new Error("正式公开评测缺少审核记录");
  text(review.by, "审核者", 200); text(review.reason, "审核理由", 2000); iso(review.reviewedAt, "审核时间");
  if (Date.parse(review.reviewedAt) < Date.parse(data.checkedAt) || review.candidateHash !== digest(canonical(candidate))) throw new Error("正式公开评测与审核哈希不匹配，须重新核对与 publish");
  return data;
}
/** Downloads only fixed official sources. No model calls, remote JS execution or deployment. */
/** @param {string} workspace
 * @param {{fetchSource?:Function,adapters?:Array<{id:string,collect:Function}>}} options */
async function collect(workspace = root, options = {}) {
  const release = acquireLock(workspace);
  try {
  const audit = path.join(workspace, "audit/benchmark-sources");
  const artifacts = new Map(), cache = new Map();
  const getter = options.fetchSource || fetchSource;
  const get = raw => {
    const url = officialURL(raw);
    if (!cache.has(url)) cache.set(url, (async () => {
      const response = await getter(url, { maxBytes: 8 * 1024 * 1024, timeoutMs: 25000, headers: { "user-agent": "coding-plan-comparison/public-benchmarks", accept: "*/*" } });
      const finalURL = officialURL(response.finalURL || url);
      const bytes = response.bytes || Buffer.from(response.text);
      const hash = digest(bytes), checkedAt = new Date().toISOString();
      atomicWrite(path.join(audit, "raw", hash + ".bin"), bytes);
      artifacts.set(finalURL, { url: finalURL, sha256: hash, checkedAt });
      return { text: response.text, bytes, url: finalURL, hash, checkedAt };
    })());
    return cache.get(url);
  };
  const adapters = options.adapters || [
    { id: "deepswe-cursor", collect: require("./sources/deepswe-cursor").collect },
    { id: "osworld-hle", collect: require("./sources/osworld-hle").collect },
    { id: "swebench", collect: require("./sources/swebench").collect },
  ];
  const outcomes = await Promise.allSettled(adapters.map(async adapter => {
    const piece = await adapter.collect(get);
    const candidate = { ...piece, schemaVersion: 1, checkedAt: new Date().toISOString(), scores: piece.scores.map(row => ({ ...row, id: rowId(row) })), artifacts: [...artifacts.values()] };
    validatePublic(candidate);
    return candidate;
  }));
  const healthFile = path.join(audit, "health.json");
  const previous = fs.existsSync(healthFile) ? JSON.parse(fs.readFileSync(healthFile, "utf8")) : { sources: [] };
  const checkedAt = new Date().toISOString();
  const sources = adapters.map((adapter, i) => {
    const result = outcomes[i], last = previous.sources.find(source => source.id === adapter.id);
    return { id: adapter.id, ok: result.status === "fulfilled", checkedAt, consecutiveFailures: result.status === "fulfilled" ? 0 : (last?.consecutiveFailures || 0) + 1, error: result.status === "rejected" ? String(result.reason?.message || result.reason).slice(0, 1000) : null };
  });
  atomicWrite(healthFile, JSON.stringify({ schemaVersion: 1, checkedAt, sources }, null, 2) + "\n");
  if (outcomes.some(result => result.status === "rejected")) throw new Error("公开评测采集部分失败；保留已发布数据和上一份完整候选，请查看 audit/benchmark-sources/health.json");
  const values = outcomes.map(result => result.status === "fulfilled" ? result.value : null);
  const data = { schemaVersion: 1, checkedAt, benchmarks: values.flatMap(value => value.benchmarks), scores: values.flatMap(value => value.scores).map(row => ({ ...row, id: rowId(row) })), artifacts: [...artifacts.values()] };
  validatePublic(data);
  const formal = path.join(workspace, "benchmarks/public-results.json");
  const previousData = fs.existsSync(formal) ? readPublic(workspace) : { scores: [], benchmarks: [] };
  const diff = compareScores(previousData, data), protocols = compareProtocols(previousData, data);
  atomicWrite(path.join(audit, "diff.json"), JSON.stringify({ checkedAt, ...diff, protocols }, null, 2) + "\n");
  atomicWrite(path.join(audit, "snapshots", digest(canonical(data)) + ".json"), JSON.stringify(data, null, 2) + "\n");
  atomicWrite(path.join(audit, "latest.json"), JSON.stringify(data, null, 2) + "\n");
  return data;
  } finally { release(); }
}
function publish(input, reviewer, reason, workspace = root) {
  const release = acquireLock(workspace);
  try {
  text(reviewer, "审核者", 200); text(reason, "审核理由", 2000);
  const { review: priorReview, ...inputData } = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
  const data = validatePublic(inputData);
  const candidateHash = digest(canonical(data));
  const archived = path.join(workspace, "audit/benchmark-sources/snapshots", candidateHash + ".json");
  if (!fs.existsSync(archived) || digest(canonical(JSON.parse(fs.readFileSync(archived, "utf8")))) !== candidateHash) throw new Error("候选与采集归档不匹配，请重新 collect；人工修订需先修正 adapter");
  const file = path.join(workspace, "benchmarks/public-results.json");
  if (fs.existsSync(file)) {
    const previous = validatePublic(JSON.parse(fs.readFileSync(file, "utf8")));
    if (Date.parse(data.checkedAt) < Date.parse(previous.checkedAt)) throw new Error("历史候选不得覆盖更新的正式核查日期，请重新 collect");
    for (const board of data.benchmarks) {
      const old = previous.benchmarks.find(value => value.id === board.id);
      if (old && Date.parse(board.checkedAt) < Date.parse(old.checkedAt)) throw new Error("评测协议核查日期不得倒退");
    }
  }
  // Publishing requires the actual downloaded evidence, never just a pasted leaderboard URL.
  for (const item of data.artifacts) {
    const file = path.join(workspace, "audit/benchmark-sources/raw", item.sha256 + ".bin");
    if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== item.sha256) throw new Error("缺少匹配的官方原始证据，请先 collect");
  }
  const output = { ...data, review: { by: reviewer, reason, reviewedAt: new Date().toISOString(), candidateHash } };
  atomicWrite(file, JSON.stringify(output, null, 2) + "\n");
  return output;
  } finally { release(); }
}
async function main(argv) {
  const command = argv.shift();
  if (command === "collect" && !argv.length) return collect();
  if (command === "validate" && !argv.length) return readPublic();
  if (command === "publish") {
    const options = {};
    for (let i = 0; i < argv.length; i += 2) {
      if (!["--input", "--reviewer", "--reason"].includes(argv[i]) || !argv[i + 1]) throw new Error("publish 参数需要 --input 文件 --reviewer 审核者 --reason 核查理由");
      options[argv[i].slice(2)] = argv[i + 1];
    }
    if (!options.input) throw new Error("需要 --input 官方采集候选");
    return publish(options.input, options.reviewer, options.reason);
  }
  throw new Error("使用 public-scores.js collect | validate | publish --input 文件 --reviewer 审核者 --reason 理由");
}
if (require.main === module) main(process.argv.slice(2)).then(data => console.log("公开评测：" + data.benchmarks.length + " 个独立榜单，" + data.scores.length + " 条成绩；" + data.checkedAt)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { officialURL, rowId, validatePublic, readPublic, collect, publish, main, digest, compareScores, compareProtocols };
