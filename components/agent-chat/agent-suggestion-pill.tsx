'use client';

import { useEffect, useState } from 'react';
import { Github, Lightbulb, X } from 'lucide-react';
import type { AgentSuggestion } from '@/types';
import { AGENT_SUGGESTION_PILL_DELAY_MS } from '@/constants';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { useAgentSuggestions } from '.';

// 어느 화면에서나 지금 할 만한 일을 하나 알려 주는 알약(삼성 One UI 의 상황 제안처럼).
// 도우미가 이미 펼쳐져 있으면(데스크톱 패널·모바일 시트) 그 안에 같은 제안이 있으므로 숨긴다.
// 상태가 출렁일 때마다 떴다 사라지지 않게 같은 제안이 잠시 유지된 뒤에 띄운다. 실행하거나 X 로 넘기면 이번 세션에서는 다시 띄우지 않는다.
// 도구를 바로 실행하는 제안은 도우미를 열지 않고 화면에서 결과를 보게 하고(도구가 토스트로 알린다), AI 에게 묻는 일만 도우미를 연다.
export function AgentSuggestionPill() {
  const { suggestions } = useAgentSuggestions();
  const expanded = useAgentChatStore((s) => s.expanded);
  const isOpen = useAgentChatStore((s) => s.isOpen);
  const isRunning = useAgentChatStore((s) => s.isRunning);
  const top = suggestions[0] ?? null;
  const topId = top?.id ?? null;
  const [shownId, setShownId] = useState<string | null>(null);

  // 제안 객체는 렌더마다 새로 만들어지므로 id 가 바뀔 때만 타이머를 다시 건다
  useEffect(() => {
    if (!topId) return;
    const timer = setTimeout(() => setShownId(topId), AGENT_SUGGESTION_PILL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [topId]);

  if (!top || shownId !== top.id || isOpen || isRunning) return null;

  const run = (suggestion: AgentSuggestion) => {
    const store = useAgentChatStore.getState();
    store.dismiss(suggestion.id);
    store.submit(suggestion.action, { reveal: suggestion.action.type !== 'tool' });
  };
  const Icon = top.emphasis ? Github : Lightbulb;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-35 flex justify-center px-4',
        // 모바일은 하단 복사 바 위, 데스크톱은 접은 레일(56px)을 뺀 본문 가운데
        'bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 lg:pr-14',
        expanded && 'lg:hidden'
      )}
    >
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex max-w-md min-w-0 animate-agent-pill-in items-center gap-1 rounded-full shadow-lg',
          top.emphasis
            ? 'rainbow-glow'
            : 'border border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/95'
        )}
      >
        <button
          type="button"
          onClick={() => run(top)}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-full py-2 pr-1 pl-3.5 text-left',
            top.emphasis && 'bg-white/70 backdrop-blur-sm dark:bg-zinc-900/60'
          )}
        >
          <Icon
            size={15}
            className={cn('shrink-0', top.emphasis ? 'text-zinc-900 dark:text-white' : 'text-blue-500')}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{top.title}</span>
            <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{top.reason}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => useAgentChatStore.getState().dismiss(top.id)}
          aria-label="이 제안 넘기기"
          className="mr-1.5 shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
