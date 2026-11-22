import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, '../..');

function loadDotEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadDotEnvIfPresent(): void {
  loadDotEnvFile(path.join(BACKEND_ROOT, '.env'));
  loadDotEnvFile(path.resolve(BACKEND_ROOT, '..', '.env'));
}

loadDotEnvIfPresent();

export interface AppConfig {
  port: number;
  host: string;
  frontendOrigin: string;
  sessionTtlDays: number;
  sessionCookieName: string;
  isProduction: boolean;
  cookieSecure: boolean;
  googleBooksApiKey: string | null;
  geminiApiKey: string | null;
  geminiModel: string;
  uploadsDir: string;
  staticDir: string | null;
}

export function getConfig(): AppConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultStaticDir = isProduction
    ? path.resolve(BACKEND_ROOT, '../frontend/dist')
    : null;
  const staticDir = process.env.STATIC_DIR?.trim() || defaultStaticDir;

  return {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? '127.0.0.1',
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    sessionTtlDays: Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 365)),
    sessionCookieName: 'bookshelf_session',
    isProduction,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() || null,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    uploadsDir: process.env.UPLOADS_DIR?.trim() || path.join(BACKEND_ROOT, 'uploads'),
    staticDir,
  };
}
