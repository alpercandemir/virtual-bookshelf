import type {
  BookOrientation,
  BookshelfConfiguration,
  BookshelfDto,
  BookVisualOverrides,
  LayoutLevelInput,
  RoomTheme,
  SearchResponse,
  ShelfBookDto,
  ShelfScanResponse,
  ShelfScanStatusResponse,
  UserDto,
  WoodFinish,
} from '@bookshelf/shared';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errPayload = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(
      res.status,
      errPayload?.code ?? 'REQUEST_FAILED',
      errPayload?.message ?? `Request failed (${res.status})`
    );
  }
  return data as T;
}

export function getProxiedCoverUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) return null;
  if (coverUrl.startsWith('/uploads/') || coverUrl.startsWith('/api/covers/proxy')) {
    return coverUrl;
  }
  if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
    return `/api/covers/proxy?url=${encodeURIComponent(coverUrl)}`;
  }
  return coverUrl;
}

export const api = {
  // Auth
  me: () => requestJson<{ user: UserDto | null }>('/api/auth/me'),

  register: (payload: { username: string; password: string; seedSamples?: boolean }) =>
    requestJson<{ user: UserDto }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { username: string; password: string }) =>
    requestJson<{ user: UserDto }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  // Bookshelves (Multi-Shelf Support)
  getBookshelves: () =>
    requestJson<{ bookshelves: BookshelfDto[] }>('/api/bookshelves'),

  createBookshelf: (payload: {
    name: string;
    tag?: string | null;
    visualTheme?: WoodFinish;
    roomTheme?: RoomTheme;
    levelCount?: number;
    seedSamples?: boolean;
  }) =>
    requestJson<{ bookshelf: BookshelfDto; bookshelves: BookshelfDto[] }>(
      '/api/bookshelves',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  reorderBookshelves: (bookshelfIds: string[]) =>
    requestJson<{ bookshelves: BookshelfDto[] }>('/api/bookshelves/reorder', {
      method: 'POST',
      body: JSON.stringify({ bookshelfIds }),
    }),

  deleteBookshelf: (bookshelfId: string) =>
    requestJson<{ bookshelves: BookshelfDto[] }>(
      `/api/bookshelves/${encodeURIComponent(bookshelfId)}`,
      {
        method: 'DELETE',
      }
    ),

  getBookshelf: () => requestJson<{ bookshelf: BookshelfDto }>('/api/bookshelf'),

  updateBookshelf: (
    bookshelfId: string,
    payload: {
      name?: string;
      tag?: string | null;
      visualTheme?: WoodFinish;
      roomTheme?: RoomTheme;
      configuration?: BookshelfConfiguration;
    }
  ) =>
    requestJson<{ bookshelf: BookshelfDto }>(
      `/api/bookshelves/${encodeURIComponent(bookshelfId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  updateLayout: (bookshelfId: string, levels: LayoutLevelInput[]) =>
    requestJson<{ bookshelf: BookshelfDto }>(
      `/api/bookshelves/${encodeURIComponent(bookshelfId)}/layout`,
      {
        method: 'PUT',
        body: JSON.stringify({ levels }),
      }
    ),

  resetLayout: (bookshelfId: string) =>
    requestJson<{ bookshelf: BookshelfDto }>(
      `/api/bookshelves/${encodeURIComponent(bookshelfId)}/layout/reset`,
      {
        method: 'POST',
      }
    ),

  seedSamples: (bookshelfId: string) =>
    requestJson<{ bookshelf: BookshelfDto }>(
      `/api/bookshelves/${encodeURIComponent(bookshelfId)}/seed-samples`,
      {
        method: 'POST',
      }
    ),

  // Book Search & Discovery
  searchBooks: (params: {
    q: string;
    type?: 'all' | 'title' | 'author' | 'isbn';
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams({
      q: params.q,
      type: params.type ?? 'all',
      page: String(params.page ?? 1),
      limit: String(params.limit ?? 12),
    });
    return requestJson<SearchResponse>(`/api/books/search?${qs.toString()}`);
  },

  // Shelf Book Management
  addBook: (payload: {
    bookshelfId?: string;
    compartmentId?: string;
    position?: number;
    book: {
      provider: 'google_books' | 'open_library' | 'manual';
      providerBookId?: string | null;
      isbn?: string | null;
      title: string;
      subtitle?: string | null;
      authors: string[];
      publisher?: string | null;
      publicationDate?: string | null;
      pageCount?: number | null;
      coverUrl?: string | null;
      description?: string | null;
      categories?: string[];
      language?: string | null;
      format?: 'hardcover' | 'trade-paperback' | 'mass-market' | 'quarto' | 'pocket';
      heightMm?: number | null;
      widthMm?: number | null;
      thicknessMm?: number | null;
      dimensionSource?: 'verified' | 'estimated';
    };
    visualOverrides?: BookVisualOverrides;
  }) =>
    requestJson<{ bookshelf: BookshelfDto; addedShelfBook: ShelfBookDto }>(
      '/api/bookshelf/books',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateShelfBook: (
    shelfBookId: string,
    payload: {
      compartmentId?: string;
      position?: number;
      orientation?: BookOrientation;
      visualOverrides?: BookVisualOverrides;
    }
  ) =>
    requestJson<{ bookshelf: BookshelfDto; shelfBook: ShelfBookDto }>(
      `/api/bookshelf/books/${encodeURIComponent(shelfBookId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  reorderBooks: (
    compartments: Array<{ compartmentId: string; shelfBookIds: string[] }>,
    bookshelfId?: string
  ) =>
    requestJson<{ bookshelf: BookshelfDto }>('/api/bookshelf/books/reorder', {
      method: 'POST',
      body: JSON.stringify({ bookshelfId, compartments }),
    }),

  removeShelfBook: (shelfBookId: string) =>
    requestJson<{ bookshelf: BookshelfDto }>(
      `/api/bookshelf/books/${encodeURIComponent(shelfBookId)}`,
      {
        method: 'DELETE',
      }
    ),

  uploadBookImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson<{ url: string }>('/api/uploads/book-image', {
      method: 'POST',
      body: formData,
    });
  },

  // Shelf Photo Scanning (Gemini Vision)
  getShelfScanStatus: () =>
    requestJson<ShelfScanStatusResponse>('/api/books/scan-shelf/status'),

  scanShelfPhoto: async (file: File): Promise<ShelfScanResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson<ShelfScanResponse>('/api/books/scan-shelf', {
      method: 'POST',
      body: formData,
    });
  },
};
