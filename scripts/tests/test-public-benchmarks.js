"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { validatePublic, rowId, officialURL, collect, publish, digest, compareScores, readPublic } = require("../benchmarks/public-scores");
const { fetchSource, MAX_BYTES } = require("../news/network");
const now = new Date().toISOString(), url = "https://deepswe.datacurve.ai/";
const board = { id: "test-protocol", family: "test-only", name: "Test fixture", version: "1", category: "coding", metric: "pass@1", unit: "%", description: "Test-only fixture", configuration: "same protocol", scope: "fixture", sourceUrl: url, sourceUpdatedAt: null, checkedAt: now };
const row = { id: "", benchmarkId: board.id, model: "test-only", reasoning: "high", agent: "test-agent", score: 67, costUSD: null, costNote: null, uncertainty: null, tokens: null, steps: null, sourceUrl: url, checkedAt: now };
row.id = rowId(row);
const bytes = Buffer.from("test-only evidence"), artifact = { url, sha256: digest(bytes), checkedAt: now };
const snapshot = () => structuredClone({ schemaVersion: 1, checkedAt: now, benchmarks: [board], scores: [row], artifacts: [artifact] });
let passed = 0;
async function test(label, run) { await run(); passed++; console.log("✓ " + label); }
async function main() {
  await test("合法零分保留；未知费用与配置保留 null", () => {
    const data = snapshot(); data.scores[0].score = 0;
    assert.equal(validatePublic(data).scores[0].costUSD, null);
    assert.notEqual(rowId(row), rowId({ ...row, reasoning: "max" }));
    assert.equal(rowId(row), rowId({ ...row, score: 80, checkedAt: "changed" }));
  });
  await test("拒绝未知协议、身份重复、跨配置覆盖和假分数", () => {
    for (const score of [null, undefined, NaN, Infinity, -1, 100.1, "50"]) { const data = /** @type {any} */ (snapshot()); data.scores[0].score = score; assert.throws(() => validatePublic(data), /成绩/); }
    for (const patch of [{ benchmarkId: "unknown" }, { model: "" }, { reasoning: "max" }, { costUSD: 1 }, { tokens: -1 }]) { const data = snapshot(); Object.assign(data.scores[0], patch); assert.throws(() => validatePublic(data)); }
    const duplicate = snapshot(); duplicate.scores.push(duplicate.scores[0]); assert.throws(() => validatePublic(duplicate), /重复/);
    const orphan = snapshot(); orphan.benchmarks.push({ ...board, id: "empty" }); assert.throws(() => validatePublic(orphan), /空榜单/);
  });
  await test("拒绝伪核查日期、未来时间、错误日期与非百分比新口径", () => {
    for (const checkedAt of ["2026-02-30T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "2026-10-08"]) { const data = snapshot(); data.checkedAt = checkedAt; assert.throws(() => validatePublic(data), /UTC/); }
    const future = snapshot(); future.benchmarks[0].sourceUpdatedAt = "2099-01-01"; assert.throws(() => validatePublic(future));
    const invalid = snapshot(); invalid.benchmarks[0].sourceUpdatedAt = "2026-02-30"; assert.throws(() => validatePublic(invalid));
    const unit = snapshot(); unit.benchmarks[0].unit = "points"; assert.throws(() => validatePublic(unit), /口径/);
  });
  await test("只读登记的官方 HTTPS 来源与固定官方仓库文档", () => {
    for (const value of ["http://cursor.com/evals", "https://localhost/x", "https://cursor.com.evil.example/x", "https://github.com/attacker/data", "https://u:p@cursor.com/evals"]) assert.throws(() => officialURL(value));
    assert.equal(officialURL("https://github.com/centerforaisafety/hle/blob/main/docs/evaluation-with-tools.md"), "https://github.com/centerforaisafety/hle/blob/main/docs/evaluation-with-tools.md");
  });
  await test("日期变化不冒充成绩变化，分数/费用/新增/撤回分开报告", () => {
    const previous = snapshot(), next = snapshot(); next.scores[0].checkedAt = "later";
    assert.deepEqual(compareScores(previous, next), { added: [], changed: [], removed: [] });
    next.scores[0] = /** @type {typeof row} */ (Object.fromEntries(Object.entries(next.scores[0]).reverse()));
    assert.equal(compareScores(previous, next).changed.length, 0, "键顺序不代表成绩改变");
    next.scores[0].costUSD = 1; assert.equal(compareScores(previous, next).changed.length, 1);
    next.scores = []; assert.deepEqual(compareScores(previous, next).removed, [row.id]);
  });
  await test("共享下载保留二进制，默认上限不变，显式提高上限仍受限", async () => {
    const resolver = async () => [{ address: "93.184.216.34" }];
    const binary = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0, 0x80]);
    const result = await fetchSource(url, { resolver, fetcher: async () => new Response(binary) });
    assert.deepEqual(result.bytes, binary);
    await assert.rejects(fetchSource(url, { resolver, fetcher: async () => new Response("x".repeat(MAX_BYTES + 1)) }), /2 MiB/);
    assert.equal((await fetchSource(url, { resolver, maxBytes: MAX_BYTES + 1, fetcher: async () => new Response("x".repeat(MAX_BYTES + 1)) })).bytes.length, MAX_BYTES + 1);
    await assert.rejects(fetchSource(url, { maxBytes: 17 * 1024 * 1024 }), /限额/);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "public-benchmark-test-"));
  const latest = path.join(dir, "audit/benchmark-sources/latest.json"), formal = path.join(dir, "benchmarks/public-results.json");
  const getter = async raw => ({ text: bytes.toString(), bytes, finalURL: raw });
  const good = { id: "test", collect: async get => { const source = await get(url); return { benchmarks: [{ ...board, checkedAt: source.checkedAt }], scores: [{ ...row, checkedAt: source.checkedAt }] }; } };
  try {
    await test("采集只生成候选与证据；人工登记理由后才发布", async () => {
      const data = await collect(dir, { fetchSource: getter, adapters: [good] });
      assert.equal(fs.existsSync(formal), false); assert.equal(data.scores.length, 1);
      assert.throws(() => publish(latest, "reviewer", "", dir), /理由/);
      publish(latest, "test reviewer", "test-only official evidence fixture", dir);
      assert.equal(readPublic(dir).review.by, "test reviewer");
    });
    const beforeLatest = fs.readFileSync(latest), beforeFormal = fs.readFileSync(formal);
    await test("来源失败、格式变化及非法分数不覆盖候选或正式数据，连续失败持久记录", async () => {
      const bad = { id: "test", collect: async () => { throw new Error("HTTP 503"); } };
      await assert.rejects(collect(dir, { fetchSource: getter, adapters: [bad] }), /保留/);
      await assert.rejects(collect(dir, { fetchSource: getter, adapters: [{ id: "test", collect: async get => { const value = await good.collect(get); value.scores[0].score = 101; return value; } }] }), /保留/);
      const health = JSON.parse(fs.readFileSync(path.join(dir, "audit/benchmark-sources/health.json"), "utf8"));
      assert.equal(health.sources[0].consecutiveFailures, 2); assert.equal(health.sources[0].ok, false);
      assert.deepEqual(fs.readFileSync(latest), beforeLatest); assert.deepEqual(fs.readFileSync(formal), beforeFormal);
      await collect(dir, { fetchSource: getter, adapters: [good] });
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "audit/benchmark-sources/health.json"), "utf8")).sources[0].consecutiveFailures, 0);
    });
    await test("缺失或被改动的原始证据不得发布", () => {
      const data = JSON.parse(fs.readFileSync(latest, "utf8"));
      const raw = path.join(dir, "audit/benchmark-sources/raw", data.artifacts[0].sha256 + ".bin");
      fs.writeFileSync(raw, "tampered"); assert.throws(() => publish(latest, "reviewer", "reason", dir), /证据/);
      assert.deepEqual(fs.readFileSync(formal), beforeFormal); fs.writeFileSync(raw, bytes);
    });
    await test("正式快照必须有覆盖全部数据的审核哈希，防止审核后改数或删审核", () => {
      const original = fs.readFileSync(formal), data = JSON.parse(original.toString());
      delete data.review; fs.writeFileSync(formal, JSON.stringify(data)); assert.throws(() => readPublic(dir), /审核/);
      fs.writeFileSync(formal, original);
      const changed = JSON.parse(original.toString()); changed.scores[0].score = 0;
      fs.writeFileSync(formal, JSON.stringify(changed)); assert.throws(() => readPublic(dir), /哈希/);
      fs.writeFileSync(formal, original);
    });
    await test("人工误改候选不能通过原始文件哈希假冒已采集成绩", () => {
      const original = fs.readFileSync(latest), data = JSON.parse(original.toString()); data.scores[0].score = 0;
      fs.writeFileSync(latest, JSON.stringify(data)); assert.throws(() => publish(latest, "reviewer", "reason", dir), /采集归档/);
      fs.writeFileSync(latest, original); assert.deepEqual(fs.readFileSync(formal), beforeFormal);
    });
    await test("历史完整候选不能覆盖更新的正式核查时间", () => {
      const original = fs.readFileSync(latest);
      publish(latest, "reviewer", "reason", dir);
      const current = JSON.parse(fs.readFileSync(formal, "utf8")), old = JSON.parse(beforeLatest.toString());
      assert.ok(Date.parse(current.checkedAt) > Date.parse(old.checkedAt));
      fs.writeFileSync(latest, beforeLatest); assert.throws(() => publish(latest, "reviewer", "reason", dir), /历史候选/);
      fs.writeFileSync(latest, original);
    });
    await test("采集与人工发布不能并发，避免覆盖当前审核输入", async () => {
      let signal = () => {}, release = () => {};
      const started = new Promise(resolve => { signal = () => resolve(undefined); });
      const gate = new Promise(resolve => { release = () => resolve(undefined); });
      const running = collect(dir, { fetchSource: getter, adapters: [{ id: "test", collect: async get => { signal(); await gate; return good.collect(get); } }] });
      await started;
      assert.throws(() => publish(latest, "reviewer", "reason", dir), /正在采集/);
      release(); await running;
      assert.equal(fs.existsSync(path.join(dir, "audit/benchmark-sources/.benchmark.lock")), false);
    });
  } finally {
    if (path.dirname(dir) !== fs.realpathSync(os.tmpdir()) || !path.basename(dir).startsWith("public-benchmark-test-")) throw new Error("未知测试目录");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("公开评测离线回归通过：" + passed + " 项");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
