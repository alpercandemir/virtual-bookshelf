import React, { useState } from 'react';
import { Library, Sparkles, Tag, X } from 'lucide-react';
import {
  ROOM_THEMES,
  type RoomTheme,
  type WoodFinish,
} from '@bookshelf/shared';

interface CreateShelfModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    tag?: string | null;
    visualTheme: WoodFinish;
    roomTheme: RoomTheme;
    levelCount: number;
    seedSamples: boolean;
  }) => Promise<unknown>;
}

const TAG_SUGGESTIONS = ['2026', '2025', 'Favorites', 'Sci-Fi', 'Design', 'To Read'];

const WOOD_CHOICES: Array<{ id: WoodFinish; label: string; bg: string }> = [
  { id: 'walnut', label: 'Walnut', bg: 'url("/textures/wood-walnut-h.jpg")' },
  { id: 'mahogany', label: 'Mahogany', bg: 'url("/textures/wood-mahogany-h.jpg")' },
  { id: 'oak', label: 'Oak', bg: 'url("/textures/wood-oak-h.jpg")' },
  { id: 'birch', label: 'Nordic Birch', bg: 'linear-gradient(135deg, #efe6d6, #ddd0bb)' },
  { id: 'espresso', label: 'Espresso', bg: 'url("/textures/wood-espresso-h.jpg")' },
  { id: 'matte-charcoal', label: 'Charcoal', bg: 'linear-gradient(135deg, #272a2f, #15171a)' },
];

export function CreateShelfModal({ open, onClose, onCreate }: CreateShelfModalProps) {
  const [name, setName] = useState('');
  const [tag, setTag] = useState(String(new Date().getFullYear()));
  const [roomTheme, setRoomTheme] = useState<RoomTheme>('nordic-billy');
  const [visualTheme, setVisualTheme] = useState<WoodFinish>('birch');
  const [levelCount, setLevelCount] = useState(3);
  const [seedSamples, setSeedSamples] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSelectRoom = (id: RoomTheme) => {
    setRoomTheme(id);
    const meta = ROOM_THEMES.find((t) => t.id === id);
    if (meta) {
      setVisualTheme(meta.recommendedWood);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        tag: tag.trim() || null,
        visualTheme,
        roomTheme,
        levelCount,
        seedSamples,
      });
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create bookshelf.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create New Bookshelf"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="create-shelf-modal"
        className="w-full max-w-xl max-h-[90vh] rounded-2xl border border-[#cfa55a]/30 bg-[#1a130e] text-[#f5ead7] shadow-[0_32px_80px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#c9a15c]/15 bg-[#140e0a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Library className="w-4 h-4 text-[#dfb86d]" />
            <h2 className="font-display text-2xl font-semibold">
              Craft a New Bookshelf
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[#a99479] hover:text-[#f6e8d0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto library-scroll p-6 space-y-5"
        >
          {error && (
            <div className="rounded-lg border border-red-400/35 bg-red-950/45 px-3.5 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          {/* Shelf Name & Year/Tag */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-widest text-[#bca688] mb-1.5">
                Bookshelf Name *
              </label>
              <input
                type="text"
                required
                autoFocus
                data-testid="new-shelf-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 Reading Room"
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3.5 py-2 text-sm text-[#f7eedf] focus:outline-none focus:border-[#dfb86d]"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[#bca688] mb-1.5">
                Year / Tag
              </label>
              <div className="relative">
                <Tag className="w-3.5 h-3.5 text-[#8f7b62] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  maxLength={32}
                  data-testid="new-shelf-tag-input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="2026"
                  className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 pl-8 pr-3 py-2 text-sm text-[#f7eedf] focus:outline-none focus:border-[#dfb86d]"
                />
              </div>
            </div>
          </div>

          {/* Quick Tag Chips */}
          <div className="flex flex-wrap items-center gap-1.5 -mt-2">
            {TAG_SUGGESTIONS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setTag(chip)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] border transition cursor-pointer ${
                  tag === chip
                    ? 'bg-[#cfa458] text-[#1a1107] border-[#e5c27b] font-medium'
                    : 'bg-[#140e0a] text-[#bca78b] border-[#c9a15c]/20 hover:border-[#c9a15c]/45'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Room & Interior Design Theme */}
          <div>
            <p className="text-xs uppercase tracking-widest text-[#bca688] mb-2">
              Room &amp; Wall Theme
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROOM_THEMES.map((theme) => {
                const active = roomTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectRoom(theme.id)}
                    className={`text-left rounded-lg overflow-hidden border transition cursor-pointer ${
                      active
                        ? 'border-[#e0b86c] ring-1 ring-[#e0b86c]/55 bg-[#271c13]'
                        : 'border-[#c9a15c]/18 hover:border-[#c9a15c]/45 bg-[#140e0a]'
                    }`}
                  >
                    <div
                      className="h-9 w-full flex items-end justify-end p-1.5"
                      style={{ background: theme.wallPreview }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/30"
                        style={{ backgroundColor: theme.accentColor }}
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-[#f3e5cd] truncate">
                        {theme.name}
                      </p>
                      <p className="text-[10px] text-[#9c886f] truncate">
                        {theme.brandInspiration}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wood / Material Finish */}
          <div>
            <p className="text-xs uppercase tracking-widest text-[#bca688] mb-2">
              Cabinet Material Finish
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {WOOD_CHOICES.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setVisualTheme(w.id)}
                  className={`rounded-lg overflow-hidden border text-center transition cursor-pointer ${
                    visualTheme === w.id
                      ? 'border-[#e2bc71] ring-1 ring-[#e2bc71]/60'
                      : 'border-[#c9a15c]/20 hover:border-[#c9a15c]/45'
                  }`}
                >
                  <div
                    className="h-7 w-full bg-cover bg-center"
                    style={{ backgroundImage: w.bg }}
                  />
                  <span className="block py-1 text-[10px] text-[#e7d6ba] bg-[#140e0a] truncate px-1">
                    {w.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Levels & Starter Books */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-[#bca688] mb-1.5">
                Shelf Levels
              </p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLevelCount(n)}
                    className={`w-8 h-8 rounded-md text-xs font-medium border cursor-pointer ${
                      levelCount === n
                        ? 'bg-[#cfa458] text-[#1a1107] border-[#e2be79]'
                        : 'bg-[#140e0a] text-[#cbb698] border-[#c9a15c]/20'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#d6c2a5] cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={seedSamples}
                onChange={(e) => setSeedSamples(e.target.checked)}
                className="accent-[#c89d54]"
              />
              <Sparkles className="w-3.5 h-3.5 text-[#dfb86d]" />
              Pre-stock with classic editions
            </label>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#c9a15c]/25 px-4 py-2 text-xs text-[#cbb697] hover:bg-[#251b13] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              data-testid="create-shelf-submit-btn"
              className="rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] disabled:opacity-50 text-[#1b1208] font-semibold text-sm px-5 py-2 shadow cursor-pointer"
            >
              {submitting ? 'Building Shelf...' : 'Create Bookshelf'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
