import { Suspense } from 'react';
import {
  AgentAssistant,
  AgentBusyGuard,
  AgentLayoutShell,
  AgentPathTracker,
  AgentSuggestionPill,
  AppTopBar,
  PasskeyRegisterBanner,
  ThemePromptDialog,
} from '@/components';
import { NewsDialogMount } from '@/app/(app)/_components';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  // AgentLayoutShell: 바깥 틀(isolate 스태킹 컨텍스트). 데스크톱에서는 늘 있는 AI 도우미 너비만큼 오른쪽을 비운다
  return (
    <AgentLayoutShell>
      <AppTopBar />
      {/* AI 도우미가 요청을 처리하는 동안 본문 조작을 막는다(상단바·채팅 패널은 바깥이라 그대로 쓴다) */}
      <AgentBusyGuard>
        <PasskeyRegisterBanner />
        {children}
      </AgentBusyGuard>

      {/* AI 도우미(서비스 에이전트): (auth) 경로에는 두지 않도록 (app) 그룹 layout 에 마운트. 데스크톱은 늘 오른쪽에 있고
          모바일은 상단바 버튼·⌘K·홈 입력창·제안 알약으로 연다 */}
      <AgentAssistant />
      {/* 어느 화면에서나 지금 할 만한 일을 알려 주는 상황 제안 알약 */}
      <AgentSuggestionPill />
      {/* 화면별 제안용 경로 — usePathname 이 동적 세그먼트 프리렌더에서 suspend 하므로 좁게 감싼다 */}
      <Suspense>
        <AgentPathTracker />
      </Suspense>

      {/* 첫 진입 화면 모드 선택 dialog: 다이얼로그 큐에서 가장 먼저(새소식보다 앞서) 노출된다 */}
      <ThemePromptDialog />

      {/* 새소식 dialog: (auth) 경로(/login, /signup)에는 노출되지 않도록 (app) 그룹 layout 에서만 마운트 */}
      <Suspense>
        <NewsDialogMount />
      </Suspense>
    </AgentLayoutShell>
  );
}
