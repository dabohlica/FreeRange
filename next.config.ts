import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      {
        protocol: 'https',
        hostname: '88736ce4aa8313e5520ffd08011aad34.r2.cloudflarestorage.com',
        pathname: '/freerange-media/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
}

export default nextConfig
