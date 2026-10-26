import type { AgentTool, ConfirmOptions } from '@/types';

// 채팅 대화에 쌓이는 항목. 사용자·도우미 말풍선 외에 도구 실행 단계와 실행 전 확인 카드도 같은 목록에 끼워 보여 준다.
export type AgentChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; streaming: boolean }
  | {
      id: string;
      role: 'tool';
      title: string;
      status: 'running' | 'done' | 'error';
      // 바꾼 내용(변경 카드)과 되돌리기 상태 — 바꾸지 않는 도구는 없다
      changes?: ReadonlyArray<string>;
      undo?: 'available' | 'done' | 'stale';
    }
  | {
      id: string;
      role: 'confirm';
      options: ConfirmOptions;
      status: 'pending' | 'approved' | 'rejected';
    }
  | { id: string; role: 'error'; text: string }
  | { id: string; role: 'draft'; draft: AgentNotesDraft; status: 'pending' | 'applied' | 'discarded' };

// 모델에게 다시 넘기는 대화 기록 — 화면 표시용 항목과 달리 도구 결과 원문까지 담는다
export type AgentChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | {
      role: 'tool';
      name: string;
      input: Record<string, unknown>;
      result: string;
      isError: boolean;
      untrusted: boolean;
    };

export type AgentChatStore = {
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  toggle: () => void;
  hide: () => void;
  // 채팅이 요청을 처리하는 중 — 그동안 페이지 본문 조작을 막는다(AgentBusyGuard)
  isRunning: boolean;
  setRunning: (isRunning: boolean) => void;
  // 떠 있는 패널(필요할 때 부르기) / AI 모드(데스크톱은 오른쪽 열로 붙이고 그보다 좁으면 전체 화면)
  layout: AgentChatLayout;
  setLayout: (layout: AgentChatLayout) => void;
  restore: () => void;
};

export type AgentChatLayout = 'floating' | 'docked';

export type AgentToolsStore = {
  // 지금 화면에 등록된 도구 — 전역 도구와 보이는 화면의 도구가 함께 들어 있다
  tools: ReadonlyArray<AgentTool>;
  // 등록하고 해제 함수를 돌려준다. 같은 이름이 있으면 나중 등록이 이긴다.
  register: (tools: ReadonlyArray<AgentTool>) => () => void;
};

export type AgentHighlightStore = {
  // AI 도우미가 방금 바꾼 항목 id(프로젝트·작업, 보고서 날짜는 AGENT_HIGHLIGHT_DATE_ID) — 잠깐 강조했다가 비운다
  ids: ReadonlySet<string>;
  // 강조할 id 를 올린다(이전 강조는 바뀐다)
  flash: (ids: ReadonlyArray<string>) => void;
};

// "메모로 보고서 쓰기" 결과 — 폼에 넣기 전 채팅에 초안으로 보여 준다
export type AgentNotesProject = { name: string; tasks: ReadonlyArray<{ content: string; progress: number }> };
export type AgentNotesDraft = {
  today: ReadonlyArray<AgentNotesProject>;
  tomorrow: ReadonlyArray<AgentNotesProject>;
};

// 먼저 권하는 일 — send 는 그 문장을 보내고, notes 는 메모로 보고서 쓰기를 연다
export type AgentRecommendation = { action: 'send' | 'notes'; text: string; reason: string };
