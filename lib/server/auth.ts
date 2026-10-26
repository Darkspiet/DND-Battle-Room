import { hashPassword, passwordMatches, validateCredentials, normalizeUsername } from "../authCredentials.mjs";
import { verify } from "@node-rs/argon2";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { assets, authSessions, dmInvites, passwordResetTokens, users } from "../../db/schema";
import type { DMUser } from "../domain/types";
import { db } from "./db";
import { HttpError } from "./httpError";
import { dmInviteRequired } from "./signupPolicy";
import {
  createOpaqueToken,
  DM_SESSION_MAX_AGE_SECONDS,
  hashOpaqueToken
} from "./session";

function publicUser(row: typeof users.$inferSelect): DMUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: "dm",
    color: row.color,
    avatarAssetId: row.avatarAssetId
  };
}

async function passwordHash(password: string) {
  const { salt, hash } = await hashPassword(password);
  return `scrypt-v1:${salt}:${hash}`;
}
async function checkPassword(encoded: string, password: string) {
  if (encoded.startsWith("scrypt-v1:")) {
    const [, salt, hash] = encoded.split(":");
    return passwordMatches(password, { password_salt: salt, password_hash: hash });
  }
  // Existing recovered Argon2 credentials remain usable.
  return verify(encoded, password).catch(() => false);
}

function newSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + DM_SESSION_MAX_AGE_SECONDS * 1000);
  return {
    token,
    values: { tokenHash: hashOpaqueToken(token), userId, expiresAt }
  };
}

export async function signInDM(username: string, password: string) {
  const [row] = await db.select().from(users).where(eq(users.username, normalizeUsername(username))).limit(1);
  const valid = row ? await checkPassword(row.passwordHash, password) : await checkPassword(`scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`, password);
  if (!row || !valid) {
    throw new Error("DM username or password is incorrect.");
  }
  await db.delete(authSessions).where(and(eq(authSessions.userId, row.id), lt(authSessions.expiresAt, new Date())));
  const session = newSession(row.id);
  await db.insert(authSessions).values(session.values);
  return { user: publicUser(row), token: session.token };
}

export async function signUpDM(input: { username: string; password: string; displayName: string; color: string; inviteCode?: string }) {
  const username = validateCredentials(input.username, input.password);
  const inviteRequired = dmInviteRequired();
  const tokenHash = hashOpaqueToken(input.inviteCode?.trim() ?? "");
  if (inviteRequired) {
    const [invite] = await db.select().from(dmInvites).where(and(
      eq(dmInvites.tokenHash, tokenHash), isNull(dmInvites.usedAt), gt(dmInvites.expiresAt, new Date())
    )).limit(1);
    if (!invite) throw invalidInvite();
  }
  const credential = await passwordHash(input.password);
  return db.transaction(async (tx) => {
    if (inviteRequired) {
      const [invite] = await tx.select().from(dmInvites).where(and(
        eq(dmInvites.tokenHash, tokenHash), isNull(dmInvites.usedAt), gt(dmInvites.expiresAt, new Date())
      )).for("update").limit(1);
      if (!invite || invite.expiresAt.getTime() <= Date.now()) throw invalidInvite();
      await tx.update(dmInvites).set({ usedAt: new Date() }).where(eq(dmInvites.tokenHash, tokenHash));
    }
    const [row] = await tx.insert(users).values({
      username, displayName: input.displayName, role: "dm", color: input.color, passwordHash: credential
    }).onConflictDoNothing().returning();
    if (!row) throw new Error("That DM username is already taken.");
    const session = newSession(row.id);
    await tx.insert(authSessions).values(session.values);
    return { user: publicUser(row), token: session.token };
  });
}

function invalidInvite() {
  return new HttpError(400, "INVITE_REQUIRED", "Enter a valid, unused DM invitation code. Ask an existing DM for a new code if it has expired.");
}

export async function createDMInvite(userId: string) {
  const code = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    const [issuer] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update").limit(1);
    if (!issuer) throw new HttpError(401, "AUTH_REQUIRED", "Sign in as a DM first.");
    await tx.delete(dmInvites).where(and(eq(dmInvites.createdBy, userId), lt(dmInvites.expiresAt, new Date())));
    const pending = await tx.select({ hash: dmInvites.tokenHash }).from(dmInvites).where(and(
      eq(dmInvites.createdBy, userId), isNull(dmInvites.usedAt)
    )).limit(20);
    if (pending.length >= 20) throw new HttpError(429, "INVITE_LIMIT", "You already have 20 unused invitations. Use one or wait for them to expire.");
    await tx.insert(dmInvites).values({ tokenHash: hashOpaqueToken(code), createdBy: userId, expiresAt });
    return { code, expiresAt: expiresAt.toISOString() };
  });
}

export async function getDMBySessionToken(token?: string | null) {
  if (!token) return null;
  const [row] = await db.select({ user: users }).from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashOpaqueToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  return row ? publicUser(row.user) : null;
}

export async function revokeDMSession(token?: string | null) {
  if (!token) return;
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashOpaqueToken(token)));
}

export async function updateDMProfile(
  userId: string,
  patch: { displayName?: string; color?: string; avatarAssetId?: string | null }
) {
  if (patch.avatarAssetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, patch.avatarAssetId), eq(assets.ownerId, userId), eq(assets.kind, "avatar")))
      .limit(1);
    if (!asset) throw new Error("That avatar is not in your account.");
  }
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!row) throw new Error("DM account not found.");
  return publicUser(row);
}

export async function resetDMPassword(code: string, password: string) {
  validateCredentials("reset-user", password);
  const credential = await passwordHash(password);
  return db.transaction(async (tx) => {
    const [reset] = await tx.select().from(passwordResetTokens).where(and(
      eq(passwordResetTokens.tokenHash, hashOpaqueToken(code)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    )).for("update").limit(1);
    if (!reset) throw new Error("That password reset code is invalid or expired.");
    await tx.update(users).set({ passwordHash: credential, updatedAt: new Date() }).where(eq(users.id, reset.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, reset.id));
    await tx.delete(authSessions).where(eq(authSessions.userId, reset.userId));
    return { ok: true };
  });
}

