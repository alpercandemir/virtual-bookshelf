import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/httpErrors.js';
import { requireAuth } from '../plugins/auth.js';
import type { ShelfScanService } from '../services/shelfScanService.js';

const SUPPORTED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
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

export async function registerShelfScanRoutes(
  app: FastifyInstance,
  shelfScanService: ShelfScanService
): Promise<void> {
  app.get('/api/books/scan-shelf/status', async (request) => {
    requireAuth(request);
    return shelfScanService.getStatus();
  });

  app.post(
    '/api/books/scan-shelf',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      requireAuth(request);

      const file = await request.file();
      if (!file) {
        throw new AppError(
          400,
          'NO_FILE',
          'Please upload a photo of your bookshelf (JPEG, PNG, or WebP).'
        );
      }

      const buffer = await file.toBuffer();
      const detectedMime = detectImageMime(buffer);
      if (!detectedMime || !SUPPORTED_MIMES.has(detectedMime)) {
        throw new AppError(
          400,
          'UNSUPPORTED_IMAGE_TYPE',
          'Only valid JPEG, PNG, or WebP shelf photos are supported.'
        );
      }

      return shelfScanService.scanShelfPhoto(buffer, detectedMime);
    }
  );
}
