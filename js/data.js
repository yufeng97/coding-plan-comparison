/* ============================================================
 * Coding Plan 全球比价中心 - 数据文件
 * 调研日期: 2026-09-23（2026-09-29 增补 Kiro / Droid / 讯飞 Astron / 阶跃 Step Plan / Canopy Wave 等），
 * 价格逐条核查状态见 PRICE_CHECKS；待核实历史价仅作参考
 * 汇率: 1 USD ≈ 6.71 CNY（2026-09-23 frankfurter 实测 6.7074，
 *       仅用于图表统一折算展示，实付以官方计价货币为准）
 * ============================================================ */

const RATE_USD_CNY = 6.71;
/* 同一汇率日期：Frankfurter USD/INR=95.74、USD/CNY=6.7074；保留印度原价。 */
const RATE_INR_CNY = 6.7074 / 95.74;

const META = {
  updated: "2026-10-09",
  rate: RATE_USD_CNY,
  rateAsOf: "2026-09-23",
  rateSource: "https://api.frankfurter.dev/v1/2026-09-23?base=USD&symbols=CNY,INR",
};

/* 模型在「帮我选」里的用法，不是跑分。
   task: hard=复杂任务  daily=日常
   burn: fast=窗口打得快  slow=慢烧  same=比旗舰耐用，但通常仍是同一个窗口
   band: 只用来在预算内选主计划（A 高于 B），页面不展示字母或分数
   ceiling: 同套餐里更吃额度的上限模型，不拿来当默认复杂任务模型 */
const MODEL_ROLES = [
  { id: "claude-fable", name: "Claude Fable", re: /fable/i, task: "hard", burn: "fast", band: "A", ceiling: true,
    reason: "能做更难的任务，但会占掉每周限额的一大块", asOf: "2026-09-30" },
  { id: "claude-opus", name: "Claude Opus", re: /opus/i, task: "hard", burn: "fast", band: "A",
    reason: "复杂任务首选，按 5 小时窗口计，连续跑很容易打满", asOf: "2026-09-30" },
  { id: "gpt-astra", name: "GPT-6 Astra", re: /astra/i, task: "hard", burn: "fast", band: "B", ceiling: true,
    reason: "能做复杂任务，官方 5 小时条数比 Sol 和 Luna 少很多", asOf: "2026-09-30" },
  { id: "gpt-sol", name: "GPT-6 Sol", re: /gpt-(?:6|5\.6)\s*sol|(?:^|[^a-z])sol(?:[^a-z]|$)/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂编码可用，5 小时条数明显紧于 Luna", asOf: "2026-09-30" },
  { id: "gemini-pro", name: "Gemini Pro", re: /gemini\s*3(?:\.\d+)?\s*pro|deep\s*think/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务可用，官方没有单列可折算的 5 小时 tokens", asOf: "2026-09-30" },
  { id: "kimi-k3", name: "Kimi K3", re: /kimi\s*[- ]?k3|(?:^|[^a-z0-9])k3(?:[^a-z0-9]|$)/i, task: "hard", burn: "fast", band: "B",
    reason: "国内复杂任务的主力之一，和同套餐里的小模型共用窗口", asOf: "2026-09-30" },
  { id: "glm-5", name: "GLM-5.3", re: /glm-?\s*5(?:\.\d+)?(?![\w.-]*flash)/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务用这一档，Flash 只是同一窗口里更省额度", asOf: "2026-09-30" },
  { id: "deepseek-pro", name: "DeepSeek Pro", re: /deepseek[\w.\s/-]*pro/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务可用，Flash 是同套餐里的慢烧档", asOf: "2026-09-30" },
  { id: "qwen-max", name: "Qwen Max", re: /qwen[\w.\s-]*max|qwen3(?:\.\d+)?-coder-(?:plus|next)/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务可用的国产旗舰", asOf: "2026-09-30" },
  { id: "minimax-m3", name: "MiniMax M3", re: /minimax[\s-]*m3/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务能用，官方按 5 小时窗口计，没有公布 token 总量", asOf: "2026-09-30" },
  { id: "mimo-pro", name: "MiMo Pro", re: /mimo[\w.-]*pro/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务用 Pro，Flash 是同一额度里更省的档", asOf: "2026-09-30" },
  { id: "doubao-pro", name: "Doubao Seed", re: /doubao-seed-[\d.]+-(?:pro|code)|seed-[\d.]+-(?:pro|code)/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务可用的豆包编程模型", asOf: "2026-09-30" },
  { id: "step-5", name: "Step 5", re: /step-5/i, task: "hard", burn: "fast", band: "B",
    reason: "复杂任务用 Step 5，Flash 是同一月池里的慢烧档", asOf: "2026-09-30" },
  { id: "hy", name: "混元 Hy3/Hy4", re: /hy[34](?:\b|[.-])/i, task: "hard", burn: "fast", band: "B",
    reason: "腾讯云里可以拿来做复杂任务的混元档", asOf: "2026-09-30" },
  { id: "grok", name: "Grok 4", re: /grok\s*4(?:\.\d+)?/i, task: "daily", burn: "slow", band: "C",
    reason: "日常任务够用，放在大额池里适合当补充", asOf: "2026-09-30" },
  { id: "composer", name: "Composer", re: /composer/i, task: "daily", burn: "slow", band: "C",
    reason: "轻量补全和日常 Agent", asOf: "2026-09-30" },
  { id: "luna", name: "GPT-6 Luna", re: /luna/i, task: "daily", burn: "slow", band: "C",
    reason: "日常编码的慢烧档，官方 5 小时条数比 Sol、Astra 宽", asOf: "2026-09-30" },
  { id: "haiku", name: "Claude Haiku", re: /haiku/i, task: "daily", burn: "slow", band: "C",
    reason: "轻量档；和 Opus 写在同一套餐里时，窗口还是那一个", asOf: "2026-09-30" },
  { id: "sonnet", name: "Claude Sonnet", re: /sonnet/i, task: "daily", burn: "same", band: "C",
    reason: "比 Opus 耐用一些，通常仍共用同一个 5 小时窗口", asOf: "2026-09-30" },
  { id: "flash", name: "Flash", re: /flash/i, task: "daily", burn: "slow", band: "C",
    reason: "同一套餐里的慢烧档，复杂重构不要靠它", asOf: "2026-09-30" },
];

function matchModelRoles(text) {
  const raw = String(text || "");
  const blockedA = /不含旗舰/.test(raw);
  const denied = [...raw.matchAll(/不(?:含|支持|包含|提供)\s*([^。；;，,（）]+)/g)].map((m) => m[1]);
  return MODEL_ROLES.filter((role) => {
    if (!role.re.test(raw)) return false;
    if (blockedA && role.band === "A") return false;
    if (denied.some((part) => role.re.test(part))) return false;
    if (role.id === "claude-opus" && /不含[^。；;]{0,16}opus/i.test(raw)) return false;
    if (role.id === "claude-fable" && /fable[^。；;]{0,48}需\s*usage\s*credits/i.test(raw)) return false;
    return true;
  });
}

/* ============================================================
 * 计划分类判定函数（供 js/app-*.js 渲染与 scripts/build/validate-data.js 校验共用）。
 * 有意用全局函数而非模块：浏览器端 data.js 先于 app.js 加载，零构建直接引用；
 * 校验器在 VM 沙箱中运行同一份 data.js，天然复用，避免两边逻辑漂移。
 * ============================================================ */
function isRetiredPlan(p) { return /已停售|已下架/.test((p && p.plan) || "") || (priceCheckOf(p) || {}).status === "retired"; }
function isOneTimePlan(p) { return /一次性|预付/.test((p && p.plan) || ""); }
function isRenewalOnly(p) { return /老用户/.test((p && p.plan) || ""); }
function isFourWeekPlan(p) { return /4\s*周|四周|4\s*weeks?/i.test((p && p.plan) || ""); }
/* 在售个人月付：不含团队整包、已停售/已下架、一次性预付、仅老用户可续及4周计费档 */
function isPersonalMonthly(p) {
  return !!(p && p.priceM > 0 && !p.seat && p.cat !== "team" && !isRetiredPlan(p) && !isOneTimePlan(p) && !isRenewalOnly(p) && !isFourWeekPlan(p));
}
/* 免费 Coding 入口：在售，且能当编程 Agent 或编程工具用。
   已下架不算。聊天免费档、无 API 的网页档、自家应用构建器不算。 */
function isFreeCodingEntry(p) {
  if (!p || p.priceM !== 0 || isRetiredPlan(p) || !isPriceConfirmed(p)) return false;
  if (p.vendor === "Lovable" || p.vendor === "Bolt.new") return false;
  if (p.plan === "Claude Free" || p.plan === "Grok Free") return false;
  if (p.vendor === "ZenMux" && p.plan === "Free") return false;
  return true;
}
/* 在售且明码标价（用于完整数据表与「在售订阅计划」统计卡；免费档、按量/定制、已停售不计） */
function isOnSalePlan(p) {
  return !!(p && p.priceM > 0 && !isRetiredPlan(p));
}
/* 能否直接下单。只看计划名：备注里的补货限制或「限量模型」不把整档移出推荐。 */
function offerable(p) {
  const name = String((p && p.plan) || "");
  if (/抢购/.test(name)) return false;
  return !/(?:^|[^不])限量/.test(name);
}
/* 编程工具本身免费不等于推理免费；国别专属档须明确满足购买资格。 */
function hasIncludedModelQuota(p) {
  return !!p && p.includedModelQuota !== false && p.modelAccess !== "byok";
}
function isPurchaseCountryAllowed(p, country) {
  if (!p || !Array.isArray(p.purchaseCountries) || !p.purchaseCountries.length) return !!p;
  const code = String(country || "").toUpperCase();
  return !!code && p.purchaseCountries.some((c) => String(c).toUpperCase() === code);
}
/* 自带编程入口。英文 Desktop / CLI 与「桌面 / 客户端」同样算；兼容端点、协议、框架不算。 */
const OWN_CLIENT_RE = /IDE|客户端|桌面|\bDesktop\b|网页|VS Code|插件|编辑器|\bCLI\b|终端/i;
const OWN_CLIENT_EXCLUDE_RE = /协议|框架|端点|兼容/;
/* 只有「同上」按位置继承；点名的档位先按名称/fieldRefs 找，追加权益原样保留。
   循环引用返回空串，让校验器报错，而非把未解析的「同」文案当成可用字段。 */
function findPlanReference(ref) {
  if (typeof ref === "string") return PLANS.find((p) => p.id === ref) || null;
  if (Array.isArray(ref) && ref.length === 2) return PLANS.find((p) => p.vendor === ref[0] && p.plan === ref[1]) || null;
  return null;
}
function resolvedField(p, key, seen) {
  const raw = String((p && p[key]) || "");
  if (p && key === "models" && (p.modelBaseRef != null || p.modelIncludes || p.modelExcludes)) {
    if (seen && seen.has(p)) return "";
    const stack = new Set(seen || []);
    stack.add(p);
    const base = p.modelBaseRef != null ? findPlanReference(p.modelBaseRef) : null;
    const inherited = base && resolvedField(base, key, stack);
    if (p.modelBaseRef != null && !inherited) return "";
    const parts = [raw];
    if (inherited) parts.push("继承模型：" + inherited);
    if (p.modelIncludes && p.modelIncludes.length) parts.push("本档模型：" + p.modelIncludes.join("、"));
    if (p.modelExcludes && p.modelExcludes.length) parts.push("本档不支持：" + p.modelExcludes.join("、"));
    return parts.filter(Boolean).join("；");
  }
  if (!p || !/^同/.test(raw)) return raw;
  if (seen && seen.has(p)) return "";
  const stack = new Set(seen || []);
  stack.add(p);
  const idx = PLANS.indexOf(p);
  const rest = raw.replace(/^同\s*/, "");
  const cut = rest.search(/[（(+＋:：，,；;]|[档版](?=且|全模型)/);
  const head = (cut < 0 ? rest : rest.slice(0, cut)).trim();
  const tail = cut < 0 ? "" : rest.slice(cut).replace(/^[档版](?=且|全模型)/, "");
  const hint = head.replace(/(?:档|版)$/, "").trim();
  let best = null;
  let bestScore = -1;
  const explicit = p.fieldRefs && p.fieldRefs[key];
  if (explicit != null) {
    best = findPlanReference(explicit);
  } else if (hint === "上") {
    for (let i = idx - 1; i >= 0; i--) {
      if (PLANS[i].vendor !== p.vendor) break;
      if (PLANS[i][key]) { best = PLANS[i]; break; }
    }
  } else {
    const fold = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
    const h = fold(hint);
    const words = hint.match(/[a-z][a-z0-9.-]*|\d+(?:\.\d+)?|[\u3400-\u9fff]+/gi) || [];
    for (const other of PLANS) {
      if (other === p || other.vendor !== p.vendor || !other[key]) continue;
      const name = fold(other.plan);
      const genericPersonal = hint === "个人" && !other.seat && other.cat !== "team";
      const named = !!h && (name.includes(h) || words.every((w) => name.includes(fold(w))));
      if (!genericPersonal && !named) continue;
      const score = (name === h ? 100 : name.endsWith(h) ? 90 : name.includes(h) ? 80 : genericPersonal ? 40 : 60) - name.length / 100;
      if (score > bestScore) { bestScore = score; best = other; }
    }
  }
  if (!best) return "";
  const base = resolvedField(best, key, stack);
  return base ? base + (tail ? " " + tail : "") : "";
}
function hasOwnClient(p) {
  if (p && typeof p.ownClient === "boolean") return p.ownClient;
  const tools = resolvedField(p, "tools");
  return OWN_CLIENT_RE.test(tools) && !OWN_CLIENT_EXCLUDE_RE.test(tools);
}

/* 类别: official=模型官方订阅  tool=第三方工具订阅  team=团队/企业/云厂商 */
/* region: intl=国际  cn=国内 */
/* priceM=月付价格(月)  priceY=年付折算每月  seat=true 表示每席位/每用户价 */
/* windowPeriod/quotaSharing 仅填有依据的周期与共享关系，缺省表示未知。
   includedModelQuota=false 或 modelAccess=byok 表示工具费不含推理额度；
   codingSurface=false 排除无编程入口的档，purchaseCountries 使用 ISO 国别码。
   id 是永久标识，新增档位使用未占用的 ID，不随名称或数组顺序变化。
   fieldRefs 为有歧义的「同」字段提供计划 ID；旧 [vendor, plan] 引用仍兼容。 */

/** @type {Plan[]} */
const PLANS = [
  /* ---------- 模型官方订阅 · 国际 ---------- */
  { id: "plan-0001", vendor: "Anthropic", plan: "Claude Free", cat: "official", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "用量按滚动 5 小时窗口重置；官方明确不含 Claude Code",
    models: "Claude Sonnet 5.5 / Haiku 4.5（不含 Opus）",
    tools: "Claude 网页/桌面/移动端",
    note: "免费档不可用 Claude Code，不列入免费 Coding 入口",
    url: "https://claude.com/pricing" },
  { id: "plan-0002", vendor: "Anthropic", plan: "Claude Pro", cat: "official", region: "intl", priceM: 20, priceY: 16.67, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "≥5× Free 用量/5h + 每周上限；Claude Code 与聊天共享用量池",
    models: "Claude Opus 5.5 / Sonnet 5.5 / Haiku 4.5（Fable 5.1 需 usage credits）",
    tools: "Claude Code（CLI/IDE）、Claude 全平台应用",
    note: "年付 $200/年（官方标 $17/月）；超额可购 Fable usage credits",
    url: "https://claude.com/pricing" },
  { id: "plan-0003", vendor: "Anthropic", plan: "Claude Max 5x", cat: "official", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "5× Pro 用量/5h + 每周上限",
    models: "Claude Opus 5.5 / Sonnet 5.5 / Haiku 4.5（Fable 5.1 占每周限额 50%）",
    tools: "Claude Code、Claude 全平台应用",
    note: "仅月付；高峰期优先访问",
    url: "https://claude.com/pricing" },
  { id: "plan-0004", fieldRefs: {"models":"plan-0003"}, vendor: "Anthropic", plan: "Claude Max 20x", cat: "official", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "20× Pro 用量/5h + 每周上限",
    models: "同 Max 5x",
    tools: "Claude Code、Claude 全平台应用",
    note: "官方帮助文档确认 $200/月（网页订阅），仅月付；移动端及税费可能不同",
    url: "https://claude.com/pricing" },
  { id: "plan-0005", vendor: "Anthropic", plan: "Claude Team（标准席位）", cat: "team", region: "intl", priceM: 25, priceY: 20, cur: "USD", seat: true,
    quota: "2–150 席；含 Claude Code；标准席位用量",
    models: "Claude Opus 5.5 / Sonnet 5.5 / Haiku 4.5",
    tools: "Claude Code、Claude 应用、Projects、管理后台",
    note: "年付 $20/席/月；标准+Premium 席位可混搭",
    url: "https://claude.com/pricing" },
  { id: "plan-0006", fieldRefs: {"tools":"plan-0005"}, vendor: "Anthropic", plan: "Claude Team（Premium 席位）", cat: "team", region: "intl", priceM: 125, priceY: 100, cur: "USD", seat: true,
    quota: "5× 标准席位用量",
    models: "含 Fable 5.1（仅 Premium 席位）+ Opus 5.5 / Sonnet 5.5 / Haiku 4.5",
    tools: "同 Team",
    note: "可与标准席位混搭",
    url: "https://claude.com/pricing" },
  { id: "plan-0007", vendor: "Anthropic", plan: "Claude Enterprise", cat: "team", region: "intl", priceM: null, priceY: 20, cur: "USD", seat: true,
    quota: "席位费（年付 $20/席/月）+ 超出部分按 API 费率计量",
    models: "全模型",
    tools: "Claude Code、SCIM、审计日志、RBAC",
    note: "官方年付席位费 $20/席/月，API 用量另计；合同及组织需求联系销售",
    url: "https://claude.com/pricing" },

  { id: "plan-0008", vendor: "OpenAI", plan: "ChatGPT Free", cat: "official", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "Codex 桌面版有限访问（GPT-6 Luna，Standard 速度）",
    models: "GPT-6 Luna",
    tools: "Codex（桌面 app）",
    note: "",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0009", vendor: "OpenAI", plan: "ChatGPT Go", cat: "official", region: "intl", priceM: 8, priceY: null, cur: "USD", seat: false,
    quota: "轻量编码任务（GPT-6 Luna，Standard 速度）",
    models: "GPT-6 Luna",
    tools: "Codex",
    note: "该档可能含广告",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0010", vendor: "OpenAI", plan: "ChatGPT Plus", cat: "official", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "Codex 本地消息/5h（官方估算区间）：GPT-6.1 Sol 15–160 条、GPT-6 Sol 15–150 条、Luna 350–3,000 条、Astra 5–45 条；另有每周限额",
    models: "GPT-6.1 Sol / GPT-6 Sol / Luna / Astra、GPT-5.6 系列",
    tools: "Codex（Web/CLI/IDE/iOS）、云任务",
    note: "超额可购 credits top-up 或转 API 按量；无年付；ChatGPT Work 与 Codex 用量共享",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0011", vendor: "OpenAI", plan: "ChatGPT Pro（$100）", cat: "official", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    windowPeriod: "none",
    quota: "官方 2026-10-01 页面口径：Pro 各档目前无 5 小时上限（用量见仪表盘）；含 Plus 全部模型与权益",
    models: "GPT-6 全系（Astra/Sol/6.1 Sol/Luna）、GPT-5.6 系列",
    tools: "Codex 全端 + 云 VM 任务",
    note: "官方页标 From $100/month，实际 $100/$200/$500 三档；此前的 5x/20x 倍率口径官方页已不再标注",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0012", fieldRefs: {"models":"plan-0011","quota":"plan-0011"}, vendor: "OpenAI", plan: "ChatGPT Pro（$200）", cat: "official", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    windowPeriod: "none",
    quota: "同 Pro $100：目前无 5 小时上限，配额高于 $100 档（官方未公布具体倍率）",
    models: "同 Pro $100",
    tools: "Codex 全端 + 云 VM 任务",
    note: "官方定价文档确认 $200/月；具体额度以用量仪表盘为准",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0013", fieldRefs: {"models":"plan-0011","quota":"plan-0012"}, vendor: "OpenAI", plan: "ChatGPT Pro（$500）", cat: "official", region: "intl", priceM: 500, priceY: null, cur: "USD", seat: false,
    windowPeriod: "none",
    quota: "同 Pro $200：目前无 5 小时上限；Astra Ultrafast 独占（订阅内按 8x 计量、credits 按 6x）",
    models: "同 Pro $100 + Astra Ultrafast",
    tools: "Codex 全端 + 云 VM 任务",
    note: "2026-09 底新增档位；Astra Ultrafast 另有部分 Enterprise/Edu 可用",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0014", vendor: "OpenAI", plan: "ChatGPT Business", cat: "team", region: "intl", priceM: 25, priceY: 20, cur: "USD", seat: true,
    quota: "标准席位限额同 Plus；另有 $100 Premium 席位（同 Pro 5x）",
    models: "GPT-6 系列",
    tools: "Codex（含 CLI/IDE）、SAML SSO、MFA",
    note: "原 ChatGPT Team 计划已并入 Business；2+ 用户",
    url: "https://learn.chatgpt.com/docs/pricing" },
  { id: "plan-0015", vendor: "OpenAI", plan: "ChatGPT Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "flexible pricing：credits 按量，无固定限额",
    models: "全模型",
    tools: "Codex 全端、SCIM、EKM、审计 API",
    note: "联系销售",
    url: "https://learn.chatgpt.com/docs/pricing" },

  { id: "plan-0016", vendor: "Google", plan: "Google AI Plus", cat: "official", region: "intl", priceM: 4.99, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", codingSurface: false,
    quota: "2× Gemini 访问；计算量计费（5 小时重置 + 每周上限）",
    models: "Gemini 3.1 Pro、Deep Research",
    tools: "Gemini 应用、Search AI 功能",
    note: "当前美国官网 $4.99/月；400GB 存储；地区实付以结账页为准",
    url: "https://one.google.com/about/google-ai-plans/" },
  { id: "plan-0017", vendor: "Google", plan: "Google AI Pro", cat: "official", region: "intl", priceM: 19.99, priceY: 16.67, cur: "USD", seat: false,
    quota: "4× Gemini 访问；AI Studio / Antigravity / Jules 扩展限额；超额可购 credits",
    models: "Gemini 3.1 Pro、Deep Research、Gemini Spark",
    tools: "Gemini 应用、AI Studio、Antigravity（agentic IDE）、Jules、Gemini CLI",
    note: "美国月付 $19.99、年付 $199.99（折月约 $16.67）；含 $10/月 GCP credits",
    url: "https://one.google.com/about/google-ai-plans/" },
  { id: "plan-0018", fieldRefs: {"tools":"plan-0017"}, vendor: "Google", plan: "Google AI Ultra（5x）", cat: "official", region: "intl", priceM: 99.99, priceY: null, cur: "USD", seat: false,
    quota: "约 5× Pro 限额；更高 AI Studio / Antigravity / Jules 限额",
    models: "Gemini 3.1 Pro、Deep Think、Gemini Agent",
    tools: "同 Pro 档且限额更高",
    note: "2026-05-19 I/O 起 $249.99 降至 $99.99；20TB 存储",
    url: "https://one.google.com/about/google-ai-plans/" },
  { id: "plan-0019", fieldRefs: {"models":"plan-0018","tools":"plan-0018"}, vendor: "Google", plan: "Google AI Ultra（20x）", cat: "official", region: "intl", priceM: 199.99, priceY: null, cur: "USD", seat: false,
    quota: "最高 20× 限额",
    models: "同 Ultra 5x + Project Genie 世界模型（独占）",
    tools: "同 Ultra 5x",
    note: "30TB 存储、$100/月 GCP credits",
    url: "https://one.google.com/about/google-ai-plans/" },
  { id: "plan-0020", vendor: "Google", plan: "Gemini CLI / Code Assist 个人免费版", cat: "official", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "Gemini CLI：1,000 次模型请求/日（60 次/分）；Code Assist：6,000 次代码补全 + 240 次 chat/日",
    models: "Gemini 3 系列（1M token 上下文）",
    tools: "Gemini CLI、VS Code 等 IDE 插件、Agent Mode",
    note: "更高限额需 AI Pro/Ultra 订阅或 API 按量",
    url: "https://codeassist.google/" },
  { id: "plan-0021", vendor: "Google", plan: "Gemini Code Assist Standard", cat: "cloud", region: "intl", priceM: 22.8, priceY: 19, cur: "USD", seat: true,
    quota: "Gemini CLI / Agent Mode：1,500 次模型请求/日",
    models: "Gemini 2.5 → Gemini 3",
    tools: "IDE 插件、Gemini CLI、Agent Mode",
    note: "年付 $19/user/月，月付 $22.80/user/月；Google Developer Program Premium（$299/年）内含",
    url: "https://codeassist.google/" },
  { id: "plan-0022", vendor: "Google", plan: "Gemini Code Assist Enterprise", cat: "cloud", region: "intl", priceM: 54, priceY: 45, cur: "USD", seat: true,
    quota: "Gemini CLI / Agent Mode：2,000 次模型请求/日",
    models: "Gemini 2.5 → Gemini 3（Preview 通道陆续开放）",
    tools: "IDE 插件、Gemini CLI、Agent Mode、企业管理",
    note: "年付 $45/user/月，月付 $54/user/月",
    url: "https://codeassist.google/" },

  { id: "plan-0023", vendor: "xAI", plan: "Grok Free", cat: "official", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "约 10 prompts / 2 小时（第三方观察口径）",
    models: "Grok 4.3（受限）",
    tools: "grok.com、X app",
    note: "仅网页/X 对话。Grok Build 需 SuperGrok 或 X Premium+，不列入免费 Coding 入口",
    url: "https://x.ai/pricing" },
  { id: "plan-0024", vendor: "xAI", plan: "SuperGrok Lite", cat: "official", region: "intl", priceM: 10, priceY: null, cur: "USD", seat: false,
    quota: "2× Free 对话时长；15 视频/日",
    models: "Grok 4.3（分阶段）",
    tools: "grok.com、X app",
    note: "历史价尚未得到本次官方确认；请以登录后的 Grok 结账页为准",
    url: "https://x.ai/pricing" },
  { id: "plan-0025", vendor: "xAI", plan: "SuperGrok", cat: "official", region: "intl", priceM: 30, priceY: null, cur: "USD", seat: false,
    codingSurface: true,
    ownClient: true,
    quota: "5× Free 对话时长；含 Grok Build 编码工具",
    models: "Grok 4.3、grok-build-0.1（256K 上下文）",
    tools: "Grok Build、grok.com、X app",
    note: "官方公开月价已核实；未列公开年费，登录结账页核对地区及税费",
    url: "https://x.ai/pricing" },
  { id: "plan-0026", vendor: "xAI", plan: "SuperGrok Plus", cat: "official", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    codingSurface: true,
    ownClient: true,
    quota: "Chat/Imagine/Voice/Build 全线更高用量；高峰优先",
    models: "Grok 4.3",
    tools: "Grok Build、grok.com、X app",
    note: "官方公开月价已核实；未列公开年费，登录结账页核对地区及税费",
    url: "https://x.ai/pricing" },
  { id: "plan-0027", vendor: "xAI", plan: "SuperGrok Heavy", cat: "official", region: "intl", priceM: 300, priceY: null, cur: "USD", seat: false,
    codingSurface: true,
    ownClient: true,
    quota: "最大限额；多 agent 模式最高 16 个并行；最新旗舰确认全量访问",
    models: "Grok 4.3",
    tools: "Grok Build、多 agent Heavy 模式",
    note: "历史价尚未得到本次官方确认；请以登录后的 Grok 结账页为准",
    url: "https://x.ai/pricing" },

  { id: "plan-0028", vendor: "Mistral", plan: "Mistral Vibe Free", cat: "official", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "受限编码会话（Vibe）；含 $10/月 API credits",
    models: "Mistral Medium 3.5 等",
    tools: "Vibe CLI/IDE/Web（受限）",
    note: "",
    url: "https://mistral.ai/pricing" },
  { id: "plan-0029", vendor: "Mistral", plan: "Mistral Vibe Pro", cat: "official", region: "intl", priceM: 14.99, priceY: null, cur: "USD", seat: false,
    quota: "Vibe 全天编码（CLI/IDE/Web）；含 $30/月 API credits",
    models: "Mistral Medium 3.5、Devstral",
    tools: "Vibe CLI、Vibe for IDE（VS Code/JetBrains）、Vibe on web、远程编码 agent",
    note: "学生价 $5.99/月",
    url: "https://mistral.ai/pricing" },
  { id: "plan-0030", fieldRefs: {"models":"plan-0029","tools":"plan-0029"}, vendor: "Mistral", plan: "Mistral Vibe Team", cat: "team", region: "intl", priceM: 24.99, priceY: null, cur: "USD", seat: true,
    quota: "每用户 $50/月 credits；30GB 存储/用户",
    models: "同 Pro",
    tools: "同 Pro + 协作、域名验证",
    note: "",
    url: "https://mistral.ai/pricing" },

  { id: "plan-0031", vendor: "Z.ai", plan: "GLM Coding V3 Lite", cat: "official", region: "intl", priceM: 18, priceY: 12.6, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "2,000 credits/5h + 10,000 credits/周；官方估算 48–104M tokens/周（GLM-5.3）",
    models: "GLM-5.3、GLM-5.3-Flash",
    tools: "Claude Code、Cline、OpenCode、Goose（Anthropic 兼容端点）",
    note: "当前月付 $18，季付 $43.2，年付 $151.2；旧公告金额已过时。非高峰减半及限时活动按官方使用文档执行",
    url: "https://z.ai/subscribe" },
  { id: "plan-0032", vendor: "Z.ai", plan: "GLM Coding V3 Pro", cat: "official", region: "intl", priceM: 80, priceY: 56, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "12,000 credits/5h + 60,000 credits/周；官方估算 290–627M tokens/周（Flash 约 877–1,901M/周）",
    models: "GLM-5.3、GLM-5.3-Flash",
    tools: "Claude Code、Cline、OpenCode、Goose",
    note: "当前月付 $80，季付 $192，年付 $672；旧公告金额已过时。非高峰减半及限时活动按官方使用文档执行",
    url: "https://z.ai/subscribe" },
  { id: "plan-0033", vendor: "Z.ai", plan: "GLM Coding V3 Max", cat: "official", region: "intl", priceM: 168, priceY: 117.6, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "28,000 credits/5h + 140,000 credits/周；官方估算 676–1,463M tokens/周（Flash 约 2,047–4,433M/周）",
    models: "GLM-5.3、GLM-5.3-Flash",
    tools: "Claude Code、Cline、OpenCode、Goose",
    note: "当前月付 $168，季付 $403.2，年付 $1411.2；旧公告金额已过时。非高峰减半及限时活动按官方使用文档执行",
    url: "https://z.ai/subscribe" },

  /* ---- Z.ai V1/V2（历史版本） ---- */
  { id: "plan-0034", vendor: "Z.ai", plan: "GLM Coding V1 Lite（已停售）", cat: "official", region: "intl", priceM: 3, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "约 120 prompts/5h（10 并发）；无每周上限",
    models: "GLM-4.5 时代",
    tools: "Claude Code",
    note: "2025-09 上线（$3/$15，Exclusive to Claude Code）；2026-02-12 停售；存量 2026-04-30 关自动续订",
    url: "https://docs.z.ai/devpack/transition.md" },
  { id: "plan-0035", vendor: "Z.ai", plan: "GLM Coding V1 Pro（已停售）", cat: "official", region: "intl", priceM: 15, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "约 600 prompts/5h（30 并发）；无每周上限",
    models: "GLM-4.5 时代",
    tools: "Claude Code",
    note: "同上",
    url: "https://docs.z.ai/devpack/transition.md" },
  { id: "plan-0036", vendor: "Z.ai", plan: "GLM Coding V2 Lite（老用户续费）", cat: "official", region: "intl", priceM: 18, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "约 80 prompts/5h + 约 400 prompts/周；高峰 3x/非高峰 2x 抵扣",
    models: "GLM-5 系列",
    tools: "Claude Code",
    note: "2026-02-12 上线（2-4 月间从 $3→$10→$18 多次调价）；V2 老用户可续订/升档",
    url: "https://docs.z.ai/devpack/notice/usage-revision.md" },
  { id: "plan-0037", vendor: "Z.ai", plan: "GLM Coding V2 Pro（老用户续费）", cat: "official", region: "intl", priceM: 72, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "约 400 prompts/5h + 约 2,000 prompts/周",
    models: "GLM-5 系列",
    tools: "Claude Code",
    note: "同上",
    url: "https://docs.z.ai/devpack/notice/usage-revision.md" },
  { id: "plan-0038", vendor: "Z.ai", plan: "GLM Coding V2 Max（老用户续费）", cat: "official", region: "intl", priceM: 160, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "约 1,600 prompts/5h + 约 8,000 prompts/周",
    models: "GLM-5 系列",
    tools: "Claude Code",
    note: "同上",
    url: "https://docs.z.ai/devpack/notice/usage-revision.md" },

  /* ---- OpenCode（开源终端 AI 编程 agent） ---- */
  { id: "plan-0039", vendor: "OpenCode (Anomaly/SST)", plan: "OpenCode Zen（按量付费）", cat: "tool", region: "intl", priceM: null, priceY: null, cur: "USD", seat: false,
    quota: "按 token 计费（零加价）；余额<$5 自动续充 $20（可关闭）；充值手续费 4.4%+$0.30/笔；可设工作区/成员级月度用量上限",
    models: "60+ 模型 per-token 原价（OpenAI/Anthropic/Google/Grok/Qwen/DeepSeek/GLM-5.3/Kimi K3/MiniMax M3 等）+9 个限时免费模型",
    tools: "官方宣称 no lock-in、可用于任意 agent；提供 Anthropic/OpenAI/Google 多协议端点",
    note: "无固定订阅档位；首月 $5 促销已于 2026-08 取消",
    url: "https://opencode.ai/docs/zen" },
  { id: "plan-0040", vendor: "OpenCode (Anomaly/SST)", plan: "OpenCode Go", cat: "tool", region: "intl", priceM: 10, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "逐模型月度美元上限：$15 档（GLM-5.3、Kimi K3 等）、$30 档、$60 档（GLM-5.3-Flash、Kimi K2.7 Code 等）；5h=月度 20%、周=50%、月=100%",
    models: "约 32 个开源/国产模型（GLM-5.3/Flash/5.2、Kimi K3/K2.7 Code、DeepSeek V4.1、Qwen3.8、MiniMax M3、Grok 4.7、GPT 5.6 Luna 等）",
    tools: "OpenCode、Claude Code、Codex、ZCode、Kilo Code CLI、Hermes（端点 opencode.ai/zen/go）",
    note: "与 Zen 按量并行的独立订阅；首月 $5 促销已取消；每工作区仅 1 人可订",
    url: "https://opencode.ai/docs/go/" },
  { id: "plan-0041", vendor: "OpenCode (Anomaly/SST)", plan: "OpenCode Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "私有化/自有 LLM 网关场景不按 token 收费",
    models: "任意（可强制仅用内部 AI 网关）",
    tools: "Central Config、SSO、禁用外部 provider、私有 npm 仓库",
    note: "联系销售（按席位定价）",
    url: "https://opencode.ai/docs/enterprise" },

  /* ---- R4 Coder（第三方国产模型 API 中转，2026-09-29 官网直抓更新） ---- */
  { id: "plan-0042", vendor: "R4 Coder（r4.codes）", plan: "Starter 预付包（已下架）", cat: "tool", region: "cn", priceM: 5, priceY: null, cur: "USD", seat: false,
    quota: "（已下架）原：一次性 $5 预付含 $30 可用额度（6 倍面值），30 天有效；最高 6 并发；模型折扣：Kimi K3 0.28 折、GLM 5.2 0.42 折、DeepSeek V4 Flash 0.83 折",
    models: "Kimi K3、GLM 5.3/5.3-Flash、DeepSeek V4.1 Flash/V4 Pro 等纯开源模型（无 Claude/GPT）",
    tools: "单一端点 api.r4.codes/v1 同时支持 OpenAI/Anthropic 协议；可接 Claude Code、Codex 等",
    note: "⚠️ 2026-09-30 确认下架（用户报告 + 官方现行首页已无该档，当日缓存旧页仍显示）；同时官网新增 $50 Code Max 档",
    url: "https://r4.codes/" },
  { id: "plan-0043", fieldRefs: {"tools":"plan-0042"}, vendor: "R4 Coder（r4.codes）", plan: "Code Max 预付包", cat: "tool", region: "cn", priceM: 50, priceY: null, cur: "USD", seat: false,
    quota: "一次性 $50 预付含 $300 可用额度（6 倍面值），30 天有效；最高 8 并发（各档中最高）",
    models: "Kimi K3、GLM 5.3/5.3-Flash、DeepSeek V4.1 Flash（-50% 促销档）、Step 5 Preview、U2 Flash（-90%）等纯开源模型",
    tools: "同 Starter",
    note: "2026-10-04 官网 Code Max 标为 Sold out，仅提供候补名单；一次性 $50 预付含 $300 额度、30 天有效、最高 8 并发，不是自动月续订。",
    url: "https://r4.codes/" },
  { id: "plan-0044", fieldRefs: {"models":"plan-0042","tools":"plan-0042"}, vendor: "R4 Coder（r4.codes）", plan: "Code Lite 预付包", cat: "tool", region: "cn", priceM: 10, priceY: null, cur: "USD", seat: false,
    quota: "一次性 $10 预付含 $60 可用额度（6 倍面值），30 天有效；最高 6 并发",
    models: "同 Starter（Kimi K3、GLM 5.3、DeepSeek V4 系列等）",
    tools: "同 Starter",
    note: "2026-10-04 官网名称 Code Lite，标为 Sold out，仅提供候补名单；一次性 $10 预付含 $60 额度、30 天有效、最高 6 并发。",
    url: "https://r4.codes/" },
  { id: "plan-0045", fieldRefs: {"models":"plan-0042","tools":"plan-0042"}, vendor: "R4 Coder（r4.codes）", plan: "Code Pro 预付包", cat: "tool", region: "cn", priceM: 20, priceY: null, cur: "USD", seat: false,
    quota: "一次性 $20 预付含 $120 可用额度（6 倍面值），30 天有效；最高 6 并发",
    models: "同 Starter",
    tools: "同 Starter",
    note: "2026-10-04 官网 Code Pro 标为 Sold out，仅提供候补名单；一次性 $20 预付含 $120 额度、30 天有效、最高 6 并发。",
    url: "https://r4.codes/" },

  /* ---- ZenMux（企业级 LLM API 聚合平台，保险赔付机制，Flows 订阅制 + 按量） ---- */
  { id: "plan-0046", vendor: "ZenMux", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "5 Flows/5h，仅限网页 Studio 聊天，无 API 访问",
    models: "Claude、GPT、Gemini、GLM、Kimi、MiniMax 等（100+ 模型目录）",
    tools: "网页 Studio（Free 档无 API）",
    note: "运营主体 NexaMind Singapore。Free 档无 API，不能接到 Claude Code / Codex，不列入免费 Coding 入口。付费档才有 API",
    url: "https://zenmux.ai/docs/guide/subscription.html" },
  { id: "plan-0047", vendor: "ZenMux", plan: "Starter", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "50 Flows/5h（25 Flows = $1，汇率浮动）+ 滚动 7 天周上限；速率 10–15 RPM",
    models: "基础模型 + 部分限时旗舰",
    tools: "Claude Code、Codex、Cline、Cursor、OpenCode、Gemini CLI、GitHub Copilot 等（OpenAI /v1 + Anthropic /api/anthropic 双协议）",
    note: "月度重置 4 次",
    url: "https://zenmux.ai/docs/guide/subscription.html" },
  { id: "plan-0048", fieldRefs: {"tools":"plan-0047"}, vendor: "ZenMux", plan: "Max", cat: "tool", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "300 Flows/5h + 滚动 7 天周上限",
    models: "基础 + 旗舰全模型",
    tools: "同 Starter",
    note: "月度重置 3 次；官方 Claude Code 接入文档齐全",
    url: "https://zenmux.ai/docs/guide/subscription.html" },
  { id: "plan-0049", fieldRefs: {"tools":"plan-0047"}, vendor: "ZenMux", plan: "Ultra", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "800 Flows/5h + 滚动 7 天周上限",
    models: "全部模型",
    tools: "同 Starter",
    note: "月度重置 2 次；订阅 24h 内未超面值可退（收 5%）",
    url: "https://zenmux.ai/docs/guide/subscription.html" },
  { id: "plan-0050", fieldRefs: {"models":"plan-0049","tools":"plan-0049"}, vendor: "ZenMux", plan: "按量充值（PAYG）", cat: "tool", region: "intl", priceM: null, priceY: null, cur: "USD", seat: false,
    quota: "1 Credit = $1，充值 $5–25,000 可自定义；+10% 充值赠送；无速率限制、无并发上限（生产定位）",
    models: "同上（100+ 模型）",
    tools: "同上",
    note: "Stripe / 支付宝（Antom）；退款 24h 内未使用 Credit 可退（收 5% 平台费）",
    url: "https://zenmux.ai/docs/guide/pay-as-you-go.html" },

  /* ---- 2026-09 增补：第三方中转站（Claude Code / Codex API 中转，多为充值制/号池制） ---- */
  { id: "plan-0051", vendor: "PackyCode/PackyAPI", plan: "主站按量充值（1元=1刀）", cat: "tool", region: "cn", priceM: null, priceY: null, cur: "CNY", seat: false,
    quota: "充值制非订阅：1 元人民币 = 1 美元额度，起充 ¥50；按 token 计费 + 分组倍率（Claude CC 分组 2.5×、GLM 2×、Kimi K3 10×、GPT-5.3-Codex 0.875× 等 27+ 分组）",
    models: "Claude 全系、GPT/Codex、Gemini、GLM、Kimi、Qwen、DeepSeek、Grok 等",
    tools: "Claude Code、Codex（CC 分组禁止接 Cline/OpenCode 等第三方工具，违者封号）",
    note: "注册赠 $1；首充 9 折码；退款收 5% 手续费；07-22 公告 Claude Max 倍率 2→2.5",
    url: "https://www.helpaio.com/transit" },
  { id: "plan-0052", vendor: "PackyCode (Codex 站)", plan: "Codex 包月（已停售）", cat: "tool", region: "cn", priceM: 60, priceY: null, cur: "CNY", seat: false,
    quota: "约 ¥60/枚（限购 1 枚/月，超出 ¥80/枚）；宣传 $60 额度可跑 Codex 约 1,500–2,500 次任务",
    models: "GPT/Codex 系列",
    tools: "Codex CLI（独立端点 codex-api.packycode.com/v1）",
    note: "2026-10-04 官网明确已停止销售，购买按钮禁用，建议转至 PackyAPI 按量使用。库存 ¥60 为历史社区券价，现行可购买价格无法确认。",
    url: "https://codex.packycode.com/pricing" },
  { id: "plan-0053", vendor: "AICodeMirror", plan: "PRO", cat: "tool", region: "cn", priceM: 259, priceY: 220.1, cur: "CNY", seat: false,
    quota: "305,000 credits/月（credit 单位口径官方未公布）；周付 ¥89、季付 ¥699",
    models: "Claude Opus 4 / Sonnet 4（定位 Claude Code 官方共享号池）",
    tools: "Claude Code（宣传另支持 Codex、Gemini CLI）",
    note: "年付 ¥2,641（原价 15% off，折合 ¥220/月）；注册送免费额度",
    url: "https://www.aicodemirror.com/api/pricing" },
  { id: "plan-0054", fieldRefs: {"models":"plan-0053","tools":"plan-0053"}, vendor: "AICodeMirror", plan: "MAX", cat: "tool", region: "cn", priceM: 559, priceY: 475, cur: "CNY", seat: false,
    quota: "699,000 credits/月",
    models: "同 PRO 档",
    tools: "同 PRO 档",
    note: "年付 ¥5,700（折合 ¥475/月）；季付 ¥1,509",
    url: "https://www.aicodemirror.com/api/pricing" },
  { id: "plan-0055", fieldRefs: {"models":"plan-0053","tools":"plan-0053"}, vendor: "AICodeMirror", plan: "ULTRA", cat: "tool", region: "cn", priceM: 1259, priceY: 1079.5, cur: "CNY", seat: false,
    quota: "1,678,000 credits/月",
    models: "同 PRO 档",
    tools: "同 PRO 档",
    note: "年付 ¥12,954（折合 ¥1,079/月）；季付 ¥3,399；社区有'粉转黑、频繁调规则'评价",
    url: "https://www.aicodemirror.com/api/pricing" },
  { id: "plan-0056", vendor: "88code", plan: "FREE（已下架）", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "已停发。文档写明 FREE 不再向公众发放，仅包月用户可生成",
    models: "Claude、Codex",
    tools: "Claude Code、Codex",
    note: "2026-09-30：www.88code.ai 返回 403，docs.88code.org 连接失败；可达快照写明 FREE 已不发放。不列入免费 Coding 入口",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0057", vendor: "88code", plan: "PayGo（¥66 一次性 200 刀）", cat: "tool", region: "cn", priceM: 66, priceY: null, cur: "CNY", seat: false,
    quota: "一次性 200 刀额度（非月付）；Claude/Codex 均支持，Codex 0.5 倍消耗",
    models: "Claude、Codex",
    tools: "Claude Code、Codex",
    note: "文档价 ¥66。另有 ¥666 一次性 1988 刀档。站点 2026-09-30 访问为 403，是否仍可下单未证实",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0058", vendor: "88code", plan: "PLUS 包月", cat: "tool", region: "cn", priceM: 198, priceY: null, cur: "CNY", seat: false,
    quota: "每天 40 刀，额度上限 20 美元，每天两次恢复至上限；最大 4 客户端并发",
    models: "Claude Max20 号池、Codex TEAM 号池",
    tools: "Claude Code、Codex",
    note: "仅提供中转，最终服务方为 Anthropic/OpenAI；按日退款。站点访问不稳定（403）",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0059", fieldRefs: {"models":"plan-0058"}, vendor: "88code", plan: "PRO 包月", cat: "tool", region: "cn", priceM: 398, priceY: null, cur: "CNY", seat: false,
    quota: "每天 120 刀，额度上限 60 美元，每天两次恢复至上限",
    models: "同 PLUS 档",
    tools: "Claude Code、Codex",
    note: "文档由 ¥298 调整为 ¥398。站点访问不稳定（403）",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0060", fieldRefs: {"models":"plan-0058"}, vendor: "88code", plan: "MAX 包月", cat: "tool", region: "cn", priceM: 698, priceY: null, cur: "CNY", seat: false,
    quota: "每天 200 刀，额度上限 100 美元，每天两次恢复至上限",
    models: "同 PLUS 档",
    tools: "Claude Code、Codex",
    note: "文档由 ¥598 调整为 ¥698。站点访问不稳定（403）",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0061", vendor: "88code", plan: "PayGo（¥666 一次性 1988 刀）", cat: "tool", region: "cn", priceM: 666, priceY: null, cur: "CNY", seat: false,
    quota: "一次性 1988 刀额度（非月付）；一对一支持",
    models: "Claude、Codex",
    tools: "Claude Code、Codex",
    note: "文档新增档。站点 2026-09-30 访问为 403，是否仍可下单未证实",
    url: "https://docs.88code.org/88code/pricing.html" },
  { id: "plan-0062", vendor: "DuckCoding", plan: "按量（分组倍率制）", cat: "tool", region: "cn", priceM: null, priceY: null, cur: "CNY", seat: false,
    quota: "Claude 1.5×、GPT 0.8× 分组倍率（按 token 计费，充值制）",
    models: "Claude、GPT",
    tools: "Claude Code、Codex",
    note: "⚠️ 6/21 起已关闭新用户注册；退款收 5% 手续费；国内开票 ¥200 起；社区口碑'稳得一批'但仅限老用户",
    url: "https://www.helpaio.com/transit" },
  { id: "plan-0063", vendor: "AIGoCode", plan: "Pro（4 周订阅）", cat: "tool", region: "cn", priceM: 399, priceY: null, cur: "CNY", seat: false,
    quota: "4 周总额度 440，每 7 天发放 110；额度以官网 credits 口径计。",
    models: "Claude 系列",
    tools: "Claude Code",
    note: "2026-10-04 直接核对官网：Pro 正常价与库存相同，4 周订阅，不按自然月计算；官网称额度每 7 天发放，未列年付价。",
    url: "https://www.aigocode.net/" },
  { id: "plan-0064", vendor: "AIGoCode", plan: "Max（4 周订阅）", cat: "tool", region: "cn", priceM: 899, priceY: null, cur: "CNY", seat: false,
    quota: "4 周总额度 1040，每 7 天发放 260；额度以官网 credits 口径计。",
    models: "Claude 系列",
    tools: "Claude Code",
    note: "2026-10-04 直接核对官网：Max 正常价与库存相同，4 周订阅，不按自然月计算；官网称额度每 7 天发放，未列年付价。",
    url: "https://www.aigocode.net/" },
  { id: "plan-0065", vendor: "AIGoCode", plan: "Ultra（4 周订阅）", cat: "tool", region: "cn", priceM: 1799, priceY: null, cur: "CNY", seat: false,
    quota: "4 周总额度 2120，每 7 天发放 530；额度以官网 credits 口径计。",
    models: "Claude 系列",
    tools: "Claude Code",
    note: "2026-10-04 直接核对官网：Ultra 正常价与库存相同，4 周订阅，不按自然月计算；官网称额度每 7 天发放，未列年付价。",
    url: "https://www.aigocode.net/" },
  { id: "plan-0066", vendor: "DevPass", plan: "三档月订阅（$29/$79/$179）", cat: "tool", region: "intl", priceM: 29, priceY: null, cur: "USD", seat: false,
    autoRenewMonthly: 29,
    windowPeriod: "month",
    quota: "三档均约 3× 面值：$29→$87、$79→$237、$179→$537 每月用量；premium 模型有周公平使用上限",
    models: "200+ 模型：Claude Opus 4.7、GPT-5.5、Gemini 3.1 Pro、GLM-4.7、Qwen3、Kimi K2.6",
    tools: "OpenAI + Anthropic 双协议（Claude Code / Codex 可用）",
    note: "官方个人自动续费月订阅 Lite $29、Pro $79、Max $179；截至 2026-10-04 对应 $87/$237/$537 用量。官方已公告 2026-10-15 起新订阅及之后首次续费降为 2 倍，即 $58/$158/$358；订阅月费不变，排序及自动续费金额按最低档 $29。",
    url: "https://devpass.llmgateway.io/" },
  { id: "plan-0067", vendor: "Chutes (chutes.ai)", plan: "Base / Plus / Pro（$3/$10/$20）", cat: "tool", region: "intl", priceM: 3, priceY: null, cur: "USD", seat: false,
    quota: "按档每天 300 / 2,000 / 5,000 次请求",
    models: "GLM-5、Kimi、DeepSeek、MiniMax、Qwen（开源模型为主，OpenAI 兼容）",
    tools: "OpenAI 兼容端点",
    note: "去中心化（Bittensor）：节点间延迟/质量波动、无 SLA；前沿模型需 $10+ 档；排序按最低档 $3",
    url: "https://github.com/lildebil0/awesome-ai-coding-subscriptions" },

  /* ---- Command Code（终端编程 agent） ---- */
  { id: "plan-0068", vendor: "Command Code", plan: "Go", cat: "tool", region: "intl", priceM: 1, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "含 $10 credits/月；官网估计约 9K 请求，配合优惠最高约 $15 用量，实际随模型消耗变化。",
    models: "taste-1 + $20 on Qwen 3.7 Max + $20 on MiniMax M3 + MiMo 99% off + 免费模型",
    tools: "CLI（npm i -g command-code）+ 桌面应用；MCP、/skills、/commands、插件",
    note: "$1/月，另收 processing fee；这是收费月订阅。官方未列年付价。",
    url: "https://commandcode.ai/pricing" },
  { id: "plan-0069", fieldRefs: {"tools":"plan-0068"}, vendor: "Command Code", plan: "GOAT", cat: "tool", region: "intl", priceM: 10, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "含 $70 credits/月；约 75K 请求；Up to ~$100 usage with deals",
    models: "29+ 模型：$70 on GPT-5.6 Sol、GLM-5.2、Tencent Hy3、Qwen 3.8 27B、$60 on DeepSeek V4 Flash 等",
    tools: "同上",
    note: "官方称 Best value plan on the market",
    url: "https://commandcode.ai/pricing" },
  { id: "plan-0070", fieldRefs: {"models":"plan-0069","tools":"plan-0069"}, vendor: "Command Code", plan: "Pro", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "含 $80 credits/月；约 100K 请求；含 premium 模型 per-model allowances",
    models: "同 GOAT + premium 模型",
    tools: "同上",
    note: "",
    url: "https://commandcode.ai/pricing" },
  { id: "plan-0071", fieldRefs: {"tools":"plan-0070"}, vendor: "Command Code", plan: "Max 10×", cat: "tool", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "含 $150 credits/月；约 219K 请求；更高速率限制；Up to $300 usage with deals",
    models: "开源 + premium（$300 on Qwen 3.7 Max、MiniMax M3 等）",
    tools: "同上",
    note: "$100/month + processing fee",
    url: "https://commandcode.ai/pricing" },
  { id: "plan-0072", fieldRefs: {"models":"plan-0071","tools":"plan-0071"}, vendor: "Command Code", plan: "Max 20×", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "含 $300 credits/月；约 437K 请求；最高速率限制",
    models: "同 Max 10×，额度翻倍",
    tools: "同上",
    note: "",
    url: "https://commandcode.ai/pricing" },
  { id: "plan-0073", vendor: "Command Code", plan: "Provider (API)", cat: "tool", region: "intl", priceM: 15, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "Pay as you go；顶充滚存永不过期",
    models: "50+ 模型",
    tools: "OpenAI/Anthropic 兼容端点",
    note: "$15/month + processing fee；另有 Teams $40/mo",
    url: "https://commandcode.ai/pricing" },

  /* ---- 2026-09 增补：AWS Kiro / Factory Droid / 讯飞 Astron / 阶跃 Step Plan / Canopy Wave / OpenCode Go Plus ---- */
  { id: "plan-0074", vendor: "AWS Kiro", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "50 credits/月（不结转）；加购 $0.04/credit（$5/125 起，12 个月有效）",
    models: "开放权重模型（Qwen3 Coder Next、DeepSeek 3.2、MiniMax M2.1 等）+ Claude Sonnet 4.5",
    tools: "Kiro IDE / CLI / Agent",
    note: "每月 1 日扣费；首次升级付费档送 $20 抵扣",
    url: "https://kiro.dev/pricing" },
  { id: "plan-0075", vendor: "AWS Kiro", plan: "Pro", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    quota: "1,000 credits/月（不结转）",
    models: "Auto、Claude Sonnet 5 / Opus 5、GPT-5.6 系列、GLM-5 等（分区域可用）",
    tools: "Kiro IDE / CLI / Agent",
    note: "个人用户可通过 social login / AWS Builder ID 自行购买；官方计价原文为每用户每月，税另计，团队使用每位开发者须独立订阅。加购 $0.04/credit。首次升级 $20 账单抵扣属于一次性优惠，不能抵减正常续费价；官网现行页未列年付价。",
    url: "https://kiro.dev/pricing" },
  { id: "plan-0076", fieldRefs: {"models":"plan-0075","tools":"plan-0075"}, vendor: "AWS Kiro", plan: "Pro+", cat: "tool", region: "intl", priceM: 40, priceY: null, cur: "USD", seat: false,
    quota: "2,000 credits/月（不结转）",
    models: "同 Pro 档",
    tools: "同 Pro 档",
    note: "个人用户可通过 social login / AWS Builder ID 自行购买；官方计价原文为每用户每月，税另计，团队使用每位开发者须独立订阅。加购 $0.04/credit。首次升级 $20 账单抵扣属于一次性优惠，不能抵减正常续费价；官网现行页未列年付价。",
    url: "https://kiro.dev/pricing" },
  { id: "plan-0077", fieldRefs: {"models":"plan-0075","tools":"plan-0075"}, vendor: "AWS Kiro", plan: "Pro Max", cat: "tool", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    quota: "5,000 credits/月（不结转）",
    models: "同 Pro 档",
    tools: "同 Pro 档",
    note: "个人用户可通过 social login / AWS Builder ID 自行购买；官方计价原文为每用户每月，税另计，团队使用每位开发者须独立订阅。加购 $0.04/credit。首次升级 $20 账单抵扣属于一次性优惠，不能抵减正常续费价；官网现行页未列年付价。",
    url: "https://kiro.dev/pricing" },
  { id: "plan-0078", fieldRefs: {"models":"plan-0075","tools":"plan-0075"}, vendor: "AWS Kiro", plan: "Power", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    quota: "10,000 credits/月（不结转）",
    models: "同 Pro 档",
    tools: "同 Pro 档",
    note: "个人用户可通过 social login / AWS Builder ID 自行购买；官方计价原文为每用户每月，税另计，团队使用每位开发者须独立订阅。加购 $0.04/credit。首次升级 $20 账单抵扣属于一次性优惠，不能抵减正常续费价；官网现行页未列年付价。",
    url: "https://kiro.dev/pricing" },
  { id: "plan-0079", vendor: "Factory (Droid)", plan: "Droid Pro", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "滚动限额（5h/7天/30天 三窗口）；官方不给绝对 token 数，第三方口径约 10M tokens/月（另有 bonus）",
    models: "GPT-5、Claude Opus/Sonnet、Gemini 等全主流前沿与开源模型",
    tools: "Droid CLI/Desktop/SDK、云端+本地后台 agent",
    note: "2026-09 以 $5B 估值融资 $2 亿；域名 factory.ai 已 307 至 factory.com",
    url: "https://factory.com/pricing" },
  { id: "plan-0080", fieldRefs: {"models":"plan-0079","tools":"plan-0079"}, vendor: "Factory (Droid)", plan: "Droid Plus", cat: "tool", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    quota: "约 5× Pro 滚动限额；含 Droid Computers（云端托管电脑）",
    models: "同 Pro 档",
    tools: "同 Pro + Droid Computers",
    note: "",
    url: "https://factory.com/pricing" },
  { id: "plan-0081", fieldRefs: {"models":"plan-0079","tools":"plan-0080"}, vendor: "Factory (Droid)", plan: "Droid Max", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    quota: "约 10× Pro 滚动限额；新功能抢先",
    models: "同 Pro 档",
    tools: "同 Plus 档",
    note: "",
    url: "https://factory.com/pricing" },
  { id: "plan-0082", vendor: "讯飞星辰 MaaS", plan: "Astron Coding Plan 高效版", cat: "cloud", region: "cn", priceM: 199, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "请求额度上限：6,000/5h、45,000/周、90,000/月；实际请求按模型抵扣系数扣除（DeepSeek-V4-Flash 2×、V4-Pro 5×），夜间/周末/节假日再乘 0.8；同档叠加每份独立 Key",
    models: "Spark X2/X2-Agent/X2-Flash、Auto、GLM-5/5.1/5.2、DeepSeek-V4-Pro/V4-Flash/V3.2、Kimi-K2.5/K2.6/K2.7-Code、MiniMax-M2.5、Qwen3.5/3.6、Qwen3-Coder-Next-FP8、GLM-4.7-Flash（具体上架以控制台为准）",
    tools: "Anthropic 协议优先（Claude Code、Qwen Code 等），兼容 OpenAI 协议",
    note: "原无忧版/专业版已下线；只可升级不可降级、不退款；曾曝过载退款争议；季付 ¥538",
    url: "https://www.xfyun.cn/doc/spark/CodingPlan.html" },
  { id: "plan-0083", fieldRefs: {"models":"plan-0082","tools":"plan-0082"}, vendor: "讯飞星辰 MaaS", plan: "Astron Coding Plan 速通版", cat: "cloud", region: "cn", priceM: 999, priceY: null, cur: "CNY", seat: false,
    quota: "月请求额度上限 30,000；实际请求按模型系数扣除（DeepSeek-V4-Flash 2×、V4-Pro 5×），夜间/周末/节假日再乘 0.8；同档叠加每份独立 Key",
    models: "同高效版",
    tools: "同高效版",
    note: "限时首月 ¥699；季付 ¥2,997（首季 ¥2,697）",
    url: "https://www.xfyun.cn/doc/spark/CodingPlan.html" },
  { id: "plan-0084", vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Mini", cat: "official", region: "cn", priceM: 49, priceY: 38, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "月池 400M Credit（1M Credit = ¥1 官方锚点，月末清零）；加油包 ¥49=400M（30 天有效，仅订阅用户）",
    models: "step-5-preview、step-3.7-flash、step-3.5-flash(-2603)、step-router 智能路由",
    tools: "适配主流 agent 框架",
    note: "季付 ¥129、年付 ¥456；不受 RPM/TPM 阶梯限速约束",
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview" },
  { id: "plan-0085", fieldRefs: {"models":"plan-0084","tools":"plan-0084"}, vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Plus", cat: "official", region: "cn", priceM: 99, priceY: 78, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "月池 1,600M Credit（1M Credit = ¥1，月末清零）",
    models: "同 Mini 档",
    tools: "同 Mini 档",
    note: "季付 ¥269、年付 ¥936",
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview" },
  { id: "plan-0086", fieldRefs: {"models":"plan-0084","tools":"plan-0084"}, vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Pro", cat: "official", region: "cn", priceM: 199, priceY: 155, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "月池 8,000M Credit（1M Credit = ¥1，月末清零）",
    models: "同 Mini 档",
    tools: "同 Mini 档；Studio 额外送套餐 40% 创作额度",
    note: "季付 ¥539、年付 ¥1,860",
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview" },
  { id: "plan-0087", fieldRefs: {"models":"plan-0084","tools":"plan-0086"}, vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Max", cat: "official", region: "cn", priceM: 699, priceY: 555.5, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "月池 40,000M Credit（1M Credit = ¥1，月末清零）",
    models: "同 Mini 档",
    tools: "同 Pro 档；Plus 及以上优先速率与技术支持",
    note: "季付 ¥1,889、年付 ¥6,666",
    url: "https://platform.stepfun.com/docs/zh/step-plan/overview" },
  { id: "plan-0088", vendor: "Canopy Wave", plan: "Coding Plan Pro Bundle", cat: "tool", region: "intl", priceM: 30, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    codingSurface: true,
    quota: "500 请求/天、10,000 请求/月",
    models: "Kimi-K2.6、MiMo-V2.5、GLM-5.2、MiniMax M3",
    tools: "OpenAI 兼容端点；适配 Kilo Code、OpenCode、Cline、Roo Code、Dify、Cherry Studio",
    note: "第三方聚合商，营销称较 Claude 按量省 91%；用户反馈稀少，谨慎选择",
    url: "https://canopywave.com/codingplan" },
  { id: "plan-0089", fieldRefs: {"models":"plan-0040","tools":"plan-0040"}, vendor: "OpenCode (Anomaly/SST)", plan: "OpenCode Go Plus", cat: "tool", region: "intl", priceM: 40, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "按模型 5h 限额 + 月度上限，约为 Go 的 3×（如 Kimi K3 440 vs 110 次/5h；GLM-5.3-Flash 18,960 vs 6,320）；29 个模型含 2 款限时免费",
    models: "同 Go（Kimi K3/K2.7 Code、MiniMax M3、GPT-6 Luna、GLM-5.3-Flash、DeepSeek V4.1 Flash 等）",
    tools: "同 Go（任意 agent 可用）",
    note: "2026-09 新增档位",
    url: "https://opencode.ai/go" },

  /* ---------- 第三方工具订阅 · 国际 ---------- */
  { id: "plan-0090", vendor: "GitHub Copilot", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "2,000 次补全 + 50 次 chat（含 Edits）/月 + 少量 AI credits",
    models: "仅自动模型选择（Haiku 4.5、GPT-5 mini 等轻量）",
    tools: "IDE 插件、Copilot CLI/App（受限）",
    note: "2026 年起 GitHub 以 AI Credits（1 credit=$0.01）取代 premium requests",
    url: "https://github.com/features/copilot/plans" },
  { id: "plan-0091", vendor: "GitHub Copilot", plan: "Pro", cat: "tool", region: "intl", priceM: 10, priceY: null, cur: "USD", seat: false,
    windowPeriod: "month",
    quota: "1,500 AI credits/月（基础 1,000 + 弹性 500，约 $15 用量）；补全与 next-edit 无限",
    models: "Claude Sonnet 4.6/5/5.5、Gemini 3.5–3.8 Flash、GPT-5.3-Codex、GPT-5.6 Luna/Terra、GPT-6 Luna、Kimi K3、Grok 4.5–4.7 等（不含旗舰）",
    tools: "IDE 插件、Copilot CLI、Copilot App",
    note: "$10 基础 + $5 弹性 credits；仅月付",
    url: "https://docs.github.com/en/copilot/get-started/plans" },
  { id: "plan-0092", fieldRefs: {"tools":"plan-0091"}, vendor: "GitHub Copilot", plan: "Pro+", cat: "tool", region: "intl", priceM: 39, priceY: null, cur: "USD", seat: false,
    modelBaseRef: "plan-0091",
    modelIncludes: ["Claude Opus 4.7–5.5", "Fable 5/5.1", "GPT-6 Astra/Sol", "GPT-6.1 Sol"],
    windowPeriod: "month",
    quota: "7,000 AI credits/月（约 $70 用量）",
    models: "Pro 全部 + Claude Opus 4.7–5.5、Fable 5/5.1、GPT-6 Astra/Sol、GPT-6.1 Sol 等旗舰",
    tools: "同 Pro",
    note: "4x+ Pro 用量；含审计日志",
    url: "https://docs.github.com/en/copilot/get-started/plans" },
  { id: "plan-0093", fieldRefs: {"tools":"plan-0091"}, vendor: "GitHub Copilot", plan: "Max", cat: "tool", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    modelBaseRef: "plan-0092", modelIncludes: [],
    windowPeriod: "month",
    quota: "20,000 AI credits/月（约 $200 用量）",
    models: "旗舰模型优先访问（Pro+ 同级模型池）",
    tools: "同 Pro",
    note: "2026 新增个人最高档",
    url: "https://github.com/features/copilot/plans" },
  { id: "plan-0094", vendor: "GitHub Copilot", plan: "Business", cat: "team", region: "intl", priceM: 19, priceY: null, cur: "USD", seat: true,
    windowPeriod: "month",
    quota: "1,900 AI credits/席/月",
    models: "含旗舰模型 + Copilot CLI/App",
    tools: "IDE 插件、组织管理",
    note: "按授予席位计费",
    url: "https://docs.github.com/en/copilot/get-started/plans" },
  { id: "plan-0095", vendor: "GitHub Copilot", plan: "Enterprise", cat: "team", region: "intl", priceM: 39, priceY: null, cur: "USD", seat: true,
    windowPeriod: "month",
    quota: "3,900 AI credits/席/月",
    models: "旗舰模型优先访问 + 自定义模型",
    tools: "codebase 索引、GitHub.com 集成、IP 赔偿、SSO",
    note: "",
    url: "https://docs.github.com/en/copilot/get-started/plans" },

  { id: "plan-0096", vendor: "Cursor", plan: "Hobby", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "有限 Agent 请求；可用 Composer",
    models: "Composer 2.5",
    tools: "Cursor IDE",
    note: "免费档",
    url: "https://cursor.com/pricing" },
  { id: "plan-0097", vendor: "Cursor", plan: "Start（印度专属）", cat: "tool", region: "intl", priceM: 649, priceY: null, cur: "INR", seat: false,
    windowPeriod: "month", purchaseCountries: ["IN"],
    quota: "仅 Cursor Models 池（月度重置）；无 Other Models 池、Bugbot、Auto 与按需加购",
    models: "Grok 4.5–4.7（含 Fast/500K 变体）、Composer 2.5（含 Fast）",
    tools: "Cursor IDE",
    note: "印度专属；₹649/月含税，按 INR 原币记录，不能把近似美元换算当官方报价",
    url: "https://cursor.com/docs/models-and-pricing" },
  { id: "plan-0098", vendor: "Cursor", plan: "Pro", cat: "tool", region: "intl", priceM: 20, priceY: 16, cur: "USD", seat: false,
    quotaSharing: "separate",
    quota: "双池：Cursor Models 池（Grok 4.5–4.7、Composer 2.5 大额）+ Other Models 池（第三方按牌价折算）；Tab 无限；超额按 API 牌价按需付费",
    models: "Grok 4.5–4.7、Composer 2.5；Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1、GPT-5.6 / GPT-6、Gemini 3.8 Flash、GLM 5.2、Kimi K3 等按 M token 计价",
    tools: "Cursor IDE、Bugbot、Cloud Agents",
    note: "官方估算日常 Agent 用户月耗 $60–100；年付省 20%",
    url: "https://cursor.com/docs/models-and-pricing" },
  { id: "plan-0099", fieldRefs: {"models":"plan-0098","tools":"plan-0098"}, vendor: "Cursor", plan: "Pro Plus", cat: "tool", region: "intl", priceM: 60, priceY: 48, cur: "USD", seat: false,
    quotaSharing: "separate",
    quota: "3× Pro 的 Agent 限额；双池同 Pro",
    models: "同 Pro（含旗舰）",
    tools: "同 Pro",
    note: "年付省 20%",
    url: "https://cursor.com/pricing" },
  { id: "plan-0100", fieldRefs: {"models":"plan-0098","tools":"plan-0098"}, vendor: "Cursor", plan: "Ultra", cat: "tool", region: "intl", priceM: 200, priceY: 160, cur: "USD", seat: false,
    quotaSharing: "separate",
    quota: "双池：20× Pro 的 Agent 限额；最高 Grok Bot 用量",
    models: "同 Pro（含旗舰）",
    tools: "同 Pro",
    note: "年付省 20%",
    url: "https://cursor.com/pricing" },
  { id: "plan-0101", fieldRefs: {"models":"plan-0098"}, vendor: "Cursor", plan: "Teams（Standard 席位）", cat: "team", region: "intl", priceM: 40, priceY: 32, cur: "USD", seat: true,
    quotaSharing: "separate", quota: "席位内标准用量（双池）；超额按需计费",
    models: "同个人档全模型 + Cursor Router 自动路由",
    tools: "SAML/OIDC SSO、团队管理",
    note: "第三方模型加收 $0.25/M token（含 BYOK）",
    url: "https://cursor.com/docs/account/teams/pricing.md" },
  { id: "plan-0102", fieldRefs: {"models":"plan-0101","tools":"plan-0101"}, vendor: "Cursor", plan: "Teams（Premium 席位）", cat: "team", region: "intl", priceM: 120, priceY: 96, cur: "USD", seat: true,
    quota: "5× Standard 席位用量",
    models: "同 Standard",
    tools: "同 Standard",
    note: "2026 新席位类型",
    url: "https://cursor.com/docs/models-and-pricing.md" },
  { id: "plan-0103", fieldRefs: {"tools":"plan-0102"}, vendor: "Cursor", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "pooled usage 定制",
    models: "全模型",
    tools: "同 Teams",
    note: "联系销售",
    url: "https://cursor.com/pricing" },

  { id: "plan-0104", vendor: "Cognition Devin Desktop（原 Windsurf）", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "每日/每周 token 配额（未公布数值）；inline edits 与 Tab 补全不限",
    models: "受限模型集（含 SWE-1.6/1.7 低成本系列）",
    tools: "Devin Desktop IDE（原 Windsurf）",
    note: "Windsurf 已更名 Devin Desktop；2026-03 起配额制取代 credits",
    url: "https://devin.ai/pricing" },
  { id: "plan-0105", vendor: "Cognition Devin Desktop（原 Windsurf）", plan: "Pro", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    quota: "每日 + 每周配额；超额可购 extra usage（按 API 牌价）",
    models: "全模型（含 Claude Opus 等）",
    tools: "Devin Desktop",
    note: "旧 Windsurf Pro $15/月用户永久保价",
    url: "https://docs.devin.ai/desktop/accounts/quota.md" },
  { id: "plan-0106", vendor: "Cognition Devin Desktop（原 Windsurf）", plan: "Max", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    quota: "显著更高的每周配额（无每日上限）",
    models: "全模型",
    tools: "Devin Desktop",
    note: "个人档",
    url: "https://docs.devin.ai/admin/billing/self-serve.md" },
  { id: "plan-0107", vendor: "Cognition Devin Desktop（原 Windsurf）", plan: "Teams（full seat）", cat: "team", region: "intl", priceM: 40, priceY: null, cur: "USD", seat: true,
    quota: "full seat：Pro 等值配额 + Desktop 访问",
    models: "全模型",
    tools: "Devin Desktop 团队版",
    note: "$80/月底价：也可用 flex seat（免费）+ 共享按需 credits 组合",
    url: "https://docs.devin.ai/admin/billing/self-serve.md" },
  { id: "plan-0108", vendor: "Cognition Devin（云 agent）", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "有限 Devin 用量（每日/每周配额）；含 Devin Review 与 DeepWiki；公共 PR 审查免费",
    models: "受限模型集",
    tools: "Devin 云 agent 平台",
    note: "旧 Core 档用户已迁至 Free",
    url: "https://devin.ai/pricing" },
  { id: "plan-0109", vendor: "Cognition Devin（云 agent）", plan: "Pro", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    quota: "每日 + 每周配额，覆盖 Devin 会话 / CLI / Desktop；超额按需 credits（API 牌价）",
    models: "全模型",
    tools: "Devin、Slack/Linear/MCP 集成",
    note: "单用户",
    url: "https://docs.devin.ai/admin/billing/self-serve.md" },
  { id: "plan-0110", vendor: "Cognition Devin（云 agent）", plan: "Max", cat: "tool", region: "intl", priceM: 200, priceY: null, cur: "USD", seat: false,
    quota: "更大每周配额（无每日上限）",
    models: "全模型",
    tools: "Devin",
    note: "面向持续超 Pro 配额用户",
    url: "https://docs.devin.ai/admin/billing/self-serve.md" },
  { id: "plan-0111", vendor: "Cognition Devin（云 agent）", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "ACU（Agent Compute Unit）合同制：本地 agent 按 token 折算，云端 agent 混合计",
    models: "全模型 + 自定义",
    tools: "Devin 企业版",
    note: "定制报价；ACU 单价未公开",
    url: "https://docs.devin.ai/admin/billing/enterprise.md" },

  { id: "plan-0112", vendor: "Zed", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    modelAccess: "byok", includedModelQuota: false,
    quota: "2,000 次 edit predictions/月；无托管 AI 额度（BYOK/外部 agent）",
    models: "BYOK：Anthropic/OpenAI/Google 等；或接 Claude Agent/Codex CLI",
    tools: "Zed 编辑器",
    note: "免费个人档",
    url: "https://zed.dev/pricing" },
  { id: "plan-0113", vendor: "Zed", plan: "Pro", cat: "tool", region: "intl", priceM: 10, priceY: null, cur: "USD", seat: false,
    quota: "edit predictions 无限 + 含 $5 托管 tokens；超出按 API 牌价 +10%",
    models: "Zed 托管模型",
    tools: "Zed 编辑器",
    note: "仅月付",
    url: "https://zed.dev/pricing" },
  { id: "plan-0114", vendor: "Zed", plan: "Business", cat: "team", region: "intl", priceM: 30, priceY: null, cur: "USD", seat: true,
    modelAccess: "metered", includedModelQuota: false,
    quota: "edit predictions 无限；不捆绑固定 LLM 额度（托管 AI 按标准价或 BYOK）",
    models: "BYOK 或 Zed 托管模型",
    tools: "组织级模型策略、RBAC",
    note: "25+ 席位可签合同",
    url: "https://zed.dev/pricing" },

  { id: "plan-0115", vendor: "Augment Code", plan: "Business", cat: "team", region: "intl", priceM: 100, priceY: null, cur: "USD", seat: false,
    quota: "含 $100/月用量（LLM token 按供应商牌价 + 40% 服务费；Cosmos 计算 $0.19/小时）；超额同价按量",
    models: "Claude Fable 5.1 / Opus 5 / Sonnet 5、GPT-6 Astra、GPT-5.6、Gemini 3.1 Pro、GLM 5.2/5.3、Grok 4.5/4.6、Kimi K3 等",
    tools: "Augment 扩展/Agent、Code Review",
    note: "≤50 席位不另收席位费；典型拆分：$70 token + $28 服务费 + $2 计算",
    url: "https://docs.augmentcode.com/models/token-based-pricing.md" },
  { id: "plan-0116", fieldRefs: {"models":"plan-0115","tools":"plan-0115"}, vendor: "Augment Code", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "定制；组织/用户级月度预算、预算强制执行",
    models: "同上 + 模型/供应商限制",
    tools: "同上 + 企业管控",
    note: "联系销售",
    url: "https://docs.augmentcode.com/models/token-based-pricing.md" },

  { id: "plan-0117", vendor: "Cline", plan: "开源版 + 按量充值", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    modelAccess: "byok", includedModelQuota: false,
    quota: "扩展开源免费；BYOK 任意供应商，或按 token 充值（Cline credits，余额通用 100+ 模型）",
    models: "Anthropic/OpenAI/Google 等 100+ 模型",
    tools: "VS Code 扩展、CLI、OpenAI 兼容 API",
    note: "本体不收费，按量模式非订阅",
    url: "https://docs.cline.bot/getting-started/cline-provider.md" },
  { id: "plan-0118", vendor: "Cline", plan: "ClinePass", cat: "tool", region: "intl", priceM: 9.99, priceY: null, cur: "USD", seat: false,
    windowPeriod: "5h",
    quota: "GLM-5.3/5.2、Kimi K3/K2.7、DeepSeek V4、MiniMax M3、Qwen3.8 等开源模型用量为标准 API 的 2–5×；5h/周/月三层计量",
    models: "GLM-5.3、Kimi K3、DeepSeek V4 Pro/Flash、MiniMax M3、Qwen3.8 Max 等",
    tools: "Cline 扩展/CLI/API",
    note: "可与按量充值并用",
    url: "https://docs.cline.bot/getting-started/clinepass.md" },

  { id: "plan-0119", vendor: "Roo Code", plan: "开源版（已下架）", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    modelAccess: "byok", includedModelQuota: false,
    quota: "VS Code 扩展已于 2026-05-15 停更，不再发版",
    models: "BYOK 任意",
    tools: "VS Code 扩展（已停更）",
    note: "官方扩展于 2026-05-15 关闭、仓库归档；README 推荐 ZooCode 或 Cline。历史版本可能仍可运行，但没有官方后续修复，不列入免费 Coding 入口",
    url: "https://github.com/RooCodeInc/Roo-Code" },
  { id: "plan-0120", vendor: "Roo Code（Roomote）", plan: "自托管（≤10 用户）", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    modelAccess: "byok", includedModelQuota: false,
    quota: "自托管免费，最多 10 个注册用户；推理需自备模型 Key",
    models: "模型无关（BYOK）",
    tools: "Roomote 自托管云 agent",
    note: "Roo Code 扩展的后继产品。Cloud 为 7 天试用后付费；自托管 ≤10 用户不需要许可证",
    url: "https://roomote.dev/" },
  { id: "plan-0121", vendor: "Roo Code（Roomote）", plan: "Roomote ≤10 users", cat: "team", region: "intl", priceM: 49, priceY: null, cur: "USD", seat: false,
    quota: "云 coding agent 全部功能；按团队用户数分档",
    models: "模型无关",
    tools: "Roomote 云 agent",
    note: "Cloud 价。7 天试用、免信用卡；自托管 ≤10 用户免费",
    url: "https://roomote.dev/" },
  { id: "plan-0122", vendor: "Roo Code（Roomote）", plan: "Roomote 11–50 users", cat: "team", region: "intl", priceM: 249, priceY: null, cur: "USD", seat: false,
    quota: "全部功能（同 ≤10 users 档）；集中计费、项目级用量分析、角色权限",
    models: "模型无关",
    tools: "Roomote 云 agent",
    note: "",
    url: "https://roomote.dev/" },
  { id: "plan-0123", vendor: "Roo Code（Roomote）", plan: "Roomote 51–100 users", cat: "team", region: "intl", priceM: 499, priceY: null, cur: "USD", seat: false,
    quota: "全部功能（同 ≤10 users 档）；更大团队集中管控",
    models: "模型无关",
    tools: "Roomote 云 agent",
    note: ">100 用户另询",
    url: "https://roomote.dev/" },

  { id: "plan-0124", vendor: "Kilo Code", plan: "Free（BYOK/零加价）", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    modelAccess: "byok", includedModelQuota: false,
    quota: "VS Code/JetBrains/CLI 全功能；Kilo Gateway 500+ 模型按 token 原价（零加价）；含 BYOK/本地模型",
    models: "GPT-6 Astra、Claude Fable 5.1、Gemini 3.8 Flash、Grok 4.6、DeepSeek V4.1 Flash 等 500+",
    tools: "VS Code/JetBrains/CLI 扩展",
    note: "个人平台免费；推理使用免费模型、BYOK 或 Kilo Gateway 供应商牌价；购买 credits 另收 5% 处理费，云计算另计",
    url: "https://kilo.ai/pricing" },
  { id: "plan-0125", fieldRefs: {"models":"plan-0124","tools":"plan-0124"}, vendor: "Kilo Code", plan: "Teams", cat: "team", region: "intl", priceM: 15, priceY: null, cur: "USD", seat: true,
    modelAccess: "byok", includedModelQuota: false,
    quota: "集中计费、团队管理面板、项目级用量分析、角色权限",
    models: "同 Free + 管控",
    tools: "同 Free",
    note: "平台费 $15/人/月；推理按供应商牌价或 BYOK；购买 credits 另收 5% 处理费，云计算另计",
    url: "https://kilo.ai/pricing" },

  { id: "plan-0126", vendor: "Sourcegraph Amp", plan: "Hobby", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "免费（无广告）；orbs 按 pay-as-you-go 或自建 runner 免费；可绑定 ChatGPT 订阅获更多用量",
    models: "BYOK 任意 + 可链接 ChatGPT 订阅",
    tools: "Amp 终端 agent",
    note: "token 按 API 牌价、无加价",
    url: "https://ampcode.com/pricing" },
  { id: "plan-0127", vendor: "Sourcegraph Amp", plan: "Individual（Megawatt）", cat: "tool", region: "intl", priceM: 20, priceY: null, cur: "USD", seat: false,
    quota: "agent 用量 + 45,000 分钟 orb 时间/月（不结转）；超额购 credits 按 API 牌价（无加价）",
    models: "第三方模型按牌价（无 markup）",
    tools: "Amp 终端 agent",
    note: "Megawatt $20/月含 45,000 orb 分钟；另有 Gigawatt $200/月含 480,000 分钟（官网已实测确认）；模型 key/订阅自备，Amp 无 token 费",
    url: "https://ampcode.com/pricing" },

  { id: "plan-0128", vendor: "JetBrains AI", plan: "AI Pro（个人）", cat: "tool", region: "intl", priceM: 10, priceY: 8.33, cur: "USD", seat: false,
    quota: "AI 云端模型用量（官方未公布固定额度）；支持 BYOK/本地模型/外部 agent（ACP）",
    models: "OpenAI/Google/Anthropic/xAI 云模型 + Mellum 补全",
    tools: "JetBrains IDE、Junie；可接 Codex/Claude Agent/Gemini CLI",
    note: "年付 $100/年",
    url: "https://www.jetbrains.com/ai-ides/buy/" },
  { id: "plan-0129", fieldRefs: {"models":"plan-0128","tools":"plan-0128"}, vendor: "JetBrains AI", plan: "AI Ultimate（个人）", cat: "tool", region: "intl", priceM: 30, priceY: 25, cur: "USD", seat: false,
    quota: "更高级别用量（具体额度未公布）",
    models: "同上",
    tools: "同上",
    note: "年付 $300/年",
    url: "https://www.jetbrains.com/ai-ides/buy/" },
  { id: "plan-0130", fieldRefs: {"models":"plan-0129","tools":"plan-0129","quota":"plan-0128"}, vendor: "JetBrains AI", plan: "AI Pro（商业）", cat: "team", region: "intl", priceM: 20, priceY: 16.67, cur: "USD", seat: true,
    quota: "同个人 Pro（商业组织计费）",
    models: "同上",
    tools: "同上",
    note: "年付 $200/年",
    url: "https://www.jetbrains.com/ai-ides/buy/" },
  { id: "plan-0131", fieldRefs: {"models":"plan-0130","tools":"plan-0130","quota":"plan-0129"}, vendor: "JetBrains AI", plan: "AI Ultimate（商业）", cat: "team", region: "intl", priceM: 60, priceY: 50, cur: "USD", seat: true,
    quota: "同个人 Ultimate（商业组织计费）",
    models: "同上",
    tools: "同上",
    note: "年付 $600/年",
    url: "https://www.jetbrains.com/ai-ides/buy/" },

  { id: "plan-0132", vendor: "OpenRouter", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "50 请求/日；25+ 免费模型；4 个免费供应商",
    models: "25+ 免费模型",
    tools: "API 聚合器（可接任意 CLI）",
    note: "无订阅制；按量付费 + 5.5% 平台费（Business 8%）",
    url: "https://openrouter.ai/pricing" },

  { id: "plan-0133", vendor: "Lovable", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "5 个每日 build credits（月上限 30）+ 每日 chat + 每月 20 Cloud credits + 4 AI credits",
    models: "Lovable 内置模型集",
    tools: "仅 Lovable 自家应用构建，不是 Coding Agent 模型额度",
    note: "不能把额度接到 Claude Code / Codex 上当模型用。官方 MCP 可让 Claude Code、Cursor 驱动 Lovable 项目，调用仍消耗 Lovable build credits。不列入免费 Coding 入口",
    url: "https://docs.lovable.dev/introduction/subscription-plans.md" },
  { id: "plan-0134", vendor: "Lovable", plan: "Pro（100 credits）", cat: "tool", region: "intl", priceM: 25, priceY: 20.83, cur: "USD", seat: false,
    quota: "100 credits/月起，可滚动结转；可加购（至 10,000 credits=$2,250/月）",
    models: "Lovable 内置模型集",
    tools: "Lovable 网页应用构建",
    note: "年付 $250/年（100 credits 档，折月 $20.83；官网整数显示 $21/月）；含 5 每日 build credits 无月上限",
    url: "https://docs.lovable.dev/introduction/subscription-plans.md" },
  { id: "plan-0135", fieldRefs: {"models":"plan-0134","tools":"plan-0134"}, vendor: "Lovable", plan: "Business（100 credits）", cat: "team", region: "intl", priceM: 50, priceY: 41.67, cur: "USD", seat: false,
    quota: "100 credits/月起（价格为 Pro 同档 2 倍）；SSO、安全中心、角色访问",
    models: "同上",
    tools: "同上",
    note: "年付 $500/年（100 credits 档，折月 $41.67；官网整数显示 $42/月）",
    url: "https://docs.lovable.dev/introduction/subscription-plans.md" },
  { id: "plan-0136", fieldRefs: {"models":"plan-0135"}, vendor: "Lovable", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: false,
    quota: "按量定制；SCIM、审计日志、发布/共享管控、专属支持",
    models: "同上",
    tools: "SCIM、审计日志、发布/共享管控",
    note: "联系销售",
    url: "https://docs.lovable.dev/introduction/subscription-plans.md" },

  { id: "plan-0137", vendor: "Bolt.new", plan: "Free", cat: "tool", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "300K tokens/日上限、1M tokens/月；带水印",
    models: "Bolt 内置模型集",
    tools: "仅 Bolt.new 自家网页应用构建，不是 Coding Agent 模型额度",
    note: "和 Lovable 一样，额度不能接到 Claude Code / Codex。不列入免费 Coding 入口",
    url: "https://bolt.new/pricing" },
  { id: "plan-0138", fieldRefs: {"models":"plan-0137"}, vendor: "Bolt.new", plan: "Pro", cat: "tool", region: "intl", priceM: 25, priceY: 18, cur: "USD", seat: false,
    quota: "10M tokens/月起（起点）、无每日上限；未用 tokens 可结转一个月",
    models: "同上",
    tools: "Bolt.new",
    note: "年付最高省 28%",
    url: "https://bolt.new/pricing" },
  { id: "plan-0139", fieldRefs: {"models":"plan-0138"}, vendor: "Bolt.new", plan: "Teams", cat: "team", region: "intl", priceM: 30, priceY: 27, cur: "USD", seat: true,
    quota: "每名付费成员获月度 token 额度（额度不共享）",
    models: "同上",
    tools: "集中计费、访问管理",
    note: "含 Pro 全部功能",
    url: "https://bolt.new/pricing" },
  { id: "plan-0140", fieldRefs: {"models":"plan-0139"}, vendor: "Bolt.new", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "定制；SSO、审计日志、合规、专属客户经理",
    models: "同上",
    tools: "SSO、审计日志、合规",
    note: "联系销售",
    url: "https://bolt.new/pricing" },

  { id: "plan-0141", vendor: "Replit", plan: "Core", cat: "tool", region: "intl", priceM: 20, priceY: 18, cur: "USD", seat: false,
    quota: "$20/月模型使用金（用于最强模型）；Free Mode 聊天最多 30 小时/月；最多 60 个 Free Mode 项目",
    models: "Replit Agent（多模型）",
    tools: "Replit Agent 云 IDE",
    note: "年付 $18/月",
    url: "https://replit.com/pricing" },
  { id: "plan-0142", vendor: "Replit", plan: "Pro", cat: "tool", region: "intl", priceM: 100, priceY: 90, cur: "USD", seat: false,
    quota: "$100/月模型使用金；10 个并行 agent；15 协作者 + 50 查看者",
    models: "Replit Agent（多模型）",
    tools: "Replit Agent 云 IDE",
    note: "年付 $90/月",
    url: "https://replit.com/pricing" },
  { id: "plan-0143", fieldRefs: {"models":"plan-0142"}, vendor: "Replit", plan: "Enterprise", cat: "team", region: "intl", priceM: null, priceY: null, cur: "USD", seat: true,
    quota: "定制席位上限",
    models: "同上",
    tools: "SSO/SAML、高级隐私、单租户",
    note: "联系销售",
    url: "https://replit.com/pricing" },

  /* ---------- 云厂商企业级服务（国际） ---------- */
  { id: "plan-0144", vendor: "AWS", plan: "Amazon Q Developer Free", cat: "cloud", region: "intl", priceM: 0, priceY: 0, cur: "USD", seat: false,
    quota: "50 次 agentic 请求/月；Java 代码转换 1,000 行/月",
    models: "Amazon Q（AWS 自研）",
    tools: "IDE 插件、CLI、控制台",
    note: "永久免费层；无管理面板与 IP 赔偿",
    url: "https://aws.amazon.com/q/developer/pricing/" },
  { id: "plan-0145", vendor: "AWS", plan: "Amazon Q Developer Pro", cat: "cloud", region: "intl", priceM: 19, priceY: null, cur: "USD", seat: true,
    quota: "更高 agentic 请求额度；Java 转换 4,000 行/月（账户级池化）；IP 赔偿；管理面板",
    models: "Amazon Q（AWS 自研）",
    tools: "IDE 插件、CLI",
    note: "超出池化额度 $0.003/行；首月按比例计费；无单独 Enterprise 层",
    url: "https://aws.amazon.com/q/developer/pricing/" },

  /* ---------- 云厂商企业级服务（国内） ---------- */
  { id: "plan-0146", vendor: "阿里云 Qoder CN（原通义灵码）", plan: "团队版", cat: "cloud", region: "cn", priceM: 99, priceY: null, cur: "CNY", seat: true,
    quota: "3,000 Credits/人/月，1 席位起订",
    models: "Qwen、GLM、Kimi 等国产模型（Qoder CN 全系列）",
    tools: "Qoder CN 插件/CLI、个人云端知识库",
    note: "2026 年 9 月促销：首月买一送一",
    url: "https://www.aliyun.com/product/lingma" },
  { id: "plan-0147", fieldRefs: {"models":"plan-0146"}, vendor: "阿里云 Qoder CN（原通义灵码）", plan: "企业标准版", cat: "cloud", region: "cn", priceM: 149, priceY: null, cur: "CNY", seat: true,
    quota: "3,000 Credits/人/月，10 席位起订",
    models: "同团队版",
    tools: "集中计费管理、团队共享知识库、度量分析、安全合规",
    note: "",
    url: "https://www.aliyun.com/product/lingma" },
  { id: "plan-0148", fieldRefs: {"models":"plan-0146"}, vendor: "阿里云 Qoder CN（原通义灵码）", plan: "企业专属版", cat: "cloud", region: "cn", priceM: 199, priceY: null, cur: "CNY", seat: true,
    quota: "3,000 Credits/人/月，50 席位起订",
    models: "同团队版",
    tools: "Qoder CN Desktop / JetBrains 插件 / CLI；VPC 部署、企业共享知识库与知识管控",
    note: "",
    url: "https://www.aliyun.com/product/lingma" },
  { id: "plan-0149", vendor: "腾讯云 CodeBuddy", plan: "企业旗舰版", cat: "cloud", region: "cn", priceM: 198, priceY: null, cur: "CNY", seat: true,
    quota: "按席位 + Credits 订阅（公开定价未能核实）",
    models: "混元系列",
    tools: "CodeBuddy IDE / 插件",
    note: "官网公开价 ¥198/人/月，1 席起购；旗舰套餐，私有化方案仍需另询价。",
    url: "https://www.codebuddy.cn/pricing/?tab=enterprise" },
  { id: "plan-0150", vendor: "华为云", plan: "CodeArts 代码智能体（原 CodeArts Snap）", cat: "cloud", region: "cn", priceM: null, priceY: null, cur: "CNY", seat: true,
    quota: "限时免费体验（限个人认证用户）",
    models: "盘古系列",
    tools: "CodeArts 研发平台集成",
    note: "独立定价页已下线（404）；CodeArts 套餐（基础 ¥60 / 专业 ¥200 / 企业 ¥600/人/月）为 DevOps 全套服务价",
    url: "https://www.huaweicloud.com/product/codearts.html" },

  /* ============================================================
   * 国内 Coding Plan 订阅
   * ============================================================ */
  /* ---- 智谱 BigModel V1/V2 历史版本 ---- */
  { id: "plan-0151", vendor: "智谱 BigModel", plan: "GLM Coding V1 Lite（已停售）", cat: "official", region: "cn", priceM: 20, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 120 次 prompt（10 并发）；无每周上限",
    models: "GLM-4.5 时代",
    tools: "Claude Code",
    note: "2025-09 上线（'20 元用到大饱'）；2026-02-12 起新用户只能买 V2；存量 2026-04-30 关自动续订",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview" },
  { id: "plan-0152", vendor: "智谱 BigModel", plan: "GLM Coding V1 Pro（已停售）", cat: "official", region: "cn", priceM: 100, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 600 次 prompt（30 并发）；无每周上限",
    models: "GLM-4.5 时代",
    tools: "Claude Code",
    note: "同上",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview" },
  { id: "plan-0153", vendor: "智谱 BigModel", plan: "GLM Coding V1 Max（已停售）", cat: "official", region: "cn", priceM: 200, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 2,400 次 prompt（50 并发）；无每周上限",
    models: "GLM-4.5 时代",
    tools: "Claude Code",
    note: "¥200/月价格来自促销性质 GitHub 聚合仓库（不完全确定）",
    url: "https://github.com/tno367/bigmodel" },
  { id: "plan-0154", vendor: "智谱 BigModel", plan: "GLM Coding V2 Lite（老用户续费）", cat: "official", region: "cn", priceM: 49, priceY: 39.2, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 80 次 prompt + 每周约 400 次；高峰 3x/非高峰 2x 抵扣",
    models: "GLM-5 系列",
    tools: "Claude Code、Codex、ZCode 等",
    note: "2026-02-12 上线；老用户可按 ¥49 续费；新用户不可购",
    url: "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision" },
  { id: "plan-0155", fieldRefs: {"tools":"plan-0154"}, vendor: "智谱 BigModel", plan: "GLM Coding V2 Pro（老用户续费）", cat: "official", region: "cn", priceM: 149, priceY: 119.2, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 400 次 prompt + 每周约 2,000 次",
    models: "GLM-5 系列",
    tools: "同上",
    note: "包季 9 折 ¥134.1/月；包年 8 折 ¥119.2/月",
    url: "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision" },
  { id: "plan-0156", fieldRefs: {"tools":"plan-0155"}, vendor: "智谱 BigModel", plan: "GLM Coding V2 Max（老用户续费）", cat: "official", region: "cn", priceM: 469, priceY: 375.2, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时约 1,600 次 prompt + 每周约 8,000 次",
    models: "GLM-5 系列",
    tools: "同上",
    note: "包季 9 折 ¥422.1/月；包年 8 折 ¥375.2/月",
    url: "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision" },

  /* ---- 智谱 BigModel（新版积分制，2026-07-30 起新用户适用） ---- */
  { id: "plan-0157", vendor: "智谱 BigModel", plan: "GLM Coding V3 Lite", cat: "official", region: "cn", priceM: 118, priceY: 82.6, cur: "CNY", seat: false,
    autoRenewMonthly: 94.4,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时 2,000 积分 + 每周 10,000 积分（积分=(输入×6.9+缓存×1.7+输出×24)/10000）",
    models: "GLM-5.3、GLM-5.3-Flash（旧版 5.2/5.1 自动路由至 5.3）",
    tools: "Claude Code、Codex、ZCode、Kilo Code、OpenCode、Roo Code、Cline、TRAE、Cursor 等 20+ 工具",
    note: "连续包月/包季 8 折约 ¥94.4/月；连续包年 7 折 ¥82.6/月（2026-10-01 购买页在售）；工作日 14:00–18:00 高峰，非高峰积分 5 折；双节活动（09-25~10-07）全天按非高峰消耗；夜间畅用（09-03~10-07 每日 23:00–09:00）ZCode/AutoClaw 端 Flash 不限量、其他 Agent 额度翻倍；老用户可按旧价 ¥49/月续费",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview.md" },
  { id: "plan-0158", fieldRefs: {"tools":"plan-0157"}, vendor: "智谱 BigModel", plan: "GLM Coding V3 Pro", cat: "official", region: "cn", priceM: 538, priceY: 376.6, cur: "CNY", seat: false,
    autoRenewMonthly: 430.4,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时 12,000 积分 + 每周 60,000 积分",
    models: "GLM-5.3、GLM-5.3-Flash（抵扣系数：GLM-5.3 输入 6.9/缓存 1.7/输出 24；Flash 2.3/0.56/8）",
    tools: "同 Lite 档",
    note: "连续包月/包季 8 折约 ¥430.4/月；连续包年 7 折 ¥376.6/月（2026-10-01 购买页在售）；双节活动（09-25~10-07）全天按非高峰消耗、夜间畅用同 Lite；老用户可按 V2 价 ¥149/月续费",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview.md" },
  { id: "plan-0159", fieldRefs: {"tools":"plan-0157"}, vendor: "智谱 BigModel", plan: "GLM Coding V3 Max", cat: "official", region: "cn", priceM: 1078, priceY: 754.6, cur: "CNY", seat: false,
    autoRenewMonthly: 862.4,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每 5 小时 28,000 积分 + 每周 140,000 积分",
    models: "GLM-5.3、GLM-5.3-Flash",
    tools: "同 Lite 档",
    note: "连续包月/包季 8 折约 ¥862.4/月；连续包年 7 折 ¥754.6/月（2026-10-01 购买页在售）；双节活动（09-25~10-07）全天按非高峰消耗、夜间畅用同 Lite；老用户可按 ¥469/月续费；官方称较按量 API 最高省 92%",
    url: "https://docs.bigmodel.cn/cn/coding-plan/overview.md" },
  { id: "plan-0160", vendor: "智谱 BigModel", plan: "GLM Coding Plan 团队标准版", cat: "team", region: "cn", priceM: 598, priceY: 538.2, cur: "CNY", seat: true,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "每席位每 5 小时 15,000 积分 + 每周 66,000 积分；2 席位起购，无上限",
    models: "GLM-5.3、GLM-5.3-Flash",
    tools: "Claude Code、ZCode、OpenClaw 等套餐支持的工具",
    note: "官网公开价 ¥598/席位/月，年付 9 折约 ¥538.2/席位/月；2 席起。超额限时按 API 刊例价 9 折；IP 白名单、集中账单。",
    url: "https://bigmodel.cn/glm-coding?plantype=team" },

  /* ---- 月之暗面 Kimi Code Plan ---- */
  { id: "plan-0161", vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Plus", cat: "official", region: "cn", priceM: 99, priceY: 79, cur: "CNY", seat: false,
    autoRenewMonthly: 99,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时滚动窗口 + 月总额度（不设周额度；具体积分/prompts 数值未公开）",
    models: "Kimi K3 / K3-256K、K2.8 Preview、K2.7 Code HighSpeed",
    tools: "Kimi Desktop、Kimi CLI、Kimi Code for VS Code、Claude Code、OpenCode、Codex、Hermes Agent",
    note: "¥99 为连续包月价；年付 ¥948/年（约 ¥79/月）；三档均可用旗舰 K3；附赠 Kimi 会员权益",
    url: "https://www.kimi.com/code" },
  { id: "plan-0162", fieldRefs: {"tools":"plan-0161"}, vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Pro", cat: "official", region: "cn", priceM: 199, priceY: 159, cur: "CNY", seat: false,
    autoRenewMonthly: 199,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时滚动窗口 + 月总额度（具体数值未公开）",
    models: "Kimi K3（最高 1M 上下文）/ K3-256K、K2.8 Preview、K2.7 Code HighSpeed",
    tools: "同 Plus 档",
    note: "连续包月 ¥199/月；年付 ¥1,908/年（约 ¥159/月）",
    url: "https://www.kimi.com/code" },
  { id: "plan-0163", fieldRefs: {"tools":"plan-0161"}, vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Max", cat: "official", region: "cn", priceM: 699, priceY: 559, cur: "CNY", seat: false,
    autoRenewMonthly: 699,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时滚动窗口 + 月总额度（具体数值未公开）",
    models: "Kimi K3（最高 1M 上下文）、K2.8 Preview、K2.7 Code HighSpeed",
    tools: "同 Plus 档",
    note: "连续包月 ¥699/月；年付 ¥6,708/年（约 ¥559/月）；曾名'全能尊享'（10 倍 Agent 额度、Kimi Code 60 倍额度）",
    url: "https://www.kimi.com/code" },

  /* ---- MiniMax Token Plan ---- */
  { id: "plan-0164", vendor: "MiniMax", plan: "Token Plan Plus", cat: "official", region: "cn", priceM: 49, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时固定窗口 + 周窗口（Token 计量，具体数值以控制台为准；第三方估算约 6 亿+ tokens/月，按 MiniMax-M3 计）",
    models: "MiniMax-M3、M2.7（含图像/语音）",
    tools: "OpenClaw、Claude Code、Cursor、TRAE、Roo Code、Kilo Code、Cline、Codex CLI、OpenCode 等",
    note: "订阅 Key 与按量 Key 不互通；额度不结转；超额可购积分包（¥30=4,489 / ¥150=22,460 / ¥500=74,900 积分）",
    url: "https://platform.minimax.cn/docs/guides/pricing-token-plan.md" },
  { id: "plan-0165", fieldRefs: {"tools":"plan-0164"}, vendor: "MiniMax", plan: "Token Plan Max", cat: "official", region: "cn", priceM: 119, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时固定窗口 + 周窗口（约 4–5 个并发 Agent；第三方估算约 18 亿+ tokens/月，按 MiniMax-M3 计）",
    models: "MiniMax-M3、M2.7、图像、语音",
    tools: "同 Plus 档",
    note: "适合高频编程 Agent 与多模态调用",
    url: "https://platform.minimax.cn/docs/guides/pricing-token-plan.md" },
  { id: "plan-0166", fieldRefs: {"tools":"plan-0164"}, vendor: "MiniMax", plan: "Token Plan Ultra", cat: "official", region: "cn", priceM: 469, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h", quotaSharing: "shared",
    quota: "5 小时固定窗口 + 周窗口（约 6–7 个并发 Agent；第三方估算约 71 亿+ tokens/月，按 MiniMax-M3 计）",
    models: "MiniMax-M3、M2.7、图像、语音",
    tools: "同 Plus 档",
    note: "重度 Agent 工作流；受邀订阅/升级 9 折",
    url: "https://platform.minimax.cn/docs/guides/pricing-token-plan.md" },

  /* ---- 小米 MiMo Token Plan（官方产品名是 Token Plan，不是 Coding Plan） ---- */
  { id: "plan-0167", vendor: "小米 MiMo", plan: "Token Plan Lite", cat: "official", region: "cn", priceM: 39, priceY: 34.32, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "41 亿 Credits/月（4.1B）。mimo-v2.6-flash：缓存 2 / 未命中 100 / 输出 200 Credits 每 token；pro 为 2.5 / 300 / 600。夜间 0:00–8:00 消耗 ×0.8",
    models: "mimo-v2.6-pro、mimo-v2.6-flash；个人版另含 v2.5-pro / v2.5（2026-10-21 10:00 下线）",
    tools: "OpenCode、OpenClaw、Claude Code 等；订阅 Key 与按量 Key 不互通",
    note: "官方文档 2026-09-21。首购 88 折（每账号 1 次，不与包年同享）；年付 ¥411.84（折合 ¥34.32/月）。海外同档 $6/月",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0168", fieldRefs: {"models":"plan-0167","tools":"plan-0167"}, vendor: "小米 MiMo", plan: "Token Plan Standard", cat: "official", region: "cn", priceM: 99, priceY: 87.12, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "110 亿 Credits/月。官方场景：以 flash 为基准约 1,600 轮中等～复杂任务",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "年付 ¥1,045.44（折合 ¥87.12/月）；海外 $16/月",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0169", fieldRefs: {"models":"plan-0167","tools":"plan-0167"}, vendor: "小米 MiMo", plan: "Token Plan Pro", cat: "official", region: "cn", priceM: 329, priceY: 289.52, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "380 亿 Credits/月。官方场景：以 flash 为基准约 5,600 轮",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "年付 ¥3,474.24（折合 ¥289.52/月）；海外 $50/月",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0170", fieldRefs: {"models":"plan-0167","tools":"plan-0167"}, vendor: "小米 MiMo", plan: "Token Plan Max", cat: "official", region: "cn", priceM: 659, priceY: 579.92, cur: "CNY", seat: false,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "820 亿 Credits/月。官方场景：以 flash 为基准约 12,800 轮",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "年付 ¥6,959.04（折合 ¥579.92/月）；海外 $100/月。不支持从 Max 再升级",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0171", fieldRefs: {"tools":"plan-0169"}, vendor: "小米 MiMo", plan: "Token Plan 团队 Standard", cat: "team", region: "cn", priceM: 99, priceY: 87, cur: "CNY", seat: true,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "110 亿 Credits/席/月。团队版不享首购 88 折",
    models: "mimo-v2.6-pro、mimo-v2.6-flash、ASR；不含即将下线的 v2.5",
    tools: "同个人版，另有席位管理与集中账单",
    note: "年付 ¥1,044/席（文档取整，折合 ¥87/月）",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0172", fieldRefs: {"models":"plan-0171","tools":"plan-0171"}, vendor: "小米 MiMo", plan: "Token Plan 团队 Pro", cat: "team", region: "cn", priceM: 329, priceY: 289, cur: "CNY", seat: true,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "380 亿 Credits/席/月",
    models: "同团队 Standard",
    tools: "同团队 Standard",
    note: "年付 ¥3,468/席（折合 ¥289/月）",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { id: "plan-0173", fieldRefs: {"models":"plan-0171","tools":"plan-0171"}, vendor: "小米 MiMo", plan: "Token Plan 团队 Max", cat: "team", region: "cn", priceM: 659, priceY: 579, cur: "CNY", seat: true,
    windowPeriod: "month", quotaSharing: "shared",
    quota: "820 亿 Credits/席/月",
    models: "同团队 Standard",
    tools: "同团队 Standard",
    note: "年付 ¥6,948/席（折合 ¥579/月）",
    url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },

  /* ---- 腾讯云 TokenHub 通用 Token Plan（个人版；Hy Token Plan 另计，见不确定项） ---- */
  { id: "plan-0174", vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Lite", cat: "cloud", region: "cn", priceM: 39, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "month",
    quota: "每订阅月 780 积分。积分 =（缓存 token×缓存系数 + 未命中 token×未命中系数 + 输出 token×输出系数）/ 1,000,000",
    models: "Auto、Hy4-preview、GLM-5.3-Flash、GLM-5.2、Kimi K3、Kimi-K2.6、DeepSeek-V4.1-Flash、DeepSeek-V4-Pro、MiniMax-M3、MiMo-V2.6-Flash",
    tools: "TokenHub API；与 Hy Token Plan 可各持 1 份，共用 API Key，按 Model ID 扣对应套餐",
    note: "2026-08-31 起由 token 额度改为积分。DeepSeek 原厂直供有峰谷：高峰为北京时间 9:00–12:00 与 14:00–18:00，空闲为高峰的一半。只支持升级",
    url: "https://cloud.tencent.com/document/product/1823/130060" },
  { id: "plan-0175", fieldRefs: {"models":"plan-0174","tools":"plan-0174"}, vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Standard", cat: "cloud", region: "cn", priceM: 99, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "month",
    quota: "每订阅月 1980 积分",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "额度用尽不扣其他资源包或余额，等下个订阅月恢复",
    url: "https://cloud.tencent.com/document/product/1823/130060" },
  { id: "plan-0176", fieldRefs: {"models":"plan-0174","tools":"plan-0174"}, vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Pro", cat: "cloud", region: "cn", priceM: 299, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "month",
    quota: "每订阅月 5980 积分",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "同 Lite 档规则",
    url: "https://cloud.tencent.com/document/product/1823/130060" },
  { id: "plan-0177", fieldRefs: {"models":"plan-0174","tools":"plan-0174"}, vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Max", cat: "cloud", region: "cn", priceM: 599, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "month",
    quota: "每订阅月 11980 积分",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "同 Lite 档规则",
    url: "https://cloud.tencent.com/document/product/1823/130060" },

  /* ---- 百度千帆 Token Plan 个人版（积分系数未公布，不进额度深度表） ---- */
  { id: "plan-0178", vendor: "百度千帆", plan: "Token Plan Mini", cat: "cloud", region: "cn", priceM: 9.9, priceY: null, cur: "CNY", seat: false,
    quota: "1,400 积分/月",
    models: "GLM、DeepSeek、Kimi 等主流国产模型（页面未列完整模型 ID）",
    tools: "Cursor、Windsurf、Cline 等；兼容 OpenAI 与 Anthropic 协议",
    note: "标价为续费价。首购 ¥4.9；活动期首次续费 6 折。积分与 token 的换算未在页面公布",
    url: "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html" },
  { id: "plan-0179", fieldRefs: {"models":"plan-0178","tools":"plan-0178"}, vendor: "百度千帆", plan: "Token Plan Lite", cat: "cloud", region: "cn", priceM: 40, priceY: null, cur: "CNY", seat: false,
    quota: "6,600 积分/月",
    models: "同 Mini 档",
    tools: "同 Mini 档",
    note: "首购 ¥19.9；积分换算未公布",
    url: "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html" },
  { id: "plan-0180", fieldRefs: {"models":"plan-0178","tools":"plan-0178"}, vendor: "百度千帆", plan: "Token Plan Pro", cat: "cloud", region: "cn", priceM: 200, priceY: null, cur: "CNY", seat: false,
    quota: "45,000 积分/月",
    models: "同 Mini 档",
    tools: "同 Mini 档",
    note: "首购 ¥99.9；积分换算未公布",
    url: "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html" },
  { id: "plan-0181", fieldRefs: {"models":"plan-0178","tools":"plan-0178"}, vendor: "百度千帆", plan: "Token Plan Max", cat: "cloud", region: "cn", priceM: 600, priceY: null, cur: "CNY", seat: false,
    quota: "165,000 积分/月",
    models: "同 Mini 档",
    tools: "同 Mini 档",
    note: "首购 ¥299.9；积分换算未公布",
    url: "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html" },

  /* ---- 七牛云企业 Token Plan（基准公式已公布，逐模型额外倍率在订阅页，不进额度深度表） ---- */
  { id: "plan-0182", vendor: "七牛云", plan: "企业 Token Plan S", cat: "team", region: "cn", priceM: 2999, priceY: null, cur: "CNY", seat: false,
    quota: "约 10.7 亿积分/月，约 2.47 亿积分/周。基准：0.004 元/K tokens 对应 1 倍积分；系数 = 模型刊例价 ÷ 0.004",
    models: "DeepSeek-V4.1-Flash、DeepSeek-V4-Pro、Kimi-K3、Kimi-K2.7-Code、GLM-5.3、GLM-5.3-Flash、MiniMax-M3、MiniMax-M2.7 等 17 个",
    tools: "一个订阅 API Key；Completions、Responses、Messages",
    note: "成交价 ¥2,999（划线原价 ¥4,284，7 折）。未用完不结转。闲时 18:00–次日 08:00 对 DeepSeek-V4 系列与 GLM-5.3 按 ×0.3。部分模型另有额外倍率，只在订阅页标注",
    url: "https://www.qiniu.com/ai/plan" },
  { id: "plan-0183", fieldRefs: {"models":"plan-0182","tools":"plan-0182"}, vendor: "七牛云", plan: "企业 Token Plan M", cat: "team", region: "cn", priceM: 4999, priceY: null, cur: "CNY", seat: false,
    quota: "约 20.8 亿积分/月，约 4.81 亿积分/周",
    models: "同 S 档",
    tools: "同 S 档",
    note: "成交价 ¥4,999（划线原价 ¥8,332，6 折）",
    url: "https://www.qiniu.com/ai/plan" },
  { id: "plan-0184", fieldRefs: {"models":"plan-0182","tools":"plan-0182"}, vendor: "七牛云", plan: "企业 Token Plan B", cat: "team", region: "cn", priceM: 9999, priceY: null, cur: "CNY", seat: false,
    quota: "约 50.0 亿积分/月，约 11.54 亿积分/周",
    models: "同 S 档",
    tools: "同 S 档",
    note: "成交价 ¥9,999（划线原价 ¥19,998，5 折）。包年最低约 4 折，年付金额以购买页为准",
    url: "https://www.qiniu.com/ai/plan" },

  /* ---- 阿里云 Qoder CN（原通义灵码，2026-05-20 更名） ---- */
  { id: "plan-0185", vendor: "阿里云 Qoder CN（原通义灵码）", plan: "个人体验版（Free）", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "300 Credits（一次性）+ 为期 2 周的 Pro 试用",
    models: "GLM、DeepSeek、Kimi、MiniMax 等国内主流模型（模型选择器切换）",
    tools: "Qoder CN IDE、JetBrains/VS Code 插件、Qoder CN CLI、Repowiki、Quest、Subagent",
    note: "2026-05-20 起引入 Credits 机制；退款仅限订阅 24 小时内且未使用 Credits",
    url: "https://help.aliyun.com/zh/lingma/product-overview/billing-description" },
  { id: "plan-0186", vendor: "阿里云 Qoder CN（原通义灵码）", plan: "个人专业版（Pro）", cat: "tool", region: "cn", priceM: 59, priceY: 53.1, cur: "CNY", seat: false,
    quota: "2,000 Credits/月（续费每月加赠 1,000）",
    models: "GLM-5.3/5.3-Flash、DeepSeek-V4-Pro/Flash、Kimi-K3、K2.7-Code、MiniMax-M3、Qwen3.8-Max 等（Auto 档夜间峰谷折扣）",
    tools: "Qoder CN IDE/插件/CLI、QoderWork CN、Cloud Agents CN（全家桶共享 Credits）",
    note: "年付 9 折约 ¥53.1/月（第三方口径）；加量包 ¥0.04/Credit",
    url: "https://help.aliyun.com/zh/lingma/product-overview/billing-description" },
  { id: "plan-0187", fieldRefs: {"models":"plan-0186"}, vendor: "阿里云 Qoder CN（原通义灵码）", plan: "个人高级版（Pro+）", cat: "tool", region: "cn", priceM: 169, priceY: 152.1, cur: "CNY", seat: false,
    quota: "6,000 Credits/月（续费加赠至 7,000，第三方口径）",
    models: "同 Pro 档",
    tools: "Qoder CN 全家桶（IDE/CLI/Work/Wake/Mobile 共享 Credits）",
    note: "年付 9 折约 ¥152.1/月（第三方口径）；含 QoderWork CN、写作/幻灯片/设计工作台",
    url: "https://help.aliyun.com/zh/lingma/product-overview/billing-description" },

  /* ---- 腾讯云 CodeBuddy / WorkBuddy ---- */
  { id: "plan-0188", vendor: "腾讯云 CodeBuddy", plan: "体验版（个人免费）", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "500 积分/月；代码补全 5,000 次/月（限时无限次）",
    models: "Hy4 preview、Hy3、GLM-5.3、Kimi-K3、MiniMax-M3、DeepSeek-V4 系列、Auto（快速/均衡/极致）",
    tools: "CodeBuddy IDE、CodeBuddy Code CLI、WorkBuddy（两客户端共享积分池）",
    note: "2026-09-30 按 codebuddy.cn 定价页核对：体验版是持续免费档，不是一次性新人赠送。产品站仍是 copilot.tencent.com",
    url: "https://www.codebuddy.cn/pricing/" },
  { id: "plan-0189", fieldRefs: {"models":"plan-0188","tools":"plan-0188"}, vendor: "腾讯云 CodeBuddy", plan: "标准版（个人）", cat: "tool", region: "cn", priceM: 99, priceY: 56, cur: "CNY", seat: false,
    autoRenewMonthly: 70,
    quota: "4,000 积分/月（基础 2,000+加赠 2,000）；每月签到另送约 3,000 积分",
    models: "同体验档",
    tools: "同体验档",
    note: "连续包月 7 折 ¥70；连续包年 ¥672/年（约 ¥56/月）",
    url: "https://copilot.tencent.com" },
  { id: "plan-0190", fieldRefs: {"models":"plan-0188","tools":"plan-0188"}, vendor: "腾讯云 CodeBuddy", plan: "高级版（个人）", cat: "tool", region: "cn", priceM: 199, priceY: 112, cur: "CNY", seat: false,
    autoRenewMonthly: 140,
    quota: "9,000 积分/月（基础 4,000+加赠 5,000）；每月签到另送约 3,000 积分",
    models: "同体验档",
    tools: "同体验档",
    note: "连续包月 7 折 ¥140；连续包年 ¥1,344/年（约 ¥112/月）",
    url: "https://copilot.tencent.com" },
  { id: "plan-0191", fieldRefs: {"models":"plan-0188","tools":"plan-0188"}, vendor: "腾讯云 CodeBuddy", plan: "旗舰版（个人）", cat: "tool", region: "cn", priceM: 999, priceY: 560, cur: "CNY", seat: false,
    autoRenewMonthly: 700,
    quota: "50,000 积分/月（基础 20,000+加赠 30,000）；每月签到另送约 3,000 积分",
    models: "同体验档",
    tools: "同体验档",
    note: "连续包月 7 折 ¥700；连续包年 ¥6,720/年（约 ¥560/月）",
    url: "https://copilot.tencent.com" },

  /* ---- 字节跳动 Trae ---- */
  { id: "plan-0192", vendor: "字节跳动 Trae（国内版）", plan: "Trae Free", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "500 积分/月；云端任务并发 2 个",
    models: "GLM、Seed-2.1-Turbo/Seed-Code（Free 5 折）、DeepSeek-Flash/Pro（闲时 5 折）等",
    tools: "Trae CN IDE、TraeWork（原 SOLO 模式）",
    note: "会员签到多得 1,550 积分",
    url: "https://www.trae.cn/pricing" },
  { id: "plan-0193", vendor: "字节跳动 Trae（国内版）", plan: "会员 Lite", cat: "tool", region: "cn", priceM: 49, priceY: null, cur: "CNY", seat: false,
    quota: "2,000 积分/月；云端任务并发 2 个",
    models: "GLM-5.3（会员 5 折）、DeepSeek-V4-Flash、Kimi-K3、MiniMax-M3、Qwen3.8-Max 等（模型积分倍率 0.03x–1.83x）",
    tools: "Trae CN IDE、TraeWork",
    note: "首月低至 ¥39；积分月结清零；加量包 ¥0.05/积分",
    url: "https://www.trae.cn/pricing" },
  { id: "plan-0194", fieldRefs: {"models":"plan-0193","tools":"plan-0193"}, vendor: "字节跳动 Trae（国内版）", plan: "会员 Pro", cat: "tool", region: "cn", priceM: 99, priceY: null, cur: "CNY", seat: false,
    quota: "4,000 积分/月；云端任务并发 10 个",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "首月低至 ¥69；高峰期优先响应",
    url: "https://www.trae.cn/pricing" },
  { id: "plan-0195", fieldRefs: {"models":"plan-0193","tools":"plan-0193"}, vendor: "字节跳动 Trae（国内版）", plan: "会员 Pro+", cat: "tool", region: "cn", priceM: 239, priceY: null, cur: "CNY", seat: false,
    autoRenewMonthly: 219,
    quota: "12,000 积分/月；云端任务并发 10 个",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "连续包月 ¥219/月；单月购买 ¥239，到期不续订。",
    url: "https://www.trae.cn/pricing" },
  { id: "plan-0196", fieldRefs: {"models":"plan-0193","tools":"plan-0193"}, vendor: "字节跳动 Trae（国内版）", plan: "会员 Ultra", cat: "tool", region: "cn", priceM: 699, priceY: null, cur: "CNY", seat: false,
    autoRenewMonthly: 629,
    quota: "40,000 积分/月；云端任务并发 20 个",
    models: "同 Lite 档；新模型优先使用",
    tools: "同 Lite 档",
    note: "连续包月 ¥629/月；单月购买 ¥699，到期不续订。",
    url: "https://www.trae.cn/pricing" },
  { id: "plan-0197", vendor: "字节跳动 Trae（国际版）", plan: "Trae Pro", cat: "tool", region: "intl", priceM: 10, priceY: 7.5, cur: "USD", seat: false,
    autoRenewMonthly: 10,
    quota: "2026-04 起改为 usage 额度制（社区反映约等值 $20 的 Basic 额度）",
    models: "Claude、GPT 系列等海外模型",
    tools: "Trae IDE（TraeCode）、TraeWork",
    note: "官网连续包月 $10/月，单月一次购买 $15，年付 $7.5/月；部分用户可有 Pro 试用，试用不作为续费金额。",
    url: "https://www.trae.ai/pricing" },

  /* ---- 百度 ---- */
  { id: "plan-0198", vendor: "百度 DuMate", plan: "免费版", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "每日签到 500 积分（约 15,000 积分/月）；积分当月清零",
    models: "ERNIE 5.1、ERNIE 4.5 Turbo、X1 系列、DeepSeek-V4-Pro、GLM-5.3、Kimi-K2.6",
    tools: "DuMate PC 客户端（v1.0.49+）、本地 Agent",
    note: "任务级积分锚点：简单对话 5–20、读 PDF 约 80、PPT 大纲约 120；每百万 tokens 约 500–2,000 积分",
    url: "https://www.dumate.cn/" },
  { id: "plan-0199", fieldRefs: {"models":"plan-0198","tools":"plan-0198"}, vendor: "百度 DuMate", plan: "Pro", cat: "tool", region: "cn", priceM: 59, priceY: null, cur: "CNY", seat: false,
    quota: "25,000 积分 + 每月签到 15,000 积分",
    models: "同免费版",
    tools: "同免费版",
    note: "首月 ¥9.9；加量包 ¥10 / 5,000 积分",
    url: "https://www.dumate.cn/" },
  { id: "plan-0200", fieldRefs: {"models":"plan-0198","tools":"plan-0198"}, vendor: "百度 DuMate", plan: "Max", cat: "tool", region: "cn", priceM: 129, priceY: null, cur: "CNY", seat: false,
    quota: "100,000 积分 + 每月签到 15,000 积分",
    models: "同免费版",
    tools: "同免费版",
    note: "首月 ¥69.9；加量包 ¥10 / 5,000 积分。计费细则见 cloud.baidu.com/doc/Dumate",
    url: "https://www.dumate.cn/" },
  { id: "plan-0201", vendor: "百度文心快码 Comate", plan: "个人标准版", cat: "tool", region: "cn", priceM: 0, priceY: 0, cur: "CNY", seat: false,
    quota: "智能补全免费；首次赠智能体请求券 ¥10",
    models: "文心大模型系列",
    tools: "VS Code/JetBrains 插件、Comate Zulu、Comate AI IDE",
    note: "2026-07-15 百度智能云定价文档：个人标准版仍免费。专业版 ¥100/月、旗舰版 ¥299/月。产品站 comate.baidu.com",
    url: "https://cloud.baidu.com/doc/COMATE/s/rlnvnio4a" },

  /* ---- 腾讯云 LKEAP Coding Plan（API 套餐） ---- */
  { id: "plan-0202", vendor: "腾讯云（LKEAP 知识引擎）", plan: "腾讯云 Coding Plan Lite", cat: "cloud", region: "cn", priceM: 40, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "每 5 小时最多约 1,200 次请求 + 每周约 9,000 次 + 每订阅月约 18,000 次",
    models: "官方文档仍列 HY 2.0 Instruct、tc-code-latest（Auto）、GLM-5、kimi-k2.5、MiniMax-M2.5；额度对照已改用 Hy3 / Hy4-preview（HY2 不再作为对照模型）",
    tools: "CodeBuddy Code、OpenClaw、Claude Code、Cursor（api.lkeap.cloud.tencent.com/coding 接入）",
    note: "腾讯官方 Coding Plan 文档公开目录价；仅供个人在支持编程工具中使用，严禁非交互式自建 API 调用；实际库存及活动以下单页为准。",
    url: "https://cloud.tencent.com/document/product/1823/130092" },
  { id: "plan-0203", fieldRefs: {"models":"plan-0202","tools":"plan-0202"}, vendor: "腾讯云（LKEAP 知识引擎）", plan: "腾讯云 Coding Plan Pro", cat: "cloud", region: "cn", priceM: 200, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "每 5 小时最多约 6,000 次请求 + 每周约 45,000 次 + 每订阅月约 90,000 次",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "腾讯官方 Coding Plan 文档公开目录价；仅供个人在支持编程工具中使用，严禁非交互式自建 API 调用；实际库存及活动以下单页为准。",
    url: "https://cloud.tencent.com/document/product/1823/130092" },

  /* ---- 阿里云百炼套餐 ---- */
  { id: "plan-0204", vendor: "阿里云百炼", plan: "Token Plan 个人版 Lite", cat: "cloud", region: "cn", priceM: 39, priceY: null, cur: "CNY", seat: false,
    quota: "11,500 Credits/月（订阅日起30天月限额，用尽暂停、余量不结转）；1–2 个并发 Agent",
    models: "qwen3.8-max/flash、DeepSeek-V4、GLM-5.3 及图像/语音/视频共 20 款；内置联网搜索、代码解释器",
    tools: "Claude Code、Cursor、Qwen Code、Codex、Qoder、Qoder CN、OpenClaw",
    note: "限时价（原 ¥60）；仅华北 2（北京）地域、限个人版交互式使用；额度不结转；可加购 ¥100/20,000 Credits（最多 5 个）",
    url: "https://help.aliyun.com/zh/model-studio/token-plan-overview" },
  { id: "plan-0205", fieldRefs: {"models":"plan-0204","tools":"plan-0204"}, vendor: "阿里云百炼", plan: "Token Plan 个人版 Essential", cat: "cloud", region: "cn", priceM: 79, priceY: null, cur: "CNY", seat: false,
    quota: "25,500 Credits/月；2–3 个并发 Agent",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "限时价（原 ¥120）",
    url: "https://help.aliyun.com/zh/model-studio/token-plan-overview" },
  { id: "plan-0206", fieldRefs: {"models":"plan-0204","tools":"plan-0204"}, vendor: "阿里云百炼", plan: "Token Plan 个人版 Standard", cat: "cloud", region: "cn", priceM: 139, priceY: null, cur: "CNY", seat: false,
    quota: "45,000 Credits/月；3–4 个并发 Agent",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "限时价（原 ¥180）；附赠 AgentStudio 权益",
    url: "https://help.aliyun.com/zh/model-studio/token-plan-overview" },
  { id: "plan-0207", fieldRefs: {"models":"plan-0204","tools":"plan-0204"}, vendor: "阿里云百炼", plan: "Token Plan 个人版 Pro", cat: "cloud", region: "cn", priceM: 499, priceY: null, cur: "CNY", seat: false,
    quota: "180,000 Credits/月；6–8 个并发 Agent",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "限时价（原 ¥600）；附赠 AgentStudio 权益",
    url: "https://help.aliyun.com/zh/model-studio/token-plan-overview" },
  { id: "plan-0208", fieldRefs: {"models":"plan-0207","tools":"plan-0207"}, vendor: "阿里云百炼", plan: "Token Plan 团队版（标准座席）", cat: "cloud", region: "cn", priceM: 150, priceY: null, cur: "CNY", seat: true,
    quota: "标准座席 25,000 Credits/座席/月；高级座席 ¥550（100,000 Credits）；尊享座席 ¥1,398（250,000 Credits）；共享用量包 ¥5,000/月=625,000 Credits",
    models: "同个人版（文本/图像/视频/语音统一 Credits 抵扣）",
    tools: "同个人版",
    note: "限时价（标准座席原 ¥198）；承诺不使用数据训练模型；个人版与团队版可同时购买、独立计费",
    url: "https://help.aliyun.com/zh/model-studio/token-plan-overview" },
  { id: "plan-0209", vendor: "阿里云百炼", plan: "Coding Plan Pro（限量抢购）", cat: "cloud", region: "cn", priceM: 200, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "每 5 小时 6,000 次请求 + 每周 45,000 次 + 每月 90,000 次（按调用次数计，与 token 消耗无关）",
    models: "qwen3.7-plus、qwen3.6-plus、kimi-k2.5、glm-5、MiniMax-M2.5 等",
    tools: "Claude Code、Cursor、Codex、Qwen Code、Cline、OpenCode、Cherry Studio 等（coding.dashscope.aliyuncs.com，OpenAI/Anthropic 兼容）",
    note: "新客首月 ¥39.9，随后 ¥200/月；Lite 已停售；Pro 限量抢购。官方 Token Plan 概述称库存售罄后不再补充，与旧 Coding Plan 页每日 09:30 补货说明冲突，库存及购买资格以控制台为准；两产品独立。",
    url: "https://help.aliyun.com/zh/model-studio/coding-plan" },

  /* ---- 火山引擎方舟（字节） ---- */
  { id: "plan-0210", vendor: "火山引擎方舟（字节）", plan: "方舟 Coding Plan Lite", cat: "cloud", region: "cn", priceM: 40, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "5 小时 + 周 + 月三级请求次数窗口（具体数值以控制台为准）",
    models: "Doubao-Seed-Code、Doubao-Seed-Evolving、DeepSeek-V4、GLM-5.3、MiniMax-M3、Kimi-K2.8-Preview",
    tools: "Claude Code、Cursor、Cline、Codex CLI、Kilo Code、Roo Code、OpenClaw、TRAE",
    note: "官网常规价 ¥40/月；2026-06-08 至 2026-11-08 活动期内，每账号新购、续费、升配共享最多两个月 ¥9.9 优惠资格，第三个月起恢复原价；名额有限。",
    url: "https://docs.volcengine.com/docs/ark/coding-plan-personal-universal-promotion?lang=zh" },
  { id: "plan-0211", fieldRefs: {"models":"plan-0210","tools":"plan-0210"}, vendor: "火山引擎方舟（字节）", plan: "方舟 Coding Plan Pro", cat: "cloud", region: "cn", priceM: 200, priceY: null, cur: "CNY", seat: false,
    windowPeriod: "5h",
    quota: "5 小时 + 周 + 月三级请求次数窗口（约为 Lite 的 5 倍量级）",
    models: "同 Lite 档",
    tools: "同 Lite 档",
    note: "官网常规价 ¥200/月；2026-06-08 至 2026-11-08 活动期内，每账号新购、续费、升配共享最多两个月 ¥49.9 优惠资格，第三个月起恢复原价；名额有限。",
    url: "https://docs.volcengine.com/docs/ark/coding-plan-personal-universal-promotion?lang=zh" },
  { id: "plan-0212", vendor: "火山引擎方舟（字节）", plan: "方舟 Agent Plan（Small）", cat: "cloud", region: "cn", priceM: 40, priceY: null, cur: "CNY", seat: false,
    modelIncludes: ["Doubao-Seed", "GLM-5.3", "Flash", "DeepSeek-V4", "MiniMax-M3", "Kimi-K2.7-Code", "Kimi-K2.8-Preview"],
    modelExcludes: ["Kimi-K3"],
    quota: "AFP 积分制（扩展图像/视频/语音/联网搜索及 Harness 消耗）；Small ¥40 / Medium ¥200 / Large ¥500 / Max ¥1,000 四档",
    models: "Doubao-Seed 系列、GLM-5.3/Flash、DeepSeek-V4/Flash、MiniMax-M3、Kimi-K2.7-Code/K2.8-Preview（Small 不支持 Kimi-K3）",
    tools: "Claude Code、Cursor、Cline、Codex CLI、OpenClaw、TRAE 等",
    note: "官网常规价 ¥40/月；Small 不支持 Kimi-K3 或视频生成；文本/向量模型限用于支持的 AI 工具，5 小时/周/月额度共享。",
    url: "https://docs.volcengine.com/docs/ark/agent-plan-personal-plan-overview?lang=zh" },
];

/* API 按量计费（每百万 tokens）
 * USD 条目用 inUSD/outUSD；CNY 条目用 inCNY/outCNY（图表按汇率折算美元对比）
 * label 为图表短名；带 [硅基] 后缀为硅基流动聚合平台价格 */
const API_PRICES = [
  /* ---- 国际（USD per 1M tokens） ---- */
  { vendor: "Anthropic", model: "Claude Sonnet 5.5", label: "Claude Sonnet 5.5", region: "intl", cur: "USD", inUSD: 2, outUSD: 10,
    note: "2026-09-28 上线，价格与 Sonnet 5 持平；缓存写 5min $2.50 / 1h $4、读 $0.20；Batch $1/$5；订阅页模型列表仍统称 Sonnet",
    url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { vendor: "Anthropic", model: "Claude Sonnet 5", label: "Claude Sonnet 5", region: "intl", cur: "USD", inUSD: 2, outUSD: 10,
    note: "$2/$10 原为至 2026-08-31 介绍价，现已转为标准价（原定 9 月调至 $3/$15 的计划已取消）；缓存读 $0.20；限量 Fable/Mythos 5.1 $10/$50",
    url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { vendor: "Anthropic", model: "Claude Opus 5.5", label: "Claude Opus 5.5", region: "intl", cur: "USD", inUSD: 4, outUSD: 20,
    note: "缓存写入 5min $5 / 1h $8；缓存读 $0.20",
    url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { vendor: "OpenAI", model: "gpt-6-astra", label: "GPT-6 Astra", region: "intl", cur: "USD", inUSD: 10, outUSD: 50,
    note: "缓存输入 $1；长上下文档 $20/$75；Fast 模式 $20/$100；Batch/Flex 5 折",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-6.1-sol", label: "GPT-6.1 Sol", region: "intl", cur: "USD", inUSD: 2, outUSD: 10,
    note: "2026-09-29 DevDay 发布；缓存输入 $0.10（GPT-6 Sol 的一半）；长上下文(>272K) $4/$15、缓存 $0.20；Fast $4/$20；Batch/Flex 5 折；官方称编码对齐 Astra、约其 1/5 价",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-6-sol", label: "GPT-6 Sol", region: "intl", cur: "USD", inUSD: 2, outUSD: 10,
    note: "缓存输入 $0.20；长上下文 $4/$15；Fast $4/$20",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-6-luna", label: "GPT-6 Luna", region: "intl", cur: "USD", inUSD: 0.1, outUSD: 0.5,
    note: "缓存输入 $0.01；长上下文 $0.20/$0.75；Batch $0.05/$0.25",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-5.6-sol", label: "GPT-5.6 Sol", region: "intl", cur: "USD", inUSD: 4, outUSD: 20,
    note: "缓存输入 $0.40；长上下文 $8/$30；促销价至少延续至 2026-11-21",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-5.6-terra", label: "GPT-5.6 Terra", region: "intl", cur: "USD", inUSD: 2, outUSD: 12,
    note: "缓存输入 $0.20；长上下文 $4/$18",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-5.6-luna", label: "GPT-5.6 Luna", region: "intl", cur: "USD", inUSD: 0.2, outUSD: 1.2,
    note: "缓存输入 $0.02；长上下文 $0.40/$1.80",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "OpenAI", model: "gpt-5.3-codex（编程向）", label: "GPT-5.3-Codex", region: "intl", cur: "USD", inUSD: 1.75, outUSD: 14,
    note: "缓存输入 $0.175；Fast 模式 $3.50/$28",
    url: "https://developers.openai.com/api/docs/pricing" },
  { vendor: "Google", model: "Gemini 3.1 Pro Preview", label: "Gemini 3.1 Pro", region: "intl", cur: "USD", inUSD: 2, outUSD: 12,
    note: "prompt ≤200K 档；缓存 $0.20 + 存储 $4.50/1M/小时；Batch/Flex $1/$6；参考 Gemini 3.8 Flash $0.75/$3.75 介绍价至 2026-12-31，2027-01-01 起 $1.50/$7.50",
    url: "https://ai.google.dev/gemini-api/docs/pricing" },
  { vendor: "Z.ai", model: "GLM-5.3", label: "GLM-5.3 (Z.ai)", region: "intl", cur: "USD", inUSD: 1.4, outUSD: 4.4,
    note: "缓存输入 $0.26；GLM-5.3-Flash $0.15/$0.50、缓存 $0.03；FlashX $0.37/$1.25",
    url: "https://docs.z.ai/guides/overview/pricing.md" },
  { vendor: "DeepSeek", model: "deepseek-flash (V4.1-Flash)", label: "DeepSeek Flash", region: "intl", cur: "USD", inUSD: 0.15, outUSD: 0.6,
    note: "分时计价，表中取低峰价；高峰（UTC 周一至五 01:00–04:00、06:00–10:00）输入 $0.30 / 输出 $1.20；缓存命中输入 $0.003–0.006",
    url: "https://api-docs.deepseek.com/quick_start/pricing" },
  { vendor: "DeepSeek", model: "deepseek-v4-pro (V4-Pro-0813)", label: "DeepSeek V4-Pro", region: "intl", cur: "USD", inUSD: 0.66, outUSD: 1.98,
    note: "分时计价，表中取低峰价；高峰输入 $1.32 / 输出 $3.96；缓存命中低峰 $0.022 / 高峰 $0.044",
    url: "https://api-docs.deepseek.com/quick_start/pricing" },

  /* ---- 国内（CNY per 1M tokens） ---- */
  { vendor: "智谱 BigModel", model: "GLM-5.3", label: "GLM-5.3 (BigModel)", region: "cn", cur: "CNY", inCNY: 8, outCNY: 28,
    note: "缓存命中 ¥2；上下文 1M；Batch 5 折；GLM-5.3-Flash ¥0.8/¥2.8、FlashX ¥2/¥7、GLM-5.2 同价 ¥8/¥28；无独立 Coding 变体（编程能力经 GLM Coding Plan 提供）",
    url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
  { vendor: "月之暗面 Kimi", model: "Kimi K3（kimi-k3）", label: "Kimi K3", region: "cn", cur: "CNY", inCNY: 20, outCNY: 100,
    note: "输入为缓存未命中价，命中 ¥2；缓存写入 ¥20（5min TTL）；上下文 1,048,576；K3 定位'长程编程与端到端知识工作'旗舰；无订阅制",
    url: "https://platform.kimi.com/docs/pricing/chat.md" },
  { vendor: "月之暗面 Kimi", model: "Kimi K2.7-Code", label: "Kimi K2.7-Code", region: "cn", cur: "CNY", inCNY: 6.5, outCNY: 27,
    note: "缓存命中 ¥1.30；上下文 262,144；highspeed 版 ¥2.6/¥13 入、¥54 出；当前在售编程专用模型",
    url: "https://platform.kimi.com/docs/pricing/chat.md" },
  { vendor: "MiniMax", model: "MiniMax-M3", label: "MiniMax M3", region: "cn", cur: "CNY", inCNY: 2.1, outCNY: 8.4,
    note: "≤512K 输入档、'永久五折'标价（划线原价 ¥4.20/¥16.80）；>512K 档 ¥4.20/¥16.80；优先档 1.5 倍",
    url: "https://platform.minimax.cn/docs/guides/pricing-paygo.md" },
  { vendor: "MiniMax", model: "MiniMax-M2.7", label: "MiniMax M2.7", region: "cn", cur: "CNY", inCNY: 2.1, outCNY: 8.4,
    note: "缓存读 ¥0.42、写 ¥2.625；highspeed ¥4.2/¥16.8",
    url: "https://platform.minimax.cn/docs/guides/pricing-paygo.md" },
  { vendor: "阿里云百炼", model: "qwen3-coder-next", label: "Qwen3-Coder-Next", region: "cn", cur: "CNY", inCNY: 1, outCNY: 4,
    note: "≤32K 档；32K-128K ¥1.5/¥6；128K-256K ¥2.5/¥10；上下文 262,144；不支持缓存",
    url: "https://docs.bailian.console.aliyun.com/zh/model-studio/qwen3-coder-next.md" },
  { vendor: "阿里云百炼", model: "qwen3-coder-plus", label: "Qwen3-Coder-Plus", region: "cn", cur: "CNY", inCNY: 4, outCNY: 16,
    note: "≤32K 档；32K-128K ¥6/¥24；256K-1M ¥20/¥200；上下文 1M；缓存命中 ¥0.8",
    url: "https://docs.bailian.console.aliyun.com/zh/model-studio/qwen3-coder-plus.md" },
  { vendor: "阿里云百炼", model: "qwen3-coder-flash", label: "Qwen3-Coder-Flash", region: "cn", cur: "CNY", inCNY: 1, outCNY: 4,
    note: "≤32K 档；256K-1M ¥5/¥25；上下文 1M；缓存命中 ¥0.2–¥1；参考旗舰 qwen3.8-max ¥12/¥36",
    url: "https://docs.bailian.console.aliyun.com/zh/model-studio/qwen3-coder-flash.md" },
  { vendor: "火山引擎（豆包/方舟）", model: "doubao-seed-2.0-code", label: "doubao-2.0-code", region: "cn", cur: "CNY", inCNY: 3.2, outCNY: 16,
    note: "[0,32]千 token 档；32K-128K ¥4.8/¥24；128K-256K ¥9.6/¥48；缓存命中 ¥0.64；批量约 5 折",
    url: "https://docs.volcengine.com/docs/ark/model-pricing?lang=zh" },
  { vendor: "火山引擎（豆包/方舟）", model: "doubao-seed-2.1-pro", label: "doubao-2.1-pro", region: "cn", cur: "CNY", inCNY: 6, outCNY: 30,
    note: "单档价；2.1-lite ¥0.8/¥2.7、2.1-turbo ¥3/¥15",
    url: "https://docs.volcengine.com/docs/ark/model-pricing?lang=zh" },
  { vendor: "阶跃星辰 StepFun", model: "step-5-preview", label: "step-5-preview", region: "cn", cur: "CNY", inCNY: 7, outCNY: 20,
    note: "缓存命中 ¥0.35；2026 年 9 月新发布旗舰预览（600B MoE、1M 上下文）",
    url: "https://platform.stepfun.com/docs/zh/guides/pricing/details.md" },
  { vendor: "阶跃星辰 StepFun", model: "step-3.7-flash", label: "step-3.7-flash", region: "cn", cur: "CNY", inCNY: 1.35, outCNY: 8.1,
    note: "缓存命中 ¥0.27；多模态推理（256K）；step-3.5-flash ¥0.7/¥2.1",
    url: "https://platform.stepfun.com/docs/zh/guides/pricing/details.md" },
  { vendor: "硅基流动 SiliconFlow", model: "zai-org/GLM-5.3", label: "GLM-5.3 [硅基]", region: "cn", cur: "CNY", inCNY: 8, outCNY: 28,
    note: "硅基流动官方实时价：输入 ¥8 / 输出 ¥28 / 缓存命中 ¥2，每百万 tokens；与 BigModel 标准直连价同档。",
    url: "https://cloud-rd.siliconflow.cn/pricing" , apiCache: 2 },
  { vendor: "硅基流动 SiliconFlow", model: "moonshotai/Kimi-K2.7-Code", label: "Kimi K2.7-Code [硅基]", region: "cn", cur: "CNY", inCNY: 6.5, outCNY: 27,
    note: "与 Moonshot 直连未命中价一致；Kimi-K2.6 同价",
    url: "https://siliconflow.cn/models" },
  { vendor: "硅基流动 SiliconFlow", model: "deepseek-ai/DeepSeek-V4-Pro", label: "DeepSeek V4-Pro [硅基]", region: "cn", cur: "CNY", inCNY: 12, outCNY: 24,
    note: "DeepSeek-V4-Flash ¥1/¥2、DeepSeek-V3.2 ¥2/¥3",
    url: "https://siliconflow.cn/models" },
  { vendor: "硅基流动 SiliconFlow", model: "Qwen/Qwen3.8-27B", label: "Qwen3.8-27B [硅基]", region: "cn", cur: "CNY", inCNY: 3, outCNY: 12,
    note: "硅基流动官方实时价 ¥3 输入 / ¥12 输出，每百万 tokens；Qwen/Qwen3.8-27B，未公布缓存价。",
    url: "https://cloud-rd.siliconflow.cn/pricing" },
  { vendor: "阿里云百炼", model: "qwen3.8-flash", label: "qwen3.8-flash-next", region: "cn", cur: "CNY", inCNY: 0.8, outCNY: 2.7,
    note: "开放权重名 Qwen3.8-Flash-Next，线上计费 ID 为 qwen3.8-flash；华北2 原价，缓存命中 ¥0.1，显式缓存创建 ¥1.25；2026-08-27 自 ¥1/¥3 下调。QwenCloud/OpenRouter 国际挂牌 $0.15/$0.47，缓存读 $0.016、写 $0.20",
    url: "https://help.aliyun.com/zh/model-studio/qwen3-8-flash" },
  { vendor: "腾讯云 TokenHub", model: "hy3", label: "Hy3", region: "cn", cur: "CNY", inCNY: 1, outCNY: 4,
    note: "缓存命中 ¥0.25。OpenRouter tencent/hy3 挂牌 $0.132/$0.528，缓存 $0.033（与刊例按汇率大致同档）",
    url: "https://cloud.tencent.com/document/product/1823/130055" },
  { vendor: "腾讯云 TokenHub", model: "hy4-preview", label: "Hy4-preview", region: "cn", cur: "CNY", inCNY: 6, outCNY: 18,
    note: "缓存命中 ¥0.3。OpenRouter tencent/hy4-preview 挂牌 $0.834/$2.501，缓存 $0.042",
    url: "https://cloud.tencent.com/document/product/1823/130055" },
  { vendor: "小米 MiMo", model: "mimo-v2.6-flash", label: "mimo-v2.6-flash", region: "cn", cur: "CNY", inCNY: 1, outCNY: 2,
    note: "缓存命中 ¥0.02，缓存写入免费。美元挂牌 $0.14/$0.28，缓存 $0.0028。v2.5 同价，2026-10-21 10:00 下线",
    url: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go" },
  { vendor: "小米 MiMo", model: "mimo-v2.6-pro", label: "mimo-v2.6-pro", region: "cn", cur: "CNY", inCNY: 3, outCNY: 6,
    note: "缓存命中 ¥0.025，缓存写入免费。美元挂牌 $0.435/$0.87，缓存 $0.0036。极速档约为实时的 10 倍",
    url: "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go" },
];

/* 额度表里的官方 API 按量对照。apiIn/apiOut/apiCache 为每百万 tokens 的低峰牌价（无峰谷则用刊例价）。
 * 与 API_PRICES 是同一批官方价：改价时两处一起改。Flash 等未单列进行情图的型号只写在这里。 */
const PAYG_REFERENCES = [
  { vendor: "DeepSeek", model: "deepseek-flash", cur: "USD", apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    note: "官方低峰价，模型请求名 deepseek-flash；工作日高峰输入 $0.30 / 输出 $1.20 / 缓存 $0.006；中国法定节假日全天低峰。",
    source: "api-docs.deepseek.com", url: "https://api-docs.deepseek.com/quick_start/pricing" },
  { vendor: "DeepSeek", model: "deepseek-v4-pro", cur: "USD", apiIn: 0.66, apiOut: 1.98, apiCache: 0.022,
    note: "官方低峰价。高峰输入 $1.32 / 输出 $3.96 / 缓存 $0.044。无订阅计划。",
    source: "api-docs.deepseek.com", url: "https://api-docs.deepseek.com/quick_start/pricing" },
  { vendor: "Z.ai", model: "GLM-5.3", cur: "USD", apiIn: 1.4, apiOut: 4.4, apiCache: 0.26,
    note: "Z.ai 国际站 API 刊例。同一模型另有 GLM Coding Plan 订阅。",
    source: "docs.z.ai", url: "https://docs.z.ai/guides/overview/pricing.md" },
  { vendor: "Z.ai", model: "GLM-5.3-Flash", cur: "USD", apiIn: 0.15, apiOut: 0.5, apiCache: 0.03,
    note: "Z.ai 国际站 API 刊例。缓存输入 $0.03。",
    source: "docs.z.ai", url: "https://docs.z.ai/guides/overview/pricing.md" },
  { vendor: "智谱 BigModel", model: "GLM-5.3", cur: "CNY", apiIn: 8, apiOut: 28, apiCache: 2,
    note: "智谱开放平台 API 刊例。同一模型另有 GLM Coding Plan。",
    source: "docs.bigmodel.cn", url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
  { vendor: "智谱 BigModel", model: "GLM-5.3-Flash", cur: "CNY", apiIn: 0.8, apiOut: 2.8, apiCache: 0.23,
    note: "智谱开放平台 API 刊例。缓存命中 ¥0.23。",
    source: "docs.bigmodel.cn", url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
  { vendor: "月之暗面 Kimi", model: "Kimi K3", cur: "CNY", apiIn: 20, apiOut: 100, apiCache: 2,
    note: "开放平台按量。缓存写入另计 ¥20（5 分钟）。另有 Kimi Code Plan，额度未公布。",
    source: "platform.kimi.com", url: "https://platform.kimi.com/docs/pricing/chat.md" },
  { vendor: "月之暗面 Kimi", model: "Kimi K2.7-Code", cur: "CNY", apiIn: 6.5, apiOut: 27, apiCache: 1.3,
    note: "开放平台编程模型按量。高速版约为两倍：输入 ¥13 / 输出 ¥54 / 缓存 ¥2.6。",
    source: "platform.kimi.com", url: "https://platform.kimi.com/" },
  { vendor: "MiniMax", model: "MiniMax-M3", cur: "CNY", apiIn: 2.1, apiOut: 8.4, apiCache: 0.42,
    note: "≤512K 输入档、永久五折后的价（划线 ¥4.20 / ¥16.80 / 缓存 ¥0.84）。超过 512K 为 ¥4.20 / ¥16.80。另有 Token Plan。",
    source: "platform.minimax.cn", url: "https://platform.minimax.cn/docs/guides/pricing-paygo.md" },
  { vendor: "阿里云百炼", model: "qwen3-coder-plus", cur: "CNY", apiIn: 4, apiOut: 16, apiCache: 0.8,
    note: "≤32K 档、隐式缓存。32K–128K 为 ¥6 / ¥24 / 缓存 ¥1.2；256K–1M 输出 ¥200。另有百炼 Coding Plan。",
    source: "help.aliyun.com", url: "https://help.aliyun.com/zh/model-studio/qwen3-coder-plus" },
];

/* ============================================================
 * 额度深度对比原始数据（METRICS_RAW）
 * 用于计算 TPS / 5h·周·月 的 tokens、额度价值、额度倍率
 *
 * 计算方法（app.js 中实现）：
 *   有效输入价 = 0.95 × cacheHit + 0.05 × apiIn   （95% 缓存命中）
 *   均价/M    = 0.8 × 有效输入价 + 0.2 × apiOut    （80%输入/20%输出）
 *   5h tokens / 周 tokens / 月 tokens：
 *     官方周 tokens：5h = 周 / 5，月 = 周 × 4.33
 *     请求数制：分别采用 reqPer5h、reqPerWk、reqPerMo；有月上限时不再用周 × 4.33
 *   额度价值  = tokens(M) × 均价
 *   额度倍率  = 该时段额度价值 / (月费 × 该时段占月比例)
 *   credits 且写了 apiIn/apiOut/apiCache：月 tokens = 额度面值 ÷ 均价，再均摊到周
 *     （面值仍按官方 credits；tokens 是牌价折算，不是官方配额；月池不能推出5h上限）
 *     5h 占比 = 1 / (4.33 × 5)，周占比 = 1 / 4.33，月占比 = 1
 *
 * 价格与币种（priceM/cur）经 ref 字段引用 PLANS 中对应计划（单一数据源）：
 * 改价只改 PLANS；ref 无法解析时页面告警并跳过该行，不中断其余区块。
 * ============================================================ */
const METRICS_RAW = [
  /* ---- 智谱 BigModel V3（2026-07-30 新版积分制） ----
     weeklyChart: false —— 国内 BigModel 与 Z.ai 同代 GLM 套餐公布的是同一组每周 tokens，
     每周 tokens 图只画 Z.ai 一遍；额度深度对比表不受此标记影响。 */
  { vendor: "智谱 BigModel", plan: "GLM Coding V3 Lite", ver: "V3", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0157",
    weeklyChart: false,
    wkLowM: 15.7035, wkHighM: 31.407, vendorWkLowM: 48, vendorWkHighM: 104,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "系数折算：每周 10,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 48–104M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V3 Pro", ver: "V3", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0158",
    weeklyChart: false,
    wkLowM: 94.2211, wkHighM: 188.4422, vendorWkLowM: 290, vendorWkHighM: 627,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "系数折算：每周 60,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 290–627M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V3 Pro", ver: "V3", model: "GLM-5.3-Flash",
    region: "cn",
    ref: "plan-0158",
    weeklyChart: false,
    wkLowM: 283.3396, wkHighM: 566.6793, vendorWkLowM: 877, vendorWkHighM: 1901,
    apiIn: 0.8, apiOut: 2.8, apiCache: 0.23,
    tps: "~300(估)", source: "docs.bigmodel.cn",
    note: "系数折算：每周 60,000 积分 ÷ 每百万 tokens 211.76 积分（GLM-5.3-Flash 抵扣系数 输入/缓存/输出 2.3 / 0.56 / 8，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 877–1,901M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V3 Max", ver: "V3", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0159",
    weeklyChart: false,
    wkLowM: 219.8492, wkHighM: 439.6985, vendorWkLowM: 676, vendorWkHighM: 1463,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "系数折算：每周 140,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 676–1,463M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V3 Max", ver: "V3", model: "GLM-5.3-Flash",
    region: "cn",
    ref: "plan-0159",
    weeklyChart: false,
    wkLowM: 661.1258, wkHighM: 1322.2516, vendorWkLowM: 2047, vendorWkHighM: 4433,
    apiIn: 0.8, apiOut: 2.8, apiCache: 0.23,
    tps: "~300(估)", source: "docs.bigmodel.cn",
    note: "系数折算：每周 140,000 积分 ÷ 每百万 tokens 211.76 积分（GLM-5.3-Flash 抵扣系数 输入/缓存/输出 2.3 / 0.56 / 8，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 2,047–4,433M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },

  /* ---- 智谱 BigModel V2（老用户续费价；额度按 prompt 次数，不同于 V3 积分） ---- */
  { vendor: "智谱 BigModel", plan: "GLM Coding V2 Lite(老用户)", ver: "V2", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0154",
    weeklyChart: false,
    reqPer5h: 80, reqPerWk: 400,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "V2 老用户档按官方 prompt 次数计（每 5 小时约 80 次、每周约 400 次），按页面统一的每次请求 tokens 折算，与 V3 积分额度不同" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V2 Pro(老用户)", ver: "V2", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0155",
    weeklyChart: false,
    reqPer5h: 400, reqPerWk: 2000,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "V2 老用户档按官方 prompt 次数计（每 5 小时约 400 次、每周约 2,000 次），按页面统一的每次请求 tokens 折算，与 V3 积分额度不同" },
  { vendor: "智谱 BigModel", plan: "GLM Coding V2 Max(老用户)", ver: "V2", model: "GLM-5.3",
    region: "cn",
    ref: "plan-0156",
    weeklyChart: false,
    reqPer5h: 1600, reqPerWk: 8000,
    apiIn: 8, apiOut: 28, apiCache: 2,
    tps: "~150(估)", source: "docs.bigmodel.cn",
    note: "V2 老用户档按官方 prompt 次数计（每 5 小时约 1,600 次、每周约 8,000 次），按页面统一的每次请求 tokens 折算，与 V3 积分额度不同" },

  /* ---- Z.ai V3（积分制，USD） ---- */
  { vendor: "Z.ai", plan: "GLM Coding V3 Lite", ver: "V3", model: "GLM-5.3",
    region: "intl",
    ref: "plan-0031",
    wkLowM: 15.7035, wkHighM: 31.407, vendorWkLowM: 48, vendorWkHighM: 104,
    apiIn: 1.4, apiOut: 4.4, apiCache: 0.26,
    tps: "~150(估)", source: "docs.z.ai",
    note: "系数折算：每周 10,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 48–104M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "Z.ai", plan: "GLM Coding V3 Pro", ver: "V3", model: "GLM-5.3",
    region: "intl",
    ref: "plan-0032",
    wkLowM: 94.2211, wkHighM: 188.4422, vendorWkLowM: 290, vendorWkHighM: 627,
    apiIn: 1.4, apiOut: 4.4, apiCache: 0.26,
    tps: "~150(估)", source: "docs.z.ai",
    note: "系数折算：每周 60,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 290–627M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "Z.ai", plan: "GLM Coding V3 Pro", ver: "V3", model: "GLM-5.3-Flash",
    region: "intl",
    ref: "plan-0032",
    wkLowM: 283.3396, wkHighM: 566.6793, vendorWkLowM: 877, vendorWkHighM: 1901,
    apiIn: 0.15, apiOut: 0.50, apiCache: 0.03,
    tps: "~300(估)", source: "docs.z.ai",
    note: "系数折算：每周 60,000 积分 ÷ 每百万 tokens 211.76 积分（GLM-5.3-Flash 抵扣系数 输入/缓存/输出 2.3 / 0.56 / 8，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 877–1,901M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "Z.ai", plan: "GLM Coding V3 Max", ver: "V3", model: "GLM-5.3",
    region: "intl",
    ref: "plan-0033",
    wkLowM: 219.8492, wkHighM: 439.6985, vendorWkLowM: 676, vendorWkHighM: 1463,
    apiIn: 1.4, apiOut: 4.4, apiCache: 0.26,
    tps: "~150(估)", source: "docs.z.ai",
    note: "系数折算：每周 140,000 积分 ÷ 每百万 tokens 636.8 积分（GLM-5.3 抵扣系数 输入/缓存/输出 6.9 / 1.7 / 24，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 676–1,463M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },
  { vendor: "Z.ai", plan: "GLM Coding V3 Max", ver: "V3", model: "GLM-5.3-Flash",
    region: "intl",
    ref: "plan-0033",
    wkLowM: 661.1258, wkHighM: 1322.2516, vendorWkLowM: 2047, vendorWkHighM: 4433,
    apiIn: 0.15, apiOut: 0.50, apiCache: 0.03,
    tps: "~300(估)", source: "docs.z.ai",
    note: "系数折算：每周 140,000 积分 ÷ 每百万 tokens 211.76 积分（GLM-5.3-Flash 抵扣系数 输入/缓存/输出 2.3 / 0.56 / 8，按 95% 缓存、80/20）；上限按非高峰积分 5 折。官方另给出按其自身用量假设的 2,047–4,433M/周 估算，只在每周 tokens 图展示，不用于排行和推荐" },

  /* ---- MiniMax Token Plan（第三方估算 tokens，按 M3 计） ---- */
  { vendor: "MiniMax", plan: "Token Plan Plus", ver: "—", model: "MiniMax-M3",
    region: "cn",
    ref: "plan-0164",
    wkLowM: 138, wkHighM: 138,
    apiIn: 2.1, apiOut: 8.4, apiCache: 0.42,
    tps: "~200(估)", source: "platform.minimax.cn(第三方估算)",
    note: "tokens 为第三方估算(约6亿/月÷4.33)" },
  { vendor: "MiniMax", plan: "Token Plan Max", ver: "—", model: "MiniMax-M3",
    region: "cn",
    ref: "plan-0165",
    wkLowM: 416, wkHighM: 416,
    apiIn: 2.1, apiOut: 8.4, apiCache: 0.42,
    tps: "~200(估)", source: "platform.minimax.cn(第三方估算)",
    note: "tokens 为第三方估算(约18亿/月÷4.33)" },
  { vendor: "MiniMax", plan: "Token Plan Ultra", ver: "—", model: "MiniMax-M3",
    region: "cn",
    ref: "plan-0166",
    wkLowM: 1640, wkHighM: 1640,
    apiIn: 2.1, apiOut: 8.4, apiCache: 0.42,
    tps: "~200(估)", source: "platform.minimax.cn(第三方估算)",
    note: "tokens 为第三方估算(约71亿/月÷4.33)" },

  /* ---- 小米 Token Plan：官方每 token Credits 系数 × 按量刊例。夜间 0.8 倍未计入 ---- */
  { vendor: "小米 MiMo", plan: "Token Plan Lite", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0167",
    wkLowM: 20.8015, wkHighM: 20.8015,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：41 亿 Credits ÷（缓存 2 / 未命中 100 / 输出 200 Credits 每 token），按 95% 缓存、80/20 摊到周。未计夜间 0.8 倍。v2.5 系数相同、2026-10-21 下线，不单列" },
  { vendor: "小米 MiMo", plan: "Token Plan Lite", ver: "—", model: "mimo-v2.6-pro",
    region: "cn", ref: "plan-0167",
    wkLowM: 7.0716, wkHighM: 7.0716,
    apiIn: 3, apiOut: 6, apiCache: 0.025,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：同一 41 亿 Credits 池，pro 系数为缓存 2.5 / 未命中 300 / 输出 600。与 flash 行额度价值相同、tokens 更少" },
  { vendor: "小米 MiMo", plan: "Token Plan Standard", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0168",
    wkLowM: 55.8088, wkHighM: 55.8088,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：110 亿 Credits，flash 系数同 Lite" },
  { vendor: "小米 MiMo", plan: "Token Plan Standard", ver: "—", model: "mimo-v2.6-pro",
    region: "cn", ref: "plan-0168",
    wkLowM: 18.9725, wkHighM: 18.9725,
    apiIn: 3, apiOut: 6, apiCache: 0.025,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：110 亿 Credits，pro 系数同 Lite" },
  { vendor: "小米 MiMo", plan: "Token Plan Pro", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0169",
    wkLowM: 192.7940, wkHighM: 192.7940,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：380 亿 Credits，flash 系数同 Lite" },
  { vendor: "小米 MiMo", plan: "Token Plan Pro", ver: "—", model: "mimo-v2.6-pro",
    region: "cn", ref: "plan-0169",
    wkLowM: 65.5413, wkHighM: 65.5413,
    apiIn: 3, apiOut: 6, apiCache: 0.025,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：380 亿 Credits，pro 系数同 Lite" },
  { vendor: "小米 MiMo", plan: "Token Plan Max", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0170",
    wkLowM: 416.0291, wkHighM: 416.0291,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：820 亿 Credits，flash 系数同 Lite" },
  { vendor: "小米 MiMo", plan: "Token Plan Max", ver: "—", model: "mimo-v2.6-pro",
    region: "cn", ref: "plan-0170",
    wkLowM: 141.4312, wkHighM: 141.4312,
    apiIn: 3, apiOut: 6, apiCache: 0.025,
    tps: "未公布", source: "mimo.mi.com Token Plan / 按量",
    note: "系数折算：820 亿 Credits，pro 系数同 Lite" },

  /* ---- 腾讯云通用 Token Plan：2026-09-30 积分系数。只列 mimo-v2.6-flash 与 hy4-preview ---- */
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Lite", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0174",
    wkLowM: 18.0901, wkHighM: 18.0901,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：780 积分 ÷（未命中 21.875 / 输出 43.75 / 缓存 0.438，按每百万 tokens），95% 缓存、80/20。牌价用小米按量刊例" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Lite", ver: "—", model: "hy4-preview",
    region: "cn", ref: "plan-0174",
    wkLowM: 2.0388, wkHighM: 2.0388,
    apiIn: 6, apiOut: 18, apiCache: 0.3,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：780 积分 ÷（未命中 130.313 / 输出 390.781 / 缓存 6.563）。牌价为 TokenHub 刊例" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Standard", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0175",
    wkLowM: 45.9209, wkHighM: 45.9209,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：1980 积分，mimo-v2.6-flash 系数同 Lite" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Standard", ver: "—", model: "hy4-preview",
    region: "cn", ref: "plan-0175",
    wkLowM: 5.1753, wkHighM: 5.1753,
    apiIn: 6, apiOut: 18, apiCache: 0.3,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：1980 积分，hy4-preview 系数同 Lite" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Pro", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0176",
    wkLowM: 138.6904, wkHighM: 138.6904,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：5980 积分，mimo-v2.6-flash 系数同 Lite" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Pro", ver: "—", model: "hy4-preview",
    region: "cn", ref: "plan-0176",
    wkLowM: 15.6306, wkHighM: 15.6306,
    apiIn: 6, apiOut: 18, apiCache: 0.3,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：5980 积分，hy4-preview 系数同 Lite" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Max", ver: "—", model: "mimo-v2.6-flash",
    region: "cn", ref: "plan-0177",
    wkLowM: 277.8446, wkHighM: 277.8446,
    apiIn: 1, apiOut: 2, apiCache: 0.02,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：11980 积分，mimo-v2.6-flash 系数同 Lite" },
  { vendor: "腾讯云 TokenHub", plan: "通用 Token Plan Max", ver: "—", model: "hy4-preview",
    region: "cn", ref: "plan-0177",
    wkLowM: 31.3134, wkHighM: 31.3134,
    apiIn: 6, apiOut: 18, apiCache: 0.3,
    tps: "未公布", source: "TokenHub 积分抵扣规则 2026-09-30",
    note: "系数折算：11980 积分，hy4-preview 系数同 Lite" },

  /* ---- 请求数制计划（估算 tokens：按~20K tokens/请求；牌价按模型拆开） ----
   * 腾讯云 Coding Plan 旧文档仍列 HY 2.0。额度表改用 TokenHub 现售 Hy3 / Hy4-preview。
   * DeepSeek、qwen3.8-flash-next 若套餐模型列表未列，note 以「对照：」开头，只做同一额度的牌价对照。 */
  { vendor: "腾讯云（LKEAP 知识引擎）", plan: "腾讯云 Coding Plan Pro", ver: "—", model: "hy3",
    region: "cn",
    ref: "plan-0203",
    reqPer5h: 6000, reqPerWk: 45000, reqPerMo: 90000,
    apiIn: 1, apiOut: 4, apiCache: 0.25,
    tps: "未公布", source: "cloud.tencent.com TokenHub 模型价格",
    note: "HY2 已退出对照。牌价为 TokenHub Hy3 刊例 ¥1/¥4、缓存 ¥0.25；Coding Plan 旧文档仍写 HY 2.0 Instruct。按~20K tokens/请求估算" },
  { vendor: "腾讯云（LKEAP 知识引擎）", plan: "腾讯云 Coding Plan Pro", ver: "—", model: "hy4-preview",
    region: "cn",
    ref: "plan-0203",
    reqPer5h: 6000, reqPerWk: 45000, reqPerMo: 90000,
    apiIn: 6, apiOut: 18, apiCache: 0.3,
    tps: "未公布", source: "cloud.tencent.com TokenHub 模型价格",
    note: "同一请求额度按 Hy4-preview 刊例 ¥6/¥18、缓存 ¥0.3 估价。CodeBuddy 已上 Hy4 preview；旧 Coding Plan 文档未列此 ID" },
  { vendor: "腾讯云（LKEAP 知识引擎）", plan: "腾讯云 Coding Plan Pro", ver: "—", model: "deepseek-v4.1-flash",
    region: "cn",
    ref: "plan-0203",
    reqPer5h: 6000, reqPerWk: 45000, reqPerMo: 90000,
    apiIn: 1, apiOut: 4, apiCache: 0.02,
    tps: "未公布", source: "api-docs.deepseek.com",
    note: "对照：Coding Plan 文档模型列表无 DeepSeek。闲时官价缓存 ¥0.02 / 未命中 ¥1 / 输出 ¥4（高峰翻倍，约等于 $0.003/$0.15/$0.60）。TokenHub 原厂直供闲时为 ¥0.05/¥1.5/¥4.5，高于官价" },
  { vendor: "阿里云百炼", plan: "Coding Plan Pro（限量抢购）", ver: "—", model: "qwen3.7-plus",
    region: "cn",
    ref: "plan-0209",
    reqPer5h: 6000, reqPerWk: 45000, reqPerMo: 90000,
    apiIn: 2.15, apiOut: 8.59, apiCache: 0.43,
    tps: "未公布", source: "openrouter.ai/qwen/qwen3.7-plus",
    note: "套餐推荐模型。OpenRouter 挂牌 $0.32/$1.28、缓存 $0.064，按 6.71 折人民币；百炼国内刊例未写入本行。按~20K tokens/请求估算" },
  { vendor: "阿里云百炼", plan: "Coding Plan Pro（限量抢购）", ver: "—", model: "qwen3.8-flash-next",
    region: "cn",
    ref: "plan-0209",
    reqPer5h: 6000, reqPerWk: 45000, reqPerMo: 90000,
    apiIn: 0.8, apiOut: 2.7, apiCache: 0.1,
    tps: "未公布", source: "help.aliyun.com qwen3.8-flash",
    note: "对照：Coding Plan 列表无此模型。线上计费 ID 为 qwen3.8-flash（开放权重名 Flash-Next），华北2 刊例 ¥0.8/¥2.7、缓存 ¥0.1。同一请求额度的牌价对照" },

  /* ---- Command Code：官网按模型给 credits 上限，牌价取官方或 OpenRouter 挂牌（输入/输出/缓存） ---- */
  { vendor: "Command Code", plan: "Go", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl", ref: "plan-0068", creditUSD: 10,
    apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "commandcode.ai/pricing + DeepSeek 官价",
    note: "月池 $10 credits，按 DeepSeek 闲时官价折 tokens（高峰翻倍）。官网未单列 Go 档的逐模型上限" },
  { vendor: "Command Code", plan: "Go", ver: "—", model: "qwen3.8-flash-next",
    region: "intl", ref: "plan-0068", creditUSD: 10,
    apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter qwen/qwen3.8-flash",
    note: "月池 $10。托管 ID qwen3.8-flash；OpenRouter/QwenCloud $0.15/$0.47，缓存读 $0.016、写 $0.20" },
  { vendor: "Command Code", plan: "Go", ver: "—", model: "hy3",
    region: "intl", ref: "plan-0068", creditUSD: 10,
    apiIn: 0.132, apiOut: 0.528, apiCache: 0.033,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter tencent/hy3",
    note: "月池 $10。OpenRouter Hy3 挂牌；腾讯云刊例为 ¥1/¥4、缓存 ¥0.25" },
  { vendor: "Command Code", plan: "GOAT", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl", ref: "plan-0069", creditUSD: 60,
    apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "commandcode.ai/pricing",
    note: "官网写明 $60 on DeepSeek V4.1 Flash（共享月池 $70）。按闲时官价折 tokens" },
  { vendor: "Command Code", plan: "GOAT", ver: "—", model: "qwen3.8-flash-next",
    region: "intl", ref: "plan-0069", creditUSD: 70,
    apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter",
    note: "官网点名的是 $70 on Qwen 3.8 27B，不是 Flash。本行用 Flash-Next 线上价，从同一 $70 月池折 tokens" },
  { vendor: "Command Code", plan: "GOAT", ver: "—", model: "hy3",
    region: "intl", ref: "plan-0069", creditUSD: 70,
    apiIn: 0.132, apiOut: 0.528, apiCache: 0.033,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter tencent/hy3",
    note: "官网写明 $70 on Tencent Hy3。牌价用 OpenRouter 挂牌，不是腾讯云人民币刊例" },
  { vendor: "Command Code", plan: "Pro", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl", ref: "plan-0070", creditUSD: 80,
    apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "commandcode.ai/pricing + DeepSeek 官价",
    note: "月池 $80 credits。该档未单列 DeepSeek 上限，按整池、闲时官价折算" },
  { vendor: "Command Code", plan: "Pro", ver: "—", model: "qwen3.8-flash-next",
    region: "intl", ref: "plan-0070", creditUSD: 80,
    apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter",
    note: "月池 $80。qwen3.8-flash 挂牌 $0.15/$0.47、缓存 $0.016" },
  { vendor: "Command Code", plan: "Pro", ver: "—", model: "hy3",
    region: "intl", ref: "plan-0070", creditUSD: 80,
    apiIn: 0.132, apiOut: 0.528, apiCache: 0.033,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter tencent/hy3",
    note: "月池 $80。OpenRouter Hy3 $0.132/$0.528、缓存 $0.033" },
  { vendor: "Command Code", plan: "Max 10×", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl", ref: "plan-0071", creditUSD: 150,
    apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "commandcode.ai/pricing + DeepSeek 官价",
    note: "月池 $150。官网此档点名的是 Qwen 3.7 Max / MiniMax M3 各 $300 deals，DeepSeek 按整池闲时官价折算" },
  { vendor: "Command Code", plan: "Max 10×", ver: "—", model: "qwen3.8-flash-next",
    region: "intl", ref: "plan-0071", creditUSD: 150,
    apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter",
    note: "月池 $150。Flash-Next 线上价；不是官网写的 Qwen 3.7 Max deals" },
  { vendor: "Command Code", plan: "Max 10×", ver: "—", model: "hy3",
    region: "intl", ref: "plan-0071", creditUSD: 150,
    apiIn: 0.132, apiOut: 0.528, apiCache: 0.033,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter tencent/hy3",
    note: "月池 $150。OpenRouter Hy3 挂牌" },
  { vendor: "Command Code", plan: "Max 20×", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl", ref: "plan-0072", creditUSD: 300,
    apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "commandcode.ai/pricing + DeepSeek 官价",
    note: "月池 $300。按 DeepSeek 闲时官价折 tokens" },
  { vendor: "Command Code", plan: "Max 20×", ver: "—", model: "qwen3.8-flash-next",
    region: "intl", ref: "plan-0072", creditUSD: 300,
    apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter",
    note: "月池 $300。qwen3.8-flash 挂牌" },
  { vendor: "Command Code", plan: "Max 20×", ver: "—", model: "hy3",
    region: "intl", ref: "plan-0072", creditUSD: 300,
    apiIn: 0.132, apiOut: 0.528, apiCache: 0.033,
    tps: "未公布", source: "commandcode.ai/pricing + OpenRouter tencent/hy3",
    note: "月池 $300。OpenRouter Hy3 挂牌" },

  /* ---- 2026-09 增补：模糊「混合」改为有挂牌的具体模型 ---- */
  { vendor: "Canopy Wave", plan: "Coding Plan Pro Bundle", ver: "—", model: "Kimi-K2.6",
    region: "intl",
    ref: "plan-0088",
    reqPerWk: 2310, reqPerMo: 10000,
    apiIn: 0.65, apiOut: 3.41, apiCache: 0.15,
    tps: "未公布", source: "openrouter.ai/moonshotai/kimi-k2.6",
    note: "500 请求/天、10,000/月。OpenRouter 挂牌 $0.65/$3.41、缓存 $0.15；Canopy 自身未公开逐模型价" },
  { vendor: "Canopy Wave", plan: "Coding Plan Pro Bundle", ver: "—", model: "GLM-5.2",
    region: "intl",
    ref: "plan-0088",
    reqPerWk: 2310, reqPerMo: 10000,
    apiIn: 0.3, apiOut: 3.99, apiCache: 0.24,
    tps: "未公布", source: "openrouter.ai/z-ai/glm-5.2",
    note: "OpenRouter GLM-5.2 挂牌 $0.30/$3.99、缓存 $0.24，低于 Z.ai 刊例，按中转挂牌计" },
  { vendor: "Canopy Wave", plan: "Coding Plan Pro Bundle", ver: "—", model: "MiMo-V2.5",
    region: "intl",
    ref: "plan-0088",
    reqPerWk: 2310, reqPerMo: 10000,
    apiIn: 0.14, apiOut: 0.28, apiCache: 0.0028,
    tps: "未公布", source: "openrouter.ai/xiaomi/mimo-v2.5",
    note: "OpenRouter xiaomi/mimo-v2.5 挂牌 $0.14/$0.28、缓存 $0.0028" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Mini", ver: "—", model: "step-3.7-flash",
    region: "cn",
    ref: "plan-0084",
    creditCNY: 400, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27,
    tps: "未公布", source: "platform.stepfun.com",
    note: "月池 400M Credit（1M Credit=¥1）。tokens 按 step-3.7-flash 刊例折算，不是未公布的套餐系数" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Mini", ver: "—", model: "step-5-preview",
    region: "cn",
    ref: "plan-0084",
    creditCNY: 400, apiIn: 7, apiOut: 20, apiCache: 0.35,
    tps: "未公布", source: "platform.stepfun.com",
    note: "同一 400M Credit，按 step-5-preview 刊例 ¥7/¥20、缓存 ¥0.35 折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Plus", ver: "—", model: "step-3.7-flash",
    region: "cn",
    ref: "plan-0085",
    creditCNY: 1600, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27,
    tps: "未公布", source: "platform.stepfun.com",
    note: "月池 1,600M Credit，按 step-3.7-flash 刊例折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Plus", ver: "—", model: "step-5-preview",
    region: "cn",
    ref: "plan-0085",
    creditCNY: 1600, apiIn: 7, apiOut: 20, apiCache: 0.35,
    tps: "未公布", source: "platform.stepfun.com",
    note: "同一 1,600M Credit，按 step-5-preview 刊例折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Pro", ver: "—", model: "step-3.7-flash",
    region: "cn",
    ref: "plan-0086",
    creditCNY: 8000, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27,
    tps: "未公布", source: "platform.stepfun.com",
    note: "月池 8,000M Credit，按 step-3.7-flash 刊例折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Pro", ver: "—", model: "step-5-preview",
    region: "cn",
    ref: "plan-0086",
    creditCNY: 8000, apiIn: 7, apiOut: 20, apiCache: 0.35,
    tps: "未公布", source: "platform.stepfun.com",
    note: "同一 8,000M Credit，按 step-5-preview 刊例折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Max", ver: "—", model: "step-3.7-flash",
    region: "cn",
    ref: "plan-0087",
    creditCNY: 40000, apiIn: 1.35, apiOut: 8.1, apiCache: 0.27,
    tps: "未公布", source: "platform.stepfun.com",
    note: "月池 40,000M Credit，按 step-3.7-flash 刊例折 tokens" },
  { vendor: "阶跃星辰 StepFun", plan: "Step Plan Flash Max", ver: "—", model: "step-5-preview",
    region: "cn",
    ref: "plan-0087",
    creditCNY: 40000, apiIn: 7, apiOut: 20, apiCache: 0.35,
    tps: "未公布", source: "platform.stepfun.com",
    note: "同一 40,000M Credit，按 step-5-preview 刊例折 tokens" },
  { vendor: "DevPass", plan: "三档月订阅", ver: "—", model: "deepseek-v4.1-flash",
    region: "intl",
    ref: "plan-0066",
    creditUSD: 87, apiIn: 0.15, apiOut: 0.6, apiCache: 0.003,
    tps: "未公布", source: "awesome-ai-coding-subscriptions + DeepSeek 官价",
    note: "$29 档承诺 $87 usage，按 DeepSeek 闲时官价折 tokens。另有 $79→$237、$179→$537；转售第一方模型有封号风险" },
  { vendor: "DevPass", plan: "三档月订阅", ver: "—", model: "qwen3.8-flash-next",
    region: "intl",
    ref: "plan-0066",
    creditUSD: 87, apiIn: 0.15, apiOut: 0.47, apiCache: 0.016,
    tps: "未公布", source: "OpenRouter qwen/qwen3.8-flash",
    note: "同一 $87 usage，按 qwen3.8-flash 挂牌折 tokens。DevPass 未公开自有价目表" },
  { vendor: "DevPass", plan: "三档月订阅", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0066",
    creditUSD: 87, apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", source: "Anthropic 官价",
    note: "同一 $87 usage，按 Claude Sonnet 5 官价 $2/$10、缓存 $0.20 折 tokens。premium 模型另有周公平使用上限" },

  /* ---- GitHub Copilot Pro：1,500 credits = $15，按官方逐模型牌价折算（没有 $1.5/$6 这一档） ---- */
  { vendor: "GitHub Copilot", plan: "Pro", ver: "—", model: "Gemini 3.5 Flash",
    region: "intl",
    ref: "plan-0091",
    creditUSD: 15, apiIn: 1.5, apiOut: 9, apiCache: 0.15,
    tps: "未公布", source: "docs.github.com/copilot models-and-pricing",
    note: "输入 $1.50、缓存 $0.15 是 Gemini 3.5 Flash，输出是 $9 不是 $6。Pro 的 1,500 AI credits = $15，按该牌价折 tokens" },
  { vendor: "GitHub Copilot", plan: "Pro", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0091",
    creditUSD: 15, apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", source: "docs.github.com/copilot models-and-pricing",
    note: "同一 1,500 credits（$15）。Copilot 上 Claude Sonnet 5 为 $2/$10、缓存 $0.20。Pro 不含 Opus、Fable、GPT-6 旗舰" },
];

/* 官方公布「每周可用 tokens 估算」的档位清单（GLM 系列，按使用的模型拆分以便公平对比）
 * model: 估算所用模型（Flash 为轻量高速模型，同积分下 token 更多但产出质量不同）
 * ref:   价格来源 = PLANS 中对应计划（单一数据源；改价只改 PLANS，勿在此重复维护 priceUSD）
 * 本表在 METRICS_RAW 之后定义：lowM/highM 取自同 ref+model 指标行按统一假设折算的 wkLowM/wkHighM，
 * 与排行、额度表和推荐同一口径；vendorLowM/vendorHighM 是厂商按自身用量假设的估算，仅在提示中对照。
 * plan 为图上显示名，url 为官方来源；找不到对应指标行时启动即报错，避免静默缺柱。 */
const PLAN_TOKENS = [
  { plan: "Z.ai Lite", model: "GLM-5.3", ref: "plan-0031", url: "https://docs.z.ai/devpack/overview.md" },
  { plan: "Z.ai Pro", model: "GLM-5.3", ref: "plan-0032", url: "https://docs.z.ai/devpack/overview.md" },
  { plan: "Z.ai Pro", model: "GLM-5.3-Flash", ref: "plan-0032", url: "https://docs.z.ai/devpack/overview.md" },
  { plan: "Z.ai Max", model: "GLM-5.3", ref: "plan-0033", url: "https://docs.z.ai/devpack/transition.md" },
  { plan: "Z.ai Max", model: "GLM-5.3-Flash", ref: "plan-0033", url: "https://docs.z.ai/devpack/transition.md" },
].map((t) => {
  const m = METRICS_RAW.find((x) => x.ref === t.ref && x.model === t.model && x.vendorWkLowM != null);
  if (!m) throw new Error("PLAN_TOKENS 在 METRICS_RAW 中找不到同 ref+model 的官方估算行: " + t.ref + " · " + t.model);
  return { ...t, lowM: m.wkLowM, highM: m.wkHighM, vendorLowM: m.vendorWkLowM, vendorHighM: m.vendorWkHighM, note: m.note };
});

/* ============================================================
 * 社区/推算额度（ESTIMATES）—— 官方未公布具体用量的计划
 * 全部标注 method（估算方法）与 confidence（置信度：高/中/低）
 * wkLowM/wkHighM = 每周可用 tokens 估算区间（百万）；页面中以「≈估」标记
 * priceM/cur 经 ref 字段引用 PLANS 中对应计划（单一数据源）
 * ============================================================ */
const ESTIMATES = [
  { vendor: "讯飞星辰 MaaS", plan: "Astron Coding Plan 高效版", ver: "—", model: "deepseek-v4-flash",
    region: "cn", ref: "plan-0082", isEst: true,
    reqPer5h: 3000, reqPerWk: 22500, reqPerMo: 45000,
    apiIn: 0.15 * RATE_USD_CNY, apiOut: 0.60 * RATE_USD_CNY, apiCache: 0.003 * RATE_USD_CNY,
    tps: "未公布", method: "官方请求上限×模型抵扣＋异版本牌价代理", confidence: "低",
    confidenceReason: "请求上限按讯飞官方模型系数2折算；V4-Flash旧版当前独立牌价未核实，用现售V4.1-Flash牌价仅作价值代理估算。",
    source: "xfyun.cn/doc/spark/CodingPlan.html + api-docs.deepseek.com/quick_start/pricing",
    note: "讯飞官网支持 DeepSeek-V4-Flash，新购模型抵扣系数 2：原额度 6,000/45,000/90,000 分别除以 2，得实际请求 3,000/5h、22,500/周、45,000/月；夜间/周末/节假日再乘 0.8 为额外优惠，未折入本行。约20K tokens/请求仍为通用假设。V4-Flash旧版当前独立牌价未核实，价值以不同版本的现售 DeepSeek Flash（V4.1）低峰 $0.15/$0.60/缓存 $0.003×同日汇率作低置信代理，不能理解为讯飞提供V4.1或旧版准确官价。" },
  { vendor: "Anthropic", plan: "Claude Pro", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0002",
    wkLowM: 5, wkHighM: 20,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~100(估)", method: "实测+反推", confidence: "低",
    note: "社区实测 10–45 prompts/5h（约 30–60K tokens/prompt）；毛利反推 $20×3–10x÷$2.23/M ≈ 27–90M/月，取交集",
    source: "portkey.ai / morphllm.com" },
  { vendor: "Anthropic", plan: "Claude Max 5x", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0003",
    wkLowM: 25, wkHighM: 100,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~100(估)", method: "倍率推算", confidence: "低",
    note: "官方口径 5× Pro 用量，按 Pro 估算区间等比放大",
    source: "claude.com/pricing" },
  { vendor: "Anthropic", plan: "Claude Max 20x", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0004",
    wkLowM: 100, wkHighM: 400,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~100(估)", method: "倍率推算", confidence: "低",
    note: "官方口径 20× Pro；社区实测约 200–900 prompts/5h",
    source: "portkey.ai" },
  { vendor: "OpenAI", plan: "ChatGPT Plus", ver: "—", model: "GPT-6 Sol",
    region: "intl",
    ref: "plan-0010",
    reqLowPer5h: 15, reqHighPer5h: 150, tokensLowPerReq: 20000, tokensHighPerReq: 40000,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~200(估)", method: "官方区间折算", confidence: "中",
    note: "官方公布 GPT-6 Sol 15–150 条/5h，按每条 20–40K tokens 折算",
    source: "learn.chatgpt.com/docs/pricing" },
  { vendor: "OpenAI", plan: "ChatGPT Plus", ver: "—", model: "GPT-6.1 Sol",
    region: "intl",
    ref: "plan-0010",
    reqLowPer5h: 15, reqHighPer5h: 160, tokensLowPerReq: 20000, tokensHighPerReq: 40000,
    apiIn: 2, apiOut: 10, apiCache: 0.1,
    tps: "~200(估)", method: "官方区间折算", confidence: "中",
    note: "官方公布 GPT-6.1 Sol 15–160 条/5h（2026-09-29 起），按每条 20–40K tokens 折算",
    source: "learn.chatgpt.com/docs/pricing" },
  { vendor: "OpenAI", plan: "ChatGPT Pro（$100）", ver: "—", model: "GPT-6 Sol",
    region: "intl",
    ref: "plan-0011",
    wkLowM: 15, wkHighM: 125,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~200(估)", method: "历史倍率推算", confidence: "低",
    note: "官方页已不再标注 5x 倍率，且 2026-10-01 起注明 Pro 目前无 5 小时上限；本行按此前 5× Plus 口径推算，仅供量级参考",
    source: "learn.chatgpt.com/docs/pricing" },
  { vendor: "OpenAI", plan: "ChatGPT Pro（$200）", ver: "—", model: "GPT-6 Sol",
    region: "intl",
    ref: "plan-0012",
    wkLowM: 60, wkHighM: 500,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "~200(估)", method: "历史倍率推算", confidence: "低",
    note: "同上，按此前 20× Plus 口径推算；官方未公布 $100/$200/$500 间的具体倍率",
    source: "learn.chatgpt.com/docs/pricing" },
  { vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Plus", ver: "—", model: "Kimi K3",
    region: "cn",
    ref: "plan-0161",
    wkLowM: 3, wkHighM: 10,
    apiIn: 20, apiOut: 100, apiCache: 2,
    tps: "~100(估)", method: "毛利反推", confidence: "低",
    note: "官方未公布数值；按 K3 混合价 ¥22.3/M、行业毛利 3–10x 估算",
    source: "kimi.com/code" },
  { vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Pro", ver: "—", model: "Kimi K3",
    region: "cn",
    ref: "plan-0162",
    wkLowM: 6, wkHighM: 20,
    apiIn: 20, apiOut: 100, apiCache: 2,
    tps: "~100(估)", method: "毛利反推", confidence: "低",
    note: "同上",
    source: "kimi.com/code" },
  { vendor: "月之暗面 Kimi", plan: "Kimi Code Plan Max", ver: "—", model: "Kimi K3",
    region: "cn",
    ref: "plan-0163",
    wkLowM: 21, wkHighM: 72,
    apiIn: 20, apiOut: 100, apiCache: 2,
    tps: "~100(估)", method: "毛利反推", confidence: "低",
    note: "同上",
    source: "kimi.com/code" },
  { vendor: "Cognition Devin Desktop", plan: "Pro", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0105",
    wkLowM: 5, wkHighM: 20,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", method: "毛利反推", confidence: "低",
    note: "每日/每周配额制但官方未公布具体数值",
    source: "devin.ai/pricing" },
  { vendor: "Google", plan: "Google AI Pro", ver: "—", model: "Gemini 3.1 Pro",
    region: "intl",
    ref: "plan-0017",
    wkLowM: 5, wkHighM: 18,
    apiIn: 2, apiOut: 12, apiCache: 0.2,
    tps: "~150(估)", method: "毛利反推", confidence: "低",
    note: "官方仅称 4× Gemini 访问；按 Gemini 3.1 Pro 混合价 $2.63/M 估算",
    source: "one.google.com" },
  { vendor: "Factory (Droid)", plan: "Droid Pro", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0079",
    wkLowM: 2.3, wkHighM: 2.3,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", method: "第三方评测折算", confidence: "低",
    note: "官方仅给相对倍数；第三方评测口径 Pro ≈ 10M tokens/月（另有 bonus）",
    source: "factory.com/pricing" },
  { vendor: "Factory (Droid)", plan: "Droid Plus", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0080",
    wkLowM: 11.5, wkHighM: 11.5,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", method: "倍率推算", confidence: "低",
    note: "官方口径 ≈ 5× Pro",
    source: "factory.com/pricing" },
  { vendor: "Factory (Droid)", plan: "Droid Max", ver: "—", model: "Claude Sonnet 5",
    region: "intl",
    ref: "plan-0081",
    wkLowM: 23, wkHighM: 23,
    apiIn: 2, apiOut: 10, apiCache: 0.2,
    tps: "未公布", method: "倍率推算", confidence: "低",
    note: "官方口径 ≈ 10× Pro",
    source: "factory.com/pricing" },
];


/* date 是来源写明的发生日。checked 表示这只是本站核对到该状态的日子，不是公告日。 */
const DYNAMICS = [
  { date: "2026-10-07", text: "Anthropic 发布 Claude Haiku 5.5，面向高频、低成本任务，也可作为编程子 Agent；同日宣布 Sonnet 5.5 缓存读取价格减半，以及 Max / Team 订阅按月 API 赠额（逐步开放）。具体计费门槛与赠额资格以官方文档为准。", source: "Anthropic 官方发布博客", url: "https://www.anthropic.com/claude-haiku-5-5" },
  { date: "2026-10-06", text: "Mistral 发布 Large 4 公开预览，可通过 Mistral Studio 的预览 API 使用，支持编程、Agent 与多模态任务。官方计划于 10 月底发布权重；当前仍为预览阶段。", source: "Mistral 官方发布博客", url: "https://mistral.ai/news/mistral-large-4/" },
  { date: "2026-06-01", text: "GitHub Copilot 以「AI Credits」（1 credit = $0.01）全面取代 premium requests，并新增 $100/月的个人 Max 档。", source: "GitHub Docs", url: "https://docs.github.com/en/copilot/get-started/plans" },
  { date: "2026-03", text: "Windsurf 被 Cognition 收购并更名为 Devin Desktop，2026 年 3 月起从 prompt credits 改为每日/每周配额制，与 Devin 共用 Free / Pro $20 / Max $200 档位体系。", source: "Devin Docs", url: "https://docs.devin.ai/desktop/accounts/quota.md" },
  { date: "2026-06", text: "Cursor 改为双池用量体系（Cursor Models 池 + Other Models 池），不再公布固定 credits 数；Teams 新增 $120 Premium 席位。", source: "Cursor Docs", url: "https://cursor.com/docs/models-and-pricing.md" },
  { date: "2026-05-19", text: "Google 于 I/O 2026（5 月 19 日）重构订阅档位：AI Plus $7.99 / AI Pro $19.99 / AI Ultra 从 $249.99 降至 $99.99 起，且改为按计算量计费。", source: "The Verge", url: "https://www.theverge.com/tech/933233/google-ai-ultra-plan-price-change" },
  { date: "2026-09-23", checked: true, text: "OpenAI ChatGPT Pro 拆分为 $100（5x）/ $200（20x）双档；Codex 官方公布每 5 小时本地消息估算区间（Plus 用 GPT-6 Sol 约 15–150 条/5h）。", source: "OpenAI Codex 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-09-23", checked: true, text: "Anthropic 官方仍不公布 Claude Code 每 5 小时固定 prompt 数（按 token 计量 + 每周双窗口）；Claude Team 新增 $125/席的 Premium 席位；Claude Sonnet 5 API 介绍价 $2/$10 已转为标准价（原定 9 月涨价取消）。", source: "Anthropic 定价文档", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { date: "2026-04-30", text: "Z.ai 旧版 Coding Plan（无每周限额）于 2026-04-30 取消自动续订，新版加入每周 credits 上限；GLM-5.3 API 上 BigModel ¥8/¥28，Z.ai $1.4/$4.4，价差近 4 倍。", source: "Z.ai Docs", url: "https://docs.z.ai/devpack/transition.md" },
  { date: "2026-09-23", checked: true, text: "月之暗面开放平台 platform.moonshot.cn 已 301 迁移至 platform.kimi.com；旗舰 K3 定位「长程编程」，按量计费无订阅制，Kimi K2.7-Code 为当前编程专用模型。", source: "Kimi 开放平台", url: "https://platform.kimi.com/docs/pricing/chat.md" },
  { date: "2026-09-23", checked: true, text: "DeepSeek API 现售模型为 deepseek-flash（V4.1-Flash）与 deepseek-v4-pro（V4-Pro-0813），并改为峰谷分时计价；无订阅计划。", source: "DeepSeek API 文档", url: "https://api-docs.deepseek.com/quick_start/pricing" },
  { date: "2026-05-20", text: "阿里云通义灵码体系升级为 Qoder CN：团队版 ¥99、企业标准版 ¥149、企业专属版 ¥199/人/月（均含 3,000 Credits/人/月），9 月首月买一送一。", source: "阿里云帮助文档", url: "https://help.aliyun.com/zh/lingma/billing-description" },
  { date: "2026-09-23", checked: true, text: "火山引擎推出 doubao-seed-2.0-code 编程模型（¥3.2/¥16），与 doubao-seed-2.0-pro 同价。", source: "火山引擎文档", url: "https://docs.volcengine.com/docs/ark/model-pricing?lang=zh" },
  { date: "2026-09-23", checked: true, text: "AWS Q Developer 保持 Free（50 次 agentic 请求/月）与 Pro $19/用户/月两层，无单独 Enterprise 层。", source: "AWS 官方定价页", url: "https://aws.amazon.com/q/developer/pricing/" },
  { date: "2026-09-23", checked: true, text: "华为云 CodeArts Snap 独立定价页已下线（404），转为限时免费体验；CodeArts 套餐（¥60/200/600/人/月）为 DevOps 全套服务价。", source: "华为云产品页", url: "https://www.huaweicloud.com/product/codearts.html" },
  { date: "2026-09-23", checked: true, text: "Tabnine 独立订阅疑似停售：tabnine.com 整域 301 重定向至母公司 Tricentis 页面。", source: "tabnine.com（301 重定向）", url: "https://www.tabnine.com/pricing" },
  { date: "2026-10-14", text: "GPT-5.5 于 2026-10-14 退役（OpenAI 官方定价文档写明的日期）。", source: "OpenAI Codex 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-07-30", text: "智谱 BigModel 的 GLM Coding Plan 于 2026-07-30 起新用户启用新版积分制：Lite ¥118 / Pro ¥538 / Max ¥1078（连续包月 8 折），每 5 小时 2,000–28,000 积分 + 每周上限；老用户可按 V1/V2 旧价（¥49/149/469）续费。", source: "BigModel 文档", url: "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision" },
  { date: "2026-04-17", text: "Qwen Code CLI 免费层（Qwen OAuth，原每日免费请求）已于 2026-04-15 停止（官方文档确认）；iFlow CLI 已于 2026-04-17 停止服务，官方建议迁移至阿里 Qoder。", source: "Qwen Code 文档 / iFlow 公告", url: "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/" },
  { date: "2026-09-23", checked: true, text: "「积分制」成为国内主流计量方式：通义灵码升级为 Qoder CN（Pro ¥59 起）、阿里百炼推出 Token Plan（¥39 起）与限量 Coding Plan（¥200）、腾讯 CodeBuddy（¥99 起）与腾讯云 LKEAP Coding Plan（¥40 起）、火山方舟 Coding Plan（¥40 起）、字节 Trae 会员（¥49 起）均为积分/次数计量。", source: "coding-plan.org", url: "https://coding-plan.org" },
  { date: "2026-09-23", checked: true, text: "月之暗面推出 Kimi Code Plan：¥99 / ¥199 / ¥699 三档（连续包月价，年付约 ¥79/159/559 折月），三档均可用旗舰 K3（最高 1M 上下文）。", source: "kimi.com/code", url: "https://www.kimi.com/code" },
  { date: "2026-09-30", checked: true, text: "小米 MiMo 官网产品名是 Token Plan（Lite/Standard/Pro/Max ¥39/99/329/659，41/110/380/820 亿 Credits），并公布每 token 的 Credits 系数。上线日未见公告。", source: "mimo.mi.com", url: "https://mimo.mi.com/docs/zh-CN/price/token-plan" },
  { date: "2026-09-30", checked: true, text: "Z.ai 订阅产品名是 GLM Coding Plan（Lite / Pro / Max），不是 Z.ai Coding。额度表加入官方 API 按量对照：DeepSeek、Z.ai 与智谱 GLM-5.3 / Flash、Kimi K3 与 K2.7-Code、MiniMax-M3、百炼 qwen3-coder-plus。按量行按低峰牌价折成每百万成本后参与排序。", source: "Z.ai / BigModel / Kimi / DeepSeek / MiniMax / 阿里云", url: "https://docs.z.ai/devpack/overview.md" },
  { date: "2026-07-30", text: "GLM Coding Plan 经历 V1→V2→V3 三代：BigModel 侧 V1（2025-09，¥20 起，无周限，已停售）→ V2（2026-02-12，¥49 起，加周限，老用户可续）→ V3（2026-07-30，¥118 起，积分制）。Z.ai 同步：V1 $3/$15 → V3 $18/$72/$160。", source: "BigModel / Z.ai 官方文档", url: "https://docs.bigmodel.cn/cn/coding-plan/overview" },
  { date: "2026-09-24", checked: true, text: "OpenCode（开源终端 agent）推出 Go 订阅（$10/月，逐模型月度美元上限）与 Zen 按量网关（零加价 per-token）；Zen 余额低于 $5 自动续充 $20。", source: "OpenCode 官方文档", url: "https://opencode.ai/docs/go/" },
  { date: "2026-09-24", checked: true, text: "Command Code（旧金山，$5M 种子轮）推出终端编程 agent：$1 Go 档（含 $10 credits）到 $200 Max 20×（含 $300 credits）六档，另按 OpenAI/Anthropic 兼容 API 提供 Provider（$15/月）。", source: "commandcode.ai", url: "https://commandcode.ai/pricing" },
  { date: "2026-09-24", checked: true, text: "新玩家 9 月集中入场：AWS Kiro（$0–200 五档 credits 制）、Factory Droid（$20–200 滚动限额，9 月以 $5B 估值融资 $2 亿）、讯飞 Astron Coding Plan（¥199/999 请求制）、阶跃 Step Plan（¥49–699 月池 Credit 制）、Canopy Wave（$30 请求制聚合）；七牛云 Coding Plan 停售转向 Token Plan 按量。", source: "各官方定价页", url: "https://kiro.dev/pricing" },
  { date: "2026-09-02", text: "智谱 9/2 入驻天猫开官方旗舰店售 GLM Coding Plan（价格与官网一致）；同期 GLM-5.3-Flash 开源并上调 API 刊例价（输入 ¥9 / 输出 ¥21.9 每百万 tokens）。", source: "新浪财经 / 智谱公告", url: "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision" },
  { date: "2026-09-11", text: "月之暗面 9/11 发布 Kimi K2.8 Preview 并全量上线 Kimi Code/Work，原 kimi-for-coding 模型无感升级（百万上下文）；K3 API 8 月提价超 3.5 倍；7/19 曾因算力紧张暂停 C 端新订阅。", source: "月之暗面官方", url: "https://platform.kimi.com/docs/pricing/chat.md" },
  { date: "2026-09-14", text: "GitHub Copilot 6/1 起全面转为用量计费，9/14 宣布 Auto 模型选择分三档（Efficiency/Balance/Power），部分模型降至约 $0.20/百万 tokens。", source: "github.blog", url: "https://github.blog" },
  { date: "2026-06-18", text: "Google 6/18 起 Antigravity CLI 取代个人版 Gemini CLI；AI Ultra 确认为 $99.99（5x）/$199.99（20x）双档；Sourcegraph Cody 个人版已于 2025-07 停售，仅随企业平台销售。", source: "Google AI Plans", url: "https://one.google.com/intl/en_us/about/google-ai-plans" },
  { date: "2026-09-28", checked: true, text: "第三方中转站行业转向：从订阅套餐转为「按量充值 + 分组倍率」（PackyCode 1元=1刀、DuckCoding Claude 1.5×）；社区评测称逆向渠道存活率低（约 60% 三个月内停运），普遍建议小额充值勿囤余额。", source: "HelpAIO 评测", url: "https://www.helpaio.com/transit" },
  { date: "2026-09-28", checked: true, text: "88code 被评测站标记「软跑路」风险（持续宕机数月，新出 reclaude 老用户余额 8 折转）；R4 Coder 改版为 $5/$10/$20 三档预付包（6 倍面值），弃用 Code Mini/Lite/Pro 命名。", source: "88code Docs / r4.codes", url: "https://docs.88code.org/88code/pricing.html" },
  { date: "2026-09-30", checked: true, text: "ZenMux（NexaMind Singapore，自称全球首个带保险赔付机制的 LLM 聚合平台）入场：Flows 订阅制 $20/$100/$200 三档（25 Flows=$1，杠杆 1.5–2.4x）+ 按量 1 Credit=$1（+10% 赠送），官方 Claude Code 接入文档齐全。", source: "zenmux.ai", url: "https://zenmux.ai/pricing" },
  { date: "2026-09-30", checked: true, text: "R4 Coder 官网当时可见档位：$5 Starter 已不在，有 $50 Code Max（含 $300 额度、8 并发），$10/$20 档仍在（6 倍面值）；模型池有 Step 5 Preview 与 U2 Flash（-90% 促销）。调整日未见公告。", source: "r4.codes（官网直抓）", url: "https://r4.codes/" },
  { date: "2026-09-30", checked: true, text: "腾讯云 TokenHub 通用 Token Plan 个人版在售：¥39/99/299/599 对应 780/1980/5980/11980 积分/月。百度千帆个人 Token Plan 与七牛云企业 Token Plan 也在售。上线日未见公告。", source: "腾讯云 / 百度智能云 / 七牛云", url: "https://cloud.tencent.com/document/product/1823/130060" },
  { date: "2026-05-15", text: "Roo Code 的 VS Code 扩展于 2026-05-15 停更，团队转向自托管云 agent Roomote。自托管 10 个用户以内免费，Cloud 从 $49/月起。", source: "Roo Code / Roomote", url: "https://github.com/RooCodeInc/Roo-Code" },
  { date: "2026-09-25", text: "智谱/Z.ai GLM Coding Plan 双节活动（09-25~10-07）全天按非高峰 5 折消耗积分；叠加夜间畅用（09-03~10-07 每日 23:00–09:00）：ZCode/AutoClaw 端调 GLM-5.3-Flash 不限量，其他 Agent 额度翻倍。", source: "BigModel / Z.ai 官方文档", url: "https://docs.bigmodel.cn/cn/coding-plan/overview.md" },
  { date: "2026-10-01", checked: true, text: "智谱官网购买页在售连续包季 8 折、连续包年 7 折：Lite ¥82.6、Pro ¥376.6、Max ¥754.6/月（年付折算，划线价 ¥118/538/1078）。此前记录的「年付 7 折活动 08-15 截止」已不成立。", source: "bigmodel.cn/glm-coding（官网直抓）", url: "https://bigmodel.cn/glm-coding" },
  { date: "2026-09-29", text: "OpenAI 发布 GPT-6.1 Sol：标准 API 输入 $2 / 输出 $10、缓存输入 $0.10（每百万 tokens）；官方称复杂编码表现接近 Astra，标准输入输出价格约为其 1/5。已向 ChatGPT Work 与 Codex 的 Plus / Pro / Business / Enterprise / Edu 用户开放，并提供 API 模型 gpt-6.1-sol。", source: "OpenAI 官方发布博客", url: "https://openai.com/index/introducing-gpt-6-1-sol" },
  { date: "2026-09-29", text: "OpenAI 额度文档新增 GPT-6.1 Sol 的 Plus 15–160 条/5h；Pro 重构为 $100/$200/$500 三档，官方注明目前无 5 小时上限，Astra Ultrafast（8x 计量）仅 $500 档。", source: "OpenAI 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-09-28", text: "Anthropic 上线 Claude Sonnet 5.5：API 价格与 Sonnet 5 持平（$2/$10、缓存读 $0.20、Batch $1/$5）；Cursor Other Models 池与 GitHub Copilot Pro 同步上架。", source: "Anthropic 定价文档", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { date: "2026-10-03", checked: true, text: "OpenAI Codex 定价页核对：与 10-01 口径一致（Plus 各模型 5 小时条数、Pro $100/$200/$500 目前无 5 小时上限、GPT-5.5 确认 10-14 全线退役）。新增确认：GPT-5.6 Sol 促销 credits 价（输入 100 / 缓存 10 / 输出 500 每百万 tokens）官方写明至少延续至 2026-11-21；Speed 档倍率 Fast 2.5×、Astra Ultrafast 订阅内 8×。第三方「Plus 用量 10-30 起 20×降为 10×」传闻在官方页无对应倍率标注，未入库。", source: "OpenAI Codex 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-10-03", checked: true, text: "Anthropic API 定价页核对：与库内一致，无 10 月调价——Opus 5.5 $4/$20（缓存读 $0.20 = 输入价 0.05×，5m 写 $5 / 1h 写 $8）、Sonnet 5.5 与 Sonnet 5 $2/$10 标准价、Haiku 4.5 $1/$5；Opus 5.5 Fast 模式 $8/$40，inference_geo us 区 1.1×。第三方「API 10-01 调价」说法与官方页不符（所列数字即现行价）。", source: "Anthropic 定价文档", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { date: "2026-10-03", checked: true, text: "智谱 / Z.ai 核对：官方渠道无新调价公告，双节非高峰 5 折（09-25~10-07）与夜间畅用仍在进行；第三方报道确认 2 月结构性调价（涨幅 30% 起）与 9 月天猫 ¥118/538/1078 三档均已在库。", source: "Z.ai / BigModel 官方文档", url: "https://docs.z.ai/devpack/overview.md" },
  { date: "2026-10-05", checked: true, text: "OpenAI Codex 定价页核对：订阅档位、Plus 额度表、Pro $100/$200/$500（目前无 5 小时上限）、GPT-5.5 确认 10-14 退役与 GPT-5.6 Sol 促销 credits 价（至少至 2026-11-21）均与库内一致。新增观察：定价页导航出现 Codex Security（IDE 插件 / CLI / Codex Security Cloud，Cloud 为 research preview 扫描 GitHub 仓库），官方页无公开定价——第三方「Code Security $30/活跃提交者/月」无官方对应条目，未入库；Speed 倍率官方区分两口径：订阅内额度 Fast 2.5× / Astra Ultrafast 8×，购买 credits 与企业按量 Fast 2× / Ultrafast 6×。", source: "OpenAI Codex 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-10-05", checked: true, text: "Anthropic 核对：API 与订阅页均与库内一致，无 10 月调价——Opus 5.5 $4/$20（Fast $8/$40、缓存读 $0.20）、Sonnet 5.5 与 5 $2/$10、Haiku 4.5 $1/$5；订阅 Pro $17（年付）/$20（月付）、Max $100 起 5x/20x、Team 标准 $20–25 / Premium $100–125 每席。官方横幅公告「Claude Cowork is now just Claude」正向 Pro/Max 滚动，不涉及价格。", source: "Anthropic 定价文档", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { date: "2026-10-05", checked: true, text: "国内与工具核对：智谱 / Z.ai 无新调价，双节非高峰 5 折与夜间畅用（均至 10-07）进行中，V3 三档 5h 积分 2,000/12,000/28,000、周上限 10,000/60,000/140,000 与库内一致；Kimi API K3 ¥20/¥100、K2.7-Code ¥6.5/¥27（缓存命中 ¥1.30）与库内一致；Cursor Hobby 免费 / Individual $20 / Teams $40 每席无变化。", source: "Z.ai / BigModel / Kimi / Cursor 官方定价页", url: "https://docs.z.ai/devpack/overview.md" },
  { date: "2026-10-05", checked: true, text: "Google 核对：AI Plus $4.99 / AI Pro $19.99 / AI Ultra $99.99（5x 与 20x 分层）与 10-04 校正值一致；Gemini API 定价页（10-01 更新）确认 Gemini 3.8 Flash 介绍价 $0.75/$3.75 只到 2026-12-31、2027-01-01 起涨至 $1.50/$7.50，已补进 API 表备注。第三方「Gemini 4 Argon 9-30 发布、介绍价 $2/$10」在官方 API 定价页无 Gemini 4 系列对应，未入库。", source: "Google AI Plans / Gemini API 定价", url: "https://ai.google.dev/gemini-api/docs/pricing" },
  { date: "2026-10-06", checked: true, text: "OpenAI Codex 定价页核对：与 10-05 一致——Free/Go $8/Plus $20/Pro $100–500/Business $20–25、Plus 各模型 5 小时条数、GPT-5.5 确认 10-14 退役、GPT-5.6 Sol 促销 credits 价（至少至 11-21）与 Speed 两口径倍率（订阅内 2.5×/8×，credits/企业 2×/6×）均无变化；Codex Security 仍仅限 Business/Enterprise、无公开定价。官方周报（9-28~10-02）无新价格条目，Ultrafast 仅 Pro $500 与库一致；第三方「Pro 200 于 9-29 重新开放」与官方页三档 Pro 均在售一致，无需改库。", source: "OpenAI Codex 定价文档", url: "https://learn.chatgpt.com/docs/pricing" },
  { date: "2026-10-06", checked: true, text: "Anthropic 核对：API 定价页与库内一致，无 10 月调价——Opus 5.5 $4/$20（Fast $8/$40、缓存读 $0.20）、Sonnet 5.5 与 5 $2/$10、Haiku 4.5 $1/$5。新增观察：Claude Managed Agents 在按 token 计费之外新增会话运行时费 $0.08/会话小时；属代理运行时的独立计量单位，不折入每百万 tokens 牌价表，暂不单列 API 行。", source: "Anthropic 定价文档", url: "https://platform.claude.com/docs/en/about-claude/pricing" },
  { date: "2026-10-06", checked: true, text: "国内与工具核对：智谱 / Z.ai 无新调价，双节非高峰 5 折与夜间畅用进行至 10-07（最后一天），V3 三档 5h 积分 2,000/12,000/28,000、周上限 10,000/60,000/140,000 与库一致；BigModel API 牌价 GLM-5.3 ¥8/¥28、GLM-5.3-Flash ¥0.8/¥2.8、FlashX ¥2/¥7（缓存存储限时免费）与库一致。Kimi API K3 ¥20/¥100（缓存命中 ¥2）、K2.7-Code ¥6.5/¥27（缓存 ¥1.30）与库一致；Cursor Hobby 免费 / Individual $20 / Teams $40（子档 Ultra $200、Teams Premium $120 已在库）无变化。", source: "Z.ai / BigModel / Kimi / Cursor 官方定价页", url: "https://docs.bigmodel.cn/cn/guide/start/pricing.md" },
  { date: "2026-10-06", checked: true, text: "Google 核对：Gemini API 定价页（10-01 更新）与库一致——Gemini 3.8 Flash 介绍价 $0.75/$3.75 至 2026-12-31、2027-01-01 起 $1.50/$7.50，3.1 Pro Preview $2/$12；官方 API 定价页仍无 Gemini 4 系列，「Gemini 4 Argon 介绍价 $2/$10」传闻（社交平台二次传播）继续无官方佐证，未入库。新增弃用公告：Gemini 2.5 Flash Image（Nano Banana）已于 10-02 停用，属图像模型，不影响编程额度。订阅档位消费页价格为 JS 动态渲染，本日未复核（10-05 真实浏览器核对仍有效）。", source: "Gemini API 定价", url: "https://ai.google.dev/gemini-api/docs/pricing" },
];

/* 数据来源（按厂商分组） */
const SOURCES = [
  { group: "Anthropic（Claude）", urls: [
    "https://claude.com/pricing",
    "https://www.anthropic.com/claude-haiku-5-5",
    "https://support.claude.com/en/articles/9797557-usage-limit-best-practices",
  ]},
  { group: "OpenAI（Codex）", urls: [
    "https://learn.chatgpt.com/docs/pricing",
    "https://openai.com/index/introducing-gpt-6-1-sol",
  ]},
  { group: "Google（Gemini）", urls: [
    "https://one.google.com/about/ai-premium",
    "https://codeassist.google/",
    "https://github.com/google-gemini/gemini-cli",
    "https://the-decoder.com/google-overhauls-its-ai-subscriptions-at-i-o-2026-with-three-tiers-starting-at-10-a-month/",
    "https://www.theverge.com/tech/933233/google-ai-ultra-plan-price-change",
  ]},
  { group: "xAI（Grok）", urls: [ "https://x.ai/pricing" ]},
  { group: "Mistral", urls: [ "https://mistral.ai/pricing", "https://mistral.ai/news/mistral-large-4/" ]},
  { group: "Z.ai", urls: [
    "https://docs.z.ai/devpack/overview.md",
    "https://docs.z.ai/devpack/transition.md",
  ]},
  { group: "DeepSeek", urls: [ "https://api-docs.deepseek.com/quick_start/pricing" ]},
  { group: "GitHub Copilot", urls: [
    "https://github.com/features/copilot/plans",
    "https://docs.github.com/en/copilot/get-started/plans",
  ]},
  { group: "Cursor", urls: [
    "https://cursor.com/pricing",
    "https://cursor.com/docs/models-and-pricing.md",
    "https://cursor.com/docs/account/teams/pricing.md",
  ]},
  { group: "Windsurf / Devin（Cognition）", urls: [
    "https://devin.ai/pricing",
    "https://docs.devin.ai/admin/billing/self-serve.md",
    "https://docs.devin.ai/desktop/accounts/quota.md",
    "https://docs.devin.ai/admin/billing/enterprise.md",
  ]},
  { group: "Zed / Augment / Cline", urls: [
    "https://zed.dev/pricing",
    "https://docs.augmentcode.com/models/token-based-pricing.md",
    "https://docs.cline.bot/getting-started/cline-provider.md",
    "https://docs.cline.bot/getting-started/clinepass.md",
  ]},
  { group: "Roo Code / Kilo Code / Amp", urls: [
    "https://roomote.dev/",
    "https://github.com/RooCodeInc/Roo-Code",
    "https://kilo.ai/pricing",
    "https://ampcode.com/pricing",
  ]},
  { group: "JetBrains AI", urls: [ "https://www.jetbrains.com/ai-ides/buy/" ]},
  { group: "OpenRouter / Lovable / Bolt / Replit", urls: [
    "https://openrouter.ai/pricing",
    "https://docs.lovable.dev/introduction/subscription-plans.md",
    "https://bolt.new/pricing",
    "https://replit.com/pricing",
  ]},
  { group: "AWS Q Developer", urls: [ "https://aws.amazon.com/q/developer/pricing/" ]},
  { group: "国际厂商 API 定价（Claude / OpenAI / Gemini）", urls: [
    "https://platform.claude.com/docs/en/about-claude/pricing",
    "https://developers.openai.com/api/docs/pricing",
    "https://ai.google.dev/gemini-api/docs/pricing",
  ]},
  { group: "国内厂商 API 定价（智谱 BigModel / Kimi / MiniMax / Qwen / 豆包 / 阶跃 / 硅基流动）", urls: [
    "https://docs.bigmodel.cn/cn/guide/start/pricing.md",
    "https://docs.z.ai/guides/overview/pricing.md",
    "https://platform.kimi.com/docs/pricing/chat.md",
    "https://platform.minimax.cn/docs/guides/pricing-paygo.md",
    "https://docs.bailian.console.aliyun.com/zh/model-studio/qwen3-coder-next.md",
    "https://help.aliyun.com/zh/model-studio/qwen3-8-flash",
    "https://cloud.tencent.com/document/product/1823/130055",
    "https://openrouter.ai/api/v1/models",
    "https://docs.volcengine.com/docs/ark/model-pricing?lang=zh",
    "https://platform.stepfun.com/docs/zh/guides/pricing/details.md",
    "https://siliconflow.cn/models",
  ]},
  { group: "国内云厂商（阿里云灵码 / 腾讯云 CodeBuddy / 华为云 CodeArts）", urls: [
    "https://www.aliyun.com/product/lingma",
    "https://www.tencentcloud.com/products/acc",
    "https://www.huaweicloud.com/product/codearts.html",
  ]},
  { group: "汇率参考（2026-09-23）", urls: [
    "https://api.frankfurter.dev/v1/latest?from=USD&to=CNY",
  ]},
  { group: "智谱 BigModel GLM Coding Plan", urls: [
    "https://docs.bigmodel.cn/cn/coding-plan/overview.md",
    "https://docs.bigmodel.cn/cn/coding-plan/team.md",
    "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision.md",
  ]},
  { group: "Kimi Code Plan / MiniMax Token Plan / 小米 MiMo Token Plan", urls: [
    "https://www.kimi.com/code",
    "https://platform.minimax.cn/docs/guides/pricing-token-plan.md",
    "https://mimo.mi.com/docs/zh-CN/price/token-plan",
    "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go",
  ]},
  { group: "腾讯云 TokenHub / 百度千帆 / 七牛云 Token Plan", urls: [
    "https://cloud.tencent.com/document/product/1823/130060",
    "https://intl.cloud.tencent.com/zh/document/product/1300/81316",
    "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html",
    "https://www.qiniu.com/ai/plan",
  ]},
  { group: "阿里云 Qoder CN（原通义灵码）与百炼套餐", urls: [
    "https://help.aliyun.com/zh/lingma/product-overview/billing-description",
    "https://help.aliyun.com/zh/model-studio/token-plan-overview",
    "https://help.aliyun.com/zh/model-studio/coding-plan",
  ]},
  { group: "腾讯 CodeBuddy / 字节 Trae / 百度 Comate / DuMate / 心流", urls: [
    "https://copilot.tencent.com",
    "https://www.codebuddy.cn/pricing/",
    "https://www.trae.cn/pricing",
    "https://www.trae.ai/pricing",
    "https://comate.baidu.com",
    "https://cloud.baidu.com/doc/COMATE/s/rlnvnio4a",
    "https://www.dumate.cn/",
    "https://cloud.baidu.com/doc/Dumate/s/nmnevrk0l",
    "https://cli.iflow.cn",
  ]},
  { group: "Qwen Code 官方文档（免费层停止公告）", urls: [
    "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/",
  ]},
  { group: "第三方价格对比与实测报道（coding-plan.org / IT之家 / CSDN）", urls: [
    "https://coding-plan.org",
    "https://blog.csdn.net/han1202012/article/details/165749499",
    "https://blog.csdn.net/jarvisuni/article/details/158928785",
  ]},
  { group: "OpenCode / R4 Coder / Command Code", urls: [
    "https://opencode.ai/docs/zen",
    "https://opencode.ai/docs/go/",
    "https://opencode.ai/docs/enterprise",
    "https://github.com/ZoRDoK/pi-r4-coder",
    "https://commandcode.ai/pricing",
  ]},
  { group: "GLM Coding Plan 版本史（BigModel / Z.ai）", urls: [
    "https://docs.bigmodel.cn/cn/coding-plan/overview",
    "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision",
    "https://docs.bigmodel.cn/cn/coding-plan/transition",
    "https://docs.z.ai/devpack/overview",
    "https://docs.z.ai/devpack/notice/usage-revision",
    "https://docs.z.ai/devpack/transition",
  ]},
  { group: "AWS Kiro / Factory Droid / 讯飞 Astron / 阶跃 Step Plan / Canopy Wave", urls: [
    "https://kiro.dev/pricing",
    "https://factory.com/pricing",
    "https://www.xfyun.cn/doc/spark/CodingPlan.html",
    "https://platform.stepfun.com/docs/zh/step-plan/overview",
    "https://canopywave.com/codingplan",
  ]},
  { group: "第三方中转站（R4 / PackyCode / AICodeMirror / 88code / AIGoCode / DevPass / Chutes 及行业评测）", urls: [
    "https://r4.codes/",
    "https://www.aicodemirror.com/api/pricing",
    "https://docs.88code.org/88code/pricing.html",
    "https://www.helpaio.com/transit",
    "https://gist.github.com/jhw26717/55af3992134055cedcbb3049b22d3d0a",
    "https://github.com/xujfcn/awesome-claude-api-cn",
    "https://github.com/lildebil0/awesome-ai-coding-subscriptions",
  ]},
  { group: "ZenMux（聚合平台）", urls: [
    "https://zenmux.ai/pricing",
    "https://zenmux.ai/docs/guide/subscription.html",
    "https://zenmux.ai/docs/guide/pay-as-you-go.html",
    "https://zenmux.ai/docs/best-practices/claude-code.html",
  ]},
];

/* 未能完全核实 / 存在不确定性的项（页脚展示） */
const UNCERTAIN = [
  "价格逐条核查状态、核查日期与官网链接见来源栏；待核实历史价不参与推荐和排行，未列年付价不等于厂商不存在年付方案。",
  "图中黄色估算柱与额度表的≈估行采用已说明的假设，不能作为厂商承诺的 token 数；官方周 tokens 与请求数、积分和月池分开标注。",
  "汇率日期与官网原价核查日期分别记录；USD 按6.71折算，INR按同日USD/CNY与USD/INR交叉汇率换算，仅作人民币对比。",
  "讯飞套餐列的是DeepSeek-V4-Flash，现售DeepSeek Flash API为不同版本；额度表用当前Flash牌价做代理估算并标低置信，真实请求上限按抵扣系数2修正，夜间0.8另标。",
  "腾讯云Coding Plan的模型清单与Token Plan独立牌价不可混为同一额度承诺；供应库存的官方页面口径有冲突，不保证每日补货。",
  "Claude Code 每 5 小时 prompt 数：Anthropic 官方不公布固定次数（按 token 计量）；第三方估算 Pro 约 10–45 条/5h、Max 20x 约 200–900 条/5h，仅供参考。",
  "Cursor 各档「包含用量」官方不再公布具体 credits/token 数值；日常 Agent 用户月耗 $60–100 是消费情景，不是 $20 Pro 订阅包含额度，因此不折成套餐 tokens 或参与成本排行。Windsurf/Devin 新配额制的具体 token 预算官方未公布。",
  "JetBrains AI Pro/Ultimate 的具体用量额度为 JS 渲染未能核实。Kilo 个人平台免费，推理按供应商原价或 BYOK，见 kilo.ai/pricing。",
  "Tabnine 独立订阅疑似停售（官网 301 重定向至 Tricentis），无 2026-09 在售价格。",
  "Gemini 3 Pro 文本版未在 API 价格页单列（当前最新为 Gemini 3.1 Pro Preview $2/$12；页面仅单列 3 Pro Image 图像模型 $120/1M）。",
  "华为云 CodeArts 套餐价（基础 ¥60 / 专业 ¥200 / 企业 ¥600/人/月）为 DevOps 全套研发平台价，非编程助手单独售价。",
  "Kimi Code Plan 各档（¥99/199/699）为连续包月价，单月原价是否更高未确认；各档具体编程积分数值未公开（官方仅说明'5 小时滚动窗口 + 月总额度'机制）。",
  "MiniMax Token Plan 各档每月 token 总量（约 6 亿/18 亿/71 亿）为第三方估算；年付价未经官方确认。",
  "qwen3.8-flash-next 没有单独的托管计费 ID，线上服务是 qwen3.8-flash（华北2 ¥0.8/¥2.7，缓存 ¥0.1）。百炼 Coding Plan 官方列表仍不含该模型，表中该行是同一请求额度的牌价对照。",
  "Command Code、Canopy Wave、DevPass、百炼 qwen3.7-plus 的分项牌价来自 OpenRouter 模型列表（输入/输出/缓存），不是这些套餐自己的价目；套餐若有折扣或模型系数，实际 tokens 会偏离。Spark X2 在 OpenRouter 与硅基流动都没有逐 token 价，额度表未单列。",
  "小米 Token Plan 的每周 tokens 由官方每 token Credits 系数按 95% 缓存、80/20 折算，不是官方公布的周配额；夜间 0.8 倍未计入。团队版与个人版每席额度相同，额度表只列个人四档。",
  "腾讯云通用 Token Plan 的 tokens 由 2026-09-30 积分抵扣系数按同一假设折算，额度表只列 mimo-v2.6-flash 与 hy4-preview。Hy Token Plan 活动页可见 Pro ¥238、Max ¥468，Lite/Standard 未稳定抓全，未入库。",
  "百度千帆 Token Plan 标价取续费价 ¥9.9/40/200/600（首购 ¥4.9/19.9/99.9/299.9）。百度、七牛云企业 Token Plan、阿里云百炼 Token Plan 的积分到 token 没有逐模型公开系数（七牛给出 0.004 元/K 的基准，额外倍率在订阅页），只进套餐表。",
  "DeepSeek、Kimi 开放平台、MiniMax 开放平台官方确认按量计费、无 API 订阅制；讯飞 iFlyCode 等其余国内编程工具未在本页核实范围内。",
  "Factory Droid Pro 的 token 配额（~10M/月）来自第三方评测，官方只给相对倍数（Plus ≈5×、Max ≈10× Pro）。",
  "阶跃 Step Plan 的 Credit→tokens 换算依赖模型系数（官方未公布统一公式），表中额度价值按 1M Credit=¥1 官方锚点计，实际可用 tokens 因模型而异。",
  "讯飞 iFlyCode 插件定价（第三方标 ¥69/129/月）来源老旧且官网不可达；现行编程订阅由讯飞星辰 Astron Coding Plan 承载。",
  "Canopy Wave 为第三方聚合商，用户反馈稀少；其 $15.99『无限 token』档仅见用户评价，官方定价页未列。",
  "GitHub Copilot Max 档 FAQ 中 credits 表述与表格不一致处，以 docs 页 20,000 credits 为准；Copilot 自 6/1 起全面转为用量计费。",
  "AICodeMirror 的 creditLimit 单位口径（305K/699K/1.678M credits）官方未公布，无法换算美元面值或 token 数。",
  "88code：2026-09-30 本机访问 www.88code.ai 返回 403，docs.88code.org 连接失败。可达文档快照写明 FREE 已停发；包月为 PLUS ¥198 / PRO ¥398 / MAX ¥698，另有一次性 PayGo ¥66（200 刀）与 ¥666（1988 刀）。现网是否仍可下单未证实。",
  "ZenMux 订阅的滚动 7 天周上限具体 Flows 数值、新用户注册赠金、充值服务费率均未在页面公布（JS 渲染未抓全）；Flows 汇率随时间浮动（25 Flows=$1 为 2026-09-19 快照）。",
  "ChatGPT Pro 三档（$100/$200/$500）的额度差官方未公布：2026-10-01 官方页仅注明 Pro 目前无 5 小时上限、Astra Ultrafast 仅 $500 档；此前的 5x/20x 倍率与条数区间为旧口径，额度表中相关估算行已降为低置信。GPT-6.1 Sol 的 1.1M 上下文来自第三方规格页，官方文档仅给长上下文档价（>272K 输入档）。",
  "Claude 订阅页模型列表只写「Sonnet」不分版本；Sonnet 5.5（2026-09-28 上线）按 API 定价页与 Cursor/Copilot 模型列表推定为当前订阅档所含版本。"
];

/* 逐条官方核价记录；由 audit/pricing-verification-2026-10-04.json 维护。 */
/** @type {{checkedAt:string, sources:Record<string,{url:string,evidence:string}>,rows:Record<string,PriceVerification>}} */
const PRICE_CHECKS = {
  "checkedAt": "2026-10-04",
  "sources": {
    "claude-plans": {
      "url": "https://claude.com/pricing",
      "evidence": "免费0；Pro月20、年200；Team标准25/20及Premium125/100（美元，每席位月付/年均）；Enterprise年付20/席/月加API用量。"
    },
    "claude-max": {
      "url": "https://support.claude.com/en/articles/11049741-what-is-the-max-plan",
      "evidence": "网页Max 5x每月100美元、20x每月200美元，只有月付。"
    },
    "openai-plans": {
      "url": "https://learn.chatgpt.com/docs/pricing",
      "evidence": "Free0、Go8、Plus20；Pro100/200/500美元月付；Business月25/年均20每用户；Enterprise询价。"
    },
    "google-plans": {
      "url": "https://one.google.com/about/google-ai-plans/",
      "evidence": "真实浏览器切到United States：Plus月4.99美元；Pro月19.99/年199.99；Ultra5x月99.99、20x月199.99且仅月付。"
    },
    "google-plus-us": {
      "url": "https://blog.google/products-and-platforms/products/google-one/google-ai-plus-availability/",
      "evidence": "2026-01-27官方美国发布价7.99美元/月；不能用非美国页面默认4.99美元替换美国价。"
    },
    "google-codeassist": {
      "url": "https://codeassist.google/",
      "evidence": "个人免费；Standard月22.80/年均19美元每用户，Enterprise月54/年均45美元每用户。"
    },
    "xai-plans": {
      "url": "https://x.ai/pricing",
      "evidence": "免费0、SuperGrok30、Plus100美元每月；Lite/Heavy在对照表出现但未给金额，grok.com结账页抓取失败。年费未公开。"
    },
    "mistral-plans": {
      "url": "https://mistral.ai/pricing/",
      "evidence": "Vibe Free免费；Pro14.99美元/月；Team24.99美元/用户/月；学生5.99。未见年费。"
    },
    "zai-checkout": {
      "url": "https://z.ai/subscribe",
      "evidence": "直接操作当前公开结账页：月付Lite18/Pro80/Max168；季度折月14.4/64/134.4；年折月12.6/56/117.6美元。"
    },
    "zai-transition": {
      "url": "https://docs.z.ai/devpack/transition",
      "evidence": "V1无周限额的历史档2026-04-30取消自动续订；旧公告的现价与当前结账页不一致，不能作当前价。"
    },
    "zai-legacy": {
      "url": "https://docs.z.ai/devpack/notice/usage-revision",
      "evidence": "2026-07-30起旧版不对新用户销售，V2存量用户可续订/升级，官方未公开本次核查所需的存量续费价。"
    },
    "claude-api": {
      "url": "https://platform.claude.com/docs/en/about-claude/pricing",
      "evidence": "百万tokens美元：Sonnet5.5及5输入2输出10；Opus5.5输入4输出20。缓存读分别0.20。"
    },
    "openai-api": {
      "url": "https://developers.openai.com/api/docs/pricing",
      "evidence": "Standard短上下文每百万tokens：6Astra10/50，6.1Sol2/10，6Luna0.1/0.5，5.6Sol4/20，5.3Codex1.75/14。"
    },
    "openai-sol": {
      "url": "https://developers.openai.com/api/docs/models/gpt-6-sol",
      "evidence": "每百万tokens美元输入2、缓存0.20、输出10。"
    },
    "openai-terra": {
      "url": "https://developers.openai.com/api/docs/models/gpt-5.6-terra",
      "evidence": "每百万tokens美元输入2、缓存0.20、输出12。"
    },
    "openai-luna": {
      "url": "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
      "evidence": "每百万tokens美元输入0.20、缓存0.02、输出1.20。"
    },
    "google-api": {
      "url": "https://ai.google.dev/gemini-api/docs/pricing",
      "evidence": "3.1Pro Preview标准≤200K每百万tokens输入2/输出12美元；缓存0.20加存储4.50/百万/小时。"
    },
    "zai-api": {
      "url": "https://docs.z.ai/guides/overview/pricing",
      "evidence": "每百万tokens美元GLM5.3输入1.4/缓存0.26/输出4.4；Flash0.15/0.03/0.50。"
    },
    "deepseek-api": {
      "url": "https://api-docs.deepseek.com/quick_start/pricing/?helper=penn&method=individual",
      "evidence": "最新英文价表低峰Flash输入0.15/缓存0.003/输出0.6，V4Pro0.66/0.022/1.98美元；高峰2倍且中国法定节假日均低峰。请求名deepseek-flash。"
    },
    "relays-opencode-zen": {
      "url": "https://opencode.ai/docs/zen",
      "evidence": "官方文档为美元按 token 付费，无固定月订阅；充值手续费 4.4% 加每笔 $0.30，模型价无额外加价。"
    },
    "relays-opencode-go": {
      "url": "https://opencode.ai/docs/go/",
      "evidence": "官方月订阅表列 Go $10、Go Plus $40；每工作区仅一位成员可以订阅；未列年付价。"
    },
    "relays-opencode-go-catalog": {
      "url": "https://opencode.ai/go",
      "evidence": "官网再次列 Go $10/月、Go Plus $40/月；用量为各模型的估计 5 小时限额，Plus 与 Go 的倍率按模型不同。"
    },
    "relays-opencode-enterprise": {
      "url": "https://opencode.ai/docs/enterprise",
      "evidence": "企业版按席位联系销售定制报价；连接自有 LLM 网关的使用不另外按 token 计费。"
    },
    "relays-r4": {
      "url": "https://r4.codes/",
      "evidence": "直接打开现行官网：Code Lite 一次性 $10/$60 额度、Code Pro $20/$120、Code Max $50/$300，30 天有效；三档均显示 Sold out 和候补名单。官网未列旧 $5 Starter。"
    },
    "relays-zenmux-subscription": {
      "url": "https://zenmux.ai/docs/guide/subscription.html",
      "evidence": "官方 Individual Builder Plan 表：Free $0、Starter $20/月、Max $100/月、Ultra $200/月；Free 仅 Studio 聊天，无 API；未列年付价。"
    },
    "relays-zenmux-payg": {
      "url": "https://zenmux.ai/docs/guide/pay-as-you-go.html",
      "evidence": "官方 PAYG 文档：全部 Credit 以美元计，1 Credit 对应 $1 API 用量，充值 $5 至 $25,000；与订阅分开。"
    },
    "relays-packy-codex": {
      "url": "https://codex.packycode.com/pricing",
      "evidence": "Chrome 实际渲染官网定价页明确说明已停止销售，引导至 PackyAPI 按量使用；旧美元月档仍展示且购买按钮禁用。原 ¥60 社区券价无法对应现行官方档位。"
    },
    "relays-packy-api-unreachable": {
      "url": "https://packyapi.com/",
      "evidence": "该官网来自 Packy Codex 的官方跳转链接。本次浏览器实际访问返回 ERR_CONNECTION_CLOSED，未获取现行充值价格。"
    },
    "relays-aicodemirror-unreachable": {
      "url": "https://www.aicodemirror.com/api/pricing",
      "evidence": "官网定价端点和主站本次均无法获取；Chrome 实际访问定价端点返回 ERR_CONNECTION_CLOSED，无法确认月费或年费。"
    },
    "relays-88code-unreachable": {
      "url": "https://www.88code.ai/",
      "evidence": "官网本次请求 HTTP 403，未能打开下单或定价页。"
    },
    "relays-88code-docs-unreachable": {
      "url": "https://docs.88code.org/88code/pricing.html",
      "evidence": "官方定价文档本次直接访问连接失败或超时；搜索索引虽有旧价格内容，本次不将摘要作为确认依据。"
    },
    "relays-duck-unavailable": {
      "url": "https://www.duckcoding.ai/pricing",
      "evidence": "Chrome 实际打开官网显示 Service unavailable，并说明只在特定地区提供服务；本环境无法取得定价。"
    },
    "relays-aigocode-en": {
      "url": "https://www.aigocode.com/en",
      "evidence": "官网现行定价：Pro ¥399、Max ¥899、Ultra ¥1799，全部为 4 周订阅；额度每 7 天发放 110/260/530，总计 440/1040/2120。"
    },
    "relays-aigocode-cn": {
      "url": "https://www.aigocode.net/",
      "evidence": "直接打开中文官网，同样列 Pro/Max/Ultra 三个 4 周档，正常价格 ¥399/¥899/¥1799；没有年付定价。"
    },
    "relays-devpass": {
      "url": "https://devpass.llmgateway.io/",
      "evidence": "官方月订阅为 Lite $29、Pro $79、Max $179，目前分别 $87/$237/$537 用量；公告 2026-10-15 起新订阅及之后首次续费从 3 倍改为 2 倍，费用不变。"
    },
    "relays-devpass-terms": {
      "url": "https://devpass.llmgateway.io/legal/terms",
      "evidence": "官方条款为个人交互式 Coding 的自动月续订。2026-10-15 生效的新额度为 $58/$158/$358，并调整滚动日限制和 premium 周限制；尚未生效。"
    },
    "relays-chutes-pricing": {
      "url": "https://chutes.ai/pricing",
      "evidence": "现行官方 Optional monthly plans 只列 Plus $10/月、Pro $20/月；含每日额度，额度外 PAYG 分别优惠 6%/10%；未列 $3 Base 或年付价。"
    },
    "relays-chutes-starter": {
      "url": "https://chutes.ai/docs/guides/starter-guide",
      "evidence": "官方入门文档明确只有两种可选月订阅 Plus $10 和 Pro $20；也可以无订阅直接按 token 充值消费。"
    },
    "relays-chutes-policy": {
      "url": "https://chutes.ai/news/community-announcement-february",
      "evidence": "2026-02-27 官方公告将所有订阅月度价值上限改为相当于订阅价 5 倍的 PAYG 用量，并可设置更短滚动窗口。被明确退役的是免费 Early Access，不能据此断言 Base 永久退役。"
    },
    "relays-command": {
      "url": "https://commandcode.ai/pricing",
      "evidence": "现行官网月费 Go/GOAT/Pro/Max10x/Max20x/Provider 为 $1/$10/$20/$100/$200/$15，均另收 processing fee。Go 当前含 $10 credits、约 9K 请求、优惠后最高约 $15 用量；未列年付价。"
    },
    "relays-kiro": {
      "url": "https://kiro.dev/pricing/",
      "evidence": "官方 Free $0/月；Pro $20、Pro+ $40、Pro Max $100、Power $200 均按每用户每月计价，social login / AWS Builder ID 用户可自行购买；团队开发者须分别订阅。税另计，首次升级 $20 账单抵扣为一次性优惠，不抵减正常续费价。"
    },
    "relays-factory": {
      "url": "https://factory.com/pricing",
      "evidence": "官方个人订阅 Pro $20/月、Plus $100/月、Max $200/月；Plus/Max 约为 Pro 的 5 倍/10 倍用量，未列个人年付价。另有 Teams $60/月基础费加 $40/席位及企业定制，库存没有这些记录。"
    },
    "relays-canopy": {
      "url": "https://canopywave.com/codingplan",
      "evidence": "官网 Coding Plan Pro Bundle 为 $30，按月收费。当前页按模型给出相对用量和不同 token 消耗的估计，没有找到原 500 次/天、10000 次/月的固定限额。"
    },
    "relays-kiro-subscription": {
      "url": "https://kiro.dev/docs/billing/subscription-portal/",
      "evidence": "官方文档描述用户在 Account & Billing 自行管理和升降级订阅；团队成员管理功能明确注明仅适用于 team plans。定价页另明确 social login 或 AWS Builder ID 用户可以自行购买四个付费档。"
    },
    "tools-github-plans": {
      "url": "https://docs.github.com/en/copilot/get-started/plans",
      "evidence": "官网计划表列 Free、Pro $10、Pro+ $39、Max $100；Business $19、Enterprise $39 每授予席位/月。"
    },
    "tools-github-licenses": {
      "url": "https://docs.github.com/en/billing/concepts/product-billing/github-copilot-licenses",
      "evidence": "个人现售付费档按自然月计费；组织按已授予席位计费。"
    },
    "tools-github-annual-legacy": {
      "url": "https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/what-changed-with-billing",
      "evidence": "已有 Pro/Pro+ 年付仅继续至原期限结束；期满转 Free，可另订月付。"
    },
    "tools-cursor-docs": {
      "url": "https://cursor.com/docs/models-and-pricing",
      "evidence": "Start 仅印度 ₹649/月含税；个人 $20/$60/$200；Teams Standard $40、Premium $120 每用户/月。"
    },
    "tools-cursor-pricing": {
      "url": "https://cursor.com/pricing",
      "evidence": "真实 Chrome 切按年和各档：Pro $16、Pro+ $48、Ultra $160；Teams Standard $32、Premium $96 每用户/月。Hobby 免费、Enterprise 定制。"
    },
    "tools-devin-pricing": {
      "url": "https://devin.ai/pricing",
      "evidence": "现售个人 Free $0、Pro $20/月、Max $200/月，含 Desktop 和 Cloud；Enterprise 联系销售。Teams 页面文字为团队 $80/月加 full seat $40/月。"
    },
    "tools-devin-billing": {
      "url": "https://docs.devin.ai/admin/billing/self-serve",
      "evidence": "full seat $40/月；flex 无固定费且无 Desktop 权限。文档称 Teams 最低总额 $80，详细表为 0/1/2 个 full seat 均总额 $80，3 个为 $120；与主页相加措辞冲突。"
    },
    "tools-devin-grandfather": {
      "url": "https://docs.devin.ai/desktop/accounts/quota",
      "evidence": "旧 Pro $15/月与旧 Teams $30/席位/月永久保价；这是旧用户条件，不能替代现售标价。"
    },
    "tools-devin-enterprise": {
      "url": "https://docs.devin.ai/admin/billing/enterprise",
      "evidence": "Enterprise 的 ACU 按订单合同中的费率计费，具体价格联系销售。"
    },
    "tools-zed-pricing": {
      "url": "https://zed.dev/pricing",
      "evidence": "Personal 永久 $0；Pro $10/月含 $5 token，托管超额为 API 牌价加 10%；Business $30/席位/月，无最低席位，25+ 可签合同。未公布年付价。"
    },
    "tools-augment-pricing": {
      "url": "https://www.augmentcode.com/pricing",
      "evidence": "Business $100/月，最多 50 席位不额外按席位收费，含 $100 用量；Enterprise 定制、可协商年度量折扣。"
    },
    "tools-augment-token-billing": {
      "url": "https://docs.augmentcode.com/models/token-based-pricing",
      "evidence": "Business 费用池覆盖推理、40% LLM 服务费及计算；≤50 席位无另加席位费，超额充值按量。"
    },
    "tools-cline-provider": {
      "url": "https://docs.cline.bot/getting-started/cline-provider",
      "evidence": "Cline provider 为充值后按使用量扣费，与 ClinePass 分开；存在免费模型选项。"
    },
    "tools-cline-source": {
      "url": "https://github.com/cline/cline",
      "evidence": "官方仓库本体采用 Apache 2.0 许可并公开源码，模型供应商费用另计。"
    },
    "tools-clinepass": {
      "url": "https://docs.cline.bot/getting-started/clinepass",
      "evidence": "可选 ClinePass 为 $9.99/月的独立供应商订阅，可与其他供应商及按量模式并用；未公布年付价。"
    },
    "tools-roo-archive": {
      "url": "https://github.com/RooCodeInc/Roo-Code",
      "evidence": "官方仓库于 2026-05-15 归档，README 明确扩展已关闭，建议 ZooCode 或 Cline；没有给出转向 Roomote 的声明。"
    },
    "tools-roomote-pricing": {
      "url": "https://roomote.dev/",
      "evidence": "Cloud ≤10 用户 $49/月、11–50 为 $249/月、51–100 为 $499/月，7 天免费试用；自托管 ≤10 免费无许可证，推理 key 自备。"
    },
    "tools-kilo-pricing": {
      "url": "https://kilo.ai/pricing",
      "evidence": "个人平台 $0、Teams $15/用户/月，推理采用供应商牌价；credits 购买另收 5% 处理费，云计算另计。"
    },
    "tools-amp-pricing": {
      "url": "https://ampcode.com/pricing",
      "evidence": "Hobby 免费，orb 按量或自建 runner，支持自有 key/订阅且 Amp 无 token 费。Megawatt $20/月含 45,000 orb 分钟；真实 Chrome 切 Gigawatt 为 $200/月、480,000 分钟。"
    },
    "tools-jetbrains-plans": {
      "url": "https://www.jetbrains.com/help/ai-assistant/licensing-and-subscriptions.html",
      "evidence": "官方当前文档确认个人 AI Pro $10、Ultimate $30，组织 $20/$60；未在此页给年付总价。组织正逐步迁移共享 AI credits 池。"
    },
    "tools-jetbrains-buy-blocked": {
      "url": "https://www.jetbrains.com/ai-ides/buy/",
      "evidence": "web 工具打开只返回空壳；本地真实 Chrome 自动跳中国 AI 工具介绍/询价表单。无法直接读取当前国际年付价，未采用搜索摘要作为确认。"
    },
    "tools-openrouter-pricing": {
      "url": "https://openrouter.ai/pricing",
      "evidence": "Free 平台无收费，有免费模型；Standard 为 PAYG 5.5% 平台费，Business 8%，不存在此行所对应的固定月订阅费。"
    },
    "tools-lovable-plans": {
      "url": "https://docs.lovable.dev/introduction/subscription-plans",
      "evidence": "100 credits Pro $25/月或 $250/年（显示 $21/月），Business $50/月或 $500/年（显示 $42/月）；Free 无固定费，Enterprise 合同报价。"
    },
    "tools-bolt-pricing": {
      "url": "https://bolt.new/pricing",
      "evidence": "真实 Chrome 月/年切换：Free $0；Pro $25 月付、年付折月 $18；Teams $30 月付、年付 $27 每成员/月；Enterprise 定制。Forge 截至 10-14 赠送不改变订阅报价。"
    },
    "tools-replit-pricing": {
      "url": "https://replit.com/pricing",
      "evidence": "真实 Chrome 切月/年：Core $20/$18，Pro 起档 $100/$90，年付为每月折算，Enterprise 定制。"
    },
    "tools-replit-renewal": {
      "url": "https://replit.com/blog/pro-plan",
      "evidence": "2026-02-24 公告、09-30 更新确认 Core 降至 $20/月、Pro $100/月，旧 Core 下次续费适用新价；Pro ≤15 builders 无按人加价。"
    },
    "tools-aws-q-pricing": {
      "url": "https://aws.amazon.com/q/developer/pricing/",
      "evidence": "Q Developer 永久免费层；Pro $19/用户月。Java 转换每人每月 4,000 LOC 在 payer 账户池化，超额 $0.003/LOC；订阅首月按比例，中途退订仍收整月。"
    },
    "cn-xfyun": {
      "url": "https://www.xfyun.cn/doc/spark/CodingPlan.html",
      "evidence": "高效档199元/月、极速档999元/月；极速首月699元。文档另列包季，不把首月优惠作续费月价。"
    },
    "cn-step-plan": {
      "url": "https://platform.stepfun.com/docs/zh/step-plan/overview",
      "evidence": "官网HTML套餐表：Flash Mini/Plus/Pro/Max月费49/99/199/699元；年总价456/936/1860/6666元，月均38/78/155/555.5。"
    },
    "cn-qoder-pricing": {
      "url": "https://qoder.com.cn/pricing",
      "evidence": "Chrome现行价格页：个人Free/Pro/Pro+为0/59/169元；年付637.2/1825.2元。企业99/149/199元每席位每月，起购1/10/50席。"
    },
    "cn-codebuddy-pricing": {
      "url": "https://www.codebuddy.cn/pricing/",
      "evidence": "Chrome月付目录价99/199/999元，连续包月70/140/700元；连续包年672/1344/6720元。体验版免费。企业旗舰198元/人/月，1席起。"
    },
    "cn-huawei": {
      "url": "https://www.huaweicloud.com/product/codearts.html",
      "evidence": "官网展示码道代码智能体免费体验，未展示独立正式订阅固定月费；CodeArts整套DevOps的60/200/600元不能代作码道价格。"
    },
    "cn-glm-legacy": {
      "url": "https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision",
      "evidence": "官方老用户权益：V1停售/自动续费停止；V2仅老用户续费，月49/149/469元，年均39.2/119.2/375.2元。"
    },
    "cn-glm-buy": {
      "url": "https://bigmodel.cn/glm-coding",
      "evidence": "Chrome官网个人目录118/538/1078元，连续包月94.4/430.4/862.4元，年均82.6/376.6/754.6元。团队标准598元/席/月、年均538.2元。"
    },
    "cn-kimi-member": {
      "url": "https://www.kimi.com/membership/pricing",
      "evidence": "Chrome官方会员表：Plus/Pro/Max连续包月99/199/699元，年付948/1908/6708元；三档均含Kimi Code调用权益。"
    },
    "cn-minimax-plan": {
      "url": "https://platform.minimax.cn/docs/guides/pricing-token-plan",
      "evidence": "官方Token Plan个人Plus/Max/Ultra月费49/119/469元人民币，无公开年付价。"
    },
    "cn-mimo-plan": {
      "url": "https://mimo.mi.com/docs/zh-CN/price/token-plan",
      "evidence": "个人月39/99/329/659元；年总411.84/1045.44/3474.24/6959.04元。团队月99/329/659元每席，年1044/3468/6948元每席。"
    },
    "cn-tokenhub-plan": {
      "url": "https://cloud.tencent.com/document/product/1823/130060",
      "evidence": "官方Token Plan四档Lite/Standard/Pro/Max月价39/99/299/599元；Hy Token Plan另售，不能混用价格。"
    },
    "cn-baidu-plan": {
      "url": "https://cloud.baidu.com/product/qianfan_home/token_plan_personal.html",
      "evidence": "官方Mini/Lite/Pro/Max目录月9.9/40/200/600元；首购4.9/19.9/99.9/299.9元，首次续费6折活动与长期月价区分。"
    },
    "cn-qiniu": {
      "url": "https://www.qiniu.com/ai/plan",
      "evidence": "官方Enterprise S/M/B月价2999/4999/9999元，按企业套餐而非每人席位；年付仅宣称最低4折，未公开逐档年付总额。"
    },
    "cn-trae-cn": {
      "url": "https://www.trae.cn/pricing",
      "evidence": "Chrome国内Free免费；Lite/Pro/Pro+/Ultra目录49/99/239/699元。首月Lite39、Pro69；连续包月Pro+219、Ultra629元，单月到期不续订。"
    },
    "cn-trae-global": {
      "url": "https://www.trae.ai/pricing",
      "evidence": "Chrome动态价格页Pro自动续费10美元/月，单月一次购买15美元，年付7.5美元/月；静态HTML仍显示过时20美元，采用实际渲染表。"
    },
    "cn-dumate": {
      "url": "https://www.dumate.cn/",
      "evidence": "官方免费体验0元/月，Pro首月9.9随后59元/月，Max首月69随后129元/月。"
    },
    "cn-lkeap-plan": {
      "url": "https://cloud.tencent.com/document/product/1823/130092",
      "evidence": "腾讯最新Coding Plan官方迁移文档公开Lite40元/月、Pro200元/月和5小时/周/月请求额度；仅编程工具交互式使用。"
    },
    "cn-ali-token": {
      "url": "https://help.aliyun.com/zh/model-studio/token-plan-overview",
      "evidence": "官方个人Lite/Essential/Standard/Pro限时39/79/139/499元/月，原价60/120/180/600；团队标准150元/席/月原198。限华北2北京。"
    },
    "cn-ali-coding": {
      "url": "https://help.aliyun.com/zh/model-studio/coding-plan",
      "evidence": "官方Pro200元/月，首次39.9后续200元；首次续费5折活动2026-04-01结束；Lite停售。Token Plan概述与库存补充说明存在冲突。"
    },
    "cn-glm-api": {
      "url": "https://docs.bigmodel.cn/cn/guide/start/pricing",
      "evidence": "直接读取官网HTML旗舰表：GLM-5.3输入8/输出28/缓存2元；Flash为0.8/2.8/0.23元，缓存存储限时免费。"
    },
    "cn-kimi-api": {
      "url": "https://platform.kimi.com/docs/pricing/chat",
      "evidence": "官网HTML DocTable配置：kimi-k3未命中20/输出100/命中2元，缓存写入5min20、1h40元；K2.7-Code为6.5/27/1.3元。"
    },
    "cn-minimax-api": {
      "url": "https://platform.minimax.cn/docs/guides/pricing-paygo",
      "evidence": "官方标准MiniMax-M3≤512K永久五折2.1/8.4/缓存0.42元；>512K双倍，优先1.5倍。M2.7标准2.1/8.4/0.42元。"
    },
    "cn-ali-next": {
      "url": "https://help.aliyun.com/zh/model-studio/qwen3-coder-next",
      "evidence": "官网华北2≤32K输入1/输出4元，32K-128K为1.5/6，128K-256K为2.5/10；不支持上下文缓存。"
    },
    "cn-ali-plus": {
      "url": "https://help.aliyun.com/zh/model-studio/qwen3-coder-plus",
      "evidence": "官网华北2≤32K输入4/输出16/隐式命中0.8元；显式创建5元、显式命中0.4元；跨地域及更长上下文另有分档价。"
    },
    "cn-ali-flash": {
      "url": "https://help.aliyun.com/zh/model-studio/qwen3-coder-flash",
      "evidence": "官网华北2≤32K输入1/输出4/隐式缓存0.2元；显式命中0.1元；256K-1M档输入5/输出25元。"
    },
    "cn-ali-38flash": {
      "url": "https://help.aliyun.com/zh/model-studio/qwen3-8-flash",
      "evidence": "官网华北2输入0.8/输出2.7/命中0.1元；显式创建1.25元、显式命中0.1元。"
    },
    "cn-step-api": {
      "url": "https://platform.stepfun.com/docs/zh/guides/pricing/details",
      "evidence": "直接读取官网HTML多模态推理表：step-5-preview未命中7/命中0.35/输出20元；step-3.7-flash未命中1.35/命中0.27/输出8.1元。"
    },
    "cn-siliconflow": {
      "url": "https://cloud-rd.siliconflow.cn/pricing",
      "evidence": "官方实时价格中心GLM-5.3为8/28/缓存2元，K2.7-Code为6.5/27/1.3元，DeepSeekV4Pro12/24/1元，Qwen3.8-27B为3/12元。"
    },
    "cn-tokenhub-api": {
      "url": "https://cloud.tencent.com/document/product/1823/130055",
      "evidence": "官方广州按量模型表Hy3输入1/输出4/缓存0.25元；Hy4 preview6/18/0.3元每百万tokens。"
    },
    "cn-mimo-api": {
      "url": "https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go",
      "evidence": "官方国内实时mimo-v2.6-flash输入1/输出2/命中0.02元；v2.6-pro3/6/0.025元。批量半价、ultraspeed十倍，不混入标准价。"
    },
    "cn-comate": {
      "url": "https://comate.baidu.com/zh/pricing",
      "evidence": "Chrome官方个人标准版Free免费，首次注册送5000积分；会员权益与DuMate互通，Pro/Max为另售付费档。"
    },
    "cn-volc-price": {
      "url": "https://docs.volcengine.com/docs/ark/model-pricing?lang=zh",
      "evidence": "Chrome官方常规价：doubao-seed-2.0-code≤32K为3.2/16/缓存0.64元，2.1-pro≤1M为6/30/缓存1.2元；CodingLite40/Pro200元，AgentSmall40元/月。"
    },
    "cn-volc-promo": {
      "url": "https://docs.volcengine.com/docs/ark/coding-plan-personal-universal-promotion?lang=zh",
      "evidence": "6月8日至11月8日，新老用户共享最多两个月优惠资格：Lite 9.9元、Pro 49.9元，随后40/200元；名额有限。"
    },
    "cn-volc-agent": {
      "url": "https://docs.volcengine.com/docs/ark/agent-plan-personal-plan-overview?lang=zh",
      "evidence": "Agent Small/Medium/Large/Max 每月40/200/500/1000元；Small不支持Kimi-K3或视频生成。"
    }
  },
  "rows": {
    "plan:plan-0001": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0002": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0003": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-max"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0004": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-max"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0005": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0006": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0007": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0008": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0009": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0010": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0011": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0012": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0013": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0014": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0015": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-plans"
      ],
      "reason": "官方Enterprise需联系销售，无公开固定价。"
    },
    "plan:plan-0016": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-plans",
        "google-plus-us"
      ],
      "reason": "真实浏览器选择 United States 后，当前官网显示4.99美元/月；1月发布价7.99已过时。"
    },
    "plan:plan-0017": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0018": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0019": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0020": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-codeassist"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0021": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-codeassist"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0022": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-codeassist"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0023": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "xai-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0024": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "xai-plans"
      ],
      "reason": "官方对照表存在档位但没有公开价格；grok.com/plans和定向结账入口无可读取金额。"
    },
    "plan:plan-0025": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "xai-plans"
      ],
      "reason": "月价确认，官方公开页未列年费，移除未经确认的年付折月价格。"
    },
    "plan:plan-0026": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "xai-plans"
      ],
      "reason": "月价确认，官方公开页未列年费，移除未经确认的年付折月价格。"
    },
    "plan:plan-0027": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "xai-plans"
      ],
      "reason": "官方对照表存在档位但没有公开价格；grok.com/plans和定向结账入口无可读取金额。"
    },
    "plan:plan-0028": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "mistral-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0029": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "mistral-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0030": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "mistral-plans"
      ],
      "reason": "与官方原币种标价核对；税费及地区实付以结账页为准。"
    },
    "plan:plan-0031": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-checkout"
      ],
      "reason": "当前交互结账页价格覆盖旧公告；明确区分月付、季度和年付。"
    },
    "plan:plan-0032": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-checkout"
      ],
      "reason": "当前交互结账页价格覆盖旧公告；明确区分月付、季度和年付。"
    },
    "plan:plan-0033": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-checkout"
      ],
      "reason": "当前交互结账页价格覆盖旧公告；明确区分月付、季度和年付。"
    },
    "plan:plan-0034": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-transition"
      ],
      "reason": "官方确认V1结束自动续订；历史数字仅供追溯，当前不能购买。"
    },
    "plan:plan-0035": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-transition"
      ],
      "reason": "官方确认V1结束自动续订；历史数字仅供追溯，当前不能购买。"
    },
    "plan:plan-0036": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-legacy"
      ],
      "reason": "官方确认仅存量续费，但未公开存量价格，不能套用V3当前价。"
    },
    "plan:plan-0037": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-legacy"
      ],
      "reason": "官方确认仅存量续费，但未公开存量价格，不能套用V3当前价。"
    },
    "plan:plan-0038": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-legacy"
      ],
      "reason": "官方确认仅存量续费，但未公开存量价格，不能套用V3当前价。"
    },
    "api:Anthropic|Claude Sonnet 5.5": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:Anthropic|Claude Sonnet 5": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:Anthropic|Claude Opus 5.5": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "claude-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-6-astra": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-6.1-sol": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-6-sol": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-sol"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-6-luna": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-5.6-sol": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-5.6-terra": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-terra"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-5.6-luna": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-luna"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:OpenAI|gpt-5.3-codex（编程向）": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "openai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:Google|Gemini 3.1 Pro Preview": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "google-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:Z.ai|GLM-5.3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:DeepSeek|deepseek-flash (V4.1-Flash)": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "deepseek-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "api:DeepSeek|deepseek-v4-pro (V4-Pro-0813)": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "deepseek-api"
      ],
      "reason": "核对标准短上下文/低峰原币种单价；单位每百万tokens。"
    },
    "payg:DeepSeek|deepseek-flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "deepseek-api"
      ],
      "reason": "核对输入、输出和缓存命中原币种刊例。"
    },
    "payg:DeepSeek|deepseek-v4-pro": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "deepseek-api"
      ],
      "reason": "核对输入、输出和缓存命中原币种刊例。"
    },
    "payg:Z.ai|GLM-5.3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-api"
      ],
      "reason": "核对输入、输出和缓存命中原币种刊例。"
    },
    "payg:Z.ai|GLM-5.3-Flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "zai-api"
      ],
      "reason": "核对输入、输出和缓存命中原币种刊例。"
    },
    "plan:plan-0039": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-opencode-zen"
      ],
      "reason": "确认美元 PAYG，无固定月订阅或年付月均价；本记录 null 不代表免费。充值手续费单列，未作为模型 token 价加价。"
    },
    "plan:plan-0040": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-opencode-go"
      ],
      "reason": "确认正常续费 $10/月；官方现行表未列首月减价或年付价，保持年付为 null。每工作区一名订阅成员。"
    },
    "plan:plan-0041": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-opencode-enterprise"
      ],
      "reason": "官网仅提供按席位定制报价，没有可公开确认的月费或年费，保持两者 null。"
    },
    "plan:plan-0042": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-r4"
      ],
      "reason": "现行官网没有 $5 Starter，既有已下架说明保留；官网未给出旧档 $5 价格或明确永久退役公告，无法独立重新确认旧价与退役状态。"
    },
    "plan:plan-0043": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-r4"
      ],
      "reason": "确认一次性 $50 预付包，含 $300 额度，30 天有效；不是按月自动续费。价格未变，但当前已售罄，仅能加入候补名单。"
    },
    "plan:plan-0044": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-r4"
      ],
      "reason": "确认一次性 $10 包含 $60 额度、30 天有效；官网当前名 Code Lite 而非 Standard，并显示售罄。"
    },
    "plan:plan-0045": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-r4"
      ],
      "reason": "确认 Code Pro 一次性 $20 包含 $120 额度、30 天有效；价格未变，但当前售罄，仅提供候补名单。"
    },
    "plan:plan-0046": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-zenmux-subscription"
      ],
      "reason": "确认免费 $0，仅限 Studio 聊天，没有 API；priceY=0 是免费口径，不代表提供年付订阅。"
    },
    "plan:plan-0047": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-zenmux-subscription"
      ],
      "reason": "确认个人月付美元价格与库存相同；官方订阅表未列年付价，保持 priceY=null。"
    },
    "plan:plan-0048": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-zenmux-subscription"
      ],
      "reason": "确认个人月付美元价格与库存相同；官方订阅表未列年付价，保持 priceY=null。"
    },
    "plan:plan-0049": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-zenmux-subscription"
      ],
      "reason": "确认个人月付美元价格与库存相同；官方订阅表未列年付价，保持 priceY=null。"
    },
    "plan:plan-0050": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-zenmux-payg"
      ],
      "reason": "确认美元充值制：1 Credit=$1 API 用量，起充 $5，最高 $25,000；没有固定月订阅或年付月均价。此项仅确认计费与价格口径，未重新确认库存中的赠送比例。"
    },
    "plan:plan-0051": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-packy-api-unreachable",
        "relays-packy-codex"
      ],
      "reason": "官网来自 Packy Codex 的官方跳转，但本次连接被关闭，无法确认当前人民币充值兑换比例、起充金额或促销；保留库存历史值，不用第三方榜单补价。"
    },
    "plan:plan-0052": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-packy-codex"
      ],
      "reason": "官网实际渲染明确已停售并引导 PackyAPI 按量使用。现存 ¥60 来自历史社区限购券，无法与页面残留的美元档对应，不换算或改写历史数字，也不作为当前可购买价格。"
    },
    "plan:plan-0053": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aicodemirror-unreachable"
      ],
      "reason": "官方定价端点及主站本次均无法连接，浏览器显示 ERR_CONNECTION_CLOSED。月费、年付总额和年付月均价均无法确认；保留历史值，无价格 patch。"
    },
    "plan:plan-0054": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aicodemirror-unreachable"
      ],
      "reason": "官方定价端点及主站本次均无法连接，浏览器显示 ERR_CONNECTION_CLOSED。月费、年付总额和年付月均价均无法确认；保留历史值，无价格 patch。"
    },
    "plan:plan-0055": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aicodemirror-unreachable"
      ],
      "reason": "官方定价端点及主站本次均无法连接，浏览器显示 ERR_CONNECTION_CLOSED。月费、年付总额和年付月均价均无法确认；保留历史值，无价格 patch。"
    },
    "plan:plan-0056": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方文档无法连接。本次无法确认 FREE 当前发放或退役状态；历史已下架标记和零价格保留，不将搜索缓存当现行官方证据。"
    },
    "plan:plan-0057": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方定价文档无法连接；当前价格、付款周期、年付及是否仍可下单都未得到直接官方确认，保留历史值。搜索索引中的旧价不作为本次已确认价格。"
    },
    "plan:plan-0058": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方定价文档无法连接；当前价格、付款周期、年付及是否仍可下单都未得到直接官方确认，保留历史值。搜索索引中的旧价不作为本次已确认价格。"
    },
    "plan:plan-0059": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方定价文档无法连接；当前价格、付款周期、年付及是否仍可下单都未得到直接官方确认，保留历史值。搜索索引中的旧价不作为本次已确认价格。"
    },
    "plan:plan-0060": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方定价文档无法连接；当前价格、付款周期、年付及是否仍可下单都未得到直接官方确认，保留历史值。搜索索引中的旧价不作为本次已确认价格。"
    },
    "plan:plan-0061": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-88code-unreachable",
        "relays-88code-docs-unreachable"
      ],
      "reason": "官网 403、官方定价文档无法连接；当前价格、付款周期、年付及是否仍可下单都未得到直接官方确认，保留历史值。搜索索引中的旧价不作为本次已确认价格。"
    },
    "plan:plan-0062": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-duck-unavailable"
      ],
      "reason": "官网定价页在本环境显示地区限制 Service unavailable；无法确认兑换比例、分组倍率、充值方式或现行注册状态，保留历史信息，不用搜索摘要替代官网确认。"
    },
    "plan:plan-0063": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aigocode-en",
        "relays-aigocode-cn"
      ],
      "reason": "确认人民币正常包价与库存相同，但官方套餐名已变为 Pro；周期是 4 周而非自然月，官网未列年付价。"
    },
    "plan:plan-0064": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aigocode-en",
        "relays-aigocode-cn"
      ],
      "reason": "确认人民币正常包价与库存相同，但官方套餐名已变为 Max；周期是 4 周而非自然月，官网未列年付价。"
    },
    "plan:plan-0065": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-aigocode-en",
        "relays-aigocode-cn"
      ],
      "reason": "确认人民币正常包价与库存相同，但官方套餐名已变为 Ultra；周期是 4 周而非自然月，官网未列年付价。"
    },
    "plan:plan-0066": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-devpass",
        "relays-devpass-terms"
      ],
      "reason": "确认三档正常月费 $29/$79/$179，年付未列。截至核对日仍为 3 倍用量；已公告 2026-10-15 新订阅及此后首次续费降为 2 倍，不能提前把未来规则视为当前额度。"
    },
    "plan:plan-0067": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-chutes-pricing",
        "relays-chutes-starter",
        "relays-chutes-policy"
      ],
      "reason": "库存是 Base / Plus / Pro（$3/$10/$20）合并历史条目，不是单独的 Plus。当前官网仅确认 Plus $10/月、Pro $20/月；旧 $3 Base 在较早官方公告存在，但现行页未列，也没有找到明确迁移为 Plus 或永久停售的公告。因此不能把不同档位 $10 覆盖旧记录最低 $3；保留历史价格与名称，整条组合标为待核。官方 2026-02-27 公告已将订阅价值上限改为 5 倍 PAYG，用量原固定请求数也应等待当前额度页确认。"
    },
    "plan:plan-0068": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "正常月费仍 $1，另收 processing fee。官网当前含 $10 credits、估计约 9K 请求、优惠后最高约 $15 用量，与库存 15K / $20 不同；此变化是用量估计而非月费。"
    },
    "plan:plan-0069": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "确认美元正常月费与库存相同，官网额外收取 processing fee；没有将折扣模型用量面值当订阅费用，未列年付价。"
    },
    "plan:plan-0070": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "确认美元正常月费与库存相同，官网额外收取 processing fee；没有将折扣模型用量面值当订阅费用，未列年付价。"
    },
    "plan:plan-0071": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "确认美元正常月费与库存相同，官网额外收取 processing fee；没有将折扣模型用量面值当订阅费用，未列年付价。"
    },
    "plan:plan-0072": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "确认美元正常月费与库存相同，官网额外收取 processing fee；没有将折扣模型用量面值当订阅费用，未列年付价。"
    },
    "plan:plan-0073": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-command"
      ],
      "reason": "确认 Provider 为 $15/月加 processing fee，此外再按 API 用量付费；充值余额不过期。不是单纯零月费 PAYG，未列年付价。"
    },
    "plan:plan-0074": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-kiro"
      ],
      "reason": "确认免费 $0/月；priceY=0 是免费口径，不表示有年付订阅。首次升级送 $20 credits 是一次性奖励，不影响付费档正常续费价。"
    },
    "plan:plan-0075": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-kiro",
        "relays-kiro-subscription"
      ],
      "reason": "确认正常美元月费与库存相同，官网计价原文为每用户每月。social login / AWS Builder ID 用户可自行订阅，团队使用要求每位开发者拥有独立订阅；不能仅凭 per user 将个人档归为团队 seat=true。在本项目 seat 会使其退出 isPersonalMonthly 与 eligibleProfiles，因此保持库存个人分类；税另计，首次升级 $20 账单抵扣不改变正常续费价，现行页未列年付价。"
    },
    "plan:plan-0076": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-kiro",
        "relays-kiro-subscription"
      ],
      "reason": "确认正常美元月费与库存相同，官网计价原文为每用户每月。social login / AWS Builder ID 用户可自行订阅，团队使用要求每位开发者拥有独立订阅；不能仅凭 per user 将个人档归为团队 seat=true。在本项目 seat 会使其退出 isPersonalMonthly 与 eligibleProfiles，因此保持库存个人分类；税另计，首次升级 $20 账单抵扣不改变正常续费价，现行页未列年付价。"
    },
    "plan:plan-0077": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-kiro",
        "relays-kiro-subscription"
      ],
      "reason": "确认正常美元月费与库存相同，官网计价原文为每用户每月。social login / AWS Builder ID 用户可自行订阅，团队使用要求每位开发者拥有独立订阅；不能仅凭 per user 将个人档归为团队 seat=true。在本项目 seat 会使其退出 isPersonalMonthly 与 eligibleProfiles，因此保持库存个人分类；税另计，首次升级 $20 账单抵扣不改变正常续费价，现行页未列年付价。"
    },
    "plan:plan-0078": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-kiro",
        "relays-kiro-subscription"
      ],
      "reason": "确认正常美元月费与库存相同，官网计价原文为每用户每月。social login / AWS Builder ID 用户可自行订阅，团队使用要求每位开发者拥有独立订阅；不能仅凭 per user 将个人档归为团队 seat=true。在本项目 seat 会使其退出 isPersonalMonthly 与 eligibleProfiles，因此保持库存个人分类；税另计，首次升级 $20 账单抵扣不改变正常续费价，现行页未列年付价。"
    },
    "plan:plan-0079": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-factory"
      ],
      "reason": "确认个人正常月付美元价格与库存相同，官网未列个人年付价；没有把独立 Teams 的基础月费和席位费误套到个人档。"
    },
    "plan:plan-0080": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-factory"
      ],
      "reason": "确认个人正常月付美元价格与库存相同，官网未列个人年付价；没有把独立 Teams 的基础月费和席位费误套到个人档。"
    },
    "plan:plan-0081": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-factory"
      ],
      "reason": "确认个人正常月付美元价格与库存相同，官网未列个人年付价；没有把独立 Teams 的基础月费和席位费误套到个人档。"
    },
    "plan:plan-0088": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-canopy"
      ],
      "reason": "确认 Pro Bundle $30，按月收费，未列年付价。此核对仅确认价格：现行页按模型展示相对用量，没有直接证实库存 500 请求/天、10000 请求/月的固定数字，不将这些数字标为此次已确认。"
    },
    "plan:plan-0089": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "relays-opencode-go",
        "relays-opencode-go-catalog"
      ],
      "reason": "确认正常续费 $40/月，官网未列年付价；模型用量估计差异不能算作套餐折扣或订阅价变化。"
    },
    "plan:plan-0090": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses"
      ],
      "reason": "官网现售价格、USD 和个人/席位计费口径与旧值一致；付费档当前按月计费。"
    },
    "plan:plan-0091": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses",
        "tools-github-annual-legacy"
      ],
      "reason": "官网现售月价、USD 与旧值一致；旧 Pro/Pro+ 年付属于存量合同，期满转 Free。"
    },
    "plan:plan-0092": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses",
        "tools-github-annual-legacy"
      ],
      "reason": "官网现售月价、USD 与旧值一致；旧 Pro/Pro+ 年付属于存量合同，期满转 Free。"
    },
    "plan:plan-0093": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses"
      ],
      "reason": "官网现售价格、USD 和个人/席位计费口径与旧值一致；付费档当前按月计费。"
    },
    "plan:plan-0094": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses"
      ],
      "reason": "官网现售价格、USD 和个人/席位计费口径与旧值一致；付费档当前按月计费。"
    },
    "plan:plan-0095": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-github-plans",
        "tools-github-licenses"
      ],
      "reason": "官网现售价格、USD 和个人/席位计费口径与旧值一致；付费档当前按月计费。"
    },
    "plan:plan-0096": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-pricing"
      ],
      "reason": "Hobby 免费，平台固定费 0 与旧值一致。"
    },
    "plan:plan-0097": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs"
      ],
      "reason": "印度专属现售标价为 ₹649/月含税；旧 $8 是换算近似，不能作为原币厂商标价。"
    },
    "plan:plan-0098": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs",
        "tools-cursor-pricing"
      ],
      "reason": "直接切官网年付后确认折月价，月付与年付旧值均一致。"
    },
    "plan:plan-0099": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs",
        "tools-cursor-pricing"
      ],
      "reason": "直接切官网年付后确认折月价，月付与年付旧值均一致。"
    },
    "plan:plan-0100": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs",
        "tools-cursor-pricing"
      ],
      "reason": "直接切官网年付后确认折月价，月付与年付旧值均一致。"
    },
    "plan:plan-0101": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs",
        "tools-cursor-pricing"
      ],
      "reason": "官网 Standard 支持年付，旧空年付价遗漏可比较价格。"
    },
    "plan:plan-0102": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-docs",
        "tools-cursor-pricing"
      ],
      "reason": "官网 Premium 支持年付，旧空年付价遗漏可比较价格。"
    },
    "plan:plan-0103": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cursor-pricing"
      ],
      "reason": "Enterprise 为定制销售报价，没有统一公开单价。"
    },
    "plan:plan-0104": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0105": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing",
        "tools-devin-grandfather"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0106": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0107": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "两页都确认 full seat $40/月，但主页描述另加 $80 团队费，官方 billing 文档详细表描述 $80 最低总额。总价条件冲突，保留历史数值与底价说明，不猜新公式。"
    },
    "plan:plan-0108": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0109": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0110": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-pricing",
        "tools-devin-billing"
      ],
      "reason": "当前新订价格与旧值一致；旧用户保价和限期模型赠送不取代正常新订价格，未公布现售年付价。"
    },
    "plan:plan-0111": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-devin-enterprise",
        "tools-devin-pricing"
      ],
      "reason": "ACU 合同费率由订单约定、联系销售，旧空价正确。"
    },
    "plan:plan-0112": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-zed-pricing"
      ],
      "reason": "永久免费 Personal 对应旧 Free 行，固定平台费一致。"
    },
    "plan:plan-0113": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-zed-pricing"
      ],
      "reason": "Pro 月价 $10 与旧值一致，含 $5 tokens；官网只公布月价。"
    },
    "plan:plan-0114": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-zed-pricing"
      ],
      "reason": "$30/席位/月，无最低席位；25+ 可以合同采购，未公布标准年付价。"
    },
    "plan:plan-0115": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-augment-pricing",
        "tools-augment-token-billing"
      ],
      "reason": "Business 是整团队固定费用、≤50 席位，不按 $100 乘人数；旧数值及席位口径一致。"
    },
    "plan:plan-0116": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-augment-pricing"
      ],
      "reason": "Enterprise 按合同定制用户与用量价格，年折扣需销售报价。"
    },
    "plan:plan-0117": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-cline-source",
        "tools-cline-provider"
      ],
      "reason": "开源本体无订阅费；模型按量消费需另支付，旧 0 为本体价格。"
    },
    "plan:plan-0118": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-clinepass"
      ],
      "reason": "独立可选订阅为 $9.99/月，未公布年付档，与旧价一致。"
    },
    "plan:plan-0119": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-roo-archive"
      ],
      "reason": "官方明确扩展关闭且仓库归档；保留历史开源 0 价，不能标成现售免费入口，也没有官方转向 Roomote 的证据。"
    },
    "plan:plan-0120": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-roomote-pricing"
      ],
      "reason": "官网自托管≤10 用户免费且无许可证；自备基础设施和模型 key。"
    },
    "plan:plan-0121": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-roomote-pricing"
      ],
      "reason": "Cloud 整团队月费与旧值一致；7 天为试用，不是续费免费档，模型费用另付。"
    },
    "plan:plan-0122": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-roomote-pricing"
      ],
      "reason": "Cloud 整团队月费与旧值一致；7 天为试用，不是续费免费档，模型费用另付。"
    },
    "plan:plan-0123": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-roomote-pricing"
      ],
      "reason": "Cloud 整团队月费与旧值一致；7 天为试用，不是续费免费档，模型费用另付。"
    },
    "plan:plan-0124": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-kilo-pricing"
      ],
      "reason": "平台免费与推理无加价仍成立，但购买 credits 的 5% 处理费不可遗漏。"
    },
    "plan:plan-0125": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-kilo-pricing"
      ],
      "reason": "$15/人/月平台费一致；充值和计算是额外成本。"
    },
    "plan:plan-0126": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-amp-pricing"
      ],
      "reason": "Hobby 免费，自有模型 key/订阅不收 Amp token 费，orb 计算可另按量或自建。"
    },
    "plan:plan-0127": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-amp-pricing"
      ],
      "reason": "Megawatt 月价一致，真实官网切换已确认此前未确认的 Gigawatt。"
    },
    "plan:plan-0128": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-jetbrains-plans",
        "tools-jetbrains-buy-blocked"
      ],
      "reason": "官方文档直接确认月价与旧值一致；国际购买页在本环境跳转中国联系销售页，未直接核实现售年费。保留旧年价，不用搜索缓存代替确认。"
    },
    "plan:plan-0129": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-jetbrains-plans",
        "tools-jetbrains-buy-blocked"
      ],
      "reason": "官方文档直接确认月价与旧值一致；国际购买页在本环境跳转中国联系销售页，未直接核实现售年费。保留旧年价，不用搜索缓存代替确认。"
    },
    "plan:plan-0130": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-jetbrains-plans",
        "tools-jetbrains-buy-blocked"
      ],
      "reason": "官方文档直接确认月价与旧值一致；国际购买页在本环境跳转中国联系销售页，未直接核实现售年费。保留旧年价，不用搜索缓存代替确认。"
    },
    "plan:plan-0131": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-jetbrains-plans",
        "tools-jetbrains-buy-blocked"
      ],
      "reason": "官方文档直接确认月价与旧值一致；国际购买页在本环境跳转中国联系销售页，未直接核实现售年费。保留旧年价，不用搜索缓存代替确认。"
    },
    "plan:plan-0132": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-openrouter-pricing"
      ],
      "reason": "Free 无固定费、付费为 PAYG，旧 5.5%/8% 注记一致。"
    },
    "plan:plan-0133": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-lovable-plans"
      ],
      "reason": "Free 固定订阅费为 0，包含每日免费额度；价格与旧值一致。"
    },
    "plan:plan-0134": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-lovable-plans"
      ],
      "reason": "官网公布年费总额 $250；折月统一按总額÷12 四舍五入到两位，为 $20.83。$21 是官网展示的整数近似。"
    },
    "plan:plan-0135": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-lovable-plans"
      ],
      "reason": "官网年费 $500，真实折月为 $41.67；$42 为整数展示近似。"
    },
    "plan:plan-0136": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-lovable-plans"
      ],
      "reason": "Enterprise 价格及条款以合同和销售报价为准。"
    },
    "plan:plan-0137": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-bolt-pricing"
      ],
      "reason": "官网 Free $0，不把付费档赠送 Forge 期限当免费订阅价。"
    },
    "plan:plan-0138": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-bolt-pricing"
      ],
      "reason": "官网年付切换直接显示折月 $18，旧空值遗漏年付。"
    },
    "plan:plan-0139": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-bolt-pricing"
      ],
      "reason": "官网 Teams 年付为 $27/成员/月，旧空值遗漏年付。"
    },
    "plan:plan-0140": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-bolt-pricing"
      ],
      "reason": "Enterprise 定制报价，没有统一公开费用。"
    },
    "plan:plan-0141": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-replit-pricing",
        "tools-replit-renewal"
      ],
      "reason": "真实官网月/年切换确认 $20/$18；这是正常价，旧订户降价在续费时生效。"
    },
    "plan:plan-0142": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-replit-pricing",
        "tools-replit-renewal"
      ],
      "reason": "起档 $100 月付/$90 年付折月，无每 builder 追加费用，旧值一致。"
    },
    "plan:plan-0143": {
      "status": "custom",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-replit-pricing"
      ],
      "reason": "Enterprise 展示 Custom，seat 上限由合同约定。"
    },
    "plan:plan-0144": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-aws-q-pricing"
      ],
      "reason": "永久免费层与旧 0 价一致；免费层有额度边界。"
    },
    "plan:plan-0145": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "tools-aws-q-pricing"
      ],
      "reason": "$19/用户月与旧值一致；首月按比例、Java 转换超额另按行计费，未公布标准年付价。"
    },
    "plan:plan-0082": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-xfyun"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。 官网模型资源抵扣系数单独生效，6,000/45,000/90,000为额度上限，不能视为所有模型的等量实际请求。"
    },
    "plan:plan-0083": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-xfyun"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。 与高效版同样按模型系数扣额度，30,000不是所有模型均可调用30,000次。"
    },
    "plan:plan-0084": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-plan"
      ],
      "reason": "直接读取官网HTML表格，年付总价除12与现有月均一致；非首购促销。"
    },
    "plan:plan-0085": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-plan"
      ],
      "reason": "直接读取官网HTML表格，年付总价除12与现有月均一致；非首购促销。"
    },
    "plan:plan-0086": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-plan"
      ],
      "reason": "直接读取官网HTML表格，年付总价除12与现有月均一致；非首购促销。"
    },
    "plan:plan-0087": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-plan"
      ],
      "reason": "直接读取官网HTML表格，年付总价除12与现有月均一致；非首购促销。"
    },
    "plan:plan-0146": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0147": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0148": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0149": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-codebuddy-pricing"
      ],
      "reason": "官网企业页已公开旗舰每人每月198元、1席起；原来的仅定制报价缺少公开套餐。"
    },
    "plan:plan-0150": {
      "status": "unverified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-huawei"
      ],
      "reason": "已打开官网，只有免费体验说明，独立正式订阅月费及年付、每席位价格未公开。"
    },
    "plan:plan-0151": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官网确认V1为历史停售方案；旧金额缺少本次可查的官方原始价证据，保留历史金额，不作为当前可购价格。"
    },
    "plan:plan-0152": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官网确认V1为历史停售方案；旧金额缺少本次可查的官方原始价证据，保留历史金额，不作为当前可购价格。"
    },
    "plan:plan-0153": {
      "status": "retired",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官网确认V1为历史停售方案；旧金额缺少本次可查的官方原始价证据，保留历史金额，不作为当前可购价格。"
    },
    "plan:plan-0154": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官方老用户续费表公开年付月均，原priceY为空；新用户仍无资格购买。"
    },
    "plan:plan-0155": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官方老用户续费表公开年付月均，原priceY为空；新用户仍无资格购买。"
    },
    "plan:plan-0156": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-legacy"
      ],
      "reason": "官方老用户续费表公开年付月均，原priceY为空；新用户仍无资格购买。"
    },
    "plan:plan-0157": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-buy"
      ],
      "reason": "官网动态购买页逐项切换连续包月、包年确认；现有priceM为展示目录价，自动续订折扣已在原备注中区分。"
    },
    "plan:plan-0158": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-buy"
      ],
      "reason": "官网动态购买页逐项切换连续包月、包年确认；现有priceM为展示目录价，自动续订折扣已在原备注中区分。"
    },
    "plan:plan-0159": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-buy"
      ],
      "reason": "官网动态购买页逐项切换连续包月、包年确认；现有priceM为展示目录价，自动续订折扣已在原备注中区分。"
    },
    "plan:plan-0160": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-buy"
      ],
      "reason": "官网团队标准公开每席月598元、年付9折月均538.2元；旧priceY空缺，原第三方价格备注应替换。"
    },
    "plan:plan-0161": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-member"
      ],
      "reason": "官方会员页已切换包月与包年，包含Kimi Code权益；年总额除12为79/159/559元。"
    },
    "plan:plan-0162": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-member"
      ],
      "reason": "官方会员页已切换包月与包年，包含Kimi Code权益；年总额除12为79/159/559元。"
    },
    "plan:plan-0163": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-member"
      ],
      "reason": "官方会员页已切换包月与包年，包含Kimi Code权益；年总额除12为79/159/559元。"
    },
    "plan:plan-0164": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0165": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0166": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0167": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0168": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0169": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0170": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0171": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0172": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0173": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-plan"
      ],
      "reason": "月、年、每席位均与官网一致；个人首购88折与年付88折分开，不作为连续月费。"
    },
    "plan:plan-0174": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0175": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0176": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0177": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-plan"
      ],
      "reason": "官网现行价格与币种、计费单位一致；未公开年价处继续保持未知。"
    },
    "plan:plan-0178": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-baidu-plan"
      ],
      "reason": "官方目录月价确认；首购五折及首次续费六折仅活动权益，不覆盖目录月费。"
    },
    "plan:plan-0179": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-baidu-plan"
      ],
      "reason": "官方目录月价确认；首购五折及首次续费六折仅活动权益，不覆盖目录月费。"
    },
    "plan:plan-0180": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-baidu-plan"
      ],
      "reason": "官方目录月价确认；首购五折及首次续费六折仅活动权益，不覆盖目录月费。"
    },
    "plan:plan-0181": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-baidu-plan"
      ],
      "reason": "官方目录月价确认；首购五折及首次续费六折仅活动权益，不覆盖目录月费。"
    },
    "plan:plan-0182": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qiniu"
      ],
      "reason": "官网直接展示对应月套餐金额；未公开逐档精确年付价，不据最低4折反推priceY。"
    },
    "plan:plan-0183": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qiniu"
      ],
      "reason": "官网直接展示对应月套餐金额；未公开逐档精确年付价，不据最低4折反推priceY。"
    },
    "plan:plan-0184": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qiniu"
      ],
      "reason": "官网直接展示对应月套餐金额；未公开逐档精确年付价，不据最低4折反推priceY。"
    },
    "plan:plan-0185": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0186": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0187": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-qoder-pricing"
      ],
      "reason": "官网动态价格页与阿里云官方计费说明一致；个人年付总价除12；企业无已确认独立年付折扣。"
    },
    "plan:plan-0188": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-codebuddy-pricing"
      ],
      "reason": "官网月付目录价与连续包年672/1344/6720元（月均56/112/560）均已逐个切换确认；续费月价折扣单列。"
    },
    "plan:plan-0189": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-codebuddy-pricing"
      ],
      "reason": "官网月付目录价与连续包年672/1344/6720元（月均56/112/560）均已逐个切换确认；续费月价折扣单列。"
    },
    "plan:plan-0190": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-codebuddy-pricing"
      ],
      "reason": "官网月付目录价与连续包年672/1344/6720元（月均56/112/560）均已逐个切换确认；续费月价折扣单列。"
    },
    "plan:plan-0191": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-codebuddy-pricing"
      ],
      "reason": "官网月付目录价与连续包年672/1344/6720元（月均56/112/560）均已逐个切换确认；续费月价折扣单列。"
    },
    "plan:plan-0192": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-cn"
      ],
      "reason": "Chrome现行官方目录月价与原数据一致；首购与连续包月折扣单独记录，未公开年付价。"
    },
    "plan:plan-0193": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-cn"
      ],
      "reason": "Chrome现行官方目录月价与原数据一致；首购与连续包月折扣单独记录，未公开年付价。"
    },
    "plan:plan-0194": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-cn"
      ],
      "reason": "Chrome现行官方目录月价与原数据一致；首购与连续包月折扣单独记录，未公开年付价。"
    },
    "plan:plan-0195": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-cn"
      ],
      "reason": "Chrome现行官方目录月价与原数据一致；首购与连续包月折扣单独记录，未公开年付价。"
    },
    "plan:plan-0196": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-cn"
      ],
      "reason": "Chrome现行官方目录月价与原数据一致；首购与连续包月折扣单独记录，未公开年付价。"
    },
    "plan:plan-0197": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-trae-global"
      ],
      "reason": "官网动态页已逐项切换：保留连续包月10美元，新增年付月均7.5美元；静态正文20美元已被动态真实价格覆写。"
    },
    "plan:plan-0198": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-dumate"
      ],
      "reason": "官方价格页明确次月59/129元，原数据采用续费价正确；不将首月9.9/69元覆盖月费。"
    },
    "plan:plan-0199": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-dumate"
      ],
      "reason": "官方价格页明确次月59/129元，原数据采用续费价正确；不将首月9.9/69元覆盖月费。"
    },
    "plan:plan-0200": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-dumate"
      ],
      "reason": "官方价格页明确次月59/129元，原数据采用续费价正确；不将首月9.9/69元覆盖月费。"
    },
    "plan:plan-0201": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-comate"
      ],
      "reason": "官网明确个人标准版Free免费，首次注册5000积分；免费权益有限，不混同Pro/Max付费额度。"
    },
    "plan:plan-0202": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-lkeap-plan"
      ],
      "reason": "已找到原api.lkeap产品对应最新官方TokenHub文档，40/200元为目录原价；历史促销不作当前价格。"
    },
    "plan:plan-0203": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-lkeap-plan"
      ],
      "reason": "已找到原api.lkeap产品对应最新官方TokenHub文档，40/200元为目录原价；历史促销不作当前价格。"
    },
    "plan:plan-0204": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-token"
      ],
      "reason": "官网现行限时月价一致，已区分原价；团队标准每席位计费。未公布活动截止，不猜长期续费，购买以结算页为准。 当前官方限额为订阅月制，不再有原记录的7天固定窗口发放描述。"
    },
    "plan:plan-0205": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-token"
      ],
      "reason": "官网现行限时月价一致，已区分原价；团队标准每席位计费。未公布活动截止，不猜长期续费，购买以结算页为准。"
    },
    "plan:plan-0206": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-token"
      ],
      "reason": "官网现行限时月价一致，已区分原价；团队标准每席位计费。未公布活动截止，不猜长期续费，购买以结算页为准。"
    },
    "plan:plan-0207": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-token"
      ],
      "reason": "官网现行限时月价一致，已区分原价；团队标准每席位计费。未公布活动截止，不猜长期续费，购买以结算页为准。"
    },
    "plan:plan-0208": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-token"
      ],
      "reason": "官网现行限时月价一致，已区分原价；团队标准每席位计费。未公布活动截止，不猜长期续费，购买以结算页为准。"
    },
    "plan:plan-0209": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-coding",
        "cn-ali-token"
      ],
      "reason": "官方明确目录及后续月价200元。Coding Plan页说09:30补货，Token Plan概述说售罄不补充，库存存在官方文档冲突，保留限购且不承诺可购买。"
    },
    "plan:plan-0210": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-volc-price",
        "cn-volc-promo"
      ],
      "reason": "官网公开常规月价与当前活动：新老用户均最多享两个月优惠，新购、续费、升配共用资格；第三个月恢复原价。年付折扣未公开。"
    },
    "plan:plan-0211": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-volc-price",
        "cn-volc-promo"
      ],
      "reason": "官网公开常规月价与当前活动：新老用户均最多享两个月优惠，新购、续费、升配共用资格；第三个月恢复原价。年付折扣未公开。"
    },
    "plan:plan-0212": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-volc-price",
        "cn-volc-agent"
      ],
      "reason": "官网套餐概览确认Small常规月价40元；年付折扣未公开。该档不支持Kimi-K3或视频生成；未把Coding Lite首两个月优惠套用到Agent Small。"
    },
    "api:智谱 BigModel|GLM-5.3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-api"
      ],
      "reason": "官网HTML当前标准按量价确认；包含未命中输入、输出、命中缓存。"
    },
    "api:月之暗面 Kimi|Kimi K3（kimi-k3）": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-api"
      ],
      "reason": "官网正文表组件暂未渲染，但原始官方HTML明确DocTable列及数据；标准未命中输入，不把缓存写入重计到命中价。"
    },
    "api:月之暗面 Kimi|Kimi K2.7-Code": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-api"
      ],
      "reason": "官方HTML表组件明确价，标准版非highspeed；缓存未命中输入。"
    },
    "api:MiniMax|MiniMax-M3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-api"
      ],
      "reason": "≤512K输入、标准服务层永久五折价；不是优先服务或高上下文档。"
    },
    "api:MiniMax|MiniMax-M2.7": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-api"
      ],
      "reason": "标准服务层，未命中输入；缓存写2.625元，highspeed另售。"
    },
    "api:阿里云百炼|qwen3-coder-next": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-next"
      ],
      "reason": "华北2北京、≤32K标准目录价，非国际跨地域价；无缓存支持。"
    },
    "api:阿里云百炼|qwen3-coder-plus": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-plus"
      ],
      "reason": "华北2北京、≤32K输入、标准服务；这里缓存为隐式命中0.8，显式命中0.4仅另一计费方式。"
    },
    "api:阿里云百炼|qwen3-coder-flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-flash"
      ],
      "reason": "华北2北京、≤32K标准目录价，隐式缓存命中0.2元。"
    },
    "api:火山引擎（豆包/方舟）|doubao-seed-2.0-code": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-volc-price"
      ],
      "reason": "Chrome直接读取官方常规在线推理表；低优、批量推理均不用于本标准价，缓存存储0.017元/百万tokens/小时另计。"
    },
    "api:火山引擎（豆包/方舟）|doubao-seed-2.1-pro": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-volc-price"
      ],
      "reason": "Chrome直接读取官方常规在线推理表；低优、批量推理均不用于本标准价，缓存存储0.017元/百万tokens/小时另计。"
    },
    "api:阶跃星辰 StepFun|step-5-preview": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-api"
      ],
      "reason": "官网表明确每百万tokens，未命中输入及标准输出，非套餐Credit折算价。"
    },
    "api:阶跃星辰 StepFun|step-3.7-flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-step-api"
      ],
      "reason": "官网表明确每百万tokens；标准按量、缓存命中0.27元。"
    },
    "api:硅基流动 SiliconFlow|zai-org/GLM-5.3": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-siliconflow"
      ],
      "reason": "官网实时可用模型页显示输入8元，原6元已不一致；GLM-5.1短上下文6元不适用于GLM-5.3。"
    },
    "api:硅基流动 SiliconFlow|moonshotai/Kimi-K2.7-Code": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-siliconflow"
      ],
      "reason": "官方聚合平台自身挂牌价，不用原厂价格代作验证。"
    },
    "api:硅基流动 SiliconFlow|deepseek-ai/DeepSeek-V4-Pro": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-siliconflow"
      ],
      "reason": "官方聚合平台自身目录价；其他型号及时段价格并不覆盖此模型。"
    },
    "api:硅基流动 SiliconFlow|Qwen/Qwen3.8-27B": {
      "status": "changed",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-siliconflow"
      ],
      "reason": "官网精确模型ID Qwen/Qwen3.8-27B 当前3/12元，旧1.8/14.4来自不同模型或历史档。"
    },
    "api:阿里云百炼|qwen3.8-flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-38flash"
      ],
      "reason": "官网华北2北京标准目录价，精确模型ID已确认。"
    },
    "api:腾讯云 TokenHub|hy3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-api"
      ],
      "reason": "广州标准后付费，每百万tokens价格。"
    },
    "api:腾讯云 TokenHub|hy4-preview": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-tokenhub-api"
      ],
      "reason": "广州标准后付费，每百万tokens价格。"
    },
    "api:小米 MiMo|mimo-v2.6-flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-api"
      ],
      "reason": "国内实时标准价；缓存写入仅限时免费，批量推理另有半价。"
    },
    "api:小米 MiMo|mimo-v2.6-pro": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-mimo-api"
      ],
      "reason": "国内实时标准价；非ultraspeed或批量档。"
    },
    "payg:智谱 BigModel|GLM-5.3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-api"
      ],
      "reason": "官网标准API按量与现有一致。"
    },
    "payg:智谱 BigModel|GLM-5.3-Flash": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-glm-api"
      ],
      "reason": "官网标准API按量与现有一致。"
    },
    "payg:月之暗面 Kimi|Kimi K3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-api"
      ],
      "reason": "官方HTML表确认缓存写入5min/1h分别20/40元，标准输入/输出/命中一致。"
    },
    "payg:月之暗面 Kimi|Kimi K2.7-Code": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-kimi-api"
      ],
      "reason": "官网标准版确认；highspeed并不适用此行。"
    },
    "payg:MiniMax|MiniMax-M3": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-minimax-api"
      ],
      "reason": "≤512K输入、标准服务层价，与现行刊例一致。"
    },
    "payg:阿里云百炼|qwen3-coder-plus": {
      "status": "verified",
      "checkedAt": "2026-10-04",
      "sourceIds": [
        "cn-ali-plus"
      ],
      "reason": "华北2≤32K标准调用、隐式命中0.8元保持现值，不用显式命中0.4元覆盖。"
    }
  }
};
function priceCheckOf(p, kind = "plan") {
  if (!p) return null;
  return PRICE_CHECKS.rows[kind + ":" + (kind === "plan" ? p.id : p.vendor + "|" + p.model)] || null;
}
function isPriceConfirmed(p, kind = "plan") {
  const check = priceCheckOf(p, kind);
  return !check || (check.status !== "unverified" && check.status !== "retired");
}
