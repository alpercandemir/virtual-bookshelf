import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  BookOrientation,
  BookshelfConfiguration,
  BookshelfDto,
  BookVisualOverrides,
  LayoutLevelInput,
  RoomTheme,
  ShelfBookDto,
  WoodFinish,
} from '@bookshelf/shared';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

export interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export type ShelfViewMode = 'single' | 'overview';

interface BookshelfContextValue {
  bookshelves: BookshelfDto[];
  bookshelf: BookshelfDto | null;
  activeIndex: number;
  viewMode: ShelfViewMode;
  setViewMode: (mode: ShelfViewMode) => void;
  selectBookshelf: (bookshelfId: string, switchToSingle?: boolean) => void;
  goToPrevShelf: () => void;
  goToNextShelf: () => void;
  loading: boolean;
  error: string | null;
  recentlyAddedId: string | null;
  toasts: ToastItem[];
  pushToast: (message: string, tone?: ToastItem['tone']) => void;
  dismissToast: (id: string) => void;
  refreshBookshelf: () => Promise<void>;
  setActiveBookshelfOptimistic: (updated: BookshelfDto) => void;
  createBookshelf: (payload: {
    name: string;
    tag?: string | null;
    visualTheme?: WoodFinish;
    roomTheme?: RoomTheme;
    levelCount?: number;
    seedSamples?: boolean;
  }) => Promise<BookshelfDto>;
  reorderBookshelves: (bookshelfIds: string[]) => Promise<void>;
  deleteBookshelf: (bookshelfId: string) => Promise<void>;
  updateBookshelfMeta: (
    payload: {
      name?: string;
      tag?: string | null;
      visualTheme?: WoodFinish;
      roomTheme?: RoomTheme;
      configuration?: BookshelfConfiguration;
    },
    targetId?: string
  ) => Promise<void>;
  updateLayout: (levels: LayoutLevelInput[], targetId?: string) => Promise<void>;
  resetLayout: (targetId?: string) => Promise<void>;
  seedSamples: (targetId?: string) => Promise<void>;
  addBookToShelf: (
    payload: Parameters<typeof api.addBook>[0]
  ) => Promise<ShelfBookDto>;
  updateShelfBook: (
    shelfBookId: string,
    payload: {
      compartmentId?: string;
      position?: number;
      orientation?: BookOrientation;
      visualOverrides?: BookVisualOverrides;
    }
  ) => Promise<ShelfBookDto>;
  removeShelfBook: (shelfBookId: string) => Promise<void>;
  persistReorder: (
    compartments: Array<{ compartmentId: string; shelfBookIds: string[] }>,
    bookshelfId?: string
  ) => Promise<void>;
}

const BookshelfContext = createContext<BookshelfContextValue | null>(null);

export function BookshelfProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bookshelves, setBookshelves] = useState<BookshelfDto[]>([]);
  const [activeBookshelfId, setActiveBookshelfId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ShelfViewMode>('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, tone: ToastItem['tone'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const replaceShelfInState = useCallback((updated: BookshelfDto) => {
    setBookshelves((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      if (!exists) return [...prev, updated];
      return prev.map((s) => (s.id === updated.id ? updated : s));
    });
  }, []);

  const refreshBookshelf = useCallback(async () => {
    if (!user) {
      setBookshelves([]);
      setActiveBookshelfId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBookshelves();
      setBookshelves(res.bookshelves);
      setActiveBookshelfId((curr) => {
        if (curr && res.bookshelves.some((s) => s.id === curr)) return curr;
        return res.bookshelves[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bookshelves.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshBookshelf();
  }, [refreshBookshelf]);

  const activeIndex = useMemo(() => {
    if (bookshelves.length === 0) return -1;
    const idx = bookshelves.findIndex((s) => s.id === activeBookshelfId);
    return idx >= 0 ? idx : 0;
  }, [bookshelves, activeBookshelfId]);

  const bookshelf = useMemo(() => {
    if (activeIndex < 0) return null;
    return bookshelves[activeIndex] ?? null;
  }, [bookshelves, activeIndex]);

  const selectBookshelf = useCallback(
    (bookshelfId: string, switchToSingle = false) => {
      setActiveBookshelfId(bookshelfId);
      if (switchToSingle) {
        setViewMode('single');
      }
    },
    []
  );

  const goToPrevShelf = useCallback(() => {
    if (bookshelves.length <= 1) return;
    const nextIdx = (activeIndex - 1 + bookshelves.length) % bookshelves.length;
    setActiveBookshelfId(bookshelves[nextIdx].id);
  }, [bookshelves, activeIndex]);

  const goToNextShelf = useCallback(() => {
    if (bookshelves.length <= 1) return;
    const nextIdx = (activeIndex + 1) % bookshelves.length;
    setActiveBookshelfId(bookshelves[nextIdx].id);
  }, [bookshelves, activeIndex]);

  const setActiveBookshelfOptimistic = useCallback(
    (updated: BookshelfDto) => {
      replaceShelfInState(updated);
    },
    [replaceShelfInState]
  );

  const createBookshelf = useCallback(
    async (payload: {
      name: string;
      tag?: string | null;
      visualTheme?: WoodFinish;
      roomTheme?: RoomTheme;
      levelCount?: number;
      seedSamples?: boolean;
    }) => {
      const res = await api.createBookshelf(payload);
      setBookshelves(res.bookshelves);
      setActiveBookshelfId(res.bookshelf.id);
      setViewMode('single');
      pushToast(`Created shelf "${res.bookshelf.name}".`, 'success');
      return res.bookshelf;
    },
    [pushToast]
  );

  const reorderBookshelves = useCallback(
    async (bookshelfIds: string[]) => {
      // Optimistically reorder immediately for snappy UX
      setBookshelves((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        return bookshelfIds
          .map((id, idx) => {
            const s = byId.get(id);
            return s ? { ...s, ordering: idx } : null;
          })
          .filter((s): s is BookshelfDto => s !== null);
      });
      const res = await api.reorderBookshelves(bookshelfIds);
      setBookshelves(res.bookshelves);
    },
    []
  );

  const deleteBookshelf = useCallback(
    async (bookshelfId: string) => {
      const res = await api.deleteBookshelf(bookshelfId);
      setBookshelves(res.bookshelves);
      setActiveBookshelfId((curr) =>
        curr === bookshelfId ? res.bookshelves[0]?.id ?? null : curr
      );
      pushToast('Bookshelf deleted.', 'info');
    },
    [pushToast]
  );

  const updateBookshelfMeta = useCallback(
    async (
      payload: {
        name?: string;
        tag?: string | null;
        visualTheme?: WoodFinish;
        roomTheme?: RoomTheme;
        configuration?: BookshelfConfiguration;
      },
      targetId?: string
    ) => {
      const id = targetId ?? bookshelf?.id;
      if (!id) return;
      const res = await api.updateBookshelf(id, payload);
      replaceShelfInState(res.bookshelf);
    },
    [bookshelf?.id, replaceShelfInState]
  );

  const updateLayout = useCallback(
    async (levels: LayoutLevelInput[], targetId?: string) => {
      const id = targetId ?? bookshelf?.id;
      if (!id) return;
      const res = await api.updateLayout(id, levels);
      replaceShelfInState(res.bookshelf);
      pushToast('Bookshelf structure updated.', 'success');
    },
    [bookshelf?.id, replaceShelfInState, pushToast]
  );

  const resetLayout = useCallback(
    async (targetId?: string) => {
      const id = targetId ?? bookshelf?.id;
      if (!id) return;
      const res = await api.resetLayout(id);
      replaceShelfInState(res.bookshelf);
      pushToast('Restored classic layout.', 'success');
    },
    [bookshelf?.id, replaceShelfInState, pushToast]
  );

  const seedSamples = useCallback(
    async (targetId?: string) => {
      const id = targetId ?? bookshelf?.id;
      if (!id) return;
      const res = await api.seedSamples(id);
      replaceShelfInState(res.bookshelf);
      pushToast('Added starter library collection.', 'success');
    },
    [bookshelf?.id, replaceShelfInState, pushToast]
  );

  const addBookToShelf = useCallback(
    async (payload: Parameters<typeof api.addBook>[0]) => {
      const res = await api.addBook({
        bookshelfId: payload.bookshelfId ?? bookshelf?.id,
        ...payload,
      });
      replaceShelfInState(res.bookshelf);
      setRecentlyAddedId(res.addedShelfBook.id);
      window.setTimeout(() => {
        setRecentlyAddedId((curr) => (curr === res.addedShelfBook.id ? null : curr));
      }, 1500);
      pushToast(`Shelved "${res.addedShelfBook.book.title}".`, 'success');
      return res.addedShelfBook;
    },
    [bookshelf?.id, replaceShelfInState, pushToast]
  );

  const updateShelfBook = useCallback(
    async (
      shelfBookId: string,
      payload: {
        compartmentId?: string;
        position?: number;
        orientation?: BookOrientation;
        visualOverrides?: BookVisualOverrides;
      }
    ) => {
      const res = await api.updateShelfBook(shelfBookId, payload);
      // If moved to a different bookshelf, refresh all shelves so source & target both update cleanly
      if (bookshelf && res.bookshelf.id !== bookshelf.id) {
        const all = await api.getBookshelves();
        setBookshelves(all.bookshelves);
      } else {
        replaceShelfInState(res.bookshelf);
      }
      return res.shelfBook;
    },
    [bookshelf, replaceShelfInState]
  );

  const removeShelfBook = useCallback(
    async (shelfBookId: string) => {
      const res = await api.removeShelfBook(shelfBookId);
      replaceShelfInState(res.bookshelf);
      pushToast('Removed book from your bookshelf.', 'info');
    },
    [replaceShelfInState, pushToast]
  );

  const persistReorder = useCallback(
    async (
      compartments: Array<{ compartmentId: string; shelfBookIds: string[] }>,
      bookshelfId?: string
    ) => {
      const res = await api.reorderBooks(compartments, bookshelfId ?? bookshelf?.id);
      replaceShelfInState(res.bookshelf);
    },
    [bookshelf?.id, replaceShelfInState]
  );

  return (
    <BookshelfContext.Provider
      value={{
        bookshelves,
        bookshelf,
        activeIndex,
        viewMode,
        setViewMode,
        selectBookshelf,
        goToPrevShelf,
        goToNextShelf,
        loading,
        error,
        recentlyAddedId,
        toasts,
        pushToast,
        dismissToast,
        refreshBookshelf,
        setActiveBookshelfOptimistic,
        createBookshelf,
        reorderBookshelves,
        deleteBookshelf,
        updateBookshelfMeta,
        updateLayout,
        resetLayout,
        seedSamples,
        addBookToShelf,
        updateShelfBook,
        removeShelfBook,
        persistReorder,
      }}
    >
      {children}
    </BookshelfContext.Provider>
  );
}

export function useBookshelf(): BookshelfContextValue {
  const ctx = useContext(BookshelfContext);
  if (!ctx) {
    throw new Error('useBookshelf must be used inside BookshelfProvider');
  }
  return ctx;
}
