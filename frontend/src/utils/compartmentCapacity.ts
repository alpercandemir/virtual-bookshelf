import {
  computeOccupiedWidthPx,
  getCompartmentCapacityPx,
  type ShelfCompartmentDto,
} from '@bookshelf/shared';

/**
 * Matches backend checkCompartmentCanAccept tolerance (+24px) and
 * minimum possible vertical book slot width (24px min spine + 2px gap = 26px).
 */
const BACKEND_CAPACITY_TOLERANCE_PX = 24;
const MIN_VERTICAL_BOOK_SLOT_PX = 26;
const NEARLY_FULL_PCT_THRESHOLD = 92;
const NEARLY_FULL_REMAINING_PX = 48;

export interface CompartmentCapacityStatus {
  occupiedPx: number;
  capacityPx: number;
  remainingPx: number;
  fillPct: number;
  /** Guaranteed no standard/thin vertical book can fit in this compartment. */
  isFull: boolean;
  /** Very little room left; only slim books may fit. */
  isNearlyFull: boolean;
}

export function getCompartmentCapacityStatus(
  compartment: ShelfCompartmentDto
): CompartmentCapacityStatus {
  const occupiedPx = computeOccupiedWidthPx(
    compartment.books.map((b) => ({
      dimensions: b.book.physicalDimensions,
      orientation: b.orientation,
    })),
    compartment.heightPx
  );
  const capacityPx = getCompartmentCapacityPx(compartment.widthRatio);
  const fillPct = Math.min(100, Math.round((occupiedPx / capacityPx) * 100));
  const remainingPx = Math.max(
    0,
    capacityPx + BACKEND_CAPACITY_TOLERANCE_PX - occupiedPx
  );
  const isFull = remainingPx < MIN_VERTICAL_BOOK_SLOT_PX;
  const isNearlyFull =
    !isFull &&
    (fillPct >= NEARLY_FULL_PCT_THRESHOLD ||
      remainingPx < NEARLY_FULL_REMAINING_PX);

  return {
    occupiedPx,
    capacityPx,
    remainingPx,
    fillPct,
    isFull,
    isNearlyFull,
  };
}

export function formatCompartmentLabel(
  compartment: ShelfCompartmentDto
): string {
  return `Level ${compartment.row + 1}${
    compartment.settings.label
      ? ` — ${compartment.settings.label}`
      : ` (Col ${compartment.column + 1})`
  }`;
}
