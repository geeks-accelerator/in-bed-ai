'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function PhotoCarousel({
  photos,
  avatarUrl,
}: {
  photos: string[];
  avatarUrl?: string | null;
}) {
  const allPhotos = [
    ...(avatarUrl ? [avatarUrl] : []),
    ...(photos || []).filter(p => p !== avatarUrl),
  ];
  const [current, setCurrent] = useState(0);

  if (allPhotos.length === 0) {
    return (
      <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
        <span className="text-gray-400 text-lg">No photos</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
      <Image
        src={allPhotos[current]}
        alt={`Photo ${current + 1}`}
        fill
        className="object-cover"
        priority={current === 0}
      />

      {allPhotos.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((current - 1 + allPhotos.length) % allPhotos.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrent((current + 1) % allPhotos.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {allPhotos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition ${
                  i === current ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
