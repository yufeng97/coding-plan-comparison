#!/usr/bin/env node
/* 推荐引擎回归：资格、预算、工具、地区四维与国家限定（拆分自 test-app.js） */
"use strict";
const assert = require("node:assert/strict");
const { createApp, healthy, test, main } = require("./app-harness");

test("国家限定套餐始终不入通用推荐，过期country链接清理后完整表仍保留限定徽章", () => {
  for (const country of ["", "IN", "CN", "US", "invalid"]) {
    const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=100&region=intl&tool=cursor&task=daily&country=" + country });
    healthy(app);
    assert.equal(new URLSearchParams(app.location.search).has("country"), false, country + " 退役参数应清除");
    assert.equal(app.run('Object.hasOwn(pickerState, "country")'), false);
    assert.equal(app.run('eligibleProfiles().some(x => x.p.purchaseCountries?.length)'), false, country + " 限定档不能入候选");
    assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /Start（印度专属）/);
    app.run('Object.assign(pickerState, { budget: "any", region: "all", tool: "cursor", task: "daily" }); renderPicker();');
    assert.equal(app.run('eligibleProfiles().some(x => x.p.purchaseCountries?.length)'), false, "提高预算也不应恢复限定档");
    assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /Start（印度专属）/);
    app.run('tableState.search = "Cursor Start"; renderTable();');
    assert.equal(app.run('computeTableRows().some(p => p.vendor === "Cursor" && p.plan === "Start（印度专属）")'), true);
    assert.match(app.elements.get("tableBody").innerHTML, /仅限印度/);
    healthy(app);
  }
});

test("225组四维推荐满足资格、预算、工具和地区；升级/补充均排除国家限定", () => {
  const app = createApp();
  const checks = { total:0, failures:[] };
  /* 按预算分批运行相同225组断言，避免整轮共享一个VM超时而受并行浏览器负载影响。 */
  for (const budget of ["0", "100", "200", "500", "any"]) {
    const batch = app.run(`(() => {
    let total = 0;
    const failures = [];
    const check = (ok, label) => { if (!ok) failures.push(label + " " + JSON.stringify(pickerState)); };
    const allowed = (p, label) => {
      check(!isRelay(p) && !isRetiredPlan(p) && !isOneTimePlan(p) && !isRenewalOnly(p), label + " 不可购买/中转");
      check(!p.seat && p.cat !== "team", label + " 非个人档");
      check(p.includedModelQuota !== false && p.modelAccess !== "byok" && hasCodingSurface(p), label + " 无附赠编程推理额度");
      check(!p.purchaseCountries?.length, label + " 国家限定档不应进入通用推荐");
      check(pickerState.region === "all" || p.region === pickerState.region, label + " 地区不符");
      check(matchesTool(p, pickerState.tool), label + " 工具不符");
    };
    const checkCards = () => {
      renderPicker();
      const cards = [...document.getElementById("quickGrid").children].filter(el => el.classList.contains("quick-card"));
      const ids = [];
      for (const card of cards) {
        const reasons = card.querySelector(".qc-reasons");
        check(!!reasons && reasons.children.length >= 1 && reasons.children.length <= 3, "卡片理由不在1–3条内");
        const details = card.querySelector(".qc-details");
        check(!!details && !details.open && details.getAttribute("open") == null, "购买详情未默认折叠");
        check(!!card.querySelector(".qc-primary"), "缺少官网入口");
        const id = card.querySelector("[data-view-plan]")?.dataset.viewPlan;
        check(!!id && !ids.includes(id), "卡片重复同套餐或缺少权益入口");
        ids.push(id);
      }
      check(Number(document.getElementById("quickGrid").dataset.cardCount) === cards.length, "卡片列数与内容不一致");
      check(!/priceM|priceY|NaN|undefined/.test(document.getElementById("quickGrid").innerHTML), "内部字段/无效数字泄漏");
    };
    const budget = ${JSON.stringify(budget)};
    for (const region of ["all", "cn", "intl"])
    for (const tool of ["any", "claude", "codex", "cursor", "own"])
    for (const task of ["hard", "both", "daily"]) {
      Object.assign(pickerState, { budget, region, tool, task });
      total++;
      const pool = eligibleProfiles(), main = chooseMain(pool);
      const cap = budget === "any" ? Infinity : Number(budget);
      for (const x of pool) {
        allowed(x.p, "候选 " + x.p.plan);
        check(cnyOf(x.p, "M") <= cap + 0.05, "候选超预算");
        check(budget === "0" ? x.p.priceM === 0 : x.p.priceM > 0, "候选免费/付费口径不符");
      }
      checkCards();
      if (!main) { check(!!document.getElementById("quickGrid").querySelector(".picker-empty"), "无推荐时缺少原因"); continue; }
      check(pool.includes(main), "主计划超出候选池");
      check(task === "hard" ? !!main.headline : task === "daily" ? !!main.loose.length : !!(main.headline || main.loose.length), "主计划模型不符任务");
      const alternatives = alternativeProfiles(pool, main);
      check(alternatives.length <= 2 && new Set(alternatives.map(x => x.p.id)).size === alternatives.length, "替代候选数量或去重错误");
      for (const x of alternatives) {
        allowed(x.p, "替代 " + x.p.plan);
        check(pool.includes(x) && x.p !== main.p && cnyOf(x.p, "M") <= cap + 0.05, "替代候选超出预算或重复主计划");
        check(task === "hard" ? !!x.headline : task === "daily" ? !!x.loose.length : !!(x.headline || x.loose.length), "替代候选任务不符");
      }
      const next = nextTier(main);
      if (next) {
        allowed(next.p, "升级 " + next.p.plan);
        check(next.p.vendor === main.p.vendor && cnyOf(next.p, "M") > cnyOf(main.p, "M"), "升级厂商/价格不符");
        check(cnyOf(next.p, "M") <= upgradeBudgetCeiling() + 0.05, "升级跨过下一预算档");
      }
      const supplement = pickSupplement(main, pool).chosen;
      if (supplement) {
        allowed(supplement.p, "补充 " + supplement.p.plan);
        check(dailyEntries(pool, main).some(x => x.p === supplement.p) && supplement.p.vendor !== main.p.vendor, "补充重复或超出候选");
        check(pool.includes(supplement) || isFreeCodingEntry(supplement.p), "主计划候选外仅可加入真实免费推理入口");
        check(cnyOf(main.p, "M") + cnyOf(supplement.p, "M") <= cap + 0.05, "补充合计超预算");
      }
    }
    return { total, failures };
  })()`);
    checks.total += batch.total;
    checks.failures.push(...batch.failures);
  }
  assert.equal(checks.total, 225);
  assert.equal(checks.failures.length, 0, checks.failures.slice(0, 12).join("\n"));
  healthy(app);
});

test("Pro无5h上限不触发Go Plus加购，平台免费及非编程订阅不进入推荐", () => {
  const app = createApp();
  app.run('Object.assign(pickerState, { budget: "any", region: "all", tool: "any", task: "both" });');
  for (const price of [100, 200, 500]) {
    const result = app.run(`(() => {
      const plan = PLANS.find(p => p.vendor === "OpenAI" && p.priceM === ${price} && p.plan.startsWith("ChatGPT Pro"));
      const profile = planProfile(plan);
      return { period: profile.windowPeriod, shared: profile.shared, card: mainCard(profile, eligibleProfiles()), daily: dailyCard(profile, eligibleProfiles()), window: windowSentence(plan, profile.headline) };
    })()`);
    assert.equal(result.period, "none");
    assert.equal(result.shared, false);
    assert.match(result.card, /日常已包含/);
    assert.equal(result.daily, "", "已包含权益不应重复套餐和月费出第二卡");
    assert.doesNotMatch(result.card, /OpenCode Go Plus|可选补充|另付/);
    assert.match(result.window, /没有 5 小时上限/);
  }
  for (const [vendor, plan] of [["xAI", "SuperGrok"], ["Canopy Wave", "Coding Plan Pro Bundle"]]) {
    const found = app.run("PLANS.find(p => p.vendor === " + JSON.stringify(vendor) + " && p.plan === " + JSON.stringify(plan) + ")");
    assert.ok(found, vendor + " 测试方案存在");
    assert.equal(app.run("eligibleProfiles().some(x => x.p.vendor === " + JSON.stringify(vendor) + " && x.p.plan === " + JSON.stringify(plan) + ")"), true, vendor + " 编程入口不应被通用工具正则误排除");
  }
  assert.equal(app.run('recommendablePlan(PLANS.find(p => p.vendor === "Kilo Code" && p.priceM === 0))'), false);
  assert.equal(app.run('recommendablePlan(PLANS.find(p => p.vendor === "Google" && p.plan === "Google AI Plus"))'), false);
  app.run('Object.assign(pickerState, { budget: "0", region: "all", tool: "any", task: "daily" }); renderPicker();');
  for (const vendor of ["Kilo Code", "Zed", "Cline", "Roo Code"]) {
    const eligibility = app.run("PLANS.filter(p => p.priceM === 0 && p.vendor.startsWith(" + JSON.stringify(vendor) + ")).map(p => ({ plan: p.plan, inPool: eligibleProfiles().some(x => x.p === p) }))");
    assert.ok(eligibility.length > 0, vendor + " 免费平台测试方案存在");
    assert.ok(eligibility.every((p) => !p.inPool), vendor + " 未附赠推理额度，不能进入免费主计划候选");
  }
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /<b>(?:Kilo Code|Zed|Cline|Roo Code)/);
  healthy(app);
});

test("附加模型权益可检索，窗口缺省展示不编造5h额度", () => {
  const app = createApp();
  app.run('tableState.search = "Astra Ultrafast"; renderTable();');
  assert.equal(app.run('computeTableRows().some(p => p.vendor === "OpenAI" && p.priceM === 500)'), true);
  assert.match(app.elements.get("tableBody").innerHTML, /Astra Ultrafast/);
  const placeholder = (period) => app.run(`METRICS_COLUMNS.find(c => c.id === "t5h").cell({ m: { windowPeriod: ${JSON.stringify(period)} }, c: { fLow: null }, isPayg: false })`);
  assert.match(placeholder("none"), /无5h上限/);
  assert.match(placeholder("month"), /月度池；无5h额度/);
  assert.match(placeholder("unknown"), /未公布/);
  assert.equal(app.run('fmtVal(null, "USD")'), "—");
  assert.equal(app.run("rateClass(null)"), "");
  const mimo = app.run('windowNoteShort(planProfile(PLANS.find(p => p.vendor === "小米 MiMo" && p.plan === "Token Plan Lite")))');
  assert.match(mimo, /共用月度额度池/);
  assert.doesNotMatch(mimo, /共享情况未公开|5 小时/);
  app.run('Object.assign(pickerState, { region: "cn", budget: "200", tool: "cursor", task: "daily" }); renderPicker();');
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /没赢|没拿下|复杂任务主计划/);
  healthy(app);
});

test("付费主计划可配免费推理入口，合计预算和地区工具资格保持正确", () => {
  const app = createApp();
  const result = app.run(`(() => {
    Object.assign(pickerState, { budget: "100", region: "all", tool: "codex", task: "both" });
    const pool = eligibleProfiles(), main = chooseMain(pool), sup = pickSupplement(main, pool);
    renderPicker();
    return { mainPrice: cnyOf(main.p, "M"), mainId: main.p.id, supplementId: sup.chosen.p.id,
      supplementPrice: cnyOf(sup.chosen.p, "M"), total: cnyOf(main.p, "M") + cnyOf(sup.chosen.p, "M"),
      card: dailyCard(main, pool) };
  })()`);
  assert.equal(result.mainId, "plan-0164");
  assert.equal(result.supplementId, "plan-0008");
  assert.equal(result.supplementPrice, 0);
  assert.equal(result.total, result.mainPrice);
  assert.match(result.card, /ChatGPT Free|免费入口|无需额外月费/);
  assert.doesNotMatch(result.card, /当前预算放不下|另付 免费|高于当前预算/);
  for (const [region, tool] of [["cn", "codex"], ["all", "claude"], ["cn", "own"]]) {
    const rows = app.run(`(() => {
      Object.assign(pickerState, { region: ${JSON.stringify(region)}, tool: ${JSON.stringify(tool)} });
      const main = planProfile(PLANS.find(p => p.id === "plan-0164"));
      return dailyEntries(eligibleProfiles(), main).map(x => ({ id: x.p.id, allowed: recommendablePlan(x.p),
        region: x.p.region, tool: matchesTool(x.p, pickerState.tool), included: hasIncludedModelQuota(x.p), free: x.p.priceM === 0 }));
    })()`);
    assert.ok(rows.every((x) => x.allowed && x.included && x.tool && (region === "all" || x.region === region)));
    assert.ok(rows.every((x) => x.id !== "plan-0008"), region + "/" + tool + " 不应混入不合资格的ChatGPT免费入口");
  }
  /* 有预算也优先采用能免费覆盖的入口；付费参考不能被错误标成超预算。 */
  app.run('Object.assign(pickerState, { budget: "500", region: "all", tool: "cursor", task: "both" }); renderPicker();');
  assert.match(app.elements.get("quickGrid").innerHTML, /Cursor Hobby/);
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /日常用 Grok 4、Composer，另付/);
  const fixtureIds = app.run(`(() => {
    Object.assign(pickerState, { budget: "100", region: "all", tool: "codex", task: "both" });
    const base = { vendor: "Free Fixture", plan: "Free", cat: "tool", region: "intl", priceM: 0, cur: "USD",
      quota: "持续附赠推理额度", models: "GPT-6 Luna", tools: "Codex" };
    PLANS.push({ ...base, id: "fixture-free" },
      { ...base, id: "fixture-country", purchaseCountries: ["IN"] },
      { ...base, id: "fixture-byok", modelAccess: "byok", includedModelQuota: false },
      { ...base, id: "fixture-team", cat: "team", seat: true },
      { ...base, id: "fixture-no-coding", codingSurface: false });
    const main = planProfile(PLANS.find(p => p.id === "plan-0164"));
    return dailyEntries(eligibleProfiles(), main).map(x => x.p.id);
  })()`);
  assert.ok(fixtureIds.includes("fixture-free"));
  for (const id of ["fixture-country", "fixture-byok", "fixture-team", "fixture-no-coding"]) assert.ok(!fixtureIds.includes(id), id);
  healthy(app);
});

test("200元预算的升级与档位对比最多到500元，538元档不出现且含价核查不泄漏字段", () => {
  const app = createApp();
  app.run('Object.assign(pickerState, { budget: "200", region: "cn", tool: "any", task: "hard" }); renderPicker();');
  /* GLM 改按官方积分系数统一折算后，同为 B 档模型且额度更大的小米 Standard 胜出。 */
  assert.equal(app.run("chooseMain(eligibleProfiles()).p.id"), "plan-0168");
  assert.equal(app.run("upgradeBudgetCeiling()"), 500);
  const next = app.run("(() => { const n = nextTier(chooseMain(eligibleProfiles())); return n ? pickerMonthlyCNY(n.p) : null; })()");
  assert.ok(next == null || next <= 500.05, String(next));
  const grid = app.elements.get("quickGrid");
  assert.doesNotMatch(grid.innerHTML, /GLM Coding V3 Pro|priceM|priceY/);
  const tierPrices = [...grid.querySelectorAll(".qc-tiers .qc-tier-price")].map((td) => Number(td.getAttribute("data-cny")));
  assert.ok(tierPrices.length >= 2 && tierPrices.every((price) => price <= 500.05), tierPrices.join(","));
  assert.match(grid.innerHTML, /页面月费|月付价|月费/);
  assert.equal(grid.querySelectorAll(".qc-details[open]").length, 0);
  assert.equal(grid.querySelectorAll(".qc-primary").length, Number(grid.dataset.cardCount) + grid.querySelectorAll(".picker-alternatives-grid .quick-card").length);
  app.run('Object.assign(pickerState, { budget: "500" }); renderPicker();');
  assert.ok(app.run("pickerMonthlyCNY(nextTier(chooseMain(eligibleProfiles())).p)") > 500);
  assert.match(grid.innerHTML, /高于当前预算/);
  healthy(app);
});

test("真实月度系数和日月请求行在额度表显示月池而非5h数值", () => {
  const app = createApp();
  const cells = app.run(`METRICS_ALL.filter(m => ["小米 MiMo", "腾讯云 TokenHub", "Canopy Wave"].includes(m.vendor))
    .map(m => METRICS_COLUMNS.find(col => col.id === "t5h").cell({ m, c: computeMetrics(m), isPayg: false }))`);
  assert.equal(cells.length, 19);
  assert.ok(cells.every((cell) => cell.includes("月度池；无5h额度")), cells.join("\n"));
  healthy(app);
});

test("真实缺省周期历史估算不冒充5h额度，明确官方周窗口仍按假设展示", () => {
  const app = createApp();
  const rows = app.run(`METRICS_ALL.filter(m => ["plan-0017", "plan-0105", "plan-0080", "plan-0081"].includes(m.ref))
    .map(m => ({ ref: m.ref, period: m.windowPeriod, c: computeMetrics(m),
      cell: METRICS_COLUMNS.find(col => col.id === "t5h").cell({ m, c: computeMetrics(m), isPayg: false }) }))`);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.period, "unknown", row.ref);
    assert.equal(row.c.fLow, null, row.ref);
    assert.equal(row.c.r5h, null, row.ref);
    assert.ok(row.c.moLow > 0 && row.c.costPerM > 0, row.ref);
    assert.match(row.cell, /未公布/);
  }
  /* 智谱/Z.ai 每周 10,000 积分按官方抵扣系数与统一假设（636.8 积分/百万 tokens）折算，不再采用厂商自估的 48M。 */
  const official = app.run('computeMetrics(METRICS_ALL.find(m => m.ref === "plan-0031"))');
  assert.equal(official.fLow, 3.1407);
  assert.equal(app.run('METRICS_ALL.find(m => m.ref === "plan-0031").vendorWkLowM'), 48);
  healthy(app);
});

test("讯飞异版本牌价估算在真实页面保留低置信，排除官方和官方折算排行", () => {
  const app = createApp();
  const result = app.run(`(() => {
    const m = METRICS_ALL.find(m => m.ref === "plan-0082");
    rankState.scope = "official";
    const official = rankScopeOk(m);
    rankState.scope = "credits";
    const credits = rankScopeOk(m);
    rankState.scope = "all";
    const all = rankScopeOk(m);
    return { isEst: m.isEst, prov: provenance(m), official, credits, all };
  })()`);
  assert.equal(result.isEst, true);
  assert.equal(result.prov.conf, "低");
  assert.match(result.prov.text, /异版本牌价代理/);
  assert.equal(result.official, false);
  assert.equal(result.credits, false);
  assert.equal(result.all, true);
  healthy(app);
});

test("继承模型保留日常与新增旗舰，明确否定K3和自家入口保持正确", () => {
  const app = createApp();
  const result = app.run(`(() => {
    const pro = PLANS.find(p => p.id === "plan-0091");
    const higher = ["plan-0092", "plan-0093"].map(id => planProfile(PLANS.find(p => p.id === id)));
    const small = planProfile(PLANS.find(p => p.id === "plan-0212"));
    tableState.search = "Luna";
    const search = computeTableRows().filter(p => p.vendor === "GitHub Copilot").map(p => p.plan);
    Object.assign(pickerState, { budget: "any", region: "intl", tool: "own", task: "daily" });
    const xai = eligibleProfiles().filter(x => x.p.vendor === "xAI").map(x => x.p.plan);
    const next = nextTier(planProfile(pro));
    const base = { id: "role-base", vendor: "Role Fixture", plan: "Base", models: "Claude Sonnet / Haiku（不含 Opus）" };
    const added = { id: "role-added", vendor: "Role Fixture", plan: "Added", models: "新增 Opus", modelBaseRef: base.id, modelIncludes: ["Claude Opus"] };
    const excluded = { ...added, id: "role-excluded", modelExcludes: ["Claude Opus"] };
    PLANS.push(base, added, excluded);
    return { higher: higher.map(x => ({ headline: x.headline.id, daily: x.loose.map(r => r.id) })),
      smallRoles: small.included.map(r => r.id), search, xai, next: next && next.p.plan,
      base: planProfile(base).headline, added: planProfile(added).headline.id, excluded: planProfile(excluded).headline };
  })()`);
  for (const x of result.higher) { assert.equal(x.headline, "claude-opus"); assert.ok(x.daily.includes("luna")); assert.ok(x.daily.includes("grok")); }
  assert.ok(!result.smallRoles.includes("kimi-k3"));
  assert.ok(result.smallRoles.includes("glm-5"));
  assert.ok(result.search.includes("Pro+") && result.search.includes("Max"));
  assert.deepEqual(Array.from(result.xai), ["SuperGrok", "SuperGrok Plus"]);
  assert.equal(result.next, "Pro+");
  assert.equal(result.base, null);
  assert.equal(result.added, "claude-opus");
  assert.equal(result.excluded, null);
  healthy(app);
});

test("推荐卡可直接对比和查看权益，展示本档核查及准确全年年费", () => {
  const app = createApp();
  const result = app.run(`(() => {
    const claude = PLANS.find(p => p.id === "plan-0002"), google = PLANS.find(p => p.id === "plan-0017");
    const check = priceCheckOf(claude); check.checkedAt = "2020-01-02";
    Object.assign(pickerState, { budget: "500", region: "all", tool: "any", task: "both" });
    const card = mainCard(planProfile(claude), eligibleProfiles());
    renderPicker();
    return { card, annual: pickerPaymentHtml(google),
      alternatives: alternativeProfiles(eligibleProfiles(), chooseMain(eligibleProfiles())).length,
      grid: document.getElementById("quickGrid").innerHTML };
  })()`);
  assert.match(result.card, /2020-01-02/);
  assert.match(result.card, /查看核查依据/);
  assert.doesNotMatch(result.card, /页面数据更新于/);
  assert.match(result.card, /\$200\/年/);
  assert.doesNotMatch(result.card, /200\.04/);
  assert.match(result.annual, /\$199\.99\/年/);
  assert.match(result.card, /data-plan-id="plan-0002"/);
  assert.match(result.card, /data-view-plan="plan-0002"/);
  assert.equal(result.alternatives, 2);
  assert.match(result.grid, /其他候选（2 档，均在预算内）/);
  assert.match(result.grid, /选取理由/);
  healthy(app);
});

test("真实推荐卡的对比按钮可操作且重绘后保留选择与自身焦点", () => {
  const app = createApp();
  app.run('Object.assign(pickerState, { budget: "500", region: "cn", tool: "any", task: "both" }); renderPicker();');
  const grid = app.elements.get("quickGrid");
  const button = grid.querySelector(".cmp-add");
  assert.equal(button.closest(".qc-details"), null, "推荐动作应无需展开即可操作");
  const id = button.dataset.planId;
  app.fire(button, "click");
  assert.equal(app.run(`cmpState.items.some(p => p.id === ${JSON.stringify(id)})`), true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  button.focus();
  app.run("renderPicker();");
  const replacement = grid.querySelector('.cmp-add[data-plan-id="' + id + '"]');
  assert.equal(button.isConnected, false);
  assert.equal(replacement.getAttribute("aria-pressed"), "true");
  assert.equal(replacement.closest(".qc-details"), null, "重绘后的动作仍可直接访问");
  assert.equal(app.run("document.activeElement"), replacement);
  healthy(app);
});

const plain = (value) => JSON.parse(JSON.stringify(value));
/* 替身 DOM 只在容器上保存 innerHTML；按卡片切分整块推荐区的标记。 */
const mainCardHtml = (app) => app.elements.get("quickGrid").innerHTML.split('<div class="quick-card"')[1] || "";

test("首屏评测摘要与评测页「每模型最佳配置」的模型、分数和名次逐行一致", () => {
  const app = createApp();
  const protocols = plain(app.run("BENCHMARK_SUMMARY.protocols"));
  assert.deepEqual([...new Set(protocols.map((p) => p.family))], ["deepswe", "cursorbench", "SWE-bench"]);
  assert.deepEqual(protocols.filter((p) => p.family === "deepswe").map((p) => p.version), ["1.1", "1"]);
  for (const protocol of protocols) {
    app.run(`publicBenchmarkState = { id: ${JSON.stringify(protocol.id)}, family: ${JSON.stringify(protocol.family)}, search: "", mode: "best" }`);
    assert.deepEqual(plain(app.run("publicBenchmarkRows().map(r => [r.model, r.score, r.rank])")), protocol.rows.map((r) => [r.model, r.score, r.rank]), protocol.id);
    assert.equal(protocol.total, protocol.rows.length);
  }
  healthy(app);
});

test("推荐卡评测行只列本档明确包含的精确版本，转义文案且不改变推荐", () => {
  const app = createApp();
  app.run(`Object.assign(pickerState, { region: "intl", budget: "200", tool: "any", task: "hard", billing: "M" }); renderPicker();`);
  const id = app.run("chooseMain(eligibleProfiles()).p.id");
  const plan = `PLANS.find(p => p.id === ${JSON.stringify(id)})`;
  /* 前提：主计划列出 Opus 5.5，不含 Opus 4.1。 */
  assert.equal(app.run(`publicModelIncluded(${plan}, "Claude Opus 5.5")`), true);
  assert.equal(app.run(`publicModelIncluded(${plan}, "Claude Opus 4.1")`), false);
  app.run(`BENCHMARK_SUMMARY.protocols = [{ id: "fixture-coding", family: "deepswe", name: "Fixture <b>Coding</b>", version: "1", metric: "pass@1", unit: "%", checkedAt: "2026-10-08", total: 3, rows: [
    { model: "claude-opus-4-1", reasoning: null, score: 90, rank: 1 },
    { model: "claude-opus-5-5", reasoning: "max", score: 80, rank: 2 },
    { model: "Fixture Unlisted", reasoning: null, score: 70, rank: 3 }] }]; renderPicker();`);
  assert.equal(app.run("chooseMain(eligibleProfiles()).p.id"), id, "评测摘要不参与推荐排序");
  const bench = (mainCardHtml(app).match(/<div class="qc-bench">[\s\S]*?<\/div>/) || [""])[0];
  assert.ok(bench, "主计划应显示评测行");
  assert.match(bench, /Fixture &lt;b&gt;Coding&lt;\/b&gt;<\/b> 第 2\/3 名 · Claude Opus 5\.5 80%/);
  assert.doesNotMatch(bench, /Opus 4\.1|Fixture Unlisted|<b>Coding/);
  assert.match(bench, /不参与推荐排序/);
  assert.match(bench, /href="#benchmarks"/);
  assert.match(app.run(`pickerChoiceReason(planProfile(${plan}))`), /公开编程评测只作模型能力参考/);
  app.run("BENCHMARK_SUMMARY.schemaVersion = 2; renderPicker();");
  assert.doesNotMatch(app.elements.get("quickGrid").innerHTML, /qc-bench/, "摘要格式不认识时不显示评测行");
  healthy(app);
});

test("同档候选的额度都无法折算时，主卡写明按月费较低选出", () => {
  const app = createApp();
  const state = (region, budget) => app.run(`Object.assign(pickerState, { region: ${JSON.stringify(region)}, budget: ${JSON.stringify(budget)}, tool: "any", task: "hard", billing: "M" }); renderPicker();
    (() => { const pool = eligibleProfiles(), main = chooseMain(pool);
      const ties = hardRepresentatives(pool).filter(x => x.p !== main.p && hardMainOrder(main, x, false) === 0 && pickerMonthlyCNY(x.p) > pickerMonthlyCNY(main.p));
      return { tokens: knownTokens(main.p, main.headline), ties: ties.length, decided: priceDecidedMain(main, pool) }; })()`);
  const cheap = plain(state("intl", "100"));
  assert.deepEqual({ ...cheap, ties: cheap.ties > 0 }, { tokens: 0, ties: true, decided: true });
  assert.match(mainCardHtml(app), /<li>同档候选的额度都无法折算，按月费较低选出/);
  /* 档位更高的唯一候选不是靠月费胜出。 */
  assert.deepEqual(plain(state("intl", "200")), { tokens: 0, ties: 0, decided: false });
  assert.doesNotMatch(mainCardHtml(app), /按月费较低选出/);
  /* 有可折算额度时按额度说明。 */
  assert.equal(plain(state("cn", "200")).decided, false);
  assert.match(mainCardHtml(app), /<li>按官方额度规则折算，保守参考下限/);
  healthy(app);
});

test("国内 Claude Code 不限预算使用 Max 20x 作国际参考，与主计划共用额度选档规则", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?budget=any&region=cn&tool=claude&task=hard" });
  const result = app.run(`(() => {
    const main = chooseMain(eligibleProfiles()), picked = ownVendorPlan("Anthropic");
    const own = planProfile(picked.plan);
    return { mainVendor:main.p.vendor, mainRegion:main.p.region, ownId:picked.plan.id, ownPrice:picked.plan.priceM,
      ownRegionMiss:picked.regionMiss, ownBudget:picked.withinBudget, tokens:knownTokens(own.p, own.headline),
      mainCard:mainCard(main, eligibleProfiles()), ownCard:ownVendorCard(main) };
  })()`);
  assert.equal(result.mainVendor, "智谱 BigModel");
  assert.equal(result.mainRegion, "cn");
  assert.equal(result.ownId, "plan-0004");
  assert.equal(result.ownPrice, 200);
  assert.equal(result.ownRegionMiss, true);
  assert.equal(result.ownBudget, true);
  assert.equal(result.tokens, 0, "未公开 token 量时不按月费制造额度");
  assert.match(result.mainCard, /Claude Code 兼容接入 · GLM-5\.3/);
  assert.match(result.mainCard, /支持 Claude Code 不代表附赠 Claude 模型/);
  assert.match(result.ownCard, /Anthropic 国际参考/);
  assert.match(result.ownCard, /Claude Max 20x/);
  assert.match(result.ownCard, /<em>\$200<\/em>\/月/);
  assert.match(result.ownCard, /与主计划采用相同规则/);
  assert.match(result.ownCard, /当前地区不符合；此卡仅供参考/);
  const card = app.elements.get("quickGrid").querySelector('[data-plan-id="plan-0004"]').closest(".quick-card");
  const tiers = card.querySelector(".qc-tiers");
  assert.equal(tiers.querySelectorAll("tbody tr").length, 3);
  assert.match(result.ownCard, /Claude Pro|Claude Max 5x|Claude Max 20x/);
  assert.match(result.ownCard, /20× Pro/);
  assert.match(result.ownCard, /当前参考|地区外参考/);
  healthy(app);
});

test("自家订阅有限预算按可负担额度选档，预算过低和缺少年价均保留参考边界", () => {
  const app = createApp();
  const picked = (budget, billing = "M", region = "cn", task = "hard") => app.run(`(() => {
    Object.assign(pickerState, { budget:${JSON.stringify(budget)}, billing:${JSON.stringify(billing)},
      region:${JSON.stringify(region)}, tool:"claude", task:${JSON.stringify(task)} });
    const own = ownVendorPlan("Anthropic");
    return { id:own.plan.id, fit:own.withinBudget, regionMiss:own.regionMiss,
      quote:pickerPaymentQuote(own.plan), card:ownVendorCard(chooseMain(eligibleProfiles())) };
  })()`);
  for (const budget of ["200", "500"]) {
    const p = picked(budget);
    assert.equal(p.id, "plan-0002");
    assert.equal(p.fit, true);
    assert.match(p.card, /先满足当前预算/);
  }
  for (const budget of ["0", "100"]) {
    const p = picked(budget);
    assert.equal(p.id, "plan-0002");
    assert.equal(p.fit, false);
    assert.match(p.card, /高于当前预算/);
    assert.match(p.card, /月费最低的一档作参考/);
  }
  const max5 = picked("1000");
  assert.equal(max5.id, "plan-0003");
  assert.equal(max5.fit, true);
  const annual = picked("any", "Y");
  assert.equal(annual.id, "plan-0002", "Max 未公开年价，不进入年付预算选档");
  assert.equal(annual.quote.firstNative, 200);
  assert.equal(annual.quote.periodMonths, 12);
  assert.doesNotMatch(annual.card, /Claude Max 20x/);
  for (const task of ["hard", "both", "daily"]) {
    const domestic = picked("any", "M", "cn", task);
    const international = picked("any", "M", "intl", task);
    assert.equal(domestic.id, "plan-0004", task);
    assert.equal(domestic.regionMiss, true);
    assert.equal(international.id, "plan-0004", task);
    assert.equal(international.regionMiss, false);
    assert.equal(app.run('ownVendorPlan("Anthropic").plan.id === chooseMain(PLANS.filter(p => p.vendor === "Anthropic" && withinBudget(p)).map(planProfile)).p.id'), true, task);
    assert.equal(app.run('ownVendorCard(planProfile(findPlanReference("plan-0004")))'), null, "原生主卡已展示时不重复同一厂商参考");
  }
  healthy(app);
});

test("自家订阅不把更高月费当作更大额度，额度相同仍选较低月费", () => {
  const app = createApp();
  const picked = app.run(`(() => {
    Object.assign(pickerState, { budget:"any", region:"cn", tool:"claude", task:"hard", billing:"M" });
    PLANS.push({ ...findPlanReference("plan-0004"), id:"fixture-native-expensive", plan:"Claude Personal Premium", priceM:300 });
    return ownVendorPlan("Anthropic").plan.id;
  })()`);
  assert.equal(picked, "plan-0004");
  healthy(app);
});

test("推荐显示套餐明确支持的 GLM 与 GPT Sol 版本，不用用途角色的新版本冒充", () => {
  const app = createApp();
  const name = (id) => app.run(`(() => { const p = findPlanReference(${JSON.stringify(id)}); return roleDisplayName(p, planProfile(p).headline); })()`);
  assert.equal(name("plan-0157"), "GLM-5.3");
  assert.equal(name("plan-0088"), "GLM-5.2");
  assert.equal(name("plan-0202"), "GLM-5");
  assert.equal(name("plan-0082"), "GLM-5");
  assert.equal(name("plan-0069"), "GPT-5.6 Sol");
  assert.equal(name("plan-0070"), "GPT-5.6 Sol");
  assert.equal(name("plan-0010"), "GPT-6.1 Sol");
  assert.equal(name("plan-0011"), "GPT-6.1 Sol", "GPT 全系括号内的明确 Sol 版本可显示");
  const card = app.run('mainCard(planProfile(findPlanReference("plan-0088")), eligibleProfiles())');
  assert.match(card, /GLM-5\.2 适合复杂编码任务/);
  assert.doesNotMatch(card, /GLM-5\.3/);
  const denied = app.run(`(() => {
    const p = { ...findPlanReference("plan-0157"), models:"GLM-5.2、GLM-5.2-Flash；不含 GLM-5.3", modelExcludes:["GLM-5.3"] };
    return roleDisplayName(p, MODEL_ROLES.find(r => r.id === "glm-5"));
  })()`);
  assert.equal(denied, "GLM-5.2", "被明确排除的较新版本不能成为显示名称");
  healthy(app);
});

test("Luna 与 Astra 显示本档版本，支持官方简称并保留未公开系列", () => {
  const app = createApp();
  const name = (id, roleId) => app.run(`roleDisplayName(findPlanReference(${JSON.stringify(id)}), MODEL_ROLES.find(r => r.id === ${JSON.stringify(roleId)}))`);
  assert.equal(name("plan-0040", "luna"), "GPT-5.6 Luna", "OpenCode Go 的 5.6 Luna 不能显示角色默认 6 Luna");
  assert.equal(name("plan-0008", "luna"), "GPT-6 Luna");
  assert.equal(name("plan-0010", "luna"), "GPT-6 Luna", "Luna 简称继承前一个明确 GPT 模型版本");
  assert.equal(name("plan-0010", "gpt-astra"), "GPT-6 Astra");
  assert.equal(name("plan-0011", "luna"), "GPT-6 Luna", "GPT 全系括号内的 Luna 版本可显示");
  assert.equal(name("plan-0011", "gpt-astra"), "GPT-6 Astra");
  const denied = app.run(`(() => {
    const p = { ...findPlanReference("plan-0010"), models:"GPT-5.6 Astra / GPT-5.6 Luna；不含 GPT-6 Astra / GPT-6 Luna", modelExcludes:["GPT-6 Astra","GPT-6 Luna"] };
    return ["gpt-astra","luna"].map(id => roleDisplayName(p, MODEL_ROLES.find(r => r.id === id)));
  })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(denied)), ["GPT-5.6 Astra","GPT-5.6 Luna"]);
  const unknown = app.run(`(() => {
    const p = { ...findPlanReference("plan-0010"), models:"GPT 系列" };
    return ["gpt-sol","gpt-astra","luna"].map(id => roleDisplayName(p, MODEL_ROLES.find(r => r.id === id)));
  })()`);
  assert.deepEqual(JSON.parse(JSON.stringify(unknown)), ["GPT Sol 系列","GPT Astra 系列","GPT Luna 系列"]);
  const models = app.run('planCodingBenchmarks(findPlanReference("plan-0040"), MODEL_ROLES.find(r => r.id === "luna")).map(hit => publicModelDisplayName(hit.row.model))');
  assert.ok(models.length && models.every(model => model === "GPT-5.6 Luna"), "评测仍只匹配权益中的 5.6 Luna");
  healthy(app);
});

test("套餐卡先展示付款简句和可操作按钮，全年费用、评测和档位表在详情中", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?budget=any&region=cn&tool=claude&task=hard" });
  const grid = app.elements.get("quickGrid");
  const cards = grid.querySelectorAll(".quick-card");
  for (const card of cards) {
    const summary = card.querySelector(".qc-payment-summary");
    assert.equal(summary.closest(".qc-details"), null);
    assert.match(summary.textContent, /首次.*按当前价续期/);
    assert.doesNotMatch(summary.textContent, /12 个月|费用情景|续费与优惠资格/);
    const details = card.querySelector(".qc-details");
    assert.ok(details && !details.open);
    assert.match(details.querySelector(".qc-payment-summary").textContent, /12 个月/);
    for (const content of card.querySelectorAll(".qc-bench, .qc-tiers")) assert.equal(content.closest(".qc-details"), details);
    for (const action of card.querySelectorAll(".cmp-add, [data-view-plan], .qc-primary, .qc-watch")) assert.equal(action.closest(".qc-details"), null);
  }
  app.run('pickerState.billing = "Y"; renderPicker();');
  const annual = grid.querySelector('[data-plan-id="plan-0002"]').closest(".quick-card");
  assert.match(annual.querySelector(".qc-payment-summary").textContent, /首次 \$200，一次支付全年/);
  healthy(app);
});

test("复杂任务评测只展示主力系列的精确版本，日常模型成绩不填充复杂任务卡", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?budget=200&region=intl&task=hard" });
  app.run(`BENCHMARK_SUMMARY.protocols = [{ id:"fixture-task", family:"deepswe", name:"Task fixture", unit:"%", total:2, rows:[
    { model:"claude-haiku-4-5", score:90, rank:1 }, { model:"claude-opus-5-5", score:80, rank:2 }] }]; renderPicker();`);
  assert.match(mainCardHtml(app), /Claude Opus 5\.5 80%/);
  assert.doesNotMatch(mainCardHtml(app), /Claude Haiku 4\.5 90%/);
  app.run('BENCHMARK_SUMMARY.protocols[0].rows.pop(); renderPicker();');
  assert.doesNotMatch(mainCardHtml(app), /qc-bench/, "没有主力模型评测时不借用日常模型成绩");
  healthy(app);
});

test("Cursor 复杂任务参考说明按量池费用，模型能力不被错误描述为不存在", () => {
  const app = createApp({ url:"http://127.0.0.1:8123/?budget=200&region=cn&tool=cursor&task=hard" });
  const own = app.elements.get("quickGrid").querySelector('[data-plan-id="plan-0098"]').closest(".quick-card");
  const reasons = own.querySelector(".qc-reasons").children.map((line) => line.textContent).join("；");
  assert.match(reasons, /复杂任务模型在按量池，需核对额度与费用/);
  assert.doesNotMatch(reasons, /没有匹配.*任务.*模型/);
  assert.equal(own.querySelector(".qc-bench"), null, "按量池复杂任务卡不展示附赠日常模型的评测");
  assert.match(app.elements.get("pickerPolicy").textContent, /模型用途分组.*可折算额度.*倍率.*套餐类别/);
  assert.match(app.elements.get("pickerPolicy").textContent, /公开评测仅供能力参考/);
  app.run('Object.assign(pickerState, { budget:"any", task:"daily" }); renderPicker();');
  assert.match(app.elements.get("pickerPolicy").textContent, /日常优先独立额度池/);
  assert.match(app.elements.get("pickerPolicy").textContent, /预算不限会优先较大额度档/);
  healthy(app);
});


test("日常为主的主计划也列出同一日常模型的省钱档，与升级参考选角一致", () => {
  const app = createApp({ url: "http://127.0.0.1:8123/index.html?budget=any&region=intl&task=daily" });
  healthy(app);
  const main = JSON.parse(app.run(`(() => { const m = chooseMain(eligibleProfiles()); return JSON.stringify({ vendor: m.p.vendor, plan: m.p.plan, loose: m.loose.map((r) => r.id), cheaper: cheaperTiers(m).map((x) => ({ plan: x.p.plan, loose: x.loose.map((r) => r.id), price: pickerMonthlyCNY(x.p) })), price: pickerMonthlyCNY(m.p) }); })()`));
  assert.ok(main.loose.length, "日常为主的主计划应带日常模型");
  assert.ok(main.cheaper.length > 0, main.vendor + " " + main.plan + " 应列出同一日常模型的更便宜档位");
  for (const tier of main.cheaper) {
    assert.ok(tier.loose.includes(main.loose[0]), tier.plan + " 应包含主计划的日常模型");
    assert.ok(tier.price < main.price, tier.plan + " 应比主计划便宜");
  }
  /* 复杂任务主计划仍按主力模型选省钱档。 */
  app.run('Object.assign(pickerState, { budget: "any", region: "cn", tool: "any", task: "both", billing: "M" }); renderPicker();');
  assert.equal(app.run('cheaperTiers(planProfile(PLANS.find((p) => p.vendor === "智谱 BigModel" && p.plan === "GLM Coding V3 Max"))).some((x) => x.p.plan === "GLM Coding V3 Pro")'), true);
  healthy(app);
});

if (require.main === module) main();
