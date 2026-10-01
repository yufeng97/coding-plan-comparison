# Coding Plan 数据变更日志

> 由每日巡检任务自动追加（每天 09:30），人工调研的大版本更新也记录在此。

## 2026-10-01：新闻巡检入库——GPT-6.1 Sol（9/29，API $2/$10、缓存 $0.10）与 Claude Sonnet 5.5（9/28，$2/$10）上线；ChatGPT Plus 额度表加 GPT-6.1 Sol 15–160 条/5h，Pro 官方重构为 $100/$200/$500 三档（不再标 5x/20x、注明目前无 5 小时上限，Astra Ultrafast 仅 $500 档，估算行降低置信）；Cursor 新增印度 Start 档（₹649）并把 Ultra 标回双池；Copilot Pro/Pro+ 模型列表更新；API 图 +2 行。修 oneSharedWindow：「共享」措辞不再压过官方逐模型条数（ChatGPT Work 与 Codex 用量共享 ≠ 模型共用窗口）
## 2026-10-01：「帮我选」日常补充档不再无脑选最便宜——排序改为独立日常池（双池/档内分池）优先，其次官方点名的条数信号（如 Luna 350–3,000 条/5h），不限预算时 ChatGPT Go $8 会让位给 Plus $20（独立 Luna 池）；补充档与「预算放不下」卡补上加粗套餐名与徽标；日常主计划同一套规则对齐
## 2026-10-01：「帮我选」修复三处——同厂低档补回可见（不限预算不再只见 Max，省钱档行列出 GLM Pro/Lite）、选具体工具时追加自家订阅对照卡（Cursor/Anthropic/OpenAI，含一键放宽地区/预算）、日常覆盖卡不再空推荐（同档慢烧模型直接给出用法）；智谱连续包年 7 折、包季 8 折重新在售（年付折算 ¥82.6/376.6/754.6，官网直抓），双节全天非高峰与夜间畅用活动入库；修 offerable 把「不限量」误判限量、multiplier 漏匹配「×」两个隐性 bug
## 2026-09-30：重要动态的日期改为来源发生日；只有核对日、没有公告日的条目标成「核实」
## 2026-09-30：其余免费入口复核——Claude/Grok/ZenMux/Bolt 移出，Roo Code 扩展下架并改记 Roomote 自托管，Kilo 改链 kilo.ai
## 2026-09-30：免费入口复核——88code FREE 停发且站点 403，DuMate 改链官网，Lovable 不作为 Coding Agent 额度
## 2026-09-30：Copilot Pro 去掉不存在的「中价额度 $1.5/$6」，改为 Gemini 3.5 Flash（$1.50/$9）与 Claude Sonnet 5（$2/$10）
## 2026-09-30：智谱两条产品线按官方品牌分开称呼——国际站 Z.ai，国内开放平台智谱 BigModel
## 2026-09-30：小米 Token Plan 按官方 Credits 系数进入额度对比；补进腾讯云通用 Token Plan、百度千帆个人 Token Plan、七牛云企业 Token Plan
## 2026-09-30：额度深度对比去掉混元 HY2，改为 Hy3 / Hy4-preview，并按模型挂牌拆开「多模型/混合」
## 2026-09-30：R4 Coder Starter $5 档确认下架（用户报告）；待核实 ZenMux 方案
## 2026-09-29：新增 8 家第三方中转站（PackyCode/AICodeMirror/88code/DuckCoding/AIGoCode/DevPass/Chutes）、R4 改版为 $5/$10/$20 预付包、厂商查漏（Kiro/Droid/讯飞 Astron/阶跃 Step Plan/Canopy Wave/OpenCode Go Plus）
## 2026-09-23：初版 154 档上线（55→47 厂商口径见 README 历史）
