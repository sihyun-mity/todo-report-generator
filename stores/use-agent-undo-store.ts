import { create } from 'zustand';
import type { AgentUndoStore } from '@/types';

// Nano가 바꾼 것들의 되돌리기 — 변경 카드의 버튼과 채팅의 되돌리기 도구가 같은 목록을 쓴다.
// 되돌리기는 바꾼 뒤 그대로일 때만 한다(undo 가 false 면 그사이 사용자나 다음 변경이 고친 것 — stale 로 둔다).
export const useAgentUndoStore = create<AgentUndoStore>()((set, get) => ({
  entries: [],
  // 새 변경이 생기면 앞에서 물은 "함께 되돌릴까요?"는 더 맞지 않는다
  push: (entry) => set((s) => ({ entries: [...s.entries, { ...entry, status: 'available' }], offered: null })),
  offered: null,
  offer: (offered) => set({ offered }),
  pending: () => get().entries.filter((e) => e.status === 'available'),
  available: () =>
    get()
      .pending()
      .filter((e) => e.canUndo?.() ?? true),
  undo: (id) => {
    const target = id
      ? get()
          .pending()
          .find((e) => e.id === id)
      : get().available().at(-1);
    if (!target) return null;
    const next = { ...target, status: target.undo() ? ('done' as const) : ('stale' as const) };
    set((s) => ({ entries: s.entries.map((e) => (e.id === target.id ? next : e)) }));
    return next;
  },
  undoThrough: (id) => {
    const pending = get().pending();
    const from = pending.findIndex((e) => e.id === id);
    if (from === -1) return [];
    const undone: Array<ReturnType<AgentUndoStore['undo']> & object> = [];
    for (const entry of pending.slice(from).reverse()) {
      const result = get().undo(entry.id);
      if (result?.status !== 'done') break;
      undone.push(result);
    }
    return undone;
  },
  forget: (ids) => set((s) => ({ entries: s.entries.filter((e) => !ids.includes(e.id)) })),
  clear: () => set({ entries: [], offered: null }),
}));
