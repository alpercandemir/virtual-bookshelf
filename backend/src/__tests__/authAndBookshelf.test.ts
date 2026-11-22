import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const sessionCookie = list.find((c) => c.startsWith('bookshelf_session='));
  return sessionCookie ? sessionCookie.split(';')[0] : '';
}

describe('Phase 1: Authentication & Bookshelf Foundation', () => {
  let dbPath: string;
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `bookshelf-test-${Date.now()}.db`);
    const dbUrl = `file:${dbPath}`;
    execSync('npx prisma db push --skip-generate', {
      cwd: path.resolve(process.cwd()),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    app = await buildApp({ prisma, disableRateLimit: true });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('registers a user, hashes password securely, sets HTTP-only cookie, and isolates per-user shelves', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice_reader', password: 'StrongPassword123', seedSamples: false },
    });
    expect(reg.statusCode).toBe(201);
    const setCookie = reg.headers['set-cookie'];
    const cookieStr = extractCookie(setCookie);
    expect(cookieStr).toContain('bookshelf_session=');
    expect(String(setCookie)).toContain('HttpOnly');

    // Password must never be stored in plaintext
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { username: 'alice_reader' } });
    expect(dbUser.passwordHash).toMatch(/^scrypt:/);
    expect(dbUser.passwordHash).not.toContain('StrongPassword123');

    // Unauthenticated access to bookshelf is rejected
    const unauth = await app.inject({ method: 'GET', url: '/api/bookshelf' });
    expect(unauth.statusCode).toBe(401);

    // Authenticated user gets their empty default 3-level bookshelf
    const shelfRes = await app.inject({
      method: 'GET',
      url: '/api/bookshelf',
      headers: { cookie: cookieStr },
    });
    expect(shelfRes.statusCode).toBe(200);
    const body = shelfRes.json();
    expect(body.bookshelf.visualTheme).toBe('walnut');
    expect(body.bookshelf.compartments).toHaveLength(5);

    // Update wood finish and layout levels, verify persistence
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/bookshelf',
      headers: { cookie: cookieStr },
      payload: { visualTheme: 'mahogany', name: 'Alice Study' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().bookshelf.visualTheme).toBe('mahogany');
    expect(patchRes.json().bookshelf.name).toBe('Alice Study');

    // Seed sample books, then shrink layout to 1 level -> all sample books preserved!
    const seedRes = await app.inject({
      method: 'POST',
      url: '/api/bookshelf/seed-samples',
      headers: { cookie: cookieStr },
    });
    expect(seedRes.statusCode).toBe(200);
    const seededCount = seedRes.json().bookshelf.compartments.reduce(
      (sum: number, c: { books: unknown[] }) => sum + c.books.length,
      0
    );
    expect(seededCount).toBeGreaterThanOrEqual(15);

    const shrinkRes = await app.inject({
      method: 'PUT',
      url: '/api/bookshelf/layout',
      headers: { cookie: cookieStr },
      payload: {
        levels: [{ row: 0, heightPx: 290, compartments: [{ column: 0, widthRatio: 1 }] }],
      },
    });
    expect(shrinkRes.statusCode).toBe(200);
    const afterShrinkCount = shrinkRes.json().bookshelf.compartments.reduce(
      (sum: number, c: { books: unknown[] }) => sum + c.books.length,
      0
    );
    expect(afterShrinkCount).toBe(seededCount);

    // Logout revokes session
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookieStr },
    });
    expect(logoutRes.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/bookshelf',
      headers: { cookie: cookieStr },
    });
    expect(afterLogout.statusCode).toBe(401);

    // Login again with right password works; wrong password fails
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice_reader', password: 'WrongPassword!' },
    });
    expect(badLogin.statusCode).toBe(401);

    const goodLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice_reader', password: 'StrongPassword123' },
    });
    expect(goodLogin.statusCode).toBe(200);
    const loginCookie = extractCookie(goodLogin.headers['set-cookie']);
    expect(loginCookie).toContain('bookshelf_session=');

    // Multi-bookshelf creation, tagging, room theme, reordering, and deletion
    const createSecond = await app.inject({
      method: 'POST',
      url: '/api/bookshelves',
      headers: { cookie: loginCookie },
      payload: {
        name: '2026 Nordic Reads',
        tag: '2026',
        visualTheme: 'birch',
        roomTheme: 'nordic-billy',
        levelCount: 2,
      },
    });
    expect(createSecond.statusCode).toBe(201);
    const secondId = createSecond.json().bookshelf.id;
    expect(createSecond.json().bookshelves).toHaveLength(2);
    expect(createSecond.json().bookshelf.tag).toBe('2026');
    expect(createSecond.json().bookshelf.roomTheme).toBe('nordic-billy');

    const firstId = createSecond.json().bookshelves[0].id;
    const reorderRes = await app.inject({
      method: 'POST',
      url: '/api/bookshelves/reorder',
      headers: { cookie: loginCookie },
      payload: { bookshelfIds: [secondId, firstId] },
    });
    expect(reorderRes.statusCode).toBe(200);
    expect(reorderRes.json().bookshelves.map((s: { id: string }) => s.id)).toEqual([
      secondId,
      firstId,
    ]);

    const delShelf = await app.inject({
      method: 'DELETE',
      url: `/api/bookshelves/${secondId}`,
      headers: { cookie: loginCookie },
    });
    expect(delShelf.statusCode).toBe(200);
    expect(delShelf.json().bookshelves).toHaveLength(1);
  });

  it('issues 1-year (365-day) sessions by default and slides expiring sessions forward', async () => {
    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'long_session_user', password: 'StrongPassword123', seedSamples: false },
    });
    expect(reg.statusCode).toBe(201);
    const setCookieHeader = String(reg.headers['set-cookie']);
    expect(setCookieHeader).toContain(`Max-Age=${ONE_YEAR_SECONDS}`);
    expect(setCookieHeader).toContain('Expires=');

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { username: 'long_session_user' } });
    const session = await prisma.session.findFirstOrThrow({ where: { userId: dbUser.id } });
    const daysRemaining = (session.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysRemaining).toBeGreaterThan(364);
    expect(daysRemaining).toBeLessThanOrEqual(365.1);

    // Simulate an older 14-day session and verify sliding renewal extends it back to 1 year
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: tenDaysFromNow },
    });

    const cookieStr = extractCookie(reg.headers['set-cookie']);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieStr },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.username).toBe('long_session_user');
    expect(String(meRes.headers['set-cookie'])).toContain(`Max-Age=${ONE_YEAR_SECONDS}`);

    const renewed = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    const renewedDays = (renewed.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(renewedDays).toBeGreaterThan(364);
  });
});
