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
}

interface ShelfLevelGroup {
  row: number;
  compartments: ShelfCompartmentDto[];
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

  const handleDragStart = (event: DragStartEvent) => {
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
        aria-label={bookshelf.name}
        className="bookshelf-stage w-full px-1 sm:px-6 pt-2 sm:pt-3 pb-6 sm:pb-10"
      >
        {/* Horizontally scrollable viewport wrapper on narrow screens to keep book spines readable */}
        <div className="library-scroll overflow-x-auto pb-4 sm:pb-5 pt-3 sm:pt-4">
          <div className="relative mx-auto w-full max-w-[1040px] min-w-[640px] sm:min-w-[720px] px-3 sm:px-6">
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
                    <div key={level.row} className="w-full">
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
                              onSelectBook={onSelectBook}
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
                              style={{ flexGrow: comp.widthRatio, flexBasis: 0 }}
                            >
                              {comp.settings.label && (
                                <span className="shelf-brass-plaque">
                                  {comp.settings.label}
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
