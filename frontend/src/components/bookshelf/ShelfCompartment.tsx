import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertTriangle, Plus } from 'lucide-react';
import {
  type ShelfBookDto,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';
import { getCompartmentCapacityStatus } from '../../utils/compartmentCapacity';
import { SortableBook } from './Book';

interface ShelfCompartmentProps {
  compartment: ShelfCompartmentDto;
  onSelectBook: (shelfBook: ShelfBookDto) => void;
  onQuickAddToCompartment?: (compartmentId: string) => void;
  recentlyAddedId?: string | null;
  currentOnPhone?: boolean;
  isDropTarget?: boolean;
  isDropInvalid?: boolean;
}

export const ShelfCompartment = React.memo(function ShelfCompartment({
  compartment,
  onSelectBook,
  onQuickAddToCompartment,
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
                className="opacity-65 sm:opacity-0 sm:group-hover/comp:opacity-75 hover:!opacity-100 focus-visible:opacity-100 transition-opacity ml-2 mb-3 flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-full border border-dashed border-[#d6b26d]/45 bg-[#191009]/65 text-[#dfc080] hover:bg-[#2d1f14]/90 cursor-pointer shrink-0"
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
