import { describe, expect, it } from "vitest";
import { detectPrintedGrid } from "../../lib/domain/gridDetection";

function raster(width: number, height: number, cellX: number, cellY = cellX, originX = 0, originY = 0) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const lineX = Math.abs((x - originX + cellX) % cellX) < 2;
      const lineY = Math.abs((y - originY + cellY) % cellY) < 2;
      const value = lineX || lineY ? 25 : 130 + ((x * 7 + y * 13) % 29);
      const offset = (y * width + x) * 4;
      data.set([value, value, value, 255], offset);
    }
  return { width, height, data };
}

describe("printed grid detection", () => {
  it("detects portrait and landscape square grids without selecting a multiple", () => {
    for (const [width, height] of [
      [1120, 1680],
      [1680, 1120]
    ]) {
      const detected = detectPrintedGrid(raster(width, height, 70));
      expect(detected).not.toBeNull();
      expect(detected!.pixelsPerCell).toBeCloseTo(70, 1);
      expect(detected!.columns).toBe(width / 70);
      expect(detected!.rows).toBe(height / 70);
    }
  });

  it("preserves a nonzero first-line offset", () => {
    const detected = detectPrintedGrid(raster(1120, 1680, 70, 70, 13, 19));
    expect(detected).not.toBeNull();
    expect(detected!.originX).toBeCloseTo(13.5, 0);
    expect(detected!.originY).toBeCloseTo(19.5, 0);
  });

  it("does not invent a square grid for rectangular cells or flat images", () => {
    expect(detectPrintedGrid(raster(1120, 1680, 70, 80))).toBeNull();
    const flat = raster(240, 360, 70);
    flat.data.fill(255);
    expect(detectPrintedGrid(flat)).toBeNull();
  });
});
