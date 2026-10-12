<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { serviceUiState } from '@state/app';
import { canNativeShare } from '@browser/interaction';
import { pickerScopeText } from '@app/picker';
import { clearPreset, copyPickerSummary, restorePreset, savePreset, shareCurrentResults, syncPresetButtons } from '@app/service-actions';
/* 触屏设备用系统分享面板，按钮随之改为「分享当前方案」；预渲染与桌面保持复制链接。
 * 分享两项在前；「常用条件」的保存、恢复、删除归为一组，按钮文字短，完整含义在 aria-label 里。 */
const nativeShare = ref(false);
onMounted(() => { syncPresetButtons(); nativeShare.value = canNativeShare(); });
function share() { void shareCurrentResults("Coding Plan 选购条件：" + pickerScopeText()); }
</script>
<template>
  <div class="service-actions" role="group" aria-label="分享和保存筛选条件">
    <button type="button" class="chip" id="shareResultsBtn" @click="share">{{ nativeShare ? "分享当前方案" : "复制当前方案链接" }}</button>
    <button type="button" class="chip" id="copySummaryBtn" @click="copyPickerSummary">复制推荐摘要</button>
    <span class="preset-actions" role="group" aria-labelledby="presetActionsLabel">
      <span id="presetActionsLabel" class="preset-actions-label">常用条件</span>
      <button type="button" class="chip" id="savePresetBtn" aria-label="保存常用条件" @click="savePreset">保存</button>
      <button type="button" class="chip" id="loadPresetBtn" aria-label="恢复常用条件" :disabled="!serviceUiState.presetSaved" @click="restorePreset">恢复</button>
      <button type="button" class="chip" id="clearPresetBtn" aria-label="删除已保存条件" :disabled="!serviceUiState.presetSaved" @click="clearPreset">删除</button>
    </span>
  </div>
  <p id="serviceFeedback" class="table-feedback" role="status" aria-live="polite">{{ serviceUiState.feedback }}</p>
</template>
