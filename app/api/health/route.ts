import { NextResponse } from 'next/server';
import { databaseReady } from '../../../lib/db.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await databaseReady(); return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ status: 'unavailable' }, { status: 503 }); }
}
