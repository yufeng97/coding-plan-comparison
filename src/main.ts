/* Restore shared state before mounting the Vue application, then start navigation and lazy loading. */
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import { refreshPalette } from '@browser/charts/host';
import { capturePrerenderState, restorePrerenderInputs, restorePrerenderState } from '@browser/prerender-handoff';
import { applyUrlState } from '@browser/url-state';
import { loadFollowState } from '@app/maintenance';
import { startApplication } from '@app/startup';

applyUrlState();
loadFollowState();
refreshPalette();
/* 挂载会重建预渲染内容：先记下用户在脚本到达前展开的折叠、聚焦位置与改过的输入，挂载后找回。 */
const handoff = capturePrerenderState(document.getElementById('app'));
createApp(App).mount('#app');
await nextTick();
restorePrerenderState(handoff);
startApplication();
/* 输入经组件自己的事件处理写回状态，放在共享服务启动之后。 */
restorePrerenderInputs(handoff);
