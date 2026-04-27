'use client';

import { ConfirmDialog } from '.';
import { useConfirmStore } from '@/stores';

// 가장 마지막에 push된 entry만 렌더링한다. 사용자가 응답하면 stack에서 빠지고
// 그 아래 항목(중첩 호출이 있던 경우)이 자연스럽게 노출된다.
export function ConfirmDialogHost() {
  const stack = useConfirmStore((s) => s.stack);
  const resolve = useConfirmStore((s) => s.resolve);

  const top = stack[stack.length - 1];
  if (!top) return null;

  return (
    <ConfirmDialog
      isOpen
      title={top.title}
      description={top.description}
      confirmText={top.confirmText}
      cancelText={top.cancelText}
      variant={top.variant}
      onConfirm={() => resolve(top.id, true)}
      onCancel={() => resolve(top.id, false)}
    />
  );
}
