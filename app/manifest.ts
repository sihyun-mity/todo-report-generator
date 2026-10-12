import type { MetadataRoute } from 'next';

// Web App Manifest — 홈 화면 설치(특히 iOS PWA 푸시 전제)와 standalone 표시를 위해 제공.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '일일 업무 보고 생성기',
    short_name: '업무 보고',
    description: '오늘의 진행률과 할 일을 입력하면 깔끔한 일일 업무 보고서를 손쉽게 만들 수 있어요.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#171717',
    lang: 'ko',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
