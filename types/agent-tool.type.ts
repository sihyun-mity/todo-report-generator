import type {
  AgentFocus,
  AgentFollowUp,
  ConfirmOptions,
  WebMcpJsonSchema,
  WebMcpToolAnnotations,
  WebMcpToolResult,
} from '@/types';

// 도구를 부른 쪽(WebMCP 에이전트 / 앱 안 채팅)이 실행에 넘기는 환경.
// 되돌리기 어려운 동작은 execute 안에서 confirm 으로 사용자 승인을 받는다 — WebMCP 는 확인 다이얼로그로, 채팅은 대화 안 카드로 묻는다.
export type AgentToolContext = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  // 바꾼 내용을 알린다 — 채팅은 변경 카드(바뀐 줄 + 되돌리기)로 보여 준다. WebMCP 는 받지 않는다.
  reportChange?: (change: AgentChange) => void;
  // 채팅에서 부를 때 사용자의 이번 요청 문장 — 모델이 요청에 없는 값을 지어냈는지 도구가 확인할 수 있게. WebMCP 는 넘기지 않는다.
  request?: string;
};

// 도구가 바꾼 내용. undo 는 바꾼 뒤 그대로일 때만 되돌리고 true 를 돌려준다(그사이 사용자가 고쳤으면 false — 덮어쓰지 않는다).
export type AgentChange = {
  lines: ReadonlyArray<string>;
  undo?: () => boolean;
  // 지금 되돌릴 수 있는지(undo 를 부르지 않고) — 뒤에 다른 변경이 있으면 false 다. 없으면 늘 되돌릴 수 있는 것으로 본다
  canUndo?: () => boolean;
};

// WebMCP 등록과 앱 안 채팅이 함께 쓰는 도구 정의. 한 곳에서 정의해 두 경로에 그대로 넘긴다.
export type AgentTool = {
  name: string;
  // 채팅에서 실행 단계를 보여 줄 때 쓰는 한국어 이름 (WebMCP 에는 넘기지 않는다)
  title: string;
  // 동작 종류 — 채팅은 사용자 요청의 의도를 먼저 고른 뒤 그 종류의 도구만 후보로 남긴다(작은 모델이 비슷한 도구를 헷갈려서)
  kind: AgentToolKind;
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: WebMcpToolAnnotations;
  // 노출할 경로. 생략하면 둘 다 — 작은 로컬 모델이 다루기 어려운 도구는 WebMCP 에만 둔다
  surfaces?: ReadonlyArray<AgentToolSurface>;
  // 채팅이 다음 행동을 고르고 입력을 만들 때 함께 보여 줄 지금 상태(예: 작성 중인 폼) — "오늘 한 업무를 내일에도"처럼
  // 화면의 내용을 가리키는 요청을 모델이 지어내지 않고 실제 값으로 채우게 한다
  inputContext?: (scope: AgentRequestScope) => unknown;
  // inputContext 로 넘기는 지금 상태를 읽기만 하는 조회 도구(예: get_current_report) — 채팅이 상태를 이미 넘길 때는 후보에서 뺀다
  stateReader?: boolean;
  // 요청 문장에 이 말이 있을 때만 채팅 후보로 둔다 — 작은 모델은 요청에 없는 대상(세부 항목·미완료 전체)을 다루는 비슷한 도구를 골랐다
  requires?: (request: string, scope: AgentRequestScope) => boolean;
  // 요청이 가리키는 대상이 없어 이 도구가 할 수 없는 경우 — 채팅은 비슷한 도구로 조용히 대신하지 않고 못 한 이유와 대안을 되묻는다
  // (보고 있던 새소식을 요약해 달라고 한 뒤 화면을 벗어나자 목록 전체를 요약했다)
  unavailable?: (request: string, scope: AgentRequestScope) => AgentToolUnavailable | null;
  // 요청이 분명히 이 도구를 가리키면 다른 후보를 빼고 이 도구만 남긴다(가리키는 도구가 여럿이면 그것들만) —
  // "자세히 보여줘"(방금 다룬 소식 열기)에 작성 중인 보고서 조회를 골랐다
  preferredWhen?: (request: string, scope: AgentRequestScope) => boolean;
  // 의도 분류가 이 종류로 갈라져도 후보로 둔다(예: "이 작업 내일로 옮겨줘"가 추가로 분류됐다)
  extraKinds?: ReadonlyArray<AgentToolKind>;
  // 채팅 답변에 쓸 한 문장 — 변경 줄을 하나씩 옮기는 것보다 나을 때(프로젝트 이름 바꾸기·옮기기, 초기화). 성공했을 때만 부른다
  summarize?: (input: Record<string, unknown>, changes: ReadonlyArray<string>) => string;
  // 채팅에서 이 도구로 답한 뒤 권할 다음 할 일(버튼·한 줄 질문) — 조회만 하고 끝나 "그거 보여줘"를 다시 말해야 했다.
  // 성공한 결과로만 부른다. 버튼이 가리키는 도구가 지금 등록돼 있지 않으면 채팅이 뺀다
  // 이 도구가 다룬 대상(대화의 "그거"가 가리킬 것) — 없으면 입력의 task·project·section·date 와 변경 줄로 정한다(focusAfterTool)
  focus?: (input: Record<string, unknown>, result: WebMcpToolResult) => AgentFocus | null;
  followUp?: (
    input: Record<string, unknown>,
    result: WebMcpToolResult,
    scope: AgentRequestScope
  ) => AgentFollowUp | null;
  execute: (input: Record<string, unknown>, context: AgentToolContext) => Promise<WebMcpToolResult>;
};

export type AgentToolSurface = 'webmcp' | 'chat';

// 채팅 요청 하나의 범위. 요청을 보낸 순간의 화면을 기준으로 한다 — 응답을 기다리는 사이 다른 화면으로 옮겨 가도
// "지금 보고 있는 소식"은 요청할 때 보던 소식이다.
export type AgentRequestScope = { path: string };

// 도구가 할 수 없는 이유(reason)와 대신 해 줄 수 있는 일을 묻는 문장(offer). 둘 다 사용자에게 보이는 한국어.
export type AgentToolUnavailable = { reason: string; offer: string };

// read 조회 · add 추가 · edit 항목 하나 고치기(진행률·이름·삭제·옮기기·날짜) · replace 구역·폼 통째로 바꾸기 · reset 초기화 ·
// save 저장·복사·내보내기 · navigate 이동·열기 · setting 설정 변경
export type AgentToolKind = 'read' | 'add' | 'edit' | 'replace' | 'reset' | 'save' | 'navigate' | 'setting';
