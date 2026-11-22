import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Bookmark, CheckCircle2, Search, Star, Tag, X } from 'lucide-react';
import {
  resolveSpineAppearance,
  type BookshelfDto,
  type ShelfBookDto,
} from '@bookshelf/shared';

interface LibrarySearchPaletteProps {
  open: boolean;
  onClose: () => void;
  bookshelves: BookshelfDto[];
  onSelectResult: (bookshelfId: string, shelfBook: ShelfBookDto) => void;
}

interface SearchHit {
  shelf: BookshelfDto;
  compartmentLabel: string;
  shelfBook: ShelfBookDto;
}

export function LibrarySearchPalette({
  open,
  onClose,
  bookshelves,
  onSelectResult,
}: LibrarySearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'reading' | 'finished' | 'unread'>('all');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allEntries = useMemo<SearchHit[]>(() => {
    const out: SearchHit[] = [];
    for (const shelf of bookshelves) {
      for (const comp of shelf.compartments) {
        const compLabel =
          comp.settings.label || `Level ${comp.row + 1}`;
        for (const sb of comp.books) {
          out.push({ shelf, compartmentLabel: compLabel, shelfBook: sb });
        }
      }
    }
    return out;
  }, [bookshelves]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries.filter(({ shelf, compartmentLabel, shelfBook }) => {
      const status = shelfBook.visualOverrides.readingStatus ?? 'unread';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        shelfBook.book.title,
        shelfBook.book.authors.join(' '),
        shelfBook.book.isbn ?? '',
        shelf.name,
        shelf.tag ?? '',
        compartmentLabel,
        shelfBook.visualOverrides.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allEntries, query, statusFilter]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setStatusFilter('all');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, statusFilter]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && filtered[activeIdx]) {
        e.preventDefault();
        const hit = filtered[activeIdx];
        onSelectResult(hit.shelf.id, hit.shelfBook);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, activeIdx, onSelectResult, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[4vh] sm:pt-[10vh] px-3 sm:px-4 bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Find in My Library"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="library-search-palette"
        className="w-full max-w-xl rounded-2xl border ui-surface-panel shadow-[0_30px_80px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[84dvh] sm:max-h-[74vh]"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b ui-surface-header">
          <Search className="w-4 h-4 text-[#c89d54] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a book across all your shelves, authors, tags, or notes..."
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm ui-text-primary placeholder:opacity-55 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-current/20 px-1.5 py-0.5 text-[10px] ui-text-muted font-mono">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close library search"
            className="p-1 rounded-md ui-text-muted hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b ui-surface-header text-xs overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: `All (${allEntries.length})` },
              { id: 'reading', label: 'Reading' },
              { id: 'finished', label: 'Finished' },
              { id: 'unread', label: 'Unread' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-full border transition cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === f.id
                  ? 'bg-[#cfa458] text-[#1a1107] border-[#e2be79] font-semibold'
                  : 'border-current/15 ui-text-secondary hover:border-[#cfa458]/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto library-scroll p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-35" />
              <p className="text-sm ui-text-secondary">
                No matching books in your library.
              </p>
              <p className="text-xs ui-text-muted mt-1">
                Try another title, author, or shelf tag.
              </p>
            </div>
          ) : (
            filtered.slice(0, 40).map((hit, idx) => {
              const app = resolveSpineAppearance({
                id: hit.shelfBook.book.id,
                title: hit.shelfBook.book.title,
                authors: hit.shelfBook.book.authors,
                format: hit.shelfBook.book.physicalDimensions.format,
                categories: hit.shelfBook.book.metadata.categories,
                palette: hit.shelfBook.book.metadata.palette,
                metadataBindingStyle: hit.shelfBook.book.metadata.bindingStyle,
                overrides: hit.shelfBook.visualOverrides,
              });
              const status = hit.shelfBook.visualOverrides.readingStatus;
              const rating = hit.shelfBook.visualOverrides.rating;
              const isSelected = idx === activeIdx;

              return (
                <button
                  key={hit.shelfBook.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    onSelectResult(hit.shelf.id, hit.shelfBook);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#cfa458]/20 ring-1 ring-[#cfa458]/45'
                      : 'hover:bg-[#cfa458]/10'
                  }`}
                >
                  {/* Mini Spine Swatch */}
                  <span
                    className="w-3.5 h-10 rounded-[2px] shrink-0 shadow-sm border border-black/25"
                    style={{
                      background: `linear-gradient(180deg, ${app.primaryColor}, ${app.secondaryColor})`,
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-display text-base font-semibold ui-text-primary truncate">
                        {hit.shelfBook.book.title}
                      </p>
                      {status === 'reading' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 px-1.5 py-0.2 text-[10px] font-medium shrink-0">
                          <Bookmark className="w-2.5 h-2.5" />
                          Reading
                        </span>
                      )}
                      {status === 'finished' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-medium shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Finished
                        </span>
                      )}
                    </div>
                    <p className="text-xs ui-text-secondary truncate">
                      {hit.shelfBook.book.authors.join(', ') || 'Unknown Author'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full border border-current/15 px-2 py-0.5 text-[10px] ui-text-secondary">
                      {hit.shelf.name}
                      {hit.shelf.tag && (
                        <>
                          <Tag className="w-2.5 h-2.5 text-[#c89d54]" />
                          {hit.shelf.tag}
                        </>
                      )}
                    </span>
                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] ui-text-muted">
                      <span>{hit.compartmentLabel}</span>
                      {rating && (
                        <span className="inline-flex items-center gap-0.5 text-[#d7a94e] font-medium">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          {rating}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
