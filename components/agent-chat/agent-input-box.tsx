'use client';

import { type KeyboardEvent, type RefObject, useId, useRef, useState } from 'react';
import { ArrowUp, Mic, Square } from 'lucide-react';
import { useAgentChatStore } from '@/stores';
import { cn } from '@/utils';
import { useSpeechInput } from '.';

type AgentInputBoxProps = {
  placeholder: string;
  // 도구 줄 왼쪽의 한 줄 안내(예시·단축키). 길면 말줄임한다.
  hint?: string;
  disabled?: boolean;
  isRunning: boolean;
  onSubmit: (text: string) => void;
  onStop?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  // Nano로 넘어와 여기를 봐야 할 때 — 값이 바뀔 때마다 바깥으로 퍼지는 링을 다시 띄운다
  attentionKey?: number | null;
  className?: string;
};

// Nano 입력 상자 — 패널과 홈 입력창이 같이 쓴다.
// 상자 하나 안에 글 영역(위)과 도구 줄(아래: 안내 · 마이크 · 보내기)을 둔다(Claude·Gemini·GitHub 입력창처럼).
// 버튼을 글 영역 옆에 세우면 글이 여러 줄이 될 때 버튼과 글줄 높이가 어긋나고, 안내 문구가 버튼에 밀려 두 줄로 꺾였다.
// 안내 문구(placeholder)는 한 줄에 들어갈 만큼 짧게 쓰고, 예시·단축키는 도구 줄의 hint 로 뺀다.
// Enter 로 보내고 Shift+Enter 로 줄을 바꾼다(한글 조합 중 Enter 는 넘긴다). 받아쓰기는 지금 글 뒤에 이어 붙인다.
export function AgentInputBox({
  placeholder,
  hint,
  disabled,
  isRunning,
  onSubmit,
  onStop,
  textareaRef,
  attentionKey,
  className,
}: Readonly<AgentInputBoxProps>) {
  const inputId = useId();
  const [text, setText] = useState('');
  const speechBase = useRef('');
  const speech = useSpeechInput((transcript) => {
    setText(speechBase.current ? `${speechBase.current} ${transcript}` : transcript);
  });

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    // 처리 중이면 보내지 않고 알린다 — 적은 글은 그대로 두어 끝난 뒤 다시 보낼 수 있게 한다
    if (isRunning) {
      useAgentChatStore.getState().notifyBusy();
      return;
    }
    speech.stop();
    onSubmit(value);
    setText('');
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };
  const toggleSpeech = () => {
    if (speech.isListening) {
      speech.stop();
      return;
    }
    speechBase.current = text.trim();
    void speech.start();
  };

  const iconButton =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        'relative rounded-2xl border border-zinc-200 bg-white transition-colors focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-500',
        disabled && 'bg-zinc-50 dark:bg-zinc-900/50',
        className
      )}
    >
      {attentionKey != null && (
        <span
          key={attentionKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-agent-attention-ring rounded-2xl"
        />
      )}
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <textarea
        ref={textareaRef}
        id={inputId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed dark:text-zinc-100 dark:placeholder:text-zinc-500"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        {/* 안내 줄도 입력칸의 label 로 둔다 — 버튼 사이 빈 곳까지 채우므로(flex-1) 이 줄을 눌러도 입력칸으로 포커스가 간다.
            입력칸 이름은 위의 sr-only label 로 충분하므로 보조기술에는 숨긴다 */}
        <label
          htmlFor={inputId}
          aria-hidden
          // 버튼이 아니라 입력칸의 일부다 — 커스텀 포인터는 버튼처럼 감싸 강조하지 않고 입력칸처럼 I-beam 캐럿으로 보이고,
          // 눌림 피드백(label[for] 이 대상)으로 누르는 동안 줄어들지 않게 뺀다
          data-pointer-caret
          data-press-ignore
          className={cn(
            'min-w-0 flex-1 self-stretch truncate pl-1.5 text-[11px] leading-8 text-zinc-400 dark:text-zinc-500',
            disabled ? 'cursor-not-allowed' : 'cursor-text'
          )}
        >
          {hint}
        </label>
        {!disabled && speech.isSupported && !isRunning && (
          <button
            type="button"
            onClick={toggleSpeech}
            aria-pressed={speech.isListening}
            aria-label={speech.isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
            title={speech.isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
            className={cn(
              iconButton,
              speech.isListening
                ? 'animate-pulse bg-red-500 text-white'
                : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            )}
          >
            <Mic size={15} aria-hidden />
          </button>
        )}
        {isRunning && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="멈추기"
            className={cn(
              iconButton,
              'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600'
            )}
          >
            <Square size={12} fill="currentColor" aria-hidden />
          </button>
        ) : (
          !disabled && (
            <button
              type="submit"
              // 처리 중에도 누를 수 있게 둔다(흐리게만) — 누르면 왜 보낼 수 없는지 알린다
              disabled={text.trim() === ''}
              aria-disabled={isRunning || undefined}
              aria-label="보내기"
              className={cn(
                iconButton,
                'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white',
                isRunning && 'opacity-30'
              )}
            >
              <ArrowUp size={15} aria-hidden />
            </button>
          )
        )}
      </div>
    </form>
  );
}
