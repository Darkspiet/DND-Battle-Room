"use client";
import { PointerEvent } from "react";
import {
  conePath,
  cubeRect,
  feetToPixels,
  linePolygonPoints,
} from "./geometry";
import { RoomMode } from "./model";
import type { BoardInteraction } from "./useBoardInteraction";
import type { CombatControls } from "./useCombat";
import type { ReadyRoomConnection } from "./useRoomConnection";
import type { TokenControls } from "./useTokens";
type Props = {
  connection: Pick<ReadyRoomConnection, "room">;
  board: Pick<
    BoardInteraction,
    | "roomEffects"
    | "buildMode"
    | "buildTool"
    | "startBuildGesture"
    | "continueBuildGesture"
    | "endBuildGesture"
    | "boardRef"
    | "boardWidth"
    | "boardHeight"
    | "draftEffect"
    | "selectedBuildObject"
    | "startBuildObjectDrag"
    | "continueBuildObjectDrag"
    | "endBuildObjectDrag"
    | "draftLine"
    | "setDraggingToken"
    | "draggingToken"
    | "moveToken"
    | "endTokenMove"
  >;
  combat: Pick<
    CombatControls,
    "combat" | "activeEntry" | "activeCombatTokenId"
  >;
  roomMode: RoomMode;
  tokens: Pick<
    TokenControls,
    "canControl" | "selectedTokenId" | "setSelectedTokenId"
  >;
};
export function Battlefield({
  connection,
  board,
  combat: combatControls,
  roomMode,
  tokens,
}: Props) {
  const { room } = connection;
  const {
    roomEffects,
    buildMode,
    buildTool,
    startBuildGesture,
    continueBuildGesture,
    endBuildGesture,
    boardRef,
    boardWidth,
    boardHeight,
    draftEffect,
    selectedBuildObject,
    startBuildObjectDrag,
    continueBuildObjectDrag,
    endBuildObjectDrag,
    draftLine,
    setDraggingToken,
    draggingToken,
    moveToken,
    endTokenMove,
  } = board;
  const { combat, activeEntry, activeCombatTokenId } = combatControls;
  const { canControl, selectedTokenId, setSelectedTokenId } = tokens;
  return (
    <section className="map-wrap" aria-label="Battle map">
      <div className="map-toolbar">
        <span>
          {room.grid.columns} x {room.grid.rows}
        </span>
        <span>{room.tokens.length} tokens</span>
        <span>{roomEffects.length} effects</span>
        <span>
          {combat?.active && activeEntry
            ? `Round ${combat.round}: ${activeEntry.name}`
            : buildMode
              ? `Build: ${buildTool === "wall" ? "Walls" : buildTool}`
              : `${roomMode[0].toUpperCase()}${roomMode.slice(1)} mode`}
        </span>
      </div>
      <div
        className={buildMode ? "board build-active" : "board"}
        onPointerDown={startBuildGesture}
        onPointerMove={continueBuildGesture}
        onPointerUp={endBuildGesture}
        ref={boardRef}
        style={{
          width: boardWidth,
          height: boardHeight,
          backgroundColor: room.grid.background,
        }}
      >
        {room.grid.backgroundImage ? (
          <img
            alt=""
            className="map-background-image"
            draggable={false}
            src={room.grid.backgroundImage.imageUrl}
            style={{
              left: room.grid.backgroundImage.positionX,
              opacity: room.grid.backgroundImage.opacity / 100,
              top: room.grid.backgroundImage.positionY,
              width: boardWidth * (room.grid.backgroundImage.scale / 100),
            }}
          />
        ) : null}
        <div
          className="grid-layer"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(20, 20, 20, .18) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 20, 20, .18) 1px, transparent 1px)`,
            backgroundSize: `${room.grid.cellSize}px ${room.grid.cellSize}px`,
          }}
        />
        <svg className="drawing-layer" height={boardHeight} width={boardWidth}>
          {[...roomEffects, ...(draftEffect ? [draftEffect] : [])].map(
            (effect) => {
              const fill = effect.color;
              const stroke = effect.color;
              const opacity = effect.opacity / 100;
              const isSelected =
                selectedBuildObject?.type === "effect" &&
                selectedBuildObject.id === effect.id;
              const effectClassName = isSelected
                ? "effect-template build-object selected"
                : "effect-template build-object";
              const effectHandlers = {
                onPointerDown: (event: PointerEvent<SVGElement>) =>
                  startBuildObjectDrag(event, {
                    type: "effect",
                    id: effect.id,
                  }),
                onPointerMove: continueBuildObjectDrag,
                onPointerUp: endBuildObjectDrag,
              };
              if (effect.shape === "circle") {
                return (
                  <g
                    className={effectClassName}
                    key={effect.id}
                    {...effectHandlers}
                  >
                    <circle
                      cx={effect.origin.x}
                      cy={effect.origin.y}
                      fill={fill}
                      fillOpacity={opacity}
                      r={feetToPixels(effect.sizeFeet, room)}
                      stroke={stroke}
                      strokeOpacity={Math.min(1, opacity + 0.35)}
                      strokeWidth="3"
                    />
                    {effect.label ? (
                      <text
                        className="effect-label"
                        x={effect.origin.x}
                        y={effect.origin.y}
                      >
                        {effect.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              if (effect.shape === "cone") {
                return (
                  <g
                    className={effectClassName}
                    key={effect.id}
                    {...effectHandlers}
                  >
                    <path
                      d={conePath(effect, room)}
                      fill={fill}
                      fillOpacity={opacity}
                      stroke={stroke}
                      strokeOpacity={Math.min(1, opacity + 0.35)}
                      strokeWidth="3"
                    />
                    {effect.label ? (
                      <text
                        className="effect-label"
                        x={effect.origin.x + 8}
                        y={effect.origin.y - 8}
                      >
                        {effect.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              if (effect.shape === "cube") {
                const rect = cubeRect(effect, room);
                return (
                  <g
                    className={effectClassName}
                    key={effect.id}
                    {...effectHandlers}
                  >
                    <rect
                      fill={fill}
                      fillOpacity={opacity}
                      height={rect.size}
                      stroke={stroke}
                      strokeOpacity={Math.min(1, opacity + 0.35)}
                      strokeWidth="3"
                      width={rect.size}
                      x={rect.x}
                      y={rect.y}
                    />
                    {effect.label ? (
                      <text
                        className="effect-label"
                        x={rect.x + 8}
                        y={rect.y + 20}
                      >
                        {effect.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              return (
                <g
                  className={effectClassName}
                  key={effect.id}
                  {...effectHandlers}
                >
                  <polygon
                    fill={fill}
                    fillOpacity={opacity}
                    points={linePolygonPoints(effect, room)}
                    stroke={stroke}
                    strokeOpacity={Math.min(1, opacity + 0.35)}
                    strokeWidth="3"
                  />
                  {effect.label ? (
                    <text
                      className="effect-label"
                      x={effect.origin.x + 8}
                      y={effect.origin.y - 8}
                    >
                      {effect.label}
                    </text>
                  ) : null}
                </g>
              );
            },
          )}
          {[...room.drawings, ...(draftLine ? [draftLine] : [])].map((line) => (
            <polyline
              className={
                line.kind === "wall"
                  ? selectedBuildObject?.type === "wall" &&
                    selectedBuildObject.id === line.id
                    ? "build-object wall-object selected"
                    : "build-object wall-object"
                  : undefined
              }
              fill="none"
              key={line.id}
              onPointerDown={
                line.kind === "wall"
                  ? (event) =>
                      startBuildObjectDrag(event, { type: "wall", id: line.id })
                  : undefined
              }
              onPointerMove={
                line.kind === "wall" ? continueBuildObjectDrag : undefined
              }
              onPointerUp={
                line.kind === "wall" ? endBuildObjectDrag : undefined
              }
              points={line.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              stroke={line.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={line.kind === "wall" ? "8" : "5"}
            />
          ))}
        </svg>

        {room.tokens.map((token) => (
          <div
            className={[
              "token",
              canControl(token) ? "controllable" : "",
              selectedTokenId === token.id ? "selected" : "",
              activeCombatTokenId === token.id ? "active-turn" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={token.id}
            onPointerDown={(event) => {
              if (buildMode) return;
              setSelectedTokenId(token.id);
              setDraggingToken(token.id);
              event.currentTarget.setPointerCapture(event.pointerId);
              event.stopPropagation();
            }}
            onPointerMove={(event) => {
              if (draggingToken === token.id) moveToken(event, token);
            }}
            onPointerUp={(event) => endTokenMove(event, token)}
            onPointerCancel={(event) => endTokenMove(event, token)}
            style={{
              borderColor: token.color,
              height: token.size * room.grid.cellSize - 8,
              left: token.x * room.grid.cellSize + 4,
              top: token.y * room.grid.cellSize + 4,
              width: token.size * room.grid.cellSize - 8,
            }}
            title={`${token.name} (${token.ownerName})`}
          >
            {token.imageUrl ? (
              <img
                className="token-image"
                alt={token.name}
                draggable={false}
                src={token.imageUrl}
              />
            ) : (
              <span>{token.icon}</span>
            )}
            {activeCombatTokenId === token.id ? (
              <strong className="turn-label">{token.name}'s turn</strong>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
