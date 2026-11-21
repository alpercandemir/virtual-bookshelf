import type { FastifyInstance } from 'fastify';
import { compatFetch } from '../lib/httpClient.js';
import { AppError } from '../lib/httpErrors.js';

const ALLOWED_COVER_HOSTS = new Set([
  'books.google.com',
  'books.googleusercontent.com',
  'covers.openlibrary.org',
  'lh3.googleusercontent.com',
]);

function parseAndValidateCoverUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_COVER_URL', 'Invalid cover image URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(400, 'INVALID_COVER_URL', 'Unsupported cover URL protocol.');
  }

  // Upgrade http -> https for allowlisted book hosts
  parsed.protocol = 'https:';

  if (!ALLOWED_COVER_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new AppError(403, 'DISALLOWED_COVER_HOST', 'Cover host is not allowlisted.');
  }

  return parsed;
}

export async function registerCoverProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/covers/proxy', async (request, reply) => {
    const query = request.query as { url?: string };
    if (!query?.url || typeof query.url !== 'string') {
      throw new AppError(400, 'MISSING_URL', 'Cover url parameter is required.');
    }

    const safeUrl = parseAndValidateCoverUrl(query.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const upstream = await compatFetch(safeUrl.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'VirtualBookshelf/1.0 (https://localhost)',
          Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8',
        },
      });

      // Validate final URL host after redirects against SSRF
      if (upstream.url) {
        const finalHost = new URL(upstream.url).hostname.toLowerCase();
        const isOpenLibraryArchive =
          finalHost === 'archive.org' || finalHost.endsWith('.archive.org');
        if (!ALLOWED_COVER_HOSTS.has(finalHost) && !isOpenLibraryArchive) {
          throw new AppError(403, 'DISALLOWED_REDIRECT', 'Redirected host is not allowed.');
        }
      }

      if (!upstream.ok) {
        return reply.status(404).send({
          error: { code: 'COVER_NOT_FOUND', message: 'Book cover image not available.' },
        });
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return reply.status(404).send({
          error: { code: 'INVALID_IMAGE', message: 'Upstream resource is not an image.' },
        });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      // Open Library sometimes returns a 1x1 transparent GIF (43 bytes) when missing
      if (buffer.length < 250) {
        return reply.status(404).send({
          error: { code: 'COVER_NOT_FOUND', message: 'Cover placeholder image ignored.' },
        });
      }

      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400')
        .header('Cross-Origin-Resource-Policy', 'same-origin');

      return reply.send(buffer);
    } catch (err) {
      if (err instanceof AppError) throw err;
      return reply.status(404).send({
        error: { code: 'COVER_FETCH_FAILED', message: 'Could not load cover image.' },
      });
    } finally {
      clearTimeout(timer);
    }
  });
}
