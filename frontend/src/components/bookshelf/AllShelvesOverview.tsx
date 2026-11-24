import React, { useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  GripVertical,
  Plus,
  Share2,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  dimensionsToShelfPixels,
  getRoomThemeMeta,
  resolveSpineAppearance,
  type BookshelfDto,
} from '@bookshelf/shared';

interface AllShelvesOverviewProps {
  bookshelves: BookshelfDto[];
  activeBookshelfId: string | null;
  isLightRoom: boolean;
  onOpenShelf: (bookshelfId: string) => void;
  onShareShelf: (shelf: BookshelfDto) => void;
  onCustomizeShelf: (bookshelfId: string) => void;
  onCreateShelf: () => void;
  onReorderShelves: (orderedIds: string[]) => Promise<void>;
  onDeleteShelf: (bookshelfId: string) => Promise<void>;
}

/**
 * Compact live miniature wooden bookcase preview for the macOS Mission Control
 * "All Shelves" gallery view.
 */
function MiniatureCabinet({ shelf }: { shelf: BookshelfDto }) {
  const byRow = new Map<number, BookshelfDto['compartments']>();
  for (const c of shelf.compartments) {
    const arr = byRow.get(c.row) ?? [];
    arr.push(c);
    byRow.set(c.row, arr);
  }
  const rows = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 4);

  const cabinetStyle =
    shelf.configuration.cabinetStyle ??
    getRoomThemeMeta(shelf.roomTheme).defaultCabinetStyle;

  return (
    <div
      className="library-room relative w-full h-56 rounded-t-xl overflow-hidden flex items-center justify-center p-4"
      data-room-theme={shelf.roomTheme}
      style={{ minHeight: 'auto' }}
    >
      {/* Scaled real wooden cabinet frame */}
      <div
        className="bookshelf-cabinet w-full max-w-[270px] !min-w-0 transition-transform duration-300 group-hover:scale-[1.03]"
        data-theme={shelf.visualTheme}
        data-cabinet-style={cabinetStyle}
      >
        {/* Mini Crown */}
        <div
          className={`bookshelf-crown ${cabinetStyle === 'modern' ? '!mx-0' : '!mx-[-6px]'}`}
        >
          <div className="bookshelf-crown-cap !h-[7px]" />
          <div className="bookshelf-crown-frieze !mx-[6px] !h-[7px]" />
        </div>

        {/* Mini Body */}
        <div className="bookshelf-body !grid-cols-[10px_1fr_10px]">
          <div className="bookshelf-stile bookshelf-stile-left after:!hidden" />
          <div className="bookshelf-interior">
            {rows.map(([rowIdx, comps]) => {
              const sorted = comps.sort((a, b) => a.column - b.column);
              return (
                <div key={rowIdx} className="w-full">
                  <div className="shelf-level-row">
                    {sorted.map((comp, idx) => (
                      <React.Fragment key={comp.id}>
                        {idx > 0 && (
                          <div className="shelf-divider-mullion !flex-[0_0_6px]" />
                        )}
                        <div
                          className="shelf-compartment !h-[42px]"
                          style={{ flexGrow: comp.widthRatio, flexBasis: 0 }}
                        >
                          <div className="shelf-deck-surface !h-[5px]" />
                          <div className="relative z-10 flex items-end gap-[1.5px] px-1.5 pb-[2px] h-full overflow-hidden">
                            {comp.books.slice(0, 14).map((sb) => {
                              const px = dimensionsToShelfPixels(
                                sb.book.physicalDimensions,
                                comp.heightPx
                              );
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
                              const miniW = Math.max(4, Math.round(px.spineWidthPx * 0.22));
                              const miniH = Math.max(18, Math.round(px.heightPx * 0.145));
                              return (
                                <span
                                  key={sb.id}
                                  className="shrink-0 rounded-t-[1px] shadow-[1px_0_2px_rgba(0,0,0,0.45)]"
                                  style={{
                                    width: `${miniW}px`,
                                    height: `${miniH}px`,
                                    background: `linear-gradient(90deg, ${app.secondaryColor} 0%, ${app.primaryColor} 35%, ${app.secondaryColor} 100%)`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="shelf-plank-fascia !h-[7px]" />
                </div>
              );
            })}
          </div>
          <div className="bookshelf-stile bookshelf-stile-right after:!hidden" />
        </div>

        {/* Mini Plinth */}
        <div
          className={`bookshelf-plinth ${cabinetStyle === 'modern' ? '!mx-0' : '!mx-[-3px]'}`}
        >
          <div className="bookshelf-plinth-base !h-[9px]" />
        </div>
      </div>
    </div>
  );
}

interface SortableShelfCardProps {
  shelf: BookshelfDto;
  idx: number;
  totalShelves: number;
  isCurrent: boolean;
  isLightRoom: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  onOpen: () => void;
  onShare: () => void;
  onCustomize: () => void;
  onMove: (direction: -1 | 1) => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function SortableShelfCard({
  shelf,
  idx,
  totalShelves,
  isCurrent,
  isLightRoom,
  busy,
  confirmingDelete,
  onOpen,
  onShare,
  onCustomize,
  onMove,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: SortableShelfCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shelf.id });

  const volumeCount = shelf.compartments.reduce(
    (sum, c) => sum + c.books.length,
    0
  );
  const themeMeta = getRoomThemeMeta(shelf.roomTheme);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`overview-shelf-card-${shelf.id}`}
      className={`group rounded-xl overflow-hidden border transition-all duration-200 flex flex-col ${
        isCurrent
          ? 'border-[#dfb86d] ring-2 ring-[#dfb86d]/35 shadow-[0_20px_48px_rgba(0,0,0,0.45)]'
          : isLightRoom
            ? 'border-[#cfc2ae] bg-white/85 hover:border-[#a58654] shadow-[0_12px_28px_rgba(60,44,24,0.12)]'
            : 'border-[#c9a15c]/22 bg-[#1a130e]/95 hover:border-[#dfb86d]/55 shadow-[0_18px_38px_rgba(0,0,0,0.6)]'
      }`}
    >
      {/* Clickable Miniature Bookcase Stage */}
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="relative w-full text-left cursor-pointer focus-visible:outline-none block"
          aria-label={`Open ${shelf.name}`}
        >
          <MiniatureCabinet shelf={shelf} />
        </button>

        {/* Top Floating Badges + Drag Handle */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5">
            {totalShelves > 1 && (
              <button
                type="button"
                aria-label={`Drag to reorder ${shelf.name}`}
                title="Drag to reorder"
                className="pointer-events-auto touch-none inline-flex items-center justify-center rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-sm border border-white/15 p-1.5 sm:p-1 text-[#f5e7cf] cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 px-2.5 py-0.5 text-[11px] font-medium text-[#f5e7cf]">
              #{idx + 1}
              {isCurrent && (
                <span className="text-[#f1cb7a] font-semibold">· Active</span>
              )}
            </span>
          </div>

          {shelf.tag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#cfa458]/90 text-[#1b1208] px-2.5 py-0.5 text-[11px] font-semibold shadow">
              <Tag className="w-3 h-3" />
              {shelf.tag}
            </span>
          )}
        </div>
      </div>

      {/* Card Metadata & Reorder Controls */}
      <div
        className={`p-4 flex-1 flex flex-col justify-between gap-3 ${
          isLightRoom ? 'bg-[#faf6ef]' : 'bg-[#18110c]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className={`font-display text-xl font-semibold truncate ${
                isLightRoom ? 'text-[#221b14]' : 'text-[#f7ebd7]'
              }`}
            >
              {shelf.name}
            </h3>
            <p
              className={`text-xs mt-0.5 flex items-center gap-1.5 flex-wrap ${
                isLightRoom ? 'text-[#6c5d4c]' : 'text-[#a89378]'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {volumeCount} {volumeCount === 1 ? 'volume' : 'volumes'}
              </span>
              <span>&middot;</span>
              <span>{themeMeta.name}</span>
              <span>&middot;</span>
              <span className="capitalize">
                {shelf.visualTheme.replace('-', ' ')}
              </span>
            </p>
          </div>
        </div>

        {/* Action Row: Reorder Left/Right + Customize + Delete */}
        <div
          className={`pt-2.5 border-t flex items-center justify-between gap-2 flex-wrap ${
            isLightRoom ? 'border-[#e4d9c8]' : 'border-[#c9a15c]/14'
          }`}
        >
          {confirmingDelete ? (
            <div className="w-full flex items-center justify-between gap-2">
              <span className="text-xs text-red-400 font-medium">
                Delete{volumeCount > 0 ? ` (${volumeCount} books)` : ''}?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onConfirmDelete}
                  className="rounded-md bg-red-700 hover:bg-red-600 text-white text-xs px-2.5 py-1 font-medium cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCancelDelete}
                  className={`rounded-md border text-xs px-2.5 py-1 cursor-pointer ${
                    isLightRoom
                      ? 'border-[#d6c8b4] text-[#463a2c] hover:bg-[#ede3d2]'
                      : 'border-[#c9a15c]/22 text-[#cbb595] hover:bg-[#2a1e15]'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0 || busy}
                  onClick={() => onMove(-1)}
                  title="Move shelf earlier"
                  aria-label={`Move ${shelf.name} earlier`}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition cursor-pointer ${
                    isLightRoom
                      ? 'border-[#d6c8b4] text-[#463a2c] hover:bg-[#ede3d2]'
                      : 'border-[#c9a15c]/22 text-[#d6c2a5] hover:bg-[#2a1e15]'
                  }`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === totalShelves - 1 || busy}
                  onClick={() => onMove(1)}
                  title="Move shelf later"
                  aria-label={`Move ${shelf.name} later`}
                  className={`p-1.5 rounded-md border disabled:opacity-30 transition cursor-pointer ${
                    isLightRoom
                      ? 'border-[#d6c8b4] text-[#463a2c] hover:bg-[#ede3d2]'
                      : 'border-[#c9a15c]/22 text-[#d6c2a5] hover:bg-[#2a1e15]'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCustomize}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition cursor-pointer ${
                    isLightRoom
                      ? 'border-[#d6c8b4] text-[#3a2f23] hover:bg-[#ede3d2]'
                      : 'border-[#c9a15c]/22 text-[#e0ceaf] hover:bg-[#2a1e15]'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Theme &amp; Layout
                </button>

                <button
                  type="button"
                  aria-label={`Share ${shelf.name}`}
                  title="Share shelf"
                  onClick={onShare}
                  className="p-1.5 rounded-md border ui-surface-input ui-text-secondary cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>

                {totalShelves > 1 && (
                  <button
                    type="button"
                    onClick={onRequestDelete}
                    title="Delete bookshelf"
                    aria-label={`Delete ${shelf.name}`}
                    className="p-1.5 rounded-md text-red-400/80 hover:text-red-300 hover:bg-red-950/35 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AllShelvesOverview({
  bookshelves,
  activeBookshelfId,
  isLightRoom,
  onOpenShelf,
  onShareShelf,
  onCustomizeShelf,
  onCreateShelf,
  onReorderShelves,
  onDeleteShelf,
}: AllShelvesOverviewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMove = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= bookshelves.length) return;
    const ids = bookshelves.map((s) => s.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(targetIdx, 0, moved);
    setBusyId(moved);
    try {
      await onReorderShelves(ids);
    } finally {
      setBusyId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = bookshelves.findIndex((s) => s.id === active.id);
    const newIndex = bookshelves.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const nextIds = arrayMove(
      bookshelves.map((s) => s.id),
      oldIndex,
      newIndex
    );
    await onReorderShelves(nextIds);
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await onDeleteShelf(id);
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  };

  const totalVolumesAll = bookshelves.reduce(
    (sum, s) => sum + s.compartments.reduce((cSum, c) => cSum + c.books.length, 0),
    0
  );
  const readingCountAll = bookshelves.reduce(
    (sum, s) =>
      sum +
      s.compartments.reduce(
        (cSum, c) =>
          cSum +
          c.books.filter((b) => b.visualOverrides.readingStatus === 'reading').length,
        0
      ),
    0
  );

  return (
    <section
      aria-label="All Bookshelves Overview"
      data-testid="all-shelves-overview"
      className="w-full max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-7"
    >
      {/* Architectural Gallery Wall Header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className={`text-[11px] uppercase tracking-[0.22em] font-medium ${
              isLightRoom ? 'text-[#7c6952]' : 'text-[#c9a35c]'
            }`}
          >
            Library Wing &middot; Architectural Elevation
          </p>
          <h2
            className={`font-display text-3xl sm:text-4xl font-semibold mt-1 ${
              isLightRoom ? 'text-[#231d17]' : 'text-[#f8eedc]'
            }`}
          >
            Your Bookcases
          </h2>
        </div>
        <div
          className={`inline-flex items-center gap-3 rounded-full border px-4 py-1.5 text-xs backdrop-blur-md ${
            isLightRoom
              ? 'border-[#d6cab7] bg-white/65 text-[#514232]'
              : 'border-[#c9a15c]/22 bg-[#1a130e]/70 text-[#cbb596]'
          }`}
        >
          <span>
            <strong className="font-semibold ui-text-primary">{bookshelves.length}</strong>{' '}
            {bookshelves.length === 1 ? 'case' : 'cases'}
          </span>
          <span className="opacity-40">&middot;</span>
          <span>
            <strong className="font-semibold ui-text-primary">{totalVolumesAll}</strong>{' '}
            {totalVolumesAll === 1 ? 'volume' : 'volumes'}
          </span>
          {readingCountAll > 0 && (
            <>
              <span className="opacity-40">&middot;</span>
              <span className="text-[#d9848c] font-medium">
                {readingCountAll} reading
              </span>
            </>
          )}
        </div>
      </div>

      {/* Responsive Mission Control Grid with Drag-and-Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={bookshelves.map((s) => s.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {bookshelves.map((shelf, idx) => (
              <SortableShelfCard
                key={shelf.id}
                shelf={shelf}
                idx={idx}
                totalShelves={bookshelves.length}
                isCurrent={shelf.id === activeBookshelfId}
                isLightRoom={isLightRoom}
                busy={busyId === shelf.id}
                confirmingDelete={confirmDeleteId === shelf.id}
                onOpen={() => onOpenShelf(shelf.id)}
                onShare={() => onShareShelf(shelf)}
                onCustomize={() => onCustomizeShelf(shelf.id)}
                onMove={(dir) => handleMove(idx, dir)}
                onRequestDelete={() => setConfirmDeleteId(shelf.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onConfirmDelete={() => handleDelete(shelf.id)}
              />
            ))}

            {/* Add New Shelf Card */}
            <button
              type="button"
              onClick={onCreateShelf}
              data-testid="overview-create-shelf-btn"
              className={`min-h-[180px] sm:min-h-[300px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 p-6 transition cursor-pointer ${
                isLightRoom
                  ? 'border-[#c7b8a0] hover:border-[#8c6b3b] bg-white/45 hover:bg-white/75 text-[#4f4234]'
                  : 'border-[#c9a15c]/28 hover:border-[#dfb86d]/65 bg-[#19120d]/55 hover:bg-[#231912]/80 text-[#d8c4a6]'
              }`}
            >
              <div className="w-12 h-12 rounded-full border border-[#cfa458]/45 bg-[#cfa458]/15 flex items-center justify-center">
                <Plus className="w-6 h-6 text-[#d4aa5d]" />
              </div>
              <div className="text-center">
                <p className="font-display text-xl font-semibold">
                  Add Another Bookshelf
                </p>
                <p className="text-xs opacity-75 mt-1 max-w-[220px]">
                  Organize by year (2026, 2025), genre, reading list, or interior room style.
                </p>
              </div>
            </button>
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
