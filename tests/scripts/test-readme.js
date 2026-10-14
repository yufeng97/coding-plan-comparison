#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { READMES, BLOCKS, readmeStats, benchmarkGroups, renderBlocks, applyBlocks, buildReadmes, parseArgs } = require("../../scripts/build/readme-stats");
const { realTempRoot } = require("../../scripts/lib/temp-dir");
const repo = path.resolve(__dirname, "../..");

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

/** @param {(root: string) => void} run */
function fixture(run) {
  const temporaryRoot = realTempRoot();
  const root = fs.mkdtempSync(path.join(temporaryRoot, "coding-plan-readme-test-"));
  try {
    for (const file of ["data/sources/data.js", "data/benchmarks/public-results.json", ...READMES.map((readme) => readme.file)]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.copyFileSync(path.join(repo, file), path.join(root, file));
    }
    run(root);
  } finally {
    if (path.dirname(root) !== temporaryRoot || !path.basename(root).startsWith("coding-plan-readme-test-")) throw new Error("拒绝清理未知测试目录");
    fs.rmSync(root, { recursive: true, force: true });
  }
}
/* 去掉统计段的内容，只比较维护者手写的部分。 @param {string} text */
const handwritten = (text) => text.replace(/(<!-- readme-stats:(\w+) -->\n)[\s\S]*?(\n<!-- \/readme-stats:\2 -->)/g, "$1$3");

async function main() {
  await test("仓库 README 中英文统计段与数据一致", () => {
    const { stats } = buildReadmes(repo, { check: true });
    const source = fs.readFileSync(path.join(repo, "data/sources/data.js"), "utf8");
    assert.equal(stats.dataVersion, /updated: "(\d{4}-\d{2}-\d{2})"/.exec(source)[1]);
    assert.equal(stats.rateAsOf, /rateAsOf: "(\d{4}-\d{2}-\d{2})"/.exec(source)[1]);
    const results = JSON.parse(fs.readFileSync(path.join(repo, "data/benchmarks/public-results.json"), "utf8"));
    assert.equal(stats.benchmarks.scores, results.scores.length);
    assert.equal(stats.benchmarks.groups.reduce((sum, group) => sum + group.total, 0), results.scores.length, "各类合计等于成绩总数");
    for (const { file, lang } of READMES) {
      const text = fs.readFileSync(path.join(repo, file), "utf8");
      for (const [name, block] of Object.entries(renderBlocks(stats, lang))) {
        assert.ok(text.includes(`<!-- readme-stats:${name} -->\n${block}\n<!-- /readme-stats:${name} -->`), `${file} 的 ${name} 段`);
      }
    }
  });

  await test("数据与汇率变化后两种语言同步更新；--check 报告过期文件，手写部分不动", () => fixture((root) => {
    const dataFile = path.join(root, "data/sources/data.js");
    fs.writeFileSync(dataFile, fs.readFileSync(dataFile, "utf8")
      .replace(/updated: "\d{4}-\d{2}-\d{2}"/, 'updated: "2099-01-02"')
      .replace(/const RATE_USD_CNY = [\d.]+;/, "const RATE_USD_CNY = 7.12;")
      .replace(/rateAsOf: "\d{4}-\d{2}-\d{2}"/, 'rateAsOf: "2099-01-01"'));
    const before = Object.fromEntries(READMES.map(({ file }) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
    assert.throws(() => buildReadmes(root, { check: true }), /README\.md、README\.en\.md；请运行 npm run readme:build/);
    assert.equal(buildReadmes(root).filesChanged, 2);
    const zh = fs.readFileSync(path.join(root, "README.md"), "utf8"), en = fs.readFileSync(path.join(root, "README.en.md"), "utf8");
    assert.match(zh, /数据版本：\*\*2099-01-02\*\*/); assert.match(zh, /1 USD ≈ 7\.12 CNY/); assert.match(zh, /同为 2099-01-01 欧洲央行参考汇率/);
    assert.match(en, /Data version: \*\*2099-01-02\*\*/); assert.match(en, /1 USD ≈ 7\.12 CNY/); assert.match(en, /the 2099-01-01 European Central Bank/);
    for (const { file } of READMES) assert.equal(handwritten(fs.readFileSync(path.join(root, file), "utf8")), handwritten(before[file]), `${file} 统计段以外不变`);
    assert.equal(buildReadmes(root).filesChanged, 0, "重复生成不写文件");
    assert.doesNotThrow(() => buildReadmes(root, { check: true }));
  }));

  await test("统计标记缺失或重复时拒绝改写；CRLF 检出按 LF 处理", () => {
    const blocks = { coverage: "A", benchmarks: "B", rates: "C" };
    const text = "# T\n\n" + BLOCKS.map((name) => `<!-- readme-stats:${name} -->\nold\n<!-- /readme-stats:${name} -->`).join("\n\nmiddle\n\n") + "\n";
    assert.equal(applyBlocks(text, blocks, "X.md"), text.replace("old", "A").replace("old", "B").replace("old", "C"));
    assert.throws(() => applyBlocks(text.replace("<!-- /readme-stats:rates -->", ""), blocks, "X.md"), /X\.md 须恰好包含一组 readme-stats:rates 标记/);
    assert.throws(() => applyBlocks(text.replace("<!-- readme-stats:benchmarks -->\n", ""), blocks, "X.md"), /readme-stats:benchmarks/);
    assert.throws(() => applyBlocks(text + "<!-- readme-stats:coverage -->\nx\n<!-- /readme-stats:coverage -->\n", blocks, "X.md"), /readme-stats:coverage/);
    assert.equal(applyBlocks(text.replace(/\n/g, "\r\n"), blocks, "X.md"), applyBlocks(text, blocks, "X.md"));
  });

  await test("评测按类汇总：每个版本恰好一个协议的类逐版本列出，其余只给总数", () => {
    const board = (id, family, name, version) => ({ id, family, name, version });
    const results = {
      benchmarks: [board("a2", "alpha", "Alpha v2", "2"), board("a1", "alpha", "Alpha 1.0（历史发布节选）", "1"),
        board("b1", "beta", "Beta Verified · 15 步", "Verified"), board("b2", "beta", "Beta Verified · 50 步", "Verified"), board("c", "gamma", "Gamma Bash Only", "x")],
      scores: ["a2", "a2", "a1", "b1", "b2", "b2", "c"].map((benchmarkId) => ({ benchmarkId })),
    };
    assert.deepEqual(benchmarkGroups(results), [
      { label: "Alpha", total: 3, parts: [{ label: "v2", scores: 2 }, { label: "1.0（历史发布节选）", scores: 1 }] },
      { label: "Beta", total: 3, parts: [] },
      { label: "Gamma", total: 1, parts: [] },
    ]);
    const stats = { ...readmeStats(repo), benchmarks: { checkedOn: "2099-01-01", families: 3, protocols: 5, scores: 7, groups: benchmarkGroups(results) } };
    assert.match(renderBlocks(stats, "zh").benchmarks, /7 条成绩（Alpha v2 2、1\.0（历史发布节选） 1；Beta 3；Gamma 1）/);
    assert.match(renderBlocks(stats, "en").benchmarks, /7 scores \(Alpha v2 2, 1\.0 \(historical launch excerpt\) 1; Beta 3; Gamma 1\)/);
    for (const lang of /** @type {const} */ (["zh", "en"])) assert.deepEqual(Object.keys(renderBlocks(stats, lang)), BLOCKS);
  });

  await test("参数只接受 --check", () => {
    assert.deepEqual(parseArgs([]), { check: false });
    assert.deepEqual(parseArgs(["--check"]), { check: true });
    assert.throws(() => parseArgs(["--write"]), /用法/);
  });
  console.log("README 统计回归：" + passed + " 通过");
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
