import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config/env.js';
import { attachSessionUser, requireAuth } from '../plugins/auth.js';
import { exportLibrary, MAX_LIBRARY_BACKUP_BYTES, restoreLibrary } from '../services/libraryBackup.js';

export async function registerLibraryBackupRoutes(app: FastifyInstance, prisma: PrismaClient) {
  const { uploadsDir } = getConfig();

  app.get('/api/library/backup', async (request, reply) => {
    const user = requireAuth(request);
    const backup = await exportLibrary(prisma, user.id, uploadsDir);
    return reply.header('Cache-Control', 'no-store').type('application/json').send(backup);
  });

  app.post('/api/library/restore', {
    onRequest: async (request, reply) => {
      await attachSessionUser(prisma, request, reply);
      requireAuth(request);
    },
    bodyLimit: MAX_LIBRARY_BACKUP_BYTES,
  }, async (request, reply) => {
    const user = requireAuth(request);
    const result = await restoreLibrary(prisma, user.id, uploadsDir, request.body);
    return reply.status(201).send(result);
  });
}
