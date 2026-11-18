'use client';

import Dialog from '@/components/ui/Dialog';

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
  return (
    <Dialog open={open} onClose={onCancel} title={title} dismissible={!loading}>
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
    </Dialog>
  );
}
