import { z } from 'zod';

export const woodFinishSchema = z.enum([
  'walnut',
  'mahogany',
  'oak',
  'espresso',
  'birch',
  'matte-charcoal',
]);

export const roomThemeSchema = z.enum([
  'antique-study',
  'nordic-billy',
  'muji-zen',
  'aesop-apothecary',
  'brooklyn-loft',
  'art-deco-salon',
]);

export const bindingStyleSchema = z.enum([
  'hardcover-cloth',
  'hardcover-leather',
  'dust-jacket',
  'paperback',
  'vintage-linen',
]);

export const bookFormatSchema = z.enum([
  'hardcover',
  'trade-paperback',
  'mass-market',
  'quarto',
  'pocket',
]);

export const bookOrientationSchema = z.enum([
  'vertical',
  'leaning-left',
  'leaning-right',
  'face-out',
  'stacked',
]);

export const spineMotifSchema = z.enum([
  'classic-bands',
  'gilt-frame',
  'editorial-stripe',
  'minimal-modern',
  'paperback-bold',
]);

export const spineFontStyleSchema = z.enum(['serif', 'display', 'sans']);

export const cabinetStyleSchema = z.enum(['heritage', 'modern']);

export const readingStatusSchema = z.enum(['unread', 'reading', 'finished']);

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #5A1F24');

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may contain letters, numbers, underscores, dots, and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  seedSamples: z.boolean().optional().default(true),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(128),
});

export const updateBookshelfSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tag: z.string().trim().max(32).nullable().optional(),
  visualTheme: woodFinishSchema.optional(),
  roomTheme: roomThemeSchema.optional(),
  configuration: z
    .object({
      lightingWarmth: z.number().min(0).max(1).optional(),
      paperThicknessMm: z.number().min(0.04).max(0.14).optional(),
      showSconceLight: z.boolean().optional(),
      showBookends: z.boolean().optional(),
      cabinetStyle: cabinetStyleSchema.optional(),
    })
    .optional(),
});

export const createBookshelfSchema = z.object({
  name: z.string().trim().min(1, 'Shelf name is required').max(80),
  tag: z.string().trim().max(32).nullable().optional(),
  visualTheme: woodFinishSchema.optional().default('walnut'),
  roomTheme: roomThemeSchema.optional().default('antique-study'),
  levelCount: z.number().int().min(1).max(6).optional().default(3),
  seedSamples: z.boolean().optional().default(false),
});

export const reorderBookshelvesSchema = z.object({
  bookshelfIds: z.array(z.string().min(1)).min(1),
});

export const layoutUpdateSchema = z.object({
  levels: z
    .array(
      z.object({
        row: z.number().int().min(0).max(9),
        heightPx: z.number().int().min(220).max(380).default(285),
        compartments: z
          .array(
            z.object({
              id: z.string().min(1).optional(),
              column: z.number().int().min(0).max(3),
              widthRatio: z.number().min(0.2).max(1),
              label: z.string().trim().max(40).optional(),
            })
          )
          .min(1)
          .max(4),
      })
    )
    .min(1, 'A bookshelf must have at least 1 shelf level')
    .max(8, 'Maximum 8 shelf levels supported'),
});

export const visualOverridesSchema = z.object({
  spineColor: hexColorSchema.nullable().optional(),
  secondaryColor: hexColorSchema.nullable().optional(),
  textColor: hexColorSchema.nullable().optional(),
  accentColor: hexColorSchema.nullable().optional(),
  bindingStyle: bindingStyleSchema.nullable().optional(),
  motif: spineMotifSchema.nullable().optional(),
  fontStyle: spineFontStyleSchema.nullable().optional(),
  customCoverUrl: z.string().max(500).nullable().optional(),
  customSpineUrl: z.string().max(500).nullable().optional(),
  readingStatus: readingStatusSchema.nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const addBookSchema = z.object({
  bookshelfId: z.string().min(1).optional(),
  compartmentId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  book: z.object({
    provider: z.enum(['google_books', 'open_library', 'manual']),
    providerBookId: z.string().max(120).nullable().optional(),
    isbn: z.string().max(32).nullable().optional(),
    title: z.string().trim().min(1, 'Title is required').max(240),
    subtitle: z.string().trim().max(240).nullable().optional(),
    authors: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    publisher: z.string().trim().max(140).nullable().optional(),
    publicationDate: z.string().trim().max(40).nullable().optional(),
    pageCount: z.number().int().min(1).max(5000).nullable().optional(),
    coverUrl: z.string().max(1000).nullable().optional(),
    description: z.string().max(4000).nullable().optional(),
    categories: z.array(z.string().trim().max(80)).max(10).optional().default([]),
    language: z.string().trim().max(24).nullable().optional(),
    format: bookFormatSchema.optional(),
    heightMm: z.number().min(100).max(420).nullable().optional(),
    widthMm: z.number().min(70).max(350).nullable().optional(),
    thicknessMm: z.number().min(4).max(120).nullable().optional(),
    dimensionSource: z.enum(['verified', 'estimated']).optional(),
  }),
  visualOverrides: visualOverridesSchema.optional(),
});

export const updateShelfBookSchema = z.object({
  compartmentId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  orientation: bookOrientationSchema.optional(),
  visualOverrides: visualOverridesSchema.optional(),
});

export const reorderBooksSchema = z.object({
  bookshelfId: z.string().min(1).optional(),
  compartments: z
    .array(
      z.object({
        compartmentId: z.string().min(1),
        shelfBookIds: z.array(z.string().min(1)),
      })
    )
    .min(1),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter a search query').max(200),
  type: z.enum(['all', 'title', 'author', 'isbn']).optional().default('all'),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
});
