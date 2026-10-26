'use client';

import { Github, Lightbulb, NotebookPen, Sparkles, X, Zap } from 'lucide-react';
import type { AgentAction, AgentQuickAction, AgentSuggestion } from '@/types';
import { cn } from '@/utils';

// 할 일 종류별 아이콘 — GitHub 가져오기·업무 메모 정리는 고유 아이콘, AI 에게 묻는 일은 반짝이, 도구를 바로 실행하는 일은 번개
function ActionIcon({
  action,
  id,
  size,
  className,
}: Readonly<{ action: AgentAction; id: string; size: number; className?: string }>) {
  if (id === 'github' || (action.type === 'tool' && action.tool === 'open_github_import'))
    return <Github size={size} className={className} aria-hidden />;
  if (action.type === 'notes') return <NotebookPen size={size} className={className} aria-hidden />;
  if (action.type === 'prompt') return <Sparkles size={size} className={className} aria-hidden />;
  return <Zap size={size} className={className} aria-hidden />;
}

type AgentActionChipProps = {
  action: AgentQuickAction;
  // Nano가 처리 중 — 흐리게 보이지만 누를 수 있다(누르면 처리 중이라고 알린다)
  busy?: boolean;
  // 가로 스크롤 줄 안에서는 바깥으로 번지는 빛(blur)이 스크롤 경계에서 사각형으로 잘리므로 무지개 테두리만 남긴다
  glow?: 'full' | 'ring';
  onRun: (action: AgentQuickAction['action']) => void;
};

// 빠른 작업 칩. 가장 많이 쓰는 GitHub 가져오기(emphasis)는 금일 헤더 버튼과 같은 무지개 빛으로 강조한다.
export function AgentActionChip({ action, busy, glow = 'full', onRun }: Readonly<AgentActionChipProps>) {
  if (action.emphasis)
    return (
      <span className={cn('rainbow-glow shrink-0 rounded-full', glow === 'ring' && 'after:hidden')}>
        <button
          type="button"
          onClick={() => onRun(action.action)}
          aria-disabled={busy || undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-zinc-900 backdrop-blur-sm transition-colors hover:bg-white/65 dark:bg-zinc-900/75 dark:text-white dark:hover:bg-zinc-900/60',
            busy && 'opacity-50'
          )}
        >
          <ActionIcon action={action.action} id={action.id} size={13} />
          {action.label}
        </button>
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => onRun(action.action)}
      aria-disabled={busy || undefined}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800',
        busy && 'opacity-50'
      )}
    >
      <ActionIcon action={action.action} id={action.id} size={13} className="text-zinc-400" />
      {action.label}
    </button>
  );
}

type AgentSuggestionCardProps = {
  suggestion: AgentSuggestion;
  // Nano가 처리 중 — 흐리게 보이지만 누를 수 있다(누르면 처리 중이라고 알린다)
  busy?: boolean;
  onRun: (suggestion: AgentSuggestion) => void;
  onDismiss?: (suggestion: AgentSuggestion) => void;
};

// 상황 제안 카드 — 무엇을 왜 권하는지 한 줄씩. 누르면 바로 실행하고, X 로 이번 세션에서 넘긴다.
export function AgentSuggestionCard({ suggestion, busy, onRun, onDismiss }: Readonly<AgentSuggestionCardProps>) {
  const body = (
    <button
      type="button"
      onClick={() => onRun(suggestion)}
      aria-disabled={busy || undefined}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors',
        busy && 'opacity-50',
        suggestion.emphasis
          ? 'bg-white/85 backdrop-blur-sm hover:bg-white/70 dark:bg-zinc-900/80 dark:hover:bg-zinc-900/65'
          : 'border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700/70 dark:bg-zinc-900 dark:hover:bg-zinc-800'
      )}
    >
      <ActionIcon
        action={suggestion.action}
        id={suggestion.id}
        size={15}
        className={cn('mt-0.5 shrink-0', suggestion.emphasis ? 'text-zinc-900 dark:text-white' : 'text-blue-500')}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-100">{suggestion.title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {suggestion.reason}
        </span>
      </span>
    </button>
  );

  return (
    <div className="group relative">
      {/* rainbow-glow 는 inline-flex 라 내용 너비로 줄어든다 — 다른 제안 카드처럼 줄을 꽉 채운다 */}
      {suggestion.emphasis ? <div className="rainbow-glow flex w-full rounded-xl">{body}</div> : body}
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(suggestion)}
          aria-label="이 추천 닫기"
          className="absolute top-1.5 right-1.5 rounded-full p-1 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-600 focus-visible:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

// 제안 묶음 머리줄
export function AgentSuggestionHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
      <Lightbulb size={12} aria-hidden />
      {children}
    </p>
  );
}
