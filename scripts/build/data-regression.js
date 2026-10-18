"use strict";
/* 数据快照回归：针对当前已收录套餐与模型的具体事实断言，与结构校验（validate-data.js）分离。
 * 厂商改名、下架、改文案时更新本文件的断言；结构校验器不应随数据内容变化。
 * 本文件由 validateData 在同一沙箱数据上调用，候选源码与正式数据走同一套规则。 */

/* 不能当 Coding Agent 的免费档：data.js 的 isFreeCodingEntry 必须已经排除它们（而不是靠这里复制一份排除逻辑）。 */
const NOT_CODING_FREE = [
  ["Lovable", "Free"],
  ["Bolt.new", "Free"],
  ["Anthropic", "Claude Free"],
  ["xAI", "Grok Free"],
  ["ZenMux", "Free"],
];

/* 定制档不应只填年付价（复制残留的典型信号）；下列永久 ID 的年付价在 quota 里有官方依据，显式豁免。 */
const ANNUAL_ONLY_EXEMPT = new Set(["plan-0007"]);

/**
 * @param {any} d validate-data 解析出的 data.js 全局（含同一份代码里的业务函数）
 * @param {{check:(cond:boolean, msg:string)=>void}} out
 */
function dataRegressionChecks(d, out) {
  const { PLANS, MODEL_ROLES, matchModelRoles, isRetiredPlan, isFreeCodingEntry, resolvedField, hasOwnClient, offerable } = d;
  const { check } = out;

  for (const p of PLANS.filter((p) => p.priceM == null && p.priceY != null)) {
    check(ANNUAL_ONLY_EXEMPT.has(p.id), `PLANS 无月付价却有年付折月价（如为定制报价请改 priceY: null）: ${p.vendor || "?"}|${p.plan || "?"}`);
  }

  for (const [vendor, plan] of NOT_CODING_FREE) {
    const p = PLANS.find((x) => x.vendor === vendor && x.plan === plan);
    if (!p) continue;
    const noted = (p.note || "").includes("不列入");
    check(p.priceM === 0 && (isRetiredPlan(p) || noted) && !isFreeCodingEntry(p),
      `不能当 Coding Agent 的免费档须标明不列入（或已下架）且被 isFreeCodingEntry 排除: ${vendor}|${plan}`);
  }

  const goPlus = PLANS.find((p) => p.plan === "OpenCode Go Plus");
  check(goPlus && /Claude Code/i.test(resolvedField(goPlus, "tools")), "OpenCode Go Plus 的工具应解析到 Go（含 Claude Code）");
  const droid = PLANS.find((p) => p.plan === "Droid Pro");
  check(droid && hasOwnClient(droid), "Droid Pro 应识别为自家客户端");
  const hub = PLANS.find((p) => p.plan === "通用 Token Plan Lite");
  check(hub && !hasOwnClient(hub), "TokenHub API 套餐不应算自家客户端");
  const arkLite = PLANS.find((p) => p.plan === "方舟 Coding Plan Lite");
  check(arkLite && offerable(arkLite), "备注里的限量补货不应取消可购买");
  const flashSale = PLANS.find((p) => /限量抢购/.test(p.plan || ""));
  check(flashSale && !offerable(flashSale), "计划名中的限量抢购不应直接推荐");

  check(MODEL_ROLES.length >= 8, "缺少 MODEL_ROLES");
  const idsOf = (text) => matchModelRoles(text).map((r) => r.id);
  const flashOnly = idsOf("GLM-5.3-Flash");
  check(flashOnly.includes("flash") && !flashOnly.includes("glm-5"), "仅 Flash 的写法不应匹配 GLM-5.3 复杂任务角色");
  const glmBoth = idsOf("GLM-5.3、GLM-5.3-Flash");
  check(glmBoth.includes("glm-5") && glmBoth.includes("flash"), "GLM-5.3 与 Flash 应能同时匹配");
  const claudeFree = idsOf("Claude Sonnet 5 / Haiku 4.5（不含 Opus）");
  check(!claudeFree.includes("claude-opus") && claudeFree.includes("sonnet"), "不含 Opus 的套餐不应匹配 Opus");
  const claudePro = idsOf("Claude Opus 5.5 / Sonnet 5 / Haiku 4.5（Fable 5.1 需 usage credits）");
  check(claudePro.includes("claude-opus") && !claudePro.includes("claude-fable"), "需另购 credits 的 Fable 不应算进套餐");
  check(idsOf("Grok 4.5–4.7、Composer 2.5").includes("grok"), "Cursor 的 Grok 4.5–4.7 应匹配日常角色");
  const opusRole = MODEL_ROLES.find((r) => r.id === "claude-opus");
  const grokRole = MODEL_ROLES.find((r) => r.id === "grok");
  check(opusRole && opusRole.task === "hard" && opusRole.burn === "fast", "Claude Opus 应为复杂任务、消耗快");
  check(grokRole && grokRole.task === "daily" && grokRole.burn === "slow", "Grok 应为日常、消耗慢");
}

module.exports = { dataRegressionChecks, NOT_CODING_FREE, ANNUAL_ONLY_EXEMPT };
