import { sceneForActor } from "../domain/privacy";
import type { SceneRecord } from "../domain/types";
import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { z, ZodError } from "zod";
import {
  audioStateSchema,
  diceRollSchema,
  initiativeRollSchema,
  initiativeSubmitSchema,
  playerDestinationSchema,
  sceneCommandEnvelopeSchema
} from "../domain/contracts";
import { authorizeSceneCommand, DomainError } from "../domain/sceneReducer";
import type { CampaignPlayer, DMUser } from "../domain/types";
import { getDMBySessionToken } from "./auth";
import {
  commitSceneCommand,
  getCampaignWorkspace,
  getPlayerBySessionToken,
  getScene,
  getSceneActor,
  rollDice,
  rollSceneInitiative,
  setAudioState,
  setPlayerDestinations,
  submitInitiative,
  undoSceneCommand
} from "./campaigns";
import { DM_SESSION_COOKIE, parseCookieHeader, PLAYER_SESSION_COOKIE } from "./session";

type SocketIdentity = {
  dm: DMUser | null;
  player: CampaignPlayer | null;
};

type Ack<T = unknown> = (result: { ok: true; data: T } | { ok: false; error: RealtimeError }) => void;

type RealtimeError = {
  code: string;
  message: string;
  fields?: Record<string, string[] | undefined>;
};

const sceneIdSchema = z.object({ sceneId: z.string().uuid() });
const sceneUndoSchema = sceneIdSchema.extend({ commandId: z.string().uuid(), baseVersion: z.number().int().min(0) });
const campaignIdSchema = z.object({ campaignId: z.string().uuid() });
const tokenPreviewSchema = z.object({
  sceneId: z.string().uuid(),
  tokenId: z.string().uuid(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  sequence: z.number().int().min(0)
});
const destinationEventSchema = playerDestinationSchema.extend({ campaignId: z.string().uuid() });
const audioEventSchema = audioStateSchema.extend({ campaignId: z.string().uuid() });

function room(kind: "campaign" | "scene" | "player", id: string) {
  return `${kind}:${id}`;
}

function errorPayload(error: unknown): RealtimeError {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "The realtime request was invalid.",
      fields: error.flatten().fieldErrors as Record<string, string[] | undefined>
    };
  }
  return {
    code: "REQUEST_FAILED",
    message: "The realtime request could not be completed. Reconnect and try again."
  };
}

function respond<T>(ack: Ack<T> | undefined, work: () => Promise<T>) {
  const reply = typeof ack === "function" ? ack : undefined;
  void work()
    .then((data) => reply?.({ ok: true, data }))
    .catch((error) => reply?.({ ok: false, error: errorPayload(error) }));
}

async function socketIdentity(socket: Socket): Promise<SocketIdentity> {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const [dm, player] = await Promise.all([
    getDMBySessionToken(cookies.get(DM_SESSION_COOKIE)),
    getPlayerBySessionToken(cookies.get(PLAYER_SESSION_COOKIE))
  ]);
  return { dm, player };
}

function requireSocketDM(socket: Socket) {
  const dm = (socket.data.identity as SocketIdentity | undefined)?.dm;
  if (!dm) throw new DomainError("FORBIDDEN", "Sign in as a DM first.");
  return dm;
}

async function watchCampaign(socket: Socket, campaignId: string) {
  const identity = socket.data.identity as SocketIdentity;
  if (identity.dm) {
    await getCampaignWorkspace(identity.dm.id, campaignId);
  } else if (identity.player?.campaignId !== campaignId) {
    throw new DomainError("FORBIDDEN", "You are not part of this campaign.");
  }
  if (!identity.dm && !identity.player) throw new DomainError("FORBIDDEN", "Join or sign in first.");
  await socket.join(room("campaign", campaignId));
  if (identity.player) socket.to(room("campaign", campaignId)).emit("campaign:changed", { campaignId });
  return { campaignId };
}

function trustedSocketOrigin(origin?: string) {
  if (!origin) return false;
  const expected = process.env.APP_URL ?? process.env.APP_ORIGIN;
  if (!expected) return false;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export function attachRealtime(server: HttpServer) {
  const io = new Server(server, {
    path: "/socket.io",
    serveClient: false,
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 128 * 1024,
    allowRequest: (request, callback) => callback(null, trustedSocketOrigin(request.headers.origin))
  });

  io.use(async (socket, next) => {
    try {
      const identity = await socketIdentity(socket);
      if (!identity.dm && !identity.player) return next(new Error("AUTH_REQUIRED"));
      if (io.sockets.sockets.size >= 256) return next(new Error("CONNECTION_LIMIT"));
      socket.data.identity = identity;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("AUTH_REQUIRED"));
    }
  });

  async function broadcastScene(scene: SceneRecord, envelope: Record<string, unknown>) {
    for (const connected of io.sockets.sockets.values()) {
      if (!connected.rooms.has(room("scene", scene.id))) continue;
      try {
        const current = await socketIdentity(connected);
        const actor = await getSceneActor({ sceneId: scene.id, ...current });
        connected.emit("scene:committed", { ...envelope, scene: sceneForActor(scene, actor) });
      } catch { connected.disconnect(true); }
    }
  }

  io.on("connection", (socket) => {
    let identity = socket.data.identity as SocketIdentity;
    if (identity.dm) void socket.join(room("player", identity.dm.id));
    if (identity.player) void socket.join(room("player", identity.player.id));

    let budget = 600;
    let windowStart = Date.now();
    socket.use(async (_packet, next) => {
      try {
        if (Date.now() - windowStart > 10000) { windowStart = Date.now(); budget = 600; }
        if (--budget < 0) { socket.disconnect(true); return; }
        identity = await socketIdentity(socket);
        socket.data.identity = identity;
        if (!identity.dm && !identity.player) { socket.disconnect(true); return; }
        next();
      } catch { socket.disconnect(true); }
    });

    socket.on("campaign:watch", (raw, ack?: Ack<{ campaignId: string }>) => {
      respond(ack, async () => watchCampaign(socket, campaignIdSchema.parse(raw).campaignId));
    });

    socket.on("campaign:changed", (raw, ack?: Ack<{ campaignId: string }>) => {
      respond(ack, async () => {
        const dm = requireSocketDM(socket);
        const { campaignId } = campaignIdSchema.parse(raw);
        await getCampaignWorkspace(dm.id, campaignId);
        socket.to(room("campaign", campaignId)).emit("campaign:changed", { campaignId });
        return { campaignId };
      });
    });

    socket.on("scene:join", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const { sceneId } = sceneIdSchema.parse(raw);
        const actor = await getSceneActor({ sceneId, ...identity });
        const scene = await getScene(sceneId);
        await socket.join(room("campaign", actor.campaignId));
        await socket.join(room("scene", sceneId));
        return { actor, scene: scene ? sceneForActor(scene, actor) : null };
      });
    });

    socket.on("scene:command", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const envelope = sceneCommandEnvelopeSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: envelope.sceneId, ...identity });
        const scene = await commitSceneCommand(
          actor,
          envelope.sceneId,
          envelope.baseVersion,
          envelope.command,
          envelope.commandId
        );
        await broadcastScene(scene, { commandId: envelope.commandId, actor });
        return { commandId: envelope.commandId, scene: sceneForActor(scene, actor) };
      });
    });

    socket.on("scene:undo", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const input = sceneUndoSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: input.sceneId, ...identity });
        const scene = await undoSceneCommand(actor, input.sceneId, input.baseVersion);
        await broadcastScene(scene, { commandId: input.commandId, actor });
        return { commandId: input.commandId, scene: sceneForActor(scene, actor) };
      });
    });

    socket.on("token:preview", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const preview = tokenPreviewSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: preview.sceneId, ...identity });
        const scene = await getScene(preview.sceneId);
        if (!scene) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
        authorizeSceneCommand(actor, scene.state, {
          type: "token.move",
          tokenId: preview.tokenId,
          x: preview.x,
          y: preview.y
        });
        socket.to(room("scene", preview.sceneId)).emit("token:preview", {
          ...preview,
          actorId: actor.id
        });
        return preview;
      });
    });

    socket.on("dice:roll", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const input = diceRollSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: input.sceneId, ...identity });
        if (actor.campaignId !== input.campaignId)
          throw new DomainError("FORBIDDEN", "That scene is not part of this campaign.");
        const result = await rollDice(actor, input.sceneId, input.expression, input.private);
        for (const connected of io.sockets.sockets.values()) {
          if (!connected.rooms.has(room("campaign", actor.campaignId))) continue;
          try {
            const current = await socketIdentity(connected);
            if (current.dm) await getCampaignWorkspace(current.dm.id, actor.campaignId);
            else if (!current.player || current.player.campaignId !== actor.campaignId) continue;
            if (!result.private || current.dm || current.player?.id === actor.id) connected.emit("dice:result", result);
          } catch { connected.disconnect(true); }
        }
        return result;
      });
    });

    socket.on("combat:initiative", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const input = initiativeSubmitSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: input.sceneId, ...identity });
        if (actor.campaignId !== input.campaignId)
          throw new DomainError("FORBIDDEN", "That scene is not part of this campaign.");
        const scene = await submitInitiative(
          actor,
          input.sceneId,
          input.tokenId,
          input.baseVersion,
          input.initiative,
          input.dexModifier,
          { mode: "manual", source: actor.role === "dm" ? "dm" : "manual" }
        );
        await broadcastScene(scene, { commandId: randomUUID(), actor });
        return { scene: sceneForActor(scene, actor) };
      });
    });

    socket.on("combat:initiative-roll", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const input = initiativeRollSchema.parse(raw);
        const actor = await getSceneActor({ sceneId: input.sceneId, ...identity });
        if (actor.campaignId !== input.campaignId)
          throw new DomainError("FORBIDDEN", "That scene is not part of this campaign.");
        const scene = await rollSceneInitiative(
          actor,
          input.sceneId,
          input.tokenId,
          input.baseVersion,
          input.dexModifier,
          input.mode
        );
        await broadcastScene(scene, { commandId: randomUUID(), actor });
        return { scene: sceneForActor(scene, actor) };
      });
    });

    socket.on("players:set-destination", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const dm = requireSocketDM(socket);
        const input = destinationEventSchema.parse(raw);
        const players = await setPlayerDestinations(dm.id, input.campaignId, input.playerIds, input.destination);
        for (const connected of io.sockets.sockets.values()) {
          const connectedIdentity = connected.data.identity as SocketIdentity | undefined;
          const updatedPlayer = players.find((player) => player.id === connectedIdentity?.player?.id);
          if (!updatedPlayer || !connectedIdentity) continue;
          connectedIdentity.player = updatedPlayer;
          for (const joinedRoom of connected.rooms) {
            if (joinedRoom.startsWith("scene:")) void connected.leave(joinedRoom);
          }
        }
        io.to(room("campaign", input.campaignId)).emit("players:destination", { players });
        io.to(room("campaign", input.campaignId)).emit("campaign:changed", { campaignId: input.campaignId });
        for (const player of players) {
          io.to(room("player", player.id)).emit("player:destination", { destination: player.destination });
        }
        return { players };
      });
    });

    socket.on("audio:set", (raw, ack?: Ack) => {
      respond(ack, async () => {
        const dm = requireSocketDM(socket);
        const input = audioEventSchema.parse(raw);
        const state = await setAudioState(dm.id, input.campaignId, input);
        io.to(room("campaign", input.campaignId)).emit("audio:state", state);
        return { state };
      });
    });
  });

  return io;
}
