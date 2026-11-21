import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  resolvePhysicalDimensions,
  type BookshelfDto,
  type ShelfBookDto,
} from '@bookshelf/shared';
import { Bookshelf } from '../components/bookshelf/Bookshelf';
import { BookRevealModal } from '../components/book-detail/BookRevealModal';

function makeShelfBook(
  index: number,
  compartmentId: string,
  overrides: Partial<ShelfBookDto['book']> = {}
): ShelfBookDto {
  const pageCount = 150 + ((index * 73) % 780);
  const formatList = ['hardcover', 'trade-paperback', 'mass-market', 'pocket', 'quarto'] as const;
  const format = formatList[index % formatList.length];
  const dims =
    overrides.physicalDimensions ??
    resolvePhysicalDimensions({
      pageCount,
      format,
      title: overrides.title ?? `Volume ${index + 1}`,
    });

  return {
    id: `sb-${index}`,
    bookshelfId: 'shelf-1',
    compartmentId,
    bookId: `book-${index}`,
    position: index,
    visualOverrides: {},
    orientation: 'vertical',
    book: {
      id: `book-${index}`,
      provider: 'manual',
      providerBookId: `m-${index}`,
      isbn: null,
      title: `Volume ${index + 1}`,
      authors: [`Author ${index + 1}`],
      publisher: 'Heritage Press',
      publicationDate: String(1920 + (index % 100)),
      pageCount,
      physicalDimensions: dims,
      coverUrl: null,
      metadata: { description: 'Sample book description.' },
      ...overrides,
    },
  };
}

function makeBookshelf(bookCount: number): BookshelfDto {
  const compartmentCount = 5;
  const compartments = Array.from({ length: compartmentCount }, (_, idx) => ({
    id: `comp-${idx}`,
    bookshelfId: 'shelf-1',
    row: Math.floor(idx / 2),
    column: idx % 2,
    ordering: idx,
    widthRatio: idx === 4 ? 1 : 0.5,
    heightPx: 280,
    settings: { label: `Section ${idx + 1}` },
    books: [] as ShelfBookDto[],
  }));

  for (let i = 0; i < bookCount; i++) {
    const comp = compartments[i % compartmentCount];
    comp.books.push(makeShelfBook(i, comp.id));
  }

  return {
    id: 'shelf-1',
    userId: 'user-1',
    name: 'Test Library',
    tag: '2026',
    visualTheme: 'walnut',
    roomTheme: 'antique-study',
    ordering: 0,
    configuration: { showSconceLight: true },
    compartments,
  };
}

describe('<Bookshelf /> component', () => {
  it('renders distinct book heights and spine thicknesses and fires onSelectBook', () => {
    const shelf = makeBookshelf(2);
    shelf.compartments[0].books = [
      makeShelfBook(0, 'comp-0', {
        title: 'Slim Poetry',
        pageCount: 110,
        physicalDimensions: resolvePhysicalDimensions({
          pageCount: 110,
          format: 'pocket',
          title: 'Slim Poetry',
        }),
      }),
      makeShelfBook(1, 'comp-0', {
        title: 'Epic History',
        pageCount: 980,
        physicalDimensions: resolvePhysicalDimensions({
          pageCount: 980,
          format: 'hardcover',
          title: 'Epic History',
        }),
      }),
    ];
    shelf.compartments[1].books = [];

    const onSelect = vi.fn();
    render(<Bookshelf bookshelf={shelf} onSelectBook={onSelect} />);

    const cabinet = screen.getByTestId('bookshelf-cabinet');
    expect(cabinet).toHaveAttribute('data-theme', 'walnut');

    const slimBtn = screen.getByTestId('book-spine-sb-0');
    const epicBtn = screen.getByTestId('book-spine-sb-1');

    const slimSlot = slimBtn.closest('.book-slot') as HTMLElement;
    const epicSlot = epicBtn.closest('.book-slot') as HTMLElement;
    expect(parseInt(epicSlot.style.width, 10)).toBeGreaterThan(
      parseInt(slimSlot.style.width, 10)
    );
    expect(parseInt(epicSlot.style.height, 10)).toBeGreaterThan(
      parseInt(slimSlot.style.height, 10)
    );

    fireEvent.click(epicBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].book.title).toBe('Epic History');
  });

  it('renders 110 books distributed across shelves cleanly and quickly', () => {
    const shelf = makeBookshelf(110);
    const start = performance.now();
    render(<Bookshelf bookshelf={shelf} onSelectBook={vi.fn()} />);
    const elapsed = performance.now() - start;

    expect(screen.getAllByRole('button', { name: /Click to inspect book details/i })).toHaveLength(110);
    expect(elapsed).toBeLessThan(2500);
  });
});

describe('<BookRevealModal /> dimensions transparency', () => {
  it('clearly distinguishes estimated vs verified physical measurements', () => {
    const shelf = makeBookshelf(2);
    const estimatedBook = makeShelfBook(0, 'comp-0', {
      title: 'Estimated Book',
      physicalDimensions: resolvePhysicalDimensions({ pageCount: 320, format: 'hardcover', title: 'Estimated Book' }),
    });
    const verifiedBook = makeShelfBook(1, 'comp-0', {
      title: 'Verified Book',
      physicalDimensions: resolvePhysicalDimensions({
        heightCm: '24 cm',
        widthCm: '16 cm',
        thicknessCm: '3.8 cm',
        title: 'Verified Book',
      }),
    });

    const { rerender } = render(
      <BookRevealModal
        shelfBook={estimatedBook}
        bookshelf={shelf}
        onClose={vi.fn()}
        onUpdateBook={vi.fn()}
        onRemoveBook={vi.fn()}
        onToast={vi.fn()}
      />
    );
    expect(screen.getByText('Estimated Dimensions')).toBeInTheDocument();

    rerender(
      <BookRevealModal
        shelfBook={verifiedBook}
        bookshelf={shelf}
        onClose={vi.fn()}
        onUpdateBook={vi.fn()}
        onRemoveBook={vi.fn()}
        onToast={vi.fn()}
      />
    );
    expect(screen.getByText('Verified Measurements')).toBeInTheDocument();
  });
});
