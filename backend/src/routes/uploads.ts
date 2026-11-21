import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config/env.js';
import { AppError } from '../lib/httpErrors.js';
import { requireAuth } from '../plugins/auth.js';

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function detectImageTypeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

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
