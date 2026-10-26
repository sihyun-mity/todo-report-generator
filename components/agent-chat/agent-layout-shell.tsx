'use client';

import type { ReactNode } from 'react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

// (app) 레이아웃의 바깥 틀. AI 모드(도킹)로 열려 있으면 데스크톱(lg 이상)에서 오른쪽에 채팅 열 너비만큼 비워
// 상단바·본문이 채팅에 가리지 않고 나란히 보이게 한다(채팅 패널의 lg:w-[440px] 과 맞춘다).
// isolate: 배경 이펙트(-z-10 canvas)가 이 div 의 bg 위·콘텐츠 아래에 정확히 끼도록 스태킹 컨텍스트를 만든다
export function AgentLayoutShell({ children }: Readonly<{ children: ReactNode }>) {
  const isDocked = useAgentChatStore((s) => s.isOpen && s.layout === 'docked');

  return (
    <div
      className={cn(
        'isolate min-h-screen-enhanced bg-background text-foreground transition-[padding] duration-200',
        isDocked && 'lg:pr-[440px]'
      )}
    >
      {children}
    </div>
  );
}
