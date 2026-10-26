import type { AgentTool, ConfirmOptions } from '@/types';

// 채팅 대화에 쌓이는 항목. 사용자·Nano 말풍선 외에 도구 실행 단계와 실행 전 확인 카드도 같은 목록에 끼워 보여 준다.
export type AgentChatMessage =
  // cancelled — 사용자가 멈춘 요청. 대화 기록(모델에게 넘기는 것)에서는 빠진다
  | { id: string; role: 'user'; text: string; cancelled?: boolean }
  // actions — 답변 뒤에 권하는 다음 할 일 버튼(예: 새소식 목록을 답한 뒤 "가장 최근 소식 열기")
  | { id: string; role: 'assistant'; text: string; streaming: boolean; actions?: ReadonlyArray<AgentQuickAction> }
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
  // Nano가 요청을 처리하며 거친 단계(생각 과정) — 처리 중에는 펼쳐 두고, 끝나면 접는다
  | { id: string; role: 'thinking'; steps: ReadonlyArray<AgentThinkingStep>; done: boolean }
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
      // 쓰기 도구가 실제로 바꾼 줄(변경 카드와 같은 내용). 있으면 결과 원문(그때의 폼 전체) 대신 이것만 모델에 넘긴다
      changes?: ReadonlyArray<string>;
    };

// 에이전트가 할 일 — 상황 제안·빠른 작업·홈 입력창이 같은 형태로 Nano에 넘긴다.
// prompt 는 AI(Gemini Nano)에게 묻고(부탁인지 업무 메모인지는 Nano가 가른다), tool 은 모델 없이 도구를 바로 실행하며,
// notes 는 업무 메모를 보고서 초안으로 정리한다(text 가 없으면 입력칸으로 데려가 적게 한다).
// prompt 의 fresh 는 앞 대화와 관계없는 독립 요청(AI 추천 — "이번 주 보고서 정리해줘" 등)이라 새 대화로 시작한다.
export type AgentAction =
  | { type: 'prompt'; text: string; fresh?: boolean }
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

// 대화에서 다루고 있는 대상. subject 는 의도 분류 때 모델이 이번 요청이 가리키는 것을 대화에서 풀어 쓴 이름(작업명·날짜·소식 제목 등),
// 나머지는 실행한 도구가 실제로 다룬 대상이다. latest 는 가장 최근에 다룬 종류 — "그거"가 무엇을 가리킬지 고를 때 쓴다
export type AgentFocus = {
  subject?: string;
  news?: { id: string; title: string };
  // YYYY-MM-DD — 조회·불러오기한 저장 보고서 날짜
  reportDate?: string;
  // detail — 그 작업 아래에서 다룬 세부 항목 줄(고쳤으면 새 문구)
  task?: { section?: string; project?: string; task: string; detail?: string };
  latest?: 'news' | 'report' | 'task';
};

// 답변 뒤의 다음 할 일 — actions 는 답변 아래 버튼, ask 는 답변 끝에 붙이는 한 줄 질문("자세히 보시겠어요?").
// ask 가 있으면 사용자가 "응"·"보여줘"처럼 받아들이기만 해도 첫 버튼을 실행한다(모델을 거치지 않는다)
export type AgentFollowUp = { ask?: string; actions: ReadonlyArray<AgentQuickAction> };

export type AgentChatStore = {
  // 모바일(lg 미만) 전체 화면 시트 열림
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  // 화면이 숨겨져(로그인 화면 이동 등) 닫을 때 — 사용자가 닫은 게 아니다
  hide: () => void;
  // 데스크톱(lg 이상)은 늘 오른쪽에 있다 — 펼친 패널 / 접은 레일. 이 기기에 기억한다.
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  // ⌘K·홈 입력창 등에서 "Nano를 보여 줘" — 데스크톱은 펼치고 모바일은 시트를 연다.
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
  // 그중 승인을 기다리는 확인 카드가 있는지 — 처리 중인 요청이 사용자의 답을 기다리며 멈춰 있다
  awaitingConfirm: boolean;
  setFollowUp: (count: number, id: string | null, awaitingConfirm: boolean) => void;
  // Nano를 보여 주고 기다리는 후속 동작 카드로 눈을 끈다
  showFollowUp: () => void;
  // 채팅이 요청을 처리하는 중
  isRunning: boolean;
  setRunning: (isRunning: boolean) => void;
  // 처리 중에 다른 요청(입력·칩·제안·되돌리기)을 시도했을 때 — 무시하지 않고 알린다.
  // 확인 카드가 기다리면 그 카드로, 아니면 처리 과정이 보이는 패널로 데려간다
  notifyBusy: () => void;
  // 처리 중인 요청이 작성 중인 폼을 바꿀 수 있다 — 그동안만 페이지 본문 조작을 막는다(AgentBusyGuard).
  // 조회·요약·대화·저장·이동은 폼과 관계가 없어 잠그지 않는다
  formLocked: boolean;
  setFormLocked: (formLocked: boolean) => void;
  // 온디바이스 모델 가용성(null = 확인 전). 홈 입력창·제안이 AI 필요 여부를 가른다.
  availability: LanguageModelAvailability | null;
  setAvailability: (availability: LanguageModelAvailability) => void;
  // 지금 경로 — 화면별 제안에 쓴다(AgentPathTracker 가 채운다)
  pathname: string;
  setPathname: (pathname: string) => void;
  // 이번 문서에서 마지막으로 연 새소식 id — 상세 화면을 벗어난 뒤 "아까 보던 소식"을 가리켜도 Nano가 찾게 한다
  lastNewsId: string | null;
  // 대화에서 다루고 있는 대상 — 다음 요청의 "그거·그날·그 작업"을 실제 대상으로 풀게 지금 상황에 함께 넘긴다
  focus: AgentFocus;
  // 바뀐 종류만 덮어쓴다. latest 는 넘긴 종류로 정해진다(subject 만 넘기면 그대로, latest 를 직접 넘기면 그 값)
  updateFocus: (patch: AgentFocus) => void;
  // 새 대화를 시작하면 비운다
  clearFocus: () => void;
  // 다른 곳(홈 입력창·제안 알약)이 Nano에게 넘긴 할 일 — AgentAssistant 가 받아 처리하고 비운다
  request: { id: number; action: AgentAction } | null;
  // reveal: false 면 Nano를 열지 않는다 — 제안 알약·빠른 작업 칩의 도구 실행처럼 화면에서 바로 결과가 보이는 일
  // handoff: true 면 바로 열지 않고 보낸 곳(홈 입력창)이 로딩을 보여 주다가, Nano가 첫 생각을 시작하면 Nano로 넘긴다(passHandoff)
  submit: (action: AgentAction, options?: { reveal?: boolean; handoff?: boolean }) => void;
  // 홈 입력창이 보낸 요청을 Nano가 아직 받아 시작하지 않았다 — 그동안 홈 입력창이 로딩을 보여 준다
  handoff: boolean;
  // Nano가 일을 시작했다(첫 생각·도구·답변·끝) — 기다리던 요청이 있으면 Nano를 열어 넘긴다
  passHandoff: () => void;
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
  // Nano가 방금 바꾼 항목 id(프로젝트·작업, 보고서 날짜는 AGENT_HIGHLIGHT_DATE_ID) — 잠깐 강조했다가 비운다
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

// 생각 과정의 한 단계. 같은 key 로 다시 알리면 그 단계를 고친다(진행 중 → 끝남, 생성 중인 입력 갱신)
export type AgentThinkingStep = {
  key: string;
  label: string;
  // 그 단계에서 정한 것·생성 중인 내용(한 줄)
  detail?: string;
  status: 'running' | 'done';
};
