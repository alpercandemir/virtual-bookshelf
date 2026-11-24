import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
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
import { getCompartmentCapacityStatus } from '../../utils/compartmentCapacity';
import { extractCoverPaletteFromUrl } from '../../utils/extractCoverPalette';
import { parseAuthorNameForLastNameSort } from '../../utils/shelfSorting';
import { ProceduralCover } from '../bookshelf/ProceduralCover';

interface BookRevealModalProps {
  shelfBook: ShelfBookDto | null;
  bookshelf: BookshelfDto;
  allBookshelves?: BookshelfDto[];
  shelfBooks?: ShelfBookDto[];
  onNavigateBook?: (shelfBookId: string) => void;
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
  { value: 'stacked', label: 'Stack Flat' },
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function BookRevealModal({
  shelfBook,
  bookshelf,
  allBookshelves,
  shelfBooks,
  onNavigateBook,
  onClose,
  onUpdateBook,
  onRemoveBook,
  onToast,
}: BookRevealModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'appearance' | 'position'>('details');
  const [view3D, setView3D] = useState<'front' | 'spine' | 'back'>('front');
  const [rotY, setRotY] = useState(-24);
  const [rotX, setRotX] = useState(4);
  const [dragging3D, setDragging3D] = useState(false);
  const [showDimensionNote, setShowDimensionNote] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matchingCover, setMatchingCover] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);

  const coverUploadRef = useRef<HTMLInputElement>(null);
  const spineUploadRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; rotY: number; rotX: number } | null>(null);

  const currentIdx = useMemo(() => {
    if (!shelfBook || !shelfBooks?.length) return -1;
    return shelfBooks.findIndex((b) => b.id === shelfBook.id);
  }, [shelfBook, shelfBooks]);

  const prevBook = currentIdx > 0 && shelfBooks ? shelfBooks[currentIdx - 1] : null;
  const nextBook =
    currentIdx >= 0 && shelfBooks && currentIdx < shelfBooks.length - 1
      ? shelfBooks[currentIdx + 1]
      : null;

  useEffect(() => {
    setCoverFailed(false);
    setConfirmRemove(false);
    setView3D('front');
    setRotY(-24);
    setRotX(4);
    setShowDimensionNote(false);
    setActiveTab('details');
    setNotesDraft(shelfBook?.visualOverrides.notes ?? '');
    setMoveError(null);
  }, [shelfBook?.id]);

  useEffect(() => {
    if (!shelfBook) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && prevBook && onNavigateBook) {
        e.preventDefault();
        onNavigateBook(prevBook.id);
      } else if (e.key === 'ArrowRight' && nextBook && onNavigateBook) {
        e.preventDefault();
        onNavigateBook(nextBook.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shelfBook, onClose, prevBook, nextBook, onNavigateBook]);

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
  const spineImageSrc = getProxiedCoverUrl(appearance.customSpineUrl);
  const currentComp = bookshelf.compartments.find(
    (c) => c.id === shelfBook.compartmentId
  );

  // Real physical proportions for the interactive 3D volume
  const book3dH = Math.round(clamp(dims.heightMm * 1.28, 236, 336));
  const aspectRatio = clamp(dims.widthMm / Math.max(100, dims.heightMm), 0.56, 0.86);
  const book3dW = Math.round(clamp(book3dH * aspectRatio, 162, 234));
  const book3dD = Math.round(clamp(dims.thicknessMm * 1.02, 18, 60));

  const snapView = (target: 'front' | 'spine' | 'back') => {
    setView3D(target);
    if (target === 'front') {
      setRotY(-24);
      setRotX(4);
    } else if (target === 'spine') {
      setRotY(84);
      setRotX(2);
    } else {
      setRotY(-162);
      setRotX(3);
    }
  };

  const handle3DPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging3D(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, rotY, rotX };
  };

  const handle3DPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextY = dragStartRef.current.rotY + dx * 0.75;
    const nextX = clamp(dragStartRef.current.rotX - dy * 0.35, -28, 28);
    setRotY(nextY);
    setRotX(nextX);
  };

  const handle3DPointerUp = () => {
    setDragging3D(false);
    dragStartRef.current = null;
  };

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
    setMoveError(null);
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
      const message =
        err instanceof ApiError ? err.message : 'Unable to move book.';
      setMoveError(message);
      onToast(message, 'error');
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

  const primaryAuthor = book.authors.find((a) => a.trim().length > 0);
  const authorSurname = primaryAuthor
    ? parseAuthorNameForLastNameSort(primaryAuthor).lastName
    : '';

  const colophonParts = [
    book.publicationDate,
    book.publisher,
    book.pageCount ? `${book.pageCount} pages` : null,
    dims.format.replace('-', ' '),
  ].filter(Boolean);

  const ribPositions =
    appearance.raisedBands === 5
      ? ['12%', '29%', '50%', '71%', '87%']
      : appearance.raisedBands === 4
        ? ['14%', '36%', '64%', '86%']
        : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-6 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Book details for ${book.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="book-reveal-modal"
        className="relative w-full max-w-4xl max-h-[94dvh] rounded-2xl border ui-surface-panel shadow-[0_36px_90px_rgba(0,0,0,0.65)] overflow-y-auto md:overflow-hidden library-scroll flex flex-col md:flex-row"
      >
        {/* Top-Right Prev / Next Shelf Navigation & Close */}
        <div className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-30 flex items-center gap-1.5">
          {onNavigateBook && (prevBook || nextBook) && (
            <div className="inline-flex items-center rounded-full border ui-surface-input shadow-sm overflow-hidden">
              <button
                type="button"
                disabled={!prevBook}
                onClick={() => prevBook && onNavigateBook(prevBook.id)}
                title={prevBook ? `Previous: ${prevBook.book.title}` : 'First book on shelf'}
                aria-label="Previous book on shelf"
                className="p-2 ui-text-secondary hover:ui-text-primary disabled:opacity-30 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!nextBook}
                onClick={() => nextBook && onNavigateBook(nextBook.id)}
                title={nextBook ? `Next: ${nextBook.book.title}` : 'Last book on shelf'}
                aria-label="Next book on shelf"
                className="p-2 border-l ui-surface-header ui-text-secondary hover:ui-text-primary disabled:opacity-30 transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close book inspector"
            className="p-2.5 sm:p-2 rounded-full ui-surface-input border ui-text-secondary hover:ui-text-primary hover:border-[#cfa458]/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Left Stage: Proportional Interactive 360° 3D Physical Book */}
        <div className="book-3d-stage md:w-[330px] shrink-0 border-b md:border-b-0 md:border-r ui-surface-header flex flex-col items-center justify-center py-4 px-4 md:p-7 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 44%, rgba(218, 174, 96, 0.14) 0%, transparent 66%)',
            }}
          />

          <div
            onPointerDown={handle3DPointerDown}
            onPointerMove={handle3DPointerMove}
            onPointerUp={handle3DPointerUp}
            onPointerCancel={handle3DPointerUp}
            title="Drag to spin 360°"
            className={`book-3d-scene relative z-10 scale-[0.72] md:scale-100 -my-10 md:my-0 select-none touch-none ${
              dragging3D ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div
              className="book-3d-object"
              data-view={view3D}
              data-dragging={dragging3D ? 'true' : undefined}
              style={
                {
                  '--book-w': `${book3dW}px`,
                  '--book-h': `${book3dH}px`,
                  '--book-d': `${book3dD}px`,
                  '--book-half-d': `${book3dD / 2}px`,
                  transform: `rotateY(${rotY}deg) rotateX(${rotX}deg)`,
                } as React.CSSProperties
              }
            >
              {/* 3D Front Cover */}
              <div
                className="book-3d-front"
                style={{ backgroundColor: appearance.primaryColor }}
              >
                {coverSrc && !coverFailed ? (
                  <img
                    src={coverSrc}
                    alt={`Front cover of ${book.title}`}
                    draggable={false}
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
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(0,0,0,0.34) 0%, rgba(255,255,255,0.16) 5%, transparent 14%, transparent 94%, rgba(0,0,0,0.22) 100%)',
                  }}
                />
              </div>

              {/* Authentic 3D Spine Face with Binding Texture, Ribs & Custom Spine Art */}
              <div
                className="book-3d-spine-face flex items-center justify-center px-1"
                style={{
                  background: `linear-gradient(180deg, ${appearance.primaryColor} 0%, ${appearance.secondaryColor} 100%)`,
                  color: appearance.textColor,
                }}
              >
                {spineImageSrc && (
                  <img
                    src={spineImageSrc}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover z-1"
                  />
                )}
                {(appearance.bindingStyle === 'hardcover-cloth' ||
                  appearance.bindingStyle === 'vintage-linen') && (
                  <div className="book-texture-linen" />
                )}
                {appearance.bindingStyle === 'hardcover-leather' && (
                  <div className="book-texture-leather" />
                )}
                {appearance.bindingStyle === 'dust-jacket' && (
                  <div className="book-texture-dustjacket" />
                )}
                {!spineImageSrc &&
                  ribPositions.map((topPct) => (
                    <div
                      key={topPct}
                      className="book-raised-rib"
                      style={{ top: topPct }}
                    />
                  ))}
                <div className="book-spine-lighting" />
                {!spineImageSrc && (
                  <div className="book-spine-text-wrap">
                    <div className="book-spine-title-area">
                      <span className="book-spine-vertical-title font-display font-bold text-xs">
                        {book.title}
                      </span>
                    </div>
                    {authorSurname && (
                      <>
                        <span
                          className="book-spine-divider"
                          aria-hidden="true"
                          style={{ backgroundColor: appearance.accentColor }}
                        />
                        <div className="book-spine-author-area">
                          <span className="book-spine-vertical-author book-spine-author-surname font-sans text-[9px]">
                            {authorSurname}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Cream Page Edges */}
              <div className="book-3d-pages-right" aria-hidden="true" />
              <div className="book-3d-pages-top" aria-hidden="true" />
              <div className="book-3d-pages-bottom" aria-hidden="true" />

              {/* Styled Back Cover with Blurb & Publisher Colophon */}
              <div
                className="book-3d-back flex flex-col justify-between p-5 overflow-hidden"
                style={{
                  background: `linear-gradient(160deg, ${appearance.secondaryColor} 0%, ${appearance.primaryColor} 100%)`,
                  color: appearance.textColor,
                }}
              >
                {(appearance.bindingStyle === 'hardcover-cloth' ||
                  appearance.bindingStyle === 'vintage-linen') && (
                  <div className="book-texture-linen" />
                )}
                {appearance.bindingStyle === 'hardcover-leather' && (
                  <div className="book-texture-leather" />
                )}
                <div className="relative z-10 space-y-2">
                  <p className="font-display text-sm font-semibold leading-tight opacity-90">
                    {book.title}
                  </p>
                  <div
                    className="h-[1px] w-8 opacity-60"
                    style={{ backgroundColor: appearance.accentColor }}
                  />
                  <p className="text-[10px] leading-relaxed opacity-85 line-clamp-9 font-book-serif">
                    {book.metadata.description ||
                      `A personal library edition of ${book.title}${primaryAuthor ? ` by ${primaryAuthor}` : ''}.`}
                  </p>
                </div>
                <div className="relative z-10 flex items-end justify-between gap-2 pt-2 border-t border-current/15 text-[8px] uppercase tracking-wider opacity-75">
                  <span className="truncate">{book.publisher || 'Personal Collection'}</span>
                  {book.isbn && <span className="font-mono shrink-0">{book.isbn}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* 3D Rotation Controls */}
          <div className="relative z-10 mt-5 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => snapView(view3D === 'front' ? 'spine' : 'front')}
                className="inline-flex items-center gap-1.5 rounded-full border ui-surface-input hover:border-[#cfa458]/60 px-3.5 py-1.5 text-xs ui-text-primary transition cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#c89d54]" />
                {view3D === 'front' ? 'Inspect Spine' : 'Turn to Front Cover'}
              </button>
              <button
                type="button"
                onClick={() => snapView(view3D === 'back' ? 'front' : 'back')}
                className={`rounded-full border px-3 py-1.5 text-xs transition cursor-pointer ${
                  view3D === 'back'
                    ? 'bg-[#cfa458] text-[#1a1107] border-[#e2be79] font-semibold'
                    : 'ui-surface-input ui-text-secondary hover:ui-text-primary'
                }`}
              >
                Back
              </button>
            </div>
            <span className="text-[10px] ui-text-muted">
              Drag book to rotate 360°
            </span>
          </div>
        </div>

        {/* Right Panel: Editorial Ex Libris Colophon, Spine Studio & Position Controls */}
        <div className="flex-none md:flex-1 flex flex-col min-w-0 md:min-h-0 md:overflow-hidden">
          {/* Title & Sub-navigation */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b ui-surface-header md:pr-24">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold ui-text-primary leading-tight">
              {book.title}
            </h2>
            {book.metadata.subtitle && (
              <p className="text-sm ui-text-secondary italic mt-0.5 font-book-serif">
                {book.metadata.subtitle}
              </p>
            )}
            <p className="text-sm text-[#c89d54] font-medium mt-1">
              {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown Author'}
            </p>

            {/* Tabs */}
            <div className="flex items-center gap-1 mt-3.5 overflow-x-auto no-scrollbar">
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 border ${
                      active
                        ? 'bg-[#cfa458]/18 ui-text-primary border-[#cfa458]/60 font-semibold'
                        : 'border-transparent ui-text-muted hover:ui-text-primary hover:bg-[#cfa458]/10'
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
                {/* Editorial Colophon Strip (replaces 4 separate metric boxes!) */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ui-text-secondary">
                    {colophonParts.map((part, i) => (
                      <React.Fragment key={`${part}-${i}`}>
                        {i > 0 && <span className="opacity-40">&middot;</span>}
                        <span className={i === colophonParts.length - 1 ? 'capitalize' : ''}>
                          {part}
                        </span>
                      </React.Fragment>
                    ))}
                    {book.isbn && (
                      <>
                        <span className="opacity-40">&middot;</span>
                        <span className="font-mono text-[11px] ui-text-muted">
                          ISBN {book.isbn}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Compact Expandable Physical Measurements Pill */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDimensionNote((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-full border ui-surface-card px-2.5 py-1 text-[11px] ui-text-secondary hover:border-[#cfa458]/55 transition cursor-pointer tabular-nums"
                    >
                      <Ruler className="w-3 h-3 text-[#c89d54]" />
                      <span>
                        {dims.heightMm} × {dims.widthMm} × {dims.thicknessMm} mm
                      </span>
                      {dims.source === 'estimated' && dims.estimationNote && (
                        <ChevronDown
                          className={`w-3 h-3 opacity-60 transition-transform ${
                            showDimensionNote ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </button>

                    {dims.source === 'verified' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/35 px-2.5 py-0.5 text-[10px] font-medium text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified Measurements
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 border border-amber-500/35 px-2.5 py-0.5 text-[10px] font-medium text-amber-500">
                        <Info className="w-3 h-3" />
                        Estimated Dimensions
                      </span>
                    )}
                  </div>

                  {showDimensionNote && dims.source === 'estimated' && dims.estimationNote && (
                    <p className="text-[11px] ui-text-muted leading-relaxed pl-1">
                      {dims.estimationNote}.
                    </p>
                  )}
                </div>

                {/* Synopsis Elevated Front & Center */}
                {book.metadata.description && (
                  <div className="space-y-1.5">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] ui-text-muted font-medium">
                      Synopsis
                    </h3>
                    <p className="text-[14px] leading-relaxed ui-text-primary/90 font-book-serif whitespace-pre-line">
                      {book.metadata.description}
                    </p>
                  </div>
                )}

                {book.metadata.categories && book.metadata.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {book.metadata.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full border ui-surface-card px-2.5 py-0.5 text-[11px] ui-text-secondary"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}

                {/* Ex Libris / Library Reading Card (Status, Rating & Marginalia) */}
                <div className="rounded-xl border ui-surface-card p-4 space-y-3.5 shadow-sm">
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
                                  ? 'bg-rose-500/18 border-rose-500/60 text-rose-400 font-semibold'
                                  : st.id === 'finished'
                                    ? 'bg-emerald-500/18 border-emerald-500/60 text-emerald-500 font-semibold'
                                    : 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                                : 'ui-surface-input ui-text-secondary hover:ui-text-primary'
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
                                  ? 'text-[#d8a94e] fill-[#d8a94e]'
                                  : 'ui-text-muted opacity-50 hover:opacity-100 hover:text-[#cfa55a]'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Personal Marginalia / Notes */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="book-personal-notes"
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] ui-text-muted"
                      >
                        <StickyNote className="w-3 h-3 text-[#c89d54]" />
                        Marginalia &amp; Notes
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
                          className="text-[11px] font-medium text-[#c89d54] hover:underline cursor-pointer"
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
                      className="w-full rounded-lg ui-surface-input border px-3 py-2 text-base sm:text-xs font-book-serif placeholder:font-sans placeholder:opacity-50 focus:outline-none focus:border-[#cfa458] resize-none"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                {/* Auto-Match from Front Cover */}
                {coverSrc && !coverFailed && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border ui-surface-card p-3.5">
                    <div>
                      <p className="text-xs font-semibold ui-text-primary">
                        Harmonize Spine with Front Cover
                      </p>
                      <p className="text-[11px] ui-text-muted">
                        Sample representative colors directly from this edition&apos;s jacket.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || matchingCover}
                      onClick={handleMatchFromCover}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#cfa458]/18 hover:bg-[#cfa458]/28 border border-[#cfa458]/50 px-3 py-1.5 text-xs font-semibold ui-text-primary transition cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#c89d54]" />
                      {matchingCover ? 'Sampling...' : 'Match Cover'}
                    </button>
                  </div>
                )}

                {/* Spine Color Swatches + Custom Picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-widest ui-text-muted">
                      Spine Color
                    </span>
                    <label className="inline-flex items-center gap-2 text-xs ui-text-secondary cursor-pointer">
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
                        className="w-7 h-6 rounded border ui-surface-input cursor-pointer"
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
                              ? 'border-[#cfa458] ring-2 ring-[#cfa458]/60 scale-105'
                              : 'border-black/20 hover:scale-105'
                          }`}
                          style={{ backgroundColor: p.primary }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Binding Material */}
                <div>
                  <p className="text-xs uppercase tracking-widest ui-text-muted mb-2">
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
                            ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                            : 'ui-surface-card ui-text-secondary hover:ui-text-primary'
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
                    <p className="text-xs uppercase tracking-widest ui-text-muted mb-2">
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
                              ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                              : 'ui-surface-card ui-text-secondary'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest ui-text-muted mb-2">
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
                              ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                              : 'ui-surface-card ui-text-secondary'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Custom Cover / Spine Artwork Upload */}
                <div className="rounded-xl border ui-surface-card p-3.5 space-y-2.5">
                  <p className="text-xs uppercase tracking-widest ui-text-muted">
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
                      className="inline-flex items-center gap-1.5 rounded-lg border ui-surface-input hover:border-[#cfa458]/60 px-3 py-1.5 text-xs ui-text-primary cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#c89d54]" />
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
                      className="inline-flex items-center gap-1.5 rounded-lg border ui-surface-input hover:border-[#cfa458]/60 px-3 py-1.5 text-xs ui-text-primary cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#c89d54]" />
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
                        className="text-xs ui-text-secondary hover:ui-text-primary underline ml-auto cursor-pointer"
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
                    className="block text-xs uppercase tracking-widest ui-text-muted mb-2"
                  >
                    Shelf Compartment
                  </label>
                  <select
                    id="move-compartment-select"
                    disabled={busy}
                    value={shelfBook.compartmentId}
                    onChange={(e) => handleMoveCompartment(e.target.value)}
                    className="w-full rounded-lg ui-surface-input border px-3 py-2.5 sm:py-2 text-base sm:text-sm focus:outline-none focus:border-[#cfa458]"
                  >
                    {allBookshelves && allBookshelves.length > 1
                      ? allBookshelves.map((s) => (
                          <optgroup
                            key={s.id}
                            label={`${s.name}${s.tag ? ` (${s.tag})` : ''}`}
                          >
                            {s.compartments.map((c) => {
                              const st = getCompartmentCapacityStatus(c);
                              const fullTag =
                                c.id !== shelfBook.compartmentId && st.isFull
                                  ? ' — FULL'
                                  : '';
                              return (
                                <option key={c.id} value={c.id}>
                                  Level {c.row + 1}
                                  {c.settings.label
                                    ? ` — ${c.settings.label}`
                                    : ` (Column ${c.column + 1})`}{' '}
                                  ({c.books.length} books){fullTag}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))
                      : bookshelf.compartments.map((c) => {
                          const st = getCompartmentCapacityStatus(c);
                          const fullTag =
                            c.id !== shelfBook.compartmentId && st.isFull
                              ? ' — FULL'
                              : '';
                          return (
                            <option key={c.id} value={c.id}>
                              Level {c.row + 1}
                              {c.settings.label
                                ? ` — ${c.settings.label}`
                                : ` (Column ${c.column + 1})`}{' '}
                              ({c.books.length} books){fullTag}
                            </option>
                          );
                        })}
                  </select>
                  {moveError && (
                    <div
                      role="alert"
                      data-testid="move-compartment-error"
                      className="mt-2.5 rounded-xl border-2 ui-alert-danger px-3.5 py-2.5 flex items-start gap-2.5 text-sm"
                    >
                      <AlertTriangle className="w-4 h-4 ui-alert-danger-icon shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          Cannot move book to that shelf
                        </p>
                        <p className="text-xs ui-alert-danger-subtext mt-0.5">
                          {moveError}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accessible Left / Right Order Controls */}
                <div>
                  <p className="text-xs uppercase tracking-widest ui-text-muted mb-2">
                    Order Within Shelf (Position {shelfBook.position + 1} of{' '}
                    {currentComp?.books.length ?? 1})
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || shelfBook.position <= 0}
                      onClick={() => handleShiftPosition(-1)}
                      className="inline-flex items-center gap-1.5 rounded-lg border ui-surface-input hover:border-[#cfa458]/60 disabled:opacity-40 px-3.5 py-2 text-xs ui-text-primary cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 rounded-lg border ui-surface-input hover:border-[#cfa458]/60 disabled:opacity-40 px-3.5 py-2 text-xs ui-text-primary cursor-pointer"
                    >
                      Move Right
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Physical Shelf Orientation (now includes Horizontal Stack Flat!) */}
                <div>
                  <p className="text-xs uppercase tracking-widest ui-text-muted mb-2 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#c89d54]" />
                    Display Orientation
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                        className={`py-2 px-2 rounded-lg text-xs border transition cursor-pointer ${
                          shelfBook.orientation === opt.value
                            ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                            : 'ui-surface-card ui-text-secondary hover:ui-text-primary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] ui-text-muted mt-1.5">
                    Tip: Place 2–4 &ldquo;Stack Flat&rdquo; books next to each other to form a realistic horizontal stack.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer: Remove Book */}
          <div className="px-4 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t ui-surface-header flex flex-wrap items-center justify-between gap-3">
            {!confirmRemove ? (
              <button
                type="button"
                data-testid="remove-book-btn"
                onClick={() => setConfirmRemove(true)}
                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove from Collection
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Remove this volume?</span>
                <button
                  type="button"
                  disabled={busy}
                  data-testid="confirm-remove-book-btn"
                  onClick={handleRemove}
                  className="rounded-md bg-red-700 hover:bg-red-600 px-3 py-1 text-xs font-medium text-white cursor-pointer"
                >
                  Confirm Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="text-xs ui-text-secondary hover:ui-text-primary px-2 py-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border ui-surface-input hover:border-[#cfa458]/60 px-4 py-1.5 text-xs font-medium ui-text-primary cursor-pointer"
            >
              Return to Shelf
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
