import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import path from "node:path";

test.beforeAll(() => {
  mkdirSync("test-results/screenshots", { recursive: true });
});

test("captures reviewed desktop and mobile screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Session Lobby" })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/lobby-desktop.png", fullPage: true });

  await page.getByRole("button", { name: "Create new room" }).click();
  await expect(page.getByRole("heading", { name: /^Room [A-Z0-9]+$/ })).toBeVisible();
  await page.getByLabel("Token picture").first().setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.locator(".token .token-image")).toHaveCount(1);
  await page.screenshot({ path: "test-results/screenshots/tabletop-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Session Lobby" })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/lobby-mobile.png", fullPage: true });
});
