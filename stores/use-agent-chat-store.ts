import toast from 'react-hot-toast';
import { create } from 'zustand';
import type { AgentChatStore } from '@/types';
import { AGENT_BUSY_TOAST_ID, AGENT_PANEL_STORAGE_KEY } from '@/constants';
import { newsIdFromPath } from '@/utils';

// 데스크톱 패널을 펼쳐 둘지(접으면 레일)는 이 기기에 기억한다. 저장소를 못 쓰면 기억하지 못할 뿐이다.
const saveExpanded = (expanded: boolean) => {
  try {
    localStorage.setItem(AGENT_PANEL_STORAGE_KEY, JSON.stringify({ expanded }));
  } catch {
    // 기억하지 못할 뿐이다
  }
};

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches;

// 상단바 버튼·Nano·홈 입력창·상황 제안·본문 잠금(AgentBusyGuard)·레이아웃(AgentLayoutShell)이 상태를 나눠 쓴다
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
  reveal: ({ attention = 'input' } = {}) => {
    if (isDesktop()) get().setExpanded(true);
    else set({ isOpen: true });
    if (attention === 'input') set((s) => ({ focusSignal: s.focusSignal + 1 }));
    if (attention !== 'none') get().attend(attention);
  },
  focusSignal: 0,
  attention: null,
  attend: (target, messageId) =>
    set((s) => ({ attention: { nonce: (s.attention?.nonce ?? 0) + 1, target, messageId } })),
  followUpCount: 0,
  followUpId: null,
  awaitingConfirm: false,
  setFollowUp: (followUpCount, followUpId, awaitingConfirm) => set({ followUpCount, followUpId, awaitingConfirm }),
  showFollowUp: () => {
    const { followUpId } = get();
    get().reveal({ attention: 'none' });
    if (followUpId) get().attend('message', followUpId);
  },
  isRunning: false,
  setRunning: (isRunning) => set({ isRunning }),
  notifyBusy: () => {
    // 연달아 눌러도 토스트는 하나만 — 같은 id 로 덮어쓴다
    if (get().awaitingConfirm) {
      toast('Nano가 확인을 기다리고 있어요. 카드에서 먼저 골라 주세요.', { id: AGENT_BUSY_TOAST_ID });
      get().showFollowUp();
      return;
    }
    toast('Nano가 앞 요청을 처리하고 있어요. 끝난 뒤 다시 요청하거나 멈추기를 눌러 주세요.', {
      id: AGENT_BUSY_TOAST_ID,
    });
    get().reveal({ attention: 'panel' });
  },
  formLocked: false,
  setFormLocked: (formLocked) => set({ formLocked }),
  availability: null,
  setAvailability: (availability) => set({ availability }),
  pathname: '/',
  setPathname: (pathname) => set((s) => ({ pathname, lastNewsId: newsIdFromPath(pathname) ?? s.lastNewsId })),
  lastNewsId: null,
  request: null,
  submit: (action, { reveal = true } = {}) => {
    set((s) => ({ request: { id: (s.request?.id ?? 0) + 1, action } }));
    // 작업을 시작하는 할 일이라 입력칸이 아니라 패널(처리 과정)로 눈을 끈다
    if (reveal) get().reveal({ attention: 'panel' });
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
