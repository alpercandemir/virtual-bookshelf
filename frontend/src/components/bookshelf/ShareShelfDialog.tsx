import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Share2, X } from 'lucide-react';
import { getRoomThemeMeta, type BookshelfDto } from '@bookshelf/shared';
import { downloadFile } from '../../utils/downloadFile';
import { Bookshelf } from './Bookshelf';

export function ShareShelfDialog({
  shelf,
  onClose,
}: {
  shelf: BookshelfDto;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shelfImage = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const room = getRoomThemeMeta(shelf.roomTheme);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (image) return;
    const target = shelfImage.current;
    if (!target) return;
    let cancelled = false;

    const prepareImage = async () => {
      try {
        const { toBlob } = await import('html-to-image');
        await document.fonts.ready;
        if (cancelled) return;

        const blob = await toBlob(target, {
          includeQueryParams: true,
          preferredFontFormat: 'woff2',
          pixelRatio: Math.min(2, 3000 / target.offsetHeight),
          filter: (node) => !node.classList?.contains('book-hover-tooltip'),
        });
        if (cancelled) return;
        if (!blob?.size) throw new Error('Empty shelf image');

        const name = shelf.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        const file = new File([blob], `${name || 'bookshelf'}.png`, { type: 'image/png' });
        setImage({ file, url: URL.createObjectURL(file) });
      } catch {
        if (!cancelled) setCaptureFailed(true);
      }
    };
    void prepareImage();
    return () => {
      cancelled = true;
    };
  }, [shelf.name, image, attempt]);

  useEffect(() => {
    if (image) return () => URL.revokeObjectURL(image.url);
  }, [image]);

  const canShare = image && navigator.canShare?.({ files: [image.file] });

  const shareImage = async () => {
    if (!image) return;
    setSharing(true);
    setShareError('');
    try {
      await navigator.share({ files: [image.file], title: shelf.name });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setShareError('Sharing is unavailable. Download the image to send it.');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <dialog
      aria-labelledby="share-shelf-heading"
      ref={dialog}
      onClose={onClose}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border ui-surface-panel p-5 shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="share-shelf-heading" className="font-display text-2xl font-semibold ui-text-primary">
          Share shelf
        </h2>
        <button type="button" aria-label="Close share dialog" onClick={onClose} className="p-2 ui-text-secondary cursor-pointer">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!image && (
        <>
          <div aria-hidden="true" inert className="fixed -left-[12000px] top-0">
            <div
              ref={shelfImage}
              className="library-room w-[1040px] !min-h-0 pt-6"
              data-room-theme={shelf.roomTheme}
              data-room-mode={room.mode}
            >
              <h3 className="px-8 text-center font-display text-3xl font-semibold">{shelf.name}</h3>
              <Bookshelf bookshelf={shelf} onSelectBook={() => undefined} />
            </div>
          </div>
          {captureFailed ? (
            <div className="mt-4">
              <p role="alert" className="text-sm ui-text-secondary">Could not generate the shelf image.</p>
              <button type="button" onClick={() => {
                setCaptureFailed(false);
                setAttempt((previous) => previous + 1);
              }} className="mt-3 rounded-lg border ui-surface-input px-3 py-2 text-sm cursor-pointer">
                Try again
              </button>
            </div>
          ) : (
            <p role="status" className="my-8 flex items-center justify-center gap-2 text-sm ui-text-secondary">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Preparing shelf image…
            </p>
          )}
        </>
      )}

      {image && (
        <>
          <img src={image.url} alt={`Image of ${shelf.name}`} className="my-4 max-h-[55dvh] w-full rounded-lg object-contain" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadFile(image.file, image.file.name)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#cfa458] px-3 py-2 text-sm font-semibold text-[#1a1107] cursor-pointer"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download PNG
            </button>
            {canShare && (
              <button
                type="button"
                disabled={sharing}
                onClick={shareImage}
                className="inline-flex items-center gap-2 rounded-lg border ui-surface-input px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <Share2 aria-hidden="true" className="h-4 w-4" />
                Share image
              </button>
            )}
          </div>
          {shareError && <p role="status" className="mt-3 text-sm ui-text-secondary">{shareError}</p>}
        </>
      )}
    </dialog>
  );
}
