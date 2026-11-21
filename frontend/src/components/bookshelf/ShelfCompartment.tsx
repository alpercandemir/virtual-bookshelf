import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import {
  computeOccupiedWidthPx,
  getCompartmentCapacityPx,
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';
import { SortableBook } from './Book';

interface ShelfCompartmentProps {
  compartment: ShelfCompartmentDto;
  onSelectBook: (shelfBook: ShelfBookDto) => void;
  onQuickAddToCompartment?: (compartmentId: string) => void;
  recentlyAddedId?: string | null;
  isDropTarget?: boolean;
  isDropInvalid?: boolean;
}

export const ShelfCompartment = React.memo(function ShelfCompartment({
  compartment,
  onSelectBook,
  onQuickAddToCompartment,
  recentlyAddedId,
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

  const occupiedPx = computeOccupiedWidthPx(
    compartment.books.map((b) => ({
      dimensions: b.book.physicalDimensions,
      orientation: b.orientation,
    })),
    compartment.heightPx
  );
  const capacityPx = getCompartmentCapacityPx(compartment.widthRatio);
  const fillPct = Math.min(100, Math.round((occupiedPx / capacityPx) * 100));
  const activeDrop = isDropTarget || isOver;

  return (
    <div
      ref={setNodeRef}
      data-testid={`compartment-${compartment.id}`}
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

      {/* Subtle Capacity Warning or Drop Hint */}
      {isDropInvalid && (
        <div className="pointer-events-none absolute top-2.5 right-3 z-20 rounded bg-red-950/90 border border-red-400/50 px-2 py-0.5 text-[11px] text-red-100 shadow">
          Shelf is full
        </div>
      )}

      {!isDropInvalid && activeDrop && (
        <div className="pointer-events-none absolute top-2.5 right-3 z-20 rounded bg-[#2a1d12]/90 border border-[#e2b96c]/55 px-2 py-0.5 text-[11px] text-[#f5dfaf] shadow">
          Place here ({fillPct}% full)
        </div>
      )}

      {/* Books Standing Vertically on this Shelf Compartment */}
      <SortableContext
        items={compartment.books.map((b) => b.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="shelf-books-row">
          {compartment.books.map((shelfBook) => (
            <SortableBook
              key={shelfBook.id}
              shelfBook={shelfBook}
              compartmentHeightPx={compartment.heightPx}
              onSelect={onSelectBook}
              isArriving={recentlyAddedId === shelfBook.id}
            />
          ))}

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
                className="opacity-0 group-hover/comp:opacity-75 hover:!opacity-100 focus-visible:opacity-100 transition-opacity ml-2 mb-3 flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-[#d6b26d]/45 bg-[#191009]/65 text-[#dfc080] hover:bg-[#2d1f14]/90 cursor-pointer shrink-0"
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
