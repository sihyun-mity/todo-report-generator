'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAgentChatStore } from '@/stores';

// 지금 경로를 Nano store 에 알린다 — 화면별 상황 제안용.
// usePathname 은 동적 세그먼트(/whats-new/[id]) 프리렌더에서 suspend 하므로 이 컴포넌트만 <Suspense> 로 좁게 감싼다
// (AgentAssistant 를 통째로 감싸면 패널이 서버 HTML 에서 빠져 첫 화면이 출렁인다).
export function AgentPathTracker() {
  const pathname = usePathname();
  useEffect(() => {
    useAgentChatStore.getState().setPathname(pathname);
  }, [pathname]);
  return null;
}
