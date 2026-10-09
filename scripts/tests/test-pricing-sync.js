#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { syncPricingAudit, parseArgs } = require("../build/sync-pricing-audit");
const { seededHistory } = require("../maintenance/history");
const { validateData } = require("../build/validate-data");
const { buildMaintenance } = require("../maintenance/build-maintenance");
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
    fs.mkdirSync(path.join(root, "data"));
    fs.writeFileSync(path.join(root, "data/change-history.json"), JSON.stringify(seededHistory(root), null, 2) + "\n");
    outputs.push("data/change-history.json");
    const snapshot = () => outputs.map((file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)).toString("base64") : null);
    const changeAudit = (patch) => {
      const file = path.join(root, "audit", inputs[0]);
      const audit = JSON.parse(fs.readFileSync(file, "utf8"));
      Object.assign(audit.records.find((record) => record.id === "plan-0002").patch, patch);
      fs.writeFileSync(file, JSON.stringify(audit));
    };
    const stages = () => ["js", "audit", "data"].flatMap((dir) => fs.readdirSync(path.join(root, dir)).filter((name) => name.startsWith(".audit-update-")).map((name) => path.join(root, dir, name)));
    const incremental = (patch = { priceM: 21 }, checked = "2026-10-07") => ({
      sources: [{ id: "claude-update-test", url: "https://claude.com/pricing", evidence: "测试：官网明确月费及权益变化。" }],
      records: [{ kind: "plan", id: "plan-0002", vendor: "Anthropic", name: "Claude Pro", status: "changed", checkedAt: checked, old: { priceM: 20 }, patch, sourceIds: ["claude-update-test"], reason: "测试：人工核对官网月费与权益。" }],
    });
    const writeIncremental = (audit) => { fs.writeFileSync(path.join(root, "audit/incremental.json"), JSON.stringify(audit)); return { incremental: true, input: "audit/incremental.json" }; };
    const allOutputs = () => [...outputs, ...fs.readdirSync(path.join(root, "audit")).filter((name) => /^pricing-incremental-/.test(name)).map((name) => "audit/" + name)].sort().map((file) => [file, fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)).toString("base64") : null]);
    run({ root, outputs, snapshot, changeAudit, stages, checkedAt, incremental, writeIncremental, allOutputs });
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
    const prices = (data) => data[name].map((item) => [item.priceM, item.priceY, item.autoRenewMonthly, item.inUSD, item.outUSD, item.inCNY, item.outCNY, item.apiIn, item.apiOut, item.apiCache]);
    assert.equal(JSON.stringify(prices(after)), JSON.stringify(prices(before)));
  }
  const first = snapshot();
  assert.equal(syncPricingAudit(root, { rename: () => { throw new Error("幂等同步不应替换文件"); } }).filesChanged, 0);
  assert.deepEqual(snapshot(), first);
});

test("自动续费金额可由本套餐关联核价证据说明，其他套餐或未关联的条款不能放行", ({ root }) => {
  const source = fs.readFileSync(path.join(root, "js/data.js"), "utf8");
  const noteOnlyMonthly = '\n;PLANS.find(p => p.id === "plan-0066").note = "官方个人月订阅 Lite $29、Pro $79、Max $179。";';
  assert.deepEqual(validateData({ workspace: root, source: source + noteOnlyMonthly }).errors, []);
  const noLinkedTerms = noteOnlyMonthly + '\n;PRICE_CHECKS.rows["plan:plan-0066"].sourceIds = ["relays-devpass"];';
  assert.ok(validateData({ workspace: root, source: source + noLinkedTerms }).errors.some(error => /autoRenewMonthly.*DevPass/.test(error)));
  const unrelatedTerms = noLinkedTerms + '\n;PRICE_CHECKS.sources["claude-plans"].evidence = "官方条款为自动月续订。";';
  assert.ok(validateData({ workspace: root, source: source + unrelatedTerms }).errors.some(error => /autoRenewMonthly.*DevPass/.test(error)));
  for (const invalid of ["0", "-1", '"29"', "Infinity", "NaN"]) {
    const candidate = source + noteOnlyMonthly + '\n;PLANS.find(p => p.id === "plan-0066").autoRenewMonthly = ' + invalid + ';';
    assert.ok(validateData({ workspace: root, source: candidate }).errors.some(error => /autoRenewMonthly.*DevPass/.test(error)));
  }
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
  for (const failAt of [2, 3, 4]) {
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

test("增量仅更新查到的记录，逐行日期和旧来源保持原样", ({ root, incremental, writeIncremental }) => {
  const file = path.join(root, "js/data.js");
  const before = dataOf(fs.readFileSync(file, "utf8"));
  const audit = incremental({ priceM: 21, quota: "官网明确新权益：每周额度与原池共享。" });
  audit.sources.push({ id: "claude-max-update", url: "https://claude.com/pricing", evidence: "测试：Max官方月费101美元。" });
  audit.records.push({ kind: "plan", id: "plan-0003", vendor: "Anthropic", name: "Claude Max 5x", status: "changed", checkedAt: "2026-10-08", old: { priceM: 100 }, patch: { priceM: 101 }, sourceIds: ["claude-max-update"], reason: "测试：核对Max月费。" });
  syncPricingAudit(root, writeIncremental(audit));
  const after = dataOf(fs.readFileSync(file, "utf8"));
  assert.equal(after.PLANS.find((p) => p.id === "plan-0002").priceM, 21);
  assert.equal(after.PRICE_CHECKS.rows["plan:plan-0002"].checkedAt, "2026-10-07");
  assert.equal(after.PRICE_CHECKS.rows["plan:plan-0003"].checkedAt, "2026-10-08");
  assert.equal(after.PRICE_CHECKS.checkedAt, "2026-10-08");
  for (const [key, value] of Object.entries(before.PRICE_CHECKS.rows)) if (!["plan:plan-0002", "plan:plan-0003"].includes(key)) assert.equal(JSON.stringify(after.PRICE_CHECKS.rows[key]), JSON.stringify(value));
  for (const [key, value] of Object.entries(before.PRICE_CHECKS.sources)) assert.equal(JSON.stringify(after.PRICE_CHECKS.sources[key]), JSON.stringify(value));
  const history = JSON.parse(fs.readFileSync(path.join(root, "data/change-history.json"), "utf8"));
  const change = history.changes.find((row) => row.id === "plan-0002" && row.checkedAt === "2026-10-07");
  assert.deepEqual(change.fields, ["priceM", "quota"]);
  assert.equal(change.before.priceM, 20);
  assert.equal(change.after.priceM, 21);
  assert.deepEqual(change.sourceUrls, ["https://claude.com/pricing"]);
});

test("增量重放不生成新历史或台账，完全无写入", ({ root, incremental, writeIncremental, allOutputs }) => {
  const options = writeIncremental(incremental());
  syncPricingAudit(root, options);
  const before = allOutputs();
  assert.equal(syncPricingAudit(root, { ...options, rename: () => { throw new Error("幂等更新不应写入"); } }).filesChanged, 0);
  assert.deepEqual(allOutputs(), before);
});

test("核价锁覆盖读取到提交，交错增量不能覆盖另一批已接受的数据", ({ root, incremental, writeIncremental }) => {
  const first = incremental({ priceM: 21 }, "2026-10-08");
  const firstOptions = writeIncremental(first);
  const second = incremental({ priceM: 101 }, "2026-10-08");
  Object.assign(second.sources[0], { id: "max-update-test" });
  Object.assign(second.records[0], { id: "plan-0003", name: "Claude Max 5x", old: { priceM: 100 }, sourceIds: ["max-update-test"] });
  fs.writeFileSync(path.join(root, "audit/second.json"), JSON.stringify(second));
  const secondOptions = { incremental: true, input: "audit/second.json" };
  let blocked = false;
  syncPricingAudit(root, { ...firstOptions, rename(from, to) {
    if (!blocked) {
      assert.throws(() => syncPricingAudit(root, secondOptions), /核价正在同步/);
      blocked = true;
    }
    fs.renameSync(from, to);
  } });
  assert.equal(blocked, true);
  assert.equal(fs.existsSync(path.join(root, "audit/.pricing.lock")), false);
  syncPricingAudit(root, secondOptions);
  const data = dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8"));
  assert.equal(data.PLANS.find(plan => plan.id === "plan-0002").priceM, 21);
  assert.equal(data.PLANS.find(plan => plan.id === "plan-0003").priceM, 101);
  assert.deepEqual(Array.from(data.PRICE_CHECKS.rows["plan:plan-0002"].sourceIds), ["claude-update-test"]);
  assert.deepEqual(Array.from(data.PRICE_CHECKS.rows["plan:plan-0003"].sourceIds), ["max-update-test"]);
});

test("核价失败释放锁，损坏的既有锁保留且不修改数据", ({ root, incremental, writeIncremental, allOutputs }) => {
  const bad = incremental({ priceM: -1 });
  assert.throws(() => syncPricingAudit(root, writeIncremental(bad)), /校验失败/);
  const lock = path.join(root, "audit/.pricing.lock");
  assert.equal(fs.existsSync(lock), false);
  fs.writeFileSync(lock, "corrupt lock retained");
  const before = allOutputs();
  assert.throws(() => syncPricingAudit(root), /人工检查/);
  assert.deepEqual(allOutputs(), before);
  assert.equal(fs.readFileSync(lock, "utf8"), "corrupt lock retained");
});

test("已退出进程的遗留锁也不自动删除，避免并发恢复误删新锁", ({ root, allOutputs }) => {
  const lock = path.join(root, "audit/.pricing.lock");
  const child = require("node:child_process").spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding:"utf8" });
  assert.equal(child.status, 0);
  const previous = JSON.stringify({ pid:Number(child.stdout), hostname:os.hostname(), startedAt:"2026-10-08T00:00:00Z" });
  fs.writeFileSync(lock, previous);
  const before = allOutputs();
  assert.throws(() => syncPricingAudit(root), /确认没有相关进程/);
  assert.deepEqual(allOutputs(), before);
  assert.equal(fs.readFileSync(lock, "utf8"), previous);
});

test("API与按量对照以原币一致增量更新，型号更名清理旧核查键且可幂等重放", ({ root, writeIncremental, allOutputs }) => {
  const dataFile = path.join(root, "js/data.js");
  const before = dataOf(fs.readFileSync(dataFile, "utf8"));
  const key = "DeepSeek|deepseek-flash";
  const apiModel = before.API_PRICES.find((row) => row.vendor === "DeepSeek" && row.label === "DeepSeek Flash").model;
  const apiKey = "DeepSeek|" + apiModel;
  const renamed = "deepseek-flash-test";
  const shared = { id: key, vendor: "DeepSeek", name: "deepseek-flash", checkedAt: "2026-10-07", status: "changed", sourceIds: ["deepseek-update-test"], reason: "测试：官方型号更名及输入原币价变化。" };
  const audit = {
    sources: [{ id: "deepseek-update-test", url: "https://api-docs.deepseek.com/quick_start/pricing", evidence: "测试：新型号输入每百万0.2美元，输出与缓存价不变。" }],
    records: [
      { ...shared, id: apiKey, name: apiModel, kind: "api", old: { inUSD: 0.15 }, patch: { model: renamed, inUSD: 0.2 } },
      { ...shared, kind: "payg", old: { apiIn: 0.15 }, patch: { model: renamed, apiIn: 0.2 } },
    ],
  };
  const options = writeIncremental(audit);
  syncPricingAudit(root, options);
  const after = dataOf(fs.readFileSync(dataFile, "utf8"));
  assert.equal(after.API_PRICES.length, before.API_PRICES.length);
  assert.equal(after.PAYG_REFERENCES.length, before.PAYG_REFERENCES.length);
  assert.equal(after.API_PRICES.find((row) => row.model === renamed).inUSD, 0.2);
  assert.equal(after.PAYG_REFERENCES.find((row) => row.model === renamed).apiIn, 0.2);
  for (const kind of ["api", "payg"]) {
    assert.equal(after.PRICE_CHECKS.rows[kind + ":" + (kind === "api" ? apiKey : key)], undefined);
    assert.equal(after.PRICE_CHECKS.rows[kind + ":DeepSeek|" + renamed].checkedAt, "2026-10-07");
  }
  const snapshot = allOutputs();
  assert.equal(syncPricingAudit(root, options).filesChanged, 0);
  assert.deepEqual(allOutputs(), snapshot);
  const history = JSON.parse(fs.readFileSync(path.join(root, "data/change-history.json"), "utf8"));
  assert.deepEqual(history.changes.filter((change) => change.checkedAt === "2026-10-07").map((change) => [change.kind, change.id]).sort(), [["api", apiKey], ["payg", key]]);
});

test("拒绝日期倒退、旧full覆盖及同日过时基值patch", ({ root, incremental, writeIncremental, allOutputs }) => {
  syncPricingAudit(root, writeIncremental(incremental()));
  const before = allOutputs();
  assert.throws(() => syncPricingAudit(root), /日期倒退|旧审计/);
  assert.deepEqual(allOutputs(), before);
  assert.throws(() => syncPricingAudit(root, writeIncremental(incremental({ priceM: 22 }, "2026-10-06"))), /日期倒退/);
  assert.throws(() => syncPricingAudit(root, writeIncremental(incremental({ priceM: 22 }))), /旧审计 patch/);
  assert.deepEqual(allOutputs(), before);
});

test("API以核查ID解析身份，展示名不必与计费型号逐字相同", ({ root, writeIncremental }) => {
  const dataFile = path.join(root, "js/data.js");
  const before = dataOf(fs.readFileSync(dataFile, "utf8"));
  const api = before.API_PRICES.find((row) => row.vendor === "DeepSeek" && row.label === "DeepSeek Flash");
  const note = api.note + "；官方说明核对测试。";
  const audit = {
    sources: [{ id: "deepseek-note-test", url: api.url, evidence: "测试：官方计费规则说明已核对。" }],
    records: [{ kind: "api", id: api.vendor + "|" + api.model, vendor: api.vendor, name: api.label, checkedAt: "2026-10-07", status: "changed", old: { note: api.note }, patch: { note }, sourceIds: ["deepseek-note-test"], reason: "测试：更新官方计费规则说明。" }],
  };
  const options = writeIncremental(audit);
  syncPricingAudit(root, options);
  assert.equal(dataOf(fs.readFileSync(dataFile, "utf8")).API_PRICES.find((row) => row.model === api.model).note, note);
  assert.equal(syncPricingAudit(root, options).filesChanged, 0);
});

test("同日增量权益也拒绝旧full重放，新的full需声明当前基值", ({ root, checkedAt, incremental, writeIncremental, changeAudit, allOutputs }) => {
  const file = path.join(root, "js/data.js");
  const plan = dataOf(fs.readFileSync(file, "utf8")).PLANS.find((item) => item.id === "plan-0002");
  changeAudit({ note: plan.note });
  const note = "测试：同日官方已确认新版权益说明。";
  syncPricingAudit(root, writeIncremental(incremental({ note }, checkedAt)));
  const before = allOutputs();
  assert.throws(() => syncPricingAudit(root), /同日旧全量权益 patch/);
  assert.deepEqual(allOutputs(), before);
  const input = path.join(root, "audit", inputs[0]);
  const audit = JSON.parse(fs.readFileSync(input, "utf8"));
  const record = audit.records.find((item) => item.id === "plan-0002");
  record.old.note = note;
  record.patch.note = "测试：同日再次确认更新后的权益说明。";
  fs.writeFileSync(input, JSON.stringify(audit));
  syncPricingAudit(root);
  assert.equal(dataOf(fs.readFileSync(file, "utf8")).PLANS.find((item) => item.id === "plan-0002").note, record.patch.note);
});

test("增量必须有逐行有效日期、明确本次来源与原因，不能覆盖旧来源", ({ root, incremental, writeIncremental, allOutputs }) => {
  const before = allOutputs();
  for (const mutate of [
    (audit) => { delete audit.records[0].checkedAt; audit.checkedAt = "2026-10-07"; },
    (audit) => { audit.records[0].checkedAt = "2026-02-30"; },
    (audit) => { audit.sources = []; },
    (audit) => { audit.sources[0].evidence = " "; },
    (audit) => { audit.records[0].reason = " "; },
    (audit) => { audit.sources[0].id = "claude-plans"; audit.records[0].sourceIds = ["claude-plans"]; },
    (audit) => { audit.records[0].status = "unverified"; },
  ]) {
    const audit = incremental(); mutate(audit);
    assert.throws(() => syncPricingAudit(root, writeIncremental(audit)), /日期|来源|说明|未核实/);
    assert.deepEqual(allOutputs(), before);
  }
});

test("显式完整new才能增加永久计划，重复入库无变化，复用ID与不完整schema拒绝", ({ root, incremental, writeIncremental, allOutputs }) => {
  const audit = incremental();
  const plan = { id: "plan-test-new", vendor: "New Vendor", plan: "Coding Pro", cat: "tool", region: "intl", priceM: 9, priceY: null, cur: "USD", seat: false, quota: "每月明确包含100美元模型额度。", models: "GPT-6 Sol", tools: "独立CLI", note: "官方月费及编程额度已核对。", url: "https://example.com/pricing", ownClient: true };
  Object.assign(audit.records[0], { id: plan.id, vendor: plan.vendor, name: plan.plan, new: plan, status: "verified" });
  delete audit.records[0].patch; delete audit.records[0].old;
  const before = allOutputs();
  const absentNew = structuredClone(audit); delete absentNew.records[0].new;
  assert.throws(() => syncPricingAudit(root, writeIncremental(absentNew)), /显式提供 new/);
  const incomplete = structuredClone(audit); delete incomplete.records[0].new.models;
  assert.throws(() => syncPricingAudit(root, writeIncremental(incomplete)), /完整字段/);
  assert.deepEqual(allOutputs(), before);
  const options = writeIncremental(audit);
  syncPricingAudit(root, options);
  const after = dataOf(fs.readFileSync(path.join(root, "js/data.js"), "utf8"));
  assert.equal(after.PLANS.length, 213);
  assert.equal(after.PRICE_CHECKS.rows["plan:plan-test-new"].checkedAt, "2026-10-07");
  assert.equal(validateData({ workspace: root }).errors.length, 0);
  assert.equal(syncPricingAudit(root, options).filesChanged, 0);
  const updated = allOutputs();
  audit.records[0].new.priceM = 10;
  assert.throws(() => syncPricingAudit(root, writeIncremental(audit)), /永久 ID 已存在/);
  assert.deepEqual(allOutputs(), updated);
});

test("增量data、台账、history第四文件失败回滚，不留新台账", ({ root, incremental, writeIncremental, allOutputs, stages }) => {
  const before = allOutputs();
  const options = writeIncremental(incremental());
  let calls = 0;
  assert.throws(() => syncPricingAudit(root, { ...options, rename: (from, to) => { if (++calls === 4) throw new Error("history commit fixture"); fs.renameSync(from, to); } }), /history commit fixture/);
  assert.deepEqual(allOutputs(), before);
  assert.deepEqual(stages(), []);
});

test("CLI明确增量参数，拒绝未知、缺值和audit目录外输入", ({ root, incremental, writeIncremental }) => {
  assert.deepEqual(parseArgs(["--incremental", "--input", "audit/incremental.json"]), { incremental: true, input: "audit/incremental.json" });
  assert.throws(() => parseArgs(["--input"]), /缺值/);
  assert.throws(() => parseArgs(["--force"]), /未知/);
  assert.throws(() => syncPricingAudit(root, { incremental: true }), /同时提供/);
  writeIncremental(incremental());
  assert.throws(() => syncPricingAudit(root, { incremental: true, input: "../incremental.json" }), /audit 目录/);
});

test("结构化全年金额可随年价共同核入，金额冲突在提交前拒绝", ({ root, incremental, writeIncremental, allOutputs }) => {
  const conflict=incremental({priceY:18});
  conflict.records[0].old={priceY:16.67,annualTotal:200};
  const options=writeIncremental(conflict),before=allOutputs();
  assert.throws(()=>syncPricingAudit(root,options),/annualTotal/);
  assert.deepEqual(allOutputs(),before);
  const valid=incremental({priceY:18,annualTotal:216});
  valid.records[0].old={priceY:16.67,annualTotal:200};
  const accepted=writeIncremental(valid);
  syncPricingAudit(root,accepted);
  const p=dataOf(fs.readFileSync(path.join(root,"js/data.js"),"utf8")).PLANS.find(p=>p.id==="plan-0002");
  assert.equal(p.priceY,18);assert.equal(p.annualTotal,216);
  const snapshot=allOutputs();syncPricingAudit(root,accepted);assert.deepEqual(allOutputs(),snapshot);
});

test("核价结束时保留替换所有者的锁", ({ root, incremental, writeIncremental }) => {
  const lock = path.join(root,"audit/.pricing.lock"), replacement = JSON.stringify({ownerId:"replacement-owner",pid:process.pid});
  let replaced = false;
  assert.throws(() => syncPricingAudit(root, { ...writeIncremental(incremental()), rename(from,to) {
    if (!replaced) { fs.renameSync(lock,lock+".previous-owner"); fs.writeFileSync(lock,replacement); replaced=true; }
    fs.renameSync(from,to);
  } }), /所有权已变化/);
  assert.ok(replaced);
  assert.equal(fs.readFileSync(lock,"utf8"),replacement);
  assert.equal(dataOf(fs.readFileSync(path.join(root,"js/data.js"),"utf8")).PLANS.find(p=>p.id==="plan-0002").priceM,21);
});
test("核价失败和释放失败同时保留，回滚不删除替换锁", ({ root, incremental, writeIncremental, snapshot }) => {
  const options = writeIncremental(incremental()), before=snapshot(), lock=path.join(root,"audit/.pricing.lock");
  const replacement=JSON.stringify({ownerId:"replacement-owner",pid:process.pid}), failure=new Error("pricing commit fixture");
  assert.throws(() => syncPricingAudit(root,{...options,rename() {
    fs.renameSync(lock,lock+".previous-owner");fs.writeFileSync(lock,replacement);throw failure;
  }}), error => { assert.ok(error instanceof AggregateError);assert.equal(error.errors[0],failure);assert.match(error.errors[1].message,/所有权已变化/);return true; });
  assert.deepEqual(snapshot(),before);
  assert.equal(fs.readFileSync(lock,"utf8"),replacement);
});
test("核价持锁时维护生成和check均拒绝，随后保留新增历史", ({ root, incremental, writeIncremental }) => {
  buildMaintenance(root,{asOf:"2026-10-08"});
  let blocked=false;
  syncPricingAudit(root,{...writeIncremental(incremental()),rename(from,to) {
    if(!blocked) { blocked=true;assert.throws(()=>buildMaintenance(root,{asOf:"2026-10-08"}),/遗留锁/);assert.throws(()=>buildMaintenance(root,{check:true}),/遗留锁/); }
    fs.renameSync(from,to);
  }});
  assert.ok(blocked);
  const historyFile=path.join(root,"data/change-history.json"), accepted=fs.readFileSync(historyFile);
  assert.ok(JSON.parse(accepted.toString()).changes.some(c=>c.id==="plan-0002"&&c.checkedAt==="2026-10-07"&&c.after.priceM===21));
  buildMaintenance(root,{asOf:"2026-10-08"});
  assert.deepEqual(fs.readFileSync(historyFile),accepted);
  assert.equal(buildMaintenance(root,{check:true}).checked,true);
});
test("maintenance读取历史期间持有共享锁", ({ root, incremental, writeIncremental }) => {
  buildMaintenance(root,{asOf:"2026-10-08"});
  const options=writeIncremental(incremental()), historyFile=path.join(root,"data/change-history.json"), original=fs.readFileSync;
  let attempted=false;
  fs.readFileSync=new Proxy(original,{apply(target,receiver,args) {
    const result=Reflect.apply(target,receiver,args);
    if(!attempted&&args[0]===historyFile) { attempted=true;assert.throws(()=>syncPricingAudit(root,options),/遗留锁/);assert.throws(()=>buildMaintenance(root,{asOf:"2026-10-08"}),/遗留锁/); }
    return result;
  }});
  try { assert.equal(buildMaintenance(root,{check:true}).checked,true); } finally { fs.readFileSync=original; }
  assert.ok(attempted);
  assert.equal(fs.existsSync(path.join(root,"audit/.pricing.lock")),false);
  syncPricingAudit(root,options);
  const accepted=fs.readFileSync(historyFile);buildMaintenance(root,{asOf:"2026-10-08"});assert.deepEqual(fs.readFileSync(historyFile),accepted);
});
console.log("核价同步回归：" + passed + " 通过");
