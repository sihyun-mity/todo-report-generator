import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import '@/styles/globals.css';
import {
  BackButtonHandler,
  ConfirmDialogHost,
  CustomPointer,
  MobileDetector,
  PageViewTransition,
  PopstateViewTransitionNotifier,
  themeInitScript,
  ThemeProvider,
  ToasterProvider,
} from '@/components';
import { PAGE_SHELL_ELEMENT_ID } from '@/constants';
import { QueryProvider } from '@/providers';
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
        <QueryProvider>
          <Suspense>
            <ThemeProvider>
              {/*
              PageViewTransition: Link/router 가 주입한 transitionTypes(nav-forward/back/fade)에 따라
              view-transitions.css 의 iOS 스타일 push/pop 슬라이드를 실행한다.
              page-shell div: 브라우저 back/forward(popstate) 전환 엔진이 PAGE_SHELL_ELEMENT_ID 로
              이 컨테이너를 찾아 view-transition-name 을 부여한다. snapshot 단위가 된다.
            */}
              <PageViewTransition>
                <div id={PAGE_SHELL_ELEMENT_ID} className="min-h-screen-enhanced bg-background">
                  {children}
                </div>
              </PageViewTransition>
            </ThemeProvider>
          </Suspense>

          {/* 브라우저 back/forward(popstate) View Transition 의 라우트 commit 보고용. */}
          <PopstateViewTransitionNotifier />

          {/* 브라우저 back(안드 하드웨어 back 포함)으로 모달·다이얼로그를 닫는 BackStack 연결. */}
          <BackButtonHandler />

          <ToasterProvider />

          <MobileDetector />

          <ConfirmDialogHost />

          {/* hover + fine 포인터 환경에서 인터랙션 요소를 iPadOS 스타일로 강조하는 커스텀 포인터 */}
          <CustomPointer />

          {/* For Portal Component */}
          <div id="next-app-portal" />
        </QueryProvider>
      </body>
    </html>
  );
}
