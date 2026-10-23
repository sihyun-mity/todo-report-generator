// Conventional Commits(`type(scope)!: subject`) 형식 커밋 제목을 다루는 헬퍼.
// 형식이 아닌 메시지는 그대로 통과시킨다.
const CONVENTIONAL_PREFIX = /^(\w+)(?:\(([^)]+)\))?!?:\s*/;

export const commitType = (message: string): string | null => message.match(CONVENTIONAL_PREFIX)?.[1] ?? null;

export const commitScope = (message: string): string | null => message.match(CONVENTIONAL_PREFIX)?.[2] ?? null;

// 세부 항목에 들어갈 문구 — 접두어를 떼고 남은 제목. 접두어만 있는 메시지면 원문을 쓴다.
export const stripCommitPrefix = (message: string): string =>
  message.replace(CONVENTIONAL_PREFIX, '').trim() || message;

// 하루 안에 끝나는 성격의 커밋(버그 수정·잡무). 새 작업 진행률 기본값을 고를 때 쓴다.
const DISCRETE_TYPES = new Set(['fix', 'hotfix', 'revert', 'chore', 'docs', 'test', 'style', 'ci', 'build']);
export const isDiscreteCommit = (message: string): boolean => {
  const type = commitType(message);
  return type !== null && DISCRETE_TYPES.has(type.toLowerCase());
};
