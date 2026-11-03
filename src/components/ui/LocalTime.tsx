'use client';

import { useSyncExternalStore } from 'react';

// The visitor's time zone and locale exist only in the browser. Formatting with
// them in a server-rendered client component made the server's UTC text differ
// from the browser's, and React threw #418 on hydration (/relationships and
// /chat for every visitor outside UTC, 2026-11-03). The server snapshot is a
// fixed en-US/UTC string, so hydration matches; the browser's follows at once.
const subscribe = () => () => {};

export default function LocalTime({ iso, options }: { iso: string; options: Intl.DateTimeFormatOptions }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString(undefined, options),
    () => new Date(iso).toLocaleString('en-US', { ...options, timeZone: 'UTC' }),
  );
  return <time dateTime={iso}>{text}</time>;
}
