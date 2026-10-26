'use client';

import { useEffect, useState } from 'react';
import { Github, Lightbulb, Sparkles, X } from 'lucide-react';
import type { AgentSuggestion } from '@/types';
import { AGENT_SUGGESTION_PILL_DELAY_MS, AGENT_SUGGESTION_PILL_ID } from '@/constants';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { useAgentSuggestions } from '.';

// 어느 화면에서나 지금 할 만한 일을 하나 알려 주는 알약(삼성 One UI 의 상황 제안처럼).
// Nano가 이미 펼쳐져 있으면(데스크톱 패널·모바일 시트) 그 안에 같은 제안이 있으므로 숨긴다.
// 상태가 출렁일 때마다 떴다 사라지지 않게 같은 제안이 잠시 유지된 뒤에 띄운다. 실행하거나 X 로 넘기면 이번 세션에서는 다시 띄우지 않는다.
// 토스트(ToasterProvider)는 이 알약을 하단 차단 요소로 보고 그 위로 비켜 뜬다(AGENT_SUGGESTION_PILL_ID).
// 도구를 바로 실행하는 제안은 Nano를 열지 않고 화면에서 결과를 보게 하고(도구가 토스트로 알린다), AI 에게 묻는 일만 Nano를 연다.
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

  // 사용자가 눌러야 할 일(초안의 "폼에 추가" 등)이 Nano에 남아 있는데 Nano가 가려져 있으면 추천보다 먼저 알린다
  if (followUpCount > 0 && !isOpen && !isRunning)
    return (
      <div
        id={AGENT_SUGGESTION_PILL_ID}
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
          Nano에 확인할 일이 {followUpCount}개 있어요
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
      id={AGENT_SUGGESTION_PILL_ID}
      className={cn(
        'pointer-events-none fixed inset-x-0 z-35 flex justify-center px-4',
        // 모바일은 하단 복사 바 위, 데스크톱은 본문 가운데 아래
        'bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6',
        expanded && 'lg:hidden'
      )}
    >
      {/* 잘 안 보인다는 피드백으로 강조한다 — 나타날 때 바깥으로 퍼지는 링 두 번(제안이 바뀔 때마다 key 로 다시 재생),
          그 뒤에는 파란 빛이 은은하게 숨쉬듯 이어진다(GitHub 강조 알약은 무지개 빛이 그 역할을 한다) */}
      <div
        role="status"
        className={cn(
          'pointer-events-auto relative max-w-md min-w-0 animate-agent-pill-in rounded-full',
          top.emphasis
            ? 'rainbow-glow shadow-lg'
            : 'animate-agent-pill-glow border border-blue-300 dark:border-blue-700'
        )}
      >
        <span
          key={top.id}
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-agent-attention-ring rounded-full"
        />
        {/* 알약 전체가 실행 영역이다 — 실행 버튼을 알약 전체에 깔고(inset-0), 글은 그 위에 클릭을 통과시키며 얹고,
            넘기기(X)는 그 영역 안에 따로 올린다(버튼 안에 버튼을 넣을 수 없어서) */}
        <div
          className={cn(
            'relative flex min-w-0 items-center gap-2.5 rounded-full py-2 pr-10 pl-2 transition-colors',
            top.emphasis
              ? 'bg-white/75 backdrop-blur-sm hover:bg-white/60 dark:bg-zinc-900/65 dark:hover:bg-zinc-900/50'
              : 'bg-white/95 backdrop-blur-md hover:bg-blue-50 dark:bg-zinc-900/95 dark:hover:bg-blue-950/40'
          )}
        >
          <button
            type="button"
            onClick={() => run(top)}
            aria-label={`${top.title} — ${top.reason}`}
            className="absolute inset-0 rounded-full"
          />
          <span
            className={cn(
              'pointer-events-none relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              top.emphasis ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-blue-500 text-white'
            )}
            aria-hidden
          >
            <Icon size={15} />
          </span>
          <span className="pointer-events-none relative min-w-0" aria-hidden>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              <Sparkles size={10} />
              Nano 추천
            </span>
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
