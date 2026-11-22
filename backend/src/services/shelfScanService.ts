import crypto from 'node:crypto';
import { z } from 'zod';
import type {
  ScanConfidence,
  ScannedBookCandidate,
  SearchBookResult,
  ShelfScanResponse,
} from '@bookshelf/shared';
import { getConfig } from '../config/env.js';
import { AppError } from '../lib/httpErrors.js';
import type { BookSearchService } from './bookSearchService.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_DETECTED_BOOKS = 40;
const MATCH_CONCURRENCY = 3;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;
const GEMINI_TIMEOUT_MS = 28_000;

const FALLBACK_LITE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
];

const SHELF_SCAN_PROMPT = [
  'Extract every readable book spine in this bookshelf photo, ordered top-to-bottom (shelfRow starting at 1) and left-to-right (position starting at 1).',
  'Rules:',
  '- Only include books where at least part of the title is readable. Never invent unseen books.',
  '- Read vertical, horizontal, and stacked spines carefully.',
  '- Keep the title in its original printed language without commentary.',
  '- Estimate the dominant spine color as #RRGGBB hex (or null if unclear).',
  '- Set confidence: "high" if clearly readable, "medium" if partially obscured, "low" if very blurry.',
  `- Maximum ${MAX_DETECTED_BOOKS} books. If no books are visible, return an empty books array.`,
].join('\n');

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    books: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          author: { type: 'STRING', nullable: true },
          shelfRow: { type: 'INTEGER' },
          position: { type: 'INTEGER' },
          spineColorHex: { type: 'STRING', nullable: true },
          confidence: {
            type: 'STRING',
            enum: ['high', 'medium', 'low'],
          },
          language: { type: 'STRING', nullable: true },
        },
        required: ['title', 'shelfRow', 'position', 'confidence'],
      },
    },
  },
  required: ['books'],
};

const rawDetectedBookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(120).nullable().optional(),
  shelfRow: z.coerce.number().int().min(1).max(20).optional().default(1),
  position: z.coerce.number().int().min(1).max(100).optional().default(1),
  spineColorHex: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val) return null;
      const cleaned = val.startsWith('#') ? val : `#${val}`;
      return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toUpperCase() : null;
    }),
  confidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  language: z
    .string()
    .trim()
    .max(12)
    .nullable()
    .optional()
    .transform((val) => (val ? val.toLowerCase() : null)),
});

const rawGeminiOutputSchema = z.object({
  books: z.array(rawDetectedBookSchema).default([]),
});

interface RawDetectedBook {
  title: string;
  author: string | null;
  shelfRow: number;
  position: number;
  spineColorHex: string | null;
  confidence: ScanConfidence;
  language: string | null;
}

interface CacheEntry {
  createdAt: number;
  response: Omit<ShelfScanResponse, 'cached'>;
}

export interface ShelfScanServiceOptions {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
  searchService: BookSearchService;
}

function normalizeForCompare(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreMatch(
  item: SearchBookResult,
  detectedTitle: string,
  detectedAuthor: string | null,
  detectedLanguage: string | null
): number {
  let score = 0;
  const normDetTitle = normalizeForCompare(detectedTitle);
  const normItemTitle = normalizeForCompare(item.title);

  if (normItemTitle === normDetTitle) {
    score += 120;
  } else if (
    normItemTitle.includes(normDetTitle) ||
    normDetTitle.includes(normItemTitle)
  ) {
    // Prefer titles close in length rather than companion guides like "The key to ..."
    const lengthRatio =
      Math.min(normItemTitle.length, normDetTitle.length) /
      Math.max(1, Math.max(normItemTitle.length, normDetTitle.length));
    score += Math.round(45 + lengthRatio * 35);
  } else {
    const detWords = new Set(normDetTitle.split(' ').filter((w) => w.length > 2));
    const itemWords = new Set(normItemTitle.split(' ').filter((w) => w.length > 2));
    let overlap = 0;
    for (const w of detWords) {
      if (itemWords.has(w)) overlap += 1;
    }
    if (detWords.size > 0) {
      score += Math.round((overlap / detWords.size) * 50);
    }
  }

  // Penalize secondary companion/study-guide editions unless detected title explicitly mentions them
  const guidePatterns = ['study guide', 'summary of', 'key to ', 'companion to ', 'workbook'];
  for (const pat of guidePatterns) {
    if (normItemTitle.includes(pat) && !normDetTitle.includes(pat)) {
      score -= 45;
    }
  }

  if (detectedAuthor && item.authors.length > 0) {
    const normDetAuthor = normalizeForCompare(detectedAuthor);
    const detAuthorTokens = normDetAuthor.split(' ').filter((w) => w.length > 1);
    const itemAuthorsStr = normalizeForCompare(item.authors.join(' '));
    if (itemAuthorsStr.includes(normDetAuthor)) {
      score += 50;
    } else if (detAuthorTokens.some((tok) => itemAuthorsStr.includes(tok))) {
      score += 30;
    }
  }

  if (detectedLanguage && item.language) {
    if (item.language.toLowerCase().startsWith(detectedLanguage.slice(0, 2))) {
      score += 12;
    }
  }

  if (item.coverUrl) score += 10;
  if (item.pageCount && item.pageCount > 0) score += 4;
  if (item.isbn) score += 3;

  return score;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

function extractJsonTextFromGemini(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const joined = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!joined) {
    return '{"books":[]}';
  }

  // Strip accidental markdown code fences if a model ignores responseMimeType
  const fenced = joined.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : joined).trim();
}

export class ShelfScanService {
  private readonly explicitApiKey?: string | null;
  private readonly explicitModel?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly searchService: BookSearchService;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: ShelfScanServiceOptions) {
    this.explicitApiKey = options.apiKey;
    this.explicitModel = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.searchService = options.searchService;
  }

  private resolveApiKey(): string | null {
    if (this.explicitApiKey !== undefined) {
      return this.explicitApiKey?.trim() || null;
    }
    return getConfig().geminiApiKey;
  }

  private resolveModel(): string {
    if (this.explicitModel?.trim()) {
      return this.explicitModel.trim();
    }
    return getConfig().geminiModel;
  }

  public getStatus(): { enabled: boolean; model: string | null } {
    const key = this.resolveApiKey();
    return {
      enabled: Boolean(key),
      model: key ? this.resolveModel() : null,
    };
  }

  private getCached(key: string): Omit<ShelfScanResponse, 'cached'> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  private setCached(key: string, response: Omit<ShelfScanResponse, 'cached'>): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { createdAt: Date.now(), response });
  }

  private async callGeminiForModel(
    model: string,
    apiKey: string,
    base64Image: string,
    mimeType: string
  ): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: SHELF_SCAN_PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      if (isAbort) {
        throw new AppError(
          504,
          'GEMINI_TIMEOUT',
          'Shelf photo analysis timed out. Try a clearer or closer photo of fewer shelves.'
        );
      }
      throw new AppError(
        502,
        'GEMINI_NETWORK_ERROR',
        'Could not reach Gemini API. Please check your connection and try again.'
      );
    }

    if (!res.ok) {
      let apiMsg = `Gemini API error (${res.status})`;
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        if (errBody?.error?.message) {
          apiMsg = errBody.error.message;
        }
      } catch {
        // ignore JSON parse error on error body
      }
      return { ok: false, status: res.status, message: apiMsg };
    }

    const payload = await res.json();
    return { ok: true, text: extractJsonTextFromGemini(payload) };
  }

  private async detectSpinesWithGemini(
    imageBuffer: Buffer,
    mimeType: string
  ): Promise<{ modelUsed: string; detected: RawDetectedBook[] }> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new AppError(
        503,
        'SHELF_SCAN_NOT_CONFIGURED',
        'Shelf photo scanning is not configured. Add GEMINI_API_KEY to your server environment.'
      );
    }

    const primaryModel = this.resolveModel();
    const candidateModels = [
      primaryModel,
      ...FALLBACK_LITE_MODELS.filter((m) => m !== primaryModel),
    ];

    const base64Image = imageBuffer.toString('base64');
    let lastError: { status: number; message: string } | null = null;
    let modelUsed = primaryModel;
    let rawJsonText: string | null = null;

    for (const model of candidateModels) {
      const result = await this.callGeminiForModel(model, apiKey, base64Image, mimeType);
      if (result.ok) {
        modelUsed = model;
        rawJsonText = result.text;
        break;
      }

      lastError = { status: result.status, message: result.message };
      // Only fall back to another lite model when the model ID isn't found (404)
      if (result.status !== 404) {
        break;
      }
    }

    if (rawJsonText === null) {
      const status = lastError?.status ?? 502;
      if (status === 429) {
        throw new AppError(
          429,
          'GEMINI_RATE_LIMITED',
          'Gemini free-tier rate limit reached. Please wait a moment and try again.'
        );
      }
      if (status === 401 || status === 403) {
        throw new AppError(
          502,
          'GEMINI_AUTH_ERROR',
          'Gemini API key was rejected. Please check GEMINI_API_KEY on the server.'
        );
      }
      throw new AppError(
        502,
        'GEMINI_UPSTREAM_ERROR',
        lastError?.message || 'Gemini could not analyze this photo. Please try again.'
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJsonText);
    } catch {
      throw new AppError(
        502,
        'GEMINI_INVALID_RESPONSE',
        'Received an unreadable response from Gemini. Please retry with a clearer photo.'
      );
    }

    const validated = rawGeminiOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new AppError(
        502,
        'GEMINI_INVALID_RESPONSE',
        'Could not parse detected books from Gemini response.'
      );
    }

    // Sort top-to-bottom, left-to-right, deduplicate identical consecutive/repeated titles, cap at MAX_DETECTED_BOOKS
    const sorted = [...validated.data.books]
      .sort((a, b) => a.shelfRow - b.shelfRow || a.position - b.position)
      .slice(0, MAX_DETECTED_BOOKS);

    const seen = new Set<string>();
    const deduped: RawDetectedBook[] = [];
    for (const item of sorted) {
      const normKey = `${normalizeForCompare(item.title)}|${normalizeForCompare(item.author ?? '')}`;
      if (!normKey || normKey === '|' || seen.has(normKey)) continue;
      seen.add(normKey);
      deduped.push({
        title: item.title,
        author: item.author || null,
        shelfRow: item.shelfRow,
        position: item.position,
        spineColorHex: item.spineColorHex ?? null,
        confidence: item.confidence,
        language: item.language ?? null,
      });
    }

    return { modelUsed, detected: deduped };
  }

  public async scanShelfPhoto(
    imageBuffer: Buffer,
    mimeType: string
  ): Promise<ShelfScanResponse> {
    const hash = crypto
      .createHash('sha256')
      .update(imageBuffer)
      .update(`:${this.resolveModel()}`)
      .digest('hex');

    const cached = this.getCached(hash);
    if (cached) {
      return {
        ...cached,
        cached: true,
      };
    }

    const { modelUsed, detected } = await this.detectSpinesWithGemini(
      imageBuffer,
      mimeType
    );

    if (detected.length === 0) {
      const emptyResult: Omit<ShelfScanResponse, 'cached'> = {
        model: modelUsed,
        detectedCount: 0,
        matchedCount: 0,
        books: [],
        notice:
          'No readable book spines were found. Try taking a closer, well-lit photo facing the spines straight-on.',
      };
      this.setCached(hash, emptyResult);
      return { ...emptyResult, cached: false };
    }

    const resolvedBooks = await mapWithConcurrency(
      detected,
      MATCH_CONCURRENCY,
      async (spine, index): Promise<ScannedBookCandidate> => {
        const searchQuery = spine.author
          ? `${spine.title} ${spine.author}`
          : spine.title;

        let matches: SearchBookResult[] = [];
        try {
          let searchRes = await this.searchService.search({
            q: searchQuery,
            type: 'all',
            page: 1,
            limit: 5,
          });
          // Fallback to title-only search if combining with a partial/surname author yielded 0 results
          if (searchRes.items.length === 0 && spine.author) {
            searchRes = await this.searchService.search({
              q: spine.title,
              type: 'title',
              page: 1,
              limit: 4,
            });
          }
          matches = [...searchRes.items]
            .sort(
              (a, b) =>
                scoreMatch(b, spine.title, spine.author, spine.language) -
                scoreMatch(a, spine.title, spine.author, spine.language)
            )
            .slice(0, 3);
        } catch {
          // Graceful degradation: keep the detected spine as unmatched so user can add manually or re-search
          matches = [];
        }

        return {
          scanId: `scan-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
          shelfRow: spine.shelfRow,
          position: spine.position,
          detectedTitle: spine.title,
          detectedAuthor: spine.author,
          language: spine.language,
          spineColorHex: spine.spineColorHex,
          confidence: spine.confidence,
          matchStatus: matches.length > 0 ? 'matched' : 'unmatched',
          matches,
        };
      }
    );

    const matchedCount = resolvedBooks.filter((b) => b.matchStatus === 'matched').length;
    const response: Omit<ShelfScanResponse, 'cached'> = {
      model: modelUsed,
      detectedCount: resolvedBooks.length,
      matchedCount,
      books: resolvedBooks,
    };

    this.setCached(hash, response);
    return { ...response, cached: false };
  }
}
