'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Portal } from '.';
import { cn } from '@/utils';

type Props = {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'default',
  onConfirm,
  onCancel,
}: Readonly<Props>) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const Icon = variant === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <Portal>
      <div
        role="presentation"
        onClick={onCancel}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm sm:p-6"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-2 border-b border-zinc-100 p-5 dark:border-zinc-800">
            <Icon
              className={cn('h-5 w-5 shrink-0', variant === 'danger' ? 'text-red-500' : 'text-blue-500')}
              aria-hidden="true"
            />
            <h2 id="confirm-dialog-title" className="text-base font-bold sm:text-lg">
              {title}
            </h2>
          </div>

          {description && (
            <div className="space-y-2 p-5 text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-300">
              {description}
            </div>
          )}

          <div className="flex gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              {cancelText}
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className={cn(
                'flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all',
                variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
