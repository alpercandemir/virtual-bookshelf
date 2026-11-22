import React from 'react';
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import type { ToastItem } from '../../context/BookshelfContext';

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 pb-[env(safe-area-inset-bottom)] z-50 flex flex-col gap-2 sm:max-w-sm"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs shadow-[0_12px_28px_rgba(0,0,0,0.75)] backdrop-blur-md ${
            toast.tone === 'error'
              ? 'bg-red-950/90 border-red-400/40 text-red-100'
              : toast.tone === 'success'
                ? 'bg-[#211811]/95 border-[#dfb86d]/45 text-[#f6e8cf]'
                : 'bg-[#1c1510]/95 border-[#c9a15c]/30 text-[#ead9bd]'
          }`}
        >
          {toast.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
          ) : toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#e2bc71] shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#cfa75d] shrink-0" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="text-current opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
