<script setup lang="ts">
import { onMounted } from 'vue';
import { serviceUiState, shareCurrentResults, copyPickerSummary, savePreset, restorePreset, clearPreset, syncPresetButtons } from '@app/runtime';
onMounted(syncPresetButtons);
</script>
<template>
  <div class="service-actions" role="group" aria-label="分享和保存筛选条件">
    <button type="button" class="chip" id="shareResultsBtn" @click="shareCurrentResults">复制当前方案链接</button>
    <button type="button" class="chip" id="copySummaryBtn" @click="copyPickerSummary">复制推荐摘要</button>
    <button type="button" class="chip" id="savePresetBtn" @click="savePreset">保存常用条件</button>
    <button type="button" class="chip" id="loadPresetBtn" :disabled="!serviceUiState.presetSaved" @click="restorePreset">恢复常用条件</button>
    <button type="button" class="chip" id="clearPresetBtn" :disabled="!serviceUiState.presetSaved" @click="clearPreset">删除已保存条件</button>
  </div>
  <p id="serviceFeedback" class="table-feedback" role="status" aria-live="polite">{{ serviceUiState.feedback }}</p>
</template>
