'use client';

import { type KeyboardEvent, useId, useState } from 'react';
import { ArrowUp, NotebookPen, Sparkles } from 'lucide-react';
import type { AgentAction } from '@/types';
import { AGENT_NOTES_MAX_CHARS } from '@/constants';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { AgentActionChip, useAgentSuggestions } from '.';

type Mode = 'ask' | 'notes';

// 보고서 작성 화면 맨 위의 AI 입력창(GitHub 대시보드의 "Ask anything" 처럼) — 이 서비스의 첫 진입점.
// 부탁하면 도우미가 대화로 처리하고, "메모로 쓰기"로 적으면 보고서 초안으로 정리한다. 아래 칩은 바로 할 수 있는 작업으로,
// 가장 많이 쓰는 GitHub 가져오기를 맨 앞에 무지개 빛으로 둔다. 도구 칩은 도우미를 열지 않고 바로 실행한다.
// AI 를 쓸 수 없는 브라우저에서는 입력 대신 칩만 남는다(칩은 모델 없이 동작한다).
export function AgentComposer() {
  const inputId = useId();
  const availability = useAgentChatStore((s) => s.availability);
  const isRunning = useAgentChatStore((s) => s.isRunning);
  const { quickActions } = useAgentSuggestions();
  const [mode, setMode] = useState<Mode>('ask');
  const [text, setText] = useState('');

  const isReady = availability === 'available';
  const submit = () => {
    const value = text.trim();
    if (!value || isRunning) return;
    useAgentChatStore
      .getState()
      .submit(mode === 'ask' ? { type: 'prompt', text: value } : { type: 'notes', text: value });
    setText('');
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 부탁은 Enter 로 보내고, 메모는 여러 줄로 적으므로 ⌘/Ctrl+Enter 로 보낸다. 한글 조합 중 Enter 는 넘긴다.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (mode === 'ask' ? event.shiftKey : !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    submit();
  };
  const runAction = (action: AgentAction) =>
    useAgentChatStore.getState().submit(action, { reveal: action.type !== 'tool' });

  return (
    <section
      aria-label="AI 도우미에게 부탁하기"
      className="mb-8 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      {isReady && (
        <>
          <div className="mb-2 flex items-center gap-1">
            {(
              [
                ['ask', '부탁하기', Sparkles],
                ['notes', '메모로 쓰기', NotebookPen],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  mode === value
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                )}
              >
                <Icon size={12} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor={inputId} className="sr-only">
              {mode === 'ask' ? 'AI 도우미에게 부탁할 일' : '보고서로 정리할 메모'}
            </label>
            <textarea
              id={inputId}
              value={text}
              onChange={(event) =>
                setText(mode === 'notes' ? event.target.value.slice(0, AGENT_NOTES_MAX_CHARS) : event.target.value)
              }
              onKeyDown={handleKeyDown}
              rows={mode === 'notes' ? 3 : 1}
              placeholder={
                mode === 'ask'
                  ? '무엇을 할까요? 예: 지난주 보고서 요약해줘, 내일 할 일에 QA 회귀 테스트 추가해줘'
                  : '오늘 한 일·내일 할 일을 편하게 적으면 보고서로 정리해 드려요 (⌘+Enter 로 정리)'
              }
              className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={isRunning || text.trim() === ''}
              aria-label={mode === 'ask' ? '보내기' : '보고서로 정리'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </form>
        </>
      )}
      {quickActions.length > 0 && (
        // 무지개 빛(GitHub 칩)이 가로 스크롤 영역에 잘리지 않게 안쪽 여백을 둔다
        <div
          className={cn(
            '-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-1 py-1',
            isReady && 'mt-2 border-t border-zinc-100 pt-3 dark:border-zinc-800'
          )}
        >
          {quickActions.map((action) => (
            <AgentActionChip key={action.id} action={action} disabled={isRunning} onRun={runAction} />
          ))}
        </div>
      )}
    </section>
  );
}
