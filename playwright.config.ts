import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const testURL = new URL(baseURL);
if (testURL.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(testURL.hostname) || !testURL.port || testURL.port === "3000") {
  throw new Error("Playwright requires a local temporary HTTP port, normally 3100; never use production port 3000.");
}

if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test')) {
  throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name contains test. Production databases are never used for tests.');
}
export default defineConfig({
  workers: 1,
  testDir: "./tests/e2e",
  timeout: 30_000,
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
    command: "node server.mjs",
    env: {
      HOSTNAME: "127.0.0.1", PORT: testURL.port, NODE_ENV: "development",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      DND_CONFIG_FILE: "", APP_URL: baseURL
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
