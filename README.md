# Coding Plan 全球比价中心

国内外在售 AI Coding Plan（编程订阅计划）的价格与 token 额度可视化对比页面。

## 数据覆盖

- **模型官方订阅**：Anthropic Claude、OpenAI Codex（ChatGPT）、Google Gemini/Antigravity、xAI Grok、Mistral、智谱 GLM Coding Plan（国内+国际版）、月之暗面 Kimi、MiniMax 等
- **第三方工具订阅**：GitHub Copilot、Cursor、Windsurf/Devin、Zed、Cline、Roo Code、Kilo Code、Amp、JetBrains AI、Augment、OpenRouter、Lovable、Bolt.new、Replit、腾讯 CodeBuddy、字节 Trae、百度文心快码、心流 iFlow 等
- **云厂商/企业档**：AWS Q Developer、Google Gemini Code Assist、阿里云通义灵码（Qoder CN）、腾讯云、华为云 CodeArts 等
- **API 按量计费**：29 款主流编程模型的输入/输出单价（USD 与 CNY 原币，统一折算对比）

数据调研与核实日期：**2026-09-24**，全部来自官方定价页或权威报道（页脚附来源链接）；覆盖 42 家厂商、154 档订阅计划、23 个免费入口。

## 使用方式

无需构建，直接用浏览器打开 [index.html](index.html) 即可（所有依赖均已本地化）。

也可以用任意静态服务器，例如：

```bash
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve('.');http.createServer((q,s)=>{let p=q.url==='/'?'/index.html':q.url;fs.readFile(path.join(root,p),(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200);s.end(d)})}).listen(8123,()=>console.log('http://127.0.0.1:8123'))"
```

## 页面结构

1. **个人订阅价格全景**：全部个人档月费横向条形图（可按类别/地区筛选，月付/年付切换，统一折算人民币，悬停查看原币与额度）
2. **团队/企业/云厂商**：每席位价格对比
3. **GLM 官方每周 token 估算**：唯一官方公布可折算 token 总量的厂商，含性价比换算
4. **API 按量计费**：29 款模型每百万 tokens 输入/输出单价 + $10 购买力对比
5. **额度深度对比**：TPS + 5h/周/月的 Tokens·额度价值·额度倍率（23 行，含 Command Code credits 制与智谱 V1/V2/V3 各版本）
6. **免费 Coding 入口**：23 个零成本方案卡片
6. **完整数据表**：全部计划，支持搜索/筛选/排序
7. **行业动态 + 数据来源 + 不确定性说明**

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 页面结构 |
| `css/style.css` | 样式（深色主题） |
| `js/data.js` | 全部数据（订阅计划、API 单价、动态、来源） |
| `js/app.js` | 图表与表格渲染逻辑 |
| `libs/echarts.min.js` | ECharts 5.5.1（本地化） |

## 免责声明

各家「额度」口径不同（每 5 小时 prompts / 每周 tokens / 每日请求 / credits），不能直接互比，表内保留官方原文；美元价格按 1 USD ≈ 6.71 CNY（2026-09-23 实测汇率）折算仅用于图表对比；价格随官方随时调整，购买前请以官网为准。
