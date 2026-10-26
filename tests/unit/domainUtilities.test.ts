import { describe, expect, it } from "vitest";
import { effectiveAudioPosition } from "../../lib/domain/audio";
import { effectDirectionDegrees, effectPixelSize, lineEffectPolygon, snapToGrid } from "../../lib/domain/buildGeometry";
import { createDefaultSceneState } from "../../lib/domain/defaults";
import { resolveGridMetrics } from "../../lib/domain/grid";
import { calibrationFromPoints } from "../../lib/domain/gridCalibration";
import { parseByteRange } from "../../lib/domain/range";

describe("byte ranges", () => {
  it("supports full, bounded, open, and suffix requests", () => {
    expect(parseByteRange(null, 100)).toEqual({ start: 0, end: 99, partial: false });
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19, partial: true });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99, partial: true });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99, partial: true });
  });

  it("rejects invalid or unsatisfiable requests", () => {
    expect(parseByteRange("bytes=100-120", 100)).toBeNull();
    expect(parseByteRange("bytes=20-10", 100)).toBeNull();
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBeNull();
  });
});

describe("grid calibration", () => {
  it("resolves imported image offsets and grid spacing", () => {
    const grid = { ...createDefaultSceneState().grid, calibration: { originX: 12, originY: 8, pixelsPerCell: 50, imageScale: 0.8, imageOffsetX: -4, imageOffsetY: 6 } };
    const metrics = resolveGridMetrics(grid);
    expect(metrics.cell).toBe(40);
    expect(metrics.originX).toBeCloseTo(5.6);
    expect(metrics.originY).toBeCloseTo(12.4);
    expect(metrics).toMatchObject({ imageX: -4, imageY: 6, imageScale: 0.8 });
  });

  it("derives spacing, origin, and board size from neighboring image intersections", () => {
    expect(calibrationFromPoints({ x: 18, y: 22 }, { x: 82, y: 86 }, { width: 658, height: 534 })).toEqual({
      originX: 18,
      originY: 22,
      pixelsPerCell: 64,
      columns: 10,
      rows: 8
    });
  });

  it("supports two points on the same grid line", () => {
    expect(calibrationFromPoints({ x: 10, y: 14 }, { x: 60, y: 14 }, { width: 510, height: 414 })).toMatchObject({
      originX: 10,
      originY: 14,
      pixelsPerCell: 50,
      columns: 10,
      rows: 8
    });
  });
});

describe("audio synchronization", () => {
  it("advances playing tracks from the server timestamp", () => {
    const now = Date.parse("2026-07-22T12:00:10.000Z");
    expect(effectiveAudioPosition({ campaignId: "campaign", playing: true, positionMs: 2_000, startedAt: "2026-07-22T12:00:05.000Z", loop: true, revision: 1 }, now)).toBe(7_000);
  });

describe("build geometry", () => {
  const effect = {
    id: "00000000-0000-4000-8000-000000000001",
    shape: "line" as const,
    label: "Lightning",
    color: "#4d86e8",
    opacity: 0.4,
    origin: { x: 10, y: 20 },
    target: { x: 40, y: 20 },
    sizeFeet: 30,
    widthFeet: 5
  };

  it("snaps wall points against a calibrated origin", () => {
    expect(snapToGrid({ x: 77, y: 93 }, { x: 5, y: 13 }, 40)).toEqual({ x: 85, y: 93 });
  });

  it("converts feet to pixels and builds a directional line polygon", () => {
    expect(effectPixelSize(effect, 50, 5)).toBe(300);
    expect(effectDirectionDegrees(effect)).toBe(0);
    const polygon = lineEffectPolygon(effect, 50, 5);
    [10, 45, 10, -5, 310, -5, 310, 45].forEach((value, index) =>
      expect(polygon[index]).toBeCloseTo(value)
    );
  });
});
});
