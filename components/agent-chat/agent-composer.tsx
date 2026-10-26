'use client';

import { type KeyboardEvent, useId, useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import type { AgentAction } from '@/types';
import { useAgentChatStore } from '@/stores';
import { AgentActionChip, useAgentSuggestions } from '.';

// 보고서 작성 화면 맨 위의 AI 입력창(GitHub 대시보드의 "Ask anything" 처럼) — 이 서비스의 첫 진입점.
// 입력창은 하나다: 부탁("지난주 요약해줘")이면 도우미가 대화로 처리하고, 오늘 한 일을 적은 메모면 보고서 초안으로 정리한다 —
// 어느 쪽인지는 도우미가 가른다(규칙 + 의도 분류). 아래 칩은 바로 할 수 있는 작업으로, 가장 많이 쓰는 GitHub 가져오기를
// 맨 앞에 무지개 빛으로 둔다. 도구 칩은 도우미를 열지 않고 바로 실행한다.
// AI 를 쓸 수 없는 브라우저에서는 입력 대신 칩만 남는다(칩은 모델 없이 동작한다).
export function AgentComposer() {
  const inputId = useId();
  const availability = useAgentChatStore((s) => s.availability);
  const isRunning = useAgentChatStore((s) => s.isRunning);
  const { quickActions } = useAgentSuggestions();
  const [text, setText] = useState('');

  const isReady = availability === 'available';
  const submit = () => {
    const value = text.trim();
    if (!value || isRunning) return;
    useAgentChatStore.getState().submit({ type: 'prompt', text: value });
    setText('');
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 로 보내고 Shift+Enter 로 줄을 바꾼다. 한글 조합 중 Enter 는 넘긴다.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <Sparkles size={16} className="mb-3 ml-1 shrink-0 text-blue-500" aria-hidden />
          <label htmlFor={inputId} className="sr-only">
            AI 도우미에게 부탁하거나 오늘 한 일 적기
          </label>
          <textarea
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="부탁하거나 오늘 한 일을 적어 보세요. 예: 지난주 보고서 요약해줘 / 로그인 오류 고쳤고 결제 리팩터링 절반 했어"
            className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            type="submit"
            disabled={isRunning || text.trim() === ''}
            aria-label="보내기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <ArrowUp size={16} aria-hidden />
          </button>
        </form>
      )}
      {quickActions.length > 0 && (
        // 넘치면 줄을 바꾼다 — 가로 스크롤(overflow)로 두면 GitHub 칩의 무지개 빛(blur 10px)이 스크롤 영역 경계에서 사각형으로 잘린다
        <div
          className={
            isReady
              ? 'mt-2 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800'
              : 'flex flex-wrap gap-2'
          }
        >
          {quickActions.map((action) => (
            <AgentActionChip key={action.id} action={action} disabled={isRunning} onRun={runAction} />
          ))}
        </div>
      )}
    </section>
  );
}
