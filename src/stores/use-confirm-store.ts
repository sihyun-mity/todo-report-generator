import { create } from 'zustand';
import type { ConfirmOptions, ConfirmStore } from '@/types';
import { createId } from '@/utils';

// 확인 다이얼로그 stack — 동시에 여러 confirm이 호출되어도 가장 마지막에 push된 항목이 위에 표시되고
// 응답하면 stack에서 제거되어 그 아래 항목이 자동으로 노출된다.
export const useConfirmStore = create<ConfirmStore>()((set, get) => ({
  stack: [],
  push: (entry) => set((s) => ({ stack: [...s.stack, entry] })),
  resolve: (id, value) => {
    const entry = get().stack.find((e) => e.id === id);
    if (!entry) return;
    entry.resolve(value);
    set((s) => ({ stack: s.stack.filter((e) => e.id !== id) }));
  },
}));

// react-hot-toast의 `toast()`와 동일한 패턴 — 컴포넌트 외부에서도 호출 가능한 imperative API.
// 사용처는 hook 호출이나 dialog JSX 마운트 없이 `await confirm({...})`만 하면 된다.
export const confirm = (options: ConfirmOptions): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().push({ id: createId(), ...options, resolve });
  });
};
