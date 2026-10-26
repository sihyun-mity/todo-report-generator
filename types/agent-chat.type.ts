import type { AgentTool, ConfirmOptions } from '@/types';

// 채팅 대화에 쌓이는 항목. 사용자·도우미 말풍선 외에 도구 실행 단계와 실행 전 확인 카드도 같은 목록에 끼워 보여 준다.
export type AgentChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; streaming: boolean }
  | { id: string; role: 'tool'; title: string; status: 'running' | 'done' | 'error' }
  | {
      id: string;
      role: 'confirm';
      options: ConfirmOptions;
      status: 'pending' | 'approved' | 'rejected';
    }
  | { id: string; role: 'error'; text: string };

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
};

export type AgentToolsStore = {
  // 지금 화면에 등록된 도구 — 전역 도구와 보이는 화면의 도구가 함께 들어 있다
  tools: ReadonlyArray<AgentTool>;
  // 등록하고 해제 함수를 돌려준다. 같은 이름이 있으면 나중 등록이 이긴다.
  register: (tools: ReadonlyArray<AgentTool>) => () => void;
};
