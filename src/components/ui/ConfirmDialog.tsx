'use client';

import { useEffect, useCallback } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) onCancel();
  }, [loading, onCancel]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} aria-hidden="true" />
      <div className="relative bg-canvas border border-line rounded-card p-6 max-w-sm w-full mx-4 shadow-lg">
        <h3 id="confirm-dialog-title" className="text-sm font-medium text-ink">{title}</h3>
        <p className="text-xs text-ink-muted mt-2">{description}</p>
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-line rounded-control text-ink-2 hover:border-line-strong hover:text-ink transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-3 py-1.5 text-xs rounded-control font-medium transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-danger hover:bg-danger/90 text-white'
                : 'bg-ink hover:bg-ink/85 text-on-ink'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
