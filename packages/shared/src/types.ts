export type WoodFinish =
  | 'walnut'
  | 'mahogany'
  | 'oak'
  | 'espresso'
  | 'birch'
  | 'matte-charcoal';

export type RoomTheme =
  | 'antique-study'
  | 'nordic-billy'
  | 'muji-zen'
  | 'aesop-apothecary'
  | 'brooklyn-loft'
  | 'art-deco-salon';

export type BindingStyle =
  | 'hardcover-cloth'
  | 'hardcover-leather'
  | 'dust-jacket'
  | 'paperback'
  | 'vintage-linen';

export type BookFormat =
  | 'hardcover'
  | 'trade-paperback'
  | 'mass-market'
  | 'quarto'
  | 'pocket';

export type BookOrientation =
  | 'vertical'
  | 'leaning-left'
  | 'leaning-right'
  | 'face-out';

export type BookProvider = 'google_books' | 'open_library' | 'manual' | 'sample';

export type DimensionSource = 'verified' | 'estimated';

export type SpineMotif =
  | 'classic-bands'
  | 'gilt-frame'
  | 'editorial-stripe'
  | 'minimal-modern'
  | 'paperback-bold';

export type SpineFontStyle = 'serif' | 'display' | 'sans';

export type CabinetStyle = 'heritage' | 'modern';

export type ReadingStatus = 'unread' | 'reading' | 'finished';

export interface PhysicalDimensions {
  /** Height of the book standing upright, in millimeters */
  heightMm: number;
  /** Depth (front-cover width) of the book, in millimeters */
  widthMm: number;
  /** Spine thickness of the book, in millimeters */
  thicknessMm: number;
  /** Strictly distinguishes real provider measurements from page/format estimates */
  source: DimensionSource;
  /** Inferred or known book format */
  format: BookFormat;
  /** Explanation of estimation parameters when source === 'estimated' */
  estimationNote?: string;
}

export interface BookPalette {
  primary: string;
  secondary: string;
  accent: string;
  textColor: string;
  source: 'cover' | 'procedural' | 'override';
}

export interface BookMetadata {
  description?: string | null;
  categories?: string[];
  language?: string | null;
  subtitle?: string | null;
  editionInfo?: string | null;
  palette?: BookPalette;
  bindingStyle?: BindingStyle;
}

export interface BookVisualOverrides {
  spineColor?: string | null;
  secondaryColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  bindingStyle?: BindingStyle | null;
  motif?: SpineMotif | null;
  fontStyle?: SpineFontStyle | null;
  customCoverUrl?: string | null;
  customSpineUrl?: string | null;
  readingStatus?: ReadingStatus | null;
  rating?: number | null;
  notes?: string | null;
}

export interface BookshelfConfiguration {
  lightingWarmth?: number; // 0..1
  paperThicknessMm?: number; // default 0.068 mm per page (sheet = 2 pages)
  showSconceLight?: boolean;
  cabinetStyle?: CabinetStyle;
}

export interface CompartmentSettings {
  label?: string;
  maxWidthPx?: number;
}

export interface UserDto {
  id: string;
  username: string;
  createdAt: string;
}

export interface BookDto {
  id: string;
  provider: BookProvider;
  providerBookId: string | null;
  isbn: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publicationDate: string | null;
  pageCount: number | null;
  physicalDimensions: PhysicalDimensions;
  coverUrl: string | null;
  metadata: BookMetadata;
}

export interface ShelfBookDto {
  id: string;
  bookshelfId: string;
  compartmentId: string;
  bookId: string;
  position: number;
  visualOverrides: BookVisualOverrides;
  orientation: BookOrientation;
  book: BookDto;
}

export interface ShelfCompartmentDto {
  id: string;
  bookshelfId: string;
  row: number;
  column: number;
  ordering: number;
  widthRatio: number;
  heightPx: number;
  settings: CompartmentSettings;
  books: ShelfBookDto[];
}

export interface BookshelfDto {
  id: string;
  userId: string;
  name: string;
  tag: string | null;
  visualTheme: WoodFinish;
  roomTheme: RoomTheme;
  ordering: number;
  configuration: BookshelfConfiguration;
  compartments: ShelfCompartmentDto[];
}

export interface LayoutLevelInput {
  row: number;
  heightPx: number;
  compartments: {
    id?: string;
    column: number;
    widthRatio: number;
    label?: string;
  }[];
}

export interface SearchEditionSummary {
  provider: Exclude<BookProvider, 'manual' | 'sample'>;
  providerBookId: string;
  isbn: string | null;
  publisher: string | null;
  publicationDate: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  editionInfo?: string | null;
}

export interface SearchBookResult {
  id: string;
  provider: Exclude<BookProvider, 'manual' | 'sample'>;
  providerBookId: string;
  isbn: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publicationDate: string | null;
  pageCount: number | null;
  description: string | null;
  categories: string[];
  language: string | null;
  coverUrl: string | null;
  physicalDimensions: PhysicalDimensions;
  editions?: SearchEditionSummary[];
}

export interface SearchResponse {
  query: string;
  type: 'all' | 'title' | 'author' | 'isbn';
  page: number;
  limit: number;
  totalEstimate: number;
  hasMore: boolean;
  providerUsed: 'google_books' | 'open_library' | 'hybrid';
  fallbackNotice?: string;
  items: SearchBookResult[];
}
