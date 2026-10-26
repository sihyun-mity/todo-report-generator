// 보고서 작성 화면 제목 — 날짜 선택·텍스트 복원은 Nano 입력창 아래 ReportToolbar 로 옮겼다
// (Nano는 날짜·복원과 관계없이 더 넓은 일을 하므로 제목 바로 아래 첫 진입점으로 둔다)
// (계정 관련 요소는 상단 AppTopBar로 분리됨)
export const ReportHeader = () => (
  <header className="mb-6">
    <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
      일일 업무 보고 생성기
    </h1>
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      프로젝트별 진행률을 적으면 보고서 양식이 자동으로 만들어집니다.
    </p>
  </header>
);
