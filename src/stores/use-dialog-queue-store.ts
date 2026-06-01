import { create } from 'zustand';
import type { DialogQueueEntry, DialogQueueStore } from '@/types';

// 자동 노출 다이얼로그(새소식, 작성 알림 구독 권유 등)를 한 번에 하나씩 순차 노출.
// 각 다이얼로그는 노출 조건이 충족되면 request(id, priority) 로 큐에 등록하고,
// 자신이 활성(activeId)일 때만 실제로 열린다. 닫히면 release(id) 로 빠지고
// 다음 우선순위 다이얼로그가 활성화된다.
export const useDialogQueueStore = create<DialogQueueStore>()((set) => ({
  queue: [],
  request: (id, priority) =>
    set((s) => (s.queue.some((e) => e.id === id) ? s : { queue: [...s.queue, { id, priority }] })),
  release: (id) => set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),
}));

// 현재 열려야 하는 다이얼로그 id (가장 높은 priority, 동률이면 먼저 등록된 쪽). 없으면 null.
const selectActiveDialogId = (queue: ReadonlyArray<DialogQueueEntry>): string | null => {
  if (queue.length === 0) return null;
  return queue.reduce((best, e) => (e.priority > best.priority ? e : best)).id;
};

// 주어진 다이얼로그가 지금 열려야 하는지 여부. boolean 이 바뀔 때만 리렌더된다.
export function useIsActiveDialog(id: string): boolean {
  return useDialogQueueStore((s) => selectActiveDialogId(s.queue) === id);
}
