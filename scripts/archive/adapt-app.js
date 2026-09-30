// 一次性脚本：app.js 适配新设计（领域色 / PAL 暖纸暖墨 / stats 裸排 / RemixIcon）
const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "..", "js", "app.js");
let s = fs.readFileSync(FILE, "utf8");
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error("not found: " + String(a).slice(0, 70));
  s = s.split(a).join(b);
};

// 1) 领域色系统
rep(
  'const CAT_COLOR = { official: "#6366f1", tool: "#22d3ee", cloud: "#34d399", team: "#f59e0b" };',
  'const CAT_COLOR = { official: "#5575f6", tool: "#16b8a6", cloud: "#ff973d", team: "#8d6bea" };'
);

// 2) PAL 新值（暖纸 / 暖墨）
rep(
`  PAL = L ? {
    text: "#1a2438", dim: "#46536e", catLabel: "#2e3a55", faint: "#71809c",
    axisLine: "rgba(15,23,42,.32)", splitLine: "rgba(15,23,42,.1)",
    tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(15,23,42,.16)", tipText: "#1a2438",
  } : {
    text: "#e7ecf7", dim: "#9aa7c2", catLabel: "#c3cde4", faint: "#8b98b8",
    axisLine: "rgba(154,167,194,.35)", splitLine: "rgba(154,167,194,.12)",
    tipBg: "rgba(14,20,36,.96)", tipBorder: "rgba(255,255,255,.14)", tipText: "#e7ecf7",
  };`,
`  PAL = L ? {
    text: "#10110f", dim: "#6f726b", catLabel: "#3a3d38", faint: "#8a8d85",
    axisLine: "rgba(16,17,15,.22)", splitLine: "rgba(16,17,15,.07)",
    tipBg: "rgba(255,255,255,.98)", tipBorder: "rgba(16,17,15,.18)", tipText: "#10110f",
  } : {
    text: "#eceee8", dim: "#9fa39a", catLabel: "#c8ccc2", faint: "#74786f",
    axisLine: "rgba(236,238,232,.2)", splitLine: "rgba(236,238,232,.08)",
    tipBg: "rgba(22,24,21,.97)", tipBorder: "rgba(236,238,232,.16)", tipText: "#eceee8",
  };`);

// 3) renderStats → 裸排 dl（等宽 dt + 领域色 icon + 等宽 dd）
rep(
`  const items = [
    { num: vendors.size, lbl: "覆盖厂商（官方+云厂商+第三方）" },
    { num: PLANS.length + " 档", lbl: "在售订阅计划" },
    { num: freeCnt, lbl: "免费可用入口" },
    { num: API_PRICES.length, lbl: "主流模型 API 单价（输入/输出）" },
    { num: fmtCNY(minCny) + "<small>/月起</small>", lbl: "最低付费档：" + planLabel(minP) },
    { num: fmtCNY(maxCny) + "<small>/月</small>", lbl: "最高档：" + planLabel(maxP) },
  ];
  document.getElementById("statsRow").innerHTML = items
    .map((i) => \`<div class="stat"><div class="num">\${i.num}</div><div class="lbl">\${i.lbl}</div></div>\`)
    .join("");`,
`  const items = [
    { icon: "ri-global-line", num: vendors.size, lbl: "覆盖厂商", sub: "官方 / 云厂商 / 第三方" },
    { icon: "ri-stack-line", num: PLANS.length, lbl: "在售订阅计划", sub: "官方 / 工具 / 中转站" },
    { icon: "ri-gift-line", num: freeCnt, lbl: "免费可用入口", sub: "见「免费 Coding 入口」" },
    { icon: "ri-price-tag-3-line", num: API_PRICES.length, lbl: "API 模型单价", sub: "输入 / 输出对比" },
    { icon: "ri-arrow-down-circle-line", num: fmtCNY(minCny), sub: "/月起 · " + planLabel(minP) },
    { icon: "ri-arrow-up-circle-line", num: fmtCNY(maxCny), sub: "/月 · " + planLabel(maxP) },
  ];
  document.getElementById("statsRow").innerHTML = items
    .map((i) => \`<div><dt><i class="\${i.icon}"></i>\${i.lbl}</dt><dd>\${i.num}\${i.sub ? \`<small>\${i.sub}</small>\` : ""}</dd></div>\`)
    .join("");`);

// 4) 主题按钮 → RemixIcon
rep(
  '    btn.textContent = mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "💻";',
  `    btn.innerHTML = mode === "dark" ? '<i class="ri-moon-line"></i>' : mode === "light" ? '<i class="ri-sun-line"></i>' : '<i class="ri-computer-line"></i>';`
);

fs.writeFileSync(FILE, s);
console.log("app.js 适配完成");
