'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { queries } from '@/providers';
import { useAgentChatStore } from '@/stores';
import { newsIdFromPath } from '@/utils';

// 지금 경로를 Nano store 에 알린다 — 화면별 상황 제안용.
// usePathname 은 동적 세그먼트(/whats-new/[id]) 프리렌더에서 suspend 하므로 이 컴포넌트만 <Suspense> 로 좁게 감싼다
// (AgentAssistant 를 통째로 감싸면 패널이 서버 HTML 에서 빠져 첫 화면이 출렁인다).
export function AgentPathTracker() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  useEffect(() => {
    useAgentChatStore.getState().setPathname(pathname);
    // 새소식 상세를 열면 그 소식을 미리 받아 둔다 — "이 소식 요약해줘"에 기다리지 않고 읽고, 화면을 벗어난 뒤에도
    // Nano가 "방금 보신 'OO' 소식"처럼 제목으로 가리킬 수 있게. AI 를 쓸 수 있을 때만(쓸 일이 없으면 받지 않는다).
    const newsId = newsIdFromPath(pathname);
    if (newsId && useAgentChatStore.getState().availability === 'available')
      void queryClient.prefetchQuery(queries.news.detail(newsId));
  }, [pathname, queryClient]);
  return null;
}
