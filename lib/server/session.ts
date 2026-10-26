import { createHash, randomBytes } from "node:crypto";

export const DM_SESSION_COOKIE = "dnd-dm-session";
export const PLAYER_SESSION_COOKIE = "dnd-player-session";
export const DM_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const PLAYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseCookieHeader(header?: string) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try { cookies.set(key, decodeURIComponent(value)); } catch { /* Ignore malformed cookies. */ }
  }
  return cookies;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.APP_URL ?? process.env.APP_ORIGIN)?.startsWith("https://") ?? process.env.NODE_ENV === "production",
    maxAge,
    path: "/"
  };
}
