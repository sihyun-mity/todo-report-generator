import { create } from 'zustand';
import type { AgentChatLayout, AgentChatStore } from '@/types';
import { AGENT_CHAT_LAYOUT_STORAGE_KEY } from '@/constants';

// AI 모드(도킹)로 열어 둔 상태는 이 기기에 기억해 다음 방문에도 그대로 연다 — AI 위주로 쓰는 사용자를 위해.
// 떠 있는 패널은 필요할 때 부르는 용도라 열림 상태를 기억하지 않는다. 저장소를 못 쓰면 기억하지 못할 뿐이다.
const save = (layout: AgentChatLayout, isOpen: boolean) => {
  try {
    localStorage.setItem(
      AGENT_CHAT_LAYOUT_STORAGE_KEY,
      JSON.stringify({ layout, open: layout === 'docked' && isOpen })
    );
  } catch {
    // 기억하지 못할 뿐이다
  }
};

// 상단바 버튼·(app) 레이아웃의 채팅 패널·본문 조작 차단(AgentBusyGuard)·레이아웃(AgentLayoutShell)이 상태를 나눠 쓴다
export const useAgentChatStore = create<AgentChatStore>()((set, get) => ({
  isOpen: false,
  setOpen: (isOpen) => {
    set({ isOpen });
    save(get().layout, isOpen);
  },
  toggle: () => get().setOpen(!get().isOpen),
  // 화면이 숨겨져(로그인 화면 이동 등) 닫을 때 — 사용자가 닫은 게 아니므로 기억한 열림 상태는 바꾸지 않는다
  hide: () => set({ isOpen: false }),
  isRunning: false,
  setRunning: (isRunning) => set({ isRunning }),
  layout: 'floating',
  setLayout: (layout) => {
    set({ layout });
    save(layout, get().isOpen);
  },
  // 마운트 후 한 번 — SSR 과 첫 렌더는 기본값(떠 있는 패널·닫힘)으로 맞추고 저장된 값은 그 뒤에 적용한다
  restore: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(AGENT_CHAT_LAYOUT_STORAGE_KEY) ?? 'null') as {
        layout?: unknown;
        open?: unknown;
      } | null;
      if (saved?.layout !== 'docked') return;
      set({ layout: 'docked', isOpen: saved.open === true });
    } catch {
      // 기본값으로 둔다
    }
  },
}));
