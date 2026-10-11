import { onBeforeUnmount } from "vue";
import { releaseChart } from "@browser/charts/host";

/** Vue owns the host lifetime; ECharts owns its contents until the host unmounts. */
export function useChartLifecycle(...ids: string[]) {
  onBeforeUnmount(() => ids.forEach(releaseChart));
}
