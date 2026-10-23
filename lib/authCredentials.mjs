import { randomBytes, scryptSync } from 'node:crypto';
export function normalizeUsername(username) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}
export function validateCredentials(usernameInput, password) {
  const username = normalizeUsername(usernameInput);
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error('Use 3–32 letters, numbers, dots, underscores or hyphens for the username.');
  if (password.length < 4) throw new Error('Use a password with at least 4 characters.');
  return username;
}
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
