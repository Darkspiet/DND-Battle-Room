"use client";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { createEntityId } from "../../lib/storage";
import type {
  AreaEffectShape,
  AreaEffectTemplate,
  BattleMapBackground,
  DrawingLine,
  RoomState,
  Token,
} from "../../lib/types";
import { pointDistance } from "./geometry";
import {
  BUILD_COLORS,
  BuildObjectDrag,
  BuildTool,
  BuildUndo,
  SelectedBuildObject,
  TokenMovePayload,
} from "./model";
import type { RoomConnection } from "./useRoomConnection";
import type { TokenControls } from "./useTokens";
type Options = {
  connection: Pick<
    RoomConnection,
    | "room"
    | "isDm"
    | "sendCommands"
    | "updateRoom"
    | "syncMode"
    | "applyLocalTokenMove"
    | "profile"
    | "getRoom"
    | "isReady"
    | "registerPreviewCleanup"
    | "sendPreview"
  >;
  tokens: Pick<
    TokenControls,
    "setSelectedTokenId" | "canControl" | "updateToken"
  >;
};
// Board gestures and undo submit changes through the shared connection; previews stay transient.
export function useBoardInteraction({ connection, tokens }: Options) {
  const {
    room,
    isDm,
    sendCommands,
    updateRoom,
    syncMode,
    applyLocalTokenMove,
    profile,
    getRoom,
    isReady,
    registerPreviewCleanup,
    sendPreview,
  } = connection;
  const { setSelectedTokenId, canControl, updateToken } = tokens;
  const [draggingToken, setDraggingToken] = useState<string | null>(null);
  const [selectedBuildObject, setSelectedBuildObject] =
    useState<SelectedBuildObject>(null);
  const [draggingBuildObject, setDraggingBuildObject] =
    useState<BuildObjectDrag | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool>("draw");
  const [buildColor, setBuildColor] = useState(BUILD_COLORS[1]);
  const [buildUndoCount, setBuildUndoCount] = useState(0);
  const [draftLine, setDraftLine] = useState<DrawingLine | null>(null);
  const [draftEffect, setDraftEffect] = useState<AreaEffectTemplate | null>(
    null,
  );
  const [effectShape, setEffectShape] = useState<AreaEffectShape>("circle");
  const [effectSizeFeet, setEffectSizeFeet] = useState(20);
  const [effectWidthFeet, setEffectWidthFeet] = useState(5);
  const [effectOpacity, setEffectOpacity] = useState(35);
  const [effectLabel, setEffectLabel] = useState("");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const buildUndoRef = useRef<BuildUndo[]>([]);
  const tokenMoveSeqRef = useRef(0);
  const tokenSequenceRef = useRef<Record<string, number>>({});
  const tokenPreviewThrottleRef = useRef<{
    lastSentAt: number;
    timer: number | null;
    pending: TokenMovePayload | null;
  }>({
    lastSentAt: 0,
    timer: null,
    pending: null,
  });
  const boardWidth = room ? room.grid.columns * room.grid.cellSize : 0;
  const boardHeight = room ? room.grid.rows * room.grid.cellSize : 0;
  const roomEffects = room?.effects ?? [];
  const selectedWall =
    selectedBuildObject?.type === "wall"
      ? (room?.drawings.find(
          (line) => line.id === selectedBuildObject.id && line.kind === "wall",
        ) ?? null)
      : null;
  const selectedEffect =
    selectedBuildObject?.type === "effect"
      ? (roomEffects.find((effect) => effect.id === selectedBuildObject.id) ??
        null)
      : null;
  useEffect(() => {
    if (!buildMode || !isDm) return;
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoBuildAction();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [buildMode, isDm]);
  function updateBuildRoom(
    updater: (current: RoomState) => RoomState,
    createUndo: (current: RoomState, next: RoomState) => BuildUndo,
  ) {
    const current = getRoom();
    if (!current || !isReady()) return;
    const next = updater(current);
    pushBuildUndo(createUndo(current, next));
    updateRoom(() => next);
  }
  function pushBuildUndo(undo: BuildUndo) {
    buildUndoRef.current = [...buildUndoRef.current.slice(-39), undo];
    setBuildUndoCount(buildUndoRef.current.length);
  }
  function undoBuildAction() {
    const undo = buildUndoRef.current.at(-1);
    if (!undo) return;
    buildUndoRef.current = buildUndoRef.current.slice(0, -1);
    setBuildUndoCount(buildUndoRef.current.length);
    updateRoom(undo);
  }
  function setBattleMapBackground(
    backgroundImage: BattleMapBackground | undefined,
  ) {
    updateBuildRoom(
      (current) => ({ ...current, grid: { ...current.grid, backgroundImage } }),
      (current) => {
        const previous = current.grid.backgroundImage;
        return (nextRoom) => ({
          ...nextRoom,
          grid: { ...nextRoom.grid, backgroundImage: previous },
        });
      },
    );
  }
  function updateBattleMapBackground(patch: Partial<BattleMapBackground>) {
    updateBuildRoom(
      (current) => {
        if (!current.grid.backgroundImage) return current;
        return {
          ...current,
          grid: {
            ...current.grid,
            backgroundImage: { ...current.grid.backgroundImage, ...patch },
          },
        };
      },
      (current) => {
        const previous = current.grid.backgroundImage;
        return (nextRoom) => ({
          ...nextRoom,
          grid: { ...nextRoom.grid, backgroundImage: previous },
        });
      },
    );
  }
  function updateWall(wallId: string, patch: Partial<DrawingLine>) {
    updateBuildRoom(
      (current) => ({
        ...current,
        drawings: current.drawings.map((line) =>
          line.id === wallId && line.kind === "wall"
            ? { ...line, ...patch }
            : line,
        ),
      }),
      (current) => {
        const previous = current.drawings.find((line) => line.id === wallId);
        return (nextRoom) => ({
          ...nextRoom,
          drawings: nextRoom.drawings.map((line) =>
            line.id === wallId && previous ? previous : line,
          ),
        });
      },
    );
  }
  function deleteWall(wallId: string) {
    updateBuildRoom(
      (current) => ({
        ...current,
        drawings: current.drawings.filter((line) => line.id !== wallId),
      }),
      (current) => {
        const previous = current.drawings.find((line) => line.id === wallId);
        return (nextRoom) => ({
          ...nextRoom,
          drawings: previous
            ? [...nextRoom.drawings, previous]
            : nextRoom.drawings,
        });
      },
    );
    setSelectedBuildObject(null);
  }
  function updateEffect(effectId: string, patch: Partial<AreaEffectTemplate>) {
    updateBuildRoom(
      (current) => ({
        ...current,
        effects: (current.effects ?? []).map((effect) =>
          effect.id === effectId ? { ...effect, ...patch } : effect,
        ),
      }),
      (current) => {
        const previous = (current.effects ?? []).find(
          (effect) => effect.id === effectId,
        );
        return (nextRoom) => ({
          ...nextRoom,
          effects: (nextRoom.effects ?? []).map((effect) =>
            effect.id === effectId && previous ? previous : effect,
          ),
        });
      },
    );
  }
  function deleteEffect(effectId: string) {
    updateBuildRoom(
      (current) => ({
        ...current,
        effects: (current.effects ?? []).filter(
          (effect) => effect.id !== effectId,
        ),
      }),
      (current) => {
        const previous = (current.effects ?? []).find(
          (effect) => effect.id === effectId,
        );
        return (nextRoom) => ({
          ...nextRoom,
          effects: previous
            ? [...(nextRoom.effects ?? []), previous]
            : (nextRoom.effects ?? []),
        });
      },
    );
    setSelectedBuildObject(null);
  }
  function startBuildObjectDrag(
    event: PointerEvent<SVGElement>,
    object: SelectedBuildObject,
  ) {
    if (!isDm || !room || !object) return;
    const start = getBoardPointFromClient(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    setSelectedTokenId(null);
    setSelectedBuildObject(object);
    if (object.type === "wall") {
      const wall = room.drawings.find(
        (line) => line.id === object.id && line.kind === "wall",
      );
      if (wall) {
        setDraggingBuildObject({
          type: "wall",
          id: wall.id,
          start,
          points: wall.points,
          moved: false,
        });
      }
      return;
    }
    const effect = (room.effects ?? []).find((item) => item.id === object.id);
    if (effect) {
      setDraggingBuildObject({
        type: "effect",
        id: effect.id,
        start,
        origin: effect.origin,
        target: effect.target,
        moved: false,
      });
    }
  }
  function continueBuildObjectDrag(event: PointerEvent<SVGElement>) {
    if (!draggingBuildObject) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const delta = {
      x: point.x - draggingBuildObject.start.x,
      y: point.y - draggingBuildObject.start.y,
    };
    if (draggingBuildObject.type === "wall") {
      const nextPoints = draggingBuildObject.points.map((item) => ({
        x: Math.max(0, Math.min(boardWidth, item.x + delta.x)),
        y: Math.max(0, Math.min(boardHeight, item.y + delta.y)),
      }));
      updateRoom((current) => ({
        ...current,
        drawings: current.drawings.map((line) =>
          line.id === draggingBuildObject.id
            ? { ...line, points: nextPoints }
            : line,
        ),
      }));
    } else {
      const origin = {
        x: Math.max(
          0,
          Math.min(boardWidth, draggingBuildObject.origin.x + delta.x),
        ),
        y: Math.max(
          0,
          Math.min(boardHeight, draggingBuildObject.origin.y + delta.y),
        ),
      };
      const target = {
        x: Math.max(
          0,
          Math.min(boardWidth, draggingBuildObject.target.x + delta.x),
        ),
        y: Math.max(
          0,
          Math.min(boardHeight, draggingBuildObject.target.y + delta.y),
        ),
      };
      updateRoom((current) => ({
        ...current,
        effects: (current.effects ?? []).map((effect) =>
          effect.id === draggingBuildObject.id
            ? { ...effect, origin, target }
            : effect,
        ),
      }));
    }
    setDraggingBuildObject((current) =>
      current ? { ...current, moved: true } : current,
    );
  }
  function endBuildObjectDrag(event: PointerEvent<SVGElement>) {
    if (!draggingBuildObject) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const moved =
      draggingBuildObject.moved ||
      pointDistance(draggingBuildObject.start, point) > 1;
    if (moved) {
      if (draggingBuildObject.type === "wall") {
        const originalPoints = draggingBuildObject.points;
        const wallId = draggingBuildObject.id;
        pushBuildUndo((current) => ({
          ...current,
          drawings: current.drawings.map((line) =>
            line.id === wallId ? { ...line, points: originalPoints } : line,
          ),
        }));
      } else {
        const { id, origin, target } = draggingBuildObject;
        pushBuildUndo((current) => ({
          ...current,
          effects: (current.effects ?? []).map((effect) =>
            effect.id === id ? { ...effect, origin, target } : effect,
          ),
        }));
      }
    }
    setDraggingBuildObject(null);
  }
  function moveToken(event: PointerEvent<HTMLDivElement>, token: Token) {
    if (!room) return;
    if (!canControl(token)) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const x = Math.max(
      0,
      Math.min(
        room.grid.columns - token.size,
        Math.floor(point.x / room.grid.cellSize),
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        room.grid.rows - token.size,
        Math.floor(point.y / room.grid.cellSize),
      ),
    );
    if (syncMode !== "websocket") {
      updateToken(token.id, { x, y });
      return;
    }
    if (token.x === x && token.y === y) return;
    const payload = {
      tokenId: token.id,
      x,
      y,
      seq: nextTokenMoveSeq(token.id),
    };
    applyLocalTokenMove(payload);
    queueTokenMovePreview(payload);
  }
  function endTokenMove(event: PointerEvent<HTMLDivElement>, token: Token) {
    if (draggingToken !== token.id) return;
    if (syncMode === "websocket" && room && canControl(token)) {
      const point = getBoardPointFromClient(event.clientX, event.clientY);
      const payload = {
        tokenId: token.id,
        x: Math.max(
          0,
          Math.min(
            room.grid.columns - token.size,
            Math.floor(point.x / room.grid.cellSize),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            room.grid.rows - token.size,
            Math.floor(point.y / room.grid.cellSize),
          ),
        ),
        seq: nextTokenMoveSeq(token.id),
      };
      applyLocalTokenMove(payload);
      flushTokenMovePreview();
      sendTokenMove("token_move_commit", payload);
    }
    setDraggingToken(null);
  }
  function nextTokenMoveSeq(tokenId: string) {
    tokenMoveSeqRef.current = Math.max(tokenMoveSeqRef.current + 1, Date.now());
    tokenSequenceRef.current = {
      ...tokenSequenceRef.current,
      [tokenId]: tokenMoveSeqRef.current,
    };
    return tokenMoveSeqRef.current;
  }
  function sendTokenMove(
    type: "token_move_preview" | "token_move_commit",
    payload: TokenMovePayload,
  ) {
    if (!isReady()) return;
    if (type === "token_move_commit")
      sendCommands([
        {
          type: "token.update",
          payload: {
            id: payload.tokenId,
            patch: { x: payload.x, y: payload.y },
          },
        },
      ]);
    else sendPreview(payload);
  }
  function queueTokenMovePreview(payload: TokenMovePayload) {
    const throttle = tokenPreviewThrottleRef.current;
    const now = Date.now();
    const elapsed = now - throttle.lastSentAt;
    if (elapsed >= 50) {
      throttle.lastSentAt = now;
      sendTokenMove("token_move_preview", payload);
      return;
    }
    throttle.pending = payload;
    if (throttle.timer) return;
    throttle.timer = window.setTimeout(() => {
      const pending = tokenPreviewThrottleRef.current.pending;
      tokenPreviewThrottleRef.current.pending = null;
      tokenPreviewThrottleRef.current.timer = null;
      tokenPreviewThrottleRef.current.lastSentAt = Date.now();
      if (pending) sendTokenMove("token_move_preview", pending);
    }, 50 - elapsed);
  }
  function flushTokenMovePreview() {
    const throttle = tokenPreviewThrottleRef.current;
    if (throttle.timer) {
      window.clearTimeout(throttle.timer);
    }
    throttle.timer = null;
    throttle.pending = null;
  }
  function startBuildGesture(event: PointerEvent<HTMLDivElement>) {
    if (!profile || !room || !isReady()) return;
    setSelectedBuildObject(null);
    if (!buildMode || !isDm || buildTool === "background") return;
    const point = getBoardPoint(event);
    const startPoint =
      buildTool === "wall" || buildTool === "effects"
        ? snapBoardPoint(point)
        : point;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (buildTool === "effects") {
      setDraftEffect({
        id: createEntityId("effect"),
        shape: effectShape,
        ownerId: profile.id,
        color: buildColor,
        opacity: effectOpacity,
        label: effectLabel.trim() || undefined,
        origin: startPoint,
        target: startPoint,
        sizeFeet: effectSizeFeet,
        widthFeet: effectShape === "line" ? effectWidthFeet : undefined,
        createdAt: Date.now(),
      });
      return;
    }
    setDraftLine({
      id: createEntityId(buildTool === "wall" ? "wall" : "line"),
      kind: buildTool === "wall" ? "wall" : "freehand",
      ownerId: profile.id,
      color: buildColor,
      points: buildTool === "wall" ? [startPoint, startPoint] : [startPoint],
    });
  }
  function continueBuildGesture(event: PointerEvent<HTMLDivElement>) {
    if (draftEffect) {
      const point = snapBoardPoint(getBoardPoint(event));
      setDraftEffect((effect) =>
        effect ? { ...effect, target: point } : effect,
      );
      return;
    }
    if (!draftLine) return;
    const point = getBoardPoint(event);
    setDraftLine((line) => {
      if (!line) return line;
      if (line.kind === "wall") {
        return { ...line, points: [line.points[0], snapBoardPoint(point)] };
      }
      return { ...line, points: [...line.points, point] };
    });
  }
  function endBuildGesture() {
    if (draftEffect) {
      const effect = draftEffect;
      setDraftEffect(null);
      updateBuildRoom(
        (current) => ({
          ...current,
          effects: [...(current.effects ?? []), effect],
        }),
        () => (current) => ({
          ...current,
          effects: (current.effects ?? []).filter(
            (item) => item.id !== effect.id,
          ),
        }),
      );
      return;
    }
    if (!draftLine) return;
    const line = draftLine;
    setDraftLine(null);
    if (
      line.points.length > 1 &&
      !isSamePoint(line.points[0], line.points[line.points.length - 1])
    ) {
      updateBuildRoom(
        (current) => ({ ...current, drawings: [...current.drawings, line] }),
        () => (current) => ({
          ...current,
          drawings: current.drawings.filter((item) => item.id !== line.id),
        }),
      );
    }
  }
  function getBoardPoint(event: PointerEvent<HTMLDivElement>) {
    return getBoardPointFromClient(event.clientX, event.clientY);
  }
  function getBoardPointFromClient(clientX: number, clientY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(boardWidth, clientX - rect.left)),
      y: Math.max(0, Math.min(boardHeight, clientY - rect.top)),
    };
  }
  function snapBoardPoint(point: { x: number; y: number }) {
    if (!room) return point;
    return {
      x: Math.max(
        0,
        Math.min(
          boardWidth,
          Math.round(point.x / room.grid.cellSize) * room.grid.cellSize,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          boardHeight,
          Math.round(point.y / room.grid.cellSize) * room.grid.cellSize,
        ),
      ),
    };
  }
  function isSamePoint(
    first: {
      x: number;
      y: number;
    },
    second: {
      x: number;
      y: number;
    },
  ) {
    return first.x === second.x && first.y === second.y;
  }
  useEffect(() => {
    const clearPreview = () => {
      const preview = tokenPreviewThrottleRef.current;
      if (preview.timer !== null) window.clearTimeout(preview.timer);
      preview.pending = null;
      preview.timer = null;
    };
    const unregister = registerPreviewCleanup(clearPreview);
    return () => {
      unregister();
      clearPreview();
    };
  }, [registerPreviewCleanup]);
  return {
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
    selectedWall,
    updateWall,
    deleteWall,
    selectedEffect,
    updateEffect,
    deleteEffect,
  };
}
export type BoardInteraction = ReturnType<typeof useBoardInteraction>;
