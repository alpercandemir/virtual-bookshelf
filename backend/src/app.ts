import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { PrismaClient } from '@prisma/client';
import { getConfig } from './config/env.js';
import { getPrismaClient } from './lib/prisma.js';
import { MAX_BOOK_IMAGE_BYTES } from './lib/bookImages.js';
import { AppError } from './lib/httpErrors.js';
import { attachSessionUser } from './plugins/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerLibraryBackupRoutes } from './routes/libraryBackup.js';
import { registerBookshelfRoutes } from './routes/bookshelf.js';
import { registerBookRoutes } from './routes/books.js';
import { registerCoverProxyRoutes } from './routes/covers.js';
import { registerShelfScanRoutes } from './routes/shelfScan.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { BookSearchService } from './services/bookSearchService.js';
import { ShelfScanService } from './services/shelfScanService.js';

export interface BuildAppOptions {
  prisma?: PrismaClient;
  logger?: boolean;
  disableRateLimit?: boolean;
  searchService?: BookSearchService;
  shelfScanService?: ShelfScanService;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = getConfig();
  const prisma = options.prisma ?? getPrismaClient();
  const searchService = options.searchService ?? new BookSearchService();
  const shelfScanService =
    options.shelfScanService ?? new ShelfScanService({ searchService });

  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024 * 2,
  });

  await app.register(cors, {
    origin: [config.frontendOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: {
      fileSize: MAX_BOOK_IMAGE_BYTES,
      files: 1,
    },
  });

  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  if (!options.disableRateLimit) {
    await app.register(rateLimit, {
      global: false,
      max: 120,
      timeWindow: '1 minute',
    });
  }

  app.addHook('preHandler', async (request, reply) => {
    if (!request.authUser) await attachSessionUser(prisma, request, reply);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    const fastifyErr = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyErr.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment and try again.',
        },
      });
    }

    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.code ?? 'BAD_REQUEST',
          message: fastifyErr.message ?? 'Invalid request.',
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong on the server.',
      },
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await registerAuthRoutes(app, prisma);
  await registerBookshelfRoutes(app, prisma);
  await registerLibraryBackupRoutes(app, prisma);
  await registerBookRoutes(app, prisma, searchService);
  await registerShelfScanRoutes(app, shelfScanService);
  await registerCoverProxyRoutes(app);
  await registerUploadRoutes(app);

  // Serve built frontend SPA in single-container / production deployments
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      wildcard: false,
      decorateReply: true,
    });

    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !request.url.startsWith('/uploads/')
      ) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Resource not found.' },
      });
    });
  }

  return app;
}
