import type { AreaEffectTemplate, RoomState } from "../../lib/types";
import type { BoardPoint } from "./model";
export function pointDistance(first: BoardPoint, second: BoardPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}
export function pointAngle(first: BoardPoint, second: BoardPoint) {
  if (pointDistance(first, second) < 1) return 0;
  return Math.atan2(second.y - first.y, second.x - first.x);
}
export function polarPoint(
  origin: BoardPoint,
  angle: number,
  distance: number,
) {
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance,
  };
}
export function feetToPixels(feet: number, room: RoomState) {
  const feetPerCell = room.grid.feetPerCell ?? 5;
  return (feet / feetPerCell) * room.grid.cellSize;
}
export function linePolygonPoints(effect: AreaEffectTemplate, room: RoomState) {
  const angle = pointAngle(effect.origin, effect.target);
  const length = feetToPixels(effect.sizeFeet, room);
  const halfWidth = feetToPixels(effect.widthFeet ?? 5, room) / 2;
  const end = polarPoint(effect.origin, angle, length);
  const perpendicular = angle + Math.PI / 2;
  const points = [
    polarPoint(effect.origin, perpendicular, halfWidth),
    polarPoint(end, perpendicular, halfWidth),
    polarPoint(end, perpendicular, -halfWidth),
    polarPoint(effect.origin, perpendicular, -halfWidth),
  ];
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
export function conePath(effect: AreaEffectTemplate, room: RoomState) {
  const angle = pointAngle(effect.origin, effect.target);
  const radius = feetToPixels(effect.sizeFeet, room);
  const spread = Math.PI / 3;
  const first = polarPoint(effect.origin, angle - spread / 2, radius);
  const second = polarPoint(effect.origin, angle + spread / 2, radius);
  return `M ${effect.origin.x} ${effect.origin.y} L ${first.x} ${first.y} A ${radius} ${radius} 0 0 1 ${second.x} ${second.y} Z`;
}
export function cubeRect(effect: AreaEffectTemplate, room: RoomState) {
  const size = feetToPixels(effect.sizeFeet, room);
  const signX = effect.target.x >= effect.origin.x ? 1 : -1;
  const signY = effect.target.y >= effect.origin.y ? 1 : -1;
  return {
    x: signX > 0 ? effect.origin.x : effect.origin.x - size,
    y: signY > 0 ? effect.origin.y : effect.origin.y - size,
    size,
  };
}
