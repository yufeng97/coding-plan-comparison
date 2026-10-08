"use strict";
// Publisher embeds machine-readable JSON. Use only the team-checked Bash Only entries.
async function collect(get) {
  const source = await get("https://www.swebench.com/");
  const match = /<script\s+type="application\/json"\s+id="leaderboard-data">([\s\S]*?)<\/script>/.exec(source.text);
  if (!match) throw new Error("SWE-bench 官方 JSON 入口改变");
  const groups = JSON.parse(match[1]);
  const rows = groups.find(group => group.name === "Verified")?.results?.filter(row => row.agent === "mini-SWE-agent" && row.checked === true);
  if (!rows?.length) throw new Error("SWE-bench Verified Bash Only 官方成绩为空或协议改变");
  const id = "swebench-verified-bash-only";
  const benchmarks = [{ id, family: "SWE-bench", name: "SWE-bench Verified · Bash Only", version: "Verified / 500 tasks", category: "编程", metric: "问题解决率", unit: "%", description: "真实 GitHub issue 修复任务；仅收录官方团队运行或直接核验的 mini-SWE-agent 成绩。", configuration: "Bash Only / 单次尝试；mini-SWE-agent 小版本和推理档位随成绩展示，小版本差异仍可能影响分数。", scope: "500 项 Verified 任务；不混入其他 Agent、多次尝试、Lite、Full 或未获团队核验的投稿。官方标注日期取最后一条运行/投稿记录的 date，不代表榜单更新时间。", sourceUrl: source.url, sourceUpdatedAt: rows.reduce((latest, row) => row.date > latest ? row.date : latest, ""), checkedAt: source.checkedAt }];
  const scores = rows.map(row => {
    if (typeof row["mini-swe-agent_version"] !== "string" || !Array.isArray(row.tags) || !row.tags.includes("System: Attempts - 1")) throw new Error("SWE-bench 单次尝试 / Agent 版本缺失");
    const modelTags = row.tags.filter(tag => tag.startsWith("Model: ")).map(tag => tag.slice(7));
    if (modelTags.length !== 1 || !Number.isFinite(row.resolved)) throw new Error("SWE-bench 模型身份或问题解决率改变");
    const cost = row.instance_cost;
    if (cost !== null && !Number.isFinite(cost)) throw new Error("SWE-bench 每任务费用缺失字段");
    return { id: "", benchmarkId: id, model: modelTags[0], reasoning: row.reasoning_effort, agent: "mini-SWE-agent " + row["mini-swe-agent_version"], score: row.resolved, costUSD: cost, costNote: cost === null ? null : "官方记录的每任务平均 API 费用；运行日期 " + row.date + "，不是当前单价或订阅费用。", uncertainty: row.warning || null, tokens: null, steps: null, sourceUrl: source.url, checkedAt: source.checkedAt };
  });
  return { benchmarks, scores };
}
module.exports = { collect };
