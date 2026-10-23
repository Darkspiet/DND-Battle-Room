import type { Pool } from 'pg';
export function dbPool(): Pool;
export function databaseReady(): Promise<void>;
