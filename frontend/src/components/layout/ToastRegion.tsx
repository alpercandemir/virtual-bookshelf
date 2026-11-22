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
      className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 pb-[env(safe-area-inset-bottom)] z-[60] flex flex-col gap-2.5 sm:max-w-md"
    >
      {toasts.map((toast) => {
        const isError = toast.tone === 'error';
        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`flex items-start gap-3 rounded-xl backdrop-blur-md shadow-[0_14px_34px_rgba(0,0,0,0.82)] ${
              isError
                ? 'bg-[#450a0a]/95 border-2 border-red-400/85 px-4 py-3.5 text-sm font-medium text-red-50'
                : toast.tone === 'success'
                  ? 'bg-[#211811]/95 border border-[#dfb86d]/45 px-4 py-2.5 text-xs text-[#f6e8cf]'
                  : 'bg-[#1c1510]/95 border border-[#c9a15c]/30 px-4 py-2.5 text-xs text-[#ead9bd]'
            }`}
          >
            {isError ? (
              <AlertTriangle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
            ) : toast.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#e2bc71] shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-[#cfa75d] shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-current opacity-70 hover:opacity-100 cursor-pointer mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
