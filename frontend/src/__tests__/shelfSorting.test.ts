import { describe, expect, it } from 'vitest';
import {
  computeOccupiedWidthPx,
  getCompartmentCapacityPx,
  resolvePhysicalDimensions,
  type BookshelfDto,
  type ShelfBookDto,
} from '@bookshelf/shared';
import {
  arrangeBookshelf,
  parseAuthorNameForLastNameSort,
  sortShelfBooks,
} from '../utils/shelfSorting';

function makeBook(
  id: string,
  compartmentId: string,
  opts: {
    title: string;
    authors: string[];
    heightMm?: number;
    thicknessMm?: number;
    pageCount?: number;
    spineColor?: string;
  }
): ShelfBookDto {
  const dims =
    opts.heightMm && opts.thicknessMm
      ? resolvePhysicalDimensions({
          heightMm: opts.heightMm,
          widthMm: 145,
          thicknessMm: opts.thicknessMm,
          title: opts.title,
        })
      : resolvePhysicalDimensions({
          pageCount: opts.pageCount ?? 300,
          format: 'hardcover',
          title: opts.title,
        });

  return {
    id,
    bookshelfId: 'shelf-1',
    compartmentId,
    bookId: `book-${id}`,
    position: 0,
    visualOverrides: opts.spineColor ? { spineColor: opts.spineColor } : {},
    orientation: 'vertical',
    book: {
      id: `book-${id}`,
      provider: 'manual',
      providerBookId: `m-${id}`,
      isbn: null,
      title: opts.title,
      authors: opts.authors,
      publisher: 'Test Press',
      publicationDate: '2000',
      pageCount: opts.pageCount ?? 300,
      physicalDimensions: dims,
      coverUrl: null,
      metadata: {},
    },
  };
}

function makeTestBookshelf(
  compartments: Array<{
    id: string;
    row: number;
    column: number;
    widthRatio: number;
    books: ShelfBookDto[];
  }>
): BookshelfDto {
  return {
    id: 'shelf-1',
    userId: 'user-1',
    name: 'Library',
    tag: '2026',
    visualTheme: 'walnut',
    roomTheme: 'antique-study',
    ordering: 0,
    configuration: { showSconceLight: true },
    compartments: compartments.map((c, idx) => ({
      id: c.id,
      bookshelfId: 'shelf-1',
      row: c.row,
      column: c.column,
      ordering: idx,
      widthRatio: c.widthRatio,
      heightPx: 280,
      settings: {},
      books: c.books.map((b, pos) => ({ ...b, compartmentId: c.id, position: pos })),
    })),
  };
}

describe('parseAuthorNameForLastNameSort', () => {
  it('extracts standard, middle-initial, particle, suffix, comma, and mononym names', () => {
    expect(parseAuthorNameForLastNameSort('Frank Herbert')).toEqual({
      lastName: 'Herbert',
      givenName: 'Frank',
    });
    expect(parseAuthorNameForLastNameSort('Donella H. Meadows')).toEqual({
      lastName: 'Meadows',
      givenName: 'Donella H.',
    });
    expect(parseAuthorNameForLastNameSort('Ursula K. Le Guin')).toEqual({
      lastName: 'Le Guin',
      givenName: 'Ursula K.',
    });
    expect(parseAuthorNameForLastNameSort('Walter de la Mare')).toEqual({
      lastName: 'de la Mare',
      givenName: 'Walter',
    });
    expect(parseAuthorNameForLastNameSort('Martin Luther King Jr.')).toEqual({
      lastName: 'King',
      givenName: 'Martin Luther',
    });
    expect(parseAuthorNameForLastNameSort('Kurt Vonnegut, Jr.')).toEqual({
      lastName: 'Vonnegut',
      givenName: 'Kurt',
    });
    expect(parseAuthorNameForLastNameSort('Herbert, Frank')).toEqual({
      lastName: 'Herbert',
      givenName: 'Frank',
    });
    expect(parseAuthorNameForLastNameSort('King, Martin Luther, Jr.')).toEqual({
      lastName: 'King',
      givenName: 'Martin Luther',
    });
    expect(parseAuthorNameForLastNameSort('Homer')).toEqual({
      lastName: 'Homer',
      givenName: '',
    });
    expect(parseAuthorNameForLastNameSort('   ')).toEqual({
      lastName: '',
      givenName: '',
    });
  });
});

describe('sortShelfBooks', () => {
  it('sorts by author last name, tie-breaking by given name then title, with unknown authors last', () => {
    const books = [
      makeBook('1', 'c0', { title: 'War and Peace', authors: ['Leo Tolstoy'] }),
      makeBook('2', 'c0', { title: 'Anonymous Notes', authors: [] }),
      makeBook('3', 'c0', { title: 'Dune Messiah', authors: ['Frank Herbert'] }),
      makeBook('4', 'c0', { title: 'Dune', authors: ['Frank Herbert'] }),
      makeBook('5', 'c0', { title: 'House Atreides', authors: ['Brian Herbert'] }),
      makeBook('6', 'c0', { title: 'Pride and Prejudice', authors: ['Jane Austen'] }),
      makeBook('7', 'c0', { title: 'The Left Hand of Darkness', authors: ['Ursula K. Le Guin'] }),
      makeBook('8', 'c0', { title: 'The Odyssey', authors: ['Homer'] }),
    ];

    const sorted = sortShelfBooks(books, 'author-last-name');
    expect(sorted.map((b) => b.book.title)).toEqual([
      'Pride and Prejudice', // Austen, Jane
      'House Atreides', // Herbert, Brian
      'Dune', // Herbert, Frank (Dune < Dune Messiah)
      'Dune Messiah', // Herbert, Frank
      'The Odyssey', // Homer
      'The Left Hand of Darkness', // Le Guin, Ursula K.
      'War and Peace', // Tolstoy, Leo
      'Anonymous Notes', // no author -> end
    ]);
  });
});

describe('arrangeBookshelf (whole-bookshelf ordering)', () => {
  it('orders books across the whole bookshelf rather than within individual sections', () => {
    const shelf = makeTestBookshelf([
      {
        id: 'comp-top-left',
        row: 0,
        column: 0,
        widthRatio: 0.5,
        books: [
          makeBook('tolstoy', 'comp-top-left', {
            title: 'War and Peace',
            authors: ['Leo Tolstoy'],
          }),
          makeBook('sagan', 'comp-top-left', {
            title: 'Cosmos',
            authors: ['Carl Sagan'],
          }),
        ],
      },
      {
        id: 'comp-top-right',
        row: 0,
        column: 1,
        widthRatio: 0.5,
        books: [
          makeBook('herbert', 'comp-top-right', {
            title: 'Dune',
            authors: ['Frank Herbert'],
          }),
        ],
      },
      {
        id: 'comp-bottom',
        row: 1,
        column: 0,
        widthRatio: 1,
        books: [
          makeBook('austen', 'comp-bottom', {
            title: 'Pride and Prejudice',
            authors: ['Jane Austen'],
          }),
          makeBook('borges', 'comp-bottom', {
            title: 'Ficciones',
            authors: ['Jorge Luis Borges'],
          }),
        ],
      },
    ]);

    const result = arrangeBookshelf(shelf, 'author-last-name');
    expect(result.fits).toBe(true);

    // All 5 books fit in the first compartment (436px capacity) in global last-name order
    const comp0 = result.updatedBookshelf.compartments[0];
    expect(comp0.id).toBe('comp-top-left');
    expect(comp0.books.map((b) => b.id)).toEqual([
      'austen',
      'borges',
      'herbert',
      'sagan',
      'tolstoy',
    ]);
    expect(comp0.books.every((b, idx) => b.compartmentId === 'comp-top-left' && b.position === idx)).toBe(
      true
    );
    expect(result.updatedBookshelf.compartments[1].books).toEqual([]);
    expect(result.updatedBookshelf.compartments[2].books).toEqual([]);
    expect(result.payload).toEqual([
      {
        compartmentId: 'comp-top-left',
        shelfBookIds: ['austen', 'borges', 'herbert', 'sagan', 'tolstoy'],
      },
      { compartmentId: 'comp-top-right', shelfBookIds: [] },
      { compartmentId: 'comp-bottom', shelfBookIds: [] },
    ]);
  });

  it('flows globally sorted books across compartments when earlier compartments reach width capacity', () => {
    // Each 0.5-width compartment has capacityPx = floor(920 * 0.5) - 24 = 436px.
    // A 55mm-thick hardcover has spineWidthPx = round(55 * 1.18) = 65px (+2px gap = 67px).
    // 6 books = 402px <= 436px; 7th book = 469px > 436px -> overflows to next compartment!
    const allBooks = [
      makeBook('z', 'comp-1', { title: 'Zeta', authors: ['Aaron Zeta'], heightMm: 230, thicknessMm: 55 }),
      makeBook('h', 'comp-1', { title: 'Hotel', authors: ['Aaron Hotel'], heightMm: 230, thicknessMm: 55 }),
      makeBook('a', 'comp-1', { title: 'Alpha', authors: ['Zoe Alpha'], heightMm: 230, thicknessMm: 55 }),
      makeBook('g', 'comp-0', { title: 'Golf', authors: ['Aaron Golf'], heightMm: 230, thicknessMm: 55 }),
      makeBook('b', 'comp-1', { title: 'Bravo', authors: ['Zoe Bravo'], heightMm: 230, thicknessMm: 55 }),
      makeBook('f', 'comp-0', { title: 'Foxtrot', authors: ['Aaron Foxtrot'], heightMm: 230, thicknessMm: 55 }),
      makeBook('c', 'comp-1', { title: 'Charlie', authors: ['Zoe Charlie'], heightMm: 230, thicknessMm: 55 }),
      makeBook('e', 'comp-0', { title: 'Echo', authors: ['Aaron Echo'], heightMm: 230, thicknessMm: 55 }),
      makeBook('d', 'comp-1', { title: 'Delta', authors: ['Zoe Delta'], heightMm: 230, thicknessMm: 55 }),
    ];

    const shelf = makeTestBookshelf([
      { id: 'comp-0', row: 0, column: 0, widthRatio: 0.5, books: allBooks.slice(0, 4) },
      { id: 'comp-1', row: 0, column: 1, widthRatio: 0.5, books: allBooks.slice(4) },
    ]);

    const result = arrangeBookshelf(shelf, 'title');
    expect(result.fits).toBe(true);

    const c0 = result.updatedBookshelf.compartments[0];
    const c1 = result.updatedBookshelf.compartments[1];

    expect(c0.books.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(c1.books.map((b) => b.id)).toEqual(['g', 'h', 'z']);

    for (const comp of result.updatedBookshelf.compartments) {
      const occupied = computeOccupiedWidthPx(
        comp.books.map((b) => ({
          dimensions: b.book.physicalDimensions,
          orientation: b.orientation,
        })),
        comp.heightPx
      );
      expect(occupied).toBeLessThanOrEqual(getCompartmentCapacityPx(comp.widthRatio));
    }
  });

  it('orders whole bookshelf by height from tallest on top-left to shortest on bottom-right', () => {
    const shelf = makeTestBookshelf([
      {
        id: 'comp-0',
        row: 0,
        column: 0,
        widthRatio: 0.5,
        books: [
          makeBook('short', 'comp-0', { title: 'Short', authors: ['A'], heightMm: 165, thicknessMm: 20 }),
        ],
      },
      {
        id: 'comp-1',
        row: 1,
        column: 0,
        widthRatio: 0.5,
        books: [
          makeBook('tall', 'comp-1', { title: 'Tall', authors: ['B'], heightMm: 270, thicknessMm: 20 }),
          makeBook('mid', 'comp-1', { title: 'Mid', authors: ['C'], heightMm: 215, thicknessMm: 20 }),
        ],
      },
    ]);

    const result = arrangeBookshelf(shelf, 'height');
    expect(result.fits).toBe(true);
    expect(result.updatedBookshelf.compartments[0].books.map((b) => b.id)).toEqual([
      'tall',
      'mid',
      'short',
    ]);
  });

  it('reports fits: false if books exceed total capacity across all compartments', () => {
    // Single 0.5-width compartment (capacity 436px + 40px max tolerance = 476px)
    // 10 thick books (67px each = 670px) cannot fit even with backend reorder tolerance
    const thickBooks = Array.from({ length: 10 }, (_, idx) =>
      makeBook(`thick-${idx}`, 'comp-only', {
        title: `Thick ${idx}`,
        authors: [`Author ${idx}`],
        heightMm: 230,
        thicknessMm: 55,
      })
    );
    const shelf = makeTestBookshelf([
      { id: 'comp-only', row: 0, column: 0, widthRatio: 0.5, books: thickBooks },
    ]);

    const result = arrangeBookshelf(shelf, 'author-last-name');
    expect(result.fits).toBe(false);
  });

  it('handles out-of-order compartment arrays and preserves all books across 5-compartment default layout', () => {
    const sampleAuthors = [
      ['Frank Herbert', 'Dune'],
      ['Herman Melville', 'Moby-Dick'],
      ['Jane Austen', 'Pride and Prejudice'],
      ['Italo Calvino', 'Invisible Cities'],
      ['Umberto Eco', 'The Name of the Rose'],
      ['Marcus Aurelius', 'Meditations'],
      ['Christopher Alexander', 'A Pattern Language'],
      ['Jorge Luis Borges', 'Ficciones'],
      ['Leo Tolstoy', 'War and Peace'],
      ['Homer', 'The Odyssey'],
      ['Gabriel García Márquez', 'One Hundred Years of Solitude'],
      ['Robert Bringhurst', 'The Elements of Typographic Style'],
      ['Carl Sagan', 'Cosmos'],
      ['Fyodor Dostoevsky', 'Crime and Punishment'],
      ['Mikhail Bulgakov', 'The Master and Margarita'],
      ['Ursula K. Le Guin', 'The Left Hand of Darkness'],
      ['Donella H. Meadows', 'Thinking in Systems'],
      ['Mary Shelley', 'Frankenstein'],
      ['Carlos Ruiz Zafón', 'The Shadow of the Wind'],
      ['Don Norman', 'The Design of Everyday Things'],
    ] as const;

    const books = sampleAuthors.map(([author, title], idx) =>
      makeBook(`b-${idx}`, `c-${idx % 5}`, {
        title,
        authors: [author],
        heightMm: 220,
        thicknessMm: 35,
      })
    );

    // Intentionally supply compartments out of (row, column) order
    const shelf = makeTestBookshelf([
      { id: 'c-4', row: 2, column: 1, widthRatio: 0.5, books: books.slice(16, 20) },
      { id: 'c-2', row: 1, column: 0, widthRatio: 1.0, books: books.slice(8, 12) },
      { id: 'c-0', row: 0, column: 0, widthRatio: 0.5, books: books.slice(0, 4) },
      { id: 'c-3', row: 2, column: 0, widthRatio: 0.5, books: books.slice(12, 16) },
      { id: 'c-1', row: 0, column: 1, widthRatio: 0.5, books: books.slice(4, 8) },
    ]);

    const result = arrangeBookshelf(shelf, 'author-last-name');
    expect(result.fits).toBe(true);
    expect(result.updatedBookshelf.compartments.map((c) => c.id)).toEqual([
      'c-0',
      'c-1',
      'c-2',
      'c-3',
      'c-4',
    ]);

    const flattened = result.updatedBookshelf.compartments.flatMap((c) => c.books);
    expect(flattened).toHaveLength(20);
    expect(flattened[0].book.authors[0]).toBe('Christopher Alexander');
    expect(flattened[1].book.authors[0]).toBe('Marcus Aurelius');
    expect(flattened[2].book.authors[0]).toBe('Jane Austen');
    expect(flattened[flattened.length - 2].book.authors[0]).toBe('Leo Tolstoy');
    expect(flattened[flattened.length - 1].book.authors[0]).toBe('Carlos Ruiz Zafón');

    // Ursula K. Le Guin should sort under "Le Guin" (between Homer and Márquez)
    const idxHomer = flattened.findIndex((b) => b.book.authors[0] === 'Homer');
    const idxLeGuin = flattened.findIndex((b) => b.book.authors[0] === 'Ursula K. Le Guin');
    const idxMarquez = flattened.findIndex(
      (b) => b.book.authors[0] === 'Gabriel García Márquez'
    );
    expect(idxHomer).toBeLessThan(idxLeGuin);
    expect(idxLeGuin).toBeLessThan(idxMarquez);

    // Every compartment must fit cleanly within backend reorder tolerance
    for (const comp of result.updatedBookshelf.compartments) {
      const occupied = computeOccupiedWidthPx(
        comp.books.map((b) => ({
          dimensions: b.book.physicalDimensions,
          orientation: b.orientation,
        })),
        comp.heightPx
      );
      expect(occupied).toBeLessThanOrEqual(getCompartmentCapacityPx(comp.widthRatio));
    }
  });
});
