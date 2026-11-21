import type {
  BindingStyle,
  BookFormat,
  BookPalette,
  BookVisualOverrides,
  SpineFontStyle,
  SpineMotif,
} from './types.js';

export interface CuratedPalette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  textColor: string;
}

/**
 * Rich heritage bookbinding color palettes inspired by antique cloth, morocco leather,
 * Penguin/Everyman editions, and contemporary literary publishers.
 */
export const CURATED_BOOK_PALETTES: CuratedPalette[] = [
  { name: 'Oxblood Leather', primary: '#5A1F24', secondary: '#3B1216', accent: '#D8B46A', textColor: '#F3DFB1' },
  { name: 'Forest Buckram', primary: '#1F3D31', secondary: '#142921', accent: '#D4B06A', textColor: '#EFE4C8' },
  { name: 'Prussian Navy', primary: '#1E2F47', secondary: '#132033', accent: '#D6B676', textColor: '#EFE9D9' },
  { name: 'Aged Ochre', primary: '#9A6B2F', secondary: '#704B1D', accent: '#2E1E0F', textColor: '#FAF2E1' },
  { name: 'Linen Parchment', primary: '#DDD2BC', secondary: '#C4B699', accent: '#7B2F26', textColor: '#2B2118' },
  { name: 'Burgundy Cloth', primary: '#6E2634', secondary: '#4C1822', accent: '#E2C385', textColor: '#F8ECD5' },
  { name: 'Slate Indigo', primary: '#324256', secondary: '#212D3C', accent: '#CEB489', textColor: '#F0ECE3' },
  { name: 'Burnt Terracotta', primary: '#9B482B', secondary: '#73321C', accent: '#EFE0C4', textColor: '#FCF3E6' },
  { name: 'Antique Olive', primary: '#495234', secondary: '#333A23', accent: '#D8BD82', textColor: '#F3ECD8' },
  { name: 'Charcoal Folio', primary: '#2B2B2D', secondary: '#1B1B1D', accent: '#D4AF6A', textColor: '#EFE7D6' },
  { name: 'Saffron Cloth', primary: '#B37A29', secondary: '#87591B', accent: '#231A12', textColor: '#1E150E' },
  { name: 'Plum Morocco', primary: '#47283D', secondary: '#2F1928', accent: '#DFBE7E', textColor: '#F5E7CF' },
  { name: 'Teal Library', primary: '#234C54', secondary: '#17343A', accent: '#DEC186', textColor: '#F2EFE6' },
  { name: 'Cream Classic', primary: '#E8DFCF', secondary: '#D0C4AE', accent: '#283A4E', textColor: '#211D18' },
  { name: 'Chestnut Calf', primary: '#6B3E26', secondary: '#4A2918', accent: '#DFBA74', textColor: '#F6E8CC' },
  { name: 'Muted Sage', primary: '#5E7264', secondary: '#425247', accent: '#EFE6D1', textColor: '#FAF6EC' },
];

export interface ResolvedSpineAppearance {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  headbandColor: string;
  bindingStyle: BindingStyle;
  motif: SpineMotif;
  fontStyle: SpineFontStyle;
  /** Subtle organic hand-shelved micro-tilt (-0.45deg..+0.45deg) */
  microTiltDeg: number;
  /** Subtle scuff/patina intensity 0..1 */
  patina: number;
  /** Number of raised leather bands on spine (0, 4, or 5) */
  raisedBands: number;
  customCoverUrl: string | null;
  customSpineUrl: string | null;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.2;
  const convert = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

export function darkenHex(hex: string, amount = 0.26): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#1f1a17';
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
}

export function lightenHex(hex: string, amount = 0.2): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#e5dccb';
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount
  );
}

export function pickReadableTextColor(bgHex: string): string {
  const lum = relativeLuminance(bgHex);
  return lum > 0.38 ? '#1F1915' : '#F4E9D5';
}

export function pickAccentForBg(bgHex: string): string {
  const lum = relativeLuminance(bgHex);
  return lum > 0.38 ? '#6E3224' : '#D9B66E';
}

export function derivePaletteFromSeed(seed: string): BookPalette {
  const h = hashString(seed);
  const picked = CURATED_BOOK_PALETTES[h % CURATED_BOOK_PALETTES.length];
  return {
    primary: picked.primary,
    secondary: picked.secondary,
    accent: picked.accent,
    textColor: picked.textColor,
    source: 'procedural',
  };
}

export function inferBindingStyle(
  format: BookFormat,
  categories: string[] = [],
  seed = ''
): BindingStyle {
  const catText = categories.join(' ').toLowerCase();
  const h = hashString(seed);
  if (format === 'mass-market' || format === 'trade-paperback') {
    return 'paperback';
  }
  if (/classic|history|philosophy|poetry|religion|antique|literature/.test(catText)) {
    return h % 2 === 0 ? 'hardcover-leather' : 'vintage-linen';
  }
  if (format === 'quarto') {
    return h % 2 === 0 ? 'hardcover-cloth' : 'dust-jacket';
  }
  const hardcoverStyles: BindingStyle[] = [
    'hardcover-cloth',
    'hardcover-leather',
    'dust-jacket',
    'vintage-linen',
  ];
  return hardcoverStyles[h % hardcoverStyles.length];
}

export function resolveSpineAppearance(params: {
  id: string;
  title: string;
  authors: string[];
  format: BookFormat;
  categories?: string[];
  palette?: BookPalette | null;
  metadataBindingStyle?: BindingStyle | null;
  overrides?: BookVisualOverrides | null;
}): ResolvedSpineAppearance {
  const seed = `${params.title}|${params.authors.join(',')}|${params.id}`;
  const h = hashString(seed);
  const basePalette = params.palette ?? derivePaletteFromSeed(seed);
  const overrides = params.overrides ?? {};

  const primaryColor = overrides.spineColor || basePalette.primary;
  const secondaryColor =
    overrides.secondaryColor ||
    (overrides.spineColor ? darkenHex(overrides.spineColor, 0.28) : basePalette.secondary);
  const textColor =
    overrides.textColor ||
    (overrides.spineColor ? pickReadableTextColor(overrides.spineColor) : basePalette.textColor);
  const accentColor =
    overrides.accentColor ||
    (overrides.spineColor ? pickAccentForBg(overrides.spineColor) : basePalette.accent);

  const bindingStyle: BindingStyle =
    overrides.bindingStyle ||
    params.metadataBindingStyle ||
    inferBindingStyle(params.format, params.categories, seed);

  const motifsByStyle: Record<BindingStyle, SpineMotif[]> = {
    'hardcover-leather': ['classic-bands', 'gilt-frame'],
    'hardcover-cloth': ['gilt-frame', 'editorial-stripe', 'classic-bands'],
    'vintage-linen': ['editorial-stripe', 'gilt-frame'],
    'dust-jacket': ['minimal-modern', 'editorial-stripe'],
    paperback: ['paperback-bold', 'minimal-modern'],
  };

  const motifChoices = motifsByStyle[bindingStyle];
  const motif: SpineMotif = overrides.motif || motifChoices[(h >> 3) % motifChoices.length];

  const defaultFont: SpineFontStyle =
    bindingStyle === 'hardcover-leather' || bindingStyle === 'vintage-linen'
      ? 'serif'
      : bindingStyle === 'paperback'
        ? (h % 3 === 0 ? 'serif' : 'sans')
        : (h % 2 === 0 ? 'display' : 'serif');

  const fontStyle: SpineFontStyle = overrides.fontStyle || defaultFont;

  const microTiltDeg = Number((((h % 91) - 45) / 100).toFixed(2)); // -0.45 to +0.45 deg
  const patina = Number((((h >> 5) % 45) / 100).toFixed(2));
  const raisedBands =
    bindingStyle === 'hardcover-leather' ? (h % 2 === 0 ? 5 : 4) : motif === 'classic-bands' ? 4 : 0;

  const headbandPalette = ['#B83B35', '#C8A355', '#274C43', '#D9CDB8', '#334257'];
  const headbandColor = headbandPalette[(h >> 7) % headbandPalette.length];

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    textColor,
    headbandColor,
    bindingStyle,
    motif,
    fontStyle,
    microTiltDeg,
    patina,
    raisedBands,
    customCoverUrl: overrides.customCoverUrl ?? null,
    customSpineUrl: overrides.customSpineUrl ?? null,
  };
}
