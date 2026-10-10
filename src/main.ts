/* Restore shared state before mounting the Vue application, then start navigation and lazy loading. */
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import { applyUrlState, loadFollowState, refreshPalette } from '@domain/runtime';
import { startApplication } from '@domain/startup';
import './legacy-globals';

applyUrlState();
loadFollowState();
refreshPalette();
createApp(App).mount('#app');
await nextTick();
startApplication();
