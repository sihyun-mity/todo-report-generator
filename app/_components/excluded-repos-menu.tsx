'use client';

import { useRef, useState } from 'react';
import { EyeOff, FolderGit2, Undo2 } from 'lucide-react';
import { useDismissOnBack } from '@/components';
import { useDismissLayer, useResetOnHide } from '@/hooks';
import { cn } from '@/utils';

type ExcludedReposMenuProps = {
  repos: ReadonlyArray<string>;
  onInclude: (repo: string) => void;
};

// GitHub 커밋 가져오기에서 분류 대상에서 뺀 저장소 목록. 해제하면 그 저장소 커밋을 다시 불러와 분류한다.
// 다이얼로그 하단에 있어 팝오버는 위로 연다.
export function ExcludedReposMenu({ repos, onInclude }: Readonly<ExcludedReposMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissLayer(containerRef, () => setIsOpen(false), { enabled: isOpen });
  useResetOnHide(() => setIsOpen(false));
  useDismissOnBack(isOpen, () => setIsOpen(false));

  if (repos.length === 0) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200',
          isOpen && 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
        )}
      >
        <EyeOff size={12} aria-hidden />
        제외한 저장소 {repos.length}개
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="제외한 저장소"
          className="absolute bottom-full left-0 z-20 mb-1 w-80 max-w-[calc(100vw-3rem)] rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="px-3 pt-2 pb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            이 저장소의 커밋은 불러오지 않아요. 해제하면 다시 불러와 분류해요(미리보기에서 고친 내용은 초기화돼요).
          </p>
          <ul className="max-h-56 overflow-y-auto">
            {repos.map((repo) => (
              <li
                key={repo}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <FolderGit2 size={13} className="shrink-0 text-zinc-400" aria-hidden />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-200"
                  title={repo}
                >
                  {repo}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onInclude(repo);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <Undo2 size={11} aria-hidden />
                  제외 해제
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
