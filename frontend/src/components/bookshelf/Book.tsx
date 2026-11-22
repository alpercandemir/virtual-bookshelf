import React, { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  dimensionsToShelfPixels,
  relativeLuminance,
  resolveSpineAppearance,
  type ShelfBookDto,
} from '@bookshelf/shared';
import { getProxiedCoverUrl } from '../../api/client';
import { ProceduralCover } from './ProceduralCover';

export interface BookVisualProps {
  shelfBook: ShelfBookDto;
  compartmentHeightPx?: number;
  onSelect?: (shelfBook: ShelfBookDto) => void;
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

export const BookVisual = React.memo(function BookVisual({
  shelfBook,
  compartmentHeightPx = 285,
  onSelect,
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
    const backgrounds = [appearance.primaryColor, appearance.secondaryColor].map(relativeLuminance);
    const contrast = (color: string) => {
      const luminance = relativeLuminance(color);
      return Math.min(...backgrounds.map((bg) =>
        (Math.max(bg, luminance) + 0.05) / (Math.min(bg, luminance) + 0.05)
      ));
    };
    return [appearance.textColor, '#fff8ec', '#17100a'].reduce((best, color) =>
      contrast(best) >= 4.5 || contrast(best) >= contrast(color) ? best : color
    );
  }, [appearance, visualOverrides.textColor]);
  const darkSpineText = relativeLuminance(spineTextColor) < 0.25;

  const isHardcover = appearance.bindingStyle !== 'paperback';
  const isFaceOut = orientation === 'face-out';
  const leanAngle =
    orientation === 'leaning-left'
      ? -10
      : orientation === 'leaning-right'
        ? 10
        : appearance.microTiltDeg;

  const displayWidthPx = isFaceOut ? Math.min(px.depthPx, 146) : px.spineWidthPx;
  const coverSrc = getProxiedCoverUrl(appearance.customCoverUrl || book.coverUrl);
  const spineImageSrc = getProxiedCoverUrl(appearance.customSpineUrl);

  const wideSpine = px.spineWidthPx >= 32;
  const showMonogram = px.spineWidthPx >= 44 && px.heightPx >= 182;
  const labelHeight = px.heightPx - (showMonogram ? 38 : 24);
  const maxTitleSize = px.spineWidthPx >= 44 ? 16 : wideSpine ? 14 : 12;
  const titleLength = Math.max(1, book.title.length) * 0.63;
  const titleFontSize = Math.max(11, Math.min(maxTitleSize, labelHeight / titleLength));
  const monogram = getPublisherMonogram(book.publisher, book.title);

  const fontClass =
    appearance.fontStyle === 'sans'
      ? 'font-sans font-semibold tracking-wide'
      : appearance.fontStyle === 'display'
        ? 'font-display font-bold tracking-[0.04em]'
        : 'font-book-serif font-bold';

  const ribPositions =
    appearance.raisedBands === 5
      ? ['12%', '29%', '50%', '71%', '87%']
      : appearance.raisedBands === 4
        ? ['14%', '36%', '64%', '86%']
        : [];

  return (
    <div
      className="book-slot group"
      data-book-id={shelfBook.id}
      data-dragging={isDragging ? 'true' : undefined}
      data-arriving={isArriving ? 'true' : undefined}
      style={{
        width: `${displayWidthPx}px`,
        height: `${px.heightPx}px`,
        marginLeft: orientation === 'leaning-left' ? '10px' : undefined,
        marginRight: orientation === 'leaning-right' ? '10px' : undefined,
      }}
    >
      {/* Silk Bookmark Ribbon for Currently Reading books */}
      {visualOverrides.readingStatus === 'reading' && !isFaceOut && (
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
          className="book-hover-tooltip pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute -top-14 left-1/2 -translate-x-1/2 z-50 px-2.5 py-1.5 rounded-md bg-[#16100b]/95 border border-[#cfa55a]/40 shadow-[0_8px_20px_rgba(0,0,0,0.75)] whitespace-nowrap max-w-[240px]"
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
        data-binding={appearance.bindingStyle}
        data-testid={`book-spine-${shelfBook.id}`}
        aria-label={`${book.title}${book.authors.length ? ` by ${book.authors.join(', ')}` : ''}. Click to inspect book details.`}
        className="book-spine-button w-full h-full"
        style={{
          background: isFaceOut
            ? appearance.secondaryColor
            : `linear-gradient(180deg, ${appearance.primaryColor} 0%, ${appearance.secondaryColor} 100%)`,
          color: appearance.textColor,
          transform: isOverlay
            ? 'rotate(-2deg) scale(1.04)'
            : `rotate(${leanAngle}deg)`,
          boxShadow: isOverlay
            ? '0 24px 38px rgba(0,0,0,0.75), 0 0 0 1px rgba(232,196,120,0.45)'
            : undefined,
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
        ) : (
          /* Standard Physical Standing Book Spine */
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

            {/* Hardcover Headband Cap (stitched silk band at crown of spine) */}
            {isHardcover && (
              <div
                className="book-headband-cap"
                style={{
                  background: `repeating-linear-gradient(90deg, ${appearance.headbandColor} 0px, ${appearance.headbandColor} 2px, #ede2cc 2px, #ede2cc 4px)`,
                }}
              />
            )}

            {/* Decorative Editorial Top/Bottom Bands */}
            {!spineImageSrc && appearance.motif === 'editorial-stripe' && (
              <>
                <div
                  className="pointer-events-none absolute top-3 left-0 right-0 h-2.5 z-3 opacity-85"
                  style={{ backgroundColor: appearance.accentColor }}
                />
                <div
                  className="pointer-events-none absolute bottom-4 left-0 right-0 h-2.5 z-3 opacity-85"
                  style={{ backgroundColor: appearance.accentColor }}
                />
              </>
            )}

            {/* Gilt Inset Cartouche Frame */}
            {!spineImageSrc && appearance.motif === 'gilt-frame' && (
              <div
                className="pointer-events-none absolute inset-x-[4px] inset-y-[10px] z-3 rounded-[1px]"
                style={{
                  border: `1px solid ${appearance.accentColor}7a`,
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
              (appearance.motif === 'classic-bands' ||
                appearance.motif === 'minimal-modern') && (
                <>
                  <div
                    className="pointer-events-none absolute top-[9%] left-[4px] right-[4px] h-[1px] z-3 opacity-75"
                    style={{ backgroundColor: appearance.accentColor }}
                  />
                  <div
                    className="pointer-events-none absolute bottom-[10%] left-[4px] right-[4px] h-[1px] z-3 opacity-75"
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

            {/* Spine Typography (Hidden when user uploaded a custom spine image) */}
            {!spineImageSrc && (
              <div
                className="book-spine-text-wrap"
                data-dark-text={darkSpineText || undefined}
                style={{ color: spineTextColor }}
              >
                <div className="book-spine-title-area">
                  <span
                    className={`book-spine-vertical-title ${fontClass}`}
                    style={{ fontSize: titleFontSize }}
                  >
                    {book.title}
                  </span>
                </div>
                {showMonogram && (
                  <span
                    className="text-[7px] font-display font-bold tracking-widest opacity-75 shrink-0"
                    style={{ color: appearance.accentColor }}
                  >
                    {monogram}
                  </span>
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
  isArriving?: boolean;
}

export const SortableBook = React.memo(function SortableBook({
  shelfBook,
  compartmentHeightPx,
  onSelect,
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
        isDragging={isDragging}
        isArriving={isArriving}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
});
