import { renderCostCalculator } from './service';

/* 恢复 URL 状态后，让费用计算器按恢复的条件重算（其余控件由 Vue 直接绑定共享状态）。 */
export function syncControlsFromState() {
    renderCostCalculator();
}
