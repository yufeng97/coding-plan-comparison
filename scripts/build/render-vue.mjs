/* Vue SSR in an isolated process. Browser APIs are a boundary only: no application
 * startup, chart downloads or user storage execute while generating static HTML. */
import fs from 'node:fs';
import { Window } from 'happy-dom';
const window = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'location', 'localStorage', 'navigator', 'history', 'HTMLElement', 'HTMLDialogElement', 'Element', 'Node']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.matchMedia = window.matchMedia.bind(window);
const { createServer } = await import('vite');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { default: App } = await server.ssrLoadModule('/src/App.vue');
  const runtime = await server.ssrLoadModule('/src/application/runtime.ts');
  runtime.refreshPalette();
  const { createSSRApp } = await import('vue');
  const { renderToString } = await import('@vue/server-renderer');
  const context = {};
  const rendered = await renderToString(createSSRApp(App), context);
  fs.writeFileSync(process.argv[2], JSON.stringify({ rendered, teleports: context.teleports?.body || '' }));
} finally {
  await server.close();
  await window.happyDOM.close();
}
