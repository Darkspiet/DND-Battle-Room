import type { GridCalibration } from "./types";

export type CalibrationPoint = { x: number; y: number };

export function calibrationFromPoints(
  first: CalibrationPoint,
  second: CalibrationPoint,
  image: { width: number; height: number },
  cellsBetweenPoints = 1
) {
  if (
    ![first.x, first.y, second.x, second.y, image.width, image.height].every(Number.isFinite) ||
    image.width <= 0 ||
    image.height <= 0
  )
    throw new Error("The map dimensions and calibration points must be valid.");
  if (!Number.isInteger(cellsBetweenPoints) || cellsBetweenPoints < 1 || cellsBetweenPoints > 200)
    throw new Error("Enter 1–200 grid cells between the selected points.");
  const dx = Math.abs(second.x - first.x);
  const dy = Math.abs(second.y - first.y);
  const major = Math.max(dx, dy);
  const minor = Math.min(dx, dy);
  if (major / cellsBetweenPoints < 2) throw new Error("Choose grid intersections farther apart.");
  // Small sideways click error on a horizontal/vertical line is not another
  // cell measurement. Averaging it used to almost halve the inferred spacing.
  if (minor > major * 0.15 && minor < major * 0.9)
    throw new Error("Choose intersections on the same row or column, or on an equal-step diagonal.");
  const pixelsPerCell = (minor <= major * 0.15 ? major : (dx + dy) / 2) / cellsBetweenPoints;
  const modulo = (value: number) => ((value % pixelsPerCell) + pixelsPerCell) % pixelsPerCell;
  const originX = modulo(first.x);
  const originY = modulo(first.y);

  return {
    originX,
    originY,
    pixelsPerCell,
    columns: Math.max(4, Math.min(200, Math.ceil((image.width - originX) / pixelsPerCell))),
    rows: Math.max(4, Math.min(200, Math.ceil((image.height - originY) / pixelsPerCell)))
  };
}

export function normalizeCalibration(calibration: GridCalibration) {
  const cellSize = Math.max(24, Math.min(160, Math.round(calibration.pixelsPerCell * calibration.imageScale)));
  const imageScale = cellSize / calibration.pixelsPerCell;
  if (!Number.isFinite(imageScale) || imageScale < 0.05 || imageScale > 10)
    throw new Error("Choose a grid spacing and image scale that fit the map.");
  return {
    cellSize,
    calibration: {
      originX: calibration.originX,
      originY: calibration.originY,
      pixelsPerCell: calibration.pixelsPerCell,
      imageScale,
      imageOffsetX: calibration.imageOffsetX,
      imageOffsetY: calibration.imageOffsetY
    }
  };
}
