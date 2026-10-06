#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { syncPricingAudit } = require("../build/sync-pricing-audit");
const { validateData } = require("../build/validate-data");
const workspace = path.resolve(__dirname, "../..");
const inputs = ["pricing-root.json", "pricing-relays.json", "pricing-tools.json", "pricing-cn.json"];

function dataOf(source) {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source + ";globalThis.data={META,PRICE_CHECKS,PLANS,API_PRICES,PAYG_REFERENCES};", sandbox);
  return sandbox.data;
}

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coding-plan-sync-test-"));
  try {
    for (const item of ["index.html", "js", "css", "libs"]) fs.cpSync(path.join(workspace, item), path.join(root, item), { recursive: true });
    fs.mkdirSync(path.join(root, "audit"));
    for (const file of inputs) fs.copyFileSync(path.join(workspace, "audit", file), path.join(root, "audit", file));
    const checkedAt = JSON.parse(fs.readFileSync(path.join(root, "audit", inputs[0]), "utf8")).checkedAt;
    const outputs = ["js/data.js", `audit/pricing-verification-${checkedAt}.json`, `audit/pricing-verification-${checkedAt}.csv`];
    for (const file of outputs.slice(1)) fs.copyFileSync(path.join(workspace, file), path.join(root, file));
    const snapshot = () => outputs.map((file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)).toString("base64") : null);
    const changeAudit = (patch) => {
      const file = path.join(root, "audit", inputs[0]);
      const audit = JSON.parse(fs.readFileSync(file, "utf8"));
      Object.assign(audit.records.find((record) => record.id === "plan-0002").patch, patch);
      fs.writeFileSync(file, JSON.stringify(audit));
    };
    const stages = () => ["js", "audit"].flatMap((dir) => fs.readdirSync(path.join(root, dir)).filter((name) => name.startsWith(".audit-update-")).map((name) => path.join(root, dir, name)));
    run({ root, outputs, snapshot, changeAudit, stages, checkedAt });
  } finally {
    if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("coding-plan-sync-test-")) throw new Error("拒绝清理未知核价测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}

let passed = 0;
function test(name, run) { fixture(run); passed++; console.log("  ✓ " + name); }

test("同步保留较新的整站版本与原价格，重复执行不写入", ({ root, checkedAt, snapshot }) => {
  const before = dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8"));
  const result = syncPricingAudit(root);
  const after = dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8"));
  assert.equal(result.updated, before.META.updated);
  assert.equal(after.META.updated, before.META.updated);
  assert.equal(after.PRICE_CHECKS.checkedAt, checkedAt);
  for (const name of ["PLANS", "API_PRICES", "PAYG_REFERENCES"]) {
    const prices = (data) => data[name].map((item) => [item.priceM, item.priceY, item.inUSD, item.outUSD, item.inCNY, item.outCNY, item.apiIn, item.apiOut, item.apiCache]);
    assert.equal(JSON.stringify(prices(after)), JSON.stringify(prices(before)));
  }
  const first = snapshot();
  assert.equal(syncPricingAudit(root, { rename: () => { throw new Error("幂等同步不应替换文件"); } }).filesChanged, 0);
  assert.deepEqual(snapshot(), first);
});

test("较新的核价推进整站版本并生成对应日期台账", ({ root }) => {
  const data = dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8"));
  const next = new Date(data.META.updated + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const checkedAt = next.toISOString().slice(0, 10);
  for (const file of inputs) {
    const target = path.join(root, "audit", file);
    const audit = JSON.parse(fs.readFileSync(target, "utf8"));
    audit.checkedAt = checkedAt;
    fs.writeFileSync(target, JSON.stringify(audit));
  }
  const result = syncPricingAudit(root);
  assert.equal(result.updated, checkedAt);
  assert.equal(dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8")).PRICE_CHECKS.checkedAt, checkedAt);
  for (const extension of ["json", "csv"]) assert.ok(fs.existsSync(path.join(root, "audit", `pricing-verification-${checkedAt}.${extension}`)));
});

test("完整校验拒绝负价、模型类型和混合继承环，失败前零写入", ({ root, snapshot, changeAudit, stages }) => {
  const before = snapshot();
  for (const patch of [{ priceM: -1 }, { priceM: 20, modelIncludes: [1] }]) {
    changeAudit(patch);
    assert.throws(() => syncPricingAudit(root), /校验失败/);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(stages(), []);
  }
  changeAudit({ modelIncludes: [], modelBaseRef: "plan-0004" });
  const dataFile = path.join(root, "js/data.js");
  fs.appendFileSync(dataFile, '\nPLANS.find(p=>p.id==="plan-0003").modelBaseRef="plan-0002";\ndelete PLANS.find(p=>p.id==="plan-0004").modelBaseRef;\n');
  const cycleBefore = snapshot();
  assert.throws(() => syncPricingAudit(root), /模型继承存在循环/);
  assert.deepEqual(snapshot(), cycleBefore);
  assert.deepEqual(stages(), []);
});

test("非法核价日期在落盘前拒绝", ({ root, snapshot, stages }) => {
  const before = snapshot();
  for (const file of inputs) {
    const target = path.join(root, "audit", file);
    const audit = JSON.parse(fs.readFileSync(target, "utf8"));
    audit.checkedAt = "2026-02-30";
    fs.writeFileSync(target, JSON.stringify(audit));
  }
  assert.throws(() => syncPricingAudit(root), /有效 YYYY-MM-DD/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(stages(), []);
});

test("无效来源URL通过完整校验拒绝且所有输出不变", ({ root, snapshot, stages }) => {
  const before = snapshot();
  const file = path.join(root, "audit", inputs[0]);
  const audit = JSON.parse(fs.readFileSync(file, "utf8"));
  audit.sources[0].url = "invalid-source";
  fs.writeFileSync(file, JSON.stringify(audit));
  assert.throws(() => syncPricingAudit(root), /核价来源 URL 非法/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(stages(), []);
});

test("新增字段遇到原对象尾逗号仍能生成合法源码", ({ root, changeAudit }) => {
  const file = path.join(root, "js/data.js");
  const source = fs.readFileSync(file, "utf8").replace('url: "https://claude.com/pricing" },', 'url: "https://claude.com/pricing", },');
  fs.writeFileSync(file, source);
  // The free plan has no ownClient property, so this exercises appending after a trailing comma.
  const auditFile = path.join(root, "audit", inputs[0]);
  const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
  audit.records.find((record) => record.id === "plan-0001").patch.ownClient = true;
  fs.writeFileSync(auditFile, JSON.stringify(audit));
  syncPricingAudit(root);
  assert.equal(dataOf(fs.readFileSync(file, "utf8")).PLANS.find((plan) => plan.id === "plan-0001").ownClient, true);
});

test("暂存写入失败保留全部原输出并清理临时目录", ({ root, snapshot, changeAudit, stages }) => {
  const before = snapshot();
  changeAudit({ priceM: 21 });
  let writes = 0;
  assert.throws(() => syncPricingAudit(root, { writeBytes: (file, bytes) => { if (++writes === 3) throw new Error("stage fixture"); fs.writeFileSync(file, bytes); } }), /stage fixture/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(stages(), []);
});

test("第二、第三个输出替换失败均恢复整组原输出", ({ root, snapshot, changeAudit, stages }) => {
  const before = snapshot();
  changeAudit({ priceM: 21 });
  for (const failAt of [2, 3]) {
    let calls = 0;
    assert.throws(() => syncPricingAudit(root, { rename: (from, to) => { if (++calls === failAt) throw new Error("commit fixture"); fs.renameSync(from, to); } }), /commit fixture/);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(stages(), []);
  }
});

test("失败回滚移除本轮新建台账，保留原数据", ({ root, outputs, snapshot, changeAudit, stages }) => {
  for (const file of outputs.slice(1)) fs.unlinkSync(path.join(root, file));
  const before = snapshot();
  changeAudit({ priceM: 21 });
  let calls = 0;
  assert.throws(() => syncPricingAudit(root, { rename: (from, to) => { if (++calls === 3) throw new Error("new ledger fixture"); fs.renameSync(from, to); } }), /new ledger fixture/);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(stages(), []);
});

test("回滚也失败时保留可恢复原文件备份", ({ root, outputs, snapshot, changeAudit, stages }) => {
  const before = snapshot();
  changeAudit({ priceM: 21 });
  let calls = 0;
  assert.throws(() => syncPricingAudit(root, { rename: (from, to) => {
    if (++calls === 3) throw new Error("commit fixture");
    if (calls === 4) throw new Error("restore fixture");
    fs.renameSync(from, to);
  } }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /备份保留在/);
    return true;
  });
  const backups = stages();
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(backups[0], "original")).toString("base64"), before[1]);
  assert.equal(snapshot()[0], before[0]);
  fs.renameSync(path.join(backups[0], "original"), path.join(root, outputs[1]));
  assert.deepEqual(snapshot(), before);
});

test("纯内存校验使用同一套模型schema和ISO日期规则", ({ root }) => {
  const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
  assert.equal(validateData({ workspace: root, source }).errors.length, 0);
  assert.ok(validateData({ workspace: root, source: source.replace(/updated: "\d{4}-\d{2}-\d{2}"/, 'updated: "2026-02-30"') }).errors.some((error) => error.includes("META.updated")));
});

console.log("核价同步回归：" + passed + " 通过");
