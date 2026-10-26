'use client';

import { Sparkles } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { useAgentSuggestions } from '.';

// 상단바의 AI 도우미 진입점.
// - 데스크톱(lg 이상)은 패널을 접었을 때만 입력 모양 버튼("AI 도우미에게 부탁하기 ⌘K")으로 보인다 — GitHub·Vercel 상단 검색창처럼
//   늘 같은 자리에서 부를 수 있고 본문 폭을 차지하지 않는다. 추천이 있으면 개수를 함께 보여 준다. 펼쳐 두면 패널이 있으므로 숨긴다.
// - 모바일(lg 미만)은 아이콘 버튼으로 시트를 열고 닫는다. 추천이 있으면 점으로 알린다.
export function AgentChatButton() {
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const expanded = useAgentChatStore((s) => s.expanded);
  const suggestionCount = useAgentSuggestions().suggestions.length;
  const reveal = () => useAgentChatStore.getState().reveal();

  return (
    <>
      {!expanded && (
        <button
          type="button"
          onClick={reveal}
          aria-label={`AI 도우미에게 부탁하기${suggestionCount > 0 ? `, 추천 ${suggestionCount}개` : ''}`}
          className="hidden h-9 w-72 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 lg:flex dark:border-zinc-700/50 dark:bg-card/50 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-[#2c2e33]"
        >
          <Sparkles size={14} className="shrink-0 text-blue-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">AI 도우미에게 부탁하기</span>
          {suggestionCount > 0 && (
            <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              추천 {suggestionCount}
            </span>
          )}
          <kbd className="shrink-0 rounded border border-zinc-200 px-1 font-sans text-[10px] text-zinc-400 dark:border-zinc-700">
            ⌘K
          </kbd>
        </button>
      )}
      <button
        type="button"
        onClick={() => (isOpen ? useAgentChatStore.getState().setOpen(false) : reveal())}
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
        {suggestionCount > 0 && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-zinc-950" />
        )}
      </button>
    </>
  );
}
