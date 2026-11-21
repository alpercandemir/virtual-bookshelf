import {
  darkenHex,
  pickAccentForBg,
  pickReadableTextColor,
  rgbToHex,
  type BookPalette,
} from '@bookshelf/shared';

/**
 * Extracts a representative, bookbinding-harmonious color palette from a same-origin
 * (or proxied) front cover image using a downsampled offscreen canvas.
 */
export async function extractCoverPaletteFromUrl(
  proxiedUrl: string
): Promise<BookPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = window.setTimeout(() => {
      resolve(null);
    }, 4500);

    img.onload = () => {
      window.clearTimeout(timeout);
      try {
        const w = 28;
        const h = 40;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        // Quantize colors into 16-level buckets and prefer rich, non-blown-out tones
        const buckets = new Map<
          string,
          { r: number; g: number; b: number; weight: number }
        >();

        let fallbackR = 0;
        let fallbackG = 0;
        let fallbackB = 0;
        let fallbackCount = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 180) continue;

          fallbackR += r;
          fallbackG += g;
          fallbackB += b;
          fallbackCount++;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

          // Downweight pure white borders or pitch black noise
          let weight = 1;
          if (lum > 0.92 || lum < 0.06) weight = 0.12;
          else weight = 0.6 + sat * 2.2;

          const key = `${Math.floor(r / 24)}-${Math.floor(g / 24)}-${Math.floor(b / 24)}`;
          const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
          entry.r += r * weight;
          entry.g += g * weight;
          entry.b += b * weight;
          entry.weight += weight;
          buckets.set(key, entry);
        }

        if (fallbackCount === 0) {
          resolve(null);
          return;
        }

        let best: { r: number; g: number; b: number; weight: number } | null = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.weight > best.weight) {
            best = bucket;
          }
        }

        const primaryRgb = best
          ? {
              r: best.r / best.weight,
              g: best.g / best.weight,
              b: best.b / best.weight,
            }
          : {
              r: fallbackR / fallbackCount,
              g: fallbackG / fallbackCount,
              b: fallbackB / fallbackCount,
            };

        const primary = rgbToHex(primaryRgb.r, primaryRgb.g, primaryRgb.b);
        const secondary = darkenHex(primary, 0.28);
        const textColor = pickReadableTextColor(primary);
        const accent = pickAccentForBg(primary);

        resolve({
          primary,
          secondary,
          accent,
          textColor,
          source: 'cover',
        });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };

    img.src = proxiedUrl;
  });
}
