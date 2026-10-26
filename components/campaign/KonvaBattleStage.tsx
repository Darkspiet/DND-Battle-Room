"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Wedge } from "react-konva";
import { effectDirectionDegrees, effectPixelSize, lineEffectPolygon, snapToGrid } from "../../lib/domain/buildGeometry";
import { resolveGridMetrics } from "../../lib/domain/grid";
import { createUuid } from "../../lib/domain/id";
import type { Actor, SceneDrawing, SceneEffect, SceneRecord, SceneToken } from "../../lib/domain/types";

export type BattleTool = "select" | "draw" | "wall" | "effect";
export type SelectedBuildObject = { type: "drawing" | "effect"; id: string } | null;
export type BuildStyle = {
  color: string;
  drawingWidth: number;
  effectShape: SceneEffect["shape"];
  effectSizeFeet: number;
  effectWidthFeet: number;
  effectOpacity: number;
  effectLabel: string;
};

type Props = {
  actor: Actor;
  buildMode: boolean;
  buildStyle: BuildStyle;
  scene: SceneRecord;
  selectedBuildObject: SelectedBuildObject;
  selectedTokenId: string | null;
  tool: BattleTool;
  zoom: number;
  onDraw: (drawing: SceneDrawing) => void;
  onEffect: (effect: SceneEffect) => void;
  onMove: (token: SceneToken, x: number, y: number, preview: boolean) => void;
  onSelect: (tokenId: string | null) => void;
  onSelectBuild: (selected: SelectedBuildObject) => void;
  onUpdateDrawing: (drawingId: string, patch: Partial<SceneDrawing>) => void;
  onUpdateEffect: (effectId: string, patch: Partial<SceneEffect>) => void;
  onContentSize: (width: number, height: number) => void;
  onViewportTouch: (phase: "start" | "move" | "end", touches: Array<{ x: number; y: number }>) => void;
};

function useRemoteImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src) {
      setImage(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.onerror = () => {
      setImage(null);
      setFailed(true);
    };
    next.src = src;
    return () => {
      next.onload = null;
      next.onerror = null;
    };
  }, [src]);
  return { image, failed };
}

function EffectShape({ effect, cell, feetPerCell }: { effect: SceneEffect; cell: number; feetPerCell: number }) {
  const size = effectPixelSize(effect, cell, feetPerCell);
  const common = { fill: effect.color, opacity: effect.opacity, stroke: effect.color, strokeWidth: 3 };
  if (effect.shape === "circle") {
    return <Circle {...common} radius={size} x={effect.origin.x} y={effect.origin.y} />;
  }
  if (effect.shape === "cone") {
    return (
      <Wedge
        {...common}
        angle={60}
        radius={size}
        rotation={effectDirectionDegrees(effect) - 30}
        x={effect.origin.x}
        y={effect.origin.y}
      />
    );
  }
  if (effect.shape === "cube") {
    return (
      <Rect
        {...common}
        height={size}
        width={size}
        x={effect.target.x >= effect.origin.x ? effect.origin.x : effect.origin.x - size}
        y={effect.target.y >= effect.origin.y ? effect.origin.y : effect.origin.y - size}
      />
    );
  }
  return <Line {...common} closed points={lineEffectPolygon(effect, cell, feetPerCell)} />;
}

function EffectObject({
  buildMode,
  cell,
  effect,
  feetPerCell,
  selected,
  onSelect,
  onUpdate
}: {
  buildMode: boolean;
  cell: number;
  effect: SceneEffect;
  feetPerCell: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<SceneEffect>) => void;
}) {
  return (
    <Group
      draggable={buildMode}
      listening={buildMode}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(event) => {
        const dx = event.target.x();
        const dy = event.target.y();
        event.target.position({ x: 0, y: 0 });
        onUpdate({
          origin: { x: effect.origin.x + dx, y: effect.origin.y + dy },
          target: { x: effect.target.x + dx, y: effect.target.y + dy }
        });
      }}
    >
      {selected ? (
        <Circle
          listening={false}
          radius={Math.max(18, effectPixelSize(effect, cell, feetPerCell) + 8)}
          stroke="#f0d889"
          strokeWidth={2}
          x={effect.origin.x}
          y={effect.origin.y}
        />
      ) : null}
      <EffectShape cell={cell} effect={effect} feetPerCell={feetPerCell} />
      {effect.label ? (
        <Text
          align="center"
          fill="#f6f0df"
          fontSize={13}
          fontStyle="bold"
          shadowBlur={4}
          shadowColor="#000"
          text={effect.label}
          width={160}
          x={effect.origin.x - 80}
          y={effect.origin.y - 7}
        />
      ) : null}
    </Group>
  );
}

const CONDITION_SYMBOLS: Record<string, string> = {
  blinded: "◉",
  charmed: "♥",
  frightened: "!",
  grappled: "⌁",
  invisible: "◇",
  paralyzed: "Ⅱ",
  poisoned: "+",
  prone: "↓",
  restrained: "×",
  stunned: "✦",
  unconscious: "☾",
  concentration: "◎"
};

export function KonvaBattleStage({
  actor,
  buildMode,
  buildStyle,
  scene,
  selectedBuildObject,
  selectedTokenId,
  tool,
  zoom,
  onDraw,
  onEffect,
  onMove,
  onSelect,
  onSelectBuild,
  onUpdateDrawing,
  onUpdateEffect,
  onContentSize,
  onViewportTouch
}: Props) {
  const { grid } = scene.state;
  const { cell, originX, originY, imageScale, imageX, imageY } = resolveGridMetrics(grid);
  const { image: mapImage, failed: mapFailed } = useRemoteImage(
    grid.backgroundAssetId ? `/api/v1/assets/${grid.backgroundAssetId}` : null
  );
  const [animationFrame, setAnimationFrame] = useState(0);
  const [draftPoints, setDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [draftEffect, setDraftEffect] = useState<SceneEffect | null>(null);
  const viewportGesture = useRef(false);
  const minX = Math.min(0, originX, imageX);
  const minY = Math.min(0, originY, imageY);
  const maxX = Math.max(320, originX + grid.columns * cell, imageX + (mapImage?.naturalWidth ?? 0) * imageScale);
  const maxY = Math.max(240, originY + grid.rows * cell, imageY + (mapImage?.naturalHeight ?? 0) * imageScale);
  const offsetX = -minX;
  const offsetY = -minY;
  const width = maxX - minX;
  const height = maxY - minY;
  const activeTokenId = scene.state.combat.active
    ? scene.state.combat.entries[scene.state.combat.currentTurnIndex]?.tokenId
    : null;

  useEffect(() => onContentSize(width, height), [height, onContentSize, width]);

  useEffect(() => {
    const timer = window.setInterval(() => setAnimationFrame((value) => (value + 1) % 8), 180);
    return () => window.clearInterval(timer);
  }, []);

  const lines = useMemo(() => {
    const output: Array<{ points: number[]; key: string }> = [];
    for (let column = 0; column <= grid.columns; column += 1) {
      output.push({
        key: `v-${column}`,
        points: [originX + column * cell, originY, originX + column * cell, originY + grid.rows * cell]
      });
    }
    for (let row = 0; row <= grid.rows; row += 1) {
      output.push({
        key: `h-${row}`,
        points: [originX, originY + row * cell, originX + grid.columns * cell, originY + row * cell]
      });
    }
    return output;
  }, [cell, grid.columns, grid.rows, originX, originY]);

  function canMove(token: SceneToken) {
    return !buildMode && tool === "select" && (actor.role === "dm" || token.ownerId === actor.id);
  }

  function snap(point: { x: number; y: number }) {
    return snapToGrid(point, { x: originX, y: originY }, cell);
  }

  function gridPosition(target: Konva.Group, token: SceneToken) {
    return {
      x: Math.max(0, Math.min(grid.columns - token.size, Math.round((target.x() - originX) / cell))),
      y: Math.max(0, Math.min(grid.rows - token.size, Math.round((target.y() - originY) / cell)))
    };
  }

  function touches(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!("touches" in event.evt)) return [];
    return Array.from(event.evt.touches, (touch) => ({ x: touch.clientX, y: touch.clientY }));
  }

  function pointer(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    return position ? { x: position.x / zoom - offsetX, y: position.y / zoom - offsetY } : null;
  }

  function pointerDown(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!buildMode && "touches" in event.evt && event.target === event.target.getStage()) {
      event.evt.preventDefault();
      viewportGesture.current = true;
      onViewportTouch("start", touches(event));
      return;
    }
    const position = pointer(event);
    if (!position || !buildMode) return;
    if (tool === "draw" || tool === "wall") setDraftPoints([tool === "wall" ? snap(position) : position]);
    if (tool === "effect") {
      const origin = snap(position);
      setDraftEffect({
        id: createUuid(),
        shape: buildStyle.effectShape,
        label: buildStyle.effectLabel,
        color: buildStyle.color,
        opacity: buildStyle.effectOpacity,
        origin,
        target: { x: origin.x + cell, y: origin.y },
        sizeFeet: buildStyle.effectSizeFeet,
        widthFeet: buildStyle.effectShape === "line" ? buildStyle.effectWidthFeet : null
      });
    }
  }

  function pointerMove(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (viewportGesture.current && "touches" in event.evt) {
      event.evt.preventDefault();
      onViewportTouch("move", touches(event));
      return;
    }
    const position = pointer(event);
    if (!position) return;
    if (draftPoints.length && (tool === "draw" || tool === "wall")) {
      const next = tool === "wall" ? snap(position) : position;
      setDraftPoints((current) => (tool === "wall" ? [current[0], next] : [...current, next].slice(-4000)));
    }
    if (draftEffect) setDraftEffect((current) => (current ? { ...current, target: snap(position) } : current));
  }

  function pointerUp(event?: KonvaEventObject<MouseEvent | TouchEvent>) {
    if (viewportGesture.current && event && "touches" in event.evt) {
      event.evt.preventDefault();
      const remaining = touches(event);
      onViewportTouch("end", remaining);
      viewportGesture.current = remaining.length > 0;
      return;
    }
    if (draftPoints.length > 1 && (tool === "draw" || tool === "wall")) {
      onDraw({
        id: createUuid(),
        kind: tool === "wall" ? "wall" : "freehand",
        color: buildStyle.color,
        width: tool === "wall" ? Math.max(6, buildStyle.drawingWidth) : buildStyle.drawingWidth,
        points: draftPoints
      });
    }
    if (draftEffect) onEffect(draftEffect);
    setDraftPoints([]);
    setDraftEffect(null);
  }

  return (
    <Stage
      className={`konva-stage tool-${tool}`}
      height={height * zoom}
      onClick={(event) => {
        if (event.target === event.target.getStage()) {
          onSelect(null);
          onSelectBuild(null);
        }
      }}
      onMouseDown={pointerDown}
      onMouseMove={pointerMove}
      onMouseUp={pointerUp}
      onTouchEnd={(event) => pointerUp(event)}
      onTouchMove={pointerMove}
      onTouchStart={pointerDown}
      scaleX={zoom}
      scaleY={zoom}
      width={width * zoom}
    >
      <Layer>
        <Group x={offsetX} y={offsetY}>
          <Rect fill={grid.backgroundColor} height={height} listening={false} width={width} x={minX} y={minY} />
          {mapImage ? (
            <KonvaImage
              image={mapImage}
              listening={false}
              opacity={grid.backgroundOpacity ?? 0.96}
              scaleX={imageScale}
              scaleY={imageScale}
              x={imageX}
              y={imageY}
            />
          ) : null}
          {mapFailed ? <Text fill="#ffd6dc" fontSize={14} text="Map image could not be loaded" x={18} y={18} /> : null}
          {(grid.showGrid ?? true)
            ? lines.map((line) => (
                <Line
                  key={line.key}
                  listening={false}
                  points={line.points}
                  stroke={grid.color}
                  strokeWidth={1 / zoom}
                />
              ))
            : null}

          {scene.state.drawings.map((drawing) => {
            const selected = selectedBuildObject?.type === "drawing" && selectedBuildObject.id === drawing.id;
            return (
              <Line
                draggable={buildMode}
                key={drawing.id}
                lineCap="round"
                lineJoin="round"
                listening={buildMode}
                onClick={(event) => {
                  event.cancelBubble = true;
                  onSelectBuild({ type: "drawing", id: drawing.id });
                }}
                onDragEnd={(event) => {
                  const dx = event.target.x();
                  const dy = event.target.y();
                  event.target.position({ x: 0, y: 0 });
                  onUpdateDrawing(drawing.id, {
                    points: drawing.points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
                  });
                }}
                opacity={0.92}
                points={drawing.points.flatMap((point) => [point.x, point.y])}
                shadowBlur={selected ? 8 : 0}
                shadowColor="#f0d889"
                stroke={selected ? "#f0d889" : drawing.color}
                strokeWidth={drawing.width}
              />
            );
          })}
          {draftPoints.length > 1 ? (
            <Line
              lineCap="round"
              lineJoin="round"
              listening={false}
              opacity={0.8}
              points={draftPoints.flatMap((point) => [point.x, point.y])}
              stroke={buildStyle.color}
              strokeWidth={tool === "wall" ? Math.max(6, buildStyle.drawingWidth) : buildStyle.drawingWidth}
            />
          ) : null}

          {scene.state.effects.map((effect) => (
            <EffectObject
              buildMode={buildMode}
              cell={cell}
              effect={effect}
              feetPerCell={grid.feetPerCell}
              key={effect.id}
              onSelect={() => onSelectBuild({ type: "effect", id: effect.id })}
              onUpdate={(patch) => onUpdateEffect(effect.id, patch)}
              selected={selectedBuildObject?.type === "effect" && selectedBuildObject.id === effect.id}
            />
          ))}
          {draftEffect ? <EffectShape cell={cell} effect={draftEffect} feetPerCell={grid.feetPerCell} /> : null}

          {scene.state.tokens.map((token) => {
            const tokenSize = cell * token.size;
            const selected = selectedTokenId === token.id;
            const active = activeTokenId === token.id;
            const movable = canMove(token);
            const pulse = animationFrame < 4 ? 1 : 0.55;
            return (
              <Group
                draggable={movable}
                key={token.id}
                listening={!buildMode}
                onClick={() => onSelect(token.id)}
                onDragEnd={(event) => {
                  const target = event.target as unknown as Konva.Group;
                  const position = gridPosition(target, token);
                  target.position({ x: originX + position.x * cell, y: originY + position.y * cell });
                  onMove(token, position.x, position.y, false);
                }}
                onDragMove={(event) => {
                  const target = event.target as unknown as Konva.Group;
                  const position = gridPosition(target, token);
                  target.position({ x: originX + position.x * cell, y: originY + position.y * cell });
                  onMove(token, position.x, position.y, true);
                }}
                x={originX + token.x * cell}
                y={originY + token.y * cell}
              >
                {token.conditions.map((condition, index) =>
                  condition.animation === "aura" ? (
                    <Circle
                      key={`${condition.id}-aura`}
                      listening={false}
                      opacity={0.18 + pulse * 0.16}
                      radius={tokenSize * (0.54 + animationFrame * 0.012) + index * 2}
                      stroke={condition.color}
                      strokeWidth={4}
                      x={tokenSize / 2}
                      y={tokenSize / 2}
                    />
                  ) : condition.animation === "embers" ? (
                    <Group key={`${condition.id}-embers`} listening={false}>
                      {[0, 1, 2].map((ember) => (
                        <Circle
                          fill={condition.color}
                          key={ember}
                          opacity={0.45 + pulse * 0.35}
                          radius={2 + ((animationFrame + ember) % 2)}
                          x={tokenSize * (0.25 + ember * 0.25)}
                          y={tokenSize * (0.85 - ((animationFrame + ember * 2) % 7) * 0.09)}
                        />
                      ))}
                    </Group>
                  ) : condition.animation === "pulse" ? (
                    <Circle
                      fill={condition.color}
                      key={`${condition.id}-pulse`}
                      listening={false}
                      opacity={0.12 * pulse}
                      radius={tokenSize * (0.55 + animationFrame * 0.015)}
                      x={tokenSize / 2}
                      y={tokenSize / 2}
                    />
                  ) : null
                )}
                {active ? (
                  <Circle
                    opacity={0.75 + pulse * 0.2}
                    radius={tokenSize * 0.53}
                    stroke="#f0d889"
                    strokeWidth={5}
                    x={tokenSize / 2}
                    y={tokenSize / 2}
                  />
                ) : null}
                <Circle
                  fill="#111417"
                  radius={tokenSize * 0.46}
                  shadowBlur={selected || active ? 16 : 6}
                  shadowColor={active ? "#f0d889" : token.color}
                  stroke={selected || active ? "#f0d889" : token.color}
                  strokeWidth={selected || active ? 4 : 3}
                  x={tokenSize / 2}
                  y={tokenSize / 2}
                />
                {token.assetId ? (
                  <TokenImage assetId={token.assetId} size={tokenSize} />
                ) : (
                  <Text
                    align="center"
                    fill="#f4f1e8"
                    fontFamily="Arial"
                    fontSize={Math.max(12, tokenSize * 0.28)}
                    fontStyle="bold"
                    height={tokenSize}
                    text={token.icon || token.name.slice(0, 2).toUpperCase()}
                    verticalAlign="middle"
                    width={tokenSize}
                  />
                )}
                <Text
                  align="center"
                  fill="#f4f1e8"
                  fontFamily="Arial"
                  fontSize={Math.max(10, Math.min(14, cell * 0.22))}
                  fontStyle="bold"
                  shadowBlur={4}
                  shadowColor="#000"
                  text={active ? `${token.name}'s turn` : token.name}
                  width={Math.max(tokenSize, cell * 2.2)}
                  x={-(Math.max(tokenSize, cell * 2.2) - tokenSize) / 2}
                  y={tokenSize + 4}
                />
                {token.conditions.map((condition, index) => (
                  <Group key={condition.id} listening={false} x={tokenSize - 8 - index * 14} y={7}>
                    <Circle
                      fill={condition.color}
                      opacity={condition.animation === "pulse" ? pulse : 1}
                      radius={8}
                      stroke="#111417"
                      strokeWidth={2}
                    />
                    <Text
                      align="center"
                      fill="#ffffff"
                      fontSize={9}
                      fontStyle="bold"
                      height={16}
                      text={CONDITION_SYMBOLS[condition.key] ?? condition.label.slice(0, 1).toUpperCase()}
                      verticalAlign="middle"
                      width={16}
                      x={-8}
                      y={-8}
                    />
                  </Group>
                ))}
              </Group>
            );
          })}
        </Group>
      </Layer>
    </Stage>
  );
}

function TokenImage({ assetId, size }: { assetId: string; size: number }) {
  const { image } = useRemoteImage(`/api/v1/assets/${assetId}`);
  if (!image) return null;
  return (
    <Group clipFunc={(context: Konva.Context) => context.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)}>
      <KonvaImage height={size * 0.84} image={image} width={size * 0.84} x={size * 0.08} y={size * 0.08} />
    </Group>
  );
}
