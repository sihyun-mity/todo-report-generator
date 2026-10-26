import { create } from 'zustand';
import type { AgentToolsStore } from '@/types';

// WebMCP 와 앱 안 채팅이 함께 보는 도구 레지스트리. 화면이 숨겨지면(Activity) 그 화면이 등록한 도구도 빠진다.
export const useAgentToolsStore = create<AgentToolsStore>()((set) => ({
  tools: [],
  register: (tools) => {
    const names = new Set(tools.map((t) => t.name));
    set((s) => ({ tools: [...s.tools.filter((t) => !names.has(t.name)), ...tools] }));
    return () => set((s) => ({ tools: s.tools.filter((t) => !tools.includes(t)) }));
  },
}));
