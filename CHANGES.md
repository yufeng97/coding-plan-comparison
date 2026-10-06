# Coding Plan 数据变更日志

> 按数据核查和代码修复批次记录。

## 2026-10-06：每日巡检——官方页核对日

- OpenAI Codex 定价页：与 10-05 完全一致（档位 Free/Go $8/Plus $20/Pro $100–500/Business $20–25、Plus 5h 条数、GPT-5.5 10-14 退役、GPT-5.6 Sol 促销至 11-21、Speed 两口径倍率、Codex Security 仅 Business/Enterprise 无公开定价）。官方周报（9-28~10-02）无新价格条目；第三方「Pro 200 于 9-29 重新开放订阅」与官方页三档 Pro 均在售一致，无需改库。
- Anthropic：API 定价页与库内一致，无 10 月调价（Opus 5.5 $4/$20、Sonnet 5.5/5 $2/$10、Haiku 4.5 $1/$5）。新增观察：Claude Managed Agents 新增会话运行时费 $0.08/会话小时（按 token 之外的独立计量），不折入每百万 tokens 牌价表，暂不单列 API 行。
- 国内与工具：智谱/Z.ai 无新调价，双节非高峰 5 折与夜间畅用进行至 10-07（最后一天）；BigModel API 牌价 GLM-5.3 ¥8/¥28、Flash ¥0.8/¥2.8、FlashX ¥2/¥7 与库一致；Kimi K3 ¥20/¥100（缓存命中 ¥2）、K2.7-Code ¥6.5/¥27 一致；Cursor 免费/$20/$40（Ultra $200、Teams Premium $120 已在库）一致。
- Google：Gemini API 定价页（10-01 更新）与库一致（3.8 Flash 介绍价 $0.75/$3.75 至 2026-12-31，2027-01-01 起 $1.50/$7.50）；官方页仍无 Gemini 4 系列，「Gemini 4 Argon $2/$10」传闻（社交平台二次传播）继续未入库。新增弃用公告：Gemini 2.5 Flash Image（Nano Banana）10-02 停用，属图像模型不影响编程额度。订阅消费页价格为 JS 渲染，本日未复核（10-05 真实浏览器核对仍有效）。
- META.updated → 2026-10-06；本轮未改任何价格数值，仅新增 4 条核对记录。

## 2026-10-05：每日巡检——官方页核对日

- OpenAI Codex 定价页：订阅档位、Plus 额度表、Pro $100/$200/$500（无 5 小时上限）、GPT-5.5（10-14 退役）与 GPT-5.6 Sol 促销（至少至 11-21）均与库内一致。定价页新增 Codex Security（插件/CLI/Security Cloud，Cloud 为 research preview），官方无公开定价，第三方「$30/活跃提交者/月」无官方对应，未入库；Speed 倍率官方区分两口径——订阅内额度 Fast 2.5×/Astra Ultrafast 8×，购买 credits/企业按量 Fast 2×/Ultrafast 6×（补全 10-03 只记的订阅内口径）。
- Anthropic：API 与订阅页与库内一致，无 10 月调价（Opus 5.5 $4/$20、Sonnet 5.5/5 $2/$10、Haiku 4.5 $1/$5；Pro $17 年付/$20 月付、Max $100 起、Team $20–25/$100–125 席位）；官方横幅「Claude Cowork is now just Claude」正向 Pro/Max 滚动，不涉及价格。
- 国内与工具：智谱/Z.ai 无新调价，双节非高峰 5 折与夜间畅用（均至 10-07）进行中，V3 三档积分额度一致；Kimi API K3 ¥20/¥100、K2.7-Code ¥6.5/¥27 一致；Cursor 免费/$20/$40 一致。
- Google：AI Plus $4.99 / Pro $19.99 / Ultra $99.99（5x/20x）与 10-04 校正值一致；Gemini API 定价页确认 3.8 Flash 介绍价 $0.75/$3.75 至 2026-12-31、2027-01-01 起 $1.50/$7.50，补进 API 表 3.1 Pro 行备注；「Gemini 4 Argon 9-30 发布」传闻官方 API 定价页无 Gemini 4 系列，未入库。
- META.updated → 2026-10-05；本轮未改任何价格数值，仅新增核对记录与一处 API 备注。

## 2026-10-04：审查问题全部修复与258条官网核价

- 安全与工具：静态服务器封锁 NTFS 目录别名/备用数据流，交换目录与恢复同时失败时保留完整备份，检查和测试进程被信号终止或返回未知状态时失败，修正 Windows Chromium 缓存路径。构建实测出现暂存目录改名的短暂EPERM后，增加有界重试：仅EPERM/EBUSY/EACCES每次改名最多5次、累计等待375ms，耗尽仍抛错并保留回滚备份；未定位外部占用来源。
- 额度与推荐：月池/未知周期不再生成虚假5h额度；免费且包含推理的日常入口可作合规补充；校验器按计划引用的实际币种核对API牌价。讯飞支持模型恢复V4-Flash，请求额度按官方抵扣2修正为3000/22500/45000，异版本API代理改作低置信估算并退出两类官方排行；阿里月度发放与库存冲突按官方口径说明。
- 交互与性能：后退到相同查询串仍完成被取消的搜索渲染，年付读屏摘要与柱值一致，隐藏回顶按钮不再进入键盘焦点。离屏表格延迟布局；缩放仅调整尺寸变化的可见图表，离屏图表滚入后补齐并保留图例选择。
- 价格：逐条核查212套餐、36 API、10 PAYG，105官方来源。179条一致、40条记录校正、8条询价、7条停售、24条待核实。修正22条记录的金额/币种字段（包括年付补充和撤销无依据年价）。价格核查日期、状态、说明及来源进入页面和导出，待核历史价退出推荐和图表；删除与现行核查结果矛盾的旧页脚说明，保留完整台账。
- 数据版本更新为2026-10-04，汇率日期单独保留2026-09-23。Cursor印度价格保留₹649，导出附INR/CNY与USD/CNY汇率及来源。Kiro个人档按个人资格展示，每用户计价说明保留。
- 验证：10个Node回归套件、语法/类型/数据校验；33项真实Chromium回归以及桌面/375px的16项浏览器抽查，依赖审计零漏洞。51个资源缓存一致，连续两次构建及部署dry-run通过，共53个公共文件，审计和工具未进入产物。目录重试与失败恢复新增3组真实临时目录测试，工具套件共26项通过。本轮未进行实际部署。

## 2026-10-04：全面代码审查修复 + scripts 重组——①数据：plan-0155 折扣备注按 ¥149 本价重算（原误用 Lite ¥49 基价），Step Plan 四档补年付折月价（38/78/155/555.5），月之暗面 Moonshot→月之暗面 Kimi、阿里云两写法与腾讯云裸名统一，PLAN_TOKENS 的 lowM/highM 改由 METRICS_RAW 同 ref+model 行派生（周额度不再两处维护），智谱重复行用 weeklyChart:false 标注替代厂商硬编码，META 增 rateAsOf 字段；②校验器：priceY↔priceM 交叉（plan-0007 豁免）、指标行牌价币种/数值锚点校验、API_PRICES 查重、ref 指向停售档警告、免费档排除单源化；③运行时：「帮我选」betterWindow 平价决胜改为更便宜者胜，popstate 恢复先做状态快照（纯锚点前进/后退不再全量重绘两表五图），hash 前进/后退消除 popstate+hashchange 双跳，事件绑定与历史恢复逐步 boot 容错，懒加载失败清理 chartCache 残留实例，rerenderCharts 单图错误隔离，三个 scroll 监听合并到 rAF 帧调度，mmodel 参数入 URL 白名单，state1→personalState，排序表头抽 bindSortableHeader，推荐引擎额度文案统一走 resolvedField，预算容差 BUDGET_EPS 常量化，图高公式 chartHeight 收敛 6 处，每 M 成本阈值 cpmTier 单源（图表/表格/说明共用），CSV 导出防公式注入，额度区间展示规则与 tokSpan 统一（≤5% 差只显单值），团队图补空态，metricsNote 固定文案抽常量；④工具链：scripts 重组为 build/server/tests/lib 四组（test-app.js 1334 行拆为 harness+history/picker/charts/tables 四套件+run.js 依序执行），抽共享 lib/paths.js 与 lib/atomic-swap.js（三处暂存→备份→回滚、四处路径判断收敛），vendor-fonts 限定 Google Fonts 域并加响应大小上限，deploy-site 缺 project.json 给出 vercel link 提示且脱敏错误保留调用链堆栈，check-syntax 空 js 目录拒绝通过；⑤CI/部署：失败时上传 Playwright trace/截图、npm 与 Chromium 缓存、timeout/concurrency/permissions，新增 .vercelignore 白名单兜底 CLI 部署路径，vercel.json 补 CSP/X-Frame-Options/Permissions-Policy；33 项用户流程 + 55 项额度换算 + 29 项数据回归 + 21 项工具回归 + 27 项 Chromium 回归全绿。数据价格本身除上述备注修正外未改动，META.updated 维持 2026-10-03。

## 2026-10-03：页面 UI 细查修复——移除效果不明显的「购买资格」筛选与 country 分享参数，国家限定档仅在完整表中标记，不参与通用推荐；推荐控件分组、导航当前章节/实际页头偏移、亮暗主题文字对比度与键盘焦点统一；修复小屏免费卡片宽度和冻结首列透明叠字，卡片来源对齐；空图/空表提供明确反馈与清除入口，无结果禁用导出，个人图展开后可收起；对比弹窗支持逐档移出、满额提示和关闭后焦点恢复；每周图两段区间随同一图例完整切换，恢复 Plus 结构化公式的周量展示；每周/API/购买力图例改为可用键盘操作的按钮，API 增加完整数值与来源明细表，长轴名移到轴下方避免窄屏截断。价格数据版本未改变。

## 2026-10-03：全面审查修复——明确区分编程入口、附赠推理额度与购买国家，国家限定档默认不推荐；月池/无5h上限/共享关系分别记录，未知关系不再触发无依据的加购，同套餐日常覆盖标「已包含」，补充订阅列合计月费并遵守预算；套餐继承按明确名称解析并保留 Project Genie、Astra Ultrafast 等追加权益；Plus 使用官方条数与单次 tokens 区间，删除 Cursor 消费场景额度估算，修复 Gemini Pro/Kimi 旗舰识别及非法数字、跨币种 credits；价格表/并排对比/导出保留一次性、席位和每4周单位，4周档不混入月付图；图表跳表清除冲突筛选、锚点跳转先完成上方图表布局、debug 参数保留、存储受限仍能使用主题；手机轴标签和图表网格限制宽度、长文本换行，缩短首屏并默认显示20档，新增计算假设与对比差异提示；静态服务器拦截大小写变体的 .git 和链接越界，新增数据/用户流程/HTTP 回归并接入 Linux/Windows CI。数据日期为整库版本日，未将本轮代码审查当作逐档价格重新核实。

## 2026-10-03：API 按量计费图优化——右图「$10 购买力」补上图例（青=国际模型、绿=国内模型，双系列 barGap -100% 重叠实现可点击过滤）；两图纵轴统一为「厂商 · 模型」格式：label 里的平台后缀（(Z.ai)/(BigModel)/[硅基]）与「·国内」后缀移除，由厂商前缀（新增 5 个厂商短名映射）与颜色承担区分，厂商名与模型名重复时去重（DeepSeek · Flash）；右图 tooltip 改 axis 触发 + 阴影指示器，与左图悬停条纹一致
## 2026-10-03：每日巡检（10-02/10-03）——官方页核对日：OpenAI Codex 定价页与 10-01 口径一致，新增确认 GPT-5.6 Sol 促销 credits 价（100/10/500 每百万 tokens）至少延续至 2026-11-21、Speed 档倍率 Fast 2.5×/Astra Ultrafast 8×；Anthropic API 页与库内一致无 10 月调价（Opus 5.5 $4/$20、Sonnet $2/$10 标准价）；智谱/Z.ai 无新调价，双节非高峰 5 折与夜间畅用进行中（至 10-07）。第三方「Plus 用量 10-30 起 20×降 10×」传闻官方页无据、第三方「Anthropic API 10-01 调价」所列即现行价，均未入库。META.updated → 2026-10-03

## 2026-10-02：审查收尾——chip 高亮改为渲染时自愈（renderRankChart/renderPicker 末尾各调 syncRankChips/syncPickerChips，未来程序化改筛选状态不再脱钩）；auditProfiles 先锁定「国内+不限预算+不限工具」前提再断言、结束后还原，修复带 region=intl 等分享链接打开 ?debug=1 时省钱档断言误报且污染页面状态的问题
## 2026-10-02：审查补丁——对比条在点「＋对比」后才出现，只选 1 档时写明「再选 1 档可对比」；「＋对比」改成计划名下的胶囊按钮并补 aria-pressed；排行悬停的每 M 成本颜色与柱色一致，月 tokens / 月倍率缺数据时显示「—」而不是抛错
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
