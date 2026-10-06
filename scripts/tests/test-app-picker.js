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
  const checks = app.run(`(() => {
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
    for (const budget of ["0", "100", "200", "500", "any"])
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
      if (!main) continue;
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
      return { period: profile.windowPeriod, shared: profile.shared, card: dailyCard(profile, eligibleProfiles()), window: windowSentence(plan, profile.headline) };
    })()`);
    assert.equal(result.period, "none");
    assert.equal(result.shared, false);
    assert.match(result.card, /已包含/);
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
  const official = app.run('computeMetrics(METRICS_ALL.find(m => m.ref === "plan-0031"))');
  assert.equal(official.fLow, 9.6);
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
  const id = button.dataset.planId;
  app.fire(button, "click");
  assert.equal(app.run(`cmpState.items.some(p => p.id === ${JSON.stringify(id)})`), true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  button.focus();
  app.run("renderPicker();");
  const replacement = grid.querySelector('.cmp-add[data-plan-id="' + id + '"]');
  assert.equal(button.isConnected, false);
  assert.equal(replacement.getAttribute("aria-pressed"), "true");
  assert.equal(app.run("document.activeElement"), replacement);
  healthy(app);
});

if (require.main === module) main();
