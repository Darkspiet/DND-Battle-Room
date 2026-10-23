export function normalizeUsername(username: string): string;
export function validateCredentials(username: string, password: string): string;
export function hashPassword(password: string, salt?: string): Promise<{ salt: string; hash: string }>;
export function passwordMatches(password: string, row: { password_salt: string; password_hash: string }): Promise<boolean>;
export function sessionDigest(token: string): string;
