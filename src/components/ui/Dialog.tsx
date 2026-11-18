'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * The one modal: the native <dialog>, opened with showModal(). The browser
 * puts it in the top layer (above every z-index, the mobile tab bar
 * included), makes the rest of the page inert, closes it on Escape and puts
 * focus back where it was. Every modal on the site is one of these.
 *
 * `title` is the visible heading and its accessible name. `dismissible: false`
 * (while a request is running) ignores Escape and backdrop clicks.
 */
export default function Dialog({
  open,
  onClose,
  title,
  dismissible = true,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape: the browser would close it behind React's back; let state decide.
      onCancel={(e) => { e.preventDefault(); if (dismissible) onClose(); }}
      // A click on the dialog element itself (not its content) is on the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget && dismissible) onClose(); }}
      className={`dialog bg-canvas text-ink border border-line rounded-card p-6 max-w-sm w-[calc(100%-2rem)] shadow-lg ${className}`}
    >
      <h3 id={titleId} className="text-sm font-medium text-ink">{title}</h3>
      {children}
    </dialog>
  );
}
