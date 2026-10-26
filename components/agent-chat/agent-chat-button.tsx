'use client';

import { Sparkles } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { useAgentSuggestions } from '.';

// 모바일(lg 미만) 상단바의 AI 도우미 열기 버튼. 데스크톱은 도우미가 늘 오른쪽에 있어 버튼이 없다.
// 추천이 있으면 점으로 알린다.
export function AgentChatButton() {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const hasSuggestions = useAgentSuggestions().suggestions.length > 0;

  return (
    <button
      type="button"
      onClick={() => (isOpen ? useAgentChatStore.getState().setOpen(false) : useAgentChatStore.getState().reveal())}
      aria-expanded={isOpen}
      aria-label="AI 도우미"
      title="AI 도우미 (⌘K / Ctrl+K)"
      className={cn(
        'relative flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all sm:px-3 lg:hidden',
        isOpen
          ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700/50 dark:bg-card/50 dark:text-zinc-300 dark:hover:bg-[#2c2e33]'
      )}
    >
      <Sparkles size={16} />
      <span className="hidden sm:inline">AI 도우미</span>
      {hasSuggestions && (
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-zinc-950" />
      )}
    </button>
  );
}
