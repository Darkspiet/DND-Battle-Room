import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  globalSetup: "./tests/e2e/globalSetup.ts",
  timeout: 60_000,
  expect: {
    timeout: 8_000
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND ?? "node --import tsx server.ts",
    env: { HOSTNAME: "127.0.0.1", PORT: "3100", APP_URL: baseURL },
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
