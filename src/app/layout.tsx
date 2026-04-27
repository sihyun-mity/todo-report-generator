import type { Metadata, Viewport } from 'next';
import { Suspense, ViewTransition } from 'react';
import '@/styles/globals.css';
import { MobileDetector, ThemeProvider, ToasterProvider, themeInitScript } from '@/components';
import { cn, staticMetadata } from '@/utils';
import localFont from 'next/font/local';

export const metadata: Metadata = staticMetadata({
  description: '오늘의 진행률과 할 일을 입력하면 깔끔한 일일 업무 보고서를 손쉽게 만들 수 있어요.',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // 안드로이드 가상 키보드가 layout viewport를 함께 축소하도록 지정
  // → fixed 위치의 모바일 복사 바가 키보드에 가려지지 않고 자동으로 위로 올라간다
  interactiveWidget: 'resizes-content',
};

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  weight: '45 920',
  variable: '--font-pretendard',
  preload: false,
});

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전 다크모드 클래스를 동기 적용해 라이트 → 다크 깜빡임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={cn(
          pretendard.variable,
          'touch-pan-y bg-background font-pretendard break-keep text-foreground antialiased select-none'
        )}
      >
        <Suspense>
          <ThemeProvider>
            <ViewTransition
              enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page' }}
              exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page' }}
            >
              {children}
            </ViewTransition>
          </ThemeProvider>
        </Suspense>

        <ToasterProvider />

        <MobileDetector />

        {/* For Portal Component */}
        <div id="next-app-portal" />
      </body>
    </html>
  );
}
