import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

function origin(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
    throw new Error(`${name} must be an HTTP(S) origin without a trailing slash`);
  }
  return value;
}

export function loadConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return {
    databaseUrl,
    port: positiveInteger('PORT', 3000),
    publicBaseUrl: origin('PUBLIC_BASE_URL'),
    frontendOrigin: origin('FRONTEND_ORIGIN'),
    captureRateLimit: positiveInteger('CAPTURE_RATE_LIMIT', 120),
    createRateLimit: positiveInteger('CREATE_RATE_LIMIT', 10),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const APP_CONFIG = Symbol('APP_CONFIG');
