import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { loginSchema, registerSchema } from '@bookshelf/shared';
import { getConfig } from '../config/env.js';
import { AppError } from '../lib/httpErrors.js';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../lib/password.js';
import {
  clearSessionCookie,
  setSessionCookie,
} from '../plugins/auth.js';
import { createDefaultBookshelfForUser } from '../services/bookshelfService.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid registration data.',
          parsed.error.flatten()
        );
      }

      const usernameNormalized = parsed.data.username.trim().toLowerCase();
      const existing = await prisma.user.findUnique({
        where: { username: usernameNormalized },
      });

      if (existing) {
        throw new AppError(409, 'USERNAME_TAKEN', 'That username is already taken.');
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const user = await prisma.user.create({
        data: {
          username: usernameNormalized,
          passwordHash,
        },
      });

      await createDefaultBookshelfForUser(prisma, user.id, {
        seedSamples: parsed.data.seedSamples,
      });

      const rawToken = generateSessionToken();
      const tokenHash = hashSessionToken(rawToken);
      const config = getConfig();
      const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

      await prisma.session.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      setSessionCookie(reply, rawToken);

      return reply.status(201).send({
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt.toISOString(),
        },
      });
    }
  );

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid login credentials.'
        );
      }

      const usernameNormalized = parsed.data.username.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { username: usernameNormalized },
      });

      if (!user) {
        // Perform a dummy scrypt verification to mitigate username timing side-channels
        await verifyPassword(
          parsed.data.password,
          'scrypt:00000000000000000000000000000000:' + '0'.repeat(128)
        );
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
      }

      const valid = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');
      }

      const rawToken = generateSessionToken();
      const tokenHash = hashSessionToken(rawToken);
      const config = getConfig();
      const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

      await prisma.session.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      setSessionCookie(reply, rawToken);

      return reply.send({
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt.toISOString(),
        },
      });
    }
  );

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionTokenHash) {
      await prisma.session
        .deleteMany({ where: { tokenHash: request.sessionTokenHash } })
        .catch(() => undefined);
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (request) => {
    if (!request.authUser) {
      return { user: null };
    }
    return {
      user: {
        id: request.authUser.id,
        username: request.authUser.username,
        createdAt: request.authUser.createdAt.toISOString(),
      },
    };
  });
}
