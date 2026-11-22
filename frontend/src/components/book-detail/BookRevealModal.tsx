import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  Info,
  MoveHorizontal,
  Palette,
  RotateCw,
  Ruler,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CURATED_BOOK_PALETTES,
  resolveSpineAppearance,
  type BindingStyle,
  type BookOrientation,
  type BookshelfDto,
  type BookVisualOverrides,
  type ReadingStatus,
  type ShelfBookDto,
  type SpineFontStyle,
  type SpineMotif,
} from '@bookshelf/shared';
import { api, ApiError, getProxiedCoverUrl } from '../../api/client';
import { extractCoverPaletteFromUrl } from '../../utils/extractCoverPalette';
import { ProceduralCover } from '../bookshelf/ProceduralCover';

interface BookRevealModalProps {
  shelfBook: ShelfBookDto | null;
  bookshelf: BookshelfDto;
  allBookshelves?: BookshelfDto[];
  onClose: () => void;
  onUpdateBook: (
    shelfBookId: string,
    payload: {
      compartmentId?: string;
      position?: number;
      orientation?: BookOrientation;
      visualOverrides?: BookVisualOverrides;
    }
  ) => Promise<ShelfBookDto>;
  onRemoveBook: (shelfBookId: string) => Promise<void>;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

const BINDING_OPTIONS: Array<{ value: BindingStyle; label: string }> = [
  { value: 'hardcover-cloth', label: 'Buckram Cloth' },
  { value: 'hardcover-leather', label: 'Morocco Leather' },
  { value: 'vintage-linen', label: 'Vintage Linen' },
  { value: 'dust-jacket', label: 'Dust Jacket' },
  { value: 'paperback', label: 'Paperback' },
];

const MOTIF_OPTIONS: Array<{ value: SpineMotif; label: string }> = [
  { value: 'classic-bands', label: 'Classic Ribs' },
  { value: 'gilt-frame', label: 'Gilt Cartouche' },
  { value: 'editorial-stripe', label: 'Editorial Band' },
  { value: 'minimal-modern', label: 'Minimalist' },
  { value: 'paperback-bold', label: 'Paperback' },
];

const FONT_OPTIONS: Array<{ value: SpineFontStyle; label: string }> = [
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'sans', label: 'Sans' },
];

const ORIENTATION_OPTIONS: Array<{ value: BookOrientation; label: string }> = [
  { value: 'vertical', label: 'Upright' },
  { value: 'leaning-left', label: 'Lean Left' },
  { value: 'leaning-right', label: 'Lean Right' },
  { value: 'face-out', label: 'Face Out' },
];

export function BookRevealModal({
  shelfBook,
  bookshelf,
  allBookshelves,
  onClose,
  onUpdateBook,
  onRemoveBook,
  onToast,
}: BookRevealModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'appearance' | 'position'>('details');
  const [view3D, setView3D] = useState<'front' | 'spine'>('front');
  const [coverFailed, setCoverFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matchingCover, setMatchingCover] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const coverUploadRef = useRef<HTMLInputElement>(null);
  const spineUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCoverFailed(false);
    setConfirmRemove(false);
    setView3D('front');
    setActiveTab('details');
    setNotesDraft(shelfBook?.visualOverrides.notes ?? '');
  }, [shelfBook?.id]);

  useEffect(() => {
    if (!shelfBook) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shelfBook, onClose]);

  const appearance = useMemo(() => {
    if (!shelfBook) return null;
    return resolveSpineAppearance({
      id: shelfBook.book.id,
      title: shelfBook.book.title,
      authors: shelfBook.book.authors,
      format: shelfBook.book.physicalDimensions.format,
      categories: shelfBook.book.metadata.categories,
      palette: shelfBook.book.metadata.palette,
      metadataBindingStyle: shelfBook.book.metadata.bindingStyle,
      overrides: shelfBook.visualOverrides,
    });
  }, [shelfBook]);

  if (!shelfBook || !appearance) return null;

  const { book } = shelfBook;
  const dims = book.physicalDimensions;
  const coverSrc = getProxiedCoverUrl(appearance.customCoverUrl || book.coverUrl);
  const currentComp = bookshelf.compartments.find(
    (c) => c.id === shelfBook.compartmentId
  );

  const applyOverrides = async (overrides: BookVisualOverrides) => {
    setBusy(true);
    try {
      await onUpdateBook(shelfBook.id, { visualOverrides: overrides });
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Could not update book appearance.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleMatchFromCover = async () => {
    if (!coverSrc) return;
    setMatchingCover(true);
    try {
      const palette = await extractCoverPaletteFromUrl(coverSrc);
      if (!palette) {
        onToast('Unable to sample colors from this cover image.', 'error');
        return;
      }
      await applyOverrides({
        spineColor: palette.primary,
        secondaryColor: palette.secondary,
        accentColor: palette.accent,
        textColor: palette.textColor,
      });
      onToast('Matched spine colors to the front cover.', 'success');
    } finally {
      setMatchingCover(false);
    }
  };

  const handleImageUpload = async (
    file: File | undefined,
    kind: 'cover' | 'spine'
  ) => {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.uploadBookImage(file);
      await onUpdateBook(shelfBook.id, {
        visualOverrides:
          kind === 'cover' ? { customCoverUrl: url } : { customSpineUrl: url },
      });
      setCoverFailed(false);
      onToast(
        kind === 'cover'
          ? 'Custom front cover uploaded.'
          : 'Custom spine artwork uploaded.',
        'success'
      );
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Image upload failed.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleMoveCompartment = async (compartmentId: string) => {
    if (compartmentId === shelfBook.compartmentId) return;
    setBusy(true);
    try {
      const targetShelf = allBookshelves?.find((s) =>
        s.compartments.some((c) => c.id === compartmentId)
      );
      const isCrossShelf = Boolean(targetShelf && targetShelf.id !== bookshelf.id);
      await onUpdateBook(shelfBook.id, { compartmentId });
      onToast(
        isCrossShelf && targetShelf
          ? `Moved "${book.title}" to "${targetShelf.name}".`
          : 'Moved book to new shelf compartment.',
        'success'
      );
      if (isCrossShelf) {
        onClose();
      }
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Unable to move book.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleShiftPosition = async (delta: -1 | 1) => {
    if (!currentComp) return;
    const nextPos = shelfBook.position + delta;
    if (nextPos < 0 || nextPos >= currentComp.books.length) return;
    setBusy(true);
    try {
      await onUpdateBook(shelfBook.id, {
        compartmentId: shelfBook.compartmentId,
        position: nextPos,
      });
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Could not shift book position.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await onRemoveBook(shelfBook.id);
      onClose();
    } catch (err) {
      onToast(
        err instanceof ApiError ? err.message : 'Failed to remove book.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-6 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Book details for ${book.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="book-reveal-modal"
        className="relative w-full max-w-4xl max-h-[94dvh] rounded-2xl border border-[#cfa55a]/30 bg-gradient-to-b from-[#211812] to-[#16100c] shadow-[0_36px_90px_rgba(0,0,0,0.88)] overflow-y-auto md:overflow-hidden library-scroll flex flex-col md:flex-row"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close book inspector"
          className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-30 p-2.5 sm:p-2 rounded-full bg-[#140e0a]/90 border border-[#c9a15c]/30 text-[#c7b397] hover:text-[#fff2db] hover:border-[#dfb86e]/55 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Stage: Interactive 3D Physical Book Turning Out from Spine to Front Cover */}
        <div className="md:w-[320px] shrink-0 bg-gradient-to-b from-[#291d14] via-[#1c130d] to-[#130d09] border-b md:border-b-0 md:border-r border-[#c9a15c]/18 flex flex-col items-center justify-center py-3 px-4 md:p-7 relative overflow-hidden">
          {/* Subtle spotlight behind 3D book */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgba(235, 190, 114, 0.16) 0%, transparent 65%)',
            }}
          />

          <div className="book-3d-scene relative z-10 scale-[0.68] md:scale-100 -my-12 md:my-0">
            <div className="book-3d-object" data-view={view3D}>
              {/* 3D Front Cover */}
              <div
                className="book-3d-front"
                style={{ backgroundColor: appearance.primaryColor }}
              >
                {coverSrc && !coverFailed ? (
                  <img
                    src={coverSrc}
                    alt={`Front cover of ${book.title}`}
                    onError={() => setCoverFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ProceduralCover
                    title={book.title}
                    subtitle={book.metadata.subtitle}
                    authors={book.authors}
                    publisher={book.publisher}
                    publicationDate={book.publicationDate}
                    appearance={appearance}
                  />
                )}
                {/* Subtle cover lighting sheen */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(0,0,0,0.34) 0%, rgba(255,255,255,0.16) 5%, transparent 14%, transparent 94%, rgba(0,0,0,0.22) 100%)',
                  }}
                />
              </div>

              {/* 3D Spine Face */}
              <div
                className="book-3d-spine-face flex items-center justify-center px-1"
                style={{
                  background: `linear-gradient(180deg, ${appearance.primaryColor} 0%, ${appearance.secondaryColor} 100%)`,
                  color: appearance.textColor,
                }}
              >
                <div className="book-spine-lighting" />
                <span className="book-spine-vertical-title font-display font-bold text-xs relative z-10 max-h-[82%]">
                  {book.title}
                </span>
              </div>

              {/* Cream Page Edges */}
              <div className="book-3d-pages-right" aria-hidden="true" />
              <div className="book-3d-pages-top" aria-hidden="true" />
              <div
                className="book-3d-back"
                style={{ backgroundColor: appearance.secondaryColor }}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* 3D Rotation Toggle */}
          <div className="relative z-10 mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setView3D((prev) => (prev === 'front' ? 'spine' : 'front'))
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a15c]/30 bg-[#1a120d]/90 hover:bg-[#2a1d14] px-3.5 py-1.5 text-xs text-[#e7d4b4] transition cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#dfb86d]" />
              {view3D === 'front' ? 'Inspect Spine' : 'Turn to Front Cover'}
            </button>
          </div>
        </div>

        {/* Right Panel: Metadata, Spine Customizer & Position Controls */}
        <div className="flex-none md:flex-1 flex flex-col min-w-0 md:min-h-0 md:overflow-hidden">
          {/* Title & Sub-navigation */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-[#c9a15c]/15 md:pr-12">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#faf0de] leading-tight">
              {book.title}
            </h2>
            {book.metadata.subtitle && (
              <p className="text-sm text-[#c6b296] italic mt-0.5 font-book-serif">
                {book.metadata.subtitle}
              </p>
            )}
            <p className="text-sm text-[#dfb970] mt-1.5">
              {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown Author'}
            </p>

            {/* Tabs */}
            <div className="flex items-center gap-1 mt-3.5 sm:mt-4 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'details', label: 'Details', icon: BookOpen },
                  { id: 'appearance', label: 'Spine & Cover', icon: Palette },
                  { id: 'position', label: 'Shelf Position', icon: MoveHorizontal },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#332417] text-[#f7e3bb] border border-[#d8b166]/45'
                        : 'text-[#a8947b] hover:text-[#ebd9bc] hover:bg-[#221811]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Body */}
          <div className="flex-none md:flex-1 md:overflow-y-auto library-scroll p-4 sm:p-6 space-y-5">
            {activeTab === 'details' && (
              <>
                {/* Reading Progress, Rating & Personal Notes */}
                <div className="rounded-xl bg-[#140e0a] border border-[#c9a15c]/22 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'unread', label: 'Unread' },
                          { id: 'reading', label: 'Reading' },
                          { id: 'finished', label: 'Finished' },
                        ] as Array<{ id: ReadingStatus; label: string }>
                      ).map((st) => {
                        const current =
                          shelfBook.visualOverrides.readingStatus ?? 'unread';
                        const active = current === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              applyOverrides({ readingStatus: st.id })
                            }
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] border transition cursor-pointer ${
                              active
                                ? st.id === 'reading'
                                  ? 'bg-rose-950/80 border-rose-400/60 text-rose-100 font-semibold'
                                  : st.id === 'finished'
                                    ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-100 font-semibold'
                                    : 'bg-[#362618] border-[#e0b86d] text-[#f7e3ba] font-semibold'
                                : 'bg-[#1a120d] border-[#c9a15c]/20 text-[#ab967c] hover:text-[#f2e4cc]'
                            }`}
                          >
                            {st.id === 'reading' && (
                              <Bookmark className="w-3 h-3" />
                            )}
                            {st.id === 'finished' && (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {st.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 5-Star Personal Rating */}
                    <div
                      className="flex items-center gap-0.5"
                      aria-label="Personal rating"
                    >
                      {[1, 2, 3, 4, 5].map((star) => {
                        const currentRating =
                          shelfBook.visualOverrides.rating ?? 0;
                        const filled = star <= currentRating;
                        return (
                          <button
                            key={star}
                            type="button"
                            disabled={busy}
                            title={`Rate ${star} out of 5`}
                            aria-label={`Rate ${star} out of 5`}
                            onClick={() =>
                              applyOverrides({
                                rating: currentRating === star ? null : star,
                              })
                            }
                            className="p-0.5 transition hover:scale-110 cursor-pointer"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                filled
                                  ? 'text-[#e3b963] fill-[#e3b963]'
                                  : 'text-[#6c5b49] hover:text-[#cfa55a]'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Personal Marginalia / Notes */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="book-personal-notes"
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#978269]"
                      >
                        <StickyNote className="w-3 h-3 text-[#cfa55a]" />
                        Personal Notes
                      </label>
                      {notesDraft !== (shelfBook.visualOverrides.notes ?? '') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            applyOverrides({
                              notes: notesDraft.trim() || null,
                            })
                          }
                          className="text-[11px] font-medium text-[#e5be72] hover:underline cursor-pointer"
                        >
                          Save Note
                        </button>
                      )}
                    </div>
                    <textarea
                      id="book-personal-notes"
                      rows={2}
                      maxLength={1000}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onBlur={() => {
                        const trimmed = notesDraft.trim() || null;
                        if (trimmed !== (shelfBook.visualOverrides.notes ?? null)) {
                          applyOverrides({ notes: trimmed });
                        }
                      }}
                      placeholder="Jot down a favorite quote, where you bought this edition, or reading reflections..."
                      className="w-full rounded-lg bg-[#0f0a07] border border-[#c9a15c]/18 px-2.5 py-2 sm:py-1.5 text-base sm:text-xs text-[#efe2cc] placeholder:text-[#665644] focus:outline-none focus:border-[#d5ad62] resize-none"
                    />
                  </div>
                </div>

                {/* Metadata Grid */}
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-[#140e0a] border border-[#c9a15c]/14 p-3">
                    <dt className="text-[10px] uppercase tracking-wider text-[#978269]">
                      Published
                    </dt>
                    <dd className="mt-1 font-medium text-[#f1e4ce]">
                      {book.publicationDate || 'Unknown'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-[#140e0a] border border-[#c9a15c]/14 p-3">
                    <dt className="text-[10px] uppercase tracking-wider text-[#978269]">
                      Pages
                    </dt>
                    <dd className="mt-1 font-medium text-[#f1e4ce]">
                      {book.pageCount ? `${book.pageCount} pages` : 'Unspecified'}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-[#140e0a] border border-[#c9a15c]/14 p-3 col-span-2 sm:col-span-1">
                    <dt className="text-[10px] uppercase tracking-wider text-[#978269]">
                      ISBN
                    </dt>
                    <dd className="mt-1 font-mono text-[11px] text-[#f1e4ce]">
                      {book.isbn || '—'}
                    </dd>
                  </div>
                  {book.publisher && (
                    <div className="rounded-lg bg-[#140e0a] border border-[#c9a15c]/14 p-3 col-span-2 sm:col-span-3">
                      <dt className="text-[10px] uppercase tracking-wider text-[#978269]">
                        Publisher
                      </dt>
                      <dd className="mt-1 font-medium text-[#f1e4ce]">
                        {book.publisher}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Physical Dimensions Card (Clearly distinguishes Verified vs Estimated) */}
                <div className="rounded-lg bg-[#140e0a] border border-[#c9a15c]/18 p-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ebd8b9]">
                      <Ruler className="w-3.5 h-3.5 text-[#dab468]" />
                      Physical Dimensions
                    </span>
                    {dims.source === 'verified' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified Measurements
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/70 border border-amber-500/35 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                        <Info className="w-3 h-3" />
                        Estimated Dimensions
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#d6c5ab] tabular-nums">
                    Height <strong className="text-[#f5e7cf]">{dims.heightMm} mm</strong> &middot;
                    Spine <strong className="text-[#f5e7cf]">{dims.thicknessMm} mm</strong> &middot;
                    Depth <strong className="text-[#f5e7cf]">{dims.widthMm} mm</strong> &middot;{' '}
                    <span className="capitalize">{dims.format.replace('-', ' ')}</span>
                  </p>
                  {dims.source === 'estimated' && dims.estimationNote && (
                    <p className="mt-1 text-[11px] text-[#98846c]">
                      Note: {dims.estimationNote}.
                    </p>
                  )}
                </div>

                {/* Synopsis / Description */}
                {book.metadata.description && (
                  <div>
                    <h3 className="text-xs uppercase tracking-widest text-[#ab967c] mb-1.5">
                      Synopsis
                    </h3>
                    <p className="text-sm leading-relaxed text-[#dfd0b8] whitespace-pre-line">
                      {book.metadata.description}
                    </p>
                  </div>
                )}

                {book.metadata.categories && book.metadata.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {book.metadata.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-[#241a12] border border-[#c9a15c]/20 px-2.5 py-0.5 text-[11px] text-[#d5c1a3]"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                {/* Auto-Match from Front Cover */}
                {coverSrc && !coverFailed && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[#c9a15c]/22 bg-[#160f0b] p-3">
                    <div>
                      <p className="text-xs font-medium text-[#f2e4cc]">
                        Harmonize Spine with Front Cover
                      </p>
                      <p className="text-[11px] text-[#9a866f]">
                        Sample representative colors directly from this edition&apos;s jacket.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || matchingCover}
                      onClick={handleMatchFromCover}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#352517] hover:bg-[#46311f] border border-[#dab468]/45 px-3 py-1.5 text-xs font-medium text-[#f7e2b9] transition cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#e4be73]" />
                      {matchingCover ? 'Sampling...' : 'Match Cover'}
                    </button>
                  </div>
                )}

                {/* Spine Color Swatches + Custom Picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-widest text-[#b6a185]">
                      Spine Color
                    </span>
                    <label className="inline-flex items-center gap-2 text-xs text-[#d6c2a5] cursor-pointer">
                      <span>Custom:</span>
                      <input
                        type="color"
                        value={appearance.primaryColor}
                        disabled={busy}
                        onChange={(e) =>
                          applyOverrides({
                            spineColor: e.target.value,
                            secondaryColor: null,
                            textColor: null,
                            accentColor: null,
                          })
                        }
                        className="w-7 h-6 rounded border border-[#c9a15c]/30 bg-transparent cursor-pointer"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                    {CURATED_BOOK_PALETTES.map((p) => {
                      const active =
                        appearance.primaryColor.toLowerCase() ===
                        p.primary.toLowerCase();
                      return (
                        <button
                          key={p.name}
                          type="button"
                          disabled={busy}
                          title={p.name}
                          onClick={() =>
                            applyOverrides({
                              spineColor: p.primary,
                              secondaryColor: p.secondary,
                              accentColor: p.accent,
                              textColor: p.textColor,
                            })
                          }
                          className={`h-9 sm:h-7 rounded-md border transition cursor-pointer ${
                            active
                              ? 'border-[#f4d898] ring-2 ring-[#e2bc71]/60 scale-105'
                              : 'border-white/15 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.primary }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Binding Material */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#b6a185] mb-2">
                    Binding Material
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {BINDING_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={() => applyOverrides({ bindingStyle: opt.value })}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition cursor-pointer ${
                          appearance.bindingStyle === opt.value
                            ? 'bg-[#362618] border-[#e0b86d] text-[#f7e3ba]'
                            : 'bg-[#140e0a] border-[#c9a15c]/20 text-[#bca88d] hover:text-[#f2e4cc]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spine Motif & Typography */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-[#b6a185] mb-2">
                      Spine Motif
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {MOTIF_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={busy}
                          onClick={() => applyOverrides({ motif: opt.value })}
                          className={`px-2.5 py-1 rounded text-xs border transition cursor-pointer ${
                            appearance.motif === opt.value
                              ? 'bg-[#362618] border-[#e0b86d] text-[#f7e3ba]'
                              : 'bg-[#140e0a] border-[#c9a15c]/20 text-[#bca88d]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-[#b6a185] mb-2">
                      Spine Typography
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {FONT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={busy}
                          onClick={() => applyOverrides({ fontStyle: opt.value })}
                          className={`px-2.5 py-1 rounded text-xs border transition cursor-pointer ${
                            appearance.fontStyle === opt.value
                              ? 'bg-[#362618] border-[#e0b86d] text-[#f7e3ba]'
                              : 'bg-[#140e0a] border-[#c9a15c]/20 text-[#bca88d]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Custom Cover / Spine Artwork Upload */}
                <div className="rounded-lg border border-[#c9a15c]/18 bg-[#140e0a] p-3.5 space-y-2.5">
                  <p className="text-xs uppercase tracking-widest text-[#b6a185]">
                    Custom Artwork Uploads
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={coverUploadRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) =>
                        handleImageUpload(e.target.files?.[0], 'cover')
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => coverUploadRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9a15c]/25 bg-[#20160f] hover:bg-[#2d1f15] px-3 py-1.5 text-xs text-[#e9d7ba] cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#dab468]" />
                      Upload Cover Image
                    </button>

                    <input
                      ref={spineUploadRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) =>
                        handleImageUpload(e.target.files?.[0], 'spine')
                      }
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => spineUploadRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9a15c]/25 bg-[#20160f] hover:bg-[#2d1f15] px-3 py-1.5 text-xs text-[#e9d7ba] cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#dab468]" />
                      Upload Spine Image
                    </button>

                    {(appearance.customCoverUrl || appearance.customSpineUrl) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          applyOverrides({
                            customCoverUrl: null,
                            customSpineUrl: null,
                          })
                        }
                        className="text-xs text-[#bda78b] hover:text-[#f5e6cb] underline ml-auto cursor-pointer"
                      >
                        Reset Artwork
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'position' && (
              <div className="space-y-5">
                {/* Accessible Shelf Compartment Selector */}
                <div>
                  <label
                    htmlFor="move-compartment-select"
                    className="block text-xs uppercase tracking-widest text-[#b6a185] mb-2"
                  >
                    Shelf Compartment
                  </label>
                  <select
                    id="move-compartment-select"
                    disabled={busy}
                    value={shelfBook.compartmentId}
                    onChange={(e) => handleMoveCompartment(e.target.value)}
                    className="w-full rounded-lg bg-[#140e0a] border border-[#c9a15c]/25 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-[#f4e7d2] focus:outline-none focus:border-[#dbb468]"
                  >
                    {allBookshelves && allBookshelves.length > 1
                      ? allBookshelves.map((s) => (
                          <optgroup
                            key={s.id}
                            label={`${s.name}${s.tag ? ` (${s.tag})` : ''}`}
                          >
                            {s.compartments.map((c) => (
                              <option key={c.id} value={c.id}>
                                Level {c.row + 1}
                                {c.settings.label
                                  ? ` — ${c.settings.label}`
                                  : ` (Column ${c.column + 1})`}{' '}
                                ({c.books.length} books)
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : bookshelf.compartments.map((c) => (
                          <option key={c.id} value={c.id}>
                            Level {c.row + 1}
                            {c.settings.label
                              ? ` — ${c.settings.label}`
                              : ` (Column ${c.column + 1})`}{' '}
                            ({c.books.length} books)
                          </option>
                        ))}
                  </select>
                </div>

                {/* Accessible Left / Right Order Controls */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#b6a185] mb-2">
                    Order Within Shelf (Position {shelfBook.position + 1} of{' '}
                    {currentComp?.books.length ?? 1})
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || shelfBook.position <= 0}
                      onClick={() => handleShiftPosition(-1)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9a15c]/25 bg-[#19120c] hover:bg-[#281d14] disabled:opacity-40 px-3.5 py-2 text-xs text-[#ecdac0] cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Move Left
                    </button>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !currentComp ||
                        shelfBook.position >= currentComp.books.length - 1
                      }
                      onClick={() => handleShiftPosition(1)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9a15c]/25 bg-[#19120c] hover:bg-[#281d14] disabled:opacity-40 px-3.5 py-2 text-xs text-[#ecdac0] cursor-pointer"
                    >
                      Move Right
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Physical Shelf Orientation */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#b6a185] mb-2">
                    Display Orientation
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ORIENTATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onUpdateBook(shelfBook.id, {
                              orientation: opt.value,
                            });
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className={`py-2 px-2.5 rounded-lg text-xs border transition cursor-pointer ${
                          shelfBook.orientation === opt.value
                            ? 'bg-[#362618] border-[#e0b86d] text-[#f7e3ba]'
                            : 'bg-[#140e0a] border-[#c9a15c]/20 text-[#bca88d] hover:text-[#f2e4cc]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer: Remove Book */}
          <div className="px-4 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-[#c9a15c]/15 bg-[#130d09] flex flex-wrap items-center justify-between gap-3">
            {!confirmRemove ? (
              <button
                type="button"
                data-testid="remove-book-btn"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex items-center gap-1.5 text-xs text-red-300/85 hover:text-red-200 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove from Collection
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-200">Remove this volume?</span>
                <button
                  type="button"
                  disabled={busy}
                  data-testid="confirm-remove-book-btn"
                  onClick={handleRemove}
                  className="rounded-md bg-red-800 hover:bg-red-700 px-3 py-1 text-xs font-medium text-white cursor-pointer"
                >
                  Confirm Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs text-[#b5a086] hover:text-[#f3e5cd] px-2 py-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#c9a15c]/25 bg-[#20160f] hover:bg-[#2c1f16] px-4 py-1.5 text-xs font-medium text-[#f2e3ca] cursor-pointer"
            >
              Return to Shelf
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
