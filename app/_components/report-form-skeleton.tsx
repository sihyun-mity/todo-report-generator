import { History } from 'lucide-react';
import { HistoryCardSkeleton, ProjectListSkeleton, ReportPreviewSkeleton } from '.';

// ReportForm 이 요청 시점(오늘 날짜)에 스트리밍되는 동안 정적 셸에 노출되는 placeholder.
// ReportForm 의 컨테이너/열 구성과 각 영역의 실제 스켈레톤을 그대로 써서 스트리밍 전후 레이아웃 점프를 막는다.
export function ReportFormSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-28 sm:p-6 sm:pb-28 lg:p-12 lg:pb-28">
      {/* ReportHeader — 고정 문구라 그대로 */}
      <header className="mb-6">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          일일 업무 보고 생성기
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          프로젝트별 진행률을 적으면 보고서 양식이 자동으로 만들어집니다.
        </p>
      </header>

      {/* AgentComposer 의 빠른 작업 칩 줄 — 칩 구성은 상태마다 달라 흔한 6개(GitHub·미완료→내일·저장·기록 내보내기·새소식·화면 모드)
          너비로 자리를 잡아, 좁은 화면에서도 같은 줄 수로 꺾이게 한다. AI 입력 상자는 마운트 뒤 가용성 확인으로 정해져 여기서 알 수 없다 */}
      <div className="mb-8 flex flex-wrap gap-2">
        {[147, 114, 66, 110, 76, 100].map((width) => (
          <div
            key={width}
            className="h-[30px] animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700"
            style={{ width }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-x-8 @min-[60rem]:flex-row">
        <div className="flex-1 overflow-hidden">
          {/* ReportToolbar — 날짜 선택·복원 버튼(h-9) placeholder */}
          <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="h-9 w-[104px] animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-9 w-[110px] animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <ProjectListSkeleton title="금일 업무 진행 현황" accent="today" />
          <ProjectListSkeleton title="익일 업무 진행 예정" accent="tomorrow" showImportButton />
        </div>

        <div className="w-full @min-[60rem]:sticky @min-[60rem]:top-12 @min-[60rem]:h-fit @min-[60rem]:w-80">
          <ReportPreviewSkeleton />

          {/* ReportHistory — 외곽·제목 행·캘린더(5주)·카드 3장 */}
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex items-center gap-2">
              <History size={18} className="text-zinc-500" />
              <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase">이전 기록</h2>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-[#25262b]/20">
              <div className="mb-2 flex h-[22px] items-center justify-center">
                <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="grid grid-cols-7 gap-1 pt-[23px]">
                {Array.from({ length: 35 }).map((_, idx) => (
                  <div key={idx} className="aspect-square animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800/60" />
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <HistoryCardSkeleton key={idx} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
