import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { getConfig } from '../config/env.js';
import { hashSessionToken } from '../lib/password.js';
import { AppError } from '../lib/httpErrors.js';

export interface AuthUser {
  id: string;
  username: string;
  createdAt: Date;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
    sessionTokenHash: string | null;
  }
}

export function setSessionCookie(reply: FastifyReply, rawToken: string): void {
  const config = getConfig();
  const maxAgeSeconds = config.sessionTtlDays * 24 * 60 * 60;
  reply.setCookie(config.sessionCookieName, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  const config = getConfig();
  reply.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  });
}

export async function attachSessionUser(
  prisma: PrismaClient,
  request: FastifyRequest,
  reply?: FastifyReply
): Promise<void> {
  request.authUser = null;
  request.sessionTokenHash = null;

  const config = getConfig();
  const rawToken = request.cookies?.[config.sessionCookieName];
  if (!rawToken || typeof rawToken !== 'string') {
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, username: true, createdAt: true },
      },
    },
  });

  if (!session) return;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return;
  }

  // Sliding TTL refresh: extend active sessions (including older 14-day sessions)
  // when more than 7 days have elapsed since the last full TTL window was set.
  const fullTtlMs = config.sessionTtlDays * 24 * 60 * 60 * 1000;
  const renewWindowMs = Math.min(7, Math.max(1, Math.floor(config.sessionTtlDays / 2))) * 24 * 60 * 60 * 1000;
  if (reply && session.expiresAt.getTime() < now + fullTtlMs - renewWindowMs) {
    const nextExpiresAt = new Date(now + fullTtlMs);
    await prisma.session
      .update({
        where: { id: session.id },
        data: { expiresAt: nextExpiresAt },
      })
      .catch(() => undefined);
    setSessionCookie(reply, rawToken);
  }

  request.authUser = session.user;
  request.sessionTokenHash = tokenHash;
}

export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.authUser) {
    throw new AppError(401, 'UNAUTHORIZED', 'Please sign in to access your bookshelf.');
  }
  return request.authUser;
}
