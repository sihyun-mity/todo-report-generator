'use client';

import { Toaster } from 'react-hot-toast';

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      toastOptions={{
        duration: 3000,
        style: {
          background: 'var(--toast-bg, #333)',
          color: 'var(--toast-color, #fff)',
          borderRadius: '10px',
          fontSize: '14px',
          border: '1px solid var(--toast-border, transparent)',
          // 데스크톱: 가능한 한 한 줄로 보이도록 넉넉히 / 모바일: 뷰포트 overflow 방지
          // 페이지 콘텐츠 최대폭(max-w-5xl = 64rem)을 넘지 않도록 720px 상한
          maxWidth: 'min(calc(100vw - 2rem), 720px)',
          width: 'fit-content',
        },
        success: {
          iconTheme: {
            primary: '#10B981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#EF4444',
            secondary: '#fff',
          },
        },
      }}
    />
  );
}
