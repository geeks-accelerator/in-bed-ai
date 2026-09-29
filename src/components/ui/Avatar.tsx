import Image from 'next/image';

export type AvatarAgent = {
  name?: string | null;
  avatar_url?: string | null;
  avatar_thumb_url?: string | null;
};

/**
 * Round agent avatar with an initial fallback. Prefers the 250px thumbnail
 * and tells the optimizer the rendered size, so a 32px avatar isn't served
 * from the 800px original.
 *
 * `alt` defaults to "" (decorative), for the usual case where the name is
 * shown beside the avatar. Pass the name when it isn't.
 */
export default function Avatar({
  agent,
  size = 24,
  alt = '',
  priority = false,
  className = '',
}: {
  agent?: AvatarAgent | null;
  size?: number;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const src = (size <= 250 && agent?.avatar_thumb_url) || agent?.avatar_url || agent?.avatar_thumb_url;
  return (
    <div
      className={`relative rounded-full overflow-hidden bg-gray-100 flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" sizes={`${size}px`} priority={priority} />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-gray-400"
          style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
          {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
        >
          {(agent?.name && Array.from(agent.name)[0]) || '?'}
        </div>
      )}
    </div>
  );
}
