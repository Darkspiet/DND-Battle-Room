export class ApiError extends Error { status: number; constructor(status: number, message: string); }
export function readJSON(request: Request): Promise<Record<string, unknown>>;
export function rateLimit(key: string, max?: number, windowMs?: number): void;
export function originAllowed(origin: string | null | undefined): boolean;
export const MAX_BODY: number;
