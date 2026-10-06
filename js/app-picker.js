/* ============ Coding Plan 比价中心 — 帮我选 ============ */
"use strict";

/* 预算比较的容差：CNY 价格带小数，浮点相等判断统一加这一点余量 */
const BUDGET_EPS = 0.05;

/* ---------- 帮我选 ---------- */
const PICK_ACCENT = ["#34d399", "#f59e0b", "#6366f1", "#f472b6"];
/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
const TOOL_OWN_VENDOR = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
const OWN_VENDOR_NOTE = {
  Cursor: "Cursor 各档的模型池和额外按量费用不同；请对照具体套餐的总费用、支持工具和额度规则。",
  Anthropic: "Claude 官方订阅用的是 Claude Code 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
  OpenAI: "ChatGPT 官方订阅用 Codex 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
};

function metricMatchesPlan(m, p) {
  if (m.ref != null) return findPlanReference(m.ref) === p;
  return m.vendor === p.vendor && m.plan === p.plan;
}
function hasCodingSurface(p) {
  if (typeof p.codingSurface === "boolean") return p.codingSurface;
  const tools = resolvedField(p, "tools");
  if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) return true;
  return hasOwnClient(p);
}
/* 通用推荐排除国家限定套餐；工具免费不等于模型推理免费。 */
function recommendablePlan(p) {
  return isPriceConfirmed(p) && !isRelay(p) && !isRetiredPlan(p) && offerable(p) && hasCodingSurface(p) &&
    hasIncludedModelQuota(p) && isPurchaseCountryAllowed(p, "");
}
function matchesTool(p, tool) {
  if (tool === "any") return true;
  const tools = resolvedField(p, "tools");
  if (tool === "claude") return /Claude Code/i.test(tools);
  if (tool === "codex") return /Codex/i.test(tools);
  if (tool === "cursor") return p.vendor === "Cursor" || /\bCursor\b/i.test(tools);
  if (tool === "own") {
    if (typeof p.ownClient === "boolean") return p.ownClient;
    if (/Claude Code/i.test(tools) || /Codex/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) return false;
    return hasOwnClient(p);
  }
  return true;
}
function planTitle(p) {
  const parts = String(p.vendor || "").split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && String(p.plan || "").startsWith(last)) return parts.slice(0, -1).concat(p.plan).join(" ");
  return `${p.vendor} ${p.plan}`;
}
function priceLine(p) {
  if (p.priceM === 0) return "免费";
  if (p.cur === "CNY") return priceText(p, "priceM") + "/月";
  return priceText(p, "priceM") + "/月，约 " + fmtCNY(cnyOf(p, "M"));
}
function moneyHtml(p) {
  if (!p) return "<em>—</em>";
  if (p.priceM === 0) return "<em>免费</em>";
  const raw = priceText(p, "priceM");
  return `<em>${esc(raw)}</em>/月`;
}
function lineHtml(k, text) {
  return `<div class="qc-line"><span class="k">${esc(k)}</span>${esc(text)}</div>`;
}
function bandRank(band) { return band === "A" ? 3 : band === "B" ? 2 : 1; }
function catRank(p) { return p.cat === "official" ? 3 : p.cat === "tool" ? 2 : p.cat === "cloud" ? 1 : 0; }
/* 计划名里的 5x / 20x 优先（× 和 x 都算）。额度原文里的「5× Pro」也算加窗；「5× Free」只是入门档基线。
   额度文案统一走 resolvedField，继承行（「同某档」）也能命中倍率写法。 */
function multiplier(p) {
  const fromPlan = String(p.plan || "").match(/(\d+)\s*[x×]/i);
  if (fromPlan) return Number(fromPlan[1]);
  const q = resolvedField(p, "quota") || "";
  const named = q.match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
  if (named) return Number(named[1]);
  if (/(\d+)\s*×\s*Free/i.test(q)) return 1;
  return 0;
}
function splitModelAccess(text) {
  const parts = String(text || "").split(/[；;]/);
  if (parts.length >= 2 && /按(?:\s*M\s*token|牌价|量)/.test(parts[parts.length - 1])) {
    return { included: parts.slice(0, -1).join("；"), metered: parts[parts.length - 1] };
  }
  return { included: String(text || ""), metered: "" };
}
function modelTextForRoles(p) {
  const own = resolvedField(p, "models");
  if (matchModelRoles(own).length) return own;
  if (!/旗舰|同级|全模型|全系/.test(own)) return own;
  const idx = PLANS.indexOf(p);
  for (let i = idx - 1; i >= 0; i--) {
    if (PLANS[i].vendor !== p.vendor) break;
    const prev = resolvedField(PLANS[i], "models");
    if (matchModelRoles(prev).some((r) => r.task === "hard")) return prev;
  }
  return own;
}
/* 每层先应用自己的排除，再合并上层增补；Pro 的“不含旗舰”不会否定 Pro+ 新增 Opus。 */
function modelRoleAccess(p, seen = new Set()) {
  if (!p || seen.has(p)) return { included: [], metered: [] };
  const stack = new Set(seen);
  stack.add(p);
  const base = p.modelBaseRef != null ? findPlanReference(p.modelBaseRef) : null;
  if (p.modelBaseRef != null && !base) return { included: [], metered: [] };
  const inherited = base ? modelRoleAccess(base, stack) : { included: [], metered: [] };
  const local = Array.isArray(p.modelIncludes) ? p.modelIncludes.join("、")
    : p.modelBaseRef != null ? p.models : modelTextForRoles(p);
  const access = splitModelAccess(local);
  const excluded = p.modelExcludes || [];
  const merge = (previous, text) => [...new Map(previous.concat(matchModelRoles(text)).map((r) => [r.id, r])).values()]
    .filter((r) => !excluded.some((name) => r.re.test(name)));
  return { included: merge(inherited.included, access.included), metered: merge(inherited.metered, access.metered) };
}
/* 重置周期和模型之间的共享关系是两个独立事实。
   不同模型的条数区间并不能证明它们拥有独立额度池；未公开时保留 unknown。 */
function quotaWindowPeriod(p) { return p.windowPeriod || "unknown"; }
function quotaSharing(p) { return p.quotaSharing || "unknown"; }
function oneSharedWindow(p) {
  return quotaWindowPeriod(p) === "5h" && quotaSharing(p) === "shared";
}
function roleUseText(role) {
  if (!role) return "";
  if (role.ceiling) return "复杂任务的高强度选项，实际消耗以套餐说明为准";
  return role.task === "hard" ? "适合复杂编码和重构任务" : "适合日常编码和轻量任务";
}
function quotaLabel(p) {
  const period = quotaWindowPeriod(p);
  return period === "5h" ? "5 小时窗口" : period === "month" ? "月度额度" : "额度规则";
}
function metricForRole(p, role) {
  if (!role) return null;
  const rows = METRICS_ALL
    .filter((m) => metricMatchesPlan(m, p) && role.re.test(m.model || ""))
    .map((m) => ({ m, c: computeMetrics(m), conf: provenance(m).conf }))
    .filter((r) => r.c);
  const rank = { "高": 3, "中": 2, "低": 1 };
  rows.sort((a, b) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || ((a.m.isEst ? 1 : 0) - (b.m.isEst ? 1 : 0)));
  return rows[0] || null;
}
function knownTokens(p, role) {
  const met = metricForRole(p, role);
  if (!met || met.conf !== "高" || met.c.moLow == null) return 0;
  return met.c.moLow;
}
function planProfile(p) {
  const access = modelRoleAccess(p);
  const hasQuota = hasIncludedModelQuota(p);
  const included = hasQuota ? access.included : [];
  const metered = hasQuota ? access.metered : access.included.concat(access.metered);
  const hard = included.filter((r) => r.task === "hard" && !r.ceiling);
  const ceilings = included.filter((r) => r.task === "hard" && r.ceiling);
  hard.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  ceilings.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  const headline = hard[0] || ceilings[0] || null;
  const loose = included.filter((r) => r.task === "daily" && r.burn === "slow");
  const shared = oneSharedWindow(p);
  const windowPeriod = quotaWindowPeriod(p);
  const sharing = quotaSharing(p);
  return { p, included, metered, headline, ceilings, loose, shared, windowPeriod, sharing,
    internalDaily: sharing === "separate" ? loose : [] };
}
function windowStats(x) {
  const role = x.headline || x.loose[0];
  return { tokens: knownTokens(x.p, role), mult: multiplier(x.p), price: cnyOf(x.p, "M") || 0 };
}
function betterWindow(a, b) {
  const A = windowStats(a);
  const B = windowStats(b);
  if (A.tokens !== B.tokens) return A.tokens > B.tokens;
  if (A.mult !== B.mult) return A.mult > B.mult;
  /* tokens 与倍率完全打平时取更便宜的：代表档收敛的是「同厂商同角色的性价比之选」 */
  return A.price < B.price;
}
function tokSpan(c, keyLow, keyHigh) {
  const lo = c[keyLow];
  const hi = c[keyHigh];
  if (hi > lo * 1.05) return fmtTok(lo) + "–" + fmtTok(hi);
  return fmtTok(lo);
}
function windowSentence(p, role) {
  const period = quotaWindowPeriod(p);
  const q = String(resolvedField(p, "quota")).replace(/\s+/g, " ");
  if (period === "none") return `目前没有 5 小时上限；总体用量仍以官方仪表盘为准。原文：${trunc(q, 96)}`;
  if (period === "month") return `额度按月计量；具体重置和超额规则请核对官网。原文：${trunc(q, 96)}`;
  if (period === "unknown") return `额度重置周期或窗口上限未公开。原文：${trunc(q, 96)}`;
  const met = metricForRole(p, role);
  if (met && met.conf === "高" && met.c.fLow != null) {
    return `5 小时窗口按官方每周额度折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens。`;
  }
  const bit = dailyRoleBit(role);
  if (new RegExp(escRe(bit), "i").test(q) && /5\s*小时|\/5h/i.test(q)) {
    return `5 小时窗口按官方原文：${trunc(q, 96)}`;
  }
  if (met && met.conf === "中" && met.c.fLow != null) {
    return `5 小时窗口按${met.m.method || provenance(met.m).text}大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens，置信度中。`;
  }
  if (/5\s*小时|\/5h/i.test(q)) return `官方没有公布这个模型的 5 小时 token 数。原文：${trunc(q, 80)}`;
  return `官方没有公布 5 小时窗口。额度原文：${trunc(q, 72)}`;
}
function withinBudget(p) {
  if (!recommendablePlan(p)) return false;
  if (pickerState.region !== "all" && p.region !== pickerState.region) return false;
  if (!matchesTool(p, pickerState.tool)) return false;
  if (pickerState.budget === "0") return isFreeCodingEntry(p);
  if (!isPersonalMonthly(p)) return false;
  if (pickerState.budget === "any") return true;
  return (cnyOf(p, "M") || 0) <= Number(pickerState.budget) + BUDGET_EPS;
}
function eligibleProfiles() {
  return PLANS.filter(withinBudget).map(planProfile);
}
function representatives(list, keyOf, better) {
  const pick = better || betterWindow;
  const best = new Map();
  list.forEach((x) => {
    const key = keyOf(x);
    const prev = best.get(key);
    if (!prev || pick(x, prev)) best.set(key, x);
  });
  return [...best.values()];
}
function betterDailyTier(a, b) {
  const sa = hasSeparateDaily(a) ? 1 : 0;
  const sb = hasSeparateDaily(b) ? 1 : 0;
  if (sa !== sb) return sa > sb;
  const ta = knownTokens(a.p, a.loose[0]);
  const tb = knownTokens(b.p, b.loose[0]);
  if (ta !== tb) return ta > tb;
  const ma = multiplier(a.p);
  const mb = multiplier(b.p);
  if (ma !== mb) return ma > mb;
  return (cnyOf(a.p, "M") || 0) < (cnyOf(b.p, "M") || 0);
}
function chooseHardMain(pool) {
  const reps = representatives(pool.filter((x) => x.headline), (x) => x.p.vendor + "|" + x.headline.id);
  reps.sort((a, b) => {
    const band = bandRank(b.headline.band) - bandRank(a.headline.band);
    if (band) return band;
    const tok = knownTokens(b.p, b.headline) - knownTokens(a.p, a.headline);
    if (tok) return tok;
    const mult = multiplier(b.p) - multiplier(a.p);
    if (mult) return mult;
    const cat = catRank(b.p) - catRank(a.p);
    if (cat) return cat;
    const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
    if (coding) return coding;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  return reps[0] || null;
}
function chooseDailyMain(pool) {
  const reps = representatives(pool.filter((x) => x.loose.length), (x) => x.p.vendor + "|" + x.loose[0].id, betterDailyTier);
  reps.sort((a, b) => {
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep) return sep;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure) return pure;
    const tok = knownTokens(b.p, b.loose[0]) - knownTokens(a.p, a.loose[0]);
    if (tok) return tok;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  return reps[0] || null;
}
function chooseMain(pool) {
  if (pickerState.task === "daily") return chooseDailyMain(pool);
  return chooseHardMain(pool) || (pickerState.task === "both" ? chooseDailyMain(pool) : null);
}
/* 同厂商、同一主力模型、更便宜的个人档。主计划按「窗口最大」选档时会跳过中档（如不限预算直接选 Max），
   这里把被跳过的档（如 GLM Coding V3 Pro）补回可见，不然用户会以为厂商只有这一档。 */
function cheaperTiers(main) {
  if (!main.headline) return [];
  const roleId = main.headline.id;
  const mainPrice = cnyOf(main.p, "M") || 0;
  const rows = [];
  PLANS.forEach((p) => {
    if (p.vendor !== main.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    if ((cnyOf(p, "M") || 0) >= mainPrice - BUDGET_EPS) return;
    const prof = planProfile(p);
    if (prof.headline && prof.headline.id === roleId) rows.push(prof);
  });
  rows.sort((a, b) => (cnyOf(b.p, "M") || 0) - (cnyOf(a.p, "M") || 0));
  return rows;
}
function peerNote(main, pool) {
  if (!main.headline || knownTokens(main.p, main.headline) <= 0) return "";
  const peers = representatives(
    pool.filter((x) => x.headline && x.p.vendor !== main.p.vendor && x.headline.band === main.headline.band),
    (x) => x.p.vendor
  );
  const quiet = peers.filter((x) => knownTokens(x.p, x.headline) <= 0);
  quiet.sort((a, b) => {
    const code = (/code/i.test(b.p.plan) ? 1 : 0) - (/code/i.test(a.p.plan) ? 1 : 0);
    if (code) return code;
    const cat = catRank(b.p) - catRank(a.p);
    if (cat) return cat;
    return (cnyOf(b.p, "M") || 0) - (cnyOf(a.p, "M") || 0) || a.p.vendor.localeCompare(b.p.vendor, "zh");
  });
  const top = quiet[0];
  if (!top) return "";
  return `同预算还能买 ${planTitle(top.p)}（${top.headline.name}）。官方没有给出高置信的 5 小时 token 数，所以主计划用了能看清窗口的这一档。`;
}
function nextTier(current) {
  const dailyLead = pickerState.task === "daily" || !current.headline;
  const roleId = dailyLead ? current.loose[0] && current.loose[0].id : current.headline.id;
  let best = null;
  PLANS.forEach((p) => {
    if (p.vendor !== current.p.vendor || !isPersonalMonthly(p) || !recommendablePlan(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    const price = cnyOf(p, "M") || 0;
    if (price <= (cnyOf(current.p, "M") || 0) + BUDGET_EPS) return;
    const prof = planProfile(p);
    if (dailyLead) {
      if (!prof.loose.some((r) => r.id === roleId)) return;
    } else if (roleId) {
      if (!prof.headline || prof.headline.id !== roleId) return;
    } else if (!prof.loose.length) return;
    if (!best || price < (cnyOf(best.p, "M") || 0)) best = prof;
  });
  return best;
}
function unlockText(cur, next) {
  const dailyLead = pickerState.task === "daily" || !cur.headline;
  const role = dailyLead ? cur.loose[0] : cur.headline;
  const nextRole = dailyLead ? next.loose.find((r) => role && r.id === role.id) : next.headline;
  if (role && nextRole && role.id === nextRole.id) {
    const a = metricForRole(cur.p, role);
    const b = metricForRole(next.p, nextRole);
    if (cur.windowPeriod === "5h" && next.windowPeriod === "5h" && a && b && a.conf === "高" && b.conf === "高" && a.c.fLow != null && b.c.fLow != null) {
      return `模型仍是 ${role.name}。5 小时窗口从大约 ${tokSpan(a.c, "fLow", "fHigh")} tokens 提到 ${tokSpan(b.c, "fLow", "fHigh")} tokens，加的钱换来更大的窗口。`;
    }
    const mult = resolvedField(next.p, "quota").match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
    if (mult) return `模型仍是 ${role.name}。官方额度是 ${mult[1]}× ${mult[2]}，具体重置周期以官方说明为准。`;
    return `模型仍是 ${role.name}。未公开的额度差不能按价格推算；请核对官网。额度原文：${trunc(resolvedField(next.p, "quota"), 72)}`;
  }
  if (dailyLead && next.loose.length) return `这档带日常模型 ${next.loose.map((r) => r.name).join("、")}。额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
  if (next.headline && (!cur.headline || bandRank(next.headline.band) > bandRank(cur.headline.band))) {
    return `这档才能把复杂任务模型换成 ${next.headline.name}。${roleUseText(next.headline)}。`;
  }
  if (next.loose.length) return `这档带日常模型 ${next.loose.map((r) => r.name).join("、")}。${roleUseText(next.loose[0])}。`;
  return `额度原文：${trunc(resolvedField(next.p, "quota"), 80)}`;
}
function dailyEntries(pool, main) {
  /* 主计划候选可以只看月付档，补充池还须包含真正免费且附赠推理的入口。
     免费工具/BYOK、团队与国家限定档仍按同一资格规则排除。 */
  const seen = new Set(pool.map((x) => x.p));
  const free = PLANS.filter((p) => !seen.has(p) && !p.seat && p.cat !== "team" &&
    isFreeCodingEntry(p) && recommendablePlan(p) &&
    (pickerState.region === "all" || p.region === pickerState.region) && matchesTool(p, pickerState.tool)).map(planProfile);
  return pool.concat(free).filter((x) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
}
/* 官方在额度原文里给日常模型点名条数的（如 Luna 350–3,000 条/5h），折成每 5h 的 M tokens 作排序信号 */
function dailyRoleBit(role) {
  const words = String(role.name).split(/\s+/);
  const last = words[words.length - 1];
  return /^[A-Za-z][A-Za-z0-9.-]{2,}$/.test(last) ? last : role.name;
}
function dailyQuotaSignal(p, role) {
  if (!role) return 0;
  const q = String(resolvedField(p, "quota") || "").replace(/\s+/g, " ");
  const bit = escRe(dailyRoleBit(role));
  const range = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*[–—-]\\s*(\\d[\\d,]*)\\s*条", "i"));
  if (range) return (Number(range[2].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  const single = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*条", "i"));
  if (single) return (Number(single[1].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  return 0;
}
/* 只有明确标注模型之间分池的套餐才算独立日常池。 */
function hasSeparateDaily(x) {
  return x.internalDaily.length > 0;
}
function pickSupplement(main, pool) {
  const list = dailyEntries(pool, main).slice().sort((a, b) => {
    const free = (isFreeCodingEntry(b.p) ? 1 : 0) - (isFreeCodingEntry(a.p) ? 1 : 0);
    if (free) return free;
    const sep = (hasSeparateDaily(b) ? 1 : 0) - (hasSeparateDaily(a) ? 1 : 0);
    if (sep) return sep;
    const sig = dailyQuotaSignal(b.p, b.loose[0]) - dailyQuotaSignal(a.p, a.loose[0]);
    if (sig) return sig;
    const pure = (b.headline ? 0 : 1) - (a.headline ? 0 : 1);
    if (pure) return pure;
    const coding = (hasCodingSurface(b.p) ? 1 : 0) - (hasCodingSurface(a.p) ? 1 : 0);
    if (coding) return coding;
    const ta = knownTokens(a.p, a.loose[0]), tb = knownTokens(b.p, b.loose[0]);
    if (ta !== tb) return tb - ta;
    const ma = multiplier(a.p), mb = multiplier(b.p);
    if (ma !== mb) return mb - ma;
    return (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0);
  });
  const cap = pickerState.budget === "any" ? Infinity : pickerState.budget === "0" ? 0 : Number(pickerState.budget);
  const remain = cap - (cnyOf(main.p, "M") || 0);
  const fit = list.filter((x) => (cnyOf(x.p, "M") || 0) <= remain + BUDGET_EPS);
  const dreamed = list.find((x) => hasSeparateDaily(x) && (cnyOf(x.p, "M") || 0) > remain + BUDGET_EPS);
  return { chosen: fit[0] || null, dreamed: dreamed || null, remain };
}
function sameWindowText(profile) {
  const names = profile.included.filter((r) => r.task === "daily").map((r) => r.name);
  if (!profile.headline) return "";
  if (!names.length) return `${profile.headline.name} 这档没有另外的慢烧模型。`;
  if (profile.shared) return `${names.join("、")} 和 ${profile.headline.name} 共用同一个 5 小时窗口。日常使用会消耗这一窗口的额度。`;
  return windowNoteShort(profile);
}
function meteredText(profile) {
  if (!profile.metered.some((r) => r.id === "claude-opus")) return "";
  return "Claude Opus 在另一池，按百万 tokens 计价，不在这档送的慢烧额度里。";
}
function pickerMoney(amount, cur) {
  const symbol = { USD: "$", CNY: "¥", INR: "₹" }[cur] || cur + " ";
  return symbol + Number(amount.toFixed(2)).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
/* 年付折月价可能已四舍五入；备注有全年原价时先用原文，避免 $200 被算成 $200.04。 */
function annualPaymentText(p) {
  if (!p || !(p.priceY > 0)) return "未列公开年付价。";
  const match = String(p.note || "").match(/(?:连续包年|年付|包年)\s*([$¥₹])\s*([\d,]+(?:\.\d+)?)\s*(?:\/年|[（(；;]|$)/);
  const expected = { USD: "$", CNY: "¥", INR: "₹" }[p.cur];
  const exact = match && match[1] === expected ? Number(match[2].replace(/,/g, "")) : null;
  const total = exact != null ? exact : p.priceY * 12;
  return `${exact == null ? "约 " : ""}${pickerMoney(total, p.cur)}/年${p.seat ? "，每席位" : ""}，需按年支付；折月 ${priceText(p, "priceY")}/月${exact == null ? "（全年金额按折月价×12估算）" : ""}。`;
}
function pickerPaymentHtml(p) {
  if (!p || !(p.priceM > 0)) return "";
  const bits = [lineHtml("月付原价", `${priceText(p, "priceM")}/月${p.seat ? "，每席位" : ""}；按原币支付。`)];
  if (p.priceY > 0) {
    bits.push(lineHtml("年付全年", annualPaymentText(p)));
  }
  if (/首购|新购|活动|优惠|续费|连续包|试用|折|限时|原价/.test(p.note || "")) {
    bits.push(`<details class="qc-payment-note"><summary>优惠与续费原文</summary><p>${esc(p.note)}</p></details>`);
  }
  return bits.join("");
}
function pickerVerificationHtml(p) {
  const check = priceCheckOf(p);
  if (!check) return lineHtml("本档核查", "暂无逐条核查记录，请在官网核对价格与权益。");
  const sources = check.sourceIds.map((id) => PRICE_CHECKS.sources[id]).filter(Boolean);
  const date = lineHtml("本档核查", `${check.checkedAt} · ${priceCheckLabel(p)}${check.reason ? "。" + check.reason : ""}`);
  const evidence = sources.map((s) => `<li>${esc(s.evidence || "来源页面记录")} ${safeHref(s.url) ? `<a href="${safeHref(s.url)}" target="_blank" rel="noopener">核查来源 ↗</a>` : ""}</li>`).join("");
  return date + (evidence ? `<details class="qc-verification"><summary>查看核查依据（${sources.length} 项）</summary><ul>${evidence}</ul></details>` : "");
}
function pickerPlanActions(p) {
  if (!p) return "";
  const href = safeHref(p.url);
  return `<div class="qc-actions"><button type="button" class="qc-action cmp-add" data-plan-id="${esc(p.id)}" data-vendor="${esc(p.vendor)}" data-plan="${esc(p.plan)}">＋对比</button><button type="button" class="qc-action" data-view-plan="${esc(p.id)}" aria-label="查看 ${esc(planTitle(p))} 完整权益">完整权益</button>${href ? `<a class="qc-action" href="${href}" target="_blank" rel="noopener" tabindex="0"><span>官网</span><span class="qc-action-icon" aria-hidden="true">↗</span></a>` : ""}</div>`;
}
function quickCard(accent, title, value, body, plan) {
  return `<div class="quick-card" style="--qc-accent:${accent}">
    <div class="qc-title">${esc(title)}</div>
    <div class="qc-value">${value}</div>
    <div class="qc-sub">${body}${pickerPaymentHtml(plan)}</div>
    ${pickerPlanActions(plan)}
  </div>`;
}
function mainCard(main, pool) {
  const p = main.p;
  const dailyLead = pickerState.task === "daily" && main.loose.length;
  const bits = [`<b>${esc(planTitle(p))}</b><div class="badge-row">${badgeHtml(p)}</div>`];
  bits.push(lineHtml("选取理由", pickerChoiceReason(main)));
  if (dailyLead) {
    const names = main.loose.map((r) => r.name).join("、");
    bits.push(lineHtml("日常", `${names}。${roleUseText(main.loose[0])}。`));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.loose[0])));
    if (main.headline) bits.push(lineHtml("同档还有", `${main.headline.name}。${windowNoteShort(main)}`));
  } else if (main.headline) {
    const ceiling = main.ceilings.find((r) => r.id !== main.headline.id);
    let hard = `${main.headline.name}。${roleUseText(main.headline)}。`;
    if (ceiling) hard += `${ceiling.name} 也能开，${roleUseText(ceiling)}。`;
    bits.push(lineHtml("复杂任务", hard));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.headline)));
  } else {
    bits.push(lineHtml("日常", `${main.loose.map((r) => r.name).join("、")}。${roleUseText(main.loose[0])}。`));
    bits.push(lineHtml(quotaLabel(p), windowSentence(p, main.loose[0])));
  }
  const meter = meteredText(main);
  if (meter) bits.push(lineHtml("另一池", meter));
  else if (!dailyLead && !main.headline) bits.push(lineHtml("复杂任务", "这组条件里没有能单独拿来做复杂任务的模型，这档先覆盖日常。"));
  const peer = !dailyLead && main.headline ? peerNote(main, pool) : "";
  if (peer) bits.push(lineHtml("同预算", peer));
  const cheaper = cheaperTiers(main);
  if (cheaper.length) {
    const list = cheaper.slice(0, 2).map((x) => `${x.p.plan}（${priceLine(x.p)}）`).join("、");
    bits.push(lineHtml("省钱档", `同一个 ${main.headline.name} 还有更便宜的 ${list}，具体额度差请核对官网。`));
  }
  bits.push(pickerVerificationHtml(p));
  if (p.region === "intl" && pickerState.region !== "cn") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  const title = dailyLead || !main.headline ? "主计划 · 日常" : "主计划 · 复杂任务";
  return quickCard(PICK_ACCENT[0], title, moneyHtml(p), bits.join(""), p);
}
/* 中间卡的三条底线：能不花钱覆盖就不推荐第二档；要另买时写清差多少；实在没有才留空值 */
function dailyCard(main, pool) {
  const dailyNames = main.loose.map((r) => r.name).join("、");
  const windowNote = windowNoteShort(main);
  const included = (title, text) => quickCard(PICK_ACCENT[1], title, "<em>已包含</em>",
    `<b>${esc(planTitle(main.p))}</b>${lineHtml("不用另买", text)}${lineHtml("合计月费", priceLine(main.p))}`, main.p);
  if (pickerState.task === "hard") {
    if (main.loose.length) {
      return included("日常覆盖", `日常可以用同一档里的 ${dailyNames}。${windowNote}`);
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>",
      lineHtml("这次不配", "筛选以复杂任务为主，这一档也没有能日常慢烧的模型。"), null);
  }
  if (pickerState.task === "daily") {
    const meter = meteredText(main);
    if (meter) {
      return quickCard(PICK_ACCENT[1], "复杂任务", "<em>按量另计</em>",
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("另一池", meter)}`, main.p);
    }
    if (main.headline) {
      return included("复杂任务", `${main.headline.name} 也在这档里，可用于偶尔的复杂任务。${windowNote}`);
    }
    return quickCard(PICK_ACCENT[1], "复杂任务", "<em>—</em>",
      lineHtml("这档不包含", "这档没有匹配到复杂任务模型；需要时可改选复杂任务，比较包含这类模型的套餐。"), null);
  }
  if (main.internalDaily.length) {
    return included("日常覆盖", `用 ${dailyNames}。${roleUseText(main.internalDaily[0])}。${windowNote}`);
  }
  /* 已有日常模型时，仅明确的共享 5h 窗口才考虑补充；未知共享关系不能成为加购依据。 */
  if (main.loose.length && !main.shared) {
    return included("日常覆盖", `用 ${dailyNames} 做日常。${windowNote}当前信息不足以据此建议购买第二份订阅。`);
  }
  const shared = main.headline ? sameWindowText(main) : "";
  const sup = pickSupplement(main, pool);
  if (sup.chosen) {
    const roles = sup.chosen.internalDaily.length ? sup.chosen.internalDaily : sup.chosen.loose;
    const total = (cnyOf(main.p, "M") || 0) + (cnyOf(sup.chosen.p, "M") || 0);
    const free = isFreeCodingEntry(sup.chosen.p);
    const fee = free ? "，使用免费入口，无需额外月费" : `，另付 ${priceLine(sup.chosen.p)}`;
    let text = `日常用 ${roles.map((r) => r.name).join("、")}${fee}。${roleUseText(roles[0])}。这是${free ? "独立的免费入口" : "另一份订阅"}，用量不占主计划额度。`;
    if (main.loose.length) text += `也可以继续用主计划里的 ${dailyNames}，无需第二份订阅。`;
    if (sup.dreamed) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(sup.dreamed.p, "M") || 0);
      text += `若要 ${planTitle(sup.dreamed.p)} 里更大的独立池，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(sup.chosen.p),
      `<b>${esc(planTitle(sup.chosen.p))}</b><div class="badge-row">${badgeHtml(sup.chosen.p)}</div>${shared ? lineHtml("主计划额度", shared) : ""}${lineHtml("可选补充", text)}${lineHtml("两档合计月费", `约 ${fmtCNY(total)}（按页面汇率折算）`)}`, sup.chosen.p);
  }
  if (main.loose.length) {
    /* 主计划里的慢烧模型和复杂任务共用窗口，预算内没有更合适的独立慢烧档：日常就在本档覆盖 */
    let text = `用 ${dailyNames} 做日常。${roleUseText(main.loose[0])}。${windowNote}`;
    const dream = sup.dreamed || dailyEntries(pool, main)[0];
    if (dream) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
      text += `另一份日常订阅 ${planTitle(dream.p)} 月费 ${priceLine(dream.p)}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    } else {
      text += "当前条件下没有带独立慢烧池的另一档。";
    }
    return included("日常覆盖", text);
  }
  const dream = sup.dreamed || dailyEntries(pool, main)[0];
  if (dream) {
    const names = dream.loose.map((r) => r.name).join("、");
    const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
    const text = `当前预算还剩 ${fmtCNY(Math.max(0, sup.remain))}。另一份订阅可提供 ${names}，月费 ${priceLine(dream.p)}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(dream.p),
      `<b>${esc(planTitle(dream.p))}</b><div class="badge-row">${badgeHtml(dream.p)}</div><div class="qc-miss">当前预算放不下第二档。</div>${lineHtml("差多少", text)}`, dream.p);
  }
  return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>", lineHtml("没有第二档", "没有找到符合地区和工具、且带慢烧模型的另一档。"), null);
}
function upgradeCard(main) {
  const next = nextTier(main);
  if (!next) {
    return quickCard(PICK_ACCENT[2], "预算再往上", "<em>暂无下一档</em>", lineHtml("当前条件", "没有找到符合地区和工具的更高同厂商通用档位；未公开的额度不能据此断定已经到顶。"), main.p);
  }
  const over = pickerState.budget !== "any" && (cnyOf(next.p, "M") || 0) > Number(pickerState.budget) + BUDGET_EPS;
  const flag = over ? `<div class="qc-miss">高于当前预算。</div>` : "";
  return quickCard(PICK_ACCENT[2], "预算再往上", moneyHtml(next.p), `${flag}<b>${esc(planTitle(next.p))}</b>${lineHtml("多出来的是", unlockText(main, next))}`, next.p);
}
/* 工具自家厂商的入门个人档（忽略预算，但尊重地区筛选；地区内没有时回退到国际档并提示） */
function ownVendorCard(main) {
  const vendor = TOOL_OWN_VENDOR[pickerState.tool];
  if (!vendor) return null;
  if (main && main.p.vendor === vendor) return null;
  const all = PLANS.filter((p) => p.vendor === vendor && isPersonalMonthly(p) && recommendablePlan(p))
    .sort((a, b) => (cnyOf(a, "M") || 0) - (cnyOf(b, "M") || 0));
  if (!all.length) return null;
  const inRegion = all.filter((p) => pickerState.region === "all" || p.region === pickerState.region);
  const plan = inRegion[0] || all[0];
  const regionMiss = !inRegion.length;
  const prof = planProfile(plan);
  const bits = [`<b>${esc(planTitle(plan))}</b><div class="badge-row">${badgeHtml(plan)}</div>`];
  const role = prof.headline || prof.loose[0];
  if (role) {
    const use = prof.headline ? "复杂任务" : "日常";
    bits.push(lineHtml(use, `${role.name}。${roleUseText(role)}。`));
  } else {
    bits.push(lineHtml("额度", trunc(resolvedField(plan, "quota"), 80)));
  }
  if (prof.loose.length && prof.headline) bits.push(lineHtml("日常", `${prof.loose.map((r) => r.name).join("、")}。${windowNoteShort(prof)}`));
  const overBudget = pickerState.budget !== "any" &&
    (cnyOf(plan, "M") || 0) > (pickerState.budget === "0" ? 0 : Number(pickerState.budget) + BUDGET_EPS);
  if (overBudget) {
    const cap = pickerState.budget === "0" ? "（筛选为免费）" : " " + fmtCNY(Number(pickerState.budget));
    bits.push(`<div class="qc-miss">高于当前预算${cap}。<button type="button" class="linkish" data-set-picker="budget=any">把预算放开</button></div>`);
  } else if (main && !regionMiss) bits.push(lineHtml("和主计划", `它没有赢下这组条件的主计划（见第一张卡）。${OWN_VENDOR_NOTE[vendor] || ""}`));
  if (regionMiss) bits.push(`<div class="qc-avoid">${esc(vendor)} 只有国际档，当前地区筛选把它排除了。<button type="button" class="linkish" data-set-picker="region=all">把地区改成「不限」再看</button></div>`);
  else if (plan.region === "intl") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  return quickCard(PICK_ACCENT[3], `${shortVendor(vendor)} 自家订阅`, moneyHtml(plan), bits.join(""), plan);
}
function windowNoteShort(prof) {
  if (prof.windowPeriod === "none") return "目前没有 5 小时上限；总体用量仍需查看官方仪表盘。";
  if (prof.sharing === "separate") return "官方说明日常模型与复杂任务模型分池计算额度。";
  if (prof.shared) return "日常模型和复杂任务模型共用同一个 5 小时窗口，日常使用会消耗这份额度。";
  if (prof.windowPeriod === "month" && prof.sharing === "shared") return "日常模型和复杂任务模型共用月度额度池。";
  if (prof.sharing === "shared") return "日常模型和复杂任务模型共用同一额度池；重置周期或窗口上限未公开。";
  return "模型之间的额度共享情况未公开，无法确认日常使用是否会挤占复杂任务额度。";
}
/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
function setPicker(rowKey, value) {
  const row = qs(`#picker .picker-row[data-pick="${rowKey}"]`);
  if (row) setChipPressed(row.querySelectorAll(".chip"), (x) => x.dataset.value === value);
  pickerState[rowKey] = value;
  updateAppState(() => {}, renderPicker);
}
/* 帮我选四行 chips 的高亮以 pickerState 为准（渲染时自愈，程序化改状态也不会脱钩） */
function syncPickerChips() {
  qsa("#picker .picker-row").forEach((row) => {
    setChipPressed(row.querySelectorAll(".chip"), (chip) => chip.dataset.value === pickerState[row.dataset.pick]);
  });
}
function pickerEmptyReason(pool) {
  if (pool.length) {
    const task = pickerState.task === "daily" ? "日常" : "复杂任务";
    return `有 ${pool.length} 档符合购买条件，但没有匹配到附赠的${task}模型。可以调整任务选择，或在数据表核对完整模型列表。`;
  }
  const base = PLANS.filter((p) => recommendablePlan(p) &&
    (pickerState.budget === "0" ? isFreeCodingEntry(p) : isPersonalMonthly(p)));
  const region = base.filter((p) => pickerState.region === "all" || p.region === pickerState.region);
  if (!region.length) return "所选地区没有包含编程推理额度的通用个人档。可以调整地区；国家限定套餐可在完整数据表查看。";
  const tool = region.filter((p) => matchesTool(p, pickerState.tool));
  if (!tool.length) return "所选地区没有匹配这个工具的通用个人档。可以改选工具或地区；自备 Key 的免费平台不等于免费推理。";
  return "当前预算没有匹配的通用套餐。可以提高预算或查看免费入口；国家限定套餐可在完整数据表查看。";
}
function pickerChoiceReason(profile) {
  const daily = pickerState.task === "daily" || !profile.headline;
  const role = daily ? profile.loose[0] : profile.headline;
  const parts = [`${role ? role.name : "附赠模型"} 符合所选任务，月费 ${priceLine(profile.p)}，满足当前预算、地区与工具条件`];
  if (daily && hasSeparateDaily(profile)) parts.push("日常模型与复杂任务模型明确分池，日常选择优先考虑这类额度");
  const tokens = knownTokens(profile.p, role);
  if (tokens > 0) parts.push(`有高置信的公开额度，按页面假设每月约 ${fmtTok(tokens)} tokens，可核对用量`);
  else parts.push("可用 token 总量尚缺少高置信依据，主要按模型用途、公开额度规则和月费比较");
  return parts.join("；") + "。";
}
/* 先给省钱候选，再给排序中的另一选择；尽量来自不同厂商，单厂商筛选仍可比较不同档位。 */
function alternativeProfiles(pool, main) {
  if (!main) return [];
  const suitable = pool.filter((x) => x.p !== main.p && (pickerState.task === "daily" ? x.loose.length
    : pickerState.task === "hard" ? x.headline : x.headline || x.loose.length));
  const selected = [];
  const cheapest = suitable.slice().sort((a, b) => (cnyOf(a.p, "M") || 0) - (cnyOf(b.p, "M") || 0));
  const first = cheapest.find((x) => x.p.vendor !== main.p.vendor) || cheapest[0];
  if (first) selected.push(first);
  const remaining = suitable.filter((x) => !selected.includes(x));
  const vendors = new Set([main.p.vendor, ...selected.map((x) => x.p.vendor)]);
  const different = remaining.filter((x) => !vendors.has(x.p.vendor));
  const second = chooseMain(different.length ? different : remaining);
  if (second) selected.push(second);
  return selected;
}
function alternativeCards(main, pool) {
  const alternatives = alternativeProfiles(pool, main);
  if (!alternatives.length) return "";
  const mainPrice = cnyOf(main.p, "M") || 0;
  const cards = alternatives.map((x) => {
    const difference = mainPrice - (cnyOf(x.p, "M") || 0);
    const tradeoff = difference > BUDGET_EPS ? `每月比主计划少 ${fmtCNY(difference)}；请同时比较模型与额度。`
      : x.p.vendor !== main.p.vendor ? "来自另一厂商，可以比较模型、服务权益与额度规则。" : "同厂商另一档位，可比较月费和额度规则。";
    const role = pickerState.task === "daily" ? x.loose[0] : x.headline || x.loose[0];
    const body = `<b>${esc(planTitle(x.p))}</b><div class="badge-row">${badgeHtml(x.p)}</div>${lineHtml("比较理由", tradeoff)}${lineHtml("模型与额度", `${role.name}。${windowSentence(x.p, role)}`)}${pickerVerificationHtml(x.p)}`;
    return quickCard(PICK_ACCENT[3], "预算内候选", moneyHtml(x.p), body, x.p);
  }).join("");
  return `<details class="picker-alternatives method-box"><summary>其他候选（${alternatives.length} 档，均在预算内）</summary><div class="picker-alternatives-grid">${cards}</div></details>`;
}
function renderPicker() {
  const previousFocus = document.activeElement;
  syncPickerChips();
  const pool = eligibleProfiles();
  const grid = byId("quickGrid");
  const note = byId("pickerNote");
  const main = chooseMain(pool);
  const own = ownVendorCard(main);
  if (!main) {
    grid.innerHTML = `<div class="picker-empty">${esc(pickerEmptyReason(pool))}</div>` + (own || "");
    note.textContent = own
      ? "上面是所选工具的自家订阅，供参考；请结合预算、地区和所选任务查看，参考卡不等于当前条件下的推荐。中转站不参与。"
      : "平台免费但推理另付费的工具不作为免费模型套餐推荐；国家限定套餐保留在完整数据表，不参与通用推荐。中转站不参与。";
    syncTableCmpButtons(previousFocus);
    if (typeof syncServiceControls === "function") syncServiceControls();
    return;
  }
  grid.innerHTML = [mainCard(main, pool), dailyCard(main, pool), upgradeCard(main), own, alternativeCards(main, pool)].filter(Boolean).join("");
  note.textContent = `符合条件 ${pool.length} 档。${own ? "所选工具的自家订阅卡供对照，不参与主计划排序。" : "前三张卡是一套用法："}其他候选是预算内的替代选择，无需同时购买。复杂任务按模型用途和已公开额度选择；日常额度共享情况未公开时，不据此建议加购。已包含的覆盖无需重复付费，补充订阅会列出合计月费。预算再往上可以高于当前筛选。模型角色按 ${MODEL_ROLES_ASOF} 的用法归类，不是跑分。中转站不参与。每百万 tokens 排行仍然只比价格。`;
  syncTableCmpButtons(previousFocus);
  if (typeof syncServiceControls === "function") syncServiceControls();
}
function auditProfiles() {
  /* 断言隐含「国内 + 不限预算 + 不限工具」的筛选前提（如智谱省钱档），先锁定状态，
     结束后还原，避免 ?debug=1 时污染页面正在展示的推荐。 */
  const saved = { ...pickerState };
  Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both" });
  try {
    const by = (vendor, plan) => PLANS.find((p) => p.vendor === vendor && p.plan === plan);
    const idOf = (p) => { const h = planProfile(p).headline; return h ? h.id : ""; };
    const expect = (vendor, plan, id) => {
      const got = idOf(by(vendor, plan));
      if (got !== id) console.error("[picker]", vendor, plan, "headline", got || "(none)", "expected", id || "(none)");
    };
    expect("Anthropic", "Claude Pro", "claude-opus");
    expect("Anthropic", "Claude Free", "");
    expect("Anthropic", "Claude Max 5x", "claude-opus");
    expect("Cursor", "Pro", "");
    expect("OpenAI", "ChatGPT Plus", "gpt-sol");
    expect("智谱 BigModel", "GLM Coding V3 Lite", "glm-5");
    expect("智谱 BigModel", "GLM Coding V3 Pro", "glm-5");
    expect("智谱 BigModel", "GLM Coding V3 Max", "glm-5");
    /* 不限预算时主计划会跳过中档，「省钱档」行必须能把 GLM V3 Pro 补回来 */
    const maxProfile = planProfile(by("智谱 BigModel", "GLM Coding V3 Max"));
    if (!cheaperTiers(maxProfile).some((x) => x.p.plan === "GLM Coding V3 Pro")) {
      console.error("[picker] GLM V3 Max 的省钱档应列出 GLM Coding V3 Pro");
    }
    const cursor = planProfile(by("Cursor", "Pro"));
    if (!cursor.internalDaily.some((r) => r.id === "grok")) console.error("[picker] Cursor Pro 应把 Grok 当成分开的日常额度");
    if (cursor.metered.every((r) => r.id !== "claude-opus")) console.error("[picker] Cursor Pro 的 Opus 应在按量池");
  } finally {
    Object.assign(pickerState, saved);
  }
}
