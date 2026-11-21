import { describe, expect, it } from 'vitest';
import {
  dimensionsToShelfPixels,
  isValidIsbn10,
  isValidIsbn13,
  looksLikeIsbnQuery,
  normalizeIsbn,
  resolvePhysicalDimensions,
  resolveSpineAppearance,
} from '../index.js';

describe('ISBN helpers', () => {
  it('validates ISBN-10 and ISBN-13 checksums', () => {
    expect(isValidIsbn10('0-306-40615-2')).toBe(true);
    expect(isValidIsbn10('0-439-42089-X')).toBe(true);
    expect(isValidIsbn10('0-306-40615-9')).toBe(false);

    expect(isValidIsbn13('978-0-441-17271-9')).toBe(true);
    expect(isValidIsbn13('978-0-441-17271-0')).toBe(false);
  });

  it('normalizes valid ISBN-10 to ISBN-13 and rejects invalid strings', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normalizeIsbn('978-0-14-143951-8')).toBe('9780141439518');
    expect(normalizeIsbn('not-an-isbn')).toBeNull();
    expect(looksLikeIsbnQuery('ISBN 978-0-14-143951-8')).toBe(true);
    expect(looksLikeIsbnQuery('Frank Herbert')).toBe(false);
  });
});

describe('Physical dimensions resolution', () => {
  it('marks complete provider measurements as verified', () => {
    const dims = resolvePhysicalDimensions({
      heightCm: '23.5 cm',
      widthCm: '15.8 cm',
      thicknessCm: '3.6 cm',
      pageCount: 420,
    });
    expect(dims.source).toBe('verified');
    expect(dims.heightMm).toBe(235);
    expect(dims.widthMm).toBe(158);
    expect(dims.thicknessMm).toBe(36);
  });

  it('estimates thickness from page count and never marks estimates as verified', () => {
    const thin = resolvePhysicalDimensions({ pageCount: 140, format: 'trade-paperback', title: 'Thin Book' });
    const thick = resolvePhysicalDimensions({ pageCount: 920, format: 'hardcover', title: 'Thick Book' });

    expect(thin.source).toBe('estimated');
    expect(thick.source).toBe('estimated');
    expect(thick.thicknessMm).toBeGreaterThan(thin.thicknessMm);
    expect(thick.estimationNote).toContain('920 pages');

    const thinPx = dimensionsToShelfPixels(thin);
    const thickPx = dimensionsToShelfPixels(thick);
    expect(thickPx.spineWidthPx).toBeGreaterThan(thinPx.spineWidthPx);
    expect(thinPx.spineWidthPx).toBeGreaterThanOrEqual(24);
    expect(thickPx.spineWidthPx).toBeLessThanOrEqual(66);
  });
});

describe('Spine appearance resolver', () => {
  it('respects user overrides and picks readable ink automatically', () => {
    const lightOverride = resolveSpineAppearance({
      id: 'b1',
      title: 'Invisible Cities',
      authors: ['Italo Calvino'],
      format: 'pocket',
      overrides: { spineColor: '#EAE0CC' },
    });
    expect(lightOverride.primaryColor).toBe('#EAE0CC');
    expect(lightOverride.textColor).toBe('#1F1915');

    const darkOverride = resolveSpineAppearance({
      id: 'b2',
      title: 'Dune',
      authors: ['Frank Herbert'],
      format: 'hardcover',
      overrides: { spineColor: '#1E2A40' },
    });
    expect(darkOverride.textColor).toBe('#F4E9D5');
  });
});
