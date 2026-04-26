'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Task } from '@/types';
import { cn } from '@/utils';
import { useOnClickOutside } from '@/hooks';

type TaskItemProps = {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onRemove: () => void;
  canRemove: boolean;
  autoFocus?: boolean;
};

const PRESETS: ReadonlyArray<number> = [20, 40, 60, 80, 100];

export const TaskItem = ({ task, onUpdate, onRemove, canRemove, autoFocus }: Readonly<TaskItemProps>) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const presetRef = useRef<HTMLDivElement>(null);
  const [isPresetOpen, setIsPresetOpen] = useState(false);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useOnClickOutside(presetRef, () => setIsPresetOpen(false));

  const handlePickPreset = (value: number) => {
    onUpdate({ progress: value });
    setIsPresetOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="shrink-0 text-zinc-400">-</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="작업 내용"
        value={task.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        onBlur={(e) => onUpdate({ content: e.target.value.trim() })}
        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:px-3 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50"
      />
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min="0"
          max="100"
          value={task.progress}
          onChange={(e) => {
            // 빈 값/NaN은 0으로, 나머지는 0~100 범위로 클램프
            const parsed = parseInt(e.target.value, 10);
            const next = Number.isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
            onUpdate({ progress: next });
          }}
          className="w-12 rounded-md border border-zinc-200 bg-transparent px-1 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-16 sm:px-2 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50"
        />
        <div ref={presetRef} className="relative">
          <button
            type="button"
            onClick={() => setIsPresetOpen((prev) => !prev)}
            aria-label="진행률 빠른 선택"
            aria-haspopup="menu"
            aria-expanded={isPresetOpen}
            className="cursor-pointer rounded px-1 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 sm:text-sm dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="진행률 빠른 선택"
          >
            %
          </button>
          {isPresetOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 z-20 mt-1 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              {PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handlePickPreset(value)}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    task.progress === value
                      ? 'bg-blue-500 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/30"
        disabled={!canRemove}
        title="작업 삭제"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
