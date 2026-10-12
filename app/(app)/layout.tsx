import { Suspense } from 'react';
import { AppTopBar, PasskeyRegisterBanner, ThemePromptDialog } from '@/components';
import { NewsDialogMount } from '@/app/(app)/_components';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  // isolate: 배경 이펙트(-z-10 canvas)가 이 div 의 bg 위·콘텐츠 아래에 정확히 끼도록 스태킹 컨텍스트를 만든다
  return (
    <div className="isolate min-h-screen-enhanced bg-background text-foreground">
      <AppTopBar />
      <PasskeyRegisterBanner />
      {children}

      {/* 첫 진입 화면 모드 선택 dialog: 다이얼로그 큐에서 가장 먼저(새소식보다 앞서) 노출된다 */}
      <ThemePromptDialog />

      {/* 새소식 dialog: (auth) 경로(/login, /signup)에는 노출되지 않도록 (app) 그룹 layout 에서만 마운트 */}
      <Suspense>
        <NewsDialogMount />
      </Suspense>
    </div>
  );
}
