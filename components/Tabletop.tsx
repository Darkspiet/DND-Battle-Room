"use client";

import Link from "next/link";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { rollDice } from "../lib/dice";
import { createEntityId, getGuestProfile, loadRoom, saveGuestProfile, saveRoom } from "../lib/storage";
import { hasSupabaseConfig, joinSupabaseRoom, saveSupabaseRoom, subscribeToSupabaseRoom } from "../lib/supabaseRoom";
import { prepareBattleMapImage, prepareTokenImage } from "../lib/tokenImages";
import type {
  AreaEffectShape,
  AreaEffectTemplate,
  BattleMapBackground,
  DiceRoll,
  DrawingLine,
  GuestProfile,
  RoomState,
  Token,
  TokenType
} from "../lib/types";

type Props = {
  roomCode: string;
};

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const TOKEN_TYPES: TokenType[] = ["character", "npc", "monster", "object"];
const BUILD_COLORS = ["#111827", "#b7394b", "#2563eb", "#227447", "#eab308", "#7c3aed", "#f97316", "#ffffff"];
const EFFECT_SHAPES: AreaEffectShape[] = ["circle", "cone", "cube", "line"];
const QUICK_EFFECT_SIZES = [5, 10, 15, 20, 30, 60];
const DEFAULT_BACKGROUND_IMAGE_SETTINGS = {
  positionX: 0,
  positionY: 0,
  scale: 100,
  opacity: 100
};

type BuildTool = "draw" | "wall" | "effects" | "background";
type BuildUndo = (current: RoomState) => RoomState;
type BoardPoint = { x: number; y: number };
type SelectedBuildObject = { type: "wall" | "effect"; id: string } | null;
type BuildObjectDrag =
  | { type: "wall"; id: string; start: BoardPoint; points: BoardPoint[]; moved: boolean }
  | { type: "effect"; id: string; start: BoardPoint; origin: BoardPoint; target: BoardPoint; moved: boolean };
type TokenMovePayload = { tokenId: string; x: number; y: number; seq: number };
type RealtimeMessage =
  | { type: "room_snapshot"; room: RoomState }
  | { type: "token_move_preview" | "token_move_commit"; token: Token; seq: number; profileId: string }
  | { type: "sync_error"; message: string };

function roomApiPath(roomCode: string) {
  return `../../api/rooms/${roomCode}`;
}

function roomWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function pointDistance(first: BoardPoint, second: BoardPoint) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointAngle(first: BoardPoint, second: BoardPoint) {
  if (pointDistance(first, second) < 1) return 0;
  return Math.atan2(second.y - first.y, second.x - first.x);
}

function polarPoint(origin: BoardPoint, angle: number, distance: number) {
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance
  };
}

function feetToPixels(feet: number, room: RoomState) {
  const feetPerCell = room.grid.feetPerCell ?? 5;
  return (feet / feetPerCell) * room.grid.cellSize;
}

function linePolygonPoints(effect: AreaEffectTemplate, room: RoomState) {
  const angle = pointAngle(effect.origin, effect.target);
  const length = feetToPixels(effect.sizeFeet, room);
  const halfWidth = feetToPixels(effect.widthFeet ?? 5, room) / 2;
  const end = polarPoint(effect.origin, angle, length);
  const perpendicular = angle + Math.PI / 2;
  const points = [
    polarPoint(effect.origin, perpendicular, halfWidth),
    polarPoint(end, perpendicular, halfWidth),
    polarPoint(end, perpendicular, -halfWidth),
    polarPoint(effect.origin, perpendicular, -halfWidth)
  ];
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function conePath(effect: AreaEffectTemplate, room: RoomState) {
  const angle = pointAngle(effect.origin, effect.target);
  const radius = feetToPixels(effect.sizeFeet, room);
  const spread = Math.PI / 3;
  const first = polarPoint(effect.origin, angle - spread / 2, radius);
  const second = polarPoint(effect.origin, angle + spread / 2, radius);
  return `M ${effect.origin.x} ${effect.origin.y} L ${first.x} ${first.y} A ${radius} ${radius} 0 0 1 ${second.x} ${second.y} Z`;
}

function cubeRect(effect: AreaEffectTemplate, room: RoomState) {
  const size = feetToPixels(effect.sizeFeet, room);
  const signX = effect.target.x >= effect.origin.x ? 1 : -1;
  const signY = effect.target.y >= effect.origin.y ? 1 : -1;
  return {
    x: signX > 0 ? effect.origin.x : effect.origin.x - size,
    y: signY > 0 ? effect.origin.y : effect.origin.y - size,
    size
  };
}

export function Tabletop({ roomCode }: Props) {
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [diceExpression, setDiceExpression] = useState("d20");
  const [privateRoll, setPrivateRoll] = useState(false);
  const [diceError, setDiceError] = useState("");
  const [draggingToken, setDraggingToken] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedBuildObject, setSelectedBuildObject] = useState<SelectedBuildObject>(null);
  const [draggingBuildObject, setDraggingBuildObject] = useState<BuildObjectDrag | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [buildTool, setBuildTool] = useState<BuildTool>("draw");
  const [buildColor, setBuildColor] = useState(BUILD_COLORS[1]);
  const [buildUndoCount, setBuildUndoCount] = useState(0);
  const [draftLine, setDraftLine] = useState<DrawingLine | null>(null);
  const [draftEffect, setDraftEffect] = useState<AreaEffectTemplate | null>(null);
  const [effectShape, setEffectShape] = useState<AreaEffectShape>("circle");
  const [effectSizeFeet, setEffectSizeFeet] = useState(20);
  const [effectWidthFeet, setEffectWidthFeet] = useState(5);
  const [effectOpacity, setEffectOpacity] = useState(35);
  const [effectLabel, setEffectLabel] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [newToken, setNewToken] = useState({
    name: "Hero",
    icon: "⚔",
    imageName: "",
    imageUrl: "",
    type: "character" as TokenType
  });
  const [imageError, setImageError] = useState("");
  const [backgroundError, setBackgroundError] = useState("");
  const [syncMode, setSyncMode] = useState<"connecting" | "supabase" | "websocket" | "server" | "local">("connecting");
  const [syncError, setSyncError] = useState("");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const buildUndoRef = useRef<BuildUndo[]>([]);
  const tokenMoveSeqRef = useRef(0);
  const tokenSequenceRef = useRef<Record<string, number>>({});
  const tokenPreviewThrottleRef = useRef<{ lastSentAt: number; timer: number | null; pending: TokenMovePayload | null }>({
    lastSentAt: 0,
    timer: null,
    pending: null
  });

  function syncProfileFromRoom(nextRoom: RoomState, fallbackProfile: GuestProfile) {
    const assignedMember = nextRoom.members.find((member) => member.id === fallbackProfile.id);
    const nextProfile = assignedMember
      ? { id: assignedMember.id, nickname: assignedMember.nickname, color: assignedMember.color }
      : fallbackProfile;
    setProfile(nextProfile);
    saveGuestProfile(nextProfile);
  }

  useEffect(() => {
    let cancelled = false;
    const loadedProfile = getGuestProfile();
    const localRoom = loadRoom(roomCode, loadedProfile);
    syncProfileFromRoom(localRoom, loadedProfile);
    setRoom(localRoom);

    function joinServerFallback() {
      fetch(roomApiPath(roomCode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loadedProfile)
      })
        .then((response) => {
          if (!response.ok) throw new Error("Server room join failed");
          return response.json() as Promise<RoomState>;
        })
        .then((serverRoom) => {
          if (cancelled) return;
          setSyncMode("server");
          setSyncError("");
          setRoom(serverRoom);
          syncProfileFromRoom(serverRoom, loadedProfile);
          saveRoom(serverRoom);
        })
        .catch(() => {
          if (cancelled) return;
          setSyncError("Development server sync is unavailable. Using local browser storage.");
          setSyncMode("local");
        });
    }

    if (hasSupabaseConfig()) {
      joinSupabaseRoom(roomCode, loadedProfile)
        .then((supabaseRoom) => {
          if (cancelled) return;
          if (!supabaseRoom) throw new Error("Supabase is not configured.");
          setSyncMode("supabase");
          setSyncError("");
          setRoom(supabaseRoom);
          syncProfileFromRoom(supabaseRoom, loadedProfile);
        })
        .catch((error) => {
          if (cancelled) return;
          setSyncError(error instanceof Error ? error.message : "Supabase sync failed.");
          setSyncMode("local");
        });
      return () => {
        cancelled = true;
      };
    }

    const socket = new WebSocket(roomWebSocketUrl());
    wsRef.current = socket;
    let opened = false;

    socket.addEventListener("open", () => {
      opened = true;
      socket.send(JSON.stringify({ type: "join_room", roomCode, profile: loadedProfile }));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as RealtimeMessage;
      if (message.type === "room_snapshot") {
        setSyncMode("websocket");
        setSyncError("");
        setRoom(message.room);
        syncProfileFromRoom(message.room, loadedProfile);
        saveRoom(message.room);
        return;
      }
      if (message.type === "token_move_preview" || message.type === "token_move_commit") {
        const previousSeq = tokenSequenceRef.current[message.token.id] ?? 0;
        if (message.seq < previousSeq) return;
        tokenSequenceRef.current = { ...tokenSequenceRef.current, [message.token.id]: message.seq };
        setRoom((current) =>
          current
            ? {
                ...current,
                tokens: current.tokens.map((token) => (token.id === message.token.id ? { ...token, ...message.token } : token))
              }
            : current
        );
        return;
      }
      if (message.type === "sync_error") {
        setSyncError(message.message);
      }
    });

    socket.addEventListener("close", () => {
      if (cancelled) return;
      wsRef.current = null;
      setSyncError(opened ? "Realtime connection dropped. Falling back to server polling." : "Realtime server unavailable. Falling back to server polling.");
      joinServerFallback();
    });

    socket.addEventListener("error", () => {
      socket.close();
    });

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [roomCode]);

  useEffect(() => {
    if (!profile || syncMode !== "supabase") return;
    const unsubscribe = subscribeToSupabaseRoom(roomCode, (supabaseRoom) => {
      setRoom(supabaseRoom);
      saveRoom(supabaseRoom);
    });

    return () => {
      unsubscribe?.();
    };
  }, [profile, roomCode, syncMode]);

  useEffect(() => {
    if (!profile || syncMode !== "server") return;
    const interval = window.setInterval(() => {
      fetch(roomApiPath(roomCode))
        .then((response) => {
          if (!response.ok) throw new Error("Server room fetch failed");
          return response.json() as Promise<RoomState>;
        })
        .then((serverRoom) => {
          setRoom(serverRoom);
          saveRoom(serverRoom);
        })
        .catch(() => setSyncMode("local"));
    }, 1200);

    return () => window.clearInterval(interval);
  }, [profile, roomCode, syncMode]);

  const currentMember = room?.members.find((member) => member.id === profile?.id);
  const isDm = currentMember?.role === "dm";
  const boardWidth = room ? room.grid.columns * room.grid.cellSize : 0;
  const boardHeight = room ? room.grid.rows * room.grid.cellSize : 0;
  const roomEffects = room?.effects ?? [];
  const selectedToken = room?.tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedWall =
    selectedBuildObject?.type === "wall"
      ? room?.drawings.find((line) => line.id === selectedBuildObject.id && line.kind === "wall") ?? null
      : null;
  const selectedEffect =
    selectedBuildObject?.type === "effect" ? roomEffects.find((effect) => effect.id === selectedBuildObject.id) ?? null : null;

  useEffect(() => {
    const channel = new BroadcastChannel(`dnd-room-${roomCode}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<RoomState>) => {
      if (syncMode === "websocket") return;
      setRoom(event.data);
    };
    return () => channel.close();
  }, [roomCode, syncMode]);

  useEffect(() => {
    if (!room) return;
    if (syncMode === "websocket") {
      const timeout = window.setTimeout(() => saveRoom(room), 500);
      return () => window.clearTimeout(timeout);
    }
    saveRoom(room);
  }, [room, syncMode]);

  useEffect(() => {
    if (!buildMode || !isDm) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (isEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoBuildAction();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [buildMode, isDm]);

  function persistRoom(next: RoomState) {
    saveRoom(next);
    if (syncMode !== "websocket") {
      channelRef.current?.postMessage(next);
    }
    if (syncMode === "websocket") {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "room_patch", roomCode, room: next, tokenSequences: tokenSequenceRef.current }));
      }
      return;
    }
    if (syncMode === "server") {
      fetch(roomApiPath(roomCode), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      }).catch(() => setSyncMode("local"));
    }
    if (syncMode === "supabase") {
      saveSupabaseRoom(next).catch((error) => {
        setSyncError(error instanceof Error ? error.message : "Supabase save failed.");
        setSyncMode("local");
      });
    }
  }

  function updateRoom(updater: (current: RoomState) => RoomState) {
    setRoom((current) => {
      if (!current) return current;
      const next = updater(current);
      persistRoom(next);
      return next;
    });
  }

  function updateBuildRoom(updater: (current: RoomState) => RoomState, createUndo: (current: RoomState, next: RoomState) => BuildUndo) {
    setRoom((current) => {
      if (!current) return current;
      const next = updater(current);
      pushBuildUndo(createUndo(current, next));
      persistRoom(next);
      return next;
    });
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

  function canControl(token: Token) {
    return Boolean(profile && (isDm || token.ownerId === profile.id));
  }

  function addToken() {
    if (!profile || !room || !currentMember) return;
    const owner = currentMember;
    const token: Token = {
      id: createEntityId("token"),
      name: newToken.name.trim() || "Token",
      icon: newToken.icon.trim() || "●",
      imageName: newToken.imageName || undefined,
      imageUrl: newToken.imageUrl || undefined,
      type: newToken.type,
      ownerId: owner.id,
      ownerName: owner.nickname,
      color: owner.color,
      x: 0,
      y: 0,
      size: 1
    };
    updateRoom((current) => ({ ...current, tokens: [...current.tokens, token] }));
    setSelectedTokenId(token.id);
  }

  async function handleNewTokenImage(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      setNewToken((current) => ({ ...current, ...image }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not use that image.");
    }
  }

  async function handleSelectedTokenImage(file: File | null) {
    if (!file || !selectedToken || !canControl(selectedToken)) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      updateToken(selectedToken.id, image);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not use that image.");
    }
  }

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
        ...DEFAULT_BACKGROUND_IMAGE_SETTINGS
      });
    } catch (error) {
      setBackgroundError(error instanceof Error ? error.message : "Could not use that background.");
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
      ...DEFAULT_BACKGROUND_IMAGE_SETTINGS
    });
  }

  function setBattleMapBackground(backgroundImage: BattleMapBackground | undefined) {
    updateBuildRoom(
      (current) => ({ ...current, grid: { ...current.grid, backgroundImage } }),
      (current) => {
        const previous = current.grid.backgroundImage;
        return (nextRoom) => ({ ...nextRoom, grid: { ...nextRoom.grid, backgroundImage: previous } });
      }
    );
  }

  function updateBattleMapBackground(patch: Partial<BattleMapBackground>) {
    updateBuildRoom(
      (current) => {
        if (!current.grid.backgroundImage) return current;
        return {
          ...current,
          grid: { ...current.grid, backgroundImage: { ...current.grid.backgroundImage, ...patch } }
        };
      },
      (current) => {
        const previous = current.grid.backgroundImage;
        return (nextRoom) => ({ ...nextRoom, grid: { ...nextRoom.grid, backgroundImage: previous } });
      }
    );
  }

  function deleteToken(tokenId: string) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.filter((token) => token.id !== tokenId),
      initiative: current.initiative.filter((entry) => entry.tokenId !== tokenId)
    }));
  }

  function updateToken(tokenId: string, patch: Partial<Token>) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.map((token) => (token.id === tokenId && canControl(token) ? { ...token, ...patch } : token))
    }));
  }

  function updateWall(wallId: string, patch: Partial<DrawingLine>) {
    updateBuildRoom(
      (current) => ({
        ...current,
        drawings: current.drawings.map((line) => (line.id === wallId && line.kind === "wall" ? { ...line, ...patch } : line))
      }),
      (current) => {
        const previous = current.drawings.find((line) => line.id === wallId);
        return (nextRoom) => ({
          ...nextRoom,
          drawings: nextRoom.drawings.map((line) => (line.id === wallId && previous ? previous : line))
        });
      }
    );
  }

  function deleteWall(wallId: string) {
    updateBuildRoom(
      (current) => ({
        ...current,
        drawings: current.drawings.filter((line) => line.id !== wallId)
      }),
      (current) => {
        const previous = current.drawings.find((line) => line.id === wallId);
        return (nextRoom) => ({
          ...nextRoom,
          drawings: previous ? [...nextRoom.drawings, previous] : nextRoom.drawings
        });
      }
    );
    setSelectedBuildObject(null);
  }

  function updateEffect(effectId: string, patch: Partial<AreaEffectTemplate>) {
    updateBuildRoom(
      (current) => ({
        ...current,
        effects: (current.effects ?? []).map((effect) => (effect.id === effectId ? { ...effect, ...patch } : effect))
      }),
      (current) => {
        const previous = (current.effects ?? []).find((effect) => effect.id === effectId);
        return (nextRoom) => ({
          ...nextRoom,
          effects: (nextRoom.effects ?? []).map((effect) => (effect.id === effectId && previous ? previous : effect))
        });
      }
    );
  }

  function deleteEffect(effectId: string) {
    updateBuildRoom(
      (current) => ({
        ...current,
        effects: (current.effects ?? []).filter((effect) => effect.id !== effectId)
      }),
      (current) => {
        const previous = (current.effects ?? []).find((effect) => effect.id === effectId);
        return (nextRoom) => ({
          ...nextRoom,
          effects: previous ? [...(nextRoom.effects ?? []), previous] : nextRoom.effects ?? []
        });
      }
    );
    setSelectedBuildObject(null);
  }

  function startBuildObjectDrag(event: PointerEvent<SVGElement>, object: SelectedBuildObject) {
    if (!isDm || !room || !object) return;
    const start = getBoardPointFromClient(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    setSelectedTokenId(null);
    setSelectedBuildObject(object);

    if (object.type === "wall") {
      const wall = room.drawings.find((line) => line.id === object.id && line.kind === "wall");
      if (wall) {
        setDraggingBuildObject({ type: "wall", id: wall.id, start, points: wall.points, moved: false });
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
        moved: false
      });
    }
  }

  function continueBuildObjectDrag(event: PointerEvent<SVGElement>) {
    if (!draggingBuildObject) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const delta = { x: point.x - draggingBuildObject.start.x, y: point.y - draggingBuildObject.start.y };

    if (draggingBuildObject.type === "wall") {
      const nextPoints = draggingBuildObject.points.map((item) => ({
        x: Math.max(0, Math.min(boardWidth, item.x + delta.x)),
        y: Math.max(0, Math.min(boardHeight, item.y + delta.y))
      }));
      updateRoom((current) => ({
        ...current,
        drawings: current.drawings.map((line) => (line.id === draggingBuildObject.id ? { ...line, points: nextPoints } : line))
      }));
    } else {
      const origin = {
        x: Math.max(0, Math.min(boardWidth, draggingBuildObject.origin.x + delta.x)),
        y: Math.max(0, Math.min(boardHeight, draggingBuildObject.origin.y + delta.y))
      };
      const target = {
        x: Math.max(0, Math.min(boardWidth, draggingBuildObject.target.x + delta.x)),
        y: Math.max(0, Math.min(boardHeight, draggingBuildObject.target.y + delta.y))
      };
      updateRoom((current) => ({
        ...current,
        effects: (current.effects ?? []).map((effect) => (effect.id === draggingBuildObject.id ? { ...effect, origin, target } : effect))
      }));
    }

    setDraggingBuildObject((current) => (current ? { ...current, moved: true } : current));
  }

  function endBuildObjectDrag(event: PointerEvent<SVGElement>) {
    if (!draggingBuildObject) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const moved = draggingBuildObject.moved || pointDistance(draggingBuildObject.start, point) > 1;

    if (moved) {
      if (draggingBuildObject.type === "wall") {
        const originalPoints = draggingBuildObject.points;
        const wallId = draggingBuildObject.id;
        pushBuildUndo((current) => ({
          ...current,
          drawings: current.drawings.map((line) => (line.id === wallId ? { ...line, points: originalPoints } : line))
        }));
      } else {
        const { id, origin, target } = draggingBuildObject;
        pushBuildUndo((current) => ({
          ...current,
          effects: (current.effects ?? []).map((effect) => (effect.id === id ? { ...effect, origin, target } : effect))
        }));
      }
    }

    setDraggingBuildObject(null);
  }

  function moveToken(event: PointerEvent<HTMLDivElement>, token: Token) {
    if (!room) return;
    if (!canControl(token)) return;
    const point = getBoardPointFromClient(event.clientX, event.clientY);
    const x = Math.max(0, Math.min(room.grid.columns - token.size, Math.floor(point.x / room.grid.cellSize)));
    const y = Math.max(0, Math.min(room.grid.rows - token.size, Math.floor(point.y / room.grid.cellSize)));
    if (syncMode !== "websocket") {
      updateToken(token.id, { x, y });
      return;
    }
    if (token.x === x && token.y === y) return;

    const payload = { tokenId: token.id, x, y, seq: nextTokenMoveSeq(token.id) };
    applyLocalTokenMove(payload);
    queueTokenMovePreview(payload);
  }

  function endTokenMove(event: PointerEvent<HTMLDivElement>, token: Token) {
    if (draggingToken !== token.id) return;
    if (syncMode === "websocket" && room && canControl(token)) {
      const point = getBoardPointFromClient(event.clientX, event.clientY);
      const payload = {
        tokenId: token.id,
        x: Math.max(0, Math.min(room.grid.columns - token.size, Math.floor(point.x / room.grid.cellSize))),
        y: Math.max(0, Math.min(room.grid.rows - token.size, Math.floor(point.y / room.grid.cellSize))),
        seq: nextTokenMoveSeq(token.id)
      };
      applyLocalTokenMove(payload);
      flushTokenMovePreview();
      sendTokenMove("token_move_commit", payload);
    }
    setDraggingToken(null);
  }

  function nextTokenMoveSeq(tokenId: string) {
    tokenMoveSeqRef.current = Math.max(tokenMoveSeqRef.current + 1, Date.now());
    tokenSequenceRef.current = { ...tokenSequenceRef.current, [tokenId]: tokenMoveSeqRef.current };
    return tokenMoveSeqRef.current;
  }

  function applyLocalTokenMove(payload: TokenMovePayload) {
    setRoom((current) =>
      current
        ? {
            ...current,
            tokens: current.tokens.map((item) => (item.id === payload.tokenId ? { ...item, x: payload.x, y: payload.y } : item))
          }
        : current
    );
  }

  function sendTokenMove(type: "token_move_preview" | "token_move_commit", payload: TokenMovePayload) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type, roomCode, ...payload }));
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
    if (!profile || !room) return;
    setSelectedBuildObject(null);
    if (!buildMode || !isDm || buildTool === "background") return;
    const point = getBoardPoint(event);
    const startPoint = buildTool === "wall" || buildTool === "effects" ? snapBoardPoint(point) : point;
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
        createdAt: Date.now()
      });
      return;
    }

    setDraftLine({
      id: createEntityId(buildTool === "wall" ? "wall" : "line"),
      kind: buildTool === "wall" ? "wall" : "freehand",
      ownerId: profile.id,
      color: buildColor,
      points: buildTool === "wall" ? [startPoint, startPoint] : [startPoint]
    });
  }

  function continueBuildGesture(event: PointerEvent<HTMLDivElement>) {
    if (draftEffect) {
      const point = snapBoardPoint(getBoardPoint(event));
      setDraftEffect((effect) => (effect ? { ...effect, target: point } : effect));
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
        (current) => ({ ...current, effects: [...(current.effects ?? []), effect] }),
        () => (current) => ({ ...current, effects: (current.effects ?? []).filter((item) => item.id !== effect.id) })
      );
      return;
    }

    if (!draftLine) return;
    const line = draftLine;
    setDraftLine(null);
    if (line.points.length > 1 && !isSamePoint(line.points[0], line.points[line.points.length - 1])) {
      updateBuildRoom(
        (current) => ({ ...current, drawings: [...current.drawings, line] }),
        () => (current) => ({ ...current, drawings: current.drawings.filter((item) => item.id !== line.id) })
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
      y: Math.max(0, Math.min(boardHeight, clientY - rect.top))
    };
  }

  function snapBoardPoint(point: { x: number; y: number }) {
    if (!room) return point;
    return {
      x: Math.max(0, Math.min(boardWidth, Math.round(point.x / room.grid.cellSize) * room.grid.cellSize)),
      y: Math.max(0, Math.min(boardHeight, Math.round(point.y / room.grid.cellSize) * room.grid.cellSize))
    };
  }

  function isSamePoint(first: { x: number; y: number }, second: { x: number; y: number }) {
    return first.x === second.x && first.y === second.y;
  }

  function doRoll(expression = diceExpression) {
    if (!profile) return;
    try {
      const result = rollDice(expression);
      const roll: DiceRoll = {
        id: createEntityId("roll"),
        userId: profile.id,
        userName: profile.nickname,
        expression: result.expression,
        total: result.total,
        parts: result.parts,
        private: privateRoll,
        createdAt: Date.now()
      };
      setDiceError("");
      updateRoom((current) => ({ ...current, rolls: [roll, ...current.rolls].slice(0, 80) }));
    } catch (error) {
      setDiceError(error instanceof Error ? error.message : "Invalid roll.");
    }
  }

  function visibleRolls() {
    if (!room || !profile) return [];
    return room.rolls.filter((roll) => !roll.private || roll.userId === profile.id || isDm);
  }

  function latestRollFor(userId: string) {
    return visibleRolls().find((roll) => roll.userId === userId);
  }

  function addInitiative(token: Token) {
    updateRoom((current) => {
      const existing = current.initiative.filter((entry) => entry.tokenId !== token.id);
      return {
        ...current,
        initiative: [...existing, { id: createEntityId("init"), tokenId: token.id, name: token.name, score: 10 }].sort(
          (a, b) => b.score - a.score
        )
      };
    });
  }

  if (!profile || !room) {
    return (
      <main className="app-shell table-shell">
        <section className="loading-panel">
          <span className="product-kicker">Opening room</span>
          <h1>Loading tabletop...</h1>
          <p>Preparing your profile, room state, map grid, and sync connection.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell table-shell">
      <header className="app-topbar room-header">
        <div>
          <Link href="../.." className="back-link">
            Room lobby
          </Link>
          <h1>Room {roomCode}</h1>
          <p>{isDm ? "You are the DM. You can edit the map and all tokens." : "You are a player. You control your own tokens."}</p>
        </div>
        <div className="room-actions">
          <span className={syncMode === "server" || syncMode === "supabase" || syncMode === "websocket" ? "sync-badge online" : "sync-badge"}>
            {syncMode === "supabase"
              ? "Supabase realtime"
              : syncMode === "websocket"
                ? "Realtime sync"
                : syncMode === "server"
                  ? "Dev server sync"
                  : syncMode === "local"
                    ? "Local only"
                    : "Connecting"}
          </span>
          <button
            className="secondary-action"
            onClick={() => navigator.clipboard?.writeText(window.location.href)}
            type="button"
          >
            Copy invite
          </button>
        </div>
      </header>
      {syncError ? <p className="sync-warning">{syncError}</p> : null}

      <section className="player-bar" aria-label="Players in room">
        {room.members.map((member) => {
          const latest = latestRollFor(member.id);
          return (
            <article className="profile-chip" key={member.id} style={{ borderColor: member.color }}>
              <div className="avatar" style={{ background: member.color }}>
                {member.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{member.nickname}</strong>
                <span>{member.role.toUpperCase()}</span>
                {latest ? (
                  <small>
                    {latest.private ? "Private " : ""}
                    {latest.expression}: {latest.total}
                  </small>
                ) : (
                  <small>No roll yet</small>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {isDm ? (
        <section className="build-ribbon" aria-label="DM build ribbon">
          <div className="ribbon-title">
            <h2>Build Mode</h2>
            <span>{buildMode ? buildTool : "Off"}</span>
          </div>
          <div className="ribbon-section">
            <span className="ribbon-label">Mode</span>
            <button
              className={buildMode ? "primary-action compact" : "secondary-action compact"}
              onClick={() => setBuildMode((current) => !current)}
              type="button"
            >
              {buildMode ? "Exit Build" : "Enter Build"}
            </button>
            <button className="secondary-action compact" disabled={!buildUndoCount} onClick={undoBuildAction} type="button">
              Undo
            </button>
          </div>

          <div className="ribbon-section">
            <span className="ribbon-label">Tools</span>
            <div className="build-tool-tabs" aria-label="Build tools">
              {(["draw", "wall", "effects", "background"] as BuildTool[]).map((tool) => (
                <button
                  className={buildTool === tool ? "selected" : ""}
                  key={tool}
                  onClick={() => {
                    setBuildTool(tool);
                    setBuildMode(true);
                  }}
                  type="button"
                >
                  {tool === "draw" ? "Draw" : tool === "wall" ? "Walls" : tool === "effects" ? "Effects" : "Background"}
                </button>
              ))}
            </div>
          </div>

          {buildTool === "draw" || buildTool === "wall" || buildTool === "effects" ? (
            <div className="ribbon-section">
              <span className="ribbon-label">Style</span>
              <div className="color-picker build-colors" aria-label="Choose build color">
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
                <input type="color" value={buildColor} onChange={(event) => setBuildColor(event.target.value)} />
              </label>
            </div>
          ) : null}

          {buildTool === "effects" ? (
            <div className="ribbon-section wide">
              <span className="ribbon-label">Effects</span>
              <label>
                Effect shape
                <select value={effectShape} onChange={(event) => setEffectShape(event.target.value as AreaEffectShape)}>
                  {EFFECT_SHAPES.map((shape) => (
                    <option key={shape} value={shape}>
                      {shape === "circle" ? "Circle / sphere" : shape}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Label
                <input placeholder="Fireball, Web, aura" value={effectLabel} onChange={(event) => setEffectLabel(event.target.value)} />
              </label>
              <div className="quick-effect-sizes">
                {QUICK_EFFECT_SIZES.map((size) => (
                  <button className={size === effectSizeFeet ? "selected" : ""} key={size} onClick={() => setEffectSizeFeet(size)} type="button">
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
                  onChange={(event) => setEffectSizeFeet(Number(event.target.value))}
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
                    onChange={(event) => setEffectWidthFeet(Number(event.target.value))}
                  />
                </label>
              ) : null}
              <label>
                Effect opacity
                <input min={10} max={80} type="range" value={effectOpacity} onChange={(event) => setEffectOpacity(Number(event.target.value))} />
              </label>
            </div>
          ) : null}

          {buildTool === "background" ? (
            <div className="ribbon-section wide">
              <span className="ribbon-label">Background</span>
              <label>
                Upload battlefield
                <input accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleBackgroundImage(event.target.files?.[0] ?? null)} type="file" />
              </label>
              <label>
                Battlefield image URL
                <input value={backgroundUrl} onChange={(event) => setBackgroundUrl(event.target.value)} />
              </label>
              <button className="secondary-action compact" disabled={!backgroundUrl.trim()} onClick={applyBackgroundUrl} type="button">
                Use image URL
              </button>
              {room.grid.backgroundImage ? (
                <>
                  <label>
                    X
                    <input type="number" value={room.grid.backgroundImage.positionX} onChange={(event) => updateBattleMapBackground({ positionX: Number(event.target.value) })} />
                  </label>
                  <label>
                    Y
                    <input type="number" value={room.grid.backgroundImage.positionY} onChange={(event) => updateBattleMapBackground({ positionY: Number(event.target.value) })} />
                  </label>
                  <label>
                    Scale
                    <input min={20} max={300} type="range" value={room.grid.backgroundImage.scale} onChange={(event) => updateBattleMapBackground({ scale: Number(event.target.value) })} />
                  </label>
                  <label>
                    Opacity
                    <input min={10} max={100} type="range" value={room.grid.backgroundImage.opacity} onChange={(event) => updateBattleMapBackground({ opacity: Number(event.target.value) })} />
                  </label>
                  <button className="secondary-action compact" onClick={() => updateBattleMapBackground({ ...DEFAULT_BACKGROUND_IMAGE_SETTINGS })} type="button">
                    Reset
                  </button>
                  <button className="secondary-action compact danger" onClick={() => setBattleMapBackground(undefined)} type="button">
                    Remove
                  </button>
                </>
              ) : null}
              {backgroundError ? <p className="error-text">{backgroundError}</p> : null}
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
                onChange={(event) => updateRoom((current) => ({ ...current, grid: { ...current.grid, columns: Number(event.target.value) } }))}
              />
            </label>
            <label>
              Rows
              <input
                min={8}
                max={50}
                type="number"
                value={room.grid.rows}
                onChange={(event) => updateRoom((current) => ({ ...current, grid: { ...current.grid, rows: Number(event.target.value) } }))}
              />
            </label>
            <label>
              Cell size
              <input
                min={28}
                max={72}
                type="number"
                value={room.grid.cellSize}
                onChange={(event) => updateRoom((current) => ({ ...current, grid: { ...current.grid, cellSize: Number(event.target.value) } }))}
              />
            </label>
            <label>
              Background color
              <input
                type="color"
                value={room.grid.background}
                onChange={(event) =>
                  updateBuildRoom(
                    (current) => ({ ...current, grid: { ...current.grid, background: event.target.value } }),
                    (current) => {
                      const previous = current.grid.background;
                      return (nextRoom) => ({ ...nextRoom, grid: { ...nextRoom.grid, background: previous } });
                    }
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
                    return (nextRoom) => ({ ...nextRoom, drawings: previous, effects: previousEffects });
                  }
                )
              }
              type="button"
            >
              Clear marks
            </button>
          </div>
        </section>
      ) : null}

      <div className="workspace">
        <aside className="side-panel">
          <section className="tool-card">
            <div className="panel-heading">
              <h2>Dice</h2>
              <span>{privateRoll ? "Private" : "Public"}</span>
            </div>
            <div className="quick-dice">
              {QUICK_DICE.map((die) => (
                <button key={die} onClick={() => doRoll(die)} type="button">
                  {die}
                </button>
              ))}
            </div>
            <div className="dice-row">
              <input value={diceExpression} onChange={(event) => setDiceExpression(event.target.value)} />
              <button onClick={() => doRoll()} type="button">
                Roll
              </button>
            </div>
            <label className="inline-check">
              <input checked={privateRoll} onChange={(event) => setPrivateRoll(event.target.checked)} type="checkbox" />
              Private roll
            </label>
            {diceError ? <p className="error-text">{diceError}</p> : null}
          </section>

          <section className="tool-card">
            <div className="panel-heading">
              <h2>Tokens</h2>
              <span>Create chip</span>
            </div>
            <input
              aria-label="Token name"
              value={newToken.name}
              onChange={(event) => setNewToken((current) => ({ ...current, name: event.target.value }))}
            />
            <div className="dice-row">
              <input
                aria-label="Token icon"
                value={newToken.icon}
                onChange={(event) => setNewToken((current) => ({ ...current, icon: event.target.value }))}
                maxLength={4}
              />
              <select
                value={newToken.type}
                onChange={(event) => setNewToken((current) => ({ ...current, type: event.target.value as TokenType }))}
              >
                {TOKEN_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <button className="primary-action compact" onClick={addToken} type="button">
              Add token
            </button>
            <label>
              Token picture
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleNewTokenImage(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            {newToken.imageUrl ? (
              <div className="token-preview">
                <img alt={`${newToken.name || "New token"} preview`} src={newToken.imageUrl} />
                <div>
                  <strong>{newToken.imageName}</strong>
                  <button
                    className="secondary-action compact"
                    onClick={() => setNewToken((current) => ({ ...current, imageName: "", imageUrl: "" }))}
                    type="button"
                  >
                    Remove picture
                  </button>
                </div>
              </div>
            ) : null}
            {imageError ? <p className="error-text">{imageError}</p> : null}
          </section>

          {selectedToken ? (
            <section className="tool-card">
              <div className="panel-heading">
                <h2>Selected Token</h2>
                <span>{canControl(selectedToken) ? "Editable" : "Locked"}</span>
              </div>
              <label>
                Name
                <input
                  disabled={!canControl(selectedToken)}
                  value={selectedToken.name}
                  onChange={(event) => updateToken(selectedToken.id, { name: event.target.value })}
                />
              </label>
              <div className="dice-row">
                <label>
                  Icon
                  <input
                    disabled={!canControl(selectedToken)}
                    maxLength={4}
                    value={selectedToken.icon}
                    onChange={(event) => updateToken(selectedToken.id, { icon: event.target.value })}
                  />
                </label>
                <label>
                  Size
                  <input
                    disabled={!canControl(selectedToken)}
                    min={1}
                    max={4}
                    type="number"
                    value={selectedToken.size}
                    onChange={(event) => updateToken(selectedToken.id, { size: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label>
                HP / status
                <input
                  disabled={!canControl(selectedToken)}
                  placeholder="23/31, prone, blessed"
                  value={selectedToken.hp ?? ""}
                  onChange={(event) => updateToken(selectedToken.id, { hp: event.target.value })}
                />
              </label>
              <label>
                Note
                <input
                  disabled={!canControl(selectedToken)}
                  placeholder={isDm ? "Hidden encounter note" : "Character note"}
                  value={selectedToken.note ?? ""}
                  onChange={(event) => updateToken(selectedToken.id, { note: event.target.value })}
                />
              </label>
              <label>
                Token picture
                <input
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={!canControl(selectedToken)}
                  onChange={(event) => handleSelectedTokenImage(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              {selectedToken.imageUrl ? (
                <div className="token-preview">
                  <img alt={`${selectedToken.name} preview`} src={selectedToken.imageUrl} />
                  <div>
                    <strong>{selectedToken.imageName ?? "Custom picture"}</strong>
                    {canControl(selectedToken) ? (
                      <button
                        className="secondary-action compact"
                        onClick={() => updateToken(selectedToken.id, { imageName: undefined, imageUrl: undefined })}
                        type="button"
                      >
                        Remove picture
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="empty-state">No custom picture. The chip is using its icon.</p>
              )}
              {canControl(selectedToken) ? (
                <button className="secondary-action compact danger" onClick={() => deleteToken(selectedToken.id)} type="button">
                  Delete selected
                </button>
              ) : null}
            </section>
          ) : null}

          <section>
            <div className="panel-heading">
              <h2>Initiative</h2>
              <span>Turn order</span>
            </div>
            {room.initiative.length ? (
              <ol className="initiative-list">
                {room.initiative.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.name}</span>
                    <input
                      disabled={!isDm}
                      value={entry.score}
                      type="number"
                      onChange={(event) =>
                        updateRoom((current) => ({
                          ...current,
                          initiative: current.initiative
                            .map((item) => (item.id === entry.id ? { ...item, score: Number(event.target.value) } : item))
                            .sort((a, b) => b.score - a.score)
                        }))
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">Add tokens to initiative from the token list.</p>
            )}
          </section>
        </aside>

        <section className="map-wrap" aria-label="Battle map">
          <div className="map-toolbar">
            <span>{room.grid.columns} x {room.grid.rows}</span>
            <span>{room.tokens.length} tokens</span>
            <span>{roomEffects.length} effects</span>
            <span>{buildMode ? `Build: ${buildTool === "wall" ? "Walls" : buildTool}` : "Token mode"}</span>
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
              backgroundColor: room.grid.background
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
                  width: boardWidth * (room.grid.backgroundImage.scale / 100)
                }}
              />
            ) : null}
            <div
              className="grid-layer"
              style={{
                backgroundImage: `linear-gradient(to right, rgba(20, 20, 20, .18) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 20, 20, .18) 1px, transparent 1px)`,
                backgroundSize: `${room.grid.cellSize}px ${room.grid.cellSize}px`
              }}
            />
            <svg className="drawing-layer" height={boardHeight} width={boardWidth}>
              {[...roomEffects, ...(draftEffect ? [draftEffect] : [])].map((effect) => {
                const fill = effect.color;
                const stroke = effect.color;
                const opacity = effect.opacity / 100;
                const isSelected = selectedBuildObject?.type === "effect" && selectedBuildObject.id === effect.id;
                const effectClassName = isSelected ? "effect-template build-object selected" : "effect-template build-object";
                const effectHandlers = {
                  onPointerDown: (event: PointerEvent<SVGElement>) => startBuildObjectDrag(event, { type: "effect", id: effect.id }),
                  onPointerMove: continueBuildObjectDrag,
                  onPointerUp: endBuildObjectDrag
                };

                if (effect.shape === "circle") {
                  return (
                    <g className={effectClassName} key={effect.id} {...effectHandlers}>
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
                        <text className="effect-label" x={effect.origin.x} y={effect.origin.y}>
                          {effect.label}
                        </text>
                      ) : null}
                    </g>
                  );
                }

                if (effect.shape === "cone") {
                  return (
                    <g className={effectClassName} key={effect.id} {...effectHandlers}>
                      <path
                        d={conePath(effect, room)}
                        fill={fill}
                        fillOpacity={opacity}
                        stroke={stroke}
                        strokeOpacity={Math.min(1, opacity + 0.35)}
                        strokeWidth="3"
                      />
                      {effect.label ? (
                        <text className="effect-label" x={effect.origin.x + 8} y={effect.origin.y - 8}>
                          {effect.label}
                        </text>
                      ) : null}
                    </g>
                  );
                }

                if (effect.shape === "cube") {
                  const rect = cubeRect(effect, room);
                  return (
                    <g className={effectClassName} key={effect.id} {...effectHandlers}>
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
                        <text className="effect-label" x={rect.x + 8} y={rect.y + 20}>
                          {effect.label}
                        </text>
                      ) : null}
                    </g>
                  );
                }

                return (
                  <g className={effectClassName} key={effect.id} {...effectHandlers}>
                    <polygon
                      fill={fill}
                      fillOpacity={opacity}
                      points={linePolygonPoints(effect, room)}
                      stroke={stroke}
                      strokeOpacity={Math.min(1, opacity + 0.35)}
                      strokeWidth="3"
                    />
                    {effect.label ? (
                      <text className="effect-label" x={effect.origin.x + 8} y={effect.origin.y - 8}>
                        {effect.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {[...room.drawings, ...(draftLine ? [draftLine] : [])].map((line) => (
                <polyline
                  className={
                    line.kind === "wall"
                      ? selectedBuildObject?.type === "wall" && selectedBuildObject.id === line.id
                        ? "build-object wall-object selected"
                        : "build-object wall-object"
                      : undefined
                  }
                  fill="none"
                  key={line.id}
                  onPointerDown={line.kind === "wall" ? (event) => startBuildObjectDrag(event, { type: "wall", id: line.id }) : undefined}
                  onPointerMove={line.kind === "wall" ? continueBuildObjectDrag : undefined}
                  onPointerUp={line.kind === "wall" ? endBuildObjectDrag : undefined}
                  points={line.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  stroke={line.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={line.kind === "wall" ? "8" : "5"}
                />
              ))}
            </svg>

            {room.tokens.map((token) => (
              <div
                className={canControl(token) ? "token controllable" : "token"}
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
                  width: token.size * room.grid.cellSize - 8
                }}
                title={`${token.name} (${token.ownerName})`}
              >
                {token.imageUrl ? (
                  <img className="token-image" alt={token.name} draggable={false} src={token.imageUrl} />
                ) : (
                  <span>{token.icon}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="right-panel">
          {isDm && (selectedWall || selectedEffect) ? (
            <section className="tool-card">
              <div className="panel-heading">
                <h2>Selected Object</h2>
                <span>{selectedWall ? "Wall" : "Effect"}</span>
              </div>
              {selectedWall ? (
                <>
                  <label>
                    Wall color
                    <input type="color" value={selectedWall.color} onChange={(event) => updateWall(selectedWall.id, { color: event.target.value })} />
                  </label>
                  <button className="secondary-action compact danger" onClick={() => deleteWall(selectedWall.id)} type="button">
                    Delete wall
                  </button>
                </>
              ) : null}
              {selectedEffect ? (
                <>
                  <label>
                    Effect shape
                    <select value={selectedEffect.shape} onChange={(event) => updateEffect(selectedEffect.id, { shape: event.target.value as AreaEffectShape })}>
                      {EFFECT_SHAPES.map((shape) => (
                        <option key={shape} value={shape}>
                          {shape === "circle" ? "Circle / sphere" : shape}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label
                    <input value={selectedEffect.label ?? ""} onChange={(event) => updateEffect(selectedEffect.id, { label: event.target.value || undefined })} />
                  </label>
                  <label>
                    Color
                    <input type="color" value={selectedEffect.color} onChange={(event) => updateEffect(selectedEffect.id, { color: event.target.value })} />
                  </label>
                  <label>
                    Size in feet
                    <input
                      min={5}
                      max={200}
                      step={5}
                      type="number"
                      value={selectedEffect.sizeFeet}
                      onChange={(event) => updateEffect(selectedEffect.id, { sizeFeet: Number(event.target.value) })}
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
                        onChange={(event) => updateEffect(selectedEffect.id, { widthFeet: Number(event.target.value) })}
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
                      onChange={(event) => updateEffect(selectedEffect.id, { opacity: Number(event.target.value) })}
                    />
                  </label>
                  <button className="secondary-action compact danger" onClick={() => deleteEffect(selectedEffect.id)} type="button">
                    Delete effect
                  </button>
                </>
              ) : null}
            </section>
          ) : null}

          <section className="tool-card">
            <div className="panel-heading">
              <h2>Room Log</h2>
              <span>Latest rolls</span>
            </div>
            {visibleRolls().length ? (
              <div className="roll-log">
                {visibleRolls().map((roll) => (
                  <article key={roll.id}>
                    <strong>{roll.userName}</strong>
                    <span>
                      {roll.private ? "Private " : ""}
                      {roll.expression}: {roll.total}
                    </span>
                    <small>{roll.parts}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">Dice results will appear here.</p>
            )}
          </section>

          <section className="tool-card">
            <div className="panel-heading">
              <h2>Token List</h2>
              <span>{room.tokens.length} total</span>
            </div>
            {room.tokens.length ? (
              <div className="token-list">
                {room.tokens.map((token) => (
                  <article key={token.id} style={{ borderColor: token.color }}>
                    <div>
                    <strong>
                      {token.imageUrl ? <img className="token-list-image" alt="" draggable={false} src={token.imageUrl} /> : token.icon} {token.name}
                    </strong>
                      <small>
                        {token.type} · {token.ownerName}
                        {token.hp ? ` · ${token.hp}` : ""}
                      </small>
                    </div>
                    <div className="token-actions">
                      <button onClick={() => setSelectedTokenId(token.id)} type="button">
                        Edit
                      </button>
                      {isDm ? (
                        <button onClick={() => addInitiative(token)} type="button">
                          Init
                        </button>
                      ) : null}
                      {canControl(token) ? (
                        <button onClick={() => deleteToken(token.id)} type="button">
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">Create a token from the left panel to place it on the grid.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
