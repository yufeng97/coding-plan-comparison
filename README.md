# Coding Plan 全球比价中心

国内外在售 AI Coding Plan（编程订阅计划）的价格与 token 额度可视化对比页面。

## 数据覆盖

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI Grok、Mistral、智谱 GLM Coding Plan（国内+国际版 V1/V2/V3）、月之暗面 Kimi、MiniMax、小米 MiMo、阶跃 Step Plan 等
- **第三方工具与中转站**：GitHub Copilot、Cursor、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、AWS Kiro、Factory Droid、Canopy Wave、OpenCode、Command Code、腾讯 CodeBuddy、字节 Trae、百度文心快码，以及 R4 Coder、ZenMux、PackyCode、AICodeMirror、88code、DuckCoding、AIGoCode、DevPass、Chutes 等 API 中转站
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts、讯飞星辰 Astron Coding Plan 等
- **API 按量计费**：29 款主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

数据调研与核实日期：**2026-09-23～30**；全部来自官方定价页或权威报道（页脚附来源链接）；覆盖 56 家厂商、194 档订阅计划、26 个免费入口、46 行额度深度对比（官方数据 + 标注置信度的社区估算）。

## 使用方式

无需构建。字体与图标已放在 `libs/fonts/`，用浏览器打开 [index.html](index.html) 即可。

本地预览请用项目自带的静态服务器（只监听 127.0.0.1，且不能读到项目目录以外的文件）：

```bash
npm run serve
```

## 页面结构

1. **快速决策卡**：四张卡片直接给结论（性价比首选 / 国内最便宜 / 免费上手 / 国际旗舰）
2. **性价比排行**：有官方每周 token 数据、且新用户可购买的计划，按每百万 tokens 实际成本排序（不含请求折算、第三方估算、已停售/已下架、一次性预付、仅老用户续费）
3. **个人订阅价格全景**：全部个人档月费横向条形图（可按类别/地区筛选，月付/年付切换，统一折算人民币，悬停查看原币与额度）
4. **团队/企业/云厂商**：席位价与整包价对比
5. **GLM 官方每周 token 估算**：唯一官方公布可折算 token 总量的厂商，含性价比换算
6. **额度深度对比**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率（含 Command Code / 阶跃 credits 制与智谱 V1/V2/V3 各版本，附推算方法论）
7. **API 按量计费**：29 款模型每百万 tokens 输入/输出单价 + $10 购买力对比
8. **免费 Coding 入口**：26 个零成本方案卡片
9. **完整数据表**：全部计划，支持搜索/筛选/排序
10. **行业动态 + 数据来源 + 不确定性说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 页面结构 |
| `css/style.css` | 样式（深色主题） |
| `js/data.js` | 全部数据（订阅计划、API 单价、动态、来源；额度对比数据经 `ref` 引用 `PLANS` 的价格，改价只改 `PLANS` 一处） |
| `js/app.js` | 图表与表格渲染逻辑 |
| `libs/echarts.min.js` | ECharts 5.5.1（本地化） |
| `libs/fonts/` | Manrope、IBM Plex Mono 与 Remix Icon（本地化，可用 `node scripts/vendor-fonts.js` 重新下载） |

## 免责声明

各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.71 CNY（2026-09-23 实测汇率）折算仅用于图表对比；价格随官方随时调整，购买前请以官网为准。
