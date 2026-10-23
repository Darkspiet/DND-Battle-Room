"use client";
import type * as React from "react";
import { useState } from "react";
import { prepareBattleMapImage } from "../../lib/tokenImages";
import type { AreaEffectShape } from "../../lib/types";
import {
  BUILD_COLORS,
  BuildTool,
  DEFAULT_BACKGROUND_IMAGE_SETTINGS,
  EFFECT_SHAPES,
  QUICK_EFFECT_SIZES,
  RoomMode,
} from "./model";
import type { BoardInteraction } from "./useBoardInteraction";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  visible: boolean;
  board: Pick<
    BoardInteraction,
    | "buildMode"
    | "buildTool"
    | "setBuildMode"
    | "buildUndoCount"
    | "undoBuildAction"
    | "setBuildTool"
    | "buildColor"
    | "setBuildColor"
    | "effectShape"
    | "setEffectShape"
    | "effectLabel"
    | "setEffectLabel"
    | "effectSizeFeet"
    | "setEffectSizeFeet"
    | "effectWidthFeet"
    | "setEffectWidthFeet"
    | "effectOpacity"
    | "setEffectOpacity"
    | "updateBattleMapBackground"
    | "setBattleMapBackground"
    | "updateBuildRoom"
    | "roomEffects"
  >;
  setRoomMode: React.Dispatch<React.SetStateAction<RoomMode>>;
  connection: Pick<ReadyRoomConnection, "room" | "updateRoom" | "isDm">;
};
export function BuildTools({ visible, board, setRoomMode, connection }: Props) {
  const {
    buildMode,
    buildTool,
    setBuildMode,
    buildUndoCount,
    undoBuildAction,
    setBuildTool,
    buildColor,
    setBuildColor,
    effectShape,
    setEffectShape,
    effectLabel,
    setEffectLabel,
    effectSizeFeet,
    setEffectSizeFeet,
    effectWidthFeet,
    setEffectWidthFeet,
    effectOpacity,
    setEffectOpacity,
    updateBattleMapBackground,
    setBattleMapBackground,
    updateBuildRoom,
    roomEffects,
  } = board;
  const { room, updateRoom, isDm } = connection;
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundError, setBackgroundError] = useState("");
  async function handleBackgroundImage(file: File | null) {
    if (!file || !isDm) return;
    try {
      const image = await prepareBattleMapImage(file);
      setBackgroundError("");
      setBackgroundUrl("");
      setBattleMapBackground({
        source: "upload",
        imageUrl: image.imageUrl,
        imageName: image.imageName,
        ...DEFAULT_BACKGROUND_IMAGE_SETTINGS,
      });
    } catch (error) {
      setBackgroundError(
        error instanceof Error
          ? error.message
          : "Could not use that background.",
      );
    }
  }
  function applyBackgroundUrl() {
    const imageUrl = backgroundUrl.trim();
    if (!imageUrl) return;
    setBackgroundError("");
    setBattleMapBackground({
      source: "url",
      imageUrl,
      imageName: "Linked battlefield",
      ...DEFAULT_BACKGROUND_IMAGE_SETTINGS,
    });
  }
  if (!visible) return null;
  return (
    <section className="build-ribbon" aria-label="DM build ribbon">
      <div className="ribbon-title">
        <h2>Build Mode</h2>
        <span>{buildMode ? buildTool : "Off"}</span>
      </div>
      <div className="ribbon-section">
        <span className="ribbon-label">Mode</span>
        <button
          className={
            buildMode ? "primary-action compact" : "secondary-action compact"
          }
          onClick={() => {
            if (buildMode) {
              setBuildMode(false);
              setRoomMode("play");
              return;
            }
            setBuildMode(true);
          }}
          type="button"
        >
          {buildMode ? "Exit Build" : "Enter Build"}
        </button>
        <button
          className="secondary-action compact"
          disabled={!buildUndoCount}
          onClick={undoBuildAction}
          type="button"
        >
          Undo
        </button>
      </div>

      <div className="ribbon-section">
        <span className="ribbon-label">Tools</span>
        <div className="build-tool-tabs" aria-label="Build tools">
          {(["draw", "wall", "effects", "background"] as BuildTool[]).map(
            (tool) => (
              <button
                className={buildTool === tool ? "selected" : ""}
                key={tool}
                onClick={() => {
                  setBuildTool(tool);
                  setBuildMode(true);
                }}
                type="button"
              >
                {tool === "draw"
                  ? "Draw"
                  : tool === "wall"
                    ? "Walls"
                    : tool === "effects"
                      ? "Effects"
                      : "Background"}
              </button>
            ),
          )}
        </div>
      </div>

      {buildTool === "draw" ||
      buildTool === "wall" ||
      buildTool === "effects" ? (
        <div className="ribbon-section">
          <span className="ribbon-label">Style</span>
          <div
            className="color-picker build-colors"
            aria-label="Choose build color"
          >
            {BUILD_COLORS.map((candidate) => (
              <button
                aria-label={`Use ${candidate}`}
                className={candidate === buildColor ? "selected" : ""}
                key={candidate}
                onClick={() => setBuildColor(candidate)}
                style={{ background: candidate }}
                type="button"
              />
            ))}
          </div>
          <label>
            Custom color
            <input
              type="color"
              value={buildColor}
              onChange={(event) => setBuildColor(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {buildTool === "effects" ? (
        <div className="ribbon-section wide">
          <span className="ribbon-label">Effects</span>
          <label>
            Effect shape
            <select
              value={effectShape}
              onChange={(event) =>
                setEffectShape(event.target.value as AreaEffectShape)
              }
            >
              {EFFECT_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {shape === "circle" ? "Circle / sphere" : shape}
                </option>
              ))}
            </select>
          </label>
          <label>
            Label
            <input
              placeholder="Fireball, Web, aura"
              value={effectLabel}
              onChange={(event) => setEffectLabel(event.target.value)}
            />
          </label>
          <div className="quick-effect-sizes">
            {QUICK_EFFECT_SIZES.map((size) => (
              <button
                className={size === effectSizeFeet ? "selected" : ""}
                key={size}
                onClick={() => setEffectSizeFeet(size)}
                type="button"
              >
                {size} ft
              </button>
            ))}
          </div>
          <label>
            Size in feet
            <input
              min={5}
              max={200}
              step={5}
              type="number"
              value={effectSizeFeet}
              onChange={(event) =>
                setEffectSizeFeet(Number(event.target.value))
              }
            />
          </label>
          {effectShape === "line" ? (
            <label>
              Line width in feet
              <input
                min={5}
                max={30}
                step={5}
                type="number"
                value={effectWidthFeet}
                onChange={(event) =>
                  setEffectWidthFeet(Number(event.target.value))
                }
              />
            </label>
          ) : null}
          <label>
            Effect opacity
            <input
              min={10}
              max={80}
              type="range"
              value={effectOpacity}
              onChange={(event) => setEffectOpacity(Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}

      {buildTool === "background" ? (
        <div className="ribbon-section wide">
          <span className="ribbon-label">Background</span>
          <label>
            Upload battlefield
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) =>
                handleBackgroundImage(event.target.files?.[0] ?? null)
              }
              type="file"
            />
          </label>
          <label>
            Battlefield image URL
            <input
              value={backgroundUrl}
              onChange={(event) => setBackgroundUrl(event.target.value)}
            />
          </label>
          <button
            className="secondary-action compact"
            disabled={!backgroundUrl.trim()}
            onClick={applyBackgroundUrl}
            type="button"
          >
            Use image URL
          </button>
          {room.grid.backgroundImage ? (
            <>
              <label>
                X
                <input
                  type="number"
                  value={room.grid.backgroundImage.positionX}
                  onChange={(event) =>
                    updateBattleMapBackground({
                      positionX: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={room.grid.backgroundImage.positionY}
                  onChange={(event) =>
                    updateBattleMapBackground({
                      positionY: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Scale
                <input
                  min={20}
                  max={300}
                  type="range"
                  value={room.grid.backgroundImage.scale}
                  onChange={(event) =>
                    updateBattleMapBackground({
                      scale: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Opacity
                <input
                  min={10}
                  max={100}
                  type="range"
                  value={room.grid.backgroundImage.opacity}
                  onChange={(event) =>
                    updateBattleMapBackground({
                      opacity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <button
                className="secondary-action compact"
                onClick={() =>
                  updateBattleMapBackground({
                    ...DEFAULT_BACKGROUND_IMAGE_SETTINGS,
                  })
                }
                type="button"
              >
                Reset
              </button>
              <button
                className="secondary-action compact danger"
                onClick={() => setBattleMapBackground(undefined)}
                type="button"
              >
                Remove
              </button>
            </>
          ) : null}
          {backgroundError ? (
            <p className="error-text">{backgroundError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="ribbon-section">
        <span className="ribbon-label">Map</span>
        <label>
          Columns
          <input
            min={8}
            max={60}
            type="number"
            value={room.grid.columns}
            onChange={(event) =>
              updateRoom((current) => ({
                ...current,
                grid: { ...current.grid, columns: Number(event.target.value) },
              }))
            }
          />
        </label>
        <label>
          Rows
          <input
            min={8}
            max={50}
            type="number"
            value={room.grid.rows}
            onChange={(event) =>
              updateRoom((current) => ({
                ...current,
                grid: { ...current.grid, rows: Number(event.target.value) },
              }))
            }
          />
        </label>
        <label>
          Cell size
          <input
            min={28}
            max={72}
            type="number"
            value={room.grid.cellSize}
            onChange={(event) =>
              updateRoom((current) => ({
                ...current,
                grid: { ...current.grid, cellSize: Number(event.target.value) },
              }))
            }
          />
        </label>
        <label>
          Background color
          <input
            type="color"
            value={room.grid.background}
            onChange={(event) =>
              updateBuildRoom(
                (current) => ({
                  ...current,
                  grid: { ...current.grid, background: event.target.value },
                }),
                (current) => {
                  const previous = current.grid.background;
                  return (nextRoom) => ({
                    ...nextRoom,
                    grid: { ...nextRoom.grid, background: previous },
                  });
                },
              )
            }
          />
        </label>
      </div>

      <div className="ribbon-section">
        <span className="ribbon-label">Actions</span>
        <button
          className="secondary-action compact danger"
          disabled={!room.drawings.length && !roomEffects.length}
          onClick={() =>
            updateBuildRoom(
              (current) => ({ ...current, drawings: [], effects: [] }),
              (current) => {
                const previous = current.drawings;
                const previousEffects = current.effects ?? [];
                return (nextRoom) => ({
                  ...nextRoom,
                  drawings: previous,
                  effects: previousEffects,
                });
              },
            )
          }
          type="button"
        >
          Clear marks
        </button>
      </div>
    </section>
  );
}
