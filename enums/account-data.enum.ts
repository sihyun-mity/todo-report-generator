// 회원이 설정 > 저장된 데이터 관리에서 골라 지울 수 있는 서버(Supabase) 저장 데이터 종류.
// 계정 자체와 로그인 수단(패스키·로그인 기기), 작성 알림 구독, 새소식 읽음 기록은 여기 넣지 않는다.
export const ACCOUNT_DATA_KIND = {
  /** 보고서 기록 — `public.reports` */
  REPORTS: 'reports',
  /** GitHub 커밋 가져오기 메모리 — `public.commit_import_memories` */
  COMMIT_IMPORT_MEMORY: 'commit_import_memory',
} as const;

export const ACCOUNT_DATA_KIND_VALUES = [ACCOUNT_DATA_KIND.REPORTS, ACCOUNT_DATA_KIND.COMMIT_IMPORT_MEMORY] as const;
