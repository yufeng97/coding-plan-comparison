const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.browser.spec.js",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  projects: ["chromium", "firefox", "webkit"].map((browserName) => ({
    name: browserName,
    use: { browserName: /** @type {"chromium"|"firefox"|"webkit"} */ (browserName) },
  })),
  use: {
    baseURL: "http://127.0.0.1:18461",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    // 全页每步追踪会放大 WebKit 的操作开销；CI 首次失败重试时再采集。
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  /* 测发布产物：先完整构建（Vite + 预渲染）到 .site-build/，再用本地静态服务器提供。 */
  webServer: {
    command: "node scripts/build/stage-site.js && node scripts/server/serve.js .site-build",
    url: "http://127.0.0.1:18461",
    env: { PORT: "18461" },
    reuseExistingServer: false,
  },
});
