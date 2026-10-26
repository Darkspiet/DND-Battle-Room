import type { SceneGrid } from "./types";

export function resolveGridMetrics(grid: SceneGrid) {
  const calibration = grid.calibration;
  return {
    cell: calibration ? calibration.pixelsPerCell * calibration.imageScale : grid.cellSize,
    originX: calibration ? calibration.imageOffsetX + calibration.originX * calibration.imageScale : 0,
    originY: calibration ? calibration.imageOffsetY + calibration.originY * calibration.imageScale : 0,
    imageX: calibration?.imageOffsetX ?? 0,
    imageY: calibration?.imageOffsetY ?? 0,
    imageScale: calibration?.imageScale ?? 1
  };
}
