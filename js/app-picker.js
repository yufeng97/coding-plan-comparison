/* ============ Coding Plan 比价中心 — 帮我选 ============ */
"use strict";

/* ---------- 帮我选 ---------- */
const pickerState = { budget: "200", region: "cn", tool: "any", task: "both" };
const PICK_ACCENT = ["#34d399", "#f59e0b", "#6366f1", "#f472b6"];
/* 选了具体工具时，该工具自家厂商的订阅单独出一张对照卡（如点 Cursor 给 Cursor Pro）。
   自家订阅不一定赢下主计划（比如 Cursor 的旗舰走按量池），但不该从推荐里消失。 */
const TOOL_OWN_VENDOR = { claude: "Anthropic", codex: "OpenAI", cursor: "Cursor" };
const OWN_VENDOR_NOTE = {
  Cursor: "Cursor 的旗舰模型（Opus、GPT-6 等）走按量池另计费，额度池以 Grok、Composer 为主，所以没拿下复杂任务主计划；适合想把 IDE 和订阅绑在一家的情况。",
  Anthropic: "Claude 官方订阅用的是 Claude Code 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
  OpenAI: "ChatGPT 官方订阅用 Codex 本身，模型和额度都是第一方；是否最优看第一张卡的对比。",
};

function metricMatchesPlan(m, p) {
  if (Array.isArray(m.ref)) return m.ref[0] === p.vendor && m.ref[1] === p.plan;
  return m.vendor === p.vendor && m.plan === p.plan;
}
function hasCodingSurface(p) {
  const tools = resolvedField(p, "tools");
  if (/Claude Code/i.test(tools) || /\bCodex\b/i.test(tools) || p.vendor === "Cursor" || /\bCursor\b/i.test(tools)) return true;
  return hasOwnClient(p);
}
function matchesTool(p, tool) {
  if (tool === "any") return true;
  const tools = resolvedField(p, "tools");
  if (tool === "claude") return /Claude Code/i.test(tools);
  if (tool === "codex") return /Codex/i.test(tools);
  if (tool === "cursor") return p.vendor === "Cursor" || /\bCursor\b/i.test(tools);
  if (tool === "own") {
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
  const raw = p.cur === "USD" ? "$" + p.priceM : "¥" + p.priceM;
  return `<em>${esc(raw)}</em>/月`;
}
function lineHtml(k, text) {
  return `<div class="qc-line"><span class="k">${esc(k)}</span>${esc(text)}</div>`;
}
function bandRank(band) { return band === "A" ? 3 : band === "B" ? 2 : 1; }
function catRank(p) { return p.cat === "official" ? 3 : p.cat === "tool" ? 2 : p.cat === "cloud" ? 1 : 0; }
/* 计划名里的 5x / 20x 优先（× 和 x 都算）。额度原文里的「5× Pro」也算加窗；「5× Free」只是入门档基线。 */
function multiplier(p) {
  const fromPlan = String(p.plan || "").match(/(\d+)\s*[x×]/i);
  if (fromPlan) return Number(fromPlan[1]);
  const q = p.quota || "";
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
/* 同一 5 小时窗口。双池、或官方按模型分开写条数的，日常模型才算另一池。
   官方逐模型条数（如 Sol 15–160、Luna 350–3,000）是最具体的窗口信号，优先于泛泛的「共享」措辞
   （例：ChatGPT 的「Work 与 Codex 用量共享」说的是跨端共享，不是模型共用窗口）。 */
function oneSharedWindow(p) {
  const q = `${p.quota || ""} ${p.note || ""}`;
  if (/双池|按模型\s*5\s*h|按模型 5h/i.test(q)) return false;
  const named = q.match(/(?:Sol|Luna|Astra|Opus|Haiku|Sonnet)\s*[^。；]{0,24}\d/gi);
  if (named && named.length >= 2) return false;
  /* 其余情况（含泛泛的「共享」措辞）保守视为同一窗口 */
  return true;
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
  const access = splitModelAccess(modelTextForRoles(p));
  const included = matchModelRoles(access.included);
  const metered = matchModelRoles(access.metered);
  const hard = included.filter((r) => r.task === "hard" && !r.ceiling);
  const ceilings = included.filter((r) => r.task === "hard" && r.ceiling);
  hard.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  ceilings.sort((a, b) => bandRank(b.band) - bandRank(a.band));
  const headline = hard[0] || ceilings[0] || null;
  const loose = included.filter((r) => r.task === "daily" && r.burn === "slow");
  const shared = oneSharedWindow(p);
  return { p, included, metered, headline, ceilings, loose, shared, internalDaily: shared ? [] : loose };
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
  return A.price > B.price;
}
function tokSpan(c, keyLow, keyHigh) {
  const lo = c[keyLow];
  const hi = c[keyHigh];
  if (hi > lo * 1.05) return fmtTok(lo) + "–" + fmtTok(hi);
  return fmtTok(lo);
}
function windowSentence(p, role) {
  const met = metricForRole(p, role);
  if (met && met.conf === "高" && met.c.fLow != null) {
    return `5 小时窗口按官方每周额度折算大约 ${tokSpan(met.c, "fLow", "fHigh")} tokens。`;
  }
  const q = String(p.quota || "").replace(/\s+/g, " ");
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
  if (isRelay(p) || isRetiredPlan(p) || !offerable(p)) return false;
  if (pickerState.region !== "all" && p.region !== pickerState.region) return false;
  if (!matchesTool(p, pickerState.tool)) return false;
  if (pickerState.budget === "0") return isFreeCodingEntry(p);
  if (!isPersonalMonthly(p)) return false;
  if (pickerState.budget === "any") return true;
  return (cnyOf(p, "M") || 0) <= Number(pickerState.budget) + 0.05;
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
    if (p.vendor !== main.p.vendor || !isPersonalMonthly(p) || !offerable(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    if ((cnyOf(p, "M") || 0) >= mainPrice - 0.05) return;
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
  const roleId = current.headline && current.headline.id;
  let best = null;
  PLANS.forEach((p) => {
    if (p.vendor !== current.p.vendor || isRelay(p) || !isPersonalMonthly(p) || !offerable(p)) return;
    if (pickerState.region !== "all" && p.region !== pickerState.region) return;
    if (!matchesTool(p, pickerState.tool)) return;
    const price = cnyOf(p, "M") || 0;
    if (price <= (cnyOf(current.p, "M") || 0) + 0.05) return;
    const prof = planProfile(p);
    if (roleId) {
      if (!prof.headline || prof.headline.id !== roleId) return;
    } else if (!prof.loose.length) return;
    if (!best || price < (cnyOf(best.p, "M") || 0)) best = prof;
  });
  return best;
}
function unlockText(cur, next) {
  const sameHard = cur.headline && next.headline && cur.headline.id === next.headline.id;
  const sameDaily = !cur.headline && !next.headline && cur.loose[0] && next.loose[0] && cur.loose[0].id === next.loose[0].id;
  if (sameHard || sameDaily) {
    const role = cur.headline || cur.loose[0];
    const nextRole = next.headline || next.loose[0];
    const a = metricForRole(cur.p, role);
    const b = metricForRole(next.p, nextRole);
    if (a && b && a.conf === "高" && b.conf === "高" && a.c.fLow != null && b.c.fLow != null) {
      return `模型仍是 ${role.name}。5 小时窗口从大约 ${tokSpan(a.c, "fLow", "fHigh")} tokens 提到 ${tokSpan(b.c, "fLow", "fHigh")} tokens，加的钱换来更大的窗口。`;
    }
    const mult = (next.p.quota || "").match(/(\d+(?:\.\d+)?)\s*×\s*(Pro|Plus|Lite|Standard)/i);
    if (mult) return `模型仍是 ${role.name}。官方额度是 ${mult[1]}× ${mult[2]}，加的钱换来更大的窗口。`;
    return `模型仍是 ${role.name}。额度原文：${trunc(next.p.quota, 72)}`;
  }
  if (next.headline && (!cur.headline || bandRank(next.headline.band) > bandRank(cur.headline.band))) {
    return `这档才能把复杂任务模型换成 ${next.headline.name}。${next.headline.reason}。`;
  }
  if (next.loose.length) return `这档带慢烧模型 ${next.loose.map((r) => r.name).join("、")}。${next.loose[0].reason}。`;
  return `额度原文：${trunc(next.p.quota, 80)}`;
}
function dailyEntries(pool, main) {
  return pool.filter((x) => x.p !== main.p && x.p.vendor !== main.p.vendor && (x.internalDaily.length || (!x.headline && x.loose.length)));
}
/* 官方在额度原文里给日常模型点名条数的（如 Luna 350–3,000 条/5h），折成每 5h 的 M tokens 作排序信号 */
function dailyRoleBit(role) {
  const words = String(role.name).split(/\s+/);
  const last = words[words.length - 1];
  return /^[A-Za-z][A-Za-z0-9.-]{2,}$/.test(last) ? last : role.name;
}
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function dailyQuotaSignal(p, role) {
  if (!role) return 0;
  const q = String(p.quota || "").replace(/\s+/g, " ");
  const bit = escRe(dailyRoleBit(role));
  const range = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*[–—-]\\s*(\\d[\\d,]*)\\s*条", "i"));
  if (range) return (Number(range[2].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  const single = q.match(new RegExp(bit + "\\s*[^。；]{0,24}?(\\d[\\d,]*)\\s*条", "i"));
  if (single) return (Number(single[1].replace(/,/g, "")) * TOKENS_PER_REQ) / 1e6;
  return 0;
}
/* 有「独立日常池」的才算硬覆盖：双池计划，或档内慢烧模型单独计额度（如 ChatGPT Plus 的 Luna 独立条数） */
function hasSeparateDaily(x) {
  return x.internalDaily.length > 0 || /双池/.test(x.p.quota || "");
}
function pickSupplement(main, pool) {
  const list = dailyEntries(pool, main).slice().sort((a, b) => {
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
  const fit = list.filter((x) => (cnyOf(x.p, "M") || 0) <= remain + 0.05);
  const dreamed = list.find((x) => hasSeparateDaily(x));
  return { chosen: fit[0] || null, dreamed: dreamed && fit[0] !== dreamed ? dreamed : null, remain };
}
function sameWindowText(profile) {
  const names = profile.included.filter((r) => r.task === "daily").map((r) => r.name);
  if (!profile.headline) return "";
  if (!names.length) return `${profile.headline.name} 这档没有另外的慢烧模型。`;
  return `${names.join("、")} 和 ${profile.headline.name} 共用同一个 5 小时窗口。拿它们做日常，用的还是这一格额度。`;
}
function meteredText(profile) {
  if (!profile.metered.some((r) => r.id === "claude-opus")) return "";
  return "Claude Opus 在另一池，按百万 tokens 计价，不在这档送的慢烧额度里。";
}
function quickCard(accent, title, value, body, plan) {
  const href = plan ? safeHref(plan.url) : "";
  return `<div class="quick-card" style="--qc-accent:${accent}">
    <div class="qc-title">${esc(title)}</div>
    <div class="qc-value">${value}</div>
    <div class="qc-sub">${body}</div>
    ${href ? `<a class="qc-tag" href="${href}" target="_blank" rel="noopener">官网 ↗</a>` : ""}
  </div>`;
}
function mainCard(main, pool) {
  const p = main.p;
  const dailyLead = pickerState.task === "daily" && main.loose.length;
  const bits = [`<b>${esc(planTitle(p))}</b><div class="badge-row">${badgeHtml(p)}</div>`];
  if (dailyLead) {
    const names = main.loose.map((r) => r.name).join("、");
    bits.push(lineHtml("日常", `${names}。${main.loose[0].reason}。`));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.loose[0])));
    if (main.headline) bits.push(lineHtml("同档还有", `${main.headline.name}。${main.shared ? "和慢烧模型共用同一个窗口。" : main.headline.reason + "。"}`));
  } else if (main.headline) {
    const ceiling = main.ceilings.find((r) => r.id !== main.headline.id);
    let hard = `${main.headline.name}。${main.headline.reason}。`;
    if (ceiling) hard += `${ceiling.name} 也能开，${ceiling.reason}。`;
    bits.push(lineHtml("复杂任务", hard));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.headline)));
  } else {
    bits.push(lineHtml("日常", `${main.loose.map((r) => r.name).join("、")}。${main.loose[0].reason}。`));
    bits.push(lineHtml("5 小时窗口", windowSentence(p, main.loose[0])));
  }
  const meter = meteredText(main);
  if (meter) bits.push(lineHtml("另一池", meter));
  else if (!dailyLead && !main.headline) bits.push(lineHtml("复杂任务", "这组条件里没有能单独拿来做复杂任务的模型，这档先覆盖日常。"));
  const peer = !dailyLead && main.headline ? peerNote(main, pool) : "";
  if (peer) bits.push(lineHtml("同预算", peer));
  const cheaper = cheaperTiers(main);
  if (cheaper.length) {
    const list = cheaper.slice(0, 2).map((x) => `${esc(x.p.plan)}（${esc(priceLine(x.p))}）`).join("、");
    bits.push(lineHtml("省钱档", `同一个 ${esc(main.headline.name)} 还有更便宜的 ${list}，窗口更小。`));
  }
  if (p.region === "intl" && pickerState.region !== "cn") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  const title = dailyLead || !main.headline ? "主计划 · 日常" : "主计划 · 复杂任务";
  return quickCard(PICK_ACCENT[0], title, moneyHtml(p), bits.join(""), p);
}
/* 中间卡的三条底线：能不花钱覆盖就不推荐第二档；要另买时写清差多少；实在没有才留空值 */
function dailyCard(main, pool) {
  const dailyNames = main.loose.map((r) => r.name).join("、");
  const windowNote = main.shared
    ? "和复杂任务模型共用同一个 5 小时窗口，日常用多了会挤占复杂任务额度。"
    : "额度与复杂任务模型分开。";
  if (pickerState.task === "hard") {
    if (main.loose.length) {
      return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("顺手覆盖", `筛选以复杂任务为主，日常可以用同一档里的 ${esc(dailyNames)}，不用另买。${windowNote}`)}`, main.p);
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>",
      lineHtml("这次不配", "筛选以复杂任务为主，这一档也没有能日常慢烧的模型。"), null);
  }
  if (pickerState.task === "daily") {
    const meter = meteredText(main);
    if (meter) {
      return quickCard(PICK_ACCENT[1], "复杂任务", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("另一池", meter)}`, main.p);
    }
    if (main.headline) {
      return quickCard(PICK_ACCENT[1], "复杂任务", moneyHtml(main.p),
        `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", `${main.headline.name} 也在这档里。${main.shared ? "和慢烧模型共用同一个窗口，偶尔的复杂任务直接用它顶。" : "额度分开，复杂任务直接用。"}`)}`, main.p);
    }
    return quickCard(PICK_ACCENT[1], "复杂任务", "<em>—</em>",
      lineHtml("这档不包含", "这档没有能单独拿来做复杂任务的模型。复杂任务要另买带 Claude Opus 一类模型的订阅。"), null);
  }
  if (main.internalDaily.length) {
    const text = `用 ${dailyNames}。${main.internalDaily[0].reason}。和复杂任务模型分开计算额度，不用再买第二档。`;
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p), `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", text)}`, main.p);
  }
  const shared = main.headline ? sameWindowText(main) : "";
  const sup = pickSupplement(main, pool);
  if (sup.chosen) {
    const roles = sup.chosen.internalDaily.length ? sup.chosen.internalDaily : sup.chosen.loose;
    const sepNote = hasSeparateDaily(sup.chosen) ? "这一档的日常额度是独立池，不占主计划窗口。" : "";
    let text = `日常用 ${roles.map((r) => r.name).join("、")}，${priceLine(sup.chosen.p)}。${roles[0].reason}。${sepNote}`;
    if (sup.dreamed) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(sup.dreamed.p, "M") || 0);
      text += `若要 ${planTitle(sup.dreamed.p)} 里更大的独立池，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(sup.chosen.p),
      `<b>${esc(planTitle(sup.chosen.p))}</b><div class="badge-row">${badgeHtml(sup.chosen.p)}</div>${shared ? lineHtml("同一窗口", shared) : ""}${lineHtml("另开一档", text)}`, sup.chosen.p);
  }
  if (main.loose.length) {
    /* 主计划里的慢烧模型和复杂任务共用窗口，预算内没有更合适的独立慢烧档：日常就在本档覆盖 */
    let text = `用 ${esc(dailyNames)} 做日常。${esc(main.loose[0].reason)}。${esc(windowNote)}`;
    const dream = sup.dreamed || dailyEntries(pool, main)[0];
    if (dream) {
      const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
      text += `想要分开的慢烧额度：${esc(planTitle(dream.p))} 月费 ${esc(priceLine(dream.p))}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    } else {
      text += "当前条件下没有带独立慢烧池的另一档。";
    }
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(main.p),
      `<b>${esc(planTitle(main.p))}</b>${lineHtml("就在这档里", text)}`, main.p);
  }
  const dream = sup.dreamed || dailyEntries(pool, main)[0];
  if (dream) {
    const names = dream.loose.map((r) => r.name).join("、");
    const both = (cnyOf(main.p, "M") || 0) + (cnyOf(dream.p, "M") || 0);
    const text = `当前预算还剩 ${fmtCNY(Math.max(0, sup.remain))}。它的 ${names} 是独立的慢烧额度，月费 ${priceLine(dream.p)}，两档合计约 ${fmtCNY(both)}，高于当前预算。`;
    return quickCard(PICK_ACCENT[1], "日常覆盖", moneyHtml(dream.p),
      `<b>${esc(planTitle(dream.p))}</b><div class="badge-row">${badgeHtml(dream.p)}</div><div class="qc-miss">当前预算放不下第二档。</div>${lineHtml("差多少", text)}`, dream.p);
  }
  return quickCard(PICK_ACCENT[1], "日常覆盖", "<em>—</em>", lineHtml("没有第二档", "没有找到符合地区和工具、且带慢烧模型的另一档。"), null);
}
function upgradeCard(main) {
  const next = nextTier(main);
  if (!next) {
    return quickCard(PICK_ACCENT[2], "预算再往上", "<em>已最高</em>", lineHtml("这档到顶", "这已经是该厂商在售个人档里，这个模型窗口最大的一档。"), main.p);
  }
  const over = pickerState.budget !== "any" && pickerState.budget !== "0" && (cnyOf(next.p, "M") || 0) > Number(pickerState.budget) + 0.05;
  const flag = over ? `<div class="qc-miss">高于当前预算。</div>` : "";
  return quickCard(PICK_ACCENT[2], "预算再往上", moneyHtml(next.p), `${flag}<b>${esc(planTitle(next.p))}</b>${lineHtml("多出来的是", unlockText(main, next))}`, next.p);
}
/* 工具自家厂商的入门个人档（忽略预算，但尊重地区筛选；地区内没有时回退到国际档并提示） */
function ownVendorCard(main) {
  const vendor = TOOL_OWN_VENDOR[pickerState.tool];
  if (!vendor) return null;
  if (main && main.p.vendor === vendor) return null;
  const all = PLANS.filter((p) => p.vendor === vendor && isPersonalMonthly(p) && offerable(p))
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
    bits.push(lineHtml(use, `${role.name}。${role.reason}。`));
  } else {
    bits.push(lineHtml("额度", trunc(resolvedField(plan, "quota"), 80)));
  }
  if (prof.loose.length && prof.headline) bits.push(lineHtml("日常", `${prof.loose.map((r) => r.name).join("、")}。${windowNoteShort(prof)}`));
  const overBudget = pickerState.budget !== "any" &&
    (cnyOf(plan, "M") || 0) > (pickerState.budget === "0" ? 0 : Number(pickerState.budget) + 0.05);
  if (overBudget) {
    const cap = pickerState.budget === "0" ? "（筛选为免费）" : " " + fmtCNY(Number(pickerState.budget));
    bits.push(`<div class="qc-miss">高于当前预算${cap}。<button type="button" class="linkish" data-set-picker="budget=any">把预算放开</button></div>`);
  } else if (main) bits.push(lineHtml("和主计划", `它没有赢下这组条件的主计划（见第一张卡）。${OWN_VENDOR_NOTE[vendor] || ""}`));
  if (regionMiss) bits.push(`<div class="qc-avoid">${esc(vendor)} 只有国际档，当前地区筛选把它排除了。<button type="button" class="linkish" data-set-picker="region=all">把地区改成「不限」再看</button></div>`);
  else if (plan.region === "intl") bits.push(`<div class="qc-avoid">需要外币或国际账号支付。</div>`);
  return quickCard(PICK_ACCENT[3], `${shortVendor(vendor)} 自家订阅`, moneyHtml(plan), bits.join(""), plan);
}
function windowNoteShort(prof) {
  return prof.shared ? "和复杂任务模型共用同一个窗口。" : "额度与复杂任务模型分开。";
}
/* 供卡片里的按钮一键放宽筛选（data-set-picker="region=all"） */
function setPicker(rowKey, value) {
  const row = qs(`#picker .picker-row[data-pick="${rowKey}"]`);
  if (row) setChipPressed(row.querySelectorAll(".chip"), (x) => x.dataset.value === value);
  pickerState[rowKey] = value;
  renderPicker();
}
/* 帮我选四行 chips 的高亮以 pickerState 为准（渲染时自愈，程序化改状态也不会脱钩） */
function syncPickerChips() {
  qsa("#picker .picker-row").forEach((row) => {
    setChipPressed(row.querySelectorAll(".chip"), (chip) => chip.dataset.value === pickerState[row.dataset.pick]);
  });
}
function renderPicker() {
  syncPickerChips();
  const pool = eligibleProfiles();
  const grid = byId("quickGrid");
  const note = byId("pickerNote");
  const main = chooseMain(pool);
  const own = ownVendorCard(main);
  if (!main) {
    grid.innerHTML = `<div class="picker-empty">这组条件没有能下单的个人档。可以把预算放开，或把地区改成不限。</div>` + (own || "");
    note.textContent = own
      ? "上面是所选工具的自家订阅，供参考；它不满足当前的预算或地区筛选，所以没进推荐。中转站不参与。"
      : "中转站不参与。模型只分成复杂任务和日常，不使用跑分。";
    syncUrl();
    return;
  }
  grid.innerHTML = [mainCard(main, pool), dailyCard(main, pool), upgradeCard(main), own].filter(Boolean).join("");
  note.textContent = `符合条件 ${pool.length} 档。${own ? "最后一张是所选工具的自家订阅，供对照，不参与主计划排序。" : "三张卡是一套用法："}复杂任务看最强模型和它的 5 小时窗口，日常只把分开的慢烧额度算作覆盖。预算再往上可以高于当前筛选。模型角色按 ${MODEL_ROLES_ASOF} 的用法归类，不是跑分。中转站不参与。每百万 tokens 排行仍然只比价格。`;
  syncUrl();
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

