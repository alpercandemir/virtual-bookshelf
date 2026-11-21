import React from 'react';
import type { ResolvedSpineAppearance } from '@bookshelf/shared';

interface ProceduralCoverProps {
  title: string;
  subtitle?: string | null;
  authors: string[];
  publisher?: string | null;
  publicationDate?: string | null;
  appearance: ResolvedSpineAppearance;
  compact?: boolean;
}

/**
 * Renders an authentic, embossed cloth/leather/editorial front book cover
 * whenever a real photographic cover image is unavailable or fails to load.
 */
export const ProceduralCover = React.memo(function ProceduralCover({
  title,
  subtitle,
  authors,
  publisher,
  publicationDate,
  appearance,
  compact = false,
}: ProceduralCoverProps) {
  const isLeather = appearance.bindingStyle === 'hardcover-leather';
  const isCloth =
    appearance.bindingStyle === 'hardcover-cloth' ||
    appearance.bindingStyle === 'vintage-linen';

  const year = publicationDate ? publicationDate.slice(0, 4) : null;

  return (
    <div
      className="relative w-full h-full flex flex-col justify-between overflow-hidden select-none"
      style={{
        background: `linear-gradient(155deg, ${appearance.primaryColor} 0%, ${appearance.secondaryColor} 100%)`,
        color: appearance.textColor,
      }}
    >
      {/* Binding texture */}
      {isCloth && <div className="book-texture-linen" />}
      {isLeather && <div className="book-texture-leather" />}

      {/* Subtle cover lighting & book hinge shadow on left */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(255,255,255,0.14) 5%, rgba(0,0,0,0.08) 9%, transparent 16%, transparent 92%, rgba(0,0,0,0.22) 100%), linear-gradient(180deg, rgba(255,245,220,0.12) 0%, transparent 25%, rgba(0,0,0,0.25) 100%)',
        }}
      />

      {/* Decorative Gilt / Editorial Frame */}
      <div
        className={`relative z-20 flex-1 flex flex-col justify-between overflow-hidden ${
          compact ? 'm-1.5 p-1.5' : 'm-3.5 p-4'
        }`}
        style={{
          border: `1px solid ${appearance.accentColor}88`,
          boxShadow: `inset 0 0 0 2px ${appearance.primaryColor}, inset 0 0 0 3px ${appearance.accentColor}44`,
        }}
      >
        {/* Top ornament & author */}
        <div className="text-center">
          <div
            className={`mx-auto h-[1px] opacity-75 ${compact ? 'mb-1 w-6' : 'mb-2 w-10'}`}
            style={{ backgroundColor: appearance.accentColor }}
          />
          {authors.length > 0 && (
            <p
              className={`uppercase tracking-[0.14em] opacity-85 truncate ${
                compact ? 'text-[6.5px]' : 'text-[10px]'
              }`}
            >
              {authors[0]}
            </p>
          )}
        </div>

        {/* Center Title Block */}
        <div className="text-center my-auto px-0.5 overflow-hidden">
          <h3
            className={`leading-tight font-semibold ${
              appearance.fontStyle === 'sans'
                ? 'font-sans tracking-tight'
                : 'font-display'
            } ${compact ? 'text-[10.5px] line-clamp-3' : 'text-2xl line-clamp-4 break-words'}`}
            style={{
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {title}
          </h3>
          {!compact && subtitle && (
            <p className="mt-1.5 text-xs italic opacity-80 line-clamp-2 font-book-serif">
              {subtitle}
            </p>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 opacity-80">
            <span
              className="h-[1px] w-5"
              style={{ backgroundColor: appearance.accentColor }}
            />
            <span
              className="inline-block w-1.5 h-1.5 rotate-45"
              style={{ backgroundColor: appearance.accentColor }}
            />
            <span
              className="h-[1px] w-5"
              style={{ backgroundColor: appearance.accentColor }}
            />
          </div>
        </div>

        {/* Bottom publisher imprint */}
        <div className="text-center">
          <p
            className={`uppercase tracking-[0.16em] opacity-70 truncate ${
              compact ? 'text-[7px]' : 'text-[9px]'
            }`}
          >
            {publisher || 'Library Edition'}
            {year ? ` · ${year}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
});
