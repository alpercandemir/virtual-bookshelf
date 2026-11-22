import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  bindingStyleSchema,
  bookFormatSchema,
  bookOrientationSchema,
  hexColorSchema,
  roomThemeSchema,
  updateBookshelfSchema,
  visualOverridesSchema,
  woodFinishSchema,
} from '@bookshelf/shared';
import { ALLOWED_EXTENSIONS, detectImageTypeFromMagicBytes, MAX_BOOK_IMAGE_BYTES } from '../lib/bookImages.js';
import { AppError } from '../lib/httpErrors.js';
import { getBookshelvesForUser } from './bookshelfService.js';

export const MAX_LIBRARY_BACKUP_BYTES = 64 * 1024 * 1024;
const UPLOAD_URL = /^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp)$/i;
const position = z.number().int().nonnegative();
const nullableText = z.string().nullable();
const imageUrl = z.string().max(1000).refine((url) =>
  UPLOAD_URL.test(url) || /^https?:\/\//i.test(url) || url.startsWith('/api/covers/proxy?url=')
);
const metadataSchema = z.object({
  description: nullableText.optional(),
  categories: z.array(z.string()).optional(),
  language: nullableText.optional(),
  subtitle: nullableText.optional(),
  editionInfo: nullableText.optional(),
  bindingStyle: bindingStyleSchema.optional(),
  palette: z.object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema,
    textColor: hexColorSchema,
    source: z.enum(['cover', 'procedural', 'override']),
  }).optional(),
});

const backupSchema = z.object({
  version: z.literal(1),
  books: z.array(z.object({
    provider: z.enum(['google_books', 'open_library', 'manual', 'sample']),
    providerBookId: nullableText,
    isbn: nullableText,
    title: z.string().min(1).max(240),
    authors: z.array(z.string()),
    publisher: nullableText,
    publicationDate: nullableText,
    pageCount: z.number().int().positive().nullable(),
    physicalDimensions: z.object({
      heightMm: z.number().positive(),
      widthMm: z.number().positive(),
      thicknessMm: z.number().positive(),
      source: z.enum(['estimated', 'verified']),
      format: bookFormatSchema,
      estimationNote: z.string().optional(),
    }),
    coverUrl: imageUrl.nullable(),
    metadata: metadataSchema,
  })),
  shelves: z.array(z.object({
    name: z.string().min(1).max(80),
    tag: z.string().max(32).nullable(),
    visualTheme: woodFinishSchema,
    roomTheme: roomThemeSchema,
    configuration: updateBookshelfSchema.shape.configuration.unwrap(),
    compartments: z.array(z.object({
      row: position.max(9),
      column: position.max(3),
      ordering: position,
      widthRatio: z.number().min(0.2).max(1),
      heightPx: position.min(220).max(380),
      settings: z.object({
        label: z.string().max(40).optional(),
        maxWidthPx: z.number().positive().optional(),
      }),
      books: z.array(z.object({
        bookIndex: position,
        position,
        orientation: bookOrientationSchema,
        visualOverrides: visualOverridesSchema.extend({
          customCoverUrl: imageUrl.nullish(),
          customSpineUrl: imageUrl.nullish(),
        }),
      })),
    })).min(1).max(32),
  })).min(1),
  images: z.record(z.string().regex(UPLOAD_URL), z.string()),
});

type LibraryBackup = z.infer<typeof backupSchema>;

function invalidBackup(message: string) {
  return new AppError(400, 'INVALID_LIBRARY_BACKUP', message);
}

function referencedUploads(backup: LibraryBackup): Set<string> {
  const urls = new Set<string>();
  const add = (url?: string | null) => {
    if (url && UPLOAD_URL.test(url)) urls.add(url);
  };
  for (const book of backup.books) add(book.coverUrl);
  for (const shelf of backup.shelves) {
    for (const compartment of shelf.compartments) {
      for (const { visualOverrides } of compartment.books) {
        add(visualOverrides.customCoverUrl);
        add(visualOverrides.customSpineUrl);
      }
    }
  }
  return urls;
}

export async function exportLibrary(prisma: PrismaClient, userId: string, uploadsDir: string) {
  const library = await getBookshelvesForUser(prisma, userId);
  const books: LibraryBackup['books'] = [];
  const bookIndexes = new Map<string, number>();
  const shelves = library.map(({ name, tag, visualTheme, roomTheme, configuration, compartments }) => ({
    name, tag, visualTheme, roomTheme, configuration,
    compartments: compartments.map(({ row, column, ordering, widthRatio, heightPx, settings, books: placements }) => ({
      row, column, ordering, widthRatio, heightPx, settings,
      books: placements.map(({ book, position, orientation, visualOverrides }) => {
        let bookIndex = bookIndexes.get(book.id);
        if (bookIndex === undefined) {
          bookIndex = books.length;
          bookIndexes.set(book.id, bookIndex);
          const { id, ...edition } = book;
          books.push(edition);
        }
        return { bookIndex, position, orientation, visualOverrides };
      }),
    })),
  }));
  const backup: LibraryBackup = { version: 1, books, shelves, images: {} };
  let imageBytes = 0;
  for (const url of referencedUploads(backup)) {
    const source = path.join(uploadsDir, path.basename(url));
    let data: Buffer;
    try {
      data = await fs.readFile(source);
    } catch {
      throw new AppError(409, 'BACKUP_IMAGE_MISSING', 'A custom image is missing from storage. The backup could not be completed.');
    }
    imageBytes += Math.ceil(data.length / 3) * 4;
    if (imageBytes > MAX_LIBRARY_BACKUP_BYTES) throw backupTooLarge();
    backup.images[url] = data.toString('base64');
  }
  const json = JSON.stringify(backup);
  if (Buffer.byteLength(json) > MAX_LIBRARY_BACKUP_BYTES) throw backupTooLarge();
  return json;
}

function backupTooLarge() {
  return new AppError(413, 'BACKUP_TOO_LARGE', 'This library exceeds the 64 MB backup limit.');
}

export async function restoreLibrary(
  prisma: PrismaClient,
  userId: string,
  uploadsDir: string,
  payload: unknown
) {
  const parsed = backupSchema.safeParse(payload);
  if (!parsed.success) throw invalidBackup('Choose a valid Virtual Bookshelf backup file.');
  const backup = parsed.data;
  for (const shelf of backup.shelves) {
    for (const compartment of shelf.compartments) {
      if (compartment.books.some(({ bookIndex }) => bookIndex >= backup.books.length)) {
        throw invalidBackup('The backup contains a missing book reference.');
      }
    }
  }
  const uploads = new Map<string, { filename: string; data: Buffer }>();
  for (const url of referencedUploads(backup)) {
    const encoded = backup.images[url];
    if (!encoded || encoded.length > Math.ceil(MAX_BOOK_IMAGE_BYTES / 3) * 4) {
      throw invalidBackup('A custom image is missing or invalid.');
    }
    const data = Buffer.from(encoded, 'base64');
    const mime = detectImageTypeFromMagicBytes(data);
    if (!mime || data.length > MAX_BOOK_IMAGE_BYTES || data.toString('base64') !== encoded) {
      throw invalidBackup('A custom image is missing or invalid.');
    }
    uploads.set(url, { filename: randomUUID() + ALLOWED_EXTENSIONS[mime], data });
  }
  function restoreUrl(url: string | null | undefined) {
    const upload = url ? uploads.get(url) : undefined;
    return upload ? `/uploads/${upload.filename}` : url;
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const written: string[] = [];
  try {
    for (const { filename, data } of uploads.values()) {
      const destination = path.join(uploadsDir, filename);
      const file = await fs.open(destination, 'wx');
      written.push(destination);
      try {
        await file.writeFile(data);
      } finally {
        await file.close();
      }
    }

    await prisma.$transaction(async (tx) => {
      const lastShelf = await tx.bookshelf.aggregate({
        where: { userId }, _max: { ordering: true },
      });
      const firstOrder = (lastShelf._max.ordering ?? -1) + 1;
      const bookIds = backup.books.map(() => randomUUID());
      await tx.book.createMany({
        data: backup.books.map(({ authors, physicalDimensions, metadata, coverUrl, providerBookId, ...edition }, index) => ({
          ...edition,
          id: bookIds[index],
          authors: JSON.stringify(authors),
          physicalDimensions: JSON.stringify(physicalDimensions),
          // Restored editions are snapshots. The original catalog key is still used for duplicate detection.
          metadata: JSON.stringify({ ...metadata, restoredProviderBookId: providerBookId }),
          coverUrl: restoreUrl(coverUrl),
        })),
      });
      for (const [index, { configuration, compartments, ...shelf }] of backup.shelves.entries()) {
        const restored = await tx.bookshelf.create({
          data: { ...shelf, userId, ordering: firstOrder + index, configuration: JSON.stringify(configuration) },
        });
        for (const { settings, books, ...compartment } of compartments) {
          const target = await tx.shelfCompartment.create({
            data: { ...compartment, bookshelfId: restored.id, settings: JSON.stringify(settings) },
          });
          await tx.shelfBook.createMany({
            data: books.map(({ bookIndex, visualOverrides, ...placement }) => ({
              ...placement,
              bookId: bookIds[bookIndex],
              bookshelfId: restored.id,
              compartmentId: target.id,
              visualOverrides: JSON.stringify({
                ...visualOverrides,
                customCoverUrl: restoreUrl(visualOverrides.customCoverUrl),
                customSpineUrl: restoreUrl(visualOverrides.customSpineUrl),
              }),
            })),
          });
        }
      }
    }, { timeout: 30_000 });
  } catch (error) {
    await Promise.allSettled(written.map((filename) => fs.unlink(filename)));
    throw error;
  }

  return { restoredCount: backup.shelves.length };
}
