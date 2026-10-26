'use client';

import { Sparkles } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';

// 상단바의 AI 도우미 열기 버튼. 플로팅 버튼 대신 상단바에 둔 이유는 AGENTS.md "에이전트 도구 (WebMCP)" 참고 —
// 모바일 하단 복사 바·토스트와 겹치지 않고, (app) 그룹 화면에만 있는 상단바라 로그인·회원가입 화면에는 자연히 빠진다.
export function AgentChatButton() {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const toggle = useAgentChatStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={isOpen}
      aria-label="AI 도우미"
      title="AI 도우미"
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all sm:px-3',
        isOpen
          ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card/50 dark:text-zinc-300 dark:hover:bg-[#2c2e33]'
      )}
    >
      <Sparkles size={16} />
      <span className="hidden sm:inline">AI 도우미</span>
    </button>
  );
}
