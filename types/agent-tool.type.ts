import type { ConfirmOptions, WebMcpJsonSchema, WebMcpToolAnnotations, WebMcpToolResult } from '@/types';

// 도구를 부른 쪽(WebMCP 에이전트 / 앱 안 채팅)이 실행에 넘기는 환경.
// 되돌리기 어려운 동작은 execute 안에서 confirm 으로 사용자 승인을 받는다 — WebMCP 는 확인 다이얼로그로, 채팅은 대화 안 카드로 묻는다.
export type AgentToolContext = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
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
  execute: (input: Record<string, unknown>, context: AgentToolContext) => Promise<WebMcpToolResult>;
};

export type AgentToolSurface = 'webmcp' | 'chat';

// read 조회 · add 추가 · replace 교체·수정 · reset 초기화 · save 저장·내보내기 · navigate 이동·열기 · setting 설정 변경
export type AgentToolKind = 'read' | 'add' | 'replace' | 'reset' | 'save' | 'navigate' | 'setting';
