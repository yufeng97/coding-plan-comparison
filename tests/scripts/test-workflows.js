#!/usr/bin/env node
"use strict";
/* GitHub Actions 工作流的静态约束：第三方 Action 固定完整 SHA；可复用工作流的调用关系、发布队列；
   每日巡检只接受数据路径白名单内的改动。工作流本身只能在 GitHub 上运行，这里守住容易被改坏的约定。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs: parseRateArgs } = require("../../scripts/build/update-rates");

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, ".github/workflows");
const read = (/** @type {string} */ name) => fs.readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");
const workflows = Object.fromEntries(fs.readdirSync(dir).filter((name) => name.endsWith(".yml")).sort().map((name) => [name, read(name)]));

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

async function main() {
  await test("第三方 Action 固定到 40 位提交 SHA 并注明版本；本地可复用工作流存在且声明 workflow_call", () => {
    let count = 0;
    for (const [name, text] of Object.entries(workflows)) {
      for (const match of text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
        count++;
        const [, target, rest] = match;
        if (target.startsWith("./")) {
          const file = path.join(root, target);
          assert.ok(fs.existsSync(file), `${name} 引用的 ${target} 不存在`);
          assert.match(fs.readFileSync(file, "utf8"), /^\s{2}workflow_call:/m, `${target} 未声明 workflow_call`);
        } else {
          assert.match(target, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${name}：${target} 未固定完整 SHA`);
          assert.match(rest, /#\s*v\d/, `${name}：${target} 缺少版本注释`);
        }
      }
    }
    assert.ok(count > 20);
  });

  await test("CI 可被每日更新按提交调用；两个发布入口共用 site-deploy 队列，被调用的发布工作流不另设并发组", () => {
    const ci = workflows["ci.yml"];
    assert.match(ci, /workflow_call:\n\s+inputs:\n\s+ref:/);
    assert.equal(ci.match(/ref: \$\{\{ inputs\.ref \}\}/g)?.length, 2, "检查与依赖审计两处检出都使用指定提交");
    assert.match(ci, /group: ci-\$\{\{ inputs\.ref \|\| github\.ref \}\}/);
    for (const name of ["ci.yml", "deploy.yml"]) assert.match(workflows[name], /npm run readme:check/, `${name} 核对 README 统计`);
    assert.doesNotMatch(workflows["deploy.yml"], /^\s*concurrency:/m, "调用方持有 site-deploy；被调用方同名并发组会互相等待");
    for (const name of ["pages.yml", "daily-data.yml"]) {
      assert.match(workflows[name], /concurrency:\n\s+group: site-deploy\n\s+cancel-in-progress: false\n(?:.*\n){0,6}?\s+uses: \.\/\.github\/workflows\/deploy\.yml/, `${name} 调用发布时排队`);
    }
    assert.match(workflows["pages.yml"], /context == "daily-data\/full-ci"/, "手动发布认可每日更新的完整 CI 状态");
    assert.match(workflows["daily-data.yml"], /context=daily-data\/full-ci/);
  });

  await test("每日数据更新只在完整 CI 通过后快进 main，汇率参数可被脚本接受", () => {
    const daily = workflows["daily-data.yml"];
    assert.match(daily, /schedule:\n\s+- cron: "30 0 \* \* \*"/);
    assert.match(daily, /needs\.verify-rates\.result == 'success'/);
    assert.match(daily, /git\/refs\/heads\/main" -f sha="\$SHA" -F force=false/, "只做快进，不强推 main");
    assert.doesNotMatch(daily, /push --force origin HEAD:refs\/heads\/main|push[^\n]*\bmain\b/, "候选只推 automation/* 分支");
    const args = /npm run rates:update -- ([^|]+?) \|\|/.exec(daily);
    assert.ok(args);
    assert.deepEqual(parseRateArgs(args[1].trim().split(/\s+/)), { dryRun: false, date: "", staleDays: 7 });
  });

  await test("Claude 巡检：无推送凭据、子进程去掉凭据，白名单只放行数据文件", () => {
    const inspection = workflows["daily-inspection.yml"];
    const value = /^\s+DATA_PATHS: '(.+)'$/m.exec(inspection);
    assert.ok(value, "缺少 DATA_PATHS");
    const allowed = new RegExp(value[1]);
    for (const file of ["data/sources/data.js", "data/audit/incremental-2026-10-15.json", "data/audit/pricing-incremental-2026-10-15-a1bfb1cca7fe.json",
      "data/audit/pricing-incremental-2026-10-15-a1bfb1cca7fe.csv", "data/audit/change-history.json", "data/generated/maintenance.json",
      "data/generated/feeds/openai-1a2b3c4d.xml", "src/generated/catalog.ts", "data/config/news-sources.json", "data/config/review-calendar.json",
      "CHANGES.md", "README.md", "README.en.md"]) assert.match(file, allowed, file + " 应放行");
    for (const file of [".github/workflows/ci.yml", ".github/automation/daily-inspection.md", "package.json", "package-lock.json", "scripts/build/validate-data.js",
      "src/App.vue", "src/generated/other.ts", "tests/scripts/run.js", "data/sources/project-data.js", "data/benchmarks/public-results.json",
      "data/audit/pricing-verification-2026-10-04.json", "data/sources/data.js.bak", "xdata/sources/data.js", "README.md/x", "data/generated/../../package.json",
      "data/generated/.hidden.js", "data/generated/feeds/../../../scripts/x.js"]) {
      assert.doesNotMatch(file, allowed, file + " 应拒绝");
    }
    assert.equal(inspection.match(/grep -Ev "\$DATA_PATHS"/g)?.length, 2, "生成补丁与应用补丁时各核对一次");
    assert.match(inspection, /CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"/);
    assert.match(inspection, /--permission-mode dontAsk/);
    const inspect = inspection.slice(inspection.indexOf("  inspect:"), inspection.indexOf("  propose:"));
    assert.match(inspect, /persist-credentials: false/);
    assert.match(inspect, /contents: read/);
    assert.doesNotMatch(inspect, /contents: write|pull-requests: write|git push/, "Claude 所在作业不能写仓库");
    assert.doesNotMatch(inspect, /Bash\((?:node|npx|curl|git push|git commit|bash|sh)\b/, "Claude 不能直接运行任意脚本或推送");
    const prompt = fs.readFileSync(path.join(root, ".github/automation/daily-inspection.md"), "utf8");
    assert.match(inspection, /cat \.github\/automation\/daily-inspection\.md/);
    for (const listed of ["data/sources/data.js", "data/audit/change-history.json", "src/generated/catalog.ts", "data/config/news-sources.json", "data/config/review-calendar.json"]) {
      assert.ok(prompt.includes("`" + listed + "`"), "提示里的允许路径与白名单一致：" + listed);
    }
  });
  console.log("工作流约束：" + passed + " 通过");
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
