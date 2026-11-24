import React, { useEffect, useMemo } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  computeOccupiedWidthPx,
  getCompartmentCapacityPx,
  getRoomThemeMeta,
  type BookOrientation,
  type BookshelfDto,
  type BookVisualOverrides,
  type ReadingStatus,
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Circle,
  Eye,
  Layers,
  X,
} from 'lucide-react';
import { BookVisual, type ShelfSpotlightMode } from './Book';
import { ShelfCompartment } from './ShelfCompartment';

export interface BookshelfProps {
  bookshelf: BookshelfDto;
  onSelectBook: (shelfBook: ShelfBookDto) => void;
  onQuickUpdateBook?: (
    shelfBookId: string,
    payload: {
      orientation?: BookOrientation;
      visualOverrides?: BookVisualOverrides;
    }
  ) => Promise<unknown>;
  onQuickAddToCompartment?: (compartmentId: string) => void;
  onReorderComplete?: (
    updatedBookshelf: BookshelfDto,
    payload: Array<{ compartmentId: string; shelfBookIds: string[] }>
  ) => void;
  onInvalidDrop?: (reason: string) => void;
  spotlight?: ShelfSpotlightMode;
  recentlyAddedId?: string | null;
  locateRequest?: { bookId: string } | null;
  onLocated?: () => void;
  forExport?: boolean;
}

interface ShelfLevelGroup {
  row: number;
  compartments: ShelfCompartmentDto[];
}

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
function ordinal(value: number) {
  const suffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd' };
  return `${value}${suffix[ordinalRules.select(value)] ?? 'th'}`;
}

function findBookAndCompartment(
  compartments: ShelfCompartmentDto[],
  id: string
): { compartment: ShelfCompartmentDto; book: ShelfBookDto | null } | null {
  if (id.startsWith('compartment:')) {
    const compId = id.slice('compartment:'.length);
    const comp = compartments.find((c) => c.id === compId);
    return comp ? { compartment: comp, book: null } : null;
  }
  for (const comp of compartments) {
    const book = comp.books.find((b) => b.id === id);
    if (book) return { compartment: comp, book };
  }
  return null;
}

function canFitBook(
  targetComp: ShelfCompartmentDto,
  movingBook: ShelfBookDto
): boolean {
  const alreadyInside = targetComp.books.some((b) => b.id === movingBook.id);
  if (alreadyInside) return true;
  const nextOccupied = computeOccupiedWidthPx(
    [
      ...targetComp.books.map((b) => ({
        dimensions: b.book.physicalDimensions,
        orientation: b.orientation,
      })),
      {
        dimensions: movingBook.book.physicalDimensions,
        orientation: movingBook.orientation,
      },
    ],
    targetComp.heightPx
  );

  const capacity = getCompartmentCapacityPx(targetComp.widthRatio);
  return nextOccupied <= capacity + 16;
}

export function Bookshelf({
  bookshelf,
  onSelectBook,
  onQuickUpdateBook,
  onQuickAddToCompartment,
  onReorderComplete,
  onInvalidDrop,
  spotlight = 'all',
  recentlyAddedId,
  locateRequest,
  onLocated,
  forExport = false,
}: BookshelfProps) {
  const [activeBook, setActiveBook] = React.useState<ShelfBookDto | null>(null);
  const [draftCompartments, setDraftCompartments] = React.useState<
    ShelfCompartmentDto[] | null
  >(null);
  const [hoverCompartmentId, setHoverCompartmentId] = React.useState<string | null>(
    null
  );
  const [invalidCompartmentId, setInvalidCompartmentId] = React.useState<
    string | null
  >(null);
  const [contextMenu, setContextMenu] = React.useState<{
    book: ShelfBookDto;
    x: number;
    y: number;
  } | null>(null);

  const displayedCompartments = draftCompartments ?? bookshelf.compartments;

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const levels = useMemo<ShelfLevelGroup[]>(() => {
    const byRow = new Map<number, ShelfCompartmentDto[]>();
    for (const comp of displayedCompartments) {
      const list = byRow.get(comp.row) ?? [];
      list.push(comp);
      byRow.set(comp.row, list);
    }
    return [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([row, comps]) => ({
        row,
        compartments: comps.sort((a, b) => a.column - b.column),
      }));
  }, [displayedCompartments]);

  const compartments = levels.flatMap((level) => level.compartments);
  const [phoneCompartmentId, setPhoneCompartmentId] = React.useState<string>();
  const [selection, setSelection] = React.useState<{ bookId: string } | null>(null);
  const stageRef = React.useRef<HTMLElement>(null);
  const touch = React.useRef<{
    x: number;
    y: number;
    row: HTMLElement | null;
    scrollLeft: number;
    panning: boolean;
  } | null>(null);
  const match = selection ? findBookAndCompartment(compartments, selection.bookId) : null;
  const selected = match?.book;
  const selectedComp = match?.compartment;
  const currentComp =
    compartments.find((comp) => comp.id === phoneCompartmentId) ?? compartments[0];
  const label = (comp: ShelfCompartmentDto) =>
    comp.settings.label || `Level ${comp.row + 1}, column ${comp.column + 1}`;

  React.useLayoutEffect(() => {
    if (!locateRequest) return;
    const found = findBookAndCompartment(bookshelf.compartments, locateRequest.bookId);
    if (found?.book) {
      setPhoneCompartmentId(found.compartment.id);
      setSelection(locateRequest);
    }
    onLocated?.();
  }, [locateRequest, bookshelf.compartments, onLocated]);

  React.useLayoutEffect(() => {
    if (!selection) return;
    const slot = stageRef.current?.querySelector<HTMLElement>(
      `[data-book-id="${CSS.escape(selection.bookId)}"]`
    );
    slot?.querySelector('button')?.focus({ preventScroll: true });
    slot?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (slot) {
      slot.dataset.located = 'true';
      return () => {
        delete slot.dataset.located;
      };
    }
  }, [selection]);

  const navigate = (delta: number) => {
    const next = compartments[compartments.indexOf(currentComp) + delta];
    if (next) {
      setPhoneCompartmentId(next.id);
      setSelection(null);
    }
  };

  const inspect = (book: ShelfBookDto) => {
    setSelection(null);
    setContextMenu(null);
    onSelectBook(book);
  };

  const handleOpenContextMenu = (
    book: ShelfBookDto,
    coords: { x: number; y: number }
  ) => {
    if (!onQuickUpdateBook) return;
    const clampedX = Math.min(coords.x, Math.max(12, window.innerWidth - 236));
    const clampedY = Math.min(coords.y, Math.max(12, window.innerHeight - 280));
    setContextMenu({ book, x: clampedX, y: clampedY });
  };

  const handleDragStart = (event: DragStartEvent) => {
    touch.current = null;
    setSelection(null);
    setContextMenu(null);
    const id = String(event.active.id);
    const found = findBookAndCompartment(bookshelf.compartments, id);
    if (found?.book) {
      setActiveBook(found.book);
      setDraftCompartments(
        bookshelf.compartments.map((c) => ({ ...c, books: [...c.books] }))
      );
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !activeBook || !draftCompartments) {
      setHoverCompartmentId(null);
      setInvalidCompartmentId(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const source = findBookAndCompartment(draftCompartments, activeId);
    const target = findBookAndCompartment(draftCompartments, overId);

    if (!source || !target) return;

    setHoverCompartmentId(target.compartment.id);

    if (source.compartment.id === target.compartment.id) {
      setInvalidCompartmentId(null);
      if (target.book && activeId !== overId) {
        setDraftCompartments((prev) => {
          if (!prev) return prev;
          return prev.map((c) => {
            if (c.id !== source.compartment.id) return c;
            const oldIndex = c.books.findIndex((b) => b.id === activeId);
            const newIndex = c.books.findIndex((b) => b.id === overId);
            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
              return c;
            }
            const moved = arrayMove(c.books, oldIndex, newIndex).map((b, idx) => ({
              ...b,
              position: idx,
            }));
            return { ...c, books: moved };
          });
        });
      }
      return;
    }

    // Moving across compartments — validate shelf space first
    if (!canFitBook(target.compartment, activeBook)) {
      setInvalidCompartmentId(target.compartment.id);
      return;
    }

    setInvalidCompartmentId(null);

    setDraftCompartments((prev) => {
      if (!prev) return prev;
      const moving = prev
        .flatMap((c) => c.books)
        .find((b) => b.id === activeId);
      if (!moving) return prev;

      return prev.map((c) => {
        if (c.id === source.compartment.id) {
          return {
            ...c,
            books: c.books
              .filter((b) => b.id !== activeId)
              .map((b, idx) => ({ ...b, position: idx })),
          };
        }
        if (c.id === target.compartment.id) {
          const without = c.books.filter((b) => b.id !== activeId);
          const insertIdx = target.book
            ? Math.max(
                0,
                without.findIndex((b) => b.id === target.book!.id)
              )
            : without.length;
          const nextBooks = [...without];
          nextBooks.splice(insertIdx, 0, {
            ...moving,
            compartmentId: c.id,
          });
          return {
            ...c,
            books: nextBooks.map((b, idx) => ({ ...b, position: idx })),
          };
        }
        return c;
      });
    });
  };

  const handleDragCancel = () => {
    setActiveBook(null);
    setDraftCompartments(null);
    setHoverCompartmentId(null);
    setInvalidCompartmentId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { over } = event;
    const finalDraft = draftCompartments;
    const wasInvalid = Boolean(invalidCompartmentId);

    setActiveBook(null);
    setDraftCompartments(null);
    setHoverCompartmentId(null);
    setInvalidCompartmentId(null);

    if (wasInvalid) {
      onInvalidDrop?.('That shelf compartment does not have enough room for this book.');
      return;
    }

    if (!over || !finalDraft) {
      return;
    }

    const origSig = bookshelf.compartments
      .map((c) => `${c.id}:${c.books.map((b) => b.id).join(',')}`)
      .join('|');
    const nextSig = finalDraft
      .map((c) => `${c.id}:${c.books.map((b) => b.id).join(',')}`)
      .join('|');

    if (origSig === nextSig) {
      return;
    }

    const updatedBookshelf: BookshelfDto = {
      ...bookshelf,
      compartments: finalDraft,
    };

    const payload = finalDraft.map((c) => ({
      compartmentId: c.id,
      shelfBookIds: c.books.map((b) => b.id),
    }));

    onReorderComplete?.(updatedBookshelf, payload);
  };

  const showSconce = bookshelf.configuration.showSconceLight !== false;
  const showBookends = bookshelf.configuration.showBookends !== false;
  const cabinetStyle =
    bookshelf.configuration.cabinetStyle ??
    getRoomThemeMeta(bookshelf.roomTheme).defaultCabinetStyle;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section
        ref={stageRef}
        data-export={forExport || undefined}
        aria-label={bookshelf.name}
        onKeyDown={(event) => {
          if (
            !selection ||
            event.key !== 'Escape' ||
            document.querySelector('[aria-modal="true"]')
          )
            return;
          setSelection(null);
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={(event) => {
          if (event.touches.length !== 1) {
            touch.current = null;
            return;
          }
          const point = event.touches[0];
          const book = (event.target as HTMLElement).closest('.book-slot');
          const row = book?.closest<HTMLElement>('.shelf-books-row') ?? null;
          touch.current = {
            x: point.clientX,
            y: point.clientY,
            row,
            scrollLeft: row?.scrollLeft ?? 0,
            panning: false,
          };
        }}
        onTouchMove={(event) => {
          const start = touch.current;
          if (!start?.row || !window.matchMedia('(max-width: 639px)').matches) return;
          const dx = event.touches[0].clientX - start.x;
          const dy = event.touches[0].clientY - start.y;
          if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 8) return;
          const row = start.row;
          if (
            dx > 0
              ? start.scrollLeft > 1
              : start.scrollLeft + row.clientWidth < row.scrollWidth - 1
          ) {
            row.scrollLeft = start.scrollLeft - dx;
            start.panning = true;
          }
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
        onTouchEnd={(event) => {
          const start = touch.current;
          touch.current = null;
          if (!start || !window.matchMedia('(max-width: 639px)').matches) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          if (start.panning) return;
          navigate(dx < 0 ? 1 : -1);
        }}
        className="bookshelf-stage w-full px-1 sm:px-6 pt-2 sm:pt-4 pb-6 sm:pb-10"
      >
        {!forExport && currentComp && (
          <nav className="compartment-nav sm:hidden" aria-label="Bookcase map">
            <div className="min-w-0">
              <p className="font-display text-xl">{label(currentComp)}</p>
              <p className="text-xs ui-text-secondary">
                {compartments.indexOf(currentComp) + 1} of {compartments.length} compartments
              </p>
            </div>
            <div className="compartment-map">
              {levels.map((level) => (
                <div key={level.row}>
                  {level.compartments.map((comp) => (
                    <button
                      type="button"
                      key={comp.id}
                      style={{ flexGrow: comp.widthRatio }}
                      aria-label={`Show ${label(comp)}`}
                      aria-pressed={comp.id === currentComp.id}
                      onClick={() => {
                        setPhoneCompartmentId(comp.id);
                        setSelection(null);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </nav>
        )}

        {/* Horizontally scrollable viewport wrapper on narrow screens to keep book spines readable */}
        <div className="library-scroll overflow-x-auto pb-4 sm:pb-5 pt-4 sm:pt-6">
          <div className="relative mx-auto w-full max-w-[1040px] sm:min-w-[720px] px-3 sm:px-6">
            {/* Warm Overhead Brass Gallery Lamp & Sconce Glow */}
            {showSconce && (
              <>
                {cabinetStyle === 'heritage' && (
                  <div className="bookshelf-brass-lamp" aria-hidden="true" />
                )}
                <div className="bookshelf-sconce-glow" aria-hidden="true" />
              </>
            )}

            {/* Physical Wooden Bookcase Furniture */}
            <div
              className="bookshelf-cabinet"
              data-theme={bookshelf.visualTheme}
              data-cabinet-style={cabinetStyle}
              data-spotlight-active={spotlight !== 'all' ? 'true' : undefined}
              data-testid="bookshelf-cabinet"
            >
              {/* Stepped Antique Crown Cornice */}
              <div className="bookshelf-crown" aria-hidden="true">
                <div className="bookshelf-crown-cap" />
                <div className="bookshelf-crown-cove" />
                <div className="bookshelf-crown-frieze" />
              </div>

              {/* Cabinet Body: Left Pilaster + Shelving Levels + Right Pilaster */}
              <div className="bookshelf-body">
                <div
                  className="bookshelf-stile bookshelf-stile-left"
                  aria-hidden="true"
                />

                <div className="bookshelf-interior">
                  {levels.map((level, levelIdx) => (
                    <div
                      key={level.row}
                      className="shelf-level w-full"
                      data-level-index={levelIdx}
                      data-phone-current={level.row === currentComp?.row || undefined}
                    >
                      {/* Compartment Row */}
                      <div className="shelf-level-row">
                        {level.compartments.map((comp, idx) => (
                          <React.Fragment key={comp.id}>
                            {idx > 0 && (
                              <div
                                className="shelf-divider-mullion"
                                aria-hidden="true"
                              />
                            )}
                            <ShelfCompartment
                              compartment={comp}
                              currentOnPhone={comp.id === currentComp?.id}
                              onSelectBook={inspect}
                              onContextMenuBook={handleOpenContextMenu}
                              onQuickAddToCompartment={onQuickAddToCompartment}
                              spotlight={spotlight}
                              showBookends={showBookends}
                              recentlyAddedId={recentlyAddedId}
                              isDropTarget={hoverCompartmentId === comp.id}
                              isDropInvalid={invalidCompartmentId === comp.id}
                            />
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Thick Bevelled Horizontal Wooden Shelf Plank */}
                      <div className="shelf-plank-fascia">
                        {level.compartments.map((comp, idx) => (
                          <React.Fragment key={`plaque-${comp.id}`}>
                            {idx > 0 && <div className="w-[20px] shrink-0" />}
                            <div
                              className="flex items-center justify-center min-w-0"
                              data-phone-current={comp.id === currentComp?.id || undefined}
                              style={{ flexGrow: comp.widthRatio, flexBasis: 0 }}
                            >
                              {comp.settings.label ? (
                                <span className="shelf-brass-plaque">
                                  {comp.settings.label}
                                </span>
                              ) : currentComp?.id === comp.id ? (
                                <span className="shelf-brass-plaque sm:hidden">
                                  {label(comp)}
                                </span>
                              ) : null}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="bookshelf-stile bookshelf-stile-right"
                  aria-hidden="true"
                />
              </div>

              {/* Stepped Baseboard Plinth */}
              <div className="bookshelf-plinth" aria-hidden="true">
                <div className="bookshelf-plinth-trim" />
                <div className="bookshelf-plinth-base" />
              </div>
            </div>
          </div>
        </div>

        {selected && selectedComp && selection && (
          <div className="shelf-selection ui-surface-panel" aria-label="Selected book">
            <div className="min-w-0 flex-1" role="status">
              <p className="font-display text-lg leading-tight">{selected.book.title}</p>
              <p className="text-xs ui-text-secondary">
                {bookshelf.name} · {label(selectedComp)} ·{' '}
                {ordinal(
                  selectedComp.books.findIndex((book) => book.id === selected.id) + 1
                )}{' '}
                from left
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => inspect(selected)}>
                Open details
              </button>
              <button
                type="button"
                aria-label="Return book to shelf"
                onClick={() => {
                  stageRef.current
                    ?.querySelector<HTMLButtonElement>(
                      `[data-book-id="${CSS.escape(selected.id)}"] button`
                    )
                    ?.focus();
                  setSelection(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Right-Click Direct Manipulation Context Menu */}
      {contextMenu && onQuickUpdateBook && (
        <div
          role="menu"
          aria-label={`Quick actions for ${contextMenu.book.book.title}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 rounded-xl border ui-surface-panel shadow-[0_22px_48px_rgba(0,0,0,0.55)] p-1.5 text-xs"
        >
          <div className="px-2.5 py-1.5 border-b ui-surface-header mb-1">
            <p className="font-display text-sm font-semibold ui-text-primary truncate">
              {contextMenu.book.book.title}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => inspect(contextMenu.book)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg ui-text-primary hover:bg-[#cfa458]/15 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#c89d54]" />
            Inspect Book
          </button>

          <p className="px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-wider ui-text-muted">
            Reading Status
          </p>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {(
              [
                { id: 'unread', label: 'Unread', Icon: Circle },
                { id: 'reading', label: 'Reading', Icon: Bookmark },
                { id: 'finished', label: 'Done', Icon: CheckCircle2 },
              ] as Array<{ id: ReadingStatus; label: string; Icon: typeof Circle }>
            ).map(({ id, label: stLabel, Icon }) => {
              const active =
                (contextMenu.book.visualOverrides.readingStatus ?? 'unread') === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    void onQuickUpdateBook(contextMenu.book.id, {
                      visualOverrides: { readingStatus: id },
                    });
                    setContextMenu(null);
                  }}
                  className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-1 border transition cursor-pointer ${
                    active
                      ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                      : 'border-transparent ui-text-secondary hover:bg-[#cfa458]/10'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px]">{stLabel}</span>
                </button>
              );
            })}
          </div>

          <p className="px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider ui-text-muted">
            Shelf Pose
          </p>
          <div className="grid grid-cols-2 gap-1 px-1 pb-1">
            {(
              [
                { id: 'vertical', label: 'Upright' },
                { id: 'face-out', label: 'Face Out', Icon: Eye },
                { id: 'stacked', label: 'Stack Flat', Icon: Layers },
                { id: 'leaning-left', label: 'Lean Left' },
              ] as Array<{
                id: BookOrientation;
                label: string;
                Icon?: typeof Eye;
              }>
            ).map(({ id, label: poseLabel, Icon }) => {
              const active = contextMenu.book.orientation === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    void onQuickUpdateBook(contextMenu.book.id, { orientation: id });
                    setContextMenu(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 px-2 border transition cursor-pointer ${
                    active
                      ? 'bg-[#cfa458]/20 border-[#cfa458] ui-text-primary font-semibold'
                      : 'border-transparent ui-text-secondary hover:bg-[#cfa458]/10'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{poseLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Physical 3D Book Drag Preview */}
      <DragOverlay
        dropAnimation={{ duration: 210, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {activeBook ? (
          <BookVisual
            shelfBook={activeBook}
            compartmentHeightPx={285}
            isOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
