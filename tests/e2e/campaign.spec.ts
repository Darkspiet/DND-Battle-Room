import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const password = process.env.E2E_ADMIN_PASSWORD ?? "";

type TokenSnapshot = {
  cellSize: number;
  columns: number;
  id: string;
  size: number;
  x: number;
  y: number;
};

function silenceWav(durationSeconds = 2) {
  const sampleRate = 8_000;
  const sampleCount = sampleRate * durationSeconds;
  const buffer = Buffer.alloc(44 + sampleCount, 128);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + sampleCount, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(sampleCount, 40);
  return buffer;
}

function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
    "base64"
  );
}

async function signIn(page: Page) {
  await page.goto("/dm/login");
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Your campaigns" })).toBeVisible();
}

async function createCampaign(page: Page) {
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill("Ash Coast Chronicle");
  await page.getByLabel("Description").fill("A persistent E2E campaign world.");
  await page.getByRole("button", { name: "Create campaign" }).last().click();
  await expect(page).toHaveURL(/\/dm\/campaigns\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Ash Coast Chronicle" })).toBeVisible();
  return (await page.locator(".join-code code").textContent())?.trim() ?? "";
}

async function readToken(page: Page, campaignId: string, tokenName: string): Promise<TokenSnapshot> {
  return page.evaluate(
    async ({ campaignId: requestedCampaignId, tokenName: requestedTokenName }) => {
      const response = await fetch(`/api/v1/campaigns/${requestedCampaignId}`);
      if (!response.ok) throw new Error(`Could not load campaign workspace (${response.status}).`);
      const workspace = (await response.json()) as {
        scenes: Array<{
          state: {
            grid: { cellSize: number; columns: number };
            tokens: Array<{ id: string; name: string; size: number; x: number; y: number }>;
          };
        }>;
      };
      for (const scene of workspace.scenes) {
        const token = scene.state.tokens.find((candidate) => candidate.name === requestedTokenName);
        if (token) return { ...token, cellSize: scene.state.grid.cellSize, columns: scene.state.grid.columns };
      }
      throw new Error(`Token ${requestedTokenName} was not found.`);
    },
    { campaignId, tokenName }
  );
}

async function expectTokenPosition(page: Page, campaignId: string, tokenName: string, x: number, y: number) {
  await expect.poll(() => readToken(page, campaignId, tokenName).then((token) => [token.x, token.y])).toEqual([x, y]);
}

async function joinPlayer(context: BrowserContext, code: string, joinUrl = `/join/${code}`) {
  const page = await context.newPage();
  await page.goto(joinUrl);
  await page.getByLabel("Player name").fill("Tamsin Vale");
  await page.getByLabel("Character name").fill("Tamsin the Swift");
  await page.getByRole("button", { name: "Use 🏹 token" }).click();
  await page
    .getByLabel("Character portrait")
    .setInputFiles({ name: "tamsin.png", mimeType: "image/png", buffer: tinyPng() });
  await page.getByRole("button", { name: "Enter campaign" }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}$`));
  await expect(page.getByText("Campaign world", { exact: true }).first()).toBeVisible();
  return page;
}

test("campaign gateway, DM workspace, and forced player destinations", async ({ browser, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: undefined });
    Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => {
        const field = document.querySelector("textarea");
        (window as typeof window & { __copiedText?: string }).__copiedText = field?.value ?? "";
        return command === "copy";
      }
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DND Battle Room" })).toBeVisible();
  await expect(page.getByLabel("Campaign code")).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/gateway-desktop.png", fullPage: true });

  await signIn(page);
  const code = await createCampaign(page);
  const campaignId = page.url().split("/").at(-1) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  await page.locator(".join-code").click();
  await expect(page.locator(".join-code")).toContainText("Link copied");
  const joinUrl = await page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText ?? "");
  expect(joinUrl).toMatch(new RegExp(`/join/${code}$`));

  await page
    .getByLabel("World map image file")
    .setInputFiles({ name: "world.png", mimeType: "image/png", buffer: tinyPng() });
  await expect(page.locator(".world-map-background")).toBeVisible();

  await page.getByRole("button", { name: "Add world location" }).click();
  await page.getByLabel("Name").last().fill("Blackglass Harbor");
  await page.getByLabel("Notes").last().fill("A revealed coastal settlement.");
  await page.getByText("Reveal to players now").click();
  await page.getByRole("button", { name: "Add location" }).last().click();
  await expect(page.getByText("Blackglass Harbor", { exact: true }).first()).toBeVisible();

  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const player = await joinPlayer(playerContext, code, joinUrl);
  const touchClient = await playerContext.newCDPSession(player);
  await expect(page.getByText("Tamsin Vale", { exact: true })).toBeVisible();

  const playerRow = page.locator(".player-roster label").filter({ hasText: "Tamsin Vale" });
  await playerRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send selected" }).click();
  await expect(player.getByText("Active encounter", { exact: true })).toBeVisible();
  await expect(player.locator("canvas")).toHaveCount(1);

  await page.getByRole("tab", { name: "Battle" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.locator(".token-list-row").filter({ hasText: "Tamsin the Swift" }).click();
  await expect(page.getByText("Selected token", { exact: true })).toBeVisible();
  const ownerSelect = page.getByLabel("Player owner");
  const ownerId = await ownerSelect.locator("option", { hasText: "Tamsin Vale" }).getAttribute("value");
  await expect(ownerSelect).toHaveValue(ownerId ?? "");
  const dmTokenBefore = await readToken(page, campaignId, "Tamsin the Swift");
  const dmCanvasBox = await page.locator("canvas").last().boundingBox();
  if (!dmCanvasBox) throw new Error("DM battle canvas was not measurable for token movement.");
  const dmZoom = dmCanvasBox.width / (dmTokenBefore.columns * dmTokenBefore.cellSize);
  await page.mouse.move(
    dmCanvasBox.x + (dmTokenBefore.x + dmTokenBefore.size / 2) * dmTokenBefore.cellSize * dmZoom,
    dmCanvasBox.y + (dmTokenBefore.y + dmTokenBefore.size / 2) * dmTokenBefore.cellSize * dmZoom
  );
  await page.mouse.down();
  await page.mouse.move(
    dmCanvasBox.x + (dmTokenBefore.x + dmTokenBefore.size / 2 + 1.4) * dmTokenBefore.cellSize * dmZoom,
    dmCanvasBox.y + (dmTokenBefore.y + dmTokenBefore.size / 2 + 0.7) * dmTokenBefore.cellSize * dmZoom,
    { steps: 4 }
  );
  await page.mouse.up();
  await expectTokenPosition(page, campaignId, "Tamsin the Swift", dmTokenBefore.x + 1, dmTokenBefore.y + 1);

  const playerTokenBefore = await readToken(page, campaignId, "Tamsin the Swift");
  const playerTokenCanvas = await player.locator("canvas").last().boundingBox();
  if (!playerTokenCanvas) throw new Error("Player battle canvas was not measurable for token movement.");
  const playerZoom = playerTokenCanvas.width / (playerTokenBefore.columns * playerTokenBefore.cellSize);
  const playerTokenCenter = {
    x:
      playerTokenCanvas.x +
      (playerTokenBefore.x + playerTokenBefore.size / 2) * playerTokenBefore.cellSize * playerZoom,
    y:
      playerTokenCanvas.y +
      (playerTokenBefore.y + playerTokenBefore.size / 2) * playerTokenBefore.cellSize * playerZoom
  };
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, ...playerTokenCenter }]
  });
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        id: 1,
        x: playerTokenCenter.x + playerTokenBefore.cellSize * playerZoom * 1.4,
        y: playerTokenCenter.y + playerTokenBefore.cellSize * playerZoom * 0.7
      }
    ]
  });
  await touchClient.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expectTokenPosition(page, campaignId, "Tamsin the Swift", playerTokenBefore.x + 1, playerTokenBefore.y + 1);

  await page.getByRole("button", { name: "Charmed", exact: true }).click();
  await expect(page.locator(".active-conditions")).toContainText("Charmed");
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  await page.getByRole("button", { name: "Start combat" }).click();
  await expect(player.getByRole("button", { name: "Submit initiative" })).toBeVisible();
  await player.getByRole("button", { name: "Submit initiative" }).click();
  await expect(page.getByRole("button", { name: "Begin round" })).toBeEnabled();
  await page.getByRole("button", { name: "Begin round" }).click();
  await expect(page.locator(".combat-map-status")).toContainText("Round 1");

  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page
    .getByLabel("Battle map image file")
    .setInputFiles(path.resolve("public/assets/campaign-command-map.png"));
  await expect(page.getByRole("button", { name: "Replace downloaded map" })).toBeVisible();
  const calibrationPreview = page.locator(".calibration-image-wrap img");
  await expect(calibrationPreview).toBeVisible();
  await calibrationPreview.click({ position: { x: 28, y: 28 } });
  await calibrationPreview.click({ position: { x: 72, y: 72 } });
  await expect(page.locator(".calibration-preview-heading")).toContainText("2/2");
  await page.getByRole("button", { name: "Apply grid alignment" }).click();
  await page.getByRole("button", { name: "Draw freehand" }).click();
  const canvas = page.locator("canvas").last();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Battle canvas was not measurable.");
  await page.mouse.move(box.x + 260, box.y + 230);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 280, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Place area effect" }).click();
  await page.mouse.move(box.x + 380, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 310, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Undo last build change" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build library" })).toBeVisible();
  await expect(page.getByText("Adventurer", { exact: true })).toBeVisible();
  await expect(page.locator(".encounter-library-list").getByText("Tamsin the Swift", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save scene token as preset" }).click();
  await page.getByRole("button", { name: "Table", exact: true }).click();

  await page.locator('input[accept^="audio/"]').setInputFiles({
    name: "E2E ambience.wav",
    mimeType: "audio/wav",
    buffer: silenceWav()
  });
  const trackSelect = page.getByLabel("Audio track");
  await expect(trackSelect).toContainText("E2E ambience");
  await trackSelect.selectOption({ label: "E2E ambience" });
  const audioPosition = page.getByLabel("Audio position");
  await expect(audioPosition).toBeEnabled();
  await expect(page.locator(".audio-seek output")).toContainText("0:02");
  await audioPosition.fill("500");
  await audioPosition.dispatchEvent("pointerup");
  await expect(player.getByText("E2E ambience", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable audio loop" }).click();
  await expect(page.getByRole("button", { name: "Loop campaign audio" })).toBeVisible();
  await page.getByRole("button", { name: "Play campaign audio" }).click();
  await expect(page.getByRole("button", { name: "Pause campaign audio" })).toBeVisible();
  await player.getByRole("button", { name: "Enable sound" }).click();
  await expect(player.getByLabel("Personal audio volume")).toBeVisible();
  await player.getByLabel("Personal audio volume").fill("0.35");
  await expect(player.getByRole("button", { name: "Fit entire map" })).toBeVisible();
  const playerScroller = player.locator(".battle-scroll");
  const zoomIn = player.getByRole("button", { name: "Zoom in" });
  const fitControl = player.getByRole("button", { name: "Fit entire map" });
  for (let step = 0; step < 12; step += 1) {
    if (await playerScroller.evaluate((element) => element.scrollWidth > element.clientWidth)) break;
    const previousZoom = await fitControl.textContent();
    await zoomIn.click();
    await expect.poll(() => fitControl.textContent()).not.toBe(previousZoom);
  }
  await expect.poll(() => playerScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const scrollBeforeTouch = await playerScroller.evaluate((element) => element.scrollLeft);
  const playerCanvasBox = await player.locator("canvas").last().boundingBox();
  if (!playerCanvasBox) throw new Error("Player battle canvas was not measurable.");
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: playerCanvasBox.x + 300, y: playerCanvasBox.y + 180 }]
  });
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: playerCanvasBox.x + 180, y: playerCanvasBox.y + 180 }]
  });
  await touchClient.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => playerScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(scrollBeforeTouch);
  await fitControl.click();
  const zoomBeforePinch = await fitControl.textContent();
  const fittedCanvasBox = await player.locator("canvas").last().boundingBox();
  if (!fittedCanvasBox) throw new Error("Fitted player battle canvas was not measurable.");
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: fittedCanvasBox.x + 160, y: fittedCanvasBox.y + 170 },
      { id: 2, x: fittedCanvasBox.x + 220, y: fittedCanvasBox.y + 170 }
    ]
  });
  await touchClient.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: fittedCanvasBox.x + 120, y: fittedCanvasBox.y + 170 },
      { id: 2, x: fittedCanvasBox.x + 260, y: fittedCanvasBox.y + 170 }
    ]
  });
  await touchClient.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => fitControl.textContent()).not.toBe(zoomBeforePinch);
  await fitControl.click();
  await player.getByRole("button", { name: "Roll d20" }).click();
  await expect(player.locator(".roll-strip")).toContainText("Tamsin Vale");
  await expect(player.locator(".workspace-error")).toHaveCount(0);

  await page.screenshot({ path: "test-results/screenshots/dm-battle-desktop.png", fullPage: false });
  await player.screenshot({ path: "test-results/screenshots/player-battle-mobile.png", fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await player.reload();
  await expect(player.locator(".roll-strip")).toContainText("Tamsin Vale");

  await page.getByRole("button", { name: "Return to world" }).click();
  await expect(player.getByText("Campaign world", { exact: true }).first()).toBeVisible();
  await player.reload();
  await expect(player.getByText("Campaign world", { exact: true }).first()).toBeVisible();

  await playerContext.close();
});

test("DM edits profile and creates reusable token presets", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Edit DM profile" }).click();
  await page.getByLabel("Display name").fill("Keeper of Tests");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Keeper of Tests", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Preset name").fill("Harbor Guard");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Harbor Guard", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Objects", exact: true }).click();
  await page.getByPlaceholder("Preset name").fill("Stone Pillar");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Stone Pillar", { exact: true })).toBeVisible();

});
