import { COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY } from '@/constants';

// 커밋 가져오기 전용 — AI 를 쓸 수 없을 때 분류 전에 한 번 보여 주는 안내의 상태. 모델 호출 자체는 `@/lib/prompt-api` 에 있다.

// AI 를 쓸 수 없는 상태 — 분류 전에 한 번 안내한다. 내려받는 중('downloading')도 아직 쓸 수 없어 설치 안내로 묶는다.
export type PromptAiNoticeKind = 'downloadable' | 'unavailable';

export const promptAiNoticeKind = (availability: LanguageModelAvailability): PromptAiNoticeKind | null =>
  availability === 'available' ? null : availability === 'unavailable' ? 'unavailable' : 'downloadable';

// 같은 상태의 안내는 이 기기에서 한 번만 보여 준다. 상태가 바뀌면(예: 지원 브라우저에서 모델만 없음) 다시 안내한다.
// 저장소를 쓸 수 없으면 매번 안내하는 쪽으로 둔다.
export const hasSeenPromptAiNotice = (kind: PromptAiNoticeKind) => {
  try {
    return localStorage.getItem(COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY) === kind;
  } catch {
    return false;
  }
};

export const markPromptAiNoticeSeen = (kind: PromptAiNoticeKind) => {
  try {
    localStorage.setItem(COMMIT_IMPORT_AI_NOTICE_STORAGE_KEY, kind);
  } catch {
    // 기억하지 못하면 다음에 다시 안내할 뿐이다
  }
};
