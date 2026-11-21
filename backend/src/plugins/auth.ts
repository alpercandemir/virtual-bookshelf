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
  reply.setCookie(config.sessionCookieName, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
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
  request: FastifyRequest
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

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return;
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
