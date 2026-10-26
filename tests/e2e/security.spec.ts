import { expect, test, type APIRequestContext } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { DiceRollRecord, SceneRecord, SceneToken } from "../../lib/domain/types";
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const password = `A long ' \" $ # ü 🔥 passphrase`;
async function socketFor(api: APIRequestContext) {
  const cookie = (await api.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const socket = io(origin, { transports: ["websocket"], extraHeaders: { Origin: origin, Cookie: cookie } });
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
  return socket;
}
async function ack<T = { scene: SceneRecord; id: string }>(socket: Socket, event: string, input: unknown): Promise<T> {
  const result: { ok: true; data: T } | { ok: false; error: { code: string } } = await socket.timeout(5000).emitWithAck(event, input);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
async function signup(api: APIRequestContext) {
  await api.post("/api/v1/auth/signin", { data: { username: "e2e-admin", password: process.env.E2E_ADMIN_PASSWORD } });
  const invitation = await api.post("/api/v1/auth/invites");
  expect(invitation.ok()).toBeTruthy();
  const { code: inviteCode } = await invitation.json();
  await api.delete("/api/v1/auth/session");
  const username = `dm-${randomUUID().slice(0, 12)}`;
  const response = await api.post("/api/v1/auth/signup", { data: { username, password, inviteCode, displayName: "Security DM", color: "#b83c52" } });
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).user.role).toBe("dm");
  return username;
}
test("invited signup, literal credentials, SQL and origin safety", async ({ request }) => {
  const username = await signup(request);
  expect((await request.post("/api/v1/auth/signin", { data: { username: `x' OR '1'='1`, password } })).status()).toBe(400);
  expect((await request.post("/api/v1/auth/signin", { data: { username, password: `x' OR '1'='1` } })).ok()).toBe(false);
  expect((await request.post("/api/v1/auth/signin", { data: { username, password } })).ok()).toBe(true);
  expect((await request.post("/api/v1/campaigns", { headers: { Origin: "https://evil.example" }, data: { name: "Foreign origin" } })).status()).toBe(403);
  expect((await request.post("/api/v1/auth/signup", { data: { username: "short-test", password: "short", displayName: "Short" } })).status()).toBe(400);
});

test("recipient privacy, guest authority, reassignment, deduplication and revocation", async ({ playwright, request }) => {
  await signup(request);
  const otherDM = await playwright.request.newContext({ baseURL: origin });
  const guest = await playwright.request.newContext({ baseURL: origin });
  const stranger = await playwright.request.newContext({ baseURL: origin });
  const sockets: Socket[] = [];
  try {
    await signup(otherDM);
    const created = await (await request.post("/api/v1/campaigns", { data: { name: "Security encounter" } })).json();
    const { campaign } = created;
    expect((await otherDM.get(`/api/v1/campaigns/${campaign.id}`)).ok()).toBe(false);
    const joined = await (await guest.post(`/api/v1/join/${campaign.joinCode}`, { data: { nickname: "Guest" } })).json();
    const outsider = await (await stranger.post(`/api/v1/join/${campaign.joinCode}`, { data: { nickname: "Guest" } })).json();
    expect(joined.player.id).not.toBe(outsider.player.id);
    const dm = await socketFor(request); sockets.push(dm);
    const guestSocket = await socketFor(guest); sockets.push(guestSocket);
    const strangerSocket = await socketFor(stranger); sockets.push(strangerSocket);
    await ack(dm, "campaign:watch", { campaignId: campaign.id });
    await ack(dm, "players:set-destination", { campaignId: campaign.id, playerIds: [joined.player.id, outsider.player.id], destination: { kind: "scene", sceneId: created.scene.id } });
    let { scene } = await ack<{ scene: SceneRecord }>(dm, "scene:join", { sceneId: created.scene.id });
    await ack(guestSocket, "scene:join", { sceneId: scene.id });
    await ack(strangerSocket, "scene:join", { sceneId: scene.id });
    const token: SceneToken = { id: randomUUID(), name: "DM monster", icon: "M", kind: "monster", ownerId: null, color: "#b83c52", x: 1, y: 1, size: 1, hp: "Secret HP", note: "Secret DM note", conditions: [] };
    const commandId = randomUUID();
    const envelope = { commandId, sceneId: scene.id, baseVersion: scene.version, command: { type: "token.create", token } };
    ({ scene } = await ack(dm, "scene:command", envelope));
    const repeated = await ack(dm, "scene:command", envelope);
    expect(repeated.scene.version).toBe(scene.version);
    expect(scene.state.tokens.filter((t) => t.id === token.id)).toHaveLength(1);
    const readGuest = async () => (await (await guest.get(`/api/v1/scenes/${scene.id}`)).json()).scene as SceneRecord;
    expect(JSON.stringify(await readGuest())).not.toContain("Secret");
    await expect(ack(guestSocket, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.move", tokenId: token.id, x: 3, y: 3 } })).rejects.toThrow("FORBIDDEN");
    ({ scene } = await ack(dm, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.update", tokenId: token.id, patch: { ownerId: joined.player.id, ownerName: "Forged" } } }));
    const reassigned = (await readGuest()).state.tokens.find((t) => t.id === token.id)!;
    expect(reassigned.hp).toBe("Secret HP");
    expect(reassigned.ownerName).toBe("Guest");
    expect(JSON.stringify(reassigned)).not.toContain("Secret DM note");
    const strangerScene = (await (await stranger.get(`/api/v1/scenes/${scene.id}`)).json()).scene;
    expect(JSON.stringify(strangerScene)).not.toContain("Secret");
    ({ scene } = await ack(dm, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.update", tokenId: token.id, patch: { note: "Updated private DM note" } } }));
    expect(JSON.stringify(await readGuest())).not.toContain("Updated private DM note");
    const own = { ...token, id: randomUUID(), ownerId: joined.player.id, ownerName: "Guest", note: "My note", hp: "25" };
    ({ scene } = await ack(guestSocket, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.create", token: own } }));
    ({ scene } = await ack(guestSocket, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.update", tokenId: own.id, patch: { name: "Edited" } } }));
    ({ scene } = await ack(guestSocket, "scene:command", { commandId: randomUUID(), sceneId: scene.id, baseVersion: scene.version, command: { type: "token.delete", tokenId: own.id } }));
    const seenDM: DiceRollRecord[] = [], seenStranger: DiceRollRecord[] = [];
    dm.on("dice:result", (roll) => seenDM.push(roll)); strangerSocket.on("dice:result", (roll) => seenStranger.push(roll));
    const roll = await ack(guestSocket, "dice:roll", { campaignId: campaign.id, sceneId: scene.id, expression: "2d20+5", private: true });
    await expect.poll(() => seenDM.length).toBe(1);
    expect(seenDM[0].id).toBe(roll.id); expect(seenStranger).toHaveLength(0);
    const reload = await ack(dm, "scene:join", { sceneId: scene.id });
    expect(reload.scene.version).toBe(scene.version);
    await request.delete("/api/v1/auth/session");
    dm.emit("scene:join", { sceneId: scene.id });
    await expect.poll(() => dm.connected).toBe(false);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await Promise.all([guest.dispose(), stranger.dispose(), otherDM.dispose()]);
  }
});
