import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { downloadFile } from '../../utils/downloadFile';

const menuItemClass = 'w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs ui-text-secondary hover:bg-[#cfa458]/15 cursor-pointer disabled:opacity-50';

export function LibraryBackupActions({
  onRestore,
  onToast,
}: {
  onRestore: () => Promise<void>;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<'download' | 'restore' | null>(null);

  const downloadBackup = async () => {
    setPending('download');
    try {
      const backup = await api.getLibraryBackup();
      downloadFile(new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'bookshelf-backup.json');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not download the library backup.', 'error');
    } finally {
      setPending(null);
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) {
      onToast('Choose a backup under 64 MB.', 'error');
      return;
    }

    setPending('restore');
    try {
      const { restoredCount } = await api.restoreLibraryBackup(file);
      await onRestore();
      onToast(`Restored ${restoredCount} ${restoredCount === 1 ? 'shelf' : 'shelves'} as copies.`, 'success');
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not restore the library backup.', 'error');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <button type="button" role="menuitem" disabled={Boolean(pending)} onClick={downloadBackup} className={menuItemClass}>
        <Download className="w-3.5 h-3.5" />
        {pending === 'download' ? 'Preparing backup…' : 'Download library backup'}
      </button>
      <button type="button" role="menuitem" disabled={Boolean(pending)} onClick={() => input.current?.click()} className={menuItemClass}>
        <Upload className="w-3.5 h-3.5" />
        {pending === 'restore' ? 'Restoring shelves…' : 'Restore shelves as copies'}
      </button>
      <input ref={input} type="file" accept=".json,application/json" onChange={restoreBackup} hidden />
    </>
  );
}
