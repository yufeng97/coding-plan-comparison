<script setup lang="ts">
/* 我的关注与套餐变更：关注与已读、关注同步、套餐历史、到期复查、核查概况与下载、逐条维护状态。
 * 状态在 state/maintenance、关注操作在 application/maintenance（推荐卡、数据表和完整权益窗口读写同一份 followState）。 */
import { computed, nextTick, ref, watch } from "vue";
import { PLANS } from "@generated/catalog";
import { planTitle } from "@domain/core";
import { followState, followView, maintenanceView } from "@state/maintenance";
import { focusTableControl } from "@browser/interaction";
import { maintenanceData } from "@browser/maintenance-data";
import { optionalDataLoaded } from "@browser/optional-data";
import { applyFollowImport, copyFollowLink, downloadPublicData, dueReviews, followedPlans, followFeeds, followImportPlans, maintenancePlanStatus, maintenanceRecords, maintenanceStatusLabel, markFollowedChangesRead, optionalPendingText, unreadFollowedChanges } from "@app/maintenance";
import { showPlanDetails } from "@app/plan-details";
import ChangeCard from "./ChangeCard.vue";
import PlanHistory from "./PlanHistory.vue";
import SourceLinks from "../../components/SourceLinks.vue";
import WatchButton from "../../components/WatchButton.vue";
import { targetValue } from "@browser/dom";
import { fromData } from "../../composables/optional-data";

const follow = followState;
const view = followView;
const maintenance = maintenanceView;
const RECORD_FILTERS = [["all", "全部记录"], ["unverified", "待核实"], ["stale", "超过复查间隔"]] as const;

const loaded = fromData("maintenance", () => optionalDataLoaded("maintenance"));
const snapshot = fromData("maintenance", () => maintenanceData());
const plans = computed(() => followedPlans());
const feeds = fromData("maintenance", () => followFeeds(plans.value));
const unread = fromData("maintenance", () => unreadFollowedChanges());
const importInfo = computed(() => followImportPlans());
const importNames = computed(() => importInfo.value.fresh.slice(0, 5).map(planTitle).join("、") + (importInfo.value.fresh.length > 5 ? " 等" : ""));
const unreadCountText = computed(() => `${plans.value.length} 档关注` + (loaded.value ? ` · ${unread.value.length} 条未读变更` : ""));
const storageNote = computed(() => view.storageMessage || "只在当前浏览器保存关注与已读记录；不上传，不跨设备同步，清理浏览器数据后会消失。");
const selectedPlan = computed(() => PLANS.find((p) => p.id === maintenance.planId) || null);
const planStatus = fromData("maintenance", () => selectedPlan.value ? maintenancePlanStatus(selectedPlan.value) : "");
const reviews = fromData("maintenance", () => dueReviews());
const records = fromData("maintenance", () => maintenanceRecords(maintenance.recordFilter));

const planSelect = ref<HTMLSelectElement | null>(null);
const copyLinkButton = ref<HTMLButtonElement | null>(null);
function markRead() {
  markFollowedChangesRead();
  focusTableControl(planSelect.value);
}
function showDetails(id: string, event: Event) {
  showPlanDetails(id, event.currentTarget as HTMLElement | null);
}
async function applyImport(merge: boolean) {
  applyFollowImport(merge);
  await nextTick();
  focusTableControl(merge ? copyLinkButton.value : planSelect.value);
}
/* 在关注列表里取消关注时，按钮随该档一起消失；焦点落回页面顶部前，移到同一面板的套餐选择框。 */
let lastWatchButton: Element | null = null;
function rememberFocus(event: FocusEvent) {
  lastWatchButton = (event.target as Element | null)?.closest("[data-watch-plan]") ?? null;
}
watch(() => follow.planIds.length, async () => {
  await nextTick();
  const active = document.activeElement;
  if (lastWatchButton && !lastWatchButton.isConnected && (!active || active === document.body)) focusTableControl(planSelect.value);
});
</script>

<template>
  <div class="maintenance-grid" @focusin="rememberFocus">
    <div class="maintenance-panel">
      <h2>我关注的套餐</h2>
      <p id="followStorageNote">{{ storageNote }}</p>
      <div id="followImport" class="follow-import" :hidden="!importInfo.fresh.length">
        <template v-if="importInfo.fresh.length">
          <p>这个链接带来 {{ importInfo.plans.length }} 档关注套餐，其中 {{ importInfo.fresh.length }} 档尚未在本机关注：{{ importNames }}。</p>
          <div class="maintenance-toolbar">
            <button type="button" class="chip" data-follow-import="merge" @click="applyImport(true)">合并到本机关注</button>
            <button type="button" class="chip" data-follow-import="dismiss" @click="applyImport(false)">忽略</button>
          </div>
        </template>
      </div>
      <div class="maintenance-toolbar">
        <strong id="followUnreadCount">{{ unreadCountText }}</strong>
        <button id="markFollowReadBtn" type="button" class="chip" :disabled="!unread.length" @click="markRead">将当前变更标为已读</button>
        <button id="copyFollowLinkBtn" ref="copyLinkButton" type="button" class="chip" :disabled="!plans.length" @click="copyFollowLink()">复制关注同步链接</button>
      </div>
      <p id="followFeedback" class="table-feedback" role="status" aria-live="polite">{{ view.feedback }}</p>
      <div id="followedPlans">
        <template v-if="plans.length">
          <div v-for="plan in plans" :key="plan.id" class="followed-plan">
            <button type="button" class="chip" :data-view-plan="plan.id" @click.stop="showDetails(plan.id, $event)">{{ planTitle(plan) }}</button>
            <WatchButton :plan="plan" />
          </div>
          <p v-if="feeds.length" class="follow-feeds">按厂商订阅变更 RSS：<template v-for="(feed, index) in feeds" :key="feed.path"><template v-if="index"> · </template><a :href="feed.path" target="_blank" rel="noopener">{{ feed.label }} ↗</a></template></p>
        </template>
        <p v-else>还没有关注的套餐。<a href="#quick">选择套餐并关注</a></p>
      </div>
      <div id="followedChanges">
        <ul v-if="unread.length" class="change-list">
          <ChangeCard v-for="change in unread" :key="change.changeId" :change="change" unread />
        </ul>
        <p v-else>{{ !plans.length ? "关注后会展示本站收录的已确认变更。" : loaded ? "当前关注套餐没有未读的已确认变更。" : optionalPendingText("关注套餐的已确认变更") }}</p>
      </div>
    </div>
    <div class="maintenance-panel">
      <h2>查看套餐历史</h2>
      <label class="maintenance-select" for="maintenancePlan">选择套餐<select id="maintenancePlan" ref="planSelect" :value="maintenance.planId" @change="maintenance.planId = targetValue($event)">
        <option value="">选择套餐</option>
        <option v-for="plan in PLANS" :key="plan.id" :value="plan.id">{{ planTitle(plan) }}</option>
      </select></label>
      <div id="maintenanceHistory">
        <template v-if="selectedPlan">
          <div class="maintenance-plan-actions">
            <WatchButton :plan="selectedPlan" />
            <button type="button" class="chip" :data-view-plan="selectedPlan.id" @click.stop="showDetails(selectedPlan.id, $event)">完整权益</button>
          </div>
          <p class="maintenance-plan-status">{{ planStatus }}</p>
          <PlanHistory :key="selectedPlan.id" :plan-id="selectedPlan.id" />
        </template>
        <p v-else>选择套餐，查看当前核查状态与已确认变更。</p>
      </div>
      <details class="method-box"><summary>到期复查提示</summary>
        <div id="maintenanceReviews">
          <ul v-if="reviews.length" class="review-list">
            <li v-for="review in reviews" :key="review.id"><strong>{{ review.title }}</strong> · 复查日 {{ review.reviewOn }}{{ review.overdue ? "（已到期）" : "（今天到期）" }}
              <p>{{ review.note || "到期需人工复查，不能据此认定价格或权益已变化。" }}</p>
              <SourceLinks :urls="[review.source]" />
            </li>
          </ul>
          <p v-else>{{ loaded ? "当前没有已到期的复查安排。复查提示按本机日期计算，不代表已重新核验。" : optionalPendingText("到期复查提示") }}</p>
        </div>
      </details>
    </div>
  </div>
  <details id="maintenanceSnapshot" class="method-box">
    <summary>数据核查概况与下载</summary>
    <div id="maintenanceSummary" class="maintenance-panel">
      <template v-if="snapshot.generatedAt">
        <p>维护快照 {{ snapshot.generatedAt }} · 核查覆盖至 {{ snapshot.checkedThrough || "未记录" }}。快照按 {{ snapshot.staleAfterDays || 14 }} 天复查间隔标记超期。</p>
        <dl class="trust-counts">
          <div><dt>覆盖记录</dt><dd>{{ snapshot.summary.total }}</dd></div>
          <div><dt>已核实</dt><dd>{{ snapshot.summary.verified }}</dd></div>
          <div><dt>待核实</dt><dd>{{ snapshot.summary.unverified }}</dd></div>
          <div><dt>需复查</dt><dd>{{ snapshot.summary.stale }}</dd></div>
        </dl>
      </template>
      <p v-else>{{ loaded ? "维护快照暂未生成，请在完整数据表核对逐条来源。" : optionalPendingText("维护快照与核查统计") }}</p>
    </div>
    <div class="maintenance-toolbar">
      <button id="downloadPublicDataBtn" type="button" class="chip" @click="downloadPublicData()">下载公开数据 JSON</button>
      <span class="maintenance-meta">价格、核查、已确认历史与评测记录</span>
    </div>
    <p id="publicDataFeedback" class="table-feedback" role="status" aria-live="polite">{{ maintenance.publicDataFeedback }}</p>
  </details>
  <details class="method-box"><summary>逐条维护状态与来源</summary>
    <label class="maintenance-select" for="maintenanceRecordFilter">记录范围<select id="maintenanceRecordFilter" :value="maintenance.recordFilter" @change="maintenance.recordFilter = targetValue($event)">
      <option v-for="[value, label] in RECORD_FILTERS" :key="value" :value="value">{{ label }}</option>
    </select></label>
    <div id="maintenanceRecords">
      <ul v-if="records.length" class="maintenance-records">
        <li v-for="record in records" :key="record.id"><strong>{{ record.vendor }} · {{ record.name }}</strong><span>{{ maintenanceStatusLabel(record.status) }}{{ record.stale ? " · 超期" : "" }} · {{ record.checkedAt || "未核查" }}</span><SourceLinks :urls="record.sourceUrls" /></li>
      </ul>
      <p v-else>{{ loaded ? "当前条件没有记录。" : optionalPendingText("逐条维护状态") }}</p>
    </div>
  </details>
</template>
