import React, { useState } from 'react';
import {
  Camera,
  Command,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
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
  onOpenSearch: (tab?: 'search' | 'scan' | 'manual') => void;
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

  const pillBtnClass = isLightRoom
    ? 'border-[#cbbfa9]/70 bg-white/55 hover:bg-white/90 hover:border-[#a78652] text-[#2a2219] backdrop-blur-md shadow-[0_2px_10px_rgba(44,32,18,0.06)]'
    : 'border-[#c9a15c]/20 bg-[#1a120d]/55 hover:bg-[#281c14]/85 hover:border-[#dfb86d]/45 text-[#ead9bf] backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.28)]';

  return (
    <header
      className={`relative z-30 transition-colors duration-300 ${
        isLightRoom ? 'text-[#231d17]' : 'text-[#f6ead7]'
      }`}
    >
      <div className="max-w-6xl mx-auto px-3.5 sm:px-6 pt-3.5 sm:pt-5 pb-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Museum Wall Placard Typography (No heavy icon box or SaaS bar) */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold truncate leading-tight tracking-wide">
              {viewMode === 'overview' ? 'All Bookshelves' : bookshelf.name}
            </h1>
            {viewMode === 'single' && bookshelf.tag && (
              <span
                className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase shrink-0 ${
                  isLightRoom
                    ? 'bg-[#e6dac6]/85 text-[#4b3822]'
                    : 'bg-[#cfa458]/15 border border-[#cfa458]/30 text-[#e6c786]'
                }`}
              >
                <Tag className="w-2.5 h-2.5" />
                {bookshelf.tag}
              </span>
            )}
          </div>
          <p
            className={`text-[11px] leading-none mt-1 tracking-wide truncate ${
              isLightRoom ? 'text-[#6c5d4c]' : 'text-[#a38e73]'
            }`}
          >
            {viewMode === 'overview'
              ? `${shelfCount} ${shelfCount === 1 ? 'bookshelf' : 'bookshelves'} in your gallery`
              : `${totalBooks} ${totalBooks === 1 ? 'volume' : 'volumes'} · ${bookshelf.visualTheme.replace('-', ' ')}`}
          </p>
        </div>

        {/* Right: Quiet Floating Gallery Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Global Find in Library (⌘K) */}
          <button
            type="button"
            onClick={onOpenLibraryFind}
            data-testid="open-library-find-btn"
            title="Find a book in your library (⌘K)"
            aria-label="Find in my library"
            className={`inline-flex items-center justify-center gap-1.5 rounded-full border text-xs w-9 h-9 sm:w-auto sm:h-9 sm:px-3 transition cursor-pointer whitespace-nowrap shrink-0 ${pillBtnClass}`}
          >
            <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#c49849] shrink-0" />
            <span className="hidden lg:inline">Find</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-current/20 px-1 py-0.2 text-[10px] opacity-65 font-mono">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          </button>

          {/* All Shelves Gallery Toggle */}
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
            className={`hidden sm:inline-flex items-center justify-center gap-1.5 rounded-full border text-xs h-9 w-9 sm:w-auto sm:px-3.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
              viewMode === 'overview'
                ? 'bg-[#cfa458] border-[#e2be79] text-[#1a1107] font-semibold shadow'
                : pillBtnClass
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">
              {viewMode === 'overview' ? 'Single Shelf' : `All Shelves (${shelfCount})`}
            </span>
          </button>

          {viewMode === 'single' ? (
            <>
              {/* Hero Quick-Scan Shelf Photo Trigger */}
              <button
                type="button"
                onClick={() => onOpenSearch('scan')}
                data-testid="quick-scan-shelf-btn"
                title="Scan a real bookshelf photo with AI"
                aria-label="Scan shelf photo"
                className={`hidden md:inline-flex items-center justify-center gap-1.5 rounded-full border text-xs h-9 px-3 transition cursor-pointer whitespace-nowrap shrink-0 ${pillBtnClass}`}
              >
                <Camera className="w-3.5 h-3.5 text-[#c49849] shrink-0" />
                <span className="hidden lg:inline">Scan</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenSearch('search')}
                data-testid="open-search-btn"
                className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-full bg-gradient-to-b from-[#d4aa5e] to-[#ab7e35] hover:from-[#dfb76c] hover:to-[#b8893e] text-[#1a1107] font-semibold text-xs h-9 px-3 sm:px-4 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,244,214,0.48)] transition cursor-pointer whitespace-nowrap shrink-0"
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
                className={`hidden sm:inline-flex items-center justify-center rounded-full border w-9 h-9 shrink-0 transition cursor-pointer ${pillBtnClass}`}
              >
                <Share2 className="w-3.5 h-3.5 text-[#c49849]" />
              </button>

              <button
                type="button"
                onClick={onOpenCustomizer}
                data-testid="open-customizer-btn"
                aria-label="Customize bookshelf"
                className={`hidden sm:inline-flex items-center justify-center gap-1.5 rounded-full border text-xs h-9 w-9 sm:w-auto sm:px-3.5 transition cursor-pointer whitespace-nowrap shrink-0 ${pillBtnClass}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#c49849] shrink-0" />
                <span className="hidden sm:inline">Customize</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenCreateShelf}
              className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-full bg-gradient-to-b from-[#d4aa5e] to-[#ab7e35] hover:from-[#dfb76c] hover:to-[#b8893e] text-[#1a1107] font-semibold text-xs h-9 px-3 sm:px-4 shadow transition cursor-pointer whitespace-nowrap shrink-0"
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
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border w-9 h-9 sm:w-auto sm:h-9 sm:px-3 text-xs transition cursor-pointer ${pillBtnClass}`}
            >
              <User className="hidden sm:block w-3.5 h-3.5 text-[#c49849]" />
              <MoreHorizontal className="sm:hidden w-5 h-5" />
              <span className="hidden md:inline max-w-[92px] truncate">
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

                  <div className="sm:hidden border-b ui-surface-header">
                    {[
                      {
                        label: viewMode === 'single' ? 'All shelves' : 'Return to bookshelf',
                        action: onToggleViewMode,
                        Icon: LayoutGrid,
                      },
                      ...(viewMode === 'single'
                        ? [
                            {
                              label: 'Scan shelf photo',
                              action: () => onOpenSearch('scan'),
                              Icon: Camera,
                            },
                            {
                              label: 'Customize bookshelf',
                              action: onOpenCustomizer,
                              Icon: SlidersHorizontal,
                            },
                            {
                              label: 'Share shelf',
                              action: onShareShelf,
                              Icon: Share2,
                            },
                          ]
                        : []),
                    ].map(({ label, action, Icon }) => (
                      <button
                        type="button"
                        key={label}
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3.5 py-3 text-left text-sm ui-text-primary"
                        onClick={() => {
                          setMenuOpen(false);
                          action();
                        }}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    ))}
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
