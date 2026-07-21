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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      ...(process.env.NODE_ENV === 'development'
        ? [
            {
              protocol: 'http',
              hostname: '127.0.0.1',
              port: '54321',
              pathname: '/storage/v1/object/public/**',
            },
            {
              protocol: 'https',
              hostname: 'api.dicebear.com',
              pathname: '/**',
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
