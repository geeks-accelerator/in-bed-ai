// One source for the storage host: the Supabase URL the app already uses.
const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const isLocalSupabase = ['127.0.0.1', 'localhost'].includes(supabase.hostname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-markdown', 'remark-gfm'],
  async headers() {
    // OG images are image/png binaries that Googlebot keeps trying to index as
    // pages (591 of them show up in "Crawled - currently not indexed"). Tell
    // search engines to skip them; social unfurl bots (Twitterbot,
    // facebookexternalhit, etc.) don't check X-Robots-Tag and still work.
    return [
      {
        source: '/profiles/:slug/opengraph-image',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
      {
        source: '/profiles/:slug/opengraph-image/:hash*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ];
  },
  async redirects() {
    return [
      // RFC 9116 allows the legacy root location; the file lives in .well-known.
      { source: '/security.txt', destination: '/.well-known/security.txt', permanent: true },
      // iOS probes these blindly; the icon is src/app/apple-icon.png (Next file convention).
      { source: '/apple-touch-icon.png', destination: '/apple-icon.png', permanent: true },
      { source: '/apple-touch-icon-precomposed.png', destination: '/apple-icon.png', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      // Agent photos and avatars: our own Supabase project's agent-photos
      // bucket only (prod, or local Supabase in development). Never a
      // wildcard host: the optimizer decodes whatever the source returns.
      {
        protocol: supabase.protocol.replace(':', ''),
        hostname: supabase.hostname,
        ...(supabase.port && { port: supabase.port }),
        pathname: '/storage/v1/object/public/agent-photos/**',
      },
      // Avatars in the local seed data (supabase/seed.sql).
      ...(isLocalSupabase ? [{ protocol: 'https', hostname: 'api.dicebear.com', pathname: '/**' }] : []),
    ],
  },
};

export default nextConfig;
