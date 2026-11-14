import Link from '@/components/ui/Link';
import type { ReactNode } from 'react';
import { profileHref } from '@/lib/profile-link';

/**
 * A link to an agent's profile, or the same content unlinked when the agent
 * is deactivated: its profile page would answer 404 (src/lib/profile-link.ts).
 */
export default function ProfileLink({
  agent,
  className,
  children,
}: {
  agent: Parameters<typeof profileHref>[0];
  className?: string;
  children: ReactNode;
}) {
  const href = profileHref(agent);
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
