'use client';

import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Task } from './types';

interface TaskItemProps {
  task: Task;
  onUpdate: (updates: Partial<Task>) => void;
  onRemove: () => void;
  canRemove: boolean;
  autoFocus?: boolean;
}

const TaskItem = ({ task, onUpdate, onRemove, canRemove, autoFocus }: TaskItemProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

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
          min="0"
          max="100"
          value={task.progress}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (isNaN(val)) {
              onUpdate({ progress: 0 });
            } else {
              onUpdate({ progress: Math.min(100, Math.max(0, val)) });
            }
          }}
          className="w-12 rounded-md border border-zinc-200 bg-transparent px-1 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:w-16 sm:px-2 dark:border-zinc-700/50 dark:bg-input/30 dark:text-zinc-200 dark:focus:border-blue-500/50"
        />
        <span className="text-xs text-zinc-500 sm:text-sm">%</span>
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

export default TaskItem;
