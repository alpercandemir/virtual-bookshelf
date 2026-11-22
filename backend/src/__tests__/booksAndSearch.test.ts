import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { BookSearchService, type FetchLike } from '../services/bookSearchService.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const sessionCookie = list.find((c) => c.startsWith('bookshelf_session='));
  return sessionCookie ? sessionCookie.split(';')[0] : '';
}

describe('Phase 3 & 4: Book Search, Normalization, CRUD, Reorder & Security', () => {
  let dbPath: string;
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let searchService: BookSearchService;
  let forceGoogle429 = false;

  const mockFetch: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes('googleapis.com/books')) {
      if (forceGoogle429) {
        return new Response(JSON.stringify({ error: { code: 429 } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          totalItems: 2,
          items: [
            {
              id: 'gb-dune-1',
              volumeInfo: {
                title: 'Dune',
                authors: ['Frank Herbert'],
                publisher: 'Ace',
                publishedDate: '1990',
                pageCount: 688,
                description: 'Desert planet Arrakis.',
                categories: ['Science Fiction'],
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441172719' }],
                imageLinks: { thumbnail: 'http://books.google.com/books/content?id=gb-dune-1&zoom=1' },
                dimensions: { height: '23.40 cm', width: '15.60 cm', thickness: '4.40 cm' },
              },
            },
            {
              id: 'gb-dune-2',
              volumeInfo: {
                title: 'Dune',
                authors: ['Frank Herbert'],
                publisher: 'Chilton Books',
                publishedDate: '1965',
                pageCount: 658,
                industryIdentifiers: [{ type: 'ISBN_10', identifier: '0441172717' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('openlibrary.org/search.json')) {
      return new Response(
        JSON.stringify({
          numFound: 42,
          docs: [
            {
              key: '/works/OL893415W',
              title: 'Dune',
              author_name: ['Frank Herbert'],
              first_publish_year: 1965,
              isbn: ['9780441172719', '9780441013593'],
              cover_i: 11481354,
              number_of_pages_median: 688,
              publisher: ['Chilton Books', 'Ace Books'],
              edition_key: ['OL1M', 'OL2M'],
              subject: ['Science Fiction'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404 });
  };

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `bookshelf-books-test-${Date.now()}.db`);
    fs.writeFileSync(dbPath, '', { flag: 'wx' });
    const dbUrl = `file:${dbPath}`;
    execSync('npx prisma db push --skip-generate', {
      cwd: path.resolve(process.cwd()),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    searchService = new BookSearchService({ fetchImpl: mockFetch });
    app = await buildApp({ prisma, disableRateLimit: true, searchService });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('normalizes Google Books, falls back cleanly to Open Library on 429, and rejects invalid ISBNs', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'searcher', password: 'Password1234', seedSamples: false },
    });
    const cookie = extractCookie(reg.headers['set-cookie']);

    // 1. Google Books normalizes dimensions as verified, upgrades cover to https, and deduplicates
    forceGoogle429 = false;
    searchService.clearCache();
    const gbRes = await app.inject({
      method: 'GET',
      url: '/api/books/search?q=Dune&type=title&page=1&limit=10',
      headers: { cookie },
    });
    expect(gbRes.statusCode).toBe(200);
    const gbBody = gbRes.json();
    expect(gbBody.providerUsed).toBe('google_books');
    expect(gbBody.items).toHaveLength(1);
    expect(gbBody.items[0].physicalDimensions.source).toBe('verified');
    expect(gbBody.items[0].physicalDimensions.heightMm).toBe(234);
    expect(gbBody.items[0].coverUrl).toMatch(/^https:\/\//);

    // 2. When Google Books returns 429, automatically fail over to Open Library
    forceGoogle429 = true;
    searchService.clearCache();
    const olRes = await app.inject({
      method: 'GET',
      url: '/api/books/search?q=Dune&type=all&page=1&limit=10',
      headers: { cookie },
    });
    expect(olRes.statusCode).toBe(200);
    const olBody = olRes.json();
    expect(olBody.providerUsed).toBe('open_library');
    expect(olBody.fallbackNotice).toContain('Open Library');
    expect(olBody.items[0].physicalDimensions.source).toBe('estimated');
    expect(olBody.items[0].editions.length).toBeGreaterThanOrEqual(2);

    // 3. Invalid ISBN rejected cleanly
    const badIsbn = await app.inject({
      method: 'GET',
      url: '/api/books/search?q=9780441172710&type=isbn',
      headers: { cookie },
    });
    expect(badIsbn.statusCode).toBe(400);
    expect(badIsbn.json().error.code).toBe('INVALID_ISBN');
  });

  it('adds, customizes, reorders across compartments, deletes books, and enforces user ownership', async () => {
    const regA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'collector_a', password: 'Password1234', seedSamples: false },
    });
    const cookieA = extractCookie(regA.headers['set-cookie']);

    const regB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'collector_b', password: 'Password1234', seedSamples: false },
    });
    const cookieB = extractCookie(regB.headers['set-cookie']);

    const shelfRes = await app.inject({
      method: 'GET',
      url: '/api/bookshelf',
      headers: { cookie: cookieA },
    });
    const comps = shelfRes.json().bookshelf.compartments;
    const comp0 = comps[0].id;
    const comp1 = comps[1].id;

    // Add 2 books (one external, one manual)
    const add1 = await app.inject({
      method: 'POST',
      url: '/api/bookshelf/books',
      headers: { cookie: cookieA },
      payload: {
        compartmentId: comp0,
        book: {
          provider: 'open_library',
          providerBookId: 'OL893415W',
          isbn: '9780441172719',
          title: 'Dune',
          authors: ['Frank Herbert'],
          pageCount: 688,
          format: 'hardcover',
        },
      },
    });
    expect(add1.statusCode).toBe(201);
    const sb1Id = add1.json().addedShelfBook.id;

    const add2 = await app.inject({
      method: 'POST',
      url: '/api/bookshelf/books',
      headers: { cookie: cookieA },
      payload: {
        compartmentId: comp0,
        book: {
          provider: 'manual',
          title: 'Rare Field Notebook',
          authors: ['A. Archivist'],
          pageCount: 192,
          format: 'pocket',
        },
      },
    });
    expect(add2.statusCode).toBe(201);
    const sb2Id = add2.json().addedShelfBook.id;

    // Customize spine & orientation
    const patchBook = await app.inject({
      method: 'PATCH',
      url: `/api/bookshelf/books/${sb1Id}`,
      headers: { cookie: cookieA },
      payload: {
        orientation: 'leaning-right',
        visualOverrides: {
          spineColor: '#5A1F24',
          bindingStyle: 'hardcover-leather',
        },
      },
    });
    expect(patchBook.statusCode).toBe(200);
    expect(patchBook.json().shelfBook.orientation).toBe('leaning-right');
    expect(patchBook.json().shelfBook.visualOverrides.spineColor).toBe('#5A1F24');

    // User B must NOT be able to modify or delete User A's book
    const forbiddenDel = await app.inject({
      method: 'DELETE',
      url: `/api/bookshelf/books/${sb1Id}`,
      headers: { cookie: cookieB },
    });
    expect(forbiddenDel.statusCode).toBe(404);

    // Move sb1 to comp1 and keep sb2 in comp0 via reorder endpoint
    const reorderRes = await app.inject({
      method: 'POST',
      url: '/api/bookshelf/books/reorder',
      headers: { cookie: cookieA },
      payload: {
        compartments: [
          { compartmentId: comp0, shelfBookIds: [sb2Id] },
          { compartmentId: comp1, shelfBookIds: [sb1Id] },
        ],
      },
    });
    expect(reorderRes.statusCode).toBe(200);
    const afterReorder = reorderRes.json().bookshelf.compartments;
    expect(afterReorder.find((c: { id: string }) => c.id === comp0).books.map((b: { id: string }) => b.id)).toEqual([sb2Id]);
    expect(afterReorder.find((c: { id: string }) => c.id === comp1).books.map((b: { id: string }) => b.id)).toEqual([sb1Id]);

    // Delete book
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/bookshelf/books/${sb2Id}`,
      headers: { cookie: cookieA },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().bookshelf.compartments.find((c: { id: string }) => c.id === comp0).books).toHaveLength(0);

    // Cover proxy SSRF check
    const ssrfRes = await app.inject({
      method: 'GET',
      url: '/api/covers/proxy?url=http://169.254.169.254/latest/meta-data/',
    });
    expect(ssrfRes.statusCode).toBe(403);
  });
});
