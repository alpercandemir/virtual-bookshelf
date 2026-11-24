import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertTriangle, Plus } from 'lucide-react';
import {
  dimensionsToShelfPixels,
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';
import { getCompartmentCapacityStatus } from '../../utils/compartmentCapacity';
import { SortableBook, type ShelfSpotlightMode } from './Book';

interface ShelfCompartmentProps {
  compartment: ShelfCompartmentDto;
  onSelectBook: (shelfBook: ShelfBookDto) => void;
  onContextMenuBook?: (
    shelfBook: ShelfBookDto,
    coords: { x: number; y: number }
  ) => void;
  onQuickAddToCompartment?: (compartmentId: string) => void;
  spotlight?: ShelfSpotlightMode;
  showBookends?: boolean;
  recentlyAddedId?: string | null;
  currentOnPhone?: boolean;
  isDropTarget?: boolean;
  isDropInvalid?: boolean;
}

type ShelfRenderItem =
  | { kind: 'single'; book: ShelfBookDto }
  | { kind: 'stack'; books: ShelfBookDto[] };

function groupShelfRenderItems(
  books: ShelfBookDto[],
  compartmentHeightPx: number
): ShelfRenderItem[] {
  const items: ShelfRenderItem[] = [];
  const maxStackHeight = Math.max(150, compartmentHeightPx - 48);
  let i = 0;

  while (i < books.length) {
    const current = books[i];
    if (current.orientation !== 'stacked') {
      items.push({ kind: 'single', book: current });
      i += 1;
      continue;
    }

    const stack: ShelfBookDto[] = [current];
    let stackHeight = dimensionsToShelfPixels(
      current.book.physicalDimensions,
      compartmentHeightPx
    ).spineWidthPx;
    let j = i + 1;

    while (j < books.length && books[j].orientation === 'stacked' && stack.length < 4) {
      const nextH = dimensionsToShelfPixels(
        books[j].book.physicalDimensions,
        compartmentHeightPx
      ).spineWidthPx;
      if (stackHeight + nextH > maxStackHeight) break;
      stack.push(books[j]);
      stackHeight += nextH;
      j += 1;
    }

    items.push({ kind: 'stack', books: stack });
    i = j;
  }

  return items;
}

export const ShelfCompartment = React.memo(function ShelfCompartment({
  compartment,
  onSelectBook,
  onContextMenuBook,
  onQuickAddToCompartment,
  spotlight = 'all',
  showBookends = true,
  recentlyAddedId,
  currentOnPhone,
  isDropTarget = false,
  isDropInvalid = false,
}: ShelfCompartmentProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `compartment:${compartment.id}`,
    data: {
      type: 'compartment',
      compartmentId: compartment.id,
    },
  });

  const { fillPct } = getCompartmentCapacityStatus(compartment);
  const activeDrop = isDropTarget || isOver;

  const renderItems = useMemo(
    () => groupShelfRenderItems(compartment.books, compartment.heightPx),
    [compartment.books, compartment.heightPx]
  );

  const lastBook = compartment.books[compartment.books.length - 1];
  const shouldShowBookend =
    showBookends &&
    compartment.books.length > 0 &&
    fillPct < 82 &&
    lastBook &&
    lastBook.orientation !== 'stacked' &&
    lastBook.orientation !== 'leaning-right';

  return (
    <div
      ref={setNodeRef}
      data-testid={`compartment-${compartment.id}`}
      data-phone-current={currentOnPhone || undefined}
      data-drop-active={activeDrop && !isDropInvalid ? 'true' : undefined}
      data-drop-invalid={isDropInvalid ? 'true' : undefined}
      className="shelf-compartment group/comp"
      style={{
        flexGrow: compartment.widthRatio,
        flexBasis: 0,
        height: `${compartment.heightPx}px`,
      }}
      aria-label={`Shelf ${compartment.row + 1}${
        compartment.settings.label ? ` — ${compartment.settings.label}` : ''
      }, ${compartment.books.length} books`}
    >
      {/* Recessed Horizontal Wood Shelf Deck Surface */}
      <div className="shelf-deck-surface" aria-hidden="true" />

      {/* Prominent Invalid Drop Overlay when Dragging onto a Full Compartment */}
      {isDropInvalid && (
        <div
          role="alert"
          data-testid="compartment-drop-full-warning"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-red-950/60 backdrop-blur-[1.5px] px-3"
        >
          <div className="flex items-center gap-2.5 rounded-xl bg-[#450a0a]/95 border-2 border-red-400 px-4 py-2.5 text-red-50 shadow-[0_12px_32px_rgba(0,0,0,0.85)]">
            <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-white">Shelf is full</p>
              <p className="text-xs text-red-100/95">
                No room left in this compartment
              </p>
            </div>
          </div>
        </div>
      )}

      {!isDropInvalid && activeDrop && (
        <div className="pointer-events-none absolute top-2.5 right-3 z-20 rounded-lg bg-[#2a1d12]/95 border border-[#e2b96c]/70 px-2.5 py-1 text-xs font-medium text-[#f5dfaf] shadow-lg">
          Place here ({fillPct}% full)
        </div>
      )}

      {/* Books Standing Vertically or Lying in Horizontal Stacks */}
      <SortableContext
        items={compartment.books.map((b) => b.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="shelf-books-row">
          {renderItems.map((item) =>
            item.kind === 'single' ? (
              <SortableBook
                key={item.book.id}
                shelfBook={item.book}
                compartmentHeightPx={compartment.heightPx}
                onSelect={onSelectBook}
                onContextMenuBook={onContextMenuBook}
                spotlight={spotlight}
                isArriving={recentlyAddedId === item.book.id}
              />
            ) : (
              <div
                key={`stack-${item.books[0].id}`}
                className="book-horizontal-stack"
                data-testid="book-horizontal-stack"
              >
                {item.books.map((stackedBook) => (
                  <SortableBook
                    key={stackedBook.id}
                    shelfBook={stackedBook}
                    compartmentHeightPx={compartment.heightPx}
                    onSelect={onSelectBook}
                    onContextMenuBook={onContextMenuBook}
                    spotlight={spotlight}
                    isArriving={recentlyAddedId === stackedBook.id}
                  />
                ))}
              </div>
            )
          )}

          {/* Physical Architectural Bookend resting flush against partially-filled rows */}
          {shouldShowBookend && (
            <div className="shelf-bookend" aria-hidden="true">
              <div className="shelf-bookend-upright" />
              <div className="shelf-bookend-foot" />
            </div>
          )}

          {/* Empty or remaining space subtle quick-add affordance on hover */}
          {compartment.books.length === 0 ? (
            <div className="flex-1 self-center flex items-center justify-center pb-2">
              {onQuickAddToCompartment && (
                <button
                  type="button"
                  onClick={() => onQuickAddToCompartment(compartment.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a15c]/25 bg-[#1a110b]/60 hover:bg-[#2c1e13]/85 hover:border-[#dfb86e]/50 px-3.5 py-1.5 text-xs text-[#cbb596] hover:text-[#f6e4c1] transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add a book to this shelf
                </button>
              )}
            </div>
          ) : (
            onQuickAddToCompartment &&
            fillPct < 92 && (
              <button
                type="button"
                onClick={() => onQuickAddToCompartment(compartment.id)}
                title="Add a book to this shelf"
                aria-label={`Add book to shelf ${compartment.row + 1}`}
                className="opacity-65 sm:opacity-0 sm:group-hover/comp:opacity-75 hover:!opacity-100 focus-visible:opacity-100 transition-opacity ml-auto mr-1 mb-3 flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-full border border-dashed border-[#d6b26d]/45 bg-[#191009]/65 text-[#dfc080] hover:bg-[#2d1f14]/90 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </SortableContext>
    </div>
  );
});
