import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    scrollRestoration: true,
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  turbopack: {
    rules: {
      // Tailwind CSS v4 를 PostCSS 대신 Turbopack 전용 로더로 처리한다 (create-next-app 기본 구성).
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        // Service Worker 는 항상 최신본을 받도록 캐시를 끄고, 스코프 '/' 등록을 허용한다.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
