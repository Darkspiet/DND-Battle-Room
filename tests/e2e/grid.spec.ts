import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { io } from "socket.io-client";
import type { SceneRecord } from "../../lib/domain/types";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function gridPng(width: number, height: number, cell: number) {
  const chunk = (type: string, content: Buffer) => {
    const size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(content.length);
    const payload = Buffer.concat([Buffer.from(type), content]);
    checksum.writeUInt32BE(crc32(payload));
    return Buffer.concat([size, payload, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      const value = x % cell < 2 || y % cell < 2 ? 25 : 155;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

test("imported grids keep their aspect ratio, support precise zoom selection and replace stale calibration", async ({
  page,
  baseURL
}) => {
  const signedIn = await page.request.post("/api/v1/auth/signin", {
    data: { username: "e2e-admin", password: process.env.E2E_ADMIN_PASSWORD }
  });
  expect(signedIn.ok()).toBe(true);
  const created = await (
    await page.request.post("/api/v1/campaigns", { data: { name: "Grid alignment regression" } })
  ).json();
  const sceneId = created.scene.id as string;
  const campaignId = created.campaign.id as string;
  const scene = async () =>
    (await (await page.request.get(`/api/v1/campaigns/${campaignId}`)).json()).scenes.find(
      (item: SceneRecord) => item.id === sceneId
    ) as SceneRecord;
  await page.goto(`/dm/campaigns/${campaignId}`);
  await page.getByRole("tab", { name: "Battle", exact: true }).click();
  await page.getByRole("button", { name: "Build", exact: true }).click();

  // CI uses synthetic pixels. A local run can verify an attached map without
  // committing its artwork or a machine-specific file path to the repository.
  const portrait = process.env.DND_GRID_TEST_IMAGE
    ? await readFile(process.env.DND_GRID_TEST_IMAGE)
    : gridPng(1120, 1680, 70);
  const naturalWidth = portrait.readUInt32BE(16),
    naturalHeight = portrait.readUInt32BE(20);
  await page
    .getByLabel("Battle map image file")
    .setInputFiles({ name: "portrait-grid.png", mimeType: "image/png", buffer: portrait });
  await expect(page.getByRole("status")).toContainText("Printed grid found");
  await expect
    .poll(async () => Number(await page.getByLabel("Grid pixels", { exact: true }).inputValue()))
    .toBeCloseTo(70, 1);
  const preview = page.getByAltText("Battle map grid calibration preview");
  const before = await preview.boundingBox();
  if (!before) throw new Error("Calibration image not measurable.");
  expect(before.width / before.height).toBeCloseTo(naturalWidth / naturalHeight, 4);
  await page.getByRole("button", { name: "Apply grid alignment" }).click();
  await expect.poll(async () => (await scene()).state.grid.calibration?.pixelsPerCell).toBeCloseTo(70, 1);
  expect((await scene()).state.grid.columns).toBe(naturalWidth / 70);
  expect((await scene()).state.grid.rows).toBe(naturalHeight / 70);

  await page.getByRole("button", { name: "Zoom calibration in" }).click();
  await page.getByRole("button", { name: "Zoom calibration in" }).click();
  await expect(page.getByRole("button", { name: "Fit calibration preview" })).toHaveText("400%");
  const enlarged = await preview.boundingBox();
  expect(enlarged!.width).toBeCloseTo(before.width * 4, 0);
  expect(enlarged!.width / enlarged!.height).toBeCloseTo(naturalWidth / naturalHeight, 4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator(".calibration-viewport").evaluate((element) => element.scrollHeight > element.clientHeight)
  ).toBe(true);
  await page.getByLabel("Cells between points").fill("10");
  for (const point of [
    { x: 70, y: 70 },
    { x: 770, y: 70 }
  ]) {
    const click = await preview.evaluate((element, point) => {
      const image = element as HTMLImageElement;
      const viewport = image.closest(".calibration-viewport")!;
      viewport.scrollLeft = (point.x / image.naturalWidth) * image.clientWidth - viewport.clientWidth / 2;
      viewport.scrollTop = (point.y / image.naturalHeight) * image.clientHeight - viewport.clientHeight / 2;
      const bounds = image.getBoundingClientRect();
      return {
        x: bounds.left + (point.x / image.naturalWidth) * bounds.width,
        y: bounds.top + (point.y / image.naturalHeight) * bounds.height
      };
    }, point);
    await page.mouse.click(click.x, click.y);
  }
  await expect(page.locator(".calibration-preview-heading")).toContainText("2/2");
  expect(Math.abs(Number(await page.getByLabel("Grid pixels", { exact: true }).inputValue()) - 70)).toBeLessThan(0.2);

  // A second client changing tokens must not erase a DM's in-progress form.
  await page.getByText("Manual grid settings", { exact: true }).click();
  await page.getByLabel("Grid pixels", { exact: true }).fill("71.5");
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const socket = io(baseURL!, { transports: ["websocket"], extraHeaders: { Origin: baseURL!, Cookie: cookie } });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const latest = await scene();
    const result: { ok: boolean } = await socket.timeout(5000).emitWithAck("scene:command", {
      sceneId,
      commandId: randomUUID(),
      baseVersion: latest.version,
      command: {
        type: "token.create",
        token: {
          id: randomUUID(),
          name: "Calibration sentinel",
          icon: "S",
          kind: "npc",
          color: "#b83c52",
          x: 2,
          y: 2,
          size: 1,
          conditions: []
        }
      }
    });
    expect(result.ok).toBe(true);
    await expect(page.locator(".battle-canvas")).toHaveAttribute("data-scene-version", String(latest.version + 1));
    await expect(page.getByLabel("Grid pixels", { exact: true })).toHaveValue("71.5");
  } finally {
    socket.disconnect();
  }
  await page.getByRole("button", { name: "Fit calibration preview" }).click();
  await page.screenshot({ path: "test-results/screenshots/grid-calibration-portrait.png", fullPage: false });

  await page
    .getByLabel("Battle map image file")
    .setInputFiles({ name: "landscape-grid.png", mimeType: "image/png", buffer: gridPng(1200, 800, 50) });
  await expect
    .poll(async () => Number(await page.getByLabel("Grid pixels", { exact: true }).inputValue()))
    .toBeCloseTo(50, 1);
  expect((await scene()).state.grid.calibration).toBeNull();
  expect((await scene()).state.grid.showGrid).toBe(false);
  await page.getByRole("button", { name: "Apply grid alignment" }).click();
  await expect.poll(async () => (await scene()).state.grid.calibration?.pixelsPerCell).toBeCloseTo(50, 1);
  const saved = (await scene()).state.grid;
  expect(saved.columns).toBe(24);
  expect(saved.rows).toBe(16);
  expect(saved.calibration!.pixelsPerCell * saved.calibration!.imageScale).toBeCloseTo(saved.cellSize, 8);
  await page.reload();
  await page.getByRole("tab", { name: "Battle", exact: true }).click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel("Grid pixels", { exact: true }).inputValue()))
    .toBeCloseTo(50, 1);
});
