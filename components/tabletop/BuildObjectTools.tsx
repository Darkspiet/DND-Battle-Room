"use client";
import type { AreaEffectShape } from "../../lib/types";
import { EFFECT_SHAPES } from "./model";
import type { BoardInteraction } from "./useBoardInteraction";
type Props = {
  board: Pick<
    BoardInteraction,
    | "selectedWall"
    | "updateWall"
    | "deleteWall"
    | "selectedEffect"
    | "updateEffect"
    | "deleteEffect"
  >;
};
export function BuildObjectTools({ board }: Props) {
  const {
    selectedWall,
    updateWall,
    deleteWall,
    selectedEffect,
    updateEffect,
    deleteEffect,
  } = board;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Selected Object</h2>
        <span>{selectedWall ? "Wall" : "Effect"}</span>
      </div>
      {selectedWall ? (
        <>
          <label>
            Wall color
            <input
              type="color"
              value={selectedWall.color}
              onChange={(event) =>
                updateWall(selectedWall.id, { color: event.target.value })
              }
            />
          </label>
          <button
            className="secondary-action compact danger"
            onClick={() => deleteWall(selectedWall.id)}
            type="button"
          >
            Delete wall
          </button>
        </>
      ) : null}
      {selectedEffect ? (
        <>
          <label>
            Effect shape
            <select
              value={selectedEffect.shape}
              onChange={(event) =>
                updateEffect(selectedEffect.id, {
                  shape: event.target.value as AreaEffectShape,
                })
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
              value={selectedEffect.label ?? ""}
              onChange={(event) =>
                updateEffect(selectedEffect.id, {
                  label: event.target.value || undefined,
                })
              }
            />
          </label>
          <label>
            Color
            <input
              type="color"
              value={selectedEffect.color}
              onChange={(event) =>
                updateEffect(selectedEffect.id, { color: event.target.value })
              }
            />
          </label>
          <label>
            Size in feet
            <input
              min={5}
              max={200}
              step={5}
              type="number"
              value={selectedEffect.sizeFeet}
              onChange={(event) =>
                updateEffect(selectedEffect.id, {
                  sizeFeet: Number(event.target.value),
                })
              }
            />
          </label>
          {selectedEffect.shape === "line" ? (
            <label>
              Line width in feet
              <input
                min={5}
                max={30}
                step={5}
                type="number"
                value={selectedEffect.widthFeet ?? 5}
                onChange={(event) =>
                  updateEffect(selectedEffect.id, {
                    widthFeet: Number(event.target.value),
                  })
                }
              />
            </label>
          ) : null}
          <label>
            Opacity
            <input
              min={10}
              max={80}
              type="range"
              value={selectedEffect.opacity}
              onChange={(event) =>
                updateEffect(selectedEffect.id, {
                  opacity: Number(event.target.value),
                })
              }
            />
          </label>
          <button
            className="secondary-action compact danger"
            onClick={() => deleteEffect(selectedEffect.id)}
            type="button"
          >
            Delete effect
          </button>
        </>
      ) : null}
    </section>
  );
}
