import { cookies } from "next/headers";
import { getDMBySessionToken } from "./auth";
import { getPlayerBySessionToken } from "./campaigns";
import { HttpError } from "./http";
import { DM_SESSION_COOKIE, PLAYER_SESSION_COOKIE } from "./session";

export async function currentDM() {
  return getDMBySessionToken((await cookies()).get(DM_SESSION_COOKIE)?.value);
}

export async function requireDM() {
  const user = await currentDM();
  if (!user) throw new HttpError(401, "AUTH_REQUIRED", "Sign in as a DM first.");
  return user;
}

export async function currentPlayer() {
  return getPlayerBySessionToken((await cookies()).get(PLAYER_SESSION_COOKIE)?.value);
}

export async function requirePlayer() {
  const player = await currentPlayer();
  if (!player) throw new HttpError(401, "PLAYER_SESSION_REQUIRED", "Join the campaign again.");
  return player;
}

export function assertTrustedMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "UNTRUSTED_ORIGIN", "The request origin is not allowed.");
    return;
  }
  const expected = process.env.APP_URL ?? process.env.APP_ORIGIN;
  if (!expected || origin !== new URL(expected).origin) {
    throw new HttpError(403, "UNTRUSTED_ORIGIN", "The request origin is not allowed.");
  }
}
