import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
  addBookSchema,
  computeOccupiedWidthPx,
  dimensionsToShelfPixels,
  getCompartmentCapacityPx,
  normalizeIsbn,
  reorderBooksSchema,
  resolvePhysicalDimensions,
  searchQuerySchema,
  updateShelfBookSchema,
  type BookshelfConfiguration,
  type BookVisualOverrides,
  type PhysicalDimensions,
} from '@bookshelf/shared';
import { AppError, safeJsonParse } from '../lib/httpErrors.js';
import { requireAuth } from '../plugins/auth.js';
import { getBookshelfForUser } from '../services/bookshelfService.js';
import {
  BookSearchService,
  buildInitialBookPalette,
} from '../services/bookSearchService.js';

function checkCompartmentCanAccept(params: {
  existingBooks: Array<{
    physicalDimensions: PhysicalDimensions;
    orientation: string;
  }>;
  incomingDimensions: PhysicalDimensions;
  incomingOrientation: string;
  widthRatio: number;
  heightPx: number;
}): boolean {
  const occupied = computeOccupiedWidthPx(
    params.existingBooks.map((b) => ({
      dimensions: b.physicalDimensions,
      orientation: b.orientation,
    })),
    params.heightPx
  );
  const incomingPx = dimensionsToShelfPixels(
    params.incomingDimensions,
    params.heightPx
  );
  const incomingW =
    params.incomingOrientation === 'face-out'
      ? Math.min(incomingPx.depthPx, 148) + 6
      : incomingPx.spineWidthPx + 2;

  const capacity = getCompartmentCapacityPx(params.widthRatio);
  return occupied + incomingW <= capacity + 24;
}

export async function registerBookRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  searchService: BookSearchService
): Promise<void> {
  app.get('/api/books/search', async (request) => {
    requireAuth(request);
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid search parameters.'
      );
    }

    return searchService.search(parsed.data);
  });

  app.post('/api/bookshelf/books', async (request, reply) => {
    const user = requireAuth(request);
    const parsed = addBookSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid book payload.',
        parsed.error.flatten()
      );
    }

    // Resolve target bookshelf: explicit bookshelfId, or compartmentId's parent shelf, or primary shelf
    let resolvedBookshelfId = parsed.data.bookshelfId;
    if (!resolvedBookshelfId && parsed.data.compartmentId) {
      const compLookup = await prisma.shelfCompartment.findFirst({
        where: {
          id: parsed.data.compartmentId,
          bookshelf: { userId: user.id },
        },
        select: { bookshelfId: true },
      });
      if (compLookup) resolvedBookshelfId = compLookup.bookshelfId;
    }

    const shelf = await prisma.bookshelf.findFirst({
      where: resolvedBookshelfId
        ? { id: resolvedBookshelfId, userId: user.id }
        : { userId: user.id },
      orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
      include: {
        compartments: {
          orderBy: [{ row: 'asc' }, { column: 'asc' }],
          include: {
            shelfBooks: {
              orderBy: { position: 'asc' },
              include: { book: true },
            },
          },
        },
      },
    });

    if (!shelf || shelf.compartments.length === 0) {
      throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
    }

    const shelfConfig = safeJsonParse<BookshelfConfiguration>(shelf.configuration, {});
    const bookInput = parsed.data.book;

    const normalizedIsbn = bookInput.isbn ? normalizeIsbn(bookInput.isbn) : null;
    if (bookInput.isbn && !normalizedIsbn && bookInput.provider === 'manual') {
      throw new AppError(
        400,
        'INVALID_ISBN',
        'Please enter a valid 10- or 13-digit ISBN, or leave the ISBN field empty.'
      );
    }

    const dimensions = resolvePhysicalDimensions({
      heightMm: bookInput.heightMm ?? null,
      widthMm: bookInput.widthMm ?? null,
      thicknessMm: bookInput.thicknessMm ?? null,
      pageCount: bookInput.pageCount ?? null,
      format: bookInput.format ?? null,
      categories: bookInput.categories,
      title: bookInput.title,
      paperThicknessMmPerPage: shelfConfig.paperThicknessMm,
    });

    // Respect explicit dimensionSource if verified measurements were passed
    if (
      bookInput.dimensionSource === 'verified' &&
      bookInput.heightMm &&
      bookInput.widthMm &&
      bookInput.thicknessMm
    ) {
      dimensions.source = 'verified';
    }

    // Choose target compartment (explicitly selected, or first compartment with room)
    let targetComp = parsed.data.compartmentId
      ? shelf.compartments.find((c) => c.id === parsed.data.compartmentId)
      : undefined;

    if (parsed.data.compartmentId && !targetComp) {
      throw new AppError(404, 'COMPARTMENT_NOT_FOUND', 'Target shelf compartment not found.');
    }

    if (targetComp) {
      const fits = checkCompartmentCanAccept({
        existingBooks: targetComp.shelfBooks.map((sb) => ({
          physicalDimensions: safeJsonParse<PhysicalDimensions>(
            sb.book.physicalDimensions,
            dimensions
          ),
          orientation: sb.orientation,
        })),
        incomingDimensions: dimensions,
        incomingOrientation: 'vertical',
        widthRatio: targetComp.widthRatio,
        heightPx: targetComp.heightPx,
      });

      if (!fits) {
        throw new AppError(
          409,
          'SHELF_FULL',
          'That shelf compartment is full. Choose another shelf or add a new shelf level in Customize Shelf.'
        );
      }
    } else {
      targetComp =
        shelf.compartments.find((comp) =>
          checkCompartmentCanAccept({
            existingBooks: comp.shelfBooks.map((sb) => ({
              physicalDimensions: safeJsonParse<PhysicalDimensions>(
                sb.book.physicalDimensions,
                dimensions
              ),
              orientation: sb.orientation,
            })),
            incomingDimensions: dimensions,
            incomingOrientation: 'vertical',
            widthRatio: comp.widthRatio,
            heightPx: comp.heightPx,
          })
        ) ?? shelf.compartments[0];
    }

    const providerBookId =
      bookInput.providerBookId?.trim() ||
      (bookInput.provider === 'manual' ? `manual-${crypto.randomUUID()}` : `ext-${crypto.randomUUID()}`);

    const palette = buildInitialBookPalette(
      bookInput.title,
      bookInput.authors,
      providerBookId
    );

    const bookRecord = await prisma.book.upsert({
      where: {
        provider_providerBookId: {
          provider: bookInput.provider,
          providerBookId,
        },
      },
      update: {
        coverUrl: bookInput.coverUrl ?? undefined,
      },
      create: {
        provider: bookInput.provider,
        providerBookId,
        isbn: normalizedIsbn,
        title: bookInput.title,
        authors: JSON.stringify(bookInput.authors),
        publisher: bookInput.publisher ?? null,
        publicationDate: bookInput.publicationDate ?? null,
        pageCount: bookInput.pageCount ?? null,
        physicalDimensions: JSON.stringify(dimensions),
        coverUrl: bookInput.coverUrl ?? null,
        metadata: JSON.stringify({
          description: bookInput.description ?? null,
          categories: bookInput.categories ?? [],
          language: bookInput.language ?? null,
          subtitle: bookInput.subtitle ?? null,
          palette,
        }),
      },
    });

    const insertPos =
      parsed.data.position !== undefined
        ? Math.min(parsed.data.position, targetComp.shelfBooks.length)
        : targetComp.shelfBooks.length;

    const createdShelfBook = await prisma.$transaction(async (tx) => {
      if (insertPos < targetComp!.shelfBooks.length) {
        await tx.shelfBook.updateMany({
          where: {
            compartmentId: targetComp!.id,
            position: { gte: insertPos },
          },
          data: { position: { increment: 1 } },
        });
      }

      return tx.shelfBook.create({
        data: {
          bookshelfId: shelf.id,
          compartmentId: targetComp!.id,
          bookId: bookRecord.id,
          position: insertPos,
          visualOverrides: JSON.stringify(parsed.data.visualOverrides ?? {}),
          orientation: 'vertical',
        },
      });
    });

    const updatedBookshelf = await getBookshelfForUser(prisma, user.id, shelf.id);
    const addedShelfBook = updatedBookshelf.compartments
      .flatMap((c) => c.books)
      .find((b) => b.id === createdShelfBook.id);

    return reply.status(201).send({
      bookshelf: updatedBookshelf,
      addedShelfBook,
    });
  });

  app.patch('/api/bookshelf/books/:shelfBookId', async (request) => {
    const user = requireAuth(request);
    const { shelfBookId } = request.params as { shelfBookId: string };
    const parsed = updateShelfBookSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid book update.',
        parsed.error.flatten()
      );
    }

    const existing = await prisma.shelfBook.findUnique({
      where: { id: shelfBookId },
      include: {
        bookshelf: true,
        book: true,
      },
    });

    if (!existing || existing.bookshelf.userId !== user.id) {
      throw new AppError(404, 'SHELF_BOOK_NOT_FOUND', 'Book not found on your bookshelf.');
    }

    const targetCompartmentId = parsed.data.compartmentId ?? existing.compartmentId;
    const nextOrientation = parsed.data.orientation ?? existing.orientation;
    let targetBookshelfId = existing.bookshelfId;

    if (targetCompartmentId !== existing.compartmentId) {
      const targetComp = await prisma.shelfCompartment.findFirst({
        where: {
          id: targetCompartmentId,
          bookshelf: { userId: user.id },
        },
        include: {
          shelfBooks: {
            orderBy: { position: 'asc' },
            include: { book: true },
          },
        },
      });
      if (!targetComp) {
        throw new AppError(404, 'COMPARTMENT_NOT_FOUND', 'Target compartment not found.');
      }
      targetBookshelfId = targetComp.bookshelfId;

      const bookDims = safeJsonParse<PhysicalDimensions>(
        existing.book.physicalDimensions,
        resolvePhysicalDimensions({ pageCount: existing.book.pageCount, title: existing.book.title })
      );

      const fits = checkCompartmentCanAccept({
        existingBooks: targetComp.shelfBooks.map((sb) => ({
          physicalDimensions: safeJsonParse<PhysicalDimensions>(
            sb.book.physicalDimensions,
            bookDims
          ),
          orientation: sb.orientation,
        })),
        incomingDimensions: bookDims,
        incomingOrientation: nextOrientation,
        widthRatio: targetComp.widthRatio,
        heightPx: targetComp.heightPx,
      });

      if (!fits) {
        throw new AppError(
          409,
          'SHELF_FULL',
          'That compartment does not have enough horizontal room for this book.'
        );
      }
    }

    const prevOverrides = safeJsonParse<BookVisualOverrides>(existing.visualOverrides, {});
    const mergedOverrides = parsed.data.visualOverrides
      ? { ...prevOverrides, ...parsed.data.visualOverrides }
      : prevOverrides;

    await prisma.$transaction(async (tx) => {
      if (
        targetCompartmentId !== existing.compartmentId ||
        parsed.data.position !== undefined
      ) {
        // Re-index old compartment
        const oldSiblings = await tx.shelfBook.findMany({
          where: {
            compartmentId: existing.compartmentId,
            id: { not: existing.id },
          },
          orderBy: { position: 'asc' },
        });
        for (let i = 0; i < oldSiblings.length; i++) {
          await tx.shelfBook.update({
            where: { id: oldSiblings[i].id },
            data: { position: i },
          });
        }

        const targetSiblings = await tx.shelfBook.findMany({
          where: {
            compartmentId: targetCompartmentId,
            id: { not: existing.id },
          },
          orderBy: { position: 'asc' },
        });

        const insertIdx =
          parsed.data.position !== undefined
            ? Math.max(0, Math.min(parsed.data.position, targetSiblings.length))
            : targetSiblings.length;

        const ordered = [
          ...targetSiblings.slice(0, insertIdx).map((s) => s.id),
          existing.id,
          ...targetSiblings.slice(insertIdx).map((s) => s.id),
        ];

        for (let i = 0; i < ordered.length; i++) {
          await tx.shelfBook.update({
            where: { id: ordered[i] },
            data: {
              bookshelfId: targetBookshelfId,
              compartmentId: targetCompartmentId,
              position: i,
              ...(ordered[i] === existing.id
                ? {
                    orientation: nextOrientation,
                    visualOverrides: JSON.stringify(mergedOverrides),
                  }
                : {}),
            },
          });
        }
      } else {
        await tx.shelfBook.update({
          where: { id: existing.id },
          data: {
            orientation: nextOrientation,
            visualOverrides: JSON.stringify(mergedOverrides),
          },
        });
      }
    });

    const bookshelf = await getBookshelfForUser(prisma, user.id, targetBookshelfId);
    const shelfBook = bookshelf.compartments
      .flatMap((c) => c.books)
      .find((b) => b.id === existing.id);

    return { bookshelf, shelfBook };
  });

  app.post('/api/bookshelf/books/reorder', async (request) => {
    const user = requireAuth(request);
    const parsed = reorderBooksSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid reorder payload.'
      );
    }

    // Infer target bookshelf from explicit bookshelfId or first compartmentId
    let targetShelfId = parsed.data.bookshelfId;
    if (!targetShelfId && parsed.data.compartments[0]) {
      const comp = await prisma.shelfCompartment.findFirst({
        where: {
          id: parsed.data.compartments[0].compartmentId,
          bookshelf: { userId: user.id },
        },
        select: { bookshelfId: true },
      });
      if (comp) targetShelfId = comp.bookshelfId;
    }

    const shelf = await prisma.bookshelf.findFirst({
      where: targetShelfId ? { id: targetShelfId, userId: user.id } : { userId: user.id },
      orderBy: [{ ordering: 'asc' }, { createdAt: 'asc' }],
      include: {
        compartments: true,
        shelfBooks: {
          include: { book: true },
        },
      },
    });

    if (!shelf) {
      throw new AppError(404, 'BOOKSHELF_NOT_FOUND', 'Bookshelf not found.');
    }

    const validCompMap = new Map(shelf.compartments.map((c) => [c.id, c]));
    const validBookMap = new Map(shelf.shelfBooks.map((sb) => [sb.id, sb]));
    const seenBookIds = new Set<string>();

    for (const entry of parsed.data.compartments) {
      const comp = validCompMap.get(entry.compartmentId);
      if (!comp) {
        throw new AppError(400, 'INVALID_COMPARTMENT', 'Unknown shelf compartment.');
      }

      const itemsInComp: Array<{ dimensions: PhysicalDimensions; orientation: string }> = [];
      for (const sbId of entry.shelfBookIds) {
        const sb = validBookMap.get(sbId);
        if (!sb) {
          throw new AppError(400, 'INVALID_SHELF_BOOK', 'Unknown shelf book.');
        }
        if (seenBookIds.has(sbId)) {
          throw new AppError(400, 'DUPLICATE_BOOK', 'Duplicate book in reorder payload.');
        }
        seenBookIds.add(sbId);
        itemsInComp.push({
          dimensions: safeJsonParse<PhysicalDimensions>(
            sb.book.physicalDimensions,
            resolvePhysicalDimensions({ pageCount: sb.book.pageCount, title: sb.book.title })
          ),
          orientation: sb.orientation,
        });
      }

      const occupied = computeOccupiedWidthPx(itemsInComp, comp.heightPx);
      const capacity = getCompartmentCapacityPx(comp.widthRatio);
      if (occupied > capacity + 40 && itemsInComp.length > 1) {
        throw new AppError(
          409,
          'SHELF_FULL',
          'Insufficient horizontal space in the destination shelf compartment.'
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const entry of parsed.data.compartments) {
        for (let i = 0; i < entry.shelfBookIds.length; i++) {
          await tx.shelfBook.update({
            where: { id: entry.shelfBookIds[i] },
            data: {
              compartmentId: entry.compartmentId,
              position: i,
            },
          });
        }
      }
    });

    const bookshelf = await getBookshelfForUser(prisma, user.id, shelf.id);
    return { bookshelf };
  });

  app.delete('/api/bookshelf/books/:shelfBookId', async (request) => {
    const user = requireAuth(request);
    const { shelfBookId } = request.params as { shelfBookId: string };

    const existing = await prisma.shelfBook.findUnique({
      where: { id: shelfBookId },
      include: { bookshelf: true },
    });

    if (!existing || existing.bookshelf.userId !== user.id) {
      throw new AppError(404, 'SHELF_BOOK_NOT_FOUND', 'Book not found on your bookshelf.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.shelfBook.delete({ where: { id: existing.id } });
      const remaining = await tx.shelfBook.findMany({
        where: { compartmentId: existing.compartmentId },
        orderBy: { position: 'asc' },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.shelfBook.update({
          where: { id: remaining[i].id },
          data: { position: i },
        });
      }
    });

    const bookshelf = await getBookshelfForUser(prisma, user.id, existing.bookshelfId);
    return { bookshelf };
  });
}
