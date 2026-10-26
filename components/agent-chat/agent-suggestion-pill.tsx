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

  const followUpCount = useAgentChatStore((s) => s.followUpCount);

  // 사용자가 눌러야 할 일(초안의 "폼에 추가" 등)이 도우미에 남아 있는데 도우미가 가려져 있으면 추천보다 먼저 알린다
  if (followUpCount > 0 && !isOpen && !isRunning)
    return (
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 z-35 flex justify-center px-4',
          'bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6',
          expanded && 'lg:hidden'
        )}
      >
        <button
          type="button"
          onClick={() => useAgentChatStore.getState().showFollowUp()}
          className="pointer-events-auto flex animate-agent-pill-in items-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-amber-600"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />
          AI 도우미에 확인할 일이 {followUpCount}개 있어요
          <span className="underline underline-offset-2">보기</span>
        </button>
      </div>
    );

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
        // 모바일은 하단 복사 바 위, 데스크톱은 본문 가운데 아래
        'bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6',
        expanded && 'lg:hidden'
      )}
    >
      <div
        role="status"
        className={cn(
          'pointer-events-auto max-w-md min-w-0 animate-agent-pill-in rounded-full shadow-lg',
          top.emphasis ? 'rainbow-glow' : 'border border-zinc-200 dark:border-zinc-700'
        )}
      >
        {/* 알약 전체가 실행 영역이다 — 실행 버튼을 알약 전체에 깔고(inset-0), 글은 그 위에 클릭을 통과시키며 얹고,
            넘기기(X)는 그 영역 안에 따로 올린다(버튼 안에 버튼을 넣을 수 없어서) */}
        <div
          className={cn(
            'relative flex min-w-0 items-center gap-2 rounded-full py-2 pr-10 pl-3.5 transition-colors',
            top.emphasis
              ? 'bg-white/75 backdrop-blur-sm hover:bg-white/60 dark:bg-zinc-900/65 dark:hover:bg-zinc-900/50'
              : 'bg-white/95 backdrop-blur-md hover:bg-zinc-50 dark:bg-zinc-900/95 dark:hover:bg-zinc-800'
          )}
        >
          <button
            type="button"
            onClick={() => run(top)}
            aria-label={`${top.title} — ${top.reason}`}
            className="absolute inset-0 rounded-full"
          />
          <Icon
            size={15}
            className={cn(
              'pointer-events-none relative shrink-0',
              top.emphasis ? 'text-zinc-900 dark:text-white' : 'text-blue-500'
            )}
            aria-hidden
          />
          <span className="pointer-events-none relative min-w-0" aria-hidden>
            <span className="block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{top.title}</span>
            <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{top.reason}</span>
          </span>
          <button
            type="button"
            onClick={() => useAgentChatStore.getState().dismiss(top.id)}
            aria-label="이 제안 넘기기"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
