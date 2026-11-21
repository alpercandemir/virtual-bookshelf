import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BookPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  resolveSpineAppearance,
  type BookshelfDto,
  type SearchBookResult,
  type SearchEditionSummary,
  type SearchResponse,
} from '@bookshelf/shared';
import { api, ApiError, getProxiedCoverUrl } from '../../api/client';
import { extractCoverPaletteFromUrl } from '../../utils/extractCoverPalette';
import { ProceduralCover } from '../bookshelf/ProceduralCover';

interface BookSearchModalProps {
  open: boolean;
  onClose: () => void;
  bookshelf: BookshelfDto;
  allBookshelves?: BookshelfDto[];
  initialCompartmentId?: string | null;
  onAddBook: (payload: Parameters<typeof api.addBook>[0]) => Promise<unknown>;
  onOpenManualEntry: (prefillQuery?: string) => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

const SEARCH_MODES: Array<{ value: 'all' | 'title' | 'author' | 'isbn'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'isbn', label: 'ISBN' },
];

function ResultCard({
  item,
  adding,
  alreadyInLibrary,
  justShelved,
  onSelectAdd,
}: {
  item: SearchBookResult;
  adding: boolean;
  alreadyInLibrary: boolean;
  justShelved: boolean;
  onSelectAdd: (item: SearchBookResult, edition?: SearchEditionSummary) => void;
}) {
  const [selectedEditionIdx, setSelectedEditionIdx] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const activeEdition = item.editions?.[selectedEditionIdx];
  const displayCoverUrl = activeEdition?.coverUrl ?? item.coverUrl;
  // Use fast medium-sized Open Library cover for small 68x102 search previews
  const previewCoverUrl = displayCoverUrl
    ? displayCoverUrl.replace(/-L\.jpg/i, '-M.jpg')
    : null;
  const proxiedCover = getProxiedCoverUrl(previewCoverUrl);
  const displayPublisher = activeEdition?.publisher ?? item.publisher;
  const displayDate = activeEdition?.publicationDate ?? item.publicationDate;
  const displayIsbn = activeEdition?.isbn ?? item.isbn;
  const displayPages = activeEdition?.pageCount ?? item.pageCount;

  const fallbackAppearance = resolveSpineAppearance({
    id: item.id,
    title: item.title,
    authors: item.authors,
    format: item.physicalDimensions.format,
    categories: item.categories,
  });

  useEffect(() => {
    setImgLoaded(false);
    setImgFailed(false);
  }, [proxiedCover]);

  return (
    <div
      data-testid={`search-result-${item.providerBookId}`}
      className="flex gap-3.5 rounded-xl border border-[#c9a15c]/18 bg-[#150f0b] hover:border-[#d8b064]/40 p-3.5 transition"
    >
      {/* Book Cover Thumbnail (Procedural cover always renders underneath while real cover loads) */}
      <div className="relative w-[68px] h-[102px] shrink-0 rounded overflow-hidden shadow-[0_6px_14px_rgba(0,0,0,0.65)] bg-[#231912]">
        <div className="relative z-0 w-full h-full isolate">
          <ProceduralCover
            title={item.title}
            authors={item.authors}
            publisher={displayPublisher}
            publicationDate={displayDate}
            appearance={fallbackAppearance}
            compact
          />
        </div>
        {proxiedCover && !imgFailed && (
          <img
            src={proxiedCover}
            alt={`Cover of ${item.title}`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className={`absolute inset-0 z-30 w-full h-full object-cover transition-opacity duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
      </div>

      {/* Metadata & Edition Selection */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-[#f7ecd9] leading-snug line-clamp-2">
            {item.title}
          </h3>
          <p className="text-xs text-[#d6b26f] mt-0.5 truncate">
            {item.authors.length > 0 ? item.authors.join(', ') : 'Unknown author'}
          </p>
          <p className="text-[11px] text-[#9e8a71] mt-1 line-clamp-2">
            {[
              displayDate?.slice(0, 4),
              displayPublisher,
              displayPages ? `${displayPages} pp.` : null,
              displayIsbn ? `ISBN ${displayIsbn}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <div className="space-y-2">
          {item.editions && item.editions.length > 1 && (
            <label className="flex items-center gap-1.5 text-[11px] text-[#b8a388] min-w-0">
              <Layers className="w-3 h-3 text-[#d1aa5e] shrink-0" />
              <select
                aria-label={`Choose edition for ${item.title}`}
                value={selectedEditionIdx}
                onChange={(e) => setSelectedEditionIdx(Number(e.target.value))}
                className="flex-1 min-w-0 h-7 rounded bg-[#0f0a07] border border-[#c9a15c]/25 px-2 text-[11px] text-[#ead9be] truncate"
              >
                {item.editions.map((ed, idx) => (
                  <option key={`${ed.providerBookId}-${idx}`} value={idx}>
                    {(ed.publisher || `Edition ${idx + 1}`).slice(0, 24)}
                    {ed.publicationDate ? ` (${ed.publicationDate.slice(0, 4)})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-[#7c6a56] truncate">
                {item.provider === 'google_books' ? 'Google Books' : 'Open Library'}
              </span>
              {alreadyInLibrary && !justShelved && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-950/75 border border-amber-500/35 px-1.5 py-0.2 text-[9px] font-medium text-amber-200 shrink-0">
                  In Library
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={adding}
              onClick={() => onSelectAdd(item, activeEdition)}
              className={`inline-flex items-center gap-1.5 rounded-lg font-semibold text-xs px-3 py-1.5 shadow transition cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50 ${
                justShelved
                  ? 'bg-emerald-800/90 hover:bg-emerald-700 text-emerald-50 border border-emerald-400/40'
                  : 'bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] text-[#1b1208]'
              }`}
            >
              {adding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : justShelved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {justShelved ? 'Shelved' : 'Shelve Book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BookSearchModal({
  open,
  onClose,
  bookshelf,
  allBookshelves,
  initialCompartmentId,
  onAddBook,
  onOpenManualEntry,
  onToast,
}: BookSearchModalProps) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'title' | 'author' | 'isbn'>('all');
  const [targetCompartmentId, setTargetCompartmentId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [shelvedIds, setShelvedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  const ownedKeys = useMemo(() => {
    const keys = new Set<string>();
    const shelves = allBookshelves?.length ? allBookshelves : [bookshelf];
    for (const s of shelves) {
      for (const c of s.compartments) {
        for (const sb of c.books) {
          if (sb.book.isbn) keys.add(`isbn:${sb.book.isbn.replace(/[^0-9X]/gi, '')}`);
          if (sb.book.providerBookId) keys.add(`pid:${sb.book.providerBookId}`);
          keys.add(`title:${sb.book.title.trim().toLowerCase()}`);
        }
      }
    }
    return keys;
  }, [allBookshelves, bookshelf]);

  useEffect(() => {
    if (open) {
      setShelvedIds(new Set());
      setTargetCompartmentId(
        initialCompartmentId || bookshelf.compartments[0]?.id || ''
      );
    }
  }, [open, initialCompartmentId, bookshelf.compartments]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runSearch = async (nextPage = 1) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setPage(nextPage);
    try {
      const res = await api.searchBooks({
        q: trimmed,
        type: searchType,
        page: nextPage,
        limit: 10,
      });
      setResponse(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Search failed. Please try again or add the book manually.'
      );
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(1);
  };

  const handleAddResult = async (
    item: SearchBookResult,
    edition?: SearchEditionSummary
  ) => {
    setAddingId(item.id);
    try {
      const coverUrl = edition?.coverUrl ?? item.coverUrl;
      let visualOverrides = undefined;

      // Attempt fast cover palette extraction so the newly shelved spine matches its real cover!
      const proxied = getProxiedCoverUrl(coverUrl);
      if (proxied) {
        const extracted = await extractCoverPaletteFromUrl(proxied);
        if (extracted) {
          visualOverrides = {
            spineColor: extracted.primary,
            secondaryColor: extracted.secondary,
            accentColor: extracted.accent,
            textColor: extracted.textColor,
          };
        }
      }

      await onAddBook({
        compartmentId: targetCompartmentId || undefined,
        book: {
          provider: edition?.provider ?? item.provider,
          providerBookId: edition?.providerBookId ?? item.providerBookId,
          isbn: edition?.isbn ?? item.isbn,
          title: item.title,
          subtitle: item.subtitle,
          authors: item.authors,
          publisher: edition?.publisher ?? item.publisher,
          publicationDate: edition?.publicationDate ?? item.publicationDate,
          pageCount: edition?.pageCount ?? item.pageCount,
          coverUrl,
          description: item.description,
          categories: item.categories,
          language: item.language,
          format: item.physicalDimensions.format,
          ...(item.physicalDimensions.source === 'verified'
            ? {
                heightMm: item.physicalDimensions.heightMm,
                widthMm: item.physicalDimensions.widthMm,
                thicknessMm: item.physicalDimensions.thicknessMm,
                dimensionSource: 'verified' as const,
              }
            : {}),
        },
        visualOverrides,
      });
      setShelvedIds((prev) => new Set(prev).add(item.id));
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Unable to add book to shelf.',
        'error'
      );
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search and Add Books"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="book-search-modal"
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-[#cfa55a]/30 bg-[#1a130e] shadow-[0_32px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#c9a15c]/15 bg-[#140e0a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-[#dfb86d]" />
            <h2 className="font-display text-2xl font-semibold text-[#f7ebd7]">
              Discover &amp; Shelve Books
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenManualEntry(query);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9a15c]/25 bg-[#1f1610] hover:bg-[#2c1f16] px-3 py-1.5 text-xs text-[#ebd9bc] transition cursor-pointer"
            >
              <BookPlus className="w-3.5 h-3.5 text-[#dfb86d]" />
              Manual Entry
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              className="p-1.5 rounded-lg text-[#a99479] hover:text-[#f6e8d0] hover:bg-[#2a1f16] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Controls */}
        <form
          onSubmit={handleSubmit}
          className="px-6 py-4 border-b border-[#c9a15c]/12 bg-[#17100c] space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8c7860] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                autoFocus
                data-testid="book-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  searchType === 'isbn'
                    ? 'Enter 10- or 13-digit ISBN (e.g. 9780441172719)'
                    : searchType === 'author'
                      ? 'Search by author (e.g. Ursula K. Le Guin)'
                      : searchType === 'title'
                        ? 'Search by title (e.g. The Name of the Rose)'
                        : 'Search title, author, or ISBN...'
                }
                className="w-full rounded-lg bg-[#100b08] border border-[#c9a15c]/25 pl-10 pr-3.5 py-2.5 text-sm text-[#f7eedf] placeholder:text-[#6f5d49] focus:outline-none focus:border-[#dfb86d]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              data-testid="book-search-submit"
              className="rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] disabled:opacity-50 text-[#1b1208] font-semibold text-sm px-5 py-2.5 shadow cursor-pointer shrink-0"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Field Tabs */}
            <div className="flex items-center gap-1">
              {SEARCH_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setSearchType(m.value)}
                  className={`px-2.5 py-1 rounded-md text-xs transition cursor-pointer ${
                    searchType === m.value
                      ? 'bg-[#342416] text-[#f6e3ba] border border-[#dab367]/45'
                      : 'text-[#a38f76] hover:text-[#e6d5b9]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Destination Shelf Picker */}
            <label className="flex items-center gap-2 text-xs text-[#baa589]">
              <span>Place on:</span>
              <select
                value={targetCompartmentId}
                onChange={(e) => setTargetCompartmentId(e.target.value)}
                className="rounded-md bg-[#100b08] border border-[#c9a15c]/25 px-2.5 py-1 text-xs text-[#f0e2ca]"
              >
                {bookshelf.compartments.map((c) => (
                  <option key={c.id} value={c.id}>
                    Level {c.row + 1}
                    {c.settings.label
                      ? ` — ${c.settings.label}`
                      : ` (Col ${c.column + 1})`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto library-scroll p-6 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-400/35 bg-red-950/40 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
              <div className="text-sm text-red-100">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenManualEntry(query);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#f2cf84] hover:underline cursor-pointer"
                >
                  <BookPlus className="w-3.5 h-3.5" />
                  Add this book manually instead
                </button>
              </div>
            </div>
          )}

          {response?.fallbackNotice && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-200/90">
              {response.fallbackNotice}
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-[#bca68a] gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-[#dfb86d]" />
              <p className="text-sm">Searching library catalogs...</p>
            </div>
          )}

          {!loading && !response && !error && (
            <div className="py-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-[#867057] mx-auto" />
              <p className="text-sm text-[#c6b296]">
                Search by title, author, or ISBN to fetch real covers and bibliographic metadata.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {['The Hobbit', 'Jorge Luis Borges', '9780141439518'].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      setQuery(hint);
                      setSearchType(/^\d+$/.test(hint) ? 'isbn' : 'all');
                    }}
                    className="rounded-full border border-[#c9a15c]/22 bg-[#140e0a] hover:border-[#dfb86d]/50 px-3 py-1 text-xs text-[#d6c2a5] cursor-pointer"
                  >
                    Try &ldquo;{hint}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && response && response.items.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-[#c6b296]">
                No catalog editions matched &ldquo;{response.query}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManualEntry(query);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dab468]/40 bg-[#2b1e14] px-4 py-2 text-xs font-medium text-[#f6e2b7] hover:bg-[#38271a] cursor-pointer"
              >
                <BookPlus className="w-4 h-4" />
                Add &ldquo;{response.query}&rdquo; Manually
              </button>
            </div>
          )}

          {!loading && response && response.items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {response.items.map((item) => {
                const isOwned =
                  ownedKeys.has(`pid:${item.providerBookId}`) ||
                  (item.isbn
                    ? ownedKeys.has(`isbn:${item.isbn.replace(/[^0-9X]/gi, '')}`)
                    : false) ||
                  ownedKeys.has(`title:${item.title.trim().toLowerCase()}`);
                return (
                  <ResultCard
                    key={item.id}
                    item={item}
                    adding={addingId === item.id}
                    alreadyInLibrary={isOwned}
                    justShelved={shelvedIds.has(item.id)}
                    onSelectAdd={handleAddResult}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: Pagination & Manual Fallback */}
        <div className="px-6 py-3.5 border-t border-[#c9a15c]/15 bg-[#130d09] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenManualEntry(query);
            }}
            className="inline-flex items-center gap-1.5 text-xs text-[#d7b269] hover:underline cursor-pointer"
          >
            <BookPlus className="w-3.5 h-3.5" />
            Can&apos;t find your book? Add manually
          </button>

          {response && (response.page > 1 || response.hasMore) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || page <= 1}
                onClick={() => runSearch(page - 1)}
                className="inline-flex items-center gap-1 rounded border border-[#c9a15c]/25 px-2.5 py-1 text-xs text-[#e3d1b6] disabled:opacity-40 hover:bg-[#261c14] cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <span className="text-xs text-[#a59177] tabular-nums">
                Page {response.page}
              </span>
              <button
                type="button"
                disabled={loading || !response.hasMore}
                onClick={() => runSearch(page + 1)}
                className="inline-flex items-center gap-1 rounded border border-[#c9a15c]/25 px-2.5 py-1 text-xs text-[#e3d1b6] disabled:opacity-40 hover:bg-[#261c14] cursor-pointer"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
