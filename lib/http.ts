import { NextResponse } from 'next/server';
import { ApiError, originAllowed, rateLimit, readJSON } from './validation.mjs';
export { readJSON };
export function guard(request: Request, key = 'api', max = 6000, windowMs = 60000) {
  const origin = request.headers.get('origin');
  if (origin && !originAllowed(origin)) throw new ApiError(403, 'Request origin is not allowed.');
  rateLimit(`${key}:${request.headers.get('x-dnd-client-ip') ?? 'unknown'}`, max, windowMs);
}
export async function respond(action: () => Promise<unknown>) {
  try { return NextResponse.json(await action(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status, headers: error.status === 429 ? { 'Retry-After': '60' } : {} });
    return NextResponse.json({ error: 'Server or database unavailable. Changes have not been saved.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
