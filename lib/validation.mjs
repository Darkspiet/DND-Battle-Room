export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireThat(condition, message = 'Invalid request.', status = 400) { if (!condition) throw new ApiError(status, message); }
export function object(value, keys) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value));
  if (keys) requireThat(Object.keys(value).every(key => keys.includes(key)), 'Unexpected request field.');
  return value;
}
export function text(value, max = 100, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  requireThat(typeof value === 'string' && value.length <= max && !/[\u0000]/.test(value), 'Invalid text value.');
  return value;
}
export function identifier(value) { requireThat(typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(value), 'Invalid identifier.'); return value; }
export function number(value, min, max) { requireThat(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, 'Number is outside the allowed range.'); return value; }
export function color(value) { requireThat(typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value), 'Use a six-digit hex color.'); return value; }
export function array(value, max) { requireThat(Array.isArray(value) && value.length <= max, 'Too many items.'); return value; }
export function oneOf(value, choices) { requireThat(choices.includes(value), 'Invalid choice.'); return value; }
export function image(value, max = 2 * 1024 * 1024) {
  if (value === undefined || value === null || value === '') return undefined;
  text(value, Math.ceil(max * 4 / 3) + 128);
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    requireThat(!url.username && !url.password && value.length <= 2048, 'Invalid image URL.');
    requireThat(!(process.env.APP_URL?.startsWith('https://') && url.protocol !== 'https:'), 'Use HTTPS image URLs.');
    return value;
  }
  const match = value.match(/^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/);
  requireThat(match, 'Use a PNG, JPEG, WebP or GIF image.');
  const bytes = Buffer.from(match[2], 'base64');
  requireThat(bytes.length <= max && bytes.length >= 12, 'Image is too large or invalid.');
  const signature = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : match[1] === 'gif' ? /^GIF8[79]a$/.test(bytes.subarray(0,6).toString())
    : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  requireThat(signature, 'Image content does not match its format.');
  if (match[1] === 'png' && bytes.length >= 24) requireThat(bytes.readUInt32BE(16) <= 4096 && bytes.readUInt32BE(20) <= 4096, 'Image dimensions are too large.');
  if (match[1] === 'gif') requireThat(bytes.readUInt16LE(6) <= 4096 && bytes.readUInt16LE(8) <= 4096, 'Image dimensions are too large.');
  return value;
}
export const MAX_BODY = 16 * 1024 * 1024;
export async function readJSON(request) {
  requireThat(Number(request.headers.get('content-length') ?? 0) <= MAX_BODY, 'Request is too large.', 413);
  requireThat(request.body, 'Missing request body.');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BODY) { await reader.cancel(); throw new ApiError(413, 'Request is too large.'); } chunks.push(Buffer.from(value)); }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Malformed JSON.'); }
}
const limits = globalThis.dndRateLimits ??= new Map();
export function rateLimit(key, max = 120, windowMs = 60000) {
  const now = Date.now();
  if (limits.size >= 20000) {
    for (const [id, record] of limits) if (record.until <= now) limits.delete(id);
    requireThat(limits.size < 20000, 'Server is busy. Try again shortly.', 429);
  }
  let record = limits.get(key);
  if (!record || record.until <= now) { record = { count: 0, until: now + windowMs }; limits.set(key, record); }
  requireThat(++record.count <= max, 'Too many requests. Try again shortly.', 429);
}
export function originAllowed(origin) {
  return typeof origin === 'string' && !!process.env.APP_URL && origin === new URL(process.env.APP_URL).origin;
}
