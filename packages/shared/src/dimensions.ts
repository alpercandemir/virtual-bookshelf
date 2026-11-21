import type { BookFormat, PhysicalDimensions } from './types.js';

export interface DimensionRawInput {
  heightCm?: number | string | null;
  widthCm?: number | string | null;
  thicknessCm?: number | string | null;
  heightMm?: number | null;
  widthMm?: number | null;
  thicknessMm?: number | null;
  pageCount?: number | null;
  format?: BookFormat | null;
  categories?: string[];
  title?: string;
  /** Average paper thickness per printed page (i.e. half of leaf caliper), default 0.068mm */
  paperThicknessMmPerPage?: number;
}

export interface BookShelfPixelDimensions {
  /** Visual height on shelf in pixels */
  heightPx: number;
  /** Visual spine width (thickness) on shelf in pixels */
  spineWidthPx: number;
  /** Visual cover depth in pixels (used in 3D reveal) */
  depthPx: number;
}

export const DEFAULT_PAPER_THICKNESS_MM_PER_PAGE = 0.068;

const FORMAT_DEFAULTS_MM: Record<
  BookFormat,
  { heightMm: number; widthMm: number; boardOverheadMm: number; defaultPages: number }
> = {
  hardcover: { heightMm: 236, widthMm: 158, boardOverheadMm: 7.5, defaultPages: 340 },
  'trade-paperback': { heightMm: 212, widthMm: 140, boardOverheadMm: 2.2, defaultPages: 290 },
  'mass-market': { heightMm: 176, widthMm: 108, boardOverheadMm: 1.8, defaultPages: 310 },
  quarto: { heightMm: 274, widthMm: 212, boardOverheadMm: 8.5, defaultPages: 260 },
  pocket: { heightMm: 164, widthMm: 105, boardOverheadMm: 3.0, defaultPages: 210 },
};

/**
 * Parse a dimension string such as "23.50 cm", "9.2 inches", "210 mm", or numeric cm.
 * Returns millimeters or null.
 */
export function parseDimensionToMm(value: number | string | null | undefined, defaultUnit: 'cm' | 'mm' = 'cm'): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return defaultUnit === 'cm' ? value * 10 : value;
  }
  const str = value.trim().toLowerCase();
  const match = str.match(/(\d+(?:\.\d+)?)\s*(cm|mm|in|inch|inches|")?/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = match[2] ?? defaultUnit;
  if (unit === 'mm') return num;
  if (unit === 'cm') return num * 10;
  if (unit === 'in' || unit === 'inch' || unit === 'inches' || unit === '"') return num * 25.4;
  return num * 10;
}

/**
 * Deterministic lightweight hash used only for natural slight format variation
 * when bibliographic metadata lacks format info.
 */
function deterministicHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function inferBookFormat(input: {
  categories?: string[];
  pageCount?: number | null;
  heightMm?: number | null;
  title?: string;
}): BookFormat {
  if (input.heightMm) {
    if (input.heightMm >= 260) return 'quarto';
    if (input.heightMm >= 225) return 'hardcover';
    if (input.heightMm >= 195) return 'trade-paperback';
    if (input.heightMm >= 170) return 'mass-market';
    return 'pocket';
  }

  const catText = (input.categories ?? []).join(' ').toLowerCase();
  if (/art|architecture|photography|atlas|design|cooking|cookbook|encyclopedia/.test(catText)) {
    return 'quarto';
  }
  if (/poetry|essays|philosophy|drama/.test(catText)) {
    return 'pocket';
  }
  if (/history|biography|science|reference|classics|literary/.test(catText)) {
    return 'hardcover';
  }
  if ((input.pageCount ?? 0) >= 480) {
    return 'hardcover';
  }
  const hash = deterministicHash(`${input.title ?? 'book'}-${input.pageCount ?? 0}`);
  const formats: BookFormat[] = ['hardcover', 'trade-paperback', 'hardcover', 'trade-paperback', 'mass-market'];
  return formats[hash % formats.length];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolves physical dimensions in mm.
 * - Uses verified provider measurements whenever all three dimensions are valid and realistic.
 * - Otherwise marks `source: 'estimated'`, using any partial verified dimension plus
 *   page-count thickness calculation and format-based defaults.
 */
export function resolvePhysicalDimensions(input: DimensionRawInput): PhysicalDimensions {
  const verifiedHeight = input.heightMm ?? parseDimensionToMm(input.heightCm, 'cm');
  const verifiedWidth = input.widthMm ?? parseDimensionToMm(input.widthCm, 'cm');
  const verifiedThickness = input.thicknessMm ?? parseDimensionToMm(input.thicknessCm, 'cm');

  const validHeight = verifiedHeight && verifiedHeight >= 100 && verifiedHeight <= 420 ? verifiedHeight : null;
  const validWidth = verifiedWidth && verifiedWidth >= 70 && verifiedWidth <= 350 ? verifiedWidth : null;
  const validThickness = verifiedThickness && verifiedThickness >= 4 && verifiedThickness <= 120 ? verifiedThickness : null;

  const format =
    input.format ??
    inferBookFormat({
      categories: input.categories,
      pageCount: input.pageCount,
      heightMm: validHeight,
      title: input.title,
    });

  if (validHeight && validWidth && validThickness) {
    return {
      heightMm: Math.round(validHeight),
      widthMm: Math.round(validWidth),
      thicknessMm: Math.round(validThickness),
      source: 'verified',
      format,
    };
  }

  const defaults = FORMAT_DEFAULTS_MM[format];
  const paperPerPage = clamp(
    input.paperThicknessMmPerPage ?? DEFAULT_PAPER_THICKNESS_MM_PER_PAGE,
    0.04,
    0.14
  );

  // Add subtle natural publisher trim variation (-8mm..+10mm) when height is estimated
  const seed = deterministicHash(`${input.title ?? ''}-${input.pageCount ?? 0}-${format}`);
  const heightVarianceMm = ((seed % 19) - 8);
  const widthVarianceMm = (((seed >> 4) % 13) - 6);

  const pages = input.pageCount && input.pageCount > 0 ? clamp(input.pageCount, 32, 1600) : defaults.defaultPages;

  const estimatedThickness = clamp(
    Math.round(pages * paperPerPage + defaults.boardOverheadMm),
    10,
    78
  );

  const heightMm = Math.round(validHeight ?? clamp(defaults.heightMm + heightVarianceMm, 148, 310));
  const widthMm = Math.round(validWidth ?? clamp(defaults.widthMm + widthVarianceMm, 98, 245));
  const thicknessMm = Math.round(validThickness ?? estimatedThickness);

  const reasons: string[] = [];
  if (!validThickness) {
    if (input.pageCount && input.pageCount > 0) {
      reasons.push(`thickness estimated from ${input.pageCount} pages (${paperPerPage.toFixed(3)} mm/page + cover)`);
    } else {
      reasons.push(`thickness estimated from ${format} format defaults`);
    }
  }
  if (!validHeight || !validWidth) {
    reasons.push(`height/width based on ${format} format defaults`);
  }

  return {
    heightMm,
    widthMm,
    thicknessMm,
    source: 'estimated',
    format,
    estimationNote: reasons.join('; '),
  };
}

/**
 * Maps real millimeter book dimensions to realistic visual shelf pixels,
 * applying sensible minimum/maximum constraints so thin spines remain readable
 * and tall books fit gracefully inside shelf compartments.
 */
export function dimensionsToShelfPixels(
  dimensions: PhysicalDimensions,
  compartmentHeightPx = 285
): BookShelfPixelDimensions {
  // Base scale: ~0.92 px per mm vertically, ~1.18 px per mm on spine thickness
  const maxAllowedHeight = Math.max(170, compartmentHeightPx - 28);
  const rawHeight = Math.round(dimensions.heightMm * 0.92);
  const heightPx = clamp(rawHeight, 152, Math.min(264, maxAllowedHeight));

  const rawSpine = Math.round(dimensions.thicknessMm * 1.18);
  const spineWidthPx = clamp(rawSpine, 24, 66);

  const rawDepth = Math.round(dimensions.widthMm * 0.95);
  const depthPx = clamp(rawDepth, 120, 210);

  return { heightPx, spineWidthPx, depthPx };
}

/**
 * Computes total horizontal width occupied by books in a compartment (px),
 * accounting for small natural gaps and leaning/face-out widths.
 */
export function computeOccupiedWidthPx(
  books: Array<{
    dimensions: PhysicalDimensions;
    orientation?: string;
  }>,
  compartmentHeightPx = 285
): number {
  return books.reduce((total, item) => {
    const px = dimensionsToShelfPixels(item.dimensions, compartmentHeightPx);
    if (item.orientation === 'face-out') {
      return total + Math.min(px.depthPx, 148) + 6;
    }
    if (item.orientation === 'leaning-left' || item.orientation === 'leaning-right') {
      return total + px.spineWidthPx + 18;
    }
    return total + px.spineWidthPx + 2;
  }, 0);
}

/**
 * Maximum usable inner width in pixels for a compartment given its widthRatio (0..1)
 * and the reference cabinet interior width (default 920px).
 */
export function getCompartmentCapacityPx(widthRatio: number, shelfInnerWidthPx = 920): number {
  return Math.max(150, Math.floor(shelfInnerWidthPx * widthRatio) - 24);
}
