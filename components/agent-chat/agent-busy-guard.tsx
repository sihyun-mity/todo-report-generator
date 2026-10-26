'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

// AI 도우미가 요청을 처리하는 동안 페이지 본문을 조작하지 못하게 막는다.
// 도구는 실행 시점의 store 를 읽고 쓰지만, 모델이 판단에 쓴 폼 스냅샷은 몇 초 전 것이라 그사이 사용자가 고친 내용을
// 교체 도구(구역 바꾸기·기록 불러오기 등)가 덮을 수 있다. inert 로 클릭·입력·포커스를 막고(스크롤은 된다),
// 상단바와 채팅 패널(멈추기·확인 카드)은 이 바깥이라 그대로 쓸 수 있다.
export function AgentBusyGuard({ children }: Readonly<{ children: ReactNode }>) {
  const isRunning = useAgentChatStore((s) => s.isRunning);

  return (
    <>
      <div inert={isRunning} aria-busy={isRunning} className={cn('transition-opacity', isRunning && 'opacity-60')}>
        {children}
      </div>
      {isRunning && (
        <div role="status" className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
          <p className="flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-zinc-100/90 dark:text-zinc-900">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            AI 도우미가 작업하는 동안 화면 편집을 잠시 멈춰요
          </p>
        </div>
      )}
    </>
  );
}
