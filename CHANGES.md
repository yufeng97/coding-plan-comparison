# Coding Plan 数据变更日志

> 由每日巡检任务自动追加（每天 09:30），人工调研的大版本更新也记录在此。

## 2026-10-02：工具链清零——①TypeScript checkJs 静态检查从 57 条诊断清到 0：app-core 新增 byId/qsa/qs/evtTarget 四个 DOM 类型断言助手（统一 83 处元素访问），renderTokensChart 补 TokenRow typedef，额度表行补 payg:false 对齐联合类型；typecheck 纳入 package.json（typescript devDependency）与 CI 第 2 步；②validate-data 报告分级：15 条「无标价（按量/定制）」与 2 条「PAYG 未在 API_PRICES 单列」为设计内状态，从警告降级为「ℹ️ 说明」，警告只留给巡检需人工确认的问题——每日巡检输出恢复零警告
## 2026-10-02：P2-8 并排对比——数据表计划列内「＋对比」勾选 2–4 档（超限拦截、再点移除），底部浮动条聚合显示，dialog 并排对比 8 个字段（价格含折算与年付、额度官方口径、模型、支持工具、备注、来源）；对比集写入 URL cmp= 参数可分享，打开带参链接自动恢复并弹出对比视图（无效档位过滤、超上限截断）；file:// 直开降级兼容。审查修复：init 的 cmp 截断改用 CMP_MAX 常量、dialog 关闭加守卫、移动端回顶按钮避让浮动条、dialog 补 aria-labelledby、validator 增加对比容器检查
## 2026-10-02：用户体验批次（按访客走查实测落地）——①URL 状态化：帮我选四维、个人全景/排行/数据表/额度表的全部筛选与排序实时写入地址栏（非默认键才写入），带白名单校验的恢复逻辑，复制网址即可分享同一套推荐；file:// 直开降级为仅当前页生效；默认值只快照一次防污染；②移动端顶栏收纳：≤700px 导航收成单行水平滑动（实测 223px→90px）；③数据表移动精简列：窄屏默认隐藏模型/支持工具/备注（2028px→1290px），「全部列」开关随时展开（仅移动端显示）；④导出：数据表一键下载当前筛选排序结果的 CSV（UTF-8 BOM、筛选+日期命名）与复制 Markdown 表格；⑤键盘可达：11 个排序表头加 tabindex + Enter/Space 触发 + focus-visible 样式；图表补 aria-label 文字摘要（排行前三等）；⑥信任细节：hero 巡检文案注明「无变化则不更新」，页脚加「纯静态无跟踪」声明。⑦懒加载加固：IO 之外补滚动位置检查 + 自清理短轮询，隐藏标签页等 IO 不产帧的环境下图表仍保证最终渲染（LAZY_DONE 防重复）
## 2026-10-02：目录清理——删除 scripts/archive 下 4 个一次性迁移脚本（adapt-app/patch-validator/redesign-html/repair-free-s1，零引用，git 历史可查）；vendor-fonts.js 移出 archive 并去掉已失效的 Remix Icon 下载段（图标已改内联 SVG），只保留 Google Fonts 子集更新；新增 libs/README.md 自证第三方产物版本与来源（echarts 精简构建命令、字体家族、许可证）
## 2026-10-02：性能与可维护性改造（不改任何对外数据/文案）——①ECharts 换按需精简构建（1030KB→493KB，只含柱状图+Grid/Tooltip/Legend/Title/AxisPointer，重建入口 scripts/echarts-entry.mjs）；②Remix Icon 字体（173KB）替换为内联 SVG（app-core 的 ICON_SVG，共 10 个图标），删除 remixicon.css/woff2；③首屏以下五张图 IntersectionObserver 懒渲染（rootMargin 200px 预热），整页传输 1794KB→962KB、DOMContentLoaded 558ms→265ms；④数据表搜索加 150ms 防抖。可维护性：⑤app.js 拆为 metrics.js（纯计算，测试/校验共用）+ app-core/charts/picker/tables/init 五个经典脚本（保 file:// 直开，加载顺序见 README）；⑥新增 scripts/test-metrics.js（49 项手算基准：blendPrice/windowTokens/periodRates/computeMetrics/旗舰正则/角色匹配），顺带修出 4 个真缺口——旗舰正则漏「MiniMax M3/MiMo Pro/Step 5/Doubao Seed 2.0 Pro」空格写法、未排除「GPT-5 mini」、credits 面值为 0 未返回 null；⑦额度表 16 列收敛为 METRICS_COLUMNS 列配置（表头/排序取值/单元格渲染同源，加列只改一处）；⑧类别色值以 CSS 变量 --cat-* 为单一色源（新增 --cat-relay），图例改由 JS 按主题生成；⑨scripts/bump-versions.js 按内容哈希回写 ?v=；⑩auditProfiles 自检移出生产路径（?debug=1 才跑）；⑪新增 GitHub Actions CI（语法+validate+test+bump 一致性）、jsconfig checkJs；README 增「开发与架构约定」
## 2026-10-01：代码审查修复——每周 tokens 图的 modelShort 区分 GPT-6.1 Sol（原先与 GPT-6 Sol 显示成重复标签）；isFlagshipModelName 识别 GPT-6.1 Sol 为旗舰（排行图「只看旗舰」不再漏掉它）；oneSharedWindow 删除恒真的死分支；planBadges 与 hasCodingSurface 重复的「自家客户端」正则合并为共享常量；renderApiChart 去掉被覆盖的死高度赋值；index.html 补内联 SVG favicon（消除 404）；样式表删除未使用的 .qc-icon/.qc-why；缓存版本号 app.js v66 / style.css v51
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
