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
  await expect(page.getByRole("heading", { name: "Build Mode" })).toBeVisible();
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

test("assigns unique random colors to room members", async ({ request }) => {
  const roomCode = `COLOR${Date.now().toString(36).slice(-5)}`.toUpperCase();

  for (let index = 0; index < 8; index += 1) {
    const response = await request.post(`/api/rooms/${roomCode}`, {
      data: {
        id: `guest-${index}`,
        nickname: `Guest ${index}`,
        color: "#ffffff"
      }
    });

    expect(response.ok()).toBeTruthy();
    const room = await response.json();
    const colors = room.members.map((member: { color: string }) => member.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  }
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

test("uses build mode drawing with keyboard undo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Draw" }).click();
  await page.getByLabel("Use #2563eb").click();

  const board = page.locator(".board");
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 92, box.y + 78);
  await page.mouse.up();

  await expect(page.locator(".drawing-layer polyline")).toHaveCount(1);
  await expect(page.locator(".drawing-layer polyline").first()).toHaveAttribute("stroke", "#2563eb");

  await page.keyboard.press("Control+Z");
  await expect(page.locator(".drawing-layer polyline")).toHaveCount(0);
});

test("adds snapped visual walls in build mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Walls" }).click();

  const board = page.locator(".board");
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await page.mouse.move(box.x + 63, box.y + 63);
  await page.mouse.down();
  await page.mouse.move(box.x + 153, box.y + 108);
  await page.mouse.up();

  const wall = page.locator(".drawing-layer polyline").first();
  await expect(wall).toHaveAttribute("stroke-width", "8");

  const points = (await wall.getAttribute("points")) ?? "";
  const coordinates = points.split(" ").flatMap((point) => point.split(",").map(Number));
  expect(coordinates.length).toBe(4);
  for (const coordinate of coordinates) {
    expect(coordinate % 44).toBe(0);
  }
});

test("selects edits drags and deletes a wall object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Walls" }).click();

  const board = page.locator(".board");
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await page.mouse.move(box.x + 63, box.y + 63);
  await page.mouse.down();
  await page.mouse.move(box.x + 153, box.y + 108);
  await page.mouse.up();

  const wall = page.locator(".wall-object").first();
  await wall.click();
  await expect(page.getByRole("heading", { name: "Selected Object" })).toBeVisible();

  const objectPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Selected Object" }) });
  await objectPanel.getByLabel("Wall color").fill("#227447");
  await expect(wall).toHaveAttribute("stroke", "#227447");

  const before = (await wall.getAttribute("points")) ?? "";
  const wallBox = await wall.boundingBox();
  if (!wallBox) throw new Error("Wall did not render.");
  await page.mouse.move(wallBox.x + wallBox.width / 2, wallBox.y + wallBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(wallBox.x + wallBox.width / 2 + 44, wallBox.y + wallBox.height / 2);
  await page.mouse.up();
  await expect(wall).not.toHaveAttribute("points", before);

  await objectPanel.getByRole("button", { name: "Delete wall" }).click();
  await expect(page.locator(".wall-object")).toHaveCount(0);
});

test("sets battlefield backgrounds from upload and URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Background" }).click();

  const buildPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build Mode" }) });
  await buildPanel.getByLabel("Upload battlefield").setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await expect(page.locator(".map-background-image")).toHaveCount(1);

  const dataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='green'/%3E%3C/svg%3E";
  await buildPanel.getByLabel("Battlefield image URL").fill(dataUrl);
  await buildPanel.getByRole("button", { name: "Use image URL" }).click();
  await expect(page.locator(".map-background-image")).toHaveAttribute("src", dataUrl);
});

test("adds and undoes a colored circle effect", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Effects" }).click();
  await page.getByLabel("Use #7c3aed").click();

  const buildPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build Mode" }) });
  await buildPanel.getByLabel("Label").fill("Fireball");
  await buildPanel.getByLabel("Size in feet").fill("30");

  const board = page.locator(".board");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await page.mouse.move(box.x + 180, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 180);
  await page.mouse.up();

  const effect = page.locator(".effect-template").first();
  await expect(effect.locator("circle")).toHaveAttribute("stroke", "#7c3aed");
  await expect(effect.locator("text")).toContainText("Fireball");

  await page.keyboard.press("Control+Z");
  await expect(page.locator(".effect-template")).toHaveCount(0);
});

test("selects edits drags and deletes an effect object", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Effects" }).click();

  const buildPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build Mode" }) });
  await buildPanel.getByLabel("Label").fill("Fireball");

  const board = page.locator(".board");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await page.mouse.move(box.x + 180, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 180);
  await page.mouse.up();

  const effect = page.locator(".effect-template").first();
  await effect.click();
  await expect(page.getByRole("heading", { name: "Selected Object" })).toBeVisible();

  const objectPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Selected Object" }) });
  await objectPanel.getByLabel("Label").fill("Storm");
  await objectPanel.getByLabel("Color").fill("#227447");
  await objectPanel.getByLabel("Size in feet").fill("40");
  await expect(effect.locator("text")).toContainText("Storm");
  await expect(effect.locator("circle")).toHaveAttribute("stroke", "#227447");

  const beforeCx = await effect.locator("circle").getAttribute("cx");
  const effectBox = await effect.boundingBox();
  if (!effectBox) throw new Error("Effect did not render.");
  await page.mouse.move(effectBox.x + effectBox.width / 2, effectBox.y + effectBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(effectBox.x + effectBox.width / 2 + 44, effectBox.y + effectBox.height / 2);
  await page.mouse.up();
  await expect(effect.locator("circle")).not.toHaveAttribute("cx", beforeCx ?? "");

  await objectPanel.getByRole("button", { name: "Delete effect" }).click();
  await expect(page.locator(".effect-template")).toHaveCount(0);
});

test("adds cone cube and line effects", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new room" }).click();

  await page.getByRole("button", { name: "Enter Build" }).click();
  await page.getByRole("button", { name: "Effects" }).click();

  const buildPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build Mode" }) });
  const board = page.locator(".board");
  await board.scrollIntoViewIfNeeded();
  const box = await board.boundingBox();
  if (!box) throw new Error("Board did not render.");

  await buildPanel.getByLabel("Effect shape").selectOption("cone");
  await page.mouse.move(box.x + 88, box.y + 88);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 88);
  await page.mouse.up();
  await expect(page.locator(".effect-template path")).toHaveCount(1);

  await buildPanel.getByLabel("Effect shape").selectOption("cube");
  await page.mouse.move(box.x + 88, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 176, box.y + 388);
  await page.mouse.up();
  await expect(page.locator(".effect-template rect")).toHaveCount(1);

  await buildPanel.getByLabel("Effect shape").selectOption("line");
  await buildPanel.getByLabel("Line width in feet").fill("10");
  await page.mouse.move(box.x + 360, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 580, box.y + 300);
  await page.mouse.up();
  await expect(page.locator(".effect-template polygon")).toHaveCount(1);
});

test("relative room links preserve preview proxy prefixes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.history.replaceState({}, "", "/proxy/3000/"));

  const resolved = await page.evaluate(() => new URL("room/PROXY1", window.location.href).pathname);
  expect(resolved).toBe("/proxy/3000/room/PROXY1");
});
