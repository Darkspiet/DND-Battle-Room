export type CalibrationPoint = { x: number; y: number };

export function calibrationFromPoints(
  first: CalibrationPoint,
  second: CalibrationPoint,
  image: { width: number; height: number }
) {
  const dx = Math.abs(second.x - first.x);
  const dy = Math.abs(second.y - first.y);
  const candidates = [dx, dy].filter((distance) => distance >= 2);
  if (!candidates.length) throw new Error("Choose two different grid intersections.");

  const pixelsPerCell = candidates.length === 2 ? (candidates[0] + candidates[1]) / 2 : candidates[0];
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

