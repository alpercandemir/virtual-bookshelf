/**
 * ISBN-10 and ISBN-13 normalization, checksum validation, and conversion helpers.
 */

export function cleanIsbnInput(raw: string): string {
  return raw.replace(/[^0-9xX]/g, '').toUpperCase();
}

export function isValidIsbn10(raw: string): boolean {
  const cleaned = cleanIsbnInput(raw);
  if (!/^\d{9}[\dX]$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = cleaned[i];
    const value = ch === 'X' ? 10 : Number(ch);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(raw: string): boolean {
  const cleaned = cleanIsbnInput(raw);
  if (!/^\d{13}$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(cleaned[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(cleaned[12]);
}

export function isValidIsbn(raw: string): boolean {
  const cleaned = cleanIsbnInput(raw);
  if (cleaned.length === 10) return isValidIsbn10(cleaned);
  if (cleaned.length === 13) return isValidIsbn13(cleaned);
  return false;
}

export function isbn10To13(raw: string): string | null {
  const cleaned = cleanIsbnInput(raw);
  if (!isValidIsbn10(cleaned)) return null;
  const base = `978${cleaned.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

/**
 * Returns a canonical ISBN-13 if valid (converting ISBN-10 -> ISBN-13),
 * or null if invalid.
 */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanIsbnInput(raw);
  if (cleaned.length === 13 && isValidIsbn13(cleaned)) {
    return cleaned;
  }
  if (cleaned.length === 10 && isValidIsbn10(cleaned)) {
    return isbn10To13(cleaned);
  }
  return null;
}

/**
 * Detects if a raw search query looks like an ISBN attempt (digits/hyphens/X of length 10 or 13).
 */
export function looksLikeIsbnQuery(query: string): boolean {
  const trimmed = query.trim().replace(/^isbn[:\s-]*/i, '');
  if (!/^[\d\s-]{9,17}[xX]?$/.test(trimmed)) return false;
  const cleaned = cleanIsbnInput(trimmed);
  return cleaned.length === 10 || cleaned.length === 13;
}
