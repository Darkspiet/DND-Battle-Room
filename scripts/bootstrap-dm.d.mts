import type { Pool } from "pg";

export function bootstrapDM(pool: Pool, input: { username: string; password: string; name: string }): Promise<boolean>;
