#!/usr/bin/env node
"use strict";
/* GitHub Actions 工作流的静态约束：第三方 Action 固定完整 SHA；可复用工作流的调用关系、发布队列；
   每日巡检只接受数据路径白名单内的改动。工作流本身只能在 GitHub 上运行，这里守住容易被改坏的约定。 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { parseArgs: parseRateArgs } = require("../../scripts/build/update-rates");
const { parseArguments: parseNewsArgs, quarantineCorruptInbox } = require("../../scripts/news/collect-news");

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, ".github/workflows");
const read = (/** @type {string} */ name) => fs.readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");
const workflows = Object.fromEntries(fs.readdirSync(dir).filter((name) => name.endsWith(".yml")).sort().map((name) => [name, read(name)]));

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("  ✓ " + name); }

function jobBlock(text, name) {
  const lines = text.split("\n"), start = lines.indexOf("  " + name + ":");
  assert.ok(start >= 0, "缺少作业 " + name);
  let end = start + 1;
  while (end < lines.length && !/^  [\w-]+:$/.test(lines[end])) end++;
  return lines.slice(start, end).join("\n");
}

function stepBlock(text, id) {
  const lines = text.split("\n"), index = lines.findIndex((line) => line === "        id: " + id);
  assert.ok(index >= 0, "缺少步骤 " + id);
  let start = index, end = index + 1;
  while (start > 0 && !lines[start].startsWith("      - ")) start--;
  while (end < lines.length && !lines[end].startsWith("      - ")) end++;
  return lines.slice(start, end).join("\n");
}

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

  await test("发布取得共享队列后核对 main：最新提交可发布，旧 CI 重跑和排队过期跳过，查询失败不得放行", () => {
    const deploy = workflows["deploy.yml"], gate = stepBlock(jobBlock(deploy, "current"), "current");
    assert.match(gate, /DEPLOY_SHA: \$\{\{ inputs\.sha \}\}/);
    const script = /node <<'NODE'\n([\s\S]*?)\n {10}NODE/.exec(gate);
    assert.ok(script);
    const build = jobBlock(deploy, "build");
    assert.match(build, /needs: current\n\s+if: needs\.current\.outputs\.current == 'true'/);
    for (const name of ["pages", "vercel"]) assert.match(jobBlock(deploy, name), /needs: build/);
    const old = "a".repeat(40), latest = "b".repeat(40);
    function run(candidate, head) {
      const output = [], commands = [];
      const evaluate = () => vm.runInNewContext(script[1], {
        process: { env: { DEPLOY_SHA: candidate, GITHUB_REPOSITORY: "owner/repo", GITHUB_OUTPUT: "output" } },
        console: { log() {} },
        require(name) {
          if (name === "node:fs") return { appendFileSync(file, text) { assert.equal(file, "output"); output.push(text); } };
          assert.equal(name, "node:child_process");
          return { execFileSync(command, args) {
            commands.push([command, ...args]);
            if (head instanceof Error) throw head;
            return head;
          } };
        },
      }, { timeout: 1000 });
      return { evaluate, output, commands };
    }
    for (const [candidate, head, expected] of [[old, old, true], [latest, latest, true], [old, latest, false]]) {
      const scenario = run(candidate, head + "\n");
      scenario.evaluate();
      assert.deepEqual(scenario.output, [`current=${expected}\n`]);
      assert.deepEqual(scenario.commands, [["gh", "api", "repos/owner/repo/git/ref/heads/main", "--jq", ".object.sha"]]);
    }
    for (const head of ["", "null", new Error("GitHub API unavailable")]) {
      const scenario = run(old, head);
      assert.throws(scenario.evaluate);
      assert.deepEqual(scenario.output, []);
    }
    const invalid = run("main", latest);
    assert.throws(invalid.evaluate, /SHA 无效/);
    assert.deepEqual(invalid.commands, []);
    assert.deepEqual(invalid.output, []);
  });

  await test("资讯每天北京时间 08:17 采集，定时无输入使用 14 天，手动输入仍生效", () => {
    const news = workflows["news-collect.yml"];
    assert.match(news, /schedule:\n\s+- cron: "17 0 \* \* \*"/);
    assert.match(news, /workflow_dispatch:\n\s+inputs:\n\s+days:/);
    const collect = stepBlock(news, "collect");
    const expression = /NEWS_WINDOW_DAYS: \$\{\{ (.+) \}\}/.exec(collect);
    assert.ok(expression);
    for (const [inputs, expected] of [[{}, 14], [{ days: 30 }, 30]]) {
      const days = vm.runInNewContext(expression[1], { inputs }, { timeout: 1000 });
      assert.equal(days, expected);
      assert.deepEqual(parseNewsArgs(["--days", String(days)]), { days: expected });
    }
    assert.match(collect, /collect-news\.js --days "\$NEWS_WINDOW_DAYS"/);
    assert.doesNotMatch(news, /CLAUDE_CODE_OAUTH_TOKEN|ANTHROPIC_API_KEY|gh pr merge/, "基础采集不依赖 Claude，也不自动合并");
  });

  await test("巡检 artifact 保留完整资讯状态和损坏原字节，补丁下载位置不变", () => {
    const inspection = workflows["daily-inspection.yml"], backup = stepBlock(inspection, "news-backup");
    assert.match(backup, /always\(\).*steps\.credentials\.outputs\.ready/);
    const script = /node <<'NODE'\n([\s\S]*?)\n {10}NODE/.exec(backup);
    assert.ok(script, "备份使用可直接执行的 Node 代码");
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-news-backup-"));
    try {
      const news = path.join(temporary, "data/audit/news"), output = path.join(temporary, "inspection");
      fs.mkdirSync(news, { recursive: true });
      fs.mkdirSync(output);
      const corruptBytes = Buffer.from([0xff, 0x00, 0x7b, 0x62, 0x61, 0x64]);
      fs.writeFileSync(path.join(news, "inbox.json"), corruptBytes);
      const quarantined = quarantineCorruptInbox(news);
      assert.ok(quarantined);
      const files = { "inbox.json": "{\"reviewHistory\":[\"accepted\"]}", "state.json": "{\"pageHash\":\"baseline\"}",
        "latest.json": "{\"status\":\"partial\"}", "health.json": "{\"consecutiveFailures\":2}", "triage.json": "{\"awaitingPublication\":[1]}" };
      for (const [file, bytes] of Object.entries(files)) fs.writeFileSync(path.join(news, file), bytes);
      fs.writeFileSync(path.join(output, "inspection.patch"), "patch");
      execFileSync(process.execPath, ["-e", script[1]], { cwd: temporary, env: { ...process.env, OUT: output } });
      for (const [file, bytes] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(output, "news", file), "utf8"), bytes, file);
      assert.deepEqual(fs.readFileSync(path.join(output, "news-corrupt", path.basename(quarantined))), corruptBytes);
      assert.equal(fs.readFileSync(path.join(output, "inspection.patch"), "utf8"), "patch");
      assert.match(inspection, /path: \$\{\{ runner\.temp \}\}\/inspection\//, "保持单一上传根，避免 artifact 嵌套改变补丁路径");
      assert.equal(inspection.match(/path: \$\{\{ runner\.temp \}\}\/inspection\n/g)?.length, 2, "两处下载使用相同根");
    } finally {
      assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
      assert.ok(path.basename(temporary).startsWith("workflow-news-backup-"));
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  await test("巡检采集失败单独置红，保留可用候选的 CI 和人工审核 PR", () => {
    const inspection = workflows["daily-inspection.yml"], inspect = jobBlock(inspection, "inspect");
    assert.match(stepBlock(inspect, "collect"), /continue-on-error: true/);
    assert.match(inspect, /collect_outcome: \$\{\{ steps\.collect\.outcome \}\}/);
    const health = jobBlock(inspection, "collection-health"), condition = /if: \$\{\{ (.+) \}\}/.exec(health);
    assert.ok(condition);
    assert.match(health, /needs: inspect/);
    for (const outcome of ["failure", "success", "skipped"]) {
      const shouldFail = vm.runInNewContext(condition[1], { always: () => true, needs: { inspect: { outputs: { collect_outcome: outcome } } } }, { timeout: 1000 });
      assert.equal(shouldFail, outcome === "failure", outcome);
    }
    assert.match(health, /run: \|\n(?:.*\n)*\s+exit 1/);
    for (const name of ["propose", "verify", "pull-request"]) assert.doesNotMatch(jobBlock(inspection, name), /needs:[^\n]*collection-health/, "来源健康不阻断 " + name);
    assert.match(jobBlock(inspection, "propose"), /needs: inspect/);
    assert.match(jobBlock(inspection, "verify"), /uses: \.\/\.github\/workflows\/ci\.yml/);
    assert.doesNotMatch(inspection, /gh pr merge|enablePullRequestAutoMerge/, "仍需维护者审核后合并");
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
