import { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    scrollRestoration: true,
  },
  reactCompiler: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
  },
};

export default nextConfig;
