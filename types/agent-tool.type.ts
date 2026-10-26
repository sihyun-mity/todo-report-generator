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
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: WebMcpToolAnnotations;
  execute: (input: Record<string, unknown>, context: AgentToolContext) => Promise<WebMcpToolResult>;
};

// 등록 범위 — 전역((app) 레이아웃) 도구와 화면별 도구를 구분해 채팅에서 지금 쓸 수 있는 도구를 모은다
export type AgentToolScope = 'global' | 'report-form';
