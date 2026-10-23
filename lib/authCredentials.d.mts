export function normalizeUsername(username: string): string;
export function validateCredentials(username: string, password: string): string;
export function hashPassword(password: string, salt?: string): { salt: string; hash: string };
