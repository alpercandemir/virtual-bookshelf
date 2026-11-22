import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  resolvePhysicalDimensions,
  type BookshelfDto,
  type ShelfScanResponse,
} from '@bookshelf/shared';
import { BookSearchModal } from '../components/search/BookSearchModal';
import { api, ApiError } from '../api/client';

vi.mock('../utils/extractCoverPalette', () => ({
  extractCoverPaletteFromUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('../utils/optimizeShelfPhoto', () => ({
  optimizeShelfPhoto: vi.fn(async (file: File) => ({
    file,
    originalBytes: file.size,
    optimizedBytes: file.size,
    width: 1600,
    height: 1200,
    wasResized: false,
  })),
}));

function makeTestBookshelf(): BookshelfDto {
  return {
    id: 'shelf-1',
    userId: 'user-1',
    name: 'Study Shelf',
    tag: '2026',
    visualTheme: 'walnut',
    roomTheme: 'antique-study',
    ordering: 0,
    configuration: { showSconceLight: true },
    compartments: [
      {
        id: 'comp-1',
        bookshelfId: 'shelf-1',
        row: 0,
        column: 0,
        ordering: 0,
        widthRatio: 1,
        heightPx: 285,
        settings: { label: 'Fiction' },
        books: [
          {
            id: 'sb-existing',
            bookshelfId: 'shelf-1',
            compartmentId: 'comp-1',
            bookId: 'book-existing',
            position: 0,
            visualOverrides: {},
            orientation: 'vertical',
            book: {
              id: 'book-existing',
              provider: 'google_books',
              providerBookId: 'gb-other-id',
              isbn: '0441172717',
              title: 'Dune',
              authors: ['Frank Herbert'],
              publisher: 'Ace',
              publicationDate: '1990',
              pageCount: 688,
              physicalDimensions: resolvePhysicalDimensions({
                pageCount: 688,
                format: 'hardcover',
                title: 'Dune',
              }),
              coverUrl: null,
              metadata: {},
            },
          },
        ],
      },
    ],
  };
}

describe('<BookSearchModal /> Scan Photo tab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom doesn't implement createObjectURL by default
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        value: vi.fn(() => 'blob:mock-shelf-preview'),
      });
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-shelf-preview');
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        writable: true,
        value: vi.fn(),
      });
    }
  });

  it('keeps scan review through shelf refreshes and retries only unsaved books', async () => {
    const mockScanResponse: ShelfScanResponse = {
      model: 'gemini-3.5-flash-lite',
      cached: false,
      detectedCount: 3,
      matchedCount: 2,
      books: [
        {
          scanId: 'scan-1',
          shelfRow: 1,
          position: 1,
          detectedTitle: 'Dune',
          detectedAuthor: 'Frank Herbert',
          language: 'en',
          spineColorHex: '#C27A2B',
          confidence: 'high',
          matchStatus: 'matched',
          matches: [
            {
              id: 'google_books:gb-existing-dune',
              provider: 'google_books',
              providerBookId: 'gb-other-id',
              isbn: '0441172717',
              title: 'Dune',
              subtitle: null,
              authors: ['Frank Herbert'],
              publisher: 'Ace',
              publicationDate: '1990',
              pageCount: 688,
              description: null,
              categories: ['Science Fiction'],
              language: 'en',
              coverUrl: null,
              physicalDimensions: resolvePhysicalDimensions({
                pageCount: 688,
                format: 'hardcover',
                title: 'Dune',
              }),
            },
          ],
        },
        {
          scanId: 'scan-3',
          shelfRow: 1,
          position: 2,
          detectedTitle: 'Dune',
          detectedAuthor: 'Another Author',
          language: 'en',
          spineColorHex: null,
          confidence: 'medium',
          matchStatus: 'unmatched',
          matches: [],
        },
        {
          scanId: 'scan-2',
          shelfRow: 2,
          position: 2,
          detectedTitle: 'The Left Hand of Darkness',
          detectedAuthor: 'Ursula K. Le Guin',
          language: 'en',
          spineColorHex: '#233B5D',
          confidence: 'high',
          matchStatus: 'matched',
          matches: [
            {
              id: 'google_books:gb-lhod',
              provider: 'google_books',
              providerBookId: 'gb-lhod',
              isbn: '9780441478125',
              title: 'The Left Hand of Darkness',
              subtitle: null,
              authors: ['Ursula K. Le Guin'],
              publisher: 'Ace',
              publicationDate: '1969',
              pageCount: 304,
              description: null,
              categories: ['Science Fiction'],
              language: 'en',
              coverUrl: null,
              physicalDimensions: resolvePhysicalDimensions({
                pageCount: 304,
                format: 'trade-paperback',
                title: 'The Left Hand of Darkness',
              }),
            },
          ],
        },
      ],
    };

    vi.spyOn(api, 'getShelfScanStatus').mockResolvedValue({
      enabled: true,
      model: 'gemini-3.5-flash-lite',
    });
    vi.spyOn(api, 'scanShelfPhoto').mockResolvedValue(mockScanResponse);

    const onSave = vi.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(409, 'SHELF_FULL', 'Shelf is full'))
      .mockResolvedValue({});
    const onToast = vi.fn();
    const onClose = vi.fn();

    function TestLibrary() {
      const [bookshelf, setBookshelf] = React.useState(() => {
        const shelf = makeTestBookshelf();
        shelf.compartments.push(
          { ...shelf.compartments[0], id: 'comp-2', row: 1, books: [] },
          { ...shelf.compartments[0], id: 'comp-3', row: 2, books: [] }
        );
        return shelf;
      });
      return (
        <BookSearchModal
          open
          onClose={onClose}
          bookshelf={bookshelf}
          onAddBook={async (payload) => {
            await onSave(payload);
            setBookshelf((prev) => structuredClone(prev));
          }}
          onToast={onToast}
        />
      );
    }
    render(<TestLibrary />);

    // Switch to Scan Photo tab
    fireEvent.click(screen.getByTestId('scan-photo-tab-btn'));

    // Wait for status check to finish and upload input to appear
    const fileInput = await screen.findByTestId('shelf-photo-input');
    const mockFile = new File(['fake-jpg'], 'my-shelf.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    // Click Analyze Shelf Photo
    const analyzeBtn = await screen.findByTestId('analyze-shelf-btn');
    fireEvent.click(analyzeBtn);

    await screen.findByTestId('scanned-books-list');
    expect(screen.getByText('Owned edition')).toBeInTheDocument();
    expect(screen.getByText('Possible match')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Keep photo layout'));
    expect(screen.getByLabelText('Photo row 1')).toHaveValue('comp-1');
    expect(screen.getByLabelText('Photo row 2')).toHaveValue('comp-2');

    const shelveBtn = screen.getByTestId('shelve-scanned-books-btn');
    expect(shelveBtn).toHaveTextContent('Shelve 2 Books');
    fireEvent.click(shelveBtn);

    expect(await screen.findByText('Shelved', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/This book does not fit/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave.mock.calls.map(([input]) => [input.compartmentId, input.book.title])).toEqual([
      ['comp-1', 'Dune'],
      ['comp-2', 'The Left Hand of Darkness'],
    ]);

    fireEvent.change(screen.getByLabelText('Photo row 2'), { target: { value: 'comp-3' } });
    fireEvent.click(shelveBtn);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(onSave.mock.lastCall?.[0]).toMatchObject({
      compartmentId: 'comp-3',
      book: { title: 'The Left Hand of Darkness' },
    });
  });
});
