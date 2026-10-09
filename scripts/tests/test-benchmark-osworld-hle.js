"use strict";
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { deflateRawSync } = require("node:zlib");
const { collect } = require("../benchmarks/sources/osworld-hle");
const time = "2026-10-08T00:00:00.000Z";
const v1 = "https://osworld-v1.xlang.ai/", v2 = "https://osworld-v2.xlang.ai/", hle = "https://lastexam.ai/";
const guide = "https://api.github.com/repos/centerforaisafety/hle/contents/docs/evaluation-with-tools.md";
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("✓ " + name); }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zip(members, deflate = false) {
  const local = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(members)) {
    const bytes = Buffer.from(text), filename = Buffer.from(name), payload = deflate ? deflateRawSync(bytes) : bytes;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(deflate ? 8 : 0, 8);
    header.writeUInt32LE(crc32(bytes), 14); header.writeUInt32LE(payload.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, payload);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(crc32(bytes), 16); entry.writeUInt32LE(payload.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename); offset += header.length + filename.length + payload.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const escapeXML = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function workbook(rows, options = {}) {
  const headings = ["Model", "Approach type", "Max steps", "Additional a11y tree used", "Additional coding-based action", "Multiple rollout", "Date", "Success rate", "Success/Total"];
  const strings = [];
  const cell = (value, ref) => {
    if (value === null) return '<c r="' + ref + '"/>';
    if (typeof value === "number") return '<c r="' + ref + '"><v>' + value + "</v></c>";
    const index = strings.push(value) - 1;
    return '<c r="' + ref + '" t="s"><v>' + index + "</v></c>";
  };
  const sheet = [headings, ...rows.map(row => headings.map(key => row[key] ?? null))].map((values, i) => '<row r="' + (i + 1) + '">' + values.map((value, j) => cell(value, String.fromCharCode(65 + j) + (i + 1))).join("") + "</row>").join("");
  const members = { "xl/workbook.xml": '<workbook><sheets><sheet name="Sheet1"/></sheets></workbook>', "xl/sharedStrings.xml": "<sst>" + strings.map(value => "<si><t>" + escapeXML(value) + "</t></si>").join("") + "</sst>", "xl/worksheets/sheet1.xml": "<worksheet><sheetData>" + sheet + "</sheetData></worksheet>" };
  if (options.members) options.members(members);
  return zip(members, options.deflate);
}
function runRow(overrides = {}) { return { Model: "Fixture & exact-model", "Approach type": "General model", "Max steps": 100, "Additional a11y tree used": "No", "Additional coding-based action": "No", "Multiple rollout": "No", Date: "2026-10-05", "Success rate": 50, "Success/Total": "180/360", ...overrides }; }
function guideData() {
  const bytes = Buffer.from("# Evaluating HLE-Diamond with tools\n\n| Model | Harness | Version |\n| --- | --- | --- |\n| Model A | Provider CLI | 1.2.3 |\n");
  return JSON.stringify({ path: "docs/evaluation-with-tools.md", encoding: "base64", content: bytes.toString("base64"), size: bytes.length, sha: createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex") });
}
function fixtures() {
  const high = { "Model A": [50, 60, 40], "Text Model": [20, 25, 15] }, metadata = { "Model A": { logo: "/logo.svg" }, "Text Model": { logo: "/logo.svg", textOnly: true } };
  const tableTree = [{ headers: ["Model", "Accuracy"], rows: [["Model A", "55%"], ["Text Model", "25%"]] }, { headers: ["Model", "Without tools", "With tools"], rows: [["Model A", "50%", "70%"]] }];
  const flight = "a:" + JSON.stringify(tableTree) + "\n";
  return new Map(/** @type {Array<[string,string|Buffer]>} */ ([
    [v1, "OSWorld-Verified"], [v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow(), runRow({ "Success rate": 60, "Success/Total": "216/360" })])],
    [v2 + "static/data/leaderboard/official-results.json?v=leaderboard-sai-v4", JSON.stringify({ benchmarkVersion: "OSWorld 2.0", taskVersion: "v2.1", releaseVersions: ["v2.1"], defaultResultReleaseVersion: "v2.1", defaultResultDatasetScope: "full", datasetSize: 108, updatedAt: "2026-10-05", results: [{ model: "Model A", reasoning: "max", modelType: "e2e", toolSetting: "standard", stepBudget: 500, binaryAccuracy: 20, partialScore: 60, estimatedCostUsd: 1080, official: true }, { model: "Agent A", reasoning: "max", modelType: "agent", basePlannerModel: "Model A", toolSetting: "", stepBudget: 500, releaseVersion: "v2.1", datasetScope: "offline", binaryAccuracy: 30, partialScore: 70, costPerTaskUsd: 2.5 }] })],
    [hle, 'April 3rd, 2025 <table><tr><th>Model</th><th>Accuracy (%)</th><th>Calibration Error</th></tr><tr><td>Model A</td><td>31.0</td><td>50.0</td></tr><tr><td>Text Model*</td><td>8.5</td><td>70.0</td></tr></table>text-only subset'],
    [hle + "blog/hle-diamond", '1,000 questions <script src="/_next/static/chunks/app/blog/hle-diamond/page-test.js"></script><script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'],
    [hle + "_next/static/chunks/app/blog/hle-diamond/page-test.js", "throw new Error('remote execution must never happen'); useState)(\"high\"); \"max\"; const a=JSON.parse('" + JSON.stringify(high) + "'); const b=JSON.parse('" + JSON.stringify(metadata) + "');"],
    [guide, guideData()],
  ]));
}
/** @param {Map<string,string|Buffer>} map */
function getter(map) { return async url => { if (!map.has(url)) throw new Error("Unexpected source: " + url); const bytes = Buffer.from(map.get(url)); return { text: bytes.toString("utf8"), bytes, url, hash: createHash("sha256").update(bytes).digest("hex"), checkedAt: time }; }; }
async function rejects(change, pattern) { const map = fixtures(); change(map); await assert.rejects(collect(getter(map)), pattern); }
function v2Change(map, change) { const url = v2 + "static/data/leaderboard/official-results.json?v=leaderboard-sai-v4", data = JSON.parse(map.get(url)); change(data); map.set(url, JSON.stringify(data)); }
async function main() {
  const data = await collect(getter(fixtures()));
  await test("重复实跑保留均值、总体SD与精确实体名", () => { const row = data.scores.find(row => row.model === "Fixture & exact-model"); assert.equal(row.score, 55); assert.match(row.uncertainty, /2 次实跑.*5.00/); assert.equal(row.steps, 100); });
  await test("指标、纯文本、多模态、工具、推理档位与agent不混合", () => {
    assert.equal(data.scores.filter(row => row.model === "Model A" && row.reasoning === "high").length, 2);
    assert.equal(data.scores.find(row => row.score === 70 && row.reasoning === "high").agent, "Provider CLI 1.2.3");
    assert.equal(data.benchmarks.filter(row => row.id.includes("diamond") && row.id.endsWith("text")).length, 2);
    assert.equal(data.benchmarks.filter(row => row.family === "OSWorld" && row.name.includes("2.0")).length, 4);
  });
  await test("缺失费用为空，总评测费用不当作单次任务费", () => { const original = data.scores.find(row => row.model === "Model A" && row.steps === 500); assert.equal(original.costUSD, null); assert.match(original.costNote, /总额.*1080.*不折算/); assert.equal(data.scores.find(row => row.model === "Agent A").costUSD, 2.5); });
  await test("HLE原版纯文本脚注*只用于分表，不留在精确模型名中", async () => {
    assert.deepEqual(data.scores.filter(row => row.benchmarkId === "hle-cais-2025-text-only").map(row => [row.model, row.score]), [["Text Model", 8.5]]);
    assert.deepEqual(data.scores.filter(row => row.benchmarkId === "hle-cais-2025-multimodal").map(row => row.model), ["Model A"]);
    assert.ok(data.scores.every(row => !row.model.endsWith("*")));
    await rejects(map => map.set(hle, map.get(hle).replace("Text Model*", "*")), /模型名/);
  });
  await test("快照日期不代替官方更新或评测日期", () => { assert.equal(data.benchmarks.find(row => row.family === "HLE" && row.name.includes("Diamond")).sourceUpdatedAt, null); assert.equal(data.scores.every(row => row.checkedAt === time), true); });
  await test("store/deflate XLSX支持且不执行远程JS", async () => { const map = fixtures(); map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow()], { deflate: true })); const next = await collect(getter(map)); assert.equal(next.scores.find(row => row.model.startsWith("Fixture")).score, 50); });
  await test("步数、实际分母、额外工具与rollout差异各有协议", async () => {
    const map = fixtures(); map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow(), runRow({ "Max steps": 50 }), runRow({ "Success/Total": "180/361" }), runRow({ "Additional a11y tree used": "Yes" }), runRow({ "Multiple rollout": "Yes" })]));
    const next = await collect(getter(map)); assert.equal(next.scores.filter(row => row.model.startsWith("Fixture")).length, 5);
  });
  await test("已知未公布占位行跳过，随机非数字不能跳过", async () => { const map = fixtures(); map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow(), runRow({ Model: "Pending", "Success rate": "🚧" })])); assert.equal((await collect(getter(map))).scores.some(row => row.model === "Pending"), false); await rejects(map => map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow({ "Success rate": "soon" })])), /成绩/); });
  await test("官方百分比和fraction不符时保留原分并标注", async () => { const map = fixtures(); map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow({ "Success rate": 40 })])); const row = (await collect(getter(map))).scores.find(row => row.model.startsWith("Fixture")); assert.equal(row.score, 40); assert.match(row.uncertainty, /差异.*未自行重算/); });
  await test("ZIP路径越界拒绝", () => rejects(map => map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow()], { members: members => { members["../escape.xml"] = "x"; } })), /路径/));
  await test("ZIP截断与CRC损坏拒绝", async () => { await rejects(map => { const url = v1 + "static/data/osworld_verified_results.xlsx", b = map.get(url); map.set(url, b.subarray(0, b.length - 1)); }, /ZIP/); await rejects(map => { const url = v1 + "static/data/osworld_verified_results.xlsx", b = Buffer.from(map.get(url)); b[60] ^= 1; map.set(url, b); }, /CRC/); });
  await test("ZIP声明超大拒绝，避免解压炸弹", () => rejects(map => { const url = v1 + "static/data/osworld_verified_results.xlsx", b = Buffer.from(map.get(url)); const p = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); b.writeUInt32LE(17 * 1024 * 1024, p + 24); map.set(url, b); }, /大小/));
  await test("XML DTD、错配标签与共享索引越界拒绝", async () => {
    for (const edit of [members => { members["xl/workbook.xml"] = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///x">]>' + members["xl/workbook.xml"]; }, members => { members["xl/workbook.xml"] = "<workbook></invalid>"; }, members => { members["xl/worksheets/sheet1.xml"] = members["xl/worksheets/sheet1.xml"].replace('<v>0</v>', '<v>999999</v>'); }]) await rejects(map => map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow()], { members: edit })), /XML|共享字符串/);
  });
  await test("Verified非法分母、比例与日期不发布", async () => { for (const override of [{ "Success/Total": "180/0" }, { "Success/Total": "400/360" }, { Date: "2026-02-30" }, { "Success rate": 101 }]) await rejects(map => map.set(v1 + "static/data/osworld_verified_results.xlsx", workbook([runRow(override)])), /样本数|日期|成绩/); });
  await test("OSWorld2未知版本、指标越界、官方标志变化拒绝", async () => { for (const edit of [data => { data.results[0].releaseVersion = "future"; }, data => { data.results[0].binaryAccuracy = 101; }, data => { data.results[0].official = false; }, data => { data.updatedAt = "2026-02-30"; }]) await rejects(map => v2Change(map, edit), /版本|百分比|官方记录|日期/); });
  await test("官方JSON重复记录不静默覆盖", () => rejects(map => v2Change(map, data => data.results.push(data.results[0])), /重复/));
  await test("Diamond high工具对照变化拒绝", () => rejects(map => { const url = hle + "blog/hle-diamond"; map.set(url, map.get(url).replace("50%", "51%")); }, /对照/));
  await test("工具文档哈希/版本缺失拒绝", async () => { await rejects(map => { const j = JSON.parse(map.get(guide)); j.sha = "0".repeat(40); map.set(guide, JSON.stringify(j)); }, /哈希/); await rejects(map => { const j = JSON.parse(map.get(guide)), b = Buffer.from("| Model | Harness | Version |\n|---|---|---|\n|Wrong|CLI|1.2.3|\n"); j.content = b.toString("base64"); j.size = b.length; j.sha = createHash("sha1").update("blob " + b.length + "\0").update(b).digest("hex"); map.set(guide, JSON.stringify(j)); }, /Harness 缺失/); });
  await test("必需来源失败原样向上抛出", async () => { await assert.rejects(collect(async () => { throw new Error("offline failure"); }), /offline failure/); });
  console.log("OSWorld / HLE adapter 离线回归通过：" + passed + " 项");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
