'use client';

import type { ReactNode } from 'react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

// (app) 레이아웃의 바깥 틀. 데스크톱(lg 이상)에서 Nano 패널을 펼쳐 두면 그 너비만큼 오른쪽을 비워 상단바·본문이
// 가리지 않고 나란히 보이게 한다(AgentPanel 의 lg:w-[400px] 과 맞춘다). 접으면 본문이 전체 폭을 쓴다.
// isolate: 배경 이펙트(-z-10 canvas)가 이 div 의 bg 위·콘텐츠 아래에 정확히 끼도록 스태킹 컨텍스트를 만든다
export function AgentLayoutShell({ children }: Readonly<{ children: ReactNode }>) {
  const expanded = useAgentChatStore((s) => s.expanded);

  return (
    <div
      className={cn(
        'isolate min-h-screen-enhanced bg-background text-foreground transition-[padding] duration-200',
        expanded && 'lg:pr-[400px]'
      )}
    >
      {children}
    </div>
  );
}
