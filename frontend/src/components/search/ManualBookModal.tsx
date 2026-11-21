import React, { useEffect, useState } from 'react';
import { BookPlus, Upload, X } from 'lucide-react';
import type { BookFormat, BookshelfDto } from '@bookshelf/shared';
import { api, ApiError } from '../../api/client';

interface ManualBookModalProps {
  open: boolean;
  onClose: () => void;
  bookshelf: BookshelfDto;
  initialTitle?: string;
  initialCompartmentId?: string | null;
  onAddBook: (payload: Parameters<typeof api.addBook>[0]) => Promise<unknown>;
}

export function ManualBookModal({
  open,
  onClose,
  bookshelf,
  initialTitle = '',
  initialCompartmentId,
  onAddBook,
}: ManualBookModalProps) {
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationDate, setPublicationDate] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [format, setFormat] = useState<BookFormat>('hardcover');
  const [description, setDescription] = useState('');
  const [compartmentId, setCompartmentId] = useState('');
  const [spineColor, setSpineColor] = useState('#5A1F24');
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setAuthorsText('');
      setIsbn('');
      setPublisher('');
      setPublicationDate('');
      setPageCount('320');
      setFormat('hardcover');
      setDescription('');
      setCompartmentId(initialCompartmentId || bookshelf.compartments[0]?.id || '');
      setUseCustomColor(false);
      setUploadedCoverUrl(null);
      setError(null);
    }
  }, [open, initialTitle, initialCompartmentId, bookshelf.compartments]);

  if (!open) return null;

  const handleUploadCover = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { url } = await api.uploadBookImage(file);
      setUploadedCoverUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cover upload failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authors = authorsText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      const parsedPages = pageCount ? Number(pageCount) : null;

      await onAddBook({
        compartmentId: compartmentId || undefined,
        book: {
          provider: 'manual',
          title: title.trim(),
          authors,
          isbn: isbn.trim() || null,
          publisher: publisher.trim() || null,
          publicationDate: publicationDate.trim() || null,
          pageCount: parsedPages && parsedPages > 0 ? parsedPages : null,
          format,
          description: description.trim() || null,
          coverUrl: uploadedCoverUrl,
        },
        visualOverrides: useCustomColor ? { spineColor } : undefined,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not add book.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add Book Manually"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid="manual-book-modal"
        className="w-full max-w-lg max-h-[90vh] rounded-2xl border border-[#cfa55a]/30 bg-[#1a130e] shadow-[0_30px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#c9a15c]/15 bg-[#140e0a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookPlus className="w-4 h-4 text-[#dfb86d]" />
            <h2 className="font-display text-2xl font-semibold text-[#f7ebd7]">
              Catalog a Custom Edition
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual book entry"
            className="p-1.5 rounded-lg text-[#a99479] hover:text-[#f6e8d0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto library-scroll p-6 space-y-4"
        >
          {error && (
            <div className="rounded-lg border border-red-400/35 bg-red-950/45 px-3.5 py-2 text-xs text-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
              Book Title *
            </label>
            <input
              type="text"
              required
              data-testid="manual-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Architecture of Happiness"
              className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf] focus:outline-none focus:border-[#dfb86d]"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
              Author(s) (comma separated)
            </label>
            <input
              type="text"
              data-testid="manual-author-input"
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              placeholder="e.g. Alain de Botton"
              className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf] focus:outline-none focus:border-[#dfb86d]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as BookFormat)}
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              >
                <option value="hardcover">Hardcover</option>
                <option value="trade-paperback">Trade Paperback</option>
                <option value="mass-market">Mass-Market Paperback</option>
                <option value="quarto">Tall Folio / Art Book</option>
                <option value="pocket">Pocket Edition</option>
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                Pages (sets spine thickness)
              </label>
              <input
                type="number"
                min={16}
                max={3000}
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                Publisher
              </label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                Year / Date
              </label>
              <input
                type="text"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
                placeholder="e.g. 2006"
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                ISBN (optional)
              </label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="10 or 13 digits"
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
                Place on Shelf
              </label>
              <select
                value={compartmentId}
                onChange={(e) => setCompartmentId(e.target.value)}
                className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf]"
              >
                {bookshelf.compartments.map((c) => (
                  <option key={c.id} value={c.id}>
                    Level {c.row + 1}
                    {c.settings.label ? ` — ${c.settings.label}` : ` (Col ${c.column + 1})`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Spine Color & Cover Upload */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9a15c]/18 bg-[#140e0a] p-3">
            <label className="inline-flex items-center gap-2 text-xs text-[#dcc9ac] cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomColor}
                onChange={(e) => setUseCustomColor(e.target.checked)}
                className="accent-[#c89d54]"
              />
              <span>Custom Spine Color</span>
              {useCustomColor && (
                <input
                  type="color"
                  value={spineColor}
                  onChange={(e) => setSpineColor(e.target.value)}
                  className="w-7 h-6 rounded border border-[#c9a15c]/30 bg-transparent cursor-pointer"
                />
              )}
            </label>

            <label className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a15c]/25 bg-[#20160f] hover:bg-[#2c1f16] px-2.5 py-1.5 text-xs text-[#ead8bb] cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-[#dab468]" />
              {uploadedCoverUrl ? 'Cover Attached' : 'Upload Cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleUploadCover(e.target.files?.[0])}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-[#b9a489] mb-1.5">
              Description / Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary or personal edition notes..."
              className="w-full rounded-lg bg-[#110c09] border border-[#c9a15c]/25 px-3 py-2 text-sm text-[#f7eedf] focus:outline-none focus:border-[#dfb86d]"
            />
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
              disabled={submitting || !title.trim()}
              data-testid="manual-submit-btn"
              className="rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] disabled:opacity-50 text-[#1b1208] font-semibold text-sm px-5 py-2 shadow cursor-pointer"
            >
              {submitting ? 'Shelving...' : 'Add to Bookshelf'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
