// 一次性脚本：index.html 改造（字体/图标/滚动进度/hero 重构/h2 编号/图例色）
const fs = require("fs");
const FILE = "D:/workbuddy/coding-plan-comparison/index.html";
let s = fs.readFileSync(FILE, "utf8");
const rep = (a, b, opt) => {
  if (a instanceof RegExp) {
    if (!a.test(s)) throw new Error("not found(RegExp): " + a.source.slice(0, 70));
    s = opt ? s.split(a).join(b) : s.replace(a, b);
    return;
  }
  if (!s.includes(a)) throw new Error("not found: " + String(a).slice(0, 70));
  s = opt ? s.split(a).join(b) : s.replace(a, b);
};

// 1) 字体 + RemixIcon
rep(/<link rel="stylesheet" href="css\/style\.css\?v=\d+">/,
`  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css" />
  <link rel="stylesheet" href="css/style.css?v=41">`);

// 2) 滚动进度条
rep("<body>", '<body>\n    <div class="scroll-progress" aria-hidden="true"><span id="scrollBar"></span></div>', false);

// 3) hero 重构
const heroOld = s.match(/<div class="hero-badges">[\s\S]*?<div class="stats-row" id="statsRow"><\/div>/);
if (!heroOld) throw new Error("hero 块未找到");
const heroNew = `<span class="prompt-mark" aria-hidden="true">&gt;_</span>
      <h1><span>全球 Coding Plan</span><span>价格与额度对比。</span></h1>
      <p class="hero-lede">一次看全市面上在售的 AI 编程订阅计划 —— 模型官方 / 云厂商 / 第三方工具与中转站，<strong>每月价格</strong>与<strong>可用 token 额度</strong>逐项对比，并换算每百万 tokens 的实际成本与免费上手路径。</p>
      <p class="hero-meta">数据更新 <strong>2026-09-23～29</strong> · 每日 09:30 巡检 · 汇率 1 USD ≈ <span id="rateText">6.71</span> CNY · 来源见页脚</p>
      <dl class="stats-row" id="statsRow"></dl>`;
s = s.replace(heroOld[0], heroNew);

// 4) h2 去 emoji + 编号（按页面顺序）
const secs = [
  ["个人订阅价格全景", "05"],
  ["团队 / 企业 / 云厂商（每席位价格）", "08"],
  ["每周可用 tokens 对比（官方公布 + 社区推算）", "07"],
  ["额度深度对比（TPS · Tokens · 额度价值 · 额度倍率）", "03"],
  ["API 按量计费：token 的单价", "06"],
  ["免费 Coding 入口", "04"],
  ["全部在售计划（完整数据）", "09"],
  ["2026 年 9 月重要动态", "10"],
  ["数据来源与说明", "11"],
];
for (const [t, n] of secs) {
  const idxH2 = s.indexOf("<h2>");
  // 找包含该标题文字的 h2
  const at = s.indexOf(t);
  if (at < 0) { console.log("warn: 未找到 -> " + t); continue; }
  const h2start = s.lastIndexOf("<h2>", at);
  const h2end = s.indexOf("</h2>", at) + "</h2>".length;
  const old = s.slice(h2start, h2end);
  const inner = old.replace(/<\/?h2>/g, "").replace(/<span class="sec-no">[^<]*<\/span>/, "").trim();
  s = s.slice(0, h2start) + '<h2><span class="sec-no">' + n + "</span>" + t + "</h2>" + s.slice(h2end);
}
rep("<h2>⚡ 30 秒决策卡</h2>", '<h2><span class="sec-no">01</span>30 秒决策卡</h2>');
rep("<h2>💵 每百万 tokens 实际成本排行</h2>", '<h2><span class="sec-no">02</span>每百万 tokens 实际成本排行</h2>');

// 5) 图例色点 → 领域色
rep('<span><i style="background:#6366f1"></i>模型官方订阅</span>', '<span><i style="background:#5575f6"></i>模型官方订阅</span>');
rep('<span><i style="background:#22d3ee"></i>第三方工具订阅</span>', '<span><i style="background:#16b8a6"></i>第三方工具订阅</span>');
rep('<span><i style="background:#34d399"></i>云厂商/API 套餐</span>', '<span><i style="background:#ff973d"></i>云厂商/API 套餐</span>');

// 6) 主题按钮初始图标
rep('<button id="themeBtn" class="theme-btn" title="切换主题：暗色 → 亮色 → 跟随系统"></button>',
    '<button id="themeBtn" class="theme-btn" title="切换主题：暗色 → 亮色 → 跟随系统"><i class="ri-moon-line" aria-hidden="true"></i></button>');

fs.writeFileSync(FILE, s);
console.log("index.html 改造完成");
