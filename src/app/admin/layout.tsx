// The admin pages are client shells that read with the admin key after load.
// This layout only gives them a lifetime: an hour at a cache, not Next's
// default year for a prerendered page (src/lib/page-lifetime.test.ts).
export const revalidate = 3600;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
