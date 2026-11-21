import {
  derivePaletteFromSeed,
  isValidIsbn,
  looksLikeIsbnQuery,
  normalizeIsbn,
  resolvePhysicalDimensions,
  type SearchBookResult,
  type SearchEditionSummary,
  type SearchResponse,
} from '@bookshelf/shared';
import { getConfig } from '../config/env.js';
import { compatFetch, type CompatResponse } from '../lib/httpClient.js';
import { AppError } from '../lib/httpErrors.js';

export type FetchLike = (
  input: string | URL,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: 'follow' | 'manual';
  }
) => Promise<Pick<CompatResponse, 'ok' | 'status' | 'json'>>;

interface CacheEntry {
  expiresAt: number;
  data: SearchResponse;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const GOOGLE_COOLDOWN_MS = 5 * 60 * 1000;

export class BookSearchService {
  private readonly cache = new Map<string, CacheEntry>();
  private googleBlockedUntil = 0;
  private readonly fetchImpl: FetchLike;
  private readonly googleApiKey: string | null;

  constructor(options: { fetchImpl?: FetchLike; googleApiKey?: string | null } = {}) {
    this.fetchImpl = options.fetchImpl ?? compatFetch;
    this.googleApiKey =
      options.googleApiKey !== undefined
        ? options.googleApiKey
        : getConfig().googleBooksApiKey;
  }

  public clearCache(): void {
    this.cache.clear();
    this.googleBlockedUntil = 0;
  }

  public async search(params: {
    q: string;
    type: 'all' | 'title' | 'author' | 'isbn';
    page: number;
    limit: number;
  }): Promise<SearchResponse> {
    const query = params.q.trim();
    const effectiveType =
      params.type === 'all' && looksLikeIsbnQuery(query) ? 'isbn' : params.type;

    let normalizedQuery = query;
    if (effectiveType === 'isbn') {
      const stripped = query.replace(/^isbn[:\s-]*/i, '').trim();
      if (!isValidIsbn(stripped)) {
        throw new AppError(
          400,
          'INVALID_ISBN',
          'That ISBN checksum appears invalid. Please verify all 10 or 13 digits, or search by title/author.'
        );
      }
      normalizedQuery = normalizeIsbn(stripped) ?? stripped;
    }

    const cacheKey = `${effectiveType}:${normalizedQuery.toLowerCase()}:${params.page}:${params.limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let googleItems: SearchBookResult[] = [];
    let googleTotal = 0;
    let googleFailedReason: string | null = null;

    const googleAllowed = Date.now() >= this.googleBlockedUntil;
    if (googleAllowed) {
      try {
        const res = await this.searchGoogleBooks({
          q: normalizedQuery,
          type: effectiveType,
          page: params.page,
          limit: params.limit,
        });
        googleItems = res.items;
        googleTotal = res.total;
      } catch (err) {
        googleFailedReason = err instanceof Error ? err.message : 'Google Books unavailable';
      }
    } else {
      googleFailedReason = 'Google Books temporarily rate-limited';
    }

    let finalItems = googleItems;
    let totalEstimate = googleTotal;
    let providerUsed: SearchResponse['providerUsed'] = 'google_books';
    let fallbackNotice: string | undefined;

    if (googleItems.length === 0) {
      try {
        const olRes = await this.searchOpenLibrary({
          q: normalizedQuery,
          type: effectiveType,
          page: params.page,
          limit: params.limit,
        });
        finalItems = olRes.items;
        totalEstimate = olRes.total;
        providerUsed = 'open_library';
        if (googleFailedReason) {
          fallbackNotice = 'Showing results from Open Library (Google Books quota reached).';
        }
      } catch (olErr) {
        if (googleFailedReason) {
          throw new AppError(
            503,
            'BOOK_PROVIDERS_UNAVAILABLE',
            'External book catalogs are temporarily unavailable. You can still add a book manually.',
            { google: googleFailedReason, openLibrary: olErr instanceof Error ? olErr.message : String(olErr) }
          );
        }
      }
    }

    const deduped = this.deduplicateAndGroupEditions(finalItems);

    const response: SearchResponse = {
      query: normalizedQuery,
      type: effectiveType,
      page: params.page,
      limit: params.limit,
      totalEstimate: Math.max(totalEstimate, deduped.length),
      hasMore: params.page * params.limit < totalEstimate && finalItems.length >= Math.min(params.limit, 5),
      providerUsed,
      ...(fallbackNotice ? { fallbackNotice } : {}),
      items: deduped,
    };

    this.setCache(cacheKey, response);
    return response;
  }

  private setCache(key: string, data: SearchResponse): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  }

  private async searchGoogleBooks(params: {
    q: string;
    type: 'all' | 'title' | 'author' | 'isbn';
    page: number;
    limit: number;
  }): Promise<{ items: SearchBookResult[]; total: number }> {
    let qParam = params.q;
    if (params.type === 'title') qParam = `intitle:${params.q}`;
    else if (params.type === 'author') qParam = `inauthor:${params.q}`;
    else if (params.type === 'isbn') qParam = `isbn:${params.q}`;

    const startIndex = (params.page - 1) * params.limit;
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', qParam);
    url.searchParams.set('startIndex', String(startIndex));
    url.searchParams.set('maxResults', String(Math.min(40, params.limit)));
    url.searchParams.set('printType', 'books');
    if (this.googleApiKey) {
      url.searchParams.set('key', this.googleApiKey);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await this.fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        this.googleBlockedUntil = Date.now() + GOOGLE_COOLDOWN_MS;
        throw new Error(`Google Books HTTP ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(`Google Books HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        totalItems?: number;
        items?: Array<{
          id: string;
          volumeInfo?: {
            title?: string;
            subtitle?: string;
            authors?: string[];
            publisher?: string;
            publishedDate?: string;
            description?: string;
            pageCount?: number;
            categories?: string[];
            language?: string;
            industryIdentifiers?: Array<{ type: string; identifier: string }>;
            imageLinks?: {
              extraLarge?: string;
              large?: string;
              medium?: string;
              small?: string;
              thumbnail?: string;
              smallThumbnail?: string;
            };
            dimensions?: {
              height?: string;
              width?: string;
              thickness?: string;
            };
          };
        }>;
      };

      const items: SearchBookResult[] = (data.items ?? [])
        .filter((item) => item.volumeInfo?.title)
        .map((item) => {
          const info = item.volumeInfo!;
          const rawIsbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;
          const rawIsbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;
          const isbn = normalizeIsbn(rawIsbn13) ?? normalizeIsbn(rawIsbn10);

          const rawCover =
            info.imageLinks?.medium ||
            info.imageLinks?.large ||
            info.imageLinks?.thumbnail ||
            info.imageLinks?.smallThumbnail ||
            null;

          const coverUrl = rawCover
            ? rawCover
                .replace(/^http:\/\//i, 'https://')
                .replace(/&edge=curl/gi, '')
            : isbn
              ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
              : null;

          const physicalDimensions = resolvePhysicalDimensions({
            heightCm: info.dimensions?.height,
            widthCm: info.dimensions?.width,
            thicknessCm: info.dimensions?.thickness,
            pageCount: info.pageCount,
            categories: info.categories,
            title: info.title,
          });

          return {
            id: `google_books:${item.id}`,
            provider: 'google_books',
            providerBookId: item.id,
            isbn,
            title: info.title!.trim(),
            subtitle: info.subtitle?.trim() || null,
            authors: info.authors?.map((a) => a.trim()).filter(Boolean) ?? [],
            publisher: info.publisher?.trim() || null,
            publicationDate: info.publishedDate?.trim() || null,
            pageCount: info.pageCount && info.pageCount > 0 ? info.pageCount : null,
            description: info.description?.trim() || null,
            categories: info.categories?.slice(0, 6) ?? [],
            language: info.language ?? null,
            coverUrl,
            physicalDimensions,
          };
        });

      return { items, total: data.totalItems ?? items.length };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchOpenLibrary(params: {
    q: string;
    type: 'all' | 'title' | 'author' | 'isbn';
    page: number;
    limit: number;
  }): Promise<{ items: SearchBookResult[]; total: number }> {
    const url = new URL('https://openlibrary.org/search.json');
    if (params.type === 'title') url.searchParams.set('title', params.q);
    else if (params.type === 'author') url.searchParams.set('author', params.q);
    else if (params.type === 'isbn') url.searchParams.set('isbn', params.q);
    else url.searchParams.set('q', params.q);

    url.searchParams.set('page', String(params.page));
    url.searchParams.set('limit', String(params.limit));
    url.searchParams.set(
      'fields',
      'key,title,subtitle,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,publisher,edition_key,subject,language'
    );

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);

      try {
        const res = await this.fetchImpl(url.toString(), {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'VirtualBookshelf/1.0 (https://localhost)',
          },
        });

        if (res.status >= 500 && attempt === 0) {
          clearTimeout(timeout);
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }

        if (!res.ok) {
          throw new Error(`Open Library HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          numFound?: number;
          docs?: Array<{
            key?: string;
            title?: string;
            subtitle?: string;
            author_name?: string[];
            first_publish_year?: number;
            isbn?: string[];
            cover_i?: number;
            number_of_pages_median?: number;
            publisher?: string[];
            edition_key?: string[];
            subject?: string[];
            language?: string[];
          }>;
        };

        const items: SearchBookResult[] = (data.docs ?? [])
          .filter((doc) => doc.title)
          .map((doc) => {
            const validIsbns = (doc.isbn ?? [])
              .map((raw) => normalizeIsbn(raw))
              .filter((v): v is string => Boolean(v));
            const uniqueIsbns = [...new Set(validIsbns)];
            const primaryIsbn = uniqueIsbns[0] ?? null;

            const coverUrl = doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`
              : primaryIsbn
                ? `https://covers.openlibrary.org/b/isbn/${primaryIsbn}-L.jpg?default=false`
                : null;

            const workKey = (
              doc.key ??
              doc.edition_key?.[0] ??
              `${doc.title}-${doc.first_publish_year ?? ''}`
            ).replace(/^\/works\//, '');

            const categories = (doc.subject ?? []).slice(0, 6);
            const pageCount =
              doc.number_of_pages_median && doc.number_of_pages_median > 0
                ? doc.number_of_pages_median
                : null;

            const physicalDimensions = resolvePhysicalDimensions({
              pageCount,
              categories,
              title: doc.title,
            });

            // Expose alternate publisher / ISBN editions for edition selection
            const editions: SearchEditionSummary[] = [];
            const publishers = doc.publisher ?? [];
            const editionKeys = doc.edition_key ?? [];
            const maxEditions = Math.min(
              4,
              Math.max(uniqueIsbns.length, Math.min(publishers.length, 3))
            );
            for (let i = 0; i < maxEditions; i++) {
              const edIsbn = uniqueIsbns[i] ?? primaryIsbn;
              const edPub = publishers[i] ?? publishers[0] ?? null;
              const edKey = editionKeys[i] ?? `${workKey}-ed-${i}`;
              const edCover =
                i === 0 && doc.cover_i
                  ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`
                  : edIsbn
                    ? `https://covers.openlibrary.org/b/isbn/${edIsbn}-L.jpg?default=false`
                    : coverUrl;

              editions.push({
                provider: 'open_library',
                providerBookId: edKey,
                isbn: edIsbn,
                publisher: edPub,
                publicationDate: doc.first_publish_year
                  ? String(doc.first_publish_year)
                  : null,
                pageCount,
                coverUrl: edCover,
                editionInfo: edPub
                  ? `${edPub}${edIsbn ? ` · ISBN ${edIsbn}` : ''}`
                  : null,
              });
            }

            return {
              id: `open_library:${workKey}`,
              provider: 'open_library',
              providerBookId: workKey,
              isbn: primaryIsbn,
              title: doc.title!.trim(),
              subtitle: doc.subtitle?.trim() || null,
              authors: doc.author_name?.slice(0, 6) ?? [],
              publisher: publishers[0] ?? null,
              publicationDate: doc.first_publish_year
                ? String(doc.first_publish_year)
                : null,
              pageCount,
              description: null,
              categories,
              language: doc.language?.[0] ?? null,
              coverUrl,
              physicalDimensions,
              ...(editions.length > 1 ? { editions } : {}),
            };
          });

        return { items, total: data.numFound ?? items.length };
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Open Library search failed');
  }

  /**
   * Deduplicates search results by normalized ISBN or normalized (title + primaryAuthor)
   * while preserving distinct editions on the surviving entry so the user can pick an edition.
   */
  private deduplicateAndGroupEditions(items: SearchBookResult[]): SearchBookResult[] {
    const byKey = new Map<string, SearchBookResult>();
    const seenIsbns = new Set<string>();

    for (const item of items) {
      if (item.isbn && seenIsbns.has(item.isbn)) {
        continue;
      }

      const normTitle = item.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const normAuthor = (item.authors[0] ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const groupKey = `${normTitle}::${normAuthor}`;

      const existing = byKey.get(groupKey);
      if (!existing) {
        if (item.isbn) seenIsbns.add(item.isbn);
        byKey.set(groupKey, {
          ...item,
          editions: item.editions ?? [
            {
              provider: item.provider,
              providerBookId: item.providerBookId,
              isbn: item.isbn,
              publisher: item.publisher,
              publicationDate: item.publicationDate,
              pageCount: item.pageCount,
              coverUrl: item.coverUrl,
            },
          ],
        });
      } else {
        // Prefer richer cover or description on primary record
        if (!existing.coverUrl && item.coverUrl) {
          existing.coverUrl = item.coverUrl;
        }
        if (!existing.description && item.description) {
          existing.description = item.description;
        }
        if (!existing.pageCount && item.pageCount) {
          existing.pageCount = item.pageCount;
        }
        if (item.isbn) seenIsbns.add(item.isbn);

        const editionList = existing.editions ?? [];
        const duplicateEdition = editionList.some(
          (e) =>
            (item.isbn && e.isbn === item.isbn) ||
            e.providerBookId === item.providerBookId
        );
        if (!duplicateEdition && editionList.length < 6) {
          editionList.push({
            provider: item.provider,
            providerBookId: item.providerBookId,
            isbn: item.isbn,
            publisher: item.publisher,
            publicationDate: item.publicationDate,
            pageCount: item.pageCount,
            coverUrl: item.coverUrl,
          });
          existing.editions = editionList;
        }
      }
    }

    return [...byKey.values()];
  }
}

export function buildInitialBookPalette(title: string, authors: string[], id: string) {
  return derivePaletteFromSeed(`${title}|${authors.join(',')}|${id}`);
}
