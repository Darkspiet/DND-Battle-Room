import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://dnd_battle_room@127.0.0.1:5432/dnd_battle_room"
  },
  strict: true,
  verbose: true
});
