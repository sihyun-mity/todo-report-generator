'use client';

import { Mic } from 'lucide-react';
import { cn } from '@/utils';

type AgentMicButtonProps = { isListening: boolean; disabled: boolean; onClick: () => void };

export function AgentMicButton({ isListening, disabled, onClick }: Readonly<AgentMicButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isListening}
      aria-label={isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
      title={isListening ? '받아쓰기 멈추기' : '음성으로 입력'}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40',
        isListening
          ? 'animate-pulse bg-red-500 text-white'
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
      )}
    >
      <Mic size={16} aria-hidden />
    </button>
  );
}
