"use client";

import { BrickWall, Eraser, Minus, MousePointer2, Pencil, Plus, Scan, Sparkles, Trash2, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Actor, SceneCommand, SceneEffect, SceneRecord, SceneToken } from "../../lib/domain/types";
import type { BattleTool, BuildStyle, SelectedBuildObject } from "./KonvaBattleStage";

export type BattleMode = "table" | "combat" | "build" | "library";

const BattleStage = dynamic(() => import("./KonvaBattleStage").then((module) => module.KonvaBattleStage), {
  loading: () => (
    <div className="loading-state">
      <span className="spinner" /> Preparing battle map...
    </div>
  ),
  ssr: false
});

const BUILD_COLORS = ["#d65b6e", "#f0d889", "#3da58a", "#4d86e8", "#9b72e8", "#d7d2c7"];

type ViewportGesture =
  | { kind: "pan"; x: number; y: number; left: number; top: number }
  | { kind: "pinch"; distance: number; zoom: number; worldX: number; worldY: number };

type Props = {
  actor: Actor;
  mode?: BattleMode;
  scene: SceneRecord;
  selectedTokenId: string | null;
  zoom: number;
  onCommand?: (command: SceneCommand) => Promise<void>;
  onMove: (token: SceneToken, x: number, y: number, preview: boolean) => void;
  onSelect: (tokenId: string | null) => void;
  onUndo?: () => Promise<void>;
  onZoom: (zoom: number) => void;
};

export function BattleCanvas({
  actor,
  mode = "table",
  scene,
  selectedTokenId,
  zoom,
  onCommand,
  onMove,
  onSelect,
  onUndo,
  onZoom
}: Props) {
  const buildMode = actor.role === "dm" && mode === "build";
  const [tool, setTool] = useState<BattleTool>("select");
  const [selectedBuildObject, setSelectedBuildObject] = useState<SelectedBuildObject>(null);
  const [buildStyle, setBuildStyle] = useState<BuildStyle>({
    color: "#d65b6e",
    drawingWidth: 5,
    effectShape: "circle",
    effectSizeFeet: 20,
    effectWidthFeet: 5,
    effectOpacity: 0.3,
    effectLabel: ""
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<ViewportGesture | null>(null);
  const fittedSceneRef = useRef<string | null>(null);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const selectedDrawing =
    selectedBuildObject?.type === "drawing"
      ? (scene.state.drawings.find((drawing) => drawing.id === selectedBuildObject.id) ?? null)
      : null;
  const selectedEffect =
    selectedBuildObject?.type === "effect"
      ? (scene.state.effects.find((effect) => effect.id === selectedBuildObject.id) ?? null)
      : null;
  const activeEntry = scene.state.combat.active
    ? scene.state.combat.entries[scene.state.combat.currentTurnIndex]
    : null;
  const fitKey = [
    scene.id,
    scene.state.grid.backgroundAssetId ?? "none",
    scene.state.grid.rows,
    scene.state.grid.columns,
    scene.state.grid.cellSize,
    scene.state.grid.calibration?.pixelsPerCell ?? "default",
    scene.state.grid.calibration?.imageScale ?? 1
  ].join(":");

  useEffect(() => {
    if (!buildMode) {
      setTool("select");
      setSelectedBuildObject(null);
    }
  }, [buildMode]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setViewportSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const fitMap = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport || !contentSize.width || !contentSize.height) return;
    const availableHeight = Math.max(viewport.clientHeight, viewport.parentElement?.clientHeight ?? 0);
    const nextZoom = Math.max(
      0.15,
      Math.min(2, Math.min((viewport.clientWidth - 16) / contentSize.width, (availableHeight - 16) / contentSize.height))
    );
    onZoom(nextZoom);
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        viewport.scrollTo({
          left: Math.max(0, (contentSize.width * nextZoom - viewport.clientWidth) / 2),
          top: Math.max(0, (contentSize.height * nextZoom - viewport.clientHeight) / 2),
          behavior: "smooth"
        });
      })
    );
  }, [contentSize.height, contentSize.width, onZoom]);

  useEffect(() => {
    const sizedFitKey = `${fitKey}:${viewportSize.width}x${viewportSize.height}`;
    if (
      actor.role !== "player" ||
      fittedSceneRef.current === sizedFitKey ||
      !contentSize.width ||
      !viewportSize.width ||
      !viewportSize.height
    )
      return;
    fittedSceneRef.current = sizedFitKey;
    fitMap();
  }, [actor.role, contentSize.width, fitKey, fitMap, viewportSize.height, viewportSize.width]);

  function viewportTouch(phase: "start" | "move" | "end", touches: Array<{ x: number; y: number }>) {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const midpoint = (points: Array<{ x: number; y: number }>) => ({
      x: points.reduce((total, point) => total + point.x, 0) / points.length,
      y: points.reduce((total, point) => total + point.y, 0) / points.length
    });
    const distance = (points: Array<{ x: number; y: number }>) =>
      Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

    if (phase === "start" || (phase === "end" && touches.length)) {
      if (touches.length >= 2) {
        const center = midpoint(touches.slice(0, 2));
        const rect = viewport.getBoundingClientRect();
        gestureRef.current = {
          kind: "pinch",
          distance: distance(touches.slice(0, 2)),
          zoom,
          worldX: (viewport.scrollLeft + center.x - rect.left) / zoom,
          worldY: (viewport.scrollTop + center.y - rect.top) / zoom
        };
      } else if (touches.length === 1) {
        gestureRef.current = {
          kind: "pan",
          x: touches[0].x,
          y: touches[0].y,
          left: viewport.scrollLeft,
          top: viewport.scrollTop
        };
      }
      return;
    }

    if (phase === "end" || !touches.length) {
      gestureRef.current = null;
      return;
    }

    const gesture = gestureRef.current;
    if (gesture?.kind === "pan" && touches.length === 1) {
      viewport.scrollLeft = gesture.left - (touches[0].x - gesture.x);
      viewport.scrollTop = gesture.top - (touches[0].y - gesture.y);
    } else if (gesture?.kind === "pinch" && touches.length >= 2) {
      const center = midpoint(touches.slice(0, 2));
      const rect = viewport.getBoundingClientRect();
      const nextZoom = Math.max(0.15, Math.min(2, gesture.zoom * (distance(touches.slice(0, 2)) / gesture.distance)));
      onZoom(nextZoom);
      window.requestAnimationFrame(() => {
        viewport.scrollLeft = gesture.worldX * nextZoom - (center.x - rect.left);
        viewport.scrollTop = gesture.worldY * nextZoom - (center.y - rect.top);
      });
    }
  }

  function command(value: SceneCommand) {
    void onCommand?.(value).catch(() => undefined);
  }

  function updateSelectedEffect(patch: Partial<SceneEffect>) {
    if (selectedEffect) command({ type: "effect.update", effectId: selectedEffect.id, patch });
  }

  return (
    <section className={`battle-canvas battle-mode-${mode}`} aria-label={`${scene.name} battle map`} data-scene-version={scene.version}>
      <div className="battle-scroll" ref={scrollRef}>
        <BattleStage
          actor={actor}
          buildMode={buildMode}
          buildStyle={buildStyle}
          onDraw={(drawing) => command({ type: "drawing.add", drawing })}
          onContentSize={(width, height) =>
            setContentSize((current) => (current.width === width && current.height === height ? current : { width, height }))
          }
          onEffect={(effect) => command({ type: "effect.add", effect })}
          onMove={onMove}
          onSelect={onSelect}
          onSelectBuild={setSelectedBuildObject}
          onUpdateDrawing={(drawingId, patch) => command({ type: "drawing.update", drawingId, patch })}
          onUpdateEffect={(effectId, patch) => command({ type: "effect.update", effectId, patch })}
          onViewportTouch={viewportTouch}
          scene={scene}
          selectedBuildObject={selectedBuildObject}
          selectedTokenId={selectedTokenId}
          tool={tool}
          zoom={zoom}
        />
      </div>
      {activeEntry && actor.role === "dm" ? (
        <div className="combat-map-status">
          Round {scene.state.combat.round}: <strong>{activeEntry.name}</strong>
        </div>
      ) : null}
      {buildMode ? (
        <>
          <div className="battle-tools" aria-label="Battle map tools">
            <ToolButton
              active={tool === "select"}
              icon={<MousePointer2 />}
              label="Select build object"
              onClick={() => setTool("select")}
            />
            <ToolButton
              active={tool === "draw"}
              icon={<Pencil />}
              label="Draw freehand"
              onClick={() => setTool("draw")}
            />
            <ToolButton
              active={tool === "wall"}
              icon={<BrickWall />}
              label="Draw snapped wall"
              onClick={() => setTool("wall")}
            />
            <ToolButton
              active={tool === "effect"}
              icon={<Sparkles />}
              label="Place area effect"
              onClick={() => setTool("effect")}
            />
            <button
              className="icon-button"
              aria-label="Undo last build change"
              title="Undo"
              onClick={() => void onUndo?.().catch(() => undefined)}
              type="button"
            >
              <Undo2 aria-hidden="true" />
            </button>
            <button
              className="icon-button danger"
              aria-label="Clear build marks"
              title="Clear marks"
              onClick={() => command({ type: "build.clear" })}
              type="button"
            >
              <Eraser aria-hidden="true" />
            </button>
          </div>
          <aside className="build-style-panel" aria-label="Build tool settings">
            <div className="build-color-row">
              {BUILD_COLORS.map((color) => (
                <button
                  aria-label={`Use ${color}`}
                  className={buildStyle.color === color ? "selected" : ""}
                  key={color}
                  onClick={() => setBuildStyle({ ...buildStyle, color })}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
              <input
                aria-label="Custom build color"
                type="color"
                value={buildStyle.color}
                onChange={(event) => setBuildStyle({ ...buildStyle, color: event.target.value })}
              />
            </div>
            {tool === "draw" || tool === "wall" ? (
              <label>
                Width
                <input
                  min={2}
                  max={30}
                  type="range"
                  value={buildStyle.drawingWidth}
                  onChange={(event) => setBuildStyle({ ...buildStyle, drawingWidth: Number(event.target.value) })}
                />
              </label>
            ) : null}
            {tool === "effect" ? (
              <>
                <select
                  aria-label="Effect shape"
                  value={buildStyle.effectShape}
                  onChange={(event) =>
                    setBuildStyle({ ...buildStyle, effectShape: event.target.value as SceneEffect["shape"] })
                  }
                >
                  <option value="circle">Circle / sphere</option>
                  <option value="cone">Cone</option>
                  <option value="cube">Cube</option>
                  <option value="line">Line</option>
                </select>
                <input
                  aria-label="Effect label"
                  maxLength={80}
                  placeholder="Effect label"
                  value={buildStyle.effectLabel}
                  onChange={(event) => setBuildStyle({ ...buildStyle, effectLabel: event.target.value })}
                />
                <label>
                  Size (feet)
                  <input
                    min={5}
                    max={200}
                    step={5}
                    type="number"
                    value={buildStyle.effectSizeFeet}
                    onChange={(event) => setBuildStyle({ ...buildStyle, effectSizeFeet: Number(event.target.value) })}
                  />
                </label>
                {buildStyle.effectShape === "line" ? (
                  <label>
                    Line width (feet)
                    <input
                      min={5}
                      max={30}
                      step={5}
                      type="number"
                      value={buildStyle.effectWidthFeet}
                      onChange={(event) =>
                        setBuildStyle({ ...buildStyle, effectWidthFeet: Number(event.target.value) })
                      }
                    />
                  </label>
                ) : null}
                <label>
                  Opacity
                  <input
                    min={0.1}
                    max={0.8}
                    step={0.05}
                    type="range"
                    value={buildStyle.effectOpacity}
                    onChange={(event) => setBuildStyle({ ...buildStyle, effectOpacity: Number(event.target.value) })}
                  />
                </label>
              </>
            ) : null}
            {selectedDrawing ? (
              <div className="selected-build-editor">
                <strong>Selected {selectedDrawing.kind}</strong>
                <input
                  aria-label="Drawing color"
                  type="color"
                  value={selectedDrawing.color}
                  onChange={(event) =>
                    command({
                      type: "drawing.update",
                      drawingId: selectedDrawing.id,
                      patch: { color: event.target.value }
                    })
                  }
                />
                <button
                  className="icon-button danger"
                  aria-label="Delete drawing"
                  title="Delete drawing"
                  onClick={() => {
                    command({ type: "drawing.delete", drawingId: selectedDrawing.id });
                    setSelectedBuildObject(null);
                  }}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ) : null}
            {selectedEffect ? (
              <div className="selected-build-editor effect-editor">
                <strong>Selected effect</strong>
                <input
                  aria-label="Selected effect label"
                  value={selectedEffect.label}
                  onChange={(event) => updateSelectedEffect({ label: event.target.value })}
                />
                <select
                  aria-label="Selected effect shape"
                  value={selectedEffect.shape}
                  onChange={(event) => updateSelectedEffect({ shape: event.target.value as SceneEffect["shape"] })}
                >
                  <option value="circle">Circle</option>
                  <option value="cone">Cone</option>
                  <option value="cube">Cube</option>
                  <option value="line">Line</option>
                </select>
                <input
                  aria-label="Selected effect color"
                  type="color"
                  value={selectedEffect.color}
                  onChange={(event) => updateSelectedEffect({ color: event.target.value })}
                />
                <input
                  aria-label="Selected effect size in feet"
                  min={5}
                  max={200}
                  step={5}
                  type="number"
                  value={selectedEffect.sizeFeet}
                  onChange={(event) => updateSelectedEffect({ sizeFeet: Number(event.target.value) })}
                />
                <button
                  className="icon-button danger"
                  aria-label="Delete effect"
                  title="Delete effect"
                  onClick={() => {
                    command({ type: "effect.delete", effectId: selectedEffect.id });
                    setSelectedBuildObject(null);
                  }}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </aside>
        </>
      ) : null}
      <div className="map-zoom" aria-label="Map zoom controls">
        <button
          className="icon-button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => onZoom(Math.max(0.15, zoom - 0.1))}
          type="button"
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          className="zoom-value"
          aria-label="Fit entire map"
          onClick={fitMap}
          title="Fit entire map"
          type="button"
        >
          <Scan aria-hidden="true" /> {Math.round(zoom * 100)}%
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => onZoom(Math.min(2, zoom + 0.1))}
          type="button"
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function ToolButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}
