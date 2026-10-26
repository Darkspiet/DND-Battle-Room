import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "../../../../lib/server/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
