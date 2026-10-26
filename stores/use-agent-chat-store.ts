import { create } from 'zustand';
import type { AgentChatStore } from '@/types';

// 상단바 버튼·(app) 레이아웃의 채팅 패널·본문 조작 차단(AgentBusyGuard)이 열림·처리 상태를 나눠 쓴다
export const useAgentChatStore = create<AgentChatStore>()((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  isRunning: false,
  setRunning: (isRunning) => set({ isRunning }),
}));
