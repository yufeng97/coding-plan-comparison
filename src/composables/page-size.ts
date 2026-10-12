/* 长表每批显示的条数：桌面 20、窄屏 5，随窗口宽度变化。数据表与额度表共用。
 * 预渲染（没有 window）按桌面条数输出。 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { responsivePageSize } from "@browser/interaction";

export function useResponsivePageSize() {
  const pageSize = ref(typeof window === "undefined" ? 20 : responsivePageSize());
  const resize = () => { pageSize.value = responsivePageSize(); };
  onMounted(() => window.addEventListener("resize", resize, { passive: true }));
  onBeforeUnmount(() => window.removeEventListener("resize", resize));
  return pageSize;
}
