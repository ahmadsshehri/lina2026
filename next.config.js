/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { domains: ['firebasestorage.googleapis.com'] },
  // PWA support
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options',        value: 'DENY'    },
      ],
    },
  ],
};

module.exports = nextConfig;
