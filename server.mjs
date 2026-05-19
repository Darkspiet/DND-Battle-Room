import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const args = process.argv.slice(2);
const portArg = args.findIndex((arg) => arg === "-p" || arg === "--port");
const hostArg = args.findIndex((arg) => arg === "-H" || arg === "--hostname" || arg === "--host");
const port = Number(process.env.PORT ?? (portArg >= 0 ? args[portArg + 1] : 3000));
const hostname = process.env.HOSTNAME ?? (hostArg >= 0 ? args[hostArg + 1] : "0.0.0.0");
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
let handleUpgrade;
const roomStore = globalThis.dndRoomStore ?? new Map();
globalThis.dndRoomStore = roomStore;

const playerColors = [
  "#e85d75",
  "#2fbf71",
  "#3d8bfd",
  "#f2b84b",
  "#9b6ef3",
  "#16a3a3"
];
const socketsByRoom = new Map();
const tokenSequences = new Map();

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcast(roomCode, message, exceptSocket = null) {
  const sockets = socketsByRoom.get(roomCode);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket !== exceptSocket) send(socket, message);
  }
}

function assignColor(members, ignoreId, fallback) {
  if (fallback && !members.some((member) => member.id !== ignoreId && member.color.toLowerCase() === fallback.toLowerCase())) {
    return fallback;
  }

  const used = new Set(members.filter((member) => member.id !== ignoreId).map((member) => member.color.toLowerCase()));
  return playerColors.find((color) => !used.has(color.toLowerCase())) ?? playerColors[0];
}

function toMember(profile, role, now = Date.now()) {
  return {
    ...profile,
    role,
    joinedAt: now,
    lastSeen: now
  };
}

function createRoom(roomCode, profile) {
  const now = Date.now();
  const assignedProfile = { ...profile, color: assignColor([], profile.id, profile.color) };
  return {
    roomCode,
    createdAt: now,
    dmId: assignedProfile.id,
    members: [toMember(assignedProfile, "dm", now)],
    grid: {
      rows: 18,
      columns: 26,
      cellSize: 44,
      background: "#f4efe3",
      feetPerCell: 5
    },
    tokens: [],
    drawings: [],
    effects: [],
    rolls: [],
    initiative: []
  };
}

function getRoom(roomCode) {
  return roomStore.get(roomCode.toUpperCase()) ?? null;
}

function setRoom(room) {
  roomStore.set(room.roomCode.toUpperCase(), room);
  return room;
}

function joinRoom(roomCode, profile) {
  const code = roomCode.toUpperCase();
  const existing = getRoom(code);
  if (!existing) return setRoom(createRoom(code, profile));

  const now = Date.now();
  const currentMember = existing.members.find((member) => member.id === profile.id);
  const role = existing.dmId === profile.id ? "dm" : "player";
  const assignedProfile = { ...profile, color: assignColor(existing.members, profile.id, currentMember?.color ?? profile.color) };
  const room = {
    ...existing,
    members: currentMember
      ? existing.members.map((member) =>
          member.id === profile.id ? { ...member, ...assignedProfile, role: member.role, lastSeen: now } : member
        )
      : [...existing.members, toMember(assignedProfile, role, now)]
  };
  return setRoom(room);
}

function canControlToken(room, profileId, token) {
  return room.dmId === profileId || token.ownerId === profileId;
}

function clampTokenPosition(room, token, x, y) {
  return {
    x: Math.max(0, Math.min(room.grid.columns - token.size, Math.floor(Number(x)))),
    y: Math.max(0, Math.min(room.grid.rows - token.size, Math.floor(Number(y))))
  };
}

function applyTokenMove(message) {
  const room = getRoom(message.roomCode);
  if (!room) return { error: "Room not found" };

  const token = room.tokens.find((item) => item.id === message.tokenId);
  if (!token) return { error: "Token not found" };
  if (!canControlToken(room, message.profileId, token)) return { error: "You cannot move that token" };

  const sequenceKey = `${room.roomCode}:${token.id}`;
  const previousSequence = tokenSequences.get(sequenceKey) ?? 0;
  if (message.seq < previousSequence) {
    return { stale: true, token };
  }
  tokenSequences.set(sequenceKey, message.seq);

  const position = clampTokenPosition(room, token, message.x, message.y);
  const nextToken = { ...token, ...position };
  const nextRoom = setRoom({
    ...room,
    tokens: room.tokens.map((item) => (item.id === token.id ? nextToken : item))
  });
  return { room: nextRoom, token: nextToken };
}

function mergeRoomPatch(incomingRoom, tokenSequencesFromClient = {}) {
  const existingRoom = getRoom(incomingRoom.roomCode);
  if (!existingRoom) return incomingRoom;

  const existingTokens = new Map(existingRoom.tokens.map((token) => [token.id, token]));
  const tokens = incomingRoom.tokens.map((incomingToken) => {
    const existingToken = existingTokens.get(incomingToken.id);
    if (!existingToken) return incomingToken;

    const serverSequence = tokenSequences.get(`${existingRoom.roomCode}:${incomingToken.id}`) ?? 0;
    const clientSequence = tokenSequencesFromClient[incomingToken.id] ?? 0;
    if (serverSequence > clientSequence) {
      return { ...incomingToken, x: existingToken.x, y: existingToken.y };
    }
    return incomingToken;
  });

  return { ...incomingRoom, tokens };
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function isValidProfile(profile) {
  return Boolean(profile?.id && profile?.nickname && profile?.color);
}

await app.prepare();
handleUpgrade = app.getUpgradeHandler();

const server = createServer((req, res) => {
  handle(req, res);
});
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    handleUpgrade(req, socket, head);
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (socket) => {
  socket.on("message", (raw) => {
    const message = parseMessage(raw);
    if (!message?.type) {
      send(socket, { type: "sync_error", message: "Malformed realtime message" });
      return;
    }

    if (message.type === "join_room") {
      if (!message.roomCode || !isValidProfile(message.profile)) {
        send(socket, { type: "sync_error", message: "Invalid room join" });
        return;
      }

      const room = joinRoom(message.roomCode, message.profile);
      socket.roomCode = room.roomCode;
      socket.profileId = message.profile.id;
      const sockets = socketsByRoom.get(room.roomCode) ?? new Set();
      sockets.add(socket);
      socketsByRoom.set(room.roomCode, sockets);
      send(socket, { type: "room_snapshot", room });
      broadcast(room.roomCode, { type: "room_snapshot", room }, socket);
      return;
    }

    if (!socket.roomCode || !socket.profileId || socket.roomCode !== String(message.roomCode ?? "").toUpperCase()) {
      send(socket, { type: "sync_error", message: "Join a room before sending updates" });
      return;
    }

    if (message.type === "token_move_preview" || message.type === "token_move_commit") {
      const result = applyTokenMove({ ...message, profileId: socket.profileId });
      if (result.error) {
        send(socket, { type: "sync_error", message: result.error });
        return;
      }
      if (result.stale) return;

      const outbound = {
        type: message.type,
        roomCode: socket.roomCode,
        token: result.token,
        seq: message.seq,
        profileId: socket.profileId
      };
      broadcast(socket.roomCode, outbound, socket);
      if (message.type === "token_move_commit") send(socket, outbound);
      return;
    }

    if (message.type === "room_patch") {
      if (!message.room || message.room.roomCode !== socket.roomCode) {
        send(socket, { type: "sync_error", message: "Invalid room patch" });
        return;
      }
      const room = setRoom(mergeRoomPatch(message.room, message.tokenSequences));
      broadcast(socket.roomCode, { type: "room_snapshot", room }, socket);
      return;
    }
  });

  socket.on("close", () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const sockets = socketsByRoom.get(roomCode);
    sockets?.delete(socket);
    if (sockets?.size === 0) socketsByRoom.delete(roomCode);
  });
});

server.listen(port, hostname, () => {
  console.log(`DND Battle Room listening on http://${hostname}:${port}`);
});
