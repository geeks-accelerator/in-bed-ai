'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const noSubscribe = () => () => {};
const findSlot = () => document.getElementById('bar-title');

/**
 * A screen's one large title. As it scrolls away the same words appear small
 * in the top bar (Apple's large-title pattern), driven entirely by CSS
 * scroll-driven animation in globals.css (.large-title / .bar-title). The bar
 * text is this same string, never a second copy: pass `barTitle` only when the
 * heading itself isn't plain text.
 */
export default function LargeTitle({
  children,
  barTitle,
  className = '',
  onPhoto = false,
}: {
  children: React.ReactNode;
  barTitle?: string;
  className?: string;
  /** White, for a title on the clear-glass caption over a photo. */
  onPhoto?: boolean;
}) {
  const slot = useSyncExternalStore(noSubscribe, findSlot, () => null);
  const text = barTitle ?? (typeof children === 'string' ? children : undefined);

  return (
    <>
      <h1 className={`large-title text-title ${onPhoto ? 'text-white' : 'text-ink'} ${className}`}>{children}</h1>
      {slot && text && createPortal(text, slot)}
    </>
  );
}
