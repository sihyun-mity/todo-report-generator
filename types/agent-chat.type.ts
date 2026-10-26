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

// 에이전트가 할 일 — 상황 제안·빠른 작업·홈 입력창이 같은 형태로 AI 도우미에 넘긴다.
// prompt 는 AI(Gemini Nano)에게 묻고(부탁인지 업무 메모인지는 도우미가 가른다), tool 은 모델 없이 도구를 바로 실행하며,
// notes 는 업무 메모를 보고서 초안으로 정리한다(text 가 없으면 입력칸으로 데려가 적게 한다).
export type AgentAction =
  | { type: 'prompt'; text: string }
  | { type: 'tool'; tool: string; title: string; input?: Record<string, unknown> }
  | { type: 'notes'; text?: string };

// 상황 제안(One UI 식) — 지금 상태·화면을 보고 고른 다음 할 일. needsAi 면 모델을 쓸 수 있을 때만 보여 준다.
export type AgentSuggestion = {
  id: string;
  title: string;
  reason: string;
  action: AgentAction;
  needsAi: boolean;
  // 가장 많이 쓰는 기능(GitHub 가져오기) — 무지개 빛으로 강조한다
  emphasis?: boolean;
};

// 빠른 작업 — 지금 화면에서 바로 할 수 있는 일(대부분 모델 없이 도구를 바로 실행)
export type AgentQuickAction = {
  id: string;
  label: string;
  action: AgentAction;
  needsAi: boolean;
  emphasis?: boolean;
};

export type AgentChatStore = {
  // 모바일(lg 미만) 전체 화면 시트 열림
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  // 화면이 숨겨져(로그인 화면 이동 등) 닫을 때 — 사용자가 닫은 게 아니다
  hide: () => void;
  // 데스크톱(lg 이상)은 늘 오른쪽에 있다 — 펼친 패널 / 접은 레일. 이 기기에 기억한다.
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  // ⌘K·홈 입력창 등에서 "도우미를 보여 줘" — 데스크톱은 펼치고 모바일은 시트를 연다.
  // attention 으로 사용자가 어디를 봐야 하는지 강조한다: input(입력칸 포커스 + 링, 기본) · panel(작업 시작 — 패널만) · none
  reveal: (options?: { attention?: 'input' | 'panel' | 'none' }) => void;
  focusSignal: number;
  // 사용자의 눈을 끌 곳 — 패널 테두리는 늘 빛나고, input 이면 입력 상자, message 면 그 카드(후속 동작이 필요한 확인·초안)에 링을 띄운다.
  // nonce 가 바뀔 때마다 효과가 처음부터 다시 돈다.
  attention: AgentAttention | null;
  attend: (target: AgentAttention['target'], messageId?: string) => void;
  // 아직 처리하지 않은 후속 동작(승인 대기 확인 카드·폼에 넣지 않은 초안) 수 — 패널을 접어 두었을 때 상단바에 알린다
  followUpCount: number;
  // 가장 최근 후속 동작 카드 id — 처리 중 안내·상단바에서 "보기"로 그 카드로 데려간다
  followUpId: string | null;
  setFollowUp: (count: number, id: string | null) => void;
  // 도우미를 보여 주고 기다리는 후속 동작 카드로 눈을 끈다
  showFollowUp: () => void;
  // 채팅이 요청을 처리하는 중 — 그동안 페이지 본문 조작을 막는다(AgentBusyGuard)
  isRunning: boolean;
  setRunning: (isRunning: boolean) => void;
  // 온디바이스 모델 가용성(null = 확인 전). 홈 입력창·제안이 AI 필요 여부를 가른다.
  availability: LanguageModelAvailability | null;
  setAvailability: (availability: LanguageModelAvailability) => void;
  // 지금 경로 — 화면별 제안에 쓴다(AgentPathTracker 가 채운다)
  pathname: string;
  setPathname: (pathname: string) => void;
  // 다른 곳(홈 입력창·제안 알약)이 도우미에게 넘긴 할 일 — AgentAssistant 가 받아 처리하고 비운다
  request: { id: number; action: AgentAction } | null;
  // reveal: false 면 도우미를 열지 않는다 — 제안 알약·빠른 작업 칩의 도구 실행처럼 화면에서 바로 결과가 보이는 일
  submit: (action: AgentAction, options?: { reveal?: boolean }) => void;
  // 이번 세션에서 닫은(또는 실행한) 제안 — 같은 제안을 다시 띄우지 않는다
  dismissed: ReadonlySet<string>;
  dismiss: (id: string) => void;
  restore: () => void;
};

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

export type AgentAttention = { nonce: number; target: 'panel' | 'input' | 'message'; messageId?: string };
