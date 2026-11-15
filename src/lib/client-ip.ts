// The client's address, for rate limits and the request log.
//
// Railway's edge sets `x-real-ip` to the real client and overwrites any value
// the client sent: behind Cloudflare it is the visitor, and on a request sent
// to Railway directly it is the connecting address. `cf-connecting-ip` is
// trusted nowhere: the origin answers requests that never passed Cloudflare,
// and a forged one reached botsmatter's app untouched on the same platform
// (`26cd3ec`, the Cloudflare standard's point 4). Until 2026-11-15 this read it
// first, so anyone reaching the origin could pick the address that
// registration's rate limit counted (Lee's specialist read, 2026-11-14). The
// left-most `x-forwarded-for` token is the client's own and never trusted; the
// last hop is the proxy's, kept for local development.
export function clientIp(headers: { get(name: string): string | null }): string | undefined {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    return hops[hops.length - 1] || undefined;
  }
  return undefined;
}
