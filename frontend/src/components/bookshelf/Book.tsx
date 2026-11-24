import React, { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  dimensionsToShelfPixels,
  getStackedBookWidthPx,
  relativeLuminance,
  resolveSpineAppearance,
  type ShelfBookDto,
} from '@bookshelf/shared';
import { getProxiedCoverUrl } from '../../api/client';
import { parseAuthorNameForLastNameSort } from '../../utils/shelfSorting';
import { ProceduralCover } from './ProceduralCover';

export type ShelfSpotlightMode =
  | 'all'
  | 'reading'
  | 'finished'
  | 'unread'
  | 'favorites'
  | 'notes';

export function matchesSpotlight(
  shelfBook: ShelfBookDto,
  spotlight: ShelfSpotlightMode
): boolean {
  if (spotlight === 'all') return true;
  const status = shelfBook.visualOverrides.readingStatus ?? 'unread';
  if (spotlight === 'reading') return status === 'reading';
  if (spotlight === 'finished') return status === 'finished';
  if (spotlight === 'unread') return status === 'unread';
  if (spotlight === 'favorites') return (shelfBook.visualOverrides.rating ?? 0) >= 4;
  if (spotlight === 'notes') return Boolean(shelfBook.visualOverrides.notes?.trim());
  return true;
}

export interface BookVisualProps {
  shelfBook: ShelfBookDto;
  compartmentHeightPx?: number;
  onSelect?: (shelfBook: ShelfBookDto) => void;
  onContextMenuBook?: (
    shelfBook: ShelfBookDto,
    coords: { x: number; y: number }
  ) => void;
  spotlight?: ShelfSpotlightMode;
  isDragging?: boolean;
  isOverlay?: boolean;
  isArriving?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

function getPublisherMonogram(publisher: string | null, title: string): string {
  const src = (publisher || title || 'L').trim();
  const letters = src
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|of|and|a|an)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return letters || src.slice(0, 1).toUpperCase();
}

function pickHighContrastText(
  preferred: string,
  backgrounds: string[]
): string {
  const bgLums = backgrounds.map(relativeLuminance);
  const contrast = (color: string) => {
    const lum = relativeLuminance(color);
    return Math.min(
      ...bgLums.map(
        (bg) => (Math.max(bg, lum) + 0.05) / (Math.min(bg, lum) + 0.05)
      )
    );
  };
  return [preferred, '#fff8ec', '#17100a'].reduce((best, color) =>
    contrast(best) >= 4.5 || contrast(best) >= contrast(color) ? best : color
  );
}

export const BookVisual = React.memo(function BookVisual({
  shelfBook,
  compartmentHeightPx = 285,
  onSelect,
  onContextMenuBook,
  spotlight = 'all',
  isDragging = false,
  isOverlay = false,
  isArriving = false,
  dragHandleProps,
}: BookVisualProps) {
  const { book, visualOverrides, orientation } = shelfBook;
  const [coverImgFailed, setCoverImgFailed] = useState(false);

  const px = useMemo(
    () => dimensionsToShelfPixels(book.physicalDimensions, compartmentHeightPx),
    [book.physicalDimensions, compartmentHeightPx]
  );

  const appearance = useMemo(
    () =>
      resolveSpineAppearance({
        id: book.id,
        title: book.title,
        authors: book.authors,
        format: book.physicalDimensions.format,
        categories: book.metadata.categories,
        palette: book.metadata.palette,
        metadataBindingStyle: book.metadata.bindingStyle,
        overrides: visualOverrides,
      }),
    [book, visualOverrides]
  );

  const spineTextColor = useMemo(() => {
    if (visualOverrides.textColor) return visualOverrides.textColor;
    return pickHighContrastText(appearance.textColor, [
      appearance.primaryColor,
      appearance.secondaryColor,
    ]);
  }, [appearance, visualOverrides.textColor]);

  const patchTextColor = useMemo(
    () =>
      pickHighContrastText(appearance.patchTextColor, [appearance.patchColor]),
    [appearance.patchColor, appearance.patchTextColor]
  );

  const darkSpineText = relativeLuminance(spineTextColor) < 0.25;
  const darkPatchText = relativeLuminance(patchTextColor) < 0.25;

  const isHardcover = appearance.bindingStyle !== 'paperback';
  const isFaceOut = orientation === 'face-out';
  const isStacked = orientation === 'stacked';

  const leanAngle =
    orientation === 'leaning-left'
      ? -10
      : orientation === 'leaning-right'
        ? 10
        : isStacked
          ? 0
          : appearance.microTiltDeg;

  const displayWidthPx = isStacked
    ? getStackedBookWidthPx(px.heightPx)
    : isFaceOut
      ? Math.min(px.depthPx, 146)
      : px.spineWidthPx;
  const displayHeightPx = isStacked
    ? Math.max(28, Math.min(54, px.spineWidthPx))
    : px.heightPx;

  const coverSrc = getProxiedCoverUrl(appearance.customCoverUrl || book.coverUrl);
  const spineImageSrc = getProxiedCoverUrl(appearance.customSpineUrl);

  const authorSurname = useMemo(() => {
    const primary = book.authors.find((author) => author.trim().length > 0);
    if (!primary) return '';
    return parseAuthorNameForLastNameSort(primary).lastName;
  }, [book.authors]);

  const words = useMemo(() => book.title.trim().split(/\s+/), [book.title]);
  const longestWordLen = useMemo(
    () => words.reduce((max, w) => Math.max(max, w.length), 0),
    [words]
  );

  // Wide spines with compact words read naturally HORIZONTALLY like real hardcovers
  // Require enough horizontal room so the longest word never splits mid-letter
  const horizAvailW = Math.max(20, px.spineWidthPx - 12);
  const horizWordFontSize = horizAvailW / (Math.max(3, longestWordLen) * 0.72);
  const useHorizontalTitle =
    !isStacked &&
    !isFaceOut &&
    px.spineWidthPx >= 44 &&
    longestWordLen <= 9 &&
    book.title.length <= 26 &&
    horizWordFontSize >= 8.2;

  // Long titles on spines >= 29px wrap cleanly onto 2 vertical columns instead of truncating with "..."
  const useTwoColVertical =
    !isStacked &&
    !isFaceOut &&
    !useHorizontalTitle &&
    px.spineWidthPx >= 29 &&
    book.title.length > 17;

  const wideSpine = px.spineWidthPx >= 32;
  const innerHeight = Math.max(96, px.heightPx - 24);
  const maxAuthorAreaHeight = Math.floor(innerHeight * 0.34);

  // Author surname sizing — dynamically fitted so even long names (DOSTOEVSKY, BRINGHURST) never show "..."
  const useHorizontalAuthor =
    !isStacked &&
    px.spineWidthPx >= 44 &&
    authorSurname.length <= 8;

  const authorFontSize = useMemo(() => {
    if (!authorSurname) return 9;
    if (isStacked) {
      return Math.max(7.5, Math.min(10, (displayHeightPx - 8) * 0.34));
    }
    if (useHorizontalAuthor) {
      return Math.max(
        6.5,
        Math.min(9.5, (px.spineWidthPx - 10) / (Math.max(1, authorSurname.length) * 0.68))
      );
    }
    const maxAuthorSize = px.spineWidthPx >= 44 ? 9.5 : wideSpine ? 8.8 : 8;
    return Math.max(
      6.4,
      Math.min(
        maxAuthorSize,
        maxAuthorAreaHeight / (Math.max(1, authorSurname.length) * 0.68)
      )
    );
  }, [
    authorSurname,
    displayHeightPx,
    isStacked,
    maxAuthorAreaHeight,
    px.spineWidthPx,
    useHorizontalAuthor,
    wideSpine,
  ]);

  const estimatedAuthorHeight = authorSurname
    ? useHorizontalAuthor
      ? 18
      : Math.min(
          maxAuthorAreaHeight,
          Math.ceil(authorSurname.length * authorFontSize * 0.68) + 6
        )
    : 0;

  const showMonogram =
    !isStacked &&
    px.spineWidthPx >= 36 &&
    px.heightPx >= 176 &&
    (appearance.archetype === 'editorial-block' ||
      appearance.archetype === 'author-top' ||
      !authorSurname);

  const labelHeight = Math.max(
    54,
    innerHeight -
      (authorSurname ? estimatedAuthorHeight + 12 : 0) -
      (showMonogram ? 14 : 0)
  );

  // Zero-ellipsis title sizing
  const titleFontSize = useMemo(() => {
    if (isStacked) {
      const availW = displayWidthPx - (authorSurname ? 66 : 24);
      const maxH = Math.min(13.5, displayHeightPx * 0.44);
      return Math.max(
        8.5,
        Math.min(maxH, availW / (Math.max(1, book.title.length) * 0.56))
      );
    }
    if (useHorizontalTitle) {
      const lineCount = Math.min(4, Math.max(1, Math.ceil(book.title.length / 7)));
      const byHeight = (labelHeight * 0.72) / (lineCount * 1.18);
      return Math.max(8, Math.min(15, horizWordFontSize, byHeight));
    }
    const maxTitleSize = px.spineWidthPx >= 44 ? 14.5 : wideSpine ? 13 : 11;
    const effectiveChars = useTwoColVertical
      ? Math.ceil(book.title.length / 1.85)
      : book.title.length;
    const widthCap = useTwoColVertical
      ? Math.max(8, (px.spineWidthPx - 10) / 2.35)
      : Math.max(8.5, px.spineWidthPx - 10);
    return Math.max(
      7.6,
      Math.min(
        maxTitleSize,
        widthCap,
        labelHeight / (Math.max(1, effectiveChars) * 0.58)
      )
    );
  }, [
    authorSurname,
    book.title.length,
    displayHeightPx,
    displayWidthPx,
    horizWordFontSize,
    isStacked,
    labelHeight,
    px.spineWidthPx,
    useHorizontalTitle,
    useTwoColVertical,
    wideSpine,
  ]);

  const monogram = getPublisherMonogram(book.publisher, book.title);

  const fontClass =
    appearance.fontStyle === 'sans'
      ? 'font-sans font-semibold tracking-wide'
      : appearance.fontStyle === 'display'
        ? 'font-display font-bold tracking-[0.03em]'
        : 'font-book-serif font-bold';

  const hasPatch =
    !spineImageSrc &&
    !isStacked &&
    appearance.archetype === 'heritage-patch' &&
    px.spineWidthPx >= 30;

  const isEditorialBlock =
    !spineImageSrc && appearance.archetype === 'editorial-block';
  const isAuthorTop = !isStacked && appearance.archetype === 'author-top';
  const isMinimalModern = appearance.archetype === 'modern-minimal';

  // Position raised leather ribs so they frame the patch instead of slicing through letters
  const ribPositions =
    hasPatch
      ? ['9%', '56%', '73%', '89%']
      : appearance.raisedBands === 5
        ? ['10%', '26%', '50%', '74%', '89%']
        : appearance.raisedBands === 4
          ? ['12%', '34%', '66%', '88%']
          : [];

  // Subtle physical depth shadow variance from real depth (widthMm)
  const depthFactor = Math.max(
    0,
    Math.min(1, (book.physicalDimensions.widthMm - 105) / 105)
  );

  const spotlightState =
    spotlight === 'all'
      ? undefined
      : matchesSpotlight(shelfBook, spotlight)
        ? 'match'
        : 'dim';

  const isFiveStar = (visualOverrides.rating ?? 0) === 5;

  return (
    <div
      className="book-slot group"
      data-book-id={shelfBook.id}
      data-orientation={orientation}
      data-spotlight={spotlightState}
      data-dragging={isDragging ? 'true' : undefined}
      data-arriving={isArriving ? 'true' : undefined}
      style={{
        width: `${displayWidthPx}px`,
        height: `${displayHeightPx}px`,
        marginLeft: orientation === 'leaning-left' ? '10px' : undefined,
        marginRight: orientation === 'leaning-right' ? '10px' : undefined,
      }}
    >
      {/* Silk Bookmark Ribbon for Currently Reading books */}
      {visualOverrides.readingStatus === 'reading' && !isFaceOut && !isStacked && (
        <div
          className="book-bookmark-ribbon"
          aria-hidden="true"
          title="Currently Reading"
        />
      )}

      {/* Subtle Hover Tooltip above Book */}
      {!isOverlay && !isDragging && (
        <div
          role="tooltip"
          className="book-hover-tooltip pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute -top-14 left-1/2 -translate-x-1/2 z-50 px-2.5 py-1.5 rounded-lg bg-[#16100b]/95 border border-[#cfa55a]/40 shadow-[0_10px_24px_rgba(0,0,0,0.75)] whitespace-nowrap max-w-[260px]"
        >
          <p className="text-xs font-medium text-[#f7ecd8] truncate">{book.title}</p>
          <div className="flex items-center gap-2 text-[10px] text-[#c3ae90]">
            {book.authors.length > 0 && (
              <span className="truncate">{book.authors.join(', ')}</span>
            )}
            {visualOverrides.readingStatus === 'reading' && (
              <span className="text-[#f08b94] font-semibold shrink-0">● Reading</span>
            )}
            {visualOverrides.readingStatus === 'finished' && (
              <span className="text-[#8ad3a6] font-semibold shrink-0">✓ Finished</span>
            )}
            {visualOverrides.rating && (
              <span className="text-[#e5be72] shrink-0">
                {'★'.repeat(visualOverrides.rating)}
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onSelect?.(shelfBook)}
        onContextMenu={(e) => {
          if (!onContextMenuBook || isOverlay) return;
          e.preventDefault();
          onContextMenuBook(shelfBook, { x: e.clientX, y: e.clientY });
        }}
        data-binding={appearance.bindingStyle}
        data-archetype={appearance.archetype}
        data-stacked={isStacked ? 'true' : undefined}
        data-testid={`book-spine-${shelfBook.id}`}
        aria-label={`${book.title}${book.authors.length ? ` by ${book.authors.join(', ')}` : ''}. Click to inspect book details.`}
        className="book-spine-button w-full h-full"
        style={{
          background: isFaceOut
            ? appearance.secondaryColor
            : isStacked
              ? `linear-gradient(90deg, ${appearance.secondaryColor} 0%, ${appearance.primaryColor} 18%, ${appearance.primaryColor} 82%, ${appearance.secondaryColor} 100%)`
              : `linear-gradient(180deg, ${appearance.primaryColor} 0%, ${appearance.secondaryColor} 100%)`,
          color: spineTextColor,
          transform: isOverlay
            ? 'rotate(-2deg) scale(1.04)'
            : leanAngle !== 0
              ? `rotate(${leanAngle}deg)`
              : undefined,
          boxShadow: isOverlay
            ? '0 24px 38px rgba(0,0,0,0.75), 0 0 0 1px rgba(232,196,120,0.45)'
            : isStacked
              ? '0 3px 6px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 3px rgba(0,0,0,0.45)'
              : `-2px 0 ${4 + Math.round(depthFactor * 4)}px rgba(0,0,0,0.48), ${2 + Math.round(depthFactor * 3)}px 2px ${7 + Math.round(depthFactor * 5)}px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.42)`,
        }}
        {...(dragHandleProps ?? {})}
      >
        {isFaceOut ? (
          /* Face-out Book Display Mode */
          <div className="relative w-full h-full overflow-hidden">
            {coverSrc && !coverImgFailed ? (
              <img
                src={coverSrc}
                alt={`Cover of ${book.title}`}
                loading="lazy"
                onError={() => setCoverImgFailed(true)}
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
                compact
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(0,0,0,0.34) 0%, rgba(255,255,255,0.14) 6%, transparent 16%, transparent 93%, rgba(0,0,0,0.28) 100%)',
              }}
            />
          </div>
        ) : isStacked ? (
          /* Horizontal Lying Stacked Book Spine */
          <>
            {spineImageSrc && (
              <img
                src={spineImageSrc}
                alt=""
                aria-hidden="true"
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

            {/* Subtle horizontal cylindrical shading */}
            <div className="book-spine-lighting-horizontal" />

            {/* Subtle cream fore-edge page peek on right side */}
            <div className="book-stacked-pages-edge" aria-hidden="true" />

            {!spineImageSrc && (
              <div
                className="book-spine-stacked-wrap"
                data-dark-text={darkSpineText || undefined}
                style={{ color: spineTextColor }}
              >
                <div className="book-spine-title-area !items-start">
                  <span
                    className={`book-spine-horizontal-title ${fontClass}`}
                    style={{ fontSize: titleFontSize }}
                  >
                    {book.title}
                  </span>
                </div>
                {authorSurname && (
                  <div className="book-spine-author-area !w-auto !max-h-none shrink-0 pl-2">
                    <span
                      className="book-spine-author-surname font-sans"
                      data-testid="book-spine-author-surname"
                      style={{ fontSize: authorFontSize }}
                    >
                      {authorSurname}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Standing Physical Book Spine with Typographic Archetypes */
          <>
            {/* Optional User Custom Spine Artwork */}
            {spineImageSrc && (
              <img
                src={spineImageSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover z-1"
              />
            )}

            {/* Material Binding Textures */}
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

            {/* Subtle Recessed Silk Headband for Hardcovers (never loud zebra barcode) */}
            {isHardcover && (
              <div
                className="book-headband-cap"
                style={{
                  background: `repeating-linear-gradient(90deg, ${appearance.headbandColor} 0px, ${appearance.headbandColor} 1.5px, rgba(235, 224, 200, 0.55) 1.5px, rgba(235, 224, 200, 0.55) 3px)`,
                }}
              />
            )}

            {/* Editorial Color-Block Archetype (Penguin / Faber / Vintage style) */}
            {isEditorialBlock && (
              <>
                <div
                  className="pointer-events-none absolute top-0 left-0 right-0 h-[10%] z-2 opacity-90"
                  style={{
                    backgroundColor: appearance.secondaryColor,
                    borderBottom: `1.5px solid ${appearance.accentColor}99`,
                  }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-[11%] z-2 opacity-90"
                  style={{
                    backgroundColor: appearance.secondaryColor,
                    borderTop: `1.5px solid ${appearance.accentColor}99`,
                  }}
                />
              </>
            )}

            {/* Gilt Inset Cartouche Frame (when not using leather patch) */}
            {!spineImageSrc && !hasPatch && appearance.motif === 'gilt-frame' && (
              <div
                className="pointer-events-none absolute inset-x-[4px] inset-y-[9px] z-3 rounded-[1px]"
                style={{
                  border: `1px solid ${appearance.accentColor}68`,
                }}
              />
            )}

            {/* Raised Leather Binding Ribs / Bands */}
            {!spineImageSrc &&
              ribPositions.map((topPct) => (
                <div
                  key={topPct}
                  className="book-raised-rib"
                  style={{ top: topPct }}
                />
              ))}

            {/* Delicate Gilt Horizontal Fillet Lines */}
            {!spineImageSrc &&
              !isEditorialBlock &&
              (appearance.motif === 'classic-bands' ||
                appearance.motif === 'minimal-modern') && (
                <>
                  <div
                    className="pointer-events-none absolute top-[5.5%] left-[4px] right-[4px] h-[1px] z-3 opacity-65"
                    style={{ backgroundColor: appearance.accentColor }}
                  />
                  <div
                    className="pointer-events-none absolute bottom-[5.5%] left-[4px] right-[4px] h-[1px] z-3 opacity-65"
                    style={{ backgroundColor: appearance.accentColor }}
                  />
                </>
              )}

            {/* Cylindrical 3D Curvature Lighting */}
            <div className="book-spine-lighting" />

            {/* Hardcover French Joint Hinge Grooves vs Paperback Reading Crease */}
            {isHardcover ? (
              <div className="book-hinge-grooves" />
            ) : (
              <div className="book-paperback-crease" />
            )}

            {/* Spine Typography (Zero-ellipsis, archetype-aware) */}
            {!spineImageSrc && (
              <div
                className="book-spine-text-wrap"
                data-dark-text={darkSpineText || undefined}
                data-author-top={isAuthorTop ? 'true' : undefined}
                style={{ color: spineTextColor }}
              >
                {/* Author-at-top layout variant */}
                {isAuthorTop && authorSurname && (
                  <div className="book-spine-author-area">
                    <span
                      className={`${
                        useHorizontalAuthor
                          ? 'book-spine-horizontal-author'
                          : 'book-spine-vertical-author'
                      } book-spine-author-surname font-sans`}
                      data-testid="book-spine-author-surname"
                      style={{ fontSize: authorFontSize }}
                    >
                      {authorSurname}
                    </span>
                  </div>
                )}

                {/* Title Area — optionally nestled in a contrasting Leather/Parchment Title Patch */}
                <div
                  className={`book-spine-title-area ${
                    hasPatch ? 'book-spine-title-patch' : ''
                  }`}
                  data-dark-text={
                    hasPatch
                      ? darkPatchText || undefined
                      : darkSpineText || undefined
                  }
                  style={
                    hasPatch
                      ? {
                          backgroundColor: appearance.patchColor,
                          color: patchTextColor,
                          borderColor: `${appearance.accentColor}99`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={`${
                      useHorizontalTitle
                        ? 'book-spine-horizontal-title'
                        : useTwoColVertical
                          ? 'book-spine-vertical-title-wrap'
                          : 'book-spine-vertical-title'
                    } ${fontClass}`}
                    style={{ fontSize: titleFontSize }}
                  >
                    {book.title}
                  </span>
                </div>

                {/* Classic subtle divider (omitted for minimal-modern, patch, or author-top) */}
                {!isAuthorTop &&
                  !hasPatch &&
                  !isMinimalModern &&
                  authorSurname && (
                    <span
                      className="book-spine-divider"
                      aria-hidden="true"
                      style={{ backgroundColor: appearance.accentColor }}
                    />
                  )}

                {/* Author-at-bottom layout variant */}
                {!isAuthorTop && authorSurname && (
                  <div className="book-spine-author-area">
                    <span
                      className={`${
                        useHorizontalAuthor
                          ? 'book-spine-horizontal-author'
                          : 'book-spine-vertical-author'
                      } book-spine-author-surname font-sans`}
                      data-testid="book-spine-author-surname"
                      style={{ fontSize: authorFontSize }}
                    >
                      {authorSurname}
                    </span>
                  </div>
                )}

                {/* Publisher Imprint Colophon / 5-Star Gold Filigree */}
                {(showMonogram || isFiveStar) && (
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {isFiveStar && (
                      <span
                        aria-hidden="true"
                        className="text-[7px] leading-none"
                        style={{ color: appearance.accentColor }}
                      >
                        ★
                      </span>
                    )}
                    {showMonogram && (
                      <span
                        className="text-[6.5px] font-display font-bold tracking-[0.14em] opacity-75 leading-none"
                        style={{ color: appearance.accentColor }}
                      >
                        {monogram}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
});

export interface SortableBookProps {
  shelfBook: ShelfBookDto;
  compartmentHeightPx: number;
  onSelect: (shelfBook: ShelfBookDto) => void;
  onContextMenuBook?: (
    shelfBook: ShelfBookDto,
    coords: { x: number; y: number }
  ) => void;
  spotlight?: ShelfSpotlightMode;
  isArriving?: boolean;
}

export const SortableBook = React.memo(function SortableBook({
  shelfBook,
  compartmentHeightPx,
  onSelect,
  onContextMenuBook,
  spotlight = 'all',
  isArriving = false,
}: SortableBookProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: shelfBook.id,
    data: {
      type: 'book',
      shelfBook,
      compartmentId: shelfBook.compartmentId,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition || 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    zIndex: isDragging ? 40 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="shrink-0">
      <BookVisual
        shelfBook={shelfBook}
        compartmentHeightPx={compartmentHeightPx}
        onSelect={onSelect}
        onContextMenuBook={onContextMenuBook}
        spotlight={spotlight}
        isDragging={isDragging}
        isArriving={isArriving}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
});
