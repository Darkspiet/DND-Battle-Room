import { expect, test } from "@playwright/test";
import path from "node:path";

test("creates a room and shows the tabletop", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create new room" })).toBeVisible();

  await page.getByRole("button", { name: "Create new room" }).click();

  await expect(page).toHaveURL(/\/room\/[A-Z0-9]+$/);
  await expect(page.getByRole("heading", { name: /^Room [A-Z0-9]+$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
  await expect(page.locator(".board")).toBeVisible();
});

test("adds a token and rolls dice", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.locator(".token")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Selected Token" })).toBeVisible();

  const token = page.locator(".token").first();
  const before = await token.boundingBox();
  if (!before) throw new Error("Token did not render.");
  await token.dragTo(page.locator(".board"), {
    targetPosition: { x: 130, y: 130 }
  });
  const after = await token.boundingBox();
  if (!after) throw new Error("Token disappeared after dragging.");
  expect(after.x).not.toBe(before.x);

  await page.getByRole("button", { name: "d20" }).click();
  await expect(page.locator(".roll-log article")).toHaveCount(1);
  await expect(page.locator(".roll-log article").first()).toContainText("d20");
});

test("joins an existing room by code", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Room code").fill("JOIN01");
  await page.getByRole("button", { name: "Join room" }).click();

  await expect(page).toHaveURL(/\/room\/JOIN01$/);
  await expect(page.getByRole("heading", { name: "Room JOIN01" })).toBeVisible();
});

test("uploads and removes a custom token picture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByLabel("Token picture").first().setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await expect(page.locator(".token-preview img")).toBeVisible();

  await page.getByRole("button", { name: "Add token" }).click();
  await expect(page.locator(".token .token-image")).toHaveCount(1);
  await expect(page.locator(".token-list-image")).toHaveCount(1);

  const selectedTokenPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Selected Token" }) });
  await selectedTokenPanel.getByRole("button", { name: "Remove picture" }).click();
  await expect(page.locator(".token .token-image")).toHaveCount(0);
  await expect(page.locator(".token span")).toContainText("⚔");
});

test("relative room links preserve preview proxy prefixes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.history.replaceState({}, "", "/proxy/3000/"));

  const resolved = await page.evaluate(() => new URL("room/PROXY1", window.location.href).pathname);
  expect(resolved).toBe("/proxy/3000/room/PROXY1");
});
