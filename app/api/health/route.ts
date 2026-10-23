import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('select id from dm_profiles limit 0');
    return NextResponse.json({ status: 'ok' });
  } catch { return NextResponse.json({ status: 'unavailable' }, { status: 503 }); }
  finally { await pool.end(); }
}
