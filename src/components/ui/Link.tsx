'use client';

// The one link component. Next prefetches every <Link> as soon as it scrolls
// into view; in the week to 2026-11-13 that was 15,542 RSC requests (13% of
// all traffic, about 4.2 per page load), about 4,700 of them full renders of
// pages built per request, for links almost nobody clicked. Here a link
// prefetches on intent instead: a pointer resting on it, a finger touching
// it, or keyboard focus reaching it, which still beats the click (the caching
// standard, point 15). Once per link: Next would serve a repeat from its
// client cache, but not calling again is simpler than trusting that.
// `prefetch={false}` also turns off Next's own hover prefetch in the App
// Router, so this calls router.prefetch() itself.
//
// eslint.config.mjs forbids importing next/link anywhere but here. A link
// that wants on-view prefetch back needs a measured click rate, named in a
// comment beside it; src/lib/link-prefetch.test.ts fails on a prefetch prop.
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import type { ComponentProps, FocusEvent, PointerEvent, TouchEvent } from 'react';
import { prefetchTarget } from '@/lib/link-prefetch';

type Props = Omit<ComponentProps<typeof NextLink>, 'prefetch'>;

export default function Link({ href, onPointerEnter, onTouchStart, onFocus, ...rest }: Props) {
  const router = useRouter();
  const prefetched = useRef<string | null>(null);
  const intent = () => {
    const target = prefetchTarget(href);
    if (!target || prefetched.current === target) return;
    prefetched.current = target;
    router.prefetch(target);
  };
  return (
    <NextLink
      href={href}
      prefetch={false}
      onPointerEnter={(e: PointerEvent<HTMLAnchorElement>) => {
        intent();
        onPointerEnter?.(e);
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        intent();
        onTouchStart?.(e);
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        intent();
        onFocus?.(e);
      }}
      {...rest}
    />
  );
}
