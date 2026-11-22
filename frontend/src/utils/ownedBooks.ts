import { normalizeIsbn, type BookDto, type BookshelfDto } from '@bookshelf/shared';

type BookIdentity = Pick<BookDto, 'provider' | 'providerBookId' | 'isbn' | 'title'>;

const titleKey = (title: string) =>
  `title:${title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`;

function editionKeys(book: BookIdentity): string[] {
  const isbn = normalizeIsbn(book.isbn);
  const keys = isbn ? [`isbn:${isbn}`] : [];
  if (book.providerBookId) keys.push(`edition:${book.provider}:${book.providerBookId}`);
  return keys;
}

export function indexOwnedBooks(shelves: BookshelfDto[]): Set<string> {
  const keys = new Set<string>();
  for (const shelf of shelves) {
    for (const compartment of shelf.compartments) {
      for (const { book } of compartment.books) {
        keys.add(titleKey(book.title));
        for (const key of editionKeys(book)) keys.add(key);
      }
    }
  }
  return keys;
}

export function getOwnership(
  keys: Set<string>,
  title: string,
  edition?: BookIdentity
): 'owned' | 'possible' | null {
  if (edition && editionKeys(edition).some((key) => keys.has(key))) return 'owned';
  return keys.has(titleKey(title)) ? 'possible' : null;
}
