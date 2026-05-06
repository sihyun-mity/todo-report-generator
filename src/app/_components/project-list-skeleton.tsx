'use client';

import { CalendarDays, Sun } from 'lucide-react';
import { cn } from '@/utils';

type Accent = 'today' | 'tomorrow';

type Props = {
  title: string;
  accent: Accent;
  showImportButton?: boolean;
};

const ACCENT_STYLES: Record<Accent, { stripe: string; iconWrap: string }> = {
  today: {
    stripe: 'bg-blue-500 dark:bg-blue-400',
    iconWrap: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  },
  tomorrow: {
    stripe: 'bg-emerald-500 dark:bg-emerald-400',
    iconWrap: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
};

// 실제 input/button과 동일한 padding/border/text-size 클래스를 그대로 쓰고 `&nbsp;`로 한 줄을 점유시켜
// line-height 기반 높이를 픽셀 단위까지 일치시킨다. 픽셀 하드코딩(h-[34px] 등)을 피해야
// font/line-height 계산 차이로 인한 0.x px 미스매치가 생기지 않는다.
function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-700/50">
      {/* 프로젝트 헤더 행 — 실제 grip(p-1.5 + 18px), 프로젝트명 input(border + px-3 py-2 text-base), delete(p-2 + 18px) 와 동일 */}
      <div className="mb-4 flex items-center gap-1 sm:gap-2">
        <div className="shrink-0 rounded-md bg-zinc-200 p-1.5 dark:bg-zinc-700">
          <span className="block h-[18px] w-[18px]" />
        </div>
        <div className="flex-1 rounded-md border border-zinc-200 bg-zinc-200 px-3 py-2 text-base dark:border-zinc-700/50 dark:bg-zinc-700">
          &nbsp;
        </div>
        <div className="shrink-0 rounded-md bg-zinc-200 p-2 dark:bg-zinc-700">
          <span className="block h-[18px] w-[18px]" />
        </div>
      </div>
      {/* 작업 행 — 실제 grip(p-1 + 14px), 내용 input(border + px-2 py-1.5 text-sm), 진행률 input(w-14 sm:w-20 + py-1.5 text-sm), delete(p-1.5 + 16px) 와 동일 */}
      <div className="ml-2 space-y-3 sm:ml-4">
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="shrink-0 rounded-md bg-zinc-200 p-1 dark:bg-zinc-700">
            <span className="block h-[14px] w-[14px]" />
          </div>
          <div className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-200 px-2 py-1.5 text-sm sm:px-3 dark:border-zinc-700/50 dark:bg-zinc-700">
            &nbsp;
          </div>
          <div className="relative shrink-0">
            <div className="w-14 rounded-md border border-zinc-200 bg-zinc-200 py-1.5 pr-5 pl-1 text-right text-sm sm:w-20 sm:pr-6 sm:pl-2 dark:border-zinc-700/50 dark:bg-zinc-700">
              &nbsp;
            </div>
          </div>
          <div className="shrink-0 rounded-md bg-zinc-200 p-1.5 dark:bg-zinc-700">
            <span className="block h-[16px] w-[16px]" />
          </div>
        </div>
        {/* 작업 추가 버튼 — 실제 ml-2 sm:ml-4 + flex gap-1 + text-sm + 14px 아이콘 동일 */}
        <div className="ml-2 flex items-center gap-1 text-sm sm:ml-4">
          <span className="block h-[14px] w-[14px] rounded bg-zinc-200 dark:bg-zinc-700" />
          <span className="inline-block w-14 rounded bg-zinc-200 dark:bg-zinc-700">&nbsp;</span>
        </div>
      </div>
    </div>
  );
}

// 실제 ProjectList의 외곽/헤더/카드 구조를 그대로 따라 hydration 완료 후 레이아웃 점프가 없도록 한다.
export const ProjectListSkeleton = ({ title, accent, showImportButton = false }: Readonly<Props>) => {
  const accentStyles = ACCENT_STYLES[accent];
  const Icon = accent === 'today' ? Sun : CalendarDays;
  return (
    <div className="mb-8 w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-5 w-1 rounded-full', accentStyles.stripe)} aria-hidden />
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', accentStyles.iconWrap)}>
            <Icon size={14} />
          </span>
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">{title}</h2>
        </div>
        {/* 헤더 액션 버튼 — 실제 px-3 py-1 text-sm 클래스 그대로 + nbsp 로 line-height 일치 */}
        <div className="flex animate-pulse gap-2">
          {showImportButton && (
            <div className="rounded-md bg-zinc-200 px-3 py-1 text-sm dark:bg-zinc-700">
              <span className="inline-block w-[124px]">&nbsp;</span>
            </div>
          )}
          <div className="rounded-md bg-zinc-200 px-3 py-1 text-sm dark:bg-zinc-700">
            <span className="inline-block w-[82px]">&nbsp;</span>
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <ProjectCardSkeleton />
      </div>
    </div>
  );
};
