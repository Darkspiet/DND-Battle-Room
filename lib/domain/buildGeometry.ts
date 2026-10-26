import type { SceneEffect } from "./types";

export function snapToGrid(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  cell: number
) {
  return {
    x: origin.x + Math.round((point.x - origin.x) / cell) * cell,
    y: origin.y + Math.round((point.y - origin.y) / cell) * cell
  };
}

export function effectPixelSize(effect: SceneEffect, cell: number, feetPerCell: number) {
  return (effect.sizeFeet / feetPerCell) * cell;
}

export function effectDirectionDegrees(effect: SceneEffect) {
  return (Math.atan2(effect.target.y - effect.origin.y, effect.target.x - effect.origin.x) * 180) / Math.PI;
}

export function lineEffectPolygon(effect: SceneEffect, cell: number, feetPerCell: number) {
  const angle = Math.atan2(effect.target.y - effect.origin.y, effect.target.x - effect.origin.x);
  const length = effectPixelSize(effect, cell, feetPerCell);
  const width = ((effect.widthFeet ?? 5) / feetPerCell) * cell;
  const dx = Math.cos(angle) * length;
  const dy = Math.sin(angle) * length;
  const px = Math.cos(angle + Math.PI / 2) * (width / 2);
  const py = Math.sin(angle + Math.PI / 2) * (width / 2);
  return [
    effect.origin.x + px,
    effect.origin.y + py,
    effect.origin.x - px,
    effect.origin.y - py,
    effect.origin.x + dx - px,
    effect.origin.y + dy - py,
    effect.origin.x + dx + px,
    effect.origin.y + dy + py
  ];
}
