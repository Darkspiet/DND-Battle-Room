import { signInAsDm } from './auth';
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";


async function createRoom(page: Page) {
  await signInAsDm(page);
  await page.goto("/dm/dashboard");
  await page.getByRole("button", { name: "Create room" }).click();
}

async function openDmTool(page: Page, name: "Combat" | "Build" | "Library" | "Table") {
  await page.getByRole("button", { name: new RegExp(`^${name}`, "i") }).click();
}

test("creates a room and shows the tabletop", async ({ page }) => {
  await createRoom(page);

  await expect(page).toHaveURL(/\/room\/[A-Z0-9]+$/);
  await expect(page.getByRole("heading", { name: /^Room [A-Z0-9]+$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "DM room modes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Combat/i })).toBeVisible();
  await expect(page.locator(".board")).toBeVisible();
});

test("adds a token and rolls dice", async ({ page }) => {
  await createRoom(page);

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

test("runs assisted initiative combat order", async ({ page }) => {
  await createRoom(page);

  await page.getByRole("button", { name: "Add token" }).click();
  await page.getByLabel("Token name").fill("Goblin");
  await page.getByRole("button", { name: "Add token" }).click();

  await openDmTool(page, "Combat");
  await page.getByRole("button", { name: "Start combat" }).click();
  await expect(page.getByRole("heading", { name: "Roll for initiative" })).toBeVisible();
  await expect(page.locator(".initiative-submit-list li")).toHaveCount(2);

  await expect(page.locator(".initiative-focus-card")).toContainText("Hero");
  await page.getByLabel("Rolled at table").fill("18");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.locator(".initiative-focus-card")).toContainText("Goblin");
  await page.getByLabel("Rolled at table").fill("12");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.locator(".initiative-submit-list li").first()).toContainText("18 initiative");
  await page.getByRole("button", { name: "Begin round" }).click();
  await expect(page.locator(".map-toolbar")).toContainText("Round 1: Hero");
  await expect(page.locator(".turn-label")).toContainText("Hero's turn");

  await openDmTool(page, "Combat");
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.locator(".active-turn-card")).toContainText("Goblin");

  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.locator(".map-toolbar")).toContainText("Round 2: Hero");
});

test("joins an existing room by code through player profile", async ({ page, browser }) => {
  await signInAsDm(page);
  const created=await page.request.post('/api/dm/rooms',{data:{name:'Join Test Room'}});
  const {room}=await created.json();
  const guestContext=await browser.newContext();
  try {
    const guest=await guestContext.newPage();
    await guest.goto('/join');
    await guest.getByLabel('Room code').fill(room.roomCode);
    await guest.getByRole('button',{name:'Join game'}).click();
    await guest.getByLabel('Player name').fill('Player One');
    await guest.getByRole('button',{name:'Enter lobby'}).click();
    await expect(guest).toHaveURL(new RegExp(`/room/${room.roomCode}$`));
    await expect(guest.getByRole('heading',{name:`Room ${room.roomCode}`})).toBeVisible();
  } finally {await guestContext.close();}
});

test("assigns unique random colors to room members", async ({ page, browser }) => {
  await signInAsDm(page);
  const created=await page.request.post('/api/dm/rooms',{data:{name:'Color Test'}});
  const {room}=await created.json();
  for(let index=0;index<8;index++){
    const context=await browser.newContext();
    try {
      const response=await context.request.post(`/api/rooms/${room.roomCode}`,{data:{nickname:`Guest ${index}`,color:'#ffffff'}});
      expect(response.ok()).toBeTruthy();
      const data=await response.json();
      const colors=data.room.members.map((member:{color:string})=>member.color.toLowerCase());
      expect(new Set(colors).size).toBe(colors.length);
    }finally{await context.close();}
  }
});

test("uploads and removes a custom token picture", async ({ page }) => {
  await createRoom(page);

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
  await createRoom(page);

  await openDmTool(page, "Build");
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
  await createRoom(page);

  await openDmTool(page, "Build");
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
  await createRoom(page);

  await openDmTool(page, "Build");
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
  await createRoom(page);

  await openDmTool(page, "Build");
  await page.getByRole("button", { name: "Background" }).click();

  const buildPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Build Mode" }) });
  await buildPanel.getByLabel("Upload battlefield").setInputFiles(path.join(process.cwd(), "tests/fixtures/token-picture.png"));
  await expect(page.locator(".map-background-image")).toHaveCount(1);

  const dataUrl = "data:image/png;base64," + readFileSync(path.join(process.cwd(), "tests/fixtures/token-picture.png")).toString("base64");
  await buildPanel.getByLabel("Battlefield image URL").fill(dataUrl);
  await buildPanel.getByRole("button", { name: "Use image URL" }).click();
  await expect(page.locator(".map-background-image")).toHaveAttribute("src", dataUrl);
});

test("adds and undoes a colored circle effect", async ({ page }) => {
  await createRoom(page);

  await openDmTool(page, "Build");
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
  await createRoom(page);

  await openDmTool(page, "Build");
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
  await createRoom(page);

  await openDmTool(page, "Build");
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

  const resolved = await page.evaluate(() => {
    window.history.replaceState({}, "", "/proxy/3000/");
    return new URL("room/PROXY1", window.location.href).pathname;
  });
  expect(resolved).toBe("/proxy/3000/room/PROXY1");
});
