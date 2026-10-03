const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./scripts",
  testMatch: "**/*.browser.spec.js",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:18461",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/serve.js",
    url: "http://127.0.0.1:18461",
    env: { PORT: "18461" },
    reuseExistingServer: false,
  },
});
