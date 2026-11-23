import React, { useMemo } from 'react';
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
  dimensionsToShelfPixels,
  getCompartmentCapacityPx,
  getRoomThemeMeta,
  type BookshelfDto,
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';
import { X } from 'lucide-react';
import { BookVisual } from './Book';
import { ShelfCompartment } from './ShelfCompartment';

export interface BookshelfProps {
  bookshelf: BookshelfDto;
  onSelectBook: (shelfBook: ShelfBookDto) => void;
  onQuickAddToCompartment?: (compartmentId: string) => void;
  onReorderComplete?: (
    updatedBookshelf: BookshelfDto,
    payload: Array<{ compartmentId: string; shelfBookIds: string[] }>
  ) => void;
  onInvalidDrop?: (reason: string) => void;
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
  const occupied = computeOccupiedWidthPx(
    targetComp.books.map((b) => ({
      dimensions: b.book.physicalDimensions,
      orientation: b.orientation,
    })),
    targetComp.heightPx
  );
  const incomingPx = dimensionsToShelfPixels(
    movingBook.book.physicalDimensions,
    targetComp.heightPx
  );
  const incomingWidth =
    movingBook.orientation === 'face-out'
      ? Math.min(incomingPx.depthPx, 148) + 6
      : incomingPx.spineWidthPx + 2;

  const capacity = getCompartmentCapacityPx(targetComp.widthRatio);
  return occupied + incomingWidth <= capacity + 16;
}

export function Bookshelf({
  bookshelf,
  onSelectBook,
  onQuickAddToCompartment,
  onReorderComplete,
  onInvalidDrop,
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

  const displayedCompartments = draftCompartments ?? bookshelf.compartments;

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

  const compartments = levels.flatMap(level => level.compartments);
  const [phoneCompartmentId, setPhoneCompartmentId] = React.useState<string>();
  const [selection, setSelection] = React.useState<{ bookId: string } | null>(null);
  const stageRef = React.useRef<HTMLElement>(null);
  const touch = React.useRef<{ x: number; y: number; row: HTMLElement | null; scrollLeft: number; panning: boolean } | null>(null);
  const match = selection ? findBookAndCompartment(compartments, selection.bookId) : null;
  const selected = match?.book;
  const selectedComp = match?.compartment;
  const currentComp = compartments.find(comp => comp.id === phoneCompartmentId) ?? compartments[0];
  const label = (comp: ShelfCompartmentDto) => comp.settings.label || `Level ${comp.row + 1}, column ${comp.column + 1}`;

  React.useLayoutEffect(() => {
    if (!locateRequest) return;
    const match = findBookAndCompartment(bookshelf.compartments, locateRequest.bookId);
    if (match?.book) {
      setPhoneCompartmentId(match.compartment.id);
      setSelection(locateRequest);
    }
    onLocated?.();
  }, [locateRequest, bookshelf.compartments, onLocated]);

  React.useLayoutEffect(() => {
    if (!selection) return;
    const slot = stageRef.current?.querySelector<HTMLElement>(`[data-book-id="${CSS.escape(selection.bookId)}"]`);
    slot?.querySelector('button')?.focus({ preventScroll: true });
    slot?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (slot) {
      slot.dataset.located = 'true';
      return () => { delete slot.dataset.located; };
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
    onSelectBook(book);
  };

  const handleDragStart = (event: DragStartEvent) => {
    touch.current = null;
    setSelection(null);
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

    // Check if ordering actually changed
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
        onKeyDown={event => {
          if (!selection || event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
          setSelection(null);
          event.preventDefault();
          event.stopPropagation();
        }}
        onTouchStart={event => {
          if (event.touches.length !== 1) { touch.current = null; return; }
          const point = event.touches[0];
          const book = (event.target as HTMLElement).closest('.book-slot');
          const row = book?.closest<HTMLElement>('.shelf-books-row') ?? null;
          touch.current = { x: point.clientX, y: point.clientY, row, scrollLeft: row?.scrollLeft ?? 0, panning: false };
        }}
        onTouchMove={event => {
          const start = touch.current;
          if (!start?.row || !window.matchMedia('(max-width: 639px)').matches) return;
          const dx = event.touches[0].clientX - start.x;
          const dy = event.touches[0].clientY - start.y;
          if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 8) return;
          const row = start.row;
          if (dx > 0 ? start.scrollLeft > 1 : start.scrollLeft + row.clientWidth < row.scrollWidth - 1) {
            row.scrollLeft = start.scrollLeft - dx;
            start.panning = true;
          }
        }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={event => {
          const start = touch.current;
          touch.current = null;
          if (!start || !window.matchMedia('(max-width: 639px)').matches) return;
          const dx = event.changedTouches[0].clientX - start.x;
          const dy = event.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          if (start.panning) return;
          navigate(dx < 0 ? 1 : -1);
        }}
        className="bookshelf-stage w-full px-1 sm:px-6 pt-2 sm:pt-3 pb-6 sm:pb-10"
      >
        {!forExport && currentComp && (
          <nav className="compartment-nav sm:hidden" aria-label="Bookcase map">
            <div className="min-w-0">
              <p className="font-display text-xl">{label(currentComp)}</p>
              <p className="text-xs ui-text-secondary">{compartments.indexOf(currentComp) + 1} of {compartments.length} compartments</p>
            </div>
            <div className="compartment-map">
              {levels.map(level => (
                <div key={level.row}>
                  {level.compartments.map(comp => (
                    <button type="button" key={comp.id} style={{ flexGrow: comp.widthRatio }}
                      aria-label={`Show ${label(comp)}`} aria-pressed={comp.id === currentComp.id}
                      onClick={() => { setPhoneCompartmentId(comp.id); setSelection(null); }} />
                  ))}
                </div>
              ))}
            </div>
          </nav>
        )}
        {/* Horizontally scrollable viewport wrapper on narrow screens to keep book spines readable */}
        <div className="library-scroll overflow-x-auto pb-4 sm:pb-5 pt-3 sm:pt-4">
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
                  {levels.map((level) => (
                    <div key={level.row} className="shelf-level w-full" data-phone-current={level.row === currentComp?.row || undefined}>
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
                              onQuickAddToCompartment={onQuickAddToCompartment}
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
                              {(comp.settings.label || currentComp?.id === comp.id) && (
                                <span className="shelf-brass-plaque">
                                  {label(comp)}
                                </span>
                              )}
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
              <p className="text-xs ui-text-secondary">{bookshelf.name} · {label(selectedComp)} · {ordinal(selectedComp.books.findIndex(book => book.id === selected.id) + 1)} from left</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => inspect(selected)}>Open details</button>
              <button type="button" aria-label="Return book to shelf" onClick={() => {
                stageRef.current?.querySelector<HTMLButtonElement>(`[data-book-id="${CSS.escape(selected.id)}"] button`)?.focus();
                setSelection(null);
              }}><X size={16} /></button>
            </div>
          </div>
        )}
      </section>

      {/* Floating Physical 3D Book Drag Preview */}
      <DragOverlay dropAnimation={{ duration: 210, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
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
