// Conventional Commits(`type(scope)!: subject`) 형식 커밋 제목을 다루는 헬퍼.
// 형식이 아닌 메시지는 그대로 통과시킨다.
const CONVENTIONAL_PREFIX = /^(\w+)(?:\(([^)]+)\))?!?:\s*/;

export const commitScope = (message: string): string | null => message.match(CONVENTIONAL_PREFIX)?.[2] ?? null;

// 세부 항목에 들어갈 문구 — 접두어를 떼고 남은 제목. 접두어만 있는 메시지면 원문을 쓴다.
export const stripCommitPrefix = (message: string): string =>
  message.replace(CONVENTIONAL_PREFIX, '').trim() || message;
