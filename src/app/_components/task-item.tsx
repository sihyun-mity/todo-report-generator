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
  const contentRef = useRef<HTMLInputElement>(null);
  const progressInputRef = useRef<HTMLInputElement>(null);
  const progressGroupRef = useRef<HTMLDivElement>(null);
  const [isPresetOpen, setIsPresetOpen] = useState(false);

  useEffect(() => {
    if (autoFocus && contentRef.current) {
      contentRef.current.focus();
    }
  }, [autoFocus]);

  // 진행률 input + 빠른 선택 팝업을 하나의 그룹으로 보고, 그룹 바깥 클릭 시에만 팝업을 닫는다.
  // input.onBlur로 닫으면 팝업 버튼 클릭이 blur로 먼저 인식돼 클릭 자체가 무시되므로 useOnClickOutside를 사용한다.
  useOnClickOutside(progressGroupRef, () => setIsPresetOpen(false));

  const handlePickPreset = (value: number) => {
    onUpdate({ progress: value });
    setIsPresetOpen(false);
    progressInputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="shrink-0 text-zinc-400">-</span>
      <input
        ref={contentRef}
        type="text"
        placeholder="작업 내용"
        value={task.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        onBlur={(e) => onUpdate({ content: e.target.value.trim() })}
        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:px-3 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50"
      />
      <div ref={progressGroupRef} className="relative shrink-0">
        <input
          ref={progressInputRef}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min="0"
          max="100"
          value={task.progress}
          onFocus={() => setIsPresetOpen(true)}
          onBlur={(e) => {
            // 그룹 바깥(예: 탭으로 다른 컨트롤로 이동)으로 포커스가 빠지면 팝업도 닫는다.
            if (!progressGroupRef.current?.contains(e.relatedTarget as Node | null)) {
              setIsPresetOpen(false);
            }
          }}
          onChange={(e) => {
            // 빈 값/NaN은 0으로, 나머지는 0~100 범위로 클램프
            const parsed = parseInt(e.target.value, 10);
            const next = Number.isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
            onUpdate({ progress: next });
          }}
          aria-haspopup="menu"
          title="포커스하면 진행률 빠른 선택이 표시돼요"
          // type=number의 브라우저 기본 spinner 화살표 제거: webkit pseudo와 firefox appearance 둘 다 처리.
          className="w-14 [appearance:textfield] rounded-md border border-zinc-200 bg-transparent py-1.5 pr-5 pl-1 text-right text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-20 sm:pr-6 sm:pl-2 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-zinc-400 sm:text-sm dark:text-zinc-500"
        >
          %
        </span>
        {isPresetOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 z-20 mt-1 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                // input.onBlur가 선행되지 않도록 mousedown에서 default를 막아 input이 포커스를 잃지 않게 한다
                onMouseDown={(e) => e.preventDefault()}
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
