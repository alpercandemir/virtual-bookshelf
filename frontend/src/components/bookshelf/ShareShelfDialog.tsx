import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { BookshelfDto } from '@bookshelf/shared';
import { downloadFile } from '../../utils/downloadFile';

export function ShareShelfDialog({
  shelf,
  onClose,
}: {
  shelf: BookshelfDto;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const books = shelf.compartments.flatMap((compartment) => compartment.books);
  const shareText = [
    shelf.name,
    '',
    ...books.map(({ book }) =>
      book.authors.length ? `• ${book.title} — ${book.authors.join(', ')}` : `• ${book.title}`
    ),
  ].join('\n');

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setStatus('Book list copied.');
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setStatus('Book list selected. Use your device’s Copy command.');
    }
  };

  const shareList = async () => {
    setSharing(true);
    try {
      await navigator.share({ title: shelf.name, text: shareText });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus('Sharing is unavailable. You can copy or download the list.');
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
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border ui-surface-panel p-5 shadow-2xl backdrop:bg-black/70"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="share-shelf-heading" className="font-display text-2xl font-semibold ui-text-primary">
          Share shelf
        </h2>
        <button type="button" aria-label="Close share dialog" onClick={onClose} className="p-2 ui-text-secondary cursor-pointer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-1 text-sm ui-text-secondary">Share the shelf name, book titles, and authors.</p>
      <textarea
        ref={preview}
        aria-label="Book list preview"
        value={shareText}
        readOnly
        rows={8}
        className="my-4 w-full rounded-lg border ui-surface-input p-3 text-sm ui-text-primary"
      />
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && (
          <button type="button" disabled={sharing} onClick={shareList} className="rounded-lg bg-[#cfa458] px-3 py-2 text-sm font-semibold text-[#1a1107] cursor-pointer">
            Share book list
          </button>
        )}
        <button type="button" onClick={copyList} className="rounded-lg border ui-surface-input px-3 py-2 text-sm ui-text-primary cursor-pointer">
          Copy list
        </button>
        <button
          type="button"
          onClick={() => downloadFile(new Blob([shareText], { type: 'text/plain;charset=utf-8' }), 'bookshelf.txt')}
          className="rounded-lg border ui-surface-input px-3 py-2 text-sm ui-text-primary cursor-pointer"
        >
          Download list
        </button>
      </div>
      {status && <p role="status" className="mt-3 text-sm ui-text-secondary">{status}</p>}
    </dialog>
  );
}
