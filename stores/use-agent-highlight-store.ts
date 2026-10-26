import { create } from 'zustand';
import type { AgentHighlightStore } from '@/types';
import { AGENT_HIGHLIGHT_MS } from '@/constants';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

// Nano가 바꾼 폼 항목을 잠깐 강조한다 — 폼 컴포넌트가 자기 id 가 들어 있으면 agent-flash 애니메이션을 단다
export const useAgentHighlightStore = create<AgentHighlightStore>()((set) => ({
  ids: new Set(),
  flash: (ids) => {
    if (ids.length === 0) return;
    set({ ids: new Set(ids) });
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => set({ ids: new Set() }), AGENT_HIGHLIGHT_MS);
  },
}));
