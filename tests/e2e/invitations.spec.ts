import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hashOpaqueToken } from "../../lib/server/session";

const password = "An invited DM passphrase 2026";
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

test("DM dashboard invitations, signup UI and single-use enforcement", async ({ page, request, playwright }) => {
  expect((await request.get("/api/v1/auth/signup")).headers()["cache-control"]).toBe("no-store");
  expect(await (await request.get("/api/v1/auth/signup")).json()).toEqual({ inviteRequired: true });
  expect((await request.post("/api/v1/auth/invites")).status()).toBe(401);
  const account = () => ({ username: `invite-${randomUUID().slice(0, 12)}`, password, displayName: "Invited DM" });
  expect((await request.post("/api/v1/auth/signup", { data: account() })).status()).toBe(400);
  expect((await request.post("/api/v1/auth/signup", { data: { ...account(), inviteCode: "x' OR '1'='1" } })).status()).toBe(400);
  await page.goto("/dm/login");
  await page.getByLabel("Username", { exact: true }).fill("e2e-admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.getByText("DM invitations", { exact: true }).click();
  await page.getByRole("button", { name: "Generate DM invitation" }).click();
  const code = await page.getByLabel("DM invitation code").inputValue();
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await test.info().attach("DM invitation desktop", { body: await page.screenshot({ path: test.info().outputPath("dm-invitation-desktop.png") }), contentType: "image/png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await test.info().attach("DM invitation mobile", { body: await page.screenshot({ path: test.info().outputPath("dm-invitation-mobile.png") }), contentType: "image/png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  const issuer = await playwright.request.newContext({ baseURL: origin });
  expect((await issuer.post("/api/v1/auth/signin", { data: { username: "e2e-admin", password: process.env.E2E_ADMIN_PASSWORD } })).ok()).toBe(true);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    expect((await issuer.post("/api/v1/auth/invites", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    const stored = await pool.query("select token_hash, used_at from dm_invites where token_hash=$1", [hashOpaqueToken(code)]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).not.toBe(code);
    // A failed account insertion must not burn the invitation.
    expect((await request.post("/api/v1/auth/signup", { data: { ...account(), username: "e2e-admin", inviteCode: code } })).status()).toBe(400);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.goto("/dm/login");
    await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.getByLabel("DM invitation code").fill(code);
    await page.getByLabel("Display name", { exact: true }).fill("Invited Keeper");
    await page.getByLabel("Username", { exact: true }).fill(account().username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create DM account", exact: true }).click();
    await expect(page).toHaveURL(/\/dm\/dashboard/);
    expect((await request.post("/api/v1/auth/signup", { data: { ...account(), inviteCode: code } })).status()).toBe(400);
  } finally { await issuer.dispose(); await pool.end(); }
});
