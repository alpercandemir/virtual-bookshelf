import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  resolvePhysicalDimensions,
  type BookshelfDto,
  type ShelfBookDto,
} from '@bookshelf/shared';
import { Bookshelf } from '../components/bookshelf/Bookshelf';
import { BookRevealModal } from '../components/book-detail/BookRevealModal';
import { BookSearchModal } from '../components/search/BookSearchModal';
import { ApiError } from '../api/client';

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
  it('shows titles on spines and full authors in tooltips', () => {
    const shelf = makeBookshelf(2);
    shelf.compartments[0].books = [
      makeShelfBook(0, 'comp-0', {
        title: 'Slim Poetry',
        authors: ['Ursula K. Le Guin'],
        pageCount: 110,
        physicalDimensions: resolvePhysicalDimensions({
          pageCount: 110,
          format: 'pocket',
          title: 'Slim Poetry',
        }),
      }),
      makeShelfBook(1, 'comp-0', {
        title: 'Epic History',
        authors: ['Frank Herbert'],
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
    expect(within(slimBtn).getByText('Slim Poetry')).toBeVisible();
    expect(within(slimBtn).queryByText('Ursula K. Le Guin')).not.toBeInTheDocument();
    expect(slimBtn).toHaveAccessibleName(/Ursula K\. Le Guin/);
    expect(within(epicBtn).getByText('Epic History')).toBeVisible();
    expect(within(epicBtn).queryByText('Frank Herbert')).not.toBeInTheDocument();

    const slimSlot = slimBtn.closest('.book-slot') as HTMLElement;
    const epicSlot = epicBtn.closest('.book-slot') as HTMLElement;
    expect(within(within(slimSlot).getByRole('tooltip')).getByText('Ursula K. Le Guin')).toBeVisible();
    expect(within(within(epicSlot).getByRole('tooltip')).getByText('Frank Herbert')).toBeVisible();
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

describe('Full-shelf capacity warnings', () => {
  function makeShelfWithFullFirstCompartment(): BookshelfDto {
    const shelf = makeBookshelf(0);
    // comp-0 has widthRatio 0.5 -> capacityPx = floor(920 * 0.5) - 24 = 436px
    // 10 thick 900-page hardcovers (~60px each) easily fill comp-0 completely
    shelf.compartments[0].books = Array.from({ length: 10 }, (_, idx) =>
      makeShelfBook(idx, 'comp-0', {
        title: `Thick Volume ${idx + 1}`,
        pageCount: 900,
        physicalDimensions: resolvePhysicalDimensions({
          pageCount: 900,
          format: 'hardcover',
          title: `Thick Volume ${idx + 1}`,
        }),
      })
    );
    shelf.compartments[1].books = [
      makeShelfBook(99, 'comp-1', { title: 'Lonely Book' }),
    ];
    return shelf;
  }

  it('keeps the general shelf view free of idle full-shelf badges', () => {
    const shelf = makeShelfWithFullFirstCompartment();
    render(
      <Bookshelf
        bookshelf={shelf}
        onSelectBook={vi.fn()}
        onQuickAddToCompartment={vi.fn()}
      />
    );

    expect(screen.queryByTestId('compartment-full-badge')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('compartment-nearly-full-badge')
    ).not.toBeInTheDocument();
  });

  it('shows a prominent warning in BookSearchModal when targeting a full compartment and supports switching', () => {
    const shelf = makeShelfWithFullFirstCompartment();
    const onOpenCustomizer = vi.fn();

    render(
      <BookSearchModal
        open
        onClose={vi.fn()}
        bookshelf={shelf}
        initialCompartmentId="comp-0"
        initialTab="manual"
        onAddBook={vi.fn()}
        onOpenCustomizer={onOpenCustomizer}
        onToast={vi.fn()}
      />
    );

    const warning = screen.getByTestId('shelf-full-warning');
    expect(warning).toHaveAttribute('role', 'alert');
    expect(warning).toHaveTextContent(/Level 1 — Section 1 is full/i);

    const submitBtn = screen.getByTestId('manual-submit-btn');
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveTextContent(/Shelf Full/i);

    // One-click switch to the next available compartment clears the warning
    fireEvent.click(screen.getByTestId('switch-available-shelf-btn'));
    expect(screen.queryByTestId('shelf-full-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('manual-submit-btn')).toHaveTextContent('Add to Bookshelf');
  });

  it('defaults BookSearchModal to the first non-full compartment when opened from toolbar', () => {
    const shelf = makeShelfWithFullFirstCompartment();

    render(
      <BookSearchModal
        open
        onClose={vi.fn()}
        bookshelf={shelf}
        onAddBook={vi.fn()}
        onToast={vi.fn()}
      />
    );

    const select = screen.getByLabelText('Destination shelf compartment') as HTMLSelectElement;
    expect(select.value).toBe('comp-1');
    expect(screen.queryByTestId('shelf-full-warning')).not.toBeInTheDocument();
  });

  it('shows an inline error banner in BookRevealModal when moving a book to a full compartment fails', async () => {
    const shelf = makeShelfWithFullFirstCompartment();
    const bookToMove = shelf.compartments[1].books[0];
    const onUpdateBook = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          409,
          'SHELF_FULL',
          'That compartment does not have enough horizontal room for this book.'
        )
      );
    const onToast = vi.fn();

    render(
      <BookRevealModal
        shelfBook={bookToMove}
        bookshelf={shelf}
        onClose={vi.fn()}
        onUpdateBook={onUpdateBook}
        onRemoveBook={vi.fn()}
        onToast={onToast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shelf Position' }));
    const select = screen.getByLabelText('Shelf Compartment');
    fireEvent.change(select, { target: { value: 'comp-0' } });

    const errorBanner = await screen.findByTestId('move-compartment-error');
    expect(errorBanner).toHaveAttribute('role', 'alert');
    expect(errorBanner).toHaveTextContent(
      /does not have enough horizontal room/i
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        expect.stringMatching(/does not have enough horizontal room/i),
        'error'
      )
    );
  });
});
