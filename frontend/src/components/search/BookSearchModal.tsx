import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BookPlus,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  resolveSpineAppearance,
  type BookFormat,
  type BookshelfDto,
  type SearchBookResult,
  type SearchEditionSummary,
  type SearchResponse,
} from '@bookshelf/shared';
import { api, ApiError, getProxiedCoverUrl } from '../../api/client';
import { extractCoverPaletteFromUrl } from '../../utils/extractCoverPalette';
import { ProceduralCover } from '../bookshelf/ProceduralCover';
import { ShelfPhotoScanner } from './ShelfPhotoScanner';

interface BookSearchModalProps {
  open: boolean;
  onClose: () => void;
  bookshelf: BookshelfDto;
  allBookshelves?: BookshelfDto[];
  initialCompartmentId?: string | null;
  initialTab?: 'search' | 'scan' | 'manual';
  onAddBook: (
    payload: Parameters<typeof api.addBook>[0],
    options?: { silent?: boolean }
  ) => Promise<unknown>;
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
      className="flex gap-3.5 rounded-xl border ui-surface-card hover:border-[#cfa458]/55 p-3.5 transition"
    >
      {/* Book Cover Thumbnail */}
      <div className="relative w-[56px] h-[84px] sm:w-[68px] sm:h-[102px] shrink-0 rounded overflow-hidden shadow-[0_6px_14px_rgba(0,0,0,0.45)] bg-[#231912]">
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
          <h3 className="font-display text-lg font-semibold ui-text-primary leading-snug line-clamp-2">
            {item.title}
          </h3>
          <p className="text-xs text-[#c89d54] mt-0.5 truncate font-medium">
            {item.authors.length > 0 ? item.authors.join(', ') : 'Unknown author'}
          </p>
          <p className="text-[11px] ui-text-muted mt-1 line-clamp-2">
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
            <label className="flex items-center gap-1.5 text-[11px] ui-text-secondary min-w-0">
              <Layers className="w-3 h-3 text-[#c89d54] shrink-0" />
              <select
                aria-label={`Choose edition for ${item.title}`}
                value={selectedEditionIdx}
                onChange={(e) => setSelectedEditionIdx(Number(e.target.value))}
                className="flex-1 min-w-0 h-7 rounded ui-surface-input border px-2 text-[11px] truncate"
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
              <span className="text-[10px] uppercase tracking-wider ui-text-muted truncate">
                {item.provider === 'google_books' ? 'Google Books' : 'Open Library'}
              </span>
              {alreadyInLibrary && !justShelved && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-medium text-amber-500 shrink-0">
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
                  ? 'bg-emerald-700 hover:bg-emerald-600 text-emerald-50 border border-emerald-400/40'
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
  initialTab = 'search',
  onAddBook,
  onToast,
}: BookSearchModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'scan' | 'manual'>(initialTab);

  // Search state
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'title' | 'author' | 'isbn'>('all');
  const [targetCompartmentId, setTargetCompartmentId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [shelvedIds, setShelvedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  // Manual entry state
  const [manualTitle, setManualTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationDate, setPublicationDate] = useState('');
  const [pageCount, setPageCount] = useState('320');
  const [format, setFormat] = useState<BookFormat>('hardcover');
  const [description, setDescription] = useState('');
  const [spineColor, setSpineColor] = useState('#5A1F24');
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

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
      setActiveTab(initialTab);
      setShelvedIds(new Set());
      setTargetCompartmentId(
        initialCompartmentId || bookshelf.compartments[0]?.id || ''
      );
      setManualTitle('');
      setAuthorsText('');
      setIsbn('');
      setPublisher('');
      setPublicationDate('');
      setPageCount('320');
      setFormat('hardcover');
      setDescription('');
      setUseCustomColor(false);
      setUploadedCoverUrl(null);
      setManualError(null);
    }
  }, [open, initialTab, initialCompartmentId, bookshelf.compartments]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const switchToManual = (prefill?: string) => {
    const candidate = (prefill ?? query).trim();
    if (candidate && !manualTitle.trim()) {
      if (/^[0-9-]{9,17}[0-9Xx]?$/.test(candidate)) {
        setIsbn(candidate);
      } else {
        setManualTitle(candidate);
      }
    }
    setActiveTab('manual');
  };

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
          : 'Search failed. Please try again or switch to Manual Entry.'
      );
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
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

  const handleUploadCover = async (file: File | undefined) => {
    if (!file) return;
    setManualError(null);
    try {
      const { url } = await api.uploadBookImage(file);
      setUploadedCoverUrl(url);
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : 'Cover upload failed.');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setManualSubmitting(true);
    try {
      const authors = authorsText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      const parsedPages = pageCount ? Number(pageCount) : null;

      await onAddBook({
        compartmentId: targetCompartmentId || undefined,
        book: {
          provider: 'manual',
          title: manualTitle.trim(),
          authors,
          isbn: isbn.trim() || null,
          publisher: publisher.trim() || null,
          publicationDate: publicationDate.trim() || null,
          pageCount: parsedPages && parsedPages > 0 ? parsedPages : null,
          format,
          description: description.trim() || null,
          coverUrl: uploadedCoverUrl,
        },
        visualOverrides: useCustomColor ? { spineColor } : undefined,
      });
      onClose();
    } catch (err) {
      setManualError(
        err instanceof ApiError ? err.message : 'Could not add book.'
      );
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-6 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add Book to Bookshelf"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="book-search-modal"
        className="w-full max-w-3xl max-h-[94dvh] sm:max-h-[90vh] rounded-2xl border ui-surface-panel shadow-[0_32px_80px_rgba(0,0,0,0.65)] flex flex-col overflow-hidden"
      >
        {/* Header with Integrated Search / Manual Entry Tabs */}
        <div className="px-4 sm:px-6 pt-3.5 sm:pt-4 pb-3 border-b ui-surface-header space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {activeTab === 'search' ? (
                <Search className="w-4 h-4 text-[#c89d54]" />
              ) : activeTab === 'scan' ? (
                <Camera className="w-4 h-4 text-[#c89d54]" />
              ) : (
                <BookPlus className="w-4 h-4 text-[#c89d54]" />
              )}
              <h2 className="font-display text-2xl font-semibold ui-text-primary">
                Add Book to Shelf
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close add book dialog"
              className="p-1.5 rounded-lg ui-text-muted hover:opacity-100 hover:bg-[#cfa458]/15 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Segmented Mode Tabs + Hover Hint on Manual Entry */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-xl border ui-surface-input p-1">
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-[#cfa458] text-[#1a1107] font-semibold shadow-sm'
                    : 'ui-text-secondary hover:ui-text-primary'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Search Catalog
              </button>

              <button
                type="button"
                data-testid="scan-photo-tab-btn"
                onClick={() => setActiveTab('scan')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  activeTab === 'scan'
                    ? 'bg-[#cfa458] text-[#1a1107] font-semibold shadow-sm'
                    : 'ui-text-secondary hover:ui-text-primary'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Scan Photo
              </button>

              <div className="relative group/manual-tab">
                <button
                  type="button"
                  onClick={() => switchToManual()}
                  title="If you couldn't find the book in search, you can add it manually here"
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                    activeTab === 'manual'
                      ? 'bg-[#cfa458] text-[#1a1107] font-semibold shadow-sm'
                      : 'ui-text-secondary hover:ui-text-primary'
                  }`}
                >
                  <BookPlus className="w-3.5 h-3.5" />
                  Manual Entry
                </button>
                {activeTab === 'search' && (
                  <div
                    role="tooltip"
                    className="pointer-events-none opacity-0 group-hover/manual-tab:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 w-60 rounded-lg border border-[#cfa458]/40 bg-[#16100b] px-3 py-2 text-[11px] leading-snug text-[#f4e6ce] shadow-xl text-center"
                  >
                    Couldn&apos;t find the book in search? Add a custom edition manually.
                  </div>
                )}
              </div>
            </div>

            {/* Destination Shelf Picker (shared across both tabs) */}
            <label className="flex items-center gap-2 text-xs ui-text-secondary w-full sm:w-auto">
              <span className="shrink-0">Place on:</span>
              <select
                value={targetCompartmentId}
                onChange={(e) => setTargetCompartmentId(e.target.value)}
                className="flex-1 sm:flex-none rounded-md ui-surface-input border px-2.5 py-1.5 sm:py-1 text-base sm:text-xs"
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
        </div>

        {activeTab === 'search' ? (
          <>
            {/* Search Controls */}
            <form
              onSubmit={handleSearchSubmit}
              className="px-4 sm:px-6 py-3 sm:py-4 border-b ui-surface-header space-y-2.5 sm:space-y-3"
            >
              <div className="flex flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 ui-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                    className="w-full rounded-lg ui-surface-input border pl-10 pr-3 py-2.5 text-base sm:text-sm focus:outline-none focus:border-[#cfa458]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  data-testid="book-search-submit"
                  className="rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] disabled:opacity-50 text-[#1b1208] font-semibold text-sm px-4 sm:px-5 py-2.5 shadow cursor-pointer shrink-0"
                >
                  {loading ? '...' : 'Search'}
                </button>
              </div>

              {/* Search Field Tabs */}
              <div className="flex items-center gap-1">
                {SEARCH_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setSearchType(m.value)}
                    className={`px-2.5 py-1 rounded-md text-xs transition cursor-pointer ${
                      searchType === m.value
                        ? 'bg-[#cfa458]/20 ui-text-primary border border-[#cfa458]/50 font-medium'
                        : 'ui-text-muted hover:ui-text-primary'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </form>

            {/* Results Body */}
            <div className="flex-1 overflow-y-auto library-scroll p-4 sm:p-6 space-y-3">
              {error && (
                <div className="rounded-xl border border-red-400/35 bg-red-950/35 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-200">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={() => switchToManual(query)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#f2cf84] hover:underline cursor-pointer"
                    >
                      <BookPlus className="w-3.5 h-3.5" />
                      Switch to Manual Entry instead
                    </button>
                  </div>
                </div>
              )}

              {response?.fallbackNotice && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-500">
                  {response.fallbackNotice}
                </div>
              )}

              {loading && (
                <div className="py-16 flex flex-col items-center justify-center ui-text-secondary gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-[#c89d54]" />
                  <p className="text-sm">Searching library catalogs...</p>
                </div>
              )}

              {!loading && !response && !error && (
                <div className="py-10 text-center space-y-3">
                  <BookOpen className="w-10 h-10 ui-text-muted opacity-60 mx-auto" />
                  <p className="text-sm ui-text-secondary">
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
                        className="rounded-full border ui-surface-card hover:border-[#cfa458] px-3 py-1 text-xs ui-text-secondary cursor-pointer"
                      >
                        Try &ldquo;{hint}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!loading && response && response.items.length === 0 && (
                <div className="py-12 text-center space-y-3">
                  <p className="text-sm ui-text-secondary">
                    No catalog editions matched &ldquo;{response.query}&rdquo;.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchToManual(query)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] px-4 py-2 text-xs font-semibold text-[#1a1107] shadow cursor-pointer"
                  >
                    <BookPlus className="w-4 h-4" />
                    Add &ldquo;{response.query}&rdquo; via Manual Entry
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

            {/* Highlighted Footer Callout for Manual Entry + Pagination */}
            <div className="px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t ui-surface-header flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => switchToManual(query)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#cfa458]/35 bg-[#cfa458]/12 hover:bg-[#cfa458]/20 px-3 py-1.5 text-xs transition cursor-pointer text-left"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#c89d54] shrink-0" />
                <span className="ui-text-secondary">
                  Couldn&apos;t find the book in search?{' '}
                  <strong className="text-[#c89d54] underline underline-offset-2">
                    Add via Manual Entry
                  </strong>
                </span>
              </button>

              {response && (response.page > 1 || response.hasMore) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || page <= 1}
                    onClick={() => runSearch(page - 1)}
                    className="inline-flex items-center gap-1 rounded border ui-surface-input px-2.5 py-1 text-xs ui-text-secondary disabled:opacity-40 hover:border-[#cfa458] cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </button>
                  <span className="text-xs ui-text-muted tabular-nums">
                    Page {response.page}
                  </span>
                  <button
                    type="button"
                    disabled={loading || !response.hasMore}
                    onClick={() => runSearch(page + 1)}
                    className="inline-flex items-center gap-1 rounded border ui-surface-input px-2.5 py-1 text-xs ui-text-secondary disabled:opacity-40 hover:border-[#cfa458] cursor-pointer"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'scan' ? (
          <ShelfPhotoScanner
            bookshelf={bookshelf}
            targetCompartmentId={targetCompartmentId}
            ownedKeys={ownedKeys}
            onAddBook={onAddBook}
            onToast={onToast}
            onComplete={onClose}
          />
        ) : (
          /* Integrated Manual Entry Tab */
          <form
            data-testid="manual-book-modal"
            onSubmit={handleManualSubmit}
            className="flex-1 overflow-y-auto library-scroll p-4 sm:p-6 space-y-4"
          >
            {manualError && (
              <div className="rounded-lg border border-red-400/35 bg-red-950/35 px-3.5 py-2 text-xs text-red-200">
                {manualError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Book Title *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  data-testid="manual-title-input"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. The Architecture of Happiness"
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm focus:outline-none focus:border-[#cfa458]"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Author(s) (comma separated)
                </label>
                <input
                  type="text"
                  data-testid="manual-author-input"
                  value={authorsText}
                  onChange={(e) => setAuthorsText(e.target.value)}
                  placeholder="e.g. Alain de Botton"
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm focus:outline-none focus:border-[#cfa458]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as BookFormat)}
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm"
                >
                  <option value="hardcover">Hardcover</option>
                  <option value="trade-paperback">Trade Paperback</option>
                  <option value="mass-market">Mass-Market Paperback</option>
                  <option value="quarto">Tall Folio / Art Book</option>
                  <option value="pocket">Pocket Edition</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Pages
                </label>
                <input
                  type="number"
                  min={16}
                  max={3000}
                  value={pageCount}
                  onChange={(e) => setPageCount(e.target.value)}
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Year
                </label>
                <input
                  type="text"
                  value={publicationDate}
                  onChange={(e) => setPublicationDate(e.target.value)}
                  placeholder="2006"
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  Publisher
                </label>
                <input
                  type="text"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                  ISBN (optional)
                </label>
                <input
                  type="text"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  placeholder="10 or 13 digits"
                  className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Optional Spine Color & Cover Upload */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border ui-surface-card p-3">
              <label className="inline-flex items-center gap-2 text-xs ui-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomColor}
                  onChange={(e) => setUseCustomColor(e.target.checked)}
                  className="accent-[#c89d54]"
                />
                <span>Custom Spine Color</span>
                {useCustomColor && (
                  <input
                    type="color"
                    value={spineColor}
                    onChange={(e) => setSpineColor(e.target.value)}
                    className="w-7 h-6 rounded border border-current/25 bg-transparent cursor-pointer"
                  />
                )}
              </label>

              <label className="inline-flex items-center gap-1.5 rounded-md border ui-surface-input hover:border-[#cfa458] px-2.5 py-1.5 text-xs ui-text-secondary cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#c89d54]" />
                {uploadedCoverUrl ? 'Cover Attached ✓' : 'Upload Cover Image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleUploadCover(e.target.files?.[0])}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider ui-text-muted mb-1.5">
                Description / Notes
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional summary or personal edition notes..."
                className="w-full rounded-lg ui-surface-input border px-3 py-2 text-sm focus:outline-none focus:border-[#cfa458]"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className="text-xs text-[#c89d54] hover:underline cursor-pointer"
              >
                ← Back to Catalog Search
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border ui-surface-input px-4 py-2 text-xs ui-text-secondary hover:border-[#cfa458] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting || !manualTitle.trim()}
                  data-testid="manual-submit-btn"
                  className="rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] disabled:opacity-50 text-[#1b1208] font-semibold text-sm px-5 py-2 shadow cursor-pointer"
                >
                  {manualSubmitting ? 'Shelving...' : 'Add to Bookshelf'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
