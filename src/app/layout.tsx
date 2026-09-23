import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@/styles/globals.css';
import {
  BackButtonHandler,
  ConfirmDialogHost,
  CustomPointer,
  MobileDetector,
  PressFeedback,
  themeInitScript,
  ThemeProvider,
  ToasterProvider,
} from '@/components';
import { QueryProvider } from '@/providers';
import { staticMetadata } from '@/utils';

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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전 다크모드 클래스를 동기 적용해 라이트 → 다크 깜빡임 방지 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="touch-pan-y bg-background font-pretendard break-keep text-foreground antialiased select-none">
        <QueryProvider>
          <Suspense>
            <ThemeProvider>
              <div className="min-h-screen-enhanced bg-background">{children}</div>
            </ThemeProvider>
          </Suspense>

          {/* 브라우저 back(안드 하드웨어 back 포함)으로 모달·다이얼로그를 닫는 BackStack 연결. */}
          <BackButtonHandler />

          <ToasterProvider />

          <MobileDetector />

          <ConfirmDialogHost />

          {/* hover + fine 포인터 환경에서 인터랙션 요소를 iPadOS 스타일로 강조하는 커스텀 포인터 */}
          <CustomPointer />

          {/* 터치/클릭한 요소를 살짝 안으로 눌러 넣는 모바일 시스템 앱 스타일 눌림 피드백 */}
          <PressFeedback />

          {/* For Portal Component */}
          <div id="next-app-portal" />
        </QueryProvider>
      </body>
    </html>
  );
}
