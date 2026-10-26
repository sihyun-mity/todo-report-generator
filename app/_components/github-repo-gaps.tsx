'use client';

import { useId, useState } from 'react';
import { ChevronRight, ExternalLink, FolderSearch } from 'lucide-react';
import type { GithubRepoGap, GithubRepoGapReason } from '@/types';
import { GITHUB_MAX_BRANCHES_PER_REPO } from '@/constants';
import { GITHUB_REPO_GAP } from '@/enums';
import { cn } from '@/utils';

// 아예 못 본 저장소(주황 점)와 일부 브랜치만 본 저장소(회색 점)를 나눠 보인다
const GAP_LABEL: Record<GithubRepoGapReason, { text: string; skipped: boolean }> = {
  [GITHUB_REPO_GAP.SSO]: { text: '조직 SSO 승인이 필요해요', skipped: true },
  [GITHUB_REPO_GAP.FORBIDDEN]: { text: '접근 권한이 없어요', skipped: true },
  [GITHUB_REPO_GAP.NOT_FOUND]: { text: '저장소를 찾을 수 없어요', skipped: true },
  [GITHUB_REPO_GAP.ACTIVITY_FAILED]: { text: '작업 기록을 볼 수 없어 기본 브랜치만 찾아봤어요', skipped: false },
  [GITHUB_REPO_GAP.ACTIVITY_FULL]: { text: '작업 기록이 많아 일부 브랜치를 못 봤을 수 있어요', skipped: false },
  [GITHUB_REPO_GAP.BRANCHES]: {
    text: `브랜치가 많아 최근 작업한 ${GITHUB_MAX_BRANCHES_PER_REPO}개만 찾아봤어요`,
    skipped: false,
  },
};

type GithubRepoGapsProps = {
  gaps: ReadonlyArray<GithubRepoGap>;
  // 빈 화면처럼 공간이 남으면 펼친 채로 시작한다
  defaultOpen?: boolean;
};

// GitHub 커밋 가져오기에서 다 찾아보지 못한 저장소 — 접힌 한 줄, 펼치면 저장소마다 이유를 보인다.
// 사용자 잘못이 아니라 일부를 덜 본 것이라 오류색이 아닌 보조 문구로 둔다.
export function GithubRepoGaps({ gaps, defaultOpen = false }: Readonly<GithubRepoGapsProps>) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const listId = useId();

  if (gaps.length === 0) return null;

  return (
    <div className="rounded-lg bg-white/70 text-xs text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={listId}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <FolderSearch size={14} className="shrink-0 text-zinc-400" aria-hidden />
        <span className="min-w-0 flex-1">
          다 찾아보지 못한 저장소 <b className="font-semibold text-zinc-700 dark:text-zinc-200">{gaps.length}개</b> — 이
          저장소 커밋은 빠졌을 수 있어요
        </span>
        <ChevronRight
          size={14}
          className={cn('shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-90')}
          aria-hidden
        />
      </button>
      {isOpen && (
        <ul id={listId} className="space-y-1.5 border-t border-zinc-200/70 px-3 py-2 dark:border-zinc-700/50">
          {gaps.map((gap) => {
            const label = GAP_LABEL[gap.reason];
            return (
              <li key={gap.repo} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    label.skipped ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-zinc-600'
                  )}
                  aria-hidden
                />
                <span className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
                  {gap.repo}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-500 dark:text-zinc-400" title={label.text}>
                  {label.text}
                </span>
                {gap.ssoUrl && (
                  <a
                    href={gap.ssoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    GitHub에서 승인 <ExternalLink size={11} aria-hidden />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
