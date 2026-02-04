import type { Metadata, Viewport } from 'next';
import { ReactNode, Suspense } from 'react';
import '@/styles/globals.css';
import { MobileDetector } from '@/components';
import { cn, staticMetadata } from '@/utils';
import localFont from 'next/font/local';

export const metadata: Metadata = staticMetadata({
  title: '일일 업무 보고 생성기',
  description: '반박 시 님 말 다 맞음',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  weight: '45 920',
  variable: '--font-pretendard',
  preload: false,
});

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body
        className={cn(
          pretendard.variable,
          'touch-pan-y bg-background font-pretendard break-keep text-foreground antialiased select-none'
        )}
      >
        <Suspense>{children}</Suspense>
        <MobileDetector />

        {/* For Portal Component */}
        <div id="next-app-portal" />
      </body>
    </html>
  );
}
