import { create } from 'zustand';
import type { AgentChatStore } from '@/types';
import { AGENT_PANEL_STORAGE_KEY } from '@/constants';

// 데스크톱 패널을 펼쳐 둘지(접으면 레일)는 이 기기에 기억한다. 저장소를 못 쓰면 기억하지 못할 뿐이다.
const saveExpanded = (expanded: boolean) => {
  try {
    localStorage.setItem(AGENT_PANEL_STORAGE_KEY, JSON.stringify({ expanded }));
  } catch {
    // 기억하지 못할 뿐이다
  }
};

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches;

// 상단바 버튼·AI 도우미·홈 입력창·상황 제안·본문 잠금(AgentBusyGuard)·레이아웃(AgentLayoutShell)이 상태를 나눠 쓴다
export const useAgentChatStore = create<AgentChatStore>()((set, get) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  hide: () => set({ isOpen: false }),
  // SSR·첫 렌더는 접은 레일 — 마운트 뒤 restore() 가 저장값(없으면 넓은 화면인지)으로 정한다
  expanded: false,
  setExpanded: (expanded) => {
    set({ expanded });
    saveExpanded(expanded);
  },
  reveal: () => {
    if (isDesktop()) get().setExpanded(true);
    else set({ isOpen: true });
    set((s) => ({ focusSignal: s.focusSignal + 1 }));
  },
  focusSignal: 0,
  isRunning: false,
  setRunning: (isRunning) => set({ isRunning }),
  availability: null,
  setAvailability: (availability) => set({ availability }),
  pathname: '/',
  setPathname: (pathname) => set({ pathname }),
  request: null,
  submit: (action, { reveal = true } = {}) => {
    set((s) => ({ request: { id: (s.request?.id ?? 0) + 1, action } }));
    if (reveal) get().reveal();
  },
  dismissed: new Set(),
  dismiss: (id) => set((s) => ({ dismissed: new Set([...s.dismissed, id]) })),
  // 마운트 후 한 번 — SSR 과 첫 렌더는 기본값(펼침)으로 맞추고 저장된 값은 그 뒤에 적용한다
  restore: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(AGENT_PANEL_STORAGE_KEY) ?? 'null') as {
        expanded?: unknown;
      } | null;
      if (typeof saved?.expanded === 'boolean') set({ expanded: saved.expanded });
    } catch {
      // 기본값으로 둔다
    }
  },
}));
