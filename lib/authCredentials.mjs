import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
let running = 0;
const queue = [];
export function normalizeUsername(username) { return username.trim().toLowerCase(); }
export function validateCredentials(usernameInput, password) {
  if (typeof usernameInput !== 'string' || typeof password !== 'string') throw new Error('Enter a username and password.');
  const username = normalizeUsername(usernameInput);
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error('Use 3–32 letters, numbers, dots, underscores or hyphens for the username.');
  if ([...password].length < 12 || [...password].length > 128 || Buffer.byteLength(password) > 512 || !password.trim()) throw new Error('Use a password of 12–128 characters. Spaces are allowed.');
  return username;
}
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 512) throw new Error('Password is too long.');
  if (running >= 2) {
    if (queue.length >= 16) { const error = new Error('Authentication is busy. Try again shortly.'); error.status = 429; throw error; }
    await new Promise(resolve => queue.push(resolve));
  } else running++;
  try {
    const hash = await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
    return { salt, hash: hash.toString('hex') };
  } finally {
    const next = queue.shift();
    if (next) next(); else running--;
  }
}
export async function passwordMatches(password, row) {
  const attempted = Buffer.from((await hashPassword(password, row.password_salt)).hash, 'hex');
  const stored = Buffer.from(row.password_hash, 'hex');
  return attempted.length === stored.length && timingSafeEqual(attempted, stored);
}
export function sessionDigest(token) { return createHash('sha256').update(token).digest('hex'); }
