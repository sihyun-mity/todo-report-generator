import { Suspense } from 'react';
import {
  AgentAssistant,
  AgentBusyGuard,
  AgentLayoutShell,
  AppTopBar,
  PasskeyRegisterBanner,
  ThemePromptDialog,
} from '@/components';
import { NewsDialogMount } from '@/app/(app)/_components';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  // AgentLayoutShell: 바깥 틀(isolate 스태킹 컨텍스트). AI 모드로 열리면 데스크톱에서 채팅 열 너비만큼 비운다
  return (
    <AgentLayoutShell>
      <AppTopBar />
      {/* AI 도우미가 요청을 처리하는 동안 본문 조작을 막는다(상단바·채팅 패널은 바깥이라 그대로 쓴다) */}
      <AgentBusyGuard>
        <PasskeyRegisterBanner />
        {children}
      </AgentBusyGuard>

      {/* AI 도우미(채팅): (auth) 경로에는 두지 않도록 (app) 그룹 layout 에 마운트. 열기 버튼은 AppTopBar 에 있다 */}
      <AgentAssistant />

      {/* 첫 진입 화면 모드 선택 dialog: 다이얼로그 큐에서 가장 먼저(새소식보다 앞서) 노출된다 */}
      <ThemePromptDialog />

      {/* 새소식 dialog: (auth) 경로(/login, /signup)에는 노출되지 않도록 (app) 그룹 layout 에서만 마운트 */}
      <Suspense>
        <NewsDialogMount />
      </Suspense>
    </AgentLayoutShell>
  );
}
