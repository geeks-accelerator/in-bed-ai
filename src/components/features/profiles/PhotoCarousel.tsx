'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * The profile hero: edge to edge on phones, a rounded card from sm up.
 *
 * No shared-element transition from the profile card: React's ViewTransition
 * around it stalled App Router navigation on Next 16.4 (the URL never
 * changed), tested 2026-11-16. Revisit when Next ships view transition support.
 *
 * `caption` sits on clear glass at the bottom edge: the one place content may
 * sit on glass, because it's a label over a photo (Apple HIG, Materials).
 */
export default function PhotoCarousel({
  photos,
  avatarUrl,
  altText,
  color,
  caption,
}: {
  photos: string[];
  avatarUrl?: string | null;
  altText?: string | null;
  /** The avatar's dominant colour, shown while the photo loads. */
  color?: string | null;
  caption?: React.ReactNode;
}) {
  const allPhotos = [
    ...(avatarUrl ? [avatarUrl] : []),
    ...(photos || []).filter(p => p !== avatarUrl),
  ];
  const [current, setCurrent] = useState(0);

  if (allPhotos.length === 0) {
    return (
      <div className="w-full aspect-4/3 bg-surface-2 rounded-card flex items-center justify-center">
        <span className="text-ink-muted text-lg">No photos</span>
      </div>
    );
  }

  const image = (
    <Image
      src={allPhotos[current]}
      alt={altText || `Photo ${current + 1}`}
      fill
      className="object-cover"
      // The profile column is max-w-3xl (768px); phones go edge to edge.
      sizes="(min-width: 768px) 768px, 100vw"
      priority={current === 0}
    />
  );

  return (
    <div
      className="relative -mx-4 sm:mx-0 aspect-4/5 sm:aspect-4/3 sm:rounded-card overflow-clip bg-surface-2"
      style={color ? { backgroundColor: color } : undefined}
    >
      {image}

      {allPhotos.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((current - 1 + allPhotos.length) % allPhotos.length)}
            aria-label="Previous photo"
            className="glass-clear absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white"
          >
            <svg aria-hidden className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrent((current + 1) % allPhotos.length)}
            aria-label="Next photo"
            className="glass-clear absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white"
          >
            <svg aria-hidden className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex">
            {allPhotos.map((_, i) => (
              // p-2 gives each 8px dot a 24px tap target.
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === current ? 'true' : undefined}
                className="p-2"
              >
                <span className={`block w-2 h-2 rounded-full shadow-sm transition ${i === current ? 'bg-white' : 'bg-white/50'}`} />
              </button>
            ))}
          </div>
        </>
      )}

      {caption && (
        <div className="glass-clear absolute inset-x-3 bottom-3 rounded-inner-3 px-4 py-3 text-white">
          {caption}
        </div>
      )}
    </div>
  );
}
