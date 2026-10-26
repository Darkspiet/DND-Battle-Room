import { users } from "../../db/schema";
import { signUpDM } from "../../lib/server/auth";
import { db, pool } from "../../lib/server/db";

export default async function globalSetup() {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("Playwright refuses to reset a database unless DATABASE_URL contains _test.");
  }
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error("E2E_ADMIN_PASSWORD with at least 12 characters is required.");

  await db.delete(users);
  await signUpDM({ username: "e2e-admin", displayName: "E2E Dungeon Master", password, color: "#b83c52" });
  await pool.end();
}
