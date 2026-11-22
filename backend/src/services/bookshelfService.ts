import type { PrismaClient } from '@prisma/client';
import {
  type BookDto,
  type BookMetadata,
  type BookOrientation,
  type BookProvider,
  type BookshelfConfiguration,
  type BookshelfDto,
  type BookVisualOverrides,
  type CompartmentSettings,
  type LayoutLevelInput,
  type PhysicalDimensions,
  type RoomTheme,
  type ShelfBookDto,
  type ShelfCompartmentDto,
  type WoodFinish,
  resolvePhysicalDimensions,
} from '@bookshelf/shared';
import { AppError, safeJsonParse } from '../lib/httpErrors.js';
import { CURATED_SAMPLE_BOOKS } from './sampleBooks.js';

export const DEFAULT_LAYOUT: LayoutLevelInput[] = [
  {
    row: 0,
    heightPx: 276,
    compartments: [
      { column: 0, widthRatio: 0.5, label: 'Upper Left' },
      { column: 1, widthRatio: 0.5, label: 'Upper Right' },
    ],
  },
  {
    row: 1,
    heightPx: 294,
    compartments: [{ column: 0, widthRatio: 1.0, label: 'Main Gallery' }],
  },
  {
    row: 2,
    heightPx: 276,
    compartments: [
      { column: 0, widthRatio: 0.5, label: 'Lower Left' },
      { column: 1, widthRatio: 0.5, label: 'Lower Right' },
    ],
  },
];

export function serializeBook(record: {
  id: string;
  provider: string;
  providerBookId: string | null;
  isbn: string | null;
  title: string;
  authors: string;
  publisher: string | null;
  publicationDate: string | null;
  pageCount: number | null;
  physicalDimensions: string;
  coverUrl: string | null;
  metadata: string;
}): BookDto {
  const authors = safeJsonParse<string[]>(record.authors, []);
  const { restoredProviderBookId, ...metadata } = safeJsonParse<
    BookMetadata & { restoredProviderBookId?: string | null }
  >(record.metadata, {});
  const physicalDimensions = safeJsonParse<PhysicalDimensions>(
    record.physicalDimensions,
    resolvePhysicalDimensions({
      pageCount: record.pageCount,
      title: record.title,
      categories: metadata.categories,
    })
  );

  return {
    id: record.id,
    provider: record.provider as BookProvider,
    providerBookId: record.providerBookId ?? restoredProviderBookId ?? null,
    isbn: record.isbn,
    title: record.title,
    authors,
    publisher: record.publisher,
    publicationDate: record.publicationDate,
    pageCount: record.pageCount,
    physicalDimensions,
    coverUrl: record.coverUrl,
    metadata,
  };
}

const shelfInclude = {
  compartments: {
    orderBy: [{ row: 'asc' as const }, { column: 'asc' as const }, { ordering: 'asc' as const }],
    include: {
      shelfBooks: {
        orderBy: { position: 'asc' as const },
        include: { book: true },
      },
    },
  },
};

function serializeBookshelf(shelf: {
  id: string;
  userId: string;
  name: string;
  tag: string | null;
  visualTheme: string;
  roomTheme: string;
  ordering: number;
  configuration: string;
  compartments: Array<{
    id: string;
    bookshelfId: string;
    row: number;
    column: number;
    ordering: number;
    widthRatio: number;
    heightPx: number;
    settings: string;
    shelfBooks: Array<{
      id: string;
      bookshelfId: string;
      compartmentId: string;
      bookId: string;
      position: number;
      visualOverrides: string;
      orientation: string;
      book: Parameters<typeof serializeBook>[0];
    }>;
  }>;
}): BookshelfDto {
  const compartments: ShelfCompartmentDto[] = shelf.compartments.map((c) => {
    const books: ShelfBookDto[] = c.shelfBooks.map((sb) => ({
      id: sb.id,
      bookshelfId: sb.bookshelfId,
      compartmentId: sb.compartmentId,
      bookId: sb.bookId,
      position: sb.position,
      visualOverrides: safeJsonParse<BookVisualOverrides>(sb.visualOverrides, {}),
      orientation: (sb.orientation || 'vertical') as BookOrientation,
      book: serializeBook(sb.book),
    }));

    return {
      id: c.id,
      bookshelfId: c.bookshelfId,
      row: c.row,
      column: c.column,
      ordering: c.ordering,
      widthRatio: c.widthRatio,
      heightPx: c.heightPx,
      settings: safeJsonParse<CompartmentSettings>(c.settings, {}),
      books,
    };
  });

  return {
    id: shelf.id,
    userId: shelf.userId,
    name: shelf.name,
    tag: shelf.tag ?? null,
    visualTheme: (shelf.visualTheme || 'walnut') as WoodFinish,
    roomTheme: (shelf.roomTheme || 'antique-study') as RoomTheme,
    ordering: shelf.ordering ?? 0,
    configuration: safeJsonParse<BookshelfConfiguration>(shelf.configuration, {
      lightingWarmth: 0.72,
      paperThicknessMm: 0.068,
      showSconceLight: true,
    }),
    compartments,
  };
}

export async function getBookshelvesForUser(
  prisma: PrismaClient,
  userId: string
): Promise<BookshelfDto[]> {
  let shelves = await prisma.bookshelf.findMany({
    where: { userId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
    include: shelfInclude,
  });

  if (shelves.length === 0) {
    await createDefaultBookshelfForUser(prisma, userId, { seedSamples: false });
    shelves = await prisma.bookshelf.findMany({
      where: { userId },
      orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
      include: shelfInclude,
    });
  }

  return shelves.map(serializeBookshelf);
}

export async function getBookshelfForUser(
  prisma: PrismaClient,
  userId: string,
  bookshelfId?: string
): Promise<BookshelfDto> {
  if (bookshelfId) {
    const found = await prisma.bookshelf.findFirst({
      where: { id: bookshelfId, userId },
      include: shelfInclude,
    });
    if (!found) {
      throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
    }
    return serializeBookshelf(found);
  }

  const shelves = await getBookshelvesForUser(prisma, userId);
  return shelves[0];
}

export async function createDefaultBookshelfForUser(
  prisma: PrismaClient,
  userId: string,
  options: { seedSamples?: boolean } = {}
): Promise<BookshelfDto> {
  return createBookshelfForUser(prisma, userId, {
    name: 'My Personal Library',
    tag: String(new Date().getFullYear()),
    visualTheme: 'walnut',
    roomTheme: 'antique-study',
    levelCount: 3,
    useDefaultPreset: true,
    seedSamples: options.seedSamples ?? false,
  });
}

export async function createBookshelfForUser(
  prisma: PrismaClient,
  userId: string,
  input: {
    name: string;
    tag?: string | null;
    visualTheme?: WoodFinish;
    roomTheme?: RoomTheme;
    levelCount?: number;
    useDefaultPreset?: boolean;
    seedSamples?: boolean;
  }
): Promise<BookshelfDto> {
  const existingCount = await prisma.bookshelf.count({ where: { userId } });

  const shelf = await prisma.bookshelf.create({
    data: {
      userId,
      name: input.name.trim() || 'Untitled Shelf',
      tag: input.tag?.trim() || null,
      visualTheme: input.visualTheme ?? 'walnut',
      roomTheme: input.roomTheme ?? 'antique-study',
      ordering: existingCount,
      configuration: JSON.stringify({
        lightingWarmth: 0.72,
        paperThicknessMm: 0.068,
        showSconceLight: true,
      }),
    },
  });

  const layoutToUse: LayoutLevelInput[] = input.useDefaultPreset
    ? DEFAULT_LAYOUT
    : Array.from({ length: Math.max(1, Math.min(6, input.levelCount ?? 3)) }, (_, row) => ({
        row,
        heightPx: row === 1 ? 290 : 276,
        compartments:
          row % 2 === 0
            ? [
                { column: 0, widthRatio: 0.5, label: `Shelf ${row + 1}A` },
                { column: 1, widthRatio: 0.5, label: `Shelf ${row + 1}B` },
              ]
            : [{ column: 0, widthRatio: 1.0, label: `Shelf ${row + 1}` }],
      }));

  let ordering = 0;
  for (const level of layoutToUse) {
    for (const comp of level.compartments) {
      await prisma.shelfCompartment.create({
        data: {
          bookshelfId: shelf.id,
          row: level.row,
          column: comp.column,
          ordering: ordering++,
          widthRatio: comp.widthRatio,
          heightPx: level.heightPx,
          settings: JSON.stringify({ label: comp.label }),
        },
      });
    }
  }

  if (input.seedSamples) {
    await seedSampleBooksForUser(prisma, userId, shelf.id);
  }

  return getBookshelfForUser(prisma, userId, shelf.id);
}

export async function reorderBookshelvesForUser(
  prisma: PrismaClient,
  userId: string,
  bookshelfIds: string[]
): Promise<BookshelfDto[]> {
  const owned = await prisma.bookshelf.findMany({
    where: { userId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((s) => s.id));
  const uniqueIds = [...new Set(bookshelfIds)];

  for (const id of uniqueIds) {
    if (!ownedSet.has(id)) {
      throw new AppError(400, 'INVALID_BOOKSHELF', 'Unknown bookshelf in reorder list.');
    }
  }

  // Append any omitted owned shelves at the end to keep ordering contiguous
  const remaining = owned.map((s) => s.id).filter((id) => !uniqueIds.includes(id));
  const finalOrder = [...uniqueIds, ...remaining];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < finalOrder.length; i++) {
      await tx.bookshelf.update({
        where: { id: finalOrder[i] },
        data: { ordering: i },
      });
    }
  });

  return getBookshelvesForUser(prisma, userId);
}

export async function deleteBookshelfForUser(
  prisma: PrismaClient,
  userId: string,
  bookshelfId: string
): Promise<BookshelfDto[]> {
  const owned = await prisma.bookshelf.findMany({
    where: { userId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  if (owned.length <= 1) {
    throw new AppError(
      400,
      'CANNOT_DELETE_LAST_SHELF',
      'You must keep at least one bookshelf in your library.'
    );
  }

  const target = owned.find((s) => s.id === bookshelfId);
  if (!target) {
    throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookshelf.delete({ where: { id: bookshelfId } });
    const rest = owned.filter((s) => s.id !== bookshelfId);
    for (let i = 0; i < rest.length; i++) {
      await tx.bookshelf.update({
        where: { id: rest[i].id },
        data: { ordering: i },
      });
    }
  });

  return getBookshelvesForUser(prisma, userId);
}

export async function seedSampleBooksForUser(
  prisma: PrismaClient,
  userId: string,
  bookshelfId?: string
): Promise<BookshelfDto> {
  const shelf = await prisma.bookshelf.findFirst({
    where: bookshelfId ? { id: bookshelfId, userId } : { userId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
    include: {
      compartments: {
        orderBy: [{ row: 'asc' }, { column: 'asc' }],
        include: { shelfBooks: true },
      },
    },
  });

  if (!shelf || shelf.compartments.length === 0) {
    throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
  }

  const existingBookIds = new Set(
    shelf.compartments.flatMap((c) => c.shelfBooks.map((sb) => sb.bookId))
  );

  const compPositions = new Map<string, number>();
  for (const c of shelf.compartments) {
    compPositions.set(c.id, c.shelfBooks.length);
  }

  for (const sample of CURATED_SAMPLE_BOOKS) {
    // Estimate dimensions from page count & format (never label estimates as verified!)
    const dimensions = resolvePhysicalDimensions({
      pageCount: sample.pageCount,
      format: sample.format,
      categories: sample.categories,
      title: sample.title,
    });

    const bookRecord = await prisma.book.upsert({
      where: {
        provider_providerBookId: {
          provider: 'sample',
          providerBookId: sample.providerBookId,
        },
      },
      update: {},
      create: {
        provider: 'sample',
        providerBookId: sample.providerBookId,
        isbn: sample.isbn,
        title: sample.title,
        authors: JSON.stringify(sample.authors),
        publisher: sample.publisher,
        publicationDate: sample.publicationDate,
        pageCount: sample.pageCount,
        physicalDimensions: JSON.stringify(dimensions),
        coverUrl: sample.coverUrl,
        metadata: JSON.stringify({
          description: sample.description,
          categories: sample.categories,
          subtitle: sample.subtitle ?? null,
          palette: sample.palette,
          bindingStyle: sample.bindingStyle,
        }),
      },
    });

    if (existingBookIds.has(bookRecord.id)) {
      continue;
    }

    const targetComp =
      shelf.compartments[sample.compartmentIndex % shelf.compartments.length];
    const nextPos = compPositions.get(targetComp.id) ?? 0;

    await prisma.shelfBook.create({
      data: {
        bookshelfId: shelf.id,
        compartmentId: targetComp.id,
        bookId: bookRecord.id,
        position: nextPos,
        visualOverrides: '{}',
        orientation: 'vertical',
      },
    });

    compPositions.set(targetComp.id, nextPos + 1);
  }

  return getBookshelfForUser(prisma, userId, shelf.id);
}

export async function updateBookshelfSettings(
  prisma: PrismaClient,
  userId: string,
  input: {
    name?: string;
    tag?: string | null;
    visualTheme?: WoodFinish;
    roomTheme?: RoomTheme;
    configuration?: BookshelfConfiguration;
  },
  bookshelfId?: string
): Promise<BookshelfDto> {
  const existing = await prisma.bookshelf.findFirst({
    where: bookshelfId ? { id: bookshelfId, userId } : { userId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
  });
  if (!existing) {
    throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
  }

  const prevConfig = safeJsonParse<BookshelfConfiguration>(existing.configuration, {});
  const mergedConfig = input.configuration
    ? { ...prevConfig, ...input.configuration }
    : prevConfig;

  await prisma.bookshelf.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tag !== undefined ? { tag: input.tag?.trim() || null } : {}),
      ...(input.visualTheme !== undefined ? { visualTheme: input.visualTheme } : {}),
      ...(input.roomTheme !== undefined ? { roomTheme: input.roomTheme } : {}),
      configuration: JSON.stringify(mergedConfig),
    },
  });

  return getBookshelfForUser(prisma, userId, existing.id);
}

/**
 * Atomically updates shelf levels and compartment splits while preserving EVERY existing book.
 * Any books belonging to removed compartments are re-homed smoothly to surviving compartments.
 */
export async function updateBookshelfLayout(
  prisma: PrismaClient,
  userId: string,
  levels: LayoutLevelInput[],
  bookshelfId?: string
): Promise<BookshelfDto> {
  const shelf = await prisma.bookshelf.findFirst({
    where: bookshelfId ? { id: bookshelfId, userId } : { userId },
    orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
    include: {
      compartments: {
        orderBy: [{ row: 'asc' }, { column: 'asc' }],
        include: {
          shelfBooks: {
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });

  if (!shelf) {
    throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
  }

  const existingById = new Map(shelf.compartments.map((c) => [c.id, c]));

  const normalizedLevels = levels.map((lvl, rowIdx) => {
    const ratioSum = lvl.compartments.reduce((acc, c) => acc + c.widthRatio, 0) || 1;
    return {
      row: rowIdx,
      heightPx: lvl.heightPx,
      compartments: lvl.compartments.map((c, colIdx) => ({
        id: c.id && existingById.has(c.id) ? c.id : undefined,
        column: colIdx,
        widthRatio: Number((c.widthRatio / ratioSum).toFixed(4)),
        label: c.label,
      })),
    };
  });

  await prisma.$transaction(async (tx) => {
    const keptIds = new Set<string>();
    const createdOrUpdatedIdsByRow = new Map<number, string[]>();
    const allNewOrderIds: string[] = [];

    let ordering = 0;
    for (const lvl of normalizedLevels) {
      const rowCompIds: string[] = [];
      for (const comp of lvl.compartments) {
        if (comp.id) {
          keptIds.add(comp.id);
          await tx.shelfCompartment.update({
            where: { id: comp.id },
            data: {
              row: lvl.row,
              column: comp.column,
              ordering: ordering++,
              widthRatio: comp.widthRatio,
              heightPx: lvl.heightPx,
              settings: JSON.stringify(comp.label ? { label: comp.label } : {}),
            },
          });
          rowCompIds.push(comp.id);
          allNewOrderIds.push(comp.id);
        } else {
          const created = await tx.shelfCompartment.create({
            data: {
              bookshelfId: shelf.id,
              row: lvl.row,
              column: comp.column,
              ordering: ordering++,
              widthRatio: comp.widthRatio,
              heightPx: lvl.heightPx,
              settings: JSON.stringify(comp.label ? { label: comp.label } : {}),
            },
          });
          rowCompIds.push(created.id);
          allNewOrderIds.push(created.id);
        }
      }
      createdOrUpdatedIdsByRow.set(lvl.row, rowCompIds);
    }

    const removedCompartments = shelf.compartments.filter((c) => !keptIds.has(c.id));
    if (removedCompartments.length > 0 && allNewOrderIds.length > 0) {
      const bookCounts = new Map<string, number>();
      for (const id of allNewOrderIds) {
        const existing = existingById.get(id);
        bookCounts.set(id, existing ? existing.shelfBooks.length : 0);
      }

      for (const removed of removedCompartments) {
        const sameRowTargets = createdOrUpdatedIdsByRow.get(removed.row);
        const targetId =
          sameRowTargets && sameRowTargets.length > 0
            ? sameRowTargets[Math.min(removed.column, sameRowTargets.length - 1)]
            : [...allNewOrderIds].sort(
                (a, b) => (bookCounts.get(a) ?? 0) - (bookCounts.get(b) ?? 0)
              )[0];

        let nextPos = bookCounts.get(targetId) ?? 0;
        for (const sb of removed.shelfBooks) {
          await tx.shelfBook.update({
            where: { id: sb.id },
            data: {
              compartmentId: targetId,
              position: nextPos++,
            },
          });
        }
        bookCounts.set(targetId, nextPos);
      }

      await tx.shelfCompartment.deleteMany({
        where: {
          id: { in: removedCompartments.map((c) => c.id) },
          bookshelfId: shelf.id,
        },
      });
    }
  });

  return getBookshelfForUser(prisma, userId, shelf.id);
}

export async function resetBookshelfLayout(
  prisma: PrismaClient,
  userId: string,
  bookshelfId?: string
): Promise<BookshelfDto> {
  return updateBookshelfLayout(prisma, userId, DEFAULT_LAYOUT, bookshelfId);
}
