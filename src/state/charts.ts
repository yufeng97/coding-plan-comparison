import { reactive } from 'vue';
/* Vue components own chart controls and service dialogs; ECharts owns only the canvas. */
export const chartLegendSelections = reactive<Record<string, Record<string, boolean>>>({});

/* ---------- 免费入口 ---------- */
/* 免费入口按地区和类型筛选（本页内状态，不写入分享链接）；手机上 20 张卡不必整页滚完。 */
export const freeState = reactive({ region: "all", kind: "all" });
