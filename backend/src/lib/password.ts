import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

/**
 * Hashes a password with Node's built-in scrypt and a 16-byte random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timing-safe comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, hexDigest] = parts;
  if (!salt || !hexDigest) return false;
  const expected = Buffer.from(hexDigest, 'hex');
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
