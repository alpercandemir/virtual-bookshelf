import type { CabinetStyle, RoomTheme, WoodFinish } from './types.js';

export interface RoomThemeDefinition {
  id: RoomTheme;
  name: string;
  brandInspiration: string;
  tagline: string;
  mode: 'dark' | 'light';
  recommendedWood: WoodFinish;
  defaultCabinetStyle: CabinetStyle;
  wallPreview: string;
  accentColor: string;
}

export const ROOM_THEMES: RoomThemeDefinition[] = [
  {
    id: 'antique-study',
    name: 'Antique Study',
    brandInspiration: 'Heritage Library',
    tagline: 'Dark walnut study wall with warm brass sconce glow',
    mode: 'dark',
    recommendedWood: 'walnut',
    defaultCabinetStyle: 'heritage',
    wallPreview: 'linear-gradient(135deg, #271c14 0%, #140f0c 100%)',
    accentColor: '#d4ac62',
  },
  {
    id: 'nordic-billy',
    name: 'Nordic Minimal',
    brandInspiration: 'IKEA Billy · Scandinavian',
    tagline: 'Sunlit warm-white plaster wall & airy birch minimalism',
    mode: 'light',
    recommendedWood: 'birch',
    defaultCabinetStyle: 'modern',
    wallPreview: 'linear-gradient(135deg, #f6f3ed 0%, #e4dfd5 100%)',
    accentColor: '#3b352e',
  },
  {
    id: 'muji-zen',
    name: 'Zen Timber',
    brandInspiration: 'Muji · Wabi-Sabi',
    tagline: 'Warm washi sand plaster with diffused shoji daylight',
    mode: 'light',
    recommendedWood: 'oak',
    defaultCabinetStyle: 'modern',
    wallPreview: 'linear-gradient(135deg, #eee6d8 0%, #d8ccb8 100%)',
    accentColor: '#6f5336',
  },
  {
    id: 'aesop-apothecary',
    name: 'Botanical Apothecary',
    brandInspiration: 'Aesop · Venetian Plaster',
    tagline: 'Moody olive-sage limewash with warm amber downlight',
    mode: 'dark',
    recommendedWood: 'walnut',
    defaultCabinetStyle: 'heritage',
    wallPreview: 'linear-gradient(135deg, #2d382f 0%, #171e18 100%)',
    accentColor: '#cfb57c',
  },
  {
    id: 'brooklyn-loft',
    name: 'Industrial Loft',
    brandInspiration: 'Architectural Brick & Steel',
    tagline: 'Textured terracotta-charcoal loft wall & gallery spotlight',
    mode: 'dark',
    recommendedWood: 'matte-charcoal',
    defaultCabinetStyle: 'modern',
    wallPreview: 'linear-gradient(135deg, #35231e 0%, #171211 100%)',
    accentColor: '#d48d63',
  },
  {
    id: 'art-deco-salon',
    name: 'Velvet Salon',
    brandInspiration: 'Art Deco · Mid-Century',
    tagline: 'Midnight emerald paneling with champagne brass trim',
    mode: 'dark',
    recommendedWood: 'mahogany',
    defaultCabinetStyle: 'heritage',
    wallPreview: 'linear-gradient(135deg, #163138 0%, #0b181d 100%)',
    accentColor: '#e2c278',
  },
];

export function getRoomThemeMeta(id: RoomTheme | string | undefined): RoomThemeDefinition {
  return ROOM_THEMES.find((t) => t.id === id) ?? ROOM_THEMES[0];
}
