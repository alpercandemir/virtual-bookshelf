import React, { useState } from 'react';
import {
  Command,
  LayoutGrid,
  Library,
  LogOut,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  User,
} from 'lucide-react';
import type { BookshelfDto, UserDto } from '@bookshelf/shared';
import { LibraryBackupActions } from './LibraryBackupActions';
import type { ShelfViewMode } from '../../context/BookshelfContext';

interface TopToolbarProps {
  user: UserDto;
  bookshelf: BookshelfDto;
  shelfCount: number;
  totalBooks: number;
  viewMode: ShelfViewMode;
  isLightRoom: boolean;
  onToggleViewMode: () => void;
  onOpenCreateShelf: () => void;
  onOpenLibraryFind: () => void;
  onOpenSearch: () => void;
  onOpenCustomizer: () => void;
  onLibraryRestore: () => Promise<void>;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onShareShelf: () => void;
  onSeedSamples: () => void;
  onLogout: () => void;
}

export function TopToolbar({
  user,
  bookshelf,
  shelfCount,
  totalBooks,
  viewMode,
  isLightRoom,
  onToggleViewMode,
  onOpenCreateShelf,
  onOpenLibraryFind,
  onOpenSearch,
  onOpenCustomizer,
  onLibraryRestore,
  onToast,
  onShareShelf,
  onSeedSamples,
  onLogout,
}: TopToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const secondaryBtnClass = isLightRoom
    ? 'border-[#cfc2ae] bg-white/80 hover:bg-[#f4ece0] hover:border-[#a78652] text-[#2a2219]'
    : 'border-[#c9a15c]/25 bg-[#1e1610] hover:bg-[#2a1f17] hover:border-[#dfb86d]/45 text-[#e8d7bc]';

  return (
    <header
      className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-300 ${
        isLightRoom
          ? 'border-[#d6cab7] bg-[#f7f3ec]/85 text-[#231d17]'
          : 'border-[#c9a15c]/15 bg-[#150f0b]/85 text-[#f6ead7]'
      }`}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Library Brand, Tag Pill & Count */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`hidden sm:flex w-9 h-9 rounded-lg border items-center justify-center shrink-0 shadow ${
              isLightRoom
                ? 'bg-gradient-to-b from-[#efe7d8] to-[#dfd3bf] border-[#c4b193]'
                : 'bg-gradient-to-b from-[#3d2919] to-[#23160d] border-[#cfa55a]/35'
            }`}
          >
            <Library
              className={`w-4 h-4 ${
                isLightRoom ? 'text-[#7b5928]' : 'text-[#e2be74]'
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="font-display text-lg sm:text-2xl font-semibold truncate leading-tight">
                {viewMode === 'overview' ? 'All Bookshelves' : bookshelf.name}
              </h1>
              {viewMode === 'single' && bookshelf.tag && (
                <span
                  className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                    isLightRoom
                      ? 'bg-[#e6dac6] text-[#4b3822]'
                      : 'bg-[#cfa458]/20 border border-[#cfa458]/40 text-[#ebd093]'
                  }`}
                >
                  <Tag className="w-2.5 h-2.5" />
                  {bookshelf.tag}
                </span>
              )}
            </div>
            <p
              className={`text-[11px] leading-none mt-0.5 truncate ${
                isLightRoom ? 'text-[#6c5d4c]' : 'text-[#a79277]'
              }`}
            >
              {viewMode === 'overview'
                ? `${shelfCount} ${shelfCount === 1 ? 'bookshelf' : 'bookshelves'}`
                : `${totalBooks} ${totalBooks === 1 ? 'volume' : 'volumes'} · ${bookshelf.visualTheme.replace('-', ' ')}`}
            </p>
          </div>
        </div>

        {/* Right: Streamlined Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Global Find in Library (⌘K) */}
          <button
            type="button"
            onClick={onOpenLibraryFind}
            data-testid="open-library-find-btn"
            title="Find a book in your library (⌘K)"
            aria-label="Find in my library"
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs w-9 h-9 sm:w-auto sm:h-auto sm:px-2.5 sm:py-2 transition cursor-pointer whitespace-nowrap shrink-0 ${secondaryBtnClass}`}
          >
            <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#c49849] shrink-0" />
            <span className="hidden lg:inline">Find</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-current/20 px-1 py-0.2 text-[10px] opacity-65 font-mono">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          {/* All Shelves Mission Control Toggle */}
          <button
            type="button"
            onClick={onToggleViewMode}
            data-testid="toggle-all-shelves-btn"
            title={
              viewMode === 'overview'
                ? 'Return to Single Shelf View'
                : 'View All Shelves Together'
            }
            aria-label={
              viewMode === 'overview'
                ? 'Return to Single Shelf View'
                : `All Shelves (${shelfCount})`
            }
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs sm:text-sm w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'overview'
                ? 'bg-[#cfa458] border-[#e2be79] text-[#1a1107] font-semibold shadow'
                : secondaryBtnClass
            }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">
              {viewMode === 'overview' ? 'Single Shelf' : `All Shelves (${shelfCount})`}
            </span>
          </button>

          {viewMode === 'single' ? (
            <>
              <button
                type="button"
                onClick={onOpenSearch}
                data-testid="open-search-btn"
                className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] text-[#1a1107] font-semibold text-xs sm:text-sm h-9 sm:h-auto px-2.5 sm:px-3.5 sm:py-2 shadow-[0_4px_14px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,244,214,0.45)] transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add Book</span>
              </button>

              <button
                type="button"
                aria-label="Share shelf"
                title="Share shelf"
                onClick={onShareShelf}
                className={`inline-flex items-center justify-center rounded-lg border w-9 h-9 shrink-0 transition cursor-pointer ${secondaryBtnClass}`}
              >
                <Share2 className="w-4 h-4 text-[#c49849]" />
              </button>

              <button
                type="button"
                onClick={onOpenCustomizer}
                data-testid="open-customizer-btn"
                aria-label="Customize bookshelf"
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs sm:text-sm w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 transition cursor-pointer whitespace-nowrap shrink-0 ${secondaryBtnClass}`}
              >
                <SlidersHorizontal className="w-4 h-4 text-[#c49849] shrink-0" />
                <span className="hidden sm:inline">Customize</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenCreateShelf}
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] text-[#1a1107] font-semibold text-xs sm:text-sm h-9 sm:h-auto px-2.5 sm:px-3.5 sm:py-2 shadow transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Shelf</span>
            </button>
          )}

          {/* Account Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`Account menu for ${user.username}`}
              data-testid="account-menu-btn"
              className={`inline-flex items-center justify-center gap-2 rounded-lg border w-9 h-9 sm:w-auto sm:h-auto sm:px-2.5 sm:py-2 text-xs transition cursor-pointer ${secondaryBtnClass}`}
            >
              <User className="w-4 h-4 text-[#c49849]" />
              <span className="hidden md:inline max-w-[100px] truncate">
                {user.username}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-xl border ui-surface-panel shadow-[0_18px_38px_rgba(0,0,0,0.45)] py-1.5 z-50"
                >
                  <div className="px-3.5 py-2 border-b ui-surface-header">
                    <p className="text-[11px] uppercase tracking-wider ui-text-muted">
                      Signed in as
                    </p>
                    <p className="text-sm font-medium ui-text-primary truncate">
                      {user.username}
                    </p>
                  </div>

                  {totalBooks === 0 && viewMode === 'single' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onSeedSamples();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs ui-text-secondary hover:bg-[#cfa458]/15 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#c89d54]" />
                      Stock Sample Classics
                    </button>
                  )}

                  <LibraryBackupActions onRestore={onLibraryRestore} onToast={onToast} />
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="logout-btn"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
