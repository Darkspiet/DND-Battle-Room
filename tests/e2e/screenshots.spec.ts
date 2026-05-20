import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import path from "node:path";

test.beforeAll(() => {
  mkdirSync("test-results/screenshots", { recursive: true });
});

test("captures reviewed desktop and mobile screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose your table role." })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/start-desktop.png", fullPage: true });

  await page.goto("/dm/dashboard");
  await page.getByRole("button", { name: "Create saved room" }).click();
  await expect(page.getByRole("heading", { name: /^Room [A-Z0-9]+$/ })).toBeVisible();
  await page.getByLabel("Token picture").first().setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.locator(".token .token-image")).toHaveCount(1);
  await page.screenshot({ path: "test-results/screenshots/tabletop-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose your table role." })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/start-mobile.png", fullPage: true });
});
