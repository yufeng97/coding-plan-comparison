#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { buildMaintenance, parseArgs, rssOf } = require("./build-maintenance");
const { seededHistory, canonical, changeOf, validateHistory } = require("./history");
const { rewindToFullAudit } = require("../tests/full-audit-baseline");
const workspace = path.resolve(__dirname, "../..");
const outputs = ["data/change-history.json", "data/maintenance.json", "js/maintenance-data.js", "changes.xml"];

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-maintenance-test-"));
  try {
    for (const file of ["index.html", "js", "css", "libs"]) fs.cpSync(path.join(workspace, file), path.join(root, file), { recursive: true });
    fs.mkdirSync(path.join(root, "audit"));
    fs.mkdirSync(path.join(root, "config"));
    fs.copyFileSync(path.join(workspace, "audit/pricing-verification-2026-10-04.json"), path.join(root, "audit/pricing-verification-2026-10-04.json"));
    /* 用例按 10-04 全量台账的快照断言；增量核查后的仓库数据先回放到该基线。 */
    rewindToFullAudit(root, workspace);
    const snapshot = () => outputs.map((file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)).toString("base64") : null);
    const calendar = (events) => fs.writeFileSync(path.join(root, "config/review-calendar.json"), JSON.stringify({ schemaVersion: 1, events }));
    // Generated files copied as part of js must not affect the initial output snapshot.
    fs.rmSync(path.join(root, "js/maintenance-data.js"), { force: true });
    run({ root, snapshot, calendar });
  } finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-maintenance-test-")) throw new Error("拒绝清理未知维护测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}

let passed = 0;
function test(name, run) { fixture(run); passed++; console.log("  ✓ " + name); }

test("10-04真实台账只生成22条可证差异，保持日期与稳定永久身份", ({ root }) => {
  const history = seededHistory(root);
  const audit = JSON.parse(fs.readFileSync(path.join(root, "audit/pricing-verification-2026-10-04.json"), "utf8"));
  assert.equal(history.changes.length, 22);
  for (const change of history.changes) {
    assert.equal(change.checkedAt, "2026-10-04");
    const record = audit.records.find((row) => row.id === change.id && row.kind === change.kind);
    assert.equal(record.status, "changed");
    assert.ok(change.sourceUrls.length);
    for (const field of change.fields) {
      assert.ok(Object.hasOwn(record.old, field) && Object.hasOwn(record.current, field));
      assert.equal(canonical(change.before[field]), canonical(record.old[field]));
      assert.equal(canonical(change.after[field]), canonical(record.current[field]));
      assert.notEqual(canonical(change.before[field]), canonical(change.after[field]));
    }
  }
  assert.equal(changeOf({ priceM: 20 }, { priceM: 20 }, { id: "plan-test", kind: "plan", vendor: "Example", name: "Pro", checkedAt: "2026-10-04", sourceUrls: ["https://example.com"] }), null);
});

test("Oct8摘要统计真实逐行年龄，待核与过期独立，生成不改核价事实", ({ root }) => {
  const file = path.join(root, "js/data.js");
  const before = fs.readFileSync(file);
  const { maintenance } = buildMaintenance(root, { asOf: "2026-10-08" });
  assert.equal(maintenance.generatedAt, "2026-10-08");
  assert.equal(maintenance.checkedThrough, "2026-10-04");
  assert.deepEqual(maintenance.summary, { total: 258, verified: 219, unverified: 24, stale: 0 });
  assert.ok(maintenance.records.every((record) => record.ageDays === 4 && !record.stale && record.sourceUrls.length));
  assert.ok(fs.readFileSync(file).equals(before));
  const at13 = buildMaintenance(root, { asOf: "2026-10-17" }).maintenance;
  assert.equal(at13.summary.stale, 0);
  const at14 = buildMaintenance(root, { asOf: "2026-10-18" }).maintenance;
  assert.equal(at14.summary.stale, 258);
  assert.equal(at14.summary.unverified, 24);
});

test("变更事实被改动不能沿用旧ID，JSON键顺序不影响身份，生成前拒绝篡改历史", ({ root, snapshot }) => {
  const original = seededHistory(root);
  assert.doesNotThrow(() => validateHistory(original));
  const reordered = structuredClone(original);
  reordered.changes[0].before = Object.fromEntries(Object.entries(reordered.changes[0].before).reverse());
  reordered.changes[0].after = Object.fromEntries(Object.entries(reordered.changes[0].after).reverse());
  assert.doesNotThrow(() => validateHistory(reordered), "只改变JSON键顺序不代表已确认事实变化");
  for (const mutate of [
    (c) => { c.after[c.fields[0]] = "改动的事实"; },
    (c) => { c.before[c.fields[0]] = "改动的历史基值"; },
    (c) => { c.name += " 修改名称"; },
    (c) => { c.sourceUrls = ["https://example.com/different-evidence"]; },
    (c) => { c.checkedAt = "2026-10-05"; },
  ]) {
    const altered = structuredClone(original);
    mutate(altered.changes[0]);
    assert.throws(() => validateHistory(altered), /哈希不一致/, "变更身份涵盖事实、名称、来源及确认日期");
  }
  buildMaintenance(root, { asOf: "2026-10-08" });
  const file = path.join(root, "data/change-history.json");
  const altered = structuredClone(original);
  altered.changes[0].after[altered.changes[0].fields[0]] = "改动的事实";
  fs.writeFileSync(file, JSON.stringify(altered));
  const before = snapshot();
  assert.throws(() => buildMaintenance(root, { asOf: "2026-10-08" }), /哈希不一致/);
  assert.throws(() => buildMaintenance(root, { check: true }), /哈希不一致/);
  assert.deepEqual(snapshot(), before, "不能把改动后的事实重新导出到旧RSS GUID和已读ID");
});

test("人工促销到期/生效日历仅生成复查提醒，未知事实不抬核查日期", ({ root, calendar }) => {
  calendar([
    { id: "promo-end", title: "优惠到期需复核", planIds: ["plan-0002"], reviewOn: "2026-10-07", source: "https://claude.com/pricing", note: "结束后价格尚未确认。" },
    { id: "future-rate", title: "新价格生效需复核", vendor: "Anthropic", reviewOn: "2026-10-14", source: "https://claude.com/pricing" },
    { id: "today", title: "今日复查", reviewOn: "2026-10-08", source: "https://example.com/pricing" },
  ]);
  const { maintenance } = buildMaintenance(root, { asOf: "2026-10-08" });
  assert.deepEqual(maintenance.reviews.map((event) => [event.id, event.daysUntil, event.overdue, event.due]), [["promo-end", -1, true, true], ["today", 0, false, true], ["future-rate", 6, false, false]]);
  assert.ok(maintenance.reviews.find((event) => event.id === "future-rate").planIds.includes("plan-0002"));
  assert.equal(maintenance.records.find((record) => record.id === "plan-0002").checkedAt, "2026-10-04");
  assert.equal(maintenance.changes.length, 22);
});

test("JSON/classicJS事实相同，file协议可读取，RSS只含真实changes且同日幂等", ({ root, snapshot }) => {
  buildMaintenance(root, { asOf: "2026-10-08" });
  const before = snapshot();
  assert.equal(buildMaintenance(root, { asOf: "2026-10-08", rename: () => { throw new Error("幂等生成不应写入"); } }).filesChanged, 0);
  assert.deepEqual(snapshot(), before);
  const json = JSON.parse(fs.readFileSync(path.join(root, "data/maintenance.json"), "utf8"));
  const box = {};
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root, "js/maintenance-data.js"), "utf8") + ";globalThis.value=MAINTENANCE;", box);
  assert.equal(JSON.stringify(box.value), JSON.stringify(json));
  const rss = fs.readFileSync(path.join(root, "changes.xml"), "utf8");
  assert.equal((rss.match(/<item>/g) || []).length, 22);
  assert.ok(rss.includes(new Date("2026-10-04T00:00:00Z").toUTCString()));
  assert.ok(rss.includes("#table") && !rss.includes("?plan="));
  const escaped = rssOf({ changes: [{ ...json.changes[0], vendor: "A&B", name: "<Pro>", before: { note: "old" }, after: { note: "<script>" }, fields: ["note"] }] }, "https://example.com/");
  assert.ok(escaped.includes("A&amp;B") && escaped.includes("&lt;Pro&gt;") && escaped.includes("&lt;script&gt;") && !escaped.includes("<script>"));
});

test("生成第四文件失败回滚全部新产物，已有产物更新失败恢复原值", ({ root, snapshot }) => {
  const before = snapshot();
  let calls = 0;
  assert.throws(() => buildMaintenance(root, { asOf: "2026-10-08", rename: (from, to) => { if (++calls === 4) throw new Error("rss fixture"); fs.renameSync(from, to); } }), /rss fixture/);
  assert.deepEqual(snapshot(), before);
  buildMaintenance(root, { asOf: "2026-10-08" });
  const existing = snapshot();
  calls = 0;
  assert.throws(() => buildMaintenance(root, { asOf: "2026-10-18", rename: (from, to) => { if (++calls === 2) throw new Error("update fixture"); fs.renameSync(from, to); } }), /update fixture/);
  assert.deepEqual(snapshot(), existing);
});

test("非法摘要日期/阈值、日历日期、永久引用与来源在写入前拒绝", ({ root, calendar, snapshot }) => {
  const before = snapshot();
  assert.throws(() => buildMaintenance(root, { asOf: "2026-02-30" }), /日期/);
  assert.throws(() => buildMaintenance(root, { asOf: "2026-10-03" }), /早于/);
  assert.throws(() => buildMaintenance(root, { asOf: "2026-10-08", staleDays: 0 }), /阈值/);
  for (const event of [
    { id: "bad", title: "Bad", reviewOn: "2026-02-30", source: "https://example.com" },
    { id: "bad", title: "Bad", reviewOn: "2026-10-08", source: "javascript:alert(1)" },
    { id: "bad", title: "Bad", reviewOn: "2026-10-08", source: "https://example.com", planIds: ["plan-missing"] },
    { id: "bad", title: "Bad", reviewOn: "2026-10-08", source: "https://example.com", vendor: "OpenAI Codex（ChatGPT）" },
  ]) {
    calendar([event]);
    assert.throws(() => buildMaintenance(root, { asOf: "2026-10-08" }), /日历/);
    assert.deepEqual(snapshot(), before);
  }
  assert.deepEqual(parseArgs(["--as-of", "2026-10-08", "--stale-days", "30", "--site", "https://example.com/"]), { asOf: "2026-10-08", staleDays: 30, site: "https://example.com/" });
  assert.throws(() => parseArgs(["--as-of"]), /缺值/);
});

test("--check只读复用已存日期与参数，显式asOf变化才要求重新生成", ({ root, snapshot }) => {
  assert.throws(() => buildMaintenance(root, { check: true }), /产物缺失/);
  buildMaintenance(root, { asOf: "2026-10-08", staleDays: 30, site: "https://example.com/" });
  const before = snapshot();
  const result = buildMaintenance(root, { check: true, rename: () => { throw new Error("只读检查不应写文件"); } });
  assert.equal(result.checked, true);
  assert.equal(result.maintenance.generatedAt, "2026-10-08");
  assert.equal(result.maintenance.staleAfterDays, 30);
  assert.equal(result.filesChanged, 0);
  assert.deepEqual(snapshot(), before);
  assert.throws(() => buildMaintenance(root, { check: true, asOf: "2026-10-09" }), /产物过期/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(parseArgs(["--check", "--as-of", "2026-10-08"]), { check: true, asOf: "2026-10-08" });
});

test("--check检测data事实/history/calendar变化与丢失产物，不改任何输出", ({ root, calendar, snapshot }) => {
  buildMaintenance(root, { asOf: "2026-10-08" });
  const dataFile = path.join(root, "js/data.js");
  fs.appendFileSync(dataFile, '\nPLANS.find(p=>p.id==="plan-0002").note+="；新的官网说明。";\n');
  let before = snapshot();
  assert.throws(() => buildMaintenance(root, { check: true }), /产物过期/);
  assert.deepEqual(snapshot(), before);
  buildMaintenance(root, { asOf: "2026-10-08" });
  const historyFile = path.join(root, "data/change-history.json");
  const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
  history.changes.pop();
  fs.writeFileSync(historyFile, JSON.stringify(history));
  before = snapshot();
  assert.throws(() => buildMaintenance(root, { check: true }), /产物过期/);
  assert.deepEqual(snapshot(), before);
  buildMaintenance(root, { asOf: "2026-10-08" });
  calendar([{ id: "new-review", title: "新的官方公告复查", reviewOn: "2026-10-14", source: "https://example.com/pricing" }]);
  before = snapshot();
  assert.throws(() => buildMaintenance(root, { check: true }), /产物过期/);
  assert.deepEqual(snapshot(), before);
  buildMaintenance(root, { asOf: "2026-10-08" });
  fs.unlinkSync(path.join(root, "js/maintenance-data.js"));
  before = snapshot();
  assert.throws(() => buildMaintenance(root, { check: true }), /js\/maintenance-data/);
  assert.deepEqual(snapshot(), before);
  buildMaintenance(root, { asOf: "2026-10-08" });
  fs.appendFileSync(path.join(root, "changes.xml"), "tampered");
  before = snapshot();
  assert.throws(() => buildMaintenance(root, { check: true }), /changes\.xml/);
  assert.deepEqual(snapshot(), before);
});

console.log("维护摘要回归：" + passed + " 通过");
