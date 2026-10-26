import { create } from 'zustand';
import type { AgentChatStore } from '@/types';

// 상단바 버튼과 (app) 레이아웃의 채팅 패널이 열림 상태를 나눠 쓴다
export const useAgentChatStore = create<AgentChatStore>()((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
