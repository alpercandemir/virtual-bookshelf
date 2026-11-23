import {
  computeOccupiedWidthPx,
  getCompartmentCapacityPx,
  resolveSpineAppearance,
  type BookshelfDto,
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';

export type ShelfSortMode =
  | 'title'
  | 'author'
  | 'author-last-name'
  | 'height'
  | 'color';

export interface ParsedAuthorSortKey {
  lastName: string;
  givenName: string;
}

export interface ArrangeBookshelfResult {
  updatedBookshelf: BookshelfDto;
  payload: Array<{ compartmentId: string; shelfBookIds: string[] }>;
  fits: boolean;
}

const AUTHOR_NAME_SUFFIXES = new Set([
  'jr',
  'sr',
  'ii',
  'iii',
  'iv',
  'v',
  'phd',
  'md',
  'esq',
]);

const SURNAME_PARTICLES = new Set([
  'da',
  'das',
  'de',
  'del',
  'della',
  'den',
  'der',
  'di',
  'dos',
  'du',
  'la',
  'le',
  'st',
  'st.',
  'ten',
  'ter',
  'van',
  'von',
]);

const PACK_TOLERANCES_PX = [0, 24, 40] as const;

function normalizeSuffixToken(token: string): string {
  return token.replace(/[.,]/g, '').trim().toLowerCase();
}

function isSuffixToken(token: string): boolean {
  return AUTHOR_NAME_SUFFIXES.has(normalizeSuffixToken(token));
}

function isSurnameParticle(token: string): boolean {
  const lower = token.trim().toLowerCase();
  return SURNAME_PARTICLES.has(lower);
}

/**
 * Extracts sortable last-name and given-name parts from an author string.
 * Supports:
 * - "First Last" / "First Middle Last" -> lastName: "Last", givenName: "First Middle"
 * - Multi-word surname particles: "Ursula K. Le Guin" -> lastName: "Le Guin", givenName: "Ursula K."
 * - Comma-inverted names: "Herbert, Frank" -> lastName: "Herbert", givenName: "Frank"
 * - Generational/credential suffixes: "Martin Luther King Jr." / "Kurt Vonnegut, Jr."
 * - Mononyms: "Homer" -> lastName: "Homer", givenName: ""
 */
export function parseAuthorNameForLastNameSort(
  rawAuthor: string
): ParsedAuthorSortKey {
  const cleaned = rawAuthor.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { lastName: '', givenName: '' };
  }

  const commaParts = cleaned
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  while (commaParts.length > 1 && isSuffixToken(commaParts[commaParts.length - 1])) {
    commaParts.pop();
  }

  if (commaParts.length >= 2) {
    return {
      lastName: commaParts[0],
      givenName: commaParts.slice(1).join(' '),
    };
  }

  const singleSegment = commaParts[0] ?? cleaned;
  const tokens = singleSegment.split(' ').filter(Boolean);

  while (tokens.length > 1 && isSuffixToken(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  if (tokens.length <= 1) {
    return { lastName: tokens[0] ?? '', givenName: '' };
  }

  let surnameStart = tokens.length - 1;
  while (surnameStart > 1 && isSurnameParticle(tokens[surnameStart - 1])) {
    surnameStart -= 1;
  }

  return {
    lastName: tokens.slice(surnameStart).join(' '),
    givenName: tokens.slice(0, surnameStart).join(' '),
  };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function getPrimaryAuthor(sb: ShelfBookDto): string {
  const first = sb.book.authors.find((author) => author.trim().length > 0);
  return first?.trim() ?? '';
}

function compareByFullAuthor(a: ShelfBookDto, b: ShelfBookDto): number {
  const authA = getPrimaryAuthor(a);
  const authB = getPrimaryAuthor(b);
  if (!authA && !authB) return 0;
  if (!authA) return 1;
  if (!authB) return -1;
  return compareText(authA, authB);
}

function compareByAuthorLastName(a: ShelfBookDto, b: ShelfBookDto): number {
  const authA = getPrimaryAuthor(a);
  const authB = getPrimaryAuthor(b);
  if (!authA && !authB) return 0;
  if (!authA) return 1;
  if (!authB) return -1;

  const keyA = parseAuthorNameForLastNameSort(authA);
  const keyB = parseAuthorNameForLastNameSort(authB);
  return (
    compareText(keyA.lastName, keyB.lastName) ||
    compareText(keyA.givenName, keyB.givenName) ||
    compareText(authA, authB)
  );
}

export function hexToHue(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 360 + (1 - max) * 100; // neutrals grouped at the end by lightness
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function sortShelfBooks(
  books: ShelfBookDto[],
  mode: ShelfSortMode
): ShelfBookDto[] {
  const copy = [...books];

  const hueByBookId =
    mode === 'color'
      ? new Map(
          copy.map((sb) => {
            const app = resolveSpineAppearance({
              id: sb.book.id,
              title: sb.book.title,
              authors: sb.book.authors,
              format: sb.book.physicalDimensions.format,
              categories: sb.book.metadata.categories,
              palette: sb.book.metadata.palette,
              metadataBindingStyle: sb.book.metadata.bindingStyle,
              overrides: sb.visualOverrides,
            });
            return [sb.id, hexToHue(app.primaryColor)] as const;
          })
        )
      : null;

  copy.sort((a, b) => {
    if (mode === 'title') {
      return (
        compareText(a.book.title, b.book.title) ||
        compareByFullAuthor(a, b) ||
        a.id.localeCompare(b.id)
      );
    }
    if (mode === 'author') {
      return (
        compareByFullAuthor(a, b) ||
        compareText(a.book.title, b.book.title) ||
        a.id.localeCompare(b.id)
      );
    }
    if (mode === 'author-last-name') {
      return (
        compareByAuthorLastName(a, b) ||
        compareText(a.book.title, b.book.title) ||
        a.id.localeCompare(b.id)
      );
    }
    if (mode === 'height') {
      return (
        b.book.physicalDimensions.heightMm - a.book.physicalDimensions.heightMm ||
        compareText(a.book.title, b.book.title) ||
        a.id.localeCompare(b.id)
      );
    }
    const hueA = hueByBookId?.get(a.id) ?? 0;
    const hueB = hueByBookId?.get(b.id) ?? 0;
    return (
      hueA - hueB ||
      compareText(a.book.title, b.book.title) ||
      a.id.localeCompare(b.id)
    );
  });

  return copy;
}

function tryPackBooksAcrossCompartments(
  sortedBooks: ShelfBookDto[],
  orderedCompartments: ShelfCompartmentDto[],
  tolerancePx: number
): { buckets: ShelfBookDto[][]; fits: boolean } {
  const buckets: ShelfBookDto[][] = orderedCompartments.map(() => []);
  let compIdx = 0;

  for (const book of sortedBooks) {
    while (compIdx < orderedCompartments.length - 1) {
      const comp = orderedCompartments[compIdx];
      if (buckets[compIdx].length === 0) break;

      const nextOccupied = computeOccupiedWidthPx(
        [...buckets[compIdx], book].map((item) => ({
          dimensions: item.book.physicalDimensions,
          orientation: item.orientation,
        })),
        comp.heightPx
      );
      const limit = getCompartmentCapacityPx(comp.widthRatio) + tolerancePx;
      if (nextOccupied <= limit) {
        break;
      }
      compIdx += 1;
    }

    buckets[compIdx].push(book);
  }

  const lastComp = orderedCompartments[orderedCompartments.length - 1];
  const lastBucket = buckets[buckets.length - 1];
  const lastOccupied = computeOccupiedWidthPx(
    lastBucket.map((item) => ({
      dimensions: item.book.physicalDimensions,
      orientation: item.orientation,
    })),
    lastComp.heightPx
  );
  const lastLimit = getCompartmentCapacityPx(lastComp.widthRatio) + tolerancePx;
  const fits = lastBucket.length <= 1 || lastOccupied <= lastLimit;

  return { buckets, fits };
}

/**
 * Sorts ALL books across the entire bookshelf (not independently per section/compartment),
 * then distributes them sequentially from top-left to bottom-right respecting compartment
 * horizontal capacities.
 */
export function arrangeBookshelf(
  bookshelf: BookshelfDto,
  mode: ShelfSortMode
): ArrangeBookshelfResult {
  const orderedCompartments = [...bookshelf.compartments].sort(
    (a, b) => a.row - b.row || a.column - b.column || a.ordering - b.ordering
  );

  if (orderedCompartments.length === 0) {
    return {
      updatedBookshelf: bookshelf,
      payload: [],
      fits: true,
    };
  }

  const allBooks = orderedCompartments.flatMap((c) => c.books);
  const sortedBooks = sortShelfBooks(allBooks, mode);

  let chosen = tryPackBooksAcrossCompartments(
    sortedBooks,
    orderedCompartments,
    PACK_TOLERANCES_PX[0]
  );

  if (!chosen.fits) {
    for (const tolerance of PACK_TOLERANCES_PX.slice(1)) {
      const candidate = tryPackBooksAcrossCompartments(
        sortedBooks,
        orderedCompartments,
        tolerance
      );
      chosen = candidate;
      if (candidate.fits) break;
    }
  }

  const nextCompartments: ShelfCompartmentDto[] = orderedCompartments.map(
    (comp, idx) => ({
      ...comp,
      books: chosen.buckets[idx].map((sb, pos) => ({
        ...sb,
        compartmentId: comp.id,
        position: pos,
      })),
    })
  );

  const updatedBookshelf: BookshelfDto = {
    ...bookshelf,
    compartments: nextCompartments,
  };

  const payload = nextCompartments.map((c) => ({
    compartmentId: c.id,
    shelfBookIds: c.books.map((b) => b.id),
  }));

  return {
    updatedBookshelf,
    payload,
    fits: chosen.fits,
  };
}
