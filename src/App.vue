<script setup lang="ts">
/* 整页骨架：页头、首屏、选购与比较章节、辅助资料（评测、关注、贡献、来源）、对比与完整权益窗口和页脚。
 * 章节内容由 src/sections/ 的组件渲染；保留原 ID、class 与 ARIA，分享链接的锚点不变。 */
import { rankPaymentLabel } from './state/rank';
import AppHeader from './layouts/AppHeader.vue';
import AppFooter from './layouts/AppFooter.vue';
import SiteHero from './sections/site/SiteHero.vue';
import PickerControls from './sections/picker/PickerControls.vue';
import PickerRecommendations from './sections/picker/PickerRecommendations.vue';
import ServiceActions from './sections/picker/ServiceActions.vue';
import PersonalPrices from './sections/pricing/PersonalPrices.vue';
import FreePlans from './sections/pricing/FreePlans.vue';
import RankChart from './sections/pricing/RankChart.vue';
import WeeklyTokens from './sections/pricing/WeeklyTokens.vue';
import TeamPrices from './sections/pricing/TeamPrices.vue';
import ApiPrices from './sections/pricing/ApiPrices.vue';
import PlanTable from './sections/pricing/PlanTable.vue';
import MetricsTable from './sections/pricing/MetricsTable.vue';
import MetricsMethodology from './sections/pricing/MetricsMethodology.vue';
import PlanDetails from './sections/pricing/PlanDetails.vue';
import ComparePlans from './sections/compare/ComparePlans.vue';
import PublicBenchmarks from './sections/benchmarks/PublicBenchmarks.vue';
import ContributorBenchmarks from './sections/benchmarks/ContributorBenchmarks.vue';
import FollowUpdates from './sections/follow/FollowUpdates.vue';
import SiteDynamics from './sections/follow/SiteDynamics.vue';
import Contribution from './sections/contribution/Contribution.vue';
import SiteSources from './sections/site/SiteSources.vue';
import OptionalDataStatus from './components/OptionalDataStatus.vue';
</script>
<template>
<app-header></app-header>

<main id="top">

  <!-- ======== Hero ======== -->
  <site-hero></site-hero>

  <!-- ======== 01 帮我选 ======== -->
  <section class="section" id="quick" style="padding-top:36px">
    <div class="section-head">
      <h2><span class="sec-no">01</span>帮我选</h2>
      <p>按预算与工具筛选可购买套餐。</p>
    </div>
    <picker-controls></picker-controls>
    <ServiceActions />
    <picker-recommendations></picker-recommendations>

    <details class="section-menu" id="sectionMenu">
      <summary>更多比较：价格、免费入口、完整数据与进阶分析</summary>
      <nav class="topnav" aria-label="页面章节">
        <a href="#quick">帮我选</a>
        <a href="#s1">订阅价格</a>
        <a href="#free">免费入口</a>
        <a href="#table">数据表</a>
        <a href="#rank">性价比排行</a>
        <a href="#s3b">额度对比</a>
        <a href="#s3">每周 tokens</a>
        <a href="#s2">团队档</a>
        <a href="#s4">API 按量</a>
      </nav>
    </details>
  </section>

  <!-- ======== 02 个人订阅价格全景 ======== -->
  <section class="section" id="s1">
    <div class="section-head">
      <h2><span class="sec-no">02</span>个人订阅价格全景</h2>
      <p>已核实价格的个人月付档（免费档见「免费入口」；一次性预付、每 4 周收费和仅老用户续费在「数据表」保留原计价单位），按统一折算人民币从低到高排列。中转站用单独的颜色标出。悬停查看原币价格、额度口径与模型。</p>
    </div><personal-prices></personal-prices></section>

  <!-- ======== 03 免费 Coding 入口 ======== -->
  <section class="section" id="free">
    <div class="section-head">
      <h2><span class="sec-no">03</span>免费 Coding 入口</h2>
      <p>官方免费模型额度与编程工具免费档。卡片会区分免费推理和平台免费；需要自备 API Key（BYOK）或按量付费的工具，使用模型仍会产生费用。</p>
    </div><free-plans></free-plans></section>

  <!-- ======== 04 数据表 ======== -->
  <section class="section" id="table">
    <div class="section-head">
      <h2><span class="sec-no">04</span>公开标价记录</h2>
      <p>列出有公开标价的记录（含一次性预付、仅老用户续费及待核实历史价）。来源栏逐条标注价格核查状态、日期及依据。免费档在「免费 Coding 入口」；已下架、聊天免费档和不能当编程工具的免费档不放进这张表。支持搜索、筛选与按价格排序。计划名下点「＋对比」，选满 2 档后底部会出现并排对比，最多 4 档。</p>
    </div><plan-table></plan-table></section>

  <!-- ======== 05 每百万 tokens 成本排行（进阶） ======== -->
  <section class="section" id="rank">
    <div class="section-head">
      <h2 id="rankTitle"><span class="sec-no">05</span>每百万 tokens 满额使用折算成本（<span id="rankTitleBasis">{{ rankPaymentLabel() }}</span>）<span class="sec-tag">进阶</span></h2>
      <p>按参考额度全部用满折算每百万 tokens 成本；用量较少时实际成本更高。实心柱依据官方额度规则，斜纹柱为第三方或请求次数估算，不代表模型质量或保证可用额度。</p>
    </div><rank-chart></rank-chart></section>

  <!-- ======== 06 额度深度对比（进阶） ======== -->
  <section class="section" id="s3b">
    <div class="section-head">
      <h2><span class="sec-no">06</span>额度深度对比<span class="sec-tag">进阶</span></h2>
      <p>默认只看月费、主要模型、每月大约能用多少、每百万 tokens 成本和置信度。5 小时窗口、每周明细和推算方法可以展开。DeepSeek、GLM、Kimi、MiniMax、Qwen 的官方 API 按量价也在表里，按同一套假设折成每百万成本，点「每M tokens」会和套餐一起按价格排。</p>
    </div><metrics-table></metrics-table><metrics-methodology></metrics-methodology></section>

  <!-- ======== 07 每周可用 tokens 对比（进阶） ======== -->
  <section class="section" id="s3">
    <div class="section-head">
      <h2><span class="sec-no">07</span>每周可用 tokens 对比（官方额度折算 + 社区推算）<span class="sec-tag">进阶</span></h2>
      <p>跨厂商比较「一周能用多少 token」：<strong class="text-green">绿色柱</strong>为官方每周额度上限按官方积分系数、统一的 80/20 与 95% 缓存假设折成 tokens（上限含非高峰 5 折）；<strong class="text-gold">黄色柱</strong>为其他折算或社区推算。厂商按自身用量假设给出的估算只在提示中对照，不参与比较。方法与置信度见「额度深度对比」。不同模型的 token 数不能代表产出质量，点按柱形查看月费与依据。</p>
    </div><weekly-tokens></weekly-tokens></section>

  <!-- ======== 08 团队 / 企业 / 云厂商 ======== -->
  <section class="section" id="s2">
    <div class="section-head">
      <h2><span class="sec-no">08</span>团队 / 企业档（席位 / 整包价格）</h2>
      <p>按席位计费的团队与企业档（Claude Team、Copilot Business、Cursor Teams 等），以及云厂商企业级服务（AWS Q、Gemini Code Assist、阿里云灵码企业版、智谱 BigModel 团队版、百炼 Token Plan 团队版等）。标注「整包」的为按团队/账户整体计费（如 Roo Roomote 按团队规模、Augment Business 按账户），悬停可查看各自计价口径。云厂商面向个人的 API 套餐（腾讯云/百炼/方舟 Coding Plan 等）已归入上方「个人订阅价格全景」。</p>
    </div><team-prices></team-prices></section>

  <!-- ======== 09 API 按量计费 ======== -->
  <section class="section" id="s4">
    <div class="section-head">
      <h2><span class="sec-no">09</span>API 按量计费：token 的单价</h2>
      <p>订阅之外另一条路线：直接按 token 付费。左图为各厂商主流编程模型每百万 tokens 的输入/输出单价（统一折算美元，悬停可看原币，国内模型会标明）；右图为同等 $10 预算按<strong>输出价</strong>能买到的 token 量（青色为国际模型、绿色为国内模型）。</p>
    </div><api-prices></api-prices></section>

  <!-- ======== 10 重要动态 ======== -->
  <section class="section" id="dynamics">
    <div class="section-head">
      <h2><span class="sec-no">10</span>重要动态</h2>
      <p>这里只放来源写明了发生日、而且会影响购买的变化。只有核对日、没有公告日的记录收在下面，不当成厂商公告。</p>
    </div>
    <site-dynamics></site-dynamics>

  </section>

  <section class="section" id="benchmarks" hidden>
    <div class="section-head"><h2><span class="sec-no">11</span>模型公开评测</h2><p>查看公开来源的模型分数、评测配置与范围。每个版本和协议独立展示，不合成跨榜总分。</p></div>
    <OptionalDataStatus id="benchmarkDataStatus" kind="benchmark" />
    <div class="maintenance-panel public-benchmark-panel">
      <!-- 由 src/sections/benchmarks/PublicBenchmarks.vue 渲染：筛选、协议说明、图表、成绩表与导出。 -->
      <div id="publicBenchmarkApp" data-v-app=""><public-benchmarks></public-benchmarks></div>
      <p class="maintenance-meta">分数显示到 1 位小数，成本显示到 2 位；导出保留原始精度。区间沿用来源，接近的分数不代表可靠领先；未公布的区间不补算。套餐链接只匹配模型列表明确列出该版本的在售档位，不保证订阅能使用评测的推理与 Agent 配置。原始模型 ID 与完整区间在「配置与评测说明」中。</p>
    </div>
    <details class="method-box public-benchmark-guide"><summary>这些榜单适合回答什么问题？</summary><p>DeepSWE 与 CursorBench 聚焦代码任务，但各自的任务集、Agent、评分与版本不同，应在同一协议内比较。OSWorld 是图形界面操作任务，关注桌面与应用交互；HLE 是综合学术题目，关注知识与推理。GUI 或学术分数不能直接当成编程任务表现。</p><p>请同时查看版本、样本范围、是否使用工具及推理配置。分数说明来源中的评测条件，不保证你的具体任务、工具或套餐能获得同样结果。</p></details>
    <details class="method-box" id="contributorBenchmarkTools"><summary>贡献者工具：任务验收与记录提交（可选）</summary>
    <p class="maintenance-meta">下面的本地任务框架用于检查提交解答；公开模型榜单来自上方所列来源，二者分别记录。</p>
    <!-- 由 src/sections/benchmarks/ContributorBenchmarks.vue 渲染：筛选、贡献者记录、任务与测评方法。 -->
    <div id="contributorBenchmarksApp" data-v-app=""><contributor-benchmarks></contributor-benchmarks></div>
    </details>
  </section>

  <section class="section" id="updates" hidden>
    <div class="section-head"><h2><span class="sec-no">12</span>我的关注与套餐变更</h2><p>查看关注套餐的已确认变更，核对价格来源与复查安排。<a href="changes.xml">订阅全部变更 RSS ↗</a>；关注套餐后可单独订阅对应厂商。</p></div>
    <OptionalDataStatus id="maintenanceDataStatus" kind="maintenance" />
    <!-- 由 src/sections/follow/FollowUpdates.vue 渲染：关注与已读、套餐历史、到期复查、核查概况与下载、逐条维护状态。 -->
    <div id="updatesApp" data-v-app=""><follow-updates></follow-updates></div>
    <p class="maintenance-meta">核查快照与已确认变更由维护脚本整理。变价候选、资讯与到期提示需复核；没有证据时不自动更新官方价格。</p>
  </section>

  <section class="section" id="contribute" hidden>
    <div class="section-head"><h2><span class="sec-no">13</span>帮助补全与纠错</h2><p>提交新厂商、官方变更证据或可复现测评，帮助其他人做选择。</p></div>
    <!-- 由 src/sections/contribution/Contribution.vue 渲染：贡献类型、证据模板、复制下载与 Issues 链接。 -->
    <div class="maintenance-panel" id="contributionApp" data-v-app=""><contribution></contribution></div>
  </section>

  <!-- ======== 14 数据来源与说明 ======== -->
  <section class="section" id="sources" hidden>
    <div class="section-head"><h2><span class="sec-no">14</span>数据来源与说明</h2></div><site-sources></site-sources></section>

</main>

<button type="button" id="toTop" class="to-top" aria-label="回到顶部"><i class="ric" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-6 6m6-6 6 6"></path></svg></i></button>

<compare-plans></compare-plans>

<plan-details></plan-details>

<app-footer></app-footer>

</template>
