import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  createBookshelfSchema,
  layoutUpdateSchema,
  reorderBookshelvesSchema,
  updateBookshelfSchema,
} from '@bookshelf/shared';
import { AppError } from '../lib/httpErrors.js';
import { requireAuth } from '../plugins/auth.js';
import {
  createBookshelfForUser,
  deleteBookshelfForUser,
  getBookshelfForUser,
  getBookshelvesForUser,
  reorderBookshelvesForUser,
  resetBookshelfLayout,
  seedSampleBooksForUser,
  updateBookshelfLayout,
  updateBookshelfSettings,
} from '../services/bookshelfService.js';

export async function registerBookshelfRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  // --- Multi-Bookshelf Collection Routes ---
  app.get('/api/bookshelves', async (request) => {
    const user = requireAuth(request);
    const bookshelves = await getBookshelvesForUser(prisma, user.id);
    return { bookshelves };
  });

  app.post('/api/bookshelves', async (request, reply) => {
    const user = requireAuth(request);
    const parsed = createBookshelfSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf creation payload.',
        parsed.error.flatten()
      );
    }
    const bookshelf = await createBookshelfForUser(prisma, user.id, parsed.data);
    const bookshelves = await getBookshelvesForUser(prisma, user.id);
    return reply.status(201).send({ bookshelf, bookshelves });
  });

  app.post('/api/bookshelves/reorder', async (request) => {
    const user = requireAuth(request);
    const parsed = reorderBookshelvesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf reorder list.'
      );
    }
    const bookshelves = await reorderBookshelvesForUser(
      prisma,
      user.id,
      parsed.data.bookshelfIds
    );
    return { bookshelves };
  });

  app.patch('/api/bookshelves/:bookshelfId', async (request) => {
    const user = requireAuth(request);
    const { bookshelfId } = request.params as { bookshelfId: string };
    const parsed = updateBookshelfSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf settings.',
        parsed.error.flatten()
      );
    }
    const bookshelf = await updateBookshelfSettings(
      prisma,
      user.id,
      parsed.data,
      bookshelfId
    );
    return { bookshelf };
  });

  app.put('/api/bookshelves/:bookshelfId/layout', async (request) => {
    const user = requireAuth(request);
    const { bookshelfId } = request.params as { bookshelfId: string };
    const parsed = layoutUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf layout.',
        parsed.error.flatten()
      );
    }
    const bookshelf = await updateBookshelfLayout(
      prisma,
      user.id,
      parsed.data.levels,
      bookshelfId
    );
    return { bookshelf };
  });

  app.post('/api/bookshelves/:bookshelfId/layout/reset', async (request) => {
    const user = requireAuth(request);
    const { bookshelfId } = request.params as { bookshelfId: string };
    const bookshelf = await resetBookshelfLayout(prisma, user.id, bookshelfId);
    return { bookshelf };
  });

  app.post('/api/bookshelves/:bookshelfId/seed-samples', async (request) => {
    const user = requireAuth(request);
    const { bookshelfId } = request.params as { bookshelfId: string };
    const bookshelf = await seedSampleBooksForUser(prisma, user.id, bookshelfId);
    return { bookshelf };
  });

  app.delete('/api/bookshelves/:bookshelfId', async (request) => {
    const user = requireAuth(request);
    const { bookshelfId } = request.params as { bookshelfId: string };
    const bookshelves = await deleteBookshelfForUser(prisma, user.id, bookshelfId);
    return { bookshelves };
  });

  // --- Backwards-compatible Primary Bookshelf Routes ---
  app.get('/api/bookshelf', async (request) => {
    const user = requireAuth(request);
    const bookshelf = await getBookshelfForUser(prisma, user.id);
    return { bookshelf };
  });

  app.patch('/api/bookshelf', async (request) => {
    const user = requireAuth(request);
    const parsed = updateBookshelfSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf settings.',
        parsed.error.flatten()
      );
    }
    const bookshelf = await updateBookshelfSettings(prisma, user.id, parsed.data);
    return { bookshelf };
  });

  app.put('/api/bookshelf/layout', async (request) => {
    const user = requireAuth(request);
    const parsed = layoutUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid bookshelf layout.',
        parsed.error.flatten()
      );
    }
    const bookshelf = await updateBookshelfLayout(prisma, user.id, parsed.data.levels);
    return { bookshelf };
  });

  app.post('/api/bookshelf/layout/reset', async (request) => {
    const user = requireAuth(request);
    const bookshelf = await resetBookshelfLayout(prisma, user.id);
    return { bookshelf };
  });

  app.post('/api/bookshelf/seed-samples', async (request) => {
    const user = requireAuth(request);
    const bookshelf = await seedSampleBooksForUser(prisma, user.id);
    return { bookshelf };
  });
}
