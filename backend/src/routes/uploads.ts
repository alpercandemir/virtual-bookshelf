import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config/env.js';
import { AppError } from '../lib/httpErrors.js';
import { requireAuth } from '../plugins/auth.js';
import { ALLOWED_EXTENSIONS, detectImageTypeFromMagicBytes } from '../lib/bookImages.js';

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/uploads/book-image', async (request, reply) => {
    requireAuth(request);

    const file = await request.file();
    if (!file) {
      throw new AppError(400, 'NO_FILE', 'Please select a PNG, JPEG, or WebP image.');
    }

    const buffer = await file.toBuffer();
    const detectedMime = detectImageTypeFromMagicBytes(buffer);
    if (!detectedMime || !ALLOWED_EXTENSIONS[detectedMime]) {
      throw new AppError(
        400,
        'UNSUPPORTED_IMAGE_TYPE',
        'Only valid PNG, JPEG, or WebP images are supported.'
      );
    }

    const config = getConfig();
    await fs.mkdir(config.uploadsDir, { recursive: true });

    const filename = `${crypto.randomUUID()}${ALLOWED_EXTENSIONS[detectedMime]}`;
    const targetPath = path.join(config.uploadsDir, filename);
    await fs.writeFile(targetPath, buffer);

    return reply.status(201).send({
      url: `/uploads/${filename}`,
    });
  });
}
