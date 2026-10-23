"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveCommands, type RoomCommand } from "../../lib/roomCommands";
import { getGuestProfile, saveGuestProfile } from "../../lib/storage";
import type { GuestProfile, RoomState, Token } from "../../lib/types";
import {
  TokenMovePayload,
  normalizeRoomState,
  roomApiPath,
  roomWebSocketUrl,
} from "./model";
type RealtimeMessage =
  | {
      type: "room_snapshot";
      room: RoomState;
    }
  | {
      type: "token_move_preview" | "token_move_commit";
      token: Token;
      seq: number;
      profileId: string;
    }
  | {
      type: "sync_error";
      message: string;
    };
// Owns the only room transport and mutation queue. Views never acknowledge a local save.
export function useRoomConnection(roomCode: string) {
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [syncMode, setSyncMode] = useState<
    "connecting" | "websocket" | "server"
  >("connecting");
  const [syncError, setSyncError] = useState("");
  const roomRef = useRef<RoomState | null>(null);
  const authoritativeRef = useRef<RoomState | null>(null);
  const actorRef = useRef<GuestProfile | null>(null);
  const readyRef = useRef(false);
  const jobsRef = useRef<
    Array<{
      id: string;
      commands: RoomCommand[];
    }>
  >([]);
  const busyRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  function acceptSnapshot(next: RoomState) {
    if (
      authoritativeRef.current &&
      next.revision < authoritativeRef.current.revision
    )
      return;
    const normalized = normalizeRoomState(next);
    authoritativeRef.current = normalized;
    if (!busyRef.current && !jobsRef.current.length) {
      roomRef.current = normalized;
      setRoom(normalized);
    }
  }
  function pause(message: string) {
    readyRef.current = false;
    setSyncMode("connecting");
    setSyncError(message);
    jobsRef.current = [];
    if (authoritativeRef.current) {
      roomRef.current = authoritativeRef.current;
      setRoom(authoritativeRef.current);
    }
    previewCleanupRef.current?.();
  }
  useEffect(() => {
    let cancelled = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch(roomApiPath(roomCode), {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Room unavailable.");
        if (cancelled) return;
        acceptSnapshot(data);
        readyRef.current = true;
        setSyncMode(
          wsRef.current?.readyState === WebSocket.OPEN ? "websocket" : "server",
        );
        setSyncError("");
      } catch (error) {
        if (!cancelled)
          pause(
            error instanceof Error
              ? error.message
              : "Connection lost. Editing is paused.",
          );
      }
    }
    function connect() {
      if (cancelled) return;
      const socket = new WebSocket(roomWebSocketUrl());
      wsRef.current = socket;
      socket.onopen = () =>
        socket.send(JSON.stringify({ type: "join_room", roomCode }));
      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(event.data) as RealtimeMessage & {
            status?: number;
          };
          if (message.type === "room_snapshot") {
            acceptSnapshot(message.room);
            readyRef.current = true;
            setSyncMode("websocket");
            setSyncError("");
          } else if (message.type === "token_move_preview") {
            if (!busyRef.current && !jobsRef.current.length)
              applyLocalTokenMove({
                tokenId: message.token.id,
                x: message.token.x,
                y: message.token.y,
                seq: message.seq,
              });
          } else if (message.type === "sync_error" && message.status !== 429)
            pause(message.message);
        } catch {
          pause("Invalid server response. Editing is paused.");
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (cancelled) return;
        wsRef.current = null;
        pause("Connection lost. Checking saved state...");
        void refresh();
        reconnect = setTimeout(connect, 2000);
      };
    }
    async function open() {
      try {
        const preferences = getGuestProfile();
        const response = await fetch(roomApiPath(roomCode), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: preferences.nickname,
            color: preferences.color,
            avatarUrl: preferences.avatarUrl,
            avatarName: preferences.avatarName,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not join room.");
        if (cancelled) return;
        actorRef.current = data.profile;
        setProfile(data.profile);
        saveGuestProfile(data.profile);
        acceptSnapshot(data.room);
        readyRef.current = true;
        setSyncMode("server");
        connect();
      } catch (error) {
        if (!cancelled)
          pause(
            error instanceof Error ? error.message : "Could not open room.",
          );
      }
    }
    void open();
    const poll = setInterval(() => {
      if (actorRef.current) void refresh();
    }, 2000);
    return () => {
      cancelled = true;
      readyRef.current = false;
      clearInterval(poll);
      if (reconnect) clearTimeout(reconnect);
      wsRef.current?.close();
      jobsRef.current = [];
    };
  }, [roomCode]);
  const currentMember = room?.members.find(
    (member) => member.id === profile?.id,
  );
  const isDm = currentMember?.role === "dm";
  async function pumpCommands() {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      while (jobsRef.current.length && readyRef.current) {
        const job = jobsRef.current.shift()!;
        const response = await fetch(`${roomApiPath(roomCode)}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...job,
            revision: authoritativeRef.current?.revision,
          }),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Changes were not saved.");
        acceptSnapshot(data.room);
      }
    } catch (error) {
      jobsRef.current = [];
      pause(
        error instanceof Error
          ? error.message
          : "Save failed. Editing is paused.",
      );
    } finally {
      busyRef.current = false;
      if (authoritativeRef.current) {
        roomRef.current = authoritativeRef.current;
        setRoom(authoritativeRef.current);
      }
    }
  }
  function sendCommands(commands: RoomCommand[], optimistic?: RoomState) {
    if (!readyRef.current || !commands.length) return;
    if (optimistic) {
      roomRef.current = optimistic;
      setRoom(optimistic);
    }
    jobsRef.current.push({ id: crypto.randomUUID(), commands });
    void pumpCommands();
  }
  function updateRoom(updater: (current: RoomState) => RoomState) {
    const current = roomRef.current;
    if (!current || !readyRef.current) return;
    const next = updater(current);
    sendCommands(
      deriveCommands(current, next, current.dmId === actorRef.current?.id),
      next,
    );
  }
  function applyLocalTokenMove(payload: TokenMovePayload) {
    const current = roomRef.current;
    if (!current) return;
    const next = {
      ...current,
      tokens: current.tokens.map((item) =>
        item.id === payload.tokenId
          ? { ...item, x: payload.x, y: payload.y }
          : item,
      ),
    };
    roomRef.current = next;
    setRoom(next);
  }
  function visibleRolls() {
    if (!room || !profile) return [];
    return room.rolls.filter(
      (roll) => !roll.private || roll.userId === profile.id || isDm,
    );
  }
  function latestRollFor(userId: string) {
    return visibleRolls().find((roll) => roll.userId === userId);
  }
  const registerPreviewCleanup = useCallback((cleanup: () => void) => {
    previewCleanupRef.current = cleanup;
    return () => {
      if (previewCleanupRef.current === cleanup)
        previewCleanupRef.current = null;
    };
  }, []);
  function sendPreview(payload: TokenMovePayload) {
    if (readyRef.current && wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(
        JSON.stringify({ type: "token_move_preview", roomCode, ...payload }),
      );
  }
  function getRoom() {
    return roomRef.current;
  }
  function isReady() {
    return readyRef.current;
  }
  return {
    isDm,
    syncMode,
    room,
    latestRollFor,
    updateRoom,
    profile,
    sendCommands,
    visibleRolls,
    applyLocalTokenMove,
    currentMember,
    syncError,
    registerPreviewCleanup,
    sendPreview,
    getRoom,
    isReady,
  };
}
export type RoomConnection = ReturnType<typeof useRoomConnection>;
export type ReadyRoomConnection = RoomConnection & {
  room: RoomState;
  profile: GuestProfile;
};
