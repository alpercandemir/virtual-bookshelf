import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  getRoomThemeMeta,
  type BookshelfDto,
} from '@bookshelf/shared';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BookshelfProvider, useBookshelf } from './context/BookshelfContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { TopToolbar } from './components/layout/TopToolbar';
import { ToastRegion } from './components/layout/ToastRegion';
import { Bookshelf } from './components/bookshelf/Bookshelf';
import { ShareShelfDialog } from './components/bookshelf/ShareShelfDialog';
import { AllShelvesOverview } from './components/bookshelf/AllShelvesOverview';
import {
  ShelfCustomizerDrawer,
  type ShelfSortMode,
} from './components/customizer/ShelfCustomizerDrawer';
import { CreateShelfModal } from './components/customizer/CreateShelfModal';
import { BookRevealModal } from './components/book-detail/BookRevealModal';
import { BookSearchModal } from './components/search/BookSearchModal';
import { LibrarySearchPalette } from './components/search/LibrarySearchPalette';
import { ApiError } from './api/client';
import { arrangeBookshelf } from './utils/shelfSorting';

function LibraryWorkspace() {
  const { user, logout } = useAuth();
  const {
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
  } = useBookshelf();

  const [selectedShelfBookId, setSelectedShelfBookId] = useState<string | null>(
    null
  );
  const [locateRequest, setLocateRequest] = useState<{ bookId: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [targetCompartmentId, setTargetCompartmentId] = useState<string | null>(
    null
  );
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [createShelfOpen, setCreateShelfOpen] = useState(false);
  const [sharingShelf, setSharingShelf] = useState<BookshelfDto | null>(null);
  const [libraryFindOpen, setLibraryFindOpen] = useState(false);

  // Global ⌘K / Ctrl+K shortcut for Find in My Library
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (!sharingShelf && !searchOpen && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLibraryFindOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [sharingShelf, searchOpen]);

  // Keyboard Left/Right arrows switch bookshelves in Single Shelf Mode when no dialog/input is active
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        viewMode !== 'single' ||
        bookshelves.length <= 1 ||
        selectedShelfBookId ||
        searchOpen ||
        customizerOpen ||
        createShelfOpen ||
        libraryFindOpen ||
        sharingShelf
      ) {
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        goToPrevShelf();
      } else if (e.key === 'ArrowRight') {
        goToNextShelf();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewMode,
    bookshelves.length,
    selectedShelfBookId,
    searchOpen,
    customizerOpen,
    createShelfOpen,
    libraryFindOpen,
    sharingShelf,
    goToPrevShelf,
    goToNextShelf,
  ]);

  const selectedShelfBook = useMemo(() => {
    if (!bookshelf || !selectedShelfBookId) return null;
    return (
      bookshelf.compartments
        .flatMap((c) => c.books)
        .find((b) => b.id === selectedShelfBookId) ?? null
    );
  }, [bookshelf, selectedShelfBookId]);

  const totalBooks = useMemo(() => {
    if (!bookshelf) return 0;
    return bookshelf.compartments.reduce((acc, c) => acc + c.books.length, 0);
  }, [bookshelf]);

  if (!user) return null;

  if (loading && !bookshelf) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-[#cbb698]">
        <Loader2 className="w-8 h-8 animate-spin text-[#dfb86d]" />
        <p className="font-display text-xl">Illuminating your library...</p>
      </div>
    );
  }

  if (error && !bookshelf) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-red-200 text-sm">{error}</p>
        <button
          type="button"
          onClick={refreshBookshelf}
          className="rounded-lg bg-[#cfa458] text-[#1a1107] font-semibold text-sm px-4 py-2 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!bookshelf) return null;

  const roomMeta = getRoomThemeMeta(bookshelf.roomTheme);
  const isLightRoom = roomMeta.mode === 'light';
  const prevShelf =
    bookshelves.length > 1
      ? bookshelves[(activeIndex - 1 + bookshelves.length) % bookshelves.length]
      : null;
  const nextShelf =
    bookshelves.length > 1
      ? bookshelves[(activeIndex + 1) % bookshelves.length]
      : null;

  const handleReorderComplete = async (
    updatedBookshelf: BookshelfDto,
    payload: Array<{ compartmentId: string; shelfBookIds: string[] }>
  ): Promise<boolean> => {
    const previous = bookshelf;
    setActiveBookshelfOptimistic(updatedBookshelf);
    try {
      await persistReorder(payload, updatedBookshelf.id);
      return true;
    } catch (err) {
      setActiveBookshelfOptimistic(previous);
      pushToast(
        err instanceof ApiError
          ? err.message
          : 'Could not save the new book arrangement.',
        'error'
      );
      return false;
    }
  };

  const handleSortShelf = async (mode: ShelfSortMode) => {
    const { updatedBookshelf, payload, fits } = arrangeBookshelf(
      bookshelf,
      mode
    );
    if (!fits) {
      pushToast(
        'Not enough room across compartments to arrange the whole bookshelf. Try adding a shelf level in Customize.',
        'error'
      );
      return;
    }
    const saved = await handleReorderComplete(updatedBookshelf, payload);
    if (!saved) return;
    const labelMap: Record<ShelfSortMode, string> = {
      title: 'title',
      author: 'author',
      'author-last-name': 'author last name',
      height: 'height',
      color: 'color spectrum',
    };
    pushToast(`Arranged bookshelf by ${labelMap[mode]}.`, 'success');
  };

  return (
    <div
      className="library-room flex flex-col"
      data-room-theme={bookshelf.roomTheme}
      data-room-mode={roomMeta.mode}
    >
      <TopToolbar
        user={user}
        bookshelf={bookshelf}
        shelfCount={bookshelves.length}
        totalBooks={totalBooks}
        viewMode={viewMode}
        isLightRoom={isLightRoom}
        onToggleViewMode={() =>
          setViewMode(viewMode === 'overview' ? 'single' : 'overview')
        }
        onOpenCreateShelf={() => setCreateShelfOpen(true)}
        onOpenLibraryFind={() => setLibraryFindOpen(true)}
        onOpenSearch={() => {
          setTargetCompartmentId(null);
          setSearchOpen(true);
        }}
        onOpenCustomizer={() => setCustomizerOpen(true)}
        onShareShelf={() => setSharingShelf(bookshelf)}
        onLibraryRestore={refreshBookshelf}
        onToast={pushToast}
        onSeedSamples={() => seedSamples(bookshelf.id)}
        onLogout={logout}
      />

      {viewMode === 'overview' ? (
        <main className="flex-1">
          <AllShelvesOverview
            bookshelves={bookshelves}
            activeBookshelfId={bookshelf.id}
            isLightRoom={isLightRoom}
            onOpenShelf={(id) => selectBookshelf(id, true)}
            onCustomizeShelf={(id) => {
              selectBookshelf(id, false);
              setCustomizerOpen(true);
            }}
            onShareShelf={setSharingShelf}
            onCreateShelf={() => setCreateShelfOpen(true)}
            onReorderShelves={reorderBookshelves}
            onDeleteShelf={deleteBookshelf}
          />
        </main>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-start">
          {/* Compact Multi-Shelf Switcher Bar (shown when user has > 1 shelf) */}
          {bookshelves.length > 1 && (
            <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 pt-3 flex items-center justify-start sm:justify-center gap-2 overflow-x-auto no-scrollbar sm:flex-wrap">
              {bookshelves.map((s) => {
                const active = s.id === bookshelf.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectBookshelf(s.id, true)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 sm:py-1 text-xs border transition cursor-pointer shrink-0 ${
                      active
                        ? isLightRoom
                          ? 'bg-[#2a2219] text-[#faf4e8] border-[#2a2219] font-medium shadow-sm'
                          : 'bg-[#cfa458] text-[#1a1107] border-[#e5c27b] font-semibold shadow'
                        : isLightRoom
                          ? 'bg-white/65 hover:bg-white text-[#4b3e30] border-[#d3c6b2]'
                          : 'bg-[#1a130e]/75 hover:bg-[#281d15] text-[#cbb698] border-[#c9a15c]/22'
                    }`}
                  >
                    <span className="max-w-[130px] truncate">{s.name}</span>
                    {s.tag && (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                          active
                            ? isLightRoom
                              ? 'bg-white/20 text-[#faf4e8]'
                              : 'bg-black/20 text-[#1a1107]'
                            : isLightRoom
                              ? 'bg-[#e7dcc9] text-[#554431]'
                              : 'bg-[#cfa458]/18 text-[#e2be76]'
                        }`}
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {s.tag}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCreateShelfOpen(true)}
                data-testid="quick-new-shelf-btn"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 sm:py-1 text-xs border border-dashed transition cursor-pointer shrink-0 ${
                  isLightRoom
                    ? 'border-[#b9a78e] text-[#5d4e3d] hover:border-[#7d623b] hover:bg-white/60'
                    : 'border-[#c9a15c]/35 text-[#d7b572] hover:border-[#e0b86c] hover:bg-[#231912]/70'
                }`}
              >
                <Plus className="w-3 h-3" />
                New Shelf
              </button>
            </div>
          )}

          {totalBooks === 0 && (
            <div className="max-w-xl mx-auto mt-4 px-4 text-center">
              <div
                className={`inline-flex flex-wrap items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-xs shadow ${
                  isLightRoom
                    ? 'border-[#d3c6b2] bg-white/80 text-[#463a2c]'
                    : 'border-[#c9a15c]/22 bg-[#1c140e]/85 text-[#d6c3a6]'
                }`}
              >
                <span>This shelf is freshly crafted and ready for your books.</span>
                <button
                  type="button"
                  onClick={() => seedSamples(bookshelf.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#342416] hover:bg-[#44301d] border border-[#dab468]/45 px-2.5 py-1 text-xs font-medium text-[#f7e3bb] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#e4be73]" />
                  Stock Sample Classics
                </button>
              </div>
            </div>
          )}

          {/* Stage with Left & Right Shelf Arrow Navigation */}
          <div className="relative w-full flex items-center justify-center">
            {prevShelf && (
              <button
                type="button"
                onClick={goToPrevShelf}
                data-testid="prev-shelf-arrow"
                title={`Previous shelf: ${prevShelf.name}${prevShelf.tag ? ` (${prevShelf.tag})` : ''}`}
                aria-label={`Previous shelf: ${prevShelf.name}`}
                className={`hidden xl:flex fixed left-4 2xl:left-6 top-1/2 -translate-y-1/2 z-20 flex-col items-center justify-center w-11 h-20 rounded-2xl border backdrop-blur-md shadow-lg transition hover:scale-105 cursor-pointer ${
                  isLightRoom
                    ? 'bg-white/80 hover:bg-white border-[#cfc2ae] text-[#352b20]'
                    : 'bg-[#1a130e]/80 hover:bg-[#2a1e15]/95 border-[#c9a15c]/30 text-[#ebd6b1]'
                }`}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <Bookshelf
              key={bookshelf.id}
              locateRequest={locateRequest}
              onLocated={() => setLocateRequest(null)}
              bookshelf={bookshelf}
              onSelectBook={(sb) => setSelectedShelfBookId(sb.id)}
              onQuickAddToCompartment={(compId) => {
                setTargetCompartmentId(compId);
                setSearchOpen(true);
              }}
              onReorderComplete={handleReorderComplete}
              onInvalidDrop={(msg) => pushToast(msg, 'error')}
              recentlyAddedId={recentlyAddedId}
            />

            {nextShelf && (
              <button
                type="button"
                onClick={goToNextShelf}
                data-testid="next-shelf-arrow"
                title={`Next shelf: ${nextShelf.name}${nextShelf.tag ? ` (${nextShelf.tag})` : ''}`}
                aria-label={`Next shelf: ${nextShelf.name}`}
                className={`hidden xl:flex fixed right-4 2xl:right-6 top-1/2 -translate-y-1/2 z-20 flex-col items-center justify-center w-11 h-20 rounded-2xl border backdrop-blur-md shadow-lg transition hover:scale-105 cursor-pointer ${
                  isLightRoom
                    ? 'bg-white/80 hover:bg-white border-[#cfc2ae] text-[#352b20]'
                    : 'bg-[#1a130e]/80 hover:bg-[#2a1e15]/95 border-[#c9a15c]/30 text-[#ebd6b1]'
                }`}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Mobile Prev/Next Shelf Arrows */}
          {bookshelves.length > 1 && (
            <div className="flex md:hidden items-center justify-center gap-3 px-3 pb-3 w-full max-w-md">
              <button
                type="button"
                onClick={goToPrevShelf}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs cursor-pointer min-w-0 ${
                  isLightRoom
                    ? 'bg-white/80 border-[#cfc2ae] text-[#352b20]'
                    : 'bg-[#1b140e]/80 border-[#c9a15c]/28 text-[#e7d4b3]'
                }`}
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="max-w-[110px] truncate">{prevShelf?.name}</span>
              </button>
              <span className="text-xs opacity-70 tabular-nums shrink-0">
                {activeIndex + 1} / {bookshelves.length}
              </span>
              <button
                type="button"
                onClick={goToNextShelf}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs cursor-pointer min-w-0 ${
                  isLightRoom
                    ? 'bg-white/80 border-[#cfc2ae] text-[#352b20]'
                    : 'bg-[#1b140e]/80 border-[#c9a15c]/28 text-[#e7d4b3]'
                }`}
              >
                <span className="max-w-[110px] truncate">{nextShelf?.name}</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          )}

          <p
            className={`text-[11px] pb-[max(1.5rem,env(safe-area-inset-bottom))] px-4 text-center ${
              isLightRoom ? 'text-[#736452]' : 'text-[#7e6c57]'
            }`}
          >
            <span className="sm:hidden">
              Swipe between compartments &middot; Press &amp; hold a book to rearrange
            </span>
            <span className="hidden sm:inline">
              Click any spine to pull it from the shelf &middot; Drag volumes to rearrange &middot;{' '}
              {bookshelves.length > 1
                ? 'Use ← / → arrows to switch shelves or open All Shelves'
                : 'Create multiple shelves by year or genre anytime'}
            </span>
          </p>
        </main>
      )}

      {sharingShelf && <ShareShelfDialog shelf={sharingShelf} onClose={() => setSharingShelf(null)} />}

      {/* Modals & Drawers */}
      <BookRevealModal
        shelfBook={selectedShelfBook}
        bookshelf={bookshelf}
        allBookshelves={bookshelves}
        onClose={() => setSelectedShelfBookId(null)}
        onUpdateBook={updateShelfBook}
        onRemoveBook={removeShelfBook}
        onToast={pushToast}
      />

      <BookSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        bookshelf={bookshelf}
        allBookshelves={bookshelves}
        initialCompartmentId={targetCompartmentId}
        onAddBook={addBookToShelf}
        onOpenCustomizer={() => {
          setSearchOpen(false);
          setCustomizerOpen(true);
        }}
        onToast={pushToast}
      />

      <LibrarySearchPalette
        open={libraryFindOpen}
        onClose={() => setLibraryFindOpen(false)}
        bookshelves={bookshelves}
        onShowOnShelf={(shelfId, sb) => {
          selectBookshelf(shelfId, true);
          setSelectedShelfBookId(null);
          setLocateRequest({ bookId: sb.id });
        }}
        onSelectResult={(shelfId, sb) => {
          selectBookshelf(shelfId, true);
          setSelectedShelfBookId(sb.id);
        }}
      />

      <ShelfCustomizerDrawer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        bookshelf={bookshelf}
        canDelete={bookshelves.length > 1}
        onUpdateMeta={(payload) => updateBookshelfMeta(payload, bookshelf.id)}
        onUpdateLayout={(levels) => updateLayout(levels, bookshelf.id)}
        onResetLayout={() => resetLayout(bookshelf.id)}
        onSortShelf={handleSortShelf}
        onDeleteShelf={() => deleteBookshelf(bookshelf.id)}
      />

      <CreateShelfModal
        open={createShelfOpen}
        onClose={() => setCreateShelfOpen(false)}
        onCreate={createBookshelf}
      />

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#dfb86d]" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <BookshelfProvider>
      <LibraryWorkspace />
    </BookshelfProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
