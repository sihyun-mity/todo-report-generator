// WebMCP(https://github.com/webmachinelearning/webmcp) 중 이 앱이 쓰는 부분만 옮긴 최소 타입.
// 스펙이 초안 단계라 브라우저 내장 타입이 없다 — 이름·형태가 바뀌면 여기와 `lib/webmcp` 만 고친다.

export type WebMcpJsonSchema = {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  description?: string;
  properties?: Record<string, WebMcpJsonSchema>;
  required?: ReadonlyArray<string>;
  items?: WebMcpJsonSchema;
  enum?: ReadonlyArray<string>;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  pattern?: string;
  additionalProperties?: boolean;
};

export type WebMcpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type WebMcpToolAnnotations = {
  // 상태를 바꾸지 않는 조회 도구
  readOnlyHint?: boolean;
  // 결과에 사용자가 입력한 자유 텍스트가 섞여 있어 지시문으로 취급하면 안 됨
  untrustedContentHint?: boolean;
};

export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: WebMcpToolAnnotations;
  execute: (input: Record<string, unknown>) => Promise<WebMcpToolResult>;
};

export type WebMcpRegisterOptions = {
  signal?: AbortSignal;
};

export type WebMcpModelContext = {
  // 구현에 따라 void / Promise / `{ unregister }` 를 돌려준다 (초기 프리뷰는 `unregisterTool(name)` 로 해제).
  registerTool: (tool: WebMcpTool, options?: WebMcpRegisterOptions) => unknown;
  unregisterTool?: (name: string) => void;
};
