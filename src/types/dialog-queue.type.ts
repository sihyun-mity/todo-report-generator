// 자동으로 열리는(사용자 액션 없이 페이지 진입 시 뜨는) 다이얼로그들을
// 한 번에 하나씩 순차 노출하기 위한 큐.
export type DialogQueueEntry = {
  id: string;
  /** 높을수록 먼저 열린다. 동률이면 먼저 request 한 쪽이 우선. */
  priority: number;
};

export type DialogQueueStore = {
  queue: ReadonlyArray<DialogQueueEntry>;
  /** 노출 의사 등록 (이미 있으면 무시). */
  request: (id: string, priority: number) => void;
  /** 닫힘/취소 시 큐에서 제거 → 다음 우선순위 다이얼로그가 활성화된다. */
  release: (id: string) => void;
};
