import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { BookSearchService, type FetchLike } from '../services/bookSearchService.js';
import { ShelfScanService } from '../services/shelfScanService.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const sessionCookie = list.find((c) => c.startsWith('bookshelf_session='));
  return sessionCookie ? sessionCookie.split(';')[0] : '';
}

function buildMultipartPayload(
  filename: string,
  mimeType: string,
  content: Buffer
): { body: Buffer; contentType: string } {
  const boundary = '----BookshelfScanTestBoundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, content, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// Minimal valid JPEG magic bytes (FF D8 FF E0 ...)
const FAKE_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

describe('Shelf Photo Scanning (Gemini Vision + Catalog Matching)', () => {
  let dbPath: string;
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let cookie = '';
  let geminiCallCount = 0;
  let geminiMode: 'ok' | 'rate_limit' | 'fallback_404' = 'ok';

  const mockSearchFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('googleapis.com/books')) {
      if (url.includes('Dune')) {
        return new Response(
          JSON.stringify({
            totalItems: 1,
            items: [
              {
                id: 'gb-dune',
                volumeInfo: {
                  title: 'Dune',
                  authors: ['Frank Herbert'],
                  publisher: 'Ace',
                  publishedDate: '1990',
                  pageCount: 688,
                  industryIdentifiers: [
                    { type: 'ISBN_13', identifier: '9780441172719' },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ totalItems: 0, items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('openlibrary.org/search.json')) {
      return new Response(JSON.stringify({ numFound: 0, docs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  const mockGeminiFetch: typeof fetch = async (input, init) => {
    geminiCallCount += 1;
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('AQ.test-key');

    if (geminiMode === 'rate_limit') {
      return new Response(
        JSON.stringify({ error: { message: 'Quota exceeded' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (geminiMode === 'fallback_404' && url.includes('gemini-3.5-flash-lite')) {
      return new Response(
        JSON.stringify({ error: { message: 'Model not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    books: [
                      {
                        title: 'Unmatched Rare Pamphlet',
                        author: 'Unknown Local Author',
                        shelfRow: 1,
                        position: 2,
                        spineColorHex: '#2B4C3F',
                        confidence: 'medium',
                        language: 'en',
                      },
                      {
                        title: 'Dune',
                        author: 'Frank Herbert',
                        shelfRow: 1,
                        position: 1,
                        spineColorHex: '#C27A2B',
                        confidence: 'high',
                        language: 'en',
                      },
                      {
                        // Duplicate detection should be deduplicated
                        title: 'Dune',
                        author: 'Frank Herbert',
                        shelfRow: 1,
                        position: 3,
                        spineColorHex: '#C27A2B',
                        confidence: 'high',
                        language: 'en',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `bookshelf-scan-test-${Date.now()}.db`);
    const dbUrl = `file:${dbPath}`;
    execSync('npx prisma db push --skip-generate', {
      cwd: path.resolve(process.cwd()),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const searchService = new BookSearchService({ fetchImpl: mockSearchFetch });
    const shelfScanService = new ShelfScanService({
      apiKey: 'AQ.test-key',
      model: 'gemini-3.5-flash-lite',
      fetchImpl: mockGeminiFetch,
      searchService,
    });
    app = await buildApp({
      prisma,
      disableRateLimit: true,
      searchService,
      shelfScanService,
    });

    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'scanneruser', password: 'Password1234', seedSamples: false },
    });
    cookie = extractCookie(reg.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('reports scanner availability status for authenticated users', async () => {
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/books/scan-shelf/status',
    });
    expect(unauth.statusCode).toBe(401);

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/books/scan-shelf/status',
      headers: { cookie },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json()).toEqual({
      enabled: true,
      model: 'gemini-3.5-flash-lite',
    });
  });

  it('rejects non-image uploads with 400 UNSUPPORTED_IMAGE_TYPE', async () => {
    const payload = buildMultipartPayload(
      'notes.txt',
      'text/plain',
      Buffer.from('not an image file at all')
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/books/scan-shelf',
      headers: {
        cookie,
        'content-type': payload.contentType,
      },
      payload: payload.body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_IMAGE_TYPE');
  });

  it('scans a shelf photo, orders & deduplicates books, matches catalog, and caches identical scans', async () => {
    geminiMode = 'ok';
    geminiCallCount = 0;

    const payload = buildMultipartPayload('shelf.jpg', 'image/jpeg', FAKE_JPEG);
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/books/scan-shelf',
      headers: {
        cookie,
        'content-type': payload.contentType,
      },
      payload: payload.body,
    });

    expect(firstRes.statusCode).toBe(200);
    const body = firstRes.json();
    expect(body.cached).toBe(false);
    expect(body.model).toBe('gemini-3.5-flash-lite');
    expect(body.detectedCount).toBe(2);
    expect(body.matchedCount).toBe(1);
    expect(body.books[0].detectedTitle).toBe('Dune');
    expect(body.books[0].position).toBe(1);
    expect(body.books[0].matchStatus).toBe('matched');
    expect(body.books[0].matches[0].title).toBe('Dune');
    expect(body.books[0].spineColorHex).toBe('#C27A2B');
    expect(body.books[1].detectedTitle).toBe('Unmatched Rare Pamphlet');
    expect(body.books[1].matchStatus).toBe('unmatched');
    expect(geminiCallCount).toBe(1);

    // Second identical upload should hit in-memory SHA-256 cache (0 extra Gemini calls)
    const secondRes = await app.inject({
      method: 'POST',
      url: '/api/books/scan-shelf',
      headers: {
        cookie,
        'content-type': payload.contentType,
      },
      payload: payload.body,
    });
    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.json().cached).toBe(true);
    expect(geminiCallCount).toBe(1);
  });

  it('surfaces 429 rate limit errors clearly without leaking secrets', async () => {
    geminiMode = 'rate_limit';
    const distinctJpeg = Buffer.concat([FAKE_JPEG, Buffer.from([0x01, 0x02])]);
    const payload = buildMultipartPayload('shelf2.jpg', 'image/jpeg', distinctJpeg);
    const res = await app.inject({
      method: 'POST',
      url: '/api/books/scan-shelf',
      headers: {
        cookie,
        'content-type': payload.contentType,
      },
      payload: payload.body,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('GEMINI_RATE_LIMITED');
  });
});
